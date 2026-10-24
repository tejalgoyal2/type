/**
 * The app: listens to the keyboard, runs the loop, keeps score.
 *
 * Every key class has a job. Letters print and their weight follows how
 * long you held them; space can be charged; arrows move the lamp; shift
 * lifts the page; caps shouts; alt shows your rhythm; ctrl shows the
 * page's own key layer; tab swaps the switch; page up and down swap the
 * colorway; delete strikes; esc, held, clears.
 */
import { WAYS, SECRET, blend, rgb, type Way } from "./colorways";
import { Board, type Switch, type Layer } from "./board";
import { Page } from "./page";
import { FINDS, FIND_COUNT, findById } from "./finds";

const FONT = '"JetBrains Mono Variable", ui-monospace, monospace';
const KEY = "type.next.v1";
const UNDO = "type.next.undo";
const SWITCHES: Switch[] = ["thock", "tactile", "clicky", "linear"];
const SWITCH_NOTE: Record<Switch, string> = {
  thock: "deep and heavy",
  tactile: "a bump you can see",
  clicky: "sharp and bright",
  linear: "smooth, no bump"
};
const SOUNDS: Record<string, Switch> = {
  thock: "thock", thocky: "thock", thocc: "thock",
  clack: "clicky", clacky: "clicky", clicky: "clicky",
  tactile: "tactile", bumpy: "tactile",
  linear: "linear", creamy: "linear", buttery: "linear"
};
const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "KeyB", "KeyA"];
const PASS = new Set(["F5", "F11", "F12"]);

interface Saved {
  doc?: string[][];
  way?: string;
  sw?: Switch;
  finds?: string[];
  tested?: string[];
  counts?: Record<string, number>;
  az?: number;
  alt?: number;
  board?: boolean;
  zen?: boolean;
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

function load<T>(k: string): T | null {
  try {
    const s = localStorage.getItem(k);
    return s ? (JSON.parse(s) as T) : null;
  } catch {
    return null;
  }
}

function save(k: string, v: unknown): void {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* private mode: the page still works, it just forgets */
  }
}

export class App {
  private ctx: CanvasRenderingContext2D;
  private layer = document.createElement("canvas");
  private lctx: CanvasRenderingContext2D;
  private dpr = 1;
  private W = 0;
  private H = 0;
  private fonts = new Map<string, string>();
  private cwRatio = 0.6;

  private wayI = 0;
  private wayFrom: Way;
  private wayT = 1;
  private sw: Switch = "thock";
  private board: Board;
  private page = new Page();
  private finds: Set<string>;
  private unlocked: boolean;

  // The lamp: azimuth and altitude.
  private az = -2.2;
  private alt = 0.55;
  private lift = 0;
  private liftV = 0;
  private zoom = 1;
  private zoomV = 0;
  private dip = 0;
  private dipV = 0;

  private down = new Map<string, number>();
  private pending = new Map<string, ReturnType<Page["insert"]>["g"]>();
  private arrows = new Set<string>();
  private kroMax = 0;
  private caps = false;
  private altAt: number | null = null;
  private ctrlAt: number | null = null;
  private shiftAt: number | null = null;
  private shiftClean = false;
  private spaceAt: number | null = null;
  private charging = false;
  private escAt: number | null = null;
  private bsAt: number | null = null;
  private konami: string[] = [];
  private stamps: number[] = [];
  private lastKey = 0;
  private lastInsert = 0;
  private lastFind = 0;
  private hintAt = 0;
  private wpm = 0;
  private zen = false;
  private dirty = false;
  private savedAt = 0;
  private last = performance.now();
  private grain: CanvasPattern | null = null;
  private bg: { key: string; c: HTMLCanvasElement } | null = null;
  private readAt = 0;
  private reserved = -1;
  private mm: number;
  private coarse = matchMedia("(pointer: coarse)").matches;

  private el = {
    hud: document.getElementById("hud")!,
    read: document.getElementById("read")!,
    way: document.getElementById("way")!,
    toasts: document.getElementById("toasts")!,
    hint: document.getElementById("hint")!,
    help: document.getElementById("help")!,
    sink: document.getElementById("sink") as HTMLTextAreaElement
  };

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d", { alpha: false, desynchronized: true }) ?? canvas.getContext("2d")!;
    this.lctx = this.layer.getContext("2d")!;
    this.mm = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1;

    const s = load<Saved>(KEY) ?? {};
    this.finds = new Set(s.finds ?? []);
    this.unlocked = this.finds.has("gold");
    const dark = matchMedia("(prefers-color-scheme: dark)").matches;
    const wi = WAYS.findIndex((w) => w.id === (s.way ?? (dark ? "carbon" : "milk")));
    this.wayI = wi >= 0 && (WAYS[wi].id !== SECRET || this.unlocked) ? wi : 0;
    this.wayFrom = WAYS[this.wayI];
    if (s.sw && SWITCHES.includes(s.sw)) this.sw = s.sw;
    if (typeof s.az === "number") this.az = s.az;
    if (typeof s.alt === "number") this.alt = s.alt;
    this.zen = !!s.zen;
    this.board = new Board(s.tested ?? [], s.counts ?? {});
    this.board.want = s.board ?? true;
    if (s.doc) this.page.load(s.doc);

    this.measure();
    this.resize();
    addEventListener("resize", () => this.resize());
    addEventListener("keydown", (e) => this.keydown(e));
    addEventListener("keyup", (e) => this.keyup(e));
    addEventListener("blur", () => this.blur());
    canvas.addEventListener("pointerdown", (e) => this.pointer(e));
    addEventListener("wheel", (e) => this.wheel(e), { passive: true });
    this.el.sink.addEventListener("beforeinput", (e) => this.soft(e));
    document.fonts?.addEventListener?.("loadingdone", () => {
      this.measure();
      this.resize();
    });
    this.applyCss();
    this.el.hud.classList.toggle("zen", this.zen);
    requestAnimationFrame((t) => this.frame(t));
  }

  // ---- setup --------------------------------------------------------------

  private font = (w: number, px: number, ital = false): string => {
    const wq = Math.round(w / 10) * 10;
    const pq = Math.round(px * 2) / 2;
    const k = `${wq}|${pq}|${ital ? 1 : 0}`;
    let f = this.fonts.get(k);
    if (!f) {
      f = `${ital ? "italic " : ""}${wq} ${pq}px ${FONT}`;
      this.fonts.set(k, f);
    }
    return f;
  };

  private measure(): void {
    const c = document.createElement("canvas").getContext("2d")!;
    c.font = `400 100px ${FONT}`;
    this.cwRatio = c.measureText("M").width / 100 || 0.6;
  }

  private resize(): void {
    this.dpr = Math.min(2, devicePixelRatio || 1);
    this.W = innerWidth;
    this.H = innerHeight;
    for (const c of [this.canvas, this.layer]) {
      c.width = Math.round(this.W * this.dpr);
      c.height = Math.round(this.H * this.dpr);
    }
    this.canvas.style.width = `${this.W}px`;
    this.canvas.style.height = `${this.H}px`;
    if (this.W < 620 || (this.coarse && !this.lastKey)) this.board.want = false;
    this.board.place(this.W, this.H);
    this.bg = null;
    this.layout();
  }

  private layout(): void {
    const fs = Math.round(clamp(Math.min(this.W * 0.02, this.H * 0.036), 17, 30));
    const bottom = this.H - Math.max(this.board.reserve(this.H), 24);
    const colMax = Math.max(720, this.board.u * 16 * this.board.shown);
    this.page.layout(this.W, 64, bottom - 8, fs, (px) => px * this.cwRatio, colMax);
    document.documentElement.style.setProperty("--hint-y", `${Math.round(this.H - bottom + 14)}px`);
  }

  private get way(): Way {
    return this.wayT >= 1 ? WAYS[this.wayI] : blend(this.wayFrom, WAYS[this.wayI], this.wayT);
  }

  private applyCss(): void {
    const w = WAYS[this.wayI];
    const r = document.documentElement.style;
    r.setProperty("--desk", rgb(w.desk));
    r.setProperty("--ink", rgb(w.ink));
    r.setProperty("--ghost", rgb(w.ghost));
    r.setProperty("--accent", rgb(w.accent));
    r.setProperty("--panel", rgb(w.dark ? w.plate : w.alpha, 0.84));
    document.documentElement.style.colorScheme = w.dark ? "dark" : "light";
    this.el.way.textContent = w.id;
  }

  // ---- input --------------------------------------------------------------

  private keydown(e: KeyboardEvent): void {
    const now = e.timeStamp || performance.now();
    const code = e.code;
    if (!this.el.help.hidden) {
      if (code === "Escape" || code === "F1" || code === "Enter" || code === "Space") {
        e.preventDefault();
        this.help(false);
      }
      return;
    }
    if (e.isComposing || e.key === "Unidentified" || e.key === "Process") return;
    const altGr = e.getModifierState?.("AltGraph") && e.key.length === 1;
    if (!this.lastKey && this.W >= 620 && code) this.board.want = (load<Saved>(KEY)?.board ?? true);
    this.lastKey = now;

    if (!e.repeat && code) {
      this.down.set(code, now);
      const k = this.board.press(code, now, this.sw);
      if (k) {
        this.dirty = true;
        this.checkTested(now);
      }
      this.kro(now);
      this.konamiStep(code, now);
    }
    const caps = e.getModifierState?.("CapsLock") ?? false;
    if (caps !== this.caps) {
      this.caps = caps;
      if (caps) this.find("caps");
    }

    if (code === "ShiftLeft" || code === "ShiftRight") {
      if (!e.repeat) {
        this.shiftAt = now;
        this.shiftClean = true;
      }
      return;
    }
    this.shiftClean = false;

    if (code === "ControlLeft" || code === "ControlRight" || code === "MetaLeft" || code === "MetaRight") {
      if (!e.repeat) this.ctrlAt = now;
      return;
    }
    if ((e.ctrlKey || e.metaKey) && !altGr) {
      this.ctrlAt = null;
      this.shortcut(e, now);
      return;
    }
    if (code === "AltLeft" || code === "AltRight") {
      e.preventDefault();
      if (!e.repeat) this.altAt = now;
      return;
    }
    if (e.altKey && !altGr) {
      e.preventDefault();
      return;
    }

    switch (code) {
      case "ArrowLeft":
      case "ArrowRight":
      case "ArrowUp":
      case "ArrowDown":
        e.preventDefault();
        this.arrows.add(code);
        this.find("light");
        return;
      case "Tab":
        e.preventDefault();
        if (!e.repeat) this.setSwitch(SWITCHES[(SWITCHES.indexOf(this.sw) + (e.shiftKey ? 3 : 1)) % 4], now, true);
        return;
      case "PageUp":
      case "PageDown":
        e.preventDefault();
        if (!e.repeat) this.cycleWay(code === "PageDown" ? 1 : -1);
        return;
      case "Home":
        e.preventDefault();
        this.page.scrollT = this.page.maxScroll;
        if (this.page.maxScroll > this.page.lh * 2) this.find("scroll");
        return;
      case "End":
        e.preventDefault();
        this.page.scrollT = 0;
        return;
      case "Escape":
        e.preventDefault();
        if (!e.repeat) this.escAt = now;
        return;
      case "Delete":
        e.preventDefault();
        if (!e.repeat && this.page.strike(now)) {
          this.find("strike");
          this.dirty = true;
        }
        return;
      case "F1":
        e.preventDefault();
        this.help(true);
        return;
      case "F2":
        e.preventDefault();
        this.board.want = !this.board.want;
        this.dirty = true;
        return;
      case "F3":
        e.preventDefault();
        this.zen = !this.zen;
        this.el.hud.classList.toggle("zen", this.zen);
        this.dirty = true;
        return;
      case "Backspace":
        e.preventDefault();
        this.backspace(now, e.repeat);
        return;
      case "Enter":
        e.preventDefault();
        if (!e.repeat) this.enter(now);
        return;
      case "Space":
        e.preventDefault();
        if (!e.repeat) {
          this.spaceAt = now;
          this.type(" ", code, now);
        } else if (this.spaceAt !== null && now - this.spaceAt > 260) this.charging = true;
        return;
    }
    if (/^F\d+$/.test(code)) {
      if (!PASS.has(code)) e.preventDefault();
      return;
    }
    if (e.key.length === 1 || /^\p{L}$/u.test(e.key)) {
      e.preventDefault();
      if (!e.repeat) this.type(e.key, code, now);
    }
  }

  private keyup(e: KeyboardEvent): void {
    const now = e.timeStamp || performance.now();
    const code = e.code;
    const at = this.down.get(code);
    this.down.delete(code);
    this.board.release(code, now);
    this.arrows.delete(code);

    if (code === "ShiftLeft" || code === "ShiftRight") {
      if (this.shiftClean && this.shiftAt !== null && now - this.shiftAt < 380) {
        this.liftV += 7 * Math.max(0.4, this.mm);
        this.find("lift");
      }
      this.shiftAt = null;
      this.shiftClean = false;
      return;
    }
    if (code === "AltLeft" || code === "AltRight") {
      e.preventDefault();
      this.altAt = null;
      return;
    }
    if (code.startsWith("Control") || code.startsWith("Meta")) {
      this.ctrlAt = null;
      return;
    }
    if (code === "Escape") {
      this.escAt = null;
      return;
    }
    if (code === "Backspace") this.bsAt = null;
    if (code === "Space") {
      if (this.charging && this.spaceAt !== null) {
        const c = clamp((now - this.spaceAt - 260) / 1100, 0.15, 1);
        const { x, y } = this.page.caret;
        this.page.blast(x, y, now, 0.6 + c * 1.6);
        this.zoomV -= 0.25 * c * this.mm;
        this.find("charge");
      }
      this.charging = false;
      this.spaceAt = null;
    }
    const g = this.pending.get(code);
    if (g && at !== undefined) {
      this.pending.delete(code);
      if (this.page.release(g, now - at, now, this.sw)) {
        this.page.stamped(g, now);
        this.zoomV += 0.12 * this.mm;
        this.dipV += 90 * this.mm;
        this.find("stamp");
      }
      this.dirty = true;
    }
  }

  private blur(): void {
    const now = performance.now();
    this.board.releaseAll(now);
    for (const g of this.pending.values()) g.hold = false;
    this.pending.clear();
    this.down.clear();
    this.arrows.clear();
    this.altAt = this.ctrlAt = this.shiftAt = this.escAt = this.spaceAt = null;
    this.charging = false;
  }

  private shortcut(e: KeyboardEvent, now: number): void {
    const k = e.key.toLowerCase();
    if (k === "c" && !window.getSelection()?.toString()) {
      e.preventDefault();
      void navigator.clipboard?.writeText(this.page.text()).then(() => this.toast("copied", "everything on the page"), () => {});
    } else if (k === "z") {
      e.preventDefault();
      this.undo(now);
    } else if (k === "s") {
      e.preventDefault();
      this.canvas.toBlob((b) => {
        if (!b) return;
        const a = document.createElement("a");
        a.href = URL.createObjectURL(b);
        a.download = "type.png";
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      });
    }
  }

  private pointer(e: PointerEvent): void {
    const now = performance.now();
    if (e.pointerType !== "mouse" || this.coarse) this.el.sink.focus({ preventScroll: true });
    this.page.blast(e.clientX, e.clientY, now, 0.7);
    this.find("click");
  }

  private wheel(e: WheelEvent): void {
    this.page.scrollT = clamp(this.page.scrollT - e.deltaY, 0, this.page.maxScroll);
    if (this.page.scrollT > this.page.lh * 3) this.find("scroll");
  }

  /** Soft keyboards: no key codes, just text. */
  private soft(e: InputEvent): void {
    const now = performance.now();
    e.preventDefault();
    this.lastKey = now;
    if (e.inputType === "insertText" && e.data) for (const ch of e.data) ch === " " ? this.type(" ", "Space", now) : this.type(ch, "", now);
    else if (e.inputType === "deleteContentBackward") this.backspace(now, false);
    else if (e.inputType === "insertLineBreak" || e.inputType === "insertParagraph") this.enter(now);
    for (const g of this.pending.values()) g.hold = false;
    this.pending.clear();
  }

  // ---- actions ------------------------------------------------------------

  private type(ch: string, code: string, now: number): void {
    const gap = this.lastInsert ? now - this.lastInsert : 0;
    this.lastInsert = now;
    this.page.scrollT = 0;
    this.stamps.push(now);
    const heat = clamp((this.wpm - 45) / 55, 0, 1);
    const r = this.page.insert(ch, now, { heat, gap, sw: this.sw, caps: this.caps });
    if (code) this.pending.set(code, r.g);
    this.page.land(r.g, this.sw, now, this.mm);
    this.page.kick(this.sw);
    const kick = this.sw === "thock" ? 0.05 : this.sw === "clicky" ? 0.03 : this.sw === "tactile" ? 0.04 : 0.02;
    this.zoomV += kick * this.mm * (this.caps ? 2 : 1);
    this.dipV += (this.sw === "thock" ? 40 : 14) * this.mm * (this.caps ? 2.5 : 1);
    if (r.morph) this.find(r.morph === "digit" ? "digits" : r.morph);
    for (const s of r.spans) this.find(s);
    if (ch === " " || /[.,!?;:]/.test(ch)) this.wordDone(now);
    this.dirty = true;
  }

  private wordDone(now: number): void {
    const text = this.page.active.g.map((g) => g.ch).join("");
    const word = (/([\p{L}]+)[^\p{L}]*$/u.exec(text)?.[1] ?? "").toLowerCase();
    const sw = SOUNDS[word];
    if (sw) {
      this.setSwitch(sw, now, false);
      this.board.wave(now, null, { speed: 18 });
      this.find("say");
    }
    if (word === "qwerty") {
      this.board.wave(now, "KeyQ", { row: 2, speed: 16 });
      this.find("qwerty");
    }
    const letters = new Set(text.toLowerCase().replace(/[^a-z]/g, ""));
    if (letters.size === 26) {
      this.board.wave(now, null, { speed: 12, amp: 1 });
      this.find("pangram");
    }
  }

  private enter(now: number): void {
    this.wordDone(now);
    this.page.enter();
    this.page.scrollT = 0;
    this.zoomV -= 0.16 * this.mm;
    this.dipV -= 60 * this.mm;
    this.lastInsert = now;
    this.dirty = true;
  }

  private backspace(now: number, repeat: boolean): void {
    if (!repeat) this.bsAt = now;
    const held = repeat && this.bsAt !== null ? now - this.bsAt : 0;
    const burst = held > 2200 ? 4 : held > 1100 ? 2 : 1;
    if (this.page.backspace(now, burst)) {
      this.dirty = true;
      this.page.scrollT = 0;
    }
  }

  private setSwitch(sw: Switch, now: number, say: boolean): void {
    if (sw === this.sw && !say) return;
    this.sw = sw;
    this.board.wave(now, "Tab", { speed: 26 });
    this.toast(sw, SWITCH_NOTE[sw], true);
    if (say) this.find("switch");
    this.dirty = true;
  }

  private cycleWay(d: number): void {
    const n = WAYS.length;
    let i = this.wayI;
    do i = (i + d + n) % n;
    while (WAYS[i].id === SECRET && !this.unlocked);
    this.setWay(i);
    this.find("color");
  }

  private setWay(i: number): void {
    this.wayFrom = this.way;
    this.wayI = i;
    this.wayT = 0;
    this.applyCss();
    this.toast(WAYS[i].id, "colorway", true);
    this.dirty = true;
  }

  private clear(now: number): void {
    if (this.page.isEmpty()) return;
    save(UNDO, this.page.clear(now));
    this.zoomV -= 0.2 * this.mm;
    this.dirty = true;
  }

  private undo(now: number): void {
    const prev = load<string[][]>(UNDO);
    if (!prev) return;
    const cur = this.page.isEmpty() ? null : this.page.serialize();
    this.page.load(prev);
    if (cur) save(UNDO, cur);
    else
      try {
        localStorage.removeItem(UNDO);
      } catch {
        /* nothing to forget */
      }
    this.board.wave(now, "KeyZ", {});
    this.find("undo");
    this.dirty = true;
  }

  private kro(now: number): void {
    const n = [...this.down.keys()].filter((c) => this.board.get(c)).length;
    if (n > this.kroMax) this.kroMax = n;
    if (n >= 4) this.find("kro4");
    if (n >= 6) this.find("kro6");
    if (n >= 10) {
      if (this.find("kro10")) this.board.wave(now, null, { speed: 14 });
    }
  }

  private konamiStep(code: string, now: number): void {
    this.konami.push(code);
    if (this.konami.length > KONAMI.length) this.konami.shift();
    if (this.konami.join() === KONAMI.join()) {
      this.unlocked = true;
      this.find("gold");
      this.setWay(WAYS.findIndex((w) => w.id === SECRET));
      this.board.wave(now, null, { speed: 10, amp: 1 });
    }
  }

  private checkTested(now: number): void {
    const letters = this.board.keys.filter((k) => k.code.startsWith("Key"));
    if (letters.every((k) => k.tested)) this.find("alphabet");
    if (this.board.fRow().every((k) => k.tested)) this.find("fkeys");
    if (this.board.mainBlock().every((k) => k.tested)) {
      if (this.find("everykey")) this.board.wave(now, null, { speed: 9, amp: 1 });
    }
  }

  // ---- finds, toasts, hints, help -----------------------------------------

  private find(id: string): boolean {
    if (this.finds.has(id) || !findById(id)) return false;
    this.finds.add(id);
    this.lastFind = performance.now();
    this.toast("found", findById(id)!.text, false, `${this.finds.size}/${FIND_COUNT}`);
    this.dirty = true;
    return true;
  }

  private toast(tag: string, text: string, quiet = false, count = ""): void {
    const box = this.el.toasts;
    if (quiet) for (const t of [...box.children]) if ((t as HTMLElement).dataset.quiet) t.remove();
    const t = document.createElement("div");
    t.className = "toast";
    if (quiet) t.dataset.quiet = "1";
    const em = document.createElement("em");
    em.textContent = tag;
    const span = document.createElement("span");
    span.textContent = text;
    t.append(em, span);
    if (count) {
      const sm = document.createElement("small");
      sm.textContent = count;
      t.append(sm);
    }
    box.append(t);
    while (box.children.length > 3) box.firstElementChild?.remove();
    setTimeout(() => t.classList.add("out"), quiet ? 1400 : 2800);
    setTimeout(() => t.remove(), quiet ? 1750 : 3150);
  }

  private hints(now: number): void {
    const el = this.el.hint;
    if (el.classList.contains("on") && now - this.hintAt > 6000) el.classList.remove("on");
    const typing = now - this.lastKey < 8000;
    const quiet = now - Math.max(this.lastFind, this.hintAt) > 35000;
    if (!typing || !quiet || this.zen || now < 25000) return;
    const left = FINDS.filter((f) => f.hint && !this.finds.has(f.id));
    if (!left.length) return;
    const f = left[Math.floor(Math.random() * left.length)];
    el.textContent = `psst · ${f.hint}`;
    el.classList.add("on");
    this.hintAt = now;
  }

  private help(open: boolean): void {
    const el = this.el.help;
    if (!open) {
      el.hidden = true;
      return;
    }
    const keys: [string, string][] = [
      ["letters", "print. hold longer, print heavier. hold past a beat to stamp"],
      ["space", "hold it, then let go"],
      ["enter", "new line"],
      ["backspace", "plucks letters off. hold to speed up"],
      ["delete", "strikes the last word"],
      ["arrows", "move the lamp"],
      ["shift", "tap it on its own"],
      ["caps lock", "shout"],
      ["tab", "swap the switch feel"],
      ["alt", "hold: x-ray of your rhythm"],
      ["ctrl", "hold: the page's key layer"],
      ["page up / down", "colorway"],
      ["home / end", "read back / come back"],
      ["hold esc", "clear the page. ctrl+z brings it back"],
      ["ctrl+c / ctrl+s", "copy the text / save a picture"],
      ["f2 / f3", "keyboard / zen"]
    ];
    const marks: [string, string][] = [
      ["# ", "headline"], ["- ", "list"], ["> ", "quote"], ["*a* **b**", "lean, bold"], ["~a~ _b_", "wobble, underline"],
      ["(a)", "whisper"], ['"a"', "quote marks"], ["-- -> ...", "— → …"], [":) <3", "you'll see"]
    ];
    const sheet = document.createElement("div");
    sheet.className = "sheet";
    const h2 = document.createElement("h2");
    h2.textContent = "type · every key does something";
    const dl = (rows: [string, string][]) => {
      const d = document.createElement("dl");
      for (const [a, b] of rows) {
        const dt = document.createElement("dt");
        dt.textContent = a;
        const dd = document.createElement("dd");
        dd.textContent = b;
        d.append(dt, dd);
      }
      return d;
    };
    const colA = document.createElement("div");
    const h3a = document.createElement("h3");
    h3a.textContent = "keys";
    colA.append(h3a, dl(keys));
    const colB = document.createElement("div");
    const h3b = document.createElement("h3");
    h3b.textContent = "as you type";
    const h3c = document.createElement("h3");
    h3c.textContent = `found ${this.finds.size} of ${FIND_COUNT}`;
    const ul = document.createElement("ul");
    for (const f of FINDS) {
      const li = document.createElement("li");
      const got = this.finds.has(f.id);
      li.textContent = got ? f.text : "· · ·";
      if (!got) li.className = "no";
      ul.append(li);
    }
    colB.append(h3b, dl(marks), h3c, ul);
    const tested = this.board.mainBlock().filter((k) => k.tested).length;
    const foot = document.createElement("p");
    foot.className = "foot";
    foot.textContent = `${tested} of ${this.board.mainBlock().length} keys tested · best rollover ${this.kroMax} · nothing leaves this browser · esc to close`;
    sheet.append(h2, colA, colB, foot);
    el.replaceChildren(sheet);
    el.hidden = false;
  }

  private readout(now: number): void {
    if (now - this.readAt < 220) return;
    this.readAt = now;
    const parts: [string, string, string?][] = [
      [String(Math.round(this.wpm)), "wpm", this.wpm > 80 ? "hot" : ""],
      [this.sw, "", ""],
      [String(this.kroMax), "kro", "opt"],
      [`${this.finds.size}/${FIND_COUNT}`, "found", ""]
    ];
    const html = parts
      .map(([v, l, c]) => `<span class="${c ?? ""}"><i>${v}</i>${l}</span>`)
      .join("");
    if (this.el.read.innerHTML !== html) this.el.read.innerHTML = html;
    this.el.hud.classList.toggle("quiet", now - this.lastKey < 1500 && !this.zen);
  }

  // ---- loop ---------------------------------------------------------------

  private frame(t: number): void {
    requestAnimationFrame((n) => this.frame(n));
    const now = t;
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    try {
      this.step(now, dt);
      this.render(now, dt);
    } catch (err) {
      console.error(err);
    }
  }

  private step(now: number, dt: number): void {
    // Lamp.
    if (this.arrows.size) {
      if (this.arrows.has("ArrowLeft")) this.az -= 1.8 * dt;
      if (this.arrows.has("ArrowRight")) this.az += 1.8 * dt;
      if (this.arrows.has("ArrowUp")) this.alt = clamp(this.alt + 0.7 * dt, 0.05, 0.95);
      if (this.arrows.has("ArrowDown")) this.alt = clamp(this.alt - 0.7 * dt, 0.05, 0.95);
      this.dirty = true;
    }
    // Springs: page lift, camera zoom, page dip.
    const zt = 1 + 0.022 * clamp((this.wpm - 30) / 70, 0, 1) * this.mm;
    const n = Math.ceil(dt / 0.006);
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      this.liftV += (-90 * this.lift - 9 * this.liftV) * h;
      this.lift += this.liftV * h;
      this.zoomV += (-70 * (this.zoom - zt) - 15 * this.zoomV) * h;
      this.zoom += this.zoomV * h;
      this.dipV += (-700 * this.dip - 30 * this.dipV) * h;
      this.dip += this.dipV * h;
    }

    if (this.wayT < 1) this.wayT = Math.min(1, this.wayT + dt / 0.6);

    // Pace over the last five seconds.
    while (this.stamps.length && now - this.stamps[0] > 5000) this.stamps.shift();
    const span = this.stamps.length > 1 ? Math.max(1500, now - this.stamps[0]) : 5000;
    const inst = this.stamps.length > 4 ? (this.stamps.length / 5) * (60000 / span) : 0;
    this.wpm += (inst - this.wpm) * Math.min(1, dt * 3);
    if (this.stamps.length >= 15) {
      if (inst >= 80) this.find("wpm80");
      if (inst >= 100) this.find("wpm100");
      if (inst >= 120) this.find("wpm120");
    }

    if (this.escAt !== null && now - this.escAt > 900) {
      this.escAt = null;
      this.clear(now);
    }
    if (this.altAt !== null && now - this.altAt > 600) this.find("xray");
    if (this.ctrlAt !== null && now - this.ctrlAt > 700) this.find("layer");

    // The board idles with an occasional breath.
    if (now - this.lastKey > 9000 && Math.random() < dt * 0.12) {
      const ks = this.board.keys;
      this.board.wave(now, ks[Math.floor(Math.random() * ks.length)].code, { speed: 9, amp: 0.45 });
    }
    this.board.update(dt, now, this.sw);
    const reserve = Math.round(this.board.reserve(this.H));
    if (reserve !== this.reserved) {
      this.reserved = reserve;
      this.layout();
    }

    this.hints(now);
    this.readout(now);
    if (this.dirty && now - this.savedAt > 700) this.persist(now);
  }

  private persist(now: number): void {
    this.savedAt = now;
    this.dirty = false;
    const counts: Record<string, number> = {};
    for (const k of this.board.keys) if (k.count) counts[k.code] = k.count;
    save(KEY, {
      doc: this.page.serialize(),
      way: WAYS[this.wayI].id,
      sw: this.sw,
      finds: [...this.finds],
      tested: this.board.keys.filter((k) => k.tested).map((k) => k.code),
      counts,
      az: this.az,
      alt: this.alt,
      board: this.board.want,
      zen: this.zen
    } satisfies Saved);
  }

  private render(now: number, dt: number): void {
    const { ctx, lctx, dpr } = this;
    const way = this.way;
    const lx = Math.cos(this.az);
    const ly = Math.sin(this.az);

    // Desk and lamp.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    this.desk(way, lx, ly);

    // The page, drawn on its own layer so it can cast one shadow.
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.clearRect(0, 0, this.layer.width, this.layer.height);
    lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const layer: Layer = this.ctrlAt !== null && now - this.ctrlAt > 180 ? "ctrl" : this.shiftAt !== null && now - this.shiftAt > 120 ? "shift" : "base";
    const xray = this.altAt !== null && now - this.altAt > 150;
    this.page.draw(lctx, dpr, now, dt, {
      way, sw: this.sw, xray, caps: this.caps, mm: this.mm,
      charge: this.charging && this.spaceAt !== null ? clamp((now - this.spaceAt - 260) / 1100, 0, 1) : 0,
      esc: this.escAt !== null ? clamp((now - this.escAt) / 900, 0, 1) : 0,
      idle: now - this.lastKey,
      font: this.font
    });

    const up = Math.max(0, this.lift);
    const len = 0.8 + (1 - this.alt) * 4.5 + up * 22;
    ctx.shadowColor = way.dark ? `rgba(0,0,0,${0.55 + up * 0.3})` : `rgba(70,50,25,${0.13 + up * 0.12})`;
    ctx.shadowBlur = (0.6 + (1 - this.alt) * 1.6 + up * 14) * dpr;
    ctx.shadowOffsetX = -lx * len * dpr;
    ctx.shadowOffsetY = -ly * len * dpr;
    const z = this.mm ? this.zoom : 1;
    const liftUp = Math.max(0, this.lift) * 6;
    if (Math.abs(z - 1) > 0.0005 || Math.abs(this.dip) > 0.05 || liftUp > 0.05) {
      const fx = this.page.caret.x * dpr;
      const fy = this.page.caret.y * dpr;
      ctx.setTransform(z, 0, 0, z, fx - fx * z, fy - fy * z + (this.dip - liftUp) * dpr);
    }
    ctx.drawImage(this.layer, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // The twin.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.board.draw(ctx, way, now, { lx, ly, layer, xray, caps: this.caps, sw: this.sw, font: this.font });
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Grain over everything, very faint.
    if (!this.grain) this.grain = this.makeGrain();
    if (this.grain) {
      ctx.globalAlpha = way.dark ? 0.05 : 0.045;
      ctx.fillStyle = this.grain;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.globalAlpha = 1;
    }
  }

  private desk(way: Way, lx: number, ly: number): void {
    const { ctx, dpr, W, H } = this;
    const key = `${way.id}|${W}|${H}|${this.wayT}`;
    if (!this.bg || this.bg.key !== key || this.wayT < 1) {
      const c = this.bg?.c ?? document.createElement("canvas");
      c.width = Math.max(1, Math.round(W / 4));
      c.height = Math.max(1, Math.round(H / 4));
      const x = c.getContext("2d")!;
      const g = x.createLinearGradient(0, 0, 0, c.height);
      g.addColorStop(0, rgb(way.desk));
      g.addColorStop(1, rgb(way.desk2));
      x.fillStyle = g;
      x.fillRect(0, 0, c.width, c.height);
      this.bg = { key, c };
    }
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.bg.c, 0, 0, this.canvas.width, this.canvas.height);
    // The lamp's pool of light, opposite the shadows.
    const reach = Math.max(W, H);
    const px = (W / 2 + lx * W * 0.45 * (1 - this.alt * 0.6)) * dpr;
    const py = (H * 0.4 + ly * H * 0.55 * (1 - this.alt * 0.6)) * dpr;
    const r = reach * (0.55 + this.alt * 0.5) * dpr;
    const g = ctx.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, rgb(way.lamp, way.dark ? 0.11 : 0.5));
    g.addColorStop(0.5, rgb(way.lamp, way.dark ? 0.035 : 0.16));
    g.addColorStop(1, rgb(way.lamp, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private makeGrain(): CanvasPattern | null {
    const c = document.createElement("canvas");
    c.width = c.height = 160;
    const x = c.getContext("2d")!;
    const img = x.createImageData(160, 160);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() < 0.5 ? 0 : 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = Math.random() * 255;
    }
    x.putImageData(img, 0, 0);
    return this.ctx.createPattern(c, "repeat");
  }

  /** Read-only state for tests, behind ?probe. */
  probe(): Record<string, unknown> {
    return {
      text: this.page.text(),
      sw: this.sw,
      way: WAYS[this.wayI].id,
      finds: [...this.finds],
      kro: this.kroMax,
      board: this.board.want,
      tested: this.board.keys.filter((k) => k.tested).length,
      az: this.az,
      caps: this.caps
    };
  }
}
