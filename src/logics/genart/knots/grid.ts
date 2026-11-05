// Celtic knotwork on a square grid: the "plait and breaks" construction.
//
// Every cell of the mask holds a diamond whose corners are the midpoints of
// its four edges. Where an edge is shared by two cells of the mask and is not
// a break, the diagonals of the two diamonds run straight through its
// midpoint and cross there: with no breaks at all this is the plain plait.
// Where an edge is a wall (a break, or the border of the mask), the two
// diagonals on each side join in a turn that runs parallel to the wall
// instead. This is the construction taught by George Bain (Celtic Art: The
// Methods of Construction, 1951) and formalised by Peter Cromwell (Celtic
// Knotwork: Mathematical Art, The Mathematical Intelligencer, 1993).
//
// Over and under: orient every diamond the same way round. Each side then
// passes over at the crossing where it starts and under at the one where it
// ends. A strand going straight through a crossing joins two sides that both
// start there (over) or both end there (under), and a turn at a wall joins
// the end of one side to the start of the next, skipping both. So over and
// under alternate along every strand, whatever the breaks.

import type { Rng } from '../random'
import type { Crossing, Strand } from './geometry'
import { int } from '../random'
import { pushHermite, pushLine } from './geometry'

export type Pattern = 'Plait' | 'Mirrored' | 'Lattice' | 'Wild'

/** Edge midpoints of a cell, in diamond order: bottom, right, top, left (y down). */
const MX = [0.5, 1, 0.5, 0]
const MY = [1, 0.5, 0, 0.5]
/** Neighbour across each edge. */
const NI = [0, 1, 0, -1]
const NJ = [1, 0, -1, 0]
/** Unit normal from each edge into the cell. */
const INX = [0, -1, 0, 1]
const INY = [-1, 0, 1, 0]

export interface Region { x0: number, y0: number, w: number, h: number }

export class KnotGrid {
  readonly mask: Uint8Array
  /** Horizontal edge (i, j) runs from node (i, j) to (i + 1, j). */
  readonly hB: Uint8Array
  /** Vertical edge (i, j) runs from node (i, j) to (i, j + 1). */
  readonly vB: Uint8Array

  constructor(readonly nx: number, readonly ny: number) {
    this.mask = new Uint8Array(nx * ny)
    this.hB = new Uint8Array(nx * (ny + 1))
    this.vB = new Uint8Array((nx + 1) * ny)
  }

  inside(i: number, j: number): boolean {
    return i >= 0 && j >= 0 && i < this.nx && j < this.ny && this.mask[i + j * this.nx] === 1
  }

  fill(r: Region, v = 1): void {
    for (let j = r.y0; j < r.y0 + r.h; j++) {
      for (let i = r.x0; i < r.x0 + r.w; i++) {
        if (i >= 0 && j >= 0 && i < this.nx && j < this.ny)
          this.mask[i + j * this.nx] = v
      }
    }
  }

  /** Marks the unit edge between two nodes as a break, if it lies inside the mask. */
  breakEdge(xa: number, ya: number, xb: number, yb: number): void {
    // A break never closes a cell on all four sides: that would leave a
    // small ring on its own, which reads as clutter rather than knotwork.
    if (ya === yb) {
      const i = Math.min(xa, xb)
      if (this.inside(i, ya - 1) && this.inside(i, ya) && this.walls(i, ya - 1) < 3 && this.walls(i, ya) < 3)
        this.hB[i + ya * this.nx] = 1
    }
    else {
      const j = Math.min(ya, yb)
      if (this.inside(xa - 1, j) && this.inside(xa, j) && this.walls(xa - 1, j) < 3 && this.walls(xa, j) < 3)
        this.vB[xa + j * (this.nx + 1)] = 1
    }
  }

  walls(i: number, j: number): number {
    let n = 0
    for (let k = 0; k < 4; k++) {
      if (!this.open(i, j, k))
        n++
    }
    return n
  }

  /** True when the edge k of cell (i, j) is crossed by the strands (not a wall). */
  open(i: number, j: number, k: number): boolean {
    if (!this.inside(i + NI[k], j + NJ[k]))
      return false
    if (k === 0)
      return this.hB[i + (j + 1) * this.nx] === 0
    if (k === 2)
      return this.hB[i + j * this.nx] === 0
    if (k === 1)
      return this.vB[i + 1 + j * (this.nx + 1)] === 0
    return this.vB[i + j * (this.nx + 1)] === 0
  }

  /** Border edges of the mask, each with the outward normal. */
  border(): number[] {
    const out: number[] = []
    for (let j = 0; j < this.ny; j++) {
      for (let i = 0; i < this.nx; i++) {
        if (!this.inside(i, j))
          continue
        for (let k = 0; k < 4; k++) {
          if (this.inside(i + NI[k], j + NJ[k]))
            continue
          // the edge's end points
          if (k === 0)
            out.push(i, j + 1, i + 1, j + 1, 0, 1)
          else if (k === 1)
            out.push(i + 1, j, i + 1, j + 1, 1, 0)
          else if (k === 2)
            out.push(i, j, i + 1, j, 0, -1)
          else
            out.push(i, j, i, j + 1, -1, 0)
        }
      }
    }
    return out
  }

  /**
   * Follows every strand. `inset` is how far a turn stays from its wall,
   * `pointed` turns corners between two walls into sharp points.
   */
  trace(inset: number, pointed: boolean, width: number, first: number): { strands: Strand[], crossings: Crossing[] } {
    const { nx, ny } = this
    const seen = new Uint8Array(nx * ny * 4)
    const strands: Strand[] = []
    const crossings: Crossing[] = []
    const D = Math.SQRT1_2
    for (let c0 = 0; c0 < nx * ny; c0++) {
      if (this.mask[c0] !== 1)
        continue
      for (let k0 = 0; k0 < 4; k0++) {
        if (seen[c0 * 4 + k0])
          continue
        const seg: number[] = []
        const id = first + strands.length
        let i = c0 % nx
        let j = Math.floor(c0 / nx)
        let k = k0
        let dir = 1
        for (let guard = 0; guard < nx * ny * 4 + 4; guard++) {
          seen[(i + j * nx) * 4 + k] = 1
          const a = dir > 0 ? k : (k + 1) % 4
          const b = dir > 0 ? (k + 1) % 4 : k
          const dx = Math.sign(MX[b] - MX[a]) * D
          const dy = Math.sign(MY[b] - MY[a]) * D
          const openA = this.open(i, j, a)
          const openB = this.open(i, j, b)
          // end states: on the midpoint going diagonally, or near the wall going along it
          const state = (m: number, isOpen: boolean): [number, number, number, number] => {
            if (isOpen)
              return [i + MX[m], j + MY[m], dx, dy]
            const along = m % 2 === 0
            return [i + MX[m] + inset * INX[m], j + MY[m] + inset * INY[m], along ? Math.sign(dx) : 0, along ? 0 : Math.sign(dy)]
          }
          const [x0, y0, tx0, ty0] = state(a, openA)
          const [x1, y1, tx1, ty1] = state(b, openB)
          if (!openA && !openB && pointed) {
            // the two tangent lines meet near the corner of the cell
            const cx = tx0 !== 0 ? x1 : x0
            const cy = tx0 !== 0 ? y0 : y1
            pushLine(seg, x0, y0, cx, cy)
            pushLine(seg, cx, cy, x1, y1)
          }
          else {
            pushHermite(seg, x0, y0, tx0, ty0, x1, y1, tx1, ty1, 0.39)
          }
          // move on
          if (openB) {
            const ni = i + NI[b]
            const nj = j + NJ[b]
            const m = (b + 2) % 4
            if (dir < 0) {
              // this side started here: the strand passes over
              crossings.push({ x: i + MX[b], y: j + MY[b], ox: dx, oy: dy, ux: -dy, uy: dx, strand: id, seg: seg.length / 8 })
              k = m
              dir = 1
            }
            else {
              k = (m + 3) % 4
              dir = -1
            }
            i = ni
            j = nj
          }
          else {
            k = dir > 0 ? (k + 1) % 4 : (k + 3) % 4
          }
          if (i + j * nx === c0 && k === k0 && dir === 1)
            break
        }
        const n = seg.length / 8
        for (const c of crossings) {
          if (c.strand === id && c.seg >= n)
            c.seg -= n
        }
        strands.push({ seg, colour: strands.length, width })
      }
    }
    return { strands, crossings }
  }
}

/**
 * Places the breaks of one region. Runs of one to three edges along the grid
 * lines, mirrored about both axes of the region (and its diagonal when it is
 * square) for Mirrored, left free for Wild; Lattice repeats a small random
 * tile of breaks, folded about the centre lines so it stays symmetric.
 */
export function placeBreaks(g: KnotGrid, reg: Region, pattern: Pattern, r: Rng, amount: number): void {
  const { x0, y0, w, h } = reg
  if (pattern === 'Plait' || w < 2 || h < 2)
    return
  if (pattern === 'Lattice') {
    const P = int(r, 2, 4)
    const bits: number[] = []
    for (let q = 0; q < P * P * 2; q++)
      bits.push(r() < 0.22 + 0.2 * amount ? 1 : 0)
    if (!bits.includes(1))
      bits[0] = 1
    const fold = (v: number, n: number) => Math.min(v, n - v)
    for (let y = 0; y <= h; y++) {
      for (let x = 0; x <= w; x++) {
        // horizontal edge from node (x, y): cell column x, node row y
        if (x < w && y > 0 && y < h && bits[(fold(x, w - 1) % P) * P + (fold(y, h) % P)])
          g.breakEdge(x0 + x, y0 + y, x0 + x + 1, y0 + y)
        if (y < h && x > 0 && x < w && bits[P * P + (fold(y, h - 1) % P) * P + (fold(x, w) % P)])
          g.breakEdge(x0 + x, y0 + y, x0 + x, y0 + y + 1)
      }
    }
    return
  }
  const mirrored = pattern === 'Mirrored'
  const frac = 0.1 + 0.16 * amount
  const runs = Math.max(1, Math.round(mirrored ? (w * h * frac) / 4 : w * h * frac * 0.8))
  const square = w === h
  const put = (xa: number, ya: number, xb: number, yb: number) => {
    const images: [number, number, number, number][] = [[xa, ya, xb, yb]]
    if (mirrored) {
      images.push([w - xa, ya, w - xb, yb], [xa, h - ya, xb, h - yb], [w - xa, h - ya, w - xb, h - yb])
      if (square) {
        for (const [p, q, s, t] of images.slice())
          images.push([q, p, t, s])
      }
    }
    for (const [p, q, s, t] of images)
      g.breakEdge(x0 + p, y0 + q, x0 + s, y0 + t)
  }
  for (let n = 0; n < runs; n++) {
    const horizontal = r() < 0.5
    let x = int(r, 1, w - 1)
    let y = int(r, 1, h - 1)
    const len = int(r, 1, 3)
    const back = r() < 0.5 ? -1 : 1
    for (let s = 0; s < len; s++) {
      const xb = horizontal ? x + back : x
      const yb = horizontal ? y : y + back
      if (xb < 0 || yb < 0 || xb > w || yb > h)
        break
      put(x, y, xb, yb)
      x = xb
      y = yb
    }
  }
}
