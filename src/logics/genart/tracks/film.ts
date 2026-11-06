// Film furniture for the "Tracks" series: seven-segment frame counters,
// fiducial crosses, edge marks, scratches, dust and grain. Drawn with
// strokes only (no fonts), every size a fraction of the short side S.

import type { Rng } from '../random'
import { gaussian, int, range } from '../random'

// Segments a b c d e f g of each digit.
const SEG = ['abcdef', 'bc', 'abged', 'abgcd', 'fgbc', 'afgcd', 'afgedc', 'abc', 'abcdefg', 'abcfgd']

/** Draws a string of digits (spaces allowed) as seven-segment numerals, top left at (x, y). */
export function digits(g: CanvasRenderingContext2D, text: string, x: number, y: number, h: number) {
  const w = h * 0.5
  const pitch = w * 1.6
  g.lineWidth = Math.max(0.6, h * 0.13)
  g.lineCap = 'round'
  g.beginPath()
  for (let i = 0; i < text.length; i++) {
    const d = text.charCodeAt(i) - 48
    if (d < 0 || d > 9)
      continue
    const X = x + i * pitch
    // slight italic slant, as on a camera data box
    const sk = h * 0.08
    const P = {
      tl: [X + sk, y],
      tr: [X + w + sk, y],
      ml: [X + sk / 2, y + h / 2],
      mr: [X + w + sk / 2, y + h / 2],
      bl: [X, y + h],
      br: [X + w, y + h],
    } as const
    const seg: Record<string, readonly [readonly number[], readonly number[]]> = {
      a: [P.tl, P.tr],
      b: [P.tr, P.mr],
      c: [P.mr, P.br],
      d: [P.bl, P.br],
      e: [P.ml, P.bl],
      f: [P.tl, P.ml],
      g: [P.ml, P.mr],
    }
    for (const s of SEG[d]) {
      const [a, b] = seg[s]
      g.moveTo(a[0], a[1])
      g.lineTo(b[0], b[1])
    }
  }
  g.stroke()
}

export function digitsWidth(n: number, h: number) {
  return n * h * 0.5 * 1.6
}

/** Engraved fiducial crosses on a lattice anchored at the canvas centre. */
export function fiducials(g: CanvasRenderingContext2D, W: number, H: number, S: number, inset: number) {
  const step = 0.25 * S
  const arm = 0.013 * S
  const gap = 0.0025 * S
  const nx = Math.ceil(W / step)
  const ny = Math.ceil(H / step)
  g.lineWidth = Math.max(0.7, 0.0017 * S)
  g.lineCap = 'butt'
  g.beginPath()
  const rings: [number, number][] = []
  for (let j = -ny; j <= ny; j++) {
    for (let i = -nx; i <= nx; i++) {
      const x = W / 2 + (i + 0.5) * step
      const y = H / 2 + (j + 0.5) * step
      if (x < inset + arm * 2 || x > W - inset - arm * 2 || y < inset + arm * 2 || y > H - inset - arm * 2)
        continue
      g.moveTo(x - arm, y)
      g.lineTo(x - gap, y)
      g.moveTo(x + gap, y)
      g.lineTo(x + arm, y)
      g.moveTo(x, y - arm)
      g.lineTo(x, y - gap)
      g.moveTo(x, y + gap)
      g.lineTo(x, y + arm)
      // a few reference marks carry a ring (fixed by lattice position, not by the canvas size)
      if (((i * 7 + j * 3) % 5 + 5) % 5 === 0)
        rings.push([x, y])
    }
  }
  g.stroke()
  g.beginPath()
  for (const [x, y] of rings) {
    g.moveTo(x + arm * 0.55, y)
    g.arc(x, y, arm * 0.55, 0, Math.PI * 2)
  }
  g.lineWidth = Math.max(0.5, 0.0011 * S)
  g.stroke()
}

/**
 * Scratches along the film transport direction (vertical), positions in square
 * units over a fixed range so the square part is the same at every aspect.
 */
export function scratches(g: CanvasRenderingContext2D, n: number, ox: number, oy: number, S: number, r: Rng, color: string) {
  g.strokeStyle = color
  g.lineCap = 'round'
  for (let i = 0; i < n; i++) {
    const x0 = range(r, -1.3, 2.3)
    const full = r() < 0.6
    const ya = full ? -1.3 : range(r, -1.3, 1.6)
    const yb = full ? 2.3 : ya + range(r, 0.15, 0.9)
    const amp = range(r, 0.0005, 0.004)
    const fr = range(r, 1.5, 6)
    const ph = range(r, 0, 6.28)
    const lw = range(r, 0.0004, 0.0016)
    const alpha = range(r, 0.18, 0.55)
    const X0 = ox + x0 * S
    if (X0 < -0.02 * S || X0 > ox * 2 + S + 0.02 * S)
      continue
    g.globalAlpha = alpha
    g.lineWidth = Math.max(0.5, lw * S)
    g.beginPath()
    const steps = 48
    for (let k = 0; k <= steps; k++) {
      const y = ya + ((yb - ya) * k) / steps
      const x = x0 + amp * Math.sin(y * fr + ph)
      if (k === 0)
        g.moveTo(ox + x * S, oy + y * S)
      else
        g.lineTo(ox + x * S, oy + y * S)
    }
    g.stroke()
  }
  g.globalAlpha = 1
}

/** Dust specks and a few hairs. */
export function dust(g: CanvasRenderingContext2D, specks: number, hairs: number, ox: number, oy: number, S: number, r: Rng, color: string) {
  g.fillStyle = color
  g.strokeStyle = color
  for (let i = 0; i < specks; i++) {
    const x = range(r, -1.3, 2.3)
    const y = range(r, -1.3, 2.3)
    const n = int(r, 1, 4)
    const rad = range(r, 0.0008, 0.0035)
    g.globalAlpha = range(r, 0.35, 0.85)
    g.beginPath()
    for (let k = 0; k < n; k++) {
      const X = ox + (x + gaussian(r) * rad) * S
      const Y = oy + (y + gaussian(r) * rad) * S
      const rr = Math.max(0.5, rad * range(r, 0.4, 1) * S)
      g.moveTo(X + rr, Y)
      g.arc(X, Y, rr, 0, Math.PI * 2)
    }
    g.fill()
  }
  for (let i = 0; i < hairs; i++) {
    let x = range(r, -1.1, 2.1)
    let y = range(r, -1.1, 2.1)
    let a = range(r, 0, Math.PI * 2)
    const len = range(r, 0.04, 0.16)
    const turn = range(r, -40, 40)
    g.globalAlpha = range(r, 0.4, 0.8)
    g.lineWidth = Math.max(0.5, 0.0009 * S)
    g.beginPath()
    g.moveTo(ox + x * S, oy + y * S)
    for (let k = 0; k < 30; k++) {
      a += (turn * len) / 30 + gaussian(r) * 0.08
      x += (Math.cos(a) * len) / 30
      y += (Math.sin(a) * len) / 30
      g.lineTo(ox + x * S, oy + y * S)
    }
    g.stroke()
  }
  g.globalAlpha = 1
}

/** Photographic grain: faint specks, density fixed per unit area of the short side. */
export function grain(g: CanvasRenderingContext2D, W: number, H: number, S: number, r: Rng, color: string, perUnit: number) {
  const n = Math.round(perUnit * (W / S) * (H / S))
  g.fillStyle = color
  const d = Math.max(1, 0.0012 * S)
  for (let a = 0; a < 3; a++) {
    g.globalAlpha = 0.05 + a * 0.05
    g.beginPath()
    for (let i = 0; i < n / 3; i++)
      g.rect(r() * W, r() * H, d, d)
    g.fill()
  }
  g.globalAlpha = 1
}
