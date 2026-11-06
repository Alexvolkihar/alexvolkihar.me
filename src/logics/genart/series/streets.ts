// "Streets" — maps of imaginary cities, with streets traced along a tensor field.
//
// The street network follows Chen, Esch, Wonka, Müller & Zhang, "Interactive
// Procedural Street Modeling" (SIGGRAPH 2008): grid and radial basis tensor
// fields are blended (with extra fields that follow the river banks and the
// coast), and roads are hyperstreamlines of the major and minor eigenvector
// fields, traced tier by tier (arterials, then main streets, then side
// streets) with a separation distance per tier. Building footprints are lots
// set along the streets. The map is then drawn in one of five cartographic
// styles, with water lining, a zebra border, a compass rose and a scale bar.
//
// Everything is a pure function of the hash, and every length is a fraction
// of the canvas short side. A wider canvas shows more of the same city.

import type { Rng } from '../random'
import type { Park, Ring } from '../streets/city'
import type { Basis } from '../streets/field'
import type { Env, Road, TierSpec } from '../streets/roads'
import type { Series } from '../types'
import { int, range, stream, weighted } from '../random'
import { blobPark, makeWater, Occupancy, placeLots, rectPark, SegGrid } from '../streets/city'
import { compass, ringPath, scaleBar, waterLining, zebraFrame } from '../streets/draw'
import { fbm, makeNoise, TensorField } from '../streets/field'
import { traceTier } from '../streets/roads'

// Rarity table, decided before the drawing code. Never reorder: it re-rolls the edition.
const TRAITS = {
  Style: [['Vintage', 30], ['Atlas', 22], ['Blueprint', 18], ['Night', 16], ['Ink', 14]],
  Layout: [['Grid', 28], ['Radial', 18], ['Blend', 36], ['Organic', 18]],
  Water: [['Inland', 22], ['River', 36], ['Coast', 26], ['Estuary', 16]],
  Density: [['Town', 25], ['City', 50], ['Metropolis', 25]],
  Parks: [['Few', 35], ['Some', 45], ['Green', 20]],
} as const

type TraitName = keyof typeof TRAITS
type Features = { [K in TraitName]: typeof TRAITS[K][number][0] }

function features(hash: string): Features {
  const r = stream(hash, 'features')
  return {
    Style: weighted(r, TRAITS.Style),
    Layout: weighted(r, TRAITS.Layout),
    Water: weighted(r, TRAITS.Water),
    Density: weighted(r, TRAITS.Density),
    Parks: weighted(r, TRAITS.Parks),
  }
}

interface Palette {
  /** Margin outside the neatline. */
  paper: string
  land: string
  urban: string
  bld: readonly [string, string, string]
  /** Building outline (null: none). */
  bldLine: string | null
  park: string
  tree: string
  plaza: string
  water: string
  waterLine: string
  /** Casing and fill per tier (arterial, main, side). Null fill: single line. */
  casing: readonly [string, string, string]
  fill: readonly [string, string, string] | null
  ink: string
  dark: boolean
}

const PAL: Record<Features['Style'], Palette> = {
  Vintage: {
    paper: '#efe3c8',
    land: '#eadbb8',
    urban: '#e6c8a2',
    bld: ['#c48a68', '#b67a5a', '#a86c4f'],
    bldLine: null,
    park: '#c9cc97',
    tree: '#8d9358',
    plaza: '#efe0bf',
    water: '#bccbbf',
    waterLine: '#7e958b',
    casing: ['#4f3d2c', '#5d4935', '#7a6248'],
    fill: ['#e9bd62', '#f5e8c9', '#f3e6c8'],
    ink: '#3b2e22',
    dark: false,
  },
  Atlas: {
    paper: '#f7f5f0',
    land: '#f1eee7',
    urban: '#e7e3da',
    bld: ['#d8d0c3', '#cfc6b6', '#c5baa8'],
    bldLine: null,
    park: '#cfe5b8',
    tree: '#9fc286',
    plaza: '#ece6da',
    water: '#a8d0ea',
    waterLine: '#7fb3d6',
    casing: ['#d9824a', '#d6b25e', '#cfc7b8'],
    fill: ['#f6ad6c', '#ffe28e', '#ffffff'],
    ink: '#4d4b47',
    dark: false,
  },
  Blueprint: {
    paper: '#163e70',
    land: '#1a4a85',
    urban: '#1d5292',
    bld: ['#2a64a8', '#2a64a8', '#2a64a8'],
    bldLine: '#bcd6f5',
    park: '#1f5a8f',
    tree: '#8fb9e6',
    plaza: '#1d5292',
    water: '#123766',
    waterLine: '#6f9dd4',
    casing: ['#f2f7ff', '#e2edfb', '#c9dcf3'],
    fill: ['#1d5292', '#1d5292', '#1d5292'],
    ink: '#eef5ff',
    dark: true,
  },
  Night: {
    paper: '#0b0d14',
    land: '#10131c',
    urban: '#151925',
    bld: ['#262d3f', '#2c3449', '#20263a'],
    bldLine: null,
    park: '#13241c',
    tree: '#2b4a37',
    plaza: '#1b2030',
    water: '#070a10',
    waterLine: '#1b2638',
    casing: ['#ff9d3a', '#e0843a', '#8a6a52'],
    fill: ['#ffd38a', '#f2a654', '#9c7a5c'],
    ink: '#d8c7a6',
    dark: true,
  },
  Ink: {
    paper: '#f5f2ea',
    land: '#f5f2ea',
    urban: '#f5f2ea',
    bld: ['#1d1c1a', '#1d1c1a', '#1d1c1a'],
    bldLine: null,
    park: '#f5f2ea',
    tree: '#1d1c1a',
    plaza: '#f5f2ea',
    water: '#f5f2ea',
    waterLine: '#1d1c1a',
    casing: ['#1d1c1a', '#1d1c1a', '#f5f2ea'],
    fill: ['#f5f2ea', '#f5f2ea', '#f5f2ea'],
    ink: '#1d1c1a',
    dark: false,
  },
}

// Spacing scale and road width scale per density.
const DENS: Record<Features['Density'], { k: number, w: number, R: number }> = {
  Town: { k: 1.25, w: 1.15, R: 0.42 },
  City: { k: 1, w: 1, R: 0.6 },
  Metropolis: { k: 0.8, w: 0.85, R: 0.85 },
}

const PARKS: Record<Features['Parks'], [number, number]> = { Few: [1, 2], Some: [3, 4], Green: [6, 8] }

// Road widths (casing, fill) per tier, canvas short side = 1.
const WIDTH = [[0.0105, 0.0072], [0.0066, 0.0044], [0.0036, 0.0022]] as const
// Night maps draw a single lit line per road.
const NIGHT_WIDTH = [0.0042, 0.0026, 0.0012] as const

function bases(layout: Features['Layout'], r: Rng, cx: number, cy: number, ax: number, ay: number): { list: Basis[], radial: [number, number] | null, twist: number } {
  const list: Basis[] = []
  const t0 = range(r, 0, Math.PI)
  const spot = () => [range(r, -ax * 0.9, ax * 0.9), range(r, -ay * 0.9, ay * 0.9)] as const
  const grid = (x: number, y: number, theta: number, weight: number, decay: number) =>
    list.push({ kind: 'grid', x, y, theta, weight, decay })
  // a faint global grid keeps the far field defined
  grid(cx, cy, t0, 0.06, 1e-4)
  let radial: [number, number] | null = null
  let twist = 0.08
  if (layout === 'Grid') {
    grid(cx, cy, t0, 1, 2)
    for (let i = 0; i < 2; i++) {
      const [x, y] = spot()
      grid(x, y, t0 + range(r, 0.25, 0.7) * (r() < 0.5 ? -1 : 1), 1, range(r, 3, 7))
    }
    twist = 0.04
  }
  else if (layout === 'Radial') {
    list.push({ kind: 'radial', x: cx, y: cy, theta: 0, weight: 1.3, decay: range(r, 1.6, 3) })
    radial = [cx, cy]
    for (let i = 0; i < 2; i++) {
      const [x, y] = spot()
      grid(x, y, range(r, 0, Math.PI), 0.7, range(r, 3, 6))
    }
  }
  else if (layout === 'Blend') {
    const a = range(r, 0, Math.PI * 2)
    const d = range(r, 0.18, 0.35)
    const rx = cx + Math.cos(a) * d
    const ry = cy + Math.sin(a) * d
    list.push({ kind: 'radial', x: rx, y: ry, theta: 0, weight: 1, decay: range(r, 5, 9) })
    radial = [rx, ry]
    grid(cx, cy, t0, 1, 2.5)
    for (let i = 0; i < 2; i++) {
      const [x, y] = spot()
      grid(x, y, t0 + range(r, 0.3, 0.8) * (r() < 0.5 ? -1 : 1), 1, range(r, 3, 7))
    }
    twist = 0.12
  }
  else {
    for (let i = 0; i < 3; i++) {
      const [x, y] = spot()
      grid(x, y, range(r, 0, Math.PI), 1, range(r, 3, 8))
    }
    const [x, y] = spot()
    list.push({ kind: 'radial', x, y, theta: 0, weight: 0.8, decay: range(r, 4, 8) })
    radial = [x, y]
    twist = 0.55
  }
  return { list, radial, twist }
}

/** Grid bases aligned with the shore, sampled along it (Chen et al.'s boundary fields). */
function shoreBases(shores: readonly Ring[], ax: number, ay: number): Basis[] {
  const out: Basis[] = []
  for (const s of shores) {
    let acc = 0
    for (let i = 2; i < s.length; i += 2) {
      acc += Math.hypot(s[i] - s[i - 2], s[i + 1] - s[i - 1])
      if (acc < 0.035)
        continue
      acc = 0
      const x = s[i]
      const y = s[i + 1]
      if (Math.abs(x) > ax + 0.25 || Math.abs(y) > ay + 0.25)
        continue
      const j = Math.max(0, i - 6)
      out.push({ kind: 'grid', x, y, theta: Math.atan2(y - s[j + 1], x - s[j]), weight: 1.1, decay: 260 })
    }
  }
  return out
}

function roadPath(roads: readonly Road[], tier: number, onlyBridges = false): Path2D {
  const p = new Path2D()
  for (const r of roads) {
    if (r.tier !== tier)
      continue
    if (onlyBridges) {
      for (let i = 0; i < r.bridge.length; i++) {
        if (r.bridge[i]) {
          p.moveTo(r.xs[i], r.ys[i])
          p.lineTo(r.xs[i + 1], r.ys[i + 1])
        }
      }
      continue
    }
    p.moveTo(r.xs[0], r.ys[0])
    for (let i = 1; i < r.xs.length; i++)
      p.lineTo(r.xs[i], r.ys[i])
  }
  return p
}

function render(g: CanvasRenderingContext2D, W: number, H: number, hash: string) {
  const f = features(hash)
  const pal = PAL[f.Style]
  const dens = DENS[f.Density]
  const S = Math.min(W, H)
  const ax = W / S / 2
  const ay = H / S / 2
  const k = dens.k

  // Streams, always created in this order.
  const lr = stream(hash, 'layout')
  const wr = stream(hash, 'water')
  const pr = stream(hash, 'parks')
  const rr = stream(hash, 'roads')
  const br = stream(hash, 'lots')
  const dr = stream(hash, 'decor')

  // --- layout ---------------------------------------------------------
  const noise = makeNoise(lr)
  const water = makeWater({ kind: f.Water, ax, ay, cx: range(lr, -0.12, 0.12), cy: range(lr, -0.12, 0.12) }, wr, noise)
  const cx = water.cx
  const cy = water.cy
  const B = bases(f.Layout, lr, cx, cy, ax, ay)
  const all = B.list.concat(shoreBases(water.shores, ax, ay))
  const pad = 0.04
  const x0 = -ax - pad
  const y0 = -ay - pad
  const x1 = ax + pad
  const y1 = ay + pad
  const twist = B.twist
  const field = new TensorField(all, x0, y0, x1, y1, 0.0125, (x, y) => fbm(noise, x * 1.8 + 31, y * 1.8 - 12) * twist)

  const urban = (x: number, y: number) =>
    1 - Math.hypot(x - cx, y - cy) / dens.R + 0.32 * fbm(noise, x * 2.4 + 5.5, y * 2.4 - 3.1) + (f.Density === 'Metropolis' ? 0.12 : 0)

  // --- parks ----------------------------------------------------------
  const parks: Park[] = []
  let lake: Park | null = null
  if (B.radial && !water.test(B.radial[0], B.radial[1]))
    parks.push(blobPark('plaza', B.radial[0], B.radial[1], 0.032 * k, pr))
  const [pMin, pMax] = PARKS[f.Parks]
  const nParks = int(pr, pMin, pMax)
  for (let i = 0; i < nParks; i++) {
    const formal = pr() < 0.5
    const size = range(pr, 0.045, 0.1) * (i === 0 ? 1.3 : 1) * Math.sqrt(k)
    const aspect = range(pr, 0.4, 0.8)
    for (let tries = 0; tries < 16; tries++) {
      const a = range(pr, 0, Math.PI * 2)
      const d = Math.sqrt(pr()) * dens.R * 0.9
      const x = cx + Math.cos(a) * d
      const y = cy + Math.sin(a) * d
      if (Math.abs(x) > ax || Math.abs(y) > ay)
        continue
      let ok = !water.test(x, y)
      for (let q = 0; q < 8 && ok; q++)
        ok = !water.test(x + Math.cos(q * 0.785) * size * 1.2, y + Math.sin(q * 0.785) * size * 1.2)
      for (const p of parks)
        ok = ok && Math.hypot(p.x - x, p.y - y) > size * 1.3 + 0.12
      if (!ok)
        continue
      if (formal && field.dir(x, y, false))
        parks.push(rectPark(x, y, Math.atan2(field.dy, field.dx), size, size * aspect))
      else
        parks.push(blobPark('garden', x, y, size * 0.85, pr))
      if (i === 0 && f.Water === 'Inland')
        lake = blobPark('lake', x, y, size * 0.45, pr)
      break
    }
  }
  const waterTest = lake
    ? (x: number, y: number) => water.test(x, y) || lake!.test(x, y)
    : water.test
  const blocked = (x: number, y: number, tier: number) => {
    if (lake && lake.test(x, y))
      return true
    for (const p of parks) {
      if ((p.kind === 'plaza' || tier > 0) && p.test(x, y))
        return true
    }
    return false
  }

  // --- roads ----------------------------------------------------------
  const env: Env = { x0, y0, x1, y1, field, water: waterTest, blocked, urban }
  const roads: Road[] = []
  const plaza = parks.find(p => p.kind === 'plaza')
  if (plaza) {
    // ring road around the plaza
    const xs: number[] = []
    const ys: number[] = []
    const ring = plaza.ring
    const n = ring.length / 2
    for (let i = 0; i <= n; i++) {
      const j = (i % n) * 2
      const dx = ring[j] - plaza.x
      const dy = ring[j + 1] - plaza.y
      const l = Math.hypot(dx, dy)
      xs.push(plaza.x + dx * (1 + 0.006 / l))
      ys.push(plaza.y + dy * (1 + 0.006 / l))
    }
    roads.push({ xs, ys, tier: 0, dir: 0, bridge: new Uint8Array(n), closed: true })
  }
  const bridgeMax = Math.max(0.12, water.riverWidth * 2.6)
  const tiers: TierSpec[] = [
    { dsep: 0.2 * k, dtest: 0.1 * k, step: 0.008, maxLen: 4, minLen: 0.15, lookahead: 0.12 * k, bridgeMax, urbanMin: -9, maxRoads: 40 },
    { dsep: 0.07 * k, dtest: 0.035 * k, step: 0.006, maxLen: 3, minLen: 0.05 * k, lookahead: 0.05 * k, bridgeMax: bridgeMax * 0.9, urbanMin: -0.25, maxRoads: 400 },
    { dsep: 0.026 * k, dtest: 0.013 * k, step: 0.0045, maxLen: 1.5, minLen: 0.02 * k, lookahead: 0.024 * k, bridgeMax: 0, urbanMin: 0, maxRoads: 3000 },
  ]
  for (let t = 0; t < 3; t++)
    traceTier(env, roads, tiers[t], t, rr, t === 0 ? [cx, cy] : [])

  // --- lots -----------------------------------------------------------
  // Roads as chords of every third point (they are smooth at that scale).
  const segs = new SegGrid(x0, y0, x1, y1, 0.012)
  for (const r of roads) {
    const hw = WIDTH[r.tier][0] * dens.w / 2
    const n = r.xs.length
    let j = 0
    for (let i = 1; i < n; i++) {
      if (i < n - 1 && i - j < 3 && !r.bridge[i - 1] && !r.bridge[i])
        continue
      segs.add(r.xs[j], r.ys[j], r.xs[i], r.ys[i], hw, 0.006)
      j = i
    }
  }
  const occ = new Occupancy(x0, y0, x1, y1, 0.0018)
  // Dry, open ground, memoised on a fine raster.
  const FR = 0.003
  const fcols = Math.ceil((x1 - x0) / FR) + 1
  const fmemo = new Uint8Array(fcols * (Math.ceil((y1 - y0) / FR) + 1))
  const free = (x: number, y: number) => {
    const i = Math.floor((x - x0) / FR)
    const j = Math.floor((y - y0) / FR)
    if (i < 0 || j < 0 || i >= fcols)
      return false
    const kk = j * fcols + i
    if (kk >= fmemo.length)
      return false
    if (!fmemo[kk]) {
      const px = x0 + (i + 0.5) * FR
      const py = y0 + (j + 0.5) * FR
      fmemo[kk] = !waterTest(px, py) && !parks.some(p => p.test(px, py)) ? 1 : 2
    }
    return fmemo[kk] === 1
  }
  const lots = placeLots(roads, segs, occ, { width: 0.011 * k, depth: 0.014 * k, setback: 0.0016, gap: 0.0016 }, br, free, (x, y) => Math.min(1, urban(x, y)))

  // --- drawing --------------------------------------------------------
  g.save()
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.globalAlpha = 1
  g.globalCompositeOperation = 'source-over'
  g.fillStyle = pal.paper
  g.fillRect(0, 0, W, H)
  g.setTransform(S, 0, 0, S, W / 2, H / 2)
  const m = 0.045
  const fx0 = -ax + m
  const fy0 = -ay + m
  const fx1 = ax - m
  const fy1 = ay - m
  g.save()
  g.beginPath()
  g.rect(fx0, fy0, fx1 - fx0, fy1 - fy0)
  g.clip()
  g.fillStyle = pal.land
  g.fillRect(fx0, fy0, fx1 - fx0, fy1 - fy0)
  g.lineCap = 'round'
  g.lineJoin = 'round'

  // built-up tint: a wide stroke along the streets
  const paths = [roadPath(roads, 0), roadPath(roads, 1), roadPath(roads, 2)]
  if (pal.urban !== pal.land) {
    g.strokeStyle = pal.urban
    g.lineWidth = tiers[2].dsep * 1.3
    g.stroke(paths[2])
    g.lineWidth = 0.022 * k
    g.stroke(paths[1])
    g.stroke(paths[0])
  }

  // countryside: woods and ploughed fields beyond the built-up area
  {
    const cr = stream(hash, 'country')
    const step = 0.052
    g.lineCap = 'butt'
    const crops = new Path2D()
    const plots = new Path2D()
    for (let y = fy0; y < fy1; y += step) {
      for (let x = fx0; x < fx1; x += step) {
        const px = x + range(cr, 0.15, 0.85) * step
        const py = y + range(cr, 0.15, 0.85) * step
        const hu = range(cr, 0.014, 0.03)
        const hv = range(cr, 0.011, 0.022)
        const rows = cr() < 0.5
        if (urban(px, py) > -0.1 || fbm(noise, px * 3 + 70, py * 3) > 0.15 || !field.dir(px, py, false))
          continue
        const tx = field.dx
        const ty = field.dy
        let ok = true
        for (const [u, v] of [[0, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
          const qx = px + tx * hu * u - ty * hv * v
          const qy = py + ty * hu * u + tx * hv * v
          if (!free(qx, qy) || segs.clearance(qx, qy) < 0.004) {
            ok = false
            break
          }
        }
        if (!ok)
          continue
        const corner = (u: number, v: number) => [px + tx * hu * u - ty * hv * v, py + ty * hu * u + tx * hv * v] as const
        plots.moveTo(...corner(-1, -1))
        plots.lineTo(...corner(1, -1))
        plots.lineTo(...corner(1, 1))
        plots.lineTo(...corner(-1, 1))
        plots.closePath()
        // furrows, along or across the plot
        const n = 5
        for (let i = 1; i < n; i++) {
          const f = -1 + 2 * i / n
          if (rows) {
            crops.moveTo(...corner(-1, f))
            crops.lineTo(...corner(1, f))
          }
          else {
            crops.moveTo(...corner(f, -1))
            crops.lineTo(...corner(f, 1))
          }
        }
      }
    }
    g.globalAlpha = pal.dark ? 0.55 : 0.45
    g.fillStyle = pal.park
    g.fill(plots)
    g.globalAlpha = 0.6
    g.strokeStyle = pal.tree
    g.lineWidth = 0.0011
    g.stroke(crops)
    g.stroke(plots)
    // woods where the noise is high
    g.globalAlpha = 1
    const wood = new Path2D()
    const ws = 0.0105
    for (let y = fy0; y < fy1; y += ws) {
      for (let x = fx0; x < fx1; x += ws) {
        const px = x + cr() * ws
        const py = y + cr() * ws
        const rad = range(cr, 0.0024, 0.0042)
        if (fbm(noise, px * 3 + 70, py * 3) < 0.3 || urban(px, py) > -0.04)
          continue
        if (!free(px, py) || segs.clearance(px, py) < rad + 0.002)
          continue
        wood.moveTo(px + rad, py)
        wood.arc(px, py, rad, 0, Math.PI * 2)
      }
    }
    if (f.Style === 'Ink') {
      g.strokeStyle = pal.tree
      g.lineWidth = 0.0011
      g.stroke(wood)
    }
    else {
      g.fillStyle = pal.tree
      g.fill(wood)
    }
    g.lineCap = 'round'
  }

  // parks
  for (const p of parks) {
    const path = ringPath([p.ring], true)
    g.fillStyle = p.kind === 'plaza' ? pal.plaza : pal.park
    g.fill(path)
    g.strokeStyle = pal.tree
    g.lineWidth = 0.0012
    g.stroke(path)
  }
  // trees
  g.fillStyle = pal.tree
  for (const p of parks) {
    if (p.kind === 'plaza')
      continue
    let minx = Infinity
    let miny = Infinity
    let maxx = -Infinity
    let maxy = -Infinity
    for (let i = 0; i < p.ring.length; i += 2) {
      minx = Math.min(minx, p.ring[i])
      maxx = Math.max(maxx, p.ring[i])
      miny = Math.min(miny, p.ring[i + 1])
      maxy = Math.max(maxy, p.ring[i + 1])
    }
    const n = Math.round((maxx - minx) * (maxy - miny) / 0.00035)
    g.beginPath()
    for (let i = 0; i < n; i++) {
      const x = range(dr, minx, maxx)
      const y = range(dr, miny, maxy)
      const rad = range(dr, 0.0018, 0.0034)
      if (!p.test(x, y) || (lake && lake.test(x, y)))
        continue
      g.moveTo(x + rad, y)
      g.arc(x, y, rad, 0, Math.PI * 2)
    }
    g.fill()
  }
  // a monument on the plaza: a ring of paving and a column
  if (plaza) {
    g.strokeStyle = pal.tree
    g.lineWidth = 0.001
    g.beginPath()
    g.arc(plaza.x, plaza.y, 0.012 * k, 0, Math.PI * 2)
    g.stroke()
    g.fillStyle = pal.ink
    g.beginPath()
    g.arc(plaza.x, plaza.y, 0.0035, 0, Math.PI * 2)
    g.fill()
  }

  // water
  const areas = lake ? water.areas.concat([lake.ring]) : water.areas
  const shores = lake ? water.shores.concat([lake.ring.concat(lake.ring.slice(0, 2))]) : water.shores
  if (areas.length) {
    const wpath = ringPath(areas, true)
    g.fillStyle = pal.water
    g.fill(wpath)
    g.save()
    g.clip(wpath)
    const spath = ringPath(shores, false)
    if (f.Style === 'Ink') {
      // engraved hatching
      g.strokeStyle = pal.waterLine
      g.lineWidth = 0.0012
      g.beginPath()
      for (let y = fy0; y < fy1; y += 0.0075) {
        g.moveTo(fx0, y)
        g.lineTo(fx1, y)
      }
      g.stroke()
      waterLining(g, spath, pal.water, pal.waterLine, 3, 0.006, 0.0013)
    }
    else {
      waterLining(g, spath, pal.water, pal.waterLine, f.Style === 'Night' ? 2 : 6, 0.0075, 0.0011)
    }
    g.restore()
    g.strokeStyle = pal.waterLine
    g.lineWidth = 0.0016
    g.stroke(spath)
  }

  // buildings
  const bpaths = [new Path2D(), new Path2D(), new Path2D()]
  const q = lots.quads
  for (let i = 0; i < lots.shade.length; i++) {
    const p = bpaths[lots.shade[i]]
    const o = i * 8
    p.moveTo(q[o], q[o + 1])
    p.lineTo(q[o + 2], q[o + 3])
    p.lineTo(q[o + 4], q[o + 5])
    p.lineTo(q[o + 6], q[o + 7])
    p.closePath()
  }
  for (let s = 0; s < 3; s++) {
    g.fillStyle = pal.bld[s]
    g.fill(bpaths[s])
    if (pal.bldLine) {
      g.strokeStyle = pal.bldLine
      g.lineWidth = 0.0008
      g.stroke(bpaths[s])
    }
  }

  // roads, side streets first
  const wk = dens.w
  if (f.Style === 'Night') {
    // glow
    for (let t = 2; t >= 0; t--) {
      g.globalAlpha = 0.1
      g.strokeStyle = pal.casing[t]
      g.lineWidth = WIDTH[t][0] * wk * 2
      g.stroke(paths[t])
    }
    g.globalAlpha = 1
  }
  for (let t = 2; t >= 0; t--) {
    if (f.Style === 'Ink' && t === 2)
      continue
    const bp = roadPath(roads, t, true)
    g.strokeStyle = pal.ink
    g.lineCap = 'butt'
    g.lineWidth = WIDTH[t][0] * wk * 1.9
    g.stroke(bp)
    g.strokeStyle = pal.water
    g.lineWidth = WIDTH[t][0] * wk * 1.5
    g.stroke(bp)
    g.lineCap = 'round'
    if (f.Style !== 'Night') {
      g.strokeStyle = pal.casing[t]
      g.lineWidth = WIDTH[t][0] * wk
      g.stroke(paths[t])
    }
    if (pal.fill) {
      g.strokeStyle = pal.fill[t]
      g.lineWidth = (f.Style === 'Night' ? NIGHT_WIDTH[t] : WIDTH[t][1]) * wk
      g.stroke(paths[t])
    }
  }
  g.restore()

  // --- map furniture --------------------------------------------------
  const lw = 0.0014
  zebraFrame(g, fx0, fy0, fx1, fy1, 0.009, 0.05, pal.ink, pal.paper, lw)
  const corner = int(dr, 0, 3)
  const right = corner % 2 === 1
  const top = corner < 2
  const R = 0.05
  const cxp = right ? fx1 - R * 1.6 : fx0 + R * 1.6
  const cyp = top ? fy0 + R * 1.9 : fy1 - R * 1.5
  compass(g, cxp, cyp, R, pal.ink, pal.paper, lw)
  const sl = 0.2
  const sx = right ? fx0 + 0.04 : fx1 - 0.04 - sl
  scaleBar(g, sx, fy1 - 0.035, sl, pal.ink, pal.paper, lw)

  // paper wear
  if (f.Style === 'Vintage') {
    g.setTransform(1, 0, 0, 1, 0, 0)
    const vg = g.createRadialGradient(W / 2, H / 2, S * 0.3, W / 2, H / 2, Math.hypot(W, H) * 0.6)
    vg.addColorStop(0, 'rgba(120,80,30,0)')
    vg.addColorStop(1, 'rgba(120,80,30,0.22)')
    g.fillStyle = vg
    g.fillRect(0, 0, W, H)
    g.setTransform(S, 0, 0, S, W / 2, H / 2)
    g.fillStyle = '#8a5a2a'
    for (let i = 0; i < 26; i++) {
      g.globalAlpha = range(dr, 0.02, 0.06)
      g.beginPath()
      g.arc(range(dr, -ax, ax), range(dr, -ay, ay), range(dr, 0.004, 0.03), 0, Math.PI * 2)
      g.fill()
    }
    g.globalAlpha = 1
  }
  g.restore()
}

export default {
  slug: 'streets',
  title: 'Streets',
  summary: 'Maps of imaginary cities: streets traced along a blended tensor field, with rivers, coasts, parks and building lots, in vintage, atlas, blueprint, night or ink.',
  order: 450,
  traits: TRAITS,
  features,
  render,
  // Seed-of-seeds 0x57ee7500 ("gallery" stream, 64-hex candidates): the first
  // hash found for each of the first twelve Style x Layout pairs drawn. The
  // Vintage Radial one leads, as the index cover.
  gallery: [
    '0x0fcb483c0d2a7defa2f62b77f998627da1638f4f496d6ac5456dadb84f59d144',
    '0xe931364c9c02501cbf3812e65c762cd62c1cf77f6ca6ab81c5555ac1c85e7e58',
    '0x3e91e6a8c196a58bef3460315659b82930782af53420fe76a3e4b1342723c910',
    '0xdbbe5ec9f74e980b3a2c1c324ca9619b7712df672c4519843e5254989eb2c6ad',
    '0xb97db1a9913d12cb9c41f1378628cc2f3297ae6d8a002d77dbd6c21609a86ed3',
    '0x7f5bf794265399178c7b5260fd55b2de413757337a5d15489c4611852615a4b8',
    '0xac498231abbe948464e232e7b34af1b1e3da129645b7ca393aabd0a17cf1a876',
    '0xce0a60cba4050555eb78199d6cce2f141046d1b978d15527a5f51b4ec1aba79b',
    '0xf7387511393a63393499c82533069af94044e4dd4e28979aa1d81af00d83d4ee',
    '0x6408ed23227f4ae8ea582eae99c4d059ba34f51c862627d19438b0c274a1116b',
    '0xa14c25ed6ec494a2f5665a03ddea7103017242140e6d4e812fa30c828fc26283',
    '0x973b38f798469ef9f29bb56e27cd471264b59f9f13015819884075b56373fa47',
  ],
} satisfies Series
