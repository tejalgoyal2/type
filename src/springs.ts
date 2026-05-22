/**
 * Small spring toolkit. Everything visual in the engine that moves is driven
 * by one of these two primitives:
 *
 * - Spring: a stateful damped spring integrated per frame (caret position,
 *   caret squash). Semi-implicit Euler, stable at our stiffness range for
 *   dt <= 40 ms (the engine clamps dt).
 *
 * - landCurve: a closed-form underdamped spring response used for glyph
 *   landing. Evaluated from the glyph's age, so it costs nothing to "store"
 *   and thousands of glyphs can be mid-flight with zero per-glyph state.
 */
export class Spring {
  x: number;
  v = 0;
  target: number;

  constructor(
    x0: number,
    public k = 180,
    public damp = 22
  ) {
    this.x = x0;
    this.target = x0;
  }

  /** Hard set with no motion. */
  set(x: number): void {
    this.x = x;
    this.target = x;
    this.v = 0;
  }

  kick(impulse: number): void {
    this.v += impulse;
  }

  update(dt: number): number {
    const a = -this.k * (this.x - this.target) - this.damp * this.v;
    this.v += a * dt;
    this.x += this.v * dt;
    return this.x;
  }
}

/**
 * Normalized underdamped settle: 0 at t=0, overshoots to ~1.06, settles at 1.
 * t is unitless; callers map age/duration into it.
 */
export function landCurve(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1.6) return 1;
  return 1 - Math.exp(-7 * t) * Math.cos(8 * t);
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function easeOut(t: number): number {
  const c = clamp(t, 0, 1);
  return 1 - (1 - c) * (1 - c) * (1 - c);
}
