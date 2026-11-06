// Light buffers for the "Galaxy" series: additive float images splatted with
// star particles, a box-blur glow, and a tone curve to 8-bit pixels.
//
// A buffer covers the whole canvas at a capped resolution (its short side is
// at most MAX_BUF pixels), so an 8K export costs a few million float pixels
// and the soft light is upscaled; resolved stars are drawn later as sprites
// at full resolution.

export const MAX_BUF = 1100
const TONE_N = 2048
const TONE_MAX = 12

export interface Light {
  w: number
  h: number
  /** Buffer short side, the unit every length is measured in. */
  s: number
  r: Float32Array
  g: Float32Array
  b: Float32Array
  /** Optical depth of the dust, applied before the glow. */
  tau: Float32Array
}

export function makeLight(W: number, H: number): Light {
  // 0.8: the soft light does not need every pixel, and the cover must render fast;
  // small canvases keep up to 400 buffer pixels so their grain stays fine
  const S = Math.min(W, H)
  const k = Math.min(S, Math.max(400, S * 0.8), MAX_BUF) / S
  const w = Math.max(1, Math.round(W * k))
  const h = Math.max(1, Math.round(H * k))
  const n = w * h
  return { w, h, s: Math.min(w, h), r: new Float32Array(n), g: new Float32Array(n), b: new Float32Array(n), tau: new Float32Array(n) }
}

/** Adds a round gaussian blob of light (radius = sigma in buffer pixels). */
export function blob(L: Light, x: number, y: number, sigma: number, cr: number, cg: number, cb: number) {
  const rad = Math.ceil(sigma * 2.6)
  const x0 = Math.max(0, Math.floor(x - rad))
  const x1 = Math.min(L.w - 1, Math.ceil(x + rad))
  const y0 = Math.max(0, Math.floor(y - rad))
  const y1 = Math.min(L.h - 1, Math.ceil(y + rad))
  const inv = 1 / (2 * sigma * sigma)
  for (let j = y0; j <= y1; j++) {
    const dy = j + 0.5 - y
    for (let i = x0; i <= x1; i++) {
      const dx = i + 0.5 - x
      const e = Math.exp(-(dx * dx + dy * dy) * inv)
      if (e < 0.004)
        continue
      const p = j * L.w + i
      L.r[p] += cr * e
      L.g[p] += cg * e
      L.b[p] += cb * e
    }
  }
}

/** Adds an elongated gaussian blob (sigmas along and across the angle `ang`). */
export function ellipseBlob(L: Light, x: number, y: number, sa: number, sb: number, ang: number, cr: number, cg: number, cb: number) {
  const rad = Math.ceil(Math.max(sa, sb) * 2.6)
  const x0 = Math.max(0, Math.floor(x - rad))
  const x1 = Math.min(L.w - 1, Math.ceil(x + rad))
  const y0 = Math.max(0, Math.floor(y - rad))
  const y1 = Math.min(L.h - 1, Math.ceil(y + rad))
  const c = Math.cos(ang)
  const s = Math.sin(ang)
  const ia = 1 / (2 * sa * sa)
  const ib = 1 / (2 * sb * sb)
  for (let j = y0; j <= y1; j++) {
    const dy = j + 0.5 - y
    for (let i = x0; i <= x1; i++) {
      const dx = i + 0.5 - x
      const u = dx * c + dy * s
      const v = -dx * s + dy * c
      const e = Math.exp(-(u * u * ia + v * v * ib))
      if (e < 0.004)
        continue
      const p = j * L.w + i
      L.r[p] += cr * e
      L.g[p] += cg * e
      L.b[p] += cb * e
    }
  }
}

/** Separable box blur, `passes` times (3 passes approach a gaussian). */
export function boxBlur(src: Float32Array, dst: Float32Array, tmp: Float32Array, w: number, h: number, radius: number, passes: number) {
  const r = Math.max(1, Math.round(radius))
  let a = src
  for (let p = 0; p < passes; p++) {
    blurH(a, tmp, w, h, r)
    blurV(tmp, dst, w, h, r)
    a = dst
  }
}

function blurH(src: Float32Array, dst: Float32Array, w: number, h: number, r: number) {
  const inv = 1 / (2 * r + 1)
  for (let y = 0; y < h; y++) {
    const o = y * w
    let acc = 0
    for (let i = -r; i <= r; i++)
      acc += src[o + Math.min(w - 1, Math.max(0, i))]
    for (let x = 0; x < w; x++) {
      dst[o + x] = acc * inv
      const add = Math.min(w - 1, x + r + 1)
      const rem = Math.max(0, x - r)
      acc += src[o + add] - src[o + rem]
    }
  }
}

// Row by row with a running row of sums: the same box filter as blurH, but
// it walks memory in order instead of striding down the columns.
function blurV(src: Float32Array, dst: Float32Array, w: number, h: number, r: number) {
  const inv = 1 / (2 * r + 1)
  const acc = new Float32Array(w)
  for (let i = -r; i <= r; i++) {
    const o = Math.min(h - 1, Math.max(0, i)) * w
    for (let x = 0; x < w; x++)
      acc[x] += src[o + x]
  }
  for (let y = 0; y < h; y++) {
    const o = y * w
    const add = Math.min(h - 1, y + r + 1) * w
    const rem = Math.max(0, y - r) * w
    for (let x = 0; x < w; x++) {
      dst[o + x] = acc[x] * inv
      acc[x] += src[add + x] - src[rem + x]
    }
  }
}

export interface Develop {
  /** Optical depth multiplier per channel (reddening: blue is absorbed most). */
  extinction: readonly [number, number, number]
  /** Weights of the sharp light, the small glow and the wide bloom. */
  sharp: number
  glow: number
  bloom: number
  exposure: number
  bg: readonly [number, number, number]
}

/**
 * Applies the dust, adds the two glows and tone-maps each channel with
 * 1 - exp(-x) over the background colour, into RGBA bytes.
 */
export function develop(L: Light, d: Develop): Uint8ClampedArray {
  const { w, h } = L
  const n = w * h
  const out = new Uint8ClampedArray(n * 4)
  const small = new Float32Array(n)
  const big = new Float32Array(n)
  const tmp = new Float32Array(n)
  // dust: blur the optical depth a little so the lanes read as smoke
  boxBlur(L.tau, small, tmp, w, h, L.s * 0.0025, 1)
  L.tau.set(small)
  const chans = [L.r, L.g, L.b]
  for (let c = 0; c < 3; c++) {
    const raw = chans[c]
    const k = d.extinction[c]
    for (let i = 0; i < n; i++) {
      const t = L.tau[i]
      if (t > 0)
        raw[i] *= Math.exp(-t * k)
    }
    boxBlur(raw, small, tmp, w, h, L.s * 0.0018, 2)
    boxBlur(small, big, tmp, w, h, L.s * 0.026, 2)
    // tone curve 1 - exp(-v) over the background, tabulated
    const bg = d.bg[c]
    const tone = new Float32Array(TONE_N + 2)
    for (let i = 0; i <= TONE_N + 1; i++)
      tone[i] = (bg + (1 - bg) * (1 - Math.exp(-i / TONE_N * TONE_MAX))) * 255
    const k2 = d.exposure * TONE_N / TONE_MAX
    const { sharp, glow, bloom } = d
    for (let i = 0; i < n; i++) {
      let f = (raw[i] * sharp + small[i] * glow + big[i] * bloom) * k2
      if (f > TONE_N)
        f = TONE_N
      const j = f | 0
      out[i * 4 + c] = tone[j] + (tone[j + 1] - tone[j]) * (f - j)
    }
  }
  for (let i = 0; i < n; i++)
    out[i * 4 + 3] = 255
  return out
}
