// "Crackle" — craquelure grown by crack agents, then glazed, painted, dried or frozen.
//
// A layer that shrinks as it dries (glaze on a pot, old oil paint, mud, a
// sheet of ice) relieves its stress by cracking. Here every crack is an agent
// that leaves an older crack at about a right angle, wanders, turns to meet the
// crack ahead square on, and stops when it reaches it (see
// ../crackle/network.ts). The order of the cracks is a family tree, as in the
// hierarchical crack patterns described by Bohn, Pauchard and Couder (2005):
// the first ones run across the whole slab and are the widest, the later ones
// only divide the domains left between them. The closed cells of the network
// are then painted one by one as the chosen material: glossy crackle glaze
// with stained "iron wire and golden thread" lines, cupped flakes of an old
// varnished painting, curled tiles of dried clay over their own shadows, or
// facets of ice with white fracture planes.
//
// The layer fills the canvas, is a round piece centred on a cloth, or is laid
// as square tiles whose grout lines are pre-placed cracks.
//
// Everything is a pure function of the hash, every length is a fraction of
// the canvas short side, and a wider or taller canvas is simply a larger slab
// (a round piece stays centred at the same size).

import type { Cell, GrowOptions } from '../crackle/network'
import type { Rng } from '../random'
import type { Series } from '../types'
import { addGridLines, cellsOf, createNetwork, growPass } from '../crackle/network'
import { stream, weighted } from '../random'

// ---------------------------------------------------------------------------
// Rarity table — decided before the drawing code, never reordered.
// ---------------------------------------------------------------------------

const TRAITS = {
  Material: [['Glaze', 32], ['Oil paint', 26], ['Clay', 26], ['Ice', 16]],
  Palette: [['Celadon', 26], ['Ivory', 22], ['Ochre', 20], ['Oxblood', 16], ['Night', 16]],
  Density: [['Sparse', 25], ['Medium', 45], ['Dense', 22], ['Crazed', 8]],
  Hierarchy: [['Cascade', 40], ['Two orders', 35], ['Free', 25]],
  Layout: [['Slab', 50], ['Round', 30], ['Tiles', 20]],
} as const

type TraitName = keyof typeof TRAITS
type Features = { [K in TraitName]: typeof TRAITS[K][number][0] }

function features(hash: string): Features {
  const r = stream(hash, 'features')
  return {
    Material: weighted(r, TRAITS.Material),
    Palette: weighted(r, TRAITS.Palette),
    Density: weighted(r, TRAITS.Density),
    Hierarchy: weighted(r, TRAITS.Hierarchy),
    Layout: weighted(r, TRAITS.Layout),
  }
}

// ---------------------------------------------------------------------------
// Palettes. `surface` are the tones of the layer, `deep` its darkest tone,
// `crack` the main line colour, `fine` the secondary line colour, `ground`
// what shows through an open crack, `light` the highlight.
// ---------------------------------------------------------------------------

type RGB = readonly [number, number, number]

interface Palette {
  surface: readonly [string, string, string]
  deep: string
  crack: string
  fine: string
  ground: string
  light: string
  varnish: string
}

const PAL: Record<Features['Palette'], Palette> = {
  Celadon: { surface: ['#a9bfa6', '#c4d4bd', '#93ab95'], deep: '#5f7d6b', crack: '#23241f', fine: '#9a7438', ground: '#2c312a', light: '#f1f4ea', varnish: '#b9a46a' },
  Ivory: { surface: ['#e4d9c2', '#f0e8d6', '#d2c3a5'], deep: '#9f8c6c', crack: '#1d1a16', fine: '#8c6f4a', ground: '#3d352b', light: '#fffaf0', varnish: '#c9a35a' },
  Ochre: { surface: ['#c99a5b', '#dcb680', '#b07c42'], deep: '#7a4a24', crack: '#2b1a0e', fine: '#6b3f1f', ground: '#24160d', light: '#f6e2bf', varnish: '#b8863c' },
  Oxblood: { surface: ['#8a2a22', '#a8452f', '#6e1e1b'], deep: '#3e1010', crack: '#170807', fine: '#d4a35a', ground: '#1c0b09', light: '#f2c9a0', varnish: '#a0703a' },
  Night: { surface: ['#223044', '#2d3f57', '#1a2433'], deep: '#0e141d', crack: '#cbd8e4', fine: '#c9a65e', ground: '#06090e', light: '#e8f0f7', varnish: '#5a6a80' },
}

function hex(c: string): RGB {
  const v = Number.parseInt(c.slice(1), 16)
  return [v >> 16, (v >> 8) & 255, v & 255]
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

function css(c: RGB, k = 1, a = 1): string {
  const f = (x: number) => Math.max(0, Math.min(255, Math.round(x * k)))
  return a < 1 ? `rgba(${f(c[0])},${f(c[1])},${f(c[2])},${a})` : `rgb(${f(c[0])},${f(c[1])},${f(c[2])})`
}

function ramp(stops: readonly RGB[], t: number): RGB {
  const x = Math.max(0, Math.min(0.9999, t)) * (stops.length - 1)
  const i = Math.floor(x)
  return mix(stops[i], stops[i + 1], x - i)
}

// ---------------------------------------------------------------------------
// Material and density settings (lengths in units of the short side).
// ---------------------------------------------------------------------------

/** Critical crack spacing for each density. */
const SPACING: Record<Features['Density'], number> = { Sparse: 0.15, Medium: 0.105, Dense: 0.066, Crazed: 0.042 }

interface Material {
  /** Spacing multiplier: paint craquelure is fine, mud cracks are wide apart. */
  scale: number
  wobble: number
  kink: number
  /** Crack width as a + b * spacing. */
  width: readonly [number, number]
}

const MAT: Record<Features['Material'], Material> = {
  'Glaze': { scale: 1, wobble: 0.055, kink: 0, width: [0.0014, 0.012] },
  'Oil paint': { scale: 0.62, wobble: 0.03, kink: 0.004, width: [0.0007, 0.016] },
  'Clay': { scale: 1.3, wobble: 0.04, kink: 0, width: [0.003, 0.06] },
  'Ice': { scale: 1.15, wobble: 0.012, kink: 0.03, width: [0.0009, 0.01] },
}

// Value noise on a shuffled lattice, smoothstep-interpolated.
function makeNoise(r: Rng) {
  const P = 256
  const perm = new Uint8Array(P * 2)
  const val = new Float32Array(P)
  const idx = Array.from({ length: P }, (_, i) => i)
  for (let i = P - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]]
  }
  for (let i = 0; i < P * 2; i++)
    perm[i] = idx[i & 255]
  for (let i = 0; i < P; i++)
    val[i] = r()
  const fade = (t: number) => t * t * (3 - 2 * t)
  const v = (a: number, b: number) => val[perm[perm[a & 255] + (b & 255)]]
  return (x: number, y: number) => {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const u = fade(x - xi)
    const w = fade(y - yi)
    const a = v(xi, yi) + u * (v(xi + 1, yi) - v(xi, yi))
    const b = v(xi, yi + 1) + u * (v(xi + 1, yi + 1) - v(xi, yi + 1))
    return a + w * (b - a)
  }
}

// ---------------------------------------------------------------------------
// Drawing helpers (in slab units: the context is scaled by the short side).
// ---------------------------------------------------------------------------

/** Adds a tapered ribbon along a crack to the current path. */
function ribbon(g: CanvasRenderingContext2D, pts: number[], arc: number[], width: number) {
  const n = pts.length / 2
  if (n < 2)
    return
  const L = arc[n - 1] || 1e-9
  const left: number[] = []
  const right: number[] = []
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1)
    const b = Math.min(n - 1, i + 1)
    let dx = pts[b * 2] - pts[a * 2]
    let dy = pts[b * 2 + 1] - pts[a * 2 + 1]
    const d = Math.hypot(dx, dy) || 1
    dx /= d
    dy /= d
    const s = Math.sin(Math.PI * Math.min(1, arc[i] / L))
    const hw = width * (0.42 + 0.58 * Math.sqrt(s)) / 2
    left.push(pts[i * 2] - dy * hw, pts[i * 2 + 1] + dx * hw)
    right.push(pts[i * 2] + dy * hw, pts[i * 2 + 1] - dx * hw)
  }
  g.moveTo(left[0], left[1])
  for (let i = 2; i < left.length; i += 2)
    g.lineTo(left[i], left[i + 1])
  for (let i = right.length - 2; i >= 0; i -= 2)
    g.lineTo(right[i], right[i + 1])
  g.closePath()
}

function polyline(g: CanvasRenderingContext2D, pts: number[], dx = 0, dy = 0) {
  g.moveTo(pts[0] + dx, pts[1] + dy)
  for (let i = 2; i < pts.length; i += 2)
    g.lineTo(pts[i] + dx, pts[i + 1] + dy)
}

function cellPath(g: CanvasRenderingContext2D, c: Cell) {
  g.beginPath()
  polyline(g, c.poly)
  g.closePath()
}

// ---------------------------------------------------------------------------
// Render.
// ---------------------------------------------------------------------------

function render(g: CanvasRenderingContext2D, W: number, H: number, hash: string) {
  const f = features(hash)
  const pal = PAL[f.Palette]
  const mat = MAT[f.Material]
  const S = Math.min(W, H)
  const w = W / S
  const h = H / S

  // Streams, always created in this order.
  const fr = stream(hash, 'field')
  const cr = stream(hash, 'cracks')
  const pr = stream(hash, 'cells')
  const wr = stream(hash, 'width')
  const gr = stream(hash, 'grain')
  const lr = stream(hash, 'layout')

  const thick = makeNoise(fr)
  const paint = makeNoise(fr)
  const detail = makeNoise(fr)
  const tScale = 1.1 + fr() * 1.2
  const pScale = 1.2 + fr() * 1.6
  const ox = fr() * 50
  const oy = fr() * 50
  const lightAngle = -Math.PI * (0.62 + fr() * 0.26)

  // Number of tiles along the short side (drawn for every layout).
  const tiles = 2 + Math.floor(lr() * 2)

  // Layer thickness sets the local spacing (thicker layer, wider cells).
  // A tile is a small slab: its crackle is finer.
  const lam0 = Math.max(0.03, SPACING[f.Density] * mat.scale * (f.Layout === 'Tiles' ? Math.min(0.75, 1.9 / tiles) : 1))
  const thickAt = (x: number, y: number) => thick((x - w / 2) * tScale + ox, (y - h / 2) * tScale + oy)
  const spacingAt = (x: number, y: number) => lam0 * (0.68 + 0.8 * thickAt(x, y))
  const paintAt = (x: number, y: number) => {
    const X = (x - w / 2) * pScale + oy
    const Y = (y - h / 2) * pScale + ox
    return 0.72 * paint(X, Y) + 0.28 * detail(X * 2.7, Y * 2.7)
  }

  // ---- crack network -------------------------------------------------------
  const lamMin = lam0 * 0.68
  const step = Math.min(0.006, lamMin / 4.5)
  const steer = 0.45
  const primary = f.Hierarchy === 'Two orders' ? 2.5 : 1
  const gridCell = Math.max(step * 1.5, lamMin * steer)
  const wobble = mat.wobble * Math.sqrt(step / 0.004) * (f.Hierarchy === 'Free' ? 1.7 : 1)
  const base: GrowOptions = {
    spacing: spacingAt,
    step,
    wobble,
    spread: f.Hierarchy === 'Free' ? 0.6 : f.Hierarchy === 'Cascade' ? 0.1 : 0.22,
    kink: mat.kink,
    steer,
    seeds: f.Hierarchy === 'Free' ? 3 : 1,
    patience: 140,
    order: 0,
  }
  // Layout: the whole canvas, a round piece (a bowl, a tondo, a puddle, a
  // frozen pool) centred on a cloth, or square tiles separated by grout.
  let border: number[]
  const discR = 0.43
  const wobbly = f.Material === 'Clay' || f.Material === 'Ice'
  const edgePhase = lr() * 100
  if (f.Layout === 'Round') {
    border = []
    const n = 180
    const edge = makeNoise(lr)
    for (let i = 0; i <= n; i++) {
      const a = (i % n) / n * Math.PI * 2
      let rad = discR
      if (wobbly)
        rad *= 0.94 + 0.12 * edge(Math.cos(a) * 1.6 + edgePhase, Math.sin(a) * 1.6)
      border.push(w / 2 + Math.cos(a) * rad, h / 2 + Math.sin(a) * rad)
    }
  }
  else {
    border = [0, 0, w, 0, w, h, 0, h, 0, 0]
  }
  const net = createNetwork(w, h, border, gridCell)
  let xs: number[] = []
  let ys: number[] = []
  if (f.Layout === 'Tiles') {
    // tile edges every 1 / tiles of the short side, centred on the canvas
    const ts = 1 / tiles
    const lines = (len: number) => {
      const out: number[] = []
      // an odd count puts a whole tile in the middle, an even one a joint
      const off = tiles % 2 ? ts / 2 : 0
      const first = ((len / 2 + off) % ts + ts) % ts
      for (let x = first; x < len - 1e-6; x += ts) {
        if (x > 1e-6)
          out.push(x)
      }
      return out
    }
    xs = lines(w)
    ys = lines(h)
    addGridLines(net, xs, ys, -1, 2)
  }
  const cap = Math.ceil(30 * w * h / (lamMin * lamMin))
  const seeds = f.Layout === 'Tiles' ? 0 : base.seeds
  if (f.Hierarchy === 'Two orders') {
    growPass(net, cr, { ...base, spacing: (x, y) => spacingAt(x, y) * primary, seeds: f.Layout === 'Tiles' ? 0 : 2, patience: 80 }, cap)
    growPass(net, cr, { ...base, seeds: 0, order: 1 }, cap)
  }
  else {
    growPass(net, cr, { ...base, seeds }, cap)
  }
  const cells = cellsOf(net)
  const cracks = net.cracks.slice(1)

  // Width of every crack, from its place in the hierarchy.
  const w0 = mat.width[0] + mat.width[1] * lam0
  const grout = 0.004 + 0.01 / tiles
  const widths = cracks.map((c) => {
    if (c.order === 2)
      return grout
    const jitter = 0.85 + wr() * 0.3
    if (f.Hierarchy === 'Two orders')
      return w0 * (c.order === 0 ? 1.55 : 0.55) * jitter
    if (f.Hierarchy === 'Cascade')
      return w0 * Math.max(0.32, 1.35 * 0.8 ** c.gen) * jitter
    return w0 * (0.55 + wr() * 0.55)
  })
  // Hierarchy rank in [0, 1]: 0 for the oldest, widest cracks.
  const rank = cracks.map((c) => {
    if (c.order === 2)
      return 0
    if (f.Hierarchy === 'Two orders')
      return c.order === 0 ? 0 : 1
    if (f.Hierarchy === 'Cascade')
      return Math.min(1, c.gen / 5)
    return 0.5
  })

  // ---- background ----------------------------------------------------------
  const P = {
    surface: pal.surface.map(hex) as RGB[],
    deep: hex(pal.deep),
    crack: hex(pal.crack),
    fine: hex(pal.fine),
    ground: hex(pal.ground),
    light: hex(pal.light),
  }
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.globalAlpha = 1
  g.globalCompositeOperation = 'source-over'
  g.fillStyle = pal.ground
  g.fillRect(0, 0, W, H)
  g.setTransform(S, 0, 0, S, 0, 0)
  g.lineJoin = 'round'
  g.lineCap = 'round'

  const lx = Math.cos(lightAngle)
  const ly = Math.sin(lightAngle)

  const borderPath = (dx = 0, dy = 0) => {
    g.beginPath()
    polyline(g, border, dx, dy)
    g.closePath()
  }
  if (f.Layout === 'Round') {
    // a cloth under the piece, and its soft shadow
    const cloth = mix(P.ground, P.deep, 0.55)
    const cg = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.hypot(w, h) / 2)
    cg.addColorStop(0, css(cloth, 1.12))
    cg.addColorStop(1, css(cloth, 0.8))
    g.fillStyle = cg
    g.fillRect(0, 0, w, h)
    for (let k = 1; k <= 4; k++) {
      g.fillStyle = 'rgba(0,0,0,0.12)'
      borderPath(-lx * 0.006 * k, -ly * 0.006 * k)
      g.fill()
    }
  }

  // ---- cells ---------------------------------------------------------------
  // a round piece keeps everything inside its edge
  g.save()
  if (f.Layout === 'Round') {
    borderPath()
    g.clip()
  }
  const iceTint = hex(f.Palette === 'Night' ? '#183049' : '#b9d5e0')
  const paintRamp = [P.deep, P.surface[2], P.surface[0], P.surface[1], P.light]
  for (const c of cells) {
    const jit = pr()
    const tilt = pr() * Math.PI * 2
    const v = paintAt(c.cx, c.cy)
    let col: RGB
    let k0 = 1
    let k1 = 1
    let ang = tilt
    switch (f.Material) {
      case 'Glaze':
        col = mix(mix(P.surface[2], P.surface[1], v), P.deep, 0.25 * (1 - thickAt(c.cx, c.cy)))
        col = mix(col, P.light, (jit - 0.5) * 0.08)
        k0 = 1.045
        k1 = 0.96
        break
      case 'Oil paint':
        col = ramp(paintRamp, (v - 0.22) * 1.75)
        col = mix(col, P.deep, jit * 0.08)
        k0 = 0.9
        k1 = 1.07
        ang = lightAngle + Math.PI
        break
      case 'Clay':
        col = mix(P.surface[2], P.surface[1], v * 0.55 + jit * 0.45)
        k0 = 1.08
        k1 = 0.9
        ang = lightAngle + Math.PI
        break
      default:
        col = mix(mix(P.surface[0], P.surface[1], v * 0.7 + jit * 0.3), iceTint, 0.5)
        k0 = 1.14
        k1 = 0.86
    }
    const rad = Math.sqrt(c.area / Math.PI) * 1.15
    const gx = Math.cos(ang) * rad
    const gy = Math.sin(ang) * rad
    const grad = g.createLinearGradient(c.cx - gx, c.cy - gy, c.cx + gx, c.cy + gy)
    grad.addColorStop(0, css(col, k0))
    grad.addColorStop(1, css(col, k1))
    g.fillStyle = grad
    cellPath(g, c)
    g.fill()
  }

  // ---- materials -----------------------------------------------------------
  const order = cracks.map((_, i) => i).filter(i => cracks[i].order !== 2).sort((a, b) => rank[b] - rank[a] || a - b)
  const joints = cracks.map((_, i) => i).filter(i => cracks[i].order === 2)

  // Raised rims: a shadow and a highlight band either side of each crack,
  // pushed along the light so that only the side facing it catches light.
  const bevel = (rim: number, alphaDark: number, alphaLight: number, list = order) => {
    const o = rim * 0.55
    for (const [dx, dy, color, alpha] of [[lx * o, ly * o, P.ground, alphaDark], [-lx * o, -ly * o, P.light, alphaLight]] as const) {
      g.strokeStyle = css(color, 1, alpha)
      g.lineCap = 'butt'
      for (const i of list) {
        g.lineWidth = widths[i] + rim * 2
        g.beginPath()
        polyline(g, cracks[i].pts, dx, dy)
        g.stroke()
      }
    }
    g.lineCap = 'round'
  }

  const fillRibbons = (color: string, scale: number, filter: (i: number) => boolean, dx = 0, dy = 0) => {
    g.fillStyle = color
    g.beginPath()
    for (const i of order) {
      if (!filter(i))
        continue
      const c = cracks[i]
      const pts = dx || dy ? c.pts.map((p, k) => p + (k & 1 ? dy : dx)) : c.pts
      ribbon(g, pts, c.arc, widths[i] * scale)
    }
    g.fill()
  }

  const all = () => true

  if (f.Material === 'Glaze') {
    // stain seeping into the glaze, then the line itself
    for (let band = 0; band < 3; band++) {
      const sel = (i: number) => Math.min(2, Math.floor(rank[i] * 3)) === band
      const tone = band === 0 ? P.crack : band === 1 ? mix(P.crack, P.fine, 0.6) : P.fine
      fillRibbons(css(tone, 1, 0.13), 3.6, sel)
      fillRibbons(css(tone, 1, 0.92), 1, sel)
    }
  }
  else if (f.Material === 'Oil paint') {
    bevel(w0 * 1.1 + lam0 * 0.02, 0.24, 0.16)
    fillRibbons(css(P.crack, 1, 0.9), 1, all)
    // varnish, yellowed unevenly
    g.globalCompositeOperation = 'multiply'
    const vg = g.createLinearGradient(0, 0, w, h)
    vg.addColorStop(0, css(hex(pal.varnish), 1, 0.18))
    vg.addColorStop(1, css(hex(pal.varnish), 1, 0.4))
    g.fillStyle = vg
    g.fillRect(0, 0, w, h)
    g.globalCompositeOperation = 'source-over'
  }
  else if (f.Material === 'Clay') {
    bevel(w0 * 0.55, 0.3, 0.22)
    // open gaps, with the shadow of the upper rim cast into them
    const sx = -lx * w0 * 0.45
    const sy = -ly * w0 * 0.45
    g.save()
    g.beginPath()
    for (const i of order)
      ribbon(g, cracks[i].pts, cracks[i].arc, widths[i])
    g.clip()
    g.fillStyle = css(P.ground, 0.55)
    g.fillRect(0, 0, w, h)
    fillRibbons(pal.ground, 1, all, sx, sy)
    g.restore()
    // grit on the tiles
    const dots = Math.round(2600 * w * h)
    const dot = 0.0016 + lam0 * 0.004
    for (const [color, alpha] of [[P.ground, 0.22], [P.light, 0.16]] as const) {
      g.fillStyle = css(color, 1, alpha)
      g.beginPath()
      for (let i = 0; i < dots / 2; i++) {
        const x = gr() * w
        const y = gr() * h
        const s = dot * (0.4 + gr())
        g.rect(x, y, s, s)
      }
      g.fill()
    }
  }
  else {
    // ice: fracture planes catch the light as pale sheets
    fillRibbons(css(P.light, 1, 0.1), 6, all)
    fillRibbons(css(P.light, 1, 0.28), 2.4, all)
    fillRibbons(css(P.light, 1, 0.3), 0.8, all, w0 * 1.6, -w0 * 1.1)
    fillRibbons(css(P.light, 1, 0.92), 0.9, all)
    // trapped air
    const bubbles = Math.round(90 * w * h)
    g.fillStyle = css(P.light, 1, 0.35)
    g.beginPath()
    for (let i = 0; i < bubbles; i++) {
      const x = gr() * w
      const y = gr() * h
      const r = 0.0015 + gr() ** 3 * 0.006
      g.moveTo(x + r, y)
      g.arc(x, y, r, 0, Math.PI * 2)
    }
    g.fill()
  }

  g.restore()

  // ---- joints and rims ----------------------------------------------------
  if (joints.length) {
    bevel(grout * 0.35, 0.4, 0.45, joints)
    g.strokeStyle = css(mix(P.light, P.ground, 0.4))
    g.lineCap = 'square'
    g.lineWidth = grout
    g.beginPath()
    for (const i of joints)
      polyline(g, cracks[i].pts)
    g.stroke()
    g.lineCap = 'round'
  }
  if (f.Layout === 'Round') {
    // the lip of the piece catches the light on one side
    g.lineWidth = 0.008
    g.strokeStyle = css(P.light, 1, 0.45)
    borderPath(lx * 0.002, ly * 0.002)
    g.stroke()
    g.strokeStyle = 'rgba(0,0,0,0.35)'
    borderPath(-lx * 0.002, -ly * 0.002)
    g.stroke()
  }

  // ---- light over the whole surface -----------------------------------------
  if (f.Material === 'Glaze' || f.Material === 'Ice') {
    const cx = w / 2 + lx * 0.35
    const cy = h / 2 + ly * 0.35
    const gl = g.createRadialGradient(cx, cy, 0, cx, cy, 0.75)
    gl.addColorStop(0, css(P.light, 1, f.Material === 'Glaze' ? 0.2 : 0.14))
    gl.addColorStop(1, css(P.light, 1, 0))
    g.fillStyle = gl
    g.fillRect(0, 0, w, h)
  }
  const R = Math.hypot(w, h) / 2
  const vg = g.createRadialGradient(w / 2, h / 2, R * 0.45, w / 2, h / 2, R)
  vg.addColorStop(0, 'rgba(0,0,0,0)')
  vg.addColorStop(1, 'rgba(0,0,0,0.28)')
  g.fillStyle = vg
  g.fillRect(0, 0, w, h)

  g.setTransform(1, 0, 0, 1, 0, 0)
  g.globalAlpha = 1
}

export default {
  slug: 'crackle',
  title: 'Crackle',
  summary: 'Crack agents that leave older cracks at right angles and stop when they meet one, splitting a drying layer into cells of glaze, old paint, clay or ice.',
  order: 260,
  traits: TRAITS,
  features,
  render,
  // Seed-of-seeds 0xc4ac1e00 ("gallery" stream): the first hash found for each
  // material x layout pair, so the selection covers the whole table. The
  // first one, a crackle-glaze bowl, is the index cover.
  gallery: [
    '0xbf8ab86e8c672579f3f355a1068b764efc0ebe64e36182c2985e21d220018f9a',
    '0x9f098014fcaae9cfd6f09c4fb377712eb7eb9fd4d5ad5646f1de7583d4b83aae',
    '0x25e32c4c5e4ac9f4e561397e8ad09c6270ddc3c4de49b5a67e331060fdf93955',
    '0x870ff0d3dbb620c8bb9170b39aa3cdcf67c73b66253362762392a17274aaf4b4',
    '0x1cf69b350693d4c1e7d243ff7b73f409debc39636403253c535cfc0a5eea93e8',
    '0x240b75889437132518952071c14c4995ef34ea55262bf28d059cb68897d239a6',
    '0x8c012a9f080bf71be52c03cd06bf625396ed75cc1729d965e39e2ed64a6348ff',
    '0x8615dcf1db50809cc946af46704ef64e2b71ab98cba4a5b77393268b06a7fa02',
    '0x11a5edd76c3b3562c94310f5cf942d6c402f9e474cb96e60fd2b01f62631751e',
    '0x53cb805e4c90af4a66fa1b10a6674741f46f55df02c2d114f5f2756eae03bc35',
    '0x083d81b966e5d8cf20628d1b313af9e9732e0cec2fb685bb2b56a702d7ea0b86',
    '0x5f975b88fd0bbd82fdd9938da215a65f3b4745beb620bf92a548b806d1c871bd',
  ],
} satisfies Series
