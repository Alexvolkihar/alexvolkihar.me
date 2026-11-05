// Hash-seeded randomness for the generative pieces in this folder.
//
// The seeding (all 32 bytes mixed with Math.imul), the sfc32 generator and the
// named sub-streams follow the determinism notes of Camille Roux's genart skill
// (https://github.com/camilleroux/genart-skill, MIT). sfc32 itself is Chris
// Doty-Humphrey's "Small Fast Counting" generator from PractRand.
//
// Nothing in here reads Math.random, the clock or the environment: the same
// hash always yields the same stream of numbers, in every engine.

export type Rng = () => number

// 16 to 64 hex digits: seedFromHash left-pads shorter hashes, so a short
// hash is still a full, reproducible seed.
const HASH_RE = /^0x[0-9a-f]{16,64}$/i

export function isValidHash(hash: unknown): hash is string {
  return typeof hash === 'string' && HASH_RE.test(hash)
}

export function seedFromHash(hash: string): Uint32Array {
  const hex = hash.replace(/^0x/i, '').padStart(64, '0').slice(-64)
  const s = new Uint32Array(4)
  for (let i = 0; i < 8; i++) {
    const w = Number.parseInt(hex.slice(i * 8, i * 8 + 8), 16) >>> 0
    // mix, do not fold: XOR-folding cancels out on patterned hashes
    s[i % 4] = (Math.imul(s[i % 4] ^ w, 0x9E3779B1) + i) >>> 0
  }
  if (!(s[0] | s[1] | s[2] | s[3]))
    s[3] = 1
  return s
}

export function sfc32(seed: ArrayLike<number>): Rng {
  let a = seed[0] | 0
  let b = seed[1] | 0
  let c = seed[2] | 0
  let d = seed[3] | 0
  return () => {
    const t = (((a + b) | 0) + d) | 0
    d = (d + 1) | 0
    a = b ^ (b >>> 9)
    b = (c + (c << 3)) | 0
    c = (c << 21) | (c >>> 11)
    c = (c + t) | 0
    return (t >>> 0) / 4294967296
  }
}

export function fnv1a(str: string): number {
  let h = 0x811C9DC5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/**
 * An independent generator for one domain of the piece ("features", "cuts"...).
 * Adding a draw to one stream never shifts the others, so the edition stays stable.
 */
export function stream(hash: string, label: string): Rng {
  const s = seedFromHash(hash)
  const k = fnv1a(label)
  const mixed = [0, 1, 2, 3].map(i => (s[i] ^ Math.imul(k + i, 0x9E3779B1)) >>> 0)
  if (!(mixed[0] | mixed[1] | mixed[2] | mixed[3]))
    mixed[3] = 1
  const r = sfc32(mixed)
  // warm-up: the first draws of an undiluted seed are correlated
  for (let i = 0; i < 12; i++)
    r()
  return r
}

export const range = (r: Rng, a: number, b: number) => a + r() * (b - a)
export const int = (r: Rng, a: number, b: number) => a + Math.floor(r() * (b - a + 1))
export const pick = <T>(r: Rng, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]
export const chance = (r: Rng, p: number) => r() < p
/** Standard normal. Always consumes exactly two draws. */
export const gaussian = (r: Rng) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r())

export function weighted<T>(r: Rng, entries: ReadonlyArray<readonly [T, number]>): T {
  let total = 0
  for (const [, w] of entries)
    total += w
  let x = r() * total
  for (const [v, w] of entries) {
    x -= w
    if (x < 0)
      return v
  }
  return entries[entries.length - 1][0]
}
