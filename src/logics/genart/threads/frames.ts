// Nail layouts for the "Threads" series.
//
// A frame is a list of nails in frame units: the composition fits in the
// square [-1, 1]², centred on the origin. The first `outer` nails run once
// round the perimeter in order, so that "nail i" and "nail i + d" are well
// defined for the modular patterns. With twin rings, the inner ring follows
// (`inner` more nails, also in order).

export type FrameKind = 'Circle' | 'Square' | 'Polygon' | 'Twin rings'

export interface Frame {
  x: Float64Array
  y: Float64Array
  /** Nails 0..outer-1 run round the outer perimeter. */
  outer: number
  /** Nails outer..outer+inner-1 run round the inner ring (twin rings only). */
  inner: number
  /** Number of straight sides (0 for rings). */
  sides: number
  /** Nails per side (straight frames). */
  perSide: number
  /** The one or two sides a nail lies on (-1 when none): two nails on a common side never share a thread. */
  sideA: Int16Array
  sideB: Int16Array
  /** Closed guide outlines (the maker's pencil line through the nails). */
  outlines: Array<Array<[number, number]>>
}

export interface FrameOptions {
  kind: FrameKind
  /** Target number of perimeter nails. */
  count: number
  /** Polygon side count (Polygon only). */
  polygon: number
  /** Rotation of the first nail, radians (rings only). */
  rotation: number
  /** Square stood on a corner. */
  diamond: boolean
  /** Inner radius / outer radius (twin rings only). */
  ringRatio: number
  /** Inner nails / outer nails (twin rings only). */
  innerShare: number
}

function straightFrame(vertices: Array<[number, number]>, perSide: number): Frame {
  const m = vertices.length
  const n = m * perSide
  const x = new Float64Array(n)
  const y = new Float64Array(n)
  const sideA = new Int16Array(n)
  const sideB = new Int16Array(n)
  for (let s = 0; s < m; s++) {
    const [ax, ay] = vertices[s]
    const [bx, by] = vertices[(s + 1) % m]
    for (let j = 0; j < perSide; j++) {
      const i = s * perSide + j
      const t = j / perSide
      x[i] = ax + (bx - ax) * t
      y[i] = ay + (by - ay) * t
      sideA[i] = s
      // a corner nail closes the previous side as well
      sideB[i] = j === 0 ? (s + m - 1) % m : s
    }
  }
  return { x, y, outer: n, inner: 0, sides: m, perSide, sideA, sideB, outlines: [vertices] }
}

function ringNails(n: number, radius: number, rotation: number, x: Float64Array, y: Float64Array, offset: number) {
  for (let i = 0; i < n; i++) {
    const a = rotation + (i / n) * Math.PI * 2
    x[offset + i] = Math.cos(a) * radius
    y[offset + i] = Math.sin(a) * radius
  }
}

function circleOutline(radius: number): Array<[number, number]> {
  const pts: Array<[number, number]> = []
  for (let i = 0; i < 96; i++) {
    const a = (i / 96) * Math.PI * 2
    pts.push([Math.cos(a) * radius, Math.sin(a) * radius])
  }
  return pts
}

export function buildFrame(o: FrameOptions): Frame {
  if (o.kind === 'Square') {
    const h = 0.86
    let v: Array<[number, number]> = [[-h, -h], [h, -h], [h, h], [-h, h]]
    if (o.diamond) {
      const d = h * 1.12
      v = [[0, -d], [d, 0], [0, d], [-d, 0]]
    }
    return straightFrame(v, Math.max(6, Math.round(o.count / 4)))
  }
  if (o.kind === 'Polygon') {
    const m = o.polygon
    // flat bottom side: the two lowest vertices sit symmetric about the downward axis
    const a0 = Math.PI / 2 + Math.PI / m
    const v: Array<[number, number]> = []
    for (let s = 0; s < m; s++) {
      const a = a0 + (s / m) * Math.PI * 2
      v.push([Math.cos(a), Math.sin(a)])
    }
    // centre the bounding box and fit it in [-0.97, 0.97]²
    let x0 = Infinity
    let x1 = -Infinity
    let y0 = Infinity
    let y1 = -Infinity
    for (const [px, py] of v) {
      x0 = Math.min(x0, px)
      x1 = Math.max(x1, px)
      y0 = Math.min(y0, py)
      y1 = Math.max(y1, py)
    }
    const k = 0.97 / Math.max((x1 - x0) / 2, (y1 - y0) / 2)
    const cx = (x0 + x1) / 2
    const cy = (y0 + y1) / 2
    const fitted = v.map(([px, py]) => [(px - cx) * k, (py - cy) * k] as [number, number])
    return straightFrame(fitted, Math.max(5, Math.round(o.count / m)))
  }
  const outer = o.count
  const inner = o.kind === 'Twin rings' ? Math.max(12, Math.round(outer * o.innerShare / 6) * 6) : 0
  const n = outer + inner
  const x = new Float64Array(n)
  const y = new Float64Array(n)
  ringNails(outer, 1, o.rotation, x, y, 0)
  const outlines = [circleOutline(1)]
  if (inner) {
    ringNails(inner, o.ringRatio, o.rotation + Math.PI / inner, x, y, outer)
    outlines.push(circleOutline(o.ringRatio))
  }
  const side = new Int16Array(n).fill(-1)
  return { x, y, outer, inner, sides: 0, perSide: 0, sideA: side, sideB: side.slice(), outlines }
}

/** Whether a thread may run between nails a and b (greedy search). */
export function allowedPair(f: Frame, a: number, b: number): boolean {
  if (a === b)
    return false
  if (f.sides) {
    const sa = f.sideA[a]
    const sb = f.sideB[a]
    return sa !== f.sideA[b] && sa !== f.sideB[b] && sb !== f.sideA[b] && sb !== f.sideB[b]
  }
  const ra = a < f.outer ? 0 : 1
  const rb = b < f.outer ? 0 : 1
  if (ra !== rb)
    return true
  const n = ra ? f.inner : f.outer
  let d = Math.abs(a - b) % n
  d = Math.min(d, n - d)
  // short chords only hug the rim
  return d >= Math.max(3, Math.round(n / 9))
}
