// Stage 2 of the Wash series: ink lines along the streamlines.
//
// Every contour is cut into strokes of random length with small gaps where
// the pen was lifted. Each stroke is filled as a ribbon whose width follows
// the pen pressure (smooth noise along the stroke), a taper where the nib
// lands and leaves, and, for the reed pen, the direction of travel against a
// fixed nib angle. Ink pools in a small blot where the pen rests.

import type { Rng } from '../random'
import type { Noise2 } from './noise'
import { chance, range } from '../random'

export type PenName = 'Fine' | 'Reed' | 'Brush' | 'Sparse'

export interface PenSpec {
  /** Base width, fraction of the short side. */
  w: number
  /** Range of stroke lengths and gaps, world units. */
  on: readonly [number, number]
  gap: readonly [number, number]
  /** Pressure variation 0..1 and nib angle effect 0..1. */
  press: number
  nib: number
  taper: number
  pool: number
}

export interface InkLine {
  /** Flat x, y in world units of the screen frame (short side = 1, origin at the centre). */
  pts: number[]
  closed: boolean
  /** Width multiplier and opacity. */
  wm: number
  alpha: number
}

export function drawInk(
  g: CanvasRenderingContext2D,
  lines: InkLine[],
  W: number,
  H: number,
  S: number,
  pen: PenSpec,
  r: Rng,
  noise: Noise2,
  crowd: (x: number, y: number) => number,
) {
  const nibAng = range(r, 0.3, 1.2)
  const cx = W / 2
  const cy = H / 2
  for (let li = 0; li < lines.length; li++) {
    const ln = lines[li]
    const p = ln.pts
    const n = p.length / 2
    if (n < 2)
      continue
    // cumulative arc length (world units)
    const cum = new Float64Array(n + (ln.closed ? 1 : 0))
    for (let i = 1; i < cum.length; i++) {
      const a = (i - 1) * 2
      const b = (i % n) * 2
      cum[i] = cum[i - 1] + Math.hypot(p[b] - p[a], p[b + 1] - p[a + 1])
    }
    const total = cum[cum.length - 1]
    const lineSeed = r() * 200
    let s0 = chance(r, 0.5) ? 0 : range(r, 0, pen.on[1] * 0.5)
    if (s0 > total * 0.5)
      s0 = 0
    let i = 0
    while (s0 < total) {
      const len = range(r, pen.on[0], pen.on[1])
      const s1 = Math.min(total, s0 + len)
      const poolEnd = chance(r, pen.pool)
      const poolStart = chance(r, pen.pool * 0.35)
      const gap = range(r, pen.gap[0], pen.gap[1])
      // vertices of this stroke
      while (i < cum.length - 1 && cum[i + 1] <= s0)
        i++
      const xs: number[] = []
      const ys: number[] = []
      const ss: number[] = []
      const at = (k: number, s: number) => {
        const a = k % n
        const b = (k + 1) % n
        const seg = cum[k + 1] - cum[k]
        const t = seg > 0 ? (s - cum[k]) / seg : 0
        xs.push(p[a * 2] + (p[b * 2] - p[a * 2]) * t)
        ys.push(p[a * 2 + 1] + (p[b * 2 + 1] - p[a * 2 + 1]) * t)
        ss.push(s)
      }
      at(i, s0)
      let k = i
      while (k < cum.length - 1 && cum[k + 1] < s1) {
        const a = ((k + 1) % n) * 2
        xs.push(p[a])
        ys.push(p[a + 1])
        ss.push(cum[k + 1])
        k++
      }
      at(Math.min(k, cum.length - 2), s1)
      const m = xs.length
      if (m >= 2 && s1 - s0 > 0.002) {
        const wv: number[] = []
        const lx: number[] = []
        const ly: number[] = []
        const rx: number[] = []
        const ry: number[] = []
        for (let q = 0; q < m; q++) {
          const qa = Math.max(0, q - 1)
          const qb = Math.min(m - 1, q + 1)
          let tx = xs[qb] - xs[qa]
          let ty = ys[qb] - ys[qa]
          const tl = Math.hypot(tx, ty) || 1
          tx /= tl
          ty /= tl
          const s = ss[q]
          const pr = 1 - pen.press + pen.press * noise(s * 26 + lineSeed, lineSeed * 0.37)
          const dir = 1 - pen.nib + pen.nib * Math.abs(Math.sin(Math.atan2(ty, tx) - nibAng))
          const dIn = (s - s0) / pen.taper
          const dOut = (s1 - s) / pen.taper
          let tp = 1
          if (dIn < 1)
            tp *= 0.35 + 0.65 * Math.sqrt(dIn)
          if (dOut < 1)
            tp *= poolEnd ? 0.8 + 0.2 * dOut : 0.3 + 0.7 * Math.sqrt(dOut)
          const w = pen.w * ln.wm * pr * dir * tp * crowd(xs[q], ys[q]) * S * 0.5
          wv.push(w)
          const X = cx + xs[q] * S
          const Y = cy + ys[q] * S
          lx.push(X - ty * w)
          ly.push(Y + tx * w)
          rx.push(X + ty * w)
          ry.push(Y - tx * w)
        }
        g.globalAlpha = ln.alpha
        g.beginPath()
        g.moveTo(lx[0], ly[0])
        for (let q = 1; q < m; q++)
          g.lineTo(lx[q], ly[q])
        for (let q = m - 1; q >= 0; q--)
          g.lineTo(rx[q], ry[q])
        g.closePath()
        g.fill()
        const blot = (q: number) => {
          const rad = Math.max(wv[q] * range(r, 1.05, 1.5), 0.35)
          g.globalAlpha = ln.alpha * 0.85
          g.beginPath()
          g.arc(cx + xs[q] * S, cy + ys[q] * S, rad, 0, Math.PI * 2)
          g.fill()
        }
        if (poolEnd)
          blot(m - 1)
        if (poolStart)
          blot(0)
      }
      s0 = s1 + gap
    }
  }
  g.globalAlpha = 1
}
