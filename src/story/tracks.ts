/**
 * Keyframe tracks over story time `s`.
 *
 * A key is either a HOLD (`at: [in, out]`, the value rests there while the copy is read) or a
 * PASS key (`at: s`, a waypoint the value flows through without stopping). Between two holds,
 * time is eased once across the whole move (smoothstep), so the value leaves a hold and arrives at
 * the next with zero velocity, while pass keys in between are crossed at full speed.
 * Interpolation is monotone cubic Hermite, so camera parameters never overshoot their keys.
 * Everything is a pure function of `s`: deterministic, and reversible by construction.
 */

export interface Key {
  at: number | readonly [number, number];
  v: readonly number[];
}

export const clamp = (x: number, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
/** Frame-rate independent exponential smoothing. */
export const damp = (current: number, target: number, lambda: number, dt: number) =>
  lerp(current, target, 1 - Math.exp(-lambda * dt));

export class Track {
  readonly dim: number;
  private readonly tin: number[] = [];
  private readonly tout: number[] = [];
  private readonly hold: boolean[] = [];
  private readonly vals: (readonly number[])[] = [];

  constructor(keys: readonly Key[]) {
    if (keys.length === 0) throw new Error('Track needs at least one key');
    this.dim = keys[0].v.length;
    keys.forEach((k, i) => {
      const isHold = Array.isArray(k.at) || i === 0 || i === keys.length - 1;
      const [a, b] = Array.isArray(k.at) ? (k.at as [number, number]) : [k.at as number, k.at as number];
      this.tin.push(a);
      this.tout.push(b);
      this.hold.push(isHold);
      this.vals.push(k.v);
    });
  }

  get length(): number {
    return this.vals.length;
  }

  evaluate(s: number, out: number[]): number[] {
    const n = this.vals.length;
    if (s <= this.tout[0]) return this.copy(0, out);
    if (s >= this.tin[n - 1]) return this.copy(n - 1, out);

    // Find surrounding holds a (before) and b (after).
    let a = 0;
    for (let i = 0; i < n; i++) {
      if (!this.hold[i]) continue;
      if (s >= this.tin[i] && s <= this.tout[i]) return this.copy(i, out);
      if (this.tout[i] <= s) a = i;
    }
    let b = n - 1;
    for (let i = a + 1; i < n; i++) {
      if (this.hold[i]) {
        b = i;
        break;
      }
    }

    const start = this.tout[a];
    const end = this.tin[b];
    const eased = start + smoothstep(start, end, s) * (end - start);

    // Locate the segment j..j+1 inside the move.
    let j = a;
    while (j < b - 1 && this.time(j + 1, a, b) < eased) j++;
    const t0 = this.time(j, a, b);
    const t1 = this.time(j + 1, a, b);
    const span = Math.max(t1 - t0, 1e-6);
    const v = (eased - t0) / span;

    const h00 = 2 * v * v * v - 3 * v * v + 1;
    const h10 = v * v * v - 2 * v * v + v;
    const h01 = -2 * v * v * v + 3 * v * v;
    const h11 = v * v * v - v * v;
    for (let d = 0; d < this.dim; d++) {
      const p0 = this.vals[j][d];
      const p1 = this.vals[j + 1][d];
      const m0 = this.tangent(j, d, a, b) * span;
      const m1 = this.tangent(j + 1, d, a, b) * span;
      out[d] = h00 * p0 + h10 * m0 + h01 * p1 + h11 * m1;
    }
    return out;
  }

  /** For reduced motion: the hold nearest to `s`, as an index and the story time at its centre. */
  nearestHold(s: number): { index: number; center: number } {
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < this.vals.length; i++) {
      if (!this.hold[i]) continue;
      const d = s < this.tin[i] ? this.tin[i] - s : s > this.tout[i] ? s - this.tout[i] : 0;
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    return { index: best, center: (this.tin[best] + this.tout[best]) / 2 };
  }

  private copy(i: number, out: number[]): number[] {
    for (let d = 0; d < this.dim; d++) out[d] = this.vals[i][d];
    return out;
  }

  /** Time of key i as seen from inside the move a→b (holds contribute their inner edge). */
  private time(i: number, a: number, b: number): number {
    if (i === a) return this.tout[i];
    if (i === b) return this.tin[i];
    return this.tin[i];
  }

  /** Monotone (Fritsch–Carlson style) tangent in value-per-unit-s. */
  private tangent(i: number, d: number, a: number, b: number): number {
    const prev = Math.max(i - 1, a);
    const next = Math.min(i + 1, b);
    if (prev === next) return 0;
    const ti = this.time(i, a, b);
    if (i === a || i === b) {
      // Secant towards the neighbour: a single segment between holds is a straight line in value space.
      const o = i === a ? next : prev;
      const to = this.time(o, a, b);
      return (this.vals[o][d] - this.vals[i][d]) / (to - ti || 1e-6);
    }
    const dl = (this.vals[i][d] - this.vals[prev][d]) / (ti - this.time(prev, a, b) || 1e-6);
    const dr = (this.vals[next][d] - this.vals[i][d]) / (this.time(next, a, b) - ti || 1e-6);
    if (dl * dr <= 0) return 0;
    const m = (dl + dr) / 2;
    const limit = 3 * Math.min(Math.abs(dl), Math.abs(dr));
    return Math.sign(m) * Math.min(Math.abs(m), limit);
  }
}
