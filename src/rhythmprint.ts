/**
 * Rhythm print: turn a recorded session into a generative poster.
 *
 * Each keystroke becomes a tick laid out on a phyllotaxis spiral (the
 * sunflower-seed arrangement), so the whole session reads as one dense,
 * deterministic disc, a fingerprint of how you typed. Tick length encodes
 * the gap before the keystroke (your cadence), thickness encodes the
 * settled weight (your pressure), and color runs from the "fresh" accent
 * for quick keys to the quiet "sub" tone for long pauses.
 *
 * The same session always yields the same print. Rendered off-screen at
 * high resolution and handed back as a PNG download.
 */
import type { Echo } from "./echo";

export interface PrintPalette {
  paper: string;
  ink: string;
  fresh: string;
  sub: string;
  misA: string;
  misB: string;
}

export interface PrintStats {
  total: number;
  bestWpm: number;
  styleLabel: string;
  paletteLabel: string;
}

const FONT = `"JetBrains Mono Variable", ui-monospace, monospace`;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)); // ~2.399963

function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ar = (pa >> 16) & 255, ag = (pa >> 8) & 255, ab = pa & 255;
  const br = (pb >> 16) & 255, bg = (pb >> 8) & 255, bb = pb & 255;
  return `rgb(${Math.round(ar + (br - ar) * t)},${Math.round(
    ag + (bg - ag) * t
  )},${Math.round(ab + (bb - ab) * t)})`;
}

export function renderRhythmPrint(
  echo: Echo,
  pal: PrintPalette,
  stats: PrintStats
): HTMLCanvasElement {
  const W = 1200;
  const H = 1500;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // Paper, with a faint vignette so the disc sits on something.
  ctx.fillStyle = pal.paper;
  ctx.fillRect(0, 0, W, H);
  const vg = ctx.createRadialGradient(W / 2, H * 0.52, 100, W / 2, H * 0.52, H * 0.7);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.06)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  // Header.
  ctx.fillStyle = pal.ink;
  ctx.font = `760 92px ${FONT}`;
  ctx.textBaseline = "alphabetic";
  ctx.fillText("type", 96, 168);
  ctx.fillStyle = pal.sub;
  ctx.font = `460 30px ${FONT}`;
  ctx.fillText("a rhythm print", 100, 212);

  // The disc.
  const cx = W / 2;
  const cy = H * 0.52;
  const events = echo.events.slice(-900);
  const maxR = 430;
  const spread = maxR / Math.sqrt(Math.max(events.length, 1));

  // Quiet guide rings.
  ctx.strokeStyle = pal.sub;
  ctx.globalAlpha = 0.18;
  ctx.lineWidth = 1;
  for (const rr of [0.4, 0.7, 1]) {
    ctx.beginPath();
    ctx.arc(cx, cy, maxR * rr, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  ctx.lineCap = "round";
  for (let i = 0; i < events.length; i++) {
    const ev = events[i]!;
    const angle = i * GOLDEN_ANGLE;
    const r = spread * Math.sqrt(i);
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    const px = cx + ux * r;
    const py = cy + uy * r;

    // Gap (cadence): short gap -> short bright tick, long gap -> long quiet.
    const gap = Math.min(ev.dt, 1000) / 1000; // 0..1
    const len = 5 + gap * 26;
    const weight = (ev.w - 400) / 200; // ~0..1 pressure
    ctx.lineWidth = 1.2 + Math.max(0, weight) * 4.2;

    let color: string;
    if (ev.ch === "\n") color = pal.misB;
    else if (ev.ch === " ") color = pal.sub;
    else color = mix(pal.fresh, pal.sub, gap);
    ctx.strokeStyle = color;
    ctx.globalAlpha = ev.ch === " " ? 0.4 : 0.82;

    ctx.beginPath();
    ctx.moveTo(px - ux * len * 0.5, py - uy * len * 0.5);
    ctx.lineTo(px + ux * len * 0.5, py + uy * len * 0.5);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Center dot, the start of the session.
  ctx.fillStyle = pal.ink;
  ctx.beginPath();
  ctx.arc(cx, cy, 4, 0, Math.PI * 2);
  ctx.fill();

  // Footer: stats and provenance.
  const date = new Date().toLocaleDateString("en-CA");
  ctx.fillStyle = pal.sub;
  ctx.font = `460 26px ${FONT}`;
  const footY = H - 150;
  ctx.fillText(`${events.length} keys in this print`, 100, footY);
  ctx.fillText(
    `${stats.paletteLabel} · ${stats.styleLabel}`,
    100,
    footY + 40
  );
  if (stats.bestWpm > 0) {
    ctx.fillText(`best flow ${stats.bestWpm} wpm`, 100, footY + 80);
  }
  ctx.textAlign = "right";
  ctx.fillStyle = pal.sub;
  ctx.fillText("type.tgoyal.me", W - 100, footY);
  ctx.fillText(date, W - 100, footY + 40);
  ctx.textAlign = "left";

  return canvas;
}

/** Render and trigger a PNG download. Returns true if a print was produced. */
export function downloadRhythmPrint(
  echo: Echo,
  pal: PrintPalette,
  stats: PrintStats
): boolean {
  if (!echo.events.length) return false;
  const canvas = renderRhythmPrint(echo, pal, stats);
  const url = canvas.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = url;
  a.download = `rhythm-print-${Date.now()}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  return true;
}
