// Two-dimensional iterated maps with strange attractors, and the tools to
// tell a good parameter set from a dull one.
//
// - Clifford: Clifford A. Pickover, "Chaos in Wonderland" (1994).
// - de Jong: Peter de Jong's map, popularised by A. K. Dewdney in Scientific
//   American (1987).
// - Svensson: Johnny Svensson's variant, as collected by Paul Bourke.
// - Dream: Pickover's "fractal dream" map, also from "Chaos in Wonderland".
//
// Sines come from a table filled with a Taylor series (only +, *, /), never
// from Math.sin: chaotic orbits amplify the last bit, and Math.sin is allowed
// to differ between engines, while IEEE arithmetic is not. The same hash thus
// traces the same orbit in every browser. The table is also faster.

export const MAP_KINDS = ['Clifford', 'de Jong', 'Svensson', 'Dream'] as const
export type MapKind = typeof MAP_KINDS[number]

export interface MapParams {
  kind: MapKind
  a: number
  b: number
  c: number
  d: number
}

// ---------------------------------------------------------------------------
// Deterministic sine table
// ---------------------------------------------------------------------------

const N = 16384
const MASK = N - 1
const PHASE = N / (2 * Math.PI)
const QUARTER = N / 4
const BIG = N * 64

function taylorSin(x: number): number {
  const x2 = x * x
  let term = x
  let sum = x
  for (let k = 1; k < 14; k++) {
    term *= -x2 / ((2 * k) * (2 * k + 1))
    sum += term
  }
  return sum
}

const SIN = (() => {
  const t = new Float64Array(N + 1)
  for (let k = 0; k <= QUARTER; k++) {
    const s = taylorSin((2 * Math.PI * k) / N)
    t[k] = s
    t[N / 2 - k] = s
    t[N / 2 + k] = -s
    t[(N - k) & MASK] = -s
  }
  t[0] = 0
  t[N / 2] = 0
  t[N] = 0
  return t
})()

// ---------------------------------------------------------------------------
// The four maps share one form: each new coordinate is the sum of two sine
// terms, amp * sin(kx * x + ky * y + phase) (a cosine is a sine a quarter turn
// ahead). A map is thus 4 terms of 4 numbers, with the table's PHASE factor
// and the +BIG shift folded in: the table phase of a term is KX x + KY y + OFF,
// always positive, so `| 0` is a floor (arguments stay far below
// BIG / PHASE = 400 radians). One branch-free loop serves every map.
// ---------------------------------------------------------------------------

/** amp, KX, KY, OFF for the terms x1, x2 (new x) and y1, y2 (new y). */
export function terms(m: MapParams): Float64Array {
  const { a, b, c, d } = m
  // [amp, kx, ky, cosine?] per term
  let t: number[][]
  switch (m.kind) {
    case 'Clifford': // x' = sin(a y) + c cos(a x),  y' = sin(b x) + d cos(b y)
      t = [[1, 0, a, 0], [c, a, 0, 1], [1, b, 0, 0], [d, 0, b, 1]]
      break
    case 'de Jong': // x' = sin(a y) - cos(b x),  y' = sin(c x) - cos(d y)
      t = [[1, 0, a, 0], [-1, b, 0, 1], [1, c, 0, 0], [-1, 0, d, 1]]
      break
    case 'Svensson': // x' = d sin(a x) - sin(b y),  y' = c cos(a x) + cos(b y)
      t = [[d, a, 0, 0], [-1, 0, b, 0], [c, a, 0, 1], [1, 0, b, 1]]
      break
    default: // Dream: x' = sin(b y) + c sin(b x),  y' = sin(a x) + d sin(a y)
      t = [[1, 0, b, 0], [c, b, 0, 0], [1, a, 0, 0], [d, 0, a, 0]]
  }
  const out = new Float64Array(16)
  t.forEach(([amp, kx, ky, isCos], i) => {
    out[i * 4] = amp
    out[i * 4 + 1] = kx * PHASE
    out[i * 4 + 2] = ky * PHASE
    out[i * 4 + 3] = BIG + isCos * QUARTER
  })
  return out
}

/** One table lookup: sine at table phase q (q > 0). */
function tsin(q: number): number {
  const i = q | 0
  const k = i & MASK
  return SIN[k] + (q - i) * (SIN[k + 1] - SIN[k])
}

// One step for the probe. The result goes to OUT to avoid allocating.
const OUT = new Float64Array(2)

function step(t: Float64Array, x: number, y: number): void {
  OUT[0] = t[0] * tsin(t[1] * x + t[2] * y + t[3]) + t[4] * tsin(t[5] * x + t[6] * y + t[7])
  OUT[1] = t[8] * tsin(t[9] * x + t[10] * y + t[11]) + t[12] * tsin(t[13] * x + t[14] * y + t[15])
}

// ---------------------------------------------------------------------------
// Probe: a short pre-run that decides whether a parameter set is worth drawing
// ---------------------------------------------------------------------------

const START_X = 0.1307
const START_Y = -0.2711
const TRANSIENT = 300
const SAMPLES = 12000
const BINS = 48

export interface Probe {
  ok: boolean
  /** Last point of the probe: the main run continues the same orbit. */
  x: number
  y: number
  /** Centre and half extents of the attractor. */
  cx: number
  cy: number
  hw: number
  hh: number
  /** Mean squared jump between consecutive points (sets the colour scale). */
  jump: number
  /** Largest Lyapunov exponent, occupied fraction of a 48x48 grid, normalised entropy. */
  lyapunov: number
  fill: number
  entropy: number
  /** Coefficient of variation of the occupied bins: low means flat fog. */
  contrast: number
  /** Probe points, x and y interleaved, kept to fit the frame. */
  points: Float64Array
}

/**
 * Runs a few thousand steps and measures the cloud. A set is rejected when
 * the orbit escapes, settles on a fixed point or a cycle (no positive
 * Lyapunov exponent, few occupied bins), or spreads into a featureless fog.
 */
export function probe(m: MapParams): Probe {
  const t = terms(m)
  let x = START_X
  let y = START_Y
  const bad: Probe = { ok: false, x, y, cx: 0, cy: 0, hw: 0, hh: 0, jump: 0, lyapunov: 0, fill: 0, entropy: 0, contrast: 0, points: new Float64Array(0) }

  for (let i = 0; i < TRANSIENT; i++) {
    step(t, x, y)
    x = OUT[0]
    y = OUT[1]
  }
  if (!Number.isFinite(x) || !Number.isFinite(y))
    return bad

  // Lyapunov exponent (Sprott's method): follow a shadow orbit 1e-8 away and
  // renormalise the separation after every step.
  const d0 = 1e-8
  let sx = x + d0
  let sy = y
  let lsum = 0
  const pts = new Float64Array(SAMPLES * 2)
  let x0 = Infinity
  let x1 = -Infinity
  let y0 = Infinity
  let y1 = -Infinity
  let jump = 0
  for (let i = 0; i < SAMPLES; i++) {
    step(t, x, y)
    const nx = OUT[0]
    const ny = OUT[1]
    step(t, sx, sy)
    let dx = OUT[0] - nx
    let dy = OUT[1] - ny
    let dd = Math.sqrt(dx * dx + dy * dy)
    if (dd === 0) {
      dx = d0
      dy = 0
      dd = d0
    }
    lsum += Math.log(dd / d0)
    sx = nx + (dx * d0) / dd
    sy = ny + (dy * d0) / dd
    jump += (nx - x) * (nx - x) + (ny - y) * (ny - y)
    x = nx
    y = ny
    pts[i * 2] = x
    pts[i * 2 + 1] = y
    if (x < x0)
      x0 = x
    if (x > x1)
      x1 = x
    if (y < y0)
      y0 = y
    if (y > y1)
      y1 = y
  }
  const w = x1 - x0
  const h = y1 - y0
  if (!(w > 0.05) || !(h > 0.05) || !Number.isFinite(w + h))
    return bad

  const hist = new Uint32Array(BINS * BINS)
  for (let i = 0; i < SAMPLES; i++) {
    const bx = Math.min(BINS - 1, Math.floor(((pts[i * 2] - x0) / w) * BINS))
    const by = Math.min(BINS - 1, Math.floor(((pts[i * 2 + 1] - y0) / h) * BINS))
    hist[by * BINS + bx]++
  }
  let used = 0
  let ent = 0
  let sq = 0
  for (let i = 0; i < hist.length; i++) {
    const n = hist[i]
    if (!n)
      continue
    used++
    const p = n / SAMPLES
    ent -= p * Math.log(p)
    sq += n * n
  }
  const mean = SAMPLES / used
  const contrast = Math.sqrt(Math.max(0, sq / used - mean * mean)) / mean

  return {
    ok: true,
    x,
    y,
    cx: (x0 + x1) / 2,
    cy: (y0 + y1) / 2,
    hw: w / 2,
    hh: h / 2,
    jump: jump / SAMPLES,
    lyapunov: lsum / SAMPLES,
    fill: used / (BINS * BINS),
    entropy: ent / Math.log(BINS * BINS),
    contrast,
    points: pts,
  }
}

// ---------------------------------------------------------------------------
// Main run: the orbit splatted into a square density grid
// ---------------------------------------------------------------------------

export interface Plot {
  /** Grid side in cells; grid position of a point is (ox + A x + B y, oy + C x + D y). */
  G: number
  A: number
  B: number
  C: number
  D: number
  ox: number
  oy: number
  /** 1, 2 (mirror across the vertical axis) or 4 (quarter turns around the centre). */
  copies: number
  iterations: number
  /** Mean squared jump of the orbit: a jump of that size gets colour 0.5. */
  jumpNorm: number
}

/**
 * Iterates the map along two independent orbits, (x, y) and (u, w), both
 * already on the attractor. Every point adds one hit to COUNT (G x G cells,
 * saturating) and its smoothed speed (0 slow, 1 fast) to SPEED, a
 * half-resolution grid: speed / hits is the mean speed through each 2x2 block.
 *
 * Speed notes. Two orbits instead of one long one: each step depends on the
 * previous, so a single orbit leaves the CPU waiting; two let it work on both
 * at once, and both sample the same invariant measure. The points are queued
 * in a small batch and written to the grids by a second tight loop. Two bytes
 * per cell, and a colour grid four times smaller, keep the random writes in
 * cache.
 */
export function accumulate(m: MapParams, p: Plot, x: number, y: number, u: number, w: number, count: Uint16Array, speed: Float32Array): void {
  const T = SIN
  const sn = (q: number) => {
    const i = q | 0
    const j = i & MASK
    return T[j] + (q - i) * (T[j + 1] - T[j])
  }
  const t = terms(m)
  const [a1, kx1, ky1, o1, a2, kx2, ky2, o2, b1, lx1, ly1, p1, b2, lx2, ly2, p2] = t
  const { G, A, B, C, D, ox, oy, copies, jumpNorm } = p
  const last = G - 1
  const half = (G + 1) >> 1

  // queued points: cell (iy << 16 | ix) and speed
  const BATCH = 4096
  const qCell = new Int32Array(BATCH)
  const qSpeed = new Float32Array(BATCH)
  let queued = 0
  const flush = () => {
    for (let i = 0; i < queued; i++) {
      let ix = qCell[i] & 0xFFFF
      let iy = qCell[i] >>> 16
      const q = qSpeed[i]
      for (let r = 0; r < copies; r++) {
        const o = iy * G + ix
        const n = count[o]
        if (n < 65535)
          count[o] = n + 1
        speed[(iy >> 1) * half + (ix >> 1)] += q
        // next copy: mirror across the vertical axis, or a quarter turn
        if (copies === 2) {
          ix = last - ix
        }
        else {
          const t = ix
          ix = last - iy
          iy = t
        }
      }
    }
    queued = 0
  }

  let c0 = 0.5
  let c1 = 0.5
  const steps = Math.ceil(p.iterations / 2)
  for (let n = 0; n < steps; n++) {
    const x1 = a1 * sn(kx1 * x + ky1 * y + o1) + a2 * sn(kx2 * x + ky2 * y + o2)
    const y1 = b1 * sn(lx1 * x + ly1 * y + p1) + b2 * sn(lx2 * x + ly2 * y + p2)
    const u1 = a1 * sn(kx1 * u + ky1 * w + o1) + a2 * sn(kx2 * u + ky2 * w + o2)
    const w1 = b1 * sn(lx1 * u + ly1 * w + p1) + b2 * sn(lx2 * u + ly2 * w + p2)
    const v0 = (x1 - x) * (x1 - x) + (y1 - y) * (y1 - y)
    const v1 = (u1 - u) * (u1 - u) + (w1 - w) * (w1 - w)
    c0 += (v0 / (v0 + jumpNorm) - c0) * 0.5
    c1 += (v1 / (v1 + jumpNorm) - c1) * 0.5
    x = x1
    y = y1
    u = u1
    w = w1
    let gx = ox + A * x + B * y
    let gy = oy + C * x + D * y
    if (gx >= 0 && gy >= 0 && gx < G && gy < G) {
      qCell[queued] = ((gy | 0) << 16) | (gx | 0)
      qSpeed[queued++] = c0
    }
    gx = ox + A * u + B * w
    gy = oy + C * u + D * w
    if (gx >= 0 && gy >= 0 && gx < G && gy < G) {
      qCell[queued] = ((gy | 0) << 16) | (gx | 0)
      qSpeed[queued++] = c1
    }
    if (queued > BATCH - 2)
      flush()
  }
  flush()
}
