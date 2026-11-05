// "Strata" — layered landscapes seen from the side.
//
// A stack of horizontal ridgelines, each one a few octaves of 1D gradient
// noise, is filled back to front (painter's algorithm) so nearer ridges hide
// farther ones. Distance is told by colour alone: far ridges sink into the
// haze of the horizon, near ones darken. Every value comes from the hash and
// every length is a fraction of the canvas short side.
//
// Techniques (shared heritage, credited): Perlin's gradient noise (1985) in
// one dimension, fractal Brownian motion and Musgrave's ridged multifractal
// for the peaks, aerial perspective as a depth-weighted mix towards the haze.

import type { Rng } from '../random'
import type { Series } from '../types'
import { int, range, stream, weighted } from '../random'

// ---------------------------------------------------------------------------
// Rarity table — decided before the drawing code, never reordered.
// Changing a weight or an order re-rolls the whole edition.
// ---------------------------------------------------------------------------

const TRAITS = {
  Palette: [['Dawn', 22], ['Dusk', 22], ['Ink', 20], ['Glacier', 16], ['Night', 12], ['Ember', 8]],
  Terrain: [['Dunes', 30], ['Hills', 40], ['Peaks', 30]],
  Layers: [['Few', 25], ['Many', 50], ['Deep', 25]],
  Texture: [['Clean', 35], ['Strata', 40], ['Stipple', 25]],
  Sky: [['Clear', 30], ['Orb', 50], ['Banded', 20]],
} as const

type TraitName = keyof typeof TRAITS
type Features = { [K in TraitName]: typeof TRAITS[K][number][0] }

/** Pure function of the hash, computed before (and without) any rendering. */
function features(hash: string): Features {
  const r = stream(hash, 'features')
  return {
    Palette: weighted(r, TRAITS.Palette),
    Terrain: weighted(r, TRAITS.Terrain),
    Layers: weighted(r, TRAITS.Layers),
    Texture: weighted(r, TRAITS.Texture),
    Sky: weighted(r, TRAITS.Sky),
  }
}

// ---------------------------------------------------------------------------
// Palettes (original to this site)
// ---------------------------------------------------------------------------

interface Palette {
  /** Sky at the zenith, sky at the horizon (also the haze ridges fade into). */
  top: string
  haze: string
  /** Ridge colours from the farthest to the nearest. */
  far: string
  mid: string
  near: string
  orb: string
  /** Texture ink, and the light caught by each crest. */
  line: string
  rim: string
  stars: boolean
}

const PALETTES: Record<Features['Palette'], Palette> = {
  Dawn: { top: '#d7b4c6', haze: '#fbe4cf', far: '#ebb6a6', mid: '#a96c84', near: '#2f2038', orb: '#fff7ec', line: '#2a1d2c', rim: '#fff1e4', stars: false },
  Dusk: { top: '#1f2b58', haze: '#f3a96b', far: '#c97a6f', mid: '#423c68', near: '#0f1229', orb: '#ffdc8f', line: '#0e0916', rim: '#f7b77a', stars: false },
  Ink: { top: '#e9e3d4', haze: '#f4efe4', far: '#d2ccbf', mid: '#7f7a70', near: '#1c1b19', orb: '#b8402c', line: '#121110', rim: '#f4efe4', stars: false },
  Glacier: { top: '#b6cedb', haze: '#eff4f3', far: '#b9cdd5', mid: '#5f8499', near: '#14283a', orb: '#ffffff', line: '#0b1824', rim: '#ffffff', stars: false },
  Night: { top: '#050812', haze: '#2a3a60', far: '#3a4e78', mid: '#18233f', near: '#04060c', orb: '#efe7cb', line: '#8ea4cc', rim: '#7d93c2', stars: true },
  Ember: { top: '#cf5a35', haze: '#f8d59c', far: '#e7a46c', mid: '#a6432e', near: '#2b0e0b', orb: '#fff4d8', line: '#1d0806', rim: '#ffd9a0', stars: false },
}

// ---------------------------------------------------------------------------
// Terrain profiles. Heights are in units of the canvas short side.
// ---------------------------------------------------------------------------

interface Profile {
  /** Baseline of the farthest ridge (0 = top edge). */
  horizon: readonly [number, number]
  /** Ridge amplitude for the farthest and the nearest layer. */
  ampFar: number
  ampNear: number
  /** Feature frequency (per short side) of the nearest layer... */
  freq: number
  /** ...and how much finer the farthest layer is (perspective). */
  farFreq: number
  octaves: number
}

const PROFILES: Record<Features['Terrain'], Profile> = {
  Dunes: { horizon: [0.4, 0.6], ampFar: 0.03, ampNear: 0.12, freq: 1.5, farFreq: 2.2, octaves: 2 },
  Hills: { horizon: [0.34, 0.56], ampFar: 0.06, ampNear: 0.13, freq: 1.3, farFreq: 1.6, octaves: 4 },
  Peaks: { horizon: [0.46, 0.6], ampFar: 0.27, ampNear: 0.08, freq: 1.25, farFreq: 0.6, octaves: 5 },
}

const LAYER_COUNT: Record<Features['Layers'], readonly [number, number]> = {
  Few: [5, 7],
  Many: [9, 13],
  Deep: [16, 22],
}

/** Horizontal sampling step of a ridge, in short-side units. */
const STEP = 1 / 200

// ---------------------------------------------------------------------------
// Noise and colour helpers
// ---------------------------------------------------------------------------

/** 1D gradient noise (Perlin 1985) on a 256-cell hash-seeded lattice, in about [-1, 1]. */
function makeNoise(r: Rng) {
  const grad = new Float32Array(256)
  for (let i = 0; i < 256; i++)
    grad[i] = r() * 2 - 1
  return (x: number) => {
    const i = Math.floor(x)
    const f = x - i
    const a = grad[i & 255] * f
    const b = grad[(i + 1) & 255] * (f - 1)
    const u = f * f * f * (f * (f * 6 - 15) + 10)
    return 2 * (a + u * (b - a))
  }
}

type Noise = ReturnType<typeof makeNoise>

/**
 * One dune per lattice cell: a long windward slope up to a sharp crest, then a
 * steep slip face that eases into the trough. The cell is warped by noise so
 * dunes have uneven widths; each cell draws its own crest height.
 */
function dune(n: Noise, x: number): number {
  const p = x + 0.4 * n(x * 0.31 + 91.3)
  const cell = Math.floor(p)
  const fr = p - cell
  const crest = 0.7 + 0.12 * n(cell * 0.71 + 5.1)
  const tall = 0.55 + 0.45 * n(cell * 1.37 + 17.9)
  let h: number
  if (fr < crest)
    h = (fr / crest) ** 1.45
  else
    h = (1 - (fr - crest) / (1 - crest)) ** 2.2
  // wind ripples on top
  return Math.min(1, Math.max(0, h * tall + 0.035 * n(x * 9.3 + 3.3)))
}

/** Height in [0, 1] of the terrain at `x` (already scaled by frequency). */
function height(n: Noise, terrain: Features['Terrain'], x: number, octaves: number): number {
  if (terrain === 'Dunes')
    return dune(n, x)
  let sum = 0
  let norm = 0
  let amp = 1
  let freq = 1
  let weight = 1
  for (let k = 0; k < octaves; k++) {
    const v = n(x * freq + k * 37.17)
    if (terrain === 'Hills') {
      sum += v * amp
    }
    else {
      // Musgrave's ridged multifractal: sharp crests where the noise crosses
      // zero, and finer detail only where the coarser octaves are high
      let ridge = 1 - Math.abs(v)
      ridge *= ridge * weight
      weight = Math.min(1, Math.max(0, ridge * 1.6))
      sum += ridge * amp
    }
    norm += amp
    amp *= terrain === 'Peaks' ? 0.42 : 0.5
    freq *= 2.03
  }
  const h = sum / norm
  if (terrain === 'Hills')
    return Math.min(1, Math.max(0, 0.5 + h * 0.9))
  return h
}

type Rgb = readonly [number, number, number]

function hex(c: string): Rgb {
  const v = Number.parseInt(c.slice(1), 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

function css(c: Rgb, alpha = 1): string {
  return `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${alpha})`
}

// ---------------------------------------------------------------------------
// Composition — computed from the streams before anything is drawn
// ---------------------------------------------------------------------------

interface Layer {
  /** 0 = farthest, 1 = nearest. */
  t: number
  base: number
  amp: number
  color: Rgb
  /** Ridge heights sampled every STEP from x0. */
  ys: Float32Array
}

function buildLayers(hash: string, f: Features, x0: number, x1: number): Layer[] {
  const r = stream(hash, 'terrain')
  const c = stream(hash, 'color')
  const prof = PROFILES[f.Terrain]
  const pal = PALETTES[f.Palette]
  const [lo, hi] = LAYER_COUNT[f.Layers]
  const n = int(r, lo, hi)
  const horizon = range(r, prof.horizon[0], prof.horizon[1])
  const curve = range(r, 1.15, 1.6)
  const noise = makeNoise(r)
  // the prevailing wind: which side of the dunes carries the slip face
  const wind = r() < 0.5 ? 1 : -1
  // more layers share the same depth, so each gets a little less relief
  const crowd = (9 / n) ** 0.35
  const mist = range(c, 0.18, 0.42)

  const far = hex(pal.far)
  const mid = hex(pal.mid)
  const near = hex(pal.near)
  const haze = hex(pal.haze)
  const samples = Math.ceil((x1 - x0) / STEP) + 1

  const layers: Layer[] = []
  for (let i = 0; i < n; i++) {
    // fixed draws per layer, whatever the terrain
    const offset = r() * 500
    const ampJitter = range(r, 0.75, 1.25)
    const shade = range(c, -0.06, 0.06)

    const t = n === 1 ? 1 : i / (n - 1)
    const base = horizon + (0.99 - horizon) * t ** curve
    const amp = (prof.ampFar + (prof.ampNear - prof.ampFar) * t) * ampJitter * crowd
    const freq = prof.freq * (1 + (1 - t) * prof.farFreq)

    let color = t < 0.5 ? mix(far, mid, t * 2) : mix(mid, near, (t - 0.5) * 2)
    // aerial perspective: distance pulls every ridge towards the haze
    color = mix(color, haze, mist * (1 - t) ** 1.5)
    color = shade < 0 ? mix(color, near, -shade) : mix(color, haze, shade)

    const ys = new Float32Array(samples)
    for (let k = 0; k < samples; k++) {
      const x = x0 + k * STEP
      ys[k] = base - amp * height(noise, f.Terrain, wind * x * freq + offset, prof.octaves)
    }
    layers.push({ t, base, amp, color, ys })
  }
  return layers
}

// ---------------------------------------------------------------------------
// Drawing — normalised space: the short side of the canvas is 1.
// ---------------------------------------------------------------------------

interface View { x0: number, x1: number, y0: number, y1: number }

/** Highest point (smallest y) of the landscape inside the central square. */
function skyline(layers: Layer[], v: View): number {
  const from = Math.round(-v.x0 / STEP)
  const to = Math.round((1 - v.x0) / STEP)
  let top = 1
  for (const L of layers) {
    for (let k = from; k <= to; k++)
      top = Math.min(top, L.ys[k])
  }
  return top
}

function drawSky(g: CanvasRenderingContext2D, hash: string, f: Features, pal: Palette, v: View, layers: Layer[]) {
  const r = stream(hash, 'sky')
  const horizon = layers[0].base
  const orbX = range(r, 0.22, 0.78)
  const orbR = range(r, 0.06, 0.12)
  // from well clear of the ridges down to half set behind the highest one
  const peak = skyline(layers, v)
  const orbY = Math.max(orbR + 0.06, range(r, peak - 0.22, peak + orbR * 0.15))
  const bands = int(r, 7, 11)

  const top = hex(pal.top)
  const haze = hex(pal.haze)
  const sky = g.createLinearGradient(0, v.y0, 0, horizon + 0.05)
  sky.addColorStop(0, pal.top)
  sky.addColorStop(1, pal.haze)

  if (f.Sky === 'Banded') {
    // the gradient quantised into flat bands, like a screen print
    const h = (horizon + 0.05 - v.y0) / bands
    for (let k = 0; k < bands; k++) {
      g.fillStyle = css(mix(top, haze, (k + 0.5) / bands))
      g.fillRect(v.x0, v.y0 + k * h, v.x1 - v.x0, h + 0.002)
    }
    g.fillStyle = pal.haze
    g.fillRect(v.x0, horizon + 0.05, v.x1 - v.x0, v.y1 - horizon)
  }
  else {
    g.fillStyle = sky
    g.fillRect(v.x0, v.y0, v.x1 - v.x0, v.y1 - v.y0)
  }

  // stars: always drawn from the stream, only shown on dark skies
  g.fillStyle = pal.orb
  for (let k = 0; k < 220; k++) {
    const x = v.x0 + r() * (v.x1 - v.x0)
    const y = v.y0 + r() ** 1.6 * (horizon - v.y0)
    const s = 0.0012 + r() ** 4 * 0.0032
    const a = r()
    if (!pal.stars)
      continue
    g.globalAlpha = 0.25 + a * 0.6
    g.fillRect(x, y, s, s)
  }
  g.globalAlpha = 1

  if (f.Sky === 'Clear')
    return

  const glow = g.createRadialGradient(orbX, orbY, orbR * 0.8, orbX, orbY, orbR * 3.2)
  glow.addColorStop(0, css(hex(pal.orb), 0.28))
  glow.addColorStop(1, css(hex(pal.orb), 0))
  g.fillStyle = glow
  g.fillRect(orbX - orbR * 3.2, orbY - orbR * 3.2, orbR * 6.4, orbR * 6.4)

  g.beginPath()
  g.arc(orbX, orbY, orbR, 0, Math.PI * 2)
  g.fillStyle = pal.orb
  g.fill()

  if (f.Sky === 'Banded') {
    // the lower half of the disc is cut by widening slits of sky
    g.save()
    g.beginPath()
    g.arc(orbX, orbY, orbR * 1.02, 0, Math.PI * 2)
    g.clip()
    for (let k = 0; k < 5; k++) {
      const y = orbY + orbR * (0.1 + k * 0.2)
      const h = orbR * (0.025 + k * 0.022)
      g.fillStyle = css(mix(top, haze, Math.min(1, (y - v.y0) / (horizon + 0.05 - v.y0))))
      g.fillRect(orbX - orbR * 1.1, y, orbR * 2.2, h)
    }
    g.restore()
  }
}

function traceRidge(g: CanvasRenderingContext2D, L: Layer, x0: number) {
  g.moveTo(x0, L.ys[0])
  for (let k = 1; k < L.ys.length; k++)
    g.lineTo(x0 + k * STEP, L.ys[k])
}

function drawLayer(g: CanvasRenderingContext2D, L: Layer, next: Layer | undefined, pal: Palette, v: View) {
  const haze = hex(pal.haze)
  const bottom = next ? next.base + 0.02 : v.y1
  // valley mist: each ridge pales towards its foot, where the next one rises
  const grad = g.createLinearGradient(0, L.base - L.amp, 0, bottom)
  grad.addColorStop(0, css(L.color))
  grad.addColorStop(1, css(mix(L.color, haze, 0.32 * (1 - L.t * 0.8))))
  g.beginPath()
  traceRidge(g, L, v.x0)
  g.lineTo(v.x1 + 0.01, v.y1 + 0.01)
  g.lineTo(v.x0 - 0.01, v.y1 + 0.01)
  g.closePath()
  g.fillStyle = grad
  g.fill()

  // light caught along the crest
  g.beginPath()
  traceRidge(g, L, v.x0)
  g.strokeStyle = css(hex(pal.rim), 0.16 + 0.22 * (1 - L.t))
  g.lineWidth = 0.0016
  g.stroke()
}

/** Bedding lines under the crest that flatten with depth, like exposed rock strata. */
function drawStrata(g: CanvasRenderingContext2D, L: Layer, next: Layer | undefined, pal: Palette, v: View) {
  const gap = 0.0045 + 0.006 * L.t
  const floor = next ? next.base : v.y1
  const lines = Math.min(40, Math.ceil((floor - (L.base - L.amp)) / gap))
  g.strokeStyle = css(hex(pal.line), 0.18 + 0.14 * L.t)
  g.lineWidth = 0.0008 + 0.0008 * L.t
  g.beginPath()
  for (let j = 1; j <= lines; j++) {
    const flatten = Math.min(1, j * 0.05)
    for (let k = 0; k < L.ys.length; k++) {
      const y = L.ys[k] + (L.base - L.ys[k]) * flatten + j * gap
      if (k === 0)
        g.moveTo(v.x0, y)
      else
        g.lineTo(v.x0 + k * STEP, y)
    }
  }
  g.stroke()
}

/** Dots that thin out away from the crest, like an etched shadow. */
function drawStipple(g: CanvasRenderingContext2D, r: Rng, L: Layer, next: Layer | undefined, pal: Palette, v: View) {
  const depth = Math.max(0.02, (next ? next.base : v.y1) - (L.base - L.amp))
  const count = Math.round(7000 * (v.x1 - v.x0) * depth * (0.6 + L.t))
  g.fillStyle = css(hex(pal.line), 0.12 + 0.55 * L.t)
  const last = L.ys.length - 1
  for (let k = 0; k < count; k++) {
    const u = r()
    const d = r() ** 2.2 * depth
    const s = 0.0011 + r() * 0.0013 * (0.5 + L.t)
    const pos = u * last
    const i = Math.floor(pos)
    const y0 = L.ys[i]
    const y = y0 + (L.ys[Math.min(last, i + 1)] - y0) * (pos - i)
    g.fillRect(v.x0 + pos * STEP, y + d + 0.0012, s, s)
  }
}

function drawGrain(g: CanvasRenderingContext2D, hash: string, pal: Palette, v: View) {
  const r = stream(hash, 'grain')
  g.fillStyle = pal.stars ? pal.rim : pal.line
  g.globalAlpha = 0.05
  for (let i = 0; i < 4000; i++) {
    const x = v.x0 + r() * (v.x1 - v.x0)
    const y = v.y0 + r() * (v.y1 - v.y0)
    const s = 0.0008 + r() * 0.0012
    g.fillRect(x, y, s, s)
  }
  g.globalAlpha = 1
}

/**
 * Draws the piece for `hash` across the whole canvas. A centred square of side
 * `min(width, height)` holds the composition; wider or taller canvases simply
 * see more of the same landscape. Leaves the context state as it found it.
 */
function render(g: CanvasRenderingContext2D, width: number, height: number, hash: string) {
  const f = features(hash)
  const pal = PALETTES[f.Palette]
  const S = Math.min(width, height)
  const dx = (width - S) / 2 / S
  const dy = (height - S) / 2 / S
  const v: View = { x0: -dx, x1: 1 + dx, y0: -dy, y1: 1 + dy }
  const layers = buildLayers(hash, f, v.x0, v.x1)

  g.save()
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.globalAlpha = 1
  g.globalCompositeOperation = 'source-over'
  g.translate(width / 2 - S / 2, height / 2 - S / 2)
  g.scale(S, S)
  g.lineJoin = 'round'
  g.lineCap = 'round'

  drawSky(g, hash, f, pal, v, layers)
  const tr = stream(hash, 'texture')
  for (let i = 0; i < layers.length; i++) {
    const L = layers[i]
    const next = layers[i + 1]
    drawLayer(g, L, next, pal, v)
    if (f.Texture === 'Strata')
      drawStrata(g, L, next, pal, v)
    else if (f.Texture === 'Stipple')
      drawStipple(g, tr, L, next, pal, v)
  }
  drawGrain(g, hash, pal, v)
  g.restore()
}

export default {
  slug: 'strata',
  title: 'Strata',
  summary: 'Ridgelines of 1D noise stacked back to front, fading into the haze: dunes, hills and peaks at dawn, dusk or night.',
  order: 50,
  traits: TRAITS,
  features,
  render,
  // Seed-of-seeds 0x57a7a57a7a57a7a5 ("gallery" stream): the first hash found
  // for each palette x terrain pair, in the order they came. The first one
  // (Ink peaks under a red sun) is a strong cover, so the order is kept.
  gallery: [
    '0x9f317995fc65b45a29501633ef797a0ece50b800bfc2d14fa83a04ec394c32f3', // Ink / Peaks / Deep / Strata / Orb
    '0x9b44b86a2de6b2a7a92ef4c0b314204ea48576b12d03268cd5e540f8a90f80a1', // Dawn / Hills / Deep / Clean / Clear
    '0x592c7281b6a526508d612a4e5797c03643de09fa28a173e3844aef6c13f78564', // Glacier / Hills / Many / Stipple / Orb
    '0xfcca0862ee44a98af4041556c4865d7877d98bac6e88b37f0ee32033c021bf88', // Ember / Peaks / Deep / Strata / Clear
    '0x56f148d6720d2910b7d3e91881c46400ad8a2b04c237fe44f63a8e373efe45d8', // Ink / Dunes / Many / Strata / Orb
    '0x252e0c93c29be45c2b574ed3689b63dd97941df76ff1b6709b05ecc6eb64cdc8', // Dusk / Dunes / Few / Stipple / Orb
    '0x98b26ff3eb482ba0add6149c04edb29a52ff4eeacbb28a2ca22a41a4a472b5d3', // Night / Peaks / Many / Strata / Orb
    '0x6b3a3c52beed480cb8ae2f32d3ad5535ba331f122ab04976e14ab441435e7d28', // Night / Hills / Few / Clean / Clear
    '0x564cc84e4fbc2b7c16a63ee41c7288d645a917e2708eaac3b4a114cb81356742', // Dusk / Peaks / Many / Clean / Clear
    '0x261383c7543849f554c15cf0d1862827c814eafc18e05edbcf7323e40d3db769', // Glacier / Peaks / Few / Stipple / Orb
    '0x1e9900b24f451bbb255f0d799d971d59b49f52b6af2d1420206629c8b7b65a8f', // Dawn / Peaks / Many / Strata / Orb
    '0xa86ef0f2b78de5567d5afa875235cd73b157af1d1bc41af82c515356b78e46c1', // Glacier / Dunes / Few / Stipple / Banded
  ],
} satisfies Series
