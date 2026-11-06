// Fractal flame genomes and the chaos game that develops them.
//
// After Scott Draves and Erik Reckase, "The Fractal Flame Algorithm" (2003,
// revised 2008, https://flam3.com/flame_draves.pdf). A flame is an iterated
// function system: a few transforms, each an affine map followed by a
// weighted sum of nonlinear "variations" (swirl, spherical, julia...). A point
// jumps from transform to transform at random; the cloud it leaves behind is
// the flame. Each transform also carries a colour index, and the point's own
// colour moves halfway towards it at every jump, so the colour of a region
// records the path that led there. Symmetry is added the way flam3 does it:
// extra transforms that only rotate or mirror the point and leave its colour
// alone. An optional final transform bends the whole picture once more,
// without feeding back into the orbit.
//
// The variation formulas are those of the paper's appendix, written from the
// definitions there (theta = atan(x / y), as in the paper).

import type { Rng } from '../random'
import { PI, tatan2, tcos, tsin } from './trig'

export const VARIATIONS = [
  'linear',
  'sinusoidal',
  'spherical',
  'swirl',
  'horseshoe',
  'polar',
  'handkerchief',
  'heart',
  'disc',
  'spiral',
  'hyperbolic',
  'diamond',
  'julia',
  'bubble',
  'fisheye',
  'eyefish',
  'cylinder',
  'ex',
] as const

export type Variation = typeof VARIATIONS[number]

const V = Object.fromEntries(VARIATIONS.map((v, i) => [v, i])) as Record<Variation, number>

/** Per transform: a b c d e f (x' = a x + b y + c, y' = d x + e y + f), colour, colour speed, variation count, then (kind, weight) pairs. */
export const MAX_VARS = 4
export const STRIDE = 9 + 2 * MAX_VARS

export interface Genome {
  /** Transforms, STRIDE numbers each. */
  xf: Float64Array
  /** Same layout, holding only the integers (variation count and kinds): a switch on a small integer is a jump table. */
  xk: Int32Array
  n: number
  /** 256 entries: transform index for each value of a random byte, by weight. */
  sel: Uint8Array
  /** Final transform (STRIDE numbers, colour speed 0) or null, and its integers. */
  fin: Float64Array | null
  fink: Int32Array
}

export interface XformSpec {
  affine: readonly [number, number, number, number, number, number]
  color: number
  speed: number
  weight: number
  vars: ReadonlyArray<readonly [Variation, number]>
}

export function compile(specs: readonly XformSpec[], fin: XformSpec | null): Genome {
  const pack = (s: XformSpec, out: Float64Array, ints: Int32Array, o: number) => {
    for (let i = 0; i < 6; i++)
      out[o + i] = s.affine[i]
    out[o + 6] = s.color
    out[o + 7] = s.speed
    const vars = s.vars.slice(0, MAX_VARS)
    ints[o + 8] = vars.length
    vars.forEach(([v, w], k) => {
      ints[o + 9 + 2 * k] = V[v]
      out[o + 10 + 2 * k] = w
    })
  }
  const xf = new Float64Array(specs.length * STRIDE)
  const xk = new Int32Array(specs.length * STRIDE)
  specs.forEach((s, i) => pack(s, xf, xk, i * STRIDE))
  // selection table: 256 slots shared out by weight (largest remainder)
  let total = 0
  for (const s of specs)
    total += s.weight
  const slots = specs.map(s => Math.floor((s.weight / total) * 256))
  let used = slots.reduce((a, b) => a + b, 0)
  const rest = specs.map((s, i) => [(s.weight / total) * 256 - slots[i], i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1])
  for (let k = 0; used < 256; k = (k + 1) % rest.length, used++)
    slots[rest[k][1]]++
  const sel = new Uint8Array(256)
  let p = 0
  slots.forEach((s, i) => {
    for (let k = 0; k < s; k++)
      sel[p++] = i
  })
  let fx: Float64Array | null = null
  const fk = new Int32Array(STRIDE)
  if (fin) {
    fx = new Float64Array(STRIDE)
    pack(fin, fx, fk, 0)
  }
  return { xf, xk, n: specs.length, sel, fin: fx, fink: fk }
}

// ---------------------------------------------------------------------------
// The chaos game
// ---------------------------------------------------------------------------

const EPS = 1e-12
const FUSE = 20
/** Points per call of run(), see plot(). */
const CHUNK = 1 << 14
const FAR = 1e9

/** Inline sfc32 state and the current point, carried from one run to the next. */
export interface ChaosState {
  s: Int32Array
  /** x, y and colour index of the point. */
  p: Float64Array
  /** Number of points thrown away because they escaped. */
  bad: number
}

export function newState(seed: ArrayLike<number>): ChaosState {
  const s = new Int32Array(4)
  for (let i = 0; i < 4; i++)
    s[i] = seed[i] | 0
  if (!(s[0] | s[1] | s[2] | s[3]))
    s[3] = 1
  return { s, p: new Float64Array([0.0123, -0.0456, 0.5]), bad: 0 }
}

export interface Camera {
  /** Grid position of world point (x, y): (A x + B y + OX, C x + D y + OY). */
  A: number
  B: number
  C: number
  D: number
  OX: number
  OY: number
  gw: number
  gh: number
}

// The point goes in and out through this array, not as arguments: a call
// that V8 does not inline would box every floating-point argument.
const IO = new Float64Array(2)

/**
 * One transform, at offset O of G (numbers) and K (integers): the affine map,
 * then the weighted sum of its variations. Reads and writes the point in IO.
 * BIT (0 or 2) picks the branch of julia's square root.
 */
function vary(G: Float64Array, K: Int32Array, o: number, bit: number): void {
  const x = IO[0]
  const y = IO[1]
  const tx = G[o] * x + G[o + 1] * y + G[o + 2]
  const ty = G[o + 3] * x + G[o + 4] * y + G[o + 5]
  const nv = K[o + 8]
  const r2 = tx * tx + ty * ty
  const r = Math.sqrt(r2)
  // theta (the paper's atan(x / y)) costs an arctangent: only when needed
  let th = 0
  let hasTh = false
  let nx = 0
  let ny = 0
  for (let k = 0; k < nv; k++) {
    const kind = K[o + 9 + 2 * k]
    const w = G[o + 10 + 2 * k]
    if (!hasTh && ((kind >= 5 && kind <= 8) || kind === 17)) {
      th = tatan2(tx, ty)
      hasTh = true
    }
    switch (kind) {
      case 0: // linear
        nx += w * tx
        ny += w * ty
        break
      case 1: // sinusoidal
        nx += w * tsin(tx)
        ny += w * tsin(ty)
        break
      case 2: { // spherical
        const s = w / (r2 + EPS)
        nx += s * tx
        ny += s * ty
        break
      }
      case 3: { // swirl
        const s = tsin(r2)
        const cs = tcos(r2)
        nx += w * (tx * s - ty * cs)
        ny += w * (tx * cs + ty * s)
        break
      }
      case 4: { // horseshoe
        const s = w / (r + EPS)
        nx += s * (tx - ty) * (tx + ty)
        ny += s * 2 * tx * ty
        break
      }
      case 5: // polar
        nx += w * th / PI
        ny += w * (r - 1)
        break
      case 6: // handkerchief
        nx += w * r * tsin(th + r)
        ny += w * r * tcos(th - r)
        break
      case 7: { // heart
        const u = th * r
        nx += w * r * tsin(u)
        ny -= w * r * tcos(u)
        break
      }
      case 8: { // disc
        const u = th / PI
        nx += w * u * tsin(PI * r)
        ny += w * u * tcos(PI * r)
        break
      }
      case 9: { // spiral (sin theta = x / r, cos theta = y / r)
        const s = w / (r + EPS)
        nx += s * (ty / (r + EPS) + tsin(r))
        ny += s * (tx / (r + EPS) - tcos(r))
        break
      }
      case 10: // hyperbolic
        nx += w * tx / (r2 + EPS)
        ny += w * ty
        break
      case 11: // diamond
        nx += w * (tx / (r + EPS)) * tcos(r)
        ny += w * (ty / (r + EPS)) * tsin(r)
        break
      case 12: { // julia: one of the two square roots, picked by a random bit
        // sqrt(r) (cos, sin)(theta / 2) by the half-angle formulas, no trig:
        // sqrt(r) cos(theta / 2) = sqrt((r + cos theta r) / 2), cos theta = y / r
        const s = bit - 1
        const hx = Math.sqrt((r + ty) * 0.5)
        const hy = Math.sqrt(Math.max(0, r - ty) * 0.5)
        nx += s * w * hx
        ny += s * w * (tx < 0 ? -hy : hy)
        break
      }
      case 13: { // bubble
        const s = (4 * w) / (r2 + 4)
        nx += s * tx
        ny += s * ty
        break
      }
      case 14: { // fisheye
        const s = (2 * w) / (r + 1)
        nx += s * ty
        ny += s * tx
        break
      }
      case 15: { // eyefish
        const s = (2 * w) / (r + 1)
        nx += s * tx
        ny += s * ty
        break
      }
      case 16: // cylinder
        nx += w * tsin(tx)
        ny += w * ty
        break
      default: { // ex
        const p0 = tsin(th + r)
        const p1 = tcos(th - r)
        const p03 = p0 * p0 * p0
        const p13 = p1 * p1 * p1
        nx += w * r * (p03 + p13)
        ny += w * r * (p03 - p13)
      }
    }
  }
  IO[0] = nx
  IO[1] = ny
}

/**
 * The chaos game, for `n` plotted points. Into a histogram: every point adds
 * one hit and its colour index to the cell it falls in (ACC holds hits and
 * colour sums interleaved, so both share a cache line). Or,
 * for the probe, into OUT (x, y, colour interleaved, 3 n numbers). Points
 * that escape (non-finite or very far) restart from a random point and are not
 * plotted again until FUSE steps have passed.
 *
 * Speed notes. Variation kinds are small integers in an Int32Array, so the
 * switch compiles to a jump table; the hit and the colour sum of a cell sit
 * side by side, so a plotted point touches one cache line.
 */
export function plot(
  g: Genome,
  st: ChaosState,
  n: number,
  hist: { cam: Camera, acc: Float32Array } | null,
  out: Float64Array | null,
): void {
  // In chunks: V8 compiles a long-running loop "on stack" (OSR), and may then
  // compile only one of its inner loops and fall back to the interpreter
  // every time it exits that loop. Many shorter calls get the whole function
  // optimised instead. The state carries over, so the orbit is unchanged.
  for (let done = 0; done < n; done += CHUNK)
    run(g, st, Math.min(CHUNK, n - done), hist, out, done)
}

function run(
  g: Genome,
  st: ChaosState,
  n: number,
  hist: { cam: Camera, acc: Float32Array } | null,
  out: Float64Array | null,
  /** Index of the first point in OUT. */
  first: number,
): void {
  const sel = g.sel
  const hasFin = g.fin !== null
  const G0 = g.xf
  const K0 = g.xk
  const G1 = g.fin ?? g.xf
  const K1 = g.fink
  let a = st.s[0]
  let b = st.s[1]
  let c = st.s[2]
  let d = st.s[3]
  let x = st.p[0]
  let y = st.p[1]
  let col = st.p[2]
  let fuse = FUSE
  let bad = 0
  const cam = hist?.cam
  const A = cam?.A ?? 0
  const B = cam?.B ?? 0
  const C = cam?.C ?? 0
  const D = cam?.D ?? 0
  const OX = cam?.OX ?? 0
  const OY = cam?.OY ?? 0
  const gw = cam?.gw ?? 0
  const gh = cam?.gh ?? 0
  const acc = hist?.acc ?? new Float32Array(2)
  let plotted = 0
  while (plotted < n) {
    // sfc32 (Chris Doty-Humphrey), inlined
    const t = (((a + b) | 0) + d) | 0
    d = (d + 1) | 0
    a = b ^ (b >>> 9)
    b = (c + (c << 3)) | 0
    c = (c << 21) | (c >>> 11)
    c = (c + t) | 0

    // a transform picked by weight
    const o = sel[t >>> 24] * STRIDE
    IO[0] = x
    IO[1] = y
    vary(G0, K0, o, t & 2)
    x = IO[0]
    y = IO[1]
    col += (G0[o + 6] - col) * G0[o + 7]
    const escaped = !(x > -FAR && x < FAR && y > -FAR && y < FAR)
    let px = x
    let py = y
    if (hasFin && !escaped) {
      // the final transform bends the plotted point, not the orbit
      vary(G1, K1, 0, (t >>> 1) & 2)
      px = IO[0]
      py = IO[1]
    }

    if (escaped) {
      // restart from a point drawn from the same generator
      const u = (((a + b) | 0) + d) | 0
      d = (d + 1) | 0
      a = b ^ (b >>> 9)
      b = (c + (c << 3)) | 0
      c = (c << 21) | (c >>> 11)
      c = (c + u) | 0
      x = ((u >>> 16) / 32768) - 1
      y = ((u & 0xFFFF) / 32768) - 1
      fuse = FUSE
      bad++
      // escapes count as plotted, so a runaway genome cannot loop forever
      if (out) {
        const j = (first + plotted) * 3
        out[j] = Number.NaN
        out[j + 1] = Number.NaN
        out[j + 2] = 0
      }
      plotted++
      continue
    }
    if (fuse > 0) {
      fuse--
      continue
    }
    if (out) {
      const j = (first + plotted) * 3
      out[j] = px
      out[j + 1] = py
      out[j + 2] = col
      plotted++
      continue
    }
    plotted++
    const gx = A * px + B * py + OX
    const gy = C * px + D * py + OY
    if (gx >= 0 && gy >= 0 && gx < gw && gy < gh) {
      const i = ((gy | 0) * gw + (gx | 0)) * 2
      acc[i] += 1
      acc[i + 1] += col
    }
  }
  st.s[0] = a
  st.s[1] = b
  st.s[2] = c
  st.s[3] = d
  st.p[0] = x
  st.p[1] = y
  st.p[2] = col
  st.bad += bad
}

// ---------------------------------------------------------------------------
// Random genomes
// ---------------------------------------------------------------------------

export const FAMILIES = {
  /** Soft folds and veils. */
  Silk: ['linear', 'sinusoidal', 'swirl', 'bubble', 'eyefish', 'cylinder'],
  /** Inversions in the unit circle: shells, lenses, bubbles. */
  Spherical: ['spherical', 'spherical', 'linear', 'julia', 'bubble', 'fisheye'],
  /** Whorls and coils. */
  Spiral: ['spiral', 'swirl', 'polar', 'hyperbolic', 'linear', 'handkerchief'],
  /** Petals, hearts and discs. */
  Petal: ['julia', 'disc', 'heart', 'horseshoe', 'julia', 'linear'],
  /** Anything goes. */
  Chimera: VARIATIONS,
} as const satisfies Record<string, readonly Variation[]>

export type Family = keyof typeof FAMILIES

// Final transforms keep the symmetry of the flame. All of these commute with
// rotations about the origin (julia even doubles their order); only the
// radial ones also commute with mirrors, so mirrored flames use those, unturned.
const FINALS: readonly Variation[] = ['spherical', 'swirl', 'julia', 'bubble', 'eyefish']
const FINALS_MIRROR: readonly Variation[] = ['spherical', 'bubble', 'eyefish']

/** Deterministic cos / sin of 2 PI k / n (no Math.cos). */
function turn(k: number, n: number): [number, number] {
  const a = (2 * PI * k) / n
  return [tcos(a), tsin(a)]
}

export interface GenomePlan {
  specs: XformSpec[]
  fin: XformSpec | null
  /** Rotational order (1 = none) and whether a mirror is added. */
  order: number
  mirror: boolean
}

/**
 * Draws a genome: 2 to 5 transforms with affine coefficients in [-1, 1] (as
 * flam3's random genomes do), each mixing one to three variations of the
 * family, plus the symmetry transforms and, sometimes, a final transform.
 */
export function drawGenome(r: Rng, family: Family, symmetry: 'None' | 'Mirror' | 'Rotational' | 'Dihedral'): GenomePlan {
  const pool = FAMILIES[family]
  const n = 2 + Math.floor(r() * 4)
  const specs: XformSpec[] = []
  // colour indices spread over the gradient, in shuffled order
  const slots = Array.from({ length: n }, (_, i) => i)
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]]
  }
  let wsum = 0
  for (let i = 0; i < n; i++) {
    const aff = [0, 0, 0, 0, 0, 0].map(() => r() * 2 - 1) as unknown as XformSpec['affine']
    const m = 1 + Math.floor(r() * r() * 3)
    const vars: [Variation, number][] = []
    let total = 0
    for (let k = 0; k < m; k++) {
      const v = pool[Math.floor(r() * pool.length)]
      const w = 0.2 + r()
      vars.push([v, w])
      total += w
    }
    for (const v of vars)
      v[1] /= total
    const weight = 0.25 + r()
    wsum += weight
    specs.push({ affine: aff, color: (slots[i] + 0.15 + r() * 0.7) / n, speed: 0.5, weight, vars })
  }

  let order = 1
  let mirror = false
  if (symmetry === 'Rotational')
    order = 3 + Math.floor(r() * 5)
  else if (symmetry === 'Dihedral')
    order = 2 + Math.floor(r() * 4)
  if (symmetry === 'Mirror' || symmetry === 'Dihedral')
    mirror = true
  const symW = wsum / n
  for (let k = 1; k < order; k++) {
    const [cs, sn] = turn(k, order)
    specs.push({ affine: [cs, -sn, 0, sn, cs, 0], color: 0, speed: 0, weight: symW, vars: [['linear', 1]] })
  }
  if (mirror)
    specs.push({ affine: [-1, 0, 0, 0, 1, 0], color: 0, speed: 0, weight: symW, vars: [['linear', 1]] })

  let fin: XformSpec | null = null
  if (r() < 0.3) {
    const finals = mirror ? FINALS_MIRROR : FINALS
    const v = finals[Math.floor(r() * finals.length)]
    const s = 0.6 + r() * 0.8
    const spin = r()
    const [cs, sn] = mirror ? [1, 0] : turn(spin, 1)
    // a rotation and scale, centred, so symmetry survives the final transform
    fin = { affine: [s * cs, -s * sn, 0, s * sn, s * cs, 0], color: 0, speed: 0, weight: 1, vars: [[v, 1]] }
  }
  return { specs, fin, order, mirror }
}
