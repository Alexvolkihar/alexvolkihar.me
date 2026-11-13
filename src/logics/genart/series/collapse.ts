// "Collapse" — little worlds and ornamental carpets solved by Wave Function
// Collapse (Maxim Gumin's simple tiled model, 2016, after Paul Merrell's model
// synthesis).
//
// Each world is a small hand-made tileset with adjacency rules: a top-down
// landscape (corner terrains from deep sea to forest, rivers and roads as edge
// features), a dungeon (rooms, corridors and doors), a pipework plant (thin
// and thick pipes, valves, tanks, crossings) and a knotwork carpet (ribbons
// and cords that loop, cross over and under, and meet in medallions). The grid
// is solved cell by cell, lowest entropy first, with propagation and local
// repair on contradiction (../collapse/wfc.ts), then every tile is drawn as
// vector shapes, so the piece is crisp at any size.
//
// Everything is a pure function of the hash. The grid has a fixed number of
// cells across the short side; a wider or taller canvas gets more cells
// around the same central square, which is solved first so that it stays the
// same. Mirror and kaleidoscope pieces solve a half or a quarter of the grid
// and reflect it: the reflected tiles still fit, because a reflection keeps
// the shared corners and features of every edge. A mirrored relief would only
// give an ink blot, so a symmetric landscape follows a designed plan instead
// (../collapse/plan.ts): a parterre crossed by canals, a citadel in its moat,
// or a grand canal running down to the sea.

import type { Grid, Palette, Placed } from '../collapse/geom'
import type { BaseTile, Tile, TileSet } from '../collapse/wfc'
import type { Series } from '../types'
import { drawDungeon, dungeonBases } from '../collapse/dungeon'
import { phash, valueNoise } from '../collapse/geom'
import { drawKnotwork, knotBases } from '../collapse/knotwork'
import { drawLandscape, landscapeBases, landscapeGuide } from '../collapse/landscape'
import { drawPipes, pipeBases } from '../collapse/pipes'
import { landscapePlan, legalize } from '../collapse/plan'
import { buildSet, expand, FLIP_X, FLIP_Y, solve, transform } from '../collapse/wfc'
import { stream, weighted } from '../random'

// ---------------------------------------------------------------------------
// Rarity table — decided before the drawing code, never reordered.
// Changing a weight or an order re-rolls the whole edition.
// ---------------------------------------------------------------------------

const TRAITS = {
  World: [['Landscape', 34], ['Knotwork', 24], ['Dungeon', 22], ['Pipes', 20]],
  Palette: [['Atlas', 26], ['Verdigris', 20], ['Ochre', 20], ['Nocturne', 18], ['Indigo', 16]],
  Grid: [['Coarse', 25], ['Medium', 50], ['Fine', 25]],
  Density: [['Sparse', 30], ['Balanced', 45], ['Dense', 25]],
  Symmetry: [['Free', 55], ['Mirror', 30], ['Kaleidoscope', 15]],
} as const satisfies Record<string, ReadonlyArray<readonly [string, number]>>

type TraitName = keyof typeof TRAITS
type Features = { [K in TraitName]: typeof TRAITS[K][number][0] }

/** Pure function of the hash, computed before (and without) any rendering. */
function features(hash: string): Features {
  const r = stream(hash, 'features')
  return {
    World: weighted(r, TRAITS.World),
    Palette: weighted(r, TRAITS.Palette),
    Grid: weighted(r, TRAITS.Grid),
    Density: weighted(r, TRAITS.Density),
    Symmetry: weighted(r, TRAITS.Symmetry),
  }
}

// ---------------------------------------------------------------------------
// Palettes: original colour sets, each with roles for every world.
// ---------------------------------------------------------------------------

const PAL: Record<Features['Palette'], Palette> = {
  Atlas: { bg: '#e8dcc2', paper: '#f2e9d3', ink: '#2b2620', deep: '#3b6782', shallow: '#86adbb', sand: '#e8d6a6', grass: '#aebf7f', forest: '#5a7f4a', a1: '#b5472f', a2: '#d6a547', dark: false },
  Verdigris: { bg: '#dfe4da', paper: '#eef0e6', ink: '#1d2b2a', deep: '#22545a', shallow: '#5f9890', sand: '#e9ddbf', grass: '#a3b98f', forest: '#406a52', a1: '#c46a3a', a2: '#e2b54c', dark: false },
  Ochre: { bg: '#ead9bb', paper: '#f5ead5', ink: '#3a2418', deep: '#2f4d66', shallow: '#6e98a6', sand: '#efd6a2', grass: '#c9a95e', forest: '#7d5e30', a1: '#a8432a', a2: '#2e6a64', dark: false },
  Nocturne: { bg: '#0e131d', paper: '#18202e', ink: '#e8dcc0', deep: '#0c1a33', shallow: '#21406a', sand: '#b9a372', grass: '#3d5d4b', forest: '#21392d', a1: '#e2a64a', a2: '#7fb3c8', dark: true },
  Indigo: { bg: '#121f42', paper: '#192b57', ink: '#e9eef7', deep: '#0d1835', shallow: '#26467f', sand: '#e2d8bc', grass: '#a9bab1', forest: '#4b6c72', a1: '#f2c14e', a2: '#e8775a', dark: true },
}

// ---------------------------------------------------------------------------
// Worlds.
// ---------------------------------------------------------------------------

interface World {
  bases: (density: Features['Density']) => BaseTile[]
  /** The grid border is closed: no feature crosses it. */
  closed: boolean
  /** Rug layout: the grid sits inside a margin and a border. */
  rug: boolean
  draw: (g: CanvasRenderingContext2D, G: Grid, pal: Palette, seed: number) => void
}

const WORLDS: Record<Features['World'], World> = {
  Landscape: { bases: landscapeBases, closed: false, rug: false, draw: drawLandscape },
  Knotwork: { bases: knotBases, closed: true, rug: true, draw: drawKnotwork },
  Dungeon: { bases: dungeonBases, closed: true, rug: false, draw: drawDungeon },
  Pipes: { bases: pipeBases, closed: true, rug: false, draw: drawPipes },
}

const CELLS: Record<Features['Grid'], number> = { Coarse: 10, Medium: 16, Fine: 24 }

const setCache = new Map<string, TileSet>()
function tileSet(world: Features['World'], density: Features['Density']): TileSet {
  const key = `${world}/${density}`
  let set = setCache.get(key)
  if (!set) {
    set = buildSet(expand(WORLDS[world].bases(density)))
    setCache.set(key, set)
  }
  return set
}

/** Solves the grid of a hash for a W x H canvas. Pure function of its inputs. */
function build(hash: string, W: number, H: number) {
  const f = features(hash)
  const world = WORLDS[f.World]
  const S = Math.min(W, H)
  const N = CELLS[f.Grid]

  // Fixed stream order: layout seeds, then the solver.
  const lay = stream(hash, 'layout')
  const noiseSeed = Math.floor(lay() * 4294967296) | 0
  const guideSeed = Math.floor(lay() * 4294967296) | 0
  const decorSeed = Math.floor(lay() * 4294967296) | 0
  const rng = stream(hash, 'solve')

  // Grid geometry. N cells across the short side (inside the rug border for
  // the knotwork); even counts, so the mirror axes fall between cells.
  let s: number
  let cols: number
  let rows: number
  if (world.rug) {
    const inset = 0.13 * S
    s = (S - 2 * inset) / N
    cols = 2 * Math.floor((W - 2 * inset) / s / 2 + 1e-6)
    rows = 2 * Math.floor((H - 2 * inset) / s / 2 + 1e-6)
  }
  else {
    s = S / N
    cols = N + 2 * Math.ceil((W / s - N) / 2 - 1e-6)
    rows = N + 2 * Math.ceil((H / s - N) / 2 - 1e-6)
  }
  const x0 = W / 2 - cols * s / 2
  const y0 = H / 2 - rows * s / 2

  // Solved region: the whole grid, its left half or its top-left quarter.
  const rc = f.Symmetry === 'Free' ? cols : cols / 2
  const rr = f.Symmetry === 'Kaleidoscope' ? rows / 2 : rows
  const set = tileSet(f.World, f.Density)
  const { tiles, n, words } = set
  const cells = rc * rr
  const base = new Uint32Array(cells * words)
  const order = new Float64Array(cells)
  const priority = new Uint8Array(cells)
  for (let j = 0; j < rr; j++) {
    for (let i = 0; i < rc; i++) {
      const c = j * rc + i
      for (const t of tiles) {
        if (world.closed && ((i === 0 && t.keys[3]) || (j === 0 && t.keys[0]) || (rc === cols && i === cols - 1 && t.keys[1]) || (rr === rows && j === rows - 1 && t.keys[2])))
          continue
        base[c * words + (t.id >> 5)] |= 1 << (t.id & 31)
      }
      const gi = i - cols / 2
      const gj = j - rows / 2
      order[c] = phash(noiseSeed, gi, gj) * 1e-3
      priority[c] = Math.abs((gi + 0.5) * s) < S / 2 && Math.abs((gj + 0.5) * s) < S / 2 ? 1 : 0
    }
  }
  const weight = new Float64Array(n)
  for (const t of tiles)
    weight[t.id] = t.weight

  // Landscape guide: favour the tiles whose corners lie close to a seeded
  // relief sampled at those corners. The local rules still decide the
  // coasts, beaches, rivers and roads; the relief only shapes the continents.
  let mult: Float64Array | undefined
  let cls: Uint16Array | undefined
  if (f.World === 'Landscape') {
    // A symmetric landscape follows a designed plan (../collapse/plan.ts);
    // a free one follows a seeded relief.
    const plan = f.Symmetry === 'Free' ? undefined : landscapePlan(f.Symmetry, N / 2, stream(hash, 'plan'))
    const guide = landscapeGuide(f.Density, guideSeed, valueNoise(guideSeed))
    const lattice = new Float64Array((rc + 1) * (rr + 1))
    for (let j = 0; j <= rr; j++) {
      for (let i = 0; i <= rc; i++) {
        const v = plan ? plan.level(i - cols / 2, j - rows / 2) : guide((i - cols / 2) * s / S, (j - rows / 2) * s / S)
        lattice[j * (rc + 1) + i] = Math.max(-0.5, Math.min(4.3, v))
      }
    }
    if (plan)
      legalize(lattice, rc + 1, rr + 1)
    const sigma = plan ? plan.sigma : 0.8
    mult = new Float64Array(cells * n)
    cls = new Uint16Array(n).map((_, t) => t)
    const at = [[0, 0], [1, 0], [1, 1], [0, 1]]
    for (let j = 0; j < rr; j++) {
      for (let i = 0; i < rc; i++) {
        const c = j * rc + i
        const d = at.map(([a, b]) => lattice[(j + b) * (rc + 1) + i + a])
        order[c] -= 0.05 * (d[0] + d[1] + d[2] + d[3])
        for (const t of tiles) {
          let dev = 0
          for (let k = 0; k < 4; k++)
            dev += (t.corners[k] - d[k]) ** 2
          const fw = plan && t.groups.length ? plan.feature(i - cols / 2 + 0.5, j - rows / 2 + 0.5, t) : 1
          mult[c * n + t.id] = fw * Math.exp(-dev / (2 * sigma * sigma)) + 1e-6
        }
      }
    }
  }

  const { grid } = solve({ set, cols: rc, rows: rr, base, weight, mult, cls, classes: n, priority: world.rug ? undefined : priority, order }, rng)

  // Lay the full grid, reflecting the solved region.
  const placed: Placed[] = []
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const fx = i >= rc
      const fy = j >= rr
      const tile: Tile = tiles[grid[(fy ? rows - 1 - j : j) * rc + (fx ? cols - 1 - i : i)]]
      let shape = { corners: tile.corners, feats: tile.feats, groups: tile.groups }
      if (fx)
        shape = transform(shape, FLIP_X)
      if (fy)
        shape = transform(shape, FLIP_Y)
      placed.push({ i, j, x: x0 + (i + 0.5) * s, y: y0 + (j + 0.5) * s, tile, ...shape })
    }
  }

  const G: Grid = { cols, rows, s, x0, y0, cells: placed, S, W, H, mirror: [rc < cols, rr < rows] }
  return { f, world, G, decorSeed }
}

/**
 * Two measures of the solved grid of a square canvas, used to pick the
 * gallery. dominant: share of the grid taken by its most common class of
 * tile; in the landscapes and dungeons a plain tile is classed by its rounded
 * mean terrain (open sea, beach, grass, forest; rock or room), elsewhere by
 * its name (an empty plate, an empty field). features: share of the cells
 * that carry an edge feature (river, road, corridor, pipe, strand).
 */
export function gridStats(hash: string): { dominant: number, features: number } {
  const { f, G } = build(hash, 600, 600)
  const terrain = f.World === 'Landscape' || f.World === 'Dungeon'
  const count = new Map<string, number>()
  let best = 0
  let feat = 0
  for (const p of G.cells) {
    if (p.groups.length)
      feat++
    const key = terrain && p.groups.length === 0
      ? `level${Math.round((p.corners[0] + p.corners[1] + p.corners[2] + p.corners[3]) / 4)}`
      : p.tile.name
    const k = (count.get(key) ?? 0) + 1
    count.set(key, k)
    best = Math.max(best, k)
  }
  return { dominant: best / G.cells.length, features: feat / G.cells.length }
}

function render(ctx: CanvasRenderingContext2D, W: number, H: number, hash: string): void {
  const { f, world, G, decorSeed } = build(hash, W, H)
  const pal = PAL[f.Palette]
  const S = Math.min(W, H)
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalAlpha = 1
  if (world.rug) {
    ctx.fillStyle = pal.bg
    ctx.fillRect(0, 0, W, H)
    world.draw(ctx, G, pal, decorSeed)
  }
  else {
    // Maps, plans and plates: drawn inside a neatline, on a paper margin.
    const m = 0.035 * S
    ctx.fillStyle = pal.paper
    ctx.fillRect(0, 0, W, H)
    ctx.save()
    ctx.beginPath()
    ctx.rect(m, m, W - 2 * m, H - 2 * m)
    ctx.clip()
    world.draw(ctx, G, pal, decorSeed)
    ctx.restore()
    ctx.strokeStyle = pal.ink
    ctx.lineWidth = 0.003 * S
    ctx.strokeRect(m, m, W - 2 * m, H - 2 * m)
    ctx.lineWidth = 0.0012 * S
    const m2 = m - 0.008 * S
    ctx.strokeRect(m2, m2, W - 2 * m2, H - 2 * m2)
  }
  ctx.restore()
}

export default {
  slug: 'collapse',
  title: 'Collapse',
  summary: 'Little worlds and ornamental carpets solved by Wave Function Collapse from hand-made tiles and adjacency rules: coasts and rivers, dungeons, pipework and knotwork.',
  order: 570,
  traits: TRAITS,
  features,
  render,
  // Seed-of-seeds 0xc011a95e ("gallery" stream): the first hash found for
  // each world x palette pair, at most three per world, until twelve are
  // found. Candidates are skipped when they are Coarse + Sparse, when their
  // solved grid is more than half one class of tile, or when edge features
  // cover fewer than 3 % of the cells (gridStats). The cover, the first
  // landscape in Atlas, is then moved first. The picks were made before the
  // symmetric landscapes got their plans and the sparse dungeons and pipes
  // were filled out; the hashes were kept and checked again by eye. Two of
  // them no longer pass the measures as they stand: 0x75dd..., now a canal
  // plan with no river or road, and 0x9825..., whose plate is 55 % empty.
  gallery: [
    '0x95e049f3bc09dcceb722ff7aec0591bd33eb8cf2657e769b963be52021a07ba8',
    '0x4f283411091ebb84ff76c0eac8575203fddc66c3da84d3b326110adb6c9bbdd8',
    '0x0f899d9ee09c6540cfa0c97cc84b3c30e98f2711b3d0755e0adbcc30ec362b5f',
    '0x8a5e5bea0175bec9a3dfa982f7622d1b7617ea559c633a77b20fd3507bfab7ee',
    '0x341af83ca3ea96e55aef2b9900e7e22d6defb36ee4a39576a7c60f08f9ee2d41',
    '0x75ddd34d457acc49f252f48cb5dc13f132dc1acd54418ecfdb10ff8aac968acd',
    '0x38ff937372ecf445883756802d0d7a70a2457ae73fae45cfcdf77082b648715f',
    '0x9825ae30f7f8387cb8282461b0530712276d625cf8865f14674c1cdb7205e80c',
    '0x98b8de0cdd4198d6bb6dbdea13eecb17527ae12fe568a2d399cf74b3e85b8696',
    '0x737c466bbaf95375b662f4b291187eb143a2ff8b35cb9532e42fc979b801b1fb',
    '0x2139a703e03a733675c79c0d5dd8d3407d19b6da166c22a0c9fa1de8e1963184',
    '0x1ae4d7f8763e1b1102de5a7dce52a43ca67c9bf6542600b78513af1f6fd485c7',
  ],
} satisfies Series
