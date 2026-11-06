// Map projections of the celestial sphere onto the canvas.
//
// A Region is one chart drawn on the sheet: its outline (used as a clip), a
// forward projection (unit vector -> canvas pixels, or null when the point is
// off the chart) and the inverse (pixels -> unit vector), used to paint the
// Milky Way pixel by pixel. As on a real sky chart seen from below, east is
// on the left.

import type { Vec } from './sky'
import { dot } from './sky'

export interface Region {
  kind: 'circle' | 'rect'
  /** Centre and radius (circle) or box (rect), canvas pixels. */
  cx: number
  cy: number
  r: number
  x0: number
  y0: number
  x1: number
  y1: number
  /** Projected points further apart than this break a polyline (wrap-around seams). */
  jump: number
  fwd: (v: Vec) => [number, number] | null
  inv: (px: number, py: number) => Vec | null
}

export function outline(g: CanvasRenderingContext2D, rg: Region) {
  if (rg.kind === 'circle') {
    g.moveTo(rg.cx + rg.r, rg.cy)
    g.arc(rg.cx, rg.cy, rg.r, 0, Math.PI * 2)
  }
  else {
    g.rect(rg.x0, rg.y0, rg.x1 - rg.x0, rg.y1 - rg.y0)
  }
}

/**
 * Azimuthal chart centred on a celestial pole. `sign` is +1 for the north
 * pole, -1 for the south; `stereo` picks the stereographic projection
 * (conformal) instead of the azimuthal equidistant one; `limit` is the
 * colatitude of the rim, radians.
 */
export function polar(cx: number, cy: number, R: number, sign: 1 | -1, limit: number, rot: number, stereo: boolean): Region {
  const tl = Math.tan(limit / 2)
  const rOf = (th: number) => stereo ? R * Math.tan(th / 2) / tl : R * th / limit
  const thOf = (r: number) => stereo ? 2 * Math.atan(r / R * tl) : r / R * limit
  const thMax = Math.min(Math.PI * 0.98, limit + 0.25)
  return {
    kind: 'circle',
    cx,
    cy,
    r: R,
    x0: cx - R,
    y0: cy - R,
    x1: cx + R,
    y1: cy + R,
    jump: R * 0.9,
    fwd: (v) => {
      const th = Math.acos(Math.max(-1, Math.min(1, sign * v[2])))
      if (th > thMax)
        return null
      const rr = rOf(th)
      const a = Math.atan2(v[1], v[0]) + rot
      // north: right ascension runs counter-clockwise; south: clockwise
      return [cx + rr * Math.cos(a), cy - sign * rr * Math.sin(a)]
    },
    inv: (px, py) => {
      const dx = px - cx
      const dy = -(py - cy) * sign
      const rr = Math.hypot(dx, dy)
      if (rr > R * 1.01)
        return null
      const th = thOf(rr)
      const a = Math.atan2(dy, dx) - rot
      const s = Math.sin(th)
      return [s * Math.cos(a), s * Math.sin(a), sign * Math.cos(th)]
    },
  }
}

/** Equirectangular strip centred on right ascension ra0; k pixels per radian. */
export function equirect(x0: number, y0: number, x1: number, y1: number, ra0: number, k: number): Region {
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  const wrap = (a: number) => a - Math.PI * 2 * Math.floor((a + Math.PI) / (Math.PI * 2))
  return {
    kind: 'rect',
    cx,
    cy,
    r: 0,
    x0,
    y0,
    x1,
    y1,
    jump: (x1 - x0) * 0.4,
    fwd: (v) => {
      const ra = Math.atan2(v[1], v[0])
      const dec = Math.asin(Math.max(-1, Math.min(1, v[2])))
      return [cx - wrap(ra - ra0) * k, cy - dec * k]
    },
    inv: (px, py) => {
      const dec = (cy - py) / k
      if (Math.abs(dec) > Math.PI / 2)
        return null
      const ra = ra0 - (px - cx) / k
      const c = Math.cos(dec)
      return [c * Math.cos(ra), c * Math.sin(ra), Math.sin(dec)]
    },
  }
}

/** Gnomonic (central) projection on the plane tangent at (ra0, dec0): great circles are straight lines. */
export function gnomonic(x0: number, y0: number, x1: number, y1: number, ra0: number, dec0: number, k: number): Region {
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  const c0 = Math.cos(dec0)
  const s0 = Math.sin(dec0)
  // local frame: centre direction, east and north unit vectors
  const C: Vec = [c0 * Math.cos(ra0), c0 * Math.sin(ra0), s0]
  const E: Vec = [-Math.sin(ra0), Math.cos(ra0), 0]
  const N: Vec = [-s0 * Math.cos(ra0), -s0 * Math.sin(ra0), c0]
  return {
    kind: 'rect',
    cx,
    cy,
    r: 0,
    x0,
    y0,
    x1,
    y1,
    jump: (x1 - x0) * 2,
    fwd: (v) => {
      const cc = dot(v, C)
      if (cc < 0.3)
        return null
      return [cx - dot(v, E) / cc * k, cy - dot(v, N) / cc * k]
    },
    inv: (px, py) => {
      const e = -(px - cx) / k
      const nn = -(py - cy) / k
      const l = Math.hypot(1, e, nn)
      return [(C[0] + e * E[0] + nn * N[0]) / l, (C[1] + e * E[1] + nn * N[1]) / l, (C[2] + e * E[2] + nn * N[2]) / l]
    },
  }
}
