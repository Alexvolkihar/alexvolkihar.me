// Wave Function Collapse, simple tiled model (Maxim Gumin, 2016), on a
// rectangular grid of square cells.
//
// A tile is described by its four corners (a terrain level each: TL, TR, BR,
// BL) and by one feature on each of its four edges (N, E, S, W): a river, a
// corridor, a pipe... Two tiles may sit side by side when the two corners and
// the feature of their shared edge agree. Corner terrains give coherent
// regions with smooth borders (the classic "corner Wang tile" sets), edge
// features give networks that never break.
//
// Solver: every cell starts as the set of all tiles allowed there. The cell of
// lowest Shannon entropy (ties broken by a fixed positional noise) is
// collapsed to one tile drawn by weight, and the choice is propagated to the
// neighbours with bitset arc consistency. On a contradiction (an empty cell)
// the choices in a small block around it are forgotten and the grid is
// re-propagated from the choices that are left, an idea taken from Paul
// Merrell's model synthesis ("modifying in blocks"). Everything is driven by
// one seeded generator, so the result is a pure function of the hash.

import type { Rng } from '../random'

export interface Group {
  /** Edges (0 N, 1 E, 2 S, 3 W) joined inside the tile. */
  edges: number[]
  kind: string
}

export interface BaseTile {
  name: string
  corners: readonly [number, number, number, number]
  feats: readonly [number, number, number, number]
  groups?: readonly { edges: readonly number[], kind: string }[]
  /** Total weight of the class, shared between its distinct orientations. */
  weight: number
  /** Generate the rotated and mirrored images (default true). */
  turn?: boolean
}

export interface Tile {
  id: number
  name: string
  corners: number[]
  feats: number[]
  groups: Group[]
  weight: number
  /** Adjacency key of each edge, N E S W. */
  keys: number[]
}

/** newCorners[i] = corners[src[i]], new edge index of edge e = map[e]. */
interface Transform { src: readonly number[], map: readonly number[] }

export const ROT: Transform = { src: [3, 0, 1, 2], map: [1, 2, 3, 0] }
export const FLIP_X: Transform = { src: [1, 0, 3, 2], map: [0, 3, 2, 1] }
export const FLIP_Y: Transform = { src: [3, 2, 1, 0], map: [2, 1, 0, 3] }

export interface Shape {
  corners: number[]
  feats: number[]
  groups: Group[]
}

export function transform(s: Shape, t: Transform): Shape {
  const feats = [0, 0, 0, 0]
  for (let e = 0; e < 4; e++)
    feats[t.map[e]] = s.feats[e]
  return {
    corners: t.src.map(i => s.corners[i]),
    feats,
    groups: s.groups.map(g => ({ edges: g.edges.map(e => t.map[e]), kind: g.kind })),
  }
}

function edgeKeys(s: Shape): number[] {
  const [tl, tr, br, bl] = s.corners
  const [n, e, so, w] = s.feats
  return [
    (tl * 16 + tr) * 16 + n,
    (tr * 16 + br) * 16 + e,
    (bl * 16 + br) * 16 + so,
    (tl * 16 + bl) * 16 + w,
  ]
}

function signature(name: string, s: Shape): string {
  const g = s.groups.map(x => `${x.kind}:${[...x.edges].sort().join('')}`).sort().join('|')
  return `${name}/${s.corners.join('')}/${s.feats.join('')}/${g}`
}

/** All distinct rotations and reflections of every base tile. */
export function expand(bases: readonly BaseTile[]): Tile[] {
  const tiles: Tile[] = []
  for (const b of bases) {
    const seen = new Set<string>()
    const images: Shape[] = []
    let s: Shape = {
      corners: [...b.corners],
      feats: [...b.feats],
      groups: (b.groups ?? []).map(g => ({ edges: [...g.edges], kind: g.kind })),
    }
    const turns = b.turn === false ? 1 : 4
    for (let flip = 0; flip < (b.turn === false ? 1 : 2); flip++) {
      for (let k = 0; k < turns; k++) {
        const sig = signature(b.name, s)
        if (!seen.has(sig)) {
          seen.add(sig)
          images.push(s)
        }
        s = transform(s, ROT)
      }
      s = transform(s, FLIP_X)
    }
    for (const im of images) {
      tiles.push({
        id: tiles.length,
        name: b.name,
        ...im,
        weight: b.weight / images.length,
        keys: edgeKeys(im),
      })
    }
  }
  return tiles
}

const DX = [0, 1, 0, -1]
const DY = [-1, 0, 1, 0]

export interface TileSet {
  tiles: Tile[]
  n: number
  words: number
  /** compat[d][t * words ..] = tiles allowed in the neighbour of t in direction d. */
  compat: Uint32Array[]
}

export function buildSet(tiles: Tile[]): TileSet {
  const n = tiles.length
  const words = (n + 31) >> 5
  const compat = [0, 1, 2, 3].map(() => new Uint32Array(n * words))
  for (let d = 0; d < 4; d++) {
    const od = (d + 2) % 4
    for (const t of tiles) {
      for (const u of tiles) {
        if (t.keys[d] === u.keys[od])
          compat[d][t.id * words + (u.id >> 5)] |= 1 << (u.id & 31)
      }
    }
  }
  return { tiles, n, words, compat }
}

function popcount(x: number): number {
  x -= (x >>> 1) & 0x55555555
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333)
  return (((x + (x >>> 4)) & 0x0F0F0F0F) * 0x01010101) >>> 24
}

export interface Problem {
  set: TileSet
  cols: number
  rows: number
  /** Initial domain of every cell (cells * words), e.g. a closed border. */
  base: Uint32Array
  /** Base weight of each tile. */
  weight: Float64Array
  /** Optional per-cell multipliers by tile class: mult[cell * classes + cls[t]]. */
  mult?: Float64Array
  cls?: Uint8Array | Uint16Array
  classes?: number
  /** Cells solved first (the central square), so wider canvases keep it. */
  priority?: Uint8Array
  /**
   * Added to the entropy when choosing the next cell: a tiny positional
   * noise breaks the ties, and an optional bias orders the work (the
   * landscape settles its high ground first and lets it run down to the sea).
   */
  order: Float64Array
}

export interface Solution {
  grid: Int32Array
  fails: number
}

export function solve(p: Problem, rng: Rng): Solution {
  const { set, cols, rows, base, weight, mult, cls, priority, order } = p
  const { n, words, compat } = set
  const classes = p.classes ?? 1
  const cells = cols * rows
  const dom = new Uint32Array(cells * words)
  const count = new Int32Array(cells)
  const ent = new Float64Array(cells)
  const dirty = new Uint8Array(cells)
  const chosen = new Int32Array(cells).fill(-1)
  const inStack = new Uint8Array(cells)
  const stack = new Int32Array(cells * 4 + 8)
  const tmp = new Uint32Array(words)
  const logW = new Float64Array(n)
  for (let t = 0; t < n; t++)
    logW[t] = Math.log(Math.max(weight[t], 1e-12))
  const logM = mult ? mult.map(m => Math.log(Math.max(m, 1e-12))) : null

  // What a cell that still allows every tile allows next to it.
  const anyAllowed = [0, 1, 2, 3].map((d) => {
    const a = new Uint32Array(words)
    for (let t = 0; t < n; t++) {
      for (let j = 0; j < words; j++)
        a[j] |= compat[d][t * words + j]
    }
    return a
  })

  const w = (c: number, t: number) => mult ? weight[t] * mult[c * classes + cls![t]] : weight[t]

  function recount(c: number) {
    let k = 0
    for (let i = 0; i < words; i++)
      k += popcount(dom[c * words + i])
    count[c] = k
    dirty[c] = 1
  }

  function entropy(c: number): number {
    let sw = 0
    let swl = 0
    const o = c * words
    for (let i = 0; i < words; i++) {
      let bits = dom[o + i]
      while (bits) {
        const low = bits & -bits
        const t = (i << 5) + 31 - Math.clz32(low)
        bits ^= low
        const wt = w(c, t)
        sw += wt
        swl += wt * (logM ? logW[t] + logM[c * classes + cls![t]] : logW[t])
      }
    }
    return sw > 0 ? Math.log(sw) - swl / sw : 0
  }

  /** Arc consistency from the stacked cells. Returns a contradicting cell or -1. */
  function propagate(sp: number): number {
    while (sp > 0) {
      const c = stack[--sp]
      inStack[c] = 0
      const cx = c % cols
      const cy = (c / cols) | 0
      const full = count[c] === n
      for (let d = 0; d < 4; d++) {
        const x = cx + DX[d]
        const y = cy + DY[d]
        if (x < 0 || y < 0 || x >= cols || y >= rows)
          continue
        const nb = y * cols + x
        const o = c * words
        const cd = compat[d]
        if (full) {
          tmp.set(anyAllowed[d])
        }
        else {
          tmp.fill(0)
          for (let i = 0; i < words; i++) {
            let bits = dom[o + i]
            while (bits) {
              const low = bits & -bits
              const t = (i << 5) + 31 - Math.clz32(low)
              bits ^= low
              const to = t * words
              for (let j = 0; j < words; j++)
                tmp[j] |= cd[to + j]
            }
          }
        }
        const no = nb * words
        let changed = false
        for (let j = 0; j < words; j++) {
          const v = (dom[no + j] & tmp[j]) >>> 0
          if (v !== dom[no + j]) {
            dom[no + j] = v
            changed = true
          }
        }
        if (changed) {
          recount(nb)
          if (count[nb] === 0)
            return nb
          if (!inStack[nb]) {
            inStack[nb] = 1
            stack[sp++] = nb
          }
        }
      }
    }
    return -1
  }

  /** Domains from scratch: base masks, then every remembered choice. */
  function rebuild(): number {
    dom.set(base)
    inStack.fill(0)
    let sp = 0
    for (let c = 0; c < cells; c++) {
      if (chosen[c] >= 0) {
        const o = c * words
        for (let j = 0; j < words; j++)
          dom[o + j] = 0
        dom[o + (chosen[c] >> 5)] = 1 << (chosen[c] & 31)
      }
    }
    for (let c = 0; c < cells; c++) {
      recount(c)
      if (count[c] === 0)
        return c
    }
    // Propagate from every cell whose domain is narrower than the full set.
    for (let c = 0; c < cells; c++) {
      if (count[c] < n) {
        inStack[c] = 1
        stack[sp++] = c
      }
    }
    return propagate(sp)
  }

  let fails = 0
  let bad = rebuild()
  let phase = priority ? 1 : 0
  let last = -1
  const maxSteps = cells * 30 + 1000
  for (let step = 0; step < maxSteps; step++) {
    if (bad >= 0) {
      fails++
      if (fails > 240)
        break
      // Forget the choices in a block around the contradiction (growing with
      // repeated failures), and the last choice, which caused it.
      const r = Math.min(1 + Math.floor(fails / 6), 8)
      const bx = bad % cols
      const by = (bad / cols) | 0
      for (let y = Math.max(0, by - r); y <= Math.min(rows - 1, by + r); y++) {
        for (let x = Math.max(0, bx - r); x <= Math.min(cols - 1, bx + r); x++)
          chosen[y * cols + x] = -1
      }
      if (last >= 0)
        chosen[last] = -1
      last = -1
      bad = rebuild()
      if (bad >= 0) {
        // Should not happen (a subset of consistent choices); start over.
        chosen.fill(-1)
        bad = rebuild()
      }
      continue
    }
    // Lowest entropy cell, central square first.
    let best = -1
    let bestE = Infinity
    for (let c = 0; c < cells; c++) {
      if (count[c] <= 1 || (phase && !priority![c]))
        continue
      if (dirty[c]) {
        ent[c] = entropy(c)
        dirty[c] = 0
      }
      const e = ent[c] + order[c]
      if (e < bestE) {
        bestE = e
        best = c
      }
    }
    if (best < 0) {
      if (phase) {
        phase = 0
        continue
      }
      break
    }
    // Collapse by weight.
    const o = best * words
    let total = 0
    for (let i = 0; i < words; i++) {
      let bits = dom[o + i]
      while (bits) {
        const low = bits & -bits
        bits ^= low
        total += w(best, (i << 5) + 31 - Math.clz32(low))
      }
    }
    let x = rng() * total
    let pickT = -1
    for (let i = 0; i < words && x >= 0; i++) {
      let bits = dom[o + i]
      while (bits && x >= 0) {
        const low = bits & -bits
        bits ^= low
        pickT = (i << 5) + 31 - Math.clz32(low)
        x -= w(best, pickT)
      }
    }
    for (let j = 0; j < words; j++)
      dom[o + j] = 0
    dom[o + (pickT >> 5)] = 1 << (pickT & 31)
    count[best] = 1
    chosen[best] = pickT
    last = best
    inStack[best] = 1
    stack[0] = best
    bad = propagate(1)
  }

  // Read the result. A cell left undecided (only after too many failures)
  // takes its heaviest remaining tile, or its heaviest base tile.
  const grid = new Int32Array(cells)
  for (let c = 0; c < cells; c++) {
    const o = c * words
    let best = -1
    let bw = -1
    for (const src of [dom, base]) {
      for (let i = 0; i < words; i++) {
        let bits = src[o + i]
        while (bits) {
          const low = bits & -bits
          bits ^= low
          const t = (i << 5) + 31 - Math.clz32(low)
          if (w(c, t) > bw) {
            bw = w(c, t)
            best = t
          }
        }
      }
      if (best >= 0)
        break
    }
    grid[c] = Math.max(0, best)
  }
  return { grid, fails }
}
