// Plane geometry of the parts: involute gear teeth, ratchet and escape-wheel
// teeth, cam profiles, belt tangents, offset hulls and four-bar linkages.
// Every outline is a flat array [x0, y0, x1, y1, ...] in model units, closed
// implicitly, centred on the part's axis.

export type Pts = number[]

const TAU = Math.PI * 2
/** Standard 20 degree pressure angle. */
export const PRESSURE = 20 * Math.PI / 180
const inv = (a: number) => Math.tan(a) - a

/** Pitch radius of a gear of module m with n teeth. */
export const pitchR = (n: number, m: number) => m * n / 2

/**
 * Involute spur gear outline (addendum m, dedendum 1.25 m), tooth 0 centred
 * on angle `phase`. The flank half-width at radius R follows
 * psi(R) = pi / 2n + inv(alpha) - inv(acos(rb / R)).
 */
export function gearOutline(n: number, m: number, phase = 0): Pts {
  const r = pitchR(n, m)
  const rb = r * Math.cos(PRESSURE)
  const ra = r + m
  const rf = Math.max(r - 1.25 * m, m * 0.5)
  const base = Math.PI / (2 * n) + inv(PRESSURE)
  const psi = (R: number) => base - inv(Math.acos(Math.min(1, rb / Math.max(R, rb))))
  const r0 = Math.max(rf, rb)
  const tipHalf = Math.max(psi(ra), 0.004)
  const out: Pts = []
  const K = 5
  const at = (R: number, a: number) => out.push(R * Math.cos(a), R * Math.sin(a))
  for (let k = 0; k < n; k++) {
    const c = phase + k * TAU / n
    at(rf, c - Math.PI / n)
    if (rb > rf)
      at(rf, c - psi(rb))
    for (let i = 0; i <= K; i++) {
      const R = r0 + (ra - r0) * i / K
      at(R, c - Math.max(psi(R), tipHalf))
    }
    at(ra, c)
    for (let i = K; i >= 0; i--) {
      const R = r0 + (ra - r0) * i / K
      at(R, c + Math.max(psi(R), tipHalf))
    }
    if (rb > rf)
      at(rf, c + psi(rb))
  }
  return out
}

/** Saw-toothed ratchet wheel: radial faces, sloping backs. */
export function ratchetOutline(n: number, R: number, depth: number, phase = 0, dir = 1): Pts {
  const out: Pts = []
  for (let k = 0; k < n; k++) {
    const a = phase + k * TAU / n
    out.push(R * Math.cos(a), R * Math.sin(a))
    const b = a + dir * 0.012
    out.push((R - depth) * Math.cos(b), (R - depth) * Math.sin(b))
    const c = a + dir * TAU / n * 0.55
    const rc = R - depth * 0.82
    out.push(rc * Math.cos(c), rc * Math.sin(c))
  }
  if (dir < 0)
    return reversePts(out)
  return out
}

/** Clock escape wheel: slender pointed teeth with an undercut face. */
export function escapeOutline(n: number, R: number, depth: number, phase = 0): Pts {
  const out: Pts = []
  const p = TAU / n
  for (let k = 0; k < n; k++) {
    const a = phase + k * p
    const tip = [R * Math.cos(a), R * Math.sin(a)]
    const rr = R - depth
    const f = a - p * 0.12
    out.push(rr * Math.cos(f), rr * Math.sin(f))
    out.push(tip[0], tip[1])
    const b1 = a + p * 0.16
    const r1 = R - depth * 0.25
    out.push(r1 * Math.cos(b1), r1 * Math.sin(b1))
    const b2 = a + p * 0.5
    const r2 = R - depth * 0.85
    out.push(r2 * Math.cos(b2), r2 * Math.sin(b2))
  }
  return out
}

export function reversePts(p: Pts): Pts {
  const out: Pts = []
  for (let i = p.length - 2; i >= 0; i -= 2)
    out.push(p[i], p[i + 1])
  return out
}

export function circlePts(r: number, n = 48, cx = 0, cy = 0): Pts {
  const out: Pts = []
  for (let i = 0; i < n; i++) {
    const a = i * TAU / n
    out.push(cx + r * Math.cos(a), cy + r * Math.sin(a))
  }
  return out
}

export type CamKind = 'eccentric' | 'lobe' | 'heart' | 'double'

/** Cam radius at angle a (cam frame): base radius r0, lift h. */
export function camRadius(kind: CamKind, r0: number, h: number, a: number): number {
  const t = ((a % TAU) + TAU) % TAU
  if (kind === 'heart')
    // uniform-motion (heart) cam: lift linear in angle, out and back
    return r0 + h * (1 - Math.abs(t - Math.PI) / Math.PI)
  if (kind === 'lobe') {
    // rise, dwell and return on a cycloidal law over 200 degrees
    const span = TAU * 0.56
    if (t > span)
      return r0
    const u = t / span
    const x = u < 0.5 ? u * 2 : (1 - u) * 2
    return r0 + h * (x - Math.sin(TAU * x) / TAU)
  }
  if (kind === 'double') {
    const x = (1 - Math.cos(2 * t)) / 2
    return r0 + h * x * x
  }
  return 0
}

/** Cam outline, rotated by `rot`. The eccentric is a plain offset disc. */
export function camOutline(kind: CamKind, r0: number, h: number, rot: number, n = 120): Pts {
  const out: Pts = []
  for (let i = 0; i < n; i++) {
    const a = i * TAU / n
    let x: number
    let y: number
    if (kind === 'eccentric') {
      const R = r0 + h / 2
      x = Math.cos(a) * R + Math.cos(rot) * h / 2
      y = Math.sin(a) * R + Math.sin(rot) * h / 2
    }
    else {
      const R = camRadius(kind, r0, h, a)
      x = Math.cos(a + rot) * R
      y = Math.sin(a + rot) * R
    }
    out.push(x, y)
  }
  return out
}

/** Distance from the cam axis to the centre of a roller of radius rho riding on it along direction u. */
export function rollerDistance(outline: Pts, ux: number, uy: number, rho: number): number {
  let best = 0
  for (let i = 0; i < outline.length; i += 2) {
    const x = outline[i]
    const y = outline[i + 1]
    const along = x * ux + y * uy
    const across = -x * uy + y * ux
    if (Math.abs(across) <= rho)
      best = Math.max(best, along + Math.sqrt(rho * rho - across * across))
  }
  return best
}

export interface Belt {
  /** Tangent points: strand 1 from p1 to p2, strand 2 from p2 back to p1. */
  a1: [number, number]
  a2: [number, number]
  b1: [number, number]
  b2: [number, number]
  /** Arc angles on each pulley (from, to, ccw?) for the wrap. */
  arc1: [number, number]
  arc2: [number, number]
}

/** Open (crossed = false) or crossed belt between two pulleys. */
export function beltTangents(x1: number, y1: number, r1: number, x2: number, y2: number, r2: number, crossed: boolean): Belt | null {
  const dx = x2 - x1
  const dy = y2 - y1
  const d = Math.hypot(dx, dy)
  const th = Math.atan2(dy, dx)
  const c = crossed ? (r1 + r2) / d : (r1 - r2) / d
  if (Math.abs(c) >= 1)
    return null
  const g = Math.acos(c)
  const n1 = th + g
  const n2 = th - g
  const s2 = crossed ? -1 : 1
  const P = (x: number, y: number, r: number, a: number, s = 1): [number, number] => [x + s * r * Math.cos(a), y + s * r * Math.sin(a)]
  return {
    a1: P(x1, y1, r1, n1),
    a2: P(x2, y2, r2, n1, s2),
    b2: P(x2, y2, r2, n2, s2),
    b1: P(x1, y1, r1, n2),
    arc1: [n2, n1],
    arc2: crossed ? [n1 + Math.PI, n2 + Math.PI] : [n1, n2],
  }
}

/** Convex hull (monotone chain) of flat points, counter-clockwise in y-down. */
export function hull(p: Pts): Pts {
  const pts: [number, number][] = []
  for (let i = 0; i < p.length; i += 2)
    pts.push([p[i], p[i + 1]])
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (pts.length < 3)
    return pts.flat()
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower: [number, number][] = []
  for (const q of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0)
      lower.pop()
    lower.push(q)
  }
  const upper: [number, number][] = []
  for (let i = pts.length - 1; i >= 0; i--) {
    const q = pts[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0)
      upper.pop()
    upper.push(q)
  }
  upper.pop()
  lower.pop()
  return lower.concat(upper).flat()
}

/** Outline of a convex polygon grown by radius d (Minkowski sum with a disc). */
export function offsetHull(h: Pts, d: number, perArc = 8): Pts {
  const n = h.length / 2
  if (n === 1)
    return circlePts(d, 40, h[0], h[1])
  const out: Pts = []
  for (let i = 0; i < n; i++) {
    const px = h[((i - 1 + n) % n) * 2]
    const py = h[((i - 1 + n) % n) * 2 + 1]
    const x = h[i * 2]
    const y = h[i * 2 + 1]
    const nx = h[((i + 1) % n) * 2]
    const ny = h[((i + 1) % n) * 2 + 1]
    // outward normals of the incoming and outgoing edges
    let a0 = Math.atan2(y - py, x - px) - Math.PI / 2
    let a1 = Math.atan2(ny - y, nx - x) - Math.PI / 2
    if (n === 2) {
      a0 = Math.atan2(y - py, x - px) - Math.PI / 2
      a1 = a0 + Math.PI
    }
    while (a1 < a0)
      a1 += TAU
    for (let k = 0; k <= perArc; k++) {
      const a = a0 + (a1 - a0) * k / perArc
      out.push(x + d * Math.cos(a), y + d * Math.sin(a))
    }
  }
  return out
}

/** Intersection of circles (a, ra) and (b, rb); branch chooses the side. */
export function circleCircle(ax: number, ay: number, ra: number, bx: number, by: number, rb: number, branch: number): [number, number] | null {
  const dx = bx - ax
  const dy = by - ay
  const d = Math.hypot(dx, dy)
  if (d > ra + rb || d < Math.abs(ra - rb) || d === 0)
    return null
  const a = (ra * ra - rb * rb + d * d) / (2 * d)
  const h = Math.sqrt(Math.max(0, ra * ra - a * a))
  const mx = ax + dx * a / d
  const my = ay + dy * a / d
  return [mx - branch * h * dy / d, my + branch * h * dx / d]
}

/** Squared distance from point p to segment ab. */
export function segDist2(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax
  const dy = by - ay
  const l2 = dx * dx + dy * dy
  let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0
  t = Math.max(0, Math.min(1, t))
  const x = ax + t * dx - px
  const y = ay + t * dy - py
  return x * x + y * y
}

/** Distance between segments ab and cd (no intersection test needed for our use). */
export function segSegDist(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): number {
  // proper crossing gives zero
  const o = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) => (qx - px) * (ry - py) - (qy - py) * (rx - px)
  const d1 = o(ax, ay, bx, by, cx, cy)
  const d2 = o(ax, ay, bx, by, dx, dy)
  const d3 = o(cx, cy, dx, dy, ax, ay)
  const d4 = o(cx, cy, dx, dy, bx, by)
  if (d1 * d2 < 0 && d3 * d4 < 0)
    return 0
  return Math.sqrt(Math.min(
    segDist2(ax, ay, cx, cy, dx, dy),
    segDist2(bx, by, cx, cy, dx, dy),
    segDist2(cx, cy, ax, ay, bx, by),
    segDist2(dx, dy, ax, ay, bx, by),
  ))
}
