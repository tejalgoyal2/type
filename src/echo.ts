/**
 * Echo: the page's memory of how you typed.
 *
 * A session is recorded as a forward-only stream of events (character, gap
 * since the previous press, and the weight the letter settled at). That
 * stream can be:
 *   - replayed as a faint ghost that types alongside you in your original
 *     cadence (a duet with your past self, not a race against a fixed text),
 *   - serialized into a compact URL-safe code so a rhythm can be shared.
 *
 * Backspaces are deliberately not recorded. An echo is your rhythm and the
 * words you committed to, not your corrections.
 */
export interface EchoEvent {
  ch: string; // a character, or "\n" for Enter
  dt: number; // ms since the previous event
  w: number; // settled font weight of the glyph
}

export interface Echo {
  v: 1;
  events: EchoEvent[];
  label?: string;
}

const CAP = 900;
const ECHO_BASE_W = 430;
const ECHO_MAX_W = 760;
const ECHO_RAMP_MS = 450;

function clampNum(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Map a hold duration to the weight the ghost glyph should print at. */
export function holdToWeight(holdMs: number): number {
  const ramp = clampNum(holdMs / ECHO_RAMP_MS, 0, 1);
  const peak = ECHO_BASE_W + (ECHO_MAX_W - ECHO_BASE_W) * ramp;
  return Math.round(400 + (peak - ECHO_BASE_W) * 0.5);
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
  toEcho(maxEvents = CAP, label?: string): Echo {
    const ev = this.events.slice(-maxEvents).map((e) => ({ ...e }));
    if (ev.length) ev[0]!.dt = 0;
    return { v: 1, events: ev, label };
  }
}

// ---- URL-safe encoding -----------------------------------------------------

function b64urlEncode(s: string): string {
  const b64 = btoa(unescape(encodeURIComponent(s)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  return decodeURIComponent(escape(atob(b64)));
}

export function encodeEcho(echo: Echo, maxEvents = 400): string {
  const ev = echo.events.slice(-maxEvents);
  if (ev.length) ev[0] = { ...ev[0]!, dt: 0 };
  const payload = {
    v: 1,
    e: ev.map((x) => [x.ch, Math.round(x.dt), Math.round(x.w)])
  };
  return b64urlEncode(JSON.stringify(payload));
}

export function decodeEcho(code: string): Echo | null {
  try {
    const payload = JSON.parse(b64urlDecode(code)) as {
      v: number;
      e: [string, number, number][];
    };
    if (payload.v !== 1 || !Array.isArray(payload.e)) return null;
    const events: EchoEvent[] = payload.e
      .filter((r) => Array.isArray(r) && typeof r[0] === "string")
      .map((r) => ({
        ch: r[0],
        dt: clampNum(Number(r[1]) || 0, 0, 4000),
        w: clampNum(Number(r[2]) || ECHO_BASE_W, 300, 900)
      }));
    if (events.length === 0) return null;
    return { v: 1, events };
  } catch {
    return null;
  }
}

// ---- Playback --------------------------------------------------------------

export interface GhostGlyph {
  ch: string;
  col: number;
  w: number;
  fireT: number; // ms into the loop when it appeared, for fade-in
}

export interface GhostState {
  line: GhostGlyph[];
  caretCol: number;
  fade: number; // 0..1, dips during the loop gap
  elapsed: number; // ms into the current loop
  playing: boolean;
}

const LOOP_GAP_MS = 2600;

/**
 * Plays an echo on a loop. Cheap to query: the current visible line is
 * rebuilt by walking the (bounded) event list each frame, which is well
 * under a microsecond for a paragraph.
 */
export class EchoPlayer {
  readonly events: EchoEvent[];
  private cum: number[] = [];
  private total = 0;

  constructor(echo: Echo) {
    this.events = echo.events;
    let t = 0;
    for (let i = 0; i < this.events.length; i++) {
      t += i === 0 ? 0 : Math.max(this.events[i]!.dt, 8);
      this.cum.push(t);
    }
    this.total = t;
  }

  state(now: number, startedAt: number, maxCols: number): GhostState {
    const loopLen = this.total + LOOP_GAP_MS;
    let elapsed = now - startedAt;
    if (loopLen > 0) elapsed = ((elapsed % loopLen) + loopLen) % loopLen;

    let k = 0;
    while (k < this.cum.length && this.cum[k]! <= elapsed) k++;

    let line: GhostGlyph[] = [];
    for (let i = 0; i < k; i++) {
      const ev = this.events[i]!;
      if (ev.ch === "\n" || line.length >= maxCols) line = [];
      if (ev.ch !== "\n") {
        line.push({ ch: ev.ch, col: line.length, w: ev.w, fireT: this.cum[i]! });
      }
    }

    const inGap = elapsed > this.total;
    const fade = inGap ? clampNum(1 - (elapsed - this.total) / 700, 0, 1) : 1;
    return { line, caretCol: line.length, fade, elapsed, playing: true };
  }
}
