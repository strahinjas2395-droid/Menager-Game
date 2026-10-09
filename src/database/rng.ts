/**
 * Seeded pseudo-random number generator (mulberry32).
 * Used for reproducible world generation and match simulation.
 */
export class SeededRNG {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0 || 1;
  }

  /** Uniform float in [0, 1) */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Float in [min, max) */
  float(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Integer in [min, max] inclusive */
  int(min: number, max: number): number {
    return Math.floor(this.float(min, max + 1));
  }

  /** True with probability p (0-1) */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Pick a random element from an array */
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  /** Weighted pick: entries [value, weight] */
  weighted<T>(entries: readonly [T, number][]): T {
    const total = totalWeight(entries);
    let r = this.next() * total;
    for (const [value, weight] of entries) {
      r -= weight;
      if (r <= 0) return value;
    }
    return entries[entries.length - 1][0];
  }

  /** Approximately normal distribution via sum of uniforms, clamped */
  normal(mean: number, stdDev: number, min: number, max: number): number {
    const sum = this.next() + this.next() + this.next() + this.next() + this.next() + this.next();
    const z = (sum - 3) / 0.7071; // ~N(0,1)
    return clamp(Math.round(mean + z * stdDev), min, max);
  }

  /** Fisher-Yates shuffle (returns new array) */
  shuffle<T>(arr: readonly T[]): T[] {
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
}

function totalWeight<T>(entries: readonly [T, number][]): number {
  let t = 0;
  for (const [, w] of entries) t += w;
  return t;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** Random non-negative seed for casual (unseeded) use */
export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}
