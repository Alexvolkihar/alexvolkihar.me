// "Bristle" — an abstract field of tufts.
//
// The sheet is cut into angular patches: Voronoi shards, guillotine blocks,
// triangles or slanted bands (../bristle/geometry.ts). Every patch gets an
// emitter layout (a grid of tufts, one burst, rows of waves, or a comb of
// barbed spines) and a local motion (a steady bend, a swirl, a droop, a gust
// or a pinch that gathers the tips). Then tens of thousands of short, thin,
// tapered strokes are rooted by the emitters and painted with low alpha, so
// overlaps build density. A stroke's length and brightness depend on how it
// faces a single light, which makes the tufts read as small domes, the bursts
// as rippled cones, the waves as ridges and the combs as gabled roofs.
//
// Strokes are batched: one path per light level, ink and stroke half, stroked
// once per tuft or row, darkest level first, so later tufts lie on earlier
// ones. Each patch is painted unclipped on a layer, then cut to its polygon.
// Everything is a pure function of the hash, and every length is a fraction
// of the canvas short side.

import type { Poly } from '../bristle/geometry'
import type { Rng } from '../random'
import type { Series } from '../types'
import { area, bands, bbox, blocks, centroid, distField, facets, inset, rayExit, shards, signedDist } from '../bristle/geometry'
import { range, stream, weighted } from '../random'

// Rarity table, decided before the drawing code. Never reorder: it re-rolls the edition.
const TRAITS = {
  Palette: [['Ember', 24], ['Lagoon', 22], ['Saffron', 20], ['Nocturne', 18], ['Linen', 16]],
  Patches: [['Shards', 30], ['Blocks', 28], ['Facets', 22], ['Bands', 20]],
  Tufts: [['Grid', 26], ['Waves', 22], ['Comb', 18], ['Burst', 14], ['Mixed', 20]],
  Motion: [['Combed', 24], ['Swirled', 20], ['Drooping', 18], ['Windswept', 16], ['Pinched', 10], ['Restless', 12]],
  Density: [['Sparse', 22], ['Dense', 54], ['Lush', 24]],
} as const

type TraitName = keyof typeof TRAITS
type Features = { [K in TraitName]: typeof TRAITS[K][number][0] }
type Emitter = 'Grid' | 'Waves' | 'Comb' | 'Burst'
type Motion = 'Combed' | 'Swirled' | 'Drooping' | 'Windswept' | 'Pinched'

const EMITTERS: readonly Emitter[] = ['Grid', 'Waves', 'Comb', 'Burst']
const MOTIONS: readonly Motion[] = ['Combed', 'Swirled', 'Drooping', 'Windswept', 'Pinched']

function features(hash: string): Features {
  const r = stream(hash, 'features')
  return {
    Palette: weighted(r, TRAITS.Palette),
    Patches: weighted(r, TRAITS.Patches),
    Tufts: weighted(r, TRAITS.Tufts),
    Motion: weighted(r, TRAITS.Motion),
    Density: weighted(r, TRAITS.Density),
  }
}

interface Palette {
  bg: string
  /** Four inks, the first ones most frequent. */
  inks: readonly [string, string, string, string]
  /** Colour of the strokes turned away from the light. */
  shade: string
  /** Colour the lit strokes drift towards. */
  light: string
  /** Strength of the flat tint laid under each patch. */
  under: number
}

// Original palettes; Linen is the light one.
const PAL: Record<Features['Palette'], Palette> = {
  Ember: { bg: '#0f0b0a', inks: ['#c8352a', '#e6782d', '#ecdcbf', '#efb23b'], shade: '#1c0d0a', light: '#fff1d6', under: 0.05 },
  Lagoon: { bg: '#071114', inks: ['#178a80', '#71c9b9', '#e9e1c9', '#d86c34'], shade: '#05181b', light: '#effff8', under: 0.05 },
  Saffron: { bg: '#0b0a08', inks: ['#f0bd2c', '#d27a24', '#7c58ba', '#efe4c8'], shade: '#1b1308', light: '#fff6d8', under: 0.045 },
  Nocturne: { bg: '#0d0a15', inks: ['#8b5cd6', '#d35d8b', '#dacdec', '#41a6a0'], shade: '#120c22', light: '#f7efff', under: 0.05 },
  Linen: { bg: '#ece4d3', inks: ['#25336a', '#c2452a', '#1d6e68', '#c4881c'], shade: '#141626', light: '#fbf6ea', under: 0.035 },
}

const INK_WEIGHTS = [['0', 34], ['1', 28], ['2', 22], ['3', 16]] as const

interface Density {
  /** Strokes per unit area (the short side is 1). */
  per: number
  /** Root width of a stroke. */
  width: number
}

const DENSITY: Record<Features['Density'], Density> = {
  Sparse: { per: 11500, width: 0.0028 },
  Dense: { per: 16500, width: 0.0024 },
  Lush: { per: 22000, width: 0.0021 },
}

/** Light levels per ink: one batch each. */
const NL = 7

function hex(c: string): [number, number, number] {
  const n = Number.parseInt(c.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function mixHex(a: string, b: string, t: number): [number, number, number] {
  const A = hex(a)
  const B = hex(b)
  return [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]
}

const css = (c: [number, number, number], a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`

/**
 * Shadow, ink, then a partial move towards the light colour; bright inks move
 * less, so a lit yellow stays yellow instead of washing out to cream.
 */
function ramp(pal: Palette, ink: string): [number, number, number][] {
  const out: [number, number, number][] = []
  const [r, g, b] = hex(ink)
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  const lift = 0.62 * (1 - 0.5 * lum)
  for (let l = 0; l < NL; l++) {
    const t = l / (NL - 1)
    if (t < 0.55)
      out.push(mixHex(pal.shade, ink, t / 0.55))
    else
      out.push(mixHex(ink, pal.light, (t - 0.55) / 0.45 * lift))
  }
  return out
}

/** Per-patch motion, resolved once. */
interface Mod {
  kind: Motion
  bend: number
  cx: number
  cy: number
  irho2: number
  spin: number
  gx: number
  gy: number
  pinch: number
}

function render(ctx: CanvasRenderingContext2D, W: number, H: number, hash: string) {
  const f = features(hash)
  const pal = PAL[f.Palette]
  const den = DENSITY[f.Density]
  const S = Math.min(W, H)
  const EW = W / S
  const EH = H / S

  // Fixed stream order: layout, patches, hairs.
  const lr = stream(hash, 'layout')
  const pr = stream(hash, 'patches')
  const hr = stream(hash, 'hairs')

  ctx.save()
  ctx.globalAlpha = 1
  ctx.fillStyle = pal.bg
  ctx.fillRect(0, 0, W, H)

  // --- layout ---------------------------------------------------------------
  const lightA = -0.75 * Math.PI + range(lr, -0.55, 0.55)
  const lx = Math.cos(lightA)
  const ly = Math.sin(lightA)
  const sheet = EW * EH
  let polys: Poly[]
  if (f.Patches === 'Shards')
    polys = shards(lr, EW, EH, Math.max(4, Math.round(sheet * range(lr, 6, 12))))
  else if (f.Patches === 'Blocks')
    polys = blocks(lr, EW, EH, Math.max(3, Math.round(sheet * range(lr, 5, 10))))
  else if (f.Patches === 'Facets')
    polys = facets(lr, EW, EH, Math.max(4, Math.round(sheet * range(lr, 7, 13))))
  else
    polys = bands(lr, EW, EH, Math.max(3, Math.round(EH * range(lr, 3, 6))))
  const gutter = range(lr, 0.0015, 0.0042)
  const windA = Math.PI / 2 + range(lr, -1.2, 1.2) + (lr() < 0.5 ? Math.PI : 0)

  // --- batched strokes --------------------------------------------------------
  // A stroke is a quadratic curve drawn in two halves: the root half at full
  // width, the tip half at half width, which tapers it. Each batch (light
  // level x ink x half) is SVG path data in 1/8 pixel integer units, parsed
  // once by Path2D and stroked in one call. Strokes no wider than 1.6 px are
  // drawn one pixel wide with their alpha scaled by their width, so the ink
  // per stroke, and the density, is the same at every size; hairlines are
  // also far faster to rasterise.
  const Q = 8
  const Z = S * Q
  const chords = S <= 1000
  const alpha = f.Palette === 'Linen' ? 0.6 : 0.6
  const lineW: number[] = []
  const colors: string[][] = []
  for (let part = 0; part < 2; part++) {
    const wpx = den.width * S * (part ? 0.5 : 1)
    const thin = wpx <= 1.6
    lineW.push((thin ? 1 : wpx) * Q)
    // a hairline carries `wpx` times the ink of a 1 px line; the 1.05 was
    // measured so that a 600 px render and a 2400 px one scaled down to 600
    // have the same mean tone
    const a = Math.min(1, alpha * (thin ? wpx * 1.05 : 1))
    colors.push(pal.inks.flatMap(c => ramp(pal, c).map(rgb => css(rgb, a))))
  }
  const paths: string[] = Array.from<string>({ length: 2 * 4 * NL }).fill('')
  let pending = 0
  // the patch layer and its offset on the sheet (set per patch below)
  let lc: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
  let layerX = 0
  let layerY = 0
  const flush = () => {
    if (!pending)
      return
    lc.setTransform(1 / Q, 0, 0, 1 / Q, -layerX, -layerY)
    for (let l = 0; l < NL; l++) {
      for (let i = 0; i < 4; i++) {
        for (let part = 0; part < 2; part++) {
          const k = (l * 4 + i) * 2 + part
          const d = paths[k]
          if (d) {
            lc.lineWidth = lineW[part]
            lc.strokeStyle = colors[part][i * NL + l]
            lc.stroke(new Path2D(d))
            paths[k] = ''
          }
        }
      }
    }
    pending = 0
  }

  let mod: Mod
  let ink1 = 0
  let ink2 = 0
  let mix2 = 0
  /** Share of the patch bend an emitter keeps (bursts stay nearly straight). */
  let bendK = 1
  /** Light contrast of the current patch. */
  let contrast = 1
  /** Strokes per unit area in the current patch. */
  let per = den.per

  /**
   * One tapered stroke rooted at (x, y), heading `a`, of length `L`, lit `b`
   * (0 shadow .. 1 highlight). (px, py) is where a pinch gathers its tip.
   */
  const hair = (x: number, y: number, a: number, L: number, b: number, px: number, py: number) => {
    let ang = a
    let bend = mod.bend * bendK * (0.55 + 0.9 * hr())
    if (mod.kind === 'Swirled') {
      const dx = x - mod.cx
      const dy = y - mod.cy
      const fall = Math.exp(-(dx * dx + dy * dy) * mod.irho2)
      ang += mod.spin * fall
      bend += mod.spin * 0.9 * fall
    }
    const dx = Math.cos(ang)
    const dy = Math.sin(ang)
    let tx = x + dx * L
    let ty = y + dy * L
    let cx = x + dx * L * 0.5 - dy * bend * L * 0.3
    let cy = y + dy * L * 0.5 + dx * bend * L * 0.3
    if (mod.kind === 'Drooping' || mod.kind === 'Windswept') {
      // the pull turns the stroke but never shortens it much: a stroke that
      // points against it would otherwise shrink and leave a dark gap
      const ex = dx + mod.gx
      const ey = dy + mod.gy
      const k = L * Math.max(0.85, Math.hypot(ex, ey)) / (Math.hypot(ex, ey) || 1)
      tx = x + ex * k
      ty = y + ey * k
      cx += mod.gx * L * 0.3
      cy += mod.gy * L * 0.3
    }
    else if (mod.kind === 'Pinched') {
      const k = mod.pinch * (0.7 + 0.3 * hr())
      const ex = (px - tx) * k
      const ey = (py - ty) * k
      tx += ex
      ty += ey
      cx += ex * 0.2
      cy += ey * 0.2
    }
    let lvl = Math.floor((0.5 + (b - 0.5) * contrast + (hr() - 0.5) * 0.3 * contrast) * NL)
    lvl = lvl < 0 ? 0 : lvl >= NL ? NL - 1 : lvl
    const ink = hr() < mix2 ? ink2 : ink1
    // de Casteljau split at t = 1/2
    const ax = (x + cx) * 0.5
    const ay = (y + cy) * 0.5
    const bx = (cx + tx) * 0.5
    const by = (cy + ty) * 0.5
    const mx = (ax + bx) * 0.5
    const my = (ay + by) * 0.5
    const k = (lvl * 4 + ink) * 2
    // integer path data, relative after the first point (short numbers parse
    // fast); on small canvases each half is a straight chord, since the
    // midpoint already lies on the curve
    const X0 = (x * Z) | 0
    const Y0 = (y * Z) | 0
    const XM = (mx * Z) | 0
    const YM = (my * Z) | 0
    if (chords) {
      paths[k] += `M${X0} ${Y0}l${XM - X0} ${YM - Y0}`
      paths[k + 1] += `M${XM} ${YM}l${((tx * Z) | 0) - XM} ${((ty * Z) | 0) - YM}`
    }
    else {
      paths[k] += `M${X0} ${Y0}q${((ax * Z) | 0) - X0} ${((ay * Z) | 0) - Y0} ${XM - X0} ${YM - Y0}`
      paths[k + 1] += `M${XM} ${YM}q${((bx * Z) | 0) - XM} ${((by * Z) | 0) - YM} ${((tx * Z) | 0) - XM} ${((ty * Z) | 0) - YM}`
    }
    // bounded batches: one huge path strokes slower than several short ones
    if (++pending >= 600)
      flush()
  }

  // --- emitters -----------------------------------------------------------------
  /**
   * Strokes per unit area for strokes of mean length `L`: long strokes get
   * fewer of them, so the ink laid per unit area (count x length) is capped
   * and the render time with it.
   */
  const budget = (L: number) => per * Math.min(1, 0.06 / L)

  const grid = (poly: Poly, q: number[]) => {
    const s = 0.05 + 0.045 * q[6]
    const rot = q[7] < 0.6 ? 0 : (q[7] - 0.6) * 2
    const hexRows = q[8] < 0.5
    const R = s * (0.62 + 0.3 * q[9])
    const pd = -Math.PI / 2 + (q[10] - 0.5) * 1.6
    const cr = Math.cos(rot)
    const sr = Math.sin(rot)
    const [bx0, by0, bx1, by1] = bbox(poly)
    const ccx = (bx0 + bx1) / 2
    const ccy = (by0 + by1) / 2
    const half = Math.hypot(bx1 - bx0, by1 - by0) / 2 + s
    const rowH = hexRows ? s * 0.866 : s
    const centres: [number, number][] = []
    for (let j = -Math.ceil(half / rowH); j <= Math.ceil(half / rowH); j++) {
      const off = hexRows && (j & 1) ? s / 2 : 0
      for (let i = -Math.ceil(half / s); i <= Math.ceil(half / s); i++) {
        const u = i * s + off
        const v = j * rowH
        const x = ccx + u * cr - v * sr + (hr() - 0.5) * 0.2 * s
        const y = ccy + u * sr + v * cr + (hr() - 0.5) * 0.2 * s
        if (signedDist(poly, x, y) < R * 0.45)
          centres.push([x, y])
      }
    }
    centres.sort((a, b) => a[1] - b[1] || a[0] - b[0])
    const n = Math.max(12, Math.round(budget(R * 0.85) * s * rowH))
    const pxo = Math.cos(pd) * R * 0.9
    const pyo = Math.sin(pd) * R * 0.9
    for (const [x0, y0] of centres) {
      const Rk = R * (0.85 + 0.3 * hr())
      for (let k = 0; k < n; k++) {
        const a = 2 * Math.PI * (k + hr()) / n
        const ca = Math.cos(a)
        const sa = Math.sin(a)
        const rr = Rk * 0.22 * Math.sqrt(hr())
        const facing = ca * lx + sa * ly
        const b = 0.5 + 0.42 * facing
        const L = Rk * (0.6 + 0.45 * hr()) * (0.82 + 0.36 * b)
        hair(x0 + ca * rr, y0 + sa * rr, a + (hr() - 0.5) * 0.2, L, b, x0 + pxo, y0 + pyo)
      }
      flush()
    }
  }

  const burst = (poly: Poly, q: number[]) => {
    const [gx, gy] = centroid(poly)
    const [bx0, by0, bx1, by1] = bbox(poly)
    let cx = gx + (q[6] - 0.5) * 0.6 * (bx1 - bx0)
    let cy = gy + (q[7] - 0.5) * 0.6 * (by1 - by0)
    for (let i = 0; i < 8 && signedDist(poly, cx, cy) > -0.02; i++) {
      cx = (cx + gx) / 2
      cy = (cy + gy) / 2
    }
    const lb = 0.05 + 0.045 * q[8]
    const n = Math.round(budget(lb * 0.95) * Math.abs(area(poly)) * 0.9)
    const lambda = 0.04 + 0.05 * q[9]
    const rays = 2 * Math.PI / (10 + Math.floor(q[10] * 16))
    for (let k = 0; k < n; k++) {
      const t = Math.sqrt((k + hr()) / n)
      const a = hr() * 2 * Math.PI
      const ca = Math.cos(a)
      const sa = Math.sin(a)
      const D = rayExit(poly, cx, cy, ca, sa)
      const rr = t * D * 0.98
      const facing = ca * lx + sa * ly
      const ripple = Math.sin(rr / lambda * 2 * Math.PI)
      // concentric ridges: brighter and longer on their crests
      const b = 0.48 + 0.24 * facing + 0.3 * ripple
      const L = lb * (0.7 + 0.5 * hr()) * (0.8 + 0.3 * ripple) * Math.min(1, 0.35 + rr / lb)
      const aq = Math.round(a / rays) * rays
      const reach = rr + L * 1.2
      hair(cx + ca * rr, cy + sa * rr, a + (hr() - 0.5) * 0.18, L, b, cx + Math.cos(aq) * reach, cy + Math.sin(aq) * reach)
    }
    flush()
  }

  // Wave rows: roots along stacked sine lines, strokes rising from each line.
  const waves = (poly: Poly, q: number[]) => {
    const s = 0.042 + 0.035 * q[6]
    const amp = s * (0.25 + 1.1 * q[7])
    const freq = 2 * Math.PI / (0.16 + 0.34 * q[8])
    // rows stay nearly in phase: even gaps, no blotches between them
    const shift = (q[9] - 0.5) * 0.8
    const lean = (q[10] - 0.5) * 0.7
    const phase0 = q[11] * 2 * Math.PI
    const [bx0, by0, bx1, by1] = bbox(poly)
    const Lmax = s * 1.6
    const sd = distField(poly)
    const perLen = budget(s * 1.37) * s
    const dxs = 1 / perLen
    const clump = s * 1.1
    let row = 0
    // top to bottom: each row covers the roots of the one above
    for (let y0 = by0 - amp; y0 <= by1 + amp + Lmax; y0 += s, row++) {
      const ph = phase0 + row * shift
      const rowTone = (row & 1) * 0.1 - 0.05
      const n = Math.ceil((bx1 - bx0 + 2 * s) * perLen)
      for (let k = 0; k < n; k++) {
        const x = bx0 - s + (k + hr()) * dxs
        const p = freq * x + ph
        const y = y0 + amp * Math.sin(p) + (hr() - 0.5) * s * 0.22
        if (sd(x, y) > 0 && sd(x, y - Lmax * 0.8) > 0)
          continue
        const slope = amp * freq * Math.cos(p)
        const nl = Math.hypot(slope, 1)
        const nx = slope / nl
        const ny = -1 / nl
        // lit by the slope of the row, crests a little brighter than troughs
        const b = 0.52 + 0.38 * (nx * lx + ny * ly) - 0.1 * Math.max(0, -ly) + 0.16 * Math.sin(p) + rowTone
        const L = s * (1.15 + 0.45 * hr()) * (0.85 + 0.3 * b)
        const pxc = Math.round(x / clump) * clump
        hair(x, y, Math.atan2(ny, nx) + lean + (hr() - 0.5) * 0.5, L, b, pxc + nx * L, y + ny * L * 1.25)
      }
      flush()
    }
  }

  // Comb: straight spines, strokes leaving both sides at a slant like the
  // barbs of a feather; the side facing the light is lit, the other one is in
  // shade, so every spine reads as a ridge.
  const comb = (poly: Poly, q: number[]) => {
    let th = (q[6] - 0.5) * 1.1
    if (q[11] < 0.35)
      th += Math.PI / 2
    const ux = Math.cos(th)
    const uy = Math.sin(th)
    const vx = -uy
    const vy = ux
    const sp = 0.055 + 0.055 * q[7]
    const lean = (0.2 + 0.75 * q[9]) * (q[8] < 0.5 ? 1 : -1)
    const Lb = sp * 0.55 / Math.cos(lean)
    const period = sp * (2 + 5 * q[10])
    const sd = distField(poly)
    let u0 = Infinity
    let u1 = -Infinity
    let v0 = Infinity
    let v1 = -Infinity
    for (const [x, y] of poly) {
      const u = x * ux + y * uy
      const v = x * vx + y * vy
      u0 = Math.min(u0, u)
      u1 = Math.max(u1, u)
      v0 = Math.min(v0, v)
      v1 = Math.max(v1, v)
    }
    const perLen = budget(Lb) * sp
    const sides: [number, number, number][] = []
    for (const side of [1, -1]) {
      // the barb heading: across the spine, turned forward along it
      const a = Math.atan2(side * vy, side * vx) - side * lean
      sides.push([a, Math.cos(a), Math.sin(a)])
    }
    const cl = sp * 0.6
    for (let v = v0 - sp * 0.3 + sp * 0.5 * q[12]; v <= v1 + sp * 0.5; v += sp) {
      const n = Math.ceil((u1 - u0 + 2 * Lb) * perLen)
      for (let k = 0; k < n; k++) {
        const u = u0 - Lb + (k + hr()) / perLen
        const side = k & 1
        const [a, ax, ay] = sides[side]
        const vv = v + (hr() - 0.5) * sp * 0.06
        const x = u * ux + vv * vx
        const y = u * uy + vv * vy
        const env = 0.78 + 0.22 * Math.sin(u / period * 2 * Math.PI)
        const L = Lb * env * (0.85 + 0.3 * hr())
        if (sd(x, y) > 0 && sd(x + ax * L, y + ay * L) > 0)
          continue
        const b = 0.5 + 0.48 * (ax * lx + ay * ly) + 0.12 * (env - 0.78) / 0.22
        const uc = Math.round(u / cl) * cl + L * 0.6
        const sv = vv + (side ? -1 : 1) * L * 0.7
        hair(x, y, a + (hr() - 0.5) * 0.16, L, b, uc * ux + sv * vx, uc * uy + sv * vy)
      }
      flush()
    }
  }

  // --- patches ---------------------------------------------------------------------
  // Strokes are painted unclipped on a layer the size of the patch's bounding
  // box, cut to the polygon in one compositing step, then copied onto the
  // sheet: much cheaper than clipping every batch to an antialiased path.
  const insets = polys.map(o => inset(o, gutter))
  const boxes = insets.map((p) => {
    if (p.length < 3)
      return [0, 0, 0, 0]
    const [x0, y0, x1, y1] = bbox(p)
    const ox = Math.max(0, Math.floor(x0 * S) - 1)
    const oy = Math.max(0, Math.floor(y0 * S) - 1)
    return [ox, oy, Math.min(W, Math.ceil(x1 * S) + 1) - ox, Math.min(H, Math.ceil(y1 * S) + 1) - oy]
  })
  const LW = Math.max(1, ...boxes.map(b => b[2]))
  const LH = Math.max(1, ...boxes.map(b => b[3]))
  const layer = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(LW, LH)
    : Object.assign(document.createElement('canvas'), { width: LW, height: LH })
  lc = layer.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

  for (let pi = 0; pi < polys.length; pi++) {
    // a fixed number of draws per patch keeps later patches stable
    const q: number[] = []
    for (let i = 0; i < 16; i++)
      q.push(pr())
    const poly = insets[pi]
    if (poly.length < 3 || Math.abs(area(poly)) < 1e-4)
      continue
    const emitter: Emitter = f.Tufts === 'Mixed' ? EMITTERS[Math.floor(q[0] * 4)] : f.Tufts
    const motion: Motion = f.Motion === 'Restless' ? MOTIONS[Math.floor(q[1] * 5)] : f.Motion
    ink1 = Number(weighted(constRng(q[2]), INK_WEIGHTS))
    ink2 = (ink1 + 1 + Math.floor(q[3] * 3)) % 4
    mix2 = q[4] < 0.45 ? 0 : 0.06 + 0.3 * (q[4] - 0.45)
    const [gx, gy] = centroid(poly)
    const [bx0, by0, bx1, by1] = bbox(poly)
    const size = Math.max(bx1 - bx0, by1 - by0)
    const dir = q[12] < 0.5 ? 1 : -1
    let gax = 0
    let gay = 0
    if (motion === 'Drooping') {
      gax = (q[13] - 0.5) * 0.3
      gay = 0.35 + 0.4 * q[14]
    }
    else if (motion === 'Windswept') {
      const wa = windA + (q[13] - 0.5) * 0.6
      const ws = 0.4 + 0.4 * q[14]
      gax = Math.cos(wa) * ws
      gay = Math.sin(wa) * ws
    }
    const rho = size * (0.25 + 0.3 * q[15])
    mod = {
      kind: motion,
      bend: motion === 'Combed' ? dir * (0.6 + 0.9 * q[5]) : dir * 0.25 * q[5],
      cx: gx + (q[13] - 0.5) * 0.4 * (bx1 - bx0),
      cy: gy + (q[14] - 0.5) * 0.4 * (by1 - by0),
      irho2: 1 / (rho * rho),
      // a swirl on a burst stays gentle: the rays should still read
      spin: dir * (1.6 + 1.6 * q[5]) * (emitter === 'Burst' ? 0.4 : 1),
      gx: gax,
      gy: gay,
      pinch: 0.45 + 0.3 * q[5],
    }

    const shape = new Path2D()
    shape.moveTo(poly[0][0] * S, poly[0][1] * S)
    for (let i = 1; i < poly.length; i++)
      shape.lineTo(poly[i][0] * S, poly[i][1] * S)
    shape.closePath()
    ctx.fillStyle = css(mixHex(pal.bg, pal.inks[ink1], pal.under))
    ctx.fill(shape)

    const [ox, oy, bw, bh] = boxes[pi]
    if (bw <= 0 || bh <= 0)
      continue
    lc.setTransform(1, 0, 0, 1, 0, 0)
    lc.globalCompositeOperation = 'source-over'
    lc.clearRect(0, 0, LW, LH)
    layerX = ox
    layerY = oy
    bendK = emitter === 'Burst' ? 0.3 : 1
    // gusts flatten the light and thin the cover: give them more of both
    contrast = motion === 'Windswept' ? 1.3 : 1
    per = motion === 'Windswept' ? Math.max(den.per, 14500) : den.per
    // waves always mix in a second ink, so crests and troughs never read as
    // two-tone bands
    if (emitter === 'Waves')
      mix2 = Math.max(mix2, 0.22)
    if (emitter === 'Grid')
      grid(poly, q)
    else if (emitter === 'Burst')
      burst(poly, q)
    else if (emitter === 'Waves')
      waves(poly, q)
    else
      comb(poly, q)
    flush()
    lc.setTransform(1, 0, 0, 1, -ox, -oy)
    lc.globalCompositeOperation = 'destination-in'
    lc.fillStyle = '#000'
    lc.fill(shape)
    lc.globalCompositeOperation = 'source-over'
    ctx.drawImage(layer, 0, 0, bw, bh, ox, oy, bw, bh)
  }
  lc.setTransform(1, 0, 0, 1, 0, 0)
  ctx.restore()
}

/** A one-draw generator, to reuse `weighted` on a value already drawn. */
function constRng(v: number): Rng {
  return () => v
}

export default {
  slug: 'bristle',
  title: 'Bristle',
  summary: 'Angular patches of fine strokes: grids of tufts, bursts, wave rows and combed fringes, bent, swirled or windswept, lit so every tuft reads as a dome.',
  order: 700,
  traits: TRAITS,
  features,
  render,
  // Seed-of-seeds 0xb415b415b415b415 ("gallery" stream): the first hash found
  // for each patches x tufts pair, in stream order; among those twenty, weak
  // pieces and palette repeats were skipped. The mixed facets lead.
  gallery: [
    '0x764fa593f46cacfc25153b6af225c8b188b3c2aa6340f4f9bf1ff1d4b308eb9f',
    '0x4332e41820018b8a74bba142d4c4a264568ca20925ead92d359b13a620544170',
    '0x66460182ec3325cd6b5e4736a36aac7d85dd98c977a70a0e72ecdc566ef0df03',
    '0x67f75a6992604a7465706e2ad8431563b038b04df2f33c29a0de9f5d491aa6a3',
    '0xa8cc03d6bfe50dfb7a8e3be3e9d6db0f7afc760657867f3617d8c4a124083366',
    '0xf38f304d9354cacd9701ea9b7f245c2a19606b67480b3b7f7c8139f6eeb11fe0',
    '0x55a754a496adc774bd23da2a7725919c05d7d684906af5486aba4d1a53c2a9c1',
    '0x950dd8f08a5a465add842fca10a303c203eca524ec290593189f0f1c0964728c',
    '0x110d6b60b1b15e210d95a7e7b8eba58d51ec8b072f7659436f42d2369d09014e',
    '0xa719fa0481bd24c75afb699a0bc7a3f986dd83c8477b47f47736f6573bd72917',
    '0x0fbcd5cd22773a2d5826ef50f467ac4e31acf184ed62fd51b1aa068edb5e3403',
    '0xcbf4c118c7c043ee0fce450f17734564ec78755b8b1c08198cb5f8578a01aad5',
  ],
} satisfies Series
