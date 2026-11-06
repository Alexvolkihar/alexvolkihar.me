// Drawing for the "Circuit" series. The context is already scaled so that one
// unit is one routing cell, cell centres on integers.

import type { Board, Box, Pad, Part, Track } from './board'
import { strokeText, textWidth } from './font'

export interface Palette {
  bench: string
  base: string
  tint: string
  hi: string
  ghost: string
  silk: string
  gold: string
  goldHi: string
  edge: string
}

type G = CanvasRenderingContext2D

function rrect(g: G | Path2D, x0: number, y0: number, x1: number, y1: number, r: number) {
  r = Math.max(0, Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2))
  g.moveTo(x0 + r, y0)
  g.lineTo(x1 - r, y0)
  g.arcTo(x1, y0, x1, y0 + r, r)
  g.lineTo(x1, y1 - r)
  g.arcTo(x1, y1, x1 - r, y1, r)
  g.lineTo(x0 + r, y1)
  g.arcTo(x0, y1, x0, y1 - r, r)
  g.lineTo(x0, y0 + r)
  g.arcTo(x0, y0, x0 + r, y0, r)
  g.closePath()
}

export function fillRR(g: G, x0: number, y0: number, x1: number, y1: number, r: number, color: string) {
  g.fillStyle = color
  g.beginPath()
  rrect(g, x0, y0, x1, y1, r)
  g.fill()
}

function strokeRR(g: G, x0: number, y0: number, x1: number, y1: number, r: number) {
  g.beginPath()
  rrect(g, x0, y0, x1, y1, r)
  g.stroke()
}

function disc(g: G, x: number, y: number, r: number, color: string) {
  g.fillStyle = color
  g.beginPath()
  g.arc(x, y, r, 0, Math.PI * 2)
  g.fill()
}

// ---------------------------------------------------------------------------
// Copper
// ---------------------------------------------------------------------------

/** Tracks of one layer, grouped by width: corner vertices only. */
export function trackPaths(tracks: readonly Track[], layer: number, rounded: boolean) {
  const out = new Map<number, Path2D>()
  for (const t of tracks) {
    let run: { x: number, y: number }[] = []
    const flush = () => {
      if (run.length < 2) {
        run = []
        return
      }
      // keep the corners only
      const pts = [run[0]]
      for (let i = 1; i < run.length - 1; i++) {
        const a = run[i - 1]
        const b = run[i]
        const c = run[i + 1]
        if ((b.x - a.x) !== (c.x - b.x) || (b.y - a.y) !== (c.y - b.y))
          pts.push(b)
      }
      pts.push(run[run.length - 1])
      let p = out.get(t.w)
      if (!p) {
        p = new Path2D()
        out.set(t.w, p)
      }
      p.moveTo(pts[0].x, pts[0].y)
      for (let i = 1; i < pts.length - 1; i++) {
        if (rounded) {
          const a = pts[i - 1]
          const b = pts[i]
          const c = pts[i + 1]
          const r = Math.min(2.6, Math.hypot(b.x - a.x, b.y - a.y) / 2, Math.hypot(c.x - b.x, c.y - b.y) / 2)
          p.arcTo(b.x, b.y, c.x, c.y, r)
        }
        else {
          p.lineTo(pts[i].x, pts[i].y)
        }
      }
      p.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y)
      run = []
    }
    for (const c of t.cells) {
      if (c.l !== layer) {
        flush()
        continue
      }
      run.push(c)
    }
    flush()
  }
  return out
}

function padPath(p: Pad, grow: number): Path2D {
  const path = new Path2D()
  const w = p.w / 2 + grow
  const h = p.h / 2 + grow
  if (p.shape === 'round') {
    path.arc(p.px, p.py, w, 0, Math.PI * 2)
  }
  else {
    const r = p.shape === 'oval' ? Math.min(w, h) : Math.min(w, h) * 0.18 + grow
    rrect(path, p.px - w, p.py - h, p.px + w, p.py + h, r)
  }
  return path
}

export function drawPour(g: G, b: Board, pal: Palette, hatched: boolean, clearance: number) {
  const { cols, rows } = b.spec
  const x0 = 0.9
  const y0 = 0.9
  const x1 = cols - 1.9
  const y1 = rows - 1.9
  g.save()
  if (hatched) {
    g.beginPath()
    rrect(g, x0, y0, x1, y1, 1.2)
    g.clip()
    g.strokeStyle = pal.tint
    g.lineWidth = 0.34
    g.beginPath()
    const sp = 1.25
    for (let s = -rows; s < cols + rows; s += sp) {
      g.moveTo(s, 0)
      g.lineTo(s + rows, rows)
      g.moveTo(s + rows, 0)
      g.lineTo(s, rows)
    }
    g.stroke()
    g.restore()
    g.save()
    g.strokeStyle = pal.tint
    g.lineWidth = 0.5
    strokeRR(g, x0 + 0.25, y0 + 0.25, x1 - 0.25, y1 - 0.25, 1)
  }
  else {
    fillRR(g, x0, y0, x1, y1, 1.2, pal.tint)
  }
  g.restore()

  // clearance around everything that is not ground
  g.fillStyle = pal.base
  g.strokeStyle = pal.base
  g.lineCap = 'round'
  g.lineJoin = 'round'
  const top = b.tracks.filter(t => t.cells.some(c => c.l === 0))
  for (const [w, p] of trackPaths(top, 0, b.spec.routing === 'Rounded')) {
    g.lineWidth = w + clearance * 2
    g.stroke(p)
  }
  g.beginPath()
  for (const v of b.vias) {
    if (!v.gnd) {
      g.moveTo(v.x + v.d / 2 + clearance, v.y)
      g.arc(v.x, v.y, v.d / 2 + clearance, 0, Math.PI * 2)
    }
  }
  g.fill()
  for (const p of b.pads) {
    if (p.role === 'none' && p.part.kind === 'fid')
      continue
    g.fill(padPath(p, clearance))
  }
  // thermal reliefs: four spokes tie each ground pad to the pour
  g.strokeStyle = pal.tint
  g.lineCap = 'butt'
  for (const p of b.pads) {
    if (p.role !== 'gnd' || p.used)
      continue
    const diagonal = p.shape === 'round'
    const ex = p.w / 2 + clearance + 0.25
    const ey = p.h / 2 + clearance + 0.25
    g.lineWidth = Math.min(0.55, Math.min(p.w, p.h) * 0.45, p.part.kind === 'hole' ? 1.2 : 0.55)
    g.beginPath()
    for (let i = 0; i < 4; i++) {
      const a = (i + (diagonal ? 0.5 : 0)) * Math.PI / 2
      g.moveTo(p.px, p.py)
      const dx = Math.cos(a)
      const dy = Math.sin(a)
      const k = diagonal ? ex : Math.abs(dx) > 0.5 ? ex : ey
      g.lineTo(p.px + dx * k, p.py + dy * k)
    }
    g.stroke()
  }
}

export function drawTracks(g: G, b: Board, pal: Palette) {
  const rounded = b.spec.routing === 'Rounded'
  g.lineCap = 'round'
  g.lineJoin = 'round'
  if (b.router.layers > 1) {
    g.strokeStyle = pal.ghost
    for (const [w, p] of trackPaths(b.tracks, 1, rounded)) {
      g.lineWidth = w * 0.9
      g.stroke(p)
    }
  }
  const paths = trackPaths(b.tracks, 0, rounded)
  g.strokeStyle = pal.tint
  for (const [w, p] of paths) {
    g.lineWidth = w
    g.stroke(p)
  }
  // a thin catch-light on the upper-left shoulder of the raised copper
  g.save()
  g.translate(-0.045, -0.06)
  g.strokeStyle = pal.hi
  for (const [w, p] of paths) {
    g.lineWidth = w * 0.42
    g.stroke(p)
  }
  g.restore()
}

export function drawVias(g: G, b: Board, pal: Palette) {
  for (const v of b.vias) {
    disc(g, v.x, v.y, v.d / 2, pal.hi)
    disc(g, v.x + 0.03, v.y + 0.04, v.d / 2 - 0.12, pal.tint)
    disc(g, v.x, v.y, v.d * 0.2, '#0d0e0f')
  }
}

export function drawPads(g: G, b: Board, pal: Palette, holeColor: string) {
  for (const p of b.pads) {
    if (p.part.kind === 'fid') {
      disc(g, p.px, p.py, 1.55, '#b9a46c')
      disc(g, p.px, p.py, 1.5, '#8a7a52')
    }
    g.fillStyle = pal.gold
    g.fill(padPath(p, 0))
  }
  // sheen of the gold finish
  g.save()
  g.translate(-0.06, -0.08)
  g.globalAlpha = 0.55
  g.fillStyle = pal.goldHi
  for (const p of b.pads) {
    if (Math.min(p.w, p.h) < 0.5)
      continue
    const path = new Path2D()
    const w = p.w / 2 - 0.16
    const h = p.h / 2 - 0.16
    if (p.shape === 'round')
      path.arc(p.px, p.py, w, Math.PI * 0.9, Math.PI * 1.6)
    else
      rrect(path, p.px - w, p.py - h, p.px - w + Math.max(0.12, w * 0.6), p.py + h, 0.1)
    g.fill(path)
  }
  g.restore()
  for (const p of b.pads) {
    if (p.th && p.drill > 0)
      disc(g, p.px, p.py, p.drill / 2, holeColor)
  }
}

// ---------------------------------------------------------------------------
// Silkscreen
// ---------------------------------------------------------------------------

function pin1Mark(g: G, p: Part, r: number) {
  const pad = p.pads[0]
  if (!pad)
    return
  const cx = (p.body.x0 + p.body.x1) / 2
  const cy = (p.body.y0 + p.body.y1) / 2
  let dx = 0
  let dy = 0
  if (pad.side === 0)
    dx = 1
  else if (pad.side === 1)
    dy = -1
  else if (pad.side === 2)
    dx = -1
  else if (pad.side === 3)
    dy = 1
  const ext = (pad.side === 0 || pad.side === 2 ? pad.w : pad.h) / 2 + 0.9
  let x = pad.px + dx * ext
  let y = pad.py + dy * ext
  if (pad.side < 0) {
    x = pad.px + Math.sign(pad.px - cx) * 1.2
    y = pad.py + Math.sign(pad.py - cy) * 1.2
  }
  g.beginPath()
  g.arc(x, y, r, 0, Math.PI * 2)
  g.fill()
}

/** TO-220: true when the leads leave the body downwards or upwards. */
function leadsVertical(p: Part) {
  const cx = (p.body.x0 + p.body.x1) / 2
  const cy = (p.body.y0 + p.body.y1) / 2
  const px = p.pads.reduce((s, q) => s + q.px, 0) / p.pads.length
  const py = p.pads.reduce((s, q) => s + q.py, 0) / p.pads.length
  return Math.abs(py - cy) > Math.abs(px - cx)
}

export function drawSilk(g: G, b: Board, pal: Palette) {
  const lw = b.spec.labelH * 0.11
  g.strokeStyle = pal.silk
  g.fillStyle = pal.silk
  g.lineWidth = lw
  g.lineCap = 'round'
  g.lineJoin = 'round'
  for (const p of b.parts) {
    const { x0, y0, x1, y1 } = p.body
    const cx = (x0 + x1) / 2
    const cy = (y0 + y1) / 2
    const horiz = x1 - x0 >= y1 - y0
    switch (p.kind) {
      case 'qfp':
      case 'qfn':
        strokeRR(g, x0, y0, x1, y1, 0)
        pin1Mark(g, p, 0.42)
        break
      case 'soic':
      case 'tsop':
      case 'dip': {
        strokeRR(g, x0, y0, x1, y1, 0)
        // the notch sits on the end nearest pin 1
        const pad = p.pads[0]
        g.beginPath()
        if (horiz) {
          const ex = pad.px < cx ? x0 : x1
          g.arc(ex, cy, 0.9, pad.px < cx ? -Math.PI / 2 : Math.PI / 2, pad.px < cx ? Math.PI / 2 : Math.PI * 1.5)
        }
        else {
          const ey = pad.py < cy ? y0 : y1
          g.arc(cx, ey, 0.9, pad.py < cy ? 0 : Math.PI, pad.py < cy ? Math.PI : Math.PI * 2)
        }
        g.stroke()
        if (p.kind !== 'dip')
          pin1Mark(g, p, 0.36)
        break
      }
      case 'chip':
      case 'led':
      case 'diode': {
        const ex = horiz ? 0.55 : 0.4
        const ey = horiz ? 0.4 : 0.55
        let [a0, b0, a1, b1] = [x0 - ex, y0 - ey, x1 + ex, y1 + ey]
        for (const q of p.pads) {
          a0 = Math.min(a0, q.px - q.w / 2 - 0.45)
          a1 = Math.max(a1, q.px + q.w / 2 + 0.45)
          b0 = Math.min(b0, q.py - q.h / 2 - 0.45)
          b1 = Math.max(b1, q.py + q.h / 2 + 0.45)
        }
        if (p.kind === 'chip' && p.k === 0) {
          // small chips: two bars along the long sides only
          g.beginPath()
          if (horiz) {
            g.moveTo(cx - 0.5, b0)
            g.lineTo(cx + 0.5, b0)
            g.moveTo(cx - 0.5, b1)
            g.lineTo(cx + 0.5, b1)
          }
          else {
            g.moveTo(a0, cy - 0.5)
            g.lineTo(a0, cy + 0.5)
            g.moveTo(a1, cy - 0.5)
            g.lineTo(a1, cy + 0.5)
          }
          g.stroke()
        }
        else {
          strokeRR(g, a0, b0, a1, b1, 0.2)
        }
        if (p.kind !== 'chip') {
          // cathode bar on the side of pin 2 for an LED, pin 1 for a diode
          const k = p.kind === 'led' ? p.pads[1] : p.pads[0]
          g.save()
          g.lineWidth = lw * 2.2
          g.beginPath()
          if (horiz) {
            const x = k.px < cx ? a0 + lw * 1.5 : a1 - lw * 1.5
            g.moveTo(x, b0)
            g.lineTo(x, b1)
          }
          else {
            const y = k.py < cy ? b0 + lw * 1.5 : b1 - lw * 1.5
            g.moveTo(a0, y)
            g.lineTo(a1, y)
          }
          g.stroke()
          g.restore()
        }
        break
      }
      case 'sot23':
        strokeRR(g, x0, y0, x1, y1, 0)
        break
      case 'elco': {
        const r = (x1 - x0) / 2
        g.beginPath()
        g.arc(cx, cy, r, 0, Math.PI * 2)
        g.stroke()
        // the negative half is hatched, a "+" sits by the positive lead
        const neg = p.pads[1]
        const dx = Math.sign(neg.px - cx)
        const dy = Math.sign(neg.py - cy)
        g.save()
        g.beginPath()
        g.arc(cx, cy, r, 0, Math.PI * 2)
        g.clip()
        g.beginPath()
        for (let t = 0.35; t < 1; t += 0.16) {
          if (dx !== 0) {
            g.moveTo(cx + dx * r * t, cy - r)
            g.lineTo(cx + dx * r * t, cy + r)
          }
          else {
            g.moveTo(cx - r, cy + dy * r * t)
            g.lineTo(cx + r, cy + dy * r * t)
          }
        }
        g.stroke()
        g.restore()
        const pos = p.pads[0]
        const s = 0.7
        const px = pos.px - dx * 0.2 + (dx === 0 ? -2.2 : 0)
        const py = pos.py - dy * 0.2 + (dy === 0 ? -2.2 : 0)
        g.beginPath()
        g.moveTo(px - s, py)
        g.lineTo(px + s, py)
        g.moveTo(px, py - s)
        g.lineTo(px, py + s)
        g.stroke()
        break
      }
      case 'xtal':
        strokeRR(g, x0, y0, x1, y1, Math.min(x1 - x0, y1 - y0) / 2)
        break
      case 'header':
      case 'film':
        strokeRR(g, x0, y0, x1, y1, 0)
        break
      case 'terminal': {
        strokeRR(g, x0, y0, x1, y1, 0)
        g.beginPath()
        if (horiz) {
          g.moveTo(x0, y1 - 1.2)
          g.lineTo(x1, y1 - 1.2)
        }
        else {
          g.moveTo(x0 + 1.2, y0)
          g.lineTo(x0 + 1.2, y1)
        }
        g.stroke()
        break
      }
      case 'to220': {
        strokeRR(g, x0, y0, x1, y1, 0)
        g.beginPath()
        const t = 0.42
        if (leadsVertical(p)) {
          const y = p.pads[0].py > cy ? y0 + (y1 - y0) * t : y1 - (y1 - y0) * t
          g.moveTo(x0, y)
          g.lineTo(x1, y)
        }
        else {
          const x = p.pads[0].px > cx ? x0 + (x1 - x0) * t : x1 - (x1 - x0) * t
          g.moveTo(x, y0)
          g.lineTo(x, y1)
        }
        g.stroke()
        break
      }
      case 'inductor': {
        const c = 1.4
        g.beginPath()
        g.moveTo(x0 + c, y0)
        g.lineTo(x1 - c, y0)
        g.lineTo(x1, y0 + c)
        g.lineTo(x1, y1 - c)
        g.lineTo(x1 - c, y1)
        g.lineTo(x0 + c, y1)
        g.lineTo(x0, y1 - c)
        g.lineTo(x0, y0 + c)
        g.closePath()
        g.stroke()
        break
      }
      case 'trimpot':
        strokeRR(g, x0, y0, x1, y1, 0.6)
        g.beginPath()
        g.arc(cx, cy, 2.4, 0, Math.PI * 2)
        g.stroke()
        break
      case 'tp':
        g.beginPath()
        g.arc(p.pads[0].px, p.pads[0].py, 1.35, 0, Math.PI * 2)
        g.stroke()
        break
      default:
        break
    }
  }
  for (const l of b.labels) {
    g.lineWidth = lw
    strokeText(g, l.text, l.x, l.y, l.h, l.vertical)
  }
  for (const l of b.title) {
    g.lineWidth = l.h * 0.11
    strokeText(g, l.text, l.x, l.y, l.h, false)
  }
}

// ---------------------------------------------------------------------------
// Components (populated boards)
// ---------------------------------------------------------------------------

const TIN = '#c4c7cc'
const TIN_DARK = '#8e9298'
const EPOXY = '#1b1c1e'
const EPOXY_HI = '#2e3033'
const MARK = '#8f9296'
const SHADOW = 'rgba(0,0,0,0.38)'

function shadow(g: G, b: Box, r: number, round = false) {
  const ox = 0.28
  const oy = 0.38
  g.fillStyle = SHADOW
  g.beginPath()
  if (round)
    g.arc((b.x0 + b.x1) / 2 + ox, (b.y0 + b.y1) / 2 + oy, (b.x1 - b.x0) / 2, 0, Math.PI * 2)
  else
    rrect(g, b.x0 + ox, b.y0 + oy, b.x1 + ox, b.y1 + oy, r)
  g.fill()
}

function leads(g: G, p: Part, width: number, reach: number) {
  const { x0, y0, x1, y1 } = p.body
  g.fillStyle = TIN
  for (const q of p.pads) {
    if (q.side < 0)
      continue
    const w = Math.min(q.w, q.h) * width
    if (q.side === 0)
      g.fillRect(x1 - 0.1, q.py - w / 2, q.px + q.w * reach - x1, w)
    else if (q.side === 2)
      g.fillRect(q.px - q.w * reach, q.py - w / 2, x0 + 0.1 - (q.px - q.w * reach), w)
    else if (q.side === 3)
      g.fillRect(q.px - w / 2, y1 - 0.1, w, q.py + q.h * reach - y1)
    else
      g.fillRect(q.px - w / 2, q.py - q.h * reach, w, y0 + 0.1 - (q.py - q.h * reach))
  }
}

function marking(g: G, p: Part, lines: string[], maxH: number) {
  const { x0, y0, x1, y1 } = p.body
  const bw = x1 - x0
  const bh = y1 - y0
  const vertical = bh > bw * 1.15
  const along = vertical ? bh : bw
  const across = vertical ? bw : bh
  const longest = Math.max(...lines.map(l => l.length))
  const h = Math.min(maxH, across / (lines.length * 1.9), along * 0.8 / Math.max(1, longest * 0.9))
  if (h < 0.45)
    return
  g.strokeStyle = MARK
  g.lineWidth = h * 0.13
  const total = lines.length * h * 1.55 - h * 0.55
  lines.forEach((t, i) => {
    const w = textWidth(t, h)
    if (vertical)
      strokeText(g, t, (x0 + x1) / 2 - total / 2 + i * h * 1.55, (y0 + y1) / 2 - w / 2, h, true)
    else
      strokeText(g, t, (x0 + x1) / 2 - w / 2, (y0 + y1) / 2 - total / 2 + i * h * 1.55, h)
  })
}

/** A year-and-week date code ("9314"), derived from the part marking. */
function dateCode(p: Part) {
  let h = 0
  for (let i = 0; i < p.mark.length; i++)
    h = (h * 31 + p.mark.charCodeAt(i)) % 9973
  return `${88 + h % 12}${String(1 + h % 52).padStart(2, '0')}`
}

function dimple(g: G, p: Part) {
  const pad = p.pads[0]
  const { x0, y0, x1, y1 } = p.body
  const r = Math.min(0.75, (Math.min(x1 - x0, y1 - y0)) * 0.12)
  const x = Math.min(Math.max(pad.px, x0 + r * 2), x1 - r * 2)
  const y = Math.min(Math.max(pad.py, y0 + r * 2), y1 - r * 2)
  disc(g, x + 0.04, y + 0.05, r, EPOXY_HI)
  disc(g, x, y, r, '#121314')
}

function epoxy(g: G, b: Box, r: number) {
  fillRR(g, b.x0, b.y0, b.x1, b.y1, r, EPOXY)
  fillRR(g, b.x0 + 0.18, b.y0 + 0.18, b.x1 - 0.18, b.y1 - 0.18, r, EPOXY_HI)
  fillRR(g, b.x0 + 0.3, b.y0 + 0.32, b.x1 - 0.22, b.y1 - 0.22, r, EPOXY)
}

const LED = ['#e0412f', '#46c25a', '#f2a93b', '#3d8ef0']
const PLASTIC = ['#2f7d4b', '#2a5a9b']
const FILM = ['#b83a2f', '#d7b33d', '#5f7591']
const SLEEVE = ['#1f2b4d', '#141516']

export function drawParts(g: G, b: Board) {
  for (const p of b.parts) {
    if (!p.populated)
      continue
    const bx = p.body
    const { x0, y0, x1, y1 } = bx
    const cx = (x0 + x1) / 2
    const cy = (y0 + y1) / 2
    const horiz = x1 - x0 >= y1 - y0
    switch (p.kind) {
      case 'qfp':
      case 'soic':
      case 'tsop':
        leads(g, p, 0.62, 0.32)
        shadow(g, bx, 0.3)
        epoxy(g, bx, 0.3)
        dimple(g, p)
        marking(g, p, [p.mark, dateCode(p)], 1.3)
        break
      case 'qfn':
        shadow(g, bx, 0.25)
        epoxy(g, bx, 0.25)
        dimple(g, p)
        marking(g, p, [p.mark], 1.1)
        break
      case 'dip':
        shadow(g, bx, 0.4)
        epoxy(g, bx, 0.4)
        dimple(g, p)
        marking(g, p, [p.mark, dateCode(p)], 1.6)
        break
      case 'sot23':
        leads(g, p, 0.55, 0.2)
        shadow(g, bx, 0.2)
        fillRR(g, x0, y0, x1, y1, 0.2, EPOXY)
        break
      case 'chip':
      case 'led': {
        shadow(g, bx, 0.12)
        const body = p.kind === 'led' ? '#ecebe4' : p.sub === 'r' ? '#121212' : '#b58b5a'
        fillRR(g, x0, y0, x1, y1, 0.12, p.sub === 'r' ? '#e9e8e2' : body)
        const e = (horiz ? x1 - x0 : y1 - y0) * 0.24
        if (p.sub === 'r') {
          if (horiz)
            fillRR(g, x0 + e, y0 + 0.08, x1 - e, y1 - 0.08, 0.05, body)
          else
            fillRR(g, x0 + 0.08, y0 + e, x1 - 0.08, y1 - e, 0.05, body)
        }
        if (p.kind === 'led')
          disc(g, cx, cy, Math.min(x1 - x0, y1 - y0) * 0.32, LED[p.variant % LED.length])
        g.fillStyle = TIN
        if (horiz) {
          g.fillRect(x0, y0, e, y1 - y0)
          g.fillRect(x1 - e, y0, e, y1 - y0)
        }
        else {
          g.fillRect(x0, y0, x1 - x0, e)
          g.fillRect(x0, y1 - e, x1 - x0, e)
        }
        if (p.sub === 'r' && p.k === 1)
          marking(g, { ...p, body: horiz ? { x0: x0 + e, y0, x1: x1 - e, y1 } : { x0, y0: y0 + e, x1, y1: y1 - e } }, [String(100 + (p.id * 37) % 900)], 0.9)
        break
      }
      case 'diode': {
        shadow(g, bx, 0.15)
        g.fillStyle = TIN_DARK
        for (const q of p.pads)
          g.fillRect(q.px - q.w * 0.3, q.py - q.h * 0.3, q.w * 0.6, q.h * 0.6)
        fillRR(g, x0 + 0.6, y0, x1 - 0.6, y1, 0.2, EPOXY)
        const k = p.pads[0]
        g.fillStyle = '#9b9ea3'
        if (horiz)
          g.fillRect(k.px < cx ? x0 + 1.1 : x1 - 1.9, y0 + 0.15, 0.8, y1 - y0 - 0.3)
        else
          g.fillRect(x0 + 0.15, k.py < cy ? y0 + 1.1 : y1 - 1.9, x1 - x0 - 0.3, 0.8)
        break
      }
      case 'elco': {
        const r = (x1 - x0) / 2
        shadow(g, bx, 0, true)
        disc(g, cx, cy, r, SLEEVE[p.variant % SLEEVE.length])
        // polarity stripe on the sleeve, on the negative side
        const neg = p.pads[1]
        const a = Math.atan2(neg.py - cy, neg.px - cx)
        g.fillStyle = '#c9ced8'
        g.beginPath()
        g.arc(cx, cy, r, a - 0.5, a + 0.5)
        g.arc(cx, cy, r * 0.84, a + 0.5, a - 0.5, true)
        g.closePath()
        g.fill()
        const grad = g.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.05, cx, cy, r * 0.8)
        grad.addColorStop(0, '#eef0f2')
        grad.addColorStop(1, '#9fa4aa')
        g.fillStyle = grad
        g.beginPath()
        g.arc(cx, cy, r * 0.8, 0, Math.PI * 2)
        g.fill()
        g.strokeStyle = '#7d828a'
        g.lineWidth = r * 0.07
        g.beginPath()
        g.moveTo(cx - r * 0.45, cy)
        g.lineTo(cx + r * 0.45, cy)
        g.moveTo(cx, cy - r * 0.45)
        g.lineTo(cx, cy + r * 0.45)
        g.stroke()
        break
      }
      case 'xtal': {
        shadow(g, bx, Math.min(x1 - x0, y1 - y0) / 2)
        const r = Math.min(x1 - x0, y1 - y0) / 2
        fillRR(g, x0, y0, x1, y1, r, '#9da2a8')
        fillRR(g, x0 + 0.3, y0 + 0.3, x1 - 0.3, y1 - 0.3, r - 0.3, '#d3d6da')
        marking(g, { ...p, body: { x0: x0 + r * 0.6, y0, x1: x1 - r * 0.6, y1 } }, ['16.000'], 1)
        break
      }
      case 'header': {
        shadow(g, bx, 0.2)
        fillRR(g, x0, y0, x1, y1, 0.2, '#18191b')
        g.strokeStyle = '#2c2e31'
        g.lineWidth = 0.2
        for (const q of p.pads)
          strokeRR(g, q.px - 2, q.py - 2, q.px + 2, q.py + 2, 0.3)
        for (const q of p.pads) {
          fillRR(g, q.px - 0.62, q.py - 0.62, q.px + 0.62, q.py + 0.62, 0.1, '#b48f3f')
          fillRR(g, q.px - 0.38, q.py - 0.38, q.px + 0.38, q.py + 0.38, 0.05, '#e8c873')
        }
        break
      }
      case 'to220': {
        // metal tab on the far side, plastic body over the leads
        const tabFrac = 0.42
        let tab: Box
        let body: Box
        const vert = leadsVertical(p)
        const near = vert ? (p.pads[0].py > cy ? 1 : -1) : (p.pads[0].px > cx ? 1 : -1)
        if (vert) {
          const yt = near > 0 ? y0 + (y1 - y0) * tabFrac : y1 - (y1 - y0) * tabFrac
          tab = near > 0 ? { x0, y0, x1, y1: yt } : { x0, y0: yt, x1, y1 }
          body = near > 0 ? { x0, y0: yt, x1, y1 } : { x0, y0, x1, y1: yt }
        }
        else {
          const xt = near > 0 ? x0 + (x1 - x0) * tabFrac : x1 - (x1 - x0) * tabFrac
          tab = near > 0 ? { x0, y0, x1: xt, y1 } : { x0: xt, y0, x1, y1 }
          body = near > 0 ? { x0: xt, y0, x1, y1 } : { x0, y0, x1: xt, y1 }
        }
        g.fillStyle = TIN
        for (const q of p.pads) {
          if (vert)
            g.fillRect(q.px - 0.45, Math.min(q.py, near > 0 ? y1 : y0), 0.9, Math.abs(q.py - (near > 0 ? y1 : y0)))
          else
            g.fillRect(Math.min(q.px, near > 0 ? x1 : x0), q.py - 0.45, Math.abs(q.px - (near > 0 ? x1 : x0)), 0.9)
        }
        shadow(g, bx, 0.2)
        fillRR(g, tab.x0, tab.y0, tab.x1, tab.y1, 0.4, '#a9adb3')
        fillRR(g, tab.x0 + 0.3, tab.y0 + 0.3, tab.x1 - 0.3, tab.y1 - 0.3, 0.3, '#ccd0d4')
        disc(g, (tab.x0 + tab.x1) / 2, (tab.y0 + tab.y1) / 2, 1.6, '#2a2b2d')
        epoxy(g, body, 0.3)
        marking(g, { ...p, body }, [p.mark], 1.4)
        break
      }
      case 'inductor':
        shadow(g, bx, 1)
        fillRR(g, x0, y0, x1, y1, 1, '#2c2e30')
        fillRR(g, x0 + 0.5, y0 + 0.5, x1 - 0.5, y1 - 0.5, 0.8, '#3a3d40')
        marking(g, p, [String(10 * (1 + (p.id % 9))).concat('0')], 2)
        break
      case 'terminal': {
        shadow(g, bx, 0.3)
        const c = PLASTIC[p.variant % PLASTIC.length]
        fillRR(g, x0, y0, x1, y1, 0.3, c)
        g.fillStyle = 'rgba(255,255,255,0.12)'
        g.fillRect(x0 + 0.3, y0 + 0.3, x1 - x0 - 0.6, 0.6)
        for (const q of p.pads) {
          disc(g, q.px, q.py, 1.9, '#9a9ea4')
          disc(g, q.px, q.py, 1.55, '#d0d3d7')
          g.strokeStyle = '#55595f'
          g.lineWidth = 0.45
          g.beginPath()
          g.moveTo(q.px - 1.2, q.py + 0.5)
          g.lineTo(q.px + 1.2, q.py - 0.5)
          g.stroke()
        }
        break
      }
      case 'trimpot':
        shadow(g, bx, 0.6)
        fillRR(g, x0, y0, x1, y1, 0.6, '#2c5fae')
        disc(g, cx, cy, 3.3, '#e9e4d6')
        disc(g, cx, cy, 2.5, '#d6cfbb')
        g.strokeStyle = '#8a8270'
        g.lineWidth = 0.5
        g.beginPath()
        g.moveTo(cx - 1.8, cy - 0.7)
        g.lineTo(cx + 1.8, cy + 0.7)
        g.stroke()
        break
      case 'film': {
        shadow(g, bx, 0.6)
        const c = FILM[p.variant % FILM.length]
        fillRR(g, x0, y0, x1, y1, 0.7, c)
        g.fillStyle = 'rgba(255,255,255,0.14)'
        if (horiz)
          g.fillRect(x0 + 0.5, y0 + 0.35, x1 - x0 - 1, 0.5)
        else
          g.fillRect(x0 + 0.35, y0 + 0.5, 0.5, y1 - y0 - 1)
        g.strokeStyle = 'rgba(255,255,255,0.75)'
        marking(g, p, ['104K'], 1.2)
        break
      }
      default:
        break
    }
  }
}
