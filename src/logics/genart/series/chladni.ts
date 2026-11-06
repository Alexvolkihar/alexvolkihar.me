// "Chladni" — sand on a vibrating plate, gathered along the nodal lines.
//
// Ernst Chladni (Entdeckungen über die Theorie des Klanges, 1787) strewed
// sand on metal plates clamped at the centre and bowed at the edge: the sand
// is thrown off the vibrating regions and comes to rest on the lines that
// stand still. Here a plate's displacement is a superposition of eigenmodes,
// square (cos n pi x cos m pi y +/- cos m pi x cos n pi y, after Wheatstone,
// Rayleigh and Ritz) or circular (Bessel J_n), and tens of thousands of grains
// random-walk with a kick proportional to the local amplitude until they
// settle on the nodal lines (see ../chladni/). Fine lycopodium powder gathers
// at the antinodes instead, as Faraday explained in 1831.
//
// Everything is a pure function of the hash, and every length is a fraction
// of the canvas short side.

import type { Field, Mode, SquareTerm } from '../chladni/field'
import type { SandOptions } from '../chladni/sand'
import type { Rng } from '../random'
import type { Series } from '../types'
import { besselJpZero, buildField, complexity } from '../chladni/field'
import { settle } from '../chladni/sand'
import { chance, int, range, stream, weighted } from '../random'

// Rarity table, decided before the drawing code. Never reorder: it re-rolls the edition.
const TRAITS = {
  Plate: [['Square', 40], ['Circle', 34], ['Board', 26]],
  Material: [['Brass', 24], ['Lacquer', 22], ['Steel', 20], ['Paper', 20], ['Verdigris', 14]],
  Pitch: [['Grave', 30], ['Middle', 45], ['Acute', 25]],
  Mode: [['Pure', 45], ['Twin', 35], ['Chord', 20]],
  Powder: [['Sand', 45], ['Fine', 25], ['Lycopodium', 30]],
} as const

type TraitName = keyof typeof TRAITS
type Features = { [K in TraitName]: typeof TRAITS[K][number][0] }

function features(hash: string): Features {
  const r = stream(hash, 'features')
  return {
    Plate: weighted(r, TRAITS.Plate),
    Material: weighted(r, TRAITS.Material),
    Pitch: weighted(r, TRAITS.Pitch),
    Mode: weighted(r, TRAITS.Mode),
    Powder: weighted(r, TRAITS.Powder),
  }
}

interface Palette {
  /** Table, and the colour the corners fade to. */
  bg: string
  vignette: string
  /** Plate gradient, light and dark brushing strokes, rim, drop shadow. */
  plate: readonly [string, string]
  brushLight: string
  brushDark: string
  rim: string
  shadow: string
  /** Sand tones, most common first. */
  sand: readonly [string, string, string]
  /** Lycopodium powder. */
  powder: string
  bolt: string
  /** Paper is an engraving: outlined plates, no metal sheen. */
  print: boolean
}

const PAL: Record<Features['Material'], Palette> = {
  Brass: { bg: '#17130e', vignette: '#060504', plate: ['#94722f', '#c9a457'], brushLight: '#f3d995', brushDark: '#4f3a12', rim: '#e8cb85', shadow: '#000000', sand: ['#f7f0de', '#e7dbbd', '#fffbf2'], powder: '#f4dc5a', bolt: '#dcb968', print: false },
  Lacquer: { bg: '#2a1613', vignette: '#0c0605', plate: ['#0c0b0b', '#1f1c1b'], brushLight: '#4a4440', brushDark: '#000000', rim: '#8a3322', shadow: '#000000', sand: ['#f2eee5', '#d8d0c0', '#ffffff'], powder: '#e3a62a', bolt: '#9a3020', print: false },
  Steel: { bg: '#d3d6d8', vignette: '#9aa0a5', plate: ['#57606a', '#8b949c'], brushLight: '#d3dae0', brushDark: '#2b3238', rim: '#d6dde3', shadow: '#363b40', sand: ['#f9f7f1', '#e6e2d8', '#ffffff'], powder: '#f2c63c', bolt: '#bcc4cb', print: false },
  Paper: { bg: '#ede6d5', vignette: '#d3c8ae', plate: ['#e8dfca', '#e1d6bd'], brushLight: '#f4eddc', brushDark: '#cfc3a6', rim: '#26231f', shadow: '#bdb196', sand: ['#25221e', '#3f3a33', '#151310'], powder: '#a9442b', bolt: '#26231f', print: true },
  Verdigris: { bg: '#0f1917', vignette: '#030605', plate: ['#2c6656', '#5d9a84'], brushLight: '#a6d6c2', brushDark: '#143a31', rim: '#93cbb4', shadow: '#000000', sand: ['#f5ecd7', '#e5d9bc', '#fffaf0'], powder: '#eaa43d', bolt: '#b36a3c', print: false },
}

// Mode ranges per pitch. Square: n, m (half-waves along each side).
// Circle: n nodal diameters, m-th zero of J_n' (nodal circles grow with m).
const SQ_RANGE: Record<Features['Pitch'], readonly [number, number]> = {
  Grave: [2, 5],
  Middle: [3, 7],
  Acute: [5, 11],
}
const CI_RANGE: Record<Features['Pitch'], { n: readonly [number, number], m: readonly [number, number] }> = {
  Grave: { n: [0, 3], m: [1, 3] },
  Middle: { n: [1, 6], m: [1, 4] },
  Acute: { n: [2, 6], m: [3, 5] },
}

// Sand per single plate, by pitch: busier figures need more grains.
const GRAINS: Record<Features['Pitch'], number> = { Grave: 48000, Middle: 62000, Acute: 76000 }

interface PowderSpec {
  sand: Omit<SandOptions, 'count' | 'iters' | 'powder'>
  /** Grain count factor and dot radius (canvas short side = 1, single plate). */
  mult: number
  dot: number
}
const POWDER: Record<Features['Powder'], PowderSpec> = {
  Sand: { sand: { kick: 0.03, floor: 0.0032, pull: 0.25 }, mult: 1, dot: 0.0016 },
  Fine: { sand: { kick: 0.03, floor: 0.0018, pull: 0.3 }, mult: 1.25, dot: 0.00105 },
  Lycopodium: { sand: { kick: 0.03, floor: 0.0028, pull: 0.25 }, mult: 0.9, dot: 0.0015 },
}

// ---------------------------------------------------------------- modes

function squarePure(r: Rng, lo: number, hi: number, c = 1): SquareTerm[] {
  let n = int(r, lo, hi)
  let m = int(r, lo, hi)
  // n = m with the minus sign vanishes, with the plus sign is a plain grid
  for (let k = 0; k < 8 && n === m; k++)
    m = int(r, lo, hi)
  if (n === m)
    n = m > lo ? m - 1 : m + 1
  // n - m odd gives the antisymmetric diagonal waves; the closed rosettes
  // Chladni drew most come from n and m of the same parity
  if ((n + m) % 2 === 1 && chance(r, 0.8)) {
    const up = m + 1 <= hi && m + 1 !== n
    m = up ? m + 1 : m - 1
    if (m === n || m < 1)
      m = n + 2
  }
  const s = chance(r, 0.5) ? 1 : -1
  return [{ n, m, c }, { n: m, m: n, c: c * s }]
}

function circleTerm(r: Rng, rg: typeof CI_RANGE[Features['Pitch']], c = 1) {
  const n = int(r, rg.n[0], rg.n[1])
  const m = int(r, rg.m[0], rg.m[1])
  return { n, k: besselJpZero(n, m), c, phi: r() * Math.PI * 2 }
}

function makeMode(r: Rng, round: boolean, pitch: Features['Pitch'], kind: Features['Mode']): Mode {
  if (!round) {
    const [lo, hi] = SQ_RANGE[pitch]
    if (kind === 'Pure')
      return { kind: 'square', terms: squarePure(r, lo, hi) }
    if (kind === 'Twin') {
      // the degenerate pair (n, m) / (m, n) mixed at an angle other than 45°:
      // the figure loses its diagonal symmetry and its lines start to curl
      const [a, b] = squarePure(r, lo, hi)
      const t = range(r, 0.16, 0.6) + (chance(r, 0.5) ? 0 : Math.PI / 2 - 0.76)
      const s = chance(r, 0.5) ? 1 : -1
      return { kind: 'square', terms: [{ n: a.n, m: a.m, c: Math.cos(t) }, { n: b.n, m: b.m, c: s * Math.sin(t) }] }
    }
    const one = squarePure(r, lo, hi)
    const two = squarePure(r, lo, hi, range(r, 0.35, 0.8))
    return { kind: 'square', terms: [...one, ...two] }
  }
  const rg = CI_RANGE[pitch]
  const first = circleTerm(r, rg)
  if (kind === 'Pure')
    return { kind: 'circle', terms: [first] }
  if (kind === 'Twin') {
    // the other mode of the range whose frequency (~ k^2) lies closest
    let best = first
    let bd = Infinity
    for (let n = rg.n[0]; n <= rg.n[1]; n++) {
      if (n === first.n)
        continue
      for (let m = rg.m[0]; m <= rg.m[1]; m++) {
        const k = besselJpZero(n, m)
        const d = Math.abs(k - first.k)
        if (d < bd) {
          bd = d
          best = { n, k, c: 1, phi: 0 }
        }
      }
    }
    const c = range(r, 0.45, 0.9) * (chance(r, 0.5) ? 1 : -1)
    return { kind: 'circle', terms: [first, { ...best, c, phi: r() * Math.PI * 2 }] }
  }
  return {
    kind: 'circle',
    terms: [first, circleTerm(r, rg, range(r, 0.4, 0.8)), circleTerm(r, rg, range(r, 0.25, 0.55))],
  }
}

// ---------------------------------------------------------------- drawing

function platePath(g: CanvasRenderingContext2D, round: boolean, x: number, y: number, s: number) {
  g.beginPath()
  if (round) {
    g.arc(x + s / 2, y + s / 2, s / 2, 0, Math.PI * 2)
  }
  else {
    const c = s * 0.012
    g.moveTo(x + c, y)
    g.arcTo(x + s, y, x + s, y + s, c)
    g.arcTo(x + s, y + s, x, y + s, c)
    g.arcTo(x, y + s, x, y, c)
    g.arcTo(x, y, x + s, y, c)
    g.closePath()
  }
}

function drawPlate(g: CanvasRenderingContext2D, pal: Palette, round: boolean, x: number, y: number, s: number, tr: Rng) {
  // drop shadow: two offset copies, no blur filter (slow at 8K)
  g.fillStyle = pal.shadow
  for (const [o, a] of [[0.022, 0.18], [0.012, 0.3]] as const) {
    g.globalAlpha = a
    platePath(g, round, x + o * s * 0.6, y + o * s, s)
    g.fill()
  }
  g.globalAlpha = 1

  const grad = g.createLinearGradient(x, y, x + s, y + s)
  grad.addColorStop(0, pal.plate[1])
  grad.addColorStop(1, pal.plate[0])
  g.fillStyle = grad
  platePath(g, round, x, y, s)
  g.fill()

  // brushing: straight strokes on a square, lathe rings on a disc
  g.save()
  platePath(g, round, x, y, s)
  g.clip()
  g.lineWidth = s * 0.0016
  const strokes = pal.print ? 0 : 140
  for (let i = 0; i < strokes; i++) {
    g.strokeStyle = tr() < 0.5 ? pal.brushLight : pal.brushDark
    g.globalAlpha = 0.03 + tr() * 0.05
    const t = tr()
    g.beginPath()
    if (round) {
      g.arc(x + s / 2, y + s / 2, (0.03 + 0.47 * Math.sqrt(t)) * s, 0, Math.PI * 2)
    }
    else {
      const yy = y + t * s
      g.moveTo(x, yy)
      g.lineTo(x + s, yy + (tr() - 0.5) * s * 0.004)
    }
    g.stroke()
  }
  if (!pal.print) {
    const sheen = g.createRadialGradient(x + s * 0.28, y + s * 0.22, 0, x + s * 0.28, y + s * 0.22, s * 0.9)
    sheen.addColorStop(0, 'rgba(255,255,255,0.13)')
    sheen.addColorStop(1, 'rgba(255,255,255,0)')
    g.globalAlpha = 1
    g.fillStyle = sheen
    g.fillRect(x, y, s, s)
  }
  g.restore()

  g.globalAlpha = pal.print ? 0.9 : 0.55
  g.strokeStyle = pal.rim
  g.lineWidth = s * (pal.print ? 0.0045 : 0.004)
  platePath(g, round, x, y, s)
  g.stroke()
  if (pal.print) {
    // engraved double rule
    g.lineWidth = s * 0.0016
    g.globalAlpha = 0.7
    const o = s * 0.018
    platePath(g, round, x - o, y - o, s + 2 * o)
    g.stroke()
  }
  g.globalAlpha = 1
}

function drawBolt(g: CanvasRenderingContext2D, pal: Palette, cx: number, cy: number, rad: number) {
  g.globalAlpha = 0.45
  g.fillStyle = pal.shadow
  g.beginPath()
  g.arc(cx + rad * 0.18, cy + rad * 0.3, rad * 1.05, 0, Math.PI * 2)
  g.fill()
  g.globalAlpha = 1
  if (pal.print) {
    g.strokeStyle = pal.bolt
    g.lineWidth = rad * 0.18
    g.beginPath()
    g.arc(cx, cy, rad, 0, Math.PI * 2)
    g.stroke()
    g.beginPath()
    g.arc(cx, cy, rad * 0.3, 0, Math.PI * 2)
    g.fill()
    return
  }
  const grad = g.createRadialGradient(cx - rad * 0.35, cy - rad * 0.35, 0, cx, cy, rad)
  grad.addColorStop(0, '#ffffff')
  grad.addColorStop(0.35, pal.bolt)
  grad.addColorStop(1, pal.shadow)
  g.fillStyle = grad
  g.beginPath()
  g.arc(cx, cy, rad, 0, Math.PI * 2)
  g.fill()
}

// Tone of a grain from its index: no draws, and no visible pattern since the
// grains are scattered.
const TONE = [0, 0, 1, 0, 2, 1, 0] as const

/** Dots in plate coordinates mapped to the rectangle (x, y, s), one colour per tone. */
function drawGrains(
  g: CanvasRenderingContext2D,
  pts: Float32Array,
  x: number,
  y: number,
  s: number,
  rad: number,
  colors: readonly string[],
  alpha: number,
  shadow: string | null,
) {
  const n = pts.length / 2
  const draw = (dx: number, dy: number, tone: number) => {
    if (rad < 1.1) {
      const d = rad * 2
      for (let i = 0; i < n; i++) {
        if (tone >= 0 && TONE[i % 7] !== tone)
          continue
        g.fillRect(x + pts[i * 2] * s - rad + dx, y + pts[i * 2 + 1] * s - rad + dy, d, d)
      }
      return
    }
    // round grains, flushed in small batches (long paths rasterise slowly)
    let k = 0
    g.beginPath()
    for (let i = 0; i < n; i++) {
      if (tone >= 0 && TONE[i % 7] !== tone)
        continue
      const px = x + pts[i * 2] * s + dx
      const py = y + pts[i * 2 + 1] * s + dy
      g.moveTo(px + rad, py)
      g.arc(px, py, rad, 0, Math.PI * 2)
      if (++k === 400) {
        g.fill()
        g.beginPath()
        k = 0
      }
    }
    g.fill()
  }
  if (shadow && rad >= 1.5) {
    g.globalAlpha = alpha * 0.45
    g.fillStyle = shadow
    draw(rad * 0.35, rad * 0.5, -1)
  }
  g.globalAlpha = alpha
  for (let t = 0; t < colors.length; t++) {
    g.fillStyle = colors[t]
    draw(0, 0, colors.length === 1 ? -1 : t)
  }
  g.globalAlpha = 1
}

// ---------------------------------------------------------------- render

interface Cell { x: number, y: number, s: number, round: boolean }

function layout(f: Features, W: number, H: number, br: Rng): { cells: Cell[], dot: number } {
  const S = Math.min(W, H)
  if (f.Plate !== 'Board') {
    const s = S * (f.Plate === 'Circle' ? 0.8 : 0.76)
    return { cells: [{ x: (W - s) / 2, y: (H - s) / 2, s, round: f.Plate === 'Circle' }], dot: 1 }
  }
  // a specimen board: plates in a grid that fills the canvas, k on the short side
  const kind = weighted(br, [['Square', 40], ['Circle', 35], ['Alternate', 25]] as const)
  const k = f.Pitch === 'Grave' ? 3 : f.Pitch === 'Middle' ? int(br, 3, 4) : 4
  const cols = W >= H ? Math.max(k, Math.round((k * W) / H)) : k
  const rows = W >= H ? k : Math.max(k, Math.round((k * H) / W))
  const margin = S * 0.07
  const gap = S * (0.16 / k)
  const s = Math.min((W - 2 * margin - (cols - 1) * gap) / cols, (H - 2 * margin - (rows - 1) * gap) / rows)
  const ox = (W - cols * s - (cols - 1) * gap) / 2
  const oy = (H - rows * s - (rows - 1) * gap) / 2
  const cells: Cell[] = []
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const round = kind === 'Circle' || (kind === 'Alternate' && (i + j) % 2 === 1)
      cells.push({ x: ox + i * (s + gap), y: oy + j * (s + gap), s, round })
    }
  }
  return { cells, dot: 0.62 }
}

function render(g: CanvasRenderingContext2D, W: number, H: number, hash: string) {
  const f = features(hash)
  const pal = PAL[f.Material]
  const pw = POWDER[f.Powder]
  const S = Math.min(W, H)

  const mr = stream(hash, 'modes')
  const br = stream(hash, 'board')
  const sr = stream(hash, 'sand')
  const lr = stream(hash, 'powder')
  const xr = stream(hash, 'spill')
  const tr = stream(hash, 'texture')

  // table
  g.globalAlpha = 1
  g.fillStyle = pal.bg
  g.fillRect(0, 0, W, H)
  const vg = g.createRadialGradient(W / 2, H / 2, S * 0.3, W / 2, H / 2, Math.hypot(W, H) * 0.62)
  vg.addColorStop(0, `${pal.vignette}00`)
  vg.addColorStop(1, pal.vignette)
  g.fillStyle = vg
  g.fillRect(0, 0, W, H)

  const { cells, dot } = layout(f, W, H, br)
  const board = cells.length > 1

  // modes: one per plate, a board reads from the simplest figure to the busiest
  const modes = cells.map(c => makeMode(mr, c.round, f.Pitch, f.Mode))
  if (board) {
    const sq = modes.filter(m => m.kind === 'square').sort((a, b) => complexity(a) - complexity(b))
    const ci = modes.filter(m => m.kind === 'circle').sort((a, b) => complexity(a) - complexity(b))
    for (let i = 0; i < cells.length; i++)
      modes[i] = (cells[i].round ? ci : sq).shift()!
  }

  const total = GRAINS[f.Pitch] * pw.mult * (board ? 0.8 : 1)
  const per = Math.max(2500, Math.round(total / cells.length))
  const N = board ? 128 : 200
  const iters = board ? 30 : 38
  const radPx = pw.dot * dot * S
  const grainShadow = pal.print ? null : pal.shadow

  for (let c = 0; c < cells.length; c++) {
    const cell = cells[c]
    const field: Field = buildField(modes[c], N)
    drawPlate(g, pal, cell.round, cell.x, cell.y, cell.s, tr)

    if (f.Powder === 'Lycopodium') {
      const dust = settle(field, lr, { count: Math.round(per * 0.32), iters: Math.round(iters * 0.6), kick: 0.012, floor: 0.0045, pull: 0.006, powder: true })
      drawGrains(g, dust, cell.x, cell.y, cell.s, radPx * 0.85, [pal.powder], pal.print ? 0.75 : 0.85, null)
    }
    const sand = settle(field, sr, { ...pw.sand, count: per, iters, powder: false })
    drawGrains(g, sand, cell.x, cell.y, cell.s, radPx, pal.sand, 1, grainShadow)

    if (!board) {
      // grains thrown off the rim onto the table
      const spill = new Float32Array(Math.round(per * 0.02) * 2)
      for (let i = 0; i < spill.length; i += 2) {
        const t = xr()
        const out = 0.004 + 0.06 * (-Math.log(1 - xr() * 0.999)) * 0.35
        let px: number
        let py: number
        if (cell.round) {
          const a = t * Math.PI * 2
          px = 0.5 + (0.5 + out) * Math.cos(a)
          py = 0.5 + (0.5 + out) * Math.sin(a)
        }
        else {
          const side = Math.floor(t * 4)
          const u = t * 4 - side
          px = side === 0 ? u : side === 1 ? 1 + out : side === 2 ? 1 - u : -out
          py = side === 0 ? -out : side === 1 ? u : side === 2 ? 1 + out : 1 - u
        }
        spill[i] = px
        spill[i + 1] = py + 0.012
      }
      drawGrains(g, spill, cell.x, cell.y, cell.s, radPx, pal.sand, 0.8, null)
      drawBolt(g, pal, cell.x + cell.s / 2, cell.y + cell.s / 2, S * 0.018)
    }
  }
  g.globalAlpha = 1
}

export default {
  slug: 'chladni',
  title: 'Chladni',
  summary: 'Sand strewn on vibrating square and circular plates, thrown off the loops until it settles on the nodal lines, on brass, lacquer, steel, verdigris or an engraved sheet.',
  order: 590,
  traits: TRAITS,
  features,
  render,
  // Seed-of-seeds 0xc1ad0c1a ("gallery" stream): the first hash found for each
  // Plate x Material pair, in the order found (12 of the 15 pairs), except that
  // the seventh (a brass disc with a twin mode) is moved first as the cover.
  gallery: [
    '0x36ef641e4de234285b15487f521ebc464c94109bc12d854eb081765fb8ac95e1',
    '0xe63dfe9f0aed11a6ce81eecee38f2356e511b30303684e754cc5b429f2c7f969',
    '0x61479389c5f8afbd740a690b58a6c130151f92a61f1490e541e6531ae3e39523',
    '0xa1c815c212c4b3797b0dacc199d5d191d60e06efd044c5753629c81c1a81618d',
    '0xe58310be22220552c0cfc41926f893bc45b76e069e70e2b37ec47e219887dc32',
    '0x096512cf6d9f21e2a29d422b00beb6b66e4644fcffd96efd2cae8bfaf5cc76e1',
    '0x8527a9c36173deabec756decacbfcaf2885549ceac3465dd45736f7b3ab16cd6',
    '0xf44451662ef54d8e9cb8e06029a17849bcb8b384568cd97fb35e2e3251aff412',
    '0x9ca5f99be230615044c8d5c09b8328fe1e3bac3a64d89f104033183282a21943',
    '0x8544811a89a110f2d3e6f8b4b57e224255d9d3bcab968809ff82c81ff5464d2f',
    '0xeef7912a84818f349237e110ea6992bd1d345772c7f37faadcb8a8188faf7e02',
    '0x28a2837953ad017a009f8cd0aeec7691fc61875eb82c8559376b26887d445bed',
  ],
} satisfies Series
