// Body coordinates for Pelt.
//
// Every framing has a spine curve. A point of the canvas is mapped to body
// coordinates: u, the arclength along the spine (growing towards the tail),
// and v, the signed distance across it. The coat pattern lives in (u, v), so a
// stripe "across the body" is a stripe across u whatever the curve does, and
// the combing field is written once in the body frame (tangent, normal).
//
// - arc: the spine is a circular arc of large radius, crossing the canvas
//   (a close-up of a back) or passing above it (a flank);
// - coil: the spine is an Archimedean spiral and the body has a profile
//   (head, trunk, tapering tail), so the animal lies curled on itself.
//
// Coordinates are canvas-local: the origin is the canvas centre and the short
// side of the canvas measures 1.

import type { Rng } from '../random'
import { range } from '../random'
import { clamp01, mix, smoothstep } from './util'

export interface Frame {
  u: number
  v: number
  /** Half width of the body at u (shading and pattern domain). */
  h: number
  /** Unit tangent (towards the tail) and normal (towards +v), canvas space. */
  tx: number
  ty: number
  nx: number
  ny: number
  /** 1 well inside the body, 0 outside. */
  inside: number
}

export const newFrame = (): Frame => ({ u: 0, v: 0, h: 1, tx: 1, ty: 0, nx: 0, ny: 1, inside: 1 })

export interface Body {
  kind: 'arc' | 'coil'
  map: (x: number, y: number, o: Frame) => void
  point: (u: number, v: number) => [number, number]
  halfWidth: (u: number) => number
  /** Range of body coordinates the coat must cover. */
  u0: number
  u1: number
  v0: number
  v1: number
  /** Coat domain: inside the body (1) or not (0). Null: everywhere. */
  mask: ((u: number, v: number) => number) | null
  /** Coil only: bounding radius of the silhouette around the origin. */
  radius: number
}

const TAU = Math.PI * 2

function wrap(a: number): number {
  while (a > Math.PI) a -= TAU
  while (a < -Math.PI) a += TAU
  return a
}

/**
 * Close-ups. `flank`: the spine passes above the canvas and the hair flows
 * down and back; otherwise it crosses the canvas near its centre.
 * `ex`, `ey`: canvas half extents; `m`: margin the coat must also cover.
 */
export function arcBody(r: Rng, flank: boolean, ex: number, ey: number, m: number): Body {
  let theta: number
  let side: number
  let R: number
  let off: number
  if (flank) {
    theta = range(r, -0.45, 0.45) + (r() < 0.5 ? Math.PI : 0)
    side = Math.cos(theta) > 0 ? 1 : -1
    R = range(r, 1.3, 2.4)
    off = range(r, 0.56, 0.78)
  }
  else {
    theta = range(r, 0, TAU)
    side = r() < 0.5 ? 1 : -1
    R = range(r, 1.6, 3.6)
    off = range(r, -0.1, 0.1)
  }
  const n0x = -side * Math.sin(theta)
  const n0y = side * Math.cos(theta)
  const p0x = -off * n0x
  const p0y = -off * n0y
  const cx = p0x - R * n0x
  const cy = p0y - R * n0y
  const phi0 = Math.atan2(p0y - cy, p0x - cx)
  const H = 1.05

  const map = (x: number, y: number, o: Frame) => {
    const dx = x - cx
    const dy = y - cy
    const d = Math.hypot(dx, dy) || 1e-9
    const nx = dx / d
    const ny = dy / d
    o.v = d - R
    o.u = -side * R * wrap(Math.atan2(dy, dx) - phi0)
    o.tx = side * ny
    o.ty = -side * nx
    o.nx = nx
    o.ny = ny
    o.h = H
    o.inside = 1
  }
  const point = (u: number, v: number): [number, number] => {
    const a = phi0 - u / (side * R)
    return [cx + (R + v) * Math.cos(a), cy + (R + v) * Math.sin(a)]
  }

  // Coat domain: the body coordinates of the canvas border (an arc of this
  // radius reaches its extremes there).
  const o = newFrame()
  let u0 = Infinity
  let u1 = -Infinity
  let v0 = Infinity
  let v1 = -Infinity
  const X = ex + m
  const Y = ey + m
  for (let i = 0; i <= 64; i++) {
    const t = i / 64
    for (const [x, y] of [[mix(-X, X, t), -Y], [mix(-X, X, t), Y], [-X, mix(-Y, Y, t)], [X, mix(-Y, Y, t)]]) {
      map(x, y, o)
      u0 = Math.min(u0, o.u)
      u1 = Math.max(u1, o.u)
      v0 = Math.min(v0, o.v)
      v1 = Math.max(v1, o.v)
    }
  }
  return { kind: 'arc', map, point, halfWidth: () => H, u0, u1, v0, v1, mask: null, radius: 1 }
}

/**
 * A body curled on itself, seen from above: head near the centre, trunk on
 * the first turn, tail wrapped around the outside. `hair` is the hair length,
 * kept inside the square with the silhouette.
 */
export function coilBody(r: Rng, hair: number): Body {
  const hand = r() < 0.5 ? 1 : -1
  const psi = range(r, 0, TAU)
  const turns = range(r, 1.18, 1.42)
  let hb = range(r, 0.105, 0.13)
  let hh = hb * range(r, 0.68, 0.8)
  let ht = hb * range(r, 0.24, 0.36)
  let r0 = hh * range(r, 0.35, 0.55)
  let b = (hb + ht + range(r, 0.004, 0.02)) / TAU
  const TH = TAU * turns
  const arc = (th: number) => r0 * th + b * th * th / 2
  let L = arc(TH)
  let cap = hh * 1.05
  let tip = ht * 1.6

  const profile = (u: number) => {
    if (u < 0)
      return hh * Math.sqrt(clamp01(1 - (u / cap) ** 2))
    if (u > L)
      return ht * 0.5 * Math.sqrt(clamp01(1 - ((u - L) / tip) ** 2))
    const t = u / L
    let body = hh + (hb - hh) * smoothstep(0.02, 0.2, t)
    body *= 1 + 0.08 * Math.sin(Math.PI * clamp01((t - 0.1) / 0.5))
    const tail = ht * (1 - 0.5 * smoothstep(0.7, 1, t))
    return mix(body, tail, smoothstep(0.5, 0.7, t))
  }

  // Fit: the outer edge plus the hair stays inside a radius of 0.44.
  let ext = 0
  for (let i = 0; i <= 200; i++) {
    const th = TH * i / 200
    ext = Math.max(ext, r0 + b * th + profile(arc(th)))
  }
  const k = (0.445 - hair) / ext
  hb *= k
  hh *= k
  ht *= k
  r0 *= k
  b *= k
  L *= k
  cap *= k
  tip *= k
  // tabulated profile: the map below is called for every cell of the grids
  const LUT = 1024
  const lu0 = -cap
  const lspan = L + tip + cap
  const tab = new Float32Array(LUT + 1)
  for (let i = 0; i <= LUT; i++)
    tab[i] = profile(lu0 + lspan * i / LUT)
  const hw = (u: number) => {
    const x = (u - lu0) / lspan * LUT
    if (x <= 0 || x >= LUT)
      return 0
    const i = x | 0
    return tab[i] + (tab[i + 1] - tab[i]) * (x - i)
  }

  // Recentre the mass of the silhouette.
  let mx = 0
  let my = 0
  let mw = 0
  for (let i = 0; i <= 300; i++) {
    const th = TH * i / 300
    const w = profile(arc(th))
    const rr = r0 + b * th
    mx += Math.cos(th) * rr * w
    my += Math.sin(th) * rr * w
    mw += w
  }
  mx /= mw
  my /= mw
  const cs = Math.cos(psi)
  const sn = Math.sin(psi)
  const toCanvas = (lx: number, ly: number): [number, number] => {
    const yy = (ly - my) * hand
    const xx = lx - mx
    return [xx * cs - yy * sn, xx * sn + yy * cs]
  }

  const thetaOf = (u: number) => (-r0 + Math.sqrt(r0 * r0 + 2 * b * Math.max(0, u))) / b

  const map = (x: number, y: number, o: Frame) => {
    const lx = x * cs + y * sn + mx
    const ly = (-x * sn + y * cs) * hand + my
    const rr = Math.hypot(lx, ly)
    let phi = Math.atan2(ly, lx)
    if (phi < 0)
      phi += TAU
    let best = Infinity
    let bth = 0
    let bu = 0
    let bv = 0
    let bh = 0
    for (let kk = -1; kk <= 2; kk++) {
      const th = phi + TAU * kk
      let u: number
      if (th < 0)
        u = r0 * th
      else if (th > TH)
        u = L + (th - TH) * (r0 + b * TH)
      else
        u = arc(th)
      if (u < -cap || u > L + tip)
        continue
      const v = rr - (r0 + b * Math.max(0, th))
      const h = hw(u)
      const score = Math.abs(v) / Math.max(h, 1e-4)
      if (score < best) {
        best = score
        bth = th
        bu = u
        bv = v
        bh = h
      }
    }
    if (best === Infinity) {
      // beyond both ends: attach to the nearest end, outside the body
      bth = phi > Math.PI ? 0 : TH
      bu = bth === 0 ? -cap : L + tip
      bv = rr - (r0 + b * bth)
      bh = 1e-4
      best = 99
    }
    o.u = bu
    o.v = bv
    o.h = Math.max(bh, 0.004)
    o.inside = clamp01((1 - best) * 6)
    // tangent and normal of the spiral, back to canvas space
    const c = Math.cos(bth)
    const s = Math.sin(bth)
    const ty = c * hand
    const tx = -s
    const ny = s * hand
    const nx = c
    o.tx = tx * cs - ty * sn
    o.ty = tx * sn + ty * cs
    o.nx = nx * cs - ny * sn
    o.ny = nx * sn + ny * cs
  }

  const point = (u: number, v: number): [number, number] => {
    const th = u < 0 ? u / r0 : thetaOf(u)
    const rr = r0 + b * Math.max(0, th) + v
    return toCanvas(Math.cos(th) * rr, Math.sin(th) * rr)
  }

  const m = hair + 0.02
  return {
    kind: 'coil',
    map,
    point,
    halfWidth: hw,
    u0: -cap - m,
    u1: L + tip + m,
    v0: -hb * 1.15 - m,
    v1: hb * 1.15 + m,
    mask: (u, v) => Math.abs(v) < hw(u) ? 1 : 0,
    radius: 0.445,
  }
}
