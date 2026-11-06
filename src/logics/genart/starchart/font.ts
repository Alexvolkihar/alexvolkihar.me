// A single-stroke vector alphabet for the lettering of the star charts.
//
// Capitals, digits, an "h" for hours, the degree sign, a few signs and the
// first Greek lowercase letters (for the Bayer-style star letters). Glyphs sit
// on a grid six units high (y down, baseline at 6); curves are elliptical arcs
// sampled into polylines once, at module load. No system font is used: every
// label is a path stroked with the pen, like engraved or plotted lettering.

type Poly = number[]

interface Glyph {
  w: number
  s: Poly[]
}

const RAD = Math.PI / 180

/** Elliptical arc from a0 to a1 in degrees (y down: -90 is the top). */
function arc(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n = 14): Poly {
  const out: Poly = []
  for (let i = 0; i <= n; i++) {
    const a = (a0 + (a1 - a0) * i / n) * RAD
    out.push(cx + rx * Math.cos(a), cy + ry * Math.sin(a))
  }
  return out
}

const join = (...ps: Poly[]): Poly => ([] as number[]).concat(...ps)

/** A right-bulging bowl from (x, y0) down to (x, y1), reaching x + w. */
function bowl(x: number, y0: number, y1: number, w: number): Poly {
  const r = (y1 - y0) / 2
  return join([x, y0], arc(x + w - r, y0 + r, r, r, -90, 90, 10), [x, y1])
}

const GLYPHS: Record<string, Glyph> = {
  'A': { w: 4.2, s: [[0, 6, 2.1, 0, 4.2, 6], [0.8, 4, 3.4, 4]] },
  'B': { w: 3.7, s: [[0, 0, 0, 6], bowl(0, 0, 2.9, 3.2), bowl(0, 2.9, 6, 3.7)] },
  'C': { w: 4, s: [arc(2.3, 3, 2.2, 3, -35, -325, 18)] },
  'D': { w: 4, s: [join([0, 0, 0, 6, 1.3, 6], arc(1.3, 3, 2.7, 3, 90, -90, 14), [0, 0])] },
  'E': { w: 3.5, s: [[3.5, 0, 0, 0, 0, 6, 3.5, 6], [0, 2.9, 2.7, 2.9]] },
  'F': { w: 3.4, s: [[3.4, 0, 0, 0, 0, 6], [0, 2.9, 2.7, 2.9]] },
  'G': { w: 4.3, s: [join(arc(2.3, 3, 2.2, 3, -35, -350, 18), [4.4, 6, 4.4, 3.5, 2.6, 3.5])] },
  'H': { w: 4, s: [[0, 0, 0, 6], [4, 0, 4, 6], [0, 3, 4, 3]] },
  'I': { w: 0.6, s: [[0.3, 0, 0.3, 6]] },
  'J': { w: 3, s: [join([3, 0, 3, 4.4], arc(1.5, 4.4, 1.5, 1.6, 0, 160, 10))] },
  'K': { w: 3.8, s: [[0, 0, 0, 6], [3.8, 0, 0, 3.9], [1.4, 2.6, 3.9, 6]] },
  'L': { w: 3.3, s: [[0, 0, 0, 6, 3.3, 6]] },
  'M': { w: 4.8, s: [[0, 6, 0, 0, 2.4, 4.4, 4.8, 0, 4.8, 6]] },
  'N': { w: 4, s: [[0, 6, 0, 0, 4, 6, 4, 0]] },
  'O': { w: 4.5, s: [arc(2.25, 3, 2.25, 3, 0, 360, 24)] },
  'P': { w: 3.6, s: [[0, 6, 0, 0], bowl(0, 0, 3.1, 3.6)] },
  'Q': { w: 4.5, s: [arc(2.25, 3, 2.25, 3, 0, 360, 24), [2.8, 4.5, 4.6, 6.4]] },
  'R': { w: 3.8, s: [[0, 6, 0, 0], bowl(0, 0, 3.1, 3.6), [2, 3.1, 3.9, 6]] },
  'S': { w: 3.7, s: [join(arc(1.85, 1.5, 1.8, 1.5, -20, -270, 12), arc(1.85, 4.5, 1.85, 1.5, -90, 160, 12))] },
  'T': { w: 4, s: [[0, 0, 4, 0], [2, 0, 2, 6]] },
  'U': { w: 4, s: [join([0, 0, 0, 4], arc(2, 4, 2, 2, 180, 0, 12), [4, 0])] },
  'V': { w: 4.2, s: [[0, 0, 2.1, 6, 4.2, 0]] },
  'W': { w: 5.6, s: [[0, 0, 1.4, 6, 2.8, 1.4, 4.2, 6, 5.6, 0]] },
  'X': { w: 4, s: [[0, 0, 4, 6], [4, 0, 0, 6]] },
  'Y': { w: 4, s: [[0, 0, 2, 3.1, 4, 0], [2, 3.1, 2, 6]] },
  'Z': { w: 3.8, s: [[0, 0, 3.8, 0, 0, 6, 3.8, 6]] },
  '0': { w: 3.6, s: [arc(1.8, 3, 1.8, 3, 0, 360, 22)] },
  '1': { w: 2, s: [[0.3, 1.2, 1.6, 0, 1.6, 6]] },
  '2': { w: 3.6, s: [join(arc(1.8, 1.8, 1.8, 1.8, 195, 385, 12), [0, 6, 3.7, 6])] },
  '3': { w: 3.6, s: [join(arc(1.75, 1.55, 1.7, 1.55, -155, 90, 12), arc(1.75, 4.4, 1.85, 1.6, -90, 155, 12))] },
  '4': { w: 3.8, s: [[2.9, 6, 2.9, 0, 0, 4.2, 3.8, 4.2]] },
  '5': { w: 3.6, s: [join([3.4, 0, 0.4, 0, 0.2, 2.8], arc(1.75, 4.1, 1.85, 1.9, -135, 150, 12))] },
  '6': { w: 3.7, s: [arc(1.85, 4.1, 1.85, 1.9, 0, 360, 18), [0.05, 4, 0.5, 1.6, 1.7, 0.1, 3.2, 0.4]] },
  '7': { w: 3.6, s: [[0, 0, 3.6, 0, 1.3, 6]] },
  '8': { w: 3.7, s: [arc(1.85, 1.5, 1.55, 1.5, 0, 360, 16), arc(1.85, 4.45, 1.85, 1.55, 0, 360, 18)] },
  '9': { w: 3.7, s: [arc(1.85, 1.9, 1.85, 1.9, 0, 360, 18), [3.65, 2, 3.2, 4.4, 2, 5.9, 0.5, 5.6]] },
  'h': { w: 3.2, s: [[0, 0, 0, 6], join([0, 3.8], arc(1.6, 3.7, 1.6, 1.4, 180, 360, 8), [3.2, 6])] },
  '°': { w: 1.6, s: [arc(0.8, 0.8, 0.8, 0.8, 0, 360, 10)] },
  '+': { w: 2.8, s: [[0, 3, 2.8, 3], [1.4, 1.6, 1.4, 4.4]] },
  '-': { w: 2.4, s: [[0, 3, 2.4, 3]] },
  '.': { w: 0.5, s: [[0.25, 5.6, 0.25, 6]] },
  '·': { w: 0.5, s: [[0.25, 2.8, 0.25, 3.2]] },
  '\'': { w: 0.5, s: [[0.25, 0, 0.25, 1.6]] },
  'α': { w: 3.8, s: [arc(1.7, 4, 1.7, 2, 20, 340, 16), [3.1, 2.3, 3, 4.4, 3.8, 6]] },
  'β': { w: 3.4, s: [[0.3, 7.6, 0.3, 1], join(arc(1.55, 1.1, 1.25, 1.1, 180, 360, 8), arc(1.6, 2.8, 1.3, 0.6, -90, 90, 6)), join([1.5, 3.4], arc(1.55, 4.7, 1.85, 1.3, -90, 90, 10), [0.3, 5.6])] },
  'γ': { w: 3.6, s: [[0, 2.2, 1.1, 2, 1.9, 5.6, 1.6, 7.6, 1.3, 6.2, 3.6, 2]] },
  'δ': { w: 3.4, s: [arc(1.7, 4.5, 1.7, 1.55, 0, 360, 16), [2.6, 3.1, 0.9, 1.6, 1.4, 0.3, 3.2, 0.5]] },
  'ε': { w: 3.4, s: [[3.3, 2.4, 2, 2, 0.6, 2.5, 1.4, 4, 0.3, 4.8, 0.8, 5.8, 2.2, 6.1, 3.4, 5.6], [1.4, 4, 2.7, 4]] },
}

const SPACE = 2.4
const GAP = 1.2

/** Width of `text` in grid units, before scaling. */
export function textUnits(text: string, track = 0): number {
  let w = 0
  for (const ch of text) {
    const gl = GLYPHS[ch]
    w += (gl ? gl.w : SPACE) + GAP + track
  }
  return Math.max(0, w - GAP - track)
}

/** Width in pixels of `text` drawn with cap height `size`. */
export function textWidth(text: string, size: number, track = 0): number {
  return textUnits(text, track) * size / 6
}

export type Align = 'left' | 'center' | 'right'

/**
 * Add the strokes of `text` to the current path. (x, y) is the anchor on the
 * vertical middle of the capitals; `size` is the cap height in pixels and
 * `track` an extra letter spacing in grid units. The caller strokes.
 */
export function textPath(g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, align: Align = 'left', track = 0) {
  const k = size / 6
  const w = textUnits(text, track) * k
  let cx = x
  if (align === 'center')
    cx -= w / 2
  else if (align === 'right')
    cx -= w
  const top = y - size / 2
  for (const ch of text) {
    const gl = GLYPHS[ch]
    if (gl) {
      for (const p of gl.s) {
        g.moveTo(cx + p[0] * k, top + p[1] * k)
        for (let i = 2; i < p.length; i += 2)
          g.lineTo(cx + p[i] * k, top + p[i + 1] * k)
      }
    }
    cx += ((gl ? gl.w : SPACE) + GAP + track) * k
  }
}

/** Stroke `text` on its own path with the current stroke style. */
export function drawText(g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, align: Align = 'left', track = 0) {
  g.beginPath()
  textPath(g, text, x, y, size, align, track)
  g.stroke()
}
