// "Origami" — folded paper: crease patterns and their folded relief.
//
// Each piece is one classic folding pattern laid over the canvas: Koryo
// Miura's map fold, Yoshimura's buckling diamonds, the waterbomb
// tessellation, square or hexagonal twist tessellations built by Bateman's
// shrink-and-rotate construction, or concentric radial pleats (see
// ../origami/patterns.ts). The pattern is drawn either as a crease-pattern
// diagram in origami notation (mountain = dash-dot, valley = dashed), as a
// relief of folded paper lit from one side, or as a sheet caught unfolding:
// flat diagram on one side, folded relief on the other.
//
// The relief is not a physical simulation. Each facet is tilted by the
// creases around it: away from a mountain (a ridge), up from a valley (a
// trough), weighted by crease length. A facet ringed by creases of one kind
// stays level, a facet between a mountain and a valley becomes a slope. The
// facet is then shaded by its normal under a directional light.
//
// Everything is a pure function of the hash, and every length is a fraction
// of the canvas short side. Wider or taller canvases show more of the same
// pattern around the same centre.

import type { CreaseSheet } from '../origami/patterns'
import type { Rng } from '../random'
import type { Series } from '../types'
import { hexTwist, KNOT, miura, MOUNTAIN, PLEAT, radial, squareTwist, TWIST, VALLEY, waterbomb, yoshimura } from '../origami/patterns'
import { chance, range, stream, weighted } from '../random'

// ---------------------------------------------------------------------------
// Rarity table — decided before the drawing code, never reordered.
// Changing a weight or an order re-rolls the whole edition.
// ---------------------------------------------------------------------------

const TRAITS = {
  Pattern: [['Miura-ori', 20], ['Yoshimura', 14], ['Waterbomb', 14], ['Square twist', 20], ['Hex twist', 16], ['Radial pleats', 16]],
  Render: [['Crease pattern', 35], ['Relief', 45], ['Unfolding', 20]],
  Paper: [['Washi', 26], ['Kami', 18], ['Kraft', 16], ['Indigo', 22], ['Sumi', 18]],
  Scale: [['Coarse', 25], ['Medium', 50], ['Fine', 25]],
  Sheet: [['Full bleed', 65], ['Square sheet', 35]],
} as const satisfies Record<string, ReadonlyArray<readonly [string, number]>>

type TraitName = keyof typeof TRAITS
type Features = { [K in TraitName]: typeof TRAITS[K][number][0] }

/** Pure function of the hash, computed before (and without) any rendering. */
function features(hash: string): Features {
  const r = stream(hash, 'features')
  return {
    Pattern: weighted(r, TRAITS.Pattern),
    Render: weighted(r, TRAITS.Render),
    Paper: weighted(r, TRAITS.Paper),
    Scale: weighted(r, TRAITS.Scale),
    Sheet: weighted(r, TRAITS.Sheet),
  }
}

// ---------------------------------------------------------------------------
// Papers. Original colour sets: a cream washi, a dyed sheet of kami, brown
// kraft, indigo-dyed paper and black paper with metallic inks.
// ---------------------------------------------------------------------------

type RGB = readonly [number, number, number]

interface Paper {
  /** The flat sheet. */
  paper: RGB
  /** Lit and shadowed tints the relief leans towards. */
  hi: RGB
  lo: RGB
  /** Crease-pattern inks. */
  mountain: string
  valley: string
  /** Faint tint for twist polygons in the diagram. */
  tint: string
  /** The table under a square sheet. */
  ground: string
  dark: boolean
}

const hex = (s: string): RGB => [Number.parseInt(s.slice(1, 3), 16), Number.parseInt(s.slice(3, 5), 16), Number.parseInt(s.slice(5, 7), 16)]

const PAPER: Record<Features['Paper'], Paper> = {
  Washi: { paper: hex('#efe8da'), hi: hex('#fffcf4'), lo: hex('#6f6250'), mountain: '#b5372b', valley: '#27466a', tint: '#c9a46a', ground: '#3a3631', dark: false },
  Kami: { paper: hex('#d4583f'), hi: hex('#ffb08a'), lo: hex('#4d140c'), mountain: '#fff1df', valley: '#3a0f0a', tint: '#f3c04d', ground: '#ebe4d6', dark: false },
  Kraft: { paper: hex('#c4a174'), hi: hex('#f1dcb6'), lo: hex('#4a3420'), mountain: '#9c2a17', valley: '#1c3a5a', tint: '#7a5a34', ground: '#f0ebe2', dark: false },
  Indigo: { paper: hex('#1f3155'), hi: hex('#7d9dd0'), lo: hex('#060a16'), mountain: '#f2e7cf', valley: '#86b4e3', tint: '#c9a24a', ground: '#0a0e19', dark: true },
  Sumi: { paper: hex('#2c2a27'), hi: hex('#938c80'), lo: hex('#030303'), mountain: '#d8b45c', valley: '#bdb8ae', tint: '#d8b45c', ground: '#34302b', dark: true },
}

/** Cell size as a fraction of the short side, before the pattern's own factor. */
const SCALE: Record<Features['Scale'], number> = { Coarse: 0.15, Medium: 0.1, Fine: 0.066 }
const LINE: Record<Features['Scale'], number> = { Coarse: 0.0027, Medium: 0.0021, Fine: 0.0017 }

const rgb = (c: RGB) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x)
function smooth(x: number) {
  const t = clamp(x, 0, 1)
  return t * t * (3 - 2 * t)
}

// ---------------------------------------------------------------------------
// Pattern geometry, drawn from the 'geometry' stream in a fixed order.
// Returns the sheet and its cell size factor and dash scale.
// ---------------------------------------------------------------------------

interface Built {
  sheet: CreaseSheet
  /** Multiplies the cell size of the Scale trait. */
  cell: number
}

function build(pattern: Features['Pattern'], r: Rng, R: (cell: number) => number): Built {
  switch (pattern) {
    case 'Miura-ori': {
      const cell = 1
      const b = range(r, 0.85, 1.5)
      const d = range(r, 0.22, 0.5) * b
      return { sheet: miura(R(cell), b, d), cell }
    }
    case 'Yoshimura': {
      const cell = 1.15
      const h = range(r, 0.42, 0.75)
      return { sheet: yoshimura(R(cell), h), cell }
    }
    case 'Waterbomb': {
      const cell = 0.62
      const hb = range(r, 0.8, 1.25)
      return { sheet: waterbomb(R(cell), hb), cell }
    }
    case 'Square twist': {
      const cell = 1.45
      const s = range(r, 0.42, 0.62)
      const th = range(r, 12, 34) * Math.PI / 180
      return { sheet: squareTwist(R(cell), s, chance(r, 0.5) ? th : -th), cell }
    }
    case 'Hex twist': {
      const cell = 1.5
      const s = range(r, 0.45, 0.62)
      // below about 20 degrees the pleats meet at angles that admit no
      // flat-foldable mountain-valley assignment
      const th = range(r, 22, 34) * Math.PI / 180
      return { sheet: hexTwist(R(cell), s, chance(r, 0.5) ? th : -th), cell }
    }
    case 'Radial pleats': {
      const cell = 0.42
      const n = weighted(r, [[4, 34], [6, 24], [8, 18], [3, 10], [12, 14]] as const)
      // a flat side at the bottom, square rings parallel to the canvas
      const phase = Math.PI / 2 + Math.PI / n
      return { sheet: radial(R(cell), n, 1, phase), cell }
    }
  }
}

// ---------------------------------------------------------------------------
// Paper grain: short fibres, laid once on a small tile from the hash and
// repeated with a transform tied to the short side, so the grain is the same
// size relative to the picture at any resolution.
// ---------------------------------------------------------------------------

function paperGrain(g: CanvasRenderingContext2D, W: number, H: number, S: number, r: Rng, dark: boolean) {
  if (typeof document === 'undefined' && typeof OffscreenCanvas === 'undefined')
    return
  const T = 256
  const tile = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(T, T) : Object.assign(document.createElement('canvas'), { width: T, height: T })
  const t = tile.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
  if (!t)
    return
  t.lineCap = 'round'
  for (let i = 0; i < 900; i++) {
    const x = r() * T
    const y = r() * T
    const a = r() * Math.PI
    const l = 2 + r() * 9
    const light = r() < 0.5
    t.strokeStyle = light ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)'
    t.globalAlpha = 0.25 + r() * 0.5
    t.lineWidth = 0.5 + r() * 0.7
    t.beginPath()
    for (const ox of [-T, 0, T]) {
      for (const oy of [-T, 0, T]) {
        t.moveTo(x + ox, y + oy)
        t.lineTo(x + ox + Math.cos(a) * l, y + oy + Math.sin(a) * l)
      }
    }
    t.stroke()
  }
  const pat = g.createPattern(tile, 'repeat')
  if (!pat)
    return
  // one tile spans a fifth of the short side
  const k = (S * 0.2) / T
  pat.setTransform(new DOMMatrix([k, 0, 0, k, 0, 0]))
  g.globalAlpha = dark ? 0.1 : 0.14
  g.fillStyle = pat
  g.fillRect(0, 0, W, H)
  g.globalAlpha = 1
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function render(g: CanvasRenderingContext2D, W: number, H: number, hash: string) {
  const f = features(hash)
  const pal = PAPER[f.Paper]
  const S = Math.min(W, H)
  const cx = W / 2
  const cy = H / 2

  // streams, created in a fixed order; each serves one domain
  const geo = stream(hash, 'geometry')
  const light = stream(hash, 'light')
  const grain = stream(hash, 'grain')

  // sheet placement and pattern orientation (always the same draws)
  const sheetMode = f.Sheet === 'Square sheet'
  const sheetSide = 0.8 * S
  const sheetTilt = range(geo, -0.1, 0.1)
  const tiltPick = geo()
  const tiltFine = range(geo, -0.35, 0.35)
  let rot: number
  if (sheetMode)
    rot = sheetTilt
  else if (tiltPick < 0.5)
    rot = 0
  else if (tiltPick < 0.8)
    rot = tiltFine
  else
    rot = Math.PI / 4
  const foldTan = range(geo, 0.5, 0.85)
  const sweep = range(geo, 0, Math.PI * 2)

  const cellBase = SCALE[f.Scale] * S
  const reach = sheetMode ? sheetSide * Math.SQRT1_2 : 0.5 * Math.hypot(W, H)
  const built = build(f.Pattern, geo, cell => reach / (cellBase * cell) + 1.5)
  const sh = built.sheet
  const c = cellBase * built.cell
  const reachN = reach / c

  // the drape: the sheet as a whole is not flat. A Yoshimura sheet buckles
  // into a vault, a waterbomb sheet bulges into a dome, the others sag in
  // gentle waves. Slopes in pattern units, scaled by the fold.
  const vault = range(geo, 0.45, 0.75)
  const waves = [0, 1].map(() => ({
    a: range(geo, 0.05, 0.11),
    k: range(geo, 1.2, 2.6),
    d: range(geo, 0, Math.PI * 2),
    p: range(geo, 0, Math.PI * 2),
  }))
  const drape = (x: number, y: number): [number, number] => {
    const u = x / reachN
    const v = y / reachN
    if (f.Pattern === 'Yoshimura')
      return [-vault * u, 0]
    if (f.Pattern === 'Waterbomb')
      return [-vault * 0.7 * u, -vault * 0.7 * v]
    let gx = 0
    let gy = 0
    for (const w of waves) {
      const dx = Math.cos(w.d)
      const dy = Math.sin(w.d)
      const s = w.a * Math.cos(w.k * Math.PI * (u * dx + v * dy) + w.p)
      gx += s * dx
      gy += s * dy
    }
    return [gx, gy]
  }

  // to the screen
  const cr = Math.cos(rot)
  const sr = Math.sin(rot)
  const nV = sh.x.length
  const px = new Float64Array(nV)
  const py = new Float64Array(nV)
  for (let i = 0; i < nV; i++) {
    px[i] = cx + c * (cr * sh.x[i] - sr * sh.y[i])
    py[i] = cy + c * (sr * sh.x[i] + cr * sh.y[i])
  }

  // light: from the upper left of the pattern, a little to either side, so
  // it never grazes the main slopes of a rotated pattern at right angles
  const az = rot - 2.3 + range(light, -0.45, 0.45)
  const el = range(light, 0.6, 0.85)
  const Lx = Math.cos(el) * Math.cos(az)
  const Ly = Math.cos(el) * Math.sin(az)
  const Lz = Math.sin(el)

  // background, then the sheet (with its shadow) as a clip
  g.globalAlpha = 1
  g.setLineDash([])
  g.fillStyle = sheetMode ? pal.ground : rgb(pal.paper)
  g.fillRect(0, 0, W, H)
  const sheetPath = new Path2D()
  if (sheetMode) {
    const h = sheetSide / 2
    const cs = Math.cos(sheetTilt)
    const sn = Math.sin(sheetTilt)
    const corners = [[-h, -h], [h, -h], [h, h], [-h, h]]
    corners.forEach(([x, y], k) => {
      const X = cx + cs * x - sn * y
      const Y = cy + sn * x + cs * y
      if (k === 0)
        sheetPath.moveTo(X, Y)
      else
        sheetPath.lineTo(X, Y)
    })
    sheetPath.closePath()
    g.save()
    g.shadowColor = pal.dark ? 'rgba(0,0,0,0.75)' : 'rgba(30,20,10,0.35)'
    g.shadowBlur = 0.035 * S
    g.shadowOffsetX = 0.008 * S
    g.shadowOffsetY = 0.014 * S
    g.fillStyle = rgb(pal.paper)
    g.fill(sheetPath)
    g.restore()
    g.save()
    g.clip(sheetPath)
  }

  // fold amount of each facet: 1 everywhere for a relief, 0 for a diagram,
  // a soft sweep across the canvas for an unfolding sheet
  const dirX = Math.cos(sweep)
  const dirY = Math.sin(sweep)
  const foldAt = (x: number, y: number) => {
    if (f.Render === 'Relief')
      return 1
    if (f.Render === 'Crease pattern')
      return 0
    const t = ((x - cx) * dirX + (y - cy) * dirY) / S
    return smooth((t + 0.28) / 0.56)
  }

  const nF = sh.faces.length
  const relief = f.Render !== 'Crease pattern'

  if (relief) {
    for (let fi = 0; fi < nF; fi++) {
      const vs = sh.faces[fi]
      const sides = sh.sides[fi]
      const n = vs.length
      // orientation (shoelace) and centroid, in pattern units
      let area = 0
      let mx = 0
      let my = 0
      let lx = 0
      let ly = 0
      for (let k = 0; k < n; k++) {
        const a = vs[k]
        const b = vs[(k + 1) % n]
        area += sh.x[a] * sh.y[b] - sh.x[b] * sh.y[a]
        mx += px[a]
        my += py[a]
        lx += sh.x[a]
        ly += sh.y[a]
      }
      mx /= n
      my /= n
      const sgn = area > 0 ? 1 : -1
      // tilt: up from valleys, down from mountains, weighted by length
      let gx = 0
      let gy = 0
      let per = 0
      for (let k = 0; k < n; k++) {
        const a = vs[k]
        const b = vs[(k + 1) % n]
        const dx = sh.x[b] - sh.x[a]
        const dy = sh.y[b] - sh.y[a]
        per += Math.hypot(dx, dy)
        const t = sh.mv[sides[k]]
        const s = t === VALLEY ? 1 : t === MOUNTAIN ? -1 : 0
        gx += s * sgn * -dy
        gy += s * sgn * dx
      }
      const fold = foldAt(mx, my)
      const k = (foldTan * fold) / per
      const [dx0, dy0] = drape(lx / n, ly / n)
      gx = gx * k + dx0 * fold
      gy = gy * k + dy0 * fold
      // pattern frame to screen frame
      const sx = cr * gx - sr * gy
      const sy = sr * gx + cr * gy
      const nl = Math.hypot(sx, sy, 1)
      const dot = (-sx * Lx - sy * Ly + Lz) / nl
      let b = (dot - Lz) * 1.9 + range(grain, -0.02, 0.02) * fold
      b = clamp(b, -1, 1)
      const col = b < 0 ? mix(pal.paper, pal.lo, -b * 0.85) : mix(pal.paper, pal.hi, b * 0.9)
      const style = rgb(col)
      g.beginPath()
      g.moveTo(px[vs[0]], py[vs[0]])
      for (let q = 1; q < n; q++)
        g.lineTo(px[vs[q]], py[vs[q]])
      g.closePath()
      g.fillStyle = style
      g.fill()
      // a hairline of the same colour hides the anti-aliasing seams
      g.strokeStyle = style
      g.lineWidth = Math.max(0.8, S * 0.0007)
      g.stroke()
    }
  }
  else {
    // a faint wash on twist polygons, as on tessellation diagrams
    g.fillStyle = pal.tint
    for (let fi = 0; fi < nF; fi++) {
      const cls = sh.cls[fi]
      if (cls !== TWIST && cls !== KNOT && cls !== PLEAT)
        continue
      g.globalAlpha = cls === TWIST ? 0.16 : cls === KNOT ? 0.08 : 0.035
      const vs = sh.faces[fi]
      g.beginPath()
      g.moveTo(px[vs[0]], py[vs[0]])
      for (let q = 1; q < vs.length; q++)
        g.lineTo(px[vs[q]], py[vs[q]])
      g.closePath()
      g.fill()
    }
    g.globalAlpha = 1
  }

  // creases, grouped by kind and by how folded the paper is around them
  const BINS = f.Render === 'Unfolding' ? 6 : 1
  const diagram: Path2D[][] = [[], []]
  const ridges: Path2D[][] = [[], []]
  for (let i = 0; i < BINS; i++) {
    for (const list of [diagram, ridges]) {
      list[0].push(new Path2D())
      list[1].push(new Path2D())
    }
  }
  const nE = sh.ea.length
  for (let e = 0; e < nE; e++) {
    const t = sh.mv[e]
    if (t !== MOUNTAIN && t !== VALLEY)
      continue
    const a = sh.ea[e]
    const b = sh.eb[e]
    const fold = foldAt((px[a] + px[b]) / 2, (py[a] + py[b]) / 2)
    const bin = Math.min(BINS - 1, Math.floor(fold * BINS))
    const kind = t === MOUNTAIN ? 0 : 1
    if (fold < 0.999) {
      const p = diagram[kind][bin]
      p.moveTo(px[a], py[a])
      p.lineTo(px[b], py[b])
    }
    if (fold > 0.001) {
      const p = ridges[kind][bin]
      p.moveTo(px[a], py[a])
      p.lineTo(px[b], py[b])
    }
  }

  const lw = LINE[f.Scale] * S
  const u = c * 0.034
  g.lineCap = 'butt'
  g.lineJoin = 'round'
  for (let i = 0; i < BINS; i++) {
    const fold = BINS === 1 ? (relief ? 1 : 0) : (i + 0.5) / BINS
    // the folded paper: ridges catch the light, troughs hold a shadow
    if (relief && fold > 0) {
      g.setLineDash([])
      g.lineWidth = lw * 0.55
      g.globalAlpha = 0.32 * fold
      g.strokeStyle = rgb(pal.hi)
      g.stroke(ridges[0][i])
      g.globalAlpha = 0.4 * fold
      g.strokeStyle = rgb(pal.lo)
      g.stroke(ridges[1][i])
    }
    // the diagram: mountain dash-dot, valley dashed
    const ink = BINS === 1 ? 1 : (1 - fold) ** 1.5
    if (!relief || (f.Render === 'Unfolding' && ink > 0.02)) {
      g.globalAlpha = ink
      g.lineWidth = lw
      g.setLineDash([5 * u, 1.6 * u, 0.9 * u, 1.6 * u])
      g.strokeStyle = pal.mountain
      g.stroke(diagram[0][i])
      g.setLineDash([4 * u, 2.2 * u])
      g.strokeStyle = pal.valley
      g.stroke(diagram[1][i])
    }
  }
  g.setLineDash([])
  g.globalAlpha = 1

  // the light falls off across the sheet, and the paper has a grain
  const lx0 = cx + Lx * S * 0.9
  const ly0 = cy + Ly * S * 0.9
  const fall = g.createRadialGradient(lx0, ly0, 0, lx0, ly0, S * 1.9)
  fall.addColorStop(0, pal.dark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.10)')
  fall.addColorStop(0.5, 'rgba(0,0,0,0)')
  fall.addColorStop(1, pal.dark ? 'rgba(0,0,0,0.30)' : 'rgba(40,25,10,0.16)')
  g.fillStyle = fall
  g.fillRect(0, 0, W, H)
  paperGrain(g, W, H, S, grain, pal.dark)

  if (sheetMode) {
    g.restore()
    // the cut edge of the sheet
    g.strokeStyle = pal.dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.18)'
    g.lineWidth = Math.max(1, S * 0.0012)
    g.stroke(sheetPath)
  }
}

export default {
  slug: 'origami',
  title: 'Origami',
  summary: 'Miura-ori, Yoshimura, waterbomb, twist and radial pleat tessellations, drawn as crease patterns in origami notation or as folded paper lit from the side.',
  order: 400,
  traits: TRAITS,
  features,
  render,
  // Seed-of-seeds 0x0016a3100 ("gallery" stream, 64-hex candidates): the
  // first hash found for each Pattern x Render pair, twelve pairs in the
  // order found, with the square-twist relief moved first as the cover.
  gallery: [
    '0x1db201269e8237672519212114b47829eb6a273a0a8edfd87ed8d973397efa53',
    '0x78feac7b40488be4aa2590187e1adfa2df9da42921f179873e34cd5130d58321',
    '0x4eab1ac6ed2e0fc53dd4e9de93f444be04d19904bc0fb0072cc2dd8a39b67650',
    '0x9945b405d42fb1200427bf3586b47454fa37ea5049a17806c096ba1a6531010c',
    '0xdf97e89e1fd2ed9e2a8f3cbd3b392a1749be109608c7f79dd27f3c3aba1830a4',
    '0x1904172c59b61a6ef527609d34ab06fd74c82abc2cb70ac21f44ddfbef29cd2d',
    '0xdbdb86fddfcd2051d7c6617bc9b01e32e00e57bdbe7f96f673fc4036f555603f',
    '0x342fbb57aaab02a19def2e3eddf9ddd508b77484db9a6a88d1e339fd89bfa077',
    '0xc51f6f2d8ae6f89db7b8a9a67ba56122d4a04e447046cbc3c401c2d4f36e3f9f',
    '0x48b9ab7566ce8ca668e0dce83227acba99940146a78331dbfb3a74983a424b2a',
    '0x01ad4c47492cba41ef9dd066871714d8f9a9ece1db18c702af5943a7bec071a3',
    '0x609e600afbce642dc5e6fd48536f5f01f40e996fa2667ca9fce7b1327cfa8663',
  ],
} satisfies Series
