/**
 * The engine. One desynchronized 2D canvas, one render loop, zero DOM churn.
 *
 * Text model is a typewriter: the active line sits at a fixed typing
 * position (~58% of viewport height); on Enter it is "baked" into a static
 * offscreen layer and history slides up. Only the active line, caret, and
 * chrome are redrawn per frame, so per-frame cost is independent of how
 * much has been typed.
 *
 * Typing signals drive everything:
 * - hold duration ramps a glyph's variable-font weight while the key is
 *   physically down; on release the weight relaxes toward a permanent
 *   "record" weight, so the page remembers how each letter was pressed.
 * - rolling-window flow (see rhythm.ts) drives caret glow, the Print
 *   finish's ink misregistration, and the comic flow caption.
 * - every keystroke ticks the seismograph in the bottom margin.
 */
import { PALETTES, mixHex, type Palette } from "./palettes";
import { styleOf, STYLES, type StyleDef } from "./styles";
import { Spring, landCurve, clamp, lerp, easeOut } from "./springs";
import { Rhythm } from "./rhythm";
import {
  EchoRecorder,
  EchoPlayer,
  encodeEcho,
  decodeEcho,
  type Echo
} from "./echo";
import { downloadRhythmPrint } from "./rhythmprint";
import {
  loadOdometer,
  saveOdometer,
  loadPrefs,
  savePrefs,
  loadSheet,
  saveSheet,
  loadLatestEcho,
  saveLatestEcho,
  loadBestEcho,
  saveBestEcho,
  type Odometer,
  type Prefs,
  type SavedSheet
} from "./store";

const FONT_FAMILY = `"JetBrains Mono Variable", ui-monospace, SFMono-Regular, Menlo, monospace`;
const BASE_W = 430;
const MAX_W = 760;
const CAP_BONUS = 55;
const HOLD_RAMP_MS = 450;
const RELAX_MS = 10000;
const DRY_MS = 9000;
const LAND_MS = 110;
const SEISMO_SPAN = 12000;
const SAVE_EVERY = 6000;

interface Glyph {
  ch: string;
  born: number;
  upAt: number | null;
  code: string;
  cap: boolean;
  peak: number;
  /** Set when a deliberate hold is released: the letter stamps down. */
  stampAt: number | null;
  /** Absolute index of this glyph's event in the echo recorder, or -1. */
  echoIdx: number;
}

type EchoSource = "off" | "latest" | "best" | "shared";

/** Letterform-shaped shockwave fired by a stamp. */
interface Stamp {
  ch: string;
  x: number;
  w: number;
  at: number;
  power: number; // 0..1, from hold duration
}

const STAMP_HOLD_MS = 280;
const STREAK_GAP_MS = 2500;
const STREAK_MILESTONES = [50, 100, 250, 500, 1000, 2000, 5000];

interface BakedGlyph {
  ch: string;
  w: number;
}

interface Dying {
  ch: string;
  x: number;
  w: number;
  at: number;
}

/**
 * Particles are analytic: position is computed from age, so updating them
 * costs nothing and they carry no per-frame state. Hard capped; spawning
 * past the cap recycles the oldest.
 */
interface Particle {
  kind: "ember" | "ring" | "frost" | "leaf";
  x0: number;
  y0: number;
  vx: number;
  vy: number;
  born: number;
  life: number;
  seed: number;
}

const PARTICLE_CAP = 140;

/** Weight a glyph keeps forever, derived from the peak it reached while held. */
function recordWeight(peak: number): number {
  return 400 + (peak - BASE_W) * 0.5;
}

/** Invert recordWeight, for restoring saved glyphs. */
function peakFromRecord(w: number): number {
  return (w - 400) * 2 + BASE_W;
}

function hashJitter(i: number, salt: number): number {
  let h = (i + 1) * 2654435761 + salt * 40503;
  h = (h ^ (h >>> 13)) >>> 0;
  return (h % 1000) / 1000 - 0.5; // -0.5 .. 0.5
}

function keyLabel(code: string): string {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code === "Space") return "Space";
  if (code.startsWith("Shift")) return "Shift";
  if (code.startsWith("Control")) return "Ctrl";
  if (code.startsWith("Alt")) return "Alt";
  if (code.startsWith("Meta")) return "Meta";
  return code;
}

export class Engine {
  private ctx: CanvasRenderingContext2D;
  private staticCanvas: HTMLCanvasElement;
  private staticCtx: CanvasRenderingContext2D;

  // Layout (CSS pixels)
  private w = 0;
  private h = 0;
  private dpr = 1;
  private fs = 28;
  private advance = 16;
  private lineHeight = 44;
  private marginX = 64;
  private typingY = 400;
  private maxCols = 60;

  // Text model
  private baked: BakedGlyph[][] = [];
  private active: Glyph[] = [];
  private caretIdx = 0;
  private dying: Dying[] = [];
  private staticDirty = true;

  // Motion state
  private caretX: Spring;
  private squash: Spring;
  /** The page itself has mass: keystrokes kick it, this spring settles it. */
  private impact: Spring;
  private captionPunch: Spring;
  private slideFrom = -1e9;
  private wipe: { canvas: HTMLCanvasElement; at: number } | null = null;
  private stamps: Stamp[] = [];

  // Streaks: consecutive content keys without backspace or a long pause.
  private streak = 0;
  private lastContentAt = -1e9;
  private captionOverride: { text: string; until: number } | null = null;
  private seismoFlashAt = -1e9;
  private bestAtBoot = 0;
  private celebratedBest = false;

  // Signals
  private rhythm = new Rhythm();
  private emaWpm = 0;
  private heat = 0;
  /** Slow-building current driven by cadence consistency; 0..1. */
  private momentum = 0;
  private lastMomentum = 0;
  private deepFlowAt = -1e9;
  private lastInput = 0;
  private shiftHeld = false;
  private bsHeld = false;
  private bsSince = 0;
  private bsAcc = 0;

  // Echo: session memory and ghost playback.
  private recorder = new EchoRecorder();
  private latestEcho: Echo | null = null;
  private bestEcho: Echo | null = null;
  private sharedEcho: Echo | null = null;
  private echoSource: EchoSource = "off";
  private echoPlayer: EchoPlayer | null = null;
  private echoStartedAt = 0;
  private lastEchoSave = 0;

  // Prefs, stats, persistence
  private prefs: Prefs;
  private odo: Odometer;
  private sessionKeys = 0;
  private dirtySheet = false;
  private dirtyOdo = false;
  private lastSave = 0;
  private undoSlot: SavedSheet | null = null;

  // Overlays and chrome
  private helpOpen = false;
  private statsOpen = false;
  private toastMsg = "";
  private toastAt = -1e9;
  private dotPattern: CanvasPattern | null = null;
  private particles: Particle[] = [];

  private bootAt: number;
  private prev: number;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d", { desynchronized: true, alpha: false });
    if (!ctx) throw new Error("2D canvas is not available");
    this.ctx = ctx;

    this.staticCanvas = document.createElement("canvas");
    const sctx = this.staticCanvas.getContext("2d");
    if (!sctx) throw new Error("2D canvas is not available");
    this.staticCtx = sctx;

    this.prefs = loadPrefs();
    if (
      this.prefs.motion === 2 &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      this.prefs.motion = 1;
    }
    this.odo = loadOdometer();

    this.caretX = new Spring(0, 620, 34);
    this.squash = new Spring(0, 320, 17);
    this.impact = new Spring(0, 380, 26);
    this.captionPunch = new Spring(0, 300, 16);
    this.bestAtBoot = this.odo.bestWpm;

    this.resize();
    window.addEventListener("resize", () => this.resize());
    window.addEventListener("keydown", (e) => this.onKeyDown(e));
    window.addEventListener("keyup", (e) => this.onKeyUp(e));
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        this.bankLatestEcho();
        this.persist(true);
      }
    });

    const saved = loadSheet();
    if (saved) this.restore(saved);
    this.caretX.set(this.colX(this.caretIdx));

    this.latestEcho = loadLatestEcho();
    this.bestEcho = loadBestEcho();
    this.loadSharedEchoFromUrl();

    document.body.style.background = this.palette().paper;
    this.bootAt = performance.now();
    this.prev = this.bootAt;
    requestAnimationFrame((t) => this.frame(t));
  }

  /** If the page was opened with #e=... in the URL, load it as the ghost. */
  private loadSharedEchoFromUrl(): void {
    const hash = window.location.hash;
    const m = /[#&]e=([A-Za-z0-9\-_]+)/.exec(hash);
    if (!m) return;
    const echo = decodeEcho(m[1]!);
    if (!echo) return;
    this.sharedEcho = echo;
    this.setEchoSource("shared");
    this.toast("Loaded a shared echo. F10 cycles it");
  }

  private palette(): Palette {
    return PALETTES[this.prefs.palette % PALETTES.length]!;
  }

  private style(): StyleDef {
    return styleOf(this.prefs.style);
  }

  /**
   * Effective accent colors: elemental styles bring their own fresh-ink
   * colors. On light paper they are pulled toward the palette ink so pale
   * accents (Frost) stay legible.
   */
  private fx(p: Palette, sd: StyleDef): { fresh: string; misA: string; misB: string } {
    if (!sd.accent) return { fresh: p.fresh, misA: p.misA, misB: p.misB };
    const adapt = (c: string) => (p.dark ? c : mixHex(c, p.ink, 0.32));
    return {
      fresh: adapt(sd.accent.fresh),
      misA: adapt(sd.accent.misA),
      misB: adapt(sd.accent.misB)
    };
  }

  private motionMul(): number {
    return this.prefs.motion === 2 ? 1 : this.prefs.motion === 1 ? 0.45 : 0;
  }

  // ----------------------------------------------------------- layout

  private resize(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    for (const c of [this.canvas, this.staticCanvas]) {
      c.width = Math.round(this.w * this.dpr);
      c.height = Math.round(this.h * this.dpr);
    }
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;

    this.fs = clamp(Math.round(this.w / 42), 18, 34);
    this.lineHeight = Math.round(this.fs * 1.62);
    this.marginX = Math.max(48, Math.round(this.w * 0.07));
    this.typingY = Math.round(this.h * 0.58);

    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.ctx.font = this.font(460);
    this.advance = this.ctx.measureText("M").width;
    this.maxCols = Math.max(10, Math.floor((this.w - 2 * this.marginX) / this.advance));

    this.dotPattern = null;
    this.staticDirty = true;
    this.caretX.set(this.colX(this.caretIdx));
  }

  private font(weight: number, px = this.fs): string {
    return `${Math.round(weight / 10) * 10} ${px}px ${FONT_FAMILY}`;
  }

  private colX(idx: number): number {
    return this.marginX + idx * this.advance;
  }

  // ------------------------------------------------------------ input

  private onKeyDown(e: KeyboardEvent): void {
    if (e.isComposing) return;
    const now = performance.now();
    const key = e.key;

    if (!e.repeat) {
      this.odo.total += 1;
      this.odo.perKey[e.code] = (this.odo.perKey[e.code] ?? 0) + 1;
      this.sessionKeys += 1;
      this.dirtyOdo = true;
    }
    if (key === "Shift") this.shiftHeld = true;

    // Function row: the only menu this site has.
    if (/^F([1-9]|10)$/.test(key)) {
      e.preventDefault();
      if (e.repeat) return;
      this.handleFn(Number(key.slice(1)));
      return;
    }

    // Browser-level shortcuts we deliberately leave alone (Ctrl+W, Ctrl+T,
    // Ctrl+R, devtools...). We only claim Z and C. Ctrl+Alt together is
    // AltGr on Windows layouts, so it falls through to character input.
    if ((e.ctrlKey || e.metaKey) && !(e.ctrlKey && e.altKey)) {
      const k = key.toLowerCase();
      if (k === "z") {
        e.preventDefault();
        this.undoClear();
      } else if (k === "c") {
        this.copyAll();
      } else if (k === "s") {
        e.preventDefault();
        this.exportPrint();
      } else if (k === "e") {
        e.preventDefault();
        this.copyEchoLink();
      }
      return;
    }

    // An open overlay swallows the next key.
    if (this.helpOpen || this.statsOpen) {
      if (key === "Escape" || key.length === 1 || key === "Enter") {
        e.preventDefault();
        this.helpOpen = false;
        this.statsOpen = false;
      }
      return;
    }

    switch (key) {
      case "Escape":
        e.preventDefault();
        this.clearSheet();
        return;
      case "Backspace":
        e.preventDefault();
        if (e.repeat) return; // we run our own accelerating repeat
        this.backspaceOnce(now);
        this.bsHeld = true;
        this.bsSince = now;
        this.bsAcc = 0;
        return;
      case "Enter":
        e.preventDefault();
        if (e.repeat) return;
        this.commitLine(now);
        this.rhythm.record(now);
        this.lastInput = now;
        return;
      case "Tab":
        e.preventDefault();
        this.insertChar(" ", "Space", now);
        this.insertChar(" ", "Space", now);
        return;
      case "ArrowLeft":
        e.preventDefault();
        this.caretIdx = Math.max(0, this.caretIdx - 1);
        this.lastInput = now;
        return;
      case "ArrowRight":
        e.preventDefault();
        this.caretIdx = Math.min(this.active.length, this.caretIdx + 1);
        this.lastInput = now;
        return;
      case "Home":
        e.preventDefault();
        this.caretIdx = 0;
        this.lastInput = now;
        return;
      case "End":
        e.preventDefault();
        this.caretIdx = this.active.length;
        this.lastInput = now;
        return;
      case "ArrowUp":
      case "ArrowDown":
        e.preventDefault();
        this.squash.kick(1.4 * this.motionMul());
        return;
    }

    if (key.length === 1 && (!e.altKey || e.ctrlKey)) {
      e.preventDefault(); // stops space-scroll and Firefox quick-find
      this.insertChar(key, e.code, now);
    }
  }

  private onKeyUp(e: KeyboardEvent): void {
    const now = performance.now();
    if (e.key === "Shift") this.shiftHeld = false;
    if (e.key === "Backspace") this.bsHeld = false;
    for (let i = 0; i < this.active.length; i++) {
      const g = this.active[i]!;
      if (g.code === e.code && g.upAt === null) {
        g.upAt = now;
        if (g.echoIdx >= 0) {
          this.recorder.setWeight(g.echoIdx, Math.round(recordWeight(g.peak)));
        }
        // The stamp: a deliberate hold released is the payoff of the
        // pressure system. The letter pulses, fires a letterform-shaped
        // shockwave, and thumps the page in proportion to the hold.
        const hold = now - g.born;
        if (hold >= STAMP_HOLD_MS && g.ch !== " " && this.motionMul() > 0) {
          const power = Math.min(1, (hold - STAMP_HOLD_MS) / 900);
          g.stampAt = now;
          this.stamps.push({
            ch: g.ch,
            x: this.colX(i),
            w: this.glyphWeight(g, now),
            at: now,
            power
          });
          if (this.stamps.length > 24) this.stamps.shift();
          this.impact.kick((40 + power * 130) * this.motionMul());
        }
      }
    }
  }

  private handleFn(n: number): void {
    switch (n) {
      case 1:
        this.helpOpen = !this.helpOpen;
        this.statsOpen = false;
        break;
      case 2:
        this.cyclePalette(-1);
        break;
      case 3:
        this.cyclePalette(1);
        break;
      case 4: {
        const idx = STYLES.findIndex((s) => s.id === this.prefs.style);
        this.prefs.style = STYLES[(idx + 1) % STYLES.length]!.id;
        this.toast(`Style: ${this.style().label}`);
        this.dotPattern = null;
        this.staticDirty = true;
        savePrefs(this.prefs);
        break;
      }
      case 5:
        this.prefs.seismo = !this.prefs.seismo;
        this.toast(`Seismograph ${this.prefs.seismo ? "on" : "off"}`);
        savePrefs(this.prefs);
        break;
      case 6:
        this.prefs.caption = !this.prefs.caption;
        this.toast(`Flow caption ${this.prefs.caption ? "on" : "off"}`);
        savePrefs(this.prefs);
        break;
      case 7: {
        this.prefs.motion = (this.prefs.motion === 0 ? 2 : this.prefs.motion - 1) as 0 | 1 | 2;
        const names = ["Motion off", "Motion subtle", "Motion full"];
        this.toast(names[this.prefs.motion]!);
        savePrefs(this.prefs);
        break;
      }
      case 8:
        this.statsOpen = !this.statsOpen;
        this.helpOpen = false;
        break;
      case 9:
        this.prefs.chrome = !this.prefs.chrome;
        this.toast(`Controls strip ${this.prefs.chrome ? "shown" : "hidden"}`);
        savePrefs(this.prefs);
        break;
      case 10:
        this.cycleEcho();
        break;
      default:
        break;
    }
  }

  private cyclePalette(dir: number): void {
    const n = PALETTES.length;
    this.prefs.palette = (this.prefs.palette + dir + n) % n;
    document.body.style.background = this.palette().paper;
    this.dotPattern = null;
    this.staticDirty = true;
    this.toast(`Palette: ${this.palette().label}`);
    savePrefs(this.prefs);
  }

  // ------------------------------------------------------------- edits

  private insertChar(ch: string, code: string, now: number): void {
    if (ch === " ") this.checkSecretWord(now);
    if (this.active.length >= this.maxCols) this.commitLine(now);
    const g: Glyph = {
      ch,
      born: now,
      upAt: null,
      code,
      cap: ch >= "A" && ch <= "Z",
      peak: BASE_W,
      stampAt: null,
      echoIdx: this.recorder.note(ch, now)
    };
    this.active.splice(this.caretIdx, 0, g);
    this.caretIdx += 1;
    this.rhythm.record(now);
    this.lastInput = now;
    this.squash.kick(3.2 * this.motionMul());
    this.impact.kick(12 * this.motionMul());
    this.bumpStreak(now);
    this.spawnFor(this.colX(this.caretIdx - 1), this.typingY - this.fs * 0.35, now, 1);
    this.dirtySheet = true;
  }

  /** Streak bookkeeping plus milestone celebrations. */
  private bumpStreak(now: number): void {
    if (now - this.lastContentAt > STREAK_GAP_MS) this.streak = 0;
    this.lastContentAt = now;
    this.streak += 1;
    if (this.streak > this.odo.bestStreak) {
      this.odo.bestStreak = this.streak;
      this.dirtyOdo = true;
    }
    if (STREAK_MILESTONES.includes(this.streak)) {
      this.celebrate(`STREAK ${this.streak}`, now);
    }
  }

  /** A caption slam, a page thump, and a seismograph flash. Silent fireworks. */
  private celebrate(text: string, now: number): void {
    this.captionOverride = { text, until: now + 2300 };
    this.captionPunch.kick(6);
    this.impact.kick(80 * this.motionMul());
    this.seismoFlashAt = now;
  }

  private backspaceOnce(now: number): void {
    this.streak = 0;
    if (this.caretIdx > 0) {
      const idx = this.caretIdx - 1;
      const g = this.active[idx]!;
      this.dying.push({ ch: g.ch, x: this.colX(idx), w: this.glyphWeight(g, now), at: now });
      this.active.splice(idx, 1);
      this.caretIdx -= 1;
      this.squash.kick(-2.6 * this.motionMul());
      this.impact.kick(-14 * this.motionMul());
      this.lastInput = now;
      this.dirtySheet = true;
    } else if (this.baked.length > 0) {
      this.unEnter(now);
    } else {
      this.squash.kick(-1.2 * this.motionMul());
    }
  }

  private commitLine(now: number): void {
    this.checkSecretWord(now);
    this.recorder.note("\n", now);
    const line: BakedGlyph[] = this.active.map((g) => ({
      ch: g.ch,
      w: Math.round(recordWeight(g.peak))
    }));
    this.baked.push(line);
    const keep = Math.ceil(this.typingY / this.lineHeight) + 4;
    if (this.baked.length > keep) this.baked.splice(0, this.baked.length - keep);
    this.active = [];
    this.caretIdx = 0;
    this.slideFrom = now;
    this.staticDirty = true;
    this.squash.kick(4.2 * this.motionMul());
    this.impact.kick(85 * this.motionMul());
    this.bumpStreak(now);
    this.spawnFor(this.caretX.x, this.typingY - this.fs * 0.35, now, 2);
    this.dirtySheet = true;
  }

  /**
   * The page listens for words. Typing a style's name (or its element:
   * fire, water, ice, wind) switches to it mid-sentence; palettes answer
   * to their names; "zen" hides all chrome. Checked at word boundaries
   * (space or Enter), reading the letters just behind the caret.
   */
  private checkSecretWord(now: number): void {
    let word = "";
    for (let i = this.caretIdx - 1; i >= 0 && word.length < 12; i--) {
      const c = this.active[i]!.ch;
      if (!/[a-zA-Z]/.test(c)) break;
      word = c.toLowerCase() + word;
    }
    if (word.length < 3) return;

    const styleAlias: Record<string, string> = {
      fire: "ember",
      ember: "ember",
      water: "tide",
      tide: "tide",
      ice: "frost",
      frost: "frost",
      wind: "gale",
      gale: "gale",
      ink: "print",
      print: "print",
      plain: "clean",
      clean: "clean"
    };

    const styleId = styleAlias[word];
    if (styleId && styleId !== this.prefs.style) {
      this.prefs.style = styleId as Prefs["style"];
      this.dotPattern = null;
      this.staticDirty = true;
      this.toast(`You typed it. Style: ${this.style().label}`);
      this.impact.kick(60 * this.motionMul());
      savePrefs(this.prefs);
      return;
    }

    const palIdx = PALETTES.findIndex((p) => p.id === word);
    if (palIdx >= 0 && palIdx !== this.prefs.palette) {
      this.prefs.palette = palIdx;
      document.body.style.background = this.palette().paper;
      this.dotPattern = null;
      this.staticDirty = true;
      this.toast(`You typed it. Palette: ${this.palette().label}`);
      savePrefs(this.prefs);
      return;
    }

    if (word === "zen") {
      const anyOn = this.prefs.chrome || this.prefs.seismo || this.prefs.caption;
      this.prefs.chrome = !anyOn;
      this.prefs.seismo = !anyOn;
      this.prefs.caption = !anyOn;
      this.toast(anyOn ? "zen" : "welcome back");
      savePrefs(this.prefs);
      return;
    }

    if (word === "echo") {
      if (this.echoSource !== "off") {
        this.setEchoSource("off");
        this.toast("Echo off");
      } else {
        const first = this.availableSources().find((s) => s !== "off");
        if (first) {
          this.setEchoSource(first);
          this.toast(`Echo: ${this.echoLabel(first)}`);
        } else {
          this.toast("No echoes yet. Type a session, then come back");
        }
      }
    }
    void now;
  }

  private unEnter(now: number): void {
    const line = this.baked.pop()!;
    this.active = line.map((bg) => ({
      ch: bg.ch,
      born: now - 60000,
      upAt: now - 60000,
      code: "",
      cap: false,
      peak: peakFromRecord(bg.w),
      stampAt: null,
      echoIdx: -1
    }));
    this.caretIdx = this.active.length;
    this.caretX.set(this.colX(this.caretIdx));
    this.staticDirty = true;
    this.lastInput = now;
    this.dirtySheet = true;
  }

  private clearSheet(): void {
    if (this.baked.length === 0 && this.active.length === 0) return;
    this.undoSlot = this.serialize();

    const snap = document.createElement("canvas");
    snap.width = this.canvas.width;
    snap.height = this.canvas.height;
    const sc = snap.getContext("2d");
    if (sc) sc.drawImage(this.canvas, 0, 0);
    this.wipe = { canvas: snap, at: performance.now() };

    this.baked = [];
    this.active = [];
    this.caretIdx = 0;
    this.staticDirty = true;
    this.dirtySheet = true;
    this.toast("Cleared. Ctrl+Z restores");
  }

  private undoClear(): void {
    if (!this.undoSlot) return;
    this.restore(this.undoSlot);
    this.undoSlot = null;
    this.staticDirty = true;
    this.dirtySheet = true;
    this.toast("Restored");
  }

  private copyAll(): void {
    const text =
      this.baked.map((l) => l.map((g) => g.ch).join("")).join("\n") +
      (this.baked.length ? "\n" : "") +
      this.active.map((g) => g.ch).join("");
    if (!text.trim()) return;
    navigator.clipboard
      .writeText(text)
      .then(() => this.toast("Copied to clipboard"))
      .catch(() => this.toast("Copy failed"));
  }

  private serialize(): SavedSheet {
    const now = performance.now();
    return {
      lines: this.baked.map((l) => l.map((g) => ({ ch: g.ch, w: g.w }))),
      active: this.active.map((g) => ({
        ch: g.ch,
        w: Math.round(recordWeight(g.upAt === null ? this.glyphWeight(g, now) : g.peak))
      }))
    };
  }

  private restore(s: SavedSheet): void {
    const now = performance.now();
    this.baked = s.lines.map((l) => l.map((g) => ({ ch: g.ch, w: g.w })));
    this.active = s.active.map((g) => ({
      ch: g.ch,
      born: now - 60000,
      upAt: now - 60000,
      code: "",
      cap: false,
      peak: peakFromRecord(g.w),
      stampAt: null,
      echoIdx: -1
    }));
    this.caretIdx = this.active.length;
  }

  private persist(force: boolean): void {
    const now = performance.now();
    if (!force && now - this.lastSave < SAVE_EVERY) return;
    this.lastSave = now;
    if (this.dirtySheet) {
      saveSheet(this.serialize());
      this.dirtySheet = false;
    }
    if (this.dirtyOdo) {
      saveOdometer(this.odo);
      this.dirtyOdo = false;
    }
  }

  private toast(msg: string): void {
    this.toastMsg = msg;
    this.toastAt = performance.now();
  }

  // ------------------------------------------------------------- echo

  private echoFor(src: EchoSource): Echo | null {
    if (src === "latest") return this.latestEcho;
    if (src === "best") return this.bestEcho;
    if (src === "shared") return this.sharedEcho;
    return null;
  }

  private echoLabel(src: EchoSource): string {
    if (src === "latest") return "your last session";
    if (src === "best") return "your best flow";
    if (src === "shared") return "a shared rhythm";
    return "off";
  }

  private availableSources(): EchoSource[] {
    const out: EchoSource[] = ["off"];
    if (this.latestEcho) out.push("latest");
    if (this.bestEcho) out.push("best");
    if (this.sharedEcho) out.push("shared");
    return out;
  }

  private setEchoSource(src: EchoSource): void {
    this.echoSource = src;
    const echo = this.echoFor(src);
    if (src === "off" || !echo) {
      this.echoSource = "off";
      this.echoPlayer = null;
      return;
    }
    this.echoPlayer = new EchoPlayer(echo);
    this.echoStartedAt = performance.now();
  }

  private cycleEcho(): void {
    const avail = this.availableSources();
    if (avail.length === 1) {
      this.toast("No echoes yet. Type a session, then come back");
      return;
    }
    const i = avail.indexOf(this.echoSource);
    const next = avail[(i + 1) % avail.length]!;
    this.setEchoSource(next);
    this.toast(next === "off" ? "Echo off" : `Echo: ${this.echoLabel(next)}`);
  }

  /** Persist the current session for next time as the "latest" echo. */
  private bankLatestEcho(): void {
    if (this.recorder.length < 16) return;
    saveLatestEcho(this.recorder.toEcho());
  }

  private exportPrint(): void {
    const echo =
      this.recorder.length >= 8
        ? this.recorder.toEcho()
        : this.bestEcho ?? this.latestEcho;
    if (!echo || echo.events.length < 8) {
      this.toast("Type a little first, then Ctrl+S");
      return;
    }
    const p = this.palette();
    const ok = downloadRhythmPrint(
      echo,
      { paper: p.paper, ink: p.ink, fresh: p.fresh, sub: p.sub, misA: p.misA, misB: p.misB },
      {
        total: this.odo.total,
        bestWpm: this.odo.bestWpm,
        styleLabel: this.style().label,
        paletteLabel: p.label
      }
    );
    this.toast(ok ? "Rhythm print saved" : "Nothing to print yet");
  }

  private copyEchoLink(): void {
    const echo =
      this.recorder.length >= 16
        ? this.recorder.toEcho()
        : this.bestEcho ?? this.latestEcho;
    if (!echo || echo.events.length < 16) {
      this.toast("Type a session first, then Ctrl+E");
      return;
    }
    const code = encodeEcho(echo);
    const url = `${window.location.origin}${window.location.pathname}#e=${code}`;
    navigator.clipboard
      .writeText(url)
      .then(() => this.toast("Echo link copied. It carries what you typed"))
      .catch(() => this.toast("Copy failed"));
  }

  // ------------------------------------------------------------ frame

  private frame(t: number): void {
    const dt = clamp((t - this.prev) / 1000, 0, 0.04);
    this.prev = t;

    // Signals
    const flow = this.rhythm.flow(t);
    this.emaWpm += (flow.wpm - this.emaWpm) * Math.min(1, dt * 3);
    this.heat += (flow.heat - this.heat) * Math.min(1, dt * 4);

    // Momentum: builds slowly while cadence stays even, recedes faster when
    // it breaks. Rising tau ~7.5s, falling tau ~3.5s.
    const target = flow.even;
    const tau = target > this.momentum ? 7.5 : 3.5;
    this.momentum += (target - this.momentum) * (1 - Math.exp(-dt / tau));
    if (this.momentum > 0.66 && this.lastMomentum <= 0.66 && t - this.deepFlowAt > 9000) {
      this.deepFlowAt = t;
      this.toast("deep flow");
    }
    this.lastMomentum = this.momentum;

    if (flow.active && Math.round(this.emaWpm) > this.odo.bestWpm) {
      this.odo.bestWpm = Math.round(this.emaWpm);
      this.dirtyOdo = true;
      // Snapshot the run that set the record as the "best" echo.
      if (this.recorder.length >= 16) {
        this.bestEcho = this.recorder.toEcho(400, "best flow");
        saveBestEcho(this.bestEcho);
      }
      if (!this.celebratedBest && this.bestAtBoot >= 40) {
        this.celebratedBest = true;
        this.celebrate(`NEW BEST ${this.odo.bestWpm} WPM`, t);
      }
    }

    // Bank the live session as next boot's "latest" echo, throttled.
    if (t - this.lastEchoSave > 5000 && this.recorder.length >= 16) {
      this.lastEchoSave = t;
      this.bankLatestEcho();
    }

    // Our own accelerating backspace repeat.
    if (this.bsHeld) {
      const heldFor = t - this.bsSince;
      if (heldFor > 380) {
        const rate = Math.min(45, 8 + ((heldFor - 380) / 1000) * 30);
        this.bsAcc += rate * dt;
        while (this.bsAcc >= 1) {
          this.bsAcc -= 1;
          this.backspaceOnce(t);
        }
      }
    }

    this.caretX.target = this.colX(this.caretIdx);
    this.caretX.update(dt);
    this.squash.target = 0;
    this.squash.update(dt);
    this.impact.target = 0;
    this.impact.update(dt);
    this.captionPunch.target = 0;
    this.captionPunch.update(dt);

    this.persist(false);
    this.draw(t);
    requestAnimationFrame((nt) => this.frame(nt));
  }

  // ------------------------------------------------------------- draw

  private glyphWeight(g: Glyph, now: number): number {
    if (g.upAt === null) {
      // Linear ramp: an 80 ms tap at normal typing speed stays light
      // (~489 peak, ~429 record); only a deliberate hold reaches heavy
      // weight (760 peak, 565 record). easeOut here made every tap bold.
      const ramp = Math.min(1, (now - g.born) / HOLD_RAMP_MS);
      const w = Math.min(MAX_W, BASE_W + (MAX_W - BASE_W) * ramp + (g.cap ? CAP_BONUS : 0));
      g.peak = Math.max(g.peak, w);
      return w;
    }
    const rel = Math.min(1, (now - g.upAt) / RELAX_MS);
    return lerp(g.peak, recordWeight(g.peak), rel);
  }

  private draw(now: number): void {
    const p = this.palette();
    const sd = this.style();
    const fx = this.fx(p, sd);
    const ctx = this.ctx;
    const mm = this.motionMul();

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = p.paper;
    ctx.fillRect(0, 0, this.w, this.h);

    // Deep-flow environment: an ambient backdrop earned by sustained even
    // typing. Drawn in screen space so it does not bob with keystrokes.
    this.drawEnvironment(p, fx, now, mm);

    // The page has mass: the whole world rides the impact spring.
    // 0.42 maps spring units to px: a character lands ~0.25 px, Enter
    // ~1.8 px, a full-power stamp ~3.5 px, clamped at 4.
    const pageY = clamp(this.impact.x * 0.42, -4, 4) * mm;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, pageY * this.dpr);

    if (sd.halftone) this.drawHalftoneBands(p);

    // Settled history (static layer), with the Enter slide.
    if (this.staticDirty) this.rebuildStatic(p, now);
    const slideT = clamp((now - this.slideFrom) / 170, 0, 1);
    const slide = (1 - easeOut(slideT)) * this.lineHeight * mm;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.staticCanvas, 0, (slide + pageY) * this.dpr);
    ctx.restore();

    this.drawEcho(p, fx, now);
    this.drawParticles(fx, now);
    this.drawActiveLine(p, sd, fx, now, mm);
    this.drawStamps(fx, now, mm);
    this.drawDying(p, now);
    this.drawCaret(p, sd, fx, now, mm);
    if (this.prefs.seismo) this.drawSeismo(p, fx, now);
    this.drawCaption(p, sd, fx, now);
    if (this.prefs.chrome) this.drawChrome(p, sd, now);
    this.drawWelcome(p, now);
    this.drawToast(p, now);

    if (this.wipe) this.drawWipe(now, mm);
    if (this.helpOpen) this.drawHelp(p, sd);
    if (this.statsOpen) this.drawStats(p);
  }

  private rebuildStatic(p: Palette, now: number): void {
    const s = this.staticCtx;
    s.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    s.clearRect(0, 0, this.w, this.h);
    s.textBaseline = "alphabetic";
    const n = this.baked.length;
    for (let i = 0; i < n; i++) {
      const rowFromActive = n - i;
      const y = this.typingY - this.lineHeight * rowFromActive;
      if (y < -this.lineHeight) continue;
      const fade = clamp(1 - (rowFromActive - 3) * 0.045, 0.3, 1);
      s.globalAlpha = fade;
      this.drawBakedLine(s, this.baked[i]!, y, p.ink);
    }
    s.globalAlpha = 1;
    this.staticDirty = false;
    void now;
  }

  /** Draw a baked line, batching runs of equal weight into single fillText calls. */
  private drawBakedLine(
    c: CanvasRenderingContext2D,
    line: BakedGlyph[],
    y: number,
    ink: string
  ): void {
    c.fillStyle = ink;
    let i = 0;
    while (i < line.length) {
      const w = Math.round(line[i]!.w / 10) * 10;
      let j = i + 1;
      while (j < line.length && Math.round(line[j]!.w / 10) * 10 === w) j++;
      c.font = this.font(w);
      let run = "";
      for (let k = i; k < j; k++) run += line[k]!.ch;
      c.fillText(run, this.colX(i), y);
      i = j;
    }
  }

  private drawActiveLine(
    p: Palette,
    sd: StyleDef,
    fx: { fresh: string; misA: string; misB: string },
    now: number,
    mm: number
  ): void {
    const ctx = this.ctx;
    ctx.textBaseline = "alphabetic";
    for (let i = 0; i < this.active.length; i++) {
      const g = this.active[i]!;
      const age = now - g.born;
      const land = mm > 0 ? landCurve(age / LAND_MS) : 1;
      const settling = land < 0.999 || age < 600;
      const alpha = Math.min(1, age / 45);
      const weight = this.glyphWeight(g, now);
      const dryT = g.upAt === null ? 0 : Math.min(1, (now - g.upAt) / DRY_MS);
      const x = this.colX(i);
      let y = this.typingY;
      let xOff = 0;

      // How this style's glyphs arrive.
      if (settling && mm > 0) {
        switch (sd.land) {
          case "drop":
            y += -(1 - land) * this.fs * 0.38 * mm;
            break;
          case "rise":
            y += (1 - land) * this.fs * 0.3 * mm;
            break;
          case "blow":
            xOff = (1 - land) * this.advance * 1.6 * mm;
            break;
          case "crystal":
            // handled below with a scale transform
            break;
          case "ripple": {
            const decay = Math.exp(-age / 200);
            xOff = Math.sin(age / 50) * 3 * decay * mm;
            break;
          }
        }
      }

      ctx.font = this.font(weight);

      // Print finish: fresh ink prints out of register, proportional to flow
      // heat, and snaps into register as the glyph settles.
      if (sd.misreg && mm > 0) {
        const mis = this.heat * 2.8 * mm * (1 - Math.min(1, age / 600));
        if (mis > 0.35) {
          ctx.globalAlpha = alpha * 0.55;
          ctx.fillStyle = fx.misA;
          ctx.fillText(g.ch, x - mis, y + mis * 0.4);
          ctx.fillStyle = fx.misB;
          ctx.fillText(g.ch, x + mis, y - mis * 0.3);
        }
      }

      ctx.globalAlpha = alpha;
      ctx.fillStyle = dryT >= 1 ? p.ink : mixHex(fx.fresh, p.ink, dryT);

      // A freshly stamped letter pulses down into the page.
      let stampScale = 1;
      if (g.stampAt !== null && mm > 0) {
        const st = (now - g.stampAt) / 160;
        if (st < 1) stampScale = 1 + 0.18 * (1 - easeOut(st)) * mm;
      }

      // Elemental styles let very fresh glyphs glow with flow heat.
      const glowing =
        sd.glow > 1 && mm > 0 && dryT < 0.5 && this.heat > 0.08 && age < 1500;
      if (glowing) {
        ctx.save();
        ctx.shadowColor = fx.fresh;
        ctx.shadowBlur = (1 - dryT) * 9 * this.heat * sd.glow * mm;
      }

      if (stampScale > 1.001) {
        ctx.save();
        ctx.translate(x + xOff + this.advance / 2, y - this.fs * 0.33);
        ctx.scale(stampScale, stampScale);
        ctx.fillText(g.ch, -this.advance / 2, this.fs * 0.33);
        ctx.restore();
      } else if (sd.land === "crystal" && settling && mm > 0) {
        const sc = 1 + (1 - land) * 0.22 * mm;
        ctx.save();
        ctx.translate(x + xOff + this.advance / 2, y - this.fs * 0.33);
        ctx.scale(sc, sc);
        ctx.fillText(g.ch, -this.advance / 2, this.fs * 0.33);
        ctx.restore();
      } else if (sd.land === "blow" && settling && mm > 0) {
        const shear = (1 - land) * 0.32 * mm;
        ctx.save();
        ctx.translate(x + xOff, y);
        ctx.transform(1, 0, -shear, 1, 0, 0);
        ctx.fillText(g.ch, 0, 0);
        ctx.restore();
      } else {
        ctx.fillText(g.ch, x + xOff, y);
      }

      if (glowing) ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  private drawDying(p: Palette, now: number): void {
    const ctx = this.ctx;
    this.dying = this.dying.filter((d) => now - d.at < 95);
    for (const d of this.dying) {
      const t = (now - d.at) / 95;
      ctx.globalAlpha = (1 - t) * 0.8;
      ctx.font = this.font(d.w);
      ctx.fillStyle = p.fresh;
      ctx.fillText(d.ch, d.x + t * this.advance * 0.35, this.typingY + t * 3);
    }
    ctx.globalAlpha = 1;
  }

  /**
   * Stamp shockwaves: the released letter's own outline expands and fades.
   * The shockwave is the letterform, not a generic ring; the word stays
   * the hero even at maximum impact.
   */
  private drawStamps(
    fx: { fresh: string; misA: string; misB: string },
    now: number,
    mm: number
  ): void {
    if (this.stamps.length === 0 || mm === 0) return;
    const ctx = this.ctx;
    this.stamps = this.stamps.filter((s) => now - s.at < 340);
    for (const s of this.stamps) {
      const t = (now - s.at) / 340;
      const sc = 1 + (0.7 + s.power * 0.9) * easeOut(t) * mm;
      ctx.globalAlpha = (1 - t) * (0.3 + s.power * 0.25);
      ctx.font = this.font(s.w);
      ctx.strokeStyle = fx.fresh;
      ctx.lineWidth = 1.1;
      ctx.save();
      ctx.translate(s.x + this.advance / 2, this.typingY - this.fs * 0.33);
      ctx.scale(sc, sc);
      ctx.strokeText(s.ch, -this.advance / 2, this.fs * 0.33);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  /**
   * Spawn particles for the active style at a keystroke. Count scales with
   * flow heat and the motion preference, so slow deliberate typing sheds
   * almost nothing and full flow visibly burns/splashes/drifts.
   */
  private spawnFor(x: number, y: number, now: number, base: number): void {
    const sd = this.style();
    if (!sd.particles) return;
    const mm = this.motionMul();
    if (mm === 0) return;

    let count: number;
    switch (sd.particles) {
      case "ember":
        count = Math.round((base + this.heat * 2.5) * mm);
        break;
      case "ring":
        count = 1;
        break;
      case "frost":
        count = Math.round((base + this.heat * 1.5) * mm);
        break;
      case "leaf":
        count = this.heat > 0.15 ? Math.round(base * mm) : 0;
        break;
    }

    for (let i = 0; i < count; i++) {
      const seed = Math.random();
      let pt: Particle;
      switch (sd.particles) {
        case "ember":
          pt = {
            kind: "ember",
            x0: x + (seed - 0.5) * this.advance,
            y0: y,
            vx: (Math.random() - 0.5) * 34,
            vy: -(38 + Math.random() * 60),
            born: now,
            life: 600 + Math.random() * 550,
            seed
          };
          break;
        case "ring":
          pt = {
            kind: "ring",
            x0: x + this.advance * 0.5,
            y0: this.typingY + 3,
            vx: 0,
            vy: 0,
            born: now,
            life: 650,
            seed
          };
          break;
        case "frost":
          pt = {
            kind: "frost",
            x0: x + (seed - 0.5) * this.advance * 1.4,
            y0: y - this.fs * 0.4,
            vx: (Math.random() - 0.5) * 14,
            vy: 9 + Math.random() * 16,
            born: now,
            life: 1000 + Math.random() * 700,
            seed
          };
          break;
        case "leaf":
          pt = {
            kind: "leaf",
            x0: x,
            y0: y - this.fs * (0.2 + seed * 0.6),
            vx: 55 + Math.random() * 70,
            vy: 0,
            born: now,
            life: 900 + Math.random() * 600,
            seed
          };
          break;
      }
      if (this.particles.length >= PARTICLE_CAP) this.particles.shift();
      this.particles.push(pt);
    }
  }

  private drawParticles(
    fx: { fresh: string; misA: string; misB: string },
    now: number
  ): void {
    if (this.particles.length === 0) return;
    const ctx = this.ctx;
    this.particles = this.particles.filter((pt) => now - pt.born < pt.life);
    for (const pt of this.particles) {
      const age = now - pt.born;
      const t = age / pt.life;
      const s = age / 1000;
      switch (pt.kind) {
        case "ember": {
          const x = pt.x0 + pt.vx * s + Math.sin(pt.seed * 9 + age / 160) * 3;
          const y = pt.y0 + pt.vy * s - 26 * s * s;
          ctx.globalAlpha = (1 - t) * 0.85;
          ctx.fillStyle = t < 0.35 ? fx.misA : fx.fresh;
          ctx.beginPath();
          ctx.arc(x, y, Math.max(0.6, 2.2 * (1 - t * 0.6)), 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case "ring": {
          const r = 3 + 17 * easeOut(t);
          ctx.globalAlpha = (1 - t) * 0.45;
          ctx.strokeStyle = fx.fresh;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.ellipse(pt.x0, pt.y0, r, r * 0.34, 0, 0, Math.PI * 2);
          ctx.stroke();
          break;
        }
        case "frost": {
          const x = pt.x0 + pt.vx * s + Math.sin(pt.seed * 6 + age / 280) * 3.5;
          const y = pt.y0 + pt.vy * s;
          const tw = 0.5 + 0.5 * Math.sin(age / 90 + pt.seed * 9);
          ctx.globalAlpha = (1 - t) * tw * 0.9;
          ctx.fillStyle = fx.misA;
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(Math.PI / 4);
          ctx.fillRect(-1.1, -1.1, 2.2, 2.2);
          ctx.restore();
          break;
        }
        case "leaf": {
          const x = pt.x0 + pt.vx * s;
          const y = pt.y0 + Math.sin(age / 230 + pt.seed * 7) * 6 + 12 * s;
          ctx.globalAlpha = (1 - t) * 0.65;
          ctx.fillStyle = fx.fresh;
          ctx.beginPath();
          ctx.ellipse(x, y, 2.6, 1.1, pt.seed * 3 + age / 500, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  private withAlpha(color: string, a: number): string {
    if (color[0] === "#") {
      const v = parseInt(color.slice(1), 16);
      return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`;
    }
    const m = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(color);
    if (m) return `rgba(${m[1]},${m[2]},${m[3]},${a})`;
    return color;
  }

  /**
   * The deep-flow environment. Side blooms creep in from the vertical edges
   * as momentum climbs; once deep in flow, slow aurora bands drift near the
   * top and bottom margins. Everything is low-contrast and peripheral, so
   * the text stays the hero; it is purely a reward for sustained cadence.
   */
  private drawEnvironment(
    p: Palette,
    fx: { fresh: string; misA: string; misB: string },
    now: number,
    mm: number
  ): void {
    const m = this.momentum * mm;
    if (m < 0.04) return;
    const ctx = this.ctx;
    void p;

    const reach = this.w * (0.1 + m * 0.16);
    const intensity = m * 0.16;
    const left = ctx.createLinearGradient(0, 0, reach, 0);
    left.addColorStop(0, this.withAlpha(fx.fresh, intensity));
    left.addColorStop(1, this.withAlpha(fx.fresh, 0));
    ctx.fillStyle = left;
    ctx.fillRect(0, 0, reach, this.h);
    const right = ctx.createLinearGradient(this.w, 0, this.w - reach, 0);
    right.addColorStop(0, this.withAlpha(fx.fresh, intensity));
    right.addColorStop(1, this.withAlpha(fx.fresh, 0));
    ctx.fillStyle = right;
    ctx.fillRect(this.w - reach, 0, reach, this.h);

    if (m > 0.5) {
      const bandA = (m - 0.5) * 0.22;
      for (let b = 0; b < 3; b++) {
        const phase = now / 2600 + b * 1.7;
        const col = b % 2 ? fx.misA : fx.misB;
        const yTop = this.h * (0.16 + b * 0.03) + Math.sin(phase) * 18;
        const gTop = ctx.createLinearGradient(0, yTop - 60, 0, yTop + 60);
        gTop.addColorStop(0, this.withAlpha(col, 0));
        gTop.addColorStop(0.5, this.withAlpha(col, bandA));
        gTop.addColorStop(1, this.withAlpha(col, 0));
        ctx.fillStyle = gTop;
        ctx.fillRect(0, yTop - 60, this.w, 120);

        const yBot = this.h * (0.84 - b * 0.03) + Math.cos(phase) * 18;
        const colB = b % 2 ? fx.misB : fx.misA;
        const gBot = ctx.createLinearGradient(0, yBot - 60, 0, yBot + 60);
        gBot.addColorStop(0, this.withAlpha(colB, 0));
        gBot.addColorStop(0.5, this.withAlpha(colB, bandA));
        gBot.addColorStop(1, this.withAlpha(colB, 0));
        ctx.fillStyle = gBot;
        ctx.fillRect(0, yBot - 60, this.w, 120);
      }
    }
  }

  /**
   * The echo ghost: a past (or shared) session replayed one line above the
   * typing line, faint and slightly smaller, typing in its original cadence.
   * A duet with a recorded rhythm, not a race.
   */
  private drawEcho(
    p: Palette,
    fx: { fresh: string; misA: string; misB: string },
    now: number
  ): void {
    if (this.echoSource === "off" || !this.echoPlayer) return;
    void fx;
    const st = this.echoPlayer.state(now, this.echoStartedAt, this.maxCols);
    const y = this.typingY - this.lineHeight * 1.5;
    const ctx = this.ctx;
    ctx.textBaseline = "alphabetic";
    const base = 0.3 * st.fade;
    const color = mixHex(p.sub, p.fresh, 0.3);
    const px = Math.round(this.fs * 0.9);

    for (const g of st.line) {
      const fadeIn = clamp((st.elapsed - g.fireT) / 70, 0, 1);
      ctx.globalAlpha = base * fadeIn;
      ctx.font = this.font(g.w, px);
      ctx.fillStyle = color;
      ctx.fillText(g.ch, this.colX(g.col), y);
    }

    const blink = 0.5 + 0.5 * Math.abs(Math.sin(now / 420));
    ctx.globalAlpha = base * blink;
    ctx.fillStyle = color;
    const cw = Math.max(2, this.advance * 0.12);
    ctx.fillRect(this.colX(st.caretCol) + 0.5, y - this.fs * 0.92, cw, this.fs * 1.05);
    ctx.globalAlpha = 1;
  }

  private drawCaret(
    p: Palette,
    sd: StyleDef,
    fx: { fresh: string; misA: string; misB: string },
    now: number,
    mm: number
  ): void {
    const ctx = this.ctx;
    const idle = now - this.lastInput;
    const blink = idle > 1200 ? 0.35 + 0.65 * Math.abs(Math.sin((now - 1200) / 480)) : 1;
    const sy = clamp(1 - this.squash.x * 0.045, 0.55, 1.35);
    const lean = clamp(this.caretX.v * 0.00035 * mm, -0.18, 0.18);
    const cw = Math.max(3, this.advance * 0.16);
    const chh = this.fs * 1.18;
    const yBottom = this.typingY + this.fs * 0.26;

    ctx.save();
    ctx.translate(this.caretX.x + 0.5, yBottom);
    ctx.transform(1, 0, -lean, 1, 0, 0);
    ctx.scale(1, sy);
    if (this.heat > 0.05 && mm > 0) {
      ctx.shadowColor = fx.fresh;
      ctx.shadowBlur = 18 * this.heat * sd.glow * mm;
    }
    // Speed smear: ghost carets trail behind fast movement.
    if (Math.abs(this.caretX.v) > 600 && mm > 0) {
      const smear = clamp(this.caretX.v * 0.014, -this.advance * 2, this.advance * 2);
      ctx.globalAlpha = blink * 0.14;
      ctx.fillStyle = fx.fresh;
      ctx.fillRect(-smear, -chh, cw, chh);
      ctx.globalAlpha = blink * 0.07;
      ctx.fillRect(-smear * 1.8, -chh, cw, chh);
    }
    ctx.globalAlpha = blink;
    ctx.fillStyle = this.shiftHeld ? fx.fresh : p.ink;
    ctx.fillRect(0, -chh, cw, chh);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  private drawSeismo(
    p: Palette,
    fx: { fresh: string; misA: string; misB: string },
    now: number
  ): void {
    const ctx = this.ctx;
    const yMid = this.h - 30;
    const left = this.marginX;
    const right = this.w - this.marginX;
    const pxPerMs = (right - left) / SEISMO_SPAN;

    ctx.strokeStyle = p.sub;
    ctx.globalAlpha = 0.4;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, yMid + 0.5);
    ctx.lineTo(right, yMid + 0.5);
    ctx.stroke();

    // Milestone flash: the whole baseline lights up for a beat.
    const flashT = (now - this.seismoFlashAt) / 450;
    if (flashT < 1) {
      ctx.strokeStyle = fx.fresh;
      ctx.globalAlpha = (1 - flashT) * 0.85;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(left, yMid + 0.5);
      ctx.lineTo(right, yMid + 0.5);
      ctx.stroke();
    }

    const ticks = this.rhythm.ticks(now, SEISMO_SPAN);
    ctx.lineWidth = 1.5;
    for (let i = 0; i < ticks.length; i++) {
      const t = ticks[i]!;
      const x = right - (now - t) * pxPerMs;
      if (x < left) continue;
      const gap = i > 0 ? t - ticks[i - 1]! : 400;
      const hgt = clamp(1400 / Math.max(gap, 40), 3, 18);
      const recent = clamp(1 - (now - t) / SEISMO_SPAN, 0, 1);
      ctx.strokeStyle = this.heat > 0.2 && now - t < 1500 ? fx.fresh : p.sub;
      ctx.globalAlpha = 0.25 + 0.55 * recent;
      ctx.beginPath();
      ctx.moveTo(x, yMid - hgt);
      ctx.lineTo(x, yMid + hgt * 0.45);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  private captionA = 0;

  private drawCaption(
    p: Palette,
    sd: StyleDef,
    fx: { fresh: string; misA: string; misB: string },
    now: number
  ): void {
    const override = this.captionOverride && now < this.captionOverride.until
      ? this.captionOverride
      : null;
    if (this.captionOverride && !override) this.captionOverride = null;
    const flowOn =
      override !== null ||
      (this.prefs.caption && this.heat > 0.12 && this.emaWpm > 38 && now - this.lastInput < 900);
    this.captionA += ((flowOn ? 1 : 0) - this.captionA) * 0.12;
    if (this.captionA < 0.02) return;
    const print = sd.id === "print";
    void fx;

    const ctx = this.ctx;
    const fsC = Math.round(this.fs * 0.78);
    const text = override ? override.text : `${Math.round(this.emaWpm)} WPM`;
    ctx.font = this.font(800, fsC);
    const tw = ctx.measureText(text).width;
    const pad = fsC * 0.7;
    const bw = tw + pad * 2;
    const bh = fsC * 1.9;
    const cx = this.w - this.marginX - bw / 2;
    const cy = 64;

    ctx.save();
    ctx.globalAlpha = this.captionA;
    ctx.translate(cx, cy);
    ctx.rotate(-0.045);
    const punch = 1 + clamp(this.captionPunch.x, 0, 1.4) * 0.05;
    const popScale = (0.92 + 0.08 * this.captionA) * punch;
    ctx.scale(popScale, popScale);

    if (print) {
      ctx.fillStyle = p.ink;
      ctx.fillRect(-bw / 2 + 4, -bh / 2 + 5, bw, bh);
    }
    ctx.fillStyle = p.captionBg;
    ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = p.ink;
    ctx.strokeRect(-bw / 2, -bh / 2, bw, bh);

    // Comic lettering: each character gets a stable micro-jitter.
    ctx.fillStyle = p.captionInk;
    ctx.textBaseline = "middle";
    let x = -tw / 2;
    for (let i = 0; i < text.length; i++) {
      const chW = ctx.measureText(text[i]!).width;
      const rot = print ? hashJitter(i, 3) * 0.07 : 0;
      const dy = print ? hashJitter(i, 11) * 2 : 0;
      ctx.save();
      ctx.translate(x + chW / 2, dy);
      ctx.rotate(rot);
      ctx.fillText(text[i]!, -chW / 2, 0);
      ctx.restore();
      x += chW;
    }
    ctx.restore();
    ctx.textBaseline = "alphabetic";
  }

  /**
   * The empty sheet explains itself. Shown only when nothing has been
   * typed; fades from view forever the moment there is text.
   */
  private drawWelcome(p: Palette, now: number): void {
    if (this.baked.length || this.active.length || this.helpOpen || this.statsOpen) return;
    if (now - this.bootAt < 600) return;
    const ctx = this.ctx;
    const x = this.marginX;
    const small = Math.round(this.fs * 0.62);
    const titleSize = Math.round(this.fs * 1.55);
    let y = Math.max(96, this.typingY - this.lineHeight * 4.6);

    ctx.globalAlpha = 0.92;
    ctx.fillStyle = p.ink;
    ctx.font = this.font(760, titleSize);
    ctx.fillText("type", x, y);
    y += small * 2.1;

    ctx.font = this.font(460, small);
    ctx.fillStyle = p.ink;
    ctx.globalAlpha = 0.75;
    ctx.fillText("a quiet page that makes typing feel good.", x, y);
    y += small * 1.7;
    ctx.fillText("no test, no timer, no sound. just your words, with physics.", x, y);
    y += small * 2.4;

    const pulse = 0.55 + 0.15 * Math.sin(now / 900);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = p.sub;
    ctx.font = this.font(440, Math.round(small * 0.92));
    ctx.fillText("start typing, anywhere on this page", x, y);
    y += small * 1.55;
    ctx.fillText("hold a key and it prints heavier. find a rhythm and the page wakes up.", x, y);
    y += small * 1.55;
    ctx.fillText("it remembers your sessions. F10 types one back beside you.", x, y);
    y += small * 1.55;
    ctx.fillStyle = p.fresh;
    ctx.fillText("press F1 for everything else", x, y);
    ctx.globalAlpha = 1;
  }

  /**
   * Always-visible control strip, top left. Quiet by design: it dims while
   * you are in flow so it never competes with the text, and F9 hides it
   * entirely.
   */
  private drawChrome(p: Palette, sd: StyleDef, now: number): void {
    if (this.helpOpen || this.statsOpen) return;
    const ctx = this.ctx;
    const small = Math.round(this.fs * 0.46);
    const idleFor = now - this.lastInput;
    const a = this.heat > 0.25 ? 0.14 : idleFor > 4000 ? 0.62 : 0.4;

    ctx.font = this.font(460, small);
    const echoNote = this.echoSource !== "off" ? `  ·  echo: ${this.echoLabel(this.echoSource)}` : "";
    const status = `${this.palette().label} · ${sd.label}${echoNote}`;
    const controls = "F1 help   F4 style   F10 echo   Esc clear";

    ctx.globalAlpha = a;
    ctx.fillStyle = p.sub;
    ctx.fillText(status, this.marginX, 34);
    ctx.globalAlpha = a * 0.85;
    ctx.fillText(controls, this.marginX, 34 + small * 1.5);
    ctx.globalAlpha = 1;
  }

  private drawToast(p: Palette, now: number): void {
    const age = now - this.toastAt;
    if (age > 1700) return;
    const a = Math.min(1, age / 120) * clamp((1700 - age) / 380, 0, 1);
    const ctx = this.ctx;
    ctx.globalAlpha = a * 0.9;
    ctx.font = this.font(520, Math.round(this.fs * 0.56));
    const tw = ctx.measureText(this.toastMsg).width;
    ctx.fillStyle = p.sub;
    ctx.fillText(this.toastMsg, (this.w - tw) / 2, this.h - 64);
    ctx.globalAlpha = 1;
  }

  private drawWipe(now: number, mm: number): void {
    const wp = this.wipe!;
    const t = (now - wp.at) / 280;
    if (t >= 1) {
      this.wipe = null;
      return;
    }
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1 - easeOut(t);
    ctx.drawImage(wp.canvas, 0, easeOut(t) * 34 * this.dpr * Math.max(mm, 0.4));
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  private drawHalftoneBands(p: Palette): void {
    const ctx = this.ctx;
    if (!this.dotPattern) {
      const cell = 7;
      const pc = document.createElement("canvas");
      pc.width = cell;
      pc.height = cell;
      const px = pc.getContext("2d");
      if (px) {
        px.fillStyle = p.ink;
        px.beginPath();
        px.arc(cell / 2, cell / 2, 1.05, 0, Math.PI * 2);
        px.fill();
      }
      this.dotPattern = ctx.createPattern(pc, "repeat");
    }
    if (!this.dotPattern) return;
    ctx.globalAlpha = p.dark ? 0.08 : 0.055;
    ctx.fillStyle = this.dotPattern;
    ctx.fillRect(0, 0, this.w, 64);
    ctx.fillRect(0, this.h - 76, this.w, 76);
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------- overlays

  private overlayPanel(p: Palette): { x: number; y: number; pw: number } {
    const ctx = this.ctx;
    ctx.fillStyle = p.paper;
    ctx.globalAlpha = 0.94;
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.globalAlpha = 1;
    const pw = Math.min(620, this.w - 64);
    return { x: (this.w - pw) / 2, y: Math.max(56, this.h * 0.14), pw };
  }

  private drawHelp(p: Palette, sd: StyleDef): void {
    const ctx = this.ctx;
    ctx.fillStyle = p.paper;
    ctx.globalAlpha = 0.96;
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.globalAlpha = 1;

    const rows: Array<[string, string]> = [
      ["F1", "open and close this help"],
      ["F2 / F3", `palette, now ${this.palette().label}`],
      ["F4", `style, now ${sd.label}`],
      ["F5", `seismograph ${this.prefs.seismo ? "(on)" : "(off)"}`],
      ["F6", `flow caption ${this.prefs.caption ? "(on)" : "(off)"}`],
      ["F7", `motion: ${["off", "subtle", "full"][this.prefs.motion]}`],
      ["F8", "keystroke odometer"],
      ["F9", `controls strip ${this.prefs.chrome ? "(shown)" : "(hidden)"}`],
      ["F10", `echo: ${this.echoSource === "off" ? "off" : this.echoLabel(this.echoSource)}`],
      ["Esc", "clear the page"],
      ["Ctrl+Z", "bring back what you cleared"],
      ["Ctrl+C", "copy everything you typed"],
      ["Ctrl+S", "save a rhythm print of this session"],
      ["Ctrl+E", "copy a link that carries your rhythm"]
    ];

    const aboutLines = [
      "a silent typing playground. the page listens to",
      "your keyboard and turns rhythm into motion.",
      "nothing is tested. it remembers how you type."
    ];
    const inkLines = [
      "tap a key: light. hold it: heavier. the page remembers.",
      "hold, then release: the letter stamps. feel the thump.",
      "type with an even rhythm to build flow. the edges wake up.",
      "echo (F10) replays a past session beside you. type along.",
      "the page knows words: fire, water, ice, wind, zen, echo.",
      "Ctrl+S keeps a print of your rhythm. Ctrl+E shares it."
    ];

    // Adaptive type size: fit by height AND by the widest line, so the
    // card never overflows its border.
    const lineCount = rows.length + aboutLines.length + inkLines.length + 7;
    const pw = Math.min(680, this.w - 64);
    let small = Math.round(this.fs * 0.66);
    small = Math.min(small, Math.floor((this.h * 0.86) / (lineCount * 1.85)));
    const widest = [...aboutLines, ...inkLines].reduce(
      (a, b) => (b.length > a.length ? b : a),
      ""
    );
    for (; small > 11; small--) {
      ctx.font = this.font(460, small);
      const bodyW = ctx.measureText(widest).width;
      const rowW =
        small * 7 +
        rows.reduce((m, r) => Math.max(m, ctx.measureText(r[1]).width), 0);
      if (Math.max(bodyW, rowW) <= pw - small * 4.4) break;
    }
    small = Math.max(small, 11);
    const rowH = Math.round(small * 1.85);

    const ph = rowH * lineCount + small * 3;
    const px = (this.w - pw) / 2;
    const py = Math.max(28, (this.h - ph) / 2);

    // Card with the Print treatment: offset slab, then panel, then border.
    ctx.fillStyle = p.ink;
    ctx.globalAlpha = 0.9;
    ctx.fillRect(px + 6, py + 7, pw, ph);
    ctx.globalAlpha = 1;
    ctx.fillStyle = p.paper;
    ctx.fillRect(px, py, pw, ph);
    ctx.lineWidth = 2;
    ctx.strokeStyle = p.ink;
    ctx.strokeRect(px, py, pw, ph);

    const x = px + small * 2.2;
    let y = py + small * 3;
    const section = (title: string) => {
      ctx.font = this.font(700, Math.round(small * 0.82));
      ctx.fillStyle = p.fresh;
      ctx.fillText(title.toUpperCase(), x, y);
      y += rowH;
    };
    const body = (text: string, color = p.ink, weight = 460) => {
      ctx.font = this.font(weight, small);
      ctx.fillStyle = color;
      ctx.fillText(text, x, y);
      y += rowH;
    };

    ctx.font = this.font(760, Math.round(small * 1.7));
    ctx.fillStyle = p.ink;
    ctx.fillText("type", x, y);
    y += rowH * 1.4;

    section("what this is");
    for (const line of aboutLines) body(line);
    y += rowH * 0.5;

    section("controls");
    for (const [k, desc] of rows) {
      ctx.font = this.font(680, small);
      ctx.fillStyle = p.fresh;
      ctx.fillText(k, x, y);
      ctx.font = this.font(460, small);
      ctx.fillStyle = p.ink;
      ctx.fillText(desc, x + small * 7, y);
      y += rowH;
    }
    y += rowH * 0.5;

    section("how the ink works");
    for (const line of inkLines) body(line);
  }

  private drawStats(p: Palette): void {
    const ctx = this.ctx;
    const { x, y } = this.overlayPanel(p);
    const small = Math.round(this.fs * 0.6);
    let cy = y;

    ctx.fillStyle = p.ink;
    ctx.font = this.font(760, Math.round(this.fs * 1.5));
    ctx.fillText("odometer", x, cy);
    cy += small * 3.4;

    const fmt = (n: number) => n.toLocaleString("en-US");
    const tier =
      this.momentum > 0.66 ? "deep flow" : this.momentum > 0.33 ? "warming" : "calm";
    const echoes = this.availableSources().filter((s) => s !== "off");
    const echoNote =
      echoes.length === 0
        ? "none saved yet"
        : echoes
            .map((s) => (s === "latest" ? "last" : s === "best" ? "best" : "shared"))
            .join(" · ");
    const rows: Array<[string, string]> = [
      ["lifetime keystrokes", fmt(this.odo.total)],
      ["this session", fmt(this.sessionKeys)],
      ["best flow", this.odo.bestWpm ? `${this.odo.bestWpm} WPM` : "not yet"],
      ["longest streak", this.odo.bestStreak ? fmt(this.odo.bestStreak) : "not yet"],
      ["flow right now", tier],
      ["echoes", echoNote]
    ];
    for (const [label, val] of rows) {
      ctx.font = this.font(440, small);
      ctx.fillStyle = p.sub;
      ctx.fillText(label, x, cy);
      ctx.font = this.font(660, small);
      ctx.fillStyle = p.ink;
      ctx.fillText(val, x + small * 14, cy);
      cy += small * 1.95;
    }

    cy += small * 1.4;
    ctx.font = this.font(440, small);
    ctx.fillStyle = p.sub;
    ctx.fillText("most pressed", x, cy);
    cy += small * 1.95;

    const top = Object.entries(this.odo.perKey)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    const maxCount = top.length ? top[0]![1] : 1;
    for (const [code, count] of top) {
      ctx.font = this.font(660, small);
      ctx.fillStyle = p.fresh;
      ctx.fillText(keyLabel(code), x, cy);
      const barW = (count / maxCount) * small * 12;
      ctx.fillStyle = p.sub;
      ctx.globalAlpha = 0.5;
      ctx.fillRect(x + small * 6, cy - small * 0.62, barW, small * 0.7);
      ctx.globalAlpha = 1;
      ctx.font = this.font(440, small);
      ctx.fillStyle = p.ink;
      ctx.fillText(fmt(count), x + small * 6 + barW + small * 0.6, cy);
      cy += small * 1.95;
    }
  }
}
