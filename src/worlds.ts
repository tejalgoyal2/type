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

export type WorldId = "rain" | "wind" | "night" | "snow" | "sun" | "fire" | "sea";

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
    words: "rain rains rainy raining rained drizzle downpour storm stormy thunder lightning umbrella puddle puddles monsoon showers".split(" "),
    pal: pal("rain", true, "#16202A", "#D6E0EA", "#8EC5EE", "#34465A", "#8EC5EE", "#0E151C")
  },
  {
    id: "wind",
    words: "wind winds windy breeze breezy gust gusts gusty blow blowing blew autumn leaves kite hurricane tornado".split(" "),
    pal: pal("wind", false, "#EEE9DE", "#2E2F35", "#6E6F78", "#CBC4B5", "#2E2F35", "#EEE9DE")
  },
  {
    id: "night",
    words: "night nights midnight tonight dark darkness stars starry moon moonlight galaxy cosmos universe space orbit nebula".split(" "),
    pal: pal("night", true, "#04070D", "#9CF0C4", "#E8FFF3", "#173528", "#9CF0C4", "#04070D")
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

/** Shading for a water bead on glass: dark lower rim, bright upper glint. */
function beadSprite(): HTMLCanvasElement {
  return sprite(64, (c, s) => {
    const r = s / 2;
    const rim = c.createRadialGradient(r, r * 0.8, r * 0.55, r, r, r);
    rim.addColorStop(0, "rgba(0,0,0,0)");
    rim.addColorStop(0.8, "rgba(4,10,18,0.25)");
    rim.addColorStop(1, "rgba(4,10,18,0.55)");
    c.fillStyle = rim;
    c.beginPath();
    c.arc(r, r, r - 0.5, 0, Math.PI * 2);
    c.fill();
    const lit = c.createRadialGradient(r * 0.72, r * 0.62, 0, r * 0.72, r * 0.62, r * 0.42);
    lit.addColorStop(0, "rgba(255,255,255,0.9)");
    lit.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = lit;
    c.fillRect(0, 0, s, s);
    c.strokeStyle = "rgba(220,238,255,0.35)";
    c.lineWidth = 1.5;
    c.beginPath();
    c.arc(r, r, r * 0.78, Math.PI * 0.15, Math.PI * 0.85);
    c.stroke();
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

/** Today's moon, dithered: phase from the real date. */
function moonSprite(): HTMLCanvasElement {
  const days = (Date.now() - Date.UTC(2000, 0, 6, 18, 14)) / 86400000;
  const phase = ((days % 29.530588) + 29.530588) % 29.530588 / 29.530588; // 0 new, .5 full
  const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  return sprite(40, (c, s) => {
    const r = s / 2 - 2;
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const dx = (x - s / 2 + 0.5) / r;
        const dy = (y - s / 2 + 0.5) / r;
        if (dx * dx + dy * dy > 1) continue;
        // The terminator: an ellipse sweeping across the disc with the phase.
        const z = Math.sqrt(1 - dy * dy);
        const k = Math.cos(phase * Math.PI * 2);
        const lit = phase < 0.5 ? dx > k * z : dx < -k * z;
        const shade = lit ? 0.85 - 0.25 * (dx * dx + dy * dy) : 0.07;
        if (shade * 16 > bayer[(y % 4) * 4 + (x % 4)]!) {
          c.fillStyle = "#9CF0C4";
          c.fillRect(x, y, 1, 1);
        }
      }
    }
  });
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

export class Worlds {
  id: WorldId | null = null;
  private heardAt = 0;
  private intensity = 0;
  private lv: Record<WorldId, number> = { rain: 0, wind: 0, night: 0, snow: 0, sun: 0, fire: 0, sea: 0 };
  private energy = 0;
  private t = 0;
  private w = 1;
  private h = 1;

  // rain
  private streaks: P[] = [];
  private beads: P[] = [];
  private splashes: P[] = [];
  private flash = 0;
  private bolt: number[] | null = null;
  private lens: HTMLCanvasElement | null = null;
  private bead: HTMLCanvasElement | null = null;
  // wind
  private gusts: Gust[] = [];
  private leaves: P[] = [];
  private pencil: CanvasPattern | null = null;
  // night
  private stars: P[] = [];
  private moon: HTMLCanvasElement | null = null;
  private sparks: P[] = [];
  private shooting: P | null = null;
  private scan: CanvasPattern | null = null;
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
      for (let i = 0; i < 5; i++) this.splashes.push(part(x, y, (R() - 0.5) * 160, -90 - R() * 120, 0, 0.45));
      this.rings.push(part(x, y, 0, 0, 1, 0.7));
    } else if (id === "wind") {
      if (this.gusts.length < 14) this.gusts.push(this.gust(x - 40, y - 18, 160 + R() * 120, true));
    } else if (id === "night") {
      for (let i = 0; i < 3; i++) this.sparks.push(part(x + (R() - 0.5) * 10, y - 14, (R() - 0.5) * 30, -40 - R() * 50, 0, 0.6));
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
    if (this.lv.wind) this.stepWind(s);
    if (this.lv.night) this.stepNight(s);
    if (this.lv.snow) this.stepSnow(s);
    if (this.lv.sun) this.stepSun(s);
    if (this.lv.fire) this.stepFire(s);
    if (this.lv.sea || this.lv.rain) this.stepRings(dt);
  }

  private drop(id: WorldId): void {
    if (id === "rain") {
      this.streaks = [];
      this.beads = [];
      this.splashes = [];
      this.bolt = null;
    } else if (id === "wind") {
      this.gusts = [];
      this.leaves = [];
    } else if (id === "night") {
      this.sparks = [];
      this.shooting = null;
    } else if (id === "snow") {
      this.flakes = [];
      this.caps.clear();
    } else if (id === "sun") this.motes = [];
    else if (id === "fire") this.embers = [];
  }

  // ------------------------------------------------------------ steps

  private stepRain(s: number): void {
    const { w, h } = this;
    const want = Math.round(170 * this.lv.rain * (0.5 + this.intensity * 0.6));
    while (this.streaks.length < want) {
      const z = R();
      this.streaks.push(part(R() * w * 1.1, R() * h, 0, 900 + z * 900, z));
    }
    if (this.streaks.length > want) this.streaks.length = want;
    for (const p of this.streaks) {
      p.y += p.vy * s;
      p.x += p.vy * 0.12 * s;
      if (p.y > h + 40) {
        p.y = -60 - R() * 80;
        p.x = R() * w * 1.1 - w * 0.08;
      }
    }
    // Beads on the glass: most rest, the heavy ones run.
    const beads = Math.round(120 * this.lv.rain);
    while (this.beads.length < beads) {
      const r = R() < 0.3 ? 5 + R() * 8 : 1.4 + R() * 2.8;
      this.beads.push(part(R() * w, R() * h, 0, 0, r));
    }
    for (const b of this.beads) {
      b.a += s;
      if (b.z > 7 && b.vy === 0 && R() < s * 0.06) b.vy = 30;
      if (b.vy > 0) {
        b.vy = Math.min(220, b.vy + 120 * s);
        b.y += b.vy * s;
        b.x += Math.sin(b.a * 7 + b.s) * 6 * s;
        if (b.l === 0) b.l = b.y; // trail starts where it began to run
        if (b.y - b.z > h) Object.assign(b, part(R() * w, -10 - R() * h * 0.3, 0, 0, b.z));
      }
    }
    for (const p of this.splashes) {
      p.a += s;
      p.vy += 700 * s;
      p.x += p.vx * s;
      p.y += p.vy * s;
    }
    this.splashes = this.splashes.filter((p) => p.a < p.l);
    // Storm words bring lightning.
    this.flash = Math.max(0, this.flash - s * 3.2);
    if (this.intensity > 0.85 && R() < s * 0.09) {
      this.flash = 1;
      const pts: number[] = [];
      let x = w * (0.15 + R() * 0.7);
      for (let y = 0; y < h * 0.62; y += 18 + R() * 26) {
        pts.push(x, y);
        x += (R() - 0.5) * 60;
      }
      this.bolt = pts;
    }
    if (this.flash === 0) this.bolt = null;
  }

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

  private stepNight(s: number): void {
    const { w, h } = this;
    if (!this.stars.length) {
      const r = rng(1931);
      for (let i = 0; i < 170; i++) this.stars.push({ x: r(), y: r() * 0.78, vx: 0, vy: 0, z: r(), a: 0, l: 0, s: r() * 100 });
    }
    for (const p of this.sparks) {
      p.a += s;
      p.x += p.vx * s;
      p.y += p.vy * s;
    }
    this.sparks = this.sparks.filter((p) => p.a < p.l);
    if (this.shooting) {
      this.shooting.a += s;
      if (this.shooting.a > this.shooting.l) this.shooting = null;
    } else if (R() < s * (0.05 + this.energy * 0.12)) {
      this.shooting = part(w * (0.1 + R() * 0.7), h * (0.05 + R() * 0.3), 520 + R() * 300, 180 + R() * 120, 0, 0.7);
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
    if (this.lv.night) this.backNight(c, this.lv.night);
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
    if (this.lv.rain) this.frontRain(c, page, this.lv.rain);
    if (this.lv.wind) this.frontWind(c, this.lv.wind);
    if (this.lv.night) this.frontNight(c, this.lv.night);
    if (this.lv.snow) this.frontSnow(c, rows, fs, advance, this.lv.snow);
    if (this.lv.sun) this.frontSun(c, this.lv.sun);
    if (this.lv.fire) this.frontFire(c, this.lv.fire);
    if (this.rings.length) this.drawRings(c);
    c.restore();
    c.globalAlpha = 1;
    c.globalCompositeOperation = "source-over";
  }

  private backRain(c: CanvasRenderingContext2D, lv: number): void {
    const { w, h } = this;
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, `rgba(6,10,16,${0.45 * lv})`);
    g.addColorStop(1, `rgba(60,96,130,${0.22 * lv})`);
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    // Rain falling beyond the glass, in three depths.
    for (let band = 0; band < 3; band++) {
      c.beginPath();
      for (const p of this.streaks) {
        if (Math.min(2, Math.floor(p.z * 3)) !== band) continue;
        const len = 18 + p.z * 46;
        c.moveTo(p.x, p.y);
        c.lineTo(p.x - len * 0.12, p.y - len);
      }
      c.strokeStyle = `rgba(175,205,232,${(0.07 + band * 0.07) * lv})`;
      c.lineWidth = 0.6 + band * 0.45;
      c.stroke();
    }
    if (this.bolt && this.flash > 0) {
      c.beginPath();
      const b = this.bolt;
      c.moveTo(b[0]!, b[1]!);
      for (let i = 2; i < b.length; i += 2) c.lineTo(b[i]!, b[i + 1]!);
      c.strokeStyle = `rgba(200,225,255,${0.25 * this.flash * lv})`;
      c.lineWidth = 9;
      c.stroke();
      c.strokeStyle = `rgba(245,250,255,${0.95 * this.flash * lv})`;
      c.lineWidth = 1.6;
      c.stroke();
    }
  }

  private frontRain(c: CanvasRenderingContext2D, page: HTMLCanvasElement, lv: number): void {
    const { w, h } = this;
    // A small copy of the page for the beads to see through. Each bead is
    // a lens: it shows a wider patch of the page behind it, upside down.
    const lw = Math.max(1, Math.round(w / 3));
    const lh = Math.max(1, Math.round(h / 3));
    if (!this.lens || this.lens.width !== lw || this.lens.height !== lh) {
      this.lens = document.createElement("canvas");
      this.lens.width = lw;
      this.lens.height = lh;
    }
    this.lens.getContext("2d")!.drawImage(page, 0, 0, page.width, page.height, 0, 0, lw, lh);
    this.bead ??= beadSprite();
    c.globalAlpha = lv;
    for (const b of this.beads) {
      const r = b.z;
      if (b.vy > 0 && b.l) {
        // A short wet trail, fading upward.
        const top = Math.max(b.l, b.y - 110);
        const g = c.createLinearGradient(0, top, 0, b.y);
        g.addColorStop(0, "rgba(190,220,245,0)");
        g.addColorStop(1, "rgba(190,220,245,0.22)");
        c.strokeStyle = g;
        c.lineWidth = r * 0.5;
        c.lineCap = "round";
        c.beginPath();
        c.moveTo(b.x, top);
        c.lineTo(b.x, b.y - r * 0.6);
        c.stroke();
      }
      if (r > 3.2) {
        c.save();
        c.beginPath();
        c.ellipse(b.x, b.y, r, r * (b.vy > 0 ? 1.18 : 1), 0, 0, Math.PI * 2);
        c.clip();
        c.translate(b.x, b.y);
        c.scale(1, -1);
        const span = r * 3.2;
        c.drawImage(this.lens, (b.x - span) / 3, (b.y - span) / 3, (span * 2) / 3, (span * 2) / 3, -r, -r, r * 2, r * 2);
        c.restore();
      }
      c.drawImage(this.bead, b.x - r, b.y - r, r * 2, r * 2);
    }
    // Splashes where keys land.
    c.fillStyle = "rgba(200,228,250,0.8)";
    for (const p of this.splashes) {
      c.globalAlpha = lv * (1 - p.a / p.l);
      c.beginPath();
      c.arc(p.x, p.y, 1.4, 0, Math.PI * 2);
      c.fill();
    }
    if (this.flash > 0) {
      c.globalAlpha = this.flash * 0.22 * lv;
      c.fillStyle = "#dbe9ff";
      c.fillRect(0, 0, w, h);
    }
    c.globalAlpha = 1;
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

  private backNight(c: CanvasRenderingContext2D, lv: number): void {
    const { w, h } = this;
    // Stars snap to a two-pixel grid and twinkle in steps, like a display.
    for (const st of this.stars) {
      const tw = Math.floor((0.5 + 0.5 * Math.sin(this.t * (1 + st.z * 2) + st.s)) * 4) / 4;
      const a = (0.25 + st.z * 0.75) * (0.45 + tw * 0.55) * lv;
      const size = st.z > 0.93 ? 3 : st.z > 0.6 ? 2 : 1;
      c.globalAlpha = a;
      c.fillStyle = st.z > 0.85 ? "#E8FFF3" : "#9CF0C4";
      c.fillRect(Math.round((st.x * w) / 2) * 2, Math.round((st.y * h) / 2) * 2, size, size);
    }
    // One constellation, drawn on like a plotter, with its catalog mark.
    const picks = [11, 37, 52, 74, 90, 103, 128];
    const pts = picks.map((i) => this.stars[i]!).map((s) => [Math.round((s.x * w * 0.5 + w * 0.08) / 2) * 2, Math.round((s.y * h * 0.4 + h * 0.06) / 2) * 2] as const);
    const drawn = Math.min(pts.length - 1, (this.t * 0.6) % (pts.length + 2));
    c.globalAlpha = 0.45 * lv;
    c.strokeStyle = "#9CF0C4";
    c.lineWidth = 1;
    c.beginPath();
    for (let i = 0; i < pts.length - 1 && i < drawn; i++) {
      const f = Math.min(1, drawn - i);
      const [x0, y0] = pts[i]!;
      const [x1, y1] = pts[i + 1]!;
      c.moveTo(x0, y0);
      c.lineTo(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f);
    }
    c.stroke();
    c.globalAlpha = 0.8 * lv;
    for (const [x, y] of pts) {
      c.fillRect(x - 4, y, 3, 1);
      c.fillRect(x + 2, y, 3, 1);
      c.fillRect(x, y - 4, 1, 3);
      c.fillRect(x, y + 2, 1, 3);
    }
    this.moon ??= moonSprite();
    c.imageSmoothingEnabled = false;
    c.globalAlpha = lv;
    const ms = Math.max(2, Math.round((Math.min(w, h) * 0.13) / 40));
    c.drawImage(this.moon, Math.round(w * 0.8 - 20 * ms), Math.round(h * 0.2 - 20 * ms), 40 * ms, 40 * ms);
    c.imageSmoothingEnabled = true;
    if (this.shooting) {
      const p = this.shooting;
      const k = p.a / p.l;
      const x = p.x + p.vx * p.a;
      const y = p.y + p.vy * p.a;
      for (let i = 0; i < 14; i++) {
        c.globalAlpha = lv * (1 - k) * (1 - i / 14);
        c.fillRect(Math.round((x - p.vx * i * 0.012) / 2) * 2, Math.round((y - p.vy * i * 0.012) / 2) * 2, 2, 2);
      }
    }
    c.globalAlpha = 1;
  }

  private frontNight(c: CanvasRenderingContext2D, lv: number): void {
    const { w, h } = this;
    c.fillStyle = "#E8FFF3";
    for (const p of this.sparks) {
      c.globalAlpha = lv * (1 - p.a / p.l);
      c.fillRect(Math.round(p.x / 2) * 2, Math.round(p.y / 2) * 2, 2, 2);
    }
    if (!this.scan) {
      const sc = sprite(3, (x) => {
        x.fillStyle = "rgba(0,0,0,0.55)";
        x.fillRect(0, 2, 3, 1);
      });
      this.scan = c.createPattern(sc, "repeat");
    }
    if (this.scan) {
      c.globalAlpha = 0.5 * lv;
      c.fillStyle = this.scan;
      c.fillRect(0, 0, w, h);
    }
    const v = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.62);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, `rgba(0,0,0,${0.55 * lv})`);
    c.globalAlpha = 1;
    c.fillStyle = v;
    c.fillRect(0, 0, w, h);
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
