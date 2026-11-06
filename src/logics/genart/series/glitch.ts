// "Glitch" — clean procedural pictures, then broken on purpose.
//
// A source image (a sunset over the sea, soft gradients, a modernist poster,
// a night skyline or a television test card) is painted on a working canvas,
// then damaged by one family of digital faults:
//
// - Pixel sort: Kim Asendorf's pixel sorting. Runs of pixels whose brightness
//   lies between two thresholds are sorted along rows or columns, inside a
//   band with ragged edges.
// - Datamosh: macroblocks keep copying pixels along their motion vectors, as
//   in compressed video that lost its key frames.
// - Channel shift: slices of the picture torn sideways, red and blue pulled
//   apart.
// - Compression: a real JPEG round trip (8 x 8 DCT, standard tables) at a very
//   low quality, with stream errors that shift colours and make the rest of
//   the scan slip.
// - Meltdown: all of the above, lighter.
//
// Soft scanlines and grain finish every piece. All passes run on a working
// buffer whose short side is at most CAP pixels, with every length a fraction
// of that short side, so a hash gives the same piece at any size; large
// exports are scaled up smoothly from that buffer.

import type { Axis, JpegError, Slice } from '../glitch/passes'
import type { Ctx2D, Palette, SourceFn } from '../glitch/sources'
import type { Rng } from '../random'
import type { Series } from '../types'
import { aberration, crt, datamosh, jpeg, lumQuantile, pixelSort, tear } from '../glitch/passes'
import { geometry, gradient, ihash, noise1, noise2, skyline, sunset, testCard } from '../glitch/sources'
import { chance, gaussian, int, range, stream, weighted } from '../random'

// ---------------------------------------------------------------------------
// Rarity table — decided before the drawing code, never reordered.
// ---------------------------------------------------------------------------

const TRAITS = {
  Source: [['Sunset', 26], ['Gradient', 20], ['Geometry', 20], ['Skyline', 18], ['Test card', 16]],
  Corruption: [['Pixel sort', 34], ['Datamosh', 22], ['Channel shift', 18], ['Compression', 16], ['Meltdown', 10]],
  Direction: [['Horizontal', 48], ['Vertical', 40], ['Both', 12]],
  Palette: [['Vapor', 22], ['Ember', 20], ['Ice', 18], ['Night', 18], ['Acid', 12], ['Paper', 10]],
  Intensity: [['Subtle', 28], ['Moderate', 47], ['Wrecked', 25]],
} as const

type TraitName = keyof typeof TRAITS
type Features = { [K in TraitName]: typeof TRAITS[K][number][0] }

function features(hash: string): Features {
  const r = stream(hash, 'features')
  return {
    Source: weighted(r, TRAITS.Source),
    Corruption: weighted(r, TRAITS.Corruption),
    Direction: weighted(r, TRAITS.Direction),
    Palette: weighted(r, TRAITS.Palette),
    Intensity: weighted(r, TRAITS.Intensity),
  }
}

// ---------------------------------------------------------------------------
// Palettes: a ramp from darkest to lightest, and two accents.
// ---------------------------------------------------------------------------

const PAL: Record<Features['Palette'], Palette> = {
  Vapor: { ramp: ['#1b1035', '#4b1d6b', '#b23a8f', '#ff7eb6', '#ffd9e6'], accent: '#3ee6e0', accent2: '#ffe46b' },
  Ember: { ramp: ['#1a0d0a', '#5c1a12', '#b8401c', '#f08a2c', '#ffdca6'], accent: '#2a6f8f', accent2: '#fff1d6' },
  Ice: { ramp: ['#0c1a2b', '#1f4d73', '#4f93b8', '#a9d8e8', '#f2f7fa'], accent: '#ff5a4f', accent2: '#ffd166' },
  Night: { ramp: ['#05060c', '#0d1430', '#1d2b5c', '#3a4a8a', '#8b9bd6'], accent: '#ff3d81', accent2: '#33f0c8' },
  Acid: { ramp: ['#050805', '#0f2614', '#1f5a2a', '#59b346', '#d6ff6b'], accent: '#ff4fd8', accent2: '#f0f0e0' },
  Paper: { ramp: ['#2a2522', '#6e5f55', '#b9a894', '#e3d6c2', '#f6efe2'], accent: '#d1352b', accent2: '#2f5d8a' },
}

const SOURCES: Record<Features['Source'], SourceFn> = {
  'Sunset': sunset,
  'Gradient': gradient,
  'Geometry': geometry,
  'Skyline': skyline,
  'Test card': testCard,
}

/** How much of the picture each intensity breaks. */
const COVER: Record<Features['Intensity'], number> = { Subtle: 0.6, Moderate: 1, Wrecked: 1.5 }

/** Largest short side of the working buffer, in pixels. */
const CAP = 1400

function layer(w: number, h: number): { cv: HTMLCanvasElement | OffscreenCanvas, g: Ctx2D } {
  if (typeof OffscreenCanvas !== 'undefined') {
    const cv = new OffscreenCanvas(w, h)
    return { cv, g: cv.getContext('2d', { willReadFrequently: true })! }
  }
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  return { cv, g: cv.getContext('2d', { willReadFrequently: true })! }
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

// ---------------------------------------------------------------------------
// Parameters of every pass, drawn in a fixed order from their own stream,
// whether the pass runs or not.
// ---------------------------------------------------------------------------

function sortParams(r: Rng, cover: number) {
  const bright = chance(r, 0.15)
  const qLo = bright ? range(r, 0.3, 0.55) : range(r, 0, 0.15)
  const descending = chance(r, 0.6)
  const k = Math.sqrt(cover)
  // the first band always covers the focus of the picture
  const h0 = range(r, 0.2, 0.32) * k
  const bands = [
    { c: range(r, -0.5, 0.5) * h0, half: h0 },
    { c: range(r, -0.35, 0.35), half: range(r, 0.08, 0.18) * k },
  ]
  const second = chance(r, 0.45)
  const alongC = range(r, -0.15, 0.15)
  const alongHalf = range(r, 0.35, 0.6) * k
  const freq = range(r, 3, 9)
  const edge = noise1(r, 32)
  const runs = noise1(r, 32)
  // fine jitter, about 1/200 of the canvas: every line ends somewhere else
  const jit = noise1(r, 256)
  return { bright, qLo, descending, bands, second, alongC, alongHalf, freq, edge, runs, jit }
}

function moshParams(r: Rng) {
  return {
    block: range(r, 1 / 32, 1 / 18),
    iterations: int(r, 7, 12),
    step: range(r, 0.006, 0.013),
    scale: range(r, 1.4, 3.2),
    ox: r() * 16,
    oy: r() * 16,
    field: noise2(r, 16),
    mask: noise2(r, 16),
    salt: Math.floor(r() * 2 ** 31),
  }
}

function jpegParams(r: Rng) {
  const block = range(r, 1 / 44, 1 / 28)
  const quality = range(r, 4, 12)
  const errors: JpegError[] = Array.from({ length: 3 }, () => ({
    at: range(r, 0.12, 0.85),
    dc: [gaussian(r) * 30, gaussian(r) * 70, gaussian(r) * 70] as const,
    slip: int(r, -5, 5),
    garble: int(r, 2, 24),
  }))
  return { block, quality, errors, salt: Math.floor(r() * 2 ** 31) }
}

function tearParams(r: Rng) {
  // slices cluster around the focus of the picture
  const c = range(r, -0.08, 0.08)
  const spread = range(r, 0.06, 0.16)
  const slices = Array.from({ length: 16 }, () => ({
    at: c + gaussian(r) * spread,
    size: range(r, 0.004, 0.05) * (chance(r, 0.15) ? 3 : 1),
    shift: (r() - 0.5) * 2 * range(r, 0.04, 0.25),
    split: range(r, 0.004, 0.02),
  }))
  const ab = range(r, 0.0015, 0.0035)
  return { slices, ab }
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function render(g: CanvasRenderingContext2D, W: number, H: number, hash: string) {
  const f = features(hash)
  const S = Math.min(W, H)
  const k = Math.min(1, CAP / S)
  const w = Math.max(1, Math.round(W * k))
  const h = Math.max(1, Math.round(H * k))
  const u = Math.min(w, h)
  const pal = PAL[f.Palette]
  const cover = COVER[f.Intensity]
  const axis: Axis = f.Direction === 'Vertical' ? 'y' : 'x'

  // Fixed stream order: source, sort, mosh, jpeg, tear, post.
  const L = layer(w, h)
  const [fx, fy] = SOURCES[f.Source](L.g, w, h, stream(hash, 'source'), pal)
  const sp = sortParams(stream(hash, 'sort'), cover)
  const mp = moshParams(stream(hash, 'mosh'))
  const jp = jpegParams(stream(hash, 'jpeg'))
  const tp = tearParams(stream(hash, 'tear'))
  const pr = stream(hash, 'post')
  const scan = range(pr, 150, 230)
  const postSalt = Math.floor(pr() * 2 ** 31)

  const img = L.g.getImageData(0, 0, w, h)
  const d = img.data
  // A little sensor noise first: sorted and re-encoded, it turns into streaks
  // and texture instead of flat runs.
  for (let i = 0, n = w * h; i < n; i++) {
    const v = (ihash(postSalt, i % w, (i / w) | 0) - 0.5) * 12
    d[i * 4] += v
    d[i * 4 + 1] += v
    d[i * 4 + 2] += v
  }
  const c = f.Corruption
  const melt = c === 'Meltdown'

  if (c === 'Pixel sort' || melt) {
    // Runs hold every pixel brighter than a low quantile (or, for a few
    // hashes, only the bright half): the subject is always inside the runs.
    const lo = lumQuantile(d, sp.qLo)
    const hi = 255
    const scale = melt ? 0.75 : 1
    const sortAxis = (ax: Axis, band: { c: number, half: number }) => {
      const across = ax === 'x' ? fy / h : fx / w
      const along = (ax === 'x' ? fx / w : fy / h) + sp.alongC
      pixelSort(d, w, h, {
        axis: ax,
        lo,
        hi,
        descending: sp.descending,
        span: (t) => {
          const half = band.half * scale * (0.7 + 0.6 * sp.edge(t * sp.freq))
          if (Math.abs(t - across - band.c) > half)
            return null
          const j = sp.jit(t * 200)
          const a0 = along - sp.alongHalf * scale * (0.5 + sp.edge(t * sp.freq + 9)) + 0.06 * j
          const a1 = along + sp.alongHalf * scale * (0.5 + sp.edge(t * sp.freq + 17)) - 0.06 * sp.jit(t * 200 + 101)
          return [clamp01(a0), clamp01(a1)]
        },
        maxRun: t => u * (0.12 + 0.8 * sp.runs(t * sp.freq * 0.7)) * (0.35 + 1.3 * sp.jit(t * 200 + 57)) * Math.sqrt(cover),
      })
    }
    if (f.Direction === 'Both') {
      sortAxis('y', sp.bands[0])
      sortAxis('x', sp.bands[1])
    }
    else {
      sortAxis(axis, sp.bands[0])
      if (sp.second)
        sortAxis(axis, sp.bands[1])
    }
  }

  // The moshed blocks: where a smooth noise rises above a threshold set by
  // the intensity.
  const moshCover = (melt ? 0.7 : 1) * cover
  // focus in fractions of the short side, from the centre
  const fu = (fx - w / 2) / u
  const fv = (fy - h / 2) / u
  const moshed = (x: number, y: number) => {
    const near = Math.exp(-((x - fu) ** 2 + (y - fv) ** 2) / 0.04)
    return mp.mask(x * mp.scale + mp.ox, y * mp.scale + mp.oy) + 0.45 * near > 0.72 - 0.22 * moshCover
  }
  if (c === 'Datamosh' || melt) {
    const step = mp.step * u
    datamosh(d, w, h, {
      block: mp.block * u,
      iterations: mp.iterations,
      salt: mp.salt,
      flatten: 0.22,
      vector: (x, y) => {
        if (!moshed(x, y))
          return null
        // a smooth field gives the drift, a per-block hash breaks it up
        const n = mp.field(x * mp.scale * 1.7 + 31, y * mp.scale * 1.7 + 5)
        const q = ihash(mp.salt, Math.round(x * 200), Math.round(y * 200))
        const m = step * (0.5 + 1.5 * q)
        const side = n < 0.5 ? -1 : 1
        if (f.Direction === 'Horizontal')
          return [side * m * 1.6, (q - 0.5) * 0.5 * step]
        if (f.Direction === 'Vertical')
          return [(q - 0.5) * 0.5 * step, m * 1.4]
        const a = n * Math.PI * 4
        return [Math.cos(a) * m * 1.4, Math.sin(a) * m * 1.4]
      },
    })
    if (c === 'Datamosh')
      jpeg(d, w, h, { block: mp.block * u, quality: 35, errors: [], mask: moshed, salt: jp.salt })
  }

  if (c === 'Compression' || melt) {
    const n = melt ? 1 : f.Intensity === 'Subtle' ? 1 : f.Intensity === 'Moderate' ? 2 : 3
    const quality = melt ? 14 : jp.quality / Math.sqrt(cover)
    jpeg(d, w, h, { block: jp.block * u, quality, errors: jp.errors.slice(0, n), mask: () => true, salt: jp.salt })
  }

  if (c === 'Channel shift' || melt) {
    const n = melt ? 5 : f.Intensity === 'Subtle' ? 6 : f.Intensity === 'Moderate' ? 10 : 16
    const tAxis = f.Direction === 'Both' ? 'x' : axis
    const across = tAxis === 'x' ? fy / h : fx / w
    const slices: Slice[] = tp.slices.slice(0, n).map(s => ({
      at: clamp01(across + s.at),
      size: s.size * u,
      shift: s.shift * u * (melt ? 0.6 : 1),
      split: s.split * u,
    }))
    tear(d, w, h, tAxis, slices)
  }

  const ab = tp.ab * u * (c === 'Channel shift' ? 2.2 : c === 'Compression' ? 0.5 : 1)
  if (axis === 'x')
    aberration(d, w, h, ab, 0)
  else
    aberration(d, w, h, 0, ab)
  crt(d, w, h, u / scan, c === 'Channel shift' ? 0.16 : 0.07, 9, postSalt)

  L.g.putImageData(img, 0, 0)
  g.save()
  g.globalAlpha = 1
  g.globalCompositeOperation = 'source-over'
  g.imageSmoothingEnabled = true
  g.imageSmoothingQuality = 'high'
  g.drawImage(L.cv, 0, 0, W, H)
  g.restore()
}

export default {
  slug: 'glitch',
  title: 'Glitch',
  summary: 'Procedural sunsets, skylines, posters and test cards broken on purpose: pixel sorting, datamoshing, torn channels and corrupted JPEG blocks.',
  order: 560,
  traits: TRAITS,
  features,
  render,
  // Seed-of-seeds 0x611c4c4 ("gallery" stream, 64-hex candidates): the first
  // hash found for each Source x Corruption pair, twelve pairs; the skyline
  // melted by vertical pixel sorting is moved to the front as the cover.
  gallery: [
    '0x52f2b295e892c7882145936c17eba1fd753b0018804019b9a7d57c173e60d3fe',
    '0x58d995124f0ced3531fab086863e0c29cb8ed2db1974dd260b2441960d1af3ef',
    '0xb5825dbd5230609fbebeef81f4d9ff25ec843cb5b1fcf9b658a66d9715c73a18',
    '0x64ba305a3f15a2b928d8c3728a9e2f13f1cea86057c99e83727411dc9ce0cc58',
    '0x0ea9af91073c9e7dd79125cdf97b142234f5585ee7c3184a25426b7c8efb96cb',
    '0x74e1273088b677651667c2b6ba3d08cb54f1e48c27d995aa699234e4068ec3b0',
    '0x7325dfe46dae35faff2cb1f43752edd81f3703353e15b6caf91e43d9f0418728',
    '0x805eb83fade01eba2587ae82e6710c79fcf845a2ef667ade432938f161716880',
    '0x114a6c8cec3b0f41c8ca2f03d72bed525832af3c5b103a78155bab357c0ae891',
    '0xe628865757f71a1652440ea891eeda306b6b7f04b8ccfcb8f13823705b40dd96',
    '0x559c51fbca225276e212cda1caaadc9637011a216d717337a3a7c30a8847635a',
    '0x602db9ebce65e7a002440fb5ba0459790fe844846b5b587557f6e8b48d0c5c4c',
  ],
} satisfies Series
