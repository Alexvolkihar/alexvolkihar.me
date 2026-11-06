// Shared drawing helpers for the Collapse worlds: colours, positional hashes,
// the placed-tile record and the vector geometry of a tile (links between
// edge midpoints, corner-terrain shapes).

import type { Group, Tile } from './wfc'

export interface Palette {
  /** Ground around the work. */
  bg: string
  /** Light (or, on a dark palette, dark) paper of maps and plates. */
  paper: string
  ink: string
  deep: string
  shallow: string
  sand: string
  grass: string
  forest: string
  a1: string
  a2: string
  dark: boolean
}

/** One cell of the solved grid, with the tile as it is actually laid. */
export interface Placed {
  i: number
  j: number
  /** Centre of the cell on the canvas. */
  x: number
  y: number
  tile: Tile
  corners: number[]
  feats: number[]
  groups: Group[]
}

export interface Grid {
  cols: number
  rows: number
  /** Cell size in pixels. */
  s: number
  x0: number
  y0: number
  cells: Placed[]
  /** Short side of the canvas. */
  S: number
  W: number
  H: number
}

type RGB = [number, number, number]

function hex(c: string): RGB {
  const v = Number.parseInt(c.slice(1), 16)
  return [v >> 16, (v >> 8) & 255, v & 255]
}

/** Linear mix of two #rrggbb colours. */
export function mix(a: string, b: string, t: number): string {
  const x = hex(a)
  const y = hex(b)
  const f = (i: number) => Math.round(x[i] + (y[i] - x[i]) * t).toString(16).padStart(2, '0')
  return `#${f(0)}${f(1)}${f(2)}`
}

/** Relative luminance (0..1) of a #rrggbb colour, roughly. */
export function luma(c: string): number {
  const [r, g, b] = hex(c)
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

/** Mixes c towards towards until it stands out from ground by at least d in luminance. */
export function contrast(c: string, ground: string, towards: string, d = 0.28): string {
  for (let t = 0; t < 1; t += 0.1) {
    const m = mix(c, towards, t)
    if (Math.abs(luma(m) - luma(ground)) >= d)
      return m
  }
  return towards
}

/** Integer hash of a position, in [0, 1). Independent of the canvas size. */
export function phash(seed: number, a: number, b: number, c = 0): number {
  let h = seed ^ Math.imul(a + 0x3C1, 0x27D4EB2D) ^ Math.imul(b + 0x91F, 0x165667B1) ^ Math.imul(c + 7, 0x9E3779B1)
  h = Math.imul(h ^ (h >>> 15), 0x85EBCA6B)
  h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** Smooth value noise on an integer lattice, seeded. */
export function valueNoise(seed: number) {
  const fade = (t: number) => t * t * (3 - 2 * t)
  return (x: number, y: number) => {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const u = fade(x - xi)
    const v = fade(y - yi)
    const a = phash(seed, xi, yi)
    const b = phash(seed, xi + 1, yi)
    const c = phash(seed, xi, yi + 1)
    const d = phash(seed, xi + 1, yi + 1)
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
  }
}

// ---------------------------------------------------------------------------
// Links between edge midpoints. Edge 0 N, 1 E, 2 S, 3 W.
// ---------------------------------------------------------------------------

const EX = [0, 1, 0, -1]
const EY = [-1, 0, 1, 0]

/** Midpoint of edge e of a cell centred on (x, y), pushed out by ext. */
export function edgePoint(x: number, y: number, s: number, e: number, ext = 0): [number, number] {
  return [x + EX[e] * (s / 2 + ext), y + EY[e] * (s / 2 + ext)]
}

/**
 * Adds to the current path the link from edge a to edge b of the cell: a
 * straight line between opposite edges, a quarter circle round the shared
 * corner between adjacent edges. ext lengthens it past both edges (seams).
 */
export function link(g: CanvasRenderingContext2D, x: number, y: number, s: number, a: number, b: number, ext = 0): void {
  if ((a + 2) % 4 === b) {
    const [x1, y1] = edgePoint(x, y, s, a, ext)
    const [x2, y2] = edgePoint(x, y, s, b, ext)
    g.moveTo(x1, y1)
    g.lineTo(x2, y2)
    return
  }
  const cx = x + (EX[a] + EX[b]) * s / 2
  const cy = y + (EY[a] + EY[b]) * s / 2
  const [ax, ay] = edgePoint(x, y, s, a)
  const [bx, by] = edgePoint(x, y, s, b)
  let a0 = Math.atan2(ay - cy, ax - cx)
  let a1 = Math.atan2(by - cy, bx - cx)
  let d = a1 - a0
  while (d > Math.PI) d -= 2 * Math.PI
  while (d < -Math.PI) d += 2 * Math.PI
  const e = ext / (s / 2)
  const ccw = d < 0
  a0 += ccw ? e : -e
  a1 += ccw ? -e : e
  g.moveTo(cx + Math.cos(a0) * s / 2, cy + Math.sin(a0) * s / 2)
  g.arc(cx, cy, s / 2, a0, a1, ccw)
}

/** A straight spoke from edge e to the centre of the cell. */
export function spoke(g: CanvasRenderingContext2D, x: number, y: number, s: number, e: number, ext = 0, to = 0): void {
  const [x1, y1] = edgePoint(x, y, s, e, ext)
  g.moveTo(x1, y1)
  g.lineTo(x + EX[e] * to, y + EY[e] * to)
}

/** Links of one group: a single link for two edges, spokes otherwise. */
export function groupPath(g: CanvasRenderingContext2D, p: Placed, gr: Group, s: number, ext = 0): void {
  if (gr.edges.length === 2) {
    link(g, p.x, p.y, s, gr.edges[0], gr.edges[1], ext)
  }
  else {
    for (const e of gr.edges) spoke(g, p.x, p.y, s, e, ext)
  }
}

// ---------------------------------------------------------------------------
// Corner terrains (marching squares with round corners).
// Bits are TL, TR, BR, BL; the canonical cases are rotated clockwise.
// ---------------------------------------------------------------------------

export type Case = 'none' | 'full' | 'single' | 'half' | 'three' | 'diag'

const CANON: Record<Exclude<Case, 'none' | 'full'>, number[]> = {
  single: [1, 0, 0, 0],
  half: [1, 1, 0, 0],
  three: [1, 1, 0, 1],
  diag: [1, 0, 1, 0],
}

export function classify(bits: number[]): { kind: Case, k: number } {
  const n = bits[0] + bits[1] + bits[2] + bits[3]
  if (n === 0)
    return { kind: 'none', k: 0 }
  if (n === 4)
    return { kind: 'full', k: 0 }
  for (const kind of ['single', 'half', 'three', 'diag'] as const) {
    let c = CANON[kind]
    for (let k = 0; k < 4; k++) {
      if (c.every((v, i) => v === bits[i]))
        return { kind, k }
      c = [c[3], c[0], c[1], c[2]]
    }
  }
  return { kind: 'none', k: 0 }
}

/** Local path builder: canonical unit coordinates in [-0.5, 0.5], rotated k quarter turns. */
export class Local {
  constructor(public g: CanvasPath, public x: number, public y: number, public s: number, public k: number) {}
  pt(u: number, v: number): [number, number] {
    for (let i = 0; i < this.k; i++) {
      const t = u
      u = -v
      v = t
    }
    return [this.x + u * this.s, this.y + v * this.s]
  }

  M(u: number, v: number) {
    const [a, b] = this.pt(u, v)
    this.g.moveTo(a, b)
  }

  L(u: number, v: number) {
    const [a, b] = this.pt(u, v)
    this.g.lineTo(a, b)
  }

  A(u: number, v: number, r: number, a0: number, a1: number, ccw: boolean) {
    const [a, b] = this.pt(u, v)
    const q = this.k * Math.PI / 2
    this.g.arc(a, b, r * this.s, a0 + q, a1 + q, ccw)
  }

  /** Point inside test helper: canonical coordinates of a canvas point. */
  local(px: number, py: number): [number, number] {
    let u = (px - this.x) / this.s
    let v = (py - this.y) / this.s
    for (let i = 0; i < this.k; i++) {
      const t = u
      u = v
      v = -t
    }
    return [u, v]
  }
}

const H = 0.5
const PI = Math.PI

/**
 * Adds the inside region of a corner-terrain case to the current path.
 * round: quarter circles (terrain) or square steps (rooms).
 */
export function regionPath(l: Local, kind: Case, joined: boolean, round = true): void {
  if (kind === 'full') {
    l.M(-H, -H)
    l.L(H, -H)
    l.L(H, H)
    l.L(-H, H)
    l.g.closePath()
    return
  }
  if (kind === 'half') {
    l.M(-H, -H)
    l.L(H, -H)
    l.L(H, 0)
    l.L(-H, 0)
    l.g.closePath()
    return
  }
  const single = (sx: number, sy: number) => {
    // quarter disc around the corner (sx, sy)
    l.M(sx * H, sy * H)
    if (round) {
      l.L(0, sy * H)
      const a0 = Math.atan2(0, -sx)
      const a1 = Math.atan2(-sy, 0)
      l.A(sx * H, sy * H, H, a0, a1, sx * sy < 0)
    }
    else {
      l.L(0, sy * H)
      l.L(0, 0)
      l.L(sx * H, 0)
    }
    l.g.closePath()
  }
  if (kind === 'single') {
    single(-1, -1)
    return
  }
  if (kind === 'three') {
    l.M(-H, -H)
    l.L(H, -H)
    l.L(H, 0)
    if (round)
      l.A(H, H, H, -PI / 2, -PI, true)
    else
      l.L(0, 0)
    l.L(0, H)
    l.L(-H, H)
    l.g.closePath()
    return
  }
  // diagonal: TL and BR inside
  if (joined) {
    l.M(-H, -H)
    l.L(0, -H)
    l.A(H, -H, H, PI, PI / 2, true)
    l.L(H, H)
    l.L(0, H)
    l.A(-H, H, H, 0, -PI / 2, true)
    l.g.closePath()
  }
  else {
    single(-1, -1)
    single(1, 1)
  }
}

/**
 * Adds the border of the inside region, pushed by o towards the outside
 * (o < 0.5). Used for coastlines, ripples and walls.
 */
export function borderPath(l: Local, kind: Case, joined: boolean, o = 0, round = true): void {
  const conv = (sx: number, sy: number, r: number) => {
    // arc around corner (sx, sy) from the horizontal edge to the vertical edge
    const a0 = Math.atan2(0, -sx)
    const a1 = Math.atan2(-sy, 0)
    l.M(sx * H - sx * r, sy * H)
    l.A(sx * H, sy * H, r, a0, a1, sx * sy < 0)
  }
  if (kind === 'half') {
    l.M(-H, o)
    l.L(H, o)
    return
  }
  if (kind === 'single') {
    if (round) {
      conv(-1, -1, H + o)
    }
    else {
      l.M(o, -H)
      l.L(o, o)
      l.L(-H, o)
    }
    return
  }
  if (kind === 'three') {
    if (round) {
      conv(1, 1, H - o)
    }
    else {
      l.M(H, o)
      l.L(o, o)
      l.L(o, H)
    }
    return
  }
  if (kind === 'diag') {
    if (joined) {
      conv(1, -1, H - o)
      conv(-1, 1, H - o)
    }
    else {
      conv(-1, -1, H + o)
      conv(1, 1, H + o)
    }
  }
}

/** Is the canonical point (u, v) inside the region of the case? */
export function inside(kind: Case, joined: boolean, u: number, v: number): boolean {
  const d = (cx: number, cy: number) => Math.hypot(u - cx, v - cy)
  switch (kind) {
    case 'full': return true
    case 'none': return false
    case 'half': return v < 0
    case 'single': return d(-H, -H) < H
    case 'three': return d(H, H) > H
    case 'diag': return joined ? d(H, -H) > H && d(-H, H) > H : d(-H, -H) < H || d(H, H) < H
  }
}

// ---------------------------------------------------------------------------
// Strands: groups joined across cells through their shared edges.
// ---------------------------------------------------------------------------

export interface Strands {
  /** Strand id of each group: comp[cell][group]. */
  comp: number[][]
  /**
   * A key per strand that is the same for a strand and its mirror image (it
   * folds the grid onto its top-left quarter), so mirrored pieces get mirrored
   * colours.
   */
  key: number[]
}

export function strands(G: Grid): Strands {
  const { cols, rows, cells } = G
  const parent: number[] = []
  const comp: number[][] = cells.map(p => p.groups.map(() => parent.push(parent.length) - 1))
  const find = (a: number): number => {
    while (parent[a] !== a) {
      parent[a] = parent[parent[a]]
      a = parent[a]
    }
    return a
  }
  const groupAt = (c: number, e: number) => cells[c].groups.findIndex(gr => gr.edges.includes(e))
  for (let c = 0; c < cells.length; c++) {
    const p = cells[c]
    p.groups.forEach((gr, k) => {
      for (const e of gr.edges) {
        if (e !== 1 && e !== 2)
          continue
        const i = p.i + (e === 1 ? 1 : 0)
        const j = p.j + (e === 2 ? 1 : 0)
        if (i >= cols || j >= rows)
          continue
        const q = j * cols + i
        const k2 = groupAt(q, (e + 2) % 4)
        if (k2 >= 0)
          parent[find(comp[c][k])] = find(comp[q][k2])
      }
    })
  }
  const key: number[] = Array.from({ length: parent.length }).fill(Infinity) as number[]
  for (let c = 0; c < cells.length; c++) {
    const p = cells[c]
    const fx = p.i >= cols / 2
    const fy = p.j >= rows / 2
    const fi = fx ? cols - 1 - p.i : p.i
    const fj = fy ? rows - 1 - p.j : p.j
    p.groups.forEach((gr, k) => {
      let e = 4
      for (let x of gr.edges) {
        if (fx && x % 2 === 1)
          x = 4 - x
        if (fy && x % 2 === 0)
          x = 2 - x
        e = Math.min(e, x)
      }
      const r = find(comp[c][k])
      key[r] = Math.min(key[r], (fj * cols + fi) * 5 + e)
    })
  }
  return { comp: comp.map(gs => gs.map(find)), key }
}

/** Edge of a cell rectangle, for clipping. */
export function cellRect(g: CanvasRenderingContext2D, p: Placed, s: number): void {
  g.beginPath()
  g.rect(p.x - s / 2, p.y - s / 2, s, s)
}
