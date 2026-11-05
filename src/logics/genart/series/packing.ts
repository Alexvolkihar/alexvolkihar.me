// "Packing" — circles packed into a square, a disc or a cloud of discs, each
// one filled with its own small motif: rings, an arc, a dot, spokes, a half
// moon or nested tangent circles.
//
// Packing: random sequential addition with a decaying radius cap and a grid
// for collision checks (see ../packing/pack.ts). Palettes are original.

import type { Boundary, Circle, PackOptions } from '../packing/pack'
import type { Rng } from '../random'
import type { Series } from '../types'
import { blobBoundary, discBoundary, pack, squareBoundary } from '../packing/pack'
import { int, range, stream, weighted } from '../random'

// ---------------------------------------------------------------------------
// Rarity table — decided before the drawing code, never reordered.
// Changing a weight or an order re-rolls the whole edition.
// ---------------------------------------------------------------------------

const TRAITS = {
  'Palette': [['Chalk', 24], ['Clay', 20], ['Lagoon', 18], ['Pollen', 16], ['Midnight', 14], ['Ember', 8]],
  'Density': [['Airy', 25], ['Even', 50], ['Packed', 25]],
  'Motif mix': [['Assorted', 40], ['Concentric', 20], ['Lunar', 20], ['Radiant', 20]],
  'Size spread': [['Uniform', 15], ['Graded', 55], ['Giants', 30]],
  'Boundary': [['Square', 45], ['Circle', 35], ['Blob', 20]],
} as const

type TraitName = keyof typeof TRAITS
type Features = { [K in TraitName]: typeof TRAITS[K][number][0] }

/** Pure function of the hash, computed before (and without) any rendering. */
function features(hash: string): Features {
  const r = stream(hash, 'features')
  return {
    'Palette': weighted(r, TRAITS.Palette),
    'Density': weighted(r, TRAITS.Density),
    'Motif mix': weighted(r, TRAITS['Motif mix']),
    'Size spread': weighted(r, TRAITS['Size spread']),
    'Boundary': weighted(r, TRAITS.Boundary),
  }
}

// ---------------------------------------------------------------------------
// Palettes: paper, ink, and five fills (most frequent first).
// ---------------------------------------------------------------------------

interface Palette {
  bg: string
  ink: string
  fills: readonly [string, string, string, string, string]
}

const PALETTES: Record<Features['Palette'], Palette> = {
  Chalk: { bg: '#efe9df', ink: '#1e2430', fills: ['#d8cdbb', '#c4553b', '#2f4f6f', '#e3b34a', '#8aa39b'] },
  Clay: { bg: '#f1e4d3', ink: '#3b2219', fills: ['#b8532f', '#e08b4c', '#f2c48d', '#6d7f5a', '#2e4a52'] },
  Lagoon: { bg: '#e6ecea', ink: '#0f2b3a', fills: ['#1b5e7a', '#3f9aa6', '#a6d3cf', '#f0b65b', '#e9e4d6'] },
  Pollen: { bg: '#f4efe0', ink: '#2a2a24', fills: ['#e8b923', '#d2652d', '#8bab5a', '#f3e2a4', '#3c5a72'] },
  Midnight: { bg: '#13151c', ink: '#ece5d4', fills: ['#283048', '#3f5277', '#d9a54a', '#c75a46', '#8fb3b5'] },
  Ember: { bg: '#1b1411', ink: '#f2e3c9', fills: ['#43281f', '#7a3424', '#d8693a', '#f0b04a', '#7d8f7a'] },
}
const FILL_WEIGHTS = [30, 25, 20, 15, 10]

// ---------------------------------------------------------------------------
// Sizes and densities. Every length is a fraction of the canvas short side.
// ---------------------------------------------------------------------------

/** Scale of the smallest circles and of the gaps. */
const DENSITY: Record<Features['Density'], { unit: number, gap: number, line: number }> = {
  Airy: { unit: 1.55, gap: 0.0085, line: 0.0021 },
  Even: { unit: 1, gap: 0.0045, line: 0.0017 },
  Packed: { unit: 0.62, gap: 0.0028, line: 0.0013 },
}

function packOptions(f: Features): PackOptions {
  const d = DENSITY[f.Density]
  const base = { gap: d.gap, failDecay: 0.86, patience: 160, finalPatience: 900, accept: 0.55, maxAttempts: 70000 }
  switch (f['Size spread']) {
    case 'Uniform':
      return { ...base, rStart: 0.042 * d.unit, rMin: 0.024 * d.unit, placeDecay: 1, capFloor: 0, accept: 0.8 }
    case 'Giants':
      // two to four giants, then the cap drops to a middle size and only shrinks on misses
      return { ...base, rStart: 0.27, rMin: 0.011 * d.unit, placeDecay: 0.66, capFloor: 0.075 }
    default:
      return { ...base, rStart: 0.15, rMin: 0.011 * d.unit, placeDecay: 0.982, capFloor: 0 }
  }
}

const MARGIN = 0.07

function makeBoundary(r: Rng, kind: Features['Boundary']): Boundary {
  if (kind === 'Square')
    return squareBoundary(MARGIN)
  if (kind === 'Circle')
    return discBoundary(0.5, 0.5, 0.5 - MARGIN)
  // Blob: a main disc and two to four satellites, all kept inside the margin.
  const main = range(r, 0.27, 0.32)
  const mx = range(r, 0.45, 0.55)
  const my = range(r, 0.45, 0.55)
  const discs: [number, number, number][] = [[mx, my, main]]
  const n = int(r, 2, 4)
  const turn = r() * Math.PI * 2
  for (let i = 0; i < n; i++) {
    const a = turn + (i / n) * Math.PI * 2 + range(r, -0.5, 0.5)
    const dist = main * range(r, 0.7, 1)
    const want = range(r, 0.16, 0.24)
    const cx = mx + Math.cos(a) * dist
    const cy = my + Math.sin(a) * dist
    const room = Math.min(cx - MARGIN, 1 - MARGIN - cx, cy - MARGIN, 1 - MARGIN - cy)
    const rr = Math.min(want, room)
    if (rr > 0.08)
      discs.push([cx, cy, rr])
  }
  return blobBoundary(discs)
}

// ---------------------------------------------------------------------------
// Motifs
// ---------------------------------------------------------------------------

type Motif = 'rings' | 'arc' | 'dot' | 'spokes' | 'half' | 'nested'

const MIX: Record<Features['Motif mix'], ReadonlyArray<readonly [Motif, number]>> = {
  Assorted: [['rings', 20], ['arc', 16], ['dot', 16], ['spokes', 16], ['half', 16], ['nested', 16]],
  Concentric: [['rings', 55], ['nested', 30], ['dot', 15]],
  Lunar: [['half', 45], ['arc', 30], ['dot', 15], ['nested', 10]],
  Radiant: [['spokes', 50], ['arc', 20], ['rings', 15], ['dot', 15]],
}

/** Below this radius a circle only gets a dot or a plain fill. */
const SMALL = 0.016
const RING_STEP = 0.0085

function luminance(hex: string): number {
  const v = Number.parseInt(hex.slice(1), 16)
  return (0.2126 * (v >> 16) + 0.7152 * ((v >> 8) & 255) + 0.0722 * (v & 255)) / 255
}

interface Ctx {
  g: CanvasRenderingContext2D
  S: number
  line: number
}

function disc(c: Ctx, x: number, y: number, rad: number, color: string) {
  c.g.fillStyle = color
  c.g.beginPath()
  c.g.arc(x, y, rad, 0, Math.PI * 2)
  c.g.fill()
}

function drawMotif(c: Ctx, m: Motif, x: number, y: number, R: number, fill: string, ink: string, mr: Rng) {
  const { g, S } = c
  // every motif draws its parameters up front: the stream stays readable
  const a = mr() * Math.PI * 2
  const t = mr()
  const u = mr()
  g.strokeStyle = ink
  g.lineWidth = c.line * S
  switch (m) {
    case 'rings': {
      const n = Math.max(2, Math.floor(R / (RING_STEP * S)))
      g.beginPath()
      for (let k = 1; k < n; k++) {
        const rad = R * (k / n)
        g.moveTo(x + rad, y)
        g.arc(x, y, rad, 0, Math.PI * 2)
      }
      g.stroke()
      if (t < 0.5)
        disc(c, x, y, R / n * 0.5, ink)
      break
    }
    case 'arc': {
      const sweep = Math.PI * (0.9 + t * 0.8)
      // a band, never a fat stroke: thick arcs on big circles read as faces
      g.lineWidth = Math.min(R * (0.18 + u * 0.16), 0.024 * S)
      g.lineCap = u < 0.3 && R < 0.06 * S ? 'round' : 'butt'
      g.beginPath()
      g.arc(x, y, R * 0.58, a, a + sweep)
      g.stroke()
      g.lineCap = 'butt'
      break
    }
    case 'dot': {
      const rad = R * (0.26 + t * 0.2)
      const off = (R - rad) * u * 0.55
      disc(c, x + Math.cos(a) * off, y + Math.sin(a) * off, rad, ink)
      break
    }
    case 'spokes': {
      const n = Math.max(8, Math.round((Math.PI * 2 * R * 0.55) / (0.011 * S)))
      const r0 = R * (0.22 + t * 0.15)
      const r1 = R * 0.84
      g.beginPath()
      for (let k = 0; k < n; k++) {
        const b = a + (k / n) * Math.PI * 2
        g.moveTo(x + Math.cos(b) * r0, y + Math.sin(b) * r0)
        g.lineTo(x + Math.cos(b) * r1, y + Math.sin(b) * r1)
      }
      g.stroke()
      disc(c, x, y, r0 * 0.45, ink)
      break
    }
    case 'half': {
      g.fillStyle = ink
      g.beginPath()
      g.arc(x, y, R, a, a + Math.PI)
      g.closePath()
      g.fill()
      if (u < 0.5) {
        // a small dot on the open side, like a star next to the moon
        const b = a + Math.PI * (1.5 + (t - 0.5) * 0.5)
        disc(c, x + Math.cos(b) * R * 0.52, y + Math.sin(b) * R * 0.52, R * 0.15, ink)
      }
      break
    }
    case 'nested': {
      const n = Math.min(6, Math.max(2, Math.floor(R / (0.012 * S))))
      for (let k = 1; k <= n; k++) {
        const rad = R * (1 - k / (n + 1))
        const off = R - rad - c.line * S * 0.5
        disc(c, x + Math.cos(a) * off, y + Math.sin(a) * off, rad, k % 2 ? ink : fill)
      }
      break
    }
  }
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function render(g: CanvasRenderingContext2D, W: number, H: number, hash: string) {
  const f = features(hash)
  const pal = PALETTES[f.Palette]
  const dens = DENSITY[f.Density]
  const S = Math.min(W, H)
  const ox = (W - S) / 2
  const oy = (H - S) / 2

  // fixed stream order: shape, layout, color, motif, grain
  const boundary = makeBoundary(stream(hash, 'shape'), f.Boundary)
  const circles: Circle[] = pack(stream(hash, 'layout'), boundary, packOptions(f))
  const cr = stream(hash, 'color')
  const mr = stream(hash, 'motif')

  g.save()
  g.globalAlpha = 1
  g.fillStyle = pal.bg
  g.fillRect(0, 0, W, H)

  const c: Ctx = { g, S, line: dens.line }
  const fillEntries = pal.fills.map((col, i) => [col, FILL_WEIGHTS[i]] as const)
  const mix = MIX[f['Motif mix']]
  const bgL = luminance(pal.bg)
  const inkL = luminance(pal.ink)

  for (const ci of circles) {
    const x = ox + ci.x * S
    const y = oy + ci.y * S
    const R = ci.r * S
    // colour: two or three draws per circle
    const hollow = cr() < 0.1 && ci.r < 0.12
    let fill = weighted(cr, fillEntries)
    if (hollow)
      fill = pal.bg
    let ink = pal.ink
    const swap = cr()
    const fl = luminance(fill)
    if (swap < 0.22 || Math.abs(inkL - fl) < 0.3)
      ink = Math.abs(bgL - fl) > Math.abs(inkL - fl) ? pal.bg : pal.ink
    if (hollow)
      ink = pal.ink

    // motif: one draw for the choice, three for its parameters
    let motif = weighted(mr, mix)
    if (ci.r < SMALL && motif !== 'half')
      motif = 'dot'
    const plain = ci.r < SMALL && mr() < 0.4

    if (hollow) {
      g.strokeStyle = ink
      g.lineWidth = dens.line * S
      g.beginPath()
      g.arc(x, y, R - dens.line * S * 0.5, 0, Math.PI * 2)
      g.stroke()
    }
    else {
      disc(c, x, y, R, fill)
    }
    if (!plain)
      drawMotif(c, motif, x, y, R, fill, ink, mr)
  }

  // paper grain
  const gr = stream(hash, 'grain')
  g.fillStyle = pal.ink
  g.globalAlpha = 0.06
  for (let i = 0; i < 2500; i++) {
    const s = (0.0008 + gr() * 0.0012) * S
    g.fillRect(gr() * W, gr() * H, s, s)
  }
  g.restore()
}

export default {
  slug: 'packing',
  title: 'Packing',
  summary: 'Circles packed into a square, a disc or a cloud, each carrying its own small motif: rings, arcs, dots, spokes, half moons.',
  order: 40,
  traits: TRAITS,
  features,
  render,
  // Seed-of-seeds 0x9ac4e7 ("gallery" stream): the first hash found for each
  // palette × boundary pair, in the order found (12 of the 18 pairs). The
  // Midnight · Circle hit (6th found) is moved to the front as the cover.
  gallery: [
    '0xfbda384abebd165ed6f01eeab14342b6dc679e789b88230ac931404f4fd9155a',
    '0x1e3db3e0a40d247a368e7a4f06b5642bcd175e00b87d4914f402acd2d03c0949',
    '0x7459b70863be2a3264370604a65630b00ab2fda80ad3171b4676329f610a0883',
    '0x24230f575021632647e33e5b3a97a78c54c8d3334a132d1a53402f308e81546b',
    '0xcb399ca3fe68be673ad2719db4f0dad7447ab59b27b533b7745a5375a05aca84',
    '0x1f17facc7dc903776274b38f617e1f6332004fbe3416d75fcb3adca16bfc8ac6',
    '0x892c490571fbdf287701a265dee9b27cdc6f7beef0abdd5a8c0433450932c47a',
    '0x65dca1fbee0e438b669ab23c16b1561f09085541dfd9761c4d9ca7d53cc50510',
    '0xc1c51fee1baa0875aeabbb1172dee42c94c830275b86f00d874e8d3c295b97d1',
    '0x175aa84aab2231f11bf808c8c045ba3ca879ce8a1471aebfc46338da40c1841e',
    '0x077253a4f8febad3c7961d422106dcf63018e2c4673911303341d6420c33268d',
    '0x0b8ddeed8c62445df084c4963b5e666fc56bacb98c89775044c513f064f85da3',
  ],
} satisfies Series
