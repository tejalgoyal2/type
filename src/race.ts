/**
 * The race layer: typing as driving.
 *
 * Speed is the engine. Every keystroke blips the revs, and fifteen shift
 * lights across the top fill green, red, then blue as you push through a
 * gear; hold the pace and the page shifts up. A finished line is a lap,
 * timed and colored the way F1 timing screens do it: purple for your
 * fastest, green for quicker than the last, yellow for slower. The camera
 * leans in as you speed up, speed lines streak in from the edges, and when
 * you hold top pace the letterbox bars slide in: you are in the film now.
 * Big moments land as comic bursts.
 *
 * Everything here draws over the finished page (a HUD), except the camera,
 * which the engine applies when it puts the page on screen.
 */
import { Spring } from "./springs";

/** Words per minute where each gear starts (gear 1 at 0). */
const GEARS = [0, 18, 32, 46, 60, 74, 88, 102];
const LEDS = 15;
const LED_COLORS = ["#27D86A", "#FF3B3B", "#4C7DFF"];
const PURPLE = "#A64DFF";
const GREEN = "#22C55E";
const YELLOW = "#F7C71C";
const SHIFT_FLASH_MS = 300;
const BURST_MS = 1450;
const LAP_MS = 4200;

export interface Look {
  ink: string;
  paper: string;
  sub: string;
  dark: boolean;
}

interface Burst {
  text: string;
  x: number;
  y: number;
  at: number;
  rot: number;
  seed: number;
}

interface Lap {
  row: number;
  x: number;
  at: number;
  wpm: number;
  n: number;
  color: string;
  label: string;
}

/** Small stable pseudo-random numbers, so a shape does not boil frame to frame. */
function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const easeOutBack = (t: number) => 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2;
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

export class Race {
  gear = 1;
  private topGear = 1;
  /** Progress through the current gear, 0..1, with keystroke blips on top. */
  private revs = new Spring(0, 160, 15);
  private shiftAt = -1e9;
  private gearPop = new Spring(0, 260, 14);
  private speed = 0;
  private zone = 0;
  private zoneSince: number | null = null;
  private zoom = new Spring(1, 120, 17);
  private tilt = new Spring(0, 140, 11);
  private shake = 0;
  private fx = 0;
  private fy = 0;
  private typing = false;
  private bursts: Burst[] = [];
  private laps: Lap[] = [];
  private bestLap = 0;
  private lastLap = 0;
  private lapNo = 0;

  /** A keystroke: the engine blips. */
  key(mm: number): void {
    if (mm > 0) this.revs.kick(1.1);
  }

  update(dt: number, now: number, wpm: number, typing: boolean, cx: number, cy: number, mm: number, w: number, h: number): void {
    this.typing = typing;
    // Gears, with a little hysteresis so a steady pace never hunts.
    while (this.gear < GEARS.length && typing && wpm > GEARS[this.gear]! + 2) {
      this.gear++;
      this.shift(now, mm, true);
    }
    while (this.gear > 1 && wpm < GEARS[this.gear - 1]! - 5) {
      this.gear--;
      this.shift(now, mm, false);
    }
    const lo = GEARS[this.gear - 1]!;
    const hi = GEARS[this.gear] ?? lo + 16;
    this.revs.target = typing ? clamp((wpm - lo) / (hi - lo), 0, 1) : 0;
    this.revs.update(dt);
    this.gearPop.target = 0;
    this.gearPop.update(dt);

    const sp = typing ? clamp((wpm - 35) / 65, 0, 1) : 0;
    this.speed += (sp - this.speed) * Math.min(1, dt * (sp > this.speed ? 1.5 : 3));

    // Hold top pace and the film takes over.
    if (typing && this.gear >= 6) this.zoneSince ??= now;
    else this.zoneSince = null;
    const inZone = this.zoneSince !== null && now - this.zoneSince > 2200;
    this.zone += ((inZone ? 1 : 0) - this.zone) * Math.min(1, dt * (inZone ? 1.4 : 2.6));

    // The camera leans toward the pen as you speed up.
    this.zoom.target = 1 + 0.03 * this.speed * mm;
    this.zoom.update(dt);
    this.tilt.target = 0;
    this.tilt.update(dt);
    this.shake *= Math.exp(-dt * 8);
    const k = Math.min(1, dt * 4);
    this.fx += ((w / 2) * 0.45 + cx * 0.55 - this.fx) * k;
    this.fy += (cy - this.fy) * k;
    if (this.fx === 0) {
      this.fx = cx;
      this.fy = cy;
    }
    void h;

    this.bursts = this.bursts.filter((b) => now - b.at < BURST_MS);
    this.laps = this.laps.filter((l) => now - l.at < LAP_MS);
  }

  private shift(now: number, mm: number, up: boolean): void {
    if (!up) return;
    this.shiftAt = now;
    this.gearPop.kick(9);
    this.zoom.kick(0.18 * mm);
    if (this.gear > this.topGear) {
      this.topGear = this.gear;
      const words: Record<number, string> = { 5: "VROOM!", 6: "FULL SEND!", 7: "DRS OPEN!", 8: "WARP SPEED!" };
      const word = words[this.gear];
      if (word) this.pendingBurst = word;
    }
  }

  /** A burst the engine should place (it knows where the pen is). */
  pendingBurst: string | null = null;

  /** A comic panel moment: a starburst with a word in it. */
  burst(text: string, x: number, y: number, now: number, mm: number, w: number): void {
    const seed = Math.floor(now) % 997;
    this.bursts = this.bursts.filter((b) => now - b.at > 250);
    this.bursts.push({
      text,
      x: clamp(x, 150, w - 150),
      y: Math.max(110, y),
      at: now,
      rot: (hash(seed) - 0.5) * 0.22,
      seed
    });
    this.tilt.kick((hash(seed + 1) - 0.5) * 0.9 * mm);
    this.zoom.kick(0.35 * mm);
    this.shake = 5 * mm;
  }

  /** A finished line: time it like a lap. */
  lap(row: number, x: number, chars: number, ms: number, now: number): void {
    if (chars < 8 || ms < 400) return;
    const wpm = Math.round(chars / 5 / (ms / 60000));
    if (wpm > 250) return;
    this.lapNo++;
    let color = YELLOW;
    let label = "";
    if (wpm > this.bestLap) {
      color = PURPLE;
      if (this.lapNo > 1) label = "fastest";
      this.bestLap = wpm;
    } else if (wpm > this.lastLap) color = GREEN;
    const delta = this.lastLap ? wpm - this.lastLap : 0;
    if (!label && this.lapNo > 1) label = `${delta >= 0 ? "+" : ""}${delta}`;
    this.lastLap = wpm;
    this.laps.push({ row, x, at: now, wpm, n: this.lapNo, color, label });
  }

  /** The camera, for putting the page on screen. Identity when at rest. */
  camera(now: number): { s: number; x: number; y: number; rot: number; fx: number; fy: number } | null {
    const s = this.zoom.x;
    const rot = this.tilt.x * 0.04;
    const sh = this.shake;
    if (Math.abs(s - 1) < 0.0006 && Math.abs(rot) < 0.0004 && sh < 0.15) return null;
    return {
      s: Math.max(1, s),
      rot,
      x: sh * (hash(Math.floor(now / 16)) - 0.5) * 2,
      y: sh * (hash(Math.floor(now / 16) + 7) - 0.5) * 2,
      fx: this.fx,
      fy: this.fy
    };
  }

  /** Everything over the page. ctx is in CSS pixels. */
  hud(
    ctx: CanvasRenderingContext2D,
    look: Look,
    w: number,
    h: number,
    now: number,
    mm: number,
    font: (weight: number, px: number) => string,
    rowY: (row: number) => number,
    fs: number,
    calm: boolean
  ): void {
    if (mm > 0 && this.speed > 0.08) this.speedLines(ctx, look, w, h, now);
    if (this.zone > 0.004) {
      const bh = Math.round(Math.min(42, h * 0.055) * easeInOut(this.zone));
      ctx.fillStyle = "#0A0A0B";
      ctx.fillRect(0, 0, w, bh);
      ctx.fillRect(0, h - bh, w, bh);
    }
    if (!calm) {
      this.drawLaps(ctx, look, w, now, font, rowY, fs);
      this.drawLights(ctx, look, w, now, font);
    }
    for (const b of this.bursts) this.drawBurst(ctx, look, b, now, font, fs, mm);
  }

  private speedLines(ctx: CanvasRenderingContext2D, look: Look, w: number, h: number, now: number): void {
    const cx = this.fx || w / 2;
    const cy = this.fy || h / 2;
    const R = Math.hypot(w, h) * 0.75;
    const n = Math.round(14 + 46 * this.speed);
    // New lines every other frame or so: the flicker is the motion.
    const tick = Math.floor(now / 45);
    ctx.fillStyle = look.ink;
    for (let i = 0; i < n; i++) {
      const a = hash(tick * 131 + i) * Math.PI * 2;
      const r0 = R * (0.42 + 0.22 * hash(tick * 17 + i * 3) + 0.12 * (1 - this.speed));
      const len = R * (0.18 + 0.4 * hash(i * 7 + tick));
      const wd = 0.6 + 2.6 * hash(i * 11 + tick * 5) * this.speed;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      ctx.globalAlpha = (0.05 + 0.13 * this.speed) * (0.4 + 0.6 * hash(i + tick * 3));
      ctx.beginPath();
      ctx.moveTo(cx + ca * r0, cy + sa * r0);
      ctx.lineTo(cx + ca * (r0 + len) - sa * wd, cy + sa * (r0 + len) + ca * wd);
      ctx.lineTo(cx + ca * (r0 + len) + sa * wd, cy + sa * (r0 + len) - ca * wd);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private drawLights(ctx: CanvasRenderingContext2D, look: Look, w: number, now: number, font: (w: number, px: number) => string): void {
    const r = 4.2;
    const gap = 14;
    const x0 = w / 2 - ((LEDS - 1) * gap) / 2;
    const y = 22;
    const lit = clamp(this.revs.x, 0, 1.08) * LEDS;
    const flash = now - this.shiftAt < SHIFT_FLASH_MS;
    const blink = flash && Math.floor((now - this.shiftAt) / 60) % 2 === 0;
    const onBar = this.zone > 0.5;
    const base = this.typing ? 1 : 0.5;
    for (let i = 0; i < LEDS; i++) {
      const x = x0 + i * gap;
      const on = flash ? (blink ? 1 : 0) : clamp(lit - i, 0, 1);
      ctx.globalAlpha = base * (onBar ? 0.35 : 0.22);
      ctx.fillStyle = onBar ? "#ffffff" : look.sub;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      if (on > 0.02) {
        const col = flash ? LED_COLORS[2]! : LED_COLORS[Math.min(2, Math.floor(i / 5))]!;
        ctx.globalAlpha = on * 0.35;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(x, y, r * 2.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = on;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // The gear, under the lights; it jumps when you shift.
    const pop = 1 + clamp(this.gearPop.x, 0, 3) * 0.08;
    ctx.globalAlpha = base * 0.9;
    ctx.fillStyle = onBar ? "#ffffff" : flash ? LED_COLORS[2]! : look.ink;
    ctx.font = font(800, Math.round(15 * pop));
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(this.gear), w / 2, y + 19);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.globalAlpha = 1;
  }

  private drawLaps(
    ctx: CanvasRenderingContext2D,
    look: Look,
    w: number,
    now: number,
    font: (w: number, px: number) => string,
    rowY: (row: number) => number,
    fs: number
  ): void {
    void look;
    const px = Math.max(11, Math.round(fs * 0.42));
    for (const l of this.laps) {
      const age = now - l.at;
      const a = clamp(age / 320, 0, 1);
      const out = clamp((LAP_MS - age) / 600, 0, 1);
      const y = rowY(l.row) - fs * 0.36;
      if (y < 40) continue;
      ctx.font = font(760, px);
      const main = `LAP ${l.n}  ${l.wpm} WPM`;
      const tw = ctx.measureText(main).width;
      ctx.font = font(560, px);
      const lw = l.label ? ctx.measureText(l.label).width + px * 0.9 : 0;
      const bw = tw + lw + px * 1.6;
      const bh = px * 2;
      const x = Math.min(l.x + fs * 0.8, w - bw - 16) + (1 - easeOutBack(a)) * 46;
      ctx.globalAlpha = a * out;
      ctx.fillStyle = l.color;
      ctx.beginPath();
      ctx.roundRect(x, y - bh / 2, bw, bh, bh / 2);
      ctx.fill();
      const txt = l.color === YELLOW ? "#141414" : "#ffffff";
      ctx.fillStyle = txt;
      ctx.textBaseline = "middle";
      ctx.font = font(760, px);
      ctx.fillText(main, x + px * 0.8, y + 0.5);
      if (l.label) {
        ctx.font = font(560, px);
        ctx.globalAlpha = a * out * 0.8;
        ctx.fillText(l.label, x + px * 0.8 + tw + px * 0.9, y + 0.5);
      }
      ctx.textBaseline = "alphabetic";
    }
    ctx.globalAlpha = 1;
  }

  private drawBurst(
    ctx: CanvasRenderingContext2D,
    look: Look,
    b: Burst,
    now: number,
    font: (w: number, px: number) => string,
    fs: number,
    mm: number
  ): void {
    const age = now - b.at;
    const t = clamp(age / 260, 0, 1);
    const outT = clamp((age - (BURST_MS - 300)) / 300, 0, 1);
    let s = mm > 0 ? easeOutBack(t) : 1;
    s *= 1 + outT * 0.18;
    const alpha = 1 - outT;
    if (alpha <= 0) return;
    const px = Math.round(clamp(fs * 1.05, 22, 40));
    ctx.font = font(800, px);
    const tw = ctx.measureText(b.text).width;
    const rx = tw / 2 + px * 1.15;
    const ry = px * 1.55;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(b.x, b.y);
    ctx.rotate(b.rot);
    ctx.scale(s, s);

    const spikes = 18;
    const star = new Path2D();
    for (let i = 0; i < spikes * 2; i++) {
      const a = (i / (spikes * 2)) * Math.PI * 2;
      const j = hash(b.seed * 31 + i);
      const k = i % 2 === 0 ? 1.05 + 0.3 * j : 0.74 + 0.06 * j;
      const x = Math.cos(a) * rx * k;
      const y = Math.sin(a) * ry * k;
      if (i === 0) star.moveTo(x, y);
      else star.lineTo(x, y);
    }
    star.closePath();

    // Action lines, out past the points.
    ctx.strokeStyle = look.ink;
    ctx.lineCap = "round";
    ctx.lineWidth = 2.5;
    const reach = clamp(age / 200, 0, 1);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + hash(b.seed + i) * 0.3;
      const r0 = 1.42 + 0.1 * hash(i + b.seed * 3);
      const r1 = r0 + 0.28 * reach;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * rx * r0, Math.sin(a) * ry * r0);
      ctx.lineTo(Math.cos(a) * rx * r1, Math.sin(a) * ry * r1);
      ctx.stroke();
    }

    // Drop shadow, then the yellow panel with a heavy ink outline.
    ctx.translate(6, 6);
    ctx.fillStyle = look.ink;
    ctx.fill(star);
    ctx.translate(-6, -6);
    ctx.fillStyle = "#FFD93B";
    ctx.fill(star);
    // Halftone in the lower half, as printed.
    ctx.save();
    ctx.clip(star);
    ctx.fillStyle = "#F2A516";
    const step = 7;
    for (let y = 0; y < ry * 1.4; y += step) {
      const rr = 1 + (y / (ry * 1.4)) * 2.4;
      for (let x = -rx * 1.4 + ((y / step) % 2) * (step / 2); x < rx * 1.4; x += step) {
        ctx.beginPath();
        ctx.arc(x, y, rr, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
    ctx.lineJoin = "miter";
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = look.ink;
    ctx.stroke(star);

    // The word: slanted, outlined, a little hot.
    ctx.transform(1, 0, -0.16, 1, 0, 0);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = 7;
    ctx.strokeStyle = look.ink;
    ctx.strokeText(b.text, 0, 2);
    ctx.fillStyle = "#FF3B2F";
    ctx.fillText(b.text, 0, 2);
    ctx.restore();
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }

  probe(): { gear: number; bursts: number; laps: number; zone: number } {
    return { gear: this.gear, bursts: this.bursts.length, laps: this.laps.length, zone: this.zone };
  }
}
