/**
 * Session recorder.
 *
 * Records the live session as a forward-only stream of events (character,
 * gap since the previous press, and the weight the letter settled at). The
 * only consumer is the rhythm print, which turns a session into a poster.
 * Backspaces are not recorded; the print reflects your rhythm and the words
 * you committed to, not your corrections.
 */
export interface EchoEvent {
  ch: string; // a character, or "\n" for Enter
  dt: number; // ms since the previous event
  w: number; // settled font weight of the glyph
}

export interface Echo {
  v: 1;
  events: EchoEvent[];
}

const CAP = 900;
const BASE_W = 430;
const MAX_W = 760;
const RAMP_MS = 450;

function clampNum(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Map a hold duration to the weight a glyph should print at. */
export function holdToWeight(holdMs: number): number {
  const ramp = clampNum(holdMs / RAMP_MS, 0, 1);
  const peak = BASE_W + (MAX_W - BASE_W) * ramp;
  return Math.round(400 + (peak - BASE_W) * 0.5);
}

/**
 * Records the live session. Indices returned by note() are absolute and
 * survive the ring-buffer trimming, so a key released long after it was
 * pressed still updates the right event.
 */
export class EchoRecorder {
  private events: EchoEvent[] = [];
  private last = -1;
  private dropped = 0;

  note(ch: string, now: number, w = holdToWeight(0)): number {
    const dt = this.last < 0 ? 0 : clampNum(now - this.last, 0, 4000);
    this.last = now;
    this.events.push({ ch, dt, w });
    if (this.events.length > CAP) {
      this.events.shift();
      this.dropped += 1;
    }
    return this.dropped + this.events.length - 1;
  }

  setWeight(absIdx: number, w: number): void {
    const local = absIdx - this.dropped;
    if (local >= 0 && local < this.events.length) this.events[local]!.w = w;
  }

  get length(): number {
    return this.events.length;
  }

  /** Snapshot the trailing events as a standalone echo (first gap zeroed). */
  toEcho(maxEvents = CAP): Echo {
    const ev = this.events.slice(-maxEvents).map((e) => ({ ...e }));
    if (ev.length) ev[0]!.dt = 0;
    return { v: 1, events: ev };
  }
}
