// Dungeon: a floor plan. Two corner terrains (solid rock, room floor) give
// rectilinear rooms with walls along the cell middles; corridors are an edge
// feature that only runs through rock, and a corridor that reaches a wall
// becomes a door. The border of the grid is closed rock.

import type { Grid, Palette, Placed } from './geom'
import type { BaseTile } from './wfc'
import { borderPath, classify, Local, mix, phash, regionPath, spoke } from './geom'

type Quad = readonly [number, number, number, number]
const ROCK: Quad = [0, 0, 0, 0]
const ROOM: Quad = [1, 1, 1, 1]

function t(name: string, corners: Quad, weight: number, feats: Quad = [0, 0, 0, 0], kind = 'corridor'): BaseTile {
  const edges = feats.map((f, e) => (f ? e : -1)).filter(e => e >= 0)
  return { name, corners, feats, groups: edges.length ? [{ edges, kind }] : [], weight }
}

export function dungeonBases(density: string, symmetric = false): BaseTile[] {
  // A mirrored plan only solves half the grid against a closed border, so a
  // balanced one gets more rooms and corridors than a free one.
  const balanced = symmetric ? [2.2, 4.4, 1.8] : [3, 4, 1.2]
  const [rock, room, corr] = density === 'Sparse' ? [2.2, 2.4, 2.4] : density === 'Dense' ? [1.8, 6, 1] : balanced
  return [
    t('rock', ROCK, rock),
    t('room', ROOM, room),
    t('pillars', ROOM, 0.22 * room / 4),
    t('pool', ROOM, 0.05 * room / 4),
    t('stairs', ROOM, 0.04 * room / 4),
    t('rubble', ROOM, 0.1 * room / 4),
    t('well', ROOM, 0.03 * room / 4),
    t('wall', [0, 0, 1, 1], 2),
    t('door', [0, 0, 1, 1], 1.1 * corr, [1, 0, 0, 0]),
    t('corner', [1, 0, 0, 0], 1.2),
    t('inner', [1, 1, 0, 1], 0.06),
    t('corridor', ROCK, 1.2 * corr, [1, 0, 1, 0]),
    t('corridor', ROCK, 0.55 * corr, [1, 1, 0, 0]),
    t('corridor', ROCK, 0.25 * corr, [1, 1, 1, 0]),
    t('corridor', ROCK, 0.08 * corr, [1, 1, 1, 1]),
    t('descent', ROCK, 0.025 * corr, [1, 0, 0, 0]),
  ]
}

export function drawDungeon(g: CanvasRenderingContext2D, G: Grid, pal: Palette, seed: number): void {
  const { s, W, H, cells } = G
  const rock = pal.dark ? pal.bg : mix(pal.paper, pal.ink, 0.17)
  const floor = pal.dark ? mix(pal.paper, pal.sand, 0.16) : pal.paper
  const ww = 0.07 * s
  const cw = 0.3 * s
  g.fillStyle = rock
  g.fillRect(0, 0, W, H)

  // Hatching over the rock.
  g.beginPath()
  const step = 0.1 * s
  for (let k = -H; k < W; k += step) {
    g.moveTo(k, 0)
    g.lineTo(k + H, H)
  }
  g.strokeStyle = pal.ink
  g.globalAlpha = 0.2
  g.lineWidth = 0.012 * s
  g.stroke()
  g.globalAlpha = 1

  const roomCase = (p: Placed) => classify(p.corners)
  const corridors = (to: (p: Placed) => number) => {
    g.beginPath()
    for (const p of cells) {
      for (const gr of p.groups) {
        for (const e of gr.edges)
          spoke(g, p.x, p.y, s, e, 0, to(p))
      }
    }
  }

  // Corridor walls (an ink band under the floor), rooms, their walls, then
  // the corridor floors, which cut through the walls at the doors.
  g.lineCap = 'square'
  g.lineJoin = 'miter'
  corridors(() => 0)
  g.strokeStyle = pal.ink
  g.lineWidth = cw + 2 * ww
  g.stroke()

  const rooms = new Path2D()
  // Build the room path once as a Path2D for fill and clip.
  for (const p of cells) {
    const { kind, k } = roomCase(p)
    if (kind === 'none')
      continue
    const proxy = new Local(rooms, p.x, p.y, s * 1.002, k)
    regionPath(proxy, kind, false, false)
  }
  g.fillStyle = floor
  g.fill(rooms)

  // Flagstones in running bond, half a cell high, each a slightly different tone.
  g.save()
  g.clip(rooms)
  g.fillStyle = mix(floor, pal.ink, 0.16)
  g.fill(rooms)
  const roomy = (i: number, j: number) => {
    const p = cells[Math.min(G.rows - 1, Math.max(0, j)) * G.cols + Math.min(G.cols - 1, Math.max(0, i))]
    return p.corners.includes(1)
  }
  const gap = 0.022 * s
  const tones = [0, 0.03, 0.055, 0.08].map(t => mix(floor, pal.ink, t))
  for (let jj = 0; jj < G.rows * 2; jj++) {
    const off = (jj % 2) * s / 4
    for (let ii = -1; ii < G.cols * 2; ii++) {
      const x = G.x0 + ii * s / 2 + off
      const y = G.y0 + jj * s / 2
      if (!roomy(Math.floor((x + s / 4 - G.x0) / s), Math.floor((y + s / 4 - G.y0) / s)))
        continue
      g.fillStyle = tones[Math.floor(phash(seed, ii, jj, 77) * tones.length)]
      g.fillRect(x + gap / 2, y + gap / 2, s / 2 - gap, s / 2 - gap)
    }
  }

  // Walls: a soft shade inside the rooms, then the ink line.
  const walls = () => {
    g.beginPath()
    for (const p of cells) {
      const { kind, k } = roomCase(p)
      if (kind === 'none' || kind === 'full')
        continue
      borderPath(new Local(g, p.x, p.y, s, k), kind, false, 0, false)
    }
  }
  walls()
  g.strokeStyle = pal.dark ? '#000000' : pal.ink
  g.globalAlpha = pal.dark ? 0.35 : 0.12
  g.lineWidth = 0.34 * s
  g.stroke()
  g.globalAlpha = 1
  g.restore()
  walls()
  g.strokeStyle = pal.ink
  g.lineWidth = 2 * ww
  g.stroke()

  corridors(p => (p.tile.name === 'door' ? -1.6 * ww : 0))
  g.strokeStyle = floor
  g.lineWidth = cw
  g.stroke()

  // Doors, stairs and furniture.
  g.lineCap = 'butt'
  const ink = pal.ink
  const box = (x: number, y: number, w: number, h: number, fill: string) => {
    g.fillStyle = fill
    g.fillRect(x - w / 2, y - h / 2, w, h)
    g.strokeStyle = ink
    g.lineWidth = 0.014 * s
    g.strokeRect(x - w / 2, y - h / 2, w, h)
  }
  const stairs = (x: number, y: number, w: number, h: number, vertical: boolean) => {
    box(x, y, w, h, floor)
    g.beginPath()
    const n = 5
    for (let q = 1; q < n; q++) {
      if (vertical) {
        g.moveTo(x - w / 2, y - h / 2 + q * h / n)
        g.lineTo(x + w / 2, y - h / 2 + q * h / n)
      }
      else {
        g.moveTo(x - w / 2 + q * w / n, y - h / 2)
        g.lineTo(x - w / 2 + q * w / n, y + h / 2)
      }
    }
    g.lineWidth = 0.012 * s
    g.stroke()
  }
  const disc = (x: number, y: number, r: number, fill: string) => {
    g.beginPath()
    g.arc(x, y, r, 0, Math.PI * 2)
    g.fillStyle = fill
    g.fill()
    g.strokeStyle = ink
    g.lineWidth = 0.014 * s
    g.stroke()
  }
  const doorColor = mix(pal.a1, pal.sand, 0.35)

  // Pillars where four plain room cells meet, in the larger rooms.
  for (let j = 1; j < G.rows; j++) {
    for (let i = 1; i < G.cols; i++) {
      const around = [cells[(j - 1) * G.cols + i - 1], cells[(j - 1) * G.cols + i], cells[j * G.cols + i - 1], cells[j * G.cols + i]]
      if (!around.every(p => p.tile.name === 'room') || phash(seed, i, j, 300) > 0.45)
        continue
      const x = G.x0 + i * s
      const y = G.y0 + j * s
      g.beginPath()
      g.arc(x + 0.04 * s, y + 0.05 * s, 0.11 * s, 0, Math.PI * 2)
      g.fillStyle = pal.dark ? '#000000' : pal.ink
      g.globalAlpha = 0.25
      g.fill()
      g.globalAlpha = 1
      disc(x, y, 0.11 * s, rock)
      disc(x, y, 0.06 * s, mix(rock, pal.ink, 0.15))
    }
  }

  // Torches on some walls: a pool of light and a flame.
  for (const p of cells) {
    if (p.tile.name !== 'wall' || phash(seed, p.i, p.j, 310) > 0.3)
      continue
    // towards the room: the mean of the room corners
    const cx = [-1, 1, 1, -1]
    const cy = [-1, -1, 1, 1]
    let dx = 0
    let dy = 0
    p.corners.forEach((c, k) => {
      dx += c * cx[k]
      dy += c * cy[k]
    })
    const len = Math.hypot(dx, dy) || 1
    const x = p.x + (dx / len) * (ww + 0.05 * s)
    const y = p.y + (dy / len) * (ww + 0.05 * s)
    const flame = mix(pal.a1, '#ffc95e', 0.6)
    g.fillStyle = flame
    g.globalAlpha = pal.dark ? 0.1 : 0.07
    for (const r of [0.48, 0.34, 0.22]) {
      g.beginPath()
      g.arc(x, y, r * s, 0, Math.PI * 2)
      g.fill()
    }
    g.globalAlpha = 1
    disc(x, y, 0.055 * s, flame)
    g.beginPath()
    g.arc(x, y, 0.025 * s, 0, Math.PI * 2)
    g.fillStyle = mix(flame, '#ffffff', 0.6)
    g.fill()
  }

  for (const p of cells) {
    const name = p.tile.name
    if (name === 'door') {
      const e = p.groups[0].edges[0]
      const vertical = e === 0 || e === 2
      const w = vertical ? cw * 1.05 : ww * 2.2
      const h = vertical ? ww * 2.2 : cw * 1.05
      box(p.x, p.y, w, h, doorColor)
      g.beginPath()
      for (const q of [-1, 1]) {
        if (vertical) {
          g.moveTo(p.x + q * w / 6, p.y - h / 2)
          g.lineTo(p.x + q * w / 6, p.y + h / 2)
        }
        else {
          g.moveTo(p.x - w / 2, p.y + q * h / 6)
          g.lineTo(p.x + w / 2, p.y + q * h / 6)
        }
      }
      g.lineWidth = 0.01 * s
      g.stroke()
    }
    else if (name === 'descent') {
      const e = p.groups[0].edges[0]
      const vertical = e === 0 || e === 2
      stairs(p.x, p.y, vertical ? cw : 0.4 * s, vertical ? 0.4 * s : cw, vertical)
    }
    else if (name === 'pillars') {
      for (const [u, v] of [[-0.25, -0.25], [0.25, -0.25], [0.25, 0.25], [-0.25, 0.25]])
        disc(p.x + u * s, p.y + v * s, 0.07 * s, rock)
    }
    else if (name === 'pool') {
      disc(p.x, p.y, 0.3 * s, pal.shallow)
      g.beginPath()
      g.arc(p.x, p.y, 0.18 * s, 0, Math.PI * 2)
      g.strokeStyle = mix(pal.shallow, pal.paper, 0.5)
      g.lineWidth = 0.012 * s
      g.stroke()
    }
    else if (name === 'stairs') {
      stairs(p.x, p.y, 0.5 * s, 0.5 * s, phash(seed, p.i, p.j) < 0.5)
    }
    else if (name === 'well') {
      disc(p.x, p.y, 0.2 * s, rock)
      disc(p.x, p.y, 0.11 * s, pal.dark ? pal.deep : mix(pal.deep, pal.ink, 0.4))
    }
    else if (name === 'rubble') {
      for (let q = 0; q < 6; q++) {
        const x = p.x + (phash(seed, p.i, p.j, q) - 0.5) * 0.7 * s
        const y = p.y + (phash(seed, p.i, p.j, q + 10) - 0.5) * 0.7 * s
        const r = (0.025 + 0.04 * phash(seed, p.i, p.j, q + 20)) * s
        box(x, y, r * 2, r * 1.6, rock)
      }
    }
    else if (name === 'room' && phash(seed, p.i, p.j, 30) < 0.08) {
      // a chest, off the centre so it clears the pillars
      const x = p.x + (phash(seed, p.i, p.j, 31) < 0.5 ? -0.2 : 0.2) * s
      const y = p.y + 0.18 * s
      box(x, y, 0.22 * s, 0.15 * s, pal.a2)
      g.beginPath()
      g.moveTo(x - 0.11 * s, y - 0.025 * s)
      g.lineTo(x + 0.11 * s, y - 0.025 * s)
      g.lineWidth = 0.012 * s
      g.stroke()
      disc(x, y + 0.01 * s, 0.018 * s, pal.ink)
    }
  }
}
