/**
 * The twin. A keyboard drawn under the page that mirrors the one under
 * your hands: every key you press travels down on its own spring, rings
 * out the way your switch sounds, and remembers it was tested. Legends
 * start faint and fill in as you press them.
 */
import { type Way, type RGB, rgb, mix } from "./colorways";

export type Switch = "thock" | "tactile" | "clicky" | "linear";
type Kind = "alpha" | "mod" | "hot";
export type Layer = "base" | "shift" | "ctrl";

export interface Key {
  code: string;
  x: number;
  y: number;
  w: number;
  kind: Kind;
  label: string;
  shift: string;
  travel: number;
  vel: number;
  down: boolean;
  last: number;
  count: number;
  tested: boolean;
}

interface Ring {
  x: number;
  y: number;
  t: number;
  r0: number;
  r1: number;
  dur: number;
  a: number;
  w: number;
}

interface Wave {
  t: number;
  x: number;
  y: number;
  speed: number;
  row: number | null;
  amp: number;
}

const MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

const SHIFTED: Record<string, string> = {
  Backquote: "~", Digit1: "!", Digit2: "@", Digit3: "#", Digit4: "$", Digit5: "%", Digit6: "^", Digit7: "&",
  Digit8: "*", Digit9: "(", Digit0: ")", Minus: "_", Equal: "+", BracketLeft: "{", BracketRight: "}",
  Backslash: "|", Semicolon: ":", Quote: '"', Comma: "<", Period: ">", Slash: "?"
};

const BASE: Record<string, string> = {
  Backquote: "`", Minus: "-", Equal: "=", BracketLeft: "[", BracketRight: "]", Backslash: "\\",
  Semicolon: ";", Quote: "'", Comma: ",", Period: ".", Slash: "/"
};

/** What each key does while ctrl is held: the page's own layer. */
export const CTRL_LAYER: Record<string, string> = {
  KeyC: "copy", KeyZ: "undo", KeyS: "save", Escape: "hold:clear", Tab: "switch", PageUp: "color", PageDown: "color",
  ArrowUp: "light", ArrowDown: "light", ArrowLeft: "light", ArrowRight: "light", AltLeft: "x-ray", AltRight: "x-ray",
  Delete: "strike", F1: "help", F2: "board", F3: "zen", Home: "top", End: "back", Space: "hold", Enter: "line",
  Backspace: "erase", ShiftLeft: "tap:lift", ShiftRight: "tap:lift", CapsLock: "shout"
};

const MOD_NAMES: Record<string, string> = {
  Escape: "esc", Backspace: "back", Tab: "tab", CapsLock: "caps", Enter: "enter", ShiftLeft: "shift",
  ShiftRight: "shift", ControlLeft: "ctrl", ControlRight: "ctrl", MetaLeft: MAC ? "cmd" : "win",
  AltLeft: MAC ? "opt" : "alt", AltRight: MAC ? "opt" : "alt", Space: "", Delete: "del", Home: "home",
  PageUp: "pg up", PageDown: "pg dn", End: "end", ArrowUp: "", ArrowDown: "", ArrowLeft: "", ArrowRight: ""
};

/** A 75% board, 16 units wide. [code, width] per row; null is a gap. */
const ROWS: (readonly [string | null, number])[][] = [
  [["Escape", 1], [null, 0.5], ["F1", 1], ["F2", 1], ["F3", 1], ["F4", 1], [null, 0.5], ["F5", 1], ["F6", 1], ["F7", 1],
    ["F8", 1], [null, 0.5], ["F9", 1], ["F10", 1], ["F11", 1], ["F12", 1], [null, 0.5], ["Delete", 1]],
  [["Backquote", 1], ["Digit1", 1], ["Digit2", 1], ["Digit3", 1], ["Digit4", 1], ["Digit5", 1], ["Digit6", 1],
    ["Digit7", 1], ["Digit8", 1], ["Digit9", 1], ["Digit0", 1], ["Minus", 1], ["Equal", 1], ["Backspace", 2], ["Home", 1]],
  [["Tab", 1.5], ["KeyQ", 1], ["KeyW", 1], ["KeyE", 1], ["KeyR", 1], ["KeyT", 1], ["KeyY", 1], ["KeyU", 1], ["KeyI", 1],
    ["KeyO", 1], ["KeyP", 1], ["BracketLeft", 1], ["BracketRight", 1], ["Backslash", 1.5], ["PageUp", 1]],
  [["CapsLock", 1.75], ["KeyA", 1], ["KeyS", 1], ["KeyD", 1], ["KeyF", 1], ["KeyG", 1], ["KeyH", 1], ["KeyJ", 1],
    ["KeyK", 1], ["KeyL", 1], ["Semicolon", 1], ["Quote", 1], ["Enter", 2.25], ["PageDown", 1]],
  [["ShiftLeft", 2.25], ["KeyZ", 1], ["KeyX", 1], ["KeyC", 1], ["KeyV", 1], ["KeyB", 1], ["KeyN", 1], ["KeyM", 1],
    ["Comma", 1], ["Period", 1], ["Slash", 1], ["ShiftRight", 1.75], ["ArrowUp", 1], ["End", 1]],
  [["ControlLeft", 1.25], ["MetaLeft", 1.25], ["AltLeft", 1.25], ["Space", 6.25], ["AltRight", 1], ["ControlRight", 1],
    [null, 1], ["ArrowLeft", 1], ["ArrowDown", 1], ["ArrowRight", 1]]
];

const W_UNITS = 16;
const H_UNITS = 6.25;

/** Spring feel per switch: stiffness, damping, how far it bottoms out. */
const FEEL: Record<Switch, { k: number; d: number; over: number }> = {
  thock: { k: 520, d: 21, over: 0.16 },
  tactile: { k: 760, d: 30, over: 0.08 },
  clicky: { k: 1500, d: 38, over: 0.04 },
  linear: { k: 820, d: 54, over: 0 }
};

const legendOf = (code: string): string => {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code in BASE) return BASE[code];
  if (/^F\d+$/.test(code)) return code.toLowerCase();
  return MOD_NAMES[code] ?? code.toLowerCase();
};

const kindOf = (code: string): Kind => {
  if (code === "Escape" || code === "Enter") return "hot";
  if (code.startsWith("Key") || code.startsWith("Digit") || code in BASE || code === "Space") return "alpha";
  return "mod";
};

export class Board {
  keys: Key[] = [];
  private byCode = new Map<string, Key>();
  private rings: Ring[] = [];
  private waves: Wave[] = [];
  u = 0;
  ox = 0;
  oy = 0;
  top = 0;
  /** 0 hidden, 1 shown; eased. */
  shown = 1;
  want = true;
  private moving = new Set<Key>();

  constructor(tested: string[], counts: Record<string, number>) {
    const seen = new Set(tested);
    ROWS.forEach((row, r) => {
      let x = 0;
      const y = r === 0 ? 0 : r + 0.25;
      for (const [code, w] of row) {
        if (code) {
          const k: Key = {
            code, x, y, w, kind: kindOf(code), label: legendOf(code), shift: SHIFTED[code] ?? "",
            travel: 0, vel: 0, down: false, last: -1e9, count: counts[code] ?? 0, tested: seen.has(code)
          };
          this.keys.push(k);
          this.byCode.set(code, k);
        }
        x += w;
      }
    });
    // ArrowUp sits at 14 in a 75% board; the row math above already put it there.
    void this.useLayoutMap();
  }

  /** Where the OS knows the real layout (Chromium), use its legends. */
  private async useLayoutMap(): Promise<void> {
    const kb = (navigator as unknown as { keyboard?: { getLayoutMap?: () => Promise<Map<string, string>> } }).keyboard;
    if (!kb?.getLayoutMap) return;
    try {
      const map = await kb.getLayoutMap();
      for (const k of this.keys) {
        const v = map.get(k.code);
        if (v && k.kind !== "mod" && k.code !== "Space" && k.code !== "Enter" && k.code !== "Escape") {
          k.label = v.toUpperCase();
          if (k.code.startsWith("Key")) k.shift = "";
        }
      }
    } catch {
      /* keep the US legends */
    }
  }

  get(code: string): Key | undefined {
    return this.byCode.get(code);
  }

  /** Main typing block (everything but the F row): what "every key works" counts. */
  mainBlock(): Key[] {
    return this.keys.filter((k) => k.y > 0);
  }

  fRow(): Key[] {
    return this.keys.filter((k) => /^F\d+$/.test(k.code));
  }

  place(w: number, h: number): void {
    const room = Math.min(w - 40, 980);
    this.u = Math.max(18, Math.min(room / W_UNITS, (h * 0.3) / H_UNITS, 58));
    const bw = this.u * W_UNITS;
    this.ox = Math.round((w - bw) / 2);
    this.oy = Math.round(h - this.u * H_UNITS - Math.max(26, this.u * 0.75));
    this.top = this.oy - this.u * 0.45;
  }

  /** Height the board takes from the bottom of the screen, eased by shown. */
  reserve(h: number): number {
    return (h - this.top) * this.shown;
  }

  press(code: string, now: number, sw: Switch): Key | undefined {
    const k = this.byCode.get(code);
    if (!k) return undefined;
    k.down = true;
    k.last = now;
    k.count++;
    k.tested = true;
    k.vel += 9 + FEEL[sw].over * 30;
    this.moving.add(k);
    this.ring(k, now, sw);
    return k;
  }

  release(code: string, now: number): void {
    const k = this.byCode.get(code);
    if (!k) return;
    k.down = false;
    k.last = now;
    this.moving.add(k);
  }

  releaseAll(now: number): void {
    for (const k of this.keys) if (k.down) this.release(k.code, now);
  }

  /** The switch's sound, drawn: how a ring leaves the key. */
  private ring(k: Key, now: number, sw: Switch): void {
    const { cx, cy } = this.center(k);
    const u = this.u;
    if (sw === "thock") this.rings.push({ x: cx, y: cy, t: now, r0: u * 0.3, r1: u * 1.9, dur: 520, a: 0.22, w: u * 0.12 });
    else if (sw === "tactile") this.rings.push({ x: cx, y: cy, t: now, r0: u * 0.3, r1: u * 1.15, dur: 300, a: 0.2, w: u * 0.06 });
    else if (sw === "clicky") {
      this.rings.push({ x: cx, y: cy, t: now, r0: u * 0.25, r1: u * 0.85, dur: 150, a: 0.45, w: u * 0.035 });
      this.rings.push({ x: cx, y: cy, t: now + 40, r0: u * 0.25, r1: u * 1.05, dur: 170, a: 0.3, w: u * 0.03 });
    }
  }

  center(k: Key): { cx: number; cy: number } {
    return { cx: this.ox + (k.x + k.w / 2) * this.u, cy: this.oy + (k.y + 0.5) * this.u };
  }

  /** Light runs across the board from a key, a row, or the middle. */
  wave(now: number, from: string | null, opts: { row?: number; speed?: number; amp?: number } = {}): void {
    const k = from ? this.byCode.get(from) : undefined;
    const x = k ? k.x + k.w / 2 : W_UNITS / 2;
    const y = k ? k.y + 0.5 : H_UNITS / 2;
    this.waves.push({ t: now, x: opts.row !== undefined ? 0 : x, y, speed: opts.speed ?? 22, row: opts.row ?? null, amp: opts.amp ?? 1 });
  }

  busy(): boolean {
    return this.moving.size > 0 || this.rings.length > 0 || this.waves.length > 0;
  }

  update(dt: number, now: number, sw: Switch): void {
    const f = FEEL[sw];
    const n = Math.ceil(dt / 0.005);
    const h = dt / n;
    for (const k of this.moving) {
      const target = k.down ? 1 : 0;
      for (let i = 0; i < n; i++) {
        k.vel += (-f.k * (k.travel - target) - f.d * k.vel) * h;
        k.travel += k.vel * h;
        if (k.travel > 1 + f.over) {
          k.travel = 1 + f.over;
          k.vel = -Math.abs(k.vel) * 0.25;
        }
      }
      if (k.travel < -0.04) k.travel = -0.04;
      if (Math.abs(k.travel - target) < 0.002 && Math.abs(k.vel) < 0.02) {
        k.travel = target;
        k.vel = 0;
        if (!k.down) this.moving.delete(k);
      }
    }
    this.rings = this.rings.filter((r) => now - r.t < r.dur);
    this.waves = this.waves.filter((w) => now - w.t < 2400);
    const want = this.want ? 1 : 0;
    this.shown += (want - this.shown) * Math.min(1, dt * 7);
    if (Math.abs(this.shown - want) < 0.002) this.shown = want;
  }

  private waveAt(k: Key, now: number): number {
    let g = 0;
    for (const w of this.waves) {
      const age = (now - w.t) / 1000;
      if (age < 0) continue;
      if (w.row !== null && Math.round(k.y - 0.25) !== w.row && !(w.row === 0 && k.y === 0)) continue;
      const d = w.row !== null ? k.x + k.w / 2 : Math.hypot(k.x + k.w / 2 - w.x, (k.y + 0.5 - w.y) * 1.2);
      const front = age * w.speed;
      const e = front - d;
      if (e < -1.5 || e > 4) continue;
      g = Math.max(g, w.amp * Math.exp(-(e * e) / 1.4) * Math.max(0, 1 - age / 2.4));
    }
    return g;
  }

  draw(
    ctx: CanvasRenderingContext2D,
    way: Way,
    now: number,
    o: { lx: number; ly: number; layer: Layer; xray: boolean; caps: boolean; sw: Switch; font: (w: number, px: number) => string }
  ): void {
    if (this.shown <= 0.001) return;
    const u = this.u;
    const lift = (1 - this.shown) * u * 2.5;
    ctx.save();
    ctx.globalAlpha = this.shown;
    ctx.translate(0, lift);

    // The case.
    const pad = u * 0.42;
    const cx0 = this.ox - pad;
    const cy0 = this.oy - pad;
    const cw = W_UNITS * u + pad * 2;
    const ch = H_UNITS * u + pad * 2;
    ctx.shadowColor = way.dark ? "rgba(0,0,0,0.55)" : "rgba(70,55,35,0.25)";
    ctx.shadowBlur = u * 0.9;
    ctx.shadowOffsetX = -o.lx * u * 0.25;
    ctx.shadowOffsetY = -o.ly * u * 0.25 + u * 0.2;
    ctx.fillStyle = rgb(way.plate);
    rr(ctx, cx0, cy0, cw, ch, u * 0.32);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.strokeStyle = rgb(way.edge);
    ctx.lineWidth = 1;
    rr(ctx, cx0 + 0.5, cy0 + 0.5, cw - 1, ch - 1, u * 0.32);
    ctx.stroke();

    // Rings sit on the plate, under the caps.
    for (const r of this.rings) {
      const p = (now - r.t) / r.dur;
      if (p < 0) continue;
      const e = 1 - (1 - p) ** 3;
      ctx.globalAlpha = this.shown * r.a * (1 - p);
      ctx.strokeStyle = rgb(way.accent);
      ctx.lineWidth = Math.max(0.6, r.w * (1 - p));
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * e, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = this.shown;

    let maxCount = 1;
    if (o.xray) for (const k of this.keys) maxCount = Math.max(maxCount, k.count);

    const gap = u * 0.06;
    const depth = u * 0.13;
    for (const k of this.keys) {
      const wv = this.waveAt(k, now);
      const t = Math.max(k.travel, wv * 0.55);
      const fx = this.ox + k.x * u + gap;
      const fy = this.oy + k.y * u + gap;
      const fw = k.w * u - gap * 2;
      const fh = u - gap * 2;
      const side = k.kind === "alpha" ? way.alphaSide : k.kind === "hot" ? way.hotSide : way.modSide;
      const topC = k.kind === "alpha" ? way.alpha : k.kind === "hot" ? way.hot : way.mod;
      const legC = k.kind === "alpha" ? way.alphaLeg : k.kind === "hot" ? way.hotLeg : way.modLeg;
      const sink = t * depth * 0.75;

      // Shadow on the plate, shorter as the key goes down.
      ctx.fillStyle = way.dark ? "rgba(0,0,0,0.45)" : "rgba(60,45,25,0.16)";
      rr(ctx, fx - o.lx * u * 0.07 * (1 - t * 0.7), fy + sink - o.ly * u * 0.07 * (1 - t * 0.7) + u * 0.03, fw, fh, u * 0.13);
      ctx.fill();
      // Skirt.
      ctx.fillStyle = rgb(side);
      rr(ctx, fx, fy + sink * 0.6, fw, fh - sink * 0.6, u * 0.13);
      ctx.fill();
      // Top.
      const ins = u * 0.085;
      const tx = fx + ins;
      const ty = fy + u * 0.035 + sink;
      const tw = fw - ins * 2;
      const th = fh - u * 0.2;
      const glow = k.down ? 1 : Math.exp(-(now - k.last) / 420);
      const lit = Math.max(glow * 0.9, wv);
      ctx.fillStyle = rgb(topC);
      rr(ctx, tx, ty, tw, th, u * 0.1);
      ctx.fill();
      // The edge the lamp catches.
      const hi = mix(topC, [255, 255, 255], way.dark ? 0.13 : 0.6);
      ctx.fillStyle = rgb(hi, 0.9);
      if (o.ly < 0.2) ctx.fillRect(tx + u * 0.08, ty + 0.5, tw - u * 0.16, Math.max(1, u * 0.025));
      if (o.lx < -0.3) ctx.fillRect(tx + 0.5, ty + u * 0.08, Math.max(1, u * 0.025), th - u * 0.16);
      if (o.lx > 0.3) ctx.fillRect(tx + tw - 0.5 - Math.max(1, u * 0.025), ty + u * 0.08, Math.max(1, u * 0.025), th - u * 0.16);
      if (o.xray && k.count > 0) {
        ctx.fillStyle = rgb(way.accent, 0.15 + 0.6 * Math.sqrt(k.count / maxCount));
        rr(ctx, tx, ty, tw, th, u * 0.1);
        ctx.fill();
      }
      if (lit > 0.01) {
        ctx.fillStyle = rgb(k.kind === "hot" ? way.accent2 : way.accent, lit * (k.kind === "hot" ? 0.3 : 0.35));
        rr(ctx, tx, ty, tw, th, u * 0.1);
        ctx.fill();
      }

      // Legend.
      let label = k.label;
      let layered = false;
      if (o.layer === "shift" && k.shift) label = k.shift;
      if (o.layer === "ctrl" && CTRL_LAYER[k.code]) {
        label = CTRL_LAYER[k.code];
        layered = true;
      }
      if (k.code === "Tab" && o.layer === "base") label = `tab · ${o.sw}`;
      if (k.code === "CapsLock" && o.caps) label = "CAPS";
      const legA = k.tested || layered ? 1 : 0.32;
      const lc: RGB = layered ? way.accent : lit > 0.01 ? mix(legC, k.kind === "hot" ? legC : way.accent, Math.min(1, lit)) : legC;
      ctx.fillStyle = rgb(lc, legA);
      if (k.code.startsWith("Arrow")) {
        arrow(ctx, tx + tw / 2, ty + th / 2, u * 0.13, k.code);
      } else if (k.kind === "alpha" && !layered && label.length <= 2) {
        ctx.font = o.font(560, Math.round(u * 0.28));
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, tx + tw / 2, ty + th / 2 + u * 0.01);
      } else if (label) {
        ctx.font = o.font(layered ? 650 : 520, Math.max(7, Math.round(u * (layered ? 0.16 : 0.17))));
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        ctx.fillText(label, tx + u * 0.1, ty + th - u * 0.1, tw - u * 0.16);
      }
      // Homing bars.
      if ((k.code === "KeyF" || k.code === "KeyJ") && !layered) {
        ctx.fillStyle = rgb(legC, legA * 0.7);
        ctx.fillRect(tx + tw / 2 - u * 0.09, ty + th - u * 0.13, u * 0.18, Math.max(1, u * 0.025));
      }
    }
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.restore();
  }
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, rad);
}

function arrow(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, code: string): void {
  const a = code === "ArrowUp" ? -Math.PI / 2 : code === "ArrowDown" ? Math.PI / 2 : code === "ArrowLeft" ? Math.PI : 0;
  ctx.beginPath();
  ctx.moveTo(x + Math.cos(a) * s, y + Math.sin(a) * s);
  ctx.lineTo(x + Math.cos(a + 2.4) * s, y + Math.sin(a + 2.4) * s);
  ctx.lineTo(x + Math.cos(a - 2.4) * s, y + Math.sin(a - 2.4) * s);
  ctx.closePath();
  ctx.fill();
}
