// Periodic tilings by regular polygons and Hankin's "polygons in contact"
// construction on top of them.
//
// Hankin (1925) starts from a tiling, draws two rays from the midpoint of
// every edge, each making the same contact angle with the edge, and stops
// each ray where it meets its partner from the neighbouring edge. With one
// contact angle for the whole tiling, the two rays leaving a midpoint into
// one tile continue straight into the tile on the other side, so the lines
// cross at every midpoint and run on as long zigzag strands. Kaplan (2005)
// describes the same construction for any tiling; this file only handles
// edge-to-edge tilings by regular polygons, where the partner rays always
// meet on the bisector of the corner between them, so no ray intersection
// test is needed.
//
// Every point here is in "pattern units": the tiling has edge length 1.

export interface Proto {
  /** Number of sides. */
  n: number
  /** Centre inside the lattice cell. */
  x: number
  y: number
  /** Angle of the first vertex, in degrees. Vertices then turn counter-clockwise. */
  phi: number
  /** Polygon kind, 0 for the largest polygon of the tiling. */
  kind: number
}

export interface TilingDef {
  a1: readonly [number, number]
  a2: readonly [number, number]
  protos: readonly Proto[]
  /** Rotational order of the lattice: 4 (square family) or 6 (hexagonal family). */
  sym: 4 | 6
  /** How a tiling with one polygon kind can still be coloured in classes: 2 = checkerboard, 3 = three-colouring. */
  parity: 0 | 2 | 3
}

const R3 = Math.sqrt(3)
const W8 = 1 + Math.SQRT2
const D12 = 2 + R3
const D46 = 3 + R3

export const TILINGS = {
  // 4.4.4.4
  'Square': {
    a1: [1, 0],
    a2: [0, 1],
    protos: [{ n: 4, x: 0.5, y: 0.5, phi: 45, kind: 0 }],
    sym: 4,
    parity: 2,
  },
  // 6.6.6
  'Hexagonal': {
    a1: [1.5, R3 / 2],
    a2: [0, R3],
    protos: [{ n: 6, x: 0, y: 0, phi: 0, kind: 0 }],
    sym: 6,
    parity: 3,
  },
  // 3.3.3.3.3.3
  'Triangular': {
    a1: [1, 0],
    a2: [0.5, R3 / 2],
    protos: [
      { n: 3, x: 0.5, y: R3 / 6, phi: 90, kind: 0 },
      { n: 3, x: 1, y: R3 / 3, phi: 30, kind: 1 },
    ],
    sym: 6,
    parity: 0,
  },
  // 4.8.8
  'Octagon-square': {
    a1: [W8, 0],
    a2: [0, W8],
    protos: [
      { n: 8, x: 0, y: 0, phi: 22.5, kind: 0 },
      { n: 4, x: W8 / 2, y: W8 / 2, phi: 0, kind: 1 },
    ],
    sym: 4,
    parity: 0,
  },
  // 3.12.12
  'Dodecagon-triangle': {
    a1: [D12, 0],
    a2: [D12 / 2, D12 * R3 / 2],
    protos: [
      { n: 12, x: 0, y: 0, phi: 15, kind: 0 },
      { n: 3, x: D12 / 2, y: D12 / (2 * R3), phi: 30, kind: 1 },
      { n: 3, x: D12, y: D12 / R3, phi: 90, kind: 1 },
    ],
    sym: 6,
    parity: 0,
  },
  // 4.6.12
  'Dodecagon-hexagon': {
    a1: [D46, 0],
    a2: [D46 / 2, D46 * R3 / 2],
    protos: [
      { n: 12, x: 0, y: 0, phi: 15, kind: 0 },
      { n: 6, x: D46 / 2, y: D46 / (2 * R3), phi: 0, kind: 1 },
      { n: 6, x: D46, y: D46 / R3, phi: 0, kind: 1 },
      { n: 4, x: D46 / 2, y: 0, phi: 45, kind: 2 },
      { n: 4, x: D46 / 4, y: D46 * R3 / 4, phi: 105, kind: 2 },
      { n: 4, x: -D46 / 4, y: D46 * R3 / 4, phi: 165, kind: 2 },
    ],
    sym: 6,
    parity: 0,
  },
  // 3.6.3.6
  'Trihexagonal': {
    a1: [2, 0],
    a2: [1, R3],
    protos: [
      { n: 6, x: 0, y: 0, phi: 0, kind: 0 },
      { n: 3, x: 1, y: R3 / 3, phi: 30, kind: 1 },
      { n: 3, x: 2, y: 2 * R3 / 3, phi: 90, kind: 1 },
    ],
    sym: 6,
    parity: 0,
  },
} as const satisfies Record<string, TilingDef>

export type TilingName = keyof typeof TILINGS

/** A placement of the pattern on the canvas: pattern point `centre` lands on the canvas centre. */
export interface Placement {
  /** Edge length, in canvas units (1 = short side). */
  edge: number
  /** Rotation of the whole pattern, in radians. */
  rot: number
  centre: readonly [number, number]
}

/** One tile of the tiling with its Hankin motif, in canvas units (origin at the canvas centre). */
export interface Tile {
  n: number
  kind: number
  /** Colour class: the kind, or a parity class for one-kind tilings. */
  cls: number
  /** Stable integer identity (lattice cell and proto index), for per-tile hashing. */
  i: number
  j: number
  t: number
  cx: number
  cy: number
  /** Vertices, counter-clockwise in pattern space. */
  vx: Float64Array
  vy: Float64Array
  /** Midpoint of edge k (from vertex k to vertex k + 1). */
  mx: Float64Array
  my: Float64Array
  /** Inner point of the corner at vertex k + 1, where the rays from midpoints k and k + 1 meet. */
  px: Float64Array
  py: Float64Array
}

/** A tiling vertex and the region of the pattern that surrounds it. */
export interface VertexRegion {
  x: number
  y: number
  /** Polygon around the vertex, alternating corner points and edge midpoints. */
  xs: number[]
  ys: number[]
}

/** Two strands crossing at an edge midpoint. */
export interface Crossing {
  x: number
  y: number
  /** Unit direction of the strand passing over. */
  ox: number
  oy: number
  /** Unit direction of the strand passing under. */
  ux: number
  uy: number
  /** Distance to the nearest bend along the over and the under strand, on either side. */
  lo: number
  lu: number
}

export interface Motif {
  tiles: Tile[]
  vertices: VertexRegion[]
  crossings: Crossing[]
}

const key = (x: number, y: number) => `${Math.round(x * 2e5)},${Math.round(y * 2e5)}`

/**
 * Builds every tile that touches the view [-hw, hw] x [-hh, hh] (canvas units),
 * with its Hankin motif for the contact angle `theta` (radians, between a ray
 * and its edge), the vertex regions, and the crossings with over/under set.
 */
export function buildMotif(def: TilingDef, place: Placement, theta: number, hw: number, hh: number): Motif {
  const { edge, rot, centre } = place
  const cr = Math.cos(rot)
  const sr = Math.sin(rot)
  // pattern -> canvas
  const tx = (x: number, y: number) => ((x - centre[0]) * cr - (y - centre[1]) * sr) * edge
  const ty = (x: number, y: number) => ((x - centre[0]) * sr + (y - centre[1]) * cr) * edge

  // Lattice range covering the view, with a margin of two cells.
  const [a1x, a1y] = def.a1
  const [a2x, a2y] = def.a2
  const det = a1x * a2y - a1y * a2x
  let i0 = Infinity
  let i1 = -Infinity
  let j0 = Infinity
  let j1 = -Infinity
  for (const [ux, uy] of [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]]) {
    // canvas -> pattern
    const x = (ux * cr + uy * sr) / edge + centre[0]
    const y = (-ux * sr + uy * cr) / edge + centre[1]
    const a = (x * a2y - y * a2x) / det
    const b = (a1x * y - a1y * x) / det
    i0 = Math.min(i0, a)
    i1 = Math.max(i1, a)
    j0 = Math.min(j0, b)
    j1 = Math.max(j1, b)
  }
  i0 = Math.floor(i0) - 2
  j0 = Math.floor(j0) - 2
  i1 = Math.ceil(i1) + 2
  j1 = Math.ceil(j1) + 2

  const tiles: Tile[] = []
  const reach = 1.2 * edge * 2
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      for (let t = 0; t < def.protos.length; t++) {
        const p = def.protos[t]
        const ox = i * a1x + j * a2x + p.x
        const oy = i * a1y + j * a2y + p.y
        const cx = tx(ox, oy)
        const cy = ty(ox, oy)
        const R = 1 / (2 * Math.sin(Math.PI / p.n))
        if (Math.abs(cx) > hw + R * edge + reach || Math.abs(cy) > hh + R * edge + reach)
          continue
        const n = p.n
        const vx = new Float64Array(n)
        const vy = new Float64Array(n)
        for (let k = 0; k < n; k++) {
          const a = (p.phi * Math.PI) / 180 + (2 * Math.PI * k) / n
          const x = ox + R * Math.cos(a)
          const y = oy + R * Math.sin(a)
          vx[k] = tx(x, y)
          vy[k] = ty(x, y)
        }
        const mx = new Float64Array(n)
        const my = new Float64Array(n)
        const px = new Float64Array(n)
        const py = new Float64Array(n)
        // Distance from a vertex to the meeting point of the two rays, along
        // the corner bisector: law of sines in the triangle vertex, midpoint,
        // meeting point (angles half-corner, theta, and the rest).
        const half = Math.PI / 2 - Math.PI / n
        const vp = (0.5 * edge * Math.sin(theta)) / Math.sin(theta + half)
        for (let k = 0; k < n; k++) {
          const k1 = (k + 1) % n
          mx[k] = (vx[k] + vx[k1]) / 2
          my[k] = (vy[k] + vy[k1]) / 2
          const dx = cx - vx[k1]
          const dy = cy - vy[k1]
          const d = Math.hypot(dx, dy)
          px[k] = vx[k1] + (dx / d) * vp
          py[k] = vy[k1] + (dy / d) * vp
        }
        let cls: number = p.kind
        if (def.parity === 2)
          cls = (((i + j) % 2) + 2) % 2
        else if (def.parity === 3)
          cls = (((i - j) % 3) + 3) % 3
        tiles.push({ n, kind: p.kind, cls, i, j, t, cx, cy, vx, vy, mx, my, px, py })
      }
    }
  }

  // Vertex regions: gather, around each tiling vertex, the corner points of
  // the tiles that meet there and the midpoints of its edges.
  interface Acc { x: number, y: number, angle: number, pts: [number, number, number][], mids: Set<string> }
  const acc = new Map<string, Acc>()
  const crossings: Crossing[] = []
  const seen = new Map<string, Crossing>()
  const vw = hw + edge
  const vh = hh + edge
  for (const tile of tiles) {
    const { n, vx, vy, mx, my, px, py } = tile
    const corner = Math.PI - (2 * Math.PI) / n
    for (let k = 0; k < n; k++) {
      // corner at vertex k + 1: midpoint k, inner point k, midpoint k + 1
      const k1 = (k + 1) % n
      const x = vx[k1]
      const y = vy[k1]
      if (Math.abs(x) < vw && Math.abs(y) < vh) {
        const id = key(x, y)
        let a = acc.get(id)
        if (!a) {
          a = { x, y, angle: 0, pts: [], mids: new Set() }
          acc.set(id, a)
        }
        a.angle += corner
        a.pts.push([Math.atan2(py[k] - y, px[k] - x), px[k], py[k]])
        for (const m of [k, k1]) {
          const mk = key(mx[m], my[m])
          if (!a.mids.has(mk)) {
            a.mids.add(mk)
            a.pts.push([Math.atan2(my[m] - y, mx[m] - x), mx[m], my[m]])
          }
        }
      }
      // Crossing at midpoint k: the piece that starts there (corner k + 1,
      // counter-clockwise) passes over, the piece that ends there (corner k)
      // passes under. Seen from the tile across the edge the same rule picks
      // the same strand, and along any strand over and under alternate.
      const cxm = mx[k]
      const cym = my[k]
      if (Math.abs(cxm) < vw && Math.abs(cym) < vh) {
        const ck = key(cxm, cym)
        const km = (k + n - 1) % n
        const ox = px[k] - cxm
        const oy = py[k] - cym
        const ux = px[km] - cxm
        const uy = py[km] - cym
        const lo = Math.hypot(ox, oy)
        const lu = Math.hypot(ux, uy)
        const prev = seen.get(ck)
        if (prev) {
          // the tile across the edge: same strands, other side of the crossing
          prev.lo = Math.min(prev.lo, lo)
          prev.lu = Math.min(prev.lu, lu)
        }
        else {
          const c = { x: cxm, y: cym, ox: ox / lo, oy: oy / lo, ux: ux / lu, uy: uy / lu, lo, lu }
          seen.set(ck, c)
          crossings.push(c)
        }
      }
    }
  }
  const vertices: VertexRegion[] = []
  for (const a of acc.values()) {
    if (Math.abs(a.angle - 2 * Math.PI) > 1e-6)
      continue
    a.pts.sort((p, q) => p[0] - q[0])
    vertices.push({ x: a.x, y: a.y, xs: a.pts.map(p => p[1]), ys: a.pts.map(p => p[2]) })
  }
  return { tiles, vertices, crossings }
}
