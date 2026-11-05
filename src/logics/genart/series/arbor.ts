// "Arbor" — plants grown by stochastic, parametric, bracketed L-systems.
//
// Each plant is a grammar (a weed, a tree, a fern or an umbellifer, see
// ../arbor/species.ts) rewritten a fixed number of times, then read by a
// turtle that draws tapering branches, bends them with a tropism vector (the
// wind and, for weeping trees, gravity) and turns the last apices into
// leaves, flowers, fruit or buds. The plants are then mounted like herbarium
// specimens: one large sheet, a plate of numbered cells, or a meadow along a
// ground line that runs across the whole canvas.
//
// After Lindenmayer (1968) and Prusinkiewicz & Lindenmayer, "The Algorithmic
// Beauty of Plants" (1990). Everything is a pure function of the hash, and
// every length is a fraction of the canvas short side.

import type { Plant } from '../arbor/lsystem'
import type { Look, Species } from '../arbor/species'
import type { Rng } from '../random'
import type { Series } from '../types'
import { bounds, grow, scale } from '../arbor/lsystem'
import { SPECIES } from '../arbor/species'
import { gaussian, int, pick, range, stream, weighted } from '../random'

// Rarity table, decided before the drawing code. Never reorder: it re-rolls the edition.
const TRAITS = {
  Palette: [['Herbarium', 28], ['Botanica', 24], ['Sumi', 18], ['Cyanotype', 16], ['Nocturne', 14]],
  Flora: [['Herbs', 26], ['Trees', 24], ['Ferns', 16], ['Umbels', 14], ['Mixed', 20]],
  Layout: [['Meadow', 40], ['Plate', 35], ['Specimen', 25]],
  Season: [['Bare', 15], ['Foliage', 40], ['Bloom', 30], ['Fruit', 15]],
  Wind: [['Still', 35], ['Breeze', 45], ['Gale', 20]],
} as const

type TraitName = keyof typeof TRAITS
type Features = { [K in TraitName]: typeof TRAITS[K][number][0] }

function features(hash: string): Features {
  const r = stream(hash, 'features')
  return {
    Palette: weighted(r, TRAITS.Palette),
    Flora: weighted(r, TRAITS.Flora),
    Layout: weighted(r, TRAITS.Layout),
    Season: weighted(r, TRAITS.Season),
    Wind: weighted(r, TRAITS.Wind),
  }
}

interface Palette {
  bg: string
  /** Frames, labels, ground line. */
  ink: string
  grain: string
  ground: string
  /** Thick to thin. */
  stem: readonly [string, string, string]
  /** Three greens and an autumn tone. */
  leaf: readonly [string, string, string, string]
  leafAlpha: number
  petal: readonly [string, string]
  heart: string
  fruit: string
  bud: string
  /** Drop shadow of a pressed specimen, or none on dark paper. */
  shadow: string | null
  /** Mounting tape over the stems. */
  tape: string | null
}

const PAL: Record<Features['Palette'], Palette> = {
  Herbarium: {
    bg: '#ece3cd',
    ink: '#6e5d45',
    grain: '#b9a785',
    ground: '#ddd0b2',
    stem: ['#3b2f1f', '#5a4a2c', '#76713f'],
    leaf: ['#55643a', '#76804a', '#97985e', '#a5672f'],
    leafAlpha: 0.9,
    petal: ['#b4553c', '#d9a24c'],
    heart: '#efe2bf',
    fruit: '#7d2b25',
    bud: '#8a8a52',
    shadow: '#7a6748',
    tape: '#f6f0e1',
  },
  Botanica: {
    bg: '#f5f0e7',
    ink: '#8a8070',
    grain: '#d8cfbf',
    ground: '#e6e3d2',
    stem: ['#47382a', '#5f5838', '#7d9050'],
    leaf: ['#2f6b47', '#5c9a58', '#9cc46e', '#d48a3a'],
    leafAlpha: 0.78,
    petal: ['#e07890', '#f3b6c3'],
    heart: '#f6d77a',
    fruit: '#c23a2f',
    bud: '#9cc46e',
    shadow: '#a39a88',
    tape: null,
  },
  Sumi: {
    bg: '#f2ede1',
    ink: '#3a3631',
    grain: '#cfc6b4',
    ground: '#e5dfd0',
    stem: ['#151412', '#2b2925', '#4f4c46'],
    leaf: ['#23221f', '#3d3b37', '#5e5b55', '#9b3b2c'],
    leafAlpha: 0.82,
    petal: ['#c5312a', '#e3705a'],
    heart: '#f3e2c6',
    fruit: '#c5312a',
    bud: '#4f4c46',
    shadow: null,
    tape: null,
  },
  Cyanotype: {
    bg: '#1c3c6e',
    ink: '#c9d7ec',
    grain: '#2c5288',
    ground: '#234a80',
    stem: ['#f4f7fc', '#e3ebf6', '#cddbef'],
    leaf: ['#eef3fa', '#d6e2f2', '#bfd1ea', '#ffffff'],
    leafAlpha: 0.5,
    petal: ['#ffffff', '#e6eefa'],
    heart: '#1c3c6e',
    fruit: '#ffffff',
    bud: '#e3ebf6',
    shadow: null,
    tape: null,
  },
  Nocturne: {
    bg: '#12171b',
    ink: '#6b6248',
    grain: '#232b30',
    ground: '#192126',
    stem: ['#c49b55', '#a48a52', '#7f9270'],
    leaf: ['#3c6b58', '#5e8f72', '#8eb597', '#c98b4a'],
    leafAlpha: 0.85,
    petal: ['#f2e6cc', '#e8b0a4'],
    heart: '#ffd47e',
    fruit: '#e6ad45',
    bud: '#8eb597',
    shadow: null,
    tape: null,
  },
}

const WIND: Record<Features['Wind'], number> = { Still: 0, Breeze: 0.45, Gale: 1.25 }

const FLORA: Record<Exclude<Features['Flora'], 'Mixed'>, Species> = {
  Herbs: 'Herb',
  Trees: 'Tree',
  Ferns: 'Fern',
  Umbels: 'Umbel',
}

const ALL: readonly Species[] = ['Herb', 'Tree', 'Fern', 'Umbel']

function seasonLook(season: Features['Season'], detail: number): Look {
  switch (season) {
    case 'Bare': return { leaves: false, bloom: 0, fruit: 0, bud: 0.35, autumn: 0, detail }
    case 'Foliage': return { leaves: true, bloom: 0, fruit: 0, bud: 0.08, autumn: 0, detail }
    case 'Bloom': return { leaves: true, bloom: 0.35, fruit: 0, bud: 0.15, autumn: 0, detail }
    default: return { leaves: true, bloom: 0, fruit: 0.3, bud: 0, autumn: 0.35, detail }
  }
}

/** Grows one plant and rescales it to a height of 1. */
function makePlant(hash: string, key: string, sp: Species, f: Features, detail: number, wind: number, lean: number): Plant {
  const r = stream(hash, key)
  const g = SPECIES[sp](r, seasonLook(f.Season, detail))
  const p = grow(g, r, { tx: wind, ty: 0, lean })
  const b = bounds(p)
  scale(p, 1 / Math.max(1e-6, b[3] - b[1]))
  return p
}

// --- colour helpers ------------------------------------------------------------

function mix(a: string, b: string, t: number): string {
  const pa = Number.parseInt(a.slice(1), 16)
  const pb = Number.parseInt(b.slice(1), 16)
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t)
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`
}

function stemColor(pal: Palette, t: number): string {
  if (t > 0.5)
    return mix(pal.stem[1], pal.stem[0], (t - 0.5) * 2)
  return mix(pal.stem[2], pal.stem[1], t * 2)
}

// --- drawing a plant -----------------------------------------------------------

interface Placed { p: Plant, ox: number, oy: number, s: number }

const WB = 20

function drawPlant(g: CanvasRenderingContext2D, pl: Placed, pal: Palette, S: number, shadow: boolean) {
  const { p, ox, oy, s } = pl
  const minW = 0.0007 * S
  const maxPx = Math.max(minW * 1.01, p.maxW * s)
  const lr = Math.log(maxPx / minW)
  // segments bucketed by width (and so by colour), one path per bucket
  const buckets: number[][] = Array.from({ length: WB }, () => [])
  const seg = p.seg
  for (let i = 0; i < seg.length; i += 6) {
    const w = Math.max(minW, seg[i + 4] * s)
    const b = Math.min(WB - 1, Math.max(0, Math.round(Math.log(w / minW) / lr * (WB - 1))))
    buckets[b].push(i)
  }
  const widthOf = (b: number) => minW * Math.exp(lr * b / (WB - 1))
  const path = (list: number[], dx: number, dy: number) => {
    g.beginPath()
    for (const i of list) {
      g.moveTo(ox + seg[i] * s + dx, oy + seg[i + 1] * s + dy)
      g.lineTo(ox + seg[i + 2] * s + dx, oy + seg[i + 3] * s + dy)
    }
  }
  g.lineCap = 'round'
  g.lineJoin = 'round'

  const leafPath = (tone: number, dx: number, dy: number) => {
    const L = p.leaf
    g.beginPath()
    for (let i = 0; i < L.length; i += 5) {
      if (tone >= 0 && L[i + 4] !== tone)
        continue
      const x = ox + L[i] * s + dx
      const y = oy + L[i + 1] * s + dy
      const a = L[i + 2]
      const len = L[i + 3] * s
      const hx = Math.sin(a)
      const hy = -Math.cos(a)
      const wd = len * 0.36
      const mx = x + hx * len * 0.45
      const my = y + hy * len * 0.45
      g.moveTo(x, y)
      g.quadraticCurveTo(mx - hy * wd, my + hx * wd, x + hx * len, y + hy * len)
      g.quadraticCurveTo(mx + hy * wd, my - hx * wd, x, y)
    }
  }

  if (shadow && pal.shadow) {
    const dx = 0.0028 * S
    const dy = 0.0036 * S
    g.globalAlpha = 0.13
    g.strokeStyle = pal.shadow
    g.fillStyle = pal.shadow
    for (let b = WB - 1; b >= 0; b--) {
      if (!buckets[b].length)
        continue
      g.lineWidth = widthOf(b)
      path(buckets[b], dx, dy)
      g.stroke()
    }
    leafPath(-1, dx, dy)
    g.fill()
  }

  g.globalAlpha = 1
  for (let b = WB - 1; b >= 0; b--) {
    if (!buckets[b].length)
      continue
    g.lineWidth = widthOf(b)
    g.strokeStyle = stemColor(pal, b / (WB - 1))
    path(buckets[b], 0, 0)
    g.stroke()
  }

  g.globalAlpha = pal.leafAlpha
  for (let t = 0; t < 4; t++) {
    g.fillStyle = pal.leaf[t]
    leafPath(t, 0, 0)
    g.fill()
  }
  g.globalAlpha = 1

  // buds, fruit, then flowers on top
  const dots = (arr: number[], k: number, color: string) => {
    if (!arr.length)
      return
    g.fillStyle = color
    g.beginPath()
    for (let i = 0; i < arr.length; i += 3) {
      const x = ox + arr[i] * s
      const y = oy + arr[i + 1] * s
      const rad = Math.max(minW * 0.8, arr[i + 2] * s * k)
      g.moveTo(x + rad, y)
      g.arc(x, y, rad, 0, Math.PI * 2)
    }
    g.fill()
  }
  dots(p.bud, 1, pal.bud)
  dots(p.fruit, 1, pal.fruit)

  const B = p.bloom
  if (B.length) {
    for (let c = 0; c < 2; c++) {
      g.fillStyle = pal.petal[c]
      g.globalAlpha = 0.92
      g.beginPath()
      for (let i = 0; i < B.length; i += 5) {
        if ((i / 5) % 2 !== c)
          continue
        const x = ox + B[i] * s
        const y = oy + B[i + 1] * s
        const rad = Math.max(minW, B[i + 2] * s * 0.5)
        if (B[i + 3] === 1) {
          // umbel floret: a single dot
          g.moveTo(x + rad * 0.8, y)
          g.arc(x, y, rad * 0.8, 0, Math.PI * 2)
          continue
        }
        const a0 = B[i + 4]
        for (let k = 0; k < 5; k++) {
          const a = a0 + k * Math.PI * 0.4
          const px = x + Math.sin(a) * rad * 0.62
          const py = y - Math.cos(a) * rad * 0.62
          g.moveTo(px + rad * 0.5, py)
          g.arc(px, py, rad * 0.5, 0, Math.PI * 2)
        }
      }
      g.fill()
    }
    g.globalAlpha = 1
    g.fillStyle = pal.heart
    g.beginPath()
    for (let i = 0; i < B.length; i += 5) {
      if (B[i + 3] === 1)
        continue
      const x = ox + B[i] * s
      const y = oy + B[i + 1] * s
      const rad = Math.max(minW * 0.6, B[i + 2] * s * 0.17)
      g.moveTo(x + rad, y)
      g.arc(x, y, rad, 0, Math.PI * 2)
    }
    g.fill()
  }
}

/** Places a plant so that its bounding box fits in a box, base on the bottom edge or centred. */
function fit(p: Plant, x0: number, y0: number, x1: number, y1: number, middle = false): Placed {
  const b = bounds(p)
  const s = Math.min((x1 - x0) / (b[2] - b[0]), (y1 - y0) / (b[3] - b[1]))
  const oy = middle ? (y0 + y1) / 2 - (b[1] + b[3]) / 2 * s : y1 - b[3] * s
  return { p, s, ox: (x0 + x1) / 2 - (b[0] + b[2]) / 2 * s, oy }
}

/** Two strips of paper tape across the lower stems of a mounted specimen. */
function tape(g: CanvasRenderingContext2D, pl: Placed, pal: Palette, S: number, r: Rng) {
  if (!pal.tape)
    return
  const seg = pl.p.seg
  // pick thick segments low on the plant
  const cand: number[] = []
  for (let i = 0; i < seg.length; i += 6) {
    if (seg[i + 5] <= 1 && seg[i + 1] < -0.08 && seg[i + 1] > -0.55 && seg[i + 4] > pl.p.maxW * 0.3)
      cand.push(i)
  }
  if (!cand.length)
    return
  for (let k = 0; k < 2; k++) {
    const i = cand[Math.floor(cand.length * (0.15 + k * 0.45 + r() * 0.2)) % cand.length]
    const x = pl.ox + seg[i] * pl.s
    const y = pl.oy + seg[i + 1] * pl.s
    const a = Math.atan2(seg[i + 3] - seg[i + 1], seg[i + 2] - seg[i]) + Math.PI / 2 + range(r, -0.2, 0.2)
    const w = S * range(r, 0.035, 0.05)
    const h = S * 0.011
    g.save()
    g.translate(x, y)
    g.rotate(a)
    g.globalAlpha = 0.15
    g.fillStyle = pal.shadow ?? pal.ink
    g.fillRect(-w / 2 + h * 0.15, -h / 2 + h * 0.2, w, h)
    g.globalAlpha = 0.88
    g.fillStyle = pal.tape
    g.fillRect(-w / 2, -h / 2, w, h)
    g.restore()
  }
  g.globalAlpha = 1
}

/** A specimen label: a small ruled card, without text. */
function label(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, pal: Palette, S: number, r: Rng) {
  g.globalAlpha = 0.9
  g.fillStyle = pal.tape ?? pal.bg
  g.fillRect(x, y, w, h)
  g.globalAlpha = 0.75
  g.strokeStyle = pal.ink
  g.lineWidth = 0.0011 * S
  g.strokeRect(x, y, w, h)
  g.lineWidth = 0.0008 * S
  g.beginPath()
  const lines = 3
  for (let i = 0; i < lines; i++) {
    const ly = y + h * (i + 1) / (lines + 1)
    const lx = x + w * 0.1
    g.moveTo(lx, ly)
    g.lineTo(lx + w * range(r, 0.45, 0.8), ly)
  }
  g.stroke()
  g.globalAlpha = 1
}

function render(g: CanvasRenderingContext2D, W: number, H: number, hash: string) {
  const f = features(hash)
  const pal = PAL[f.Palette]
  const S = Math.min(W, H)
  const ox = (W - S) / 2
  const oy = (H - S) / 2
  const wind = WIND[f.Wind]

  // Fixed stream order: layout, then one stream per plant, then paper and drift.
  const lr = stream(hash, 'layout')
  const dir = lr() < 0.5 ? -1 : 1
  const wx = dir * wind

  g.globalAlpha = 1
  g.fillStyle = pal.bg
  g.fillRect(0, 0, W, H)

  const placed: Placed[] = []
  if (f.Layout === 'Specimen') {
    const m = 0.09 * S
    const x0 = m
    const x1 = W - m
    const y0 = m
    const y1 = H - m * 1.7
    let p: Plant
    if (f.Flora === 'Mixed') {
      // a posy: three different plants tied at one point
      const kinds = [...ALL]
      const first = int(lr, 0, 3)
      const chosen = [kinds[first], kinds[(first + 1) % 4], kinds[(first + 2 + int(lr, 0, 1)) % 4]]
      const parts = chosen.map((sp, i) => {
        const pp = makePlant(hash, `plant${i}`, sp, f, 0.6, wx, (i - 1) * 0.32 + range(lr, -0.08, 0.08) + wx * 0.1)
        scale(pp, i === 1 ? 1 : range(lr, 0.62, 0.85))
        return pp
      })
      p = { seg: [], leaf: [], bloom: [], fruit: [], bud: [], maxW: 0 }
      for (const pp of parts) {
        p.seg.push(...pp.seg)
        p.leaf.push(...pp.leaf)
        p.bloom.push(...pp.bloom)
        p.fruit.push(...pp.fruit)
        p.bud.push(...pp.bud)
        p.maxW = Math.max(p.maxW, pp.maxW)
      }
    }
    else {
      p = makePlant(hash, 'plant0', FLORA[f.Flora], f, 1, wx, wx * 0.1 + range(lr, -0.06, 0.06))
    }
    const pl = fit(p, x0, y0, x1, y1, true)
    placed.push(pl)
    const pr = stream(hash, 'paper')
    drawPlant(g, pl, pal, S, true)
    tape(g, pl, pal, S, pr)
    label(g, W - m - 0.24 * S, H - m * 1.45, 0.24 * S, 0.1 * S, pal, S, pr)
  }
  else if (f.Layout === 'Plate') {
    const n = weighted(lr, [[4, 30], [6, 40], [9, 30]] as const)
    // the grid follows the canvas: the most nearly 4:5 cells, allowing a
    // short last row (its empty cells then hold the plate's label)
    let best = [n, 1]
    let bestCost = Infinity
    const m = 0.06 * S
    for (let c = 1; c <= n; c++) {
      const rows = Math.ceil(n / c)
      const empty = c * rows - n
      if (empty >= c)
        continue
      const cw = (W - 2 * m) / c
      const ch = (H - 2 * m) / rows
      const cost = Math.abs(Math.log((cw / ch) / 0.8)) + empty * 0.25
      if (cost < bestCost - 1e-9) {
        bestCost = cost
        best = [c, rows]
      }
    }
    const [cols, rows] = best
    const cw = (W - 2 * m) / cols
    const ch = (H - 2 * m) / rows
    const order = [...ALL]
    for (let i = 3; i > 0; i--) {
      const j = Math.floor(lr() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]]
    }
    const pr = stream(hash, 'paper')
    for (let i = 0; i < n; i++) {
      const sp = f.Flora === 'Mixed' ? order[i % 4] : FLORA[f.Flora]
      const lean = wx * 0.1 + range(lr, -0.05, 0.05)
      const p = makePlant(hash, `plant${i}`, sp, f, n === 9 ? 0.15 : 0.3, wx, lean)
      const cx = m + (i % cols) * cw
      const cy = m + Math.floor(i / cols) * ch
      const cs = Math.min(cw, ch)
      const pad = cs * 0.1
      // cell frame
      g.globalAlpha = 0.5
      g.strokeStyle = pal.ink
      g.lineWidth = 0.0012 * S
      g.strokeRect(cx + cs * 0.03, cy + cs * 0.03, cw - cs * 0.06, ch - cs * 0.06)
      g.globalAlpha = 1
      const pl = fit(p, cx + pad, cy + pad, cx + cw - pad, cy + ch - pad - cs * 0.07)
      placed.push(pl)
      drawPlant(g, pl, pal, S, true)
      tape(g, pl, pal, S, pr)
      // the plate number, as a row of small ticks under the specimen
      g.fillStyle = pal.ink
      g.globalAlpha = 0.8
      const tick = cs * 0.012
      for (let k = 0; k <= i; k++)
        g.fillRect(cx + cw / 2 + (k - i / 2) * tick * 2.4 - tick / 2, cy + ch - pad - cs * 0.025, tick, tick * 2.2)
      g.globalAlpha = 1
    }
    if (cols * rows > n) {
      const cx = m + (n % cols) * cw
      const cy = m + (rows - 1) * ch
      const lw = Math.min(cw * 0.7, 0.3 * S)
      label(g, cx + (cw - lw) / 2, cy + ch * 0.62, lw, lw * 0.42, pal, S, pr)
    }
  }
  else {
    // Meadow: slots along a ground line, laid out for a band much wider than
    // the square so wider canvases simply show more of the same field.
    const tree = f.Flora === 'Trees'
    const gap = tree ? 0.3 : 0.17
    const slots: { u: number, sp: Species, h: number, lean: number, back: boolean }[] = []
    for (let u = -1.8 + range(lr, 0, gap); u < 2.8; u += gap * range(lr, 0.7, 1.3)) {
      let sp: Species
      if (f.Flora === 'Mixed')
        sp = weighted(lr, [['Herb', 34], ['Umbel', 24], ['Fern', 22], ['Tree', 20]] as const)
      else
        sp = FLORA[f.Flora]
      const hr = sp === 'Tree' ? [0.5, 0.78] : sp === 'Fern' ? [0.3, 0.5] : sp === 'Umbel' ? [0.4, 0.66] : [0.34, 0.6]
      // about one plant in three stands further back, smaller and paler,
      // never two in a row so the front stays filled
      const prev = slots[slots.length - 1]
      const back = lr() < 0.4 && !prev?.back
      slots.push({ u, sp, h: range(lr, hr[0], hr[1]) * (back ? 0.62 : 1), lean: wx * 0.12 + range(lr, -0.08, 0.08), back })
    }
    const ph = [range(lr, 0, 6.3), range(lr, 0, 6.3)]
    const groundY = (x: number) => H - 0.13 * S + (Math.sin(x / S * 2.1 + ph[0]) * 0.012 + Math.sin(x / S * 5.3 + ph[1]) * 0.005) * S
    const hk = Math.min(1.8, Math.max(1, H / W))
    // back row first, then tall plants behind short ones
    const idx = slots.map((_, i) => i).sort((a, b) => Number(slots[b].back) - Number(slots[a].back) || slots[b].h - slots[a].h || a - b)
    if (f.Palette === 'Nocturne' || f.Palette === 'Cyanotype') {
      // a moon low over the field
      const mx = ox + range(lr, 0.15, 0.85) * S
      const my = oy + range(lr, 0.12, 0.3) * S
      g.fillStyle = pal.petal[0]
      g.globalAlpha = 0.85
      g.beginPath()
      g.arc(mx, my, 0.05 * S, 0, Math.PI * 2)
      g.fill()
      g.globalAlpha = 1
    }
    const ground = () => {
      g.fillStyle = pal.ground
      g.beginPath()
      g.moveTo(0, H)
      for (let x = 0; x <= W + S * 0.02; x += S * 0.02)
        g.lineTo(x, groundY(x))
      g.lineTo(W, H)
      g.fill()
    }
    let veiled = false
    for (const i of idx) {
      const sl = slots[i]
      if (!sl.back && !veiled) {
        // a veil of paper over the back row, then the ground in front of it
        veiled = true
        g.globalAlpha = 0.5
        g.fillStyle = pal.bg
        g.fillRect(0, 0, W, H)
        g.globalAlpha = 1
        ground()
      }
      const x = ox + sl.u * S
      if (x < -0.4 * S || x > W + 0.4 * S)
        continue
      const p = makePlant(hash, `plant${i}`, sl.sp, f, 0, wx, sl.lean)
      const b = bounds(p)
      const s = Math.min(sl.h * hk * S / (b[3] - b[1]), 0.9 * S / (b[2] - b[0]))
      const pl = { p, s, ox: x, oy: groundY(x) + 0.006 * S }
      placed.push(pl)
      drawPlant(g, pl, pal, S, false)
    }
    if (!veiled)
      ground()
    // grass along the ground line hides the plant bases
    const pr = stream(hash, 'paper')
    g.strokeStyle = pal.stem[2]
    g.lineWidth = 0.0012 * S
    g.globalAlpha = 0.7
    g.beginPath()
    const blades = Math.ceil(W / S * 260)
    for (let k = 0; k < blades; k++) {
      const x = (k + pr()) / blades * W
      const y = groundY(x) + range(pr, 0, 0.012) * S
      const h = range(pr, 0.012, 0.035) * S
      const a = range(pr, -0.35, 0.35) + wx * 0.45
      g.moveTo(x, y)
      g.quadraticCurveTo(x + Math.sin(a) * h * 0.3, y - h * 0.6, x + Math.sin(a * 1.6) * h, y - Math.cos(a) * h)
    }
    g.stroke()
    g.globalAlpha = 1
  }

  // paper grain, spread over the whole canvas at a fixed density
  const pr = stream(hash, 'grain')
  g.fillStyle = pal.grain
  g.globalAlpha = 0.45
  g.beginPath()
  const dots = Math.ceil(W * H / (S * S) * 1400)
  for (let k = 0; k < dots; k++) {
    const x = pr() * W
    const y = pr() * H
    const rad = (0.0005 + pr() * pr() * 0.0016) * S
    g.moveTo(x + rad, y)
    g.arc(x, y, rad, 0, Math.PI * 2)
  }
  g.fill()
  g.globalAlpha = 1

  // a gale strips a few leaves and carries them downwind
  if (f.Wind === 'Gale') {
    const dr = stream(hash, 'drift')
    g.globalAlpha = pal.leafAlpha
    for (const pl of placed) {
      const L = pl.p.leaf
      const n = Math.min(14, Math.floor(L.length / 5 / 40))
      for (let k = 0; k < n; k++) {
        const i = Math.floor(dr() * (L.length / 5)) * 5
        const d = range(dr, 0.04, 0.3) * S
        const x = pl.ox + L[i] * pl.s + dir * d
        const y = pl.oy + L[i + 1] * pl.s + gaussian(dr) * 0.04 * S + d * 0.15
        const a = range(dr, 0, Math.PI * 2)
        const len = Math.max(0.006 * S, L[i + 3] * pl.s)
        g.fillStyle = pick(dr, pal.leaf)
        g.beginPath()
        g.ellipse(x, y, len * 0.5, len * 0.18, a, 0, Math.PI * 2)
        g.fill()
      }
    }
    g.globalAlpha = 1
  }
}

export default {
  slug: 'arbor',
  title: 'Arbor',
  summary: 'Weeds, trees, ferns and umbels grown by stochastic L-systems, bent by the wind and mounted like herbarium specimens.',
  order: 200,
  traits: TRAITS,
  features,
  render,
  // Seed-of-seeds 0xa4b04a4b ("gallery" stream): the first hash found for each
  // Flora x Layout pair, in the order found, except that the second one (a
  // pressed fern on its herbarium sheet) is moved first to serve as the cover.
  gallery: [
    '0xbd614fda3a7812009940d9ce7e3407eb11d990a00500d7022540c7c3edce9f2a',
    '0x9f77a131487e353570a61817f71f82f422fb790e000a02fe5a4333b5da497069',
    '0x9e5c7f7d9715d71a59212f6f0dc9caafb4dea13eb62cc2bd84988df147a61233',
    '0xc955795051adb7a0bb23743ccfe006e4d5eeb8b0a8f2b17243b7ecb2c05b8ca2',
    '0x6d39402b4863d498bed4c7a3feb17910afa0e16fd307e79022e84c9f3fb594f2',
    '0x6fa93542976099df4da8b350ffe9c6c1c0b2c1e72dee5dd5cb597fb66152b72b',
    '0x3ff1aff731dc1f9397a3fc150e07525d23149f037d629d6b7c112e70bc67fd3c',
    '0xbab9a41386e961e6b83d035d48d76e16bb5f4e1cdebe787094c53b7f26e11608',
    '0x91355d92d51eae5fa79336c5a7aad2d7441f083ebdc093339bf1945231bfbcba',
    '0x04fa5e02b0986373bbf81dbfc8f4cea9fc3177f055fa796fefdcaed20a04f484',
    '0xbd5cb385408c5c8cc24aa030db4251973653197e9d7d6c39340e5daa2b2821ac',
    '0x904a1b7ea2d80c7613b4c886592054cb6c1324fe4ed764ac5ee829edef220044',
  ],
} satisfies Series
