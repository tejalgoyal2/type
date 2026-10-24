/**
 * The page: what you wrote, and how it moves.
 *
 * Typewriter model: the line you are on stays put and history climbs. Each
 * glyph keeps when it was born, how long its key was held and the gap
 * before it, so everything it does (landing, cooling, x-ray) is worked out
 * from its age at draw time. Light markup is read live: the marks fade to
 * ghosts and the words take the style.
 */
import { type Way, type RGB, rgb, mix } from "./colorways";
import type { Switch } from "./board";

export interface G {
  ch: string;
  born: number;
  w: number;
  dwell: number;
  gap: number;
  heat: number;
  hold?: boolean;
  stamp?: number;
  from?: string;
  jt?: number;
  jd?: number;
  tt?: number;
  tc?: number;
  strike?: number;
}

interface Para {
  g: G[];
  ver: number;
}

type Kind = "h1" | "h2" | "li" | "bq" | null;

interface Style {
  kind: Kind;
  mark: Uint8Array;
  bold: Uint8Array;
  ital: Uint8Array;
  wavy: Uint8Array;
  aside: Uint8Array;
  quoted: Uint8Array;
  /** [start, end, closing glyph index] for underlines. */
  under: [number, number, number][];
  /** For each '"', whether it opens. */
  opens: Map<number, boolean>;
  spans: { kind: string; close: number }[];
}

interface Ghost {
  ch: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  vr: number;
  t: number;
  dur: number;
  px: number;
  w: number;
  c: RGB;
  grav: number;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  dur: number;
  kind: "ember" | "tick" | "ring";
  a: number;
  r0: number;
  r1: number;
}

interface Blast {
  x: number;
  y: number;
  t: number;
  amp: number;
}

export interface DrawOpts {
  way: Way;
  sw: Switch;
  xray: boolean;
  caps: boolean;
  mm: number;
  charge: number;
  esc: number;
  idle: number;
  font: (w: number, px: number, ital?: boolean) => string;
}

const SMILE = "☺";
const WINK = "☻";
const HEART = "♥";
const RIGHT = "→";
const LEFT = "←";
const CUSTOM = new Set([SMILE, WINK, HEART, RIGHT, LEFT]);

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const easeOut = (t: number) => 1 - (1 - t) ** 3;

/** Underdamped settle from 0 to 1, overshooting a little. */
const settle = (t: number) => (t >= 1.6 ? 1 : 1 - Math.exp(-7 * t) * Math.cos(8 * t));

export const BASE_WEIGHT: Record<Switch, number> = { thock: 540, tactile: 470, clicky: 430, linear: 400 };

function parse(text: string): Style {
  const n = text.length;
  const s: Style = {
    kind: null,
    mark: new Uint8Array(n),
    bold: new Uint8Array(n),
    ital: new Uint8Array(n),
    wavy: new Uint8Array(n),
    aside: new Uint8Array(n),
    quoted: new Uint8Array(n),
    under: [],
    opens: new Map(),
    spans: []
  };
  let body = 0;
  const pre = /^(#{1,2}) /.exec(text);
  if (pre) {
    s.kind = pre[1].length === 1 ? "h1" : "h2";
    for (let i = 0; i < pre[0].length; i++) s.mark[i] = 1;
    body = pre[0].length;
    s.spans.push({ kind: "head", close: body - 1 });
  } else if (/^[-*] /.test(text)) {
    s.kind = "li";
    body = 2;
    s.spans.push({ kind: "list", close: 1 });
  } else if (/^> /.test(text)) {
    s.kind = "bq";
    s.mark[0] = 1;
    body = 2;
    s.spans.push({ kind: "quote", close: 1 });
  }
  const t = text.slice(body);
  const each = (re: RegExp, kind: string, fn: (a: number, b: number, inner0: number, inner1: number) => void) => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(t))) {
      const a = m.index + body;
      const b = a + m[0].length;
      const lead = m[0].indexOf(m[1]);
      fn(a, b, a + lead, a + lead + m[1].length);
      s.spans.push({ kind, close: b - 1 });
    }
  };
  each(/\*\*(?=\S)([^*]+?)\*\*/g, "bold", (a, b, i0, i1) => {
    for (let i = a; i < b; i++) s.mark[i] = 1;
    for (let i = i0; i < i1; i++) (s.mark[i] = 0), (s.bold[i] = 1);
  });
  each(/(?<!\*)\*(?=[^\s*])([^*]+?)\*(?!\*)/g, "italic", (a, b, i0, i1) => {
    if (s.bold[a]) return;
    s.mark[a] = 1;
    s.mark[b - 1] = 1;
    for (let i = i0; i < i1; i++) s.ital[i] = 1;
  });
  each(/~(?=\S)([^~]+?)~/g, "wavy", (a, b, i0, i1) => {
    s.mark[a] = 1;
    s.mark[b - 1] = 1;
    for (let i = i0; i < i1; i++) s.wavy[i] = 1;
  });
  each(/(?<![A-Za-z0-9])_(?=\S)([^_]+?)_(?![A-Za-z0-9])/g, "under", (a, b, i0, i1) => {
    s.mark[a] = 1;
    s.mark[b - 1] = 1;
    s.under.push([i0, i1, b - 1]);
  });
  each(/\(([^()]+)\)/g, "aside", (a, b) => {
    for (let i = a; i < b; i++) s.aside[i] = 1;
  });
  let open = true;
  let q0 = -1;
  for (let i = body; i < text.length; i++) {
    if (text[i] !== '"') continue;
    s.opens.set(i, open);
    if (open) q0 = i;
    else {
      for (let j = q0; j <= i; j++) s.quoted[j] = 1;
    }
    open = !open;
  }
  return s;
}

function wrap(text: string, cols: number): number[] {
  const starts = [0];
  let s = 0;
  const c = Math.max(4, cols);
  while (text.length - s > c) {
    let cut = s + c;
    const sp = text.lastIndexOf(" ", cut);
    if (sp > s) cut = sp + 1;
    starts.push(cut);
    s = cut;
  }
  return starts;
}

export class Page {
  paras: Para[] = [{ g: [], ver: 0 }];
  private styles = new Map<Para, { ver: number; s: Style; text: string }>();
  private wraps = new Map<Para, { ver: number; cols: number; starts: number[] }>();
  private ghosts: Ghost[] = [];
  private sparks: Spark[] = [];
  private blasts: Blast[] = [];
  scroll = 0;
  scrollT = 0;
  maxScroll = 0;

  // Geometry, set by layout().
  fs = 24;
  cw = 14;
  cols = 60;
  left = 0;
  top = 0;
  anchor = 0;
  lh = 40;

  // The caret.
  private cx = -1;
  private cy = -1;
  private cvx = 0;
  private cvy = 0;
  private squash = 0;
  private squashV = 0;
  private trail: { t: number; x: number; y: number }[] = [];
  /** Where the caret is drawn, for the camera and effects. */
  caret = { x: 0, y: 0 };

  get active(): Para {
    return this.paras[this.paras.length - 1];
  }

  private style(p: Para): { s: Style; text: string } {
    let c = this.styles.get(p);
    if (!c || c.ver !== p.ver) {
      const text = p.g.map((g) => g.ch).join("");
      c = { ver: p.ver, s: parse(text), text };
      this.styles.set(p, c);
    }
    return c;
  }

  private scaleOf(k: Kind): number {
    return k === "h1" ? 1.75 : k === "h2" ? 1.35 : 1;
  }

  private rows(p: Para, scale: number): number[] {
    const cols = Math.floor(this.cols / scale);
    let c = this.wraps.get(p);
    if (!c || c.ver !== p.ver || c.cols !== cols) {
      c = { ver: p.ver, cols, starts: wrap(this.style(p).text, cols) };
      this.wraps.set(p, c);
    }
    return c.starts;
  }

  layout(w: number, top: number, bottom: number, fs: number, measure: (px: number) => number, colMax: number): void {
    this.fs = fs;
    this.cw = measure(fs);
    this.lh = Math.round(fs * 1.62);
    const colW = Math.min(w - Math.max(32, w * 0.1), colMax, this.cw * 64);
    this.cols = Math.max(12, Math.floor(colW / this.cw));
    this.left = Math.round((w - this.cols * this.cw) / 2);
    this.top = top;
    this.anchor = Math.round(top + (bottom - top) * 0.8);
    this.wraps.clear();
  }

  // ---- editing ------------------------------------------------------------

  insert(ch: string, now: number, o: { heat: number; gap: number; sw: Switch; caps: boolean }): { g: G; morph: string | null; spans: string[] } {
    const p = this.active;
    const g: G = { ch, born: now, w: BASE_WEIGHT[o.sw] + (o.caps ? 220 : 0), dwell: 0, gap: o.gap, heat: o.heat, hold: true };
    const before = this.style(p).s.spans.length;
    p.g.push(g);
    let morph = this.morph(p, now);
    p.ver++;
    const st = this.style(p).s;
    const spans: string[] = [];
    if (st.spans.length > before) {
      const last = p.g.length - 1;
      for (const sp of st.spans) if (sp.close === last) spans.push(sp.kind);
    }
    const tail = p.g[p.g.length - 1];
    if (/\d/.test(ch)) morph = morph ?? "digit";
    if (ch === "!" || ch === "?") {
      const word = this.lastWord(p, p.g.length - 1);
      if (word.length) {
        const mid = (word.length - 1) / 2;
        word.forEach((wg, i) => {
          if (ch === "!") {
            wg.jt = now;
            wg.jd = i;
          } else {
            wg.tt = now;
            wg.tc = i - mid;
          }
        });
        morph = morph ?? (ch === "!" ? "jump" : "tilt");
      }
    }
    return { g: tail, morph, spans };
  }

  /** The glyphs of the word right before index i (exclusive). */
  private lastWord(p: Para, i: number): G[] {
    let e = i;
    while (e > 0 && !/[\p{L}\p{N}]/u.test(p.g[e - 1].ch)) e--;
    let s = e;
    while (s > 0 && /[\p{L}\p{N}'’]/u.test(p.g[s - 1].ch)) s--;
    return p.g.slice(s, e);
  }

  /** Two or three keystrokes that become one character. */
  private morph(p: Para, now: number): string | null {
    const g = p.g;
    const n = g.length;
    if (n < 2) return null;
    const a = g[n - 2].ch;
    const b = g[n - 1].ch;
    const join = (count: number, ch: string, from: string, id: string) => {
      const keep = g[n - count];
      g.splice(n - count, count, { ...keep, ch, from, born: now, hold: false, dwell: 0 });
      return id;
    };
    if (n >= 3 && a === "." && b === "." && g[n - 3].ch === ".") return join(3, "…", "...", "dots");
    if (a === "-" && b === "-") return join(2, "—", "--", "dash");
    if (a === "-" && b === ">") return join(2, RIGHT, "->", "arrow");
    if (a === "<" && b === "-") return join(2, LEFT, "<-", "arrow");
    if (a === "—" && b === ">") return join(2, RIGHT, "—>", "arrow");
    if (a === ":" && b === ")") return join(2, SMILE, ":)", "smile");
    if (a === ";" && b === ")") return join(2, WINK, ";)", "smile");
    if (a === "<" && b === "3") return join(2, HEART, "<3", "heart");
    return null;
  }

  /** Key let go: the glyph keeps the weight the hold gave it. A long hold stamps. */
  release(g: G, dwell: number, now: number, sw: Switch): boolean {
    g.hold = false;
    g.dwell = dwell;
    g.w = this.heldWeight(g, sw, g.born + dwell);
    if (dwell > 430) {
      g.stamp = now;
      g.w = 820;
      return true;
    }
    return false;
  }

  private heldWeight(g: G, sw: Switch, now: number): number {
    const held = now - g.born;
    const base = Math.max(BASE_WEIGHT[sw], g.w);
    return clamp(base + (held - 110) * 1.1, base - 90, Math.max(base, 790));
  }

  backspace(now: number, burst: number): number {
    let removed = 0;
    for (let k = 0; k < burst; k++) {
      const p = this.active;
      if (p.g.length) {
        const i = p.g.length - 1;
        const g = p.g.pop()!;
        p.ver++;
        this.pluck(g, p, i, now);
        removed++;
      } else if (this.paras.length > 1) {
        this.paras.pop();
        removed++;
      } else break;
    }
    return removed;
  }

  private pos: Map<G, { x: number; y: number; px: number; c: RGB }> = new Map();

  private pluck(g: G, _p: Para, _i: number, now: number): void {
    const at = this.pos.get(g);
    if (!at || g.ch === " ") return;
    this.ghosts.push({
      ch: g.ch, x: at.x, y: at.y, vx: (Math.random() - 0.3) * 90, vy: -160 - Math.random() * 120, r: 0,
      vr: (Math.random() - 0.5) * 8, t: now, dur: 520, px: at.px, w: g.w, c: at.c, grav: 900
    });
  }

  enter(): void {
    this.paras.push({ g: [], ver: 0 });
  }

  /** Delete: a line through the last word. */
  strike(now: number): boolean {
    for (let pi = this.paras.length - 1; pi >= Math.max(0, this.paras.length - 2); pi--) {
      const p = this.paras[pi];
      let e = p.g.length;
      while (e > 0 && (p.g[e - 1].ch === " " || p.g[e - 1].strike)) e--;
      if (!e) continue;
      let s = e;
      while (s > 0 && p.g[s - 1].ch !== " ") s--;
      for (let i = s; i < e; i++) p.g[i].strike = now;
      p.ver++;
      return true;
    }
    return false;
  }

  blast(x: number, y: number, now: number, amp: number): void {
    this.blasts.push({ x, y, t: now, amp });
  }

  /** Everything falls off the page. Returns what was there. */
  clear(now: number): string[][] {
    const snap = this.serialize();
    for (const [g, at] of this.pos) {
      if (this.ghosts.length > 500) break;
      if (g.ch === " ") continue;
      this.ghosts.push({
        ch: g.ch, x: at.x, y: at.y, vx: (Math.random() - 0.5) * 120, vy: -Math.random() * 120, r: 0,
        vr: (Math.random() - 0.5) * 5, t: now + Math.random() * 180, dur: 1100, px: at.px, w: g.w, c: at.c, grav: 1500
      });
    }
    this.paras = [{ g: [], ver: 0 }];
    this.scrollT = 0;
    return snap;
  }

  isEmpty(): boolean {
    return this.paras.length === 1 && this.paras[0].g.length === 0;
  }

  text(): string {
    const map: Record<string, string> = { [SMILE]: ":)", [WINK]: ";)", [HEART]: "<3", [RIGHT]: "->", [LEFT]: "<-" };
    return this.paras.map((p) => p.g.map((g) => map[g.ch] ?? g.ch).join("")).join("\n");
  }

  /** Text plus one weight character per glyph. */
  serialize(): string[][] {
    return this.paras.map((p) => [
      p.g.map((g) => g.ch).join(""),
      p.g.map((g) => String.fromCharCode(97 + clamp(Math.round(g.w / 50), 0, 20))).join(""),
      p.g.map((g) => (g.strike ? "1" : "0")).join("")
    ]);
  }

  load(data: string[][]): void {
    const paras: Para[] = [];
    for (const [t, w, s] of data) {
      const chars = Array.from(t ?? "");
      paras.push({
        ver: 0,
        g: chars.map((ch, i) => ({
          ch, born: -1e9, dwell: 0, gap: 0, heat: 0,
          w: w && w[i] ? (w.charCodeAt(i) - 97) * 50 : 450,
          strike: s && s[i] === "1" ? -1e9 : undefined
        }))
      });
    }
    this.paras = paras.length ? paras : [{ g: [], ver: 0 }];
  }

  /** Visual sound on the page: how a glyph lands for this switch. */
  land(g: G, sw: Switch, now: number, mm: number): void {
    const at = this.pos.get(g);
    const x = at ? at.x : this.caret.x;
    const y = at ? at.y - this.fs * 0.35 : this.caret.y;
    const fs = this.fs;
    if (mm < 0.5) return;
    if (sw === "thock") this.sparks.push({ x, y, vx: 0, vy: 0, t: now, dur: 420, kind: "ring", a: 0.16, r0: fs * 0.25, r1: fs * 1.25 });
    else if (sw === "tactile") this.sparks.push({ x, y, vx: 0, vy: 0, t: now, dur: 240, kind: "ring", a: 0.14, r0: fs * 0.2, r1: fs * 0.7 });
    else if (sw === "clicky")
      for (let i = 0; i < 3; i++) {
        const a = -Math.PI / 2 + (i - 1) * 0.55;
        this.sparks.push({ x: x + Math.cos(a) * fs * 0.55, y: y + Math.sin(a) * fs * 0.55, vx: Math.cos(a), vy: Math.sin(a), t: now, dur: 150, kind: "tick", a: 0.8, r0: 0, r1: fs * 0.32 });
      }
    if (g.heat > 0.55 && Math.random() < g.heat)
      this.sparks.push({ x: x + (Math.random() - 0.5) * this.cw, y, vx: (Math.random() - 0.5) * 30, vy: -60 - Math.random() * 70, t: now, dur: 700 + Math.random() * 400, kind: "ember", a: 0.9, r0: 1 + Math.random() * 1.4, r1: 0 });
  }

  stamped(g: G, now: number): void {
    const at = this.pos.get(g);
    if (!at) return;
    this.sparks.push({ x: at.x, y: at.y - this.fs * 0.35, vx: 0, vy: 0, t: now, dur: 620, kind: "ring", a: 0.35, r0: this.fs * 0.3, r1: this.fs * 2.6 });
    this.blast(at.x, at.y - this.fs * 0.35, now, 0.55);
  }

  busy(now: number): boolean {
    return this.ghosts.length > 0 || this.sparks.length > 0 || this.blasts.some((b) => now - b.t < 1600);
  }

  // ---- drawing ------------------------------------------------------------

  draw(ctx: CanvasRenderingContext2D, dpr: number, now: number, dt: number, o: DrawOpts): void {
    const { way, mm } = o;
    const fs = this.fs;
    const cw = this.cw;
    this.pos.clear();
    this.blasts = this.blasts.filter((b) => now - b.t < 1600);

    this.scroll += (this.scrollT - this.scroll) * Math.min(1, dt * 10);
    if (Math.abs(this.scroll - this.scrollT) < 0.3) this.scroll = this.scrollT;

    // Walk up from the pen, placing rows until they are off the top.
    type Row = { p: Para; s: number; e: number; y: number; scale: number; st: Style; last: boolean; first: boolean };
    const rows: Row[] = [];
    let y = this.anchor + this.scroll;
    let total = 0;
    for (let pi = this.paras.length - 1; pi >= 0; pi--) {
      const p = this.paras[pi];
      const { s: st } = this.style(p);
      const scale = this.scaleOf(st.kind);
      const starts = this.rows(p, scale);
      for (let r = starts.length - 1; r >= 0; r--) {
        const e = r + 1 < starts.length ? starts[r + 1] : p.g.length;
        if (y > -this.lh * 2 && y < this.anchor + this.lh * 3)
          rows.push({ p, s: starts[r], e, y, scale, st, last: pi === this.paras.length - 1 && r === starts.length - 1, first: r === 0 });
        const h = this.lh * (r === 0 ? scale : Math.max(1, scale * 0.92));
        y -= h;
        total += h;
      }
      y -= this.lh * 0.32;
      total += this.lh * 0.32;
    }
    this.maxScroll = Math.max(0, total - (this.anchor - this.top) - this.lh);

    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    const fadeTop = this.top + this.lh * 0.2;
    let caretRow: Row | null = null;

    for (const row of rows) {
      if (row.last) caretRow = row;
      const { p, st, scale } = row;
      const baseY = row.y;
      const fade = clamp((baseY - fadeTop) / ((this.anchor - fadeTop) * 0.7), 0, 1);
      const below = baseY > this.anchor + 2 ? clamp(1 - (baseY - this.anchor) / (this.lh * 2), 0, 1) : 1;
      const rowA = (0.18 + 0.82 * fade * fade) * below * (1 - o.esc * 0.6);
      if (rowA <= 0.01) continue;
      const pw = cw * scale;
      const px = fs * scale;

      // Block decorations.
      if (st.kind === "bq") {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = rgb(way.accent, rowA * 0.9);
        ctx.fillRect(this.left + pw * 0.35, baseY - px * 0.95, Math.max(2, fs * 0.09), this.lh * 0.98);
      }

      for (let i = row.s; i < row.e; i++) {
        const g = p.g[i];
        if (g.ch === " ") {
          this.pos.set(g, { x: this.left + (i - row.s + 0.5) * pw, y: baseY, px, c: way.ink });
          continue;
        }
        const age = now - g.born;
        let x = this.left + (i - row.s + 0.5) * pw;
        let yy = baseY;
        let sc = 1;
        let rot = 0;
        let a = rowA;
        let wt = g.hold ? this.heldWeight(g, o.sw, now) : g.w;
        let col: RGB = way.ink;
        const ital = !!st.ital[i] || st.kind === "bq";

        if (st.kind === "h1") wt += 260;
        else if (st.kind === "h2") wt += 180;
        if (st.bold[i]) wt += 300;
        if (st.aside[i]) {
          a *= 0.5;
          wt -= 120;
        }
        if (st.quoted[i]) col = way.accent2;
        if (st.mark[i]) {
          col = way.ghost;
          a *= 0.55;
          wt = 300;
        }
        if (g.strike) a *= 0.45;

        // Landing, by switch.
        if (age < 900 && mm > 0) {
          if (o.sw === "linear") {
            const e = easeOut(clamp(age / 150, 0, 1));
            yy += (1 - e) * fs * 0.32 * mm;
            a *= e;
          } else if (o.sw === "tactile") {
            sc = 0.5 + 0.5 * settle((age / 300) * 1.6);
            a *= clamp(age / 50, 0, 1);
          } else if (o.sw === "clicky") {
            sc = age < 80 ? 1.16 - 0.16 * (age / 80) : 1;
            if (age < 110) col = mix(way.accent, col, age / 110);
          } else {
            sc = 1 + 0.36 * Math.exp(-age / 85) * Math.cos(age / 52);
            wt += 280 * Math.exp(-age / 150);
            a *= clamp(age / 35, 0, 1);
            yy -= fs * 0.1 * Math.exp(-age / 60) * mm;
          }
        }
        if (g.stamp) {
          const sa = now - g.stamp;
          if (sa < 700) sc *= 1 + 0.3 * Math.exp(-sa / 90) * Math.cos(sa / 45);
        }
        // Heat: fast keys land hot and cool to ink.
        if (g.heat > 0 && age < 2400) col = mix(col, way.accent, g.heat * Math.exp(-age / 900));
        if (st.wavy[i]) yy += Math.sin(now / 190 + i * 0.75) * fs * 0.09 * Math.max(0.3, mm);
        if (g.jt !== undefined) {
          const ja = now - g.jt - (g.jd ?? 0) * 35;
          if (ja > 0 && ja < 520) yy -= Math.sin((ja / 520) * Math.PI) * fs * 0.5 * Math.exp(-ja / 600) * Math.max(0.3, mm);
        }
        if (g.tt !== undefined) {
          const ta = now - g.tt;
          if (ta < 1500) {
            const r = 0.17 * (ta < 650 ? easeOut(clamp(ta / 220, 0, 1)) : Math.exp(-(ta - 650) / 260)) * Math.max(0.3, mm);
            const dx = (g.tc ?? 0) * pw;
            x += dx * (Math.cos(r) - 1);
            yy += dx * Math.sin(r);
            rot += r;
          }
        }
        // Waves from clicks and released charges.
        for (const b of this.blasts) {
          const ba = (now - b.t) / 1000;
          const dx = x - b.x;
          const dy = yy - fs * 0.35 - b.y;
          const d = Math.hypot(dx, dy) || 1;
          const e = ba * 1100 - d;
          if (e < 0 || e > 500) continue;
          const push = b.amp * fs * 0.9 * Math.exp(-e / 140) * Math.exp(-ba * 2.4) * Math.sin(Math.min(Math.PI, e / 60)) * mm;
          x += (dx / d) * push;
          yy += (dy / d) * push;
          rot += (dx / d) * push * 0.004;
        }
        if (o.caps && g.born > 0 && age < 220 && mm > 0) {
          x += (Math.random() - 0.5) * fs * 0.06;
          yy += (Math.random() - 0.5) * fs * 0.06;
        }
        if (o.xray) {
          const d = clamp((g.dwell || 90) / 220, 0, 1);
          col = mix(way.accent2, way.accent, d);
          a = Math.max(a, 0.6 * fade);
        }

        this.pos.set(g, { x, y: yy, px, c: col });
        if (a <= 0.01) continue;

        ctx.globalAlpha = clamp(a, 0, 1);
        ctx.fillStyle = rgb(col);
        const s = sc;
        const cos = Math.cos(rot) * s;
        const sin = Math.sin(rot) * s;
        ctx.setTransform(dpr * cos, dpr * sin, -dpr * sin, dpr * cos, dpr * x, dpr * yy);
        const shown = st.opens.has(i) ? (st.opens.get(i) ? "“" : "”") : g.ch;

        if (g.from && age < 180 && mm > 0) {
          // The keystrokes that made it slide together first.
          const pr = age / 180;
          ctx.font = o.font(clamp(wt, 100, 800), px, ital);
          ctx.globalAlpha = clamp(a * (1 - pr), 0, 1);
          for (let j = 0; j < g.from.length; j++) ctx.fillText(g.from[j], j * pw * (1 - easeOut(pr)), 0);
          ctx.globalAlpha = clamp(a * pr, 0, 1);
        }
        if (CUSTOM.has(g.ch)) this.custom(ctx, g.ch, px, now, age, col, wt);
        else if (st.kind === "li" && i === 0) {
          ctx.fillStyle = rgb(way.accent);
          ctx.beginPath();
          ctx.arc(0, -px * 0.33, px * 0.13, 0, Math.PI * 2);
          ctx.fill();
        } else if (/\d/.test(g.ch) && age < 520 && mm > 0) this.roll(ctx, g.ch, px, age, wt, ital, o);
        else {
          ctx.font = o.font(clamp(wt, 100, 800), px, ital);
          ctx.fillText(shown, 0, 0);
        }
        if (o.xray) {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          const hgt = clamp((g.dwell || 0) / 250, 0.04, 1) * fs * 0.45;
          ctx.globalAlpha = 0.85 * fade;
          ctx.fillRect(x - pw * 0.28, baseY + fs * 0.22, pw * 0.56, hgt);
        }
      }

      // Underlines draw themselves on; strikes too.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      for (const [u0, u1, close] of st.under) {
        const a0 = Math.max(u0, row.s);
        const a1 = Math.min(u1, row.e);
        if (a1 <= a0) continue;
        const t0 = p.g[close]?.born ?? -1e9;
        const pr = mm > 0 ? easeOut(clamp((now - t0) / 380, 0, 1)) : 1;
        this.line(ctx, this.left + (a0 - row.s) * pw, this.left + (a0 - row.s + (a1 - a0) * pr) * pw, baseY + px * 0.2, way.accent, rowA, fs * 0.07, a0);
      }
      let ss = -1;
      for (let i = row.s; i <= row.e; i++) {
        const on = i < row.e && p.g[i].strike !== undefined && p.g[i].ch !== " ";
        if (on && ss < 0) ss = i;
        if (!on && ss >= 0) {
          const t0 = p.g[ss].strike ?? -1e9;
          const pr = mm > 0 ? easeOut(clamp((now - t0) / 300, 0, 1)) : 1;
          this.line(ctx, this.left + (ss - row.s) * pw - pw * 0.15, this.left + (ss - row.s + (i - ss) * pr) * pw + pw * 0.1, baseY - px * 0.3, way.accent, rowA, fs * 0.08, ss + 7);
          ss = -1;
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.drawCaret(ctx, caretRow, now, dt, o);
    this.drawFx(ctx, dpr, now, dt, o);
  }

  private line(ctx: CanvasRenderingContext2D, x0: number, x1: number, y: number, c: RGB, a: number, w: number, seed: number): void {
    if (x1 - x0 < 1) return;
    ctx.strokeStyle = rgb(c, clamp(a, 0, 1));
    ctx.lineWidth = Math.max(1.2, w);
    ctx.lineCap = "round";
    ctx.beginPath();
    const n = Math.max(2, Math.round((x1 - x0) / 10));
    for (let k = 0; k <= n; k++) {
      const x = x0 + ((x1 - x0) * k) / n;
      const yy = y + Math.sin(seed * 1.7 + k * 1.3) * w * 0.35;
      if (k) ctx.lineTo(x, yy);
      else ctx.moveTo(x, yy);
    }
    ctx.stroke();
  }

  /** Digits roll in like an odometer. */
  private roll(ctx: CanvasRenderingContext2D, ch: string, px: number, age: number, wt: number, ital: boolean, o: DrawOpts): void {
    const v = +ch;
    const total = 10 + v;
    const pos = total * easeOut(clamp(age / 520, 0, 1));
    const i0 = Math.floor(pos);
    const fr = pos - i0;
    const h = px * 1.05;
    ctx.save();
    ctx.beginPath();
    ctx.rect(-this.cw, -px * 0.95, this.cw * 2, px * 1.25);
    ctx.clip();
    ctx.font = o.font(clamp(wt, 100, 800), px, ital);
    ctx.fillText(String(i0 % 10), 0, -fr * h);
    ctx.fillText(String((i0 + 1) % 10), 0, (1 - fr) * h);
    ctx.restore();
  }

  private custom(ctx: CanvasRenderingContext2D, ch: string, px: number, now: number, age: number, col: RGB, wt: number): void {
    const lw = Math.max(1.4, px * (0.05 + (wt - 300) / 9000));
    ctx.strokeStyle = rgb(col);
    ctx.fillStyle = rgb(col);
    ctx.lineWidth = lw;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const cy = -px * 0.34;
    if (ch === RIGHT || ch === LEFT) {
      const d = ch === RIGHT ? 1 : -1;
      const pr = easeOut(clamp(age / 260, 0, 1));
      const len = this.cw * 0.9;
      const x0 = -d * len * 0.5;
      const x1 = x0 + d * len * pr;
      ctx.beginPath();
      ctx.moveTo(x0, cy);
      ctx.lineTo(x1, cy);
      ctx.moveTo(x1 - d * px * 0.2, cy - px * 0.18);
      ctx.lineTo(x1, cy);
      ctx.lineTo(x1 - d * px * 0.2, cy + px * 0.18);
      ctx.stroke();
    } else if (ch === HEART) {
      const ph = (now % 1100) / 1100;
      const beat = Math.exp(-((ph - 0.08) ** 2) / 0.002) * 0.16 + Math.exp(-((ph - 0.24) ** 2) / 0.002) * 0.1;
      const s = px * 0.36 * (1 + beat) * (age < 300 ? settle(age / 190) : 1);
      ctx.beginPath();
      ctx.moveTo(0, cy + s * 0.85);
      ctx.bezierCurveTo(-s * 1.4, cy - s * 0.1, -s * 0.75, cy - s * 1.15, 0, cy - s * 0.45);
      ctx.bezierCurveTo(s * 0.75, cy - s * 1.15, s * 1.4, cy - s * 0.1, 0, cy + s * 0.85);
      ctx.fill();
    } else {
      // A face. It blinks now and then.
      const blink = now % 4200 < 140;
      const r = px * 0.36;
      const ex = r * 0.42;
      const ey = cy - r * 0.3;
      for (const side of [-1, 1]) {
        const wink = ch === WINK && side === 1;
        ctx.beginPath();
        if (blink || wink) {
          ctx.moveTo(side * ex - r * 0.16, ey);
          ctx.lineTo(side * ex + r * 0.16, ey);
          ctx.stroke();
        } else {
          ctx.arc(side * ex, ey, lw * 0.9, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      const open = age < 400 ? settle(age / 250) : 1;
      ctx.beginPath();
      ctx.arc(0, cy - r * 0.05, r * 0.62, Math.PI * (0.5 - 0.32 * open), Math.PI * (0.5 + 0.32 * open));
      ctx.stroke();
    }
  }

  private drawCaret(ctx: CanvasRenderingContext2D, row: { s: number; e: number; y: number; scale: number } | null, now: number, dt: number, o: DrawOpts): void {
    const { way, mm } = o;
    const scale = row?.scale ?? 1;
    const p = this.active;
    const col = row ? p.g.length - row.s : 0;
    const tx = this.left + col * this.cw * scale;
    const ty = row ? row.y : this.anchor + this.scroll;
    if (this.cx < 0) {
      this.cx = tx;
      this.cy = ty;
    }
    if (mm > 0) {
      const k = 900;
      const d = 52;
      const n = Math.ceil(dt / 0.006);
      const h = dt / n;
      for (let i = 0; i < n; i++) {
        this.cvx += (-k * (this.cx - tx) - d * this.cvx) * h;
        this.cvy += (-k * (this.cy - ty) - d * this.cvy) * h;
        this.cx += this.cvx * h;
        this.cy += this.cvy * h;
        this.squashV += (-600 * this.squash - 26 * this.squashV) * h;
        this.squash += this.squashV * h;
      }
    } else {
      this.cx = tx;
      this.cy = ty;
      this.squash = 0;
    }
    this.caret.x = this.cx;
    this.caret.y = this.cy - this.fs * 0.35 * scale;

    const h = this.fs * 1.12 * scale;
    const w = o.caps ? this.cw * scale * 0.92 : Math.max(2.5, this.fs * 0.11);
    const breathe = o.idle > 700 ? 0.55 + 0.45 * Math.cos((o.idle - 700) / 420) : 1;

    // Trail: the caret's recent path, when it moves fast.
    this.trail.push({ t: now, x: this.cx, y: this.cy });
    while (this.trail.length && now - this.trail[0].t > 170) this.trail.shift();
    if (mm > 0 && this.trail.length > 2) {
      const first = this.trail[0];
      if (Math.hypot(this.cx - first.x, this.cy - first.y) > this.cw * 1.5) {
        ctx.beginPath();
        for (let i = 0; i < this.trail.length; i++) {
          const s = this.trail[i];
          if (i) ctx.lineTo(s.x + w / 2, s.y - h * 0.4);
          else ctx.moveTo(s.x + w / 2, s.y - h * 0.4);
        }
        ctx.strokeStyle = rgb(way.accent, 0.35);
        ctx.lineWidth = h * 0.5;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke();
      }
    }

    const sq = clamp(this.squash, -0.4, 0.4);
    const hh = h * (1 - sq * 0.5);
    const ww = w * (1 + sq);
    ctx.globalAlpha = (o.caps ? 0.45 : 1) * breathe;
    ctx.fillStyle = rgb(way.accent);
    ctx.beginPath();
    ctx.roundRect(this.cx - ww / 2 + (o.caps ? ww / 2 : 0), this.cy - hh * 0.8, ww, hh, Math.min(ww, hh) / 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    if (o.charge > 0) {
      const c = clamp(o.charge, 0, 1);
      ctx.strokeStyle = rgb(way.accent, 0.25 + 0.5 * c);
      ctx.lineWidth = 2 + c * 2;
      ctx.beginPath();
      const r = this.fs * (0.8 + c * 1.6) + Math.sin(now / 40) * c * 2;
      ctx.arc(this.caret.x, this.caret.y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * c);
      ctx.stroke();
    }
    if (o.esc > 0) {
      ctx.fillStyle = rgb(way.accent, 0.8);
      const wdt = this.cols * this.cw;
      ctx.fillRect(this.left, this.anchor + this.fs * 0.5, wdt * o.esc, 2);
    }
    if (this.isEmpty() && this.ghosts.length === 0) {
      const a = 0.5 + 0.2 * Math.cos(now / 900);
      ctx.textAlign = "left";
      ctx.fillStyle = rgb(way.ghost, a);
      ctx.font = o.font(420, this.fs);
      ctx.fillText("go on. press something.", this.cx + this.cw * 0.9, this.anchor);
      ctx.font = o.font(420, Math.round(this.fs * 0.5));
      ctx.fillStyle = rgb(way.ghost, a * 0.8);
      ctx.fillText("every key does something  ·  f1 when you're stuck", this.cx + this.cw * 0.9, this.anchor + this.fs * 1.1);
      ctx.textAlign = "center";
    }
  }

  kick(sw: Switch): void {
    this.squashV += sw === "thock" ? 9 : sw === "clicky" ? 6 : sw === "tactile" ? 7 : 4;
  }

  private drawFx(ctx: CanvasRenderingContext2D, dpr: number, now: number, dt: number, o: DrawOpts): void {
    const { way } = o;
    this.ghosts = this.ghosts.filter((g) => now - g.t < g.dur);
    for (const g of this.ghosts) {
      const age = now - g.t;
      if (age < 0) {
        ctx.setTransform(dpr, 0, 0, dpr, dpr * g.x, dpr * g.y);
        ctx.globalAlpha = 1;
      } else {
        g.vy += g.grav * dt;
        g.x += g.vx * dt;
        g.y += g.vy * dt;
        g.r += g.vr * dt;
        const c = Math.cos(g.r);
        const s = Math.sin(g.r);
        ctx.setTransform(dpr * c, dpr * s, -dpr * s, dpr * c, dpr * g.x, dpr * g.y);
        ctx.globalAlpha = clamp(1 - age / g.dur, 0, 1);
      }
      ctx.fillStyle = rgb(g.c);
      ctx.font = o.font(clamp(g.w, 100, 800), g.px);
      ctx.fillText(g.ch, 0, 0);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.sparks = this.sparks.filter((s) => now - s.t < s.dur);
    for (const s of this.sparks) {
      const p = (now - s.t) / s.dur;
      if (p < 0) continue;
      if (s.kind === "ring") {
        ctx.globalAlpha = s.a * (1 - p);
        ctx.strokeStyle = rgb(way.accent);
        ctx.lineWidth = Math.max(0.8, this.fs * 0.08 * (1 - p));
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r0 + (s.r1 - s.r0) * easeOut(p), 0, Math.PI * 2);
        ctx.stroke();
      } else if (s.kind === "tick") {
        ctx.globalAlpha = s.a * (1 - p);
        ctx.strokeStyle = rgb(way.accent);
        ctx.lineWidth = Math.max(1, this.fs * 0.06);
        ctx.lineCap = "round";
        const d0 = easeOut(p) * s.r1 * 0.6;
        ctx.beginPath();
        ctx.moveTo(s.x + s.vx * d0, s.y + s.vy * d0);
        ctx.lineTo(s.x + s.vx * (d0 + s.r1 * (1 - p)), s.y + s.vy * (d0 + s.r1 * (1 - p)));
        ctx.stroke();
      } else {
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.vx += Math.sin(now / 200 + s.t) * 20 * dt;
        ctx.globalAlpha = s.a * (1 - p);
        ctx.fillStyle = rgb(mix(way.accent, way.accent2, p * 0.5));
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r0 * (1 - p * 0.6), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    if (o.xray) this.xrayRead(ctx, way, o);
  }

  private xrayRead(ctx: CanvasRenderingContext2D, way: Way, o: DrawOpts): void {
    const gs: G[] = [];
    for (let pi = this.paras.length - 1; pi >= 0 && gs.length < 120; pi--)
      for (let i = this.paras[pi].g.length - 1; i >= 0 && gs.length < 120; i--) {
        const g = this.paras[pi].g[i];
        if (g.dwell > 0) gs.push(g);
      }
    ctx.textAlign = "left";
    ctx.font = o.font(560, Math.max(11, Math.round(this.fs * 0.46)));
    ctx.fillStyle = rgb(way.accent);
    const y = this.anchor + this.fs * 1.5;
    if (gs.length < 5) {
      ctx.fillText("x-ray: type a little, then hold alt again", this.left, y);
      return;
    }
    const dw = gs.reduce((a, g) => a + g.dwell, 0) / gs.length;
    const gaps = gs.map((g) => g.gap).filter((v) => v > 0 && v < 1200);
    const gm = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;
    const sd = gaps.length ? Math.sqrt(gaps.reduce((a, b) => a + (b - gm) ** 2, 0) / gaps.length) : 0;
    const steady = gm ? Math.round(clamp(1 - sd / gm, 0, 1) * 100) : 0;
    ctx.fillText(`x-ray  ·  hold ${Math.round(dw)} ms  ·  gap ${Math.round(gm)} ms  ·  steady ${steady}%`, this.left, y);
    ctx.fillStyle = rgb(way.ghost);
    ctx.fillText("bars: how long each key was down", this.left, y + this.fs * 0.7);
    ctx.textAlign = "center";
  }
}
