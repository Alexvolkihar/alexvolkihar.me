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

// Landscape colours that replace a palette's own: Indigo's pale grass and
// blue-grey woods washed the maps out, so its landscapes get a green field,
// a deep green wood and brighter water.
const LAND: Partial<Record<Features['Palette'], Partial<Palette>>> = {
  Indigo: { grass: '#7fa58a', forest: '#2d5e55', shallow: '#3667ab', sand: '#ecdcaa' },
}

// ---------------------------------------------------------------------------
// Worlds.
// ---------------------------------------------------------------------------

interface World {
  bases: (density: Features['Density'], symmetric: boolean) => BaseTile[]
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
function tileSet(world: Features['World'], density: Features['Density'], symmetric: boolean): TileSet {
  const key = `${world}/${density}/${symmetric}`
  let set = setCache.get(key)
  if (!set) {
    set = buildSet(expand(WORLDS[world].bases(density, symmetric)))
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
  const set = tileSet(f.World, f.Density, f.Symmetry !== 'Free')
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

  // Landscape guide: favour the tiles whose corners lie close to a target
  // terrain sampled at those corners. The local rules still decide the
  // coasts, beaches, rivers and roads. A symmetric landscape follows a
  // designed plan (../collapse/plan.ts); a free one follows a seeded relief,
  // which only shapes the continents.
  const plan = f.World === 'Landscape' && f.Symmetry !== 'Free' ? landscapePlan(f.Symmetry, N / 2, stream(hash, 'plan')) : undefined
  const cls = f.World === 'Landscape' ? new Uint16Array(n).map((_, t) => t) : undefined

  /**
   * Landscape guide: per-cell multipliers favouring the planned terrain, and
   * a solving order that settles the high ground first and lets it run down
   * to the sea.
   */
  function landscapeWeights(seed: number, shift = 0, roads = 1): { mult: Float64Array, order: Float64Array } {
    const relief = landscapeGuide(f.Density, seed, valueNoise(seed))
    const guide = (u: number, v: number) => relief(u, v) + shift
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
    const mult = new Float64Array(cells * n)
    const o = order.slice()
    const at = [[0, 0], [1, 0], [1, 1], [0, 1]]
    for (let j = 0; j < rr; j++) {
      for (let i = 0; i < rc; i++) {
        const c = j * rc + i
        const d = at.map(([a, b]) => lattice[(j + b) * (rc + 1) + i + a])
        o[c] -= 0.05 * (d[0] + d[1] + d[2] + d[3])
        for (const t of tiles) {
          let dev = 0
          for (let k = 0; k < 4; k++)
            dev += (t.corners[k] - d[k]) ** 2
          const fw = t.groups.length ? (plan ? plan.feature(i - cols / 2 + 0.5, j - rows / 2 + 0.5, t) : roads) : 1
          mult[c * n + t.id] = fw * Math.exp(-dev / (2 * sigma * sigma)) + 1e-6
        }
      }
    }
    return { mult, order: o }
  }

  /**
   * 0 for a varied central square, above 0 the further from it; and whether
   * its land outweighs its water.
   */
  function dullness(g: Int32Array): { score: number, high: boolean } {
    const count = [0, 0, 0, 0, 0]
    let total = 0
    for (let c = 0; c < cells; c++) {
      if (!priority[c])
        continue
      const t = tiles[g[c]]
      count[Math.round((t.corners[0] + t.corners[1] + t.corners[2] + t.corners[3]) / 4)]++
      total++
    }
    const shares = count.map(k => k / total)
    const kinds = shares.filter(x => x >= 0.06).length
    const score = Math.max(0, Math.max(...shares) - 0.6) + Math.max(0, shares[4] - 0.2) + Math.max(0, 3 - kinds) * 0.1
    return { score, high: shares[3] + shares[4] > shares[0] + shares[1] }
  }

  // A coarse free landscape has few cells, so it can come out as one block of
  // terrain. When its central square is more than 60 % one terrain or 20 %
  // forest, or has fewer than three terrains worth 6 % each, it is solved
  // again from a fresh relief, up to three times, keeping the most varied
  // result. The test only reads the central square, which is solved first,
  // so the choice is the same on any canvas.
  let grid = new Int32Array(0)
  let best = Infinity
  let shift = 0
  const attempts = f.World === 'Landscape' && !plan && f.Grid === 'Coarse' ? 4 : 1
  for (let k = 0; k < attempts; k++) {
    // each retry: a fresh relief, lowered or raised towards the missing
    // terrain, and rivers and roads made more likely
    const seed = k === 0 ? guideSeed : Math.floor(phash(guideSeed, k, 7) * 4294967296) | 0
    const lw = f.World === 'Landscape' ? landscapeWeights(seed, shift, k === 0 ? 1 : 2) : undefined
    const run = solve({ set, cols: rc, rows: rr, base, weight, mult: lw?.mult, cls, classes: n, priority: world.rug ? undefined : priority, order: lw?.order ?? order }, k === 0 ? rng : stream(hash, `solve${k}`))
    if (attempts === 1) {
      grid = run.grid
      break
    }
    const d = dullness(run.grid)
    if (d.score < best) {
      best = d.score
      grid = run.grid
    }
    if (d.score <= 0)
      break
    shift += d.high ? -0.3 : 0.3
  }

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

  // The plan's ornaments, from cells to pixels.
  const ornaments = plan?.ornaments.map(o => ({ ...o, x: W / 2 + o.x * s, y: H / 2 + o.y * s, w: o.w * s, h: o.h * s }))
  const G: Grid = { cols, rows, s, x0, y0, cells: placed, S, W, H, mirror: [rc < cols, rr < rows], ornaments }
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
  const pal = f.World === 'Landscape' ? { ...PAL[f.Palette], ...LAND[f.Palette] } : PAL[f.Palette]
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
  // landscape in Atlas, is then moved first. Two picks stopped passing those
  // rules once the symmetric landscapes got their plans and the sparse
  // pipes were filled out, and were replaced from seed-of-seeds 0xc011a95f
  // ("gallery" stream): the first passing hash with the same world, palette
  // and symmetry (a Nocturne landscape in Mirror, a Verdigris pipework in
  // Kaleidoscope).
  gallery: [
    '0x95e049f3bc09dcceb722ff7aec0591bd33eb8cf2657e769b963be52021a07ba8',
    '0x4f283411091ebb84ff76c0eac8575203fddc66c3da84d3b326110adb6c9bbdd8',
    '0x0f899d9ee09c6540cfa0c97cc84b3c30e98f2711b3d0755e0adbcc30ec362b5f',
    '0x8a5e5bea0175bec9a3dfa982f7622d1b7617ea559c633a77b20fd3507bfab7ee',
    '0x341af83ca3ea96e55aef2b9900e7e22d6defb36ee4a39576a7c60f08f9ee2d41',
    '0xca768829d26e18221402783f299d303ac4cde750043caa628f39bb591fad0936',
    '0x38ff937372ecf445883756802d0d7a70a2457ae73fae45cfcdf77082b648715f',
    '0xa692d2ce81ae401352642b0c41d0b0193ea6005f45d9b6c181558d4679852d8a',
    '0x98b8de0cdd4198d6bb6dbdea13eecb17527ae12fe568a2d399cf74b3e85b8696',
    '0x737c466bbaf95375b662f4b291187eb143a2ff8b35cb9532e42fc979b801b1fb',
    '0x2139a703e03a733675c79c0d5dd8d3407d19b6da166c22a0c9fa1de8e1963184',
    '0x1ae4d7f8763e1b1102de5a7dce52a43ca67c9bf6542600b78513af1f6fd485c7',
  ],
} satisfies Series
