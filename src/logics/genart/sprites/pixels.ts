// A low-resolution pixel buffer for the "Sprites" series, blitted to the
// canvas with nearest-neighbour edges.
//
// Every scene is drawn in "art pixels": the short side of the canvas holds
// exactly N of them, whatever its size in device pixels. The central N x N
// square is the composition; a wider or taller canvas only adds art pixels on
// both sides of it. Blitting rounds each art pixel's edges to whole device
// pixels, so the result is always crisp, from a 300 px cover to an 8K export.

/** Packed 0xRRGGBB colour. */
export type Colour = number

export function hex(s: string): Colour {
  return Number.parseInt(s.replace('#', ''), 16)
}

export class Pixels {
  readonly data: Int32Array
  /** Logical coordinate of the buffer's first column and row. */
  readonly x0: number
  readonly y0: number

  constructor(x0: number, y0: number, readonly w: number, readonly h: number, fill: Colour) {
    this.x0 = x0
    this.y0 = y0
    this.data = new Int32Array(w * h).fill(fill)
  }

  /** Logical bounds (inclusive start, exclusive end). */
  get x1() {
    return this.x0 + this.w
  }

  get y1() {
    return this.y0 + this.h
  }

  set(x: number, y: number, c: Colour) {
    const i = x - this.x0
    const j = y - this.y0
    if (i < 0 || j < 0 || i >= this.w || j >= this.h)
      return
    this.data[j * this.w + i] = c
  }

  get(x: number, y: number): Colour {
    const i = x - this.x0
    const j = y - this.y0
    if (i < 0 || j < 0 || i >= this.w || j >= this.h)
      return -1
    return this.data[j * this.w + i]
  }

  rect(x: number, y: number, w: number, h: number, c: Colour) {
    const xa = Math.max(x, this.x0)
    const xb = Math.min(x + w, this.x1)
    const ya = Math.max(y, this.y0)
    const yb = Math.min(y + h, this.y1)
    for (let yy = ya; yy < yb; yy++) {
      const row = (yy - this.y0) * this.w - this.x0
      for (let xx = xa; xx < xb; xx++)
        this.data[row + xx] = c
    }
  }
}

/**
 * A buffer covering the whole canvas, with the N x N composition square at
 * logical [0, N) on both axes and the extra width or height split evenly.
 */
export function makeBuffer(W: number, H: number, N: number, fill: Colour): Pixels {
  const px = Math.min(W, H) / N
  const ox = Math.max(0, Math.ceil((W / px - N) / 2 - 1e-9))
  const oy = Math.max(0, Math.ceil((H / px - N) / 2 - 1e-9))
  return new Pixels(-ox, -oy, N + 2 * ox, N + 2 * oy, fill)
}

function css(c: Colour) {
  return `#${c.toString(16).padStart(6, '0')}`
}

/** Run-length blit: one fillRect per horizontal run of equal colour. */
export function blit(g: CanvasRenderingContext2D, W: number, H: number, N: number, p: Pixels, bg: Colour) {
  const px = Math.min(W, H) / N
  const sx = (x: number) => Math.min(W, Math.max(0, Math.round(W / 2 + (x - N / 2) * px)))
  const sy = (y: number) => Math.min(H, Math.max(0, Math.round(H / 2 + (y - N / 2) * px)))
  g.globalAlpha = 1
  g.fillStyle = css(bg)
  g.fillRect(0, 0, W, H)
  const styles = new Map<Colour, string>()
  let current = -2
  for (let j = 0; j < p.h; j++) {
    const ya = sy(p.y0 + j)
    const yb = sy(p.y0 + j + 1)
    if (yb <= ya)
      continue
    const row = j * p.w
    let i = 0
    while (i < p.w) {
      const c = p.data[row + i]
      let k = i + 1
      while (k < p.w && p.data[row + k] === c)
        k++
      if (c !== bg) {
        const xa = sx(p.x0 + i)
        const xb = sx(p.x0 + k)
        if (xb > xa) {
          if (c !== current) {
            let s = styles.get(c)
            if (!s) {
              s = css(c)
              styles.set(c, s)
            }
            g.fillStyle = s
            current = c
          }
          g.fillRect(xa, ya, xb - xa, yb - ya)
        }
      }
      i = k
    }
  }
}

// 4 x 4 Bayer matrix, for ordered-dither gradients.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]

/** Picks a colour along `cols` at position t in [0, 1], dithered by position. */
export function dither(cols: readonly Colour[], t: number, x: number, y: number): Colour {
  const n = cols.length
  if (n === 1)
    return cols[0]
  const pos = Math.min(n - 1 - 1e-9, Math.max(0, t * (n - 1)))
  const i = Math.floor(pos)
  const f = pos - i
  const th = (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16
  return f > th ? cols[i + 1] : cols[i]
}

/** Integer hash of a lattice point, in [0, 1). Same everywhere, at any size. */
export function hash2(seed: number, x: number, y: number): number {
  let h = (Math.imul(x | 0, 0x27D4EB2D) ^ Math.imul(y | 0, 0x165667B1) ^ seed) | 0
  h = Math.imul(h ^ (h >>> 15), 0x85EBCA6B)
  h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

/** Smooth 1D value noise in [0, 1], defined for every real x. */
export function noise1(seed: number, x: number): number {
  const i = Math.floor(x)
  const f = x - i
  const u = f * f * (3 - 2 * f)
  const a = hash2(seed, i, 0)
  const b = hash2(seed, i + 1, 0)
  return a + (b - a) * u
}

// A 3 x 5 pixel font for catalogue numbers: no font files are loaded.
const DIGITS = [
  '111101101101111',
  '010110010010111',
  '111001111100111',
  '111001111001111',
  '101101111001001',
  '111100111001111',
  '111100111101111',
  '111001010010010',
  '111101111101111',
  '111101111001111',
]

/** Draws a number in the 3 x 5 font; returns its width in art pixels. */
export function digits(p: Pixels, text: string, x: number, y: number, c: Colour): number {
  for (let k = 0; k < text.length; k++) {
    const glyph = DIGITS[text.charCodeAt(k) - 48]
    if (!glyph)
      continue
    for (let j = 0; j < 5; j++) {
      for (let i = 0; i < 3; i++) {
        if (glyph[j * 3 + i] === '1')
          p.set(x + k * 4 + i, y + j, c)
      }
    }
  }
  return text.length * 4 - 1
}
