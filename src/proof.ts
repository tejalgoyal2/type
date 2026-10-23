/**
 * The proof: what your hands drew while you wrote.
 *
 * Every word becomes one smooth stroke across the keyboard, through the
 * keys it was typed on, the way a finger would trace it. Words typed in a
 * quick burst are drawn in the fresh color; slow, deliberate words bow
 * out wider and press heavier. Repeated words wear a deeper groove. Under
 * it, the doodles the writing summoned. Almost no text.
 *
 * Shown in a popup; saving is the viewer's choice.
 */
import type { Echo } from "./echo";
import { doodleById, doodlePaths } from "./doodles";

export interface ProofInput {
  echo: Echo;
  marks: string[];
  pal: { paper: string; ink: string; fresh: string; sub: string; dark: boolean };
  wpm: number;
}

const W = 1800;
const H = 1200;
const ROWS = ["1234567890-=", "qwertyuiop[]", "asdfghjkl;'", "zxcvbnm,./"];
const STAGGER = [0, 0.5, 0.75, 1.25];
const SHIFTED: Record<string, string> = {
  "!": "1", "@": "2", "#": "3", $: "4", "%": "5", "^": "6", "&": "7", "*": "8", "(": "9", ")": "0",
  _: "-", "+": "=", "{": "[", "}": "]", ":": ";", '"': "'", "<": ",", ">": ".", "?": "/"
};

/** Key centers in key units. */
const KEYS = new Map<string, [number, number]>();
// Rows sit further apart than on a real board, so strokes have room to move.
ROWS.forEach((row, r) => [...row].forEach((ch, i) => KEYS.set(ch, [STAGGER[r]! + i + 0.5, (r + 0.5) * 1.8])));

function keyOf(ch: string): [number, number] | undefined {
  const c = ch.toLowerCase();
  return KEYS.get(SHIFTED[c] ?? c);
}

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

interface Stroke {
  pts: [number, number][];
  gap: number; // mean ms between its letters
  w: number; // mean settled weight
}

function words(echo: Echo): Stroke[] {
  const out: Stroke[] = [];
  let cur: Stroke | null = null;
  let gaps = 0;
  let ws = 0;
  const close = () => {
    if (cur && cur.pts.length) {
      cur.gap = cur.pts.length > 1 ? gaps / (cur.pts.length - 1) : 300;
      cur.w = ws / cur.pts.length;
      out.push(cur);
    }
    cur = null;
    gaps = 0;
    ws = 0;
  };
  for (const e of echo.events) {
    const k = /[a-z0-9]/i.test(e.ch) ? keyOf(e.ch) : undefined;
    if (!k) {
      close();
      continue;
    }
    if (!cur) cur = { pts: [], gap: 0, w: 0 };
    else gaps += e.dt;
    cur.pts.push(k);
    ws += e.w;
  }
  close();
  return out;
}

export function renderProof(input: ProofInput): HTMLCanvasElement | null {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const c = canvas.getContext("2d");
  if (!c) return null;
  const { pal } = input;
  c.fillStyle = pal.paper;
  c.fillRect(0, 0, W, H);

  const strokes = words(input.echo);
  const seed = input.echo.events.reduce((h, e) => Math.imul(h ^ e.ch.charCodeAt(0), 16777619) ^ e.dt, 2166136261);
  const rand = rng(seed);

  // The keyboard, as a field of faint points.
  const u = 128;
  const ox = (W - 12.75 * u) / 2;
  const oy = 120;
  const at = (k: [number, number]): [number, number] => [ox + k[0] * u, oy + k[1] * u];
  c.fillStyle = pal.sub;
  for (const k of KEYS.values()) {
    const [x, y] = at(k);
    c.globalAlpha = 0.55;
    c.beginPath();
    c.arc(x, y, 2.4, 0, Math.PI * 2);
    c.fill();
  }

  // Each word, one stroke through its keys (Catmull-Rom, as Béziers).
  const n = strokes.length;
  const alpha = Math.max(0.1, Math.min(0.6, 7 / Math.sqrt(n + 1)));
  c.lineCap = "round";
  c.lineJoin = "round";
  strokes.forEach((s, idx) => {
    // Earlier words are lighter: the drawing deepens as the writing goes on.
    const age = n > 1 ? idx / (n - 1) : 1;
    const bow = Math.min(1, s.gap / 260); // slow words bow out
    const burst = s.gap < 115 && s.pts.length > 2;
    const jx = (rand() - 0.5) * u * 0.12;
    const jy = (rand() - 0.5) * u * 0.12;
    const pts = s.pts.map((k) => {
      const [x, y] = at(k);
      return [x + jx, y + jy] as [number, number];
    });
    c.strokeStyle = burst ? pal.fresh : pal.ink;
    c.fillStyle = c.strokeStyle;
    c.globalAlpha = alpha * (burst ? 1.4 : 1) * (0.35 + 0.65 * age);
    if (pts.length === 1) {
      c.beginPath();
      c.arc(pts[0]![0], pts[0]![1], 5, 0, Math.PI * 2);
      c.fill();
      return;
    }
    c.lineWidth = 2 + Math.max(0, s.w - 400) / 45;
    c.beginPath();
    c.moveTo(pts[0]![0], pts[0]![1]);
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)]!;
      const p1 = pts[i]!;
      const p2 = pts[i + 1]!;
      const p3 = pts[Math.min(pts.length - 1, i + 2)]!;
      // A pressed-twice key (the "ll" in "hello") makes a small loop.
      if (p1[0] === p2[0] && p1[1] === p2[1]) {
        const r = u * (0.12 + bow * 0.1);
        c.bezierCurveTo(p1[0] + r, p1[1] - r * 2, p1[0] - r, p1[1] - r * 2, p2[0], p2[1]);
        continue;
      }
      const t = 0.5 + bow * 0.35;
      c.bezierCurveTo(
        p1[0] + ((p2[0] - p0[0]) / 6) * t * 2,
        p1[1] + ((p2[1] - p0[1]) / 6) * t * 2,
        p2[0] - ((p3[0] - p1[0]) / 6) * t * 2,
        p2[1] - ((p3[1] - p1[1]) / 6) * t * 2,
        p2[0],
        p2[1]
      );
    }
    c.stroke();
    // Where the word began: a small dot, as a pen touches down.
    c.globalAlpha = Math.min(0.9, alpha * 2.2) * (0.35 + 0.65 * age);
    c.beginPath();
    c.arc(pts[0]![0], pts[0]![1], 2.6 + c.lineWidth * 0.4, 0, Math.PI * 2);
    c.fill();
  });

  // The doodles this writing summoned, in a row under the field.
  const ids = [...new Set(input.marks)].filter((m) => doodleById(m)).slice(0, 10);
  const ds = 44;
  const gap = 34;
  let x = (W - (ids.length * ds + (ids.length - 1) * gap)) / 2;
  c.globalAlpha = 0.9;
  c.lineCap = "round";
  c.lineJoin = "round";
  for (const id of ids) {
    const d = doodleById(id)!;
    const paths = doodlePaths(d);
    c.save();
    c.translate(x, 960);
    c.scale(ds / 24, ds / 24);
    c.lineWidth = 1.5;
    paths.forEach((p, i) => {
      c.strokeStyle = i === 0 ? pal.ink : pal.fresh;
      c.stroke(p);
    });
    c.restore();
    x += ds + gap;
  }

  // One quiet line.
  const d = new Date();
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  c.globalAlpha = 0.75;
  c.fillStyle = pal.sub;
  c.font = '500 22px "JetBrains Mono", ui-monospace, monospace';
  c.textBaseline = "alphabetic";
  c.textAlign = "left";
  c.fillText(`${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`, 90, H - 80);
  c.textAlign = "right";
  c.fillText(`${Math.round(input.wpm)} wpm`, W - 90, H - 80);
  c.globalAlpha = 1;
  return canvas;
}

/** Show the proof over the page. Resolves when it closes. */
export function showProof(canvas: HTMLCanvasElement, pal: { paper: string; ink: string; dark: boolean }): Promise<void> {
  return new Promise((resolve) => {
    const wrap = document.createElement("div");
    wrap.className = "proof";
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-label", "your proof");
    wrap.style.setProperty("--paper", pal.paper);
    wrap.style.setProperty("--ink", pal.ink);
    const img = document.createElement("img");
    img.alt = "the shape your fingers drew while you wrote";
    const bar = document.createElement("div");
    bar.className = "proof-bar";
    const save = document.createElement("button");
    save.textContent = "save";
    const close = document.createElement("button");
    close.textContent = "close";
    bar.append(save, close);
    wrap.append(img, bar);

    let url = "";
    canvas.toBlob((blob) => {
      if (!blob) return;
      url = URL.createObjectURL(blob);
      img.src = url;
    }, "image/png");

    const done = () => {
      wrap.classList.remove("open");
      document.removeEventListener("keydown", onKey, true);
      setTimeout(() => {
        wrap.remove();
        if (url) URL.revokeObjectURL(url);
      }, 260);
      resolve();
    };
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === "Escape") {
        e.preventDefault();
        done();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        save.click();
      }
    };
    save.onclick = () => {
      if (!url) return;
      const a = document.createElement("a");
      const d = new Date();
      const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
      a.href = url;
      a.download = `type-${stamp}.png`;
      a.click();
    };
    close.onclick = done;
    wrap.onclick = (e) => {
      if (e.target === wrap) done();
    };
    document.addEventListener("keydown", onKey, true);
    document.body.append(wrap);
    requestAnimationFrame(() => wrap.classList.add("open"));
    save.focus();
  });
}
