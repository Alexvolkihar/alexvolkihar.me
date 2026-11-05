// Turning the simulated grid into something a pixel pass can sample.
//
// The grid is small (about 120 cells on the short side), so it is first
// refined with a separable Catmull-Rom spline: contours drawn from the refined
// field are smooth curves, where plain bilinear upsampling of the raw grid
// would show the cell lattice as faint kinks at large sizes.

/** Weights of the four Catmull-Rom taps at fraction t of the way from p1 to p2. */
function catmullRom(t: number): [number, number, number, number] {
  const t2 = t * t
  const t3 = t2 * t
  return [
    0.5 * (-t3 + 2 * t2 - t),
    0.5 * (3 * t3 - 5 * t2 + 2),
    0.5 * (-3 * t3 + 4 * t2 + t),
    0.5 * (t3 - t2),
  ]
}

/**
 * Refines a w x h field (row stride `stride`, first cell at `offset`) by the
 * integer factor u, into a dense (w * u) x (h * u) array. Edges are clamped.
 */
export function refine(src: Float32Array, w: number, h: number, stride: number, offset: number, u: number): Float32Array {
  const W = w * u
  const H = h * u
  // one set of weights per sub-cell phase, shared by both passes
  const taps: [number, number, number, number][] = []
  const base: number[] = []
  for (let p = 0; p < u; p++) {
    const s = (p + 0.5) / u - 0.5
    const i0 = Math.floor(s)
    base.push(i0)
    taps.push(catmullRom(s - i0))
  }
  const clamp = (i: number, n: number) => i < 0 ? 0 : i >= n ? n - 1 : i
  // horizontal pass: h rows of W samples
  const tmp = new Float32Array(W * h)
  for (let y = 0; y < h; y++) {
    const row = offset + y * stride
    for (let X = 0; X < W; X++) {
      const p = X % u
      const c = (X - p) / u + base[p]
      const k = taps[p]
      tmp[y * W + X] = k[0] * src[row + clamp(c - 1, w)]
        + k[1] * src[row + clamp(c, w)]
        + k[2] * src[row + clamp(c + 1, w)]
        + k[3] * src[row + clamp(c + 2, w)]
    }
  }
  // vertical pass
  const out = new Float32Array(W * H)
  for (let Y = 0; Y < H; Y++) {
    const p = Y % u
    const c = (Y - p) / u + base[p]
    const k = taps[p]
    const r0 = clamp(c - 1, h) * W
    const r1 = clamp(c, h) * W
    const r2 = clamp(c + 1, h) * W
    const r3 = clamp(c + 2, h) * W
    const o = Y * W
    for (let X = 0; X < W; X++)
      out[o + X] = k[0] * tmp[r0 + X] + k[1] * tmp[r1 + X] + k[2] * tmp[r2 + X] + k[3] * tmp[r3 + X]
  }
  return out
}

/** Central-difference gradient of a dense W x H field, in field units per sample. */
export function gradient(v: Float32Array, W: number, H: number): { gx: Float32Array, gy: Float32Array } {
  const gx = new Float32Array(W * H)
  const gy = new Float32Array(W * H)
  for (let y = 0; y < H; y++) {
    const up = (y > 0 ? y - 1 : 0) * W
    const dn = (y < H - 1 ? y + 1 : H - 1) * W
    const row = y * W
    for (let x = 0; x < W; x++) {
      const l = x > 0 ? x - 1 : 0
      const r = x < W - 1 ? x + 1 : W - 1
      gx[row + x] = (v[row + r] - v[row + l]) / (r - l)
      gy[row + x] = (v[dn + x] - v[up + x]) / ((dn - up) / W)
    }
  }
  return { gx, gy }
}

/**
 * Per output pixel along one axis: the lower sample index and the
 * interpolation fraction, for a dense axis of n samples stretched over
 * `px` pixels starting at pixel `start` (plus a shift, in pixels).
 */
export function axisMap(px: number, start: number, span: number, n: number, shift = 0): { i0: Int32Array, t: Float32Array } {
  const i0 = new Int32Array(px)
  const t = new Float32Array(px)
  const k = n / span
  for (let p = 0; p < px; p++) {
    let s = (p - start - shift + 0.5) * k - 0.5
    if (s < 0)
      s = 0
    if (s > n - 1.0001)
      s = n - 1.0001
    const f = Math.floor(s)
    i0[p] = f
    t[p] = s - f
  }
  return { i0, t }
}
