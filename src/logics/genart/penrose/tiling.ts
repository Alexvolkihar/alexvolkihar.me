// Penrose tilings by Robinson-triangle deflation.
//
// Both tilings are built from half-tiles (Robinson triangles) A, B, C whose
// mirror image across the edge A–C completes the tile:
//
// - P3 (rhombs), after Christian Hill's formulation of the Robinson
//   subdivision: type 0 is half a thin rhomb (36° at B), type 1 half a thick
//   rhomb (108° at B). Two halves meet along their base A–C.
// - P2 (kites and darts), derived the same way: type 0 is half a kite (36° at
//   its tip A, the axis A–C runs to the 144° corner), type 1 half a dart
//   (108° at the re-entrant corner A, the axis A–C runs to the tip).
//
// Each deflation replaces every triangle by two or three smaller ones,
// scaled by 1/φ. Starting from a five-fold "sun" much larger than the view
// and dropping every triangle that falls outside the view at each step keeps
// the work proportional to the visible area.

export type TilingKind = 'P3' | 'P2'

export interface Half {
  /** 0: thin rhomb / kite, 1: thick rhomb / dart. */
  t: number
  ax: number
  ay: number
  bx: number
  by: number
  cx: number
  cy: number
  /** Identity of the supertile this half belongs to (the ancestor tile, a few deflations back). */
  anc: number
}

const PHI = (1 + Math.sqrt(5)) / 2
const PSI = 1 / PHI
const PSI2 = 1 - PSI

function half(t: number, ax: number, ay: number, bx: number, by: number, cx: number, cy: number, anc: number): Half {
  return { t, ax, ay, bx, by, cx, cy, anc }
}

/** One deflation step. Children always lie inside their parent. */
function deflate(kind: TilingKind, h: Half, out: Half[]): void {
  const { ax, ay, bx, by, cx, cy, anc } = h
  if (kind === 'P3') {
    if (h.t === 1) {
      const dx = PSI2 * ax + PSI * cx
      const dy = PSI2 * ay + PSI * cy
      const ex = PSI2 * ax + PSI * bx
      const ey = PSI2 * ay + PSI * by
      out.push(half(1, dx, dy, ex, ey, ax, ay, anc))
      out.push(half(0, ex, ey, dx, dy, bx, by, anc))
      out.push(half(1, cx, cy, dx, dy, bx, by, anc))
    }
    else {
      const dx = PSI * ax + PSI2 * bx
      const dy = PSI * ay + PSI2 * by
      out.push(half(0, dx, dy, cx, cy, ax, ay, anc))
      out.push(half(1, cx, cy, dx, dy, bx, by, anc))
    }
    return
  }
  if (h.t === 0) {
    // half-kite: tip A, side corner B, 144° corner C. A half-dart takes the
    // tip (a sun deflates into a star), a whole new kite the side corner.
    const wx = ax + (cx - ax) * PSI
    const wy = ay + (cy - ay) * PSI
    const rx = ax + (bx - ax) * PSI2
    const ry = ay + (by - ay) * PSI2
    out.push(half(1, rx, ry, wx, wy, ax, ay, anc))
    out.push(half(0, bx, by, cx, cy, wx, wy, anc))
    out.push(half(0, bx, by, rx, ry, wx, wy, anc))
  }
  else {
    // half-dart: re-entrant corner A, wing B, tip C
    const ex = cx + (bx - cx) * PSI
    const ey = cy + (by - cy) * PSI
    out.push(half(0, cx, cy, ex, ey, ax, ay, anc))
    out.push(half(1, ex, ey, ax, ay, bx, by, anc))
  }
}

/** The five-fold sun: ten halves around the origin, radius R, turned by rot. */
function sun(kind: TilingKind, R: number, rot: number, ox: number, oy: number): Half[] {
  const out: Half[] = []
  const at = (a: number): [number, number] => [ox + R * Math.cos(a + rot), oy + R * Math.sin(a + rot)]
  for (let i = 0; i < 10; i++) {
    if (kind === 'P3') {
      // ten thin halves, apex B at the centre, alternately mirrored
      let [ax, ay] = at((2 * i - 1) * Math.PI / 10)
      let [cx, cy] = at((2 * i + 1) * Math.PI / 10)
      if (i % 2 === 0)
        [ax, ay, cx, cy] = [cx, cy, ax, ay]
      out.push(half(0, ax, ay, ox, oy, cx, cy, 0))
    }
    else {
      // five kites with their tips at the centre, each split along its axis
      const k = Math.floor(i / 2)
      const axis = at(k * 2 * Math.PI / 5)
      const side = at(k * 2 * Math.PI / 5 + (i % 2 === 0 ? -1 : 1) * Math.PI / 5)
      out.push(half(0, ox, oy, side[0], side[1], axis[0], axis[1], 0))
    }
  }
  return out
}

function outside(h: Half, x0: number, y0: number, x1: number, y1: number): boolean {
  return Math.max(h.ax, h.bx, h.cx) < x0 || Math.min(h.ax, h.bx, h.cx) > x1
    || Math.max(h.ay, h.by, h.cy) < y0 || Math.min(h.ay, h.by, h.cy) > y1
}

/** Integer hash of a point, rounded so both halves of a tile agree on it. */
export function pointKey(x: number, y: number): number {
  let h = Math.imul((Math.round(x * 1e5) | 0) ^ 0x9E3779B9, 0x85EBCA6B)
  h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35)
  h = Math.imul(h ^ (Math.round(y * 1e5) | 0), 0x27D4EB2D)
  h = Math.imul(h ^ (h >>> 15), 0x165667B1)
  return (h ^ (h >>> 16)) >>> 0
}

/** Exact identity of a point, for de-duplicating shared edges and tiles. */
export function pointId(x: number, y: number): string {
  return `${Math.round(x * 1e5)},${Math.round(y * 1e5)}`
}

export interface TilingOptions {
  kind: TilingKind
  /** Edge length wanted for the final tiles (long edge for kites and darts). */
  edge: number
  /** The sun must reach at least this far from its centre. */
  reach: number
  rot: number
  /** Position of the sun's centre in view coordinates. */
  ox: number
  oy: number
  /** View rectangle, already widened by a margin. */
  x0: number
  y0: number
  x1: number
  y1: number
  /** How many deflations back the supertile identity is taken. */
  superDepth: number
}

export interface Tiling {
  halves: Half[]
  /** Actual edge length of the final tiles. */
  edge: number
}

export function buildTiling(o: TilingOptions): Tiling {
  // Smallest number of deflations whose sun covers the reach.
  let n = 0
  while (o.edge * PHI ** n < o.reach)
    n++
  const R = o.edge * PHI ** n
  let cur = sun(o.kind, R, o.rot, o.ox, o.oy)
  for (let g = 0; g < n; g++) {
    const next: Half[] = []
    for (const h of cur) {
      if (!outside(h, o.x0, o.y0, o.x1, o.y1))
        deflate(o.kind, h, next)
    }
    if (g === n - 1 - o.superDepth) {
      // tag every half with the tile it belongs to at this generation
      for (const h of next)
        h.anc = pointKey((h.ax + h.cx) / 2, (h.ay + h.cy) / 2)
    }
    cur = next
  }
  return { halves: cur.filter(h => !outside(h, o.x0, o.y0, o.x1, o.y1)), edge: o.edge }
}

/** Mirror of B across the line A–C: the fourth corner of the tile. */
export function mirrorB(h: Half): [number, number] {
  const ux = h.cx - h.ax
  const uy = h.cy - h.ay
  const t = ((h.bx - h.ax) * ux + (h.by - h.ay) * uy) / (ux * ux + uy * uy)
  const px = h.ax + ux * t
  const py = h.ay + uy * t
  return [2 * px - h.bx, 2 * py - h.by]
}
