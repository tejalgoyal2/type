/**
 * Worlds: the page listens to what you write.
 *
 * Write "rain" and the page becomes a window in a downpour. Write "wind"
 * and it turns to a pencil sketch with gusts curling across it. Each world
 * has its own palette (the page blooms into it from the word), a layer
 * behind the ink, a layer in front of it, and a small answer to every key.
 * Your rhythm drives the weather: type faster and the rain falls harder,
 * the wind picks up, the embers climb quicker.
 *
 * A world stays while you keep writing near it and lets go about a minute
 * after you last mentioned it.
 */
import type { Palette } from "./palettes";

export type WorldId = "rain" | "wind" | "snow" | "sun" | "fire" | "sea" | "matrix" | "terminal" | "sakura";

export interface Row {
  id: number;
  y: number; // baseline, CSS px
  xs: number; // left edge of the text
  text: string;
}

interface Def {
  id: WorldId;
  words: string[];
  pal: Palette;
}

function pal(
  id: string,
  dark: boolean,
  paper: string,
  ink: string,
  fresh: string,
  sub: string,
  capBg: string,
  capInk: string
): Palette {
  return { id: `w-${id}`, label: id, dark, paper, ink, fresh, sub, misA: fresh, misB: sub, captionBg: capBg, captionInk: capInk };
}

const DEFS: Def[] = [
  {
    id: "rain",
    words: "rain rains rainy raining rained drizzle downpour storm stormy thunder lightning umbrella puddle puddles monsoon showers night nights midnight tonight lofi cozy city".split(" "),
    pal: pal("rain", true, "#1A1B30", "#ECE6F7", "#FFB38A", "#3A3B5E", "#FFB38A", "#1A1B30")
  },
  {
    id: "wind",
    words: "wind winds windy breeze breezy gust gusts gusty blow blowing blew autumn leaves kite hurricane tornado".split(" "),
    pal: pal("wind", false, "#EEE9DE", "#2E2F35", "#6E6F78", "#CBC4B5", "#2E2F35", "#EEE9DE")
  },
  {
    id: "matrix",
    words: "matrix code coding coder hack hacker hacking neo glitch digital cyber cyberpunk simulation binary algorithm".split(" "),
    pal: pal("matrix", true, "#010A04", "#8DFFA8", "#E4FFEA", "#0E3B1E", "#8DFFA8", "#010A04")
  },
  {
    id: "terminal",
    words: "terminal computer computers linux unix bash shell console command sudo server retro program programming kernel".split(" "),
    pal: pal("terminal", true, "#0E0A04", "#FFB940", "#FFE7B0", "#4A3410", "#FFB940", "#0E0A04")
  },
  {
    id: "sakura",
    words: "sakura cherry blossom blossoms petal petals spring anime manga tokyo kyoto japan hanami".split(" "),
    pal: pal("sakura", false, "#FFF3F4", "#3B2235", "#FF4F8B", "#F2C9D3", "#FF4F8B", "#FFF3F4")
  },
  {
    id: "snow",
    words: "snow snowy snowing snowfall snowflake winter frost frosty frozen freezing ice icy cold blizzard december".split(" "),
    pal: pal("snow", true, "#2C3E53", "#F2D7A2", "#FFC46E", "#4A6079", "#F2D7A2", "#2C3E53")
  },
  {
    id: "sun",
    words: "sun sunny sunlight sunshine sunset sunrise summer golden warm warmth beach dawn afternoon".split(" "),
    pal: pal("sun", false, "#F6E8CD", "#3A291A", "#C9621C", "#DCC39A", "#C9621C", "#FFF6E6")
  },
  {
    id: "fire",
    words: "fire fires flame flames burn burning burnt blaze campfire fireplace embers hot heat smoke".split(" "),
    pal: pal("fire", true, "#120C09", "#F2E2CE", "#FF8A3D", "#3C2A1F", "#FF8A3D", "#120C09")
  },
  {
    id: "sea",
    words: "sea seas ocean oceans wave waves tide tides shore surf sail sailing harbor harbour whale".split(" "),
    pal: pal("sea", false, "#F0E8D8", "#1D2946", "#2E5EA8", "#CABFA6", "#1D2946", "#F0E8D8")
  }
];

const BY_WORD = new Map<string, Def>();
for (const d of DEFS) for (const w of d.words) BY_WORD.set(w, d);
const BY_ID = new Map(DEFS.map((d) => [d.id, d]));
export const WORLD_IDS = DEFS.map((d) => d.id);

/** How long a world stays after its last word, and how long it takes to go. */
const HOLD_MS = 70000;

// A tiny seeded random, so a world's sky is the same each time it opens.
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}
const R = Math.random;

function sprite(size: number, paint: (c: CanvasRenderingContext2D, s: number) => void): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  paint(c.getContext("2d")!, size);
  return c;
}

/** A soft round glow, white at the core: bokeh, embers, motes. */
function glow(rgb: string): HTMLCanvasElement {
  return sprite(64, (c, s) => {
    const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, `rgba(${rgb},1)`);
    g.addColorStop(0.35, `rgba(${rgb},0.55)`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
  });
}

/** Graphite: a speckled grey that makes any stroke read as pencil. */
function graphite(c: CanvasRenderingContext2D): CanvasPattern | null {
  const g = sprite(48, (x, s) => {
    const r = rng(7);
    for (let i = 0; i < 900; i++) {
      x.fillStyle = `rgba(46,47,53,${0.25 + r() * 0.75})`;
      x.fillRect(Math.floor(r() * s), Math.floor(r() * s), 1, 1);
    }
  });
  return c.createPattern(g, "repeat");
}

/** Film grain, offset each frame. */
function grain(c: CanvasRenderingContext2D): CanvasPattern | null {
  const g = sprite(128, (x, s) => {
    const img = x.createImageData(s, s);
    const r = rng(3);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = r() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 40;
    }
    x.putImageData(img, 0, 0);
  });
  return c.createPattern(g, "repeat");
}
interface P {
  x: number;
  y: number;
  vx: number;
  vy: number;
  z: number;
  a: number; // age, s
  l: number; // life, s (0 = forever)
  s: number; // seed
}

function part(x: number, y: number, vx: number, vy: number, z = R(), l = 0): P {
  return { x, y, vx, vy, z, a: 0, l, s: R() * 1000 };
}

interface Gust {
  pts: number[];
  len: number; // total length, px
  head: number; // px along
  speed: number;
}

/** Matrix: the cell size of the falling code, and what it is made of. */
const CELL = 18;
const KANA = "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ012345789Z:=*+<>|";
const MONO = '"JetBrains Mono Variable", ui-monospace, monospace';

interface Petal extends P {
  rot: number;
  vr: number;
  spin: number;
  vs: number;
  k: number;
}

function petal(x: number, y: number, l = 0): Petal {
  return { ...part(x, y, 0, 0, R(), l), rot: R() * 6.28, vr: (R() - 0.5) * 2.4, spin: R() * 6.28, vs: 2 + R() * 4, k: Math.floor(R() * 3) };
}

/** A cherry petal, notched at the tip, deeper pink at the base. */
function petalSprite(base: string, tip: string): HTMLCanvasElement {
  return sprite(64, (c, s) => {
    const r = s * 0.46;
    c.translate(s / 2, s / 2);
    const g = c.createLinearGradient(0, r, 0, -r);
    g.addColorStop(0, base);
    g.addColorStop(1, tip);
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(0, -0.62 * r);
    c.quadraticCurveTo(-0.18 * r, -1.0 * r, -0.42 * r, -0.86 * r);
    c.bezierCurveTo(-0.95 * r, -0.5 * r, -0.6 * r, 0.55 * r, 0, r);
    c.bezierCurveTo(0.6 * r, 0.55 * r, 0.95 * r, -0.5 * r, 0.42 * r, -0.86 * r);
    c.quadraticCurveTo(0.18 * r, -1.0 * r, 0, -0.62 * r);
    c.fill();
    // A faint vein, the way petals catch light.
    c.strokeStyle = "rgba(255,255,255,0.45)";
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(0, 0.8 * r);
    c.quadraticCurveTo(0.05 * r, 0, 0, -0.5 * r);
    c.stroke();
  });
}

/** A four-point sparkle, the anime kind. */
function sparklePath(c: CanvasRenderingContext2D, r: number): void {
  c.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.22;
    c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  c.closePath();
}

export class Worlds {
  id: WorldId | null = null;
  private heardAt = 0;
  private intensity = 0;
  private lv: Record<WorldId, number> = { rain: 0, wind: 0, snow: 0, sun: 0, fire: 0, sea: 0, matrix: 0, terminal: 0, sakura: 0 };
  private energy = 0;
  private t = 0;
  private w = 1;
  private h = 1;

  // rain: lofi, at night, through glass
  private drops: P[] = [];
  private bokeh: P[] = [];
  private bokehSprites: HTMLCanvasElement[] | null = null;
  private flash = 0;
  // wind
  private gusts: Gust[] = [];
  private leaves: P[] = [];
  private pencil: CanvasPattern | null = null;
  // matrix
  private code: HTMLCanvasElement | null = null;
  private cols: { y: number; v: number; cell: number }[] = [];
  // terminal
  private scan: CanvasPattern | null = null;
  private boot = 0;
  // sakura
  private petals: Petal[] = [];
  private petalSprites: HTMLCanvasElement[] | null = null;
  private sparkles: P[] = [];
  // snow
  private flakes: P[] = [];
  private caps = new Map<number, Float32Array>();
  private soft: HTMLCanvasElement | null = null;
  // sun
  private motes: P[] = [];
  private film: CanvasPattern | null = null;
  // fire
  private embers: P[] = [];
  private ember: HTMLCanvasElement | null = null;
  // sea
  private rings: P[] = [];

  /** A word was just written. Returns the world it opens, if it opens one. */
  hear(word: string, now: number): WorldId | null {
    const d = BY_WORD.get(word);
    if (!d) return null;
    this.heardAt = now;
    if (d.id === this.id) {
      this.intensity = Math.min(1, this.intensity + 0.18);
      return null;
    }
    this.id = d.id;
    this.intensity = 0.62;
    return d.id;
  }

  palette(): Palette | null {
    return this.id ? BY_ID.get(this.id)!.pal : null;
  }

  /** True once the current world has gone quiet long enough to leave. */
  expired(now: number): boolean {
    return this.id !== null && now - this.heardAt > HOLD_MS;
  }

  leave(): void {
    this.id = null;
  }

  active(): boolean {
    return WORLD_IDS.some((id) => this.lv[id] > 0.001);
  }

  /** A key landed at (x, y): the world answers it. */
  key(x: number, y: number): void {
    const id = this.id;
    if (!id) return;
    if (id === "rain") {
      this.rings.push(part(x, y, 0, 0, 1, 0.7));
    } else if (id === "wind") {
      if (this.gusts.length < 14) this.gusts.push(this.gust(x - 40, y - 18, 160 + R() * 120, true));
    } else if (id === "matrix") {
      // Every letter lets a stream of code fall from where it landed.
      const col = this.cols[Math.floor(x / CELL)];
      if (col) {
        col.y = y;
        col.v = 24 + R() * 8;
        col.cell = -1;
      }
    } else if (id === "sakura") {
      for (let i = 0; i < 3; i++) this.sparkles.push(part(x + (R() - 0.5) * 34, y - 18 - R() * 26, 0, -10, 4 + R() * 7, 0.45 + R() * 0.3));
      if (R() < 0.6) this.petals.push(petal(x, y - 14, 3.5));
    } else if (id === "snow") {
      for (let i = 0; i < 6; i++) this.flakes.push(part(x, y - 12, (R() - 0.5) * 70, -40 - R() * 50, 0.4 + R() * 0.5, 2.6));
    } else if (id === "sun") {
      for (let i = 0; i < 2; i++) this.motes.push(part(x + (R() - 0.5) * 16, y - 16, (R() - 0.5) * 20, -14 - R() * 12, 1, 1.6));
    } else if (id === "fire") {
      for (let i = 0; i < 7; i++) this.embers.push(part(x, y - 10, (R() - 0.5) * 140, -120 - R() * 160, 1, 0.5 + R() * 0.4));
    } else if (id === "sea") {
      this.rings.push(part(x, y + 4, 0, 0, 1, 1.4));
    }
  }

  /** Advance the weather. dt is already zero when motion is off. */
  update(dt: number, wpm: number, w: number, h: number): void {
    this.w = w;
    this.h = h;
    const target = Math.min(1, wpm / 90);
    this.energy += (target - this.energy) * Math.min(1, dt * 1.5);
    // Levels ease in and out over about a second and a half.
    for (const id of WORLD_IDS) {
      const goal = id === this.id ? 1 : 0;
      const v = this.lv[id] + Math.sign(goal - this.lv[id]) * dt * 0.7;
      this.lv[id] = goal > this.lv[id] ? Math.min(goal, v) : Math.max(goal, v);
    }
    // With motion off there is no fade: the world is simply there or not.
    if (dt === 0) for (const id of WORLD_IDS) this.lv[id] = id === this.id ? 1 : 0;
    for (const id of WORLD_IDS) if (id !== this.id && this.lv[id] === 0) this.drop(id);
    if (this.intensity > 0.62) this.intensity -= dt * 0.01;

    const pace = 0.65 + this.energy * 0.9;
    const s = dt * pace;
    this.t += s;
    if (this.lv.rain) this.stepRain(s);
    if (this.lv.matrix) this.stepMatrix(s);
    if (this.lv.terminal) this.boot += dt;
    if (this.lv.sakura) this.stepSakura(s);
    if (this.lv.wind) this.stepWind(s);
    if (this.lv.snow) this.stepSnow(s);
    if (this.lv.sun) this.stepSun(s);
    if (this.lv.fire) this.stepFire(s);
    if (this.lv.sea || this.lv.rain) this.stepRings(dt);
  }

  private drop(id: WorldId): void {
    if (id === "rain") {
      this.drops = [];
      this.flash = 0;
    } else if (id === "wind") {
      this.gusts = [];
      this.leaves = [];
    } else if (id === "matrix") {
      this.code = null;
      this.cols = [];
    } else if (id === "terminal") {
      this.boot = 0;
    } else if (id === "sakura") {
      this.petals = [];
      this.sparkles = [];
    } else if (id === "snow") {
      this.flakes = [];
      this.caps.clear();
    } else if (id === "sun") this.motes = [];
    else if (id === "fire") this.embers = [];
  }

  // ------------------------------------------------------------ steps

  private gust(x: number, y: number, len: number, curl: boolean): Gust {
    const pts: number[] = [];
    const k = 0.004 + R() * 0.006;
    const amp = 14 + R() * 34;
    const ph = R() * 6;
    for (let d = 0; d <= len; d += 7) pts.push(x + d, y + Math.sin(d * k + ph) * amp);
    if (curl) {
      // The end of a gust curls back on itself, the way wind is drawn.
      const ex = pts[pts.length - 2]!;
      const ey = pts[pts.length - 1]!;
      const r0 = 20 + R() * 28;
      const dir = R() < 0.5 ? 1 : -1;
      for (let a = 0; a < Math.PI * 2.3; a += 0.22) {
        const r = r0 * (1 - a / (Math.PI * 2.9));
        pts.push(ex + Math.sin(a) * r, ey - dir * (1 - Math.cos(a)) * r);
      }
    }
    let total = 0;
    for (let i = 2; i < pts.length; i += 2) total += Math.hypot(pts[i]! - pts[i - 2]!, pts[i + 1]! - pts[i - 1]!);
    return { pts, len: total, head: 0, speed: 520 + R() * 420 };
  }

  private stepWind(s: number): void {
    const { w, h } = this;
    if (R() < s * (2.2 + this.intensity * 2) * this.lv.wind && this.gusts.length < 16) {
      this.gusts.push(this.gust(-w * 0.1 + R() * w * 0.5, h * (0.1 + R() * 0.8), w * (0.35 + R() * 0.45), R() < 0.8));
    }
    for (const g of this.gusts) g.head += g.speed * s;
    this.gusts = this.gusts.filter((g) => g.head < g.len + 320);
    const want = Math.round(16 * this.lv.wind);
    while (this.leaves.length < want) this.leaves.push(part(-40 - R() * w * 0.5, R() * h, 0, 0, 0.6 + R() * 0.8));
    for (const l of this.leaves) {
      l.a += s;
      l.x += (150 + this.energy * 160 + Math.sin(l.a * 1.3 + l.s) * 60) * s * l.z;
      l.y += (Math.sin(l.a * 2.1 + l.s) * 50 + 14) * s;
      if (l.x > w + 60 || l.y > h + 60) Object.assign(l, part(-60, R() * h * 0.9, 0, 0, l.z));
    }
  }

  private stepSnow(s: number): void {
    const { w, h } = this;
    const want = Math.round(190 * this.lv.snow * (0.55 + this.intensity * 0.5));
    let base = this.flakes.filter((f) => f.l === 0).length;
    while (base < want) {
      this.flakes.push(part(R() * w, -20 - R() * h, 0, 0, R()));
      base++;
    }
    for (const f of this.flakes) {
      f.a += s;
      if (f.l) {
        f.vy += 60 * s;
        f.vx *= 1 - s * 1.5;
      } else {
        f.vy = 14 + f.z * 34;
        f.vx = Math.sin(this.t * 0.6 + f.s) * f.z * 14 + 8;
      }
      f.x += f.vx * s;
      f.y += f.vy * s;
      if (!f.l && f.y > h + 20) {
        f.y = -20;
        f.x = R() * w;
      }
    }
    this.flakes = this.flakes.filter((f) => !f.l || f.a < f.l);
    for (const cap of this.caps.values()) {
      for (let i = 0; i < cap.length; i++) cap[i] = Math.min(1, cap[i]! + s * (0.02 + R() * 0.05) * (0.6 + this.intensity));
    }
  }

  private stepSun(s: number): void {
    const { w, h } = this;
    const want = Math.round(70 * this.lv.sun);
    let base = this.motes.filter((m) => m.l === 0).length;
    while (base < want) {
      this.motes.push(part(R() * w, R() * h, 0, 0, R()));
      base++;
    }
    for (const m of this.motes) {
      m.a += s;
      m.x += (m.vx + Math.sin(m.a * 0.4 + m.s) * 9 + 4) * s;
      m.y += (m.vy + Math.cos(m.a * 0.33 + m.s) * 7 - 3) * s;
      if (!m.l && (m.x > w + 10 || m.y < -10)) Object.assign(m, part(R() * w * 0.6, h + 5, 0, 0, m.z));
    }
    this.motes = this.motes.filter((m) => !m.l || m.a < m.l);
  }

  private stepFire(s: number): void {
    const { w, h } = this;
    const want = Math.round(80 * this.lv.fire * (0.6 + this.intensity * 0.5));
    let base = this.embers.filter((e) => e.l === 0).length;
    while (base < want) {
      const e = part(R() * w, h + R() * h * 0.5, 0, -(50 + R() * 90), R());
      this.embers.push(e);
      base++;
    }
    for (const e of this.embers) {
      e.a += s;
      if (e.l) {
        e.vy += 90 * s;
        e.vx *= 1 - s * 2;
      }
      e.x += (e.vx + Math.sin(e.a * 2.4 + e.s) * 24) * s;
      e.y += e.vy * s;
      if (!e.l && e.y < -20) Object.assign(e, part(R() * w, h + 20, 0, -(50 + R() * 90), e.z));
    }
    this.embers = this.embers.filter((e) => !e.l || e.a < e.l);
  }

  private stepRings(dt: number): void {
    for (const r of this.rings) r.a += dt;
    this.rings = this.rings.filter((r) => r.a < r.l);
  }

  // ------------------------------------------------------------- draw

  /** Behind the ink. */
  back(c: CanvasRenderingContext2D): void {
    c.save();
    if (this.lv.rain) this.backRain(c, this.lv.rain);
    if (this.lv.matrix) this.backMatrix(c, this.lv.matrix);
    if (this.lv.sakura) this.backSakura(c, this.lv.sakura);
    if (this.lv.snow) this.backSnow(c, this.lv.snow);
    if (this.lv.sun) this.backSun(c, this.lv.sun);
    if (this.lv.fire) this.backFire(c, this.lv.fire);
    if (this.lv.sea) this.backSea(c, this.lv.sea);
    c.restore();
  }

  /**
   * In front of the ink. `page` is the frame so far (device pixels), for
   * the rain beads to refract.
   */
  front(c: CanvasRenderingContext2D, page: HTMLCanvasElement, rows: Row[], fs: number, advance: number): void {
    c.save();
    if (this.lv.rain) this.frontRain(c, this.lv.rain);
    void page;
    if (this.lv.wind) this.frontWind(c, this.lv.wind);
    if (this.lv.terminal) this.frontTerminal(c, this.lv.terminal);
    if (this.lv.sakura) this.frontSakura(c, this.lv.sakura);
    if (this.lv.snow) this.frontSnow(c, rows, fs, advance, this.lv.snow);
    if (this.lv.sun) this.frontSun(c, this.lv.sun);
    if (this.lv.fire) this.frontFire(c, this.lv.fire);
    if (this.rings.length) this.drawRings(c);
    c.restore();
    c.globalAlpha = 1;
    c.globalCompositeOperation = "source-over";
  }

  private frontWind(c: CanvasRenderingContext2D, lv: number): void {
    this.pencil ??= graphite(c);
    if (!this.pencil) return;
    c.strokeStyle = this.pencil;
    c.lineCap = "round";
    c.lineJoin = "round";
    for (const g of this.gusts) {
      const tail = g.head - 480;
      // Two passes, a hair apart: a pencil line is never a single stroke.
      for (let pass = 0; pass < 2; pass++) {
        c.globalAlpha = lv * (pass ? 0.5 : 0.9);
        c.lineWidth = pass ? 1.1 : 2.2;
        c.beginPath();
        let d = 0;
        let started = false;
        const j = pass * 1.3;
        for (let i = 2; i < g.pts.length; i += 2) {
          d += Math.hypot(g.pts[i]! - g.pts[i - 2]!, g.pts[i + 1]! - g.pts[i - 1]!);
          if (d < tail) continue;
          if (d > g.head) break;
          const x = g.pts[i]! + j;
          const y = g.pts[i + 1]! - j;
          if (!started) {
            c.moveTo(x, y);
            started = true;
          } else c.lineTo(x, y);
        }
        c.stroke();
      }
    }
    for (const l of this.leaves) {
      const size = 12 + l.z * 12;
      c.save();
      c.translate(l.x, l.y);
      c.rotate(l.a * (1.2 + l.z) + l.s);
      c.scale(1, 0.45 + 0.55 * Math.abs(Math.cos(l.a * 1.7 + l.s)));
      c.globalAlpha = lv;
      c.lineWidth = 1.6;
      c.beginPath();
      c.moveTo(-size, 0);
      c.quadraticCurveTo(0, -size * 0.75, size, 0);
      c.quadraticCurveTo(0, size * 0.75, -size, 0);
      c.moveTo(-size * 1.25, 0);
      c.lineTo(size * 0.8, 0);
      // a little hatching on one side
      for (let k = -0.5; k <= 0.5; k += 0.25) {
        c.moveTo(k * size, 0);
        c.lineTo(k * size + size * 0.22, -size * 0.38);
      }
      c.stroke();
      c.restore();
    }
    c.globalAlpha = 1;
  }

  private backSnow(c: CanvasRenderingContext2D, lv: number): void {
    const { w, h } = this;
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, `rgba(20,30,46,${0.4 * lv})`);
    g.addColorStop(1, `rgba(150,180,210,${0.22 * lv})`);
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    c.fillStyle = "#ffffff";
    for (const f of this.flakes) {
      if (f.z > 0.55) continue;
      c.globalAlpha = (0.25 + f.z) * lv;
      c.beginPath();
      c.arc(f.x, f.y, 0.7 + f.z * 2, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;
  }

  private frontSnow(c: CanvasRenderingContext2D, rows: Row[], fs: number, advance: number, lv: number): void {
    this.soft ??= glow("255,255,255");
    for (const f of this.flakes) {
      if (f.z <= 0.55) continue;
      const r = 2 + (f.z - 0.55) * 22;
      c.globalAlpha = (f.l ? 1 - f.a / f.l : 0.85) * lv;
      c.drawImage(this.soft, f.x - r, f.y - r, r * 2, r * 2);
    }
    // Snow settles on the tops of the letters: a soft mound on each one,
    // higher on tall letters, growing while it keeps snowing.
    const seen = new Set<number>();
    for (const row of rows) {
      seen.add(row.id);
      let cap = this.caps.get(row.id);
      const n = row.text.length;
      if (!cap || cap.length !== n) {
        const next = new Float32Array(n);
        if (cap) next.set(cap.subarray(0, Math.min(n, cap.length)));
        cap = next;
        this.caps.set(row.id, cap);
      }
      for (let pass = 0; pass < 2; pass++) {
        c.globalAlpha = (pass ? 0.96 : 0.35) * lv;
        c.fillStyle = pass ? "#F7FBFF" : "#7F9AB6";
        c.beginPath();
        for (let i = 0; i < n; i++) {
          const ch = row.text[i]!;
          if (!/[a-zA-Z0-9]/.test(ch)) continue;
          const tall = /[A-Zbdfhklt0-9]/.test(ch);
          const g = cap[i]!;
          if (g < 0.04) continue;
          const x = row.xs + (i + 0.5) * advance;
          const top = row.y - fs * (tall ? 0.73 : 0.52) + (pass ? 0 : 1.5);
          const rx = advance * (0.42 + g * 0.16);
          const ry = fs * 0.24 * g * (0.8 + 0.2 * Math.sin(i * 2.3 + row.id));
          c.moveTo(x + rx, top);
          c.ellipse(x, top, rx, ry, 0, 0, Math.PI, true);
        }
        c.fill();
      }
    }
    for (const id of this.caps.keys()) if (!seen.has(id)) this.caps.delete(id);
    c.globalAlpha = 1;
  }

  private backSun(c: CanvasRenderingContext2D, lv: number): void {
    const { w, h } = this;
    const sx = w * 0.88;
    const sy = -h * 0.1;
    const reach = Math.hypot(w, h) * 1.05;
    const g = c.createRadialGradient(sx, sy, 0, sx, sy, reach);
    g.addColorStop(0, `rgba(255,196,110,${0.55 * lv})`);
    g.addColorStop(0.45, `rgba(255,170,90,${0.16 * lv})`);
    g.addColorStop(1, "rgba(255,160,80,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    // God rays: long thin wedges from the sun, swaying slowly.
    c.beginPath();
    for (let i = 0; i < 7; i++) {
      const a = Math.PI * (0.55 + i * 0.07) + Math.sin(this.t * 0.07 + i * 1.9) * 0.025;
      const wd = 0.012 + (i % 3) * 0.009;
      c.moveTo(sx, sy);
      c.lineTo(sx + Math.cos(a - wd) * reach, sy + Math.sin(a - wd) * reach);
      c.lineTo(sx + Math.cos(a + wd) * reach, sy + Math.sin(a + wd) * reach);
      c.closePath();
    }
    const rg = c.createRadialGradient(sx, sy, 0, sx, sy, reach);
    rg.addColorStop(0, `rgba(255,236,190,${0.32 * lv})`);
    rg.addColorStop(1, "rgba(255,236,190,0)");
    c.fillStyle = rg;
    c.fill();
  }

  private frontSun(c: CanvasRenderingContext2D, lv: number): void {
    const { w, h } = this;
    this.soft ??= glow("255,255,255");
    for (const m of this.motes) {
      const tw = 0.5 + 0.5 * Math.sin(m.a * 2.2 + m.s);
      const r = 1 + m.z * 2.6;
      c.globalAlpha = lv * (m.l ? 1 - m.a / m.l : 0.35 + tw * 0.5);
      c.drawImage(this.soft, m.x - r * 2, m.y - r * 2, r * 4, r * 4);
    }
    // A light leak breathing at the edge, and grain, like film.
    const leak = c.createLinearGradient(w, 0, w * 0.7, 0);
    leak.addColorStop(0, `rgba(255,110,50,${(0.12 + 0.05 * Math.sin(this.t * 0.5)) * lv})`);
    leak.addColorStop(1, "rgba(255,110,50,0)");
    c.globalAlpha = 1;
    c.fillStyle = leak;
    c.fillRect(w * 0.7, 0, w * 0.3, h);
    this.film ??= grain(c);
    if (this.film) {
      c.save();
      c.translate(-Math.floor(R() * 128), -Math.floor(R() * 128));
      c.globalAlpha = 0.5 * lv;
      c.fillStyle = this.film;
      c.fillRect(0, 0, w + 128, h + 128);
      c.restore();
    }
    c.globalAlpha = 1;
  }

  private backFire(c: CanvasRenderingContext2D, lv: number): void {
    const { w, h } = this;
    const flicker = 0.82 + 0.1 * Math.sin(this.t * 9.3) + 0.08 * Math.sin(this.t * 23.1);
    const g = c.createRadialGradient(w / 2, h * 1.12, 0, w / 2, h * 1.12, h * 1.05);
    g.addColorStop(0, `rgba(255,120,40,${0.5 * lv * flicker})`);
    g.addColorStop(0.5, `rgba(180,50,20,${0.18 * lv * flicker})`);
    g.addColorStop(1, "rgba(120,30,10,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  }

  private frontFire(c: CanvasRenderingContext2D, lv: number): void {
    this.ember ??= glow("255,150,60");
    c.globalCompositeOperation = "lighter";
    for (const e of this.embers) {
      const life = e.l ? 1 - e.a / e.l : Math.min(1, (this.h - e.y) / (this.h * 0.9));
      const fl = 0.6 + 0.4 * Math.sin(e.a * 13 + e.s);
      const r = (e.l ? 3 : 2 + e.z * 5) * (0.6 + life * 0.6);
      c.globalAlpha = Math.max(0, life * fl * lv);
      c.drawImage(this.ember, e.x - r * 2.5, e.y - r * 2.5, r * 5, r * 5);
    }
    c.globalCompositeOperation = "source-over";
    c.globalAlpha = 1;
  }

  private backSea(c: CanvasRenderingContext2D, lv: number): void {
    const { w, h } = this;
    const amp = 0.7 + this.energy * 0.7 + this.intensity * 0.3;
    // Ink-wash bands, darker as they come forward, each with its own swell.
    for (let k = 0; k < 4; k++) {
      const base = h * (0.8 + k * 0.05);
      const A = (7 + k * 5) * amp;
      c.beginPath();
      c.moveTo(0, h);
      for (let x = 0; x <= w + 12; x += 12) {
        const y = base + A * Math.sin(x * (0.006 + k * 0.002) + this.t * (0.5 + k * 0.25) + k * 1.7) + A * 0.4 * Math.sin(x * 0.019 - this.t * 0.9 + k);
        c.lineTo(x, y);
      }
      c.lineTo(w, h);
      c.closePath();
      c.globalAlpha = (0.1 + k * 0.09) * lv;
      c.fillStyle = "#1D2946";
      c.fill();
      if (k === 3) {
        // Foam on the nearest crest: little claws of paper showing through.
        c.globalAlpha = 0.85 * lv;
        c.fillStyle = "#F0E8D8";
        for (let x = 6; x < w; x += 18) {
          const y = base + A * Math.sin(x * 0.012 + this.t * 1.25 + 5.1) + A * 0.4 * Math.sin(x * 0.019 - this.t * 0.9 + 3);
          c.beginPath();
          c.arc(x, y + 2, 1.6 + 1.4 * Math.abs(Math.sin(x * 0.07 + this.t)), 0, Math.PI * 2);
          c.fill();
        }
      }
    }
    // A couple of gulls, two strokes each.
    c.globalAlpha = 0.6 * lv;
    c.strokeStyle = "#1D2946";
    c.lineWidth = 1.3;
    c.beginPath();
    for (let i = 0; i < 3; i++) {
      const gx = ((this.t * (14 + i * 5) + i * 300) % (w + 120)) - 60;
      const gy = h * (0.18 + i * 0.07) + Math.sin(this.t * 0.8 + i) * 8;
      const flap = 4 + 3 * Math.sin(this.t * 6 + i * 2);
      c.moveTo(gx - 8, gy - flap);
      c.quadraticCurveTo(gx - 3, gy - 2, gx, gy);
      c.quadraticCurveTo(gx + 3, gy - 2, gx + 8, gy - flap);
    }
    c.stroke();
    c.globalAlpha = 1;
  }

  /** What a fresh glyph shows. In the matrix, letters decode out of noise. */
  glyph(ch: string, age: number): string {
    if (this.id !== "matrix" || ch === " " || age > 240) return ch;
    return KANA[(Math.floor(age / 45) * 7 + ch.charCodeAt(0) * 13) % KANA.length]!;
  }

  /** Light the ink gives off in this world, if any: phosphor. */
  glow(): { color: string; blur: number } | null {
    if (this.id === "matrix") return { color: "rgba(61,255,119,0.85)", blur: 12 };
    if (this.id === "terminal") return { color: "rgba(255,160,40,0.8)", blur: 9 };
    return null;
  }

  // ------------------------------------------------------- rain (lofi)

  private stepRain(s: number): void {
    const { w, h } = this;
    if (!this.bokeh.length) {
      const r = rng(11);
      for (let i = 0; i < 30; i++) {
        const b = part(r() * w, h * (0.2 + r() * 0.8), (r() - 0.5) * 5, 0, r());
        b.s = r() * 1000;
        this.bokeh.push(b);
      }
    }
    const want = Math.round((70 + 170 * this.energy + 200 * Math.max(0, this.intensity - 0.62)) * this.lv.rain);
    while (this.drops.length < want) this.drops.push(part(R() * w * 1.25 - w * 0.25, -R() * h, 0, 0, R()));
    if (this.drops.length > want) this.drops.length = want;
    const fall = 0.75 + this.energy * 0.6;
    for (const d of this.drops) {
      const v = (700 + 900 * d.z) * fall;
      d.y += v * s;
      d.x += v * 0.18 * s;
      if (d.y > h + 60) {
        d.y = -40 - R() * 120;
        d.x = R() * w * 1.25 - w * 0.25;
      }
    }
    for (const b of this.bokeh) {
      b.a += s;
      b.x += b.vx * s;
      if (b.x < -80) b.x = w + 80;
      if (b.x > w + 80) b.x = -80;
    }
    if (this.intensity > 0.85 && R() < s * 0.06) this.flash = 1;
    this.flash *= Math.exp(-s * 7);
  }

  private backRain(c: CanvasRenderingContext2D, lv: number): void {
    const { w, h } = this;
    // Haze over the city, deepening toward the street.
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "rgba(20,18,46,0)");
    g.addColorStop(1, `rgba(96,62,128,${0.5 * lv})`);
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    // City lights, out of focus behind the glass.
    this.bokehSprites ??= ["255,158,107", "255,210,122", "255,111,163", "111,211,255", "182,156,255"].map(glow);
    c.globalCompositeOperation = "lighter";
    for (const b of this.bokeh) {
      const r = 16 + b.z * 64;
      const tw = 0.7 + 0.3 * Math.sin(this.t * 0.9 + b.s);
      c.globalAlpha = lv * (0.1 + 0.16 * (1 - b.z)) * tw;
      c.drawImage(this.bokehSprites[Math.floor(b.s) % 5]!, b.x - r, b.y - r, r * 2, r * 2);
    }
    c.globalCompositeOperation = "source-over";
    // Far rain: fine and faint.
    c.strokeStyle = "rgb(190,196,255)";
    c.lineWidth = 1;
    c.globalAlpha = 0.14 * lv;
    c.beginPath();
    for (const d of this.drops) {
      if (d.z >= 0.45) continue;
      const len = 10 + d.z * 26;
      c.moveTo(d.x, d.y);
      c.lineTo(d.x - len * 0.18, d.y - len);
    }
    c.stroke();
    c.globalAlpha = 1;
  }

  private frontRain(c: CanvasRenderingContext2D, lv: number): void {
    const { w, h } = this;
    c.strokeStyle = "rgb(214,220,255)";
    c.lineCap = "round";
    c.lineWidth = 1.3;
    c.globalAlpha = 0.3 * lv;
    c.beginPath();
    for (const d of this.drops) {
      if (d.z < 0.45) continue;
      const len = 26 + d.z * 46;
      c.moveTo(d.x, d.y);
      c.lineTo(d.x - len * 0.18, d.y - len);
    }
    c.stroke();
    // Mist off the street.
    const g = c.createLinearGradient(0, h * 0.72, 0, h);
    g.addColorStop(0, "rgba(170,150,230,0)");
    g.addColorStop(1, `rgba(170,150,230,${0.16 * lv})`);
    c.globalAlpha = 1;
    c.fillStyle = g;
    c.fillRect(0, h * 0.72, w, h * 0.28);
    if (this.flash > 0.02) {
      c.globalAlpha = this.flash * 0.3 * lv;
      c.fillStyle = "#E8E6FF";
      c.fillRect(0, 0, w, h);
    }
    c.globalAlpha = 1;
  }

  // ------------------------------------------------------------ matrix

  private stepMatrix(s: number): void {
    const { w, h } = this;
    const d = Math.min(2, window.devicePixelRatio || 1);
    let warm = 0;
    if (!this.code || this.code.width !== Math.round(w * d) || this.code.height !== Math.round(h * d)) {
      this.code = document.createElement("canvas");
      this.code.width = Math.round(w * d);
      this.code.height = Math.round(h * d);
      this.cols = Array.from({ length: Math.ceil(w / CELL) }, () => ({ y: R() * h, v: 7 + R() * 16, cell: -1 }));
      warm = 90;
    }
    const x = this.code.getContext("2d")!;
    x.setTransform(d, 0, 0, d, 0, 0);
    x.font = `500 ${CELL - 4}px ${MONO}`;
    x.textAlign = "center";
    x.textBaseline = "middle";
    const step = (dt: number) => {
      // Old code fades where it fell.
      x.globalCompositeOperation = "destination-out";
      x.fillStyle = `rgba(0,0,0,${1 - Math.exp(-dt * 1.5)})`;
      x.fillRect(0, 0, w, h);
      x.globalCompositeOperation = "source-over";
      const pace = 0.7 + this.energy * 0.8;
      this.cols.forEach((col, i) => {
        col.y += col.v * CELL * dt * pace;
        const cell = Math.floor(col.y / CELL);
        if (cell !== col.cell) {
          col.cell = cell;
          x.fillStyle = R() < 0.1 ? "#B8FFC9" : "#22D35A";
          x.fillText(KANA[Math.floor(R() * KANA.length)]!, i * CELL + CELL / 2, cell * CELL + CELL / 2);
        }
        if (col.y > h + R() * h * 0.6) {
          col.y = -R() * h * 0.4;
          col.v = 7 + R() * 16;
        }
      });
    };
    for (let i = 0; i < warm; i++) step(1 / 30);
    if (s > 0) step(s);
  }

  private backMatrix(c: CanvasRenderingContext2D, lv: number): void {
    if (!this.code) return;
    const { w, h } = this;
    c.globalAlpha = lv * 0.5;
    c.drawImage(this.code, 0, 0, w, h);
    // The leading glyph of every stream burns white.
    c.globalAlpha = lv * 0.85;
    c.fillStyle = "#E6FFEC";
    c.font = `600 ${CELL - 4}px ${MONO}`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    const flick = Math.floor(this.t * 14);
    this.cols.forEach((col, i) => {
      if (col.cell < 0 || col.cell * CELL > h) return;
      c.fillText(KANA[(i * 7 + col.cell * 13 + flick) % KANA.length]!, i * CELL + CELL / 2, col.cell * CELL + CELL / 2);
    });
    c.textAlign = "left";
    c.textBaseline = "alphabetic";
    c.globalAlpha = 1;
  }

  // ---------------------------------------------------------- terminal

  private frontTerminal(c: CanvasRenderingContext2D, lv: number): void {
    const { w, h } = this;
    if (!this.scan) {
      const sc = document.createElement("canvas");
      sc.width = 1;
      sc.height = 3;
      const x = sc.getContext("2d")!;
      x.fillStyle = "rgba(0,0,0,0.55)";
      x.fillRect(0, 2, 1, 1);
      this.scan = c.createPattern(sc, "repeat");
    }
    // Scanlines.
    c.globalAlpha = lv * 0.45;
    c.fillStyle = this.scan!;
    c.fillRect(0, 0, w, h);
    // The refresh rolling down the tube.
    const y = ((this.t * 0.14) % 1) * h * 1.4 - h * 0.2;
    const band = c.createLinearGradient(0, y - h * 0.1, 0, y);
    band.addColorStop(0, "rgba(255,185,64,0)");
    band.addColorStop(1, "rgba(255,185,64,0.07)");
    c.globalAlpha = lv;
    c.fillStyle = band;
    c.fillRect(0, y - h * 0.1, w, h * 0.1);
    // The tube: dark corners, a rounded glass edge in a black bezel.
    const R0 = Math.hypot(w, h) / 2;
    const v = c.createRadialGradient(w / 2, h / 2, R0 * 0.55, w / 2, h / 2, R0);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0,0.75)");
    c.fillStyle = v;
    c.fillRect(0, 0, w, h);
    c.fillStyle = "#050403";
    c.beginPath();
    c.rect(0, 0, w, h);
    c.roundRect(10, 10, w - 20, h - 20, Math.min(w, h) * 0.045);
    c.fill("evenodd");
    // It boots when you open it.
    const lines = ["type/os 0.9 . phosphor", "mounting /dev/thoughts ...... ok", "warming the tube ............ ok", "ready."];
    let left = this.boot * 60;
    const fade = Math.min(1, Math.max(0, (9 - this.boot) / 2));
    if (fade > 0 && left > 0) {
      c.font = `500 12px ${MONO}`;
      c.fillStyle = "#FFB940";
      c.globalAlpha = lv * 0.75 * fade;
      lines.forEach((ln, i) => {
        if (left <= 0) return;
        c.fillText(ln.slice(0, Math.floor(left)), 30, h - 36 - (lines.length - 1 - i) * 17);
        left -= ln.length + 6;
      });
    }
    c.globalAlpha = 1;
  }

  // ------------------------------------------------------------ sakura

  private stepSakura(s: number): void {
    const { w, h } = this;
    const want = Math.round((26 + 70 * this.energy + 60 * Math.max(0, this.intensity - 0.62)) * this.lv.sakura);
    let base = this.petals.filter((p) => p.l === 0).length;
    while (base < want) {
      this.petals.push(petal(R() * w * 1.3 - w * 0.3, -20 - R() * h * 0.5));
      base++;
    }
    const wind = 30 + 150 * this.energy;
    for (const p of this.petals) {
      p.a += s;
      const gust = wind * (0.6 + 0.4 * Math.sin(this.t * 0.5 + p.s));
      p.vx += (gust - p.vx) * Math.min(1, s * 0.8);
      p.x += (p.vx * (0.5 + p.z * 0.5) + Math.sin(p.a * 1.7 + p.s) * 24) * s;
      p.y += (34 + 46 * p.z) * s;
      p.rot += p.vr * s;
      p.spin += p.vs * s;
      if (!p.l && (p.y > h + 30 || p.x > w + 40)) Object.assign(p, petal(R() * w * 1.1 - w * 0.3, -30));
    }
    this.petals = this.petals.filter((p) => !p.l || p.a < p.l);
    for (const sp of this.sparkles) sp.a += s;
    this.sparkles = this.sparkles.filter((sp) => sp.a < sp.l);
  }

  private backSakura(c: CanvasRenderingContext2D, lv: number): void {
    const { w, h } = this;
    // Spring light pouring in from the top right corner.
    const sun = c.createRadialGradient(w * 0.92, -h * 0.05, 0, w * 0.92, -h * 0.05, Math.max(w, h) * 0.75);
    sun.addColorStop(0, `rgba(255,255,255,${0.9 * lv})`);
    sun.addColorStop(0.4, `rgba(255,226,236,${0.35 * lv})`);
    sun.addColorStop(1, "rgba(255,226,236,0)");
    c.fillStyle = sun;
    c.fillRect(0, 0, w, h);
    const breathe = 0.75 + 0.25 * Math.sin(this.t * 0.4);
    for (let i = 0; i < 5; i++) {
      const a = 2.2 + i * 0.13;
      const len = Math.hypot(w, h) * 1.2;
      const spread = 0.025 + 0.012 * (i % 2);
      c.globalAlpha = lv * 0.14 * breathe * (i % 2 ? 0.7 : 1);
      const ray = c.createLinearGradient(w * 0.92, 0, w * 0.92 + Math.cos(a) * len, Math.sin(a) * len);
      ray.addColorStop(0, "rgba(255,255,255,1)");
      ray.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = ray;
      c.beginPath();
      c.moveTo(w * 0.92, -h * 0.05);
      c.lineTo(w * 0.92 + Math.cos(a - spread) * len, Math.sin(a - spread) * len);
      c.lineTo(w * 0.92 + Math.cos(a + spread) * len, Math.sin(a + spread) * len);
      c.closePath();
      c.fill();
    }
    c.globalAlpha = 1;
    this.drawPetals(c, lv, false);
  }

  private frontSakura(c: CanvasRenderingContext2D, lv: number): void {
    this.drawPetals(c, lv, true);
    // Kira kira: sparkles where the keys land.
    this.ember ??= glow("255,150,190");
    for (const sp of this.sparkles) {
      const k = sp.a / sp.l;
      const sc = Math.sin(k * Math.PI);
      const r = sp.z * sc;
      c.save();
      c.translate(sp.x, sp.y + sp.vy * sp.a);
      c.globalAlpha = lv * sc * 0.7;
      c.drawImage(this.ember, -r * 2.2, -r * 2.2, r * 4.4, r * 4.4);
      c.rotate(k * 1.2);
      c.globalAlpha = lv * sc;
      c.fillStyle = "#FFFFFF";
      sparklePath(c, r * 1.6);
      c.fill();
      c.restore();
    }
    c.globalAlpha = 1;
  }

  private drawPetals(c: CanvasRenderingContext2D, lv: number, near: boolean): void {
    this.petalSprites ??= [
      petalSprite("#F48FB1", "#FFE4EC"),
      petalSprite("#F7A1C0", "#FFF1F5"),
      petalSprite("#EE7FA6", "#FFD9E6")
    ];
    const m = c.getTransform();
    for (const p of this.petals) {
      if (p.z >= 0.35 !== near) continue;
      const size = 5 + p.z * 12;
      // Fluttering: the petal turns edge-on and back as it falls.
      const flip = Math.cos(p.spin);
      const sx = Math.sign(flip || 1) * Math.max(0.18, Math.abs(flip));
      const cos = Math.cos(p.rot);
      const sin = Math.sin(p.rot);
      c.setTransform(
        m.a * cos * sx,
        m.a * sin * sx,
        -m.a * sin,
        m.a * cos,
        m.a * p.x + m.e,
        m.d * p.y + m.f
      );
      c.globalAlpha = lv * (near ? 0.95 : 0.55);
      c.drawImage(this.petalSprites[p.k]!, -size, -size, size * 2, size * 2);
    }
    c.setTransform(m);
    c.globalAlpha = 1;
  }

  private drawRings(c: CanvasRenderingContext2D): void {
    const sea = this.id === "sea";
    c.strokeStyle = sea ? "#2E5EA8" : "rgba(200,228,250,1)";
    c.lineWidth = 1;
    for (const r of this.rings) {
      const k = r.a / r.l;
      for (let i = 0; i < (sea ? 3 : 1); i++) {
        const kk = k - i * 0.12;
        if (kk <= 0) continue;
        c.globalAlpha = (1 - kk) * 0.6;
        c.beginPath();
        c.ellipse(r.x, r.y, 6 + kk * (sea ? 60 : 34), 1.5 + kk * (sea ? 9 : 5), 0, 0, Math.PI * 2);
        c.stroke();
      }
    }
    c.globalAlpha = 1;
  }
}
