// Knotwork: an ornamental carpet. Edge sockets are empty, a broad ribbon or a
// thin cord; tiles bend, cross over and under, loop back, pass through
// lozenges and rings, and meet in medallions. The border of the field is
// closed, so every strand closes on itself; each closed strand gets its own
// colour. The field is framed like a rug, with a patterned border and fringes.

import type { Grid, Palette, Placed } from './geom'
import type { BaseTile, Group } from './wfc'
import { cellRect, contrast, groupPath, mix, phash, spoke, strands } from './geom'

type Quad = readonly [number, number, number, number]

function t(name: string, feats: Quad, weight: number, groups: { edges: number[], kind: string }[] = []): BaseTile {
  return { name, corners: [0, 0, 0, 0], feats, groups, weight }
}

export function knotBases(density: string): BaseTile[] {
  const field = density === 'Sparse' ? 0.95 : density === 'Dense' ? 0.35 : 0.8
  return [
    t('field', [0, 0, 0, 0], field),
    t('star', [0, 0, 0, 0], 0.12 * field),
    t('ribbon', [1, 0, 1, 0], 0.55, [{ edges: [0, 2], kind: 'band' }]),
    t('ribbon', [1, 1, 0, 0], 0.65, [{ edges: [0, 1], kind: 'band' }]),
    t('loop', [1, 0, 0, 0], 0.03, [{ edges: [0], kind: 'loop' }]),
    t('cross', [1, 1, 1, 1], 0.75, [{ edges: [0, 2], kind: 'over' }, { edges: [1, 3], kind: 'band' }]),
    t('twin', [1, 1, 1, 1], 0.4, [{ edges: [0, 1], kind: 'band' }, { edges: [2, 3], kind: 'band' }]),
    t('medallion', [1, 1, 1, 1], 0.08, [{ edges: [0, 1, 2, 3], kind: 'medallion' }]),
    t('medallion', [1, 0, 1, 0], 0.05, [{ edges: [0, 2], kind: 'medallion' }]),
    t('lozenge', [1, 0, 1, 0], 0.08, [{ edges: [0, 2], kind: 'band' }, { edges: [], kind: 'lozenge' }]),
    t('ring', [1, 1, 1, 1], 0.07, [{ edges: [1, 3], kind: 'band' }, { edges: [], kind: 'ring' }, { edges: [0, 2], kind: 'over' }]),
    t('cord', [2, 0, 2, 0], 0.35, [{ edges: [0, 2], kind: 'band' }]),
    t('cord', [2, 2, 0, 0], 0.4, [{ edges: [0, 1], kind: 'band' }]),
    t('cord', [2, 2, 2, 2], 0.1, [{ edges: [0, 2], kind: 'over' }, { edges: [1, 3], kind: 'band' }]),
    t('cord', [2, 2, 2, 2], 0.15, [{ edges: [0, 1], kind: 'band' }, { edges: [2, 3], kind: 'band' }]),
    t('bead', [2, 0, 0, 0], 0.02, [{ edges: [0], kind: 'loop' }]),
    t('mixed', [1, 2, 1, 2], 0.12, [{ edges: [0, 2], kind: 'over' }, { edges: [1, 3], kind: 'band' }]),
    t('mixed', [1, 2, 1, 2], 0.08, [{ edges: [1, 3], kind: 'over' }, { edges: [0, 2], kind: 'band' }]),
  ]
}

export function drawKnotwork(g: CanvasRenderingContext2D, G: Grid, pal: Palette, seed: number): void {
  const { s, S, W, H, cells, cols, rows, x0, y0 } = G
  const field = pal.dark ? pal.paper : mix(pal.deep, pal.ink, 0.25)
  const gw = cols * s
  const gh = rows * s
  g.fillStyle = pal.bg
  g.fillRect(0, 0, W, H)

  // The rug: fringes, border band, guard stripes, running motif.
  const b = 0.085 * S
  const rx = x0 - b
  const ry = y0 - b
  const rw = gw + 2 * b
  const rh = gh + 2 * b
  const fringe = 0.032 * S
  const along = rw >= rh
  g.beginPath()
  const nf = Math.floor((along ? rh : rw) / (0.007 * S))
  for (let q = 0; q <= nf; q++) {
    const t = q / nf
    if (along) {
      g.moveTo(rx, ry + t * rh)
      g.lineTo(rx - fringe * (0.85 + 0.15 * phash(seed, q, 1)), ry + t * rh)
      g.moveTo(rx + rw, ry + t * rh)
      g.lineTo(rx + rw + fringe * (0.85 + 0.15 * phash(seed, q, 2)), ry + t * rh)
    }
    else {
      g.moveTo(rx + t * rw, ry)
      g.lineTo(rx + t * rw, ry - fringe * (0.85 + 0.15 * phash(seed, q, 1)))
      g.moveTo(rx + t * rw, ry + rh)
      g.lineTo(rx + t * rw, ry + rh + fringe * (0.85 + 0.15 * phash(seed, q, 2)))
    }
  }
  g.strokeStyle = mix(pal.sand, pal.paper, 0.3)
  g.lineWidth = 0.0022 * S
  g.stroke()

  g.fillStyle = pal.dark ? '#000000' : pal.ink
  g.globalAlpha = 0.25
  g.fillRect(rx + 0.006 * S, ry + 0.009 * S, rw, rh)
  g.globalAlpha = 1
  const band = pal.dark ? mix(pal.a1, pal.bg, 0.35) : pal.a1
  g.fillStyle = band
  g.fillRect(rx, ry, rw, rh)
  const guard = (inset: number, colour: string, w: number) => {
    g.strokeStyle = colour
    g.lineWidth = w * S
    g.strokeRect(rx + inset * S, ry + inset * S, rw - 2 * inset * S, rh - 2 * inset * S)
  }
  guard(0.008, pal.sand, 0.004)
  guard(0.077, pal.sand, 0.004)
  guard(0.083, pal.ink, 0.003)
  // Running motif: lozenges along the middle of the band.
  const mid = 0.0425 * S
  const dz = 0.022 * S
  const motif = (x: number, y: number, q: number) => {
    g.beginPath()
    g.moveTo(x, y - dz)
    g.lineTo(x + dz, y)
    g.lineTo(x, y + dz)
    g.lineTo(x - dz, y)
    g.closePath()
    g.fillStyle = q % 2 ? pal.a2 : field
    g.fill()
    g.strokeStyle = pal.sand
    g.lineWidth = 0.003 * S
    g.stroke()
  }
  const side = (x1: number, y1: number, x2: number, y2: number) => {
    const len = Math.hypot(x2 - x1, y2 - y1)
    const n = Math.max(1, Math.round(len / (0.06 * S)))
    for (let q = 0; q <= n; q++)
      motif(x1 + (x2 - x1) * q / n, y1 + (y2 - y1) * q / n, q)
  }
  side(rx + mid, ry + mid, rx + rw - mid, ry + mid)
  side(rx + mid, ry + rh - mid, rx + rw - mid, ry + rh - mid)
  side(rx + mid, ry + mid, rx + mid, ry + rh - mid)
  side(rx + rw - mid, ry + mid, rx + rw - mid, ry + rh - mid)

  // Field with a small lattice of dots at the cell corners.
  g.fillStyle = field
  g.fillRect(x0, y0, gw, gh)
  g.beginPath()
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= cols; i++) {
      const x = x0 + i * s
      const y = y0 + j * s
      const r = 0.035 * s
      g.moveTo(x, y - r)
      g.lineTo(x + r, y)
      g.lineTo(x, y + r)
      g.lineTo(x - r, y)
      g.closePath()
    }
  }
  g.fillStyle = mix(field, pal.sand, 0.35)
  g.fill()

  // Stars on some empty cells.
  for (const p of cells) {
    if (p.tile.name !== 'star')
      continue
    g.beginPath()
    for (let q = 0; q < 16; q++) {
      const a = q * Math.PI / 8 - Math.PI / 2
      const r = (q % 2 ? 0.13 : 0.32) * s
      g.lineTo(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r)
    }
    g.closePath()
    g.fillStyle = pal.a2
    g.fill()
    g.strokeStyle = mix(field, pal.ink, 0.5)
    g.lineWidth = 0.015 * s
    g.stroke()
  }

  const { comp, key } = strands(G)
  const colours = (pal.dark
    ? [pal.a1, pal.a2, pal.sand, mix(pal.shallow, pal.ink, 0.45)]
    : [pal.a2, pal.sand, mix(pal.shallow, pal.paper, 0.45), mix(pal.a1, pal.paper, 0.2)]
  ).map(c => contrast(c, field, pal.dark ? pal.ink : pal.paper))
  const colourOf = (c: number, k: number) => colours[Math.floor(phash(seed, key[comp[c][k]], 11) * colours.length)]
  const outline = pal.dark ? '#05070b' : mix(field, pal.ink, 0.6)
  const widthOf = (p: Placed, gr: Group) => (p.feats[gr.edges[0]] === 2 ? 0.14 : 0.34) * s
  const o = 0.03 * s

  const path = (p: Placed, gr: Group) => {
    g.beginPath()
    if (gr.kind === 'ring') {
      g.arc(p.x, p.y, 0.3 * s, 0, Math.PI * 2)
      return
    }
    if (gr.kind === 'lozenge') {
      g.moveTo(p.x, p.y - 0.36 * s)
      g.lineTo(p.x + 0.36 * s, p.y)
      g.lineTo(p.x, p.y + 0.36 * s)
      g.lineTo(p.x - 0.36 * s, p.y)
      g.closePath()
      return
    }
    if (gr.kind === 'loop') {
      const r = 0.17 * s
      spoke(g, p.x, p.y, s, gr.edges[0], 0.002 * s, r * 0.9)
      g.moveTo(p.x + r, p.y)
      g.arc(p.x, p.y, r, 0, Math.PI * 2)
      return
    }
    groupPath(g, p, gr, s, 0.002 * s)
  }
  const widthFor = (p: Placed, gr: Group) => (gr.kind === 'ring' ? 0.13 * s : gr.kind === 'lozenge' ? 0.08 * s : widthOf(p, gr))

  const strand = (p: Placed, c: number, k: number, pass: 'outline' | 'body' | 'line') => {
    const gr = p.groups[k]
    const w = widthFor(p, gr)
    const col = gr.kind === 'lozenge' || gr.kind === 'ring' ? pal.a2 : colourOf(c, k)
    path(p, gr)
    if (pass === 'outline') {
      g.strokeStyle = outline
      g.lineWidth = w + 2 * o
    }
    else if (pass === 'body') {
      g.strokeStyle = col
      g.lineWidth = w
    }
    else {
      if (w < 0.2 * s)
        return
      g.strokeStyle = outline
      g.lineWidth = 0.03 * s
    }
    g.stroke()
  }

  g.lineCap = 'butt'
  g.lineJoin = 'round'
  for (const pass of ['outline', 'body', 'line'] as const) {
    cells.forEach((p, c) => {
      p.groups.forEach((gr, k) => {
        if (gr.kind !== 'lozenge')
          strand(p, c, k, pass)
      })
    })
  }

  // Layers inside a cell: lozenges and rings above, then the upper strands.
  for (const level of ['lozenge', 'ring', 'over'] as const) {
    cells.forEach((p, c) => {
      p.groups.forEach((gr, k) => {
        if (gr.kind !== level)
          return
        g.save()
        cellRect(g, p, s)
        g.clip()
        for (const pass of ['outline', 'body', 'line'] as const)
          strand(p, c, k, pass)
        g.restore()
      })
    })
  }

  // Medallions where strands meet.
  for (const [c, p] of cells.entries()) {
    const k = p.groups.findIndex(gr => gr.kind === 'medallion')
    if (k < 0)
      continue
    const col = colourOf(c, k)
    const big = p.groups[k].edges.length === 4
    const R = (big ? 0.3 : 0.22) * s
    const petals = big ? 8 : 6
    g.beginPath()
    for (let q = 0; q < petals; q++) {
      const a = q * 2 * Math.PI / petals
      g.moveTo(p.x + Math.cos(a) * R * 0.78 + R * 0.34, p.y + Math.sin(a) * R * 0.78)
      g.arc(p.x + Math.cos(a) * R * 0.78, p.y + Math.sin(a) * R * 0.78, R * 0.34, 0, Math.PI * 2)
    }
    g.fillStyle = col
    g.fill()
    g.strokeStyle = outline
    g.lineWidth = 0.025 * s
    g.stroke()
    g.beginPath()
    g.arc(p.x, p.y, R * 0.72, 0, Math.PI * 2)
    g.fillStyle = col
    g.fill()
    g.stroke()
    g.beginPath()
    g.arc(p.x, p.y, R * 0.36, 0, Math.PI * 2)
    g.fillStyle = pal.dark ? pal.sand : pal.paper
    g.fill()
    g.stroke()
  }
}
