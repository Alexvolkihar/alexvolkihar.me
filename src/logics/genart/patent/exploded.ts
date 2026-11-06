// Fig. 2: one arbor of the machine taken apart along its axis, in an
// orthographic oblique view. A circle of the face plane projects to an
// ellipse whose minor axis lies along the projected axis (ratio E), so each
// part is drawn as a prism: back face, body, visible side edges, then the
// front face with its details. Parts are drawn from the farthest to the
// nearest, each one filled with the paper colour, which hides what lies
// behind it. Nut, washer, wheels, key, shaft, bush and spring are strung on a
// dash-dot centre line, as in the "parts separated" figures of the period.

import type { Rng } from '../random'
import type { View, Wheel } from './draw'
import type { Pts } from './geom'
import type { XPart } from './machine'
import { range } from '../random'
import { fs, hatch, poly, shadePts, sx, sy, TAU, wheelWindows } from './draw'
import { circlePts, hull } from './geom'

const E = 0.42
const K = Math.sqrt(1 - E * E)

interface Solid {
  id: string
  /** Face outline (u, v), z range (z0 nearest). */
  face: Pts
  z0: number
  z1: number
  convex: boolean
  /** Radius when the solid is a cylinder (for shading). */
  round?: number
  wheel?: Wheel
  bore?: number
  /** Offset of the face plane (key lifted off the shaft). */
  dv?: number
  thread?: number
}

export interface Plan {
  solids: Solid[]
  spring: { z0: number, z1: number, r: number, turns: number }
  zEnd: number
  rMax: number
}

export function planExploded(parts: XPart[], r: Rng): Plan {
  let rMax = 0
  let bore = 0.02
  for (const p of parts) {
    for (let i = 0; i < p.wheel.outline.length; i += 2)
      rMax = Math.max(rMax, Math.hypot(p.wheel.outline[i], p.wheel.outline[i + 1]))
    bore = Math.max(bore, p.wheel.boreR)
  }
  const rs = Math.max(bore, rMax * 0.075)
  const gap = rMax * range(r, 0.25, 0.4)
  const solids: Solid[] = []
  let z = 0
  // nut and washer
  const hex: Pts = []
  for (let k = 0; k < 6; k++)
    hex.push(rs * 1.9 * Math.cos(k * TAU / 6 + 0.52), rs * 1.9 * Math.sin(k * TAU / 6 + 0.52))
  solids.push({ id: 'nut', face: hex, z0: z, z1: z + rs * 1.6, convex: true, bore: rs })
  z += rs * 1.6 + gap * 0.6
  solids.push({ id: 'washer', face: circlePts(rs * 2.3, 64), z0: z, z1: z + rs * 0.35, convex: true, round: rs * 2.3, bore: rs })
  z += rs * 0.35 + gap
  for (const p of parts) {
    if (p.hubLen > 0) {
      const hr = p.wheel.hubR
      solids.push({ id: `${p.id}-hub`, face: circlePts(hr, 64), z0: z, z1: z + p.hubLen, convex: true, round: hr, bore: rs })
      z += p.hubLen
    }
    const convex = p.wheel.outline.length <= 260 && !p.wheel.spokes && isConvex(p.wheel.outline)
    solids.push({ id: p.id, face: p.wheel.outline, z0: z, z1: z + p.thick, convex, wheel: p.wheel, round: p.drum ? rMax * 0.9 : undefined })
    z += p.thick + gap
  }
  // key, lifted off the shaft, then the shaft itself
  const keyLen = rMax * 0.5
  const zs = z
  const shaftLen = z * 0.4 + rMax * 0.9
  const kz = zs + rs * 2
  solids.push({ id: 'key', face: [-rs * 0.35, -rs * 0.3, rs * 0.35, -rs * 0.3, rs * 0.35, rs * 0.3, -rs * 0.35, rs * 0.3], z0: kz, z1: kz + keyLen, convex: true, dv: rs * 2.6 })
  const thread = rs * 2.2
  solids.push({ id: 'shaft-end', face: circlePts(rs * 0.82, 48), z0: zs, z1: zs + thread, convex: true, round: rs * 0.82, thread: rs * 0.35 })
  solids.push({ id: 'shaft', face: circlePts(rs, 48), z0: zs + thread, z1: zs + shaftLen, convex: true, round: rs })
  const collarZ = zs + thread + shaftLen * 0.62
  solids.push({ id: 'collar', face: circlePts(rs * 1.55, 48), z0: collarZ, z1: collarZ + rs * 0.8, convex: true, round: rs * 1.55 })
  z = zs + shaftLen + gap
  // flanged bush
  solids.push({ id: 'bush', face: circlePts(rs * 1.6, 48), z0: z, z1: z + rs * 3, convex: true, round: rs * 1.6, bore: rs })
  solids.push({ id: 'bush-flange', face: circlePts(rs * 2.8, 48), z0: z + rs * 3, z1: z + rs * 3.6, convex: true, round: rs * 2.8 })
  z += rs * 3.6 + gap * 0.8
  const spring = { z0: z, z1: z + rMax * 0.55, r: rs * 1.7, turns: 6 }
  z = spring.z1
  return { solids, spring, zEnd: z, rMax }
}

function isConvex(p: Pts): boolean {
  const n = p.length / 2
  let sgn = 0
  for (let i = 0; i < n; i++) {
    const ax = p[i * 2]
    const ay = p[i * 2 + 1]
    const bx = p[((i + 1) % n) * 2]
    const by = p[((i + 1) % n) * 2 + 1]
    const cx = p[((i + 2) % n) * 2]
    const cy = p[((i + 2) % n) * 2 + 1]
    const c = (bx - ax) * (cy - by) - (by - ay) * (cx - bx)
    if (Math.abs(c) < 1e-12)
      continue
    const s = Math.sign(c)
    if (sgn && s !== sgn)
      return false
    sgn = s
  }
  return true
}

export interface Placed {
  anchors: { id: string, x: number, y: number }[]
  /** Screen-space capsules (pixels) covered by the figure. */
  caps: [number, number, number, number, number][]
}

/**
 * Draws the plan fitted into the box (pixels). `base` carries pens and
 * colours; its scale and origin are replaced here.
 */
export function drawExploded(base: View, plan: Plan, bx: number, by: number, bw: number, bh: number): Placed {
  // axis rises to the upper right, steeper in tall boxes
  const phi = -Math.min(1.05, Math.max(0.2, Math.atan2(bh, bw) * 0.85))
  const ax = Math.cos(phi)
  const ay = Math.sin(phi)
  const px = -ay
  const py = ax
  const P = (u: number, v: number, z: number): [number, number] => [(z * K + v * E) * ax + u * px, (z * K + v * E) * ay + u * py]
  // bounds
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  const grow = (u: number, v: number, z: number) => {
    const [x, y] = P(u, v, z)
    x0 = Math.min(x0, x)
    x1 = Math.max(x1, x)
    y0 = Math.min(y0, y)
    y1 = Math.max(y1, y)
  }
  for (const s of plan.solids) {
    for (let i = 0; i < s.face.length; i += 4) {
      grow(s.face[i], s.face[i + 1] + (s.dv ?? 0), s.z0)
      grow(s.face[i], s.face[i + 1] + (s.dv ?? 0), s.z1)
    }
  }
  grow(0, 0, -plan.rMax * 0.4)
  grow(0, 0, plan.zEnd + plan.rMax * 0.4)
  const s = Math.min(bw / (x1 - x0), bh / (y1 - y0))
  const v: View = { ...base, s, ox: bx + (bw - (x1 - x0) * s) / 2 - x0 * s, oy: by + (bh - (y1 - y0) * s) / 2 - y0 * s }
  const g = v.g
  const out: Placed = { anchors: [], caps: [] }
  const proj = (face: Pts, z: number, dv = 0): Pts => {
    const o: Pts = []
    for (let i = 0; i < face.length; i += 2) {
      const [x, y] = P(face[i], face[i + 1] + dv, z)
      o.push(x, y)
    }
    return o
  }
  // centre line, dash-dot
  {
    const [cx0, cy0] = P(0, 0, -plan.rMax * 0.35)
    const [cx1, cy1] = P(0, 0, plan.zEnd + plan.rMax * 0.35)
    g.setLineDash([0.018 * v.S, 0.005 * v.S, 0.002 * v.S, 0.005 * v.S])
    fs(v, () => {
      g.moveTo(sx(v, cx0), sy(v, cy0))
      g.lineTo(sx(v, cx1), sy(v, cy1))
    }, { fill: null, lw: v.lw * 0.6, stroke: v.accent })
    g.setLineDash([])
  }
  // spring (farthest)
  {
    const { z0, z1, r, turns } = plan.spring
    const N = Math.ceil(turns * 32)
    for (const front of [false, true]) {
      g.beginPath()
      let pen = false
      for (let i = 0; i <= N; i++) {
        const t = i / N * turns * TAU
        const vv = r * Math.sin(t)
        const [x, y] = P(r * Math.cos(t), vv, z0 + (z1 - z0) * i / N)
        if ((vv >= 0) === front) {
          if (pen)
            g.lineTo(sx(v, x), sy(v, y))
          else
            g.moveTo(sx(v, x), sy(v, y))
          pen = true
        }
        else {
          if (pen)
            g.lineTo(sx(v, x), sy(v, y))
          pen = false
        }
      }
      g.strokeStyle = v.ink
      g.lineWidth = front ? v.lw * 1.6 : v.lw * 0.6
      g.stroke()
    }
    const [mx, my] = P(r, 0, (z0 + z1) / 2)
    out.anchors.push({ id: 'spring', x: sx(v, mx), y: sy(v, my) })
  }
  const solids = [...plan.solids].sort((a, b) => b.z0 - a.z0 || (a.dv ?? 0) - (b.dv ?? 0))
  for (const so of solids) {
    const dv = so.dv ?? 0
    const back = proj(so.face, so.z1, dv)
    const front = proj(so.face, so.z0, dv)
    fs(v, () => poly(v, back), { lw: v.lw * 0.9 })
    if (so.convex) {
      fs(v, () => poly(v, hull(back.concat(front))), { stroke: null })
    }
    else {
      const depthPx = (so.z1 - so.z0) * K * s
      const steps = Math.min(140, Math.max(3, Math.ceil(depthPx / 1.2)))
      g.beginPath()
      for (let k = 1; k < steps; k++)
        poly(v, proj(so.face, so.z1 - (so.z1 - so.z0) * k / steps, dv))
      g.fillStyle = v.bg
      g.fill()
    }
    // side edges: silhouette of round parts, visible corners of the others
    g.beginPath()
    if (so.round) {
      for (const u of [-so.round, so.round]) {
        const [a0, a1] = P(u, dv, so.z0)
        const [b0, b1] = P(u, dv, so.z1)
        g.moveTo(sx(v, a0), sy(v, a1))
        g.lineTo(sx(v, b0), sy(v, b1))
      }
    }
    else {
      let rr = 0
      for (let i = 0; i < so.face.length; i += 2)
        rr = Math.max(rr, Math.hypot(so.face[i], so.face[i + 1]))
      for (let i = 0; i < so.face.length; i += 2) {
        const u = so.face[i]
        const w = so.face[i + 1]
        if (w < -rr * 0.15 || Math.hypot(u, w) < rr * 0.97)
          continue
        g.moveTo(sx(v, front[i]), sy(v, front[i + 1]))
        g.lineTo(sx(v, back[i]), sy(v, back[i + 1]))
      }
    }
    g.strokeStyle = v.ink
    g.lineWidth = v.lw
    g.stroke()
    if (so.round) {
      // heavy silhouette on the shadow side, and shading lines on the barrel
      const R = so.round
      const [a0, a1] = P(R, dv, so.z0)
      const [b0, b1] = P(R, dv, so.z1)
      g.beginPath()
      g.moveTo(sx(v, a0), sy(v, a1))
      g.lineTo(sx(v, b0), sy(v, b1))
      g.lineWidth = v.lw * 2.3
      g.stroke()
      if (v.shading !== 'Outline') {
        const cs = v.shading === 'Cross-hatched' ? [0.35, 0.55, 0.7, 0.8, 0.87, 0.92, 0.96, 0.985] : [0.55, 0.72, 0.84, 0.92, 0.97]
        g.beginPath()
        for (const c of cs) {
          const u = R * c
          const w = R * Math.sqrt(1 - c * c)
          const [f0, f1] = P(u, w + dv, so.z0)
          const [e0, e1] = P(u, w + dv, so.z1)
          g.moveTo(sx(v, f0), sy(v, f1))
          g.lineTo(sx(v, e0), sy(v, e1))
        }
        g.lineWidth = v.lw * 0.5
        g.stroke()
      }
      if (so.thread) {
        // visible half of each thread turn
        g.beginPath()
        for (let z = so.z0 + so.thread * 0.5; z < so.z1; z += so.thread) {
          for (let k = 0; k <= 12; k++) {
            const t = Math.PI * k / 12
            const [x, y] = P(R * Math.cos(t), R * Math.sin(t) + dv, z + so.thread * k / 24)
            if (k)
              g.lineTo(sx(v, x), sy(v, y))
            else
              g.moveTo(sx(v, x), sy(v, y))
          }
        }
        g.lineWidth = v.lw * 0.7
        g.stroke()
      }
    }
    // front face
    fs(v, () => poly(v, front))
    shadePts(v, front, 0, 0, false, 2)
    if (so.wheel) {
      const w = so.wheel
      for (const win of wheelWindows(w)) {
        const pw = proj(win, so.z0)
        fs(v, () => poly(v, pw), { fill: null })
        if (v.shading !== 'Outline')
          hatch(v, () => poly(v, pw), ...bounds(pw), Math.PI / 4, 0.0045, { lw: v.lw * 0.45 })
        shadePts(v, pw, 0, 0, true, 1.7)
      }
      const rings = [w.hubR, ...(w.rings ?? [])]
      if (!w.spokes && !w.holes)
        rings.push(w.rRoot * 0.85)
      for (const rr of rings)
        fs(v, () => poly(v, proj(circlePts(rr, 48), so.z0)), { fill: null, lw: v.lw * 0.8 })
      fs(v, () => poly(v, proj(circlePts(w.boreR, 32), so.z0)), { fill: v.ink, stroke: null })
    }
    if (so.bore)
      fs(v, () => poly(v, proj(circlePts(so.bore!, 32), so.z0)), { fill: v.ink, stroke: null })
    if (so.id === 'nut')
      fs(v, () => poly(v, proj(circlePts(Math.hypot(so.face[0], so.face[1]) * 0.86, 48), so.z0)), { fill: null, lw: v.lw * 0.6 })
    // label anchor on the front face, and the occupied area
    let rr = 0
    for (let i = 0; i < so.face.length; i += 2)
      rr = Math.max(rr, Math.hypot(so.face[i], so.face[i + 1]))
    const [axp, ayp] = P(rr * 0.55, -rr * 0.35 + dv, so.z0)
    const id = so.id.replace(/-hub$|-flange$|-end$/, '')
    if (!out.anchors.some(a => a.id === id))
      out.anchors.push({ id, x: sx(v, axp), y: sy(v, ayp) })
    const [c0, c1] = P(0, dv, so.z0)
    const [d0, d1] = P(0, dv, so.z1)
    out.caps.push([sx(v, c0), sy(v, c1), sx(v, d0), sy(v, d1), rr * s])
  }
  const [s0, s1] = P(0, 0, plan.spring.z0)
  const [t0, t1] = P(0, 0, plan.spring.z1)
  out.caps.push([sx(v, s0), sy(v, s1), sx(v, t0), sy(v, t1), plan.spring.r * s])
  return out
}

function bounds(p: Pts): [number, number, number, number] {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (let i = 0; i < p.length; i += 2) {
    x0 = Math.min(x0, p[i])
    x1 = Math.max(x1, p[i])
    y0 = Math.min(y0, p[i + 1])
    y1 = Math.max(y1, p[i + 1])
  }
  return [x0, y0, x1, y1]
}
