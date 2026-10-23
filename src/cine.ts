/**
 * The camera. Typing is shot like a film.
 *
 * - It follows the pen: framing leans toward the caret, and the lens
 *   pushes in as you pick up speed. Each keystroke nudges it; Enter lets
 *   it breathe out.
 * - Focus: while you write, the lens racks onto the line at the pen and
 *   the lines above go soft, deeper the further back. Pause, and focus
 *   pulls back to the whole page.
 * - When you stop for a while the camera drifts: a slow push and pan up
 *   over what you wrote, the way a film holds on a page. The next key
 *   brings it straight back.
 * - At pace, the frame tightens: a vignette closes in, faint speed lines
 *   streak past, and holding a fast pace slides letterbox bars in.
 * - A finished line gets a quiet lap time.
 *
 * At rest the camera is exactly still, so text is never resampled.
 */
import { Spring } from "./springs";

const LAP_MS = 3800;
const DRIFT_AFTER_MS = 7000;

export interface Look {
  ink: string;
  paper: string;
  sub: string;
  fresh: string;
  dark: boolean;
}

interface Lap {
  row: number;
  x: number;
  at: number;
  wpm: number;
  best: boolean;
  delta: number | null;
}

function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const easeOut = (t: number) => 1 - (1 - t) ** 3;

export class Cine {
  private zoom = new Spring(1, 70, 15);
  private speed = 0;
  /** Depth of field: 0 is the whole page sharp, 1 is focus on the pen only. */
  focus = 0;
  private drift = 0;
  private zone = 0;
  private zoneSince: number | null = null;
  private fx = -1;
  private fy = -1;
  private laps: Lap[] = [];
  private bestLap = 0;
  private lastLap = 0;

  /** A keystroke: the lens leans in a hair. */
  key(mm: number): void {
    if (mm > 0) this.zoom.kick(0.035 * mm);
  }

  /** Enter: the lens breathes out and settles. */
  enter(mm: number): void {
    if (mm > 0) this.zoom.kick(-0.16 * mm);
  }

  update(
    dt: number,
    now: number,
    wpm: number,
    idle: number,
    cx: number,
    cy: number,
    lineH: number,
    mm: number,
    w: number
  ): void {
    const typing = idle < 1400;
    const sp = typing ? clamp((wpm - 25) / 70, 0, 1) : 0;
    this.speed += (sp - this.speed) * Math.min(1, dt * (sp > this.speed ? 1.2 : 2.5));

    // Rack focus: onto the pen while writing, back to the page on a pause.
    const f = mm > 0 && typing ? 0.55 + 0.45 * clamp(this.speed * 1.6, 0, 1) : 0;
    this.focus += (f - this.focus) * Math.min(1, dt * (f > this.focus ? 3.2 : 1.6));
    if (this.focus < 0.004) this.focus = 0;

    // A long pause: the camera starts to wander over the page.
    const d = mm > 0 && idle > DRIFT_AFTER_MS ? 1 : 0;
    this.drift += (d - this.drift) * Math.min(1, dt * (d ? 0.35 : 5));
    if (this.drift < 0.001) this.drift = 0;

    if (typing && this.speed > 0.72) this.zoneSince ??= now;
    else if (!typing || this.speed < 0.55) this.zoneSince = null;
    const inZone = mm > 0 && this.zoneSince !== null && now - this.zoneSince > 2200;
    this.zone += ((inZone ? 1 : 0) - this.zone) * Math.min(1, dt * (inZone ? 1.2 : 2.4));
    if (this.zone < 0.002) this.zone = 0;

    const t = now / 1000;
    const wander = this.drift * (0.012 + 0.006 * Math.sin(t * 0.11));
    this.zoom.target = 1 + (0.008 * (typing ? 1 : 0) + 0.032 * this.speed) * mm + wander;
    this.zoom.update(dt);

    // Framing: lean toward the pen; drifting, rise slowly over the history.
    const tx = (w / 2) * 0.4 + cx * 0.6 + this.drift * Math.sin(t * 0.07) * w * 0.12;
    const ty = cy - this.drift * lineH * (3 + Math.sin(t * 0.05) * 1.5);
    if (this.fx < 0) {
      this.fx = tx;
      this.fy = ty;
    }
    const k = Math.min(1, dt * (this.drift > 0.05 ? 0.6 : 3.5));
    this.fx += (tx - this.fx) * k;
    this.fy += (ty - this.fy) * k;

    this.laps = this.laps.filter((l) => now - l.at < LAP_MS);
  }

  /** A finished row: time it, quietly. */
  lap(row: number, x: number, chars: number, ms: number, now: number): void {
    if (chars < 8 || ms < 400) return;
    const wpm = Math.round(chars / 5 / (ms / 60000));
    if (wpm > 250) return;
    const best = wpm > this.bestLap;
    if (best) this.bestLap = wpm;
    this.laps.push({ row, x, at: now, wpm, best, delta: this.lastLap ? wpm - this.lastLap : null });
    this.lastLap = wpm;
  }

  /** Where the camera is. Null when it is exactly at rest. */
  camera(): { s: number; fx: number; fy: number } | null {
    const s = this.zoom.x;
    if (Math.abs(s - 1) < 0.0006) return null;
    return { s: Math.max(1, s), fx: this.fx, fy: this.fy };
  }

  /** Over the page, in CSS pixels. */
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
    if (mm > 0 && this.speed > 0.05) {
      // Phones are small enough that the frame is already tight.
      if (w >= 700) this.vignette(ctx, look, w, h);
      if (this.speed > 0.3) this.streaks(ctx, look, w, h, now);
    }
    if (this.zone > 0) {
      const bh = Math.round(Math.min(46, h * 0.06) * easeInOut(this.zone));
      ctx.fillStyle = look.dark ? "#000000" : "#0B0A09";
      ctx.fillRect(0, 0, w, bh);
      ctx.fillRect(0, h - bh, w, bh);
    }
    if (!calm) this.drawLaps(ctx, look, w, now, font, rowY, fs);
  }

  private vig: { c: HTMLCanvasElement; key: string } | null = null;

  /** The frame closing in. Drawn small once, stretched every frame. */
  private vignette(ctx: CanvasRenderingContext2D, look: Look, w: number, h: number): void {
    const key = `${w}x${h}/${look.dark}`;
    if (!this.vig || this.vig.key !== key) {
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(w / 6));
      c.height = Math.max(1, Math.round(h / 6));
      const x = c.getContext("2d")!;
      const r = Math.hypot(c.width, c.height) * 0.62;
      const g = x.createRadialGradient(c.width / 2, c.height * 0.55, r * 0.5, c.width / 2, c.height * 0.55, r);
      const edge = look.dark ? "0,0,0" : "40,30,20";
      g.addColorStop(0, `rgba(${edge},0)`);
      g.addColorStop(1, `rgba(${edge},${look.dark ? 0.5 : 0.16})`);
      x.fillStyle = g;
      x.fillRect(0, 0, c.width, c.height);
      this.vig = { c, key };
    }
    ctx.globalAlpha = this.speed;
    ctx.drawImage(this.vig.c, 0, 0, w, h);
    ctx.globalAlpha = 1;
  }

  private streaks(ctx: CanvasRenderingContext2D, look: Look, w: number, h: number, now: number): void {
    const s = (this.speed - 0.3) / 0.7;
    const R = Math.hypot(w, h) * 0.75;
    const n = Math.round(8 + 26 * s);
    const tick = Math.floor(now / 50);
    ctx.fillStyle = look.ink;
    for (let i = 0; i < n; i++) {
      const a = hash(tick * 131 + i) * Math.PI * 2;
      const r0 = R * (0.55 + 0.25 * hash(tick * 17 + i * 3));
      const len = R * (0.12 + 0.3 * hash(i * 7 + tick));
      const wd = 0.4 + 1.4 * hash(i * 11 + tick * 5);
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      ctx.globalAlpha = (0.03 + 0.07 * s) * hash(i + tick * 3);
      ctx.beginPath();
      ctx.moveTo(this.fx + ca * r0, this.fy + sa * r0);
      ctx.lineTo(this.fx + ca * (r0 + len) - sa * wd, this.fy + sa * (r0 + len) + ca * wd);
      ctx.lineTo(this.fx + ca * (r0 + len) + sa * wd, this.fy + sa * (r0 + len) - ca * wd);
      ctx.closePath();
      ctx.fill();
    }
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
    const px = Math.max(11, Math.round(fs * 0.42));
    ctx.textBaseline = "middle";
    for (const l of this.laps) {
      const age = now - l.at;
      const a = easeOut(clamp(age / 420, 0, 1)) * clamp((LAP_MS - age) / 900, 0, 1);
      const y = rowY(l.row) - fs * 0.36;
      if (y < 40 || a <= 0) continue;
      const x = Math.min(l.x + fs * 0.9, w - px * 9) + (1 - a) * 14;
      ctx.globalAlpha = a * 0.85;
      ctx.fillStyle = l.best ? look.fresh : look.sub;
      ctx.font = font(l.best ? 720 : 520, px);
      const main = `${l.wpm} wpm`;
      ctx.fillText(main, x, y);
      if (l.delta !== null) {
        const tw = ctx.measureText(main).width;
        ctx.font = font(460, px);
        ctx.globalAlpha = a * 0.55;
        ctx.fillStyle = look.sub;
        ctx.fillText(`${l.delta >= 0 ? "+" : ""}${l.delta}`, x + tw + px * 0.7, y);
      }
    }
    ctx.textBaseline = "alphabetic";
    ctx.globalAlpha = 1;
  }

  probe(): { focus: number; laps: number; zone: number; zoom: number } {
    return { focus: this.focus, laps: this.laps.length, zone: this.zone, zoom: this.zoom.x };
  }
}
