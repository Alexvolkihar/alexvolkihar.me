// Winged multi-scale Truchet tiles, after Christopher Carlson, "Multi-Scale
// Truchet Patterns" (Bridges 2018), itself a generalisation of the tile that
// Cyril Stanley Smith derived from Sébastien Truchet's (Smith & Boucher,
// Leonardo 20(4), 1987).
//
// A tile of side s has two colours, a background and a foreground. On every
// side the middle third is foreground and the two outer thirds background,
// so any motif that joins those middle thirds fits any neighbour. The tile
// also carries "wings" that overflow its square: a background disc of radius
// s/3 on each corner and a foreground disc of radius s/6 on each side's
// midpoint. Tiles of half the size invert both colours and are drawn on top:
// their corner wings (radius s/6, in the parent's foreground) then fall
// exactly on the parent's midpoint wings, and the domains of every scale
// merge into one continuous two-colour pattern.
//
// Same-scale tiles never disagree where their wings overlap (a shared corner
// or midpoint carries the same disc for both), so each scale is drawn as four
// batched fills: background squares, foreground motifs, background corner
// wings, foreground midpoint wings. That is exactly what tile-by-tile drawing
// would give, without seams and in a handful of fill calls.

/** The fifteen motifs of Carlson's paper (Figure 7), by his ASCII names. */
export type MotifName
  = | '\\' | '/' | '-' | '|' | '+.' | 'x.' | '+'
    | 'fne' | 'fsw' | 'fnw' | 'fse'
    | 'tn' | 'ts' | 'te' | 'tw'

// Corners, clockwise from the top left (canvas y points down).
const NW = 0
const NE = 1
const SE = 2
const SW = 3

type Part
  = | { kind: 'arc', corner: number } // quarter annulus s/3..2s/3 around a corner
    | { kind: 'bar', dir: 'h' | 'v' } // straight band through the middle third
    | { kind: 'block', side: 'n' | 's' | 'e' | 'w' } // two thirds of the square, against one side
    | { kind: 'full' }

export const MOTIFS: Record<MotifName, readonly Part[]> = {
  // Smith's tile: two arcs joining the midpoints of adjacent sides
  '\\': [{ kind: 'arc', corner: NE }, { kind: 'arc', corner: SW }],
  '/': [{ kind: 'arc', corner: NW }, { kind: 'arc', corner: SE }],
  // straight bands; the free sides keep only their midpoint dot
  '-': [{ kind: 'bar', dir: 'h' }],
  '|': [{ kind: 'bar', dir: 'v' }],
  '+': [{ kind: 'bar', dir: 'h' }, { kind: 'bar', dir: 'v' }],
  // dots only, and the full square notched by the corner wings
  '+.': [],
  'x.': [{ kind: 'full' }],
  // "frowns": a single arc, the two other sides end in dots
  'fne': [{ kind: 'arc', corner: NE }],
  'fsw': [{ kind: 'arc', corner: SW }],
  'fnw': [{ kind: 'arc', corner: NW }],
  'fse': [{ kind: 'arc', corner: SE }],
  // T junctions: a solid two-thirds block, notched by the corner wings
  'tn': [{ kind: 'block', side: 'n' }],
  'ts': [{ kind: 'block', side: 's' }],
  'te': [{ kind: 'block', side: 'e' }],
  'tw': [{ kind: 'block', side: 'w' }],
}

export interface Tile {
  x: number
  y: number
  s: number
  /** Integer cell coordinates at this scale, used to draw shared wings once. */
  ix: number
  iy: number
  motif: MotifName
}

const TAU = Math.PI * 2
const QUARTER = Math.PI / 2

function addPart(g: CanvasRenderingContext2D, t: Tile, p: Part) {
  const { x, y, s } = t
  const third = s / 3
  if (p.kind === 'full') {
    g.rect(x, y, s, s)
  }
  else if (p.kind === 'bar') {
    if (p.dir === 'h')
      g.rect(x, y + third, s, third)
    else
      g.rect(x + third, y, third, s)
  }
  else if (p.kind === 'block') {
    if (p.side === 'n')
      g.rect(x, y, s, 2 * third)
    else if (p.side === 's')
      g.rect(x, y + third, s, 2 * third)
    else if (p.side === 'w')
      g.rect(x, y, 2 * third, s)
    else
      g.rect(x + third, y, 2 * third, s)
  }
  else {
    // quarter annulus, outer arc clockwise then inner arc back: one simple
    // clockwise contour, so the nonzero union with the others stays solid
    const c = p.corner
    const cx = c === NE || c === SE ? x + s : x
    const cy = c === SE || c === SW ? y + s : y
    const a0 = c * QUARTER
    const a1 = a0 + QUARTER
    g.moveTo(cx + Math.cos(a0) * 2 * third, cy + Math.sin(a0) * 2 * third)
    g.arc(cx, cy, 2 * third, a0, a1, false)
    g.arc(cx, cy, third, a1, a0, true)
    g.closePath()
  }
}

function addDisc(g: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  g.moveTo(cx + r, cy)
  g.arc(cx, cy, r, 0, TAU, false)
}

/**
 * Draws one scale of tiles. `bg` and `fg` are that scale's colours; the next
 * finer scale must be drawn afterwards with the two swapped (or, for a
 * colour ladder, with `bg` set to this `fg`).
 */
export function drawScale(g: CanvasRenderingContext2D, tiles: readonly Tile[], bg: string, fg: string) {
  if (!tiles.length)
    return
  // 1. background squares
  g.beginPath()
  for (const t of tiles)
    g.rect(t.x, t.y, t.s, t.s)
  g.fillStyle = bg
  g.fill()
  // 2. foreground motifs
  g.beginPath()
  for (const t of tiles) {
    for (const p of MOTIFS[t.motif])
      addPart(g, t, p)
  }
  g.fillStyle = fg
  g.fill()
  // 3. background corner wings, radius s/3. Neighbours share corners and
  // midpoints: each disc is added once (lattice keys in half-cell units).
  const seen = new Set<number>()
  const once = (a: number, b: number) => {
    const k = (a + 65536) * 262144 + (b + 65536)
    if (seen.has(k))
      return false
    seen.add(k)
    return true
  }
  g.beginPath()
  for (const t of tiles) {
    const r = t.s / 3
    for (let c = 0; c < 4; c++) {
      const dx = c === 1 || c === 2 ? 1 : 0
      const dy = c >= 2 ? 1 : 0
      if (once(2 * (t.ix + dx), 2 * (t.iy + dy)))
        addDisc(g, t.x + dx * t.s, t.y + dy * t.s, r)
    }
  }
  g.fillStyle = bg
  g.fill()
  // 4. foreground midpoint wings, radius s/6
  g.beginPath()
  for (const t of tiles) {
    const r = t.s / 6
    const h = t.s / 2
    if (once(2 * t.ix + 1, 2 * t.iy))
      addDisc(g, t.x + h, t.y, r)
    if (once(2 * t.ix + 2, 2 * t.iy + 1))
      addDisc(g, t.x + t.s, t.y + h, r)
    if (once(2 * t.ix + 1, 2 * t.iy + 2))
      addDisc(g, t.x + h, t.y + t.s, r)
    if (once(2 * t.ix, 2 * t.iy + 1))
      addDisc(g, t.x, t.y + h, r)
  }
  g.fillStyle = fg
  g.fill()
}
