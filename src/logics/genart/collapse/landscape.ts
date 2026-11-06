// Landscape: a top-down map. Corner terrains on a chain of levels (deep sea,
// shallows, sand, grass, forest; a tile only ever mixes two neighbouring
// levels, so the sea never touches the grass without a beach), with rivers and
// roads as edge features. Rivers run on grass and sand and end in a mouth on
// the shore, a spring, or come out of a forest; roads run on grass and through
// forests and end at a farm.

import type { Grid, Palette, Placed } from './geom'
import type { BaseTile } from './wfc'
import { borderPath, classify, groupPath, inside, Local, mix, phash, regionPath, spoke } from './geom'

const DEEP = 0
const SHALLOW = 1
const SAND = 2
const GRASS = 3
const FOREST = 4

const RIVER = 1
const ROAD = 2

type Quad = readonly [number, number, number, number]

function cornerBase(name: string, corners: Quad, weight: number, feats: Quad = [0, 0, 0, 0], groups: { edges: number[], kind: string }[] = []): BaseTile {
  return { name, corners, feats, groups, weight }
}

export function landscapeBases(): BaseTile[] {
  const U = [5, 3, 0.5, 7, 2.5]
  const b: BaseTile[] = []
  for (let l = 0; l <= 4; l++)
    b.push(cornerBase(`u${l}`, [l, l, l, l], U[l]))
  for (let lo = 0; lo < 4; lo++) {
    const hi = lo + 1
    const k = lo === SHALLOW ? 1.3 : 1
    b.push(cornerBase(`single${lo}`, [hi, lo, lo, lo], 2.6 * k))
    b.push(cornerBase(`half${lo}`, [hi, hi, lo, lo], 4.4 * k))
    b.push(cornerBase(`three${lo}`, [hi, hi, lo, hi], 2.6 * k))
    b.push(cornerBase(`diagJ${lo}`, [hi, lo, hi, lo], 0.1))
    b.push(cornerBase(`diagS${lo}`, [hi, lo, hi, lo], 0.1))
  }
  // Cliffs: grass straight down into the shallows, with no beach.
  b.push(cornerBase('cliff-single', [GRASS, SHALLOW, SHALLOW, SHALLOW], 1.2))
  b.push(cornerBase('cliff-half', [GRASS, GRASS, SHALLOW, SHALLOW], 2))
  b.push(cornerBase('cliff-three', [GRASS, GRASS, SHALLOW, GRASS], 1.2))
  const G: Quad = [GRASS, GRASS, GRASS, GRASS]
  // Rivers on grass.
  b.push(cornerBase('river', G, 0.75, [RIVER, 0, RIVER, 0], [{ edges: [0, 2], kind: 'river' }]))
  b.push(cornerBase('river', G, 0.65, [RIVER, RIVER, 0, 0], [{ edges: [0, 1], kind: 'river' }]))
  b.push(cornerBase('spring', G, 0.025, [RIVER, 0, 0, 0], [{ edges: [0], kind: 'spring' }]))
  b.push(cornerBase('river', G, 0.03, [RIVER, RIVER, RIVER, 0], [{ edges: [0, 1, 2], kind: 'river' }]))
  // Roads on grass, and farms at their ends.
  b.push(cornerBase('road', G, 0.55, [ROAD, 0, ROAD, 0], [{ edges: [0, 2], kind: 'road' }]))
  b.push(cornerBase('road', G, 0.42, [ROAD, ROAD, 0, 0], [{ edges: [0, 1], kind: 'road' }]))
  b.push(cornerBase('village', G, 0.09, [ROAD, ROAD, ROAD, 0], [{ edges: [0, 1, 2], kind: 'road' }]))
  b.push(cornerBase('village', G, 0.025, [ROAD, ROAD, ROAD, ROAD], [{ edges: [0, 1, 2, 3], kind: 'road' }]))
  b.push(cornerBase('farm', G, 0.05, [ROAD, 0, 0, 0], [{ edges: [0], kind: 'road' }]))
  b.push(cornerBase('bridge', G, 0.08, [RIVER, ROAD, RIVER, ROAD], [{ edges: [0, 2], kind: 'river' }, { edges: [1, 3], kind: 'road' }]))
  // Forest roads.
  const F: Quad = [FOREST, FOREST, FOREST, FOREST]
  b.push(cornerBase('road', F, 0.1, [ROAD, 0, ROAD, 0], [{ edges: [0, 2], kind: 'road' }]))
  b.push(cornerBase('road', F, 0.08, [ROAD, ROAD, 0, 0], [{ edges: [0, 1], kind: 'road' }]))
  b.push(cornerBase('road', [FOREST, FOREST, GRASS, GRASS], 0.12, [ROAD, 0, ROAD, 0], [{ edges: [0, 2], kind: 'road' }]))
  // Rivers out of a forest, across a beach, into the sea.
  b.push(cornerBase('river', [FOREST, FOREST, GRASS, GRASS], 0.06, [0, 0, RIVER, 0], [{ edges: [2], kind: 'source' }]))
  b.push(cornerBase('river', [SAND, SAND, SAND, SAND], 0.06, [RIVER, 0, RIVER, 0], [{ edges: [0, 2], kind: 'river' }]))
  b.push(cornerBase('river', [GRASS, GRASS, SAND, SAND], 0.45, [RIVER, 0, RIVER, 0], [{ edges: [0, 2], kind: 'river' }]))
  b.push(cornerBase('mouth', [SAND, SAND, SHALLOW, SHALLOW], 0.5, [RIVER, 0, 0, 0], [{ edges: [0], kind: 'mouth' }]))
  return b
}

/**
 * Target terrain level (0..4.4) at a point, in short-side units from the
 * centre: a seeded relief with a falloff to the sea. The solver favours the
 * tiles whose mean level is close to it, so the map has continents; the
 * coasts, beaches, rivers and forests still come from the local rules.
 */
export function landscapeGuide(density: string, seed: number, noise: (x: number, y: number) => number) {
  // relief amplitude, level at the centre, falloff towards the edges
  const [A, C, K] = density === 'Sparse' ? [7.5, 3, 4.5] : density === 'Dense' ? [5, 3.35, 2.5] : [5.5, 3.25, 6.5]
  const ox = phash(seed, 1, 2) * 50
  const oy = phash(seed, 3, 4) * 50
  // an archipelago is broken into more, smaller islands
  const fq = density === 'Sparse' ? 1.15 : 1
  return (u: number, v: number) => {
    const n = 0.62 * noise(u * 2.3 * fq + ox, v * 2.3 * fq + oy) + 0.38 * noise(u * 5.1 * fq - oy, v * 5.1 * fq + ox)
    const d = A * (n - 0.5) + C - K * (u * u + v * v)
    // steepen around the beach level, so beaches stay narrow, and flatten
    // the high ground, so forests stay patches on the grass
    const e = d + 0.5 * Math.max(-1, Math.min(1, d - 2))
    return e > 3 ? 3 + (e - 3) * 0.35 : e
  }
}

export function drawLandscape(g: CanvasRenderingContext2D, G: Grid, pal: Palette, seed: number): void {
  const { s, S, W, H, cells } = G
  const level = [pal.deep, pal.shallow, pal.sand, pal.grass, pal.forest]
  // Small details per cell scale with the cell area, so a coarse grid is not
  // emptier than a fine one.
  const k = (s / (S / 16)) ** 2
  g.fillStyle = pal.deep
  g.fillRect(0, 0, W, H)
  g.lineCap = 'round'
  g.lineJoin = 'round'

  const caseOf = (p: Placed, L: number) => classify(p.corners.map(c => (c >= L ? 1 : 0)))
  const joined = (p: Placed) => p.tile.name.startsWith('diagJ')

  const fillLevel = (L: number) => {
    g.beginPath()
    for (const p of cells) {
      const { kind, k } = caseOf(p, L)
      if (kind === 'none')
        continue
      regionPath(new Local(g, p.x, p.y, s * 1.002, k), kind, joined(p))
    }
    g.fillStyle = level[L]
    g.fill()
  }
  const strokeBorder = (L: number, o: number, color: string, width: number, dash?: number[]) => {
    g.beginPath()
    for (const p of cells) {
      const { kind, k } = caseOf(p, L)
      if (kind === 'none' || kind === 'full')
        continue
      borderPath(new Local(g, p.x, p.y, s, k), kind, joined(p), o)
    }
    g.strokeStyle = color
    g.lineWidth = width * S
    g.setLineDash(dash ? dash.map(d => d * S) : [])
    g.stroke()
    g.setLineDash([])
  }

  // Water: shallows, the drop-off, and ripples along the shore.
  fillLevel(SHALLOW)
  strokeBorder(SHALLOW, 0, mix(pal.deep, pal.shallow, 0.55), 0.0018, [0.004, 0.006])
  const ripple = mix(pal.shallow, pal.paper, pal.dark ? 0.35 : 0.55)
  for (const [o, a] of [[0.13, 0.8], [0.27, 0.5], [0.41, 0.28]] as const) {
    g.globalAlpha = a
    strokeBorder(SAND, o, ripple, 0.0016)
  }
  g.globalAlpha = 1

  // Wave marks on the open sea.
  g.beginPath()
  for (const p of cells) {
    if (!p.corners.every(c => c === DEEP) || phash(seed, p.i, p.j, 60) > Math.min(0.7, 0.22 * k))
      continue
    const x = p.x + (phash(seed, p.i, p.j, 61) - 0.5) * 0.4 * s
    const y = p.y + (phash(seed, p.i, p.j, 62) - 0.5) * 0.4 * s
    const r = 0.09 * s
    for (const dx of [-r, r]) {
      g.moveTo(x + dx - r, y)
      g.arc(x + dx, y + r * 0.35, r * 1.05, Math.PI * 1.17, Math.PI * 1.83)
    }
  }
  g.strokeStyle = mix(pal.deep, pal.paper, pal.dark ? 0.22 : 0.35)
  g.lineWidth = 0.018 * s
  g.stroke()

  // Land.
  fillLevel(SAND)
  fillLevel(GRASS)
  fillLevel(FOREST)
  strokeBorder(SAND, 0, pal.ink, 0.0022)
  // cliffs: a heavier edge with short strokes down to the water
  g.beginPath()
  for (const p of cells) {
    if (!p.tile.name.startsWith('cliff'))
      continue
    const { kind, k } = caseOf(p, GRASS)
    for (const o of [0.03, 0.06])
      borderPath(new Local(g, p.x, p.y, s, k), kind, false, o)
  }
  g.strokeStyle = mix(pal.grass, pal.ink, 0.55)
  g.lineWidth = 0.025 * s
  g.stroke()
  strokeBorder(SAND, 0, pal.ink, 0.0022)
  strokeBorder(GRASS, 0, mix(pal.grass, pal.ink, 0.25), 0.0012)
  strokeBorder(FOREST, 0, mix(pal.forest, pal.ink, 0.35), 0.0014)

  // Textures: stippled sand, tufts of grass.
  g.beginPath()
  const dot = 0.012 * s
  for (const p of cells) {
    if (!p.corners.includes(SAND))
      continue
    const sand = caseOf(p, SAND)
    const grass = caseOf(p, GRASS)
    for (let q = 0; q < Math.round(7 * k); q++) {
      const u = phash(seed, p.i, p.j, q * 2) - 0.5
      const v = phash(seed, p.i, p.j, q * 2 + 1) - 0.5
      const ls = new Local(g, p.x, p.y, s, sand.k).local(p.x + u * s, p.y + v * s)
      const lg = new Local(g, p.x, p.y, s, grass.k).local(p.x + u * s, p.y + v * s)
      if (inside(sand.kind, joined(p), ls[0], ls[1]) && !inside(grass.kind, joined(p), lg[0], lg[1])) {
        g.moveTo(p.x + u * s + dot, p.y + v * s)
        g.arc(p.x + u * s, p.y + v * s, dot, 0, Math.PI * 2)
      }
    }
  }
  g.fillStyle = mix(pal.sand, pal.ink, 0.35)
  g.fill()

  const plain = (p: Placed, l: number) => p.corners.every(c => c === l) && p.groups.length === 0
  g.beginPath()
  for (const p of cells) {
    if (!plain(p, GRASS))
      continue
    for (let q = 0; q < Math.max(1, Math.round(2 * k)); q++) {
      const u = (phash(seed, p.i, p.j, 400 + q) - 0.5) * 0.8
      const v = (phash(seed, p.i, p.j, 450 + q) - 0.5) * 0.8
      const x = p.x + u * s
      const y = p.y + v * s
      g.moveTo(x - 0.05 * s, y - 0.05 * s)
      g.lineTo(x - 0.015 * s, y + 0.02 * s)
      g.lineTo(x + 0.01 * s, y - 0.06 * s)
      g.moveTo(x + 0.03 * s, y - 0.035 * s)
      g.lineTo(x + 0.012 * s, y + 0.02 * s)
    }
  }
  g.strokeStyle = mix(pal.grass, pal.ink, 0.3)
  g.lineWidth = 0.012 * s
  g.stroke()

  // Trees: forests, and a few lone trees in the fields.
  const trees: [number, number, number][] = []
  for (const p of cells) {
    const forest = p.corners.includes(FOREST)
    if (!forest) {
      for (let q = 0; q < Math.max(1, Math.round(k)); q++) {
        if (plain(p, GRASS) && phash(seed, p.i, p.j, 90 + 3 * q) < 0.1)
          trees.push([p.x + (phash(seed, p.i, p.j, 91 + 3 * q) - 0.5) * 0.6 * s, p.y + (phash(seed, p.i, p.j, 92 + 3 * q) - 0.5) * 0.6 * s, Math.min(0.15 * s, 0.012 * S)])
      }
      continue
    }
    const c = caseOf(p, FOREST)
    const l = new Local(g, p.x, p.y, s, c.k)
    // About the same tree size whatever the grid: more trees per larger cell.
    const nt = Math.max(2, Math.min(5, Math.round(s / (0.028 * S))))
    const pts: [number, number][] = []
    if (p.groups.length === 0) {
      for (let a = 0; a < nt; a++) {
        for (let b = 0; b < nt; b++)
          pts.push([(a + 0.5) / nt - 0.5, (b + 0.5) / nt - 0.5])
      }
    }
    else {
      pts.push([-0.29, -0.29], [0.29, -0.29], [0.29, 0.29], [-0.29, 0.29])
    }
    const tr = Math.min(0.2, 0.62 / nt)
    pts.forEach(([u, v], q) => {
      const jit = p.groups.length ? 0.06 : 0.5 / nt
      const ju = u + (phash(seed, p.i, p.j, 100 + q) - 0.5) * jit
      const jv = v + (phash(seed, p.i, p.j, 160 + q) - 0.5) * jit
      const [lu, lv] = l.local(p.x + ju * s, p.y + jv * s)
      if (inside(c.kind, joined(p), lu, lv))
        trees.push([p.x + ju * s, p.y + jv * s, tr * (0.75 + 0.45 * phash(seed, p.i, p.j, 220 + q)) * s])
    })
  }
  trees.sort((a, b) => a[1] - b[1] || a[0] - b[0])
  g.beginPath()
  for (const [x, y, r] of trees) {
    g.moveTo(x + r * 1.3, y + r * 0.4)
    g.arc(x + r * 0.3, y + r * 0.4, r, 0, Math.PI * 2)
  }
  g.fillStyle = mix(pal.forest, pal.ink, 0.45)
  g.globalAlpha = 0.55
  g.fill()
  g.globalAlpha = 1
  const crown = mix(pal.forest, pal.grass, 0.35)
  const light = mix(pal.forest, pal.grass, 0.75)
  g.strokeStyle = mix(pal.forest, pal.ink, 0.6)
  for (const [x, y, r] of trees) {
    g.lineWidth = 0.08 * r
    g.beginPath()
    g.arc(x, y, r, 0, Math.PI * 2)
    g.fillStyle = crown
    g.fill()
    g.stroke()
    g.beginPath()
    g.arc(x - r * 0.3, y - r * 0.3, r * 0.38, 0, Math.PI * 2)
    g.fillStyle = light
    g.fill()
  }

  // Rivers: outline, then water.
  const riverPath = (ext: number) => {
    g.beginPath()
    for (const p of cells) {
      for (const gr of p.groups) {
        if (gr.kind === 'river')
          groupPath(g, p, gr, s)
        else if (gr.kind === 'spring' || gr.kind === 'source')
          spoke(g, p.x, p.y, s, gr.edges[0], 0, 0)
        else if (gr.kind === 'mouth')
          spoke(g, p.x, p.y, s, gr.edges[0], 0, -0.08 * s)
      }
      if (p.tile.name === 'spring') {
        g.moveTo(p.x + 0.16 * s + ext, p.y)
        g.arc(p.x, p.y, 0.16 * s + ext, 0, Math.PI * 2)
      }
    }
  }
  const rw = 0.12 * s
  riverPath(0.025 * s)
  g.strokeStyle = mix(pal.shallow, pal.ink, 0.45)
  g.fillStyle = g.strokeStyle
  g.lineWidth = rw + 0.05 * s
  g.stroke()
  g.fill()
  riverPath(0)
  g.strokeStyle = pal.shallow
  g.fillStyle = pal.shallow
  g.lineWidth = rw
  g.stroke()
  g.fill()

  // Roads.
  const roadPath = () => {
    g.beginPath()
    for (const p of cells) {
      for (const gr of p.groups) {
        if (gr.kind === 'road')
          groupPath(g, p, gr, s)
      }
    }
  }
  roadPath()
  g.strokeStyle = mix(pal.ink, pal.grass, 0.25)
  g.lineWidth = 0.12 * s
  g.stroke()
  roadPath()
  g.strokeStyle = mix(pal.sand, pal.a2, 0.3)
  g.lineWidth = 0.08 * s
  g.stroke()

  // Bridges: parapets on both sides of the road over the river.
  g.beginPath()
  for (const p of cells) {
    if (p.tile.name !== 'bridge')
      continue
    const road = p.groups.find(gr => gr.kind === 'road')!
    const horizontal = road.edges.includes(1)
    for (const side of [-1, 1]) {
      const o = side * 0.07 * s
      if (horizontal) {
        g.moveTo(p.x - 0.17 * s, p.y + o)
        g.lineTo(p.x + 0.17 * s, p.y + o)
      }
      else {
        g.moveTo(p.x + o, p.y - 0.17 * s)
        g.lineTo(p.x + o, p.y + 0.17 * s)
      }
    }
  }
  g.strokeStyle = pal.ink
  g.lineWidth = 0.022 * s
  g.stroke()

  // Farms and villages beside the roads.
  const houses: [number, number, boolean][] = []
  for (const p of cells) {
    if (!p.groups.some(gr => gr.kind === 'road') || !p.corners.every(c => c === GRASS))
      continue
    const n = p.groups[0].edges.length
    if (p.tile.name === 'farm')
      houses.push([p.x, p.y, phash(seed, p.i, p.j, 200) < 0.5])
    const pr = p.tile.name === 'village' ? 0.75 : n === 1 ? 0.2 : 0.16
    const qs = [[-0.27, -0.27], [0.27, -0.27], [0.27, 0.27], [-0.27, 0.27]]
    qs.forEach(([u, v], q) => {
      if (phash(seed, p.i, p.j, 210 + q) < pr)
        houses.push([p.x + u * s, p.y + v * s, phash(seed, p.i, p.j, 220 + q) < 0.5])
    })
  }
  const roofA = pal.a1
  const roofB = mix(pal.a1, pal.ink, 0.3)
  for (const [x, y, turn] of houses) {
    const hw = (turn ? 0.08 : 0.11) * s
    const hh = (turn ? 0.11 : 0.08) * s
    g.fillStyle = mix(pal.grass, pal.ink, 0.5)
    g.fillRect(x - hw + 0.03 * s, y - hh + 0.035 * s, hw * 2, hh * 2)
    g.fillStyle = roofA
    g.fillRect(x - hw, y - hh, hw * 2, hh * 2)
    g.fillStyle = roofB
    if (turn)
      g.fillRect(x, y - hh, hw, hh * 2)
    else
      g.fillRect(x - hw, y, hw * 2, hh)
    g.strokeStyle = pal.ink
    g.lineWidth = 0.012 * s
    g.strokeRect(x - hw, y - hh, hw * 2, hh * 2)
  }
}
