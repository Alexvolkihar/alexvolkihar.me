// "Contours" — topographic maps of terrain that does not exist.
//
// A domain-warped noise heightfield is sampled on a fixed grid, then drawn
// like a survey sheet: isolines from marching squares with every fifth one
// heavier (index contours), hypsometric tint bands with hill shading, or
// Lehmann-style hachures down the steep slopes; water fills the low ground,
// edged by a shoreline and fading water lines.
//
// Every length is a fraction of the canvas short side and the grid does not
// depend on the pixel size, so a hash draws the same map at 300 or 1400 px.

import type { Polyline } from './march'
import type { Features, Palette } from './traits'
import { stream } from '../random'
import { isolines } from './march'
import { buildTerrain } from './terrain'
import { features, PALETTES } from './traits'

// All lengths are fractions of the canvas short side S.
const MARGIN = 0.085
const BORDER = 0.011
const GRID = 230 // cells across the short side of the map
const LEVELS: Record<Features['Spacing'], number> = { Wide: 13, Even: 23, Fine: 38 }
const LINE: Record<Features['Spacing'], number> = { Wide: 0.0013, Even: 0.0011, Fine: 0.00085 }
const INDEX_EVERY = 5
// Water lines, as fractions of the contour interval below the shore.
const WATER_LINES = [0.4, 0.95, 1.65, 2.6]

type RGB = [number, number, number]

function rgb(hex: string): RGB {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const css = (c: RGB) => `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`

function ramp(stops: readonly string[], t: number): RGB {
  const s = Math.max(0, Math.min(1, t)) * (stops.length - 1)
  const i = Math.min(stops.length - 2, Math.floor(s))
  return mix(rgb(stops[i]), rgb(stops[i + 1]), s - i)
}

// Integer hash for the paper grain (no stream: it only depends on position).
function grain(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 0x27D4EB2D) ^ Math.imul(y, 0x165667B1) ^ seed
  h = Math.imul(h ^ (h >>> 15), 0x85EBCA6B)
  h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

function makeCanvas(w: number, h: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== 'undefined')
    return new OffscreenCanvas(w, h)
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

export function renderContours(g: CanvasRenderingContext2D, W: number, H: number, hash: string) {
  const f = features(hash)
  const pal = PALETTES[f.Palette]
  const S = Math.min(W, H)

  // Map rectangle, snapped to whole pixels for the raster layer.
  const x0 = Math.round(MARGIN * S)
  const y0 = x0
  const mw = W - 2 * x0
  const mh = H - 2 * y0
  const ms = Math.min(mw, mh)
  const nx = Math.max(16, Math.round(GRID * mw / ms))
  const ny = Math.max(16, Math.round(GRID * mh / ms))
  const cw = mw / nx
  const ch = mh / ny
  const cellsPerS = nx * S / mw

  // Streams, in a fixed order.
  const tr = stream(hash, 'terrain')
  const dr = stream(hash, 'details')
  const ter = buildTerrain(tr, f, nx, ny, mw / ms, mh / ms)
  const grainSeed = Math.floor(dr() * 4294967296) | 0
  const hachurePhase = dr()

  const { h, sea } = ter
  const WN = nx + 1
  const base = Math.max(0, sea)
  const n = LEVELS[f.Spacing]
  const step = (1 - base) / (n + 0.6)

  // Gradient (height per cell) and hill shade on the grid nodes.
  const gx = new Float32Array(h.length)
  const gy = new Float32Array(h.length)
  const shade = new Float32Array(h.length)
  const Z = 0.13 * GRID // vertical exaggeration, in height units per cell
  const LX = -0.5
  const LY = -0.5
  const LZ = 0.7071
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      const k = j * WN + i
      const il = i > 0 ? k - 1 : k
      const ir = i < nx ? k + 1 : k
      const ju = j > 0 ? k - WN : k
      const jd = j < ny ? k + WN : k
      const dx = (h[ir] - h[il]) / ((ir - il) || 1)
      const dy = (h[jd] - h[ju]) / (((jd - ju) / WN) || 1)
      gx[k] = dx
      gy[k] = dy
      const ax = -dx * Z
      const ay = -dy * Z
      const inv = 1 / Math.sqrt(ax * ax + ay * ay + 1)
      // soft and bounded: deep shadows would turn the tints to metal
      shade[k] = h[k] < sea ? 0 : Math.max(-0.42, Math.min(0.22, (ax * LX + ay * LY + LZ) * inv - LZ))
    }
  }

  const sample = (arr: Float32Array, x: number, y: number) => {
    let i = Math.floor(x)
    let j = Math.floor(y)
    if (i < 0)
      i = 0
    if (j < 0)
      j = 0
    if (i > nx - 1)
      i = nx - 1
    if (j > ny - 1)
      j = ny - 1
    const fx = Math.max(0, Math.min(1, x - i))
    const fy = Math.max(0, Math.min(1, y - j))
    const k = j * WN + i
    const a = arr[k] + (arr[k + 1] - arr[k]) * fx
    const b = arr[k + WN] + (arr[k + WN + 1] - arr[k + WN]) * fx
    return a + (b - a) * fy
  }

  // ---- background and raster layer: paper, tints, shading, water, grain
  g.globalAlpha = 1
  g.fillStyle = pal.paper
  g.fillRect(0, 0, W, H)
  drawRaster(g, f, pal, h, shade, nx, ny, x0, y0, mw, mh, S, sea, base, step, n, grainSeed)

  const X = (u: number) => x0 + u * cw
  const Y = (v: number) => y0 + v * ch
  const strokeLines = (lines: Polyline[], color: string, width: number) => {
    g.strokeStyle = color
    g.lineWidth = width * S
    g.beginPath()
    for (const pl of lines) {
      g.moveTo(X(pl[0]), Y(pl[1]))
      for (let q = 2; q < pl.length; q += 2)
        g.lineTo(X(pl[q]), Y(pl[q + 1]))
    }
    g.stroke()
  }

  g.save()
  g.beginPath()
  g.rect(x0, y0, mw, mh)
  g.clip()
  g.lineCap = 'round'
  g.lineJoin = 'round'

  const paper = rgb(pal.paper)
  const ink = rgb(pal.ink)
  const inkIdx = rgb(pal.index)
  const wInk = rgb(pal.waterInk)
  const wFill = rgb(pal.water[0])

  // ---- water lines and shoreline
  if (sea >= 0) {
    for (let w = WATER_LINES.length - 1; w >= 0; w--) {
      const lvl = sea - WATER_LINES[w] * step
      if (lvl <= 0)
        continue
      const [lines] = isolines(h, nx, ny, lvl, 1, 1)
      strokeLines(lines, css(mix(wInk, wFill, 0.3 + w * 0.17)), 0.0008)
    }
  }

  const land = isolines(h, nx, ny, base, step, n + 1)

  // ---- hachures: short strokes down the slope, from one contour to the next
  if (f.Style === 'Hachured')
    drawHachures(g, land, h, gx, gy, shade, sample, X, Y, base, step, cellsPerS, S, pal, hachurePhase)

  // ---- contours, ordinary then index
  const hach = f.Style === 'Hachured'
  const thin = LINE[f.Spacing] * (hach ? 0.7 : 1)
  const ordinary: Polyline[] = []
  const index: Polyline[] = []
  for (let k = 1; k <= n; k++)
    (k % INDEX_EVERY === 0 ? index : ordinary).push(...land[k])
  const inkColor = hach ? mix(ink, paper, 0.45) : ink
  strokeLines(ordinary, css(inkColor), thin)
  strokeLines(index, css(hach ? mix(inkIdx, paper, 0.25) : inkIdx), thin * 2.3)
  if (sea >= 0)
    strokeLines(land[0], pal.waterInk, 0.0019)

  // ---- summits: small triangles on the highest local maxima
  drawSummits(g, h, nx, ny, X, Y, S, pal)

  g.restore()

  drawFrame(g, x0, y0, mw, mh, S, pal)
}

function drawRaster(
  g: CanvasRenderingContext2D,
  f: Features,
  pal: Palette,
  h: Float32Array,
  shade: Float32Array,
  nx: number,
  ny: number,
  x0: number,
  y0: number,
  mw: number,
  mh: number,
  S: number,
  sea: number,
  base: number,
  step: number,
  n: number,
  seed: number,
) {
  const WN = nx + 1
  const paper = rgb(pal.paper)
  const tinted = f.Style === 'Tinted'
  const landLUT: RGB[] = []
  for (let b = 0; b <= n + 1; b++)
    landLUT.push(tinted ? ramp(pal.ramp, b / n) : paper)
  const waterLUT: RGB[] = []
  for (let w = 0; w <= WATER_LINES.length; w++)
    waterLUT.push(mix(rgb(pal.water[0]), rgb(pal.water[1]), w / WATER_LINES.length))
  const waterLevels = WATER_LINES.map(t => sea - t * step)
  const shadeK = pal.shade * (tinted ? 1 : f.Style === 'Lines' ? 0.3 : 0.4)
  const grainAmp = pal.dark ? 7 : 11
  const grainScale = 700 / S

  const img = new ImageData(mw, mh)
  const data = img.data
  const colI = new Int32Array(mw)
  const colF = new Float32Array(mw)
  for (let px = 0; px < mw; px++) {
    const u = (px + 0.5) * nx / mw
    const i = Math.min(nx - 1, Math.floor(u))
    colI[px] = i
    colF[px] = u - i
  }
  for (let py = 0; py < mh; py++) {
    const v = (py + 0.5) * ny / mh
    const j = Math.min(ny - 1, Math.floor(v))
    const fy = v - j
    const gyi = Math.floor((py + y0) * grainScale)
    for (let px = 0; px < mw; px++) {
      const k = j * WN + colI[px]
      const fx = colF[px]
      const ht = (h[k] + (h[k + 1] - h[k]) * fx) * (1 - fy) + (h[k + WN] + (h[k + WN + 1] - h[k + WN]) * fx) * fy
      let c: RGB
      let s = 1
      if (ht < sea) {
        let w = 0
        while (w < waterLevels.length && ht < waterLevels[w])
          w++
        c = waterLUT[w]
      }
      else {
        const band = Math.floor((ht - base) / step)
        c = landLUT[Math.max(0, Math.min(n + 1, band))]
        if (shadeK > 0) {
          const sh = (shade[k] + (shade[k + 1] - shade[k]) * fx) * (1 - fy) + (shade[k + WN] + (shade[k + WN + 1] - shade[k + WN]) * fx) * fy
          s = 1 + shadeK * sh
        }
      }
      const gr = (grain(Math.floor((px + x0) * grainScale), gyi, seed) - 0.5) * grainAmp
      const o = (py * mw + px) * 4
      data[o] = c[0] * s + gr
      data[o + 1] = c[1] * s + gr
      data[o + 2] = c[2] * s + gr
      data[o + 3] = 255
    }
  }
  // putImageData ignores the transform: only take the shortcut without one
  const t = g.getTransform()
  if (t.isIdentity) {
    g.putImageData(img, x0, y0)
    return
  }
  const off = makeCanvas(mw, mh)
  const octx = off.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
  octx.putImageData(img, 0, 0)
  g.drawImage(off, x0, y0)
}

function drawHachures(
  g: CanvasRenderingContext2D,
  land: Polyline[][],
  h: Float32Array,
  gx: Float32Array,
  gy: Float32Array,
  shade: Float32Array,
  sample: (arr: Float32Array, x: number, y: number) => number,
  X: (u: number) => number,
  Y: (v: number) => number,
  base: number,
  step: number,
  cellsPerS: number,
  S: number,
  pal: Palette,
  phase: number,
) {
  const spacing = 0.0045 * cellsPerS
  const maxLen = 0.022 * cellsPerS
  const minLen = 0.003 * cellsPerS
  const minLoop = 0.035 * cellsPerS
  // On dark paper the strokes are light: the lit side gets the weight.
  const sun = pal.dark ? -2.2 : 2.2
  // Four width buckets, one path each: steeper and shadier is heavier.
  const BUCKETS = 4
  const paths: number[][] = Array.from({ length: BUCKETS }, () => [])
  for (let k = 1; k < land.length; k++) {
    const target = base + (k - 1) * step
    for (const pl of land[k]) {
      // tiny loops round a summit or a hollow would turn into starbursts
      if (polyLength(pl) < minLoop)
        continue
      let next = spacing * (0.5 + phase)
      let acc = 0
      for (let q = 2; q < pl.length; q += 2) {
        const ax = pl[q - 2]
        const ay = pl[q - 1]
        const sx = pl[q] - ax
        const sy = pl[q + 1] - ay
        const len = Math.sqrt(sx * sx + sy * sy)
        while (next <= acc + len) {
          const t = (next - acc) / (len || 1)
          next += spacing
          let x = ax + sx * t
          let y = ay + sy * t
          const dx0 = sample(gx, x, y)
          const dy0 = sample(gy, x, y)
          const m0 = Math.sqrt(dx0 * dx0 + dy0 * dy0)
          const span = step / (m0 || 1e-9)
          if (span > maxLen)
            continue
          // Walk down the slope towards 85% of the band, in three clamped
          // steps; drop the stroke if it wanders (saddles, flats).
          const goal = target + step * 0.15
          const pts = [x, y]
          let walked = 0
          for (let s = 0; s < 3; s++) {
            const dx = sample(gx, x, y)
            const dy = sample(gy, x, y)
            const m = Math.sqrt(dx * dx + dy * dy) || 1e-9
            const dist = Math.min(span * 0.6, Math.max(0, (sample(h, x, y) - goal) / m / (3 - s)))
            x -= dx / m * dist
            y -= dy / m * dist
            walked += dist
            pts.push(x, y)
          }
          if (walked > maxLen || Math.abs(sample(h, x, y) - goal) > step * 0.3)
            continue
          const steep = Math.max(0, Math.min(1, (maxLen - span) / (maxLen - minLen)))
          const dark = Math.max(0, Math.min(1, -sample(shade, pts[0], pts[1]) * sun))
          const b = Math.min(BUCKETS - 1, Math.floor((steep * 0.7 + dark * 0.3) * BUCKETS))
          const path = paths[b]
          path.push(pts.length)
          for (let q = 0; q < pts.length; q++)
            path.push(pts[q])
        }
        acc += len
      }
    }
  }
  g.strokeStyle = pal.dark ? pal.ink : pal.index
  const wk = pal.dark ? 0.7 : 1
  for (let b = 0; b < BUCKETS; b++) {
    g.lineWidth = (0.00045 + b * 0.00045) * wk * S
    g.beginPath()
    const p = paths[b]
    for (let o = 0; o < p.length;) {
      const m = p[o++]
      g.moveTo(X(p[o]), Y(p[o + 1]))
      for (let q = 2; q < m; q += 2)
        g.lineTo(X(p[o + q]), Y(p[o + q + 1]))
      o += m
    }
    g.stroke()
  }
}

function polyLength(pl: Polyline): number {
  let len = 0
  for (let q = 2; q < pl.length; q += 2) {
    const dx = pl[q] - pl[q - 2]
    const dy = pl[q + 1] - pl[q - 1]
    len += Math.sqrt(dx * dx + dy * dy)
  }
  return len
}

function drawSummits(
  g: CanvasRenderingContext2D,
  h: Float32Array,
  nx: number,
  ny: number,
  X: (u: number) => number,
  Y: (v: number) => number,
  S: number,
  pal: Palette,
) {
  const WN = nx + 1
  const R = 14
  const peaks: [number, number, number][] = []
  for (let j = 3; j <= ny - 3; j += 2) {
    for (let i = 3; i <= nx - 3; i += 2) {
      const v = h[j * WN + i]
      if (v < 0.72)
        continue
      let top = true
      for (let b = -R; b <= R && top; b += 2) {
        const jj = j + b
        if (jj < 0 || jj > ny)
          continue
        for (let a = -R; a <= R; a += 2) {
          const ii = i + a
          if (ii >= 0 && ii <= nx && h[jj * WN + ii] > v) {
            top = false
            break
          }
        }
      }
      if (top)
        peaks.push([v, i, j])
    }
  }
  peaks.sort((p, q) => q[0] - p[0] || p[1] - q[1] || p[2] - q[2])
  const r = 0.0062 * S
  g.fillStyle = pal.index
  g.beginPath()
  for (const [, i, j] of peaks.slice(0, 3)) {
    const x = X(i)
    const y = Y(j)
    g.moveTo(x, y - r)
    g.lineTo(x + r * 0.87, y + r * 0.5)
    g.lineTo(x - r * 0.87, y + r * 0.5)
    g.closePath()
  }
  g.fill()
}

// Neatline with a graduated border, as on printed survey sheets.
function drawFrame(g: CanvasRenderingContext2D, x0: number, y0: number, mw: number, mh: number, S: number, pal: Palette) {
  const b = BORDER * S
  const seg = 0.06 * S
  g.fillStyle = pal.index
  const side = (len: number, draw: (a: number, l: number) => void) => {
    const count = Math.max(4, Math.round(len / seg))
    const l = len / count
    for (let c = 0; c < count; c += 2)
      draw(c * l, l)
  }
  side(mw, (a, l) => g.fillRect(x0 + a, y0 - b, l, b))
  side(mw, (a, l) => g.fillRect(x0 + mw - a - l, y0 + mh, l, b))
  side(mh, (a, l) => g.fillRect(x0 + mw, y0 + a, b, l))
  side(mh, (a, l) => g.fillRect(x0 - b, y0 + mh - a - l, b, l))
  g.fillRect(x0 - b, y0 - b, b, b)
  g.fillRect(x0 + mw, y0 + mh, b, b)
  g.strokeStyle = pal.index
  g.lineWidth = 0.0012 * S
  g.strokeRect(x0, y0, mw, mh)
  g.strokeRect(x0 - b, y0 - b, mw + 2 * b, mh + 2 * b)
}
