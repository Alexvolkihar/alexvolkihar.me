// "Ramify" — an architecture of hatched ribbons grown by colliding agents.
//
// Wide agents leave a seed structure (a void circle, a plinth, a frame or a
// few hubs), walk straight or under a gentle local rule, sprout narrower
// children at a birth angle and die as soon as their front would come within
// a gap of another ribbon (after Jared Tarbell's Substrate, 2003). Each
// ribbon is then drawn as an opaque body with an ink outline and interior
// hatching, cross-hatching or stipple, deepest branches first so that every
// child tucks under its parent like a beam into a column.
//
// Everything is a pure function of the hash; the growth runs in short-side
// units, so the same hash gives the same piece at any size.

import type { Disc, GrowParams, Ribbon, Rule } from '../ramify/grow'
import type { Rng } from '../random'
import type { Series } from '../types'
import { hatch, outline, stipple, tracePolygon } from '../ramify/draw'
import { World } from '../ramify/grow'
import { int, pick, range, stream, weighted } from '../random'

// Rarity table, decided before the drawing code. Never reorder: it re-rolls the edition.
const TRAITS = {
  Palette: [['Chalk', 28], ['Lagoon', 24], ['Kiln', 18], ['Graphite', 16], ['Indigo', 14]],
  Layout: [['Void', 30], ['Colonnade', 25], ['Frame', 20], ['Hubs', 25]],
  Rule: [['Straight', 35], ['Drift', 30], ['Arches', 20], ['Orbit', 15]],
  Hatching: [['Parallel', 40], ['Cross', 30], ['Stipple', 15], ['Mixed', 15]],
  Branching: [['Square', 35], ['Oblique', 40], ['Splay', 25]],
} as const

type TraitName = keyof typeof TRAITS
type Features = { [K in TraitName]: typeof TRAITS[K][number][0] }

function features(hash: string): Features {
  const r = stream(hash, 'features')
  return {
    Palette: weighted(r, TRAITS.Palette),
    Layout: weighted(r, TRAITS.Layout),
    Rule: weighted(r, TRAITS.Rule),
    Hatching: weighted(r, TRAITS.Hatching),
    Branching: weighted(r, TRAITS.Branching),
  }
}

interface Palette {
  bg: string
  /** Ribbon bodies and the void. */
  paper: string
  ink: string
  hatch: string
  accent: string
  accent2: string
  grain: string
}

const PAL: Record<Features['Palette'], Palette> = {
  Chalk: { bg: '#f2efe7', paper: '#fbfaf5', ink: '#2a2b2d', hatch: '#3b3c3f', accent: '#d2412b', accent2: '#ec8a37', grain: '#a9a293' },
  Lagoon: { bg: '#edebe2', paper: '#f9f8f2', ink: '#163c42', hatch: '#245f63', accent: '#e4672c', accent2: '#f0b13c', grain: '#a7ada2' },
  Kiln: { bg: '#e2703a', paper: '#f6efe2', ink: '#2a2320', hatch: '#2f2724', accent: '#1d5059', accent2: '#c7322a', grain: '#9c4219' },
  Graphite: { bg: '#18191c', paper: '#232529', ink: '#e8e3d7', hatch: '#cdc7ba', accent: '#e4532d', accent2: '#4a9a95', grain: '#4a4c52' },
  Indigo: { bg: '#ebe4d3', paper: '#f7f2e7', ink: '#21305b', hatch: '#2d3f72', accent: '#d8961c', accent2: '#b8432a', grain: '#b3a68b' },
}

// Birth angle quantum: Square and Oblique keep every heading on a lattice of
// multiples of one angle (chosen per piece), Splay draws a fresh angle per child.
function birthQuantum(b: Features['Branching'], lr: Rng) {
  if (b === 'Square')
    return Math.PI / 2
  if (b === 'Oblique')
    return lr() < 0.5 ? Math.PI / 4 : Math.PI / 3
  return 0
}

const MARGIN = 0.045

interface Built {
  world: World
  /** The void circle, if any (drawn on top of the roots). */
  voids: Disc[]
  /** Hubs: small discs the roots leave from. */
  hubs: Disc[]
}

// Seed structure and roots, in short-side units over the domain A x B.
function build(f: Features, A: number, B: number, hash: string): Built {
  const lr = stream(hash, 'layout')
  const ar = stream(hash, 'agents')
  const cx = A / 2
  const cy = B / 2
  const gap = range(lr, 0.0065, 0.0095)
  const w0 = range(lr, 0.05, 0.072)
  const q = birthQuantum(f.Branching, lr)
  // heading jitter of the roots: none to speak of on a lattice
  const jit = q ? 0.012 : 0.15
  const p: GrowParams = {
    A,
    B,
    margin: MARGIN,
    gap,
    rule: f.Rule as Rule,
    maxLevel: int(lr, 2, 4),
    ratio: range(lr, 0.5, 0.64),
    wMin: 0.007,
    angle: q ? () => q : r => range(r, 0.45, 1.5),
    drift: { cx, cy, nx: 0, ny: 0, rate: 0 },
    orbit: { cx, cy, k: 0 },
  }
  const da = lr() * Math.PI * 2
  p.drift.nx = Math.cos(da)
  p.drift.ny = Math.sin(da)
  p.drift.rate = (lr() < 0.5 ? -1 : 1) * range(lr, 1.6, 3.2)
  p.orbit.k = (lr() < 0.5 ? -1 : 1) * range(lr, 0.55, 0.9)

  const world = new World(p, ar)
  const voids: Disc[] = []
  const hubs: Disc[] = []
  const root = (parent: number, x: number, y: number, a: number, w: number, grace: number) =>
    world.spawn(parent, 0, x, y, a, w, grace, grace + 0.04)

  switch (f.Layout) {
    case 'Void': {
      const R = range(lr, 0.17, 0.25)
      const d = world.addDisc(cx, cy, R)
      voids.push(d)
      const n = int(lr, 5, 9)
      const a0 = lr() * Math.PI * 2
      const tilt = range(lr, -0.6, 0.6)
      for (let i = 0; i < n; i++) {
        const t = a0 + (i + range(lr, -0.25, 0.25)) * Math.PI * 2 / n
        const w = w0 * range(lr, 0.75, 1.1)
        const x = cx + Math.cos(t) * (R - w * 0.3)
        const y = cy + Math.sin(t) * (R - w * 0.3)
        root(d.id, x, y, t + tilt + range(lr, -0.25, 0.25), w, w + 3 * gap)
      }
      break
    }
    case 'Colonnade': {
      const ph = range(lr, 0.028, 0.04)
      const yb = B - MARGIN - ph / 2
      const bar = world.addBar(MARGIN, yb, A - MARGIN, yb, ph)
      const span = A - 2 * MARGIN
      const n = Math.max(2, Math.round(span / range(lr, 0.17, 0.26)))
      for (let i = 0; i < n; i++) {
        const x = MARGIN + span * (i + 0.5 + range(lr, -0.22, 0.22)) / n
        const w = w0 * range(lr, 0.7, 1.05)
        root(bar.id, x, yb - ph * 0.3, -Math.PI / 2 + range(lr, -jit, jit), w, ph + 2 * gap)
      }
      break
    }
    case 'Frame': {
      const fw = range(lr, 0.024, 0.034)
      const m = MARGIN + fw / 2
      const sides = [
        world.addBar(m - fw / 2, m, A - m + fw / 2, m, fw),
        world.addBar(A - m, m + fw / 2, A - m, B - m - fw / 2, fw),
        world.addBar(A - m + fw / 2, B - m, m - fw / 2, B - m, fw),
        world.addBar(m, B - m - fw / 2, m, m + fw / 2, fw),
      ]
      // roots leave the inner edge of each side, pointing inwards
      const per = range(lr, 0.3, 0.45)
      for (const s of sides) {
        const x0 = s.xs[0]
        const y0 = s.ys[0]
        const len = Math.hypot(s.xs[1] - x0, s.ys[1] - y0)
        const h = s.hs[0]
        const k = Math.max(1, Math.round(len / per))
        for (let i = 0; i < k; i++) {
          const u = (i + 0.5 + range(lr, -0.3, 0.3)) / k * len
          const x = x0 + Math.cos(h) * u - Math.sin(h) * fw * 0.3
          const y = y0 + Math.sin(h) * u + Math.cos(h) * fw * 0.3
          const w = w0 * range(lr, 0.65, 1)
          root(s.id, x, y, h + Math.PI / 2 + range(lr, -jit, jit), w, fw + 2 * gap)
        }
      }
      break
    }
    case 'Hubs': {
      const lat = lr() * Math.PI
      const n = Math.max(2, Math.round(int(lr, 3, 5) * Math.sqrt(A * B)))
      const pts: number[] = []
      for (let i = 0; i < n; i++) {
        let x = 0
        let y = 0
        let ok = false
        for (let t = 0; t < 30 && !ok; t++) {
          x = range(lr, 0.2, A - 0.2)
          y = range(lr, 0.2, B - 0.2)
          ok = true
          for (let j = 0; j < pts.length; j += 2) {
            if (Math.hypot(pts[j] - x, pts[j + 1] - y) < 0.27)
              ok = false
          }
        }
        if (!ok)
          continue
        pts.push(x, y)
        const hr = w0 * range(lr, 0.75, 1.05)
        const d = world.addDisc(x, y, hr)
        hubs.push(d)
        const k = int(lr, 3, 4)
        const a0 = lr() * Math.PI * 2
        // on a lattice, the spokes leave at multiples of the quantum from a shared base
        const spoke = q ? Math.max(1, Math.round(Math.PI * 2 / k / q)) * q : Math.PI * 2 / k
        const base = q ? lat : a0
        for (let j = 0; j < k; j++) {
          const t = base + j * spoke + range(lr, -jit, jit) * (q ? 1 : 2)
          const w = w0 * range(lr, 0.6, 0.85)
          root(d.id, x + Math.cos(t) * hr * 0.6, y + Math.sin(t) * hr * 0.6, t, w, hr + w + 3 * gap)
        }
      }
      break
    }
  }

  world.grow(90000)
  world.sprout(Math.round(240 * A * B))
  world.grow(150000)
  return { world, voids, hubs }
}

type Fill = 'paper' | 'accent' | 'accent2' | 'ink' | 'blank'
type Mark = 'parallel' | 'cross' | 'stipple'

function render(g: CanvasRenderingContext2D, W: number, H: number, hash: string) {
  const f = features(hash)
  const pal = PAL[f.Palette]
  const S = Math.min(W, H)
  const A = W / S
  const B = H / S

  g.globalAlpha = 1
  g.fillStyle = pal.bg
  g.fillRect(0, 0, W, H)

  const { world, voids, hubs } = build(f, A, B, hash)

  // fixed stream order: style, ink, grain
  const sr = stream(hash, 'style')
  const ir = stream(hash, 'ink')
  const gr = stream(hash, 'grain')

  const lw = Math.max(0.6, 0.0013 * S)
  const ow = Math.max(0.8, 0.0017 * S)
  const jit = 0.0007 * S
  const baseAngle = sr() * Math.PI

  // deepest branches first, the fixed structure last
  const order = world.ribbons.slice().sort((a, b) => (b.level - a.level) || (a.id - b.id))
  const style = new Map<number, { fill: Fill, mark: Mark | null, ang: number }>()
  for (const rb of world.ribbons) {
    const x = sr()
    let fill: Fill = 'paper'
    if (rb.level < 0)
      fill = 'paper'
    else if (rb.w < 0.011 && x < 0.35)
      fill = 'ink'
    else if (x < 0.07)
      fill = 'accent'
    else if (x < 0.1)
      fill = 'accent2'
    else if (x < 0.17)
      fill = 'blank'
    let mark: Mark | null = null
    if (fill === 'paper' || fill === 'accent' || fill === 'accent2') {
      if (f.Hatching === 'Parallel')
        mark = 'parallel'
      else if (f.Hatching === 'Cross')
        mark = sr() < 0.7 ? 'cross' : 'parallel'
      else if (f.Hatching === 'Stipple')
        mark = sr() < 0.8 ? 'stipple' : 'parallel'
      else
        mark = pick(sr, ['parallel', 'cross', 'stipple'] as const)
    }
    // hatch angle: a few directions shared over the piece, tied to the ribbon heading
    const ang = rb.hs[0] + pick(sr, [Math.PI / 4, -Math.PI / 4, Math.PI / 3, -Math.PI / 3]) + (sr() < 0.25 ? baseAngle : 0)
    style.set(rb.id, { fill, mark, ang })
  }

  const drawRibbon = (rb: Ribbon) => {
    const st = style.get(rb.id)!
    const o = outline(rb, S, 0, 0)
    if (o.lx.length < 2)
      return
    let body = pal.paper
    if (st.fill === 'accent')
      body = pal.accent
    else if (st.fill === 'accent2')
      body = pal.accent2
    else if (st.fill === 'ink')
      body = pal.ink
    g.fillStyle = body
    g.beginPath()
    tracePolygon(g, o)
    g.fill()

    if (st.mark) {
      const sp = Math.min(0.011, Math.max(0.0052, rb.w * 0.17)) * S
      const onAccent = st.fill !== 'paper'
      g.strokeStyle = onAccent ? pal.ink : pal.hatch
      g.fillStyle = g.strokeStyle
      g.globalAlpha = onAccent ? 0.55 : 0.85
      g.lineWidth = lw
      g.beginPath()
      if (st.mark === 'stipple') {
        stipple(g, o, sp * 0.62, lw * 1.3, ir)
        g.fill()
      }
      else {
        hatch(g, o, st.ang, sp, ir(), jit, ir)
        if (st.mark === 'cross')
          hatch(g, o, st.ang + Math.PI / 2, sp * 1.15, ir(), jit, ir)
        g.stroke()
      }
      g.globalAlpha = 1
    }

    g.strokeStyle = pal.ink
    g.lineWidth = ow
    g.lineJoin = 'miter'
    g.beginPath()
    tracePolygon(g, o)
    g.stroke()
  }

  const discOutline = (d: Disc, fill: string) => {
    g.fillStyle = fill
    g.beginPath()
    g.arc(d.x * S, d.y * S, d.r * S, 0, Math.PI * 2)
    g.fill()
    g.strokeStyle = pal.ink
    g.lineWidth = ow
    g.stroke()
  }

  for (const rb of order) {
    if (rb.level >= 0)
      drawRibbon(rb)
  }
  for (const rb of order) {
    if (rb.level < 0)
      drawRibbon(rb)
  }
  for (const d of voids) {
    discOutline(d, pal.paper)
    // an inner ring keeps the void from reading as a hole in the paper
    g.globalAlpha = 0.5
    g.lineWidth = lw
    g.beginPath()
    g.arc(d.x * S, d.y * S, (d.r - 0.012) * S, 0, Math.PI * 2)
    g.stroke()
    g.globalAlpha = 1
  }
  // hubs: a paper pivot with an inner ring and a small solid core
  for (const d of hubs) {
    discOutline(d, pal.paper)
    g.lineWidth = lw
    g.beginPath()
    g.arc(d.x * S, d.y * S, d.r * 0.62 * S, 0, Math.PI * 2)
    g.stroke()
    g.fillStyle = pal.accent
    g.beginPath()
    g.arc(d.x * S, d.y * S, d.r * 0.3 * S, 0, Math.PI * 2)
    g.fill()
    g.lineWidth = ow
    g.stroke()
  }

  // paper grain over the whole canvas, at a fixed density per unit area
  const dots = Math.round(7000 * A * B)
  g.fillStyle = pal.grain
  for (let pass = 0; pass < 3; pass++) {
    g.globalAlpha = 0.12 + pass * 0.06
    g.beginPath()
    for (let i = 0; i < dots / 3; i++) {
      const s = range(gr, 0.0006, 0.0016) * S
      g.rect(gr() * W, gr() * H, s, s)
    }
    g.fill()
  }
  g.globalAlpha = 1
}

export default {
  slug: 'ramify',
  title: 'Ramify',
  summary: 'Wide hatched ribbons that go straight, branch at a fixed angle and stop just short of each other, building columns, arches and rooms around a void, a plinth, a frame or a few hubs.',
  order: 710,
  traits: TRAITS,
  features,
  render,
  // Seed-of-seeds 0x7a41f1ed ("gallery" stream, 64-hex candidates): the first
  // hash found for each Layout x Palette pair, in the order found, skipping one
  // weak piece (a sparse Indigo hub layout), except that the second (a Lagoon
  // colonnade of arches) is moved first to serve as the cover.
  gallery: [
    '0x477d661762250a8ee1a3a342a91e88c554743db38f21c20c5b3a53309ca18411',
    '0xb71d3220c7ff82ee93cc6a299222efcdece53cb23f5d10957f5d2c6a98359984',
    '0x3d3f795e3c2166f96fbf263e47ee46ab8a86182a05657295ffedc495c55d1351',
    '0x043d1f3bfb19326e6bd4f34a3c7726ae85c29ef29036dcda03cd535e6c840922',
    '0xbde947c3a6ac6c1136b085d736a958bda516c88b829355152acbde4929623413',
    '0x0f1340d69d18565a77120040f15948077bb87f5fd3b1c2666f202d444d88ffd4',
    '0x242d5ac81dfcbb63e00c40cac6d138e57e9d71f047c1a40d59a65280695169b1',
    '0xb949b3ce3c2b813de63d73a51a952ae6f784d441d11060ecab8c3f6e0fad540c',
    '0xa0936910277b4521864ec35b0ec599ad1ee36e5afa93964691936e80b68a0435',
    '0xc07c921cca66cb0c6f781175dd605b76843c9ab6522a24211957463d883b79ef',
    '0x73cf70f6ecc073e2112495f52807b56d013d8e8ab5d1ecd96776140afd549f38',
    '0xf225f024415d9d181722afe86bf07b6c4a3507cca302dd48427290bbaabc2472',
  ],
} satisfies Series
