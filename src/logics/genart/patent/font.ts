// A small single-stroke vector font for the lettering of the patent sheets.
//
// Capitals, digits and a few punctuation marks, designed on a grid six units
// high (y down, baseline at 6). Curves are elliptical arcs sampled into
// polylines once, at module load. Nothing here is a system font: every letter
// is a path stroked with the pen, like the engraved lettering of the period.

type Poly = number[]

interface Glyph {
  w: number
  strokes: Poly[]
}

const D = Math.PI / 180

/** Elliptical arc from a0 to a1 (degrees, y down: -90 is the top). */
function arc(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n = 14): Poly {
  const out: Poly = []
  for (let i = 0; i <= n; i++) {
    const a = (a0 + (a1 - a0) * i / n) * D
    out.push(cx + rx * Math.cos(a), cy + ry * Math.sin(a))
  }
  return out
}

const cat = (...ps: Poly[]): Poly => ([] as number[]).concat(...ps)

/** A "D" bowl from (x, y0) to (x, y1), bulging right to x + w. */
function bowl(x: number, y0: number, y1: number, w: number): Poly {
  const r = (y1 - y0) / 2
  return cat([x, y0], arc(x + w - r, y0 + r, r, r, -90, 90, 12), [x, y1])
}

const G: Record<string, Glyph> = {
  'A': { w: 4, strokes: [[0, 6, 2, 0, 4, 6], [0.7, 4, 3.3, 4]] },
  'B': { w: 3.8, strokes: [[0, 0, 0, 6], bowl(0, 0, 2.9, 3.3), bowl(0, 2.9, 6, 3.8)] },
  'C': { w: 4, strokes: [arc(2.2, 3, 2.1, 3, -40, -320, 20)] },
  'D': { w: 4, strokes: [[0, 0, 0, 6], cat([0, 0, 1.2, 0], arc(1.2, 3, 2.8, 3, -90, 90, 16), [0, 6])] },
  'E': { w: 3.6, strokes: [[3.6, 0, 0, 0, 0, 6, 3.6, 6], [0, 2.9, 2.9, 2.9]] },
  'F': { w: 3.5, strokes: [[3.5, 0, 0, 0, 0, 6], [0, 2.9, 2.8, 2.9]] },
  'G': { w: 4.2, strokes: [cat(arc(2.2, 3, 2.1, 3, -40, -355, 20), [4.3, 6, 4.3, 3.4, 2.5, 3.4])] },
  'H': { w: 4, strokes: [[0, 0, 0, 6], [4, 0, 4, 6], [0, 3, 4, 3]] },
  'I': { w: 0.4, strokes: [[0.2, 0, 0.2, 6]] },
  'J': { w: 3, strokes: [cat([3, 0, 3, 4.5], arc(1.5, 4.5, 1.5, 1.5, 0, 180, 10))] },
  'K': { w: 3.8, strokes: [[0, 0, 0, 6], [3.8, 0, 0, 3.8], [1.3, 2.6, 3.9, 6]] },
  'L': { w: 3.4, strokes: [[0, 0, 0, 6, 3.4, 6]] },
  'M': { w: 4.8, strokes: [[0, 6, 0.2, 0, 2.4, 4.6, 4.6, 0, 4.8, 6]] },
  'N': { w: 4, strokes: [[0, 6, 0, 0, 4, 6, 4, 0]] },
  'O': { w: 4.4, strokes: [arc(2.2, 3, 2.2, 3, 0, 360, 24)] },
  'P': { w: 3.7, strokes: [[0, 6, 0, 0], bowl(0, 0, 3.2, 3.7)] },
  'Q': { w: 4.4, strokes: [arc(2.2, 3, 2.2, 3, 0, 360, 24), [2.7, 4.4, 4.5, 6.3]] },
  'R': { w: 3.8, strokes: [[0, 6, 0, 0], bowl(0, 0, 3.2, 3.7), [2.1, 3.2, 3.9, 6]] },
  'S': { w: 3.8, strokes: [cat(arc(1.9, 1.5, 1.8, 1.5, -15, -270, 12), arc(1.95, 4.5, 1.9, 1.5, -90, 165, 12))] },
  'T': { w: 4, strokes: [[0, 0, 4, 0], [2, 0, 2, 6]] },
  'U': { w: 4, strokes: [cat([0, 0, 0, 4], arc(2, 4, 2, 2, 180, 0, 12), [4, 0])] },
  'V': { w: 4, strokes: [[0, 0, 2, 6, 4, 0]] },
  'W': { w: 5.4, strokes: [[0, 0, 1.3, 6, 2.7, 1.2, 4.1, 6, 5.4, 0]] },
  'X': { w: 4, strokes: [[0, 0, 4, 6], [4, 0, 0, 6]] },
  'Y': { w: 4, strokes: [[0, 0, 2, 3, 4, 0], [2, 3, 2, 6]] },
  'Z': { w: 4, strokes: [[0, 0, 4, 0, 0, 6, 4, 6]] },
  '0': { w: 3.6, strokes: [arc(1.8, 3, 1.8, 3, 0, 360, 24)] },
  '1': { w: 2.2, strokes: [[0.2, 1.3, 1.6, 0, 1.6, 6]] },
  '2': { w: 3.6, strokes: [cat(arc(1.8, 1.75, 1.75, 1.75, -165, 35, 12), [0, 6, 3.6, 6])] },
  '3': { w: 3.6, strokes: [cat(arc(1.75, 1.5, 1.6, 1.5, -160, 90, 12), arc(1.75, 4.4, 1.85, 1.6, -90, 160, 12))] },
  '4': { w: 3.8, strokes: [[2.8, 6, 2.8, 0, 0, 4.2, 3.8, 4.2]] },
  '5': { w: 3.6, strokes: [cat([3.3, 0, 0.5, 0, 0.25, 2.8], arc(1.8, 4.2, 1.8, 1.8, -125, 155, 14))] },
  '6': { w: 3.6, strokes: [arc(1.8, 4.2, 1.8, 1.8, 0, 360, 18), arc(3.6, 4.2, 3.6, 4.2, -95, -180, 10)] },
  '7': { w: 3.6, strokes: [[0, 0, 3.6, 0, 1.2, 6]] },
  '8': { w: 3.6, strokes: [arc(1.8, 1.45, 1.5, 1.45, 0, 360, 16), arc(1.8, 4.4, 1.8, 1.6, 0, 360, 18)] },
  '9': { w: 3.6, strokes: [arc(1.8, 1.8, 1.8, 1.8, 0, 360, 18), arc(0, 1.8, 3.6, 4.2, 0, 85, 10)] },
  '.': { w: 0.6, strokes: [arc(0.3, 5.7, 0.3, 0.3, 0, 360, 6)] },
  ',': { w: 0.8, strokes: [[0.45, 5.4, 0.5, 6, 0.1, 7]] },
  ':': { w: 0.6, strokes: [arc(0.3, 2.2, 0.3, 0.3, 0, 360, 6), arc(0.3, 5.7, 0.3, 0.3, 0, 360, 6)] },
  '-': { w: 2.4, strokes: [[0, 3.3, 2.4, 3.3]] },
  '(': { w: 1.4, strokes: [arc(5.6, 3, 5.2, 6.6, 152, 208, 12)] },
  ')': { w: 1.4, strokes: [arc(-4.2, 3, 5.2, 6.6, -28, 28, 12)] },
  '\'': { w: 0.6, strokes: [[0.4, 0, 0.2, 1.6]] },
}

const SPACE = 2.6
const TRACK = 1.3

/** Width of a string in pixels for a cap height of `size`. */
export function textWidth(text: string, size: number): number {
  const k = size / 6
  let w = 0
  for (const ch of text) {
    const gl = G[ch]
    w += (gl ? gl.w : SPACE) + TRACK
  }
  return Math.max(0, w - TRACK) * k
}

export interface TextOpts {
  align?: 'left' | 'center' | 'right'
  /** Horizontal shear, as a fraction of the height (italic lettering). */
  slant?: number
  /** Stroke width as a fraction of the cap height. */
  weight?: number
}

/**
 * Strokes `text` with its baseline at y. The caller sets strokeStyle; the
 * path is built and stroked here, in one call.
 */
export function drawText(g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, opts: TextOpts = {}) {
  const k = size / 6
  const slant = opts.slant ?? 0
  const w = textWidth(text, size)
  let cx = x
  if (opts.align === 'center')
    cx = x - w / 2
  else if (opts.align === 'right')
    cx = x - w
  g.lineWidth = size * (opts.weight ?? 0.1)
  g.beginPath()
  for (const ch of text) {
    const gl = G[ch]
    if (!gl) {
      cx += (SPACE + TRACK) * k
      continue
    }
    for (const s of gl.strokes) {
      for (let i = 0; i < s.length; i += 2) {
        const px = cx + (s[i] + slant * (6 - s[i + 1])) * k
        const py = y + (s[i + 1] - 6) * k
        if (i === 0)
          g.moveTo(px, py)
        else
          g.lineTo(px, py)
      }
    }
    cx += (gl.w + TRACK) * k
  }
  g.stroke()
}
