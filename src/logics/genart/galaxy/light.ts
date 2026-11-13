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
  /**
   * Particles per buffer pixel, relative to a 420-pixel buffer: small buffers
   * get more particles (each carrying less light), so their grain stays as
   * fine as on a large render instead of turning to salt.
   */
  dens: number
}

const DENS_REF = 420

export function makeLight(W: number, H: number): Light {
  // 0.7: the soft light does not need every pixel (resolved stars are drawn
  // at full resolution later), and the cover must render fast; small canvases
  // keep up to 400 buffer pixels so their grain stays fine
  const S = Math.min(W, H)
  const k = Math.min(S, Math.max(400, S * 0.7), MAX_BUF) / S
  const w = Math.max(1, Math.round(W * k))
  const h = Math.max(1, Math.round(H * k))
  const n = w * h
  const s = Math.min(w, h)
  const dens = Math.max(1, (DENS_REF / s) ** 2)
  return { w, h, s, r: new Float32Array(n), g: new Float32Array(n), b: new Float32Array(n), tau: new Float32Array(n), dens }
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

// Faint light is smoothed, bright light keeps its detail: below SMOOTH_LO
// (exposure units of the smoothed image) only the smoothed light is shown,
// above SMOOTH_HI only the sharp one. A sparse cloud of particles in the
// outskirts would otherwise read as salt, worst on small canvases.
const SMOOTH_LO = 0.03
const SMOOTH_HI = 0.3
// below FADE_LO the smoothed light itself gives way to the wide glow
const FADE_LO = 0.008

/**
 * Applies the dust, adds the two glows and tone-maps each channel with
 * 1 - exp(-x) over the background colour, into RGBA bytes.
 *
 * The smoothed light and the bloom are computed at half resolution: they are
 * soft anyway, and it divides the cost of the wide blurs by four.
 */
export function develop(L: Light, d: Develop): Uint8ClampedArray {
  const { w, h } = L
  const n = w * h
  const out = new Uint8ClampedArray(n * 4)
  const small = new Float32Array(n)
  const tmp = new Float32Array(n)
  // dust: blur the optical depth a little so the lanes read as smoke
  boxBlur(L.tau, small, tmp, w, h, L.s * 0.0025, 1)
  L.tau.set(small)
  const w2 = Math.ceil(w / 2)
  const h2 = Math.ceil(h / 2)
  const n2 = w2 * h2
  const half = new Float32Array(n2)
  const tmp2 = new Float32Array(n2)
  const mid = [new Float32Array(n2), new Float32Array(n2), new Float32Array(n2)]
  const big = [new Float32Array(n2), new Float32Array(n2), new Float32Array(n2)]
  const chans = [L.r, L.g, L.b]
  // the bloom blurs the detail, which already carries sharp + glow
  const bloomK = d.bloom / (d.sharp + d.glow)
  // pass 1: dust, the small glow (kept in the raw buffer), the half-resolution blurs
  for (let c = 0; c < 3; c++) {
    const raw = chans[c]
    const k = d.extinction[c]
    for (let i = 0; i < n; i++) {
      const t = L.tau[i]
      if (t > 0)
        raw[i] *= Math.exp(-t * k)
    }
    if (Math.round(L.s * 0.0018) <= 1)
      tent5(raw, small, tmp, w, h)
    else
      boxBlur(raw, small, tmp, w, h, L.s * 0.0018, 2)
    // detail = sharp + glow, stored in place of the raw light
    const { sharp, glow } = d
    for (let i = 0; i < n; i++)
      raw[i] = raw[i] * sharp + small[i] * glow
    downsample(raw, half, w, h, w2, h2)
    boxBlur(half, mid[c], tmp2, w2, h2, Math.max(1, L.s * 0.005), 2)
    boxBlur(mid[c], big[c], tmp2, w2, h2, L.s * 0.013, 2)
  }
  // pass 2 (half resolution): how much of the detail to keep, and the soft part
  const keep = new Float32Array(n2)
  const ex = d.exposure
  for (let i = 0; i < n2; i++) {
    const lum = (mid[0][i] * 0.3 + mid[1][i] * 0.5 + mid[2][i] * 0.2) * ex
    let a = (lum - SMOOTH_LO) / (SMOOTH_HI - SMOOTH_LO)
    a = a <= 0 ? 0 : a >= 1 ? 1 : a * a * (3 - 2 * a)
    let b = (lum - FADE_LO) / (SMOOTH_LO - FADE_LO)
    b = b <= 0 ? 0 : b >= 1 ? 1 : b * b * (3 - 2 * b)
    keep[i] = a
    const sm = (1 - a) * b
    const sb = (1 - a) * (1 - b) + bloomK
    for (let c = 0; c < 3; c++)
      mid[c][i] = mid[c][i] * sm + big[c][i] * sb
  }
  // pass 3: upsample, mix, tone curve 1 - exp(-v) over the background, tabulated
  const tones: Float32Array[] = []
  for (let c = 0; c < 3; c++) {
    const bg = d.bg[c]
    const tone = new Float32Array(TONE_N + 2)
    for (let i = 0; i <= TONE_N + 1; i++)
      tone[i] = (bg + (1 - bg) * (1 - Math.exp(-i / TONE_N * TONE_MAX))) * 255
    tones.push(tone)
  }
  const k2 = ex * TONE_N / TONE_MAX
  const [R, G, B] = chans
  const [t0, t1, t2] = tones
  // the four half-resolution planes, interpolated between two rows first
  const planes = [keep, mid[0], mid[1], mid[2]]
  const rows = planes.map(() => new Float32Array(w2))
  // per output column: the two half-resolution columns and the weight
  const cx0 = new Int32Array(w)
  const cx1 = new Int32Array(w)
  const cu = new Float32Array(w)
  for (let x = 0; x < w; x++) {
    const fx = Math.min(w2 - 1, Math.max(0, (x - 0.5) / 2))
    const i0 = fx | 0
    cx0[x] = i0
    cx1[x] = Math.min(w2 - 1, i0 + 1)
    cu[x] = fx - i0
  }
  const [rk, rr, rg, rb] = rows
  for (let y = 0; y < h; y++) {
    // half-resolution sample centres sit at 2 i + 0.5
    const fy = Math.min(h2 - 1, Math.max(0, (y - 0.5) / 2))
    const j0 = fy | 0
    const vy = fy - j0
    const o0 = j0 * w2
    const o1 = Math.min(h2 - 1, j0 + 1) * w2
    for (let q = 0; q < 4; q++) {
      const pl = planes[q]
      const row = rows[q]
      for (let i = 0; i < w2; i++)
        row[i] = pl[o0 + i] + (pl[o1 + i] - pl[o0 + i]) * vy
    }
    for (let x = 0; x < w; x++) {
      const i0 = cx0[x]
      const i1 = cx1[x]
      const u = cu[x]
      const kp = rk[i0] + (rk[i1] - rk[i0]) * u
      const p = y * w + x
      const o = p * 4
      let f = (R[p] * kp + rr[i0] + (rr[i1] - rr[i0]) * u) * k2
      if (f > TONE_N)
        f = TONE_N
      let j = f | 0
      out[o] = t0[j] + (t0[j + 1] - t0[j]) * (f - j)
      f = (G[p] * kp + rg[i0] + (rg[i1] - rg[i0]) * u) * k2
      if (f > TONE_N)
        f = TONE_N
      j = f | 0
      out[o + 1] = t1[j] + (t1[j + 1] - t1[j]) * (f - j)
      f = (B[p] * kp + rb[i0] + (rb[i1] - rb[i0]) * u) * k2
      if (f > TONE_N)
        f = TONE_N
      j = f | 0
      out[o + 2] = t2[j] + (t2[j + 1] - t2[j]) * (f - j)
      out[o + 3] = 255
    }
  }
  return out
}

/**
 * Two passes of a 3-wide box blur in one go: the separable kernel
 * [1, 2, 3, 2, 1] / 9, edges repeated.
 */
function tent5(src: Float32Array, dst: Float32Array, tmp: Float32Array, w: number, h: number) {
  const k = 1 / 9
  for (let y = 0; y < h; y++) {
    const o = y * w
    for (let x = 0; x < w; x++) {
      const xm2 = o + (x > 1 ? x - 2 : 0)
      const xm1 = o + (x > 0 ? x - 1 : 0)
      const xp1 = o + (x < w - 1 ? x + 1 : w - 1)
      const xp2 = o + (x < w - 2 ? x + 2 : w - 1)
      tmp[o + x] = (src[xm2] + src[xp2] + 2 * (src[xm1] + src[xp1]) + 3 * src[o + x]) * k
    }
  }
  for (let y = 0; y < h; y++) {
    const o = y * w
    const m2 = (y > 1 ? y - 2 : 0) * w
    const m1 = (y > 0 ? y - 1 : 0) * w
    const p1 = (y < h - 1 ? y + 1 : h - 1) * w
    const p2 = (y < h - 2 ? y + 2 : h - 1) * w
    for (let x = 0; x < w; x++)
      dst[o + x] = (tmp[m2 + x] + tmp[p2 + x] + 2 * (tmp[m1 + x] + tmp[p1 + x]) + 3 * tmp[o + x]) * k
  }
}

/** 2x2 box average into a half-resolution buffer (edges repeat). */
function downsample(src: Float32Array, dst: Float32Array, w: number, h: number, w2: number, h2: number) {
  for (let j = 0; j < h2; j++) {
    const y0 = Math.min(h - 1, 2 * j) * w
    const y1 = Math.min(h - 1, 2 * j + 1) * w
    for (let i = 0; i < w2; i++) {
      const x0 = Math.min(w - 1, 2 * i)
      const x1 = Math.min(w - 1, 2 * i + 1)
      dst[j * w2 + i] = (src[y0 + x0] + src[y0 + x1] + src[y1 + x0] + src[y1 + x1]) * 0.25
    }
  }
}
