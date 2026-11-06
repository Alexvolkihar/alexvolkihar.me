// Glitch passes for the "Glitch" series, applied in place to RGBA pixels.
//
// - pixelSort: Kim Asendorf's pixel sorting (ASDFPixelSort, 2010). Along each
//   row or column, runs of pixels whose brightness lies between two
//   thresholds are sorted by brightness and written back in place.
// - datamosh: the look of compressed video that lost its key frames: each
//   macroblock keeps copying pixels from a little further along its motion
//   vector, so the picture is dragged and smeared block by block.
// - jpeg: a real 8 x 8 DCT in YCbCr with the quantisation tables of the JPEG
//   standard (ITU-T T.81, Annex K), scaled by the IJG quality formula. A
//   corrupted stream is imitated the way it fails in practice: the DC terms
//   are coded as differences, so one error shifts the colour of every later
//   block, and a lost bit makes the rest of the scan slide by whole blocks.
// - tear / aberration: horizontal or vertical slices displaced, with the red
//   and blue channels pulled apart.
// - crt: soft scanlines and a little grain.
//
// Every distance is given by the caller in pixels already derived from the
// short side, and every per-row or per-block decision comes from a noise
// function of a fraction of the canvas, never from a draw per row, so the
// result does not depend on the pixel size.

import { ihash } from './sources'

export type Axis = 'x' | 'y'

const lumOf = (d: Uint8ClampedArray, i: number) => (d[i] * 54 + d[i + 1] * 183 + d[i + 2] * 19) >> 8

/** Brightness at quantile q of the picture, from a 256-bin histogram. */
export function lumQuantile(d: Uint8ClampedArray, q: number): number {
  const hist = new Uint32Array(256)
  const n = d.length >> 2
  for (let i = 0; i < n; i++)
    hist[lumOf(d, i << 2)]++
  let acc = 0
  const target = q * n
  for (let k = 0; k < 256; k++) {
    acc += hist[k]
    if (acc >= target)
      return k
  }
  return 255
}

export interface SortOptions {
  axis: Axis
  lo: number
  hi: number
  descending: boolean
  /** For a line at fraction t across the other axis: the span [from, to] to sort, or null. */
  span: (t: number) => readonly [number, number] | null
  /** Longest run, in pixels, for the line at fraction t. */
  maxRun: (t: number) => number
}

export function pixelSort(d: Uint8ClampedArray, w: number, h: number, o: SortOptions) {
  const lines = o.axis === 'x' ? h : w
  const len = o.axis === 'x' ? w : h
  const step = o.axis === 'x' ? 4 : 4 * w
  const buf = new Float64Array(len)
  for (let l = 0; l < lines; l++) {
    const t = (l + 0.5) / lines
    const sp = o.span(t)
    if (!sp)
      continue
    const cap = Math.max(2, Math.round(o.maxRun(t)))
    const base = o.axis === 'x' ? l * w * 4 : l * 4
    let k = Math.max(0, Math.floor(sp[0] * len))
    const end = Math.min(len, Math.ceil(sp[1] * len))
    while (k < end) {
      while (k < end) {
        const v = lumOf(d, base + k * step)
        if (v >= o.lo && v <= o.hi)
          break
        k++
      }
      const s = k
      while (k < end && k - s < cap) {
        const v = lumOf(d, base + k * step)
        if (v < o.lo || v > o.hi)
          break
        k++
      }
      const n = k - s
      if (n < 2)
        continue
      for (let j = 0; j < n; j++) {
        const i = base + (s + j) * step
        buf[j] = lumOf(d, i) * 16777216 + ((d[i] << 16) | (d[i + 1] << 8) | d[i + 2])
      }
      const run = buf.subarray(0, n).sort()
      for (let j = 0; j < n; j++) {
        const key = run[o.descending ? n - 1 - j : j]
        const c = key % 16777216
        const i = base + (s + j) * step
        d[i] = (c >> 16) & 255
        d[i + 1] = (c >> 8) & 255
        d[i + 2] = c & 255
      }
    }
  }
}

export interface MoshOptions {
  /** Macroblock size in pixels. */
  block: number
  iterations: number
  /** Motion vector (pixels per iteration) of the block whose centre is at (x, y) in fractions of the short side; null leaves it intact. */
  vector: (x: number, y: number) => readonly [number, number] | null
  /** Seed for the per-block flattening, and the share of blocks flattened. */
  salt: number
  flatten: number
}

export function datamosh(d: Uint8ClampedArray, w: number, h: number, o: MoshOptions) {
  const B = Math.max(2, Math.round(o.block))
  const u = Math.min(w, h)
  const cols = Math.ceil(w / B)
  const rows = Math.ceil(h / B)
  const mv = new Float32Array(cols * rows * 2)
  const on = new Uint8Array(cols * rows)
  for (let by = 0; by < rows; by++) {
    for (let bx = 0; bx < cols; bx++) {
      const v = o.vector(((bx + 0.5) * B - w / 2) / u, ((by + 0.5) * B - h / 2) / u)
      if (v) {
        const k = by * cols + bx
        on[k] = 1
        mv[k * 2] = v[0]
        mv[k * 2 + 1] = v[1]
      }
    }
  }
  const src = new Uint8ClampedArray(d.length)
  for (let it = 0; it < o.iterations; it++) {
    src.set(d)
    for (let by = 0; by < rows; by++) {
      for (let bx = 0; bx < cols; bx++) {
        const k = by * cols + bx
        if (!on[k])
          continue
        const dx = Math.round(mv[k * 2])
        const dy = Math.round(mv[k * 2 + 1])
        const y1 = Math.min(h, (by + 1) * B)
        const x1 = Math.min(w, (bx + 1) * B)
        for (let y = by * B; y < y1; y++) {
          const sy = Math.min(h - 1, Math.max(0, y - dy))
          for (let x = bx * B; x < x1; x++) {
            const sx = Math.min(w - 1, Math.max(0, x - dx))
            const i = (y * w + x) * 4
            const j = (sy * w + sx) * 4
            d[i] = src[j]
            d[i + 1] = src[j + 1]
            d[i + 2] = src[j + 2]
          }
        }
      }
    }
  }
  // Some moshed blocks lose their residual: flat 2 x 2 quarters.
  const hb = Math.max(1, B >> 1)
  for (let by = 0; by < rows; by++) {
    for (let bx = 0; bx < cols; bx++) {
      if (!on[by * cols + bx] || ihash(o.salt, bx - (cols >> 1), by - (rows >> 1)) >= o.flatten)
        continue
      for (let qy = by * B; qy < Math.min(h, (by + 1) * B); qy += hb) {
        for (let qx = bx * B; qx < Math.min(w, (bx + 1) * B); qx += hb) {
          const y1 = Math.min(h, qy + hb)
          const x1 = Math.min(w, qx + hb)
          let r = 0
          let g = 0
          let b = 0
          let n = 0
          for (let y = qy; y < y1; y++) {
            for (let x = qx; x < x1; x++) {
              const i = (y * w + x) * 4
              r += d[i]
              g += d[i + 1]
              b += d[i + 2]
              n++
            }
          }
          for (let y = qy; y < y1; y++) {
            for (let x = qx; x < x1; x++) {
              const i = (y * w + x) * 4
              d[i] = r / n
              d[i + 1] = g / n
              d[i + 2] = b / n
            }
          }
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// JPEG
// ---------------------------------------------------------------------------

// ITU-T T.81 Annex K, tables K.1 (luminance) and K.2 (chrominance).
const Q_LUMA = [
  16,
  11,
  10,
  16,
  24,
  40,
  51,
  61,
  12,
  12,
  14,
  19,
  26,
  58,
  60,
  55,
  14,
  13,
  16,
  24,
  40,
  57,
  69,
  56,
  14,
  17,
  22,
  29,
  51,
  87,
  80,
  62,
  18,
  22,
  37,
  56,
  68,
  109,
  103,
  77,
  24,
  35,
  55,
  64,
  81,
  104,
  113,
  92,
  49,
  64,
  78,
  87,
  103,
  121,
  120,
  101,
  72,
  92,
  95,
  98,
  112,
  100,
  103,
  99,
]
const Q_CHROMA = [
  17,
  18,
  24,
  47,
  99,
  99,
  99,
  99,
  18,
  21,
  26,
  66,
  99,
  99,
  99,
  99,
  24,
  26,
  56,
  99,
  99,
  99,
  99,
  99,
  47,
  66,
  99,
  99,
  99,
  99,
  99,
  99,
  99,
  99,
  99,
  99,
  99,
  99,
  99,
  99,
  99,
  99,
  99,
  99,
  99,
  99,
  99,
  99,
  99,
  99,
  99,
  99,
  99,
  99,
  99,
  99,
  99,
  99,
  99,
  99,
  99,
  99,
  99,
  99,
]

/** IJG scaling of a base table to a quality in 1..100. */
function scaleTable(t: readonly number[], quality: number): Float32Array {
  const q = Math.min(100, Math.max(1, quality))
  const s = q < 50 ? 5000 / q : 200 - 2 * q
  return Float32Array.from(t, v => Math.max(1, Math.floor((v * s + 50) / 100)))
}

/** Orthonormal DCT-II basis C[n * 8 + k]. */
const BASIS = (() => {
  const c = new Float32Array(64)
  for (let n = 0; n < 8; n++) {
    for (let k = 0; k < 8; k++)
      c[n * 8 + k] = (k === 0 ? Math.SQRT1_2 : 1) * 0.5 * Math.cos(((2 * n + 1) * k * Math.PI) / 16)
  }
  return c
})()

export interface JpegError {
  /** Position of the error in the scan, as a fraction of the blocks. */
  at: number
  /** Persistent DC offsets added to Y, Cb and Cr from there on. */
  dc: readonly [number, number, number]
  /** Blocks the rest of the scan slides by. */
  slip: number
  /** Number of garbled blocks right after the error. */
  garble: number
}

export interface JpegOptions {
  /** Block size in pixels: the 8 x 8 samples are spread over it. */
  block: number
  quality: number
  errors: readonly JpegError[]
  /** Whether the block whose centre is at (x, y), in fractions of the short side, is re-encoded. */
  mask: (x: number, y: number) => boolean
  salt: number
}

export function jpeg(d: Uint8ClampedArray, w: number, h: number, o: JpegOptions) {
  const B = Math.max(2, Math.round(o.block))
  const u = Math.min(w, h)
  const cols = Math.ceil(w / B)
  const rows = Math.ceil(h / B)
  const total = cols * rows
  const qy = scaleTable(Q_LUMA, o.quality)
  // chroma never below quality 20: below that its DC term rounds to zero and
  // the picture turns grey, which reads as a broken palette, not as JPEG
  const qc = scaleTable(Q_CHROMA, Math.max(20, o.quality * 0.7))

  // Encode every block: 8 x 8 samples (nearest, at the sample centres),
  // forward DCT, quantise.
  const coef = new Float32Array(total * 192)
  const smp = new Float32Array(192)
  const tmp = new Float32Array(64)
  for (let by = 0; by < rows; by++) {
    for (let bx = 0; bx < cols; bx++) {
      for (let j = 0; j < 8; j++) {
        const y = Math.min(h - 1, Math.floor(by * B + (j + 0.5) * B / 8))
        for (let i = 0; i < 8; i++) {
          const x = Math.min(w - 1, Math.floor(bx * B + (i + 0.5) * B / 8))
          const p = (y * w + x) * 4
          const r = d[p]
          const g = d[p + 1]
          const b = d[p + 2]
          smp[j * 8 + i] = 0.299 * r + 0.587 * g + 0.114 * b - 128
          smp[64 + j * 8 + i] = -0.168736 * r - 0.331264 * g + 0.5 * b
          smp[128 + j * 8 + i] = 0.5 * r - 0.418688 * g - 0.081312 * b
        }
      }
      const base = (by * cols + bx) * 192
      for (let c = 0; c < 3; c++) {
        const q = c === 0 ? qy : qc
        // rows
        for (let j = 0; j < 8; j++) {
          for (let k = 0; k < 8; k++) {
            let s = 0
            for (let n = 0; n < 8; n++)
              s += smp[c * 64 + j * 8 + n] * BASIS[n * 8 + k]
            tmp[j * 8 + k] = s
          }
        }
        // columns
        for (let k = 0; k < 8; k++) {
          for (let v = 0; v < 8; v++) {
            let s = 0
            for (let n = 0; n < 8; n++)
              s += tmp[n * 8 + k] * BASIS[n * 8 + v]
            const qq = q[v * 8 + k]
            coef[base + c * 64 + v * 8 + k] = Math.round(s / qq) * qq
          }
        }
      }
    }
  }

  // Decode in scan order, with the stream errors.
  const errs = [...o.errors].sort((a, b) => a.at - b.at)
  const dc = [0, 0, 0]
  let slip = 0
  let garbleLeft = 0
  let e = 0
  const blk = new Float32Array(192)
  // Inverse basis evaluated at every pixel of a block (continuous sample
  // positions, so a block of any size is interpolated smoothly).
  const cosT = new Float32Array(B * 8)
  for (let p = 0; p < B; p++) {
    const n = ((p + 0.5) * 8) / B - 0.5
    for (let k = 0; k < 8; k++)
      cosT[p * 8 + k] = (k === 0 ? Math.SQRT1_2 : 1) * 0.5 * Math.cos(((2 * n + 1) * k * Math.PI) / 16)
  }
  const rowSum = new Float32Array(24)
  for (let b = 0; b < total; b++) {
    while (e < errs.length && b >= Math.floor(errs[e].at * total)) {
      dc[0] += errs[e].dc[0]
      dc[1] += errs[e].dc[1]
      dc[2] += errs[e].dc[2]
      slip += errs[e].slip
      garbleLeft = errs[e].garble
      e++
    }
    const bx = b % cols
    const by = Math.floor(b / cols)
    const cxF = ((bx + 0.5) * B - w / 2) / u
    const cyF = ((by + 0.5) * B - h / 2) / u
    const garbled = garbleLeft > 0
    if (garbleLeft > 0)
      garbleLeft--
    if (!o.mask(cxF, cyF) && e === 0)
      continue
    const from = Math.min(total - 1, Math.max(0, b - slip))
    for (let k = 0; k < 192; k++)
      blk[k] = coef[from * 192 + k]
    for (let c = 0; c < 3; c++)
      blk[c * 64] += dc[c]
    if (garbled) {
      for (let k = 0; k < 192; k++) {
        if (k % 64 !== 0 && ihash(o.salt, b, k) < 0.18)
          blk[k] += (ihash(o.salt + 1, b, k) - 0.5) * 360
      }
    }

    const x0 = bx * B
    const y0 = by * B
    const x1 = Math.min(w, x0 + B)
    const y1 = Math.min(h, y0 + B)
    for (let y = y0; y < y1; y++) {
      const oy = (y - y0) * 8
      for (let c = 0; c < 3; c++) {
        for (let k = 0; k < 8; k++) {
          let s = 0
          for (let v = 0; v < 8; v++)
            s += blk[c * 64 + v * 8 + k] * cosT[oy + v]
          rowSum[c * 8 + k] = s
        }
      }
      for (let x = x0; x < x1; x++) {
        let Y = 128
        let Cb = 0
        let Cr = 0
        const ox = (x - x0) * 8
        for (let k = 0; k < 8; k++) {
          const cs = cosT[ox + k]
          Y += rowSum[k] * cs
          Cb += rowSum[8 + k] * cs
          Cr += rowSum[16 + k] * cs
        }
        const i = (y * w + x) * 4
        d[i] = Y + 1.402 * Cr
        d[i + 1] = Y - 0.344136 * Cb - 0.714136 * Cr
        d[i + 2] = Y + 1.772 * Cb
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Slices and channels
// ---------------------------------------------------------------------------

export interface Slice {
  /** Fraction across the canvas where the slice starts, and its thickness in pixels. */
  at: number
  size: number
  /** Displacement of the slice and extra split of red/blue, in pixels. */
  shift: number
  split: number
}

/** Displace slices along `axis` (x: horizontal bands moved sideways) and split their channels. */
export function tear(d: Uint8ClampedArray, w: number, h: number, axis: Axis, slices: readonly Slice[]) {
  const src = new Uint8ClampedArray(d)
  const across = axis === 'x' ? h : w
  const len = axis === 'x' ? w : h
  for (const s of slices) {
    const a0 = Math.max(0, Math.floor(s.at * across))
    const a1 = Math.min(across, a0 + Math.max(1, Math.round(s.size)))
    const sh = Math.round(s.shift)
    const sp = Math.round(s.split)
    for (let a = a0; a < a1; a++) {
      for (let k = 0; k < len; k++) {
        const kr = Math.min(len - 1, Math.max(0, k - sh - sp))
        const kg = Math.min(len - 1, Math.max(0, k - sh))
        const kb = Math.min(len - 1, Math.max(0, k - sh + sp))
        const i = axis === 'x' ? (a * w + k) * 4 : (k * w + a) * 4
        const ir = axis === 'x' ? (a * w + kr) * 4 : (kr * w + a) * 4
        const ig = axis === 'x' ? (a * w + kg) * 4 : (kg * w + a) * 4
        const ib = axis === 'x' ? (a * w + kb) * 4 : (kb * w + a) * 4
        d[i] = src[ir]
        d[i + 1] = src[ig + 1]
        d[i + 2] = src[ib + 2]
      }
    }
  }
}

/** Whole-picture chromatic aberration: red one way, blue the other. */
export function aberration(d: Uint8ClampedArray, w: number, h: number, dx: number, dy: number) {
  const ox = Math.round(dx)
  const oy = Math.round(dy)
  if (!ox && !oy)
    return
  const src = new Uint8ClampedArray(d)
  for (let y = 0; y < h; y++) {
    const yr = Math.min(h - 1, Math.max(0, y - oy))
    const yb = Math.min(h - 1, Math.max(0, y + oy))
    for (let x = 0; x < w; x++) {
      const xr = Math.min(w - 1, Math.max(0, x - ox))
      const xb = Math.min(w - 1, Math.max(0, x + ox))
      const i = (y * w + x) * 4
      d[i] = src[(yr * w + xr) * 4]
      d[i + 2] = src[(yb * w + xb) * 4 + 2]
    }
  }
}

/** Soft scanlines (period in pixels, depth 0..1) and grain (amplitude in levels). */
export function crt(d: Uint8ClampedArray, w: number, h: number, period: number, depth: number, grain: number, salt: number) {
  const P = Math.max(1.5, period)
  for (let y = 0; y < h; y++) {
    const m = 1 - depth * (0.5 + 0.5 * Math.cos((2 * Math.PI * y) / P))
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const n = (ihash(salt, x, y) - 0.5) * grain
      d[i] = d[i] * m + n
      d[i + 1] = d[i + 1] * m + n
      d[i + 2] = d[i + 2] * m + n
    }
  }
}
