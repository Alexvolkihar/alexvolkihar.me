// Displacement fields of vibrating plates, sampled on a grid.
//
// Square plates use the classic approximation of the free square plate that
// Wheatstone (1833) and Rayleigh (Theory of Sound, 1877) drew from Chladni's
// figures, later justified by Ritz's variational method (1909):
//   u(x, y) = cos(n pi x) cos(m pi y) +/- cos(m pi x) cos(n pi y)
// on the unit square. Circular plates use the separable modes
//   u(r, theta) = J_n(k r) cos(n theta + phi)
// with k a zero of J_n' so that the rim is a loop, as on a free plate (the
// true free-edge mode mixes in a modified Bessel function; this keeps the
// nodal diameters and circles that Chladni drew).
//
// A field is a pure function of its mode list: no randomness in here.

export interface SquareTerm { n: number, m: number, c: number }
export interface CircleTerm { n: number, k: number, c: number, phi: number }

export type Mode
  = | { kind: 'square', terms: SquareTerm[] }
    | { kind: 'circle', terms: CircleTerm[] }

export interface Field {
  /** Grid side: samples at x = i / (N - 1), i = 0..N-1, over the unit square. */
  N: number
  /** Displacement, normalised so that max |u| over the plate is 1. */
  u: Float32Array
  /** du/dx and du/dy in plate units (same normalisation). */
  gx: Float32Array
  gy: Float32Array
  /** Mean squared gradient over the plate, the scale of Newton steps. */
  g2: number
  round: boolean
}

// Bessel function of the first kind, J_n(x), from Bessel's integral
// J_n(x) = 1/(2 pi) int_0^{2 pi} cos(n t - x sin t) dt. The trapezoid rule on a
// periodic analytic integrand converges geometrically once the sample count
// exceeds x + n by a margin, which 64 samples do for every mode used here
// (x < 26, n < 9).
const QN = 64
const QS = new Float64Array(QN)
const QT = new Float64Array(QN)
for (let i = 0; i < QN; i++) {
  QT[i] = (2 * Math.PI * i) / QN
  QS[i] = Math.sin(QT[i])
}

export function besselJ(n: number, x: number): number {
  let s = 0
  for (let i = 0; i < QN; i++)
    s += Math.cos(n * QT[i] - x * QS[i])
  return s / QN
}

function besselJp(n: number, x: number): number {
  if (n === 0)
    return -besselJ(1, x)
  return 0.5 * (besselJ(n - 1, x) - besselJ(n + 1, x))
}

// Zeros of J_n', memoised per order: a pure function of n.
const ZEROS = new Map<number, number[]>()

/** The m-th positive zero of J_n' (m >= 1), skipping the trivial zero at 0. */
export function besselJpZero(n: number, m: number): number {
  let zs = ZEROS.get(n)
  if (!zs) {
    zs = []
    ZEROS.set(n, zs)
  }
  if (zs.length >= m)
    return zs[m - 1]
  const step = 0.08
  let x = zs.length ? zs[zs.length - 1] + step : 0.4
  let fa = besselJp(n, x)
  while (zs.length < m) {
    const xb = x + step
    const fb = besselJp(n, xb)
    if (fa === 0 || fa * fb < 0) {
      let a = x
      let b = xb
      let va = fa
      for (let it = 0; it < 40; it++) {
        const mid = 0.5 * (a + b)
        const vm = besselJp(n, mid)
        if (va * vm <= 0) {
          b = mid
        }
        else {
          a = mid
          va = vm
        }
      }
      zs.push(0.5 * (a + b))
    }
    x = xb
    fa = fb
  }
  return zs[m - 1]
}

/** Nodal-line count of a mode, used to sort a board from simple to busy. */
export function complexity(mode: Mode): number {
  let c = 0
  for (const t of mode.terms) {
    if (mode.kind === 'square')
      c = Math.max(c, (t as SquareTerm).n + (t as SquareTerm).m)
    else
      c = Math.max(c, 2 * (t as CircleTerm).n + (t as CircleTerm).k / 1.6)
  }
  return c
}

// Radius (plate radius 1) and angle of every grid sample, per grid size.
const POLAR = new Map<number, { rr: Float64Array, ang: Float64Array }>()
function polar(N: number) {
  let p = POLAR.get(N)
  if (!p) {
    const h = 1 / (N - 1)
    const rr = new Float64Array(N * N)
    const ang = new Float64Array(N * N)
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const x = (i * h - 0.5) * 2
        const y = (j * h - 0.5) * 2
        rr[j * N + i] = Math.hypot(x, y)
        ang[j * N + i] = Math.atan2(y, x)
      }
    }
    p = { rr, ang }
    POLAR.set(N, p)
  }
  return p
}

export function buildField(mode: Mode, N: number): Field {
  const u = new Float32Array(N * N)
  const h = 1 / (N - 1)
  const round = mode.kind === 'circle'

  if (mode.kind === 'square') {
    const cx = new Float64Array(N)
    const cy = new Float64Array(N)
    for (const t of mode.terms) {
      for (let i = 0; i < N; i++) {
        cx[i] = Math.cos(t.n * Math.PI * i * h)
        cy[i] = Math.cos(t.m * Math.PI * i * h)
      }
      for (let j = 0; j < N; j++) {
        const row = j * N
        const b = t.c * cy[j]
        for (let i = 0; i < N; i++)
          u[row + i] += b * cx[i]
      }
    }
  }
  else {
    // radial profile on r in [0, 1.1] (plate radius 1), normalised per term
    const R = 2 * N
    const RMAX = 1.1
    const { rr, ang } = polar(N)
    for (const t of mode.terms) {
      const prof = new Float64Array(R + 2)
      let pmax = 1e-9
      for (let q = 0; q <= R + 1; q++) {
        const r = (q / R) * RMAX
        prof[q] = besselJ(t.n, t.k * r)
        if (r <= 1)
          pmax = Math.max(pmax, Math.abs(prof[q]))
      }
      const s = t.c / pmax
      for (let k = 0; k < N * N; k++) {
        const r = rr[k]
        if (r > RMAX)
          continue
        const f = (r / RMAX) * R
        const q = Math.floor(f)
        const w = f - q
        const p = prof[q] + w * (prof[q + 1] - prof[q])
        u[k] += s * p * Math.cos(t.n * ang[k] + t.phi)
      }
    }
  }

  // normalise over the plate
  let max = 1e-9
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const k = j * N + i
      if (round) {
        const x = i * h - 0.5
        const y = j * h - 0.5
        if (x * x + y * y > 0.25)
          continue
      }
      max = Math.max(max, Math.abs(u[k]))
    }
  }
  for (let k = 0; k < N * N; k++)
    u[k] /= max

  // central differences (one-sided at the border)
  const gx = new Float32Array(N * N)
  const gy = new Float32Array(N * N)
  let g2 = 0
  let cnt = 0
  for (let j = 0; j < N; j++) {
    const j0 = Math.max(0, j - 1)
    const j1 = Math.min(N - 1, j + 1)
    for (let i = 0; i < N; i++) {
      const i0 = Math.max(0, i - 1)
      const i1 = Math.min(N - 1, i + 1)
      const k = j * N + i
      const dx = (u[j * N + i1] - u[j * N + i0]) / ((i1 - i0) * h)
      const dy = (u[j1 * N + i] - u[j0 * N + i]) / ((j1 - j0) * h)
      gx[k] = dx
      gy[k] = dy
      g2 += dx * dx + dy * dy
      cnt++
    }
  }
  return { N, u, gx, gy, g2: g2 / cnt, round }
}
