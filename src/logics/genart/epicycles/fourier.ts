// Complex Fourier series of a closed curve, and the chains of epicycles that
// draw it back.
//
// A closed curve z(t) = x(t) + i y(t), sampled at M equal steps of t, has the
// discrete Fourier coefficients c_k = 1/M Σ z_n e^(−2πi k n / M). Summing the
// rotating vectors c_k e^(ikt) head to tail gives the chain of epicycles: each
// circle turns k times per revolution and carries the next one on its rim, and
// the tip of the last arm draws the curve again. Keeping only some of the terms
// gives a partial reconstruction.
//
// The trigonometry goes through tables indexed by integers (k n mod M), so no
// error accumulates along the curve.

export interface Term {
  /** Frequency: turns per revolution, negative = clockwise. */
  k: number
  /** Radius of the epicycle, |c_k|. */
  r: number
  /** Phase at t = 0, arg c_k. */
  a: number
}

const TAU = Math.PI * 2

function table(n: number): { cos: Float64Array, sin: Float64Array } {
  const cos = new Float64Array(n)
  const sin = new Float64Array(n)
  for (let j = 0; j < n; j++) {
    cos[j] = Math.cos((TAU * j) / n)
    sin[j] = Math.sin((TAU * j) / n)
  }
  return { cos, sin }
}

const tables = new Map<number, { cos: Float64Array, sin: Float64Array }>()
function cachedTable(n: number) {
  let t = tables.get(n)
  if (!t) {
    t = table(n)
    tables.set(n, t)
  }
  return t
}

/** Coefficients c_k for k = −K..K of a closed curve given as interleaved x, y samples. */
export function dft(pts: Float64Array, K: number): Term[] {
  const M = pts.length / 2
  const { cos, sin } = cachedTable(M)
  const out: Term[] = []
  for (let k = -K; k <= K; k++) {
    let re = 0
    let im = 0
    for (let n = 0; n < M; n++) {
      const j = (((k * n) % M) + M) % M
      const x = pts[n * 2]
      const y = pts[n * 2 + 1]
      // (x + iy)(cos − i sin)
      re += x * cos[j] + y * sin[j]
      im += y * cos[j] - x * sin[j]
    }
    re /= M
    im /= M
    out.push({ k, r: Math.hypot(re, im), a: Math.atan2(im, re) })
  }
  return out
}

/**
 * Terms of a real signal s(t) = Σ c_k e^(ikt): the ±k pairs fold into one
 * vector of radius 2|c_k| per k > 0, whose real part is the signal.
 */
export function realTerms(spectrum: readonly Term[]): Term[] {
  return spectrum.filter(t => t.k > 0).map(t => ({ k: t.k, r: 2 * t.r, a: t.a }))
}

/**
 * The n terms kept by a truncation: the largest circles first, or the lowest
 * frequencies first (1, −1, 2, −2...). Negligible terms are never kept.
 */
export function select(spectrum: readonly Term[], n: number, byAmplitude: boolean): Term[] {
  const live = spectrum.filter(t => t.k !== 0 && t.r > 1e-4)
  if (byAmplitude)
    return live.sort((p, q) => q.r - p.r || p.k - q.k).slice(0, n)
  const key = (k: number) => Math.abs(k) * 2 - (k > 0 ? 1 : 0)
  return live.sort((p, q) => key(p.k) - key(q.k)).slice(0, n)
}

/** The curve drawn by a chain, sampled at T equal steps of one revolution (interleaved x, y). */
export function synth(terms: readonly Term[], T: number): Float64Array {
  const { cos, sin } = cachedTable(T)
  const out = new Float64Array(T * 2)
  for (const term of terms) {
    const cr = term.r * Math.cos(term.a)
    const ci = term.r * Math.sin(term.a)
    for (let n = 0; n < T; n++) {
      const j = (((term.k * n) % T) + T) % T
      out[n * 2] += cr * cos[j] - ci * sin[j]
      out[n * 2 + 1] += cr * sin[j] + ci * cos[j]
    }
  }
  return out
}

/** Joint positions of a chain at time t: n + 1 points, the first at the origin. */
export function joints(terms: readonly Term[], t: number): Float64Array {
  const out = new Float64Array((terms.length + 1) * 2)
  let x = 0
  let y = 0
  terms.forEach((term, i) => {
    const ang = term.k * t + term.a
    x += term.r * Math.cos(ang)
    y += term.r * Math.sin(ang)
    out[i * 2 + 2] = x
    out[i * 2 + 3] = y
  })
  return out
}

export interface Box { x0: number, y0: number, x1: number, y1: number }

export function emptyBox(): Box {
  return { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
}

export function growBox(b: Box, x: number, y: number, pad = 0) {
  b.x0 = Math.min(b.x0, x - pad)
  b.y0 = Math.min(b.y0, y - pad)
  b.x1 = Math.max(b.x1, x + pad)
  b.y1 = Math.max(b.y1, y + pad)
}

export function boxOfPoints(b: Box, pts: Float64Array) {
  for (let i = 0; i < pts.length; i += 2)
    growBox(b, pts[i], pts[i + 1])
}

/** Bounds of a chain at time t, circles included. */
export function boxOfChain(b: Box, terms: readonly Term[], t: number) {
  const j = joints(terms, t)
  terms.forEach((term, i) => growBox(b, j[i * 2], j[i * 2 + 1], term.r))
  growBox(b, j[terms.length * 2], j[terms.length * 2 + 1])
}
