// Isohedral tilings with deformable edges, for the "Tessellate" series.
//
// Every tiling here is built the way Craig S. Kaplan describes in
// "Introductory Tiling Theory for Computer Graphics" (2009): start from a
// polygon whose copies tile the plane under a known symmetry group, then
// replace each edge by a curve. An edge is either free (a "J" edge, any
// shape), centrosymmetric about its midpoint (a "C"/"S" edge, mapped onto
// itself by a half-turn), or a copy of another edge under the isometry that
// carries one tile onto its neighbour (a translation, a glide reflection or a
// rotation about a vertex). Because paired edges are exact images of each
// other, the deformed tile still fills the plane with no gap or overlap.
//
// The six families below are Heesch types (Heesch & Kienzle, 1963), named
// after the isometries that relate their edges:
//   TTTT / TTTTTT   translations only (parallelogram or hexagon)
//   TGTG            two translated edges, two glide-reflected edges
//   CCCC            four half-turn edges
//   C3C3C3C3C3C3    edges paired by 120° turns about alternate vertices
//   C4C4C4C4        edges paired by 90° turns about opposite vertices
//   CC6C6           two edges paired by a 60° turn, one half-turn edge
//
// Everything here is a pure function of its inputs (no randomness of its own).

import type { Rng } from '../random'

/** 2D affine map [a, b, c, d, e, f]: x' = a x + c y + e, y' = b x + d y + f (canvas order). */
export type Aff = readonly [number, number, number, number, number, number]
export type Pt = readonly [number, number]

export const ID: Aff = [1, 0, 0, 1, 0, 0]

/** m ∘ n: apply n, then m. */
export function mul(m: Aff, n: Aff): Aff {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ]
}

export function apply(m: Aff, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]
}

export const translate = (x: number, y: number): Aff => [1, 0, 0, 1, x, y]

export function rotateAbout(cx: number, cy: number, ang: number): Aff {
  const c = Math.cos(ang)
  const s = Math.sin(ang)
  return [c, s, -s, c, cx - c * cx + s * cy, cy - s * cx - c * cy]
}

export type Symmetry = 'Translation' | 'Glide' | 'Half-turn' | 'Three-fold' | 'Four-fold' | 'Six-fold'

/** A free edge ('J'), a centrosymmetric edge ('S'), or the image of edge `of` under `X`. */
type EdgeRule = { kind: 'J' | 'S' } | { of: number, X: Aff }

export interface Prototile {
  /** Heesch type, for the record. */
  heesch: string
  /** Undeformed polygon, counter-clockwise. Edge k runs from verts[k] to verts[k + 1]. */
  verts: Pt[]
  rules: EdgeRule[]
  /** The tiles of one translation cell: tile = translate(i u + j v) ∘ aspects[a]. */
  aspects: Aff[]
  u: Pt
  v: Pt
}

const DEG = Math.PI / 180

/**
 * The undeformed prototile of a family. Always makes exactly 6 draws from `r`,
 * whatever the family, so the streams that follow never shift.
 */
export function prototile(sym: Symmetry, r: Rng): Prototile {
  const q = [r(), r(), r(), r(), r(), r()]
  const j = (k: number, a: number) => (q[k] * 2 - 1) * a

  if (sym === 'Translation') {
    if (q[0] < 0.5) {
      // TTTT: a parallelogram, opposite edges translated copies.
      const u: Pt = [1, 0]
      const v: Pt = [j(1, 0.3), 1 + j(2, 0.15)]
      return {
        heesch: 'TTTT',
        verts: [[0, 0], u, [u[0] + v[0], u[1] + v[1]], v],
        rules: [{ kind: 'J' }, { of: 3, X: translate(u[0], u[1]) }, { of: 0, X: translate(v[0], v[1]) }, { kind: 'J' }],
        aspects: [ID],
        u,
        v,
      }
    }
    // TTTTTT: a centrally symmetric hexagon, opposite edges translated copies.
    const h: Pt[] = []
    for (let k = 0; k < 3; k++) {
      const a = (60 * k + j(k + 1, 7)) * DEG
      const rad = 0.62 * (1 + j(k + 3, 0.12))
      h.push([rad * Math.cos(a), rad * Math.sin(a)])
    }
    const verts: Pt[] = [h[0], h[1], h[2], [-h[0][0], -h[0][1]], [-h[1][0], -h[1][1]], [-h[2][0], -h[2][1]]]
    const rules: EdgeRule[] = [{ kind: 'J' }, { kind: 'J' }, { kind: 'J' }]
    for (let k = 0; k < 3; k++)
      rules.push({ of: k, X: translate(-(verts[k][0] + verts[k + 1][0]), -(verts[k][1] + verts[k + 1][1])) })
    return {
      heesch: 'TTTTTT',
      verts,
      rules,
      aspects: [ID],
      u: [h[0][0] + h[1][0], h[0][1] + h[1][1]],
      v: [h[1][0] + h[2][0], h[1][1] + h[2][1]],
    }
  }

  if (sym === 'Glide') {
    // TGTG: bottom and top are translated copies; the left edge is carried
    // onto the right one by a glide reflection along a horizontal axis, so
    // every other column of tiles is a mirror image.
    const s = j(0, 0.35)
    const h = 1 + j(1, 0.15)
    const G: Aff = [1, 0, 0, -1, 1, s + h]
    return {
      heesch: 'TGTG',
      verts: [[0, 0], [1, s], [1, s + h], [0, h]],
      rules: [{ kind: 'J' }, { of: 3, X: G }, { of: 0, X: translate(0, h) }, { kind: 'J' }],
      aspects: [ID, G],
      u: [2, 0],
      v: [0, h],
    }
  }

  if (sym === 'Half-turn') {
    // CCCC: any quadrilateral; every edge is centrosymmetric and the
    // neighbour across it is the tile turned half a turn about its midpoint.
    const verts: Pt[] = [[j(0, 0.12), j(1, 0.12)], [1 + j(2, 0.15), j(3, 0.2)], [1 + j(4, 0.12), 1 + j(5, 0.12)], [j(3, -0.15), 1 + j(2, 0.2)]]
    const m = verts.map((p, k) => {
      const n = verts[(k + 1) % 4]
      return [(p[0] + n[0]) / 2, (p[1] + n[1]) / 2] as Pt
    })
    return {
      heesch: 'CCCC',
      verts,
      rules: [{ kind: 'S' }, { kind: 'S' }, { kind: 'S' }, { kind: 'S' }],
      aspects: [ID, rotateAbout(m[0][0], m[0][1], Math.PI)],
      u: [2 * (m[1][0] - m[0][0]), 2 * (m[1][1] - m[0][1])],
      v: [2 * (m[3][0] - m[0][0]), 2 * (m[3][1] - m[0][1])],
    }
  }

  if (sym === 'Three-fold') {
    // C3C3C3C3C3C3: three tiles turn about each of V0, V2 and V4 (an
    // equilateral triangle); V1 is free, V3 and V5 follow from it.
    const V0: Pt = [1, 0]
    const V2: Pt = [-0.5, Math.sqrt(3) / 2]
    const V4: Pt = [-0.5, -Math.sqrt(3) / 2]
    const a1 = (60 + j(0, 12)) * DEG
    const r1 = 1 + j(1, 0.22)
    const V1: Pt = [r1 * Math.cos(a1), r1 * Math.sin(a1)]
    const RV2 = rotateAbout(V2[0], V2[1], -120 * DEG)
    const RV4 = rotateAbout(V4[0], V4[1], -120 * DEG)
    const V3 = apply(RV2, V1[0], V1[1])
    const V5 = apply(RV4, V3[0], V3[1])
    const R0 = (k: number) => rotateAbout(V0[0], V0[1], 120 * k * DEG)
    const tr = (c: Pt): Pt => {
      // (I - R120) (c - V0): the translation R(c, 120°) ∘ R(V0, -120°)
      const t = mul(rotateAbout(c[0], c[1], 120 * DEG), R0(-1))
      return [t[4], t[5]]
    }
    return {
      heesch: 'C3C3C3C3C3C3',
      verts: [V0, V1, V2, V3, V4, V5],
      rules: [{ kind: 'J' }, { kind: 'J' }, { of: 1, X: RV2 }, { kind: 'J' }, { of: 3, X: RV4 }, { of: 0, X: R0(1) }],
      aspects: [R0(0), R0(1), R0(2)],
      u: tr(V2),
      v: tr(V4),
    }
  }

  if (sym === 'Four-fold') {
    // C4C4C4C4: a square, four tiles turning about V0 and four about V2.
    return {
      heesch: 'C4C4C4C4',
      verts: [[0, 0], [1, 0], [1, 1], [0, 1]],
      rules: [{ kind: 'J' }, { kind: 'J' }, { of: 1, X: rotateAbout(1, 1, -90 * DEG) }, { of: 0, X: rotateAbout(0, 0, 90 * DEG) }],
      aspects: [0, 1, 2, 3].map(k => rotateAbout(0, 0, 90 * k * DEG)),
      u: [2, 0],
      v: [0, 2],
    }
  }

  // CC6C6: an equilateral triangle, six tiles turning about V0; the far edge
  // is centrosymmetric.
  const V2: Pt = [0.5, Math.sqrt(3) / 2]
  return {
    heesch: 'CC6C6',
    verts: [[0, 0], [1, 0], V2],
    rules: [{ kind: 'J' }, { kind: 'S' }, { of: 0, X: rotateAbout(0, 0, 60 * DEG) }],
    aspects: [0, 1, 2, 3, 4, 5].map(k => rotateAbout(0, 0, 60 * k * DEG)),
    u: [1.5, Math.sqrt(3) / 2],
    v: [0, Math.sqrt(3)],
  }
}

/** Fourier coefficients of every edge: always 6 edges x 6 draws, used or not. */
export function edgeCoefficients(r: Rng): number[][] {
  const out: number[][] = []
  for (let k = 0; k < 6; k++)
    out.push([r(), r(), r(), r(), r(), r()].map(x => x * 2 - 1))
  return out
}

/**
 * Sample a free edge from A to B. The normal offset n(t) and the offset along
 * the chord e(t) are sine series, so both vanish at the end points; an 'S'
 * edge keeps only even harmonics, which makes the curve point-symmetric about
 * the chord midpoint (n(1 - t) = -n(t), e(1 - t) = -e(t)).
 */
function freeEdge(A: Pt, B: Pt, kind: 'J' | 'S', c: number[], amp: number, samples: number): Pt[] {
  const dx = B[0] - A[0]
  const dy = B[1] - A[1]
  const nx = -dy
  const ny = dx
  const harm = kind === 'J' ? [1, 2, 3] : [2, 4, 6]
  const an = kind === 'J' ? [c[0] * 0.55, c[1] * 0.36, c[2] * 0.18] : [c[0] * 0.32, c[1] * 0.1, c[2] * 0.03]
  const at = kind === 'J' ? [c[3] * 0.07, c[4] * 0.04, 0] : [c[3] * 0.04, 0, 0]
  const pts: Pt[] = []
  for (let s = 0; s <= samples; s++) {
    const t = s / samples
    let n = 0
    let e = 0
    for (let h = 0; h < 3; h++) {
      const sn = Math.sin(harm[h] * Math.PI * t)
      n += an[h] * sn
      e += at[h] * sn
    }
    n *= amp
    e *= amp
    pts.push([A[0] + (t + e) * dx + n * nx, A[1] + (t + e) * dy + n * ny])
  }
  return pts
}

/** Closed boundary of the deformed tile (last point not repeated). */
export function boundary(p: Prototile, coef: number[][], amp: number, samples: number): Pt[] {
  const n = p.verts.length
  const curves: (Pt[] | null)[] = Array.from<Pt[] | null>({ length: n }).fill(null)
  for (let k = 0; k < n; k++) {
    const rule = p.rules[k]
    if ('kind' in rule)
      curves[k] = freeEdge(p.verts[k], p.verts[(k + 1) % n], rule.kind, coef[k], amp, samples)
  }
  for (let k = 0; k < n; k++) {
    const rule = p.rules[k]
    if ('kind' in rule)
      continue
    const src = curves[rule.of]!
    const img = src.map(([x, y]) => apply(rule.X, x, y) as Pt)
    const A = p.verts[k]
    const d0 = Math.hypot(img[0][0] - A[0], img[0][1] - A[1])
    const d1 = Math.hypot(img[img.length - 1][0] - A[0], img[img.length - 1][1] - A[1])
    curves[k] = d0 <= d1 ? img : img.reverse()
  }
  const out: Pt[] = []
  for (const c of curves) {
    for (let s = 0; s < c!.length - 1; s++)
      out.push(c![s])
  }
  return out
}

function segCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const o = (p: Pt, q: Pt, r: Pt) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
  const d1 = o(c, d, a)
  const d2 = o(c, d, b)
  const d3 = o(a, b, c)
  const d4 = o(a, b, d)
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0))
}

export function polygonArea(pts: readonly Pt[]): number {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const q = pts[(i + 1) % pts.length]
    a += p[0] * q[1] - q[0] * p[1]
  }
  return a / 2
}

/**
 * A usable tile: a simple polygon with no neck thinner than `neck` (between
 * two boundary points that are far apart along the boundary).
 */
export function isGoodTile(pts: readonly Pt[], neck: number): boolean {
  const n = pts.length
  for (let i = 0; i < n; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % n]
    for (let k = i + 2; k < n; k++) {
      if (i === 0 && k === n - 1)
        continue
      if (segCross(a, b, pts[k], pts[(k + 1) % n]))
        return false
    }
  }
  // arc length prefix
  const arc = [0]
  for (let i = 1; i <= n; i++)
    arc.push(arc[i - 1] + Math.hypot(pts[i % n][0] - pts[i - 1][0], pts[i % n][1] - pts[i - 1][1]))
  const total = arc[n]
  const n2 = neck * neck
  for (let i = 0; i < n; i++) {
    for (let k = i + 1; k < n; k++) {
      const along = Math.min(arc[k] - arc[i], total - (arc[k] - arc[i]))
      if (along < neck * 3)
        continue
      const dx = pts[k][0] - pts[i][0]
      const dy = pts[k][1] - pts[i][1]
      if (dx * dx + dy * dy < n2)
        return false
    }
  }
  return true
}

export interface Neighbour { a: number, b: number, di: number, dj: number }

/**
 * Which tiles share an edge, found on the undeformed polygons: tile (a, 0, 0)
 * touches tile (b, di, dj) when they have an edge midpoint in common.
 */
export function neighbours(p: Prototile): Neighbour[] {
  const n = p.verts.length
  const mids = (m: Aff) => {
    const out: Pt[] = []
    for (let k = 0; k < n; k++) {
      const A = p.verts[k]
      const B = p.verts[(k + 1) % n]
      out.push(apply(m, (A[0] + B[0]) / 2, (A[1] + B[1]) / 2))
    }
    return out
  }
  const res: Neighbour[] = []
  for (let a = 0; a < p.aspects.length; a++) {
    const ma = mids(p.aspects[a])
    for (let b = 0; b < p.aspects.length; b++) {
      for (let di = -3; di <= 3; di++) {
        for (let dj = -3; dj <= 3; dj++) {
          if (a === b && di === 0 && dj === 0)
            continue
          const L = translate(di * p.u[0] + dj * p.v[0], di * p.u[1] + dj * p.v[1])
          const mb = mids(mul(L, p.aspects[b]))
          let shared = false
          for (const x of ma) {
            for (const y of mb) {
              if (Math.abs(x[0] - y[0]) < 1e-7 && Math.abs(x[1] - y[1]) < 1e-7)
                shared = true
            }
          }
          if (shared)
            res.push({ a, b, di, dj })
        }
      }
    }
  }
  return res
}

/** colour(a, i, j) = (p[a] + q i + r j) mod k, a proper colouring of the tiling. */
export interface Colouring { k: number, p: number[], q: number, r: number }

/** Every linear k-colouring in which no two neighbours share a colour and all k colours appear. */
export function colourings(p: Prototile, nb: readonly Neighbour[], k: number): Colouring[] {
  const na = p.aspects.length
  const out: Colouring[] = []
  const total = k ** (na - 1)
  for (let code = 0; code < total; code++) {
    const pa = [0]
    let c = code
    for (let a = 1; a < na; a++) {
      pa.push(c % k)
      c = Math.floor(c / k)
    }
    for (let q = 0; q < k; q++) {
      for (let r = 0; r < k; r++) {
        let ok = true
        for (const e of nb) {
          if ((((pa[e.a] - pa[e.b] - q * e.di - r * e.dj) % k) + k) % k === 0) {
            ok = false
            break
          }
        }
        if (!ok)
          continue
        const used = new Set<number>()
        for (let a = 0; a < na; a++) {
          for (let i = 0; i < k; i++) {
            for (let jj = 0; jj < k; jj++)
              used.add((pa[a] + q * i + r * jj) % k)
          }
        }
        if (used.size === k)
          out.push({ k, p: pa, q, r })
      }
    }
  }
  return out
}

/** Signed distance field of a polygon on a regular grid (positive inside). */
export interface Field {
  x0: number
  y0: number
  step: number
  nx: number
  ny: number
  d: Float32Array
}

export function distanceField(pts: readonly Pt[], res: number): Field {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of pts) {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  const step = Math.max(maxX - minX, maxY - minY) / (res - 1)
  const x0 = minX - step
  const y0 = minY - step
  const nx = Math.ceil((maxX - minX) / step) + 3
  const ny = Math.ceil((maxY - minY) / step) + 3
  const d = new Float32Array(nx * ny)
  const n = pts.length
  const xs: number[] = []
  for (let j = 0; j < ny; j++) {
    const y = y0 + j * step
    // even-odd spans of this row
    xs.length = 0
    for (let i = 0; i < n; i++) {
      const a = pts[i]
      const b = pts[(i + 1) % n]
      if ((a[1] > y) !== (b[1] > y))
        xs.push(a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]))
    }
    xs.sort((p, q) => p - q)
    for (let i = 0; i < nx; i++) {
      const x = x0 + i * step
      let inside = false
      for (const c of xs) {
        if (c < x)
          inside = !inside
        else
          break
      }
      let best = Infinity
      for (let s = 0; s < n; s++) {
        const a = pts[s]
        const b = pts[(s + 1) % n]
        const ex = b[0] - a[0]
        const ey = b[1] - a[1]
        const t = Math.max(0, Math.min(1, ((x - a[0]) * ex + (y - a[1]) * ey) / (ex * ex + ey * ey)))
        const dx = a[0] + t * ex - x
        const dy = a[1] + t * ey - y
        const dd = dx * dx + dy * dy
        if (dd < best)
          best = dd
      }
      d[j * nx + i] = (inside ? 1 : -1) * Math.sqrt(best)
    }
  }
  return { x0, y0, step, nx, ny, d }
}

/** Marching squares: the level set as a flat list of segments [x1, y1, x2, y2, ...]. */
export function contour(f: Field, level: number): number[] {
  const out: number[] = []
  const { nx, ny, d, x0, y0, step } = f
  const lerp = (a: number, b: number) => (level - a) / (b - a)
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const v0 = d[j * nx + i]
      const v1 = d[j * nx + i + 1]
      const v2 = d[(j + 1) * nx + i + 1]
      const v3 = d[(j + 1) * nx + i]
      const idx = (v0 > level ? 1 : 0) | (v1 > level ? 2 : 0) | (v2 > level ? 4 : 0) | (v3 > level ? 8 : 0)
      if (idx === 0 || idx === 15)
        continue
      const x = x0 + i * step
      const y = y0 + j * step
      // crossing points on the four cell sides: bottom, right, top, left
      const P = [
        () => [x + lerp(v0, v1) * step, y],
        () => [x + step, y + lerp(v1, v2) * step],
        () => [x + lerp(v3, v2) * step, y + step],
        () => [x, y + lerp(v0, v3) * step],
      ]
      const seg = (s: number, t: number) => {
        const a = P[s]()
        const b = P[t]()
        out.push(a[0], a[1], b[0], b[1])
      }
      switch (idx) {
        case 1: case 14: seg(3, 0)
          break
        case 2: case 13: seg(0, 1)
          break
        case 3: case 12: seg(3, 1)
          break
        case 4: case 11: seg(1, 2)
          break
        case 6: case 9: seg(0, 2)
          break
        case 7: case 8: seg(3, 2)
          break
        case 5: seg(3, 0)
          seg(1, 2)
          break
        case 10: seg(0, 1)
          seg(3, 2)
          break
      }
    }
  }
  return out
}
