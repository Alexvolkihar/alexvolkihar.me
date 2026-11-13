// What lies under the water: pool tiles, lane lines, rippled sand, pebbles,
// or a plastered wall behind a window. Each floor is a function of a point in
// composition units (short side = 1) that writes an RGB albedo in 0..1, so it
// is sampled once per output pixel and stays sharp at any size.

/** Integer hash of a lattice cell, in [0, 1). */
export function cellHash(ix: number, iy: number, seed: number): number {
  let h = (Math.imul(ix, 0x27D4EB2D) ^ Math.imul(iy, 0x165667B1) ^ seed) | 0
  h = Math.imul(h ^ (h >>> 15), 0x85EBCA6B)
  h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

/** Value noise with a quintic fade, in [0, 1], on a 256 x 256 table that wraps. */
export type Noise = (x: number, y: number) => number

export function makeNoise(seed: number): Noise {
  const N = 256
  const t = new Float32Array(N * N)
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++)
      t[j * N + i] = cellHash(i, j, seed)
  }
  return (x, y) => {
    const fx0 = Math.floor(x)
    const fy0 = Math.floor(y)
    const fx = x - fx0
    const fy = y - fy0
    const ix = fx0 & 255
    const iy = fy0 & 255
    const ix1 = (ix + 1) & 255
    const iy1 = ((iy + 1) & 255) * N
    const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10)
    const v = fy * fy * fy * (fy * (fy * 6 - 15) + 10)
    const a = t[iy * N + ix]
    const b = t[iy * N + ix1]
    const c = t[iy1 + ix]
    const d = t[iy1 + ix1]
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
  }
}

export type Rgb = readonly [number, number, number]
export type Albedo = (x: number, y: number, out: Float32Array) => void

const clamp01 = (t: number) => t < 0 ? 0 : t > 1 ? 1 : t
function smooth(t: number) {
  const c = clamp01(t)
  return c * c * (3 - 2 * c)
}

function mix(out: Float32Array, a: Rgb, b: Rgb, t: number, k = 1) {
  out[0] = (a[0] + (b[0] - a[0]) * t) * k
  out[1] = (a[1] + (b[1] - a[1]) * t) * k
  out[2] = (a[2] + (b[2] - a[2]) * t) * k
}

export interface TileOptions {
  size: number
  /** Grout half-width, as a fraction of the tile. */
  grout: number
  ox: number
  oy: number
  seed: number
  tileA: Rgb
  tileB: Rgb
  accent: Rgb
  groutColor: Rgb
  /** Share of accent tiles. */
  accents: number
  /** Lane stripes: tile columns (or rows) [c, c + width), ending in a T at row `end`. */
  lanes: { at: number, width: number, end: number | null, cross: number }[]
  vertical: boolean
  laneColor: Rgb
  /** Half a pixel, in composition units, for antialiased grout. */
  aa: number
}

export function tiles(o: TileOptions): Albedo {
  const inv = 1 / o.size
  const gw = o.grout * o.size
  const tile = new Float32Array(3)
  return (x, y, out) => {
    const u = x * inv + o.ox
    const v = y * inv + o.oy
    const iu = Math.floor(u)
    const iv = Math.floor(v)
    const fu = u - iu
    const fv = v - iv
    const edge = Math.min(fu, 1 - fu, fv, 1 - fv) * o.size
    const h = cellHash(iu, iv, o.seed)
    // lane stripes run along v (or u), in whole tiles
    let lane = false
    const across = o.vertical ? iu : iv
    const along = o.vertical ? iv : iu
    for (const l of o.lanes) {
      const inStripe = across >= l.at && across < l.at + l.width
      if (l.end === null) {
        lane ||= inStripe
        continue
      }
      // the stripe stops at the T, whose bar is `cross` tiles wide each side
      const sgn = l.end < 0 ? -1 : 1
      const past = sgn * (along - l.end)
      if (inStripe && past <= 0)
        lane = true
      if (past >= 0 && past < l.width && across >= l.at - l.cross && across < l.at + l.width + l.cross)
        lane = true
    }
    if (lane)
      mix(tile, o.laneColor, o.laneColor, 0, 0.92 + 0.12 * h)
    else if (h < o.accents)
      mix(tile, o.accent, o.accent, 0, 0.94 + 0.1 * cellHash(iu, iv, o.seed ^ 0x51ED))
    else
      mix(tile, o.tileA, o.tileB, cellHash(iu, iv, o.seed ^ 0x9E37), 0.95 + 0.08 * h)
    // a soft bevel at the tile edge, then the grout line
    const bevel = 0.9 + 0.1 * smooth(edge / (o.size * 0.18))
    const g = smooth((gw + o.aa - edge) / (2 * o.aa))
    out[0] = tile[0] * bevel + (o.groutColor[0] - tile[0] * bevel) * g
    out[1] = tile[1] * bevel + (o.groutColor[1] - tile[1] * bevel) * g
    out[2] = tile[2] * bevel + (o.groutColor[2] - tile[2] * bevel) * g
  }
}

export interface SandOptions {
  seed: number
  /** Ripple wavelength (composition units) and heading. */
  lambda: number
  theta: number
  a: Rgb
  b: Rgb
  speck: Rgb
}

const SIN_N = 4096
const SIN = new Float32Array(SIN_N).map((_, i) => Math.sin(i / SIN_N * Math.PI * 2))

export function sand(o: SandOptions): Albedo {
  // phase in table steps: SIN_N per ripple wavelength
  const kx = Math.cos(o.theta) / o.lambda * SIN_N
  const ky = Math.sin(o.theta) / o.lambda * SIN_N
  const noise = makeNoise(o.seed)
  return (x, y, out) => {
    const warp = noise(x * 6, y * 6) * 2.6
    const ph = (x * kx + y * ky + warp * SIN_N * 0.5) | 0
    // asymmetric ripples: a gentle stoss side, a steeper lee
    const ripple = 0.5 + 0.5 * (SIN[ph & (SIN_N - 1)] + 0.25 * SIN[(ph * 2) & (SIN_N - 1)])
    const mottle = noise(x * 3.2 + 41.9, y * 3.2 + 133.1)
    const grain = noise(x * 200, y * 200 + 61.4)
    const t = clamp01(0.35 * ripple + 0.45 * mottle + 0.2 * grain)
    mix(out, o.a, o.b, t, 0.94 + 0.12 * ripple)
    // sparse darker grains
    if (grain > 0.84) {
      const k = smooth((grain - 0.84) / 0.1) * 0.35
      out[0] += (o.speck[0] - out[0]) * k
      out[1] += (o.speck[1] - out[1]) * k
      out[2] += (o.speck[2] - out[2]) * k
    }
  }
}

export interface PebbleOptions {
  seed: number
  /** Lattice cell of one pebble. */
  size: number
  stones: readonly Rgb[]
  grit: Rgb
  aa: number
}

export function pebbles(o: PebbleOptions): Albedo {
  const inv = 1 / o.size
  const noise = makeNoise(o.seed)
  // one pebble per lattice cell, tabulated on a 128 x 128 lattice that wraps
  const N = 128
  const PX = new Float32Array(N * N)
  const PY = new Float32Array(N * N)
  const CA = new Float32Array(N * N)
  const SA = new Float32Array(N * N)
  const AS = new Float32Array(N * N)
  const IR = new Float32Array(N * N)
  const HT = new Float32Array(N * N)
  const COL = new Uint8Array(N * N)
  for (let cv = 0; cv < N; cv++) {
    for (let cu = 0; cu < N; cu++) {
      const c = cv * N + cu
      const h1 = cellHash(cu, cv, o.seed)
      const h2 = cellHash(cu, cv, o.seed ^ 0x3C)
      const h3 = cellHash(cu, cv, o.seed ^ 0x7A)
      PX[c] = 0.2 + 0.6 * h1
      PY[c] = 0.2 + 0.6 * h2
      IR[c] = 1 / (0.42 + 0.3 * h3)
      CA[c] = Math.cos(h1 * 6.283)
      SA[c] = Math.sin(h1 * 6.283)
      AS[c] = 1.15 + 0.5 * h2
      HT[c] = h3
      COL[c] = Math.floor(cellHash(cu, cv, o.seed ^ 0x99) * o.stones.length)
    }
  }
  return (x, y, out) => {
    const u = x * inv
    const v = y * inv
    const iu = Math.floor(u)
    const iv = Math.floor(v)
    let best = -1
    let bc = 0
    let edge = 0
    // the pebble whose rounded top stands highest at this point
    for (let dv = -1; dv <= 1; dv++) {
      const cv = iv + dv
      const row = (cv & (N - 1)) * N
      const ly = v - cv
      for (let du = -1; du <= 1; du++) {
        const cu = iu + du
        const c = row + (cu & (N - 1))
        const lx = u - cu - PX[c]
        const my = ly - PY[c]
        const ex = lx * CA[c] + my * SA[c]
        const ey = (my * CA[c] - lx * SA[c]) * AS[c]
        const d2 = (ex * ex + ey * ey) * IR[c] * IR[c]
        if (d2 < 1) {
          const h = Math.sqrt(1 - d2) * (0.8 + 0.4 * HT[c])
          if (h > best) {
            best = h
            bc = c
            edge = (1 - Math.sqrt(d2)) / IR[c] * o.size
          }
        }
      }
    }
    if (best < 0) {
      mix(out, o.grit, o.grit, 0, 0.85 + 0.3 * noise(x * 300, y * 300))
      return
    }
    const stone = o.stones[COL[bc]]
    const speck = 0.96 + 0.08 * noise(x * 180 + bc, y * 180)
    // a soft rim where the pebble meets the grit and a gently domed crown:
    // seen through the water the stones stay calm, so the caustic lines
    // carry the contrast
    const rim = smooth(edge / (o.size * 0.12 + o.aa))
    const k = (0.72 + 0.28 * Math.min(1, best)) * (0.94 + 0.12 * HT[bc]) * speck
    out[0] = o.grit[0] + (stone[0] * k - o.grit[0]) * rim
    out[1] = o.grit[1] + (stone[1] * k - o.grit[1]) * rim
    out[2] = o.grit[2] + (stone[2] * k - o.grit[2]) * rim
  }
}

export function plaster(wall: Rgb, seed: number): Albedo {
  const noise = makeNoise(seed)
  return (x, y, out) => {
    const n = noise(x * 9, y * 9) * 0.6 + noise(x * 70 + 19.1, y * 70 + 3.7) * 0.4
    mix(out, wall, wall, 0, 0.93 + 0.1 * n)
  }
}
