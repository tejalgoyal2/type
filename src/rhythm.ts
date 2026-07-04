/**
 * Rhythm is the site's microphone. It records keystroke timestamps for
 * character keys and derives everything the visuals react to:
 *
 * - flow detection over a rolling 3 s window (count, mean gap, coefficient
 *   of variation). Tuned for the 70-90 WPM range, where real typing mixes
 *   60-90 ms rolls with 250 ms+ word boundaries, so flow is defined by low
 *   variance rather than instantaneous speed.
 * - WPM over the same window (chars / 5 per word convention).
 * - the tick list the seismograph renders.
 */
export interface FlowInfo {
  active: boolean;
  wpm: number;
  heat: number; // 0..1, drives misregistration and caret glow
  even: number; // 0..1, cadence consistency (low inter-key variance), drives momentum
}

const WINDOW_MS = 3000;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export class Rhythm {
  private times: number[] = [];

  record(t: number): void {
    this.times.push(t);
    if (this.times.length > 600) this.times.splice(0, 300);
  }

  flow(now: number): FlowInfo {
    const ts = this.times;
    let i = ts.length - 1;
    let n = 0;
    let first = 0;
    while (i >= 0 && now - ts[i]! <= WINDOW_MS) {
      first = ts[i]!;
      n++;
      i--;
    }
    const wpm = Math.round(((n / (WINDOW_MS / 1000)) * 60) / 5);
    if (n < 8) return { active: false, wpm, heat: 0, even: 0 };

    // Gaps within the window.
    const start = ts.length - n;
    let mean = 0;
    for (let j = start + 1; j < ts.length; j++) mean += ts[j]! - ts[j - 1]!;
    mean /= n - 1;
    let variance = 0;
    for (let j = start + 1; j < ts.length; j++) {
      const g = ts[j]! - ts[j - 1]! - mean;
      variance += g * g;
    }
    variance /= n - 1;
    const cv = Math.sqrt(variance) / mean;
    const idle = now - ts[ts.length - 1]!;

    const active = mean < 260 && cv < 0.85 && idle < 700 && first < now;
    const heat = active ? Math.min(1, wpm / 90) : 0;
    // Evenness: the research-backed marker of flow is a consistent
    // inter-key interval, i.e. a low coefficient of variation. Map cv in
    // [0, 0.85] to evenness in [1, 0].
    const even = active ? clamp01(1 - cv / 0.85) : 0;
    return { active, wpm, heat, even };
  }

  /** Timestamps within the trailing span, oldest first. For the seismograph. */
  ticks(now: number, spanMs: number): number[] {
    const out: number[] = [];
    for (let i = this.times.length - 1; i >= 0; i--) {
      const t = this.times[i]!;
      if (now - t > spanMs) break;
      out.push(t);
    }
    return out.reverse();
  }

  last(): number | null {
    return this.times.length ? this.times[this.times.length - 1]! : null;
  }
}
