// Crack network for the "Crackle" series.
//
// Cracks are agents in the spirit of Jared Tarbell's Substrate (2003): each
// one starts on an existing crack (or on the edge of the slab), leaves it at
// roughly a right angle, wanders a little and stops as soon as it runs into
// another crack. Because every crack is grown on its own, one after the other,
// each one splits an existing domain in two: this is the "successive domain
// division" that Bohn, Pauchard and Couder (Phys. Rev. E 71, 2005) read in
// ceramic glazes and dried mud. A crack is only kept when the domain it cuts
// is wider than the local critical spacing (which follows the thickness of the
// layer), so the cells end up with a fairly even size, finer where the layer
// is thin. Close to the crack it is heading for, an agent turns to meet it at a
// right angle, as real cracks do near a free surface.
//
// The network is then a planar graph (T-junctions everywhere), and its faces
// are the cells. Faces are found by walking half-edges around each node.
//
// Coordinates are in units of the canvas short side: the slab is
// [0, w] x [0, h] with min(w, h) = 1.

import type { Rng } from '../random'
import { gaussian } from '../random'

export interface Crack {
  /** Flat x, y list. */
  pts: number[]
  /** Generation: 0 for the seeds, parent + 1 for the others. */
  gen: number
  /** Network order: 0 for the primary network, 1 for the secondary one. */
  order: number
  /** Cumulative arc length at each point. */
  arc: number[]
  /** Junctions on this crack: [position (segment + u), node id]. */
  events: [number, number][]
  startNode: number
  endNode: number
}

export interface GrowOptions {
  /** Critical spacing at (x, y): a domain narrower than this is not split. */
  spacing: (x: number, y: number) => number
  /** Step length of an agent. */
  step: number
  /** Standard deviation of the heading change per step (radians). */
  wobble: number
  /** Max deviation from the perpendicular when a crack leaves its parent. */
  spread: number
  /** Probability per step of a sudden kink, and its size. */
  kink: number
  /** Fraction of the spacing within which an agent turns to meet a crack. */
  steer: number
  /** Number of seed cracks grown in both directions from the open slab. */
  seeds: number
  /** Stop after this many consecutive rejected candidates. */
  patience: number
  /** Network order written on the cracks of this pass. */
  order: number
}

export interface Network {
  w: number
  h: number
  cracks: Crack[]
  nodes: number[]
  /** Spatial index of every segment, border included. */
  grid: SegmentGrid
  /** Centre and half extent of the border, where seeds are planted. */
  box: readonly [number, number, number, number]
}

export interface Cell {
  /** Flat x, y polygon. */
  poly: number[]
  area: number
  cx: number
  cy: number
}

const BORDER = 0

/**
 * A slab of size w x h whose edge is the closed polyline `border` (first point
 * repeated at the end), lying inside [0, w] x [0, h]. The border is crack 0.
 */
export function createNetwork(w: number, h: number, border: number[], gridCell: number): Network {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (let i = 0; i < border.length; i += 2) {
    x0 = Math.min(x0, border[i])
    x1 = Math.max(x1, border[i])
    y0 = Math.min(y0, border[i + 1])
    y1 = Math.max(y1, border[i + 1])
  }
  const net: Network = {
    w,
    h,
    cracks: [],
    nodes: [border[0], border[1]],
    grid: new SegmentGrid(w, h, gridCell),
    box: [(x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2],
  }
  addCrack(net, border.slice(), -1, -1, 0, 0)
  return net
}

/**
 * Straight cracks laid before growth (the grout lines of a tiled slab):
 * horizontal lines at `ys` across the whole width, vertical lines at `xs`
 * cut into pieces between them. Needs a rectangular border.
 */
export function addGridLines(net: Network, xs: number[], ys: number[], gen: number, order: number) {
  const { w, h } = net
  const onBorder = (x: number, y: number, pos: number) => {
    const node = addNode(net, x, y)
    net.cracks[BORDER].events.push([pos, node])
    return node
  }
  // crossing nodes, indexed [row][column]
  const cross: number[][] = []
  const rows: number[] = []
  for (const y of ys) {
    const pts = [w, y]
    for (let k = xs.length - 1; k >= 0; k--)
      pts.push(xs[k], y)
    pts.push(0, y)
    const id = addCrack(net, pts, gen, order, onBorder(w, y, 1 + y / h), onBorder(0, y, 3 + (h - y) / h))
    rows.push(id)
    const nodes: number[] = []
    for (let k = 0; k < xs.length; k++) {
      const node = addNode(net, xs[k], y)
      net.cracks[id].events.push([xs.length - k, node])
      nodes.push(node)
    }
    cross.push(nodes)
  }
  for (let k = 0; k < xs.length; k++) {
    const x = xs[k]
    let top = onBorder(x, 0, x / w)
    let yTop = 0
    for (let j = 0; j <= ys.length; j++) {
      const y = j < ys.length ? ys[j] : h
      const bottom = j < ys.length ? cross[j][k] : onBorder(x, h, 2 + (w - x) / w)
      addCrack(net, [x, yTop, x, y], gen, order, top, bottom)
      top = bottom
      yTop = y
    }
  }
}

function arcOf(pts: number[]): number[] {
  const arc = [0]
  for (let i = 2; i < pts.length; i += 2)
    arc.push(arc[arc.length - 1] + Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]))
  return arc
}

function addNode(net: Network, x: number, y: number): number {
  net.nodes.push(x, y)
  return net.nodes.length / 2 - 1
}

// ---------------------------------------------------------------------------
// Spatial index of segments (not including the border).
// ---------------------------------------------------------------------------

export class SegmentGrid {
  cell: number
  nx: number
  ny: number
  bins: number[][]
  ax: number[] = []
  ay: number[] = []
  bx: number[] = []
  by: number[] = []
  crack: number[] = []
  seg: number[] = []

  constructor(w: number, h: number, cell: number) {
    this.cell = cell
    this.nx = Math.max(1, Math.ceil(w / cell))
    this.ny = Math.max(1, Math.ceil(h / cell))
    this.bins = Array.from({ length: this.nx * this.ny }, () => [])
  }

  add(ax: number, ay: number, bx: number, by: number, crack: number, seg: number) {
    const id = this.ax.length
    this.ax.push(ax)
    this.ay.push(ay)
    this.bx.push(bx)
    this.by.push(by)
    this.crack.push(crack)
    this.seg.push(seg)
    const i0 = this.ix(Math.min(ax, bx))
    const i1 = this.ix(Math.max(ax, bx))
    const j0 = this.iy(Math.min(ay, by))
    const j1 = this.iy(Math.max(ay, by))
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++)
        this.bins[j * this.nx + i].push(id)
    }
  }

  ix(x: number) {
    return Math.max(0, Math.min(this.nx - 1, Math.floor(x / this.cell)))
  }

  iy(y: number) {
    return Math.max(0, Math.min(this.ny - 1, Math.floor(y / this.cell)))
  }
}

// Intersection of p->q with a->b: returns t along p->q and u along a->b, or null.
function intersect(px: number, py: number, qx: number, qy: number, ax: number, ay: number, bx: number, by: number): [number, number] | null {
  const rx = qx - px
  const ry = qy - py
  const sx = bx - ax
  const sy = by - ay
  const den = rx * sy - ry * sx
  if (Math.abs(den) < 1e-14)
    return null
  const t = ((ax - px) * sy - (ay - py) * sx) / den
  const u = ((ax - px) * ry - (ay - py) * rx) / den
  if (t <= 1e-9 || t > 1 || u < 0 || u > 1)
    return null
  return [t, u]
}

/** Point on a crack at an arc length. Returns [x, y, position, dx, dy]. */
function pointAtArc(c: Crack, s: number): [number, number, number, number, number] {
  const arc = c.arc
  let lo = 0
  let hi = arc.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (arc[mid] <= s)
      lo = mid
    else
      hi = mid
  }
  const len = arc[hi] - arc[lo] || 1e-12
  const u = Math.max(0, Math.min(1, (s - arc[lo]) / len))
  const ax = c.pts[lo * 2]
  const ay = c.pts[lo * 2 + 1]
  const bx = c.pts[hi * 2]
  const by = c.pts[hi * 2 + 1]
  return [ax + (bx - ax) * u, ay + (by - ay) * u, lo + u, (bx - ax) / len, (by - ay) / len]
}

function arcAtPos(c: Crack, pos: number): number {
  const k = Math.min(Math.floor(pos), c.arc.length - 2)
  return c.arc[k] + (c.arc[k + 1] - c.arc[k]) * (pos - k)
}

interface Hit { crack: number, pos: number, x: number, y: number }

interface Agent {
  pts: number[]
  hit: Hit | null
  ok: boolean
}

/**
 * Grows one agent from (x, y) with heading a until it hits a crack or the border.
 * `parent` segments are ignored for the first steps so the agent can leave them.
 */
function grow(net: Network, grid: SegmentGrid, r: Rng, o: GrowOptions, x: number, y: number, a: number, parent: number, sibling: number[] | null, check: boolean): Agent {
  const { w, h } = net
  const pts = [x, y]
  let px = x
  let py = y
  let heading = a
  const lam0 = o.spacing(x, y)
  const maxSteps = Math.ceil((w + h) * 3 / o.step)
  for (let n = 0; n < maxSteps; n++) {
    // wander and kink (always the same number of draws per step)
    heading += gaussian(r) * o.wobble
    const k = r()
    const ks = r()
    if (k < o.kink)
      heading += (ks - 0.5) * 1.1

    // a crack does not curl back on itself
    if (Math.abs(heading - a) > 2.4)
      return { pts, hit: null, ok: false }

    // look around (every other step): turn to meet a crack ahead at a right
    // angle, and reject when running alongside a crack closer than the
    // critical spacing
    if (!(n & 1)) {
      const lam = o.spacing(px, py)
      const R = lam * o.steer
      const near = lam * 0.42
      let best = R
      let bnx = 0
      let bny = 0
      const dx = Math.cos(heading)
      const dy = Math.sin(heading)
      const rad = Math.max(R, near)
      const i0 = grid.ix(px - rad)
      const i1 = grid.ix(px + rad)
      const j0 = grid.iy(py - rad)
      const j1 = grid.iy(py + rad)
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const bin = grid.bins[j * grid.nx + i]
          for (let b = 0; b < bin.length; b++) {
            const id = bin[b]
            if (n < 4 && grid.crack[id] === parent)
              continue
            const ax = grid.ax[id]
            const ay = grid.ay[id]
            const sx = grid.bx[id] - ax
            const sy = grid.by[id] - ay
            const l2 = sx * sx + sy * sy || 1e-12
            const t = Math.max(0, Math.min(1, ((px - ax) * sx + (py - ay) * sy) / l2))
            const ex = ax + sx * t - px
            const ey = ay + sy * t - py
            const d2 = ex * ex + ey * ey
            if (d2 >= rad * rad || d2 < 1e-18)
              continue
            const d = Math.sqrt(d2)
            if (check && n > 2 && d < near && Math.abs(sx * dx + sy * dy) > 0.82 * Math.sqrt(l2))
              return { pts, hit: null, ok: false }
            if (d < best && (ex * dx + ey * dy) > 0.15 * d) {
              best = d
              bnx = ex / d
              bny = ey / d
            }
          }
        }
      }
      if (best < R) {
        // rotate the heading towards the normal of the crack ahead
        const s = (1 - best / R) * 0.6
        const cross = dx * bny - dy * bnx
        heading += Math.max(-s, Math.min(s, cross * s * 2))
      }
    }

    const qx = px + Math.cos(heading) * o.step
    const qy = py + Math.sin(heading) * o.step

    // collision with cracks
    let bt = 2
    let hit: Hit | null = null
    const seen = (id: number) => {
      const c = grid.crack[id]
      if (c === parent && n < 3)
        return
      const res = intersect(px, py, qx, qy, grid.ax[id], grid.ay[id], grid.bx[id], grid.by[id])
      if (res && res[0] < bt) {
        bt = res[0]
        hit = { crack: c, pos: grid.seg[id] + res[1], x: px + (qx - px) * res[0], y: py + (qy - py) * res[0] }
      }
    }
    for (let j = grid.iy(qy - o.step); j <= grid.iy(qy + o.step); j++) {
      for (let i = grid.ix(qx - o.step); i <= grid.ix(qx + o.step); i++) {
        const bin = grid.bins[j * grid.nx + i]
        for (let b = 0; b < bin.length; b++)
          seen(bin[b])
      }
    }
    // a seed's second half must stop on the first half too
    if (sibling && n > 2) {
      for (let i = 0; i + 3 < sibling.length; i += 2) {
        const res = intersect(px, py, qx, qy, sibling[i], sibling[i + 1], sibling[i + 2], sibling[i + 3])
        if (res && res[0] < bt) {
          bt = res[0]
          hit = { crack: -2, pos: i / 2 + res[1], x: px + (qx - px) * res[0], y: py + (qy - py) * res[0] }
        }
      }
    }

    // the border is in the index; this only guards against numerical escape
    if (!hit && (qx < 0 || qy < 0 || qx > w || qy > h))
      return { pts, hit: null, ok: false }

    if (hit) {
      const H = hit as Hit
      pts.push(H.x, H.y)
      // a domain narrower than the critical spacing is not split
      const len = arcOf(pts).at(-1)!
      return { pts, hit: H, ok: !check || len > Math.min(lam0, o.spacing(H.x, H.y)) * 0.62 }
    }
    pts.push(qx, qy)
    px = qx
    py = qy
  }
  return { pts, hit: null, ok: false }
}

function addCrack(net: Network, pts: number[], gen: number, order: number, startNode: number, endNode: number): number {
  const id = net.cracks.length
  net.cracks.push({ pts, gen, order, arc: arcOf(pts), events: [], startNode, endNode })
  for (let i = 0; i + 3 < pts.length; i += 2)
    net.grid.add(pts[i], pts[i + 1], pts[i + 2], pts[i + 3], id, i / 2)
  return id
}

function endOn(net: Network, hit: Hit): number {
  const node = addNode(net, hit.x, hit.y)
  net.cracks[hit.crack].events.push([hit.pos, node])
  return node
}

/** Total length of the cracks able to spawn children (border counted at a reduced weight). */
function lengths(net: Network, borderWeight: number): number[] {
  const cum: number[] = []
  let t = 0
  for (let i = 0; i < net.cracks.length; i++) {
    const c = net.cracks[i]
    t += c.arc[c.arc.length - 1] * (i === BORDER ? borderWeight : 1)
    cum.push(t)
  }
  return cum
}

/**
 * Grows a pass of cracks on the network. Several passes can share a network
 * (primary then secondary order); the spatial index is kept between them.
 */
export function growPass(net: Network, r: Rng, o: GrowOptions, maxCracks: number) {
  const grid = net.grid
  const [bx, by, ex, ey] = net.box

  // seeds: grown both ways from a point of the open slab
  for (let s = 0; s < o.seeds; s++) {
    const x = bx + ex * 0.7 * (r() * 2 - 1)
    const y = by + ey * 0.7 * (r() * 2 - 1)
    const a = r() * Math.PI * 2
    const A = grow(net, grid, r, o, x, y, a, -1, null, false)
    const B = grow(net, grid, r, o, x, y, a + Math.PI, -1, A.pts, false)
    if (!A.hit || !B.hit)
      continue
    if (B.hit.crack === -2)
      continue
    const seedNode = addNode(net, x, y)
    addCrack(net, A.pts, 0, o.order, seedNode, endOn(net, A.hit))
    addCrack(net, B.pts, 0, o.order, seedNode, endOn(net, B.hit))
  }

  let fails = 0
  let added = 0
  const cum = lengths(net, 0.6)
  while (fails < o.patience && added < maxCracks) {
    // parent chosen by length, start point uniform along it
    const total = cum[cum.length - 1]
    const pick = r() * total
    let lo = 0
    let hi = cum.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (cum[mid] < pick)
        lo = mid + 1
      else
        hi = mid
    }
    const pi = lo
    const parent = net.cracks[pi]
    const plen = parent.arc[parent.arc.length - 1]
    const s = r() * plen
    const side = r() < 0.5 ? -1 : 1
    const dev = (r() * 2 - 1) * o.spread
    const [x, y, pos, tx, ty] = pointAtArc(parent, s)
    const lam = o.spacing(x, y)
    // keep away from existing junctions and from the ends of the parent
    let crowded = s < lam * 0.3 || plen - s < lam * 0.3
    for (const [ep] of parent.events) {
      if (Math.abs(arcAtPos(parent, ep) - s) < lam * 0.3)
        crowded = true
    }
    if (crowded) {
      fails++
      continue
    }
    const a = Math.atan2(ty, tx) + side * Math.PI / 2 + dev
    const ag = grow(net, grid, r, o, x, y, a, pi, null, true)
    if (!ag.ok || !ag.hit) {
      fails++
      continue
    }
    fails = 0
    added++
    const startNode = addNode(net, x, y)
    parent.events.push([pos, startNode])
    const endNode = endOn(net, ag.hit)
    const id = addCrack(net, ag.pts, parent.gen + 1, o.order, startNode, endNode)
    cum.push(total + net.cracks[id].arc[net.cracks[id].arc.length - 1])
  }
}

// ---------------------------------------------------------------------------
// Faces of the planar graph.
// ---------------------------------------------------------------------------

export function cellsOf(net: Network): Cell[] {
  const N = net.nodes
  // edges: polyline between consecutive nodes along each crack
  const ea: number[] = []
  const eb: number[] = []
  const epts: number[][] = []
  for (const c of net.cracks) {
    const ev = c.events.slice().sort((p, q) => p[0] - q[0])
    const n = c.pts.length / 2
    const stops: [number, number][] = [[0, c.startNode], ...ev, [n - 1, c.endNode]]
    for (let k = 0; k + 1 < stops.length; k++) {
      const [p0, a] = stops[k]
      const [p1, b] = stops[k + 1]
      const line = [N[a * 2], N[a * 2 + 1]]
      for (let i = Math.floor(p0) + 1; i < p1; i++)
        line.push(c.pts[i * 2], c.pts[i * 2 + 1])
      line.push(N[b * 2], N[b * 2 + 1])
      if (a === b && line.length <= 4)
        continue
      ea.push(a)
      eb.push(b)
      epts.push(line)
    }
  }

  // outgoing half-edges per node, sorted by angle
  const E = ea.length
  const out: number[][] = Array.from({ length: N.length / 2 }, () => [])
  const ang = new Float64Array(E * 2)
  for (let e = 0; e < E; e++) {
    const l = epts[e]
    const m = l.length
    ang[e * 2] = Math.atan2(l[3] - l[1], l[2] - l[0])
    ang[e * 2 + 1] = Math.atan2(l[m - 3] - l[m - 1], l[m - 4] - l[m - 2])
    out[ea[e]].push(e * 2)
    out[eb[e]].push(e * 2 + 1)
  }
  const slot = new Int32Array(E * 2)
  for (const list of out) {
    list.sort((p, q) => ang[p] - ang[q])
    list.forEach((h, i) => (slot[h] = i))
  }
  const origin = (h: number) => (h & 1 ? eb[h >> 1] : ea[h >> 1])

  const used = new Uint8Array(E * 2)
  const faces: Cell[] = []
  for (let h0 = 0; h0 < E * 2; h0++) {
    if (used[h0])
      continue
    const poly: number[] = []
    let h = h0
    let guard = 0
    while (!used[h] && guard++ < E * 2 + 2) {
      used[h] = 1
      const l = epts[h >> 1]
      const m = l.length / 2
      if (h & 1) {
        for (let i = m - 1; i > 0; i--)
          poly.push(l[i * 2], l[i * 2 + 1])
      }
      else {
        for (let i = 0; i < m - 1; i++)
          poly.push(l[i * 2], l[i * 2 + 1])
      }
      // next: at the destination, the outgoing edge just before the twin
      const twin = h ^ 1
      const list = out[origin(twin)]
      h = list[(slot[twin] - 1 + list.length) % list.length]
    }
    let A = 0
    let cx = 0
    let cy = 0
    const n = poly.length / 2
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n
      const cr = poly[i * 2] * poly[j * 2 + 1] - poly[j * 2] * poly[i * 2 + 1]
      A += cr
      cx += (poly[i * 2] + poly[j * 2]) * cr
      cy += (poly[i * 2 + 1] + poly[j * 2 + 1]) * cr
    }
    A /= 2
    faces.push({ poly, area: A, cx: A ? cx / (6 * A) : 0, cy: A ? cy / (6 * A) : 0 })
  }
  // the outer face is the largest one; inner faces carry the opposite sign
  let outer = 0
  for (let i = 1; i < faces.length; i++) {
    if (Math.abs(faces[i].area) > Math.abs(faces[outer].area))
      outer = i
  }
  const sign = -Math.sign(faces[outer].area)
  return faces.filter((f, i) => i !== outer && f.area * sign > 1e-12).map(f => ({ ...f, area: Math.abs(f.area) }))
}
