// "Growth" — closed curves that buckle into folds by differential growth.
//
// One or several small loops are seeded, then grown for a fixed number of
// steps (../growth/sim.ts): the line repels itself, smooths itself and keeps
// getting longer, so it folds into lobes, mazes and lichen rims without ever
// crossing. The growth is recorded at regular steps and drawn as filled
// growth rings, as a ridged band along the final line, as a time-lapse of
// fine contours, or as a filled shape inlaid with a coloured band.
//
// The simulation never sees the canvas: it works in repulsion radii with a
// node cap, and the result is fitted into the short side at the end. Every
// drawing width is a fraction of that fit, so a hash gives the same piece at
// any size. On a non-square canvas the square composition is centred on a
// background that fills the whole canvas.

import type { Frame, GrowthParams, SeedLoop } from '../growth/sim'
import type { Rng } from '../random'
import type { Series } from '../types'
import { grow } from '../growth/sim'
import { dcos, dsin, TAU } from '../growth/trig'
import { int, range, stream, weighted } from '../random'

// ---------------------------------------------------------------------------
// Rarity table — decided before the drawing code, never reordered.
// Changing a weight or an order re-rolls the whole edition.
// ---------------------------------------------------------------------------

const TRAITS = {
  Palette: [['Lichen', 22], ['Coral', 20], ['Ink', 16], ['Abyss', 18], ['Ember', 12], ['Iris', 12]],
  Seed: [['Bud', 34], ['Pair', 16], ['Colony', 20], ['Nested', 12], ['Rim', 18]],
  Fold: [['Fine', 30], ['Medium', 45], ['Lobed', 25]],
  Bounds: [['Disc', 40], ['Square', 25], ['Free', 35]],
  Style: [['Rings', 35], ['Ridge', 25], ['Echo', 20], ['Inlay', 20]],
} as const

type TraitName = keyof typeof TRAITS
type Features = { [K in TraitName]: typeof TRAITS[K][number][0] }

/** Pure function of the hash, computed before (and without) any rendering. */
function features(hash: string): Features {
  const r = stream(hash, 'features')
  return {
    Palette: weighted(r, TRAITS.Palette),
    Seed: weighted(r, TRAITS.Seed),
    Fold: weighted(r, TRAITS.Fold),
    Bounds: weighted(r, TRAITS.Bounds),
    Style: weighted(r, TRAITS.Style),
  }
}

interface Palette {
  bg: string
  /** Centre of the background glow. */
  glow: string
  /** Deep to light. */
  ramp: readonly string[]
  line: string
}

const PAL: Record<Features['Palette'], Palette> = {
  Lichen: { bg: '#e8e5d3', glow: '#f4f2e6', ramp: ['#2f3b29', '#56693f', '#8f9d5c', '#c9c27f', '#ece2b4'], line: '#232a1d' },
  Coral: { bg: '#f3e8de', glow: '#fbf5ef', ramp: ['#5e1624', '#a8323f', '#dc6a5c', '#f2a689', '#fadccb'], line: '#3d0e17' },
  Ink: { bg: '#eeeae1', glow: '#f8f6f0', ramp: ['#161616', '#3a3835', '#6e6a63', '#a9a397', '#ddd7cb'], line: '#0e0e0e' },
  Abyss: { bg: '#081216', glow: '#10262c', ramp: ['#0c3640', '#176670', '#2fa39b', '#82d6bd', '#d7f7e6'], line: '#e8fff6' },
  Ember: { bg: '#140d0b', glow: '#2a1711', ramp: ['#4e150c', '#932e17', '#d0592a', '#ef9a45', '#fbd88c'], line: '#fff2d6' },
  Iris: { bg: '#ece8f1', glow: '#f7f4fa', ramp: ['#241c45', '#4d3f85', '#8a73b9', '#c8a6cf', '#f1d9e2'], line: '#17112e' },
}

// Node cap, growth rate and vigour contrast. The container size follows the
// cap so that a finished piece is just about full.
const FOLD: Record<Features['Fold'], { cap: number, rate: number, contrast: number }> = {
  Fine: { cap: 1800, rate: 0.05, contrast: 0.35 },
  Medium: { cap: 1300, rate: 0.045, contrast: 0.6 },
  Lobed: { cap: 850, rate: 0.04, contrast: 0.9 },
}

const STEPS = 180
/** Half-size of the composition, as a fraction of the short side. */
const FIT = 0.43

function mix(a: string, b: string, t: number): string {
  const pa = Number.parseInt(a.slice(1), 16)
  const pb = Number.parseInt(b.slice(1), 16)
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t)
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`
}

function rampColor(ramp: readonly string[], t: number): string {
  const v = Math.min(0.9999, Math.max(0, t)) * (ramp.length - 1)
  const i = Math.floor(v)
  return mix(ramp[i], ramp[i + 1], v - i)
}

/** Triangle wave, period 1, in [0, 1]: a cyclic tag maps to a colour without a seam. */
function tri(u: number): number {
  const f = u - Math.floor(u)
  return 1 - Math.abs(2 * f - 1)
}

/** A smooth vigour profile around a loop, from its angle parameter in [0, TAU). */
function profile(r: Rng, contrast: number): (a: number) => number {
  const h1 = int(r, 1, 3)
  const h2 = int(r, 2, 6)
  const p1 = r() * TAU
  const p2 = r() * TAU
  const w2 = range(r, 0.2, 0.6)
  return (a) => {
    const s = (dsin(a * h1 + p1) + w2 * dsin(a * h2 + p2)) / (1 + w2)
    return 1 - contrast * (0.5 - 0.5 * s)
  }
}

/**
 * A slightly wobbly ellipse of nodes (aspect `asp`, turned by `rot`), with a
 * smooth vigour profile around it.
 */
function loop(r: Rng, cx: number, cy: number, rad: number, contrast: number, asp = 1, rot = 0): SeedLoop {
  const m = Math.max(12, Math.ceil(TAU * rad * asp / 0.35))
  const cr = dcos(rot)
  const sr = dsin(rot)
  const vig = profile(r, contrast)
  const xs: number[] = []
  const ys: number[] = []
  const vigour: number[] = []
  for (let k = 0; k < m; k++) {
    const a = k / m * TAU
    const rr = rad * (1 + 0.04 * (r() - 0.5))
    const ex = dcos(a) * rr * asp
    const ey = dsin(a) * rr / asp
    xs.push(cx + ex * cr - ey * sr)
    ys.push(cy + ex * sr + ey * cr)
    vigour.push(vig(a))
  }
  return { xs, ys, vigour }
}

/** A square loop of half-size `half`, walked side by side. */
function squareLoop(r: Rng, half: number, contrast: number): SeedLoop {
  const per = Math.ceil(2 * half / 0.35)
  const m = per * 4
  const vig = profile(r, contrast)
  const xs: number[] = []
  const ys: number[] = []
  const vigour: number[] = []
  for (let k = 0; k < m; k++) {
    const side = Math.floor(k / per)
    const t = -half + 2 * half * (k - side * per) / per
    const j = 0.02 * (r() - 0.5)
    if (side === 0) {
      xs.push(t)
      ys.push(-half + j)
    }
    else if (side === 1) {
      xs.push(half + j)
      ys.push(t)
    }
    else if (side === 2) {
      xs.push(-t)
      ys.push(half + j)
    }
    else {
      xs.push(-half + j)
      ys.push(-t)
    }
    vigour.push(vig(k / m * TAU))
  }
  return { xs, ys, vigour }
}

function seeds(f: Features, r: Rng, ext: number, contrast: number): SeedLoop[] {
  const out: SeedLoop[] = []
  if (f.Seed === 'Bud') {
    // anything from a round bud to a long sliver across the container
    const u = r()
    const asp = 1 + 2.2 * u * u
    out.push(loop(r, range(r, -0.1, 0.1) * ext, range(r, -0.1, 0.1) * ext, range(r, 0.1, 0.15) * ext, contrast, asp, r() * TAU))
  }
  else if (f.Seed === 'Pair') {
    const a = r() * TAU
    const d = range(r, 0.3, 0.42) * ext
    const rad = range(r, 0.07, 0.1) * ext
    out.push(loop(r, dcos(a) * d, dsin(a) * d, rad, contrast))
    out.push(loop(r, -dcos(a) * d, -dsin(a) * d, rad * range(r, 0.7, 1), contrast))
  }
  else if (f.Seed === 'Colony') {
    const k = int(r, 4, 7)
    const pts: number[] = []
    for (let tries = 0; pts.length < k * 3 && tries < 400; tries++) {
      const a = r() * TAU
      const d = Math.sqrt(r()) * 0.62 * ext
      const x = dcos(a) * d
      const y = dsin(a) * d
      const rad = range(r, 0.035, 0.065) * ext
      let ok = true
      for (let i = 0; i < pts.length; i += 3) {
        const dx = pts[i] - x
        const dy = pts[i + 1] - y
        const gap = pts[i + 2] + rad + 0.16 * ext
        if (dx * dx + dy * dy < gap * gap)
          ok = false
      }
      if (ok)
        pts.push(x, y, rad)
    }
    for (let i = 0; i < pts.length; i += 3)
      out.push(loop(r, pts[i], pts[i + 1], pts[i + 2], contrast))
  }
  else if (f.Seed === 'Nested') {
    const rad = range(r, 0.09, 0.12) * ext
    out.push(loop(r, 0, 0, rad, contrast))
    out.push(loop(r, 0, 0, rad * range(r, 2.6, 3.2), contrast))
  }
  else if (f.Bounds === 'Square') {
    // Rim: a loop along the wall, folding inwards
    out.push(squareLoop(r, ext - 0.6, contrast))
  }
  else {
    // Rim: a wide loop; in a disc it hugs the wall and folds inwards
    const rad = f.Bounds === 'Disc' ? ext - 0.6 : 0.55 * ext
    out.push(loop(r, 0, 0, rad, contrast))
  }
  return out
}

function render(g: CanvasRenderingContext2D, W: number, H: number, hash: string) {
  const f = features(hash)
  const pal = PAL[f.Palette]
  const fold = FOLD[f.Fold]
  const S = Math.min(W, H)
  const ox = (W - S) / 2
  const oy = (H - S) / 2

  // Fixed stream order: seed, growth, colour.
  const sr = stream(hash, 'seed')
  const gr = stream(hash, 'growth')
  const cr = stream(hash, 'color')

  // Container half-size in repulsion radii, sized from the node cap.
  const ext = Math.sqrt(fold.cap) * (f.Bounds === 'Square' ? 0.29 : 0.34)
  const frameCount = f.Style === 'Echo' ? 18 : 9
  const record: number[] = []
  for (let k = 0; k < frameCount - 1; k++)
    record.push(Math.floor(STEPS * (0.1 + 0.6 * k / (frameCount - 2))))
  const params: GrowthParams = {
    cap: fold.cap,
    steps: STEPS,
    // a rim starts long, so it needs fewer splits to fill the room
    rate: f.Seed === 'Rim' ? fold.rate * 0.5 : fold.rate,
    bounds: f.Bounds === 'Disc' ? 'disc' : f.Bounds === 'Square' ? 'square' : 'free',
    extent: ext,
    record,
  }
  const frames = grow(seeds(f, sr, ext, fold.contrast), params, gr)
  const last = frames[frames.length - 1]

  // --- fit -------------------------------------------------------------------
  let cx = 0
  let cy = 0
  let half = ext + 0.7
  if (f.Bounds === 'Free') {
    let x0 = Infinity
    let x1 = -Infinity
    let y0 = Infinity
    let y1 = -Infinity
    for (const l of last.loops) {
      for (let k = 0; k < l.xs.length; k++) {
        x0 = Math.min(x0, l.xs[k])
        x1 = Math.max(x1, l.xs[k])
        y0 = Math.min(y0, l.ys[k])
        y1 = Math.max(y1, l.ys[k])
      }
    }
    cx = (x0 + x1) / 2
    cy = (y0 + y1) / 2
    half = Math.max(x1 - x0, y1 - y0) / 2 + 0.7
  }
  const sc = FIT / half * S
  /** One repulsion radius, in pixels. */
  const lane = sc
  const X = (x: number) => ox + S / 2 + (x - cx) * sc
  const Y = (y: number) => oy + S / 2 + (y - cy) * sc

  // --- background --------------------------------------------------------------
  g.globalAlpha = 1
  g.fillStyle = pal.bg
  g.fillRect(0, 0, W, H)
  const glow = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.6)
  glow.addColorStop(0, pal.glow)
  glow.addColorStop(1, pal.bg)
  g.fillStyle = glow
  g.fillRect(0, 0, W, H)

  const trace = (l: Frame['loops'][number]) => {
    g.moveTo(X(l.xs[0]), Y(l.ys[0]))
    for (let k = 1; k < l.xs.length; k++)
      g.lineTo(X(l.xs[k]), Y(l.ys[k]))
    g.closePath()
  }

  // colour along the line: a cyclic tag, folded into the ramp
  const harm = int(cr, 1, 3)
  const offs = Array.from({ length: last.loops.length }, () => cr())
  const NB = 16
  const banded = (width: number, lo: number, hi: number) => {
    const buckets: number[][] = Array.from({ length: NB }, () => [])
    last.loops.forEach((l, li) => {
      const m = l.xs.length
      for (let k = 0; k < m; k++) {
        const k2 = k + 1 === m ? 0 : k + 1
        const t = tri(l.tags[k] * harm + offs[li])
        buckets[Math.min(NB - 1, Math.round(t * (NB - 1)))].push(l.xs[k], l.ys[k], l.xs[k2], l.ys[k2])
      }
    })
    g.lineWidth = width
    for (let b = 0; b < NB; b++) {
      const seg = buckets[b]
      if (!seg.length)
        continue
      g.strokeStyle = rampColor(pal.ramp, lo + (hi - lo) * b / (NB - 1))
      g.beginPath()
      for (let k = 0; k < seg.length; k += 4) {
        g.moveTo(X(seg[k]), Y(seg[k + 1]))
        g.lineTo(X(seg[k + 2]), Y(seg[k + 3]))
      }
      g.stroke()
    }
  }

  g.lineCap = 'round'
  g.lineJoin = 'round'

  if (f.Style === 'Rings') {
    // largest ring first, smaller ones on top: a bud grows outwards (newest
    // ring at the back), a rim grows inwards (oldest ring at the back)
    const K = frames.length
    const area = frames.map((fr) => {
      let a = 0
      for (const l of fr.loops) {
        let s = 0
        for (let k = 0, j = l.xs.length - 1; k < l.xs.length; j = k++)
          s += l.xs[j] * l.ys[k] - l.xs[k] * l.ys[j]
        a += Math.abs(s)
      }
      return a
    })
    const byArea = frames.map((_, k) => k).sort((a, b) => area[b] - area[a] || a - b)
    // colour by depth: the outermost ring is the deepest tone
    for (let q = 0; q < K; q++) {
      const k = byArea[q]
      const t = q / (K - 1)
      g.fillStyle = rampColor(pal.ramp, 0.08 + t * 0.9)
      g.beginPath()
      for (const l of frames[k].loops)
        trace(l)
      g.fill('evenodd')
      g.strokeStyle = pal.line
      g.globalAlpha = 0.55
      g.lineWidth = 0.07 * lane
      g.stroke()
      g.globalAlpha = 1
    }
  }
  else if (f.Style === 'Ridge') {
    g.strokeStyle = pal.line
    g.lineWidth = 1.0 * lane
    g.beginPath()
    for (const l of last.loops)
      trace(l)
    g.stroke()
    banded(0.74 * lane, 0.15, 1)
    g.strokeStyle = pal.line
    g.globalAlpha = 0.5
    g.lineWidth = 0.14 * lane
    g.beginPath()
    for (const l of last.loops)
      trace(l)
    g.stroke()
    g.globalAlpha = 1
  }
  else if (f.Style === 'Echo') {
    const K = frames.length
    for (let k = 0; k < K; k++) {
      const t = k / (K - 1)
      g.strokeStyle = rampColor(pal.ramp, 0.85 - 0.7 * t)
      g.globalAlpha = 0.45 + 0.5 * t
      g.lineWidth = (0.05 + 0.06 * t) * lane
      g.beginPath()
      for (const l of frames[k].loops)
        trace(l)
      g.stroke()
    }
    g.globalAlpha = 1
    g.strokeStyle = pal.line
    g.lineWidth = 0.16 * lane
    g.beginPath()
    for (const l of last.loops)
      trace(l)
    g.stroke()
  }
  else {
    // Inlay: the inside of the line, edged with a coloured band
    g.fillStyle = pal.ramp[1]
    g.beginPath()
    for (const l of last.loops)
      trace(l)
    g.fill('evenodd')
    g.strokeStyle = pal.line
    g.lineWidth = 0.62 * lane
    g.stroke()
    banded(0.4 * lane, 0.35, 1)
  }
}

export default {
  slug: 'growth',
  title: 'Growth',
  summary: 'Closed lines that repel themselves and keep growing until they buckle into lichen rims, brain-coral mazes and lobes, drawn as rings, ridges or contours.',
  order: 170,
  traits: TRAITS,
  features,
  render,
  // Seed-of-seeds 0x67a0e7f0 ("gallery" stream, 64-hex candidates): the
  // first hash found for each Palette x Style pair, twelve pairs in the
  // order found, except the Ember rings moved to the front as the cover.
  gallery: [
    '0xacf34071c08cf545a176de1ad5217b39ffbb8f119316ace5aa26852da6e65d96',
    '0xa43c60f5edc4cfd08d5995e478a21b9a3b87ebdb8724dfb7adfe84c6a596bac5',
    '0x4bdc6a5ee3ca24b31848daa63eb270c4a7e73e9fff65df69500e79d4b205cc88',
    '0xee3120ed002afd11a885081280b53192850c46a224a6056ce4d8180a7d2389a4',
    '0xdb8fedeae10885b1510c5ae6663c328f1ae6b8a2ccf5dd916f717d0b5486bd5c',
    '0x786d6b1301adb7386b6fff9edf77b1a86c9b50067e29234b711ade670354c06c',
    '0xc64c8bc2a6a3fc21bd1f68132c050eb60828e6987d5475ee6f187479c03fdb21',
    '0x33ec36f85a517357025b1a88864cd24eb9d3f775c39fbbd8009ffba41e8ab864',
    '0x1a38883bcad7477cde210f9388756273a26f405c87cebad233abed9aa62b1cd7',
    '0x1119c4bc4f3a5ae647b7e72b22bc92d4a3eafc00fd358fdd50a7ff349fa6a6f6',
    '0x02b1b81e9c32eba36aa9fbf872be2246735791ac4f93cfee9c4a370f8f566fcb',
    '0x451e14c3002cdfe5508abd16641fe621556f7c42fdc6f62ff3e0c861a0138944',
  ],
} satisfies Series
