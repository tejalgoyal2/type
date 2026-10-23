/**
 * The rhythm proof: Ctrl+S turns a session into a press proof, signed with
 * a seal made out of how you typed.
 *
 * The seal is a guilloche, the engraved line-work on banknotes, built from
 * the session itself:
 * - a woven rope around the edge, its lobe count set by your pace;
 * - a rosette band whose interference comes from your cadence and how
 *   steady it was;
 * - the rhythm ring: your actual keystroke gaps wrapped once around the
 *   circle as a waveform, engraved as a band of contour lines;
 * - and at the center the sunflower: one tick per keystroke on a
 *   phyllotaxis spiral, length for the gap before it, thickness for how
 *   long it was held.
 * A line of text runs around it with the edition number, a hash of the
 * session. Below it, your last words are set in the weights you pressed,
 * slightly out of register, with the doodles from your margins, a rhythm
 * strip of the whole session, crop marks, a color bar and a colophon.
 *
 * Same session, same proof. Rendered off-screen once, never on the hot path.
 */
import type { Echo } from "./echo";
import { css, mix, rgb, type RGB } from "./palettes";
import { doodleById, doodlePaths } from "./doodles";

export interface PrintPalette {
  paper: string;
  ink: string;
  fresh: string;
  sub: string;
  misA: string;
  misB: string;
  dark: boolean;
}

export interface PrintStats {
  keys: number;
  styleLabel: string;
  paletteLabel: string;
}

export interface PrintGlyph {
  ch: string;
  w: number;
}

export interface PrintInput {
  echo: Echo;
  /** The writing, newest last; only the tail fits on the proof. */
  glyphs: PrintGlyph[];
  /** Doodle ids from the sheet's margins. */
  marks: string[];
  pal: PrintPalette;
  stats: PrintStats;
}

const FONT = `"JetBrains Mono Variable", ui-monospace, monospace`;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const W = 1500;
const H = 2000;
const TAU = Math.PI * 2;

/** FNV-1a, for a stable edition number and seeded choices. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function rng(seed: number): () => number {
  let a = seed || 1;
  return () => {
    a ^= a << 13;
    a ^= a >>> 17;
    a ^= a << 5;
    return ((a >>> 0) % 100000) / 100000;
  };
}

interface Signal {
  gaps: number[]; // ms between keystrokes, clamped
  meanGap: number;
  steadiness: number; // 0..1, 1 - coefficient of variation (clamped)
  wpm: number;
  weight: number; // mean settled weight 0..1
  id: string; // edition number
  seed: number;
}

function analyse(echo: Echo, text: string): Signal {
  const ev = echo.events.filter((e) => e.ch !== "\n");
  const gaps = ev.slice(1).map((e) => Math.min(1500, Math.max(25, e.dt)));
  const active = gaps.filter((g) => g < 1200);
  const meanGap = active.length ? active.reduce((a, b) => a + b, 0) / active.length : 250;
  const variance = active.length
    ? active.reduce((a, g) => a + (g - meanGap) ** 2, 0) / active.length
    : 0;
  const cv = Math.sqrt(variance) / meanGap;
  const weight = ev.length ? ev.reduce((a, e) => a + (e.w - 400) / 180, 0) / ev.length : 0.1;
  const seed = hash(text + "|" + gaps.join(","));
  const hex = seed.toString(16).toUpperCase().padStart(8, "0");
  return {
    gaps,
    meanGap,
    steadiness: Math.max(0, Math.min(1, 1 - cv)),
    wpm: Math.round(60000 / meanGap / 5),
    weight: Math.max(0, Math.min(1, weight)),
    id: `${hex.slice(0, 4)}-${hex.slice(4)}`,
    seed
  };
}

/** Polar curve r(θ), stroked as one closed path. */
function polar(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: (t: number) => number, steps = 1440): void {
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * TAU;
    const rr = r(t);
    const x = cx + Math.cos(t) * rr;
    const y = cy + Math.sin(t) * rr;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();
}

function ring(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.stroke();
}

/** Text around a circle, clockwise from the top, evenly spaced. */
function circleText(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, r: number): void {
  const n = text.length;
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i / n) * TAU;
    ctx.save();
    ctx.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    ctx.rotate(a + Math.PI / 2);
    ctx.fillText(text[i]!, 0, 0);
    ctx.restore();
  }
}

function drawSeal(ctx: CanvasRenderingContext2D, sig: Signal, echo: Echo, pal: PrintPalette, cx: number, cy: number, id: string, keys: number, date: string): void {
  const ink = rgb(pal.ink);
  const paper = rgb(pal.paper);
  const tone = (c: RGB, a: number) => css(c, a);
  const fresh = rgb(pal.fresh);
  const misA = rgb(pal.misA);
  const misB = rgb(pal.misB);
  const rand = rng(sig.seed);
  const spin = rand() * TAU;
  ctx.save();
  ctx.globalCompositeOperation = pal.dark ? "screen" : "multiply";
  ctx.lineJoin = "round";

  // Outer rope: a braid whose lobe count comes from your pace.
  const n = 48 + (sig.wpm % 36);
  const strands = 7;
  ctx.lineWidth = 1;
  ctx.strokeStyle = tone(ink, 0.55);
  for (let j = 0; j < strands; j++) {
    polar(ctx, cx, cy, (t) => 548 + 26 * Math.sin(n * t + (j / strands) * TAU + spin));
  }
  ctx.strokeStyle = tone(ink, 0.8);
  ctx.lineWidth = 1.6;
  ring(ctx, cx, cy, 584);
  ring(ctx, cx, cy, 512);

  // Rosette: cadence sets the petals, steadiness how cleanly they weave.
  const p = 12 + Math.round(sig.wpm / 6);
  const q = 3 + Math.round((1 - sig.steadiness) * 6);
  const copies = 18;
  ctx.lineWidth = 0.9;
  for (let j = 0; j < copies; j++) {
    const off = (j / copies) * (TAU / p);
    ctx.strokeStyle = tone(j % 2 ? misA : misB, 0.42);
    polar(ctx, cx, cy, (t) => 440 + 46 * Math.sin(p * (t + off) + spin) * Math.cos(q * t - spin));
  }
  ctx.strokeStyle = tone(ink, 0.7);
  ctx.lineWidth = 1.2;
  ring(ctx, cx, cy, 380);

  // The rhythm ring: your gaps, once around, as engraved contours.
  const N = 720;
  const g = sig.gaps.length ? sig.gaps : [sig.meanGap];
  const raw: number[] = [];
  for (let i = 0; i < N; i++) {
    const v = g[Math.floor((i / N) * g.length)]!;
    raw.push(Math.log(v / sig.meanGap));
  }
  // Circular smoothing so the waveform closes on itself.
  const k = 6;
  const wave = raw.map((_, i) => {
    let s = 0;
    for (let d = -k; d <= k; d++) s += raw[(i + d + N) % N]!;
    return s / (2 * k + 1);
  });
  const peak = Math.max(0.2, ...wave.map(Math.abs));
  const contours = 16;
  for (let c = 0; c < contours; c++) {
    const u = c / (contours - 1);
    const lens = Math.sin(Math.PI * u);
    ctx.strokeStyle = tone(c % 3 === 0 ? fresh : ink, c % 3 === 0 ? 0.75 : 0.35);
    ctx.lineWidth = c % 3 === 0 ? 1.3 : 0.8;
    polar(
      ctx,
      cx,
      cy,
      (t) => {
        const i = Math.floor(((t / TAU) * N) % N);
        return 300 + u * 64 + (wave[i]! / peak) * 22 * lens;
      },
      N
    );
  }
  ctx.strokeStyle = tone(ink, 0.7);
  ctx.lineWidth = 1.2;
  ring(ctx, cx, cy, 286);

  // Engraved lettering around the core.
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = tone(ink, 0.85);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const unit = ` type.tgoyal.me · a rhythm proof · ${keys.toLocaleString("en-US")} keys · ${date} · no. ${id} ·`;
  const fit = Math.floor((TAU * 262) / 15);
  let band = unit;
  while (band.length + unit.length <= fit) band += unit;
  // Size the letters to the spacing, so the band closes evenly.
  const pitch = (TAU * 262) / band.length;
  ctx.font = `620 ${Math.round(Math.max(14, Math.min(24, pitch / 0.68)))}px ${FONT}`;
  circleText(ctx, band, cx, cy, 262);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.strokeStyle = tone(ink, 0.6);
  ctx.lineWidth = 1;
  ring(ctx, cx, cy, 238);

  // The sunflower core: one tick per keystroke.
  ctx.globalCompositeOperation = pal.dark ? "screen" : "multiply";
  const events = echo.events.slice(-900);
  const maxR = 218;
  const spread = maxR / Math.sqrt(Math.max(events.length, 1));
  ctx.lineCap = "round";
  for (let i = 0; i < events.length; i++) {
    const ev = events[i]!;
    const angle = i * GOLDEN_ANGLE + spin;
    const r = spread * Math.sqrt(i);
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    const px = cx + ux * r;
    const py = cy + uy * r;
    const gap = Math.min(ev.dt, 1000) / 1000;
    const len = 3 + gap * 15;
    const weight = Math.max(0, (ev.w - 400) / 180);
    ctx.lineWidth = 1 + weight * 3.4;
    const c = ev.ch === "\n" ? misB : ev.ch === " " ? mix(paper, ink, 0.35) : mix(fresh, ink, gap * 0.8);
    ctx.strokeStyle = tone(c, ev.ch === " " ? 0.45 : 0.85);
    ctx.beginPath();
    ctx.moveTo(px - ux * len * 0.5, py - uy * len * 0.5);
    ctx.lineTo(px + ux * len * 0.5, py + uy * len * 0.5);
    ctx.stroke();
  }
  ctx.restore();
}

/** Reflow the tail of the writing into proof lines, weights kept. */
function excerpt(glyphs: PrintGlyph[], cols: number, maxLines: number): PrintGlyph[][] {
  const tail = glyphs.slice(-cols * maxLines * 2);
  const lines: PrintGlyph[][] = [[]];
  let word: PrintGlyph[] = [];
  const flush = () => {
    let line = lines[lines.length - 1]!;
    if (line.length + word.length > cols && line.length > 0) {
      while (line.length && line[line.length - 1]!.ch === " ") line.pop();
      line = [];
      lines.push(line);
    }
    line.push(...word.slice(0, cols));
    word = [];
  };
  for (const g of tail) {
    if (g.ch === "\n") {
      flush();
      lines.push([]);
    } else if (g.ch === " ") {
      word.push(g);
      flush();
    } else word.push(g);
  }
  flush();
  const nonEmpty = lines.filter((l, i) => l.length || (i > 0 && lines[i - 1]!.length));
  const out = nonEmpty.slice(-maxLines);
  if (out.length && out.length < nonEmpty.length) out[0] = [{ ch: "…", w: 400 }, ...out[0]!];
  return out;
}

function cropMarks(ctx: CanvasRenderingContext2D, ink: string): void {
  ctx.strokeStyle = ink;
  ctx.lineWidth = 1.2;
  const m = 46;
  const l = 34;
  for (const [x, y, sx, sy] of [
    [m, m, -1, -1],
    [W - m, m, 1, -1],
    [m, H - m, -1, 1],
    [W - m, H - m, 1, 1]
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(x, y + sy * 10);
    ctx.lineTo(x, y + sy * (10 + l));
    ctx.moveTo(x + sx * 10, y);
    ctx.lineTo(x + sx * (10 + l), y);
    ctx.stroke();
  }
  // Registration targets, top and bottom center.
  for (const y of [m, H - m]) {
    ctx.beginPath();
    ctx.arc(W / 2, y, 11, 0, TAU);
    ctx.moveTo(W / 2 - 20, y);
    ctx.lineTo(W / 2 + 20, y);
    ctx.moveTo(W / 2, y - 20);
    ctx.lineTo(W / 2, y + 20);
    ctx.stroke();
  }
}

/** Fine paper grain, so the proof reads as paper rather than a screen. */
function grain(ctx: CanvasRenderingContext2D, seed: number, amount: number): void {
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  let a = seed | 1;
  for (let i = 0; i < d.length; i += 4) {
    a ^= a << 13;
    a ^= a >>> 17;
    a ^= a << 5;
    const n = ((a & 255) / 255 - 0.5) * amount;
    d[i] = d[i]! + n;
    d[i + 1] = d[i + 1]! + n;
    d[i + 2] = d[i + 2]! + n;
  }
  ctx.putImageData(img, 0, 0);
}

export function renderRhythmPrint(input: PrintInput): HTMLCanvasElement {
  const { echo, pal, stats } = input;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const text = input.glyphs.map((g) => g.ch).join("");
  const sig = analyse(echo, text);
  const now = new Date();
  const date = now.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }).toLowerCase();
  const ink = rgb(pal.ink);
  const sub = css(mix(rgb(pal.paper), ink, 0.55));

  // Paper with a soft vignette.
  ctx.fillStyle = pal.paper;
  ctx.fillRect(0, 0, W, H);
  const vg = ctx.createRadialGradient(W / 2, H * 0.42, 200, W / 2, H * 0.5, H * 0.75);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, pal.dark ? "rgba(0,0,0,0.25)" : "rgba(60,40,20,0.08)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  cropMarks(ctx, css(ink, 0.55));

  // Masthead.
  ctx.fillStyle = pal.ink;
  ctx.font = `780 96px ${FONT}`;
  ctx.fillText("type", 120, 190);
  ctx.fillStyle = sub;
  ctx.font = `460 28px ${FONT}`;
  ctx.fillText("a rhythm proof", 126, 236);
  ctx.textAlign = "right";
  ctx.fillStyle = pal.ink;
  ctx.font = `640 28px ${FONT}`;
  ctx.fillText(`no. ${sig.id}`, W - 120, 170);
  ctx.fillStyle = sub;
  ctx.font = `460 24px ${FONT}`;
  ctx.fillText(date, W - 120, 210);
  ctx.textAlign = "left";

  // The seal.
  ctx.save();
  ctx.translate(W / 2, 850);
  ctx.scale(0.86, 0.86);
  drawSeal(ctx, sig, echo, pal, 0, 0, sig.id, stats.keys, date);
  ctx.restore();

  // The words, set in the weights you pressed, a touch out of register.
  const lines = excerpt(input.glyphs, 46, 5);
  const fs = 36;
  const adv = fs * 0.6;
  let y = 1440;
  for (const line of lines) {
    let x = 150;
    for (const g of line) {
      const wt = Math.round(Math.max(400, Math.min(800, 400 + (g.w - 400) * 2.2)) / 10) * 10;
      ctx.font = `${wt} ${fs}px ${FONT}`;
      ctx.globalAlpha = 0.32;
      ctx.fillStyle = pal.misA;
      ctx.fillText(g.ch, x - 1.6, y + 0.8);
      ctx.fillStyle = pal.misB;
      ctx.fillText(g.ch, x + 1.4, y - 0.6);
      ctx.globalAlpha = 1;
      ctx.fillStyle = pal.ink;
      ctx.fillText(g.ch, x, y);
      x += adv;
    }
    y += fs * 1.55;
  }

  // Marginalia: the doodles from the sheet, in the right margin.
  const marks = [...new Set(input.marks)].slice(-6);
  marks.forEach((id, i) => {
    const d = doodleById(id);
    if (!d) return;
    const paths = doodlePaths(d);
    ctx.save();
    ctx.translate(W - 190 - (i % 2) * 64, 1420 + Math.floor(i / 2) * 64);
    ctx.scale(2.2, 2.2);
    ctx.translate(-12, -12);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 1.5 / 2.2 * 1.6;
    paths.forEach((p, k) => {
      ctx.strokeStyle = [pal.fresh, pal.misA, pal.misB][Math.min(k, 2)]!;
      ctx.stroke(p);
    });
    ctx.restore();
  });

  // Rhythm strip: the whole session, left to right, long pauses squeezed.
  const stripY = 1790;
  const ev = echo.events;
  let total = 0;
  const xs = ev.map((e) => (total += Math.min(e.dt, 900)));
  const span = Math.max(1, total);
  ctx.strokeStyle = css(ink, 0.25);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(150, stripY);
  ctx.lineTo(W - 150, stripY);
  ctx.stroke();
  ctx.lineCap = "round";
  for (let i = 0; i < ev.length; i++) {
    const e = ev[i]!;
    const x = 150 + (xs[i]! / span) * (W - 300);
    const hgt = Math.max(3, Math.min(30, 2200 / Math.max(e.dt, 50)));
    ctx.lineWidth = 1 + Math.max(0, (e.w - 400) / 180) * 2;
    ctx.strokeStyle = e.ch === "\n" ? pal.misB : e.dt < sig.meanGap ? pal.fresh : sub;
    ctx.beginPath();
    ctx.moveTo(x, stripY - hgt);
    ctx.lineTo(x, stripY + hgt * 0.4);
    ctx.stroke();
  }

  // Colophon.
  const words = text.split(/\s+/).filter(Boolean).length;
  const facts = [
    `${stats.keys.toLocaleString("en-US")} keys`,
    `${words.toLocaleString("en-US")} words`,
    `${sig.wpm} wpm cadence`,
    `${Math.round(sig.steadiness * 100)}% steady`,
    `${stats.styleLabel.toLowerCase()} on ${stats.paletteLabel.toLowerCase()}`
  ];
  ctx.fillStyle = sub;
  ctx.font = `480 22px ${FONT}`;
  ctx.fillText(facts.join("   ·   "), 150, 1880);
  ctx.textAlign = "right";
  ctx.fillText("type.tgoyal.me", W - 150, 1920);
  ctx.textAlign = "left";

  // Color bar, like the strip on the edge of a press sheet.
  [pal.ink, pal.fresh, pal.misA, pal.misB, sub].forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.fillRect(150 + i * 30, 1904, 24, 20);
  });

  grain(ctx, sig.seed, pal.dark ? 10 : 7);
  return canvas;
}

/** Render, start a PNG download, and hand the canvas back for a preview. */
export function downloadRhythmPrint(input: PrintInput): HTMLCanvasElement | null {
  if (!input.echo.events.length) return null;
  const canvas = renderRhythmPrint(input);
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  // Encode off the main thread where the browser can; typing stays smooth.
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `type-proof-${stamp}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }, "image/png");
  return canvas;
}
