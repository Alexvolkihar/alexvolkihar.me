// Cartographic drawing helpers for the Streets series. The context is in
// map units (canvas short side = 1, origin at the centre).

import type { Ring } from './city'

export function ringPath(rings: readonly Ring[], close: boolean): Path2D {
  const p = new Path2D()
  for (const r of rings) {
    if (r.length < 4)
      continue
    p.moveTo(r[0], r[1])
    for (let i = 2; i < r.length; i += 2)
      p.lineTo(r[i], r[i + 1])
    if (close)
      p.closePath()
  }
  return p
}

/**
 * Water lining: lines running parallel to the shore, fading out to sea, as
 * on engraved maps. Drawn inside a clip of the water: each band is a wide
 * stroke of the shore in the line colour, then a slightly narrower one in the
 * water colour.
 */
export function waterLining(g: CanvasRenderingContext2D, shore: Path2D, water: string, line: string, n: number, gap: number, lw: number) {
  g.lineJoin = 'round'
  g.lineCap = 'round'
  for (let k = n; k >= 1; k--) {
    g.globalAlpha = 0.85 * (1 - (k - 1) / (n + 1))
    g.strokeStyle = line
    g.lineWidth = 2 * gap * k + lw
    g.stroke(shore)
    g.globalAlpha = 1
    g.strokeStyle = water
    g.lineWidth = 2 * gap * k - lw
    g.stroke(shore)
  }
}

/** Compass rose: a ring, eight points (the cardinal ones long), half shaded, and a north arrow. */
export function compass(g: CanvasRenderingContext2D, x: number, y: number, R: number, ink: string, paper: string, lw: number) {
  g.save()
  g.translate(x, y)
  g.fillStyle = paper
  g.strokeStyle = ink
  g.lineWidth = lw
  g.beginPath()
  g.arc(0, 0, R * 1.08, 0, Math.PI * 2)
  g.fill()
  g.stroke()
  g.beginPath()
  g.arc(0, 0, R * 0.98, 0, Math.PI * 2)
  g.stroke()
  // ticks every 10 degrees
  g.beginPath()
  for (let i = 0; i < 36; i++) {
    const a = i / 36 * Math.PI * 2
    const r0 = i % 9 === 0 ? R * 0.84 : R * 0.9
    g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0)
    g.lineTo(Math.cos(a) * R * 0.98, Math.sin(a) * R * 0.98)
  }
  g.stroke()
  const point = (a: number, len: number, wid: number) => {
    const c = Math.cos(a)
    const s = Math.sin(a)
    const px = -s
    const py = c
    // two halves: one filled, one in paper
    g.beginPath()
    g.moveTo(0, 0)
    g.lineTo(c * len, s * len)
    g.lineTo(c * wid + px * wid, s * wid + py * wid)
    g.closePath()
    g.fillStyle = ink
    g.fill()
    g.stroke()
    g.beginPath()
    g.moveTo(0, 0)
    g.lineTo(c * len, s * len)
    g.lineTo(c * wid - px * wid, s * wid - py * wid)
    g.closePath()
    g.fillStyle = paper
    g.fill()
    g.stroke()
  }
  for (let i = 0; i < 4; i++)
    point(Math.PI / 4 + i * Math.PI / 2, R * 0.55, R * 0.1)
  for (let i = 0; i < 4; i++)
    point(i * Math.PI / 2 - Math.PI / 2, R * 0.92, R * 0.15)
  g.beginPath()
  g.arc(0, 0, R * 0.07, 0, Math.PI * 2)
  g.fillStyle = paper
  g.fill()
  g.stroke()
  // north mark: a small chevron above the rose
  g.beginPath()
  g.moveTo(-R * 0.16, -R * 1.18)
  g.lineTo(0, -R * 1.42)
  g.lineTo(R * 0.16, -R * 1.18)
  g.lineWidth = lw * 1.6
  g.stroke()
  g.restore()
}

/** Scale bar in alternating blocks, with a cartouche behind it. */
export function scaleBar(g: CanvasRenderingContext2D, x: number, y: number, len: number, ink: string, paper: string, lw: number) {
  const h = len * 0.045
  const pad = len * 0.08
  g.fillStyle = paper
  g.strokeStyle = ink
  g.lineWidth = lw
  g.fillRect(x - pad, y - h - pad * 1.2, len + pad * 2, h * 2 + pad * 2.2)
  g.strokeRect(x - pad, y - h - pad * 1.2, len + pad * 2, h * 2 + pad * 2.2)
  const n = 5
  for (let i = 0; i < n; i++) {
    for (let row = 0; row < 2; row++) {
      g.fillStyle = (i + row) % 2 ? paper : ink
      g.fillRect(x + i * len / n, y - h + row * h, len / n, h)
    }
  }
  g.strokeRect(x, y - h, len, h * 2)
  g.beginPath()
  for (let i = 0; i <= n; i++) {
    g.moveTo(x + i * len / n, y - h)
    g.lineTo(x + i * len / n, y - h - pad * 0.6)
  }
  // subdivided first block
  for (let i = 1; i < 4; i++) {
    g.moveTo(x + i * len / n / 4, y - h)
    g.lineTo(x + i * len / n / 4, y - h - pad * 0.3)
  }
  g.stroke()
}

/** Neatline with a zebra border (alternating ink and paper blocks), as on survey maps. */
export function zebraFrame(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, bw: number, step: number, ink: string, paper: string, lw: number) {
  g.fillStyle = paper
  g.fillRect(x0 - bw, y0 - bw, x1 - x0 + bw * 2, bw)
  g.fillRect(x0 - bw, y1, x1 - x0 + bw * 2, bw)
  g.fillRect(x0 - bw, y0, bw, y1 - y0)
  g.fillRect(x1, y0, bw, y1 - y0)
  g.fillStyle = ink
  // blocks start at the centre so the pattern is symmetric
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  for (let k = -Math.ceil((cx - x0) / step); k * step + cx < x1; k++) {
    if (k % 2 === 0)
      continue
    const a = Math.max(x0, cx + k * step)
    const b = Math.min(x1, cx + (k + 1) * step)
    if (b > a) {
      g.fillRect(a, y0 - bw, b - a, bw)
      g.fillRect(a, y1, b - a, bw)
    }
  }
  for (let k = -Math.ceil((cy - y0) / step); k * step + cy < y1; k++) {
    if (k % 2 === 0)
      continue
    const a = Math.max(y0, cy + k * step)
    const b = Math.min(y1, cy + (k + 1) * step)
    if (b > a) {
      g.fillRect(x0 - bw, a, bw, b - a)
      g.fillRect(x1, a, bw, b - a)
    }
  }
  g.strokeStyle = ink
  g.lineWidth = lw
  g.strokeRect(x0, y0, x1 - x0, y1 - y0)
  g.strokeRect(x0 - bw, y0 - bw, x1 - x0 + bw * 2, y1 - y0 + bw * 2)
  g.lineWidth = lw * 2
  g.strokeRect(x0 - bw * 1.8, y0 - bw * 1.8, x1 - x0 + bw * 3.6, y1 - y0 + bw * 3.6)
}
