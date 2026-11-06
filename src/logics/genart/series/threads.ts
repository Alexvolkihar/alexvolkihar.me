// "Threads" — string art: thread stretched from nail to nail on a board.
//
// Nails are set round a circle, a square, a regular polygon or two concentric
// rings (../threads/frames.ts). The threads then follow one of four rules:
//
// - Times table: nail i is joined to nail k·i mod n. The envelope of the
//   chords is an epicycloid with k − 1 cusps (k = 2 the cardioid, k = 3 the
//   nephroid); a k close to n/m + δ folds m of them into a rosette.
// - Curve stitch: nail i is joined to nail i + d(i). A constant step across a
//   corner of a straight frame gives Mary Everest Boole's parabolas; a step
//   that swells and shrinks round a ring gives caustics.
// - Layered: two or three times tables in different threads.
// - Greedy image: one long thread laid by Petros Vrellis's greedy method to
//   approximate a procedural figure (../threads/greedy.ts).
//
// The board is wood, velvet or linen (../threads/ground.ts). Every length is a
// fraction of the canvas short side; the square composition is centred on a
// ground that fills any canvas.

import type { Rng } from '../random'
import type { Frame, FrameKind } from '../threads/frames'
import type { GroundColors } from '../threads/ground'
import type { Series } from '../types'
import { pick, range, stream, weighted } from '../random'
import { buildFrame } from '../threads/frames'
import { greedyPath, makeTarget } from '../threads/greedy'
import { paintGround } from '../threads/ground'

// ---------------------------------------------------------------------------
// Rarity table — decided before the drawing code, never reordered.
// Changing a weight or an order re-rolls the whole edition.
// ---------------------------------------------------------------------------

const TRAITS = {
  Frame: [['Circle', 35], ['Square', 20], ['Polygon', 25], ['Twin rings', 20]],
  Pattern: [['Times table', 30], ['Curve stitch', 25], ['Layered', 20], ['Greedy image', 25]],
  Palette: [['Birch', 24], ['Walnut', 22], ['Midnight velvet', 20], ['Linen', 18], ['Oxblood velvet', 16]],
  Nails: [['Sparse', 25], ['Regular', 50], ['Dense', 25]],
} as const satisfies Record<string, ReadonlyArray<readonly [string, number]>>

type TraitName = keyof typeof TRAITS
type Features = { [K in TraitName]: typeof TRAITS[K][number][0] }

/** Pure function of the hash, computed before (and without) any rendering. */
function features(hash: string): Features {
  const r = stream(hash, 'features')
  return {
    Frame: weighted(r, TRAITS.Frame),
    Pattern: weighted(r, TRAITS.Pattern),
    Palette: weighted(r, TRAITS.Palette),
    Nails: weighted(r, TRAITS.Nails),
  }
}

interface Palette {
  ground: GroundColors
  /** Main thread first, then the second and third reels. */
  threads: readonly [string, string, string]
  nail: string
  nailLight: string
  dark: boolean
}

const PAL: Record<Features['Palette'], Palette> = {
  'Birch': {
    ground: { kind: 'wood', base: '#dcc39a', dark: '#a37f4d', light: '#efdfc0' },
    threads: ['#211c18', '#a8262f', '#284870'],
    nail: '#4a4a4e',
    nailLight: '#d2d2d6',
    dark: false,
  },
  'Walnut': {
    ground: { kind: 'wood', base: '#4b301f', dark: '#22140b', light: '#6e4c33' },
    threads: ['#f3ead6', '#e2ae52', '#cf774c'],
    nail: '#9b7a3a',
    nailLight: '#f5dfa0',
    dark: true,
  },
  'Midnight velvet': {
    ground: { kind: 'velvet', base: '#0f1629', dark: '#05080f', light: '#2c4170' },
    threads: ['#e6ecf5', '#79c9de', '#e891b3'],
    nail: '#8a94a5',
    nailLight: '#f2f5fb',
    dark: true,
  },
  'Linen': {
    ground: { kind: 'linen', base: '#ece4d2', dark: '#b3a486', light: '#fbf8f0' },
    threads: ['#1d3160', '#ad402f', '#c4932f'],
    nail: '#2e2b28',
    nailLight: '#aaa49b',
    dark: false,
  },
  'Oxblood velvet': {
    ground: { kind: 'velvet', base: '#3b0e16', dark: '#190407', light: '#7a2433' },
    threads: ['#eebf63', '#f6e8cb', '#d68d54'],
    nail: '#a5833c',
    nailLight: '#f7e3a6',
    dark: true,
  },
}

/** Perimeter nails: the modular patterns want counts divisible by 2, 3, 4, 5 and 6. */
const PLAIN_NAILS: Record<Features['Nails'], number> = { Sparse: 120, Regular: 240, Dense: 360 }
/** The greedy search scales with nails², so it gets fewer. */
const GREEDY_NAILS: Record<Features['Nails'], number> = { Sparse: 130, Regular: 170, Dense: 210 }
const GREEDY_THREADS: Record<Features['Nails'], number> = { Sparse: 1400, Regular: 2000, Dense: 2500 }
/** Nail head radius, in canvas short sides. */
const NAIL_SIZE: Record<Features['Nails'], number> = { Sparse: 0.0042, Regular: 0.0032, Dense: 0.0024 }
/** Thread width of the modular patterns, in canvas short sides. */
const THREAD_WIDTH: Record<Features['Nails'], number> = { Sparse: 0.0021, Regular: 0.0015, Dense: 0.0011 }

/** Radius of the frame (frame unit 1), in canvas short sides. */
const FRAME_R = 0.42

interface Layer {
  a: number[]
  b: number[]
  from: string
  to: string
  alpha: number
  width: number
}

const SMALL_K = [2, 3, 4, 5, 6, 7, 8, 9] as const

/**
 * Times-table multiplier. Always three draws. Besides the small k (an
 * epicycloid with k − 1 cusps), three families read well on a ring of n nails:
 * k = n/m + 1 draws m chords of fixed length, rings of envelopes;
 * k = n/m + 2 folds m cardioids into a rosette; k = n/2 − 1 weaves a lattice.
 * On straight frames the families turn into hatching or a mesh, and so does
 * a larger small k, so those frames keep to k = 2 to 5.
 */
function multiplier(r: Rng, n: number, straight: boolean): number {
  const u = r()
  const v = r()
  r()
  if (straight)
    return 2 + Math.floor(v * 4)
  if (u < 0.6)
    return SMALL_K[Math.floor(v * SMALL_K.length)]
  if (u < 0.75)
    return n / (3 + Math.floor(v * 4)) + 1
  if (u < 0.95)
    return n / (2 + Math.floor(v * 3)) + 2
  return n / 2 - 1
}

function timesTable(f: Frame, k: number, c: number): [number[], number[]] {
  const a: number[] = []
  const b: number[] = []
  const n = f.outer
  for (let i = 0; i < n; i++) {
    const j = (k * i + c) % n
    if (j !== i) {
      a.push(i)
      b.push(j)
    }
  }
  return [a, b]
}

/** Outer nail i to inner nail k·i + c (twin rings). */
function ringToRing(f: Frame, k: number, c: number): [number[], number[]] {
  const a: number[] = []
  const b: number[] = []
  for (let i = 0; i < f.outer; i++) {
    a.push(i)
    b.push(f.outer + ((Math.round(i * k * f.inner / f.outer) + c) % f.inner + f.inner) % f.inner)
  }
  return [a, b]
}

function stitch(f: Frame, step: (i: number) => number): [number[], number[]] {
  const a: number[] = []
  const b: number[] = []
  const n = f.outer
  for (let i = 0; i < n; i++) {
    const j = ((i + Math.round(step(i))) % n + n) % n
    if (j !== i) {
      a.push(i)
      b.push(j)
    }
  }
  return [a, b]
}

function buildLayers(f: Features, frame: Frame, pr: Rng, cr: Rng, pal: Palette): Layer[] {
  const n = frame.outer
  const w = THREAD_WIDTH[f.Nails]
  const t = pal.threads
  if (f.Pattern === 'Times table') {
    const k = multiplier(pr, n, frame.sides > 0)
    const gradient = cr() < 0.5
    const [a, b] = timesTable(frame, k, 0)
    const layers: Layer[] = [{ a, b, from: t[0], to: gradient ? t[1] : t[0], alpha: 0.85, width: w }]
    if (frame.inner) {
      // the inner ring holds a twisted drum of threads from the outer one
      const [c, d] = ringToRing(frame, 1, Math.round(frame.inner * range(pr, 0.18, 0.38)))
      layers.unshift({ a: c, b: d, from: t[1], to: t[1], alpha: 0.7, width: w })
    }
    return layers
  }
  if (f.Pattern === 'Layered') {
    const count = pr() < 0.6 ? 2 : 3
    // straight frames keep to the low multipliers and to turns by whole sides
    const ks = frame.sides ? [2, 3, 4] : [2, 3, 4, 5, 6]
    const layers: Layer[] = []
    for (let q = 0; q < count; q++) {
      const k = ks.splice(Math.floor(pr() * ks.length), 1)[0]
      // turning the figure by s nails maps the chord (i, k·i) to (i + s, k·i + s)
      const s = frame.sides ? Math.floor(pr() * frame.sides) * frame.perSide : Math.floor(pr() * n)
      const c = ((-(k - 1) * s) % n + n) % n
      const [a, b] = frame.inner && q === count - 1 ? ringToRing(frame, 1, Math.round(frame.inner * range(pr, 0.2, 0.4))) : timesTable(frame, k, c)
      layers.push({ a, b, from: t[q], to: t[q], alpha: 0.7, width: w * 0.9 })
    }
    return layers
  }
  if (f.Pattern === 'Curve stitch') {
    const passes = 1 + Math.floor(pr() * 3)
    const layers: Layer[] = []
    let freq = 2
    for (let q = 0; q < passes; q++) {
      const u = pr()
      const v = pr()
      const x = pr()
      const y = pr()
      let ab: [number[], number[]]
      if (frame.inner) {
        // a twisted drum: outer to inner, the twist reversed on every pass
        const d = Math.round(frame.inner * (0.12 + u * 0.3)) * (q % 2 ? -1 : 1)
        ab = ringToRing(frame, 1, d)
      }
      else if (frame.sides) {
        // a step of s sides: parabolas in the corners (s = 1) or a star of envelopes
        const s = pick(pr, [1, 1, 0.5, 1.5, 2, 0.75]) % (frame.sides / 2)
        // half a side on an octagon only hugs the rim
        const d = Math.max(2, Math.round(frame.perSide * Math.max(s || 1, frame.sides >= 6 ? 0.75 : 0)))
        const amp = v < 0.3 ? frame.perSide * 0.25 * x : 0
        const freq = frame.sides * (1 + Math.floor(y * 2))
        ab = stitch(frame, i => d + amp * Math.sin(Math.PI * 2 * freq * i / n))
      }
      else {
        // every pass keeps the symmetry of the first, so the caustics nest
        const d0 = n * (0.22 + u * 0.24)
        const amp = n * (0.03 + v * 0.07)
        if (q === 0)
          freq = 2 + Math.floor(x * 5)
        const ph = q === 0 ? y * Math.PI * 2 : Math.PI / freq * q
        ab = stitch(frame, i => d0 + amp * Math.sin(Math.PI * 2 * freq * i / n + ph))
      }
      layers.push({ a: ab[0], b: ab[1], from: t[q], to: t[q], alpha: passes > 1 ? 0.7 : 0.85, width: w })
    }
    return layers
  }
  // Greedy image: one continuous thread
  const target = makeTarget(pr, pal.dark)
  const seq = greedyPath(frame, target.fn, { grid: 96, threads: GREEDY_THREADS[f.Nails], decrement: 0.032 })
  const a: number[] = []
  const b: number[] = []
  for (let i = 1; i < seq.length; i++) {
    a.push(seq[i - 1])
    b.push(seq[i])
  }
  return [{ a, b, from: t[0], to: t[0], alpha: pal.dark ? 0.5 : 0.55, width: 0.0008 }]
}

function hexMix(p: string, q: string, t: number): string {
  const a = Number.parseInt(p.slice(1), 16)
  const b = Number.parseInt(q.slice(1), 16)
  let out = '#'
  for (const sh of [16, 8, 0]) {
    const x = (a >> sh) & 255
    const y = (b >> sh) & 255
    out += Math.round(x + (y - x) * t).toString(16).padStart(2, '0')
  }
  return out
}

function render(g: CanvasRenderingContext2D, W: number, H: number, hash: string) {
  const f = features(hash)
  const pal = PAL[f.Palette]
  const S = Math.min(W, H)
  const cx = W / 2
  const cy = H / 2
  const R = FRAME_R * S

  // fixed draw order per stream
  const lr = stream(hash, 'layout')
  const polygon = pick(lr, [3, 5, 6, 8])
  const rotation = pick(lr, [-Math.PI / 2, Math.PI / 2, 0, Math.PI])
  const diamond = lr() < 0.2
  const ringRatio = range(lr, 0.3, 0.52)
  const innerShare = range(lr, 0.4, 0.6)
  const greedy = f.Pattern === 'Greedy image'
  const frame = buildFrame({
    kind: f.Frame as FrameKind,
    // the greedy search grows with nails², so the twin rings share the budget
    count: greedy ? Math.round(GREEDY_NAILS[f.Nails] * (f.Frame === 'Twin rings' ? 0.7 : 1)) : PLAIN_NAILS[f.Nails],
    polygon,
    rotation,
    diamond,
    ringRatio,
    innerShare,
  })

  const gr = stream(hash, 'ground')
  paintGround(g, W, H, pal.ground, Math.floor(gr() * 4294967296) >>> 0, pal.dark)

  const layers = buildLayers(f, frame, stream(hash, 'pattern'), stream(hash, 'color'), pal)
  const X = (i: number) => cx + frame.x[i] * R
  const Y = (i: number) => cy + frame.y[i] * R

  // the maker's pencil line through the nails
  g.globalAlpha = pal.dark ? 0.1 : 0.16
  g.strokeStyle = pal.dark ? pal.ground.light : pal.ground.dark
  g.lineWidth = 0.0008 * S
  for (const o of frame.outlines) {
    g.beginPath()
    o.forEach(([x, y], i) => i ? g.lineTo(cx + x * R, cy + y * R) : g.moveTo(cx + x * R, cy + y * R))
    g.closePath()
    g.stroke()
  }

  g.lineCap = 'round'
  // a faint shadow under the threads on light boards
  if (!pal.dark) {
    const ox = 0.0011 * S
    const oy = 0.0016 * S
    g.strokeStyle = '#2a1a0a'
    for (const L of layers) {
      g.globalAlpha = L.alpha * 0.14
      g.lineWidth = L.width * S
      g.beginPath()
      for (let i = 0; i < L.a.length; i++) {
        g.moveTo(X(L.a[i]) + ox, Y(L.a[i]) + oy)
        g.lineTo(X(L.b[i]) + ox, Y(L.b[i]) + oy)
      }
      g.stroke()
    }
  }
  // every thread is stroked on its own so that crossings build up
  for (const L of layers) {
    g.globalAlpha = L.alpha
    g.lineWidth = L.width * S
    const shades = Array.from({ length: 16 }, (_, k) => hexMix(L.from, L.to, k / 15))
    let last = ''
    for (let i = 0; i < L.a.length; i++) {
      const col = shades[Math.round((i / Math.max(1, L.a.length - 1)) * 15)]
      if (col !== last) {
        g.strokeStyle = col
        last = col
      }
      g.beginPath()
      g.moveTo(X(L.a[i]), Y(L.a[i]))
      g.lineTo(X(L.b[i]), Y(L.b[i]))
      g.stroke()
    }
  }

  // nails: shadow, head, glint — one path each
  const nr = NAIL_SIZE[f.Nails] * S
  const total = frame.outer + frame.inner
  const dots = (dx: number, dy: number, rad: number) => {
    g.beginPath()
    for (let i = 0; i < total; i++) {
      g.moveTo(X(i) + dx + rad, Y(i) + dy)
      g.arc(X(i) + dx, Y(i) + dy, rad, 0, Math.PI * 2)
    }
    g.fill()
  }
  g.globalAlpha = pal.dark ? 0.6 : 0.35
  g.fillStyle = '#000'
  dots(nr * 0.45, nr * 0.65, nr * 1.05)
  g.globalAlpha = 1
  g.fillStyle = pal.nail
  dots(0, 0, nr)
  g.globalAlpha = 0.85
  g.fillStyle = pal.nailLight
  dots(-nr * 0.3, -nr * 0.32, nr * 0.38)
  g.globalAlpha = 1
}

export default {
  slug: 'threads',
  title: 'Threads',
  summary: 'String art: threads stretched between nails on circles, squares, polygons and twin rings, in times-table cardioids, curve-stitched envelopes and greedy thread images, on wood, velvet or linen.',
  order: 540,
  traits: TRAITS,
  features,
  render,
  // Seed-of-seeds 0x7a11ead5 ("gallery" stream): the first hash found for each
  // Frame × Pattern pair, in the order found, except that the last one (twin
  // rings layered on midnight velvet) is moved first to serve as the cover.
  gallery: [
    '0xbe3e88fe46daf51ca2c354f00f26dfaa10adb785e8b62ae784acd8aac7a08514',
    '0x73c511debfa24d097e2cfa72a189a632d6d79c2d15761c87734f39188848af8d',
    '0xa0df6ffcd620aae2160f5f02237e0bf4afd0d799a184511145f761092378052a',
    '0x3c5950b42550f7d6be8d8b9b7b9fd7ea6f3dc5536c64a8c897e6a95c37f9686d',
    '0x5f17a63bcb4669dc523c12001a88efcbdda021b2950be1f6a598ca7d727d0828',
    '0x76fd0741ed0dc34f59940da50c6fb165f2a903851ef0fe939c4811fcd19d4aaf',
    '0xe26ee4b709cf0e96fb3343c8782ec1ba351f5f7798bb4e36bb8ae32b237a0db0',
    '0x5129fb03a8f2ad93bea71c67da7896130eff99ced93f9757fc353388eae38dc3',
    '0xf0341ab22b71d4af314f0fe235b30b5b8c83c010d8497a42656d885006cd17dd',
    '0xbacfa005800769ab139854f3a141fc8c26fcf9b68cf9f89863c0803fe3b8116d',
    '0xa4ec4fac68cfe9f4687a6743a8ef830725747a5f7f27ccc871b079fdc341c6c9',
    '0x4ee0c37e80cb2ab4c990dc4fccbb37f3115e3c4f3e87a3e2a107556e043680dc',
  ],
} satisfies Series
