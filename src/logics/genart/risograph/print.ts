// The press side of "Risograph": plates of ink density are screened into
// halftone dots (or lines, squares, grain), each at its own angle and slightly
// out of register, and overprinted on the paper like translucent spot inks.
//
// A plate is a greyscale map drawn with Canvas 2D at a fixed number of cells
// per canvas short side (PLATE_RES), so the composition never depends on the
// output size. The screen is computed per output pixel: a spot function over
// the rotated halftone cell gives a value, and a per-spot threshold table
// (built by ranking the spot function, as a raster image processor does)
// turns the local ink density into the right dot area.

export type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

/** Plate cells per canvas short side. Fixed, so the picture is the same at any size. */
export const PLATE_RES = 640
/** Cells per short side of the ink-coverage map (blotches, streaks, specks). */
export const INK_RES = 200

export type Spot = 'round' | 'line' | 'square' | 'grain'

export interface Layer {
  /** Ink colour, 0..1. */
  rgb: readonly [number, number, number]
  /** Density plate, PLATE_RES per short side, 0..1. */
  plate: Float32Array
  /** Ink coverage map, INK_RES per short side, 0..1. */
  ink: Float32Array
  /** Misregistration, in fractions of the short side. */
  dx: number
  dy: number
  /** Screen angle in radians. */
  angle: number
}

export interface Press {
  paper: readonly [number, number, number]
  /** Inks lighten a dark stock (screen) instead of darkening a light one (multiply). */
  dark: boolean
  spot: Spot
  /** Halftone cell, in fractions of the short side. */
  cell: number
  layers: Layer[]
  /** Plate and ink-map sizes (cells). */
  pw: number
  ph: number
  iw: number
  ih: number
}

export function canvas(w: number, h: number): { cv: HTMLCanvasElement | OffscreenCanvas, g: Ctx } {
  if (typeof OffscreenCanvas !== 'undefined') {
    const cv = new OffscreenCanvas(w, h)
    return { cv, g: cv.getContext('2d', { willReadFrequently: true })! }
  }
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  return { cv, g: cv.getContext('2d', { willReadFrequently: true })! }
}

/** Reads the red channel of a plate canvas as densities in 0..1, through an optional tone curve. */
export function readPlate(g: Ctx, w: number, h: number, gamma = 1): Float32Array {
  const d = g.getImageData(0, 0, w, h).data
  const curve = new Float32Array(256)
  for (let k = 0; k < 256; k++)
    curve[k] = (k / 255) ** gamma
  const out = new Float32Array(w * h)
  for (let i = 0; i < out.length; i++)
    out[i] = curve[d[i * 4]]
  return out
}

// A parabolic stand-in for cos(pi x) on [-1, 1]: same zeros, same slopes at
// the zeros, no trigonometry in the inner loop.
function wave(x: number) {
  const a = x < 0 ? -x : x
  return a <= 0.5 ? 1 - 4 * a * a : 4 * (1 - a) * (1 - a) - 1
}

function hash2(x: number, y: number, s: number) {
  let h = Math.imul(x, 0x27D4EB2D) ^ Math.imul(y, 0x165667B1) ^ s
  h = Math.imul(h ^ (h >>> 15), 0x85EBCA77)
  h = Math.imul(h ^ (h >>> 13), 0xC2B2AE3D)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

// Stochastic "grain" screen: two octaves of smooth value noise, at the cell
// and at about half of it, so the ink gathers in small irregular clumps (a
// clustered, second-generation frequency-modulated screen) instead of the salt
// and pepper of white noise. Coordinates are in cells. The lattice values come
// from 512 x 512 tiles of hashed noise, built once per seed; the two octaves
// have incommensurate periods, so the tiling never shows.
const TILE = 512
const TILE_MASK = TILE - 1
const TILES = new Map<number, Float32Array>()

function tile(seed: number): Float32Array {
  let t = TILES.get(seed)
  if (!t) {
    t = new Float32Array(TILE * TILE)
    for (let j = 0; j < TILE; j++) {
      for (let i = 0; i < TILE; i++)
        t[j * TILE + i] = hash2(i, j, seed)
    }
    TILES.set(seed, t)
  }
  return t
}

function smooth(t: Float32Array, gx: number, gy: number) {
  const ix = Math.floor(gx)
  const iy = Math.floor(gy)
  let u = gx - ix
  let v = gy - iy
  u = u * u * (3 - 2 * u)
  v = v * v * (3 - 2 * v)
  const x0 = ix & TILE_MASK
  const x1 = (ix + 1) & TILE_MASK
  const y0 = (iy & TILE_MASK) * TILE
  const y1 = ((iy + 1) & TILE_MASK) * TILE
  const a = t[y0 + x0]
  const b = t[y0 + x1]
  const c = t[y1 + x0]
  const d = t[y1 + x1]
  return a + (b - a) * u + (c - a + (a - b - c + d) * u) * v
}

function grainValue(t1: Float32Array, t2: Float32Array, gx: number, gy: number) {
  return smooth(t1, gx, gy) * 1.25 + smooth(t2, gx * 2.31 + 17.7, gy * 2.31 + 5.3) * 0.75 - 1
}

function spotValue(spot: Spot, x: number, y: number) {
  if (spot === 'grain')
    return grainValue(tile(0x1234), tile(0x1234 ^ 0x51ED), x * 41.3, y * 37.9)
  if (spot === 'round')
    return (wave(x) + wave(y)) * 0.5
  if (spot === 'line')
    return wave(y)
  return Math.min(wave(x), wave(y))
}

// Threshold tables: for a density level k/255, the spot value above which a
// point of the cell is inked, chosen so that exactly that fraction of the
// cell is inked. Built once per spot by ranking the spot function.
const LUTS = new Map<Spot, Float32Array>()

function lut(spot: Spot): Float32Array {
  const cached = LUTS.get(spot)
  if (cached)
    return cached
  const T = new Float32Array(256)
  {
    const n = 192
    const vals = new Float32Array(n * n)
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++)
        vals[j * n + i] = spotValue(spot, (i + 0.5) / n * 2 - 1, (j + 0.5) / n * 2 - 1)
    }
    vals.sort()
    const N = vals.length
    for (let k = 0; k < 256; k++) {
      const m = Math.round(k / 255 * N)
      if (m <= 0)
        T[k] = 2
      else if (m >= N)
        T[k] = -2
      else
        T[k] = (vals[N - m] + vals[N - m - 1]) * 0.5
    }
  }
  LUTS.set(spot, T)
  return T
}

/** Fills a row buffer with a vertically interpolated row of a map. */
function mapRow(src: Float32Array, w: number, h: number, fy: number, out: Float32Array) {
  let j = Math.floor(fy)
  let t = fy - j
  if (j < 0) {
    j = 0
    t = 0
  }
  if (j >= h - 1) {
    j = h - 1
    t = 0
  }
  const a = j * w
  const b = Math.min(j + 1, h - 1) * w
  for (let i = 0; i < w; i++)
    out[i] = src[a + i] + (src[b + i] - src[a + i]) * t
}

function sampleRow(row: Float32Array, w: number, fx: number) {
  if (fx <= 0)
    return row[0]
  if (fx >= w - 1)
    return row[w - 1]
  const i = fx | 0
  return row[i] + (row[i + 1] - row[i]) * (fx - i)
}

/** Prints every layer on the paper, straight into the canvas pixels. */
export function print(g: CanvasRenderingContext2D, W: number, H: number, P: Press) {
  const S = Math.min(W, H)
  const L = P.layers
  const nl = L.length
  const T = lut(P.spot)
  const cellPx = Math.max(P.cell * S, 1e-3)
  const invCell = 1 / cellPx
  // anti-aliasing: the spot value changes by about 2 / cell per pixel
  const grain = P.spot === 'grain'
  const aaGain = Math.max(0.35, grain ? cellPx * 1.6 : cellPx / 2.4)
  const t1 = L.map((_, l) => grain ? tile(0x9E37 + l * 7919) : new Float32Array(0))
  const t2 = L.map((_, l) => grain ? tile((0x9E37 + l * 7919) ^ 0x51ED) : new Float32Array(0))
  const paperTile = tile(0x5EED)
  const kp = PLATE_RES / S
  const ki = INK_RES / S

  const rowsP = L.map(() => new Float32Array(P.pw))
  const rowsI = L.map(() => new Float32Array(P.iw))
  const offP = L.map(l => l.dx * PLATE_RES + 0.5)
  const offI = L.map(l => l.dx * INK_RES + 0.5)
  const offX = L.map(l => l.dx * S)
  const offY = L.map(l => l.dy * S)
  const cos = L.map(l => Math.cos(l.angle) * invCell)
  const sin = L.map(l => Math.sin(l.angle) * invCell)
  const cr = L.map(l => l.rgb[0])
  const cg = L.map(l => l.rgb[1])
  const cb = L.map(l => l.rgb[2])
  const [pr, pg, pb] = P.paper
  const dark = P.dark

  const strip = Math.max(1, Math.floor(2_000_000 / W))
  for (let y0 = 0; y0 < H; y0 += strip) {
    const sh = Math.min(strip, H - y0)
    const img = g.createImageData(W, sh)
    const out = img.data
    let o = 0
    for (let py = y0; py < y0 + sh; py++) {
      for (let l = 0; l < nl; l++) {
        mapRow(L[l].plate, P.pw, P.ph, (py + 0.5) * kp - L[l].dy * PLATE_RES - 0.5, rowsP[l])
        mapRow(L[l].ink, P.iw, P.ih, (py + 0.5) * ki - L[l].dy * INK_RES - 0.5, rowsI[l])
      }
      for (let px = 0; px < W; px++) {
        // paper tooth: a faint per-pixel grain
        const tooth = 1 + (paperTile[(py & TILE_MASK) * TILE + (px & TILE_MASK)] - 0.5) * 0.045
        let r = pr * tooth
        let gg = pg * tooth
        let b = pb * tooth
        for (let l = 0; l < nl; l++) {
          const d = sampleRow(rowsP[l], P.pw, (px + 0.5) * kp - offP[l])
          if (d < 0.004)
            continue
          const X = px - offX[l]
          const Y = py - offY[l]
          let cov: number
          let s: number
          if (grain) {
            s = grainValue(t1[l], t2[l], X * invCell, Y * invCell)
          }
          else {
            const u = X * cos[l] + Y * sin[l]
            const v = Y * cos[l] - X * sin[l]
            const x = (u - Math.floor(u)) * 2 - 1
            const y = (v - Math.floor(v)) * 2 - 1
            if (P.spot === 'round')
              s = (wave(x) + wave(y)) * 0.5
            else if (P.spot === 'line')
              s = wave(y)
            else
              s = Math.min(wave(x), wave(y))
          }
          cov = (s - T[(d * 255 + 0.5) | 0]) * aaGain + 0.5
          if (cov <= 0)
            continue
          if (cov > 1)
            cov = 1
          const a = cov * sampleRow(rowsI[l], P.iw, (px + 0.5) * ki - offI[l])
          if (dark) {
            r = 1 - (1 - r) * (1 - a * cr[l])
            gg = 1 - (1 - gg) * (1 - a * cg[l])
            b = 1 - (1 - b) * (1 - a * cb[l])
          }
          else {
            r *= 1 - a * (1 - cr[l])
            gg *= 1 - a * (1 - cg[l])
            b *= 1 - a * (1 - cb[l])
          }
        }
        out[o++] = r * 255
        out[o++] = gg * 255
        out[o++] = b * 255
        out[o++] = 255
      }
    }
    g.putImageData(img, 0, y0)
  }
}
