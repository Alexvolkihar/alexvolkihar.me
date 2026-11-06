// The coat pattern of Pelt: a Turing-type activator-inhibitor process run on a
// grid laid over the body coordinates (u along the spine, v across it).
//
// The model is the discrete one of D. A. Young ("A local activator-inhibitor
// model of vertebrate skin patterns", 1984): pigment cells activate their
// near neighbours and inhibit a wider ring; each step a cell becomes coloured
// when the activation it receives outweighs the inhibition. Here the two
// neighbourhoods are near-Gaussians (two box blurs per axis), the cell state is kept
// a little soft, and the threshold is the quantile that keeps a set fraction
// of the skin coloured, so the coverage of a coat is chosen, not tuned.
//
// The convolution is normalised by the convolution of the body mask, which
// gives the domain zero-flux borders. On a narrow domain (a tail) the
// inhibition then spans the whole width and spots can only form bands, which
// is J. D. Murray's argument for spotted animals with ringed tails.
//
// Rosettes use two stages, after Liu, Liaw & Maini (2006): large spots first,
// whose rim becomes the ring and whose core turns to a warmer ground, then a
// finer pattern breaks the ring into pieces. Reticulated coats label each
// large spot, grow the labels until they meet (a generalised Voronoi
// partition) and draw pale lines along the meeting edges.

import { hash3, rnd3, smoothstep } from './util'

/** Rectangle of body coordinates to cover, and the body mask inside it. */
export interface Domain {
  u0: number
  u1: number
  v0: number
  v1: number
  mask: ((u: number, v: number) => number) | null
}

export type CoatKind = 'Spots' | 'Rosettes' | 'Stripes' | 'Reticulated' | 'Piebald'

interface Grid {
  nx: number
  ny: number
  i0: number
  j0: number
  cell: number
  mask: Float32Array
}

/** A scalar field on a grid, sampled bilinearly in body coordinates. */
interface Field {
  g: Grid
  data: Float32Array
}

function makeGrid(dom: Domain, cell: number): Grid {
  const i0 = Math.floor(dom.u0 / cell) - 2
  const j0 = Math.floor(dom.v0 / cell) - 2
  const nx = Math.ceil(dom.u1 / cell) + 3 - i0
  const ny = Math.ceil(dom.v1 / cell) + 3 - j0
  const mask = new Float32Array(nx * ny)
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++)
      mask[j * nx + i] = dom.mask ? dom.mask((i0 + i) * cell, (j0 + j) * cell) : 1
  }
  return { nx, ny, i0, j0, cell, mask }
}

export function sample(f: Field, u: number, v: number): number {
  const { nx, ny, i0, j0, cell } = f.g
  let x = u / cell - i0
  let y = v / cell - j0
  x = x < 0 ? 0 : x > nx - 1.001 ? nx - 1.001 : x
  y = y < 0 ? 0 : y > ny - 1.001 ? ny - 1.001 : y
  const xi = x | 0
  const yi = y | 0
  const fx = x - xi
  const fy = y - yi
  const d = f.data
  const k = yi * nx + xi
  const a = d[k] + (d[k + 1] - d[k]) * fx
  const b = d[k + nx] + (d[k + nx + 1] - d[k + nx]) * fx
  return a + (b - a) * fy
}

// --- blur ---------------------------------------------------------------------

/** Box radius whose two passes have standard deviation sigma (in cells). */
const boxRadius = (sigma: number) => Math.max(0.25, (-1 + Math.sqrt(1 + 6 * sigma * sigma)) / 2)

/**
 * One box pass with a fractional radius, zero outside the grid, along x or
 * along y. `pre` holds running sums ((nx + 1) * (ny + 1) entries); the y pass
 * walks the grid row by row so it stays cache friendly.
 */
function boxPass(src: Float32Array, dst: Float32Array, nx: number, ny: number, r: number, alongX: boolean, pre: Float64Array) {
  const inv = 1 / (2 * r + 1)
  const ri = Math.floor(r)
  const rf = r - ri
  if (alongX) {
    for (let j = 0; j < ny; j++) {
      const base = j * nx
      pre[0] = 0
      for (let k = 0; k < nx; k++)
        pre[k + 1] = pre[k] + src[base + k]
      const total = pre[nx]
      for (let k = 0; k < nx; k++) {
        const hiK = k + ri + 1
        const hi = hiK >= nx ? total : pre[hiK] + rf * src[base + hiK]
        const loK = k - ri - 1
        const lo = loK < 0 ? 0 : pre[loK + 1] - rf * src[base + loK]
        dst[base + k] = (hi - lo) * inv
      }
    }
    return
  }
  // pre[j * nx + i]: sum of src over rows 0..j-1 of column i
  for (let i = 0; i < nx; i++)
    pre[i] = 0
  for (let j = 0; j < ny; j++) {
    const a = j * nx
    const b = a + nx
    for (let i = 0; i < nx; i++)
      pre[b + i] = pre[a + i] + src[a + i]
  }
  const last = ny * nx
  for (let j = 0; j < ny; j++) {
    const hiK = j + ri + 1
    const loK = j - ri - 1
    const o = j * nx
    for (let i = 0; i < nx; i++) {
      const hi = hiK >= ny ? pre[last + i] : pre[hiK * nx + i] + rf * src[hiK * nx + i]
      const lo = loK < 0 ? 0 : pre[(loK + 1) * nx + i] - rf * src[loK * nx + i]
      dst[o + i] = (hi - lo) * inv
    }
  }
}

function blur(src: Float32Array, out: Float32Array, tmp: Float32Array, g: Grid, ru: number, rv: number, pre: Float64Array) {
  boxPass(src, tmp, g.nx, g.ny, ru, true, pre)
  boxPass(tmp, out, g.nx, g.ny, ru, true, pre)
  boxPass(out, tmp, g.nx, g.ny, rv, false, pre)
  boxPass(tmp, out, g.nx, g.ny, rv, false, pre)
}

// --- Turing pattern -----------------------------------------------------------

interface TuringOpts {
  /** Wavelength, body units. */
  lambda: number
  /** Fraction of the skin that ends up coloured. */
  coverage: number
  /** Stretch of both kernels across the body (> 1 gives bands across u). */
  across: number
  iters: number
  seed: number
  /** Grid cells per wavelength. */
  res?: number
}

/**
 * Returns the activator-minus-inhibitor field, normalised so that 0 is the
 * colouring threshold and 1 one standard deviation above it.
 */
function turing(dom: Domain, o: TuringOpts): Field {
  const cell = o.lambda / (o.res ?? 9)
  const g = makeGrid(dom, cell)
  const N = g.nx * g.ny
  const a = new Float32Array(N)
  const A = new Float32Array(N)
  const I = new Float32Array(N)
  const tmp = new Float32Array(N)
  const mA = new Float32Array(N)
  const mI = new Float32Array(N)
  const pre = new Float64Array((g.nx + 1) * (g.ny + 1))
  // DoG of Gaussians sigma and 2 sigma peaks at a wavelength of 6.54 sigma.
  const sA = 0.153 * o.lambda / cell
  const rAu = boxRadius(sA)
  const rAv = boxRadius(sA * o.across)
  const rIu = boxRadius(2 * sA)
  const rIv = boxRadius(2 * sA * o.across)
  blur(g.mask, mA, tmp, g, rAu, rAv, pre)
  blur(g.mask, mI, tmp, g, rIu, rIv, pre)
  // Young's initial condition: a random scatter of differentiated cells.
  for (let j = 0; j < g.ny; j++) {
    for (let i = 0; i < g.nx; i++) {
      const k = j * g.nx + i
      a[k] = g.mask[k] * (rnd3(g.i0 + i, g.j0 + j, o.seed) < o.coverage ? 1 : 0)
    }
  }
  const hist = new Uint32Array(1024)
  let thr = 0
  let sd = 1
  for (let it = 0; it < o.iters; it++) {
    blur(a, A, tmp, g, rAu, rAv, pre)
    blur(a, I, tmp, g, rIu, rIv, pre)
    let lo = Infinity
    let hi = -Infinity
    let cnt = 0
    let s1 = 0
    let s2 = 0
    for (let k = 0; k < N; k++) {
      if (g.mask[k] < 0.5) {
        A[k] = 0
        continue
      }
      const s = A[k] / Math.max(mA[k], 1e-6) - I[k] / Math.max(mI[k], 1e-6)
      A[k] = s
      if (s < lo)
        lo = s
      if (s > hi)
        hi = s
      cnt++
      s1 += s
      s2 += s * s
    }
    sd = Math.sqrt(Math.max(1e-12, s2 / cnt - (s1 / cnt) ** 2))
    // quantile threshold through a histogram
    hist.fill(0)
    const span = Math.max(hi - lo, 1e-9)
    for (let k = 0; k < N; k++) {
      if (g.mask[k] >= 0.5)
        hist[Math.min(1023, ((A[k] - lo) / span * 1024) | 0)]++
    }
    const target = cnt * (1 - o.coverage)
    let acc = 0
    let bin = 0
    while (bin < 1023 && acc + hist[bin] < target) {
      acc += hist[bin]
      bin++
    }
    thr = lo + (bin + (target - acc) / Math.max(1, hist[bin])) / 1024 * span
    const soft = 0.25 * sd
    for (let k = 0; k < N; k++) {
      const x = (A[k] - thr) / soft + 0.5
      a[k] = g.mask[k] * (x < 0 ? 0 : x > 1 ? 1 : x)
    }
  }
  for (let k = 0; k < N; k++)
    A[k] = g.mask[k] < 0.5 ? -2 : (A[k] - thr) / sd
  return { g, data: A }
}

// --- labelled patches (reticulated coats) ------------------------------------

interface Patches {
  /** Distance to the nearest edge between two patches, body units. */
  edge: Field
  /** Per-patch tone in [0, 1], constant over each patch. */
  tone: Field
}

function patches(f: Field, seed: number): Patches {
  const { g, data } = f
  const { nx, ny } = g
  const N = nx * ny
  const label = new Int32Array(N).fill(-1)
  const dist = new Float32Array(N).fill(1e9)
  const stack = new Int32Array(N)
  let nl = 0
  for (let k = 0; k < N; k++) {
    if (data[k] <= 0 || label[k] >= 0)
      continue
    let sp = 0
    stack[sp++] = k
    label[k] = nl
    while (sp) {
      const c = stack[--sp]
      dist[c] = 0
      const ci = c % nx
      for (const n of [c - 1, c + 1, c - nx, c + nx]) {
        if (n < 0 || n >= N || (n === c - 1 && ci === 0) || (n === c + 1 && ci === nx - 1))
          continue
        if (label[n] < 0 && data[n] > 0) {
          label[n] = nl
          stack[sp++] = n
        }
      }
    }
    nl++
  }
  // Two-pass chamfer transform carrying the label of the nearest patch.
  const D = Math.SQRT2
  const relax = (k: number, n: number, w: number) => {
    if (label[n] >= 0 && dist[n] + w < dist[k]) {
      dist[k] = dist[n] + w
      label[k] = label[n]
    }
  }
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i
      if (g.mask[k] < 0.5)
        continue
      if (i > 0)
        relax(k, k - 1, 1)
      if (j > 0) {
        relax(k, k - nx, 1)
        if (i > 0)
          relax(k, k - nx - 1, D)
        if (i < nx - 1)
          relax(k, k - nx + 1, D)
      }
    }
  }
  for (let j = ny - 1; j >= 0; j--) {
    for (let i = nx - 1; i >= 0; i--) {
      const k = j * nx + i
      if (g.mask[k] < 0.5)
        continue
      if (i < nx - 1)
        relax(k, k + 1, 1)
      if (j < ny - 1) {
        relax(k, k + nx, 1)
        if (i < nx - 1)
          relax(k, k + nx + 1, D)
        if (i > 0)
          relax(k, k + nx - 1, D)
      }
    }
  }
  // Edges: cells next to a cell of another patch, then distance to them.
  const e = new Float32Array(N).fill(1e9)
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i
      const l = label[k]
      if (l < 0)
        continue
      if ((i < nx - 1 && label[k + 1] >= 0 && label[k + 1] !== l) || (j < ny - 1 && label[k + nx] >= 0 && label[k + nx] !== l)) {
        e[k] = 0.5
        if (i < nx - 1 && label[k + 1] !== l)
          e[k + 1] = 0.5
        if (j < ny - 1 && label[k + nx] !== l)
          e[k + nx] = 0.5
      }
    }
  }
  const relaxE = (k: number, n: number, w: number) => {
    if (e[n] + w < e[k])
      e[k] = e[n] + w
  }
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i
      if (i > 0)
        relaxE(k, k - 1, 1)
      if (j > 0) {
        relaxE(k, k - nx, 1)
        if (i > 0)
          relaxE(k, k - nx - 1, D)
        if (i < nx - 1)
          relaxE(k, k - nx + 1, D)
      }
    }
  }
  for (let j = ny - 1; j >= 0; j--) {
    for (let i = nx - 1; i >= 0; i--) {
      const k = j * nx + i
      if (i < nx - 1)
        relaxE(k, k + 1, 1)
      if (j < ny - 1) {
        relaxE(k, k + nx, 1)
        if (i < nx - 1)
          relaxE(k, k + nx + 1, D)
        if (i > 0)
          relaxE(k, k + nx - 1, D)
      }
    }
  }
  const tone = new Float32Array(N)
  for (let k = 0; k < N; k++) {
    e[k] = Math.min(e[k], 50) * g.cell
    tone[k] = label[k] < 0 ? 0.5 : hash3(label[k], 7, seed) / 4294967296
  }
  return { edge: { g, data: e }, tone: { g, data: tone } }
}

// --- coats --------------------------------------------------------------------

/** Pigment weights at a point of the skin. */
export interface CoatSample {
  /** Dark mark (spot, stripe, patch, rosette ring). */
  mark: number
  /** Secondary ground (rosette core, patch shade). */
  inner: number
  /** Pale ground (piebald white, lines of a reticulated coat). */
  pale: number
  /** Per-patch tone in [-1, 1]. */
  tone: number
}

export type Coat = (u: number, v: number, o: CoatSample) => void

/** `scale` multiplies every wavelength (small bodies get smaller markings). */
export function makeCoat(kind: CoatKind, dom: Domain, seed: number, scale: number): Coat {
  if (kind === 'Spots') {
    const f = turing(dom, { lambda: 0.072 * scale, coverage: 0.24, across: 0.85, iters: 7, seed })
    return (u, v, o) => {
      o.mark = smoothstep(-0.3, 0.3, sample(f, u, v))
      o.inner = 0
      o.pale = 0
      o.tone = 0
    }
  }
  if (kind === 'Stripes') {
    const f = turing(dom, { lambda: 0.11 * scale, coverage: 0.4, across: 4, iters: 8, seed })
    return (u, v, o) => {
      o.mark = smoothstep(-0.3, 0.3, sample(f, u, v))
      o.inner = 0
      o.pale = 0
      o.tone = 0
    }
  }
  if (kind === 'Rosettes') {
    const big = turing(dom, { lambda: 0.15 * scale, coverage: 0.36, across: 0.9, iters: 7, seed, res: 8 })
    const fine = turing(dom, { lambda: 0.05 * scale, coverage: 0.62, across: 1, iters: 6, res: 8, seed: seed ^ 0x5BD1E995 })
    return (u, v, o) => {
      const s = sample(big, u, v)
      const fn = sample(fine, u, v)
      // the rim of each large spot stays dark, its core turns to a warmer ground
      const core = smoothstep(0.75, 1.1, s)
      const ring = smoothstep(-0.3, 0.05, s) * (1 - core)
      // the finer pattern breaks each ring into a few dark blobs
      const brk = smoothstep(-0.25, 0.25, fn)
      // and leaves a few small solid spots in the open ground
      const dot = (1 - smoothstep(-1.6, -1.3, s)) * smoothstep(1.4, 1.8, fn)
      o.mark = Math.max(ring * brk, dot)
      o.inner = core
      o.pale = 0
      o.tone = 0
    }
  }
  if (kind === 'Reticulated') {
    const f = turing(dom, { lambda: 0.15 * scale, coverage: 0.42, across: 0.9, iters: 8, seed, res: 14 })
    const p = patches(f, seed)
    const lw = 0.0075 * scale
    return (u, v, o) => {
      const d = sample(p.edge, u, v)
      const line = 1 - smoothstep(lw * 0.6, lw * 1.5, d)
      o.mark = 1 - line
      o.inner = 0
      o.pale = line * 0.75
      o.tone = sample(p.tone, u, v) * 2 - 1
    }
  }
  // Piebald: few, large patches of colour on a pale ground.
  const f = turing(dom, { lambda: 0.48 * scale, coverage: 0.45, across: 1, iters: 7, seed, res: 10 })
  return (u, v, o) => {
    const s = smoothstep(-0.25, 0.25, sample(f, u, v))
    o.mark = 0.55 * s
    o.inner = 0
    o.pale = 1 - s
    o.tone = 0
  }
}
