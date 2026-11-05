// "Mosaic" — stained glass from a relaxed Voronoi diagram.
//
// Seed points are scattered with a density that follows the motif (finer
// pieces near the heart of a rose or a sun), relaxed by a few rounds of
// density-weighted Lloyd iterations, and cut into Voronoi cells by half-plane
// clipping (see ../mosaic/voronoi.ts). Every shared edge is bowed by a smooth
// vector field, the same way from both sides, so the pieces look hand cut.
// Each piece takes its colour from a large pattern (rings, rays, bands, a rose
// or loose patches) so a picture reads from a distance, then is painted as
// glass: a gradient for the light passing through, faint streaks and seeds,
// darker rims, and lead came with soldered joints on top.
//
// Everything is a pure function of the hash, and every length is a fraction
// of the canvas short side. Wider or taller canvases extend the window on
// both sides of the central square.

import type { Density, Domain } from '../mosaic/voronoi'
import type { Rng } from '../random'
import type { Series } from '../types'
import { relax } from '../mosaic/voronoi'
import { chance, int, pick, range, stream, weighted } from '../random'

// ---------------------------------------------------------------------------
// Rarity table — decided before the drawing code, never reordered.
// ---------------------------------------------------------------------------

const TRAITS = {
  Palette: [['Cathedral', 24], ['Sea', 20], ['Ember', 16], ['Pastel', 16], ['Night', 14], ['Verdigris', 10]],
  Pattern: [['Scatter', 22], ['Rings', 24], ['Rays', 20], ['Bands', 20], ['Rose', 14]],
  Cells: [['Few', 25], ['Medium', 50], ['Many', 25]],
  Lead: [['Thin', 30], ['Classic', 45], ['Heavy', 25]],
  Light: [['Flat', 30], ['Glow', 45], ['Backlit', 25]],
} as const

type TraitName = keyof typeof TRAITS
type Features = { [K in TraitName]: typeof TRAITS[K][number][0] }

function features(hash: string): Features {
  const r = stream(hash, 'features')
  return {
    Palette: weighted(r, TRAITS.Palette),
    Pattern: weighted(r, TRAITS.Pattern),
    Cells: weighted(r, TRAITS.Cells),
    Lead: weighted(r, TRAITS.Lead),
    Light: weighted(r, TRAITS.Light),
  }
}

// ---------------------------------------------------------------------------
// Palettes: lead, and six glasses ordered from darkest to lightest.
// ---------------------------------------------------------------------------

type RGB = readonly [number, number, number]

interface Palette {
  lead: string
  /** Highlight along the came. */
  shine: string
  glass: readonly string[]
  /** Index of the glass used for a sun or the heart of a rose. */
  sun: number
}

const PAL: Record<Features['Palette'], Palette> = {
  Cathedral: { lead: '#16130f', shine: '#5a5246', glass: ['#14275e', '#7c1424', '#1f6b45', '#2c56a8', '#d9971f', '#efe2bb'], sun: 4 },
  Sea: { lead: '#101a22', shine: '#4b5d68', glass: ['#0b3550', '#11677f', '#2f9aa4', '#7cc6bf', '#e3b866', '#e6f0e2'], sun: 4 },
  Ember: { lead: '#170e0c', shine: '#5c4033', glass: ['#3a1428', '#7a1913', '#b6381b', '#e0692a', '#f2a63c', '#fbdc86'], sun: 5 },
  Pastel: { lead: '#38333d', shine: '#8a8290', glass: ['#8d9bc4', '#d99aa5', '#9cc3a6', '#c9b5df', '#f2d79a', '#f7efe3'], sun: 4 },
  Night: { lead: '#05060a', shine: '#30344a', glass: ['#090f26', '#15204a', '#2a2f72', '#5b3f8f', '#8fa3d6', '#efc85a'], sun: 5 },
  Verdigris: { lead: '#151a18', shine: '#4c5751', glass: ['#21473d', '#7d4a2e', '#4f8467', '#c26a3f', '#9dbf92', '#e3d3a4'], sun: 5 },
}

function hex(c: string): RGB {
  const v = Number.parseInt(c.slice(1), 16)
  return [v >> 16, (v >> 8) & 255, v & 255]
}

function rgb(c: RGB, k = 1, a = 1): string {
  const f = (x: number) => Math.max(0, Math.min(255, Math.round(x * k)))
  return a < 1 ? `rgba(${f(c[0])},${f(c[1])},${f(c[2])},${a})` : `rgb(${f(c[0])},${f(c[1])},${f(c[2])})`
}

/** Mix towards white (t > 0) or black (t < 0). */
function tint(c: RGB, t: number): RGB {
  if (t >= 0)
    return [c[0] + (255 - c[0]) * t, c[1] + (255 - c[1]) * t, c[2] + (255 - c[2]) * t]
  return [c[0] * (1 + t), c[1] * (1 + t), c[2] * (1 + t)]
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

// ---------------------------------------------------------------------------
// Sizes. Seeds per unit square, came width and pattern scale.
// ---------------------------------------------------------------------------

const CELLS: Record<Features['Cells'], { n: number, rounds: number, lead: number }> = {
  Few: { n: 85, rounds: 3, lead: 1.25 },
  Medium: { n: 230, rounds: 2, lead: 1 },
  Many: { n: 560, rounds: 2, lead: 0.78 },
}

const LEAD: Record<Features['Lead'], number> = { Thin: 0.0032, Classic: 0.0052, Heavy: 0.0082 }

/** How far a shared edge bows, as a fraction of its length. */
const BOW = 0.06

// ---------------------------------------------------------------------------
// Value noise on an integer-hashed lattice.
// ---------------------------------------------------------------------------

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
// The motif: where the pieces are finer, which glass each piece takes, and
// the guide curves the lead must follow so that the picture reads.
// ---------------------------------------------------------------------------

interface Motif {
  density: Density
  /** Glass index for a piece centred at (x, y); r is the glass stream. */
  colour: (x: number, y: number, r: Rng) => number
  /** Polylines, flat [x, y, ...], along which seeds are pinned in mirrored pairs. */
  guides: number[][]
  /** Light source for Glow and Backlit, in unit coordinates. */
  lx: number
  ly: number
}

/** Polyline of a parametric curve t -> [x, y] for t in [t0, t1]. */
function curve(fn: (t: number) => [number, number], t0: number, t1: number, steps: number): number[] {
  const out: number[] = []
  for (let i = 0; i <= steps; i++) {
    const [x, y] = fn(t0 + ((t1 - t0) * i) / steps)
    out.push(x, y)
  }
  return out
}

function circle(cx: number, cy: number, r: number): number[] {
  return curve(t => [cx + Math.cos(t) * r, cy + Math.sin(t) * r], 0, Math.PI * 2, Math.max(24, Math.ceil(r * 400)))
}

function makeMotif(f: Features, pal: Palette, mr: Rng, cellSize: number, dom: Domain): Motif {
  const n1 = makeNoise(mr)
  const n2 = makeNoise(mr)
  const G = pal.glass.length
  const sun = pal.sun
  // three more glasses for the motif, drawn without replacement, darkest first
  const pool = Array.from({ length: G }, (_, i) => i).filter(i => i !== sun)
  const seq: number[] = []
  for (let k = 0; k < 3; k++)
    seq.push(pool.splice(Math.floor(mr() * pool.length), 1)[0])
  seq.sort((a, b) => a - b)
  const [ground, mid, high] = seq
  // farthest corner of the canvas from any point of the unit square
  const reach = Math.hypot(dom.x1 - dom.x0, dom.y1 - dom.y0)

  switch (f.Pattern) {
    case 'Rings': {
      const fx = range(mr, 0.36, 0.64)
      const fy = range(mr, 0.36, 0.64)
      const ring = Math.max(0.075, cellSize * range(mr, 1.6, 2.2))
      const order = [sun, ground, mid, ground, high, ground, mid]
      const guides: number[][] = []
      for (let k = 1; k * ring < reach; k++)
        guides.push(circle(fx, fy, k * ring))
      return {
        lx: fx,
        ly: fy,
        guides,
        density: (x, y) => 1 + 1.6 * Math.exp(-((x - fx) ** 2 + (y - fy) ** 2) / 0.05),
        colour: (x, y) => {
          const k = Math.floor(Math.hypot(x - fx, y - fy) / ring)
          if (k === 0)
            return sun
          return order[1 + ((k - 1) % (order.length - 1))]
        },
      }
    }
    case 'Rays': {
      const low = chance(mr, 0.5)
      const fx = range(mr, 0.4, 0.6)
      const fy = low ? range(mr, 0.8, 0.92) : range(mr, 0.42, 0.58)
      const k = low ? int(mr, 5, 7) : int(mr, 6, 9)
      const turn = mr() * Math.PI * 2
      const core = range(mr, 0.1, 0.14)
      const halo = core + Math.max(0.06, cellSize * 1.1)
      const twist = range(mr, -1.2, 1.2)
      const guides: number[][] = [circle(fx, fy, core), circle(fx, fy, halo)]
      for (let j = 0; j < 2 * k; j++) {
        const a0 = (j / (2 * k)) * Math.PI * 2 - turn
        guides.push(curve(d => [fx + Math.cos(a0 - twist * d) * d, fy + Math.sin(a0 - twist * d) * d], halo, reach, Math.ceil(reach * 300)))
      }
      return {
        lx: fx,
        ly: fy,
        guides,
        density: (x, y) => 1 + 1.5 * Math.exp(-((x - fx) ** 2 + (y - fy) ** 2) / 0.06),
        colour: (x, y) => {
          const d = Math.hypot(x - fx, y - fy)
          if (d < core)
            return sun
          if (d < halo)
            return high
          const a = Math.atan2(y - fy, x - fx) + turn + twist * d
          const s = Math.floor((a / (Math.PI * 2)) * k * 2 + 1000)
          if (s % 2 === 0)
            return ground
          return d > 0.6 && s % 4 === 1 ? high : mid
        },
      }
    }
    case 'Rose': {
      const fx = 0.5
      const fy = 0.5
      // fewer, broader petals when the pieces are large
      const petals = f.Cells === 'Few' ? int(mr, 4, 5) : f.Cells === 'Medium' ? int(mr, 5, 7) : int(mr, 6, 9)
      const turn = mr() * Math.PI * 2
      const outer = range(mr, 0.36, 0.42)
      const heart = 0.2
      const edge = (a: number) => heart + 0.7 * Math.abs(Math.cos(((a + turn) * petals) / 2)) ** 0.8
      const guides: number[][] = [
        circle(fx, fy, heart * outer),
        circle(fx, fy, 0.55 * outer),
        circle(fx, fy, outer),
        circle(fx, fy, 1.13 * outer),
        curve(a => [fx + Math.cos(a) * edge(a) * outer, fy + Math.sin(a) * edge(a) * outer], 0, Math.PI * 2, 720),
      ]
      return {
        lx: fx,
        ly: fy,
        guides,
        density: (x, y) => {
          const d = Math.hypot(x - fx, y - fy)
          return d < outer ? 3.2 - 1.8 * (d / outer) : 0.75
        },
        colour: (x, y, r) => {
          const d = Math.hypot(x - fx, y - fy)
          const e = d / outer
          if (e < heart)
            return sun
          if (e < edge(Math.atan2(y - fy, x - fx)))
            return e < 0.55 ? high : mid
          if (e < 1)
            return ground
          if (e < 1.13)
            return high
          // spandrels: loose patches of two glasses
          return n1(x * 2.5, y * 2.5) + (r() - 0.5) * 0.15 > 0.55 ? mid : ground
        },
      }
    }
    case 'Bands': {
      const ang = range(mr, -0.6, 0.6) + (chance(mr, 0.5) ? Math.PI / 2 : 0)
      const ca = Math.cos(ang)
      const sa = Math.sin(ang)
      const waves = range(mr, 0.8, 2.2)
      const amp = range(mr, 0.025, 0.06)
      const phase = mr() * Math.PI * 2
      const bands = int(mr, 5, 8)
      const flip = chance(mr, 0.5)
      const lift = (v: number) => Math.sin(v * waves * Math.PI * 2 + phase) * amp
      const guides: number[][] = []
      for (let b = 1; b < bands; b++) {
        const u = b / bands - 0.5
        guides.push(curve(v => [0.5 + (u - lift(v)) * ca - v * sa, 0.5 + (u - lift(v)) * sa + v * ca], -reach, reach, Math.ceil(reach * 400)))
      }
      return {
        lx: 0.5 - ca * 0.4,
        ly: 0.5 - sa * 0.4,
        guides,
        density: (x, y) => 0.6 + 1.1 * n2(x * 2, y * 2),
        colour: (x, y) => {
          const u = (x - 0.5) * ca + (y - 0.5) * sa
          const v = -(x - 0.5) * sa + (y - 0.5) * ca
          let t = Math.max(0, Math.min(0.999, u + lift(v) + 0.5))
          if (flip)
            t = 0.999 - t
          // one glass per band, dark to light, every other band a step brighter
          const b = Math.floor(t * bands)
          const gi = Math.floor((b / bands) * G)
          return b % 2 === 1 ? Math.min(G - 1, gi + 1) : gi
        },
      }
    }
    default: {
      // Scatter: roundels thrown over a patchy ground. Where they overlap the
      // glass lights up, and every circle stays visible in the lead.
      const count = int(mr, 3, 6)
      const discs: [number, number, number, number, number][] = []
      for (let i = 0; i < count; i++) {
        // never smaller than a couple of pieces across, or the circle is lost
        const rr = Math.max(range(mr, 0.1, 0.25) * (1 - i * 0.08), cellSize * 2.2)
        // a few tries to keep the roundels from piling up; the last try stands
        let dx = 0.5
        let dy = 0.5
        for (let t = 0; t < 12; t++) {
          dx = range(mr, 0.12, 0.88)
          dy = range(mr, 0.12, 0.88)
          if (discs.every(([ox, oy, or]) => Math.hypot(dx - ox, dy - oy) > 0.8 * (rr + or)))
            break
        }
        // roundels in the lighter half of the palette, over the darkest glass
        const own = int(mr, Math.floor(G / 2), G - 1)
        const inner = pick(mr, [sun, high, Math.min(G - 1, own + 1)])
        discs.push([dx, dy, rr, own, inner])
      }
      const guides: number[][] = []
      for (const [dx, dy, rr] of discs)
        guides.push(circle(dx, dy, rr), circle(dx, dy, rr * 0.48))
      const [lx, ly] = discs[0]
      return {
        lx,
        ly,
        guides,
        density: (x, y) => {
          let v = 0.8
          for (const [dx, dy, rr] of discs)
            v += 0.6 * Math.exp(-((x - dx) ** 2 + (y - dy) ** 2) / (rr * rr))
          return v
        },
        colour: (x, y, r) => {
          let hits = 0
          let gi = 0
          for (const [dx, dy, rr, own, inner] of discs) {
            const e = Math.hypot(x - dx, y - dy) / rr
            if (e < 1) {
              hits++
              gi = e < 0.48 ? inner : own
            }
          }
          if (hits > 1)
            return sun
          if (hits === 1)
            return gi
          const v = n1(x * 2.6, y * 2.6) + (r() - 0.5) * 0.12
          return v > 0.6 ? 1 : 0
        },
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Seeds. Pinned pairs first, mirrored across each guide so that the bisector
// between them, a lead line, runs along it. Free seeds then fill the central
// unit square, then the extensions, so a square render and the middle of a
// wide one share the same pieces. No randomness for the pinned pairs.
// ---------------------------------------------------------------------------

class PointGrid {
  private cells = new Map<number, number[]>()
  constructor(private size: number) {}
  private key(gx: number, gy: number) {
    return (gx + 4096) * 8192 + (gy + 4096)
  }

  add(x: number, y: number) {
    const k = this.key(Math.floor(x / this.size), Math.floor(y / this.size))
    let c = this.cells.get(k)
    if (!c)
      this.cells.set(k, c = [])
    c.push(x, y)
  }

  /** Is any point closer than r (r <= size)? */
  near(x: number, y: number, r: number): boolean {
    const gx = Math.floor(x / this.size)
    const gy = Math.floor(y / this.size)
    for (let j = gy - 1; j <= gy + 1; j++) {
      for (let i = gx - 1; i <= gx + 1; i++) {
        const c = this.cells.get(this.key(i, j))
        if (!c)
          continue
        for (let k = 0; k < c.length; k += 2) {
          if ((c[k] - x) ** 2 + (c[k + 1] - y) ** 2 < r * r)
            return true
        }
      }
    }
    return false
  }
}

function pinGuides(guides: number[][], dens: Density, cellSize: number, dom: Domain, grid: PointGrid, xs: number[], ys: number[]) {
  const inside = (x: number, y: number) => x > dom.x0 && x < dom.x1 && y > dom.y0 && y < dom.y1
  for (const line of guides) {
    let acc = 0
    let next = 0
    for (let i = 0; i + 3 < line.length; i += 2) {
      const ax = line[i]
      const ay = line[i + 1]
      const ex = line[i + 2] - ax
      const ey = line[i + 3] - ay
      const len = Math.hypot(ex, ey)
      if (len < 1e-9)
        continue
      while (next <= acc + len) {
        const t = (next - acc) / len
        const px = ax + ex * t
        const py = ay + ey * t
        const s = (1.15 * cellSize) / Math.sqrt(dens(px, py))
        const dl = 0.2 * s
        const nx = (-ey / len) * dl
        const ny = (ex / len) * dl
        const ok = inside(px, py) && !grid.near(px + nx, py + ny, 0.5 * s) && !grid.near(px - nx, py - ny, 0.5 * s)
        if (ok) {
          grid.add(px + nx, py + ny)
          grid.add(px - nx, py - ny)
          xs.push(px + nx, px - nx)
          ys.push(py + ny, py - ny)
        }
        next += s
      }
      acc += len
    }
  }
}

function scatter(r: Rng, n: number, dens: Density, maxD: number, box: Domain, skipSquare: boolean, grid: PointGrid, cellSize: number, xs: number[], ys: number[]) {
  let placed = 0
  for (let tries = 0; placed < n && tries < n * 200; tries++) {
    const x = range(r, box.x0, box.x1)
    const y = range(r, box.y0, box.y1)
    const keep = r()
    if (skipSquare && x >= 0 && x <= 1 && y >= 0 && y <= 1)
      continue
    const dv = dens(x, y)
    if (keep * maxD > dv || grid.near(x, y, (0.45 * cellSize) / Math.sqrt(dv)))
      continue
    xs.push(x)
    ys.push(y)
    placed++
  }
}

/** Mean and max density over a region, on a fixed grid (no randomness). */
function meanDensity(dens: Density, box: Domain, skipSquare: boolean): [number, number] {
  let s = 0
  let c = 0
  let mx = 0
  const step = 1 / 48
  for (let y = box.y0 + step / 2; y < box.y1; y += step) {
    for (let x = box.x0 + step / 2; x < box.x1; x += step) {
      const v = dens(x, y)
      mx = Math.max(mx, v)
      if (skipSquare && x >= 0 && x <= 1 && y >= 0 && y <= 1)
        continue
      s += v
      c++
    }
  }
  return [c ? s / c : 0, mx]
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function render(g: CanvasRenderingContext2D, W: number, H: number, hash: string) {
  const f = features(hash)
  const pal = PAL[f.Palette]
  const cfg = CELLS[f.Cells]
  const S = Math.min(W, H)
  // the unit square is centred; the domain covers the whole canvas
  const dom: Domain = { x0: -(W / S - 1) / 2, y0: -(H / S - 1) / 2, x1: 0, y1: 0 }
  dom.x1 = 1 - dom.x0
  dom.y1 = 1 - dom.y0
  const X = (x: number) => (x - dom.x0) * S
  const Y = (y: number) => (y - dom.y0) * S

  // Fixed stream order: motif, seeds, extension, bow, glass.
  const mr = stream(hash, 'motif')
  const sr = stream(hash, 'seeds')
  const er = stream(hash, 'extend')
  const br = stream(hash, 'bow')
  const gr = stream(hash, 'glass')

  const cellSize = 1 / Math.sqrt(cfg.n)
  const motif = makeMotif(f, pal, mr, cellSize, dom)

  // --- seeds and cells ------------------------------------------------------
  const unit: Domain = { x0: 0, y0: 0, x1: 1, y1: 1 }
  const [meanIn, maxIn] = meanDensity(motif.density, unit, false)
  const [meanAll, maxAll] = meanDensity(motif.density, dom, true)
  const maxD = Math.max(maxIn, maxAll) * 1.05
  const xsA: number[] = []
  const ysA: number[] = []
  const grid = new PointGrid(cellSize)
  pinGuides(motif.guides, motif.density, cellSize, dom, grid, xsA, ysA)
  const pinned = xsA.length
  let pinnedIn = 0
  for (let i = 0; i < pinned; i++) {
    if (xsA[i] >= 0 && xsA[i] <= 1 && ysA[i] >= 0 && ysA[i] <= 1)
      pinnedIn++
  }
  // a pinned pair stands for about one piece
  scatter(sr, Math.max(0, cfg.n - pinnedIn / 2), motif.density, maxD, unit, false, grid, cellSize, xsA, ysA)
  const extArea = (dom.x1 - dom.x0) * (dom.y1 - dom.y0) - 1
  if (extArea > 1e-6) {
    const extra = Math.round(cfg.n * extArea * (meanAll / meanIn)) - (pinned - pinnedIn) / 2
    scatter(er, Math.max(0, extra), motif.density, maxD, dom, true, grid, cellSize, xsA, ysA)
  }
  const xs = Float64Array.from(xsA)
  const ys = Float64Array.from(ysA)
  const cells = relax(xs, ys, dom, motif.density, cfg.rounds, pinned)

  // --- edges, bowed by a smooth vector field --------------------------------
  // The control point is mid + (v . n) n * len: the same from both sides of an
  // edge whatever its orientation, so neighbouring pieces stay flush.
  const bx = makeNoise(br)
  const by = makeNoise(br)
  const bowF = 1 / (cellSize * 1.3)
  const eps = 1e-9
  const onRim = (x: number, y: number) =>
    Math.abs(x - dom.x0) < eps || Math.abs(x - dom.x1) < eps || Math.abs(y - dom.y0) < eps || Math.abs(y - dom.y1) < eps

  const paths: Path2D[] = []
  const lead = new Path2D()
  const joints: number[] = []
  for (const p of cells) {
    const m = p.length / 2
    const path = new Path2D()
    if (m < 3) {
      paths.push(path)
      continue
    }
    path.moveTo(X(p[0]), Y(p[1]))
    lead.moveTo(X(p[0]), Y(p[1]))
    for (let v = 0; v < m; v++) {
      const ax = p[v * 2]
      const ay = p[v * 2 + 1]
      const u = (v + 1) % m
      const qx = p[u * 2]
      const qy = p[u * 2 + 1]
      const ex = qx - ax
      const ey = qy - ay
      const len = Math.hypot(ex, ey)
      const rimA = onRim(ax, ay)
      const rimB = onRim(qx, qy)
      if (!rimA || !rimB)
        joints.push(ax, ay)
      if (len < 1e-7 || (rimA && rimB)) {
        path.lineTo(X(qx), Y(qy))
        lead.lineTo(X(qx), Y(qy))
        continue
      }
      const mx = (ax + qx) / 2
      const my = (ay + qy) / 2
      const nx = -ey / len
      const ny = ex / len
      const vx = bx(mx * bowF, my * bowF) - 0.5
      const vy = by(mx * bowF, my * bowF) - 0.5
      const k = (vx * nx + vy * ny) * 2 * BOW * len * 2
      const cx = mx + nx * k
      const cy = my + ny * k
      path.quadraticCurveTo(X(cx), Y(cy), X(qx), Y(qy))
      lead.quadraticCurveTo(X(cx), Y(cy), X(qx), Y(qy))
    }
    path.closePath()
    lead.closePath()
    paths.push(path)
  }

  // --- glass ----------------------------------------------------------------
  const glass = pal.glass.map(hex)
  const dark = f.Palette === 'Night'
  const L = LEAD[f.Lead] * cfg.lead * S
  g.globalAlpha = 1
  g.globalCompositeOperation = 'source-over'
  g.fillStyle = pal.lead
  g.fillRect(0, 0, W, H)

  const streakLite = new Path2D()
  const streakDark = new Path2D()
  const seeds = new Path2D()
  for (let i = 0; i < cells.length; i++) {
    const p = cells[i]
    const m = p.length / 2
    if (m < 3)
      continue
    // fixed draw order per piece: colour (via motif), sparkle, shade, angle, texture
    let cx = 0
    let cy = 0
    let rad = 0
    for (let v = 0; v < m; v++) {
      cx += p[v * 2] / m
      cy += p[v * 2 + 1] / m
    }
    for (let v = 0; v < m; v++)
      rad = Math.max(rad, Math.hypot(p[v * 2] - cx, p[v * 2 + 1] - cy))
    let gi = motif.colour(cx, cy, gr)
    const sparkle = gr()
    const sparkleIdx = Math.floor(gr() * glass.length)
    if (sparkle < 0.05)
      gi = sparkleIdx
    let c: RGB = glass[gi]
    const shade = range(gr, -0.1, 0.08)
    c = tint(c, shade)
    const ang = gr() * Math.PI * 2

    // light falloff from the source
    const dl = Math.hypot(cx - motif.lx, cy - motif.ly)
    if (f.Light === 'Backlit') {
      const lit = Math.exp(-(dl * dl) / 0.18)
      c = lit > 0.5 ? tint(c, (lit - 0.5) * 0.5) : tint(c, -(0.5 - lit) * 0.75)
    }

    const px = X(cx)
    const py = Y(cy)
    const pr = rad * S
    let fill: CanvasGradient
    if (f.Light === 'Flat') {
      const dx = Math.cos(ang) * pr
      const dy = Math.sin(ang) * pr
      fill = g.createLinearGradient(px - dx, py - dy, px + dx, py + dy)
      fill.addColorStop(0, rgb(tint(c, 0.1)))
      fill.addColorStop(0.55, rgb(c))
      fill.addColorStop(1, rgb(tint(c, -0.12)))
    }
    else {
      // brightest spot leans towards the light
      const tx = dl > 1e-6 ? (motif.lx - cx) / dl : 0
      const ty = dl > 1e-6 ? (motif.ly - cy) / dl : 0
      const hx = px + tx * pr * 0.35
      const hy = py + ty * pr * 0.35
      fill = g.createRadialGradient(hx, hy, 0, hx, hy, pr * 1.35)
      fill.addColorStop(0, rgb(tint(c, dark ? 0.26 : 0.2)))
      fill.addColorStop(0.45, rgb(c))
      fill.addColorStop(1, rgb(tint(c, -0.2)))
    }
    g.fillStyle = fill
    g.fill(paths[i])

    // texture: streaks across the sheet, and a few seeds (bubbles), kept
    // inside the inscribed circle so that no clipping is needed
    const streaks = int(gr, 2, 5)
    const bubbles = chance(gr, 0.3) ? int(gr, 1, 4) : 0
    let ins = rad
    for (let v = 0; v < m; v++) {
      const ax = p[v * 2]
      const ay = p[v * 2 + 1]
      const u = (v + 1) % m
      const ex = p[u * 2] - ax
      const ey = p[u * 2 + 1] - ay
      const len = Math.hypot(ex, ey)
      if (len > 1e-9)
        ins = Math.min(ins, Math.abs((cx - ax) * ey - (cy - ay) * ex) / len)
    }
    const ir = ins * S * 0.92
    const ca = Math.cos(ang + 1.3)
    const sa = Math.sin(ang + 1.3)
    for (let s = 0; s < streaks; s++) {
      const off = range(gr, -0.8, 0.8) * ir
      const bend = range(gr, -0.15, 0.15) * ir
      const lite = chance(gr, 0.6)
      const half = Math.sqrt(ir * ir - off * off) * 0.95
      const path = lite ? streakLite : streakDark
      path.moveTo(px - ca * half - sa * off, py - sa * half + ca * off)
      path.quadraticCurveTo(px - sa * (off + bend), py + ca * (off + bend), px + ca * half - sa * off, py + sa * half + ca * off)
    }
    for (let s = 0; s < bubbles; s++) {
      const a = gr() * Math.PI * 2
      const br2 = Math.min(range(gr, 0.0012, 0.003) * S, ir * 0.3)
      const d = gr() * Math.max(0, ir * 0.8 - br2)
      const bxp = px + Math.cos(a) * d
      const byp = py + Math.sin(a) * d
      seeds.moveTo(bxp + br2, byp)
      seeds.arc(bxp, byp, br2, 0, Math.PI * 2)
    }
  }
  g.lineCap = 'round'
  g.lineWidth = Math.max(0.6, 0.0016 * S)
  g.strokeStyle = 'rgba(255,255,255,0.12)'
  g.stroke(streakLite)
  g.strokeStyle = 'rgba(0,0,0,0.10)'
  g.stroke(streakDark)
  g.fillStyle = 'rgba(255,255,255,0.22)'
  g.fill(seeds)

  // --- came: darker rims on the glass, lead, highlight, solder --------------
  g.lineJoin = 'round'
  g.lineCap = 'round'
  g.strokeStyle = 'rgba(0,0,0,0.28)'
  g.lineWidth = L * 2.6
  g.stroke(lead)
  g.strokeStyle = pal.lead
  g.lineWidth = L
  g.stroke(lead)
  g.save()
  g.translate(-L * 0.14, -L * 0.14)
  g.strokeStyle = pal.shine
  g.globalAlpha = 0.55
  g.lineWidth = L * 0.28
  g.stroke(lead)
  g.restore()

  const solder = new Path2D()
  const jr = L * 0.72
  for (let k = 0; k < joints.length; k += 2) {
    const jx = X(joints[k])
    const jy = Y(joints[k + 1])
    solder.moveTo(jx + jr, jy)
    solder.arc(jx, jy, jr, 0, Math.PI * 2)
  }
  g.fillStyle = pal.lead
  g.fill(solder)

  // frame
  g.strokeStyle = pal.lead
  g.lineWidth = L * 3
  g.strokeRect(0, 0, W, H)

  // halation around the light source
  if (f.Light === 'Backlit') {
    const hx = X(motif.lx)
    const hy = Y(motif.ly)
    const halo = g.createRadialGradient(hx, hy, 0, hx, hy, 0.45 * S)
    const sunC = glass[pal.sun]
    halo.addColorStop(0, rgb(mix(sunC, [255, 255, 255], 0.5), 1, dark ? 0.32 : 0.22))
    halo.addColorStop(1, rgb(sunC, 1, 0))
    g.globalCompositeOperation = 'screen'
    g.fillStyle = halo
    g.fillRect(0, 0, W, H)
    g.globalCompositeOperation = 'source-over'
  }
  g.globalAlpha = 1
}

export default {
  slug: 'mosaic',
  title: 'Mosaic',
  summary: 'Stained glass cut from a relaxed Voronoi diagram: rose windows, sunbursts, rings and bands set in lead.',
  order: 80,
  traits: TRAITS,
  features,
  render,
  // Seed-of-seeds 0x6a05a1c0 ("gallery" stream): the first hash found for each
  // Palette x Pattern pair, the first twelve pairs in the order found, except
  // that the fourth (Cathedral rings, the archetype of the series) is moved
  // first to serve as the cover.
  gallery: [
    '0x162ef48a28024815332b53d82b3cb1e8b14a5384427ebf358ccc280474315856',
    '0x35df5303591aee2b8055def97091aaf01cbbc73371aab0875be43abf191a4e34',
    '0x6e006efd1c702e67076b7165668441be4a9eed01ee24c104bfca3cf51a1d7012',
    '0x96f2f363362858936747dfc9bdfa5fbb81faee68313d97678831346a44cac44a',
    '0x7268af88e5c0d8b7682b61f17ad87fdaece394762c7b118f6c5ca8dc73a20ab2',
    '0xb900191a69491e96b0ed98de2c7f607d8d2d7659f950bacaed4cc21c10f9330d',
    '0xd915b16e47091599b133c8276d6dd95fa259da8439e6aa0dcd26523cca513a49',
    '0xccacfafa26d21fe6bbc0be7905a1e98e7e44204b47063bcfcc0095a3602fe64a',
    '0xb0272b5d36f9235a4af9466a5baccdf2a0fee3d96dbf912400f600cdc6121969',
    '0xd2309ebbb6c125847752199961cd079cd64281cdc6d79d052b5a63efd28383d1',
    '0xecc36cad16a76d3fe5a9cf13b7429abe2b293fff5aba6292ce1dcc9e5f61b289',
    '0x04c70514060ab33b9cb3a6688635c687a242a6b3de1b0b91e47fbaef1168e8d5',
  ],
} satisfies Series
