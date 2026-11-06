// Crease patterns for the "Origami" series.
//
// A pattern is a planar graph in "cell" units around the origin: vertices,
// faces (vertex loops, any orientation) and edges, each edge carrying a
// mountain / valley assignment. Faces are generated over a disc of radius
// `R` (in cells) that covers the canvas or the sheet; the caller scales,
// rotates and translates the result.
//
// The lattice patterns (Miura-ori, Yoshimura, waterbomb, radial pleats) get
// their assignment from a rule. The twist tessellations are built by
// Bateman's shrink-and-rotate construction and assigned by solving the local
// flat-foldability conditions of their degree-4 vertices as parity
// constraints (see `assignByAcuteSectors`).

export const FLAT = 0
export const MOUNTAIN = 1
export const VALLEY = 2

/** Face classes, used for tints: plain facet, twist polygon, pleat, vertex polygon. */
export const FACET = 0
export const TWIST = 1
export const PLEAT = 2
export const KNOT = 3

export interface CreaseSheet {
  x: number[]
  y: number[]
  faces: number[][]
  /** Edge index of each side: side k runs from faces[f][k] to faces[f][k + 1]. */
  sides: number[][]
  cls: number[]
  ea: number[]
  eb: number[]
  mv: Uint8Array
}

class Builder {
  x: number[] = []
  y: number[] = []
  faces: number[][] = []
  sides: number[][] = []
  cls: number[] = []
  ea: number[] = []
  eb: number[] = []
  mv: number[] = []
  private vk = new Map<string, number>()
  private ek = new Map<number, number>()

  v(x: number, y: number): number {
    // 1/4096 of a cell: far below any real feature, far above float noise
    const key = `${Math.round(x * 4096)},${Math.round(y * 4096)}`
    let i = this.vk.get(key)
    if (i === undefined) {
      i = this.x.length
      this.vk.set(key, i)
      this.x.push(x)
      this.y.push(y)
    }
    return i
  }

  edge(a: number, b: number): number {
    const key = a < b ? a * 2097152 + b : b * 2097152 + a
    let e = this.ek.get(key)
    if (e === undefined) {
      e = this.ea.length
      this.ek.set(key, e)
      this.ea.push(a)
      this.eb.push(b)
      this.mv.push(FLAT)
    }
    return e
  }

  /** Adds a face from coordinates [x0, y0, x1, y1...] with optional per-side labels. */
  face(pts: readonly number[], cls: number, labels?: readonly number[]) {
    const vs: number[] = []
    for (let i = 0; i < pts.length; i += 2)
      vs.push(this.v(pts[i], pts[i + 1]))
    const sides: number[] = []
    for (let k = 0; k < vs.length; k++) {
      const e = this.edge(vs[k], vs[(k + 1) % vs.length])
      sides.push(e)
      if (labels)
        this.mv[e] = labels[k]
    }
    this.faces.push(vs)
    this.sides.push(sides)
    this.cls.push(cls)
  }

  done(): CreaseSheet {
    return {
      x: this.x,
      y: this.y,
      faces: this.faces,
      sides: this.sides,
      cls: this.cls,
      ea: this.ea,
      eb: this.eb,
      mv: Uint8Array.from(this.mv),
    }
  }
}

function inside(pts: readonly number[], R: number) {
  let cx = 0
  let cy = 0
  const n = pts.length / 2
  for (let i = 0; i < pts.length; i += 2) {
    cx += pts[i]
    cy += pts[i + 1]
  }
  return Math.hypot(cx / n, cy / n) < R
}

// ---------------------------------------------------------------------------
// Miura-ori (Koryo Miura): parallelograms between parallel zigzag lines.
// Column width 1, row height `b`, zigzag amplitude `d`.
// ---------------------------------------------------------------------------

export function miura(R: number, b: number, d: number): CreaseSheet {
  const B = new Builder()
  const zig = (j: number) => ((j & 1) === 0 ? MOUNTAIN : VALLEY)
  const odd = (i: number) => (i & 1) === 1
  // a vertical segment from row j to j + 1 is the odd crease of the vertex
  // whose two acute sectors it separates (the low point of the zigzag)
  const vert = (i: number, j: number) => (odd(i) ? zig(j) : zig(j + 1))
  const N = Math.ceil(R) + 2
  const M = Math.ceil(R / b) + 2
  const P = (i: number, j: number) => [i, j * b + (odd(i) ? d : 0)]
  for (let j = -M; j < M; j++) {
    for (let i = -N; i < N; i++) {
      const pts = [...P(i, j), ...P(i + 1, j), ...P(i + 1, j + 1), ...P(i, j + 1)]
      if (inside(pts, R))
        B.face(pts, FACET, [zig(j), vert(i + 1, j), zig(j + 1), vert(i, j)])
    }
  }
  return B.done()
}

// ---------------------------------------------------------------------------
// Yoshimura: rows of isosceles triangles (base 1, height h); every
// horizontal is a valley, every diagonal a mountain, so the sheet buckles
// into diamonds.
// ---------------------------------------------------------------------------

export function yoshimura(R: number, h: number): CreaseSheet {
  const B = new Builder()
  const N = Math.ceil(R) + 2
  const M = Math.ceil(R / h) + 2
  for (let j = -M; j < M; j++) {
    const y0 = j * h
    const y1 = y0 + h
    const o = (j & 1) === 0 ? 0 : 0.5
    for (let i = -N; i < N; i++) {
      const x0 = i + o
      const up = [x0, y0, x0 + 1, y0, x0 + 0.5, y1]
      if (inside(up, R))
        B.face(up, FACET, [VALLEY, MOUNTAIN, MOUNTAIN])
      const down = [x0 + 0.5, y1, x0 + 1, y0, x0 + 1.5, y1]
      if (inside(down, R))
        B.face(down, FACET, [MOUNTAIN, MOUNTAIN, VALLEY])
    }
  }
  return B.done()
}

// ---------------------------------------------------------------------------
// Waterbomb tessellation: waterbomb bases (both diagonals valley, the
// horizontal midline mountain) two half-units wide, each row of bases shifted
// by half a base. Bands have height `hb`.
// ---------------------------------------------------------------------------

export function waterbomb(R: number, hb: number): CreaseSheet {
  const B = new Builder()
  const N = Math.ceil(R / 2) + 2
  const M = Math.ceil(R / (2 * hb)) + 2
  for (let r = -M; r < M; r++) {
    const yc = 2 * r * hb
    const off = (r & 1) === 0 ? 0 : 1
    for (const dir of [1, -1]) {
      const yb = yc + dir * hb
      for (let i = -N; i < N; i++) {
        const xc = 2 * i + off
        // the half-base above (or below) the centre, its border cut by the
        // corner of the next row's base
        const fan = [xc, yc, xc + 1, yb, xc, yb, xc - 1, yb]
        if (inside(fan, R))
          B.face(fan, FACET, [VALLEY, MOUNTAIN, MOUNTAIN, VALLEY])
        // the triangle between two neighbouring centres
        const tri = [xc, yc, xc + 2, yc, xc + 1, yb]
        if (inside(tri, R))
          B.face(tri, FACET, [MOUNTAIN, VALLEY, VALLEY])
      }
    }
  }
  return B.done()
}

// ---------------------------------------------------------------------------
// Radial pleats: concentric regular n-gons (alternately mountain and valley)
// joined by spokes through their corners, the pleated "hyperbolic
// paraboloid" of the Bauhaus generalised to n sides. Ring k has circumradius
// k * `sp`; each spoke segment takes the type of the ring it reaches, so every
// corner is a 3-to-1 vertex.
// ---------------------------------------------------------------------------

export function radial(R: number, n: number, sp: number, phase: number): CreaseSheet {
  const B = new Builder()
  const ring = (k: number) => ((k & 1) === 1 ? MOUNTAIN : VALLEY)
  const K = Math.ceil(R / (sp * Math.cos(Math.PI / n))) + 2
  const P = (k: number, m: number) => {
    const a = phase + (2 * Math.PI * m) / n
    return [k * sp * Math.cos(a), k * sp * Math.sin(a)]
  }
  const core: number[] = []
  for (let m = 0; m < n; m++)
    core.push(...P(1, m))
  B.face(core, TWIST, Array.from({ length: n }, () => ring(1)))
  for (let k = 1; k < K; k++) {
    for (let m = 0; m < n; m++) {
      const pts = [...P(k, m), ...P(k, m + 1), ...P(k + 1, m + 1), ...P(k + 1, m)]
      B.face(pts, (k & 1) === 0 ? FACET : PLEAT, [ring(k), ring(k + 1), ring(k + 1), ring(k + 1)])
    }
  }
  return B.done()
}

// ---------------------------------------------------------------------------
// Twist tessellations by shrink-and-rotate (Alex Bateman; Lang & Bateman,
// "Every Spider Web Has a Simple Flat Twist Tessellation"): every tile of a
// tiling is scaled by `s` and turned by `theta` about its centre. The gap
// left along each shared edge is a parallelogram (a pleat) and the gap left
// around each vertex is a small polygon similar to the dual tile, twisted the
// other way. With centres whose joins are perpendicular to the shared edges,
// every new vertex has degree 4 and satisfies Kawasaki's theorem.
// ---------------------------------------------------------------------------

interface Tiling {
  /** Tile corners as vertex keys into vx/vy, counter-clockwise. */
  tiles: number[][]
  vx: number[]
  vy: number[]
}

function squareTiling(R: number): Tiling {
  const N = Math.ceil(R) + 2
  const vx: number[] = []
  const vy: number[] = []
  const id = (i: number, j: number) => (i + N) * (2 * N + 2) + (j + N)
  for (let i = -N; i <= N + 1; i++) {
    for (let j = -N; j <= N + 1; j++) {
      vx[id(i, j)] = i - 0.5
      vy[id(i, j)] = j - 0.5
    }
  }
  const tiles: number[][] = []
  for (let i = -N; i <= N; i++) {
    for (let j = -N; j <= N; j++) {
      if (Math.hypot(i, j) < R + 1)
        tiles.push([id(i, j), id(i + 1, j), id(i + 1, j + 1), id(i, j + 1)])
    }
  }
  return { tiles, vx, vy }
}

function triangularTiling(R: number): Tiling {
  const N = Math.ceil(R * 1.2) + 3
  const vx: number[] = []
  const vy: number[] = []
  const h = Math.sqrt(3) / 2
  const id = (i: number, j: number) => (i + N) * (2 * N + 2) + (j + N)
  for (let i = -N; i <= N + 1; i++) {
    for (let j = -N; j <= N + 1; j++) {
      vx[id(i, j)] = i + j / 2
      vy[id(i, j)] = j * h
    }
  }
  const tiles: number[][] = []
  const near = (a: number, b: number, c: number) =>
    Math.hypot((vx[a] + vx[b] + vx[c]) / 3, (vy[a] + vy[b] + vy[c]) / 3) < R + 1
  for (let i = -N; i <= N; i++) {
    for (let j = -N; j <= N; j++) {
      const a = id(i, j)
      const b = id(i + 1, j)
      const c = id(i, j + 1)
      const d = id(i + 1, j + 1)
      if (near(a, b, c))
        tiles.push([a, b, c])
      if (near(b, d, c))
        tiles.push([b, d, c])
    }
  }
  return { tiles, vx, vy }
}

function shrinkRotate(T: Tiling, R: number, s: number, theta: number, degree: number): CreaseSheet {
  const B = new Builder()
  const cs = Math.cos(theta) * s
  const sn = Math.sin(theta) * s
  // image of corner `v` of tile `t`
  const img: Map<number, [number, number]>[] = []
  const edgeTiles = new Map<string, number[]>()
  const vertTiles = new Map<number, number[]>()
  T.tiles.forEach((tile, t) => {
    let cx = 0
    let cy = 0
    for (const v of tile) {
      cx += T.vx[v]
      cy += T.vy[v]
    }
    cx /= tile.length
    cy /= tile.length
    const m = new Map<number, [number, number]>()
    const pts: number[] = []
    for (const v of tile) {
      const dx = T.vx[v] - cx
      const dy = T.vy[v] - cy
      const p: [number, number] = [cx + cs * dx - sn * dy, cy + sn * dx + cs * dy]
      m.set(v, p)
      pts.push(p[0], p[1])
    }
    img.push(m)
    if (inside(pts, R))
      B.face(pts, TWIST)
    for (let k = 0; k < tile.length; k++) {
      const a = tile[k]
      const b = tile[(k + 1) % tile.length]
      const key = a < b ? `${a},${b}` : `${b},${a}`
      const list = edgeTiles.get(key) ?? []
      list.push(t)
      edgeTiles.set(key, list)
      const vl = vertTiles.get(a) ?? []
      vl.push(t)
      vertTiles.set(a, vl)
    }
  })
  for (const [key, ts] of edgeTiles) {
    if (ts.length !== 2)
      continue
    const [a, b] = key.split(',').map(Number)
    const [p, q] = [img[ts[0]].get(a)!, img[ts[0]].get(b)!]
    const [p2, q2] = [img[ts[1]].get(a)!, img[ts[1]].get(b)!]
    const pts = [p[0], p[1], q[0], q[1], q2[0], q2[1], p2[0], p2[1]]
    if (inside(pts, R))
      B.face(pts, PLEAT)
  }
  for (const [v, ts] of vertTiles) {
    if (ts.length !== degree)
      continue
    const ps = ts.map(t => img[t].get(v)!)
    const mx = ps.reduce((acc, p) => acc + p[0], 0) / ps.length
    const my = ps.reduce((acc, p) => acc + p[1], 0) / ps.length
    ps.sort((u, w) => Math.atan2(u[1] - my, u[0] - mx) - Math.atan2(w[1] - my, w[0] - mx))
    const pts = ps.flat()
    if (inside(pts, R))
      B.face(pts, KNOT)
  }
  const sheet = B.done()
  assignByAcuteSectors(sheet)
  return sheet
}

/**
 * Mountain-valley assignment of a pattern whose inner vertices all have
 * degree 4 and satisfy Kawasaki's theorem. At such a vertex the two creases
 * that bound the smallest sector take opposite types and the other two take
 * the same type (Maekawa 3:1 plus the big-little-big lemma; see Mitani, "A
 * system for flat-foldable pattern design based on the Voronoi diagram").
 * These are parity constraints, solved with a union-find. Each free
 * component is fixed by making its first twist-polygon edge a valley.
 * Returns the number of contradictory constraints (0 for a valid pattern).
 */
export function assignByAcuteSectors(sh: CreaseSheet): number {
  const nE = sh.ea.length
  const parent = Int32Array.from({ length: nE }, (_, i) => i)
  const par = new Uint8Array(nE)
  const find = (e: number): number => {
    let root = e
    let p = 0
    while (parent[root] !== root) {
      p ^= par[root]
      root = parent[root]
    }
    // path compression with parity
    let cur = e
    let cp = p
    while (parent[cur] !== cur) {
      const next = parent[cur]
      const np = cp ^ par[cur]
      parent[cur] = root
      par[cur] = cp
      cur = next
      cp = np
    }
    return root
  }
  const parity = (e: number) => {
    let p = 0
    let c = e
    while (parent[c] !== c) {
      p ^= par[c]
      c = parent[c]
    }
    return p
  }
  let conflicts = 0
  const unite = (a: number, b: number, d: number) => {
    const ra = find(a)
    const rb = find(b)
    const pa = parity(a)
    const pb = parity(b)
    if (ra === rb) {
      if ((pa ^ pb) !== d)
        conflicts++
      return
    }
    parent[ra] = rb
    par[ra] = pa ^ pb ^ d
  }

  const inc: number[][] = sh.x.map(() => [])
  for (let e = 0; e < nE; e++) {
    inc[sh.ea[e]].push(e)
    inc[sh.eb[e]].push(e)
  }
  for (let v = 0; v < inc.length; v++) {
    const es = inc[v]
    if (es.length !== 4)
      continue
    const ang = es.map((e) => {
      const o = sh.ea[e] === v ? sh.eb[e] : sh.ea[e]
      return Math.atan2(sh.y[o] - sh.y[v], sh.x[o] - sh.x[v])
    })
    const order = [0, 1, 2, 3].sort((i, j) => ang[i] - ang[j])
    const sec = order.map((i, k) => {
      const next = order[(k + 1) % 4]
      let d = ang[next] - ang[i]
      if (d <= 0)
        d += 2 * Math.PI
      return d
    })
    // a vertex on the edge of the generated patch has a missing face and
    // a gap of more than 180 degrees: no constraint there
    if (Math.max(...sec) >= Math.PI - 1e-6)
      continue
    let k = 0
    for (let i = 1; i < 4; i++) {
      if (sec[i] < sec[k] - 1e-9)
        k = i
    }
    const e = (i: number) => es[order[(k + i) % 4]]
    unite(e(0), e(1), 1)
    unite(e(2), e(3), 0)
  }

  const rootVal = new Int8Array(nE).fill(-1)
  const twistEdges: number[] = []
  sh.faces.forEach((_, f) => {
    if (sh.cls[f] === TWIST)
      twistEdges.push(...sh.sides[f])
  })
  const all = [...twistEdges, ...Array.from({ length: nE }, (_, i) => i)]
  for (const e of all) {
    const r = find(e)
    const p = parity(e)
    if (rootVal[r] < 0)
      rootVal[r] = p // makes this edge parity 0, a valley
    sh.mv[e] = (p ^ rootVal[r]) === 0 ? VALLEY : MOUNTAIN
  }
  return conflicts
}

export function squareTwist(R: number, s: number, theta: number): CreaseSheet {
  return shrinkRotate(squareTiling(R), R, s, theta, 4)
}

export function hexTwist(R: number, s: number, theta: number): CreaseSheet {
  return shrinkRotate(triangularTiling(R), R, s, theta, 6)
}
