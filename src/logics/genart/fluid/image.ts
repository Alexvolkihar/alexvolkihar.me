// From the simulated dye grid to pixels.
//
// The dye grid is refined by a fixed factor with a separable Catmull-Rom
// spline, so the colour work happens on a grid whose size never depends on
// the output. Only the last step, a bilinear resampling of that colour grid,
// knows the canvas size: a hash renders the same picture at 300 px and 8K.

/** Weights of the four Catmull-Rom taps at fraction t between p1 and p2. */
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
 * Refines a w x h grid by the integer factor u, into a dense (w u) x (h u) array, clamped at the edges
 * and at zero (the spline may undershoot next to a sharp edge).
 */
export function refine(src: Float32Array, w: number, h: number, u: number): Float32Array {
  const W = w * u
  const H = h * u
  const taps: [number, number, number, number][] = []
  const base: number[] = []
  for (let p = 0; p < u; p++) {
    const s = (p + 0.5) / u - 0.5
    const i0 = Math.floor(s)
    base.push(i0)
    taps.push(catmullRom(s - i0))
  }
  const cl = (i: number, n: number) => i < 0 ? 0 : i >= n ? n - 1 : i
  const tmp = new Float32Array(W * h)
  for (let y = 0; y < h; y++) {
    const row = y * w
    for (let X = 0; X < W; X++) {
      const p = X % u
      const i = (X - p) / u + base[p]
      const t = taps[p]
      tmp[y * W + X] = t[0] * src[row + cl(i - 1, w)]
        + t[1] * src[row + cl(i, w)]
        + t[2] * src[row + cl(i + 1, w)]
        + t[3] * src[row + cl(i + 2, w)]
    }
  }
  const out = new Float32Array(W * H)
  for (let Y = 0; Y < H; Y++) {
    const p = Y % u
    const j = (Y - p) / u + base[p]
    const t = taps[p]
    const r0 = cl(j - 1, h) * W
    const r1 = cl(j, h) * W
    const r2 = cl(j + 1, h) * W
    const r3 = cl(j + 2, h) * W
    const o = Y * W
    for (let X = 0; X < W; X++) {
      const v = t[0] * tmp[r0 + X] + t[1] * tmp[r1 + X] + t[2] * tmp[r2 + X] + t[3] * tmp[r3 + X]
      out[o + X] = v > 0 ? v : 0
    }
  }
  return out
}

/**
 * Per output pixel along one axis: the lower sample index and the fraction,
 * for n samples spread evenly over `span` pixels starting at pixel `start`.
 */
export function axisMap(px: number, start: number, span: number, n: number): { i0: Int32Array, t: Float32Array } {
  const i0 = new Int32Array(px)
  const t = new Float32Array(px)
  const k = n / span
  for (let p = 0; p < px; p++) {
    let s = (p - start + 0.5) * k - 0.5
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

// 4 x 4 Bayer matrix, centred on zero: half a level of ordered dither breaks
// the banding of long, soft gradients on 8-bit output.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16 - 0.5)

/**
 * Bilinear resampling of an RGB colour grid (gw x gh, 3 floats per cell in
 * 0..255) that covers the pixel rectangle [x0, x0 + spanW) x [y0, y0 + spanH),
 * into a W x H RGBA buffer.
 */
export function resample(rgb: Float32Array, gw: number, gh: number, out: Uint8ClampedArray, W: number, H: number, x0: number, y0: number, spanW: number, spanH: number): void {
  const cols = axisMap(W, x0, spanW, gw)
  const rows = axisMap(H, y0, spanH, gh)
  const ci = cols.i0
  const ct = cols.t
  const line = new Float32Array(gw * 3)
  const stride = gw * 3
  for (let y = 0; y < H; y++) {
    const r0 = rows.i0[y] * stride
    const ty = rows.t[y]
    for (let c = 0; c < stride; c++)
      line[c] = rgb[r0 + c] + (rgb[r0 + stride + c] - rgb[r0 + c]) * ty
    const brow = (y & 3) * 4
    let o = y * W * 4
    for (let x = 0; x < W; x++, o += 4) {
      const i = ci[x] * 3
      const t = ct[x]
      const d = BAYER[brow + (x & 3)]
      out[o] = line[i] + (line[i + 3] - line[i]) * t + d
      out[o + 1] = line[i + 1] + (line[i + 4] - line[i + 1]) * t + d
      out[o + 2] = line[i + 2] + (line[i + 5] - line[i + 2]) * t + d
      out[o + 3] = 255
    }
  }
}
