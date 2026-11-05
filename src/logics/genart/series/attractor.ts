// "Attractor" — the orbit of a strange attractor, developed like a photograph.
//
// A two-dimensional map (Clifford, de Jong, Svensson or Pickover's "dream")
// is iterated a few million times from one starting point. Every point lands
// in a cell of a density grid; the grid is then tone-mapped with log density
// and a gamma curve, and each cell is coloured by the average speed of the
// orbit through it. Parameter sets that collapse to a point, a cycle or a
// shapeless fog are rejected by a short pre-run and drawn again from the same
// stream, so every hash gets a living attractor.
//
// The hit budget follows the area of the grid, so a piece has the same
// exposure at 300 px and at 4K; very large exports accumulate into a coarser
// grid and are upsampled.

import type { MapKind, MapParams, Probe } from '../attractor/maps'
import type { Rng } from '../random'
import type { Series } from '../types'
import { accumulate, probe } from '../attractor/maps'
import { int, range, stream, weighted } from '../random'

// ---------------------------------------------------------------------------
// Rarity table — decided before the drawing code, never reordered.
// Changing a weight or an order re-rolls the whole edition.
// ---------------------------------------------------------------------------

const TRAITS = {
  Palette: [['Sepia', 22], ['Cinder', 20], ['Aurora', 18], ['Porcelain', 15], ['Nacre', 15], ['Verdigris', 10]],
  Map: [['Clifford', 35], ['de Jong', 30], ['Svensson', 20], ['Dream', 15]],
  Exposure: [['Soft', 30], ['Bright', 45], ['Deep', 25]],
  Symmetry: [['None', 55], ['Mirror', 30], ['Fourfold', 15]],
  Grain: [['Silk', 35], ['Film', 45], ['Sand', 20]],
} as const

type TraitName = keyof typeof TRAITS
type Features = { [K in TraitName]: typeof TRAITS[K][number][0] }

/** Pure function of the hash, computed before (and without) any rendering. */
function features(hash: string): Features {
  const r = stream(hash, 'features')
  return {
    Palette: weighted(r, TRAITS.Palette),
    Map: weighted(r, TRAITS.Map),
    Exposure: weighted(r, TRAITS.Exposure),
    Symmetry: weighted(r, TRAITS.Symmetry),
    Grain: weighted(r, TRAITS.Grain),
  }
}

// ---------------------------------------------------------------------------
// Palettes (original to this site). `ramp` colours the orbit from slow to
// fast; `peak` is where the densest cells end up.
// ---------------------------------------------------------------------------

interface Palette {
  light: boolean
  bg: string
  ramp: readonly string[]
  peak: string
}

const PALETTES: Record<Features['Palette'], Palette> = {
  Sepia: { light: true, bg: '#f1ebdf', ramp: ['#3b2a1e', '#7a3b22', '#b5562d', '#2d3b4f'], peak: '#160f0b' },
  Cinder: { light: false, bg: '#0c0806', ramp: ['#5b1a0d', '#b23c12', '#e98a1f', '#f6cf6a'], peak: '#fff3d6' },
  Aurora: { light: false, bg: '#060a12', ramp: ['#0e5c63', '#1fb5a8', '#6fc8e8', '#9c7be0', '#e79bd6'], peak: '#f2fbff' },
  Porcelain: { light: true, bg: '#eef0ee', ramp: ['#16337a', '#2456a8', '#4a86c5', '#1b2550'], peak: '#0b1638' },
  Nacre: { light: false, bg: '#121019', ramp: ['#5d4f97', '#c48bb5', '#efc9a7', '#9fd6cc', '#e8e4f4'], peak: '#fffaf2' },
  Verdigris: { light: true, bg: '#ebe5d3', ramp: ['#1c4a43', '#2f7a68', '#7f9a55', '#b8692f'], peak: '#0f2622' },
}

/** Tone curve: gamma, and the white point as a percentile of the occupied cells. */
const EXPOSURE: Record<Features['Exposure'], { gamma: number, white: number }> = {
  Soft: { gamma: 0.62, white: 0.9985 },
  Bright: { gamma: 0.8, white: 0.992 },
  Deep: { gamma: 1.25, white: 0.997 },
}

/** Hits per cell of the composition square, and film grain amplitude. */
const GRAIN: Record<Features['Grain'], { hits: number, noise: number }> = {
  Silk: { hits: 5, noise: 0 },
  Film: { hits: 3, noise: 0.03 },
  Sand: { hits: 1.1, noise: 0.045 },
}

const SYMMETRY_COPIES: Record<Features['Symmetry'], number> = { None: 1, Mirror: 2, Fourfold: 4 }

// Large exports: the grid never exceeds this many cells in the composition
// square, nor the run this many iterations; beyond, cells grow and are upsampled.
const MAX_ITERATIONS = 16_000_000
const MAX_CELLS = 12_000_000
const MARGIN = 0.085

// ---------------------------------------------------------------------------
// Parameters: drawn from the 'params' stream until the probe accepts them
// ---------------------------------------------------------------------------

function drawParams(r: Rng, kind: MapKind): MapParams {
  switch (kind) {
    case 'Clifford':
      return { kind, a: range(r, -2.4, 2.4), b: range(r, -2.4, 2.4), c: range(r, -1.5, 1.5), d: range(r, -1.5, 1.5) }
    case 'de Jong':
      return { kind, a: range(r, -3, 3), b: range(r, -3, 3), c: range(r, -3, 3), d: range(r, -3, 3) }
    case 'Svensson':
      return { kind, a: range(r, -3, 3), b: range(r, -3, 3), c: range(r, -2.2, 2.2), d: range(r, -2.2, 2.2) }
    default:
      return { kind, a: range(r, -3, 3), b: range(r, -3, 3), c: range(r, -0.6, 1.6), d: range(r, -0.6, 1.6) }
  }
}

// Known-good sets, used only if 400 draws in a row are rejected.
const FALLBACK: Record<MapKind, MapParams> = {
  'Clifford': { kind: 'Clifford', a: -1.4, b: 1.6, c: 1, d: 0.7 },
  'de Jong': { kind: 'de Jong', a: 1.4, b: -2.3, c: 2.4, d: -2.1 },
  'Svensson': { kind: 'Svensson', a: 1.4, b: 1.56, c: 1.4, d: -2.1 },
  'Dream': { kind: 'Dream', a: -0.966918, b: 2.879879, c: 0.765145, d: 0.744728 },
}

function accept(p: Probe): boolean {
  if (!p.ok)
    return false
  const aspect = Math.max(p.hw, p.hh) / Math.min(p.hw, p.hh)
  return p.lyapunov > 0.02
    && p.fill > 0.24
    && p.entropy > 0.76
    && p.contrast > 0.55
    && aspect < 2.6
}

export function chooseAttractor(hash: string, kind: MapKind): { params: MapParams, probe: Probe, tries: number } {
  const r = stream(hash, 'params')
  for (let tries = 1; tries <= 400; tries++) {
    const params = drawParams(r, kind)
    const pr = probe(params)
    if (accept(pr))
      return { params, probe: pr, tries }
  }
  const params = FALLBACK[kind]
  return { params, probe: probe(params), tries: 0 }
}

// ---------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------

type RGB = [number, number, number]

function hex(c: string): RGB {
  const v = Number.parseInt(c.slice(1), 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

function smooth(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

const A_BINS = 64
const T_BINS = 256

/** LUT[(a * T_BINS + t) * 3]: colour for orbit speed bin a and tone t, on the flat background. */
function buildLut(pal: Palette, shift: number): Uint8ClampedArray {
  const bg = hex(pal.bg)
  const ramp = pal.ramp.map(hex)
  const peak = hex(pal.peak)
  const lut = new Uint8ClampedArray(A_BINS * T_BINS * 3)
  for (let a = 0; a < A_BINS; a++) {
    // the ramp is read back and forth (a triangle wave, so no seam) from a
    // hash-chosen offset: the same palette does not always give the slow
    // parts the same colour
    let u = ((a / (A_BINS - 1)) * 0.85 + shift * 2) % 2
    if (u > 1)
      u = 2 - u
    const pos = u * (ramp.length - 1)
    const i = Math.min(ramp.length - 2, Math.floor(pos))
    const col = mix(ramp[i], ramp[i + 1], smooth(0, 1, pos - i))
    for (let t = 0; t < T_BINS; t++) {
      const v = t / (T_BINS - 1)
      let c: RGB
      if (pal.light) {
        c = mix(bg, col, Math.min(1, v * 1.2))
        c = mix(c, peak, smooth(0.72, 1, v) * 0.75)
      }
      else {
        c = mix(bg, col, Math.min(1, v * 1.35))
        c = mix(c, peak, smooth(0.6, 1, v) * 0.85)
      }
      const o = (a * T_BINS + t) * 3
      lut[o] = c[0]
      lut[o + 1] = c[1]
      lut[o + 2] = c[2]
    }
  }
  return lut
}

/** Integer hash of a lattice point, in [0, 1). */
function latticeNoise(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 0x27D4EB2D) ^ Math.imul(y, 0x165667B1) ^ seed
  h = Math.imul(h ^ (h >>> 15), 0x85EBCA6B)
  h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** In-place box blur of a square grid (side n), separable, with running sums. */
function boxBlur(v: Float32Array, n: number, r: number): void {
  const tmp = new Float32Array(n)
  const norm = 1 / (2 * r + 1)
  for (let pass = 0; pass < 2; pass++) {
    // pass 0 blurs rows, pass 1 columns: (stride along the line, stride between lines)
    const along = pass === 0 ? 1 : n
    const across = pass === 0 ? n : 1
    for (let line = 0; line < n; line++) {
      const base = line * across
      let acc = 0
      for (let i = -r; i <= r; i++) {
        if (i >= 0 && i < n)
          acc += v[base + i * along]
      }
      for (let i = 0; i < n; i++) {
        tmp[i] = acc * norm
        const add = i + r + 1
        const sub = i - r
        if (add < n)
          acc += v[base + add * along]
        if (sub >= 0)
          acc -= v[base + sub * along]
      }
      for (let i = 0; i < n; i++)
        v[base + i * along] = tmp[i]
    }
  }
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function render(g: CanvasRenderingContext2D, W: number, H: number, hash: string) {
  const f = features(hash)
  const pal = PALETTES[f.Palette]
  const expo = EXPOSURE[f.Exposure]
  const grain = GRAIN[f.Grain]
  const copies = SYMMETRY_COPIES[f.Symmetry]

  const { params, probe: pr } = chooseAttractor(hash, f.Map)

  // --- frame: orientation, symmetry offset, colour shift ----------------------
  const fr = stream(hash, 'frame')
  const turn = int(fr, 0, 3)
  const flip = fr() < 0.5
  const shift = fr()
  const offset = range(fr, 0.18, 0.5)
  const grainSeed = (fr() * 4294967296) | 0

  // orientation matrix (quarter turns, optional flip), applied around the centre
  let m00 = 1
  let m01 = 0
  let m10 = 0
  let m11 = 1
  for (let i = 0; i < turn; i++)
    [m00, m01, m10, m11] = [-m10, -m11, m00, m01]
  if (flip) {
    m00 = -m00
    m01 = -m01
  }
  // half extents after orientation
  let ex = turn % 2 ? pr.hh : pr.hw
  let ey = turn % 2 ? pr.hw : pr.hh
  // symmetric copies are pushed off-centre so they overlap into a rosette
  let sx = 0
  let sy = 0
  if (f.Symmetry === 'Mirror') {
    sx = ex * offset
    ex += sx
  }
  else if (f.Symmetry === 'Fourfold') {
    sx = ex * offset
    sy = ey * offset * 0.6
    const e = Math.max(ex + sx, ey + sy)
    ex = e
    ey = e
  }

  // --- grid ------------------------------------------------------------------
  const S = Math.min(W, H)
  let cell = Math.max(1, Math.sqrt((S * S) / MAX_CELLS), Math.sqrt((S * S * grain.hits) / MAX_ITERATIONS))
  let G = Math.ceil(S / cell)
  cell = S / G
  if (G < 16) {
    G = 16
    cell = S / G
  }
  const scale = (G * (1 - 2 * MARGIN)) / (2 * Math.max(ex, ey))
  const half = G / 2
  const count = new Uint16Array(G * G)
  const halfG = (G + 1) >> 1
  const speed = new Float32Array(halfG * halfG)
  const last = G - 1
  const pts = pr.points
  const mid = pts.length / 2
  accumulate(params, {
    G,
    A: m00 * scale,
    B: m01 * scale,
    C: m10 * scale,
    D: m11 * scale,
    ox: half + sx * scale - (m00 * pr.cx + m01 * pr.cy) * scale,
    oy: half + sy * scale - (m10 * pr.cx + m11 * pr.cy) * scale,
    copies,
    iterations: Math.round((G * G * grain.hits) / copies),
    jumpNorm: pr.jump,
  }, pr.x, pr.y, pts[mid], pts[mid + 1], count, speed)

  // --- tone mapping ----------------------------------------------------------
  // colour field: mean speed per 2x2 block, lightly box-blurred
  const cells = G * G
  const speedAt = speed
  {
    const wsum = new Float32Array(halfG * halfG)
    for (let iy = 0; iy < G; iy++) {
      for (let ix = 0; ix < G; ix++)
        wsum[(iy >> 1) * halfG + (ix >> 1)] += count[iy * G + ix]
    }
    const radius = Math.max(1, Math.round(G / 500))
    boxBlur(speedAt, halfG, radius)
    boxBlur(wsum, halfG, radius)
    for (let i = 0; i < speedAt.length; i++) {
      if (wsum[i] > 0)
        speedAt[i] /= wsum[i]
    }
  }
  // white point: a high percentile of the occupied cells, from an exact
  // histogram; speed range: the 2nd to 98th percentile of the occupied cells
  const HMAX = 65536
  const SBINS = 1024
  const hist = new Uint32Array(HMAX)
  const shist = new Uint32Array(SBINS)
  let occupied = 0
  for (let iy = 0; iy < G; iy++) {
    for (let ix = 0; ix < G; ix++) {
      const n = count[iy * G + ix]
      if (n) {
        hist[n]++
        shist[Math.min(SBINS - 1, (speedAt[(iy >> 1) * halfG + (ix >> 1)] * SBINS) | 0)]++
        occupied++
      }
    }
  }
  const percentile = (h: Uint32Array, q: number) => {
    const target = occupied * q
    let acc = 0
    for (let i = 0; i < h.length; i++) {
      acc += h[i]
      if (acc >= target)
        return i
    }
    return h.length - 1
  }
  const white = Math.max(3, percentile(hist, expo.white))
  const logW = Math.log1p(white)
  const s0 = percentile(shist, 0.02) / SBINS
  const s1 = Math.max(s0 + 0.05, (percentile(shist, 0.98) + 1) / SBINS)
  const sScale = A_BINS / (s1 - s0)
  // tone per count, once
  const toneOf = new Uint8Array(HMAX)
  for (let n = 1; n < HMAX; n++)
    toneOf[n] = Math.round(Math.min(1, Math.log1p(n) / logW) ** expo.gamma * (T_BINS - 1))

  const lut = buildLut(pal, shift)
  const bg = hex(pal.bg)
  const rgb = new Uint8ClampedArray(cells * 3)
  const tone = new Uint8Array(cells)
  for (let i = 0; i < cells; i++) {
    const n = count[i]
    let o = 0
    if (n) {
      const t = toneOf[n]
      const sp = speedAt[((i / G) >> 1) * halfG + ((i % G) >> 1)]
      const s = Math.max(0, Math.min(A_BINS - 1, ((sp - s0) * sScale) | 0))
      tone[i] = t
      o = (s * T_BINS + t) * 3
    }
    rgb[i * 3] = lut[o]
    rgb[i * 3 + 1] = lut[o + 1]
    rgb[i * 3 + 2] = lut[o + 2]
  }

  // --- pixels ----------------------------------------------------------------
  const img = g.createImageData(W, H)
  const px = img.data
  const offX = (W - S) >> 1
  const offY = (H - S) >> 1
  const vig = pal.light ? 0.1 : 0.35
  // film grain: value noise on a lattice of S / 900 cells, hashed once per lattice point
  const noiseAmp = grain.noise * 255
  const noiseCell = S / 900
  const nW = Math.ceil(W / noiseCell) + 2
  const lattice = new Float32Array(noiseAmp > 0 ? nW * (Math.ceil(H / noiseCell) + 2) : 0)
  for (let i = 0; i < lattice.length; i++)
    lattice[i] = (latticeNoise(i % nW, (i / nW) | 0, grainSeed) - 0.5) * noiseAmp
  const exact = G === S
  const invCell = 1 / cell
  const toneMax = 1 / (T_BINS - 1)
  for (let py = 0; py < H; py++) {
    const vy = (py + 0.5 - H / 2) / S
    const qy = py - offY
    const inY = qy >= 0 && qy < S
    const ny = py / noiseCell
    const ly = ny | 0
    const uy = ny - ly
    for (let x = 0; x < W; x++) {
      const vx = (x + 0.5 - W / 2) / S
      // background with a soft vignette
      const shade = 1 - vig * Math.min(1, (vx * vx + vy * vy) * 1.6)
      let r = bg[0] * shade
      let gg = bg[1] * shade
      let bb = bg[2] * shade
      const qx = x - offX
      if (inY && qx >= 0 && qx < S) {
        let t: number
        let cr: number
        let cg: number
        let cb: number
        if (exact) {
          const o = qy * G + qx
          t = tone[o] * toneMax
          cr = rgb[o * 3]
          cg = rgb[o * 3 + 1]
          cb = rgb[o * 3 + 2]
        }
        else {
          // large exports: bilinear sample of the coarser grid
          const fx = Math.max(0, (qx + 0.5) * invCell - 0.5)
          const fy = Math.max(0, (qy + 0.5) * invCell - 0.5)
          const ix = Math.min(last, fx | 0)
          const iy = Math.min(last, fy | 0)
          const ix1 = Math.min(last, ix + 1)
          const iy1 = Math.min(last, iy + 1)
          const tx = fx - ix
          const ty = fy - iy
          const o00 = iy * G + ix
          const o10 = iy * G + ix1
          const o01 = iy1 * G + ix
          const o11 = iy1 * G + ix1
          const w00 = (1 - tx) * (1 - ty)
          const w10 = tx * (1 - ty)
          const w01 = (1 - tx) * ty
          const w11 = tx * ty
          t = (tone[o00] * w00 + tone[o10] * w10 + tone[o01] * w01 + tone[o11] * w11) * toneMax
          cr = rgb[o00 * 3] * w00 + rgb[o10 * 3] * w10 + rgb[o01 * 3] * w01 + rgb[o11 * 3] * w11
          cg = rgb[o00 * 3 + 1] * w00 + rgb[o10 * 3 + 1] * w10 + rgb[o01 * 3 + 1] * w01 + rgb[o11 * 3 + 1] * w11
          cb = rgb[o00 * 3 + 2] * w00 + rgb[o10 * 3 + 2] * w10 + rgb[o01 * 3 + 2] * w01 + rgb[o11 * 3 + 2] * w11
        }
        if (t > 0) {
          // the attractor replaces the flat background colour, keeping the
          // vignette under its faint parts
          const keep = 1 - Math.min(1, t * 1.3)
          r = cr + (r - bg[0]) * keep
          gg = cg + (gg - bg[1]) * keep
          bb = cb + (bb - bg[2]) * keep
        }
      }
      if (noiseAmp > 0) {
        const nx = x / noiseCell
        const lx = nx | 0
        const ux = nx - lx
        const o = ly * nW + lx
        const top = lattice[o] + (lattice[o + 1] - lattice[o]) * ux
        const bot = lattice[o + nW] + (lattice[o + nW + 1] - lattice[o + nW]) * ux
        const n = top + (bot - top) * uy
        r += n
        gg += n
        bb += n
      }
      const o = (py * W + x) * 4
      px[o] = r
      px[o + 1] = gg
      px[o + 2] = bb
      px[o + 3] = 255
    }
  }
  g.putImageData(img, 0, 0)
}

export default {
  slug: 'attractor',
  title: 'Attractor',
  summary: 'Millions of points of a strange attractor\'s orbit, gathered into a density image and developed like a photograph.',
  order: 70,
  traits: TRAITS,
  features,
  render,
  // Seed-of-seeds 0xa77ac7a7 ("gallery" stream): the first hash found for each
  // Palette x Map pair, twelve pairs in the order found, except that the fifth
  // one (a Nacre fourfold rosette) is moved first to serve as the cover.
  gallery: [
    '0x454f7d80c1b2ad4b1c68e7b4b067d6b10fff971c1a9d66fa1a46ec4bd4b01f00',
    '0x071ebfa9e42f516d85bac7e0ed0ac485130dc23c2810b106407135e56a465941',
    '0x4a4ba7ff9d7c3e4b4a736772f0370bacfda88b6632492189764c88a086bd2473',
    '0xf0f00417766186e8257ace47fe7626b35b7052550f4e514daa19eebe6640057e',
    '0xf868abffb0948cd3607b34442ce7c7f903060ae46b2dcab72e395cb3f18b9bff',
    '0xb5713e79d9664fcfe1f5a3759982c59a65fbeb95b15749b1531fa4adb471c593',
    '0x2d2bdf95b6410f8cf56a0ec341310744802e7b89bc46b71db1bfa04ac2dcf964',
    '0x87ce0bd3b96ef15c8eac35331aa0a00d10408fc31d0228d8b59638cf237e766d',
    '0x3b2cf0dea611339e635151ab1296ecb5b9670c2b70df2ac5a784c5856ad6774f',
    '0x055a90c9182d08de8fb4a5f167c7d07aa0ac098e21139ec3611831bad5a7d479',
    '0x363f8bd90a443647e5e077542905d85f4e14b1b83a016639024d6aeb197b3f83',
    '0x51d15a614a687b7b9059edabec2bebab9fe47b3c829c918526b7d4db09aba42a',
  ],
} satisfies Series
