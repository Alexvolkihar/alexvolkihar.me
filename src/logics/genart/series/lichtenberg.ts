// "Lichtenberg" — discharges grown by the dielectric breakdown model.
//
// A lattice holds an electric potential: 0 on the discharge, 1 on the far
// electrode. Each batch, sites next to the discharge break down with a
// probability proportional to the potential to the power eta (Niemeyer,
// Pietronero & Wiesmann, 1984), then the potential is relaxed again by a few
// sweeps of red-black over-relaxation. The discharge starts from a point, an
// edge, a ring, or both sides of a spark gap, and is drawn as a glowing
// plasma, a figure burned into wood or a silver print, every branch as thick
// as its Horton–Strahler order.
//
// Everything is a pure function of the hash, and every length is a fraction
// of the canvas short side.

import type { Discharge, Lattice } from '../lichtenberg/dbm'
import type { Rng } from '../random'
import type { Series } from '../types'
import { createLattice, GROUND, grow, NEUMANN, SIDE_A, SIDE_B, TARGET } from '../lichtenberg/dbm'
import { range, stream, weighted } from '../random'

// Rarity table, decided before the drawing code. Never reorder: it re-rolls the edition.
const TRAITS = {
  Palette: [['Arc', 20], ['Acrylic', 18], ['Ember', 14], ['Maple', 18], ['Walnut', 14], ['Silver', 16]],
  Electrode: [['Point', 34], ['Edge', 22], ['Ring', 22], ['Gap', 22]],
  Breakdown: [['Bushy', 20], ['Feathered', 35], ['Forked', 30], ['Bolt', 15]],
  Grain: [['Coarse', 25], ['Fine', 50], ['Hair', 25]],
} as const

type TraitName = keyof typeof TRAITS
type Features = { [K in TraitName]: typeof TRAITS[K][number][0] }

function features(hash: string): Features {
  const r = stream(hash, 'features')
  return {
    Palette: weighted(r, TRAITS.Palette),
    Electrode: weighted(r, TRAITS.Electrode),
    Breakdown: weighted(r, TRAITS.Breakdown),
    Grain: weighted(r, TRAITS.Grain),
  }
}

type Medium = 'plasma' | 'wood' | 'print'

interface Palette {
  medium: Medium
  bg: string
  /** Second background tone: the glow of the chamber, the latewood, the paper shadow. */
  bg2: string
  /** Wide halo, mid stroke, core. */
  halo: string
  mid: string
  core: string
  electrode: string
}

const PAL: Record<Features['Palette'], Palette> = {
  Arc: { medium: 'plasma', bg: '#06060d', bg2: '#141133', halo: '#5b46ff', mid: '#a99bff', core: '#ffffff', electrode: '#e9e4ff' },
  Acrylic: { medium: 'plasma', bg: '#02101a', bg2: '#062a3c', halo: '#1592d9', mid: '#71d4ff', core: '#effcff', electrode: '#cfefff' },
  Ember: { medium: 'plasma', bg: '#0e0605', bg2: '#2a0f08', halo: '#e2461b', mid: '#ff9a4a', core: '#fff3d6', electrode: '#ffd9a0' },
  Maple: { medium: 'wood', bg: '#dcb98a', bg2: '#c89d6a', halo: '#8a4a1f', mid: '#4a2410', core: '#180c06', electrode: '#2b2420' },
  Walnut: { medium: 'wood', bg: '#9a6a43', bg2: '#7d5233', halo: '#3d1d0c', mid: '#24120a', core: '#0b0604', electrode: '#1a1512' },
  Silver: { medium: 'print', bg: '#eeeadf', bg2: '#d9d2c3', halo: '#bdb4a3', mid: '#5c564c', core: '#141311', electrode: '#b3322a' },
}

const ETA: Record<Features['Breakdown'], number> = { Bushy: 0.55, Feathered: 1, Forked: 1.8, Bolt: 3.2 }
/** Lattice cells along the canvas short side. */
const CELLS: Record<Features['Grain'], number> = { Coarse: 104, Fine: 140, Hair: 184 }
const LATTICE: Record<Features['Electrode'], number> = { Point: 1, Edge: 0.75, Ring: 1, Gap: 0.88 }

interface Layout {
  lat: Lattice
  /** Electrode marks, in cells: discs [x, y, r, hollow], ring [x, y, a, b], edge row. */
  discs: [number, number, number, boolean][]
  ring: [number, number, number, number] | null
  edge: boolean
  stop: number
}

function layout(f: Features, gx: number, gy: number, G: number, r: Rng): Layout {
  const lat = createLattice(gx, gy)
  const o = lat.owner
  const cx = gx / 2 + range(r, -0.05, 0.05) * G
  const cy = gy / 2 + range(r, -0.05, 0.05) * G
  const discs: Layout['discs'] = []
  let ring: Layout['ring'] = null
  const disc = (x: number, y: number, rad: number, v: number) => {
    for (let j = Math.max(1, Math.floor(y - rad)); j <= Math.min(gy - 2, Math.ceil(y + rad)); j++) {
      for (let i = Math.max(1, Math.floor(x - rad)); i <= Math.min(gx - 2, Math.ceil(x + rad)); i++) {
        if ((i + 0.5 - x) ** 2 + (j + 0.5 - y) ** 2 <= rad * rad)
          o[j * gx + i] = v
      }
    }
  }
  // outside an ellipse inscribed in the canvas: the far electrode
  const ellipse = (margin: number) => {
    const a = gx / 2 - margin
    const b = gy / 2 - margin
    for (let j = 0; j < gy; j++) {
      for (let i = 0; i < gx; i++) {
        const u = (i + 0.5 - gx / 2) / a
        const v = (j + 0.5 - gy / 2) / b
        if (u * u + v * v >= 1 || i === 0 || j === 0 || i === gx - 1 || j === gy - 1)
          o[j * gx + i] = TARGET
      }
    }
  }

  if (f.Electrode === 'Point') {
    ellipse(0.035 * G)
    disc(cx, cy, 1.1, SIDE_A)
    discs.push([cx, cy, 0.012 * G, false])
    return { lat, discs, ring, edge: false, stop: 2 }
  }
  if (f.Electrode === 'Ring') {
    // an elliptic ring hugging the canvas, discharging inwards to a central pin
    const m = range(r, 0.07, 0.12) * G
    const a = gx / 2 - m
    const b = gy / 2 - m
    const rx = gx / 2
    const ry = gy / 2
    for (let j = 0; j < gy; j++) {
      for (let i = 0; i < gx; i++) {
        const u = (i + 0.5 - rx) / a
        const v = (j + 0.5 - ry) / b
        if (u * u + v * v >= 1)
          o[j * gx + i] = GROUND
      }
    }
    const steps = Math.ceil((a + b) * 8)
    for (let k = 0; k < steps; k++) {
      const t = (k / steps) * Math.PI * 2
      const i = Math.floor(rx + Math.cos(t) * a)
      const j = Math.floor(ry + Math.sin(t) * b)
      o[j * gx + i] = SIDE_A
    }
    disc(cx, cy, 0.035 * G, TARGET)
    ring = [rx, ry, a, b]
    discs.push([cx, cy, 0.035 * G, true])
    return { lat, discs, ring, edge: false, stop: 1.5 }
  }
  if (f.Electrode === 'Edge') {
    // streamers rising from the bottom edge towards a charged sphere above
    for (let j = 0; j < gy; j++) {
      for (let i = 0; i < gx; i++) {
        if (j === gy - 1)
          o[j * gx + i] = SIDE_A
        else if (i === 0 || j === 0 || i === gx - 1)
          o[j * gx + i] = NEUMANN
      }
    }
    const sx = gx / 2 + range(r, -0.22, 0.22) * G
    const sy = gy * (1 - range(r, 0.5, 0.58))
    const sr = 0.075 * G
    disc(sx, sy, sr, TARGET)
    discs.push([sx, sy, sr, true])
    return { lat, discs, ring, edge: true, stop: 2 }
  }
  // Gap: two electrodes facing each other in an insulated box
  for (let j = 0; j < gy; j++) {
    for (let i = 0; i < gx; i++) {
      if (i === 0 || j === 0 || i === gx - 1 || j === gy - 1)
        o[j * gx + i] = NEUMANN
    }
  }
  const L = Math.max(gx, gy)
  const half = 0.25 * G + 0.3 * (L - G)
  let ang = range(r, -0.45, 0.45)
  if (gx === gy)
    ang += Math.floor(r() * 4) * Math.PI / 4
  else if (gy > gx)
    ang += Math.PI / 2
  const dx = Math.cos(ang) * half
  const dy = Math.sin(ang) * half
  const m = 0.1 * G
  const clampX = (x: number) => Math.min(gx - m, Math.max(m, x))
  const clampY = (y: number) => Math.min(gy - m, Math.max(m, y))
  const ax = clampX(gx / 2 - dx)
  const ay = clampY(gy / 2 - dy)
  const bx = clampX(gx / 2 + dx)
  const by = clampY(gy / 2 + dy)
  disc(ax, ay, 1.1, SIDE_A)
  disc(bx, by, 1.1, SIDE_B)
  discs.push([ax, ay, 0.012 * G, false], [bx, by, 0.012 * G, false])
  return { lat, discs, ring, edge: false, stop: -1 }
}

/** Horton–Strahler order of every node; the main channel of a gap gets one more. */
function strahler(d: Discharge): { order: Uint8Array, max: number } {
  const n = d.count
  const order = new Uint8Array(n)
  const best = new Uint8Array(n)
  const ties = new Uint8Array(n)
  for (let i = n - 1; i >= 0; i--) {
    let o = 1
    if (best[i] > 0)
      o = ties[i] >= 2 ? best[i] + 1 : best[i]
    order[i] = o
    const p = d.parent[i]
    if (p < 0)
      continue
    if (o > best[p]) {
      best[p] = o
      ties[p] = 1
    }
    else if (o === best[p]) {
      ties[p]++
    }
  }
  let max = 1
  for (let i = 0; i < n; i++)
    max = Math.max(max, order[i])
  if (d.meetA >= 0) {
    max++
    for (const start of [d.meetA, d.meetB]) {
      for (let i = start; i >= 0; i = d.parent[i])
        order[i] = max
    }
  }
  return { order, max }
}

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

function scratch(w: number, h: number): { cv: HTMLCanvasElement | OffscreenCanvas, g: Ctx2D } {
  if (typeof OffscreenCanvas !== 'undefined') {
    const cv = new OffscreenCanvas(w, h)
    return { cv, g: cv.getContext('2d')! }
  }
  const cv = Object.assign(document.createElement('canvas'), { width: w, height: h })
  return { cv, g: cv.getContext('2d')! }
}

/** Wavy wood grain along `angle`, with darker latewood bands. */
function woodGrain(g: CanvasRenderingContext2D, W: number, H: number, S: number, pal: Palette, angle: number, r: Rng) {
  const ux = Math.cos(angle)
  const uy = Math.sin(angle)
  const D = Math.hypot(W, H) / 2 + 0.05 * S
  const mx = W / 2
  const my = H / 2
  const waves = Array.from({ length: 3 }, (_, k) => ({ f: (1.5 + k * 2.3 + r()) / S, p: r() * 6.283, a: (0.012 / (k + 1)) * S }))
  const line = (v: number, wob: number) => {
    g.beginPath()
    const step = 0.02 * S
    for (let u = -D; u <= D; u += step) {
      let off = v
      for (const w of waves)
        off += Math.sin(u * w.f + w.p + v * w.f * 0.7) * w.a * wob
      const x = mx + ux * u - uy * off
      const y = my + uy * u + ux * off
      if (u === -D)
        g.moveTo(x, y)
      else
        g.lineTo(x, y)
    }
  }
  g.lineCap = 'round'
  // latewood bands
  g.strokeStyle = pal.bg2
  let v = -D
  while (v < D) {
    const w = range(r, 0.004, 0.022) * S
    g.globalAlpha = range(r, 0.25, 0.6)
    g.lineWidth = w
    line(v, 1 + r())
    g.stroke()
    v += range(r, 0.02, 0.06) * S
  }
  // fine fibres
  g.strokeStyle = pal.halo
  v = -D
  while (v < D) {
    g.globalAlpha = range(r, 0.04, 0.12)
    g.lineWidth = range(r, 0.0008, 0.0022) * S
    line(v, 1 + r())
    g.stroke()
    v += range(r, 0.003, 0.011) * S
  }
  g.globalAlpha = 1
}

function render(g: CanvasRenderingContext2D, W: number, H: number, hash: string) {
  const f = features(hash)
  const pal = PAL[f.Palette]
  const S = Math.min(W, H)
  // an edge discharges along its whole width and a gap from both ends: a
  // coarser lattice keeps them as fast as the others
  const G = Math.round(CELLS[f.Grain] * LATTICE[f.Electrode])

  // Fixed stream order: layout, growth, jitter, texture.
  const lr = stream(hash, 'layout')
  const gr = stream(hash, 'growth')
  const jr = stream(hash, 'jitter')
  const tr = stream(hash, 'texture')

  // lattice cells along each side; the lattice border sits on the canvas edge
  const gx = Math.max(8, Math.round((W / S) * G))
  const gy = Math.max(8, Math.round((H / S) * G))
  const cw = W / gx
  const ch = H / gy
  const cell = S / G

  const lay = layout(f, gx, gy, G, lr)
  const grainAngle = range(lr, -0.22, 0.22)
  const d = grow(lay.lat, {
    eta: ETA[f.Breakdown],
    stopDistance: lay.stop,
    maxNodes: Math.round(gx * gy * 0.4),
    grainAngle,
    grain: pal.medium === 'wood' ? 0.4 : 0,
  }, gr)
  const { order, max } = strahler(d)

  // node positions in pixels, jittered off the lattice
  const n = d.count
  const px = new Float64Array(n)
  const py = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const c = d.cell[i]
    const x = c % gx
    const y = (c - x) / gx
    const j = d.parent[i] < 0 ? 0 : 0.4
    px[i] = (x + 0.5 + (jr() - 0.5) * 2 * j) * cw
    py[i] = (y + 0.5 + (jr() - 0.5) * 2 * j) * ch
  }

  // one path per Strahler order
  const segs: number[][] = Array.from({ length: max + 1 }, () => [])
  for (let i = 0; i < n; i++) {
    const p = d.parent[i]
    if (p >= 0)
      segs[order[i]].push(px[p], py[p], px[i], py[i])
  }
  const paths = segs.map((s) => {
    const p = new Path2D()
    for (let k = 0; k < s.length; k += 4) {
      p.moveTo(s[k], s[k + 1])
      p.lineTo(s[k + 2], s[k + 3])
    }
    return p
  })
  const t = (o: number) => max > 1 ? (o - 1) / (max - 1) : 1
  // a print has no glow or scorch to carry it: its ink lines are bolder
  const ink = pal.medium === 'print' ? 1.35 : 1
  const width = (o: number) => cell * ink * (0.16 + 1.25 * t(o) ** 1.5)
  const strokeAll = (c: Ctx2D, color: string, w: (o: number) => number, a: (o: number) => number) => {
    c.strokeStyle = color
    for (let o = 1; o <= max; o++) {
      const s = segs[o]
      const alpha = a(o)
      const lw = w(o)
      if (!s.length || alpha <= 0 || lw <= 0)
        continue
      c.globalAlpha = alpha
      c.lineWidth = lw
      c.stroke(paths[o])
    }
    c.globalAlpha = 1
  }
  const X = (x: number) => x * cw
  const Y = (y: number) => y * ch
  g.lineCap = 'round'
  g.lineJoin = 'round'
  g.globalAlpha = 1
  g.globalCompositeOperation = 'source-over'

  // focus of the background light: the electrodes, or the foot of an edge
  let fx = W / 2
  let fy = H / 2
  if (lay.edge) {
    fy = H
  }
  else if (lay.discs.length) {
    fx = X(lay.discs.reduce((s, q) => s + q[0], 0) / lay.discs.length)
    fy = Y(lay.discs.reduce((s, q) => s + q[1], 0) / lay.discs.length)
  }

  if (pal.medium === 'plasma') {
    g.fillStyle = pal.bg
    g.fillRect(0, 0, W, H)
    const bgl = g.createRadialGradient(fx, fy, 0, fx, fy, S * 0.75)
    bgl.addColorStop(0, pal.bg2)
    bgl.addColorStop(1, pal.bg)
    g.fillStyle = bgl
    g.fillRect(0, 0, W, H)

    // bloom: the discharge drawn wide on small canvases, then scaled up. Their
    // resolution is fixed relative to the short side, so the glow looks the
    // same at every output size.
    for (const [res, grow, alpha] of [[96, 5, 0.5], [280, 2.2, 0.55]] as const) {
      const k = Math.min(1, res / S)
      const sw = Math.max(1, Math.round(W * k))
      const sh = Math.max(1, Math.round(H * k))
      const sc = scratch(sw, sh)
      sc.g.setTransform(sw / W, 0, 0, sh / H, 0, 0)
      sc.g.lineCap = 'round'
      sc.g.lineJoin = 'round'
      strokeAll(sc.g, pal.halo, o => width(o) * grow + cell * grow * 0.5, o => alpha * (0.35 + 0.65 * t(o)))
      g.globalCompositeOperation = 'lighter'
      g.imageSmoothingEnabled = true
      g.drawImage(sc.cv, 0, 0, W, H)
    }
    g.globalCompositeOperation = 'lighter'
    strokeAll(g, pal.mid, o => width(o) * 2 + cell * 0.25, o => 0.25 + 0.4 * t(o))
    strokeAll(g, pal.core, width, o => 0.55 + 0.45 * t(o))
    g.globalCompositeOperation = 'source-over'
  }
  else if (pal.medium === 'wood') {
    g.fillStyle = pal.bg
    g.fillRect(0, 0, W, H)
    woodGrain(g, W, H, S, pal, grainAngle, tr)
    // scorched halo, char, and a pale ash seam down the big channels
    strokeAll(g, pal.halo, o => width(o) * 3.2 + cell * 0.9, () => 0.16)
    strokeAll(g, pal.halo, o => width(o) * 1.9 + cell * 0.35, () => 0.32)
    strokeAll(g, pal.mid, o => width(o) * 1.25, () => 0.9)
    strokeAll(g, pal.core, width, () => 1)
    strokeAll(g, pal.bg2, o => t(o) > 0.6 ? width(o) * 0.18 : 0, o => t(o) > 0.6 ? 0.35 : 0)
    const vig = g.createRadialGradient(W / 2, H / 2, S * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.6)
    vig.addColorStop(0, 'rgba(0,0,0,0)')
    vig.addColorStop(1, 'rgba(40,20,8,0.35)')
    g.fillStyle = vig
    g.fillRect(0, 0, W, H)
  }
  else {
    g.fillStyle = pal.bg
    g.fillRect(0, 0, W, H)
    const vig = g.createRadialGradient(W / 2, H / 2, S * 0.3, W / 2, H / 2, Math.hypot(W, H) * 0.62)
    vig.addColorStop(0, pal.bg)
    vig.addColorStop(1, pal.bg2)
    g.fillStyle = vig
    g.fillRect(0, 0, W, H)
    strokeAll(g, pal.halo, o => width(o) * 2.6 + cell * 0.4, () => 0.35)
    strokeAll(g, pal.mid, o => width(o) * 1.4, () => 0.6)
    strokeAll(g, pal.core, width, () => 1)
  }

  // --- electrodes ----------------------------------------------------------------
  g.globalAlpha = 1
  const ew = Math.max(width(max), 0.006 * S)
  g.strokeStyle = pal.electrode
  g.fillStyle = pal.electrode
  if (lay.ring) {
    g.lineWidth = ew * 0.6
    g.beginPath()
    g.ellipse(X(lay.ring[0]), Y(lay.ring[1]), lay.ring[2] * cw, lay.ring[3] * ch, 0, 0, Math.PI * 2)
    g.stroke()
  }
  for (const [x, y, rad, hollow] of lay.discs) {
    g.beginPath()
    g.arc(X(x), Y(y), rad * cell, 0, Math.PI * 2)
    if (hollow) {
      g.lineWidth = ew * 0.5
      g.stroke()
    }
    else {
      g.fill()
    }
  }
  if (lay.edge) {
    g.fillRect(0, H - 0.012 * S, W, 0.012 * S)
  }
}

export default {
  slug: 'lichtenberg',
  title: 'Lichtenberg',
  summary: 'Electric discharges grown by the dielectric breakdown model from a point, an edge, a ring or a spark gap, glowing as plasma, burned into wood or printed in silver.',
  order: 370,
  traits: TRAITS,
  features,
  render,
  // Seed-of-seeds 0x11c47e4b ("gallery" stream): the first hash found for each
  // palette x electrode pair, twelve pairs in all; the classic ember point
  // figure is moved to the front as the cover.
  gallery: [
    '0xf0736006eb25e056f4e81647f9e52c17f51c9c1e4ce6fa9f91333bfb23ce14c9',
    '0xf7af81a62c28de418566b81ef03e254de0f43cbbe04ed7f69a4d81dc074bbddd',
    '0x13a1de3c5280522db85fa7828c434c90d1c8f2cd7267aff9204532f3132961c9',
    '0x77ed3dee347bda1b925b4fc84a965cdb6dcf10a2fb9efcd935b5bd6530bc49f7',
    '0x17d5d5b0d478957c56b729f5252a285af1d85cbfeb56883ea9ec48e382798c7f',
    '0x04f866db7f3d9f7ae516196b7a2f10477b0925fe5bf9906c1540195385d14be2',
    '0x579575b755c5f4278c9cb368a5860f94a37d63bb5452896fcbf3dcfe4684968c',
    '0x157f3e81b217f8442127c03f990c63fe6f1dc22a1b0b1463601b10a7ba8d8b3e',
    '0x7214ce3467e868e168004f3e0661fef742f06cd3277acc4a17a6daaea983eff1',
    '0xfaae88d6822012353969e88b3043a5ba6c7d74e72076554af5fe611ea80c8ce6',
    '0xd7d833a63351d1f9aa76237d24cbbb9e068001fab2b6ddafc097c390dfc879bb',
    '0xf9ecce14e2ba1618acdd9f8221a80f12916ea2cf51c9fad699190af3f5d702b1',
  ],
} satisfies Series
