// "Strands" — stippled strands grown by colliding agents.
//
// Agents are seeded in small groups, each group a little circle of walkers
// that burst outwards, spin round or set off side by side. The groups are laid
// on a ring, on concentric rings, on a grid, scattered, or along a spiral arm.
// Every agent walks with a fixed step and steers by its group's rule: a heading
// that sways to and fro, a constant turn that draws circles, a curl that
// tightens into a coil, or a drift along a gentle noise field. At every step
// it leaves a few dots; now and then it forks; and it stops dead when it
// touches any trail already laid (see ../strands/sim.ts). Seen from afar the
// piece reads as interlaced loops, waves or confetti; up close it is a few
// hundred thousand dots, shaded like little cords lit from the top left.
//
// Everything is a pure function of the hash, every length is a fraction of
// the canvas short side. Grid and scattered layouts fill the whole canvas, so
// a wider or taller canvas is a larger field; centred layouts grow inside a
// disc, centred on the canvas.

import type { Rng } from '../random'
import type { RGB } from '../strands/raster'
import type { Seed, Steering, SteerKind } from '../strands/sim'
import type { Series } from '../types'
import { int, pick, range, stream, weighted } from '../random'
import { dot, hexRgb, mix, paintGround } from '../strands/raster'
import { grow, makeNoise } from '../strands/sim'

// ---------------------------------------------------------------------------
// Rarity table — decided before the drawing code, never reordered.
// ---------------------------------------------------------------------------

const TRAITS = {
  Layout: [['Ring', 24], ['Concentric', 20], ['Grid', 22], ['Scatter', 20], ['Spiral arm', 14]],
  Steering: [['Sway', 28], ['Turn', 24], ['Curl', 20], ['Drift', 16], ['Mixed', 12]],
  Palette: [['Tide', 22], ['Lagoon', 18], ['Kiln', 18], ['Saffron', 14], ['Night', 16], ['Moss', 12]],
  Density: [['Airy', 25], ['Woven', 50], ['Packed', 25]],
  Grain: [['Fine', 30], ['Ribbon', 45], ['Beaded', 25]],
} as const

type TraitName = keyof typeof TRAITS
type Features = { [K in TraitName]: typeof TRAITS[K][number][0] }

function features(hash: string): Features {
  const r = stream(hash, 'features')
  return {
    Layout: weighted(r, TRAITS.Layout),
    Steering: weighted(r, TRAITS.Steering),
    Palette: weighted(r, TRAITS.Palette),
    Density: weighted(r, TRAITS.Density),
    Grain: weighted(r, TRAITS.Grain),
  }
}

// ---------------------------------------------------------------------------
// Palettes: a ground and three inks (the first is the most common).
// ---------------------------------------------------------------------------

interface Palette {
  bg: string
  inks: readonly [string, string, string]
  dark: boolean
}

const PAL: Record<Features['Palette'], Palette> = {
  Tide: { bg: '#efe8da', inks: ['#1f2c55', '#e2725b', '#6f86a6'], dark: false },
  Lagoon: { bg: '#0f5757', inks: ['#f2eee2', '#9ad0c2', '#eeaa55'], dark: true },
  Kiln: { bg: '#b23f2c', inks: ['#f7efe2', '#f3c49b', '#3a1d17'], dark: true },
  Saffron: { bg: '#e3952b', inks: ['#fffaf0', '#4e1c36', '#f7dcae'], dark: true },
  Night: { bg: '#0e1120', inks: ['#ece6d4', '#7d9fd8', '#d98a6c'], dark: true },
  Moss: { bg: '#e4e2cf', inks: ['#2c3a28', '#b85c2c', '#7f8f52'], dark: false },
}

const INK_WEIGHTS = [[0, 50], [1, 32], [2, 18]] as const

// Agents per group, fork probability per step and deepest fork.
const DENSITY: Record<Features['Density'], { agents: readonly [number, number], branch: number, maxGen: number }> = {
  Airy: { agents: [6, 10], branch: 0.004, maxGen: 3 },
  Woven: { agents: [10, 16], branch: 0.008, maxGen: 5 },
  Packed: { agents: [10, 18], branch: 0.012, maxGen: 7 },
}

// Occupancy cell, dots per step (per pearl when beaded), half-width of a
// strand, radius of one speck and of a pearl.
const GRAIN: Record<Features['Grain'], { cell: number, dots: number, half: number, speck: number, bead: number }> = {
  Fine: { cell: 0.0055, dots: 9, half: 0.0011, speck: 0.0007, bead: 0 },
  Ribbon: { cell: 0.0095, dots: 30, half: 0.0042, speck: 0.00062, bead: 0 },
  Beaded: { cell: 0.0075, dots: 30, half: 0.0004, speck: 0.0006, bead: 0.0029 },
}

const TAU = Math.PI * 2

// ---------------------------------------------------------------------------
// Group layouts, in short-side units over the domain [0, aw] x [0, ah].
// ---------------------------------------------------------------------------

interface Centre { x: number, y: number }

function scatter(r: Rng, out: Centre[], count: number, minD: number, x0: number, y0: number, x1: number, y1: number) {
  let placed = 0
  for (let t = 0; t < count * 40 && placed < count; t++) {
    const x = range(r, x0, x1)
    const y = range(r, y0, y1)
    let ok = true
    for (const c of out) {
      if ((c.x - x) ** 2 + (c.y - y) ** 2 < minD * minD) {
        ok = false
        break
      }
    }
    if (ok) {
      out.push({ x, y })
      placed++
    }
  }
}

function layout(r: Rng, kind: Features['Layout'], aw: number, ah: number): Centre[] {
  const cx = aw / 2
  const cy = ah / 2
  const out: Centre[] = []
  const m = 0.1
  switch (kind) {
    case 'Ring': {
      const n = int(r, 7, 12)
      const R = range(r, 0.26, 0.34)
      const a0 = r() * TAU
      for (let i = 0; i < n; i++)
        out.push({ x: cx + Math.cos(a0 + i * TAU / n) * R, y: cy + Math.sin(a0 + i * TAU / n) * R })
      if (r() < 0.5)
        out.push({ x: cx, y: cy })
      break
    }
    case 'Concentric': {
      const rings = int(r, 2, 3)
      const gap = range(r, 0.12, 0.18)
      const a0 = r() * TAU
      out.push({ x: cx, y: cy })
      for (let k = 1; k <= rings; k++) {
        const R = Math.min(0.4, k * 0.38 / rings)
        const n = Math.max(3, Math.round(TAU * R / gap))
        const off = a0 + (k % 2) * Math.PI / n
        for (let i = 0; i < n; i++)
          out.push({ x: cx + Math.cos(off + i * TAU / n) * R, y: cy + Math.sin(off + i * TAU / n) * R })
      }
      break
    }
    case 'Grid': {
      const sp = range(r, 0.2, 0.3)
      const cols = Math.max(1, Math.floor((aw - 2 * m) / sp) + 1)
      const rows = Math.max(1, Math.floor((ah - 2 * m) / sp) + 1)
      const ox = cx - (cols - 1) * sp / 2
      const oy = cy - (rows - 1) * sp / 2
      const jit = range(r, 0, 0.14) * sp
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++)
          out.push({ x: ox + i * sp + (r() - 0.5) * 2 * jit, y: oy + j * sp + (r() - 0.5) * 2 * jit })
      }
      break
    }
    case 'Scatter': {
      const count = Math.round(aw * ah * range(r, 9, 15))
      scatter(r, out, count, 0.11, m, m, aw - m, ah - m)
      break
    }
    case 'Spiral arm': {
      const arms = r() < 0.35 ? 2 : 1
      const turns = range(r, 1.1, 1.75) * TAU
      const hand = r() < 0.5 ? -1 : 1
      const a0 = r() * TAU
      const gap = range(r, 0.08, 0.11)
      for (let k = 0; k < arms; k++) {
        let th = 0.6
        while (th < turns) {
          const R = 0.03 + 0.38 * th / turns
          const a = a0 + k * Math.PI + hand * th
          out.push({ x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R })
          th += gap / Math.max(R, 0.06)
        }
      }
      break
    }
  }
  return out
}

function steering(r: Rng, kind: SteerKind): Steering {
  const phase = r() * TAU
  const sign = r() < 0.5 ? -1 : 1
  switch (kind) {
    case 'Sway':
      return { kind, amp: range(r, 0.25, 0.7), freq: TAU / range(r, 0.1, 0.3), kappa: range(r, 0, 2.5), growth: 0, rate: 0, phase, sign }
    case 'Turn':
      return { kind, amp: 0, freq: 0, kappa: 1 / range(r, 0.07, 0.3), growth: 0, rate: 0, phase, sign }
    case 'Curl':
      return { kind, amp: 0, freq: 0, kappa: 1 / range(r, 0.12, 0.3), growth: range(r, 3, 9), rate: 0, phase, sign }
    case 'Drift':
      return { kind, amp: 0, freq: 0, kappa: range(r, 0, 1.5), growth: 0, rate: range(r, 0.04, 0.12), phase, sign }
  }
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function render(g: CanvasRenderingContext2D, W: number, H: number, hash: string) {
  const f = features(hash)
  const P = PAL[f.Palette]
  const D = DENSITY[f.Density]
  const G = GRAIN[f.Grain]
  const S = Math.min(W, H)
  const aw = W / S
  const ah = H / S

  // Fixed stream order: layout, groups, field, sim, then dots.
  const lr = stream(hash, 'layout')
  const gr = stream(hash, 'groups')
  const nr = stream(hash, 'field')
  const sr = stream(hash, 'sim')
  const dr = stream(hash, 'dots')

  // centred layouts grow inside a disc; grid and scatter fill the whole canvas
  const round = f.Layout === 'Ring' || f.Layout === 'Concentric' || f.Layout === 'Spiral arm'
  const centres = layout(lr, f.Layout, aw, ah)
  const kinds: readonly SteerKind[] = ['Sway', 'Turn', 'Curl', 'Drift']
  const shared = f.Steering === 'Mixed' ? null : f.Steering
  const groups: Steering[] = []
  const inkOf: number[] = []
  const widthOf: number[] = []
  const seeds: Seed[] = []
  for (let gi = 0; gi < centres.length; gi++) {
    const c = centres[gi]
    groups.push(steering(gr, shared ?? pick(gr, kinds)))
    inkOf.push(weighted(gr, INK_WEIGHTS))
    widthOf.push(range(gr, 0.8, 1.25))
    const n = int(gr, D.agents[0], D.agents[1])
    const mode = gr()
    // a burst starts from a tight knot, a spin from a wider ring it then traces
    const rg = mode < 0.5 ? Math.max(range(gr, 0.01, 0.03), n * 0.003) : Math.max(range(gr, 0.04, 0.1), n * 0.004)
    const flow = gr() * TAU
    const a0 = gr() * TAU
    const spin = gr() < 0.5 ? -1 : 1
    for (let k = 0; k < n; k++) {
      const a = a0 + k * TAU / n
      let heading: number
      if (mode < 0.5)
        heading = a + (gr() - 0.5) * 0.3
      else if (mode < 0.8)
        heading = a + spin * Math.PI / 2 + (gr() - 0.5) * 0.3
      else
        heading = flow + (gr() - 0.5) * 0.5
      seeds.push({ x: c.x + Math.cos(a) * rg, y: c.y + Math.sin(a) * rg, heading, group: gi })
    }
  }

  const n1 = makeNoise(nr)
  // Drift follows the contour lines of a noise relief (its gradient turned a
  // quarter turn): a divergence-free flow, so strands neither bunch nor part.
  const fs = range(nr, 1.6, 3.2)
  const fsign = nr() < 0.5 ? -1 : 1
  const e = 0.01
  const relief = (x: number, y: number) => n1(x * fs + 5.3, y * fs + 9.1) + 0.35 * n1(x * fs * 2.3 + 1.7, y * fs * 2.3 + 3.3)
  const field = (x: number, y: number) => {
    const gx = relief(x + e, y) - relief(x - e, y)
    const gy = relief(x, y + e) - relief(x, y - e)
    return Math.atan2(gx * fsign, -gy * fsign)
  }

  const area = aw * ah
  const step = G.cell * 0.42
  const strands = grow(seeds, groups, {
    aw,
    ah,
    margin: 0.045,
    disc: round ? 0.46 : 0,
    cell: G.cell,
    step,
    branch: D.branch,
    maxGen: D.maxGen,
    maxSteps: Math.round(area * 160000),
    maxAgents: Math.round(area * 6000),
    field,
  }, sr)

  // ---- ground --------------------------------------------------------------
  const img = g.createImageData(W, H)
  const d = img.data
  const bg = hexRgb(P.bg)
  paintGround(d, W, H, S, bg, P.dark ? 7 : 10, P.dark ? 0.32 : 0.16, 0x5714A2D5)

  // ---- strands -------------------------------------------------------------
  const dark = mix(bg, [0, 0, 0], 0.62)
  const white: RGB = [255, 255, 255]
  const tones = P.inks.map((h) => {
    const ink = hexRgb(h)
    return { ink, shade: mix(ink, dark, 0.42), hi: mix(ink, white, 0.45) }
  })
  const lx = -0.6
  const ly = -0.8
  // two tones and a highlight: shade away from the light, highlight towards it
  const tone = (T: typeof tones[number], s: number) => {
    if (s > 0.38)
      return T.hi
    if (s < -0.22)
      return T.shade
    return T.ink
  }
  const alpha = 0.92
  const beadGap = Math.max(1, Math.round(G.bead * 2.2 / step))
  const shadowA = P.dark ? 0.16 : 0.07
  for (const st of strands) {
    const T = tones[inkOf[st.group]]
    const gf = Math.max(0.5, 0.84 ** st.gen) * widthOf[st.group]
    const n = st.n
    const p = st.pts
    for (let i = 0; i < n; i++) {
      const x = p[i * 3]
      const y = p[i * 3 + 1]
      const h = p[i * 3 + 2]
      const t = n > 1 ? i / (n - 1) : 0
      const taper = Math.min(1, (i + 2) / 8) * (1 - 0.45 * t * t) * gf
      if (f.Grain === 'Beaded') {
        // a stippled pearl every few steps, lit from the top left
        if (i % beadGap !== 0)
          continue
        const R = G.bead * taper * (0.8 + 0.4 * dr())
        const bx = x + (dr() - 0.5) * G.half
        const by = y + (dr() - 0.5) * G.half
        dot(d, W, H, (bx - lx * R * 0.35) * S, (by - ly * R * 0.35) * S, R * 1.1 * S, dark, shadowA)
        for (let k = 0; k < G.dots; k++) {
          const u = Math.sqrt(dr()) * R
          const a = dr() * TAU
          const ox = Math.cos(a) * u
          const oy = Math.sin(a) * u
          const s = ((ox * lx + oy * ly) / R) * 1.2 + (dr() - 0.5) * 0.6
          dot(d, W, H, (bx + ox) * S, (by + oy) * S, G.speck * (0.7 + 0.6 * dr()) * S, tone(T, s), alpha)
        }
        continue
      }
      const nx = -Math.sin(h)
      const ny = Math.cos(h)
      const ndl = nx * lx + ny * ly
      const hw = G.half * taper
      if (f.Grain === 'Ribbon' && (i & 1) === 0) {
        // cast shadow, away from the light
        dot(d, W, H, (x - lx * G.half * 0.9) * S, (y - ly * G.half * 0.9) * S, hw * 1.1 * S, dark, shadowA)
      }
      for (let k = 0; k < G.dots; k++) {
        const o = (dr() * 2 - 1) * hw
        const al = (dr() - 0.5) * step
        const s = (o / (hw + 1e-9)) * ndl + (dr() - 0.5) * 0.55
        const rad = G.speck * (0.7 + 0.6 * dr()) * (0.6 + 0.4 * taper) * S
        dot(d, W, H, (x + nx * o + ny * al) * S, (y + ny * o - nx * al) * S, rad, tone(T, s), alpha)
      }
    }
  }
  g.putImageData(img, 0, 0)
}

export default {
  slug: 'strands',
  title: 'Strands',
  summary: 'Stippled strands grown by agents seeded in groups on rings, grids and spirals: they sway, turn and curl, fork, and stop where they touch another trail.',
  order: 690,
  traits: TRAITS,
  features,
  render,
  // Seed-of-seeds 0x57a4d500 ("gallery" stream, 64-hex candidates): the first
  // hash found for each layout x steering pair, in the order found, skipping
  // three weak pieces (a washed-out ring, a lopsided scatter, a muddled
  // spiral). The first one, scattered curls in ink and coral, is the cover.
  gallery: [
    '0x7795a3c4d112bd0453adc3c20b010ff7a79cf973887bc62ad8847ae4ce700fb0',
    '0xd92e9fa228640f00812842cf2c5a1cd547657b90825973b2e4cca80adfff98dd',
    '0x1e852c6d2ab2cc4921f47605dbf5b304c96bd42585d6187446f545b9beaaa638',
    '0x726f06f24c4c388cacacdbb5fd835edd99cccb610b0e4af8b841f12f82e886bc',
    '0x7364868036fb6b64e572d8c5ead7714ad13a9dafd7555d120b0c1dc5c4f5ea3d',
    '0x87dae72139b0b4ec80516f7bfc52f2fe13eb7b3face24efe1c53f229221f526f',
    '0xf3bf9096fc2120f9aa975649e2e20964bc66c7dd5bec086ca0cc1bc153186202',
    '0xbe9175e03a8121366e98f3f30370f6350a770d65fbd6ab0d0f94c8860034554d',
    '0x4bfe4a81ae1ef099e4aebd04b15c193320b9ba3a64221a612ac1f505b777bf2b',
    '0xf9a41c6eaea17a3f988b0e97103e969580531861c4157a0e34ac257abb172759',
    '0xd20dea44e8779b730af8c8ce52bcd64a98513d577aed4bb9954cd895be489dc9',
    '0xf28957b5047d1b1626637f3a833d1a037e6f85b2cc0c226a0a885322b1a428d8',
  ],
} satisfies Series
