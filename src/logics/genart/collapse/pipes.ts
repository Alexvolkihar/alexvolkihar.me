// Pipes: a plant room seen from above. Edge sockets are empty, a thin pipe or
// a thick pipe; tiles join, bend, branch, cross over and under, reduce from
// thick to thin, and carry valves, gauges, pumps and tanks. Every connected
// network gets its own colour. The border of the grid is closed.

import type { Grid, Palette, Placed } from './geom'
import type { BaseTile, Group } from './wfc'
import { cellRect, contrast, edgePoint, groupPath, mix, phash, spoke, strands } from './geom'

type Quad = readonly [number, number, number, number]

function t(name: string, feats: Quad, weight: number, groups: { edges: number[], kind: string }[]): BaseTile {
  return { name, corners: [0, 0, 0, 0], feats, groups, weight }
}

export function pipeBases(density: string): BaseTile[] {
  const empty = density === 'Sparse' ? 2.3 : density === 'Dense' ? 0.8 : 1.7
  return [
    t('empty', [0, 0, 0, 0], empty, []),
    t('pipe', [1, 0, 1, 0], 0.8, [{ edges: [0, 2], kind: 'pipe' }]),
    t('pipe', [1, 1, 0, 0], 0.9, [{ edges: [0, 1], kind: 'pipe' }]),
    t('pipe', [1, 1, 1, 0], 0.22, [{ edges: [0, 1, 2], kind: 'pipe' }]),
    t('cross', [1, 1, 1, 1], 0.2, [{ edges: [0, 2], kind: 'over' }, { edges: [1, 3], kind: 'pipe' }]),
    t('cap', [1, 0, 0, 0], 0.04, [{ edges: [0], kind: 'cap' }]),
    t('valve', [1, 0, 1, 0], 0.16, [{ edges: [0, 2], kind: 'valve' }]),
    t('tank', [1, 0, 0, 0], 0.05, [{ edges: [0], kind: 'tank' }]),
    t('tank', [1, 0, 1, 0], 0.05, [{ edges: [0, 2], kind: 'tank' }]),
    t('tank', [1, 1, 0, 0], 0.04, [{ edges: [0, 1], kind: 'tank' }]),
    t('tank', [1, 1, 1, 1], 0.02, [{ edges: [0, 1, 2, 3], kind: 'tank' }]),
    t('pipe', [2, 0, 2, 0], 0.55, [{ edges: [0, 2], kind: 'pipe' }]),
    t('pipe', [2, 2, 0, 0], 0.5, [{ edges: [0, 1], kind: 'pipe' }]),
    t('pipe', [2, 2, 2, 0], 0.12, [{ edges: [0, 1, 2], kind: 'pipe' }]),
    t('gauge', [2, 0, 2, 0], 0.1, [{ edges: [0, 2], kind: 'gauge' }]),
    t('pump', [2, 0, 2, 0], 0.07, [{ edges: [0, 2], kind: 'pump' }]),
    t('reducer', [2, 0, 1, 0], 0.18, [{ edges: [0, 2], kind: 'reducer' }]),
    t('cross', [2, 1, 2, 1], 0.1, [{ edges: [1, 3], kind: 'over' }, { edges: [0, 2], kind: 'pipe' }]),
  ]
}

export function drawPipes(g: CanvasRenderingContext2D, G: Grid, pal: Palette, seed: number): void {
  const { s, W, H, cells } = G
  const plate = pal.paper
  g.fillStyle = plate
  g.fillRect(0, 0, W, H)

  // Floor plates two cells wide, with rivets.
  g.beginPath()
  for (let i = 0; i <= G.cols; i += 2) {
    g.moveTo(G.x0 + i * s, 0)
    g.lineTo(G.x0 + i * s, H)
  }
  for (let j = 0; j <= G.rows; j += 2) {
    g.moveTo(0, G.y0 + j * s)
    g.lineTo(W, G.y0 + j * s)
  }
  g.strokeStyle = pal.ink
  g.globalAlpha = pal.dark ? 0.16 : 0.1
  g.lineWidth = 0.012 * s
  g.stroke()
  g.beginPath()
  for (let j = 0; j < G.rows; j += 2) {
    for (let i = 0; i < G.cols; i += 2) {
      for (const [u, v] of [[0.12, 0.12], [1.88, 0.12], [1.88, 1.88], [0.12, 1.88]]) {
        const x = G.x0 + (i + u) * s
        const y = G.y0 + (j + v) * s
        g.moveTo(x + 0.03 * s, y)
        g.arc(x, y, 0.03 * s, 0, Math.PI * 2)
      }
    }
  }
  g.fillStyle = pal.ink
  g.fill()
  g.globalAlpha = 1

  const { comp, key } = strands(G)
  const colours = [pal.a1, pal.a2, pal.shallow, mix(pal.grass, pal.forest, 0.3), pal.sand].map(c => contrast(c, plate, pal.ink, 0.18))
  const colourOf = (c: number, k: number) => colours[Math.floor(phash(seed, key[comp[c][k]], 7) * colours.length)]
  const width = (f: number) => (f === 2 ? 0.3 : 0.16) * s
  const o = 0.028 * s

  // One pipe: a link, or spokes (branches, reducers, caps, tanks).
  const pipe = (p: Placed, gr: Group, pass: (w: number) => void) => {
    const fs = gr.edges.map(e => p.feats[e])
    if (gr.edges.length === 2 && fs[0] === fs[1] && gr.kind !== 'tank') {
      g.beginPath()
      groupPath(g, p, gr, s, 0.002 * s)
      pass(width(fs[0]))
      return
    }
    for (const e of gr.edges) {
      g.beginPath()
      spoke(g, p.x, p.y, s, e, 0.002 * s, 0)
      pass(width(p.feats[e]))
    }
  }
  const strokeAs = (colour: string, extra: number, k = 1) => (w: number) => {
    g.strokeStyle = colour
    g.lineWidth = w * k + extra
    g.stroke()
  }
  const fittings = (p: Placed, gr: Group, fill: (r: number) => void) => {
    // round joint at a branch, a tank or a reducer
    if (gr.edges.length !== 2 || gr.kind === 'reducer') {
      const r = Math.max(...gr.edges.map(e => width(p.feats[e]))) / 2
      g.beginPath()
      g.arc(p.x, p.y, r, 0, Math.PI * 2)
      fill(r)
    }
  }

  const drawStrand = (p: Placed, c: number, k: number, shadow: boolean) => {
    const gr = p.groups[k]
    const col = colourOf(c, k)
    if (shadow) {
      g.save()
      g.translate(0.05 * s, 0.07 * s)
      g.globalAlpha = pal.dark ? 0.5 : 0.22
      pipe(p, gr, strokeAs(pal.dark ? '#000000' : pal.ink, 2 * o))
      fittings(p, gr, () => {
        g.fillStyle = pal.dark ? '#000000' : pal.ink
        g.fill()
      })
      g.restore()
      return
    }
    pipe(p, gr, strokeAs(pal.ink, 2 * o))
    fittings(p, gr, (r) => {
      g.beginPath()
      g.arc(p.x, p.y, r + o, 0, Math.PI * 2)
      g.fillStyle = pal.ink
      g.fill()
    })
    pipe(p, gr, strokeAs(col, 0))
    fittings(p, gr, () => {
      g.fillStyle = col
      g.fill()
    })
    pipe(p, gr, strokeAs(mix(col, '#ffffff', 0.5), 0, 0.2))
  }

  g.lineCap = 'butt'
  g.lineJoin = 'round'
  // Pass by pass over the whole grid, so the strokes join without seams.
  for (const pass of ['shadow', 'outline', 'body', 'light'] as const) {
    cells.forEach((p, c) => {
      p.groups.forEach((gr, k) => {
        const col = colourOf(c, k)
        if (pass === 'shadow') {
          drawStrand(p, c, k, true)
        }
        else if (pass === 'outline') {
          pipe(p, gr, strokeAs(pal.ink, 2 * o))
          fittings(p, gr, (r) => {
            g.beginPath()
            g.arc(p.x, p.y, r + o, 0, Math.PI * 2)
            g.fillStyle = pal.ink
            g.fill()
          })
        }
        else if (pass === 'body') {
          pipe(p, gr, strokeAs(col, 0))
          fittings(p, gr, () => {
            g.fillStyle = col
            g.fill()
          })
        }
        else {
          pipe(p, gr, strokeAs(mix(col, '#ffffff', 0.5), 0, 0.2))
        }
      })
    })
  }

  // Crossings: the upper pipe again, with its shadow, inside its cell.
  cells.forEach((p, c) => {
    p.groups.forEach((gr, k) => {
      if (gr.kind !== 'over')
        return
      g.save()
      cellRect(g, p, s)
      g.clip()
      drawStrand(p, c, k, true)
      drawStrand(p, c, k, false)
      g.restore()
    })
  })

  // Flanges on some joints between cells.
  cells.forEach((p, c) => {
    p.groups.forEach((gr, k) => {
      for (const e of gr.edges) {
        if ((e !== 1 && e !== 2) || phash(seed, p.i, p.j, e) > 0.4)
          continue
        const i = p.i + (e === 1 ? 1 : 0)
        const j = p.j + (e === 2 ? 1 : 0)
        if (i >= G.cols || j >= G.rows)
          continue
        const w = width(p.feats[e]) * 1.45
        const [x, y] = edgePoint(p.x, p.y, s, e)
        const th = 0.07 * s
        g.fillStyle = mix(colourOf(c, k), pal.ink, 0.25)
        g.strokeStyle = pal.ink
        g.lineWidth = 0.014 * s
        if (e === 1) {
          g.fillRect(x - th / 2, y - w / 2, th, w)
          g.strokeRect(x - th / 2, y - w / 2, th, w)
        }
        else {
          g.fillRect(x - w / 2, y - th / 2, w, th)
          g.strokeRect(x - w / 2, y - th / 2, w, th)
        }
      }
    })
  })

  // Valves, gauges, pumps, tanks, caps and reducers.
  const disc = (x: number, y: number, r: number, fill: string, lw = 0.016) => {
    g.beginPath()
    g.arc(x, y, r, 0, Math.PI * 2)
    g.fillStyle = fill
    g.fill()
    g.strokeStyle = pal.ink
    g.lineWidth = lw * s
    g.stroke()
  }
  cells.forEach((p, c) => {
    p.groups.forEach((gr, k) => {
      const col = colourOf(c, k)
      const { x, y } = p
      const vertical = gr.edges.includes(0) || gr.edges.includes(2)
      if (gr.kind === 'valve') {
        disc(x, y, 0.2 * s, 'rgba(0,0,0,0)', 0.035)
        g.beginPath()
        for (let q = 0; q < 4; q++) {
          const a = q * Math.PI / 2 + Math.PI / 4
          g.moveTo(x, y)
          g.lineTo(x + Math.cos(a) * 0.2 * s, y + Math.sin(a) * 0.2 * s)
        }
        g.strokeStyle = pal.ink
        g.lineWidth = 0.025 * s
        g.stroke()
        g.beginPath()
        g.arc(x, y, 0.2 * s, 0, Math.PI * 2)
        g.strokeStyle = pal.a1 === col ? pal.a2 : pal.a1
        g.lineWidth = 0.02 * s
        g.stroke()
        disc(x, y, 0.05 * s, pal.ink)
      }
      else if (gr.kind === 'gauge') {
        disc(x + (vertical ? 0.24 : 0) * s, y + (vertical ? 0 : 0.24) * s, 0.15 * s, mix(pal.paper, '#ffffff', pal.dark ? 0.75 : 0.5))
        const gx = x + (vertical ? 0.24 : 0) * s
        const gy = y + (vertical ? 0 : 0.24) * s
        const a = -Math.PI * (0.2 + 0.6 * phash(seed, p.i, p.j, 3))
        g.beginPath()
        g.moveTo(gx, gy)
        g.lineTo(gx + Math.cos(a) * 0.11 * s, gy + Math.sin(a) * 0.11 * s)
        g.strokeStyle = pal.a1
        g.lineWidth = 0.02 * s
        g.stroke()
      }
      else if (gr.kind === 'pump') {
        const w = (vertical ? 0.5 : 0.62) * s
        const h = (vertical ? 0.62 : 0.5) * s
        g.fillStyle = pal.dark ? '#000000' : pal.ink
        g.globalAlpha = pal.dark ? 0.5 : 0.22
        g.fillRect(x - w / 2 + 0.05 * s, y - h / 2 + 0.07 * s, w, h)
        g.globalAlpha = 1
        g.fillStyle = mix(col, pal.ink, 0.15)
        g.fillRect(x - w / 2, y - h / 2, w, h)
        g.strokeStyle = pal.ink
        g.lineWidth = 0.02 * s
        g.strokeRect(x - w / 2, y - h / 2, w, h)
        disc(x, y, 0.15 * s, mix(col, '#ffffff', 0.35))
        disc(x, y, 0.05 * s, pal.ink)
      }
      else if (gr.kind === 'tank') {
        const r = 0.36 * s
        g.beginPath()
        g.arc(x + 0.05 * s, y + 0.07 * s, r, 0, Math.PI * 2)
        g.fillStyle = pal.dark ? '#000000' : pal.ink
        g.globalAlpha = pal.dark ? 0.5 : 0.22
        g.fill()
        g.globalAlpha = 1
        disc(x, y, r, col, 0.03)
        g.beginPath()
        g.arc(x, y, r * 0.72, Math.PI * 1.05, Math.PI * 1.45)
        g.strokeStyle = mix(col, '#ffffff', 0.55)
        g.lineWidth = 0.035 * s
        g.lineCap = 'round'
        g.stroke()
        g.lineCap = 'butt'
        g.beginPath()
        for (let q = 0; q < 8; q++) {
          const a = q * Math.PI / 4 + Math.PI / 8
          g.moveTo(x + Math.cos(a) * r * 0.86 + 0.018 * s, y + Math.sin(a) * r * 0.86)
          g.arc(x + Math.cos(a) * r * 0.86, y + Math.sin(a) * r * 0.86, 0.018 * s, 0, Math.PI * 2)
        }
        g.fillStyle = pal.ink
        g.fill()
      }
      else if (gr.kind === 'cap') {
        disc(x, y, 0.13 * s, mix(col, pal.ink, 0.2))
      }
      else if (gr.kind === 'reducer') {
        disc(x, y, 0.15 * s, mix(col, pal.ink, 0.15))
      }
    })
  })
}
