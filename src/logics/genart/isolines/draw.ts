// Turning the field into marks.
//
// The field is sampled once on a square grid (in "rhythm units": one unit is
// the gap between two lines). Lines are traced through it by marching
// squares (Lorensen & Cline's marching cubes reduced to 2D) with linear
// interpolation along cell edges and saddles resolved by the cell average.
// Bands between groups of lines are filled per pixel from the bilinear
// interpolation of the same grid, antialiased by the local gradient, so they
// stay crisp at any export size.

export interface Grid {
  /** Field value in rhythm units at each grid node, row-major. */
  t: Float32Array
  nx: number
  ny: number
  /** Grid pitch in pixels. */
  cell: number
}

/** Samples `field` (normalised coordinates) on a grid covering the canvas. */
export function sampleGrid(field: (x: number, y: number) => number, W: number, H: number, S: number, cell: number, scale: number, phase: number): Grid {
  const nx = Math.ceil(W / cell) + 1
  const ny = Math.ceil(H / cell) + 1
  const t = new Float32Array(nx * ny)
  for (let j = 0; j < ny; j++) {
    const y = (j * cell - H / 2) / S
    for (let i = 0; i < nx; i++)
      t[j * nx + i] = field((i * cell - W / 2) / S, y) * scale + phase
  }
  return { t, nx, ny, cell }
}

/**
 * Line segments of every level `k` (an integer in rhythm units) for which
 * `keep(k)` returns a group index >= 0. Segments land in `paths[group]`.
 */
export function traceLevels(g: Grid, keep: (k: number) => number, paths: Path2D[]): void {
  const { t, nx, ny, cell } = g
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const o = j * nx + i
      const a = t[o]
      const b = t[o + 1]
      const c = t[o + nx + 1]
      const d = t[o + nx]
      const lo = Math.ceil(Math.min(a, b, c, d))
      const hi = Math.floor(Math.max(a, b, c, d))
      for (let k = lo; k <= hi; k++) {
        const group = keep(k)
        if (group >= 0)
          cellSegments(paths[group], a, b, c, d, k, i * cell, j * cell, cell)
      }
    }
  }
}

/** Traces the single level `level` (any real value) into `path`. */
export function traceLevel(g: Grid, level: number, path: Path2D): void {
  const { t, nx, ny, cell } = g
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const o = j * nx + i
      const a = t[o]
      const b = t[o + 1]
      const c = t[o + nx + 1]
      const d = t[o + nx]
      if (Math.min(a, b, c, d) <= level && Math.max(a, b, c, d) > level)
        cellSegments(path, a, b, c, d, level, i * cell, j * cell, cell)
    }
  }
}

// Edge pairs crossed by the level for each corner code (a = 1, b = 2, c = 4,
// d = 8), edges numbered top 0, right 1, bottom 2, left 3. Saddles (5, 10)
// are handled apart.
const PAIRS: ReadonlyArray<readonly [number, number] | null> = [
  null,
  [0, 3],
  [0, 1],
  [3, 1],
  [1, 2],
  null,
  [0, 2],
  [3, 2],
  [3, 2],
  [0, 2],
  null,
  [1, 2],
  [3, 1],
  [0, 1],
  [0, 3],
  null,
]

// Corners: a (x0, y0), b (x0 + s, y0), c (x0 + s, y0 + s), d (x0, y0 + s).
function cellSegments(p: Path2D, a: number, b: number, c: number, d: number, k: number, x0: number, y0: number, s: number): void {
  const code = (a > k ? 1 : 0) | (b > k ? 2 : 0) | (c > k ? 4 : 0) | (d > k ? 8 : 0)
  const at = (e: number, move: boolean) => {
    let x = x0
    let y = y0
    if (e === 0) {
      x += s * (k - a) / (b - a)
    }
    else if (e === 1) {
      x += s
      y += s * (k - b) / (c - b)
    }
    else if (e === 2) {
      x += s * (k - d) / (c - d)
      y += s
    }
    else {
      y += s * (k - a) / (d - a)
    }
    if (move)
      p.moveTo(x, y)
    else
      p.lineTo(x, y)
  }
  const pair = PAIRS[code]
  if (pair) {
    at(pair[0], true)
    at(pair[1], false)
  }
  else if (code === 5 || code === 10) {
    // saddle: the cell average decides which corners connect
    const centre = (a + b + c + d) / 4 > k
    const joinTopRight = (code === 5) === centre
    at(0, true)
    at(joinTopRight ? 1 : 3, false)
    at(2, true)
    at(joinTopRight ? 3 : 1, false)
  }
}

export type RGB = readonly [number, number, number]

export interface BandStyle {
  /** Rhythm: `lines` lines then a band, `period` units in all. */
  lines: number
  period: number
  /** Gap left between a band and the lines around it, in rhythm units. */
  gap: number
  /** 'solid' fills the band; 'hatch' and 'cross' rule it. */
  fill: 'solid' | 'hatch' | 'cross'
  /** Band colours, cycled period after period. */
  colours: readonly RGB[]
  /** Level of the figure outline in rhythm units: inside, the hatching turns. */
  zero: number
  /** Hatching angle, pitch and half width, in pixels. */
  angle: number
  pitch: number
  halfWidth: number
}

/**
 * Paints the background and the bands into the canvas, row strip by row
 * strip (so an 8K export never holds one giant ImageData), inside the box
 * [x0, x1) × [y0, y1).
 */
export function paintBands(ctx: CanvasRenderingContext2D, g: Grid, W: number, H: number, bg: RGB, st: BandStyle, box: readonly [number, number, number, number]): void {
  const [x0, y0, x1, y1] = box.map(Math.round)
  const bw = x1 - x0
  if (bw <= 0 || y1 <= y0)
    return
  const { t, nx, cell } = g
  const inv = 1 / cell
  const bandLo = st.lines - 1 + st.gap
  const bandHi = st.period - st.gap
  const nCol = st.colours.length
  const { period, zero, pitch, halfWidth } = st
  const ca = Math.cos(st.angle)
  const sa = Math.sin(st.angle)
  const hatch = st.fill !== 'solid'
  const cross = st.fill === 'cross'
  const cx = W / 2
  const cy = H / 2
  const rows = Math.max(1, Math.min(y1 - y0, Math.floor(4_000_000 / bw)))
  // The grid row under the pixel row, interpolated once per pixel row: value
  // and vertical difference (per grid cell) at each grid column.
  const rowV = new Float32Array(nx)
  const rowD = new Float32Array(nx)
  const paperWord = pack(bg[0], bg[1], bg[2])
  for (let ys = y0; ys < y1; ys += rows) {
    const h = Math.min(rows, y1 - ys)
    const img = ctx.createImageData(bw, h)
    const data = img.data
    const words = new Uint32Array(data.buffer)
    let o = 0
    for (let py = ys; py < ys + h; py++) {
      const gy = (py + 0.5) * inv
      const j = Math.floor(gy)
      const fy = gy - j
      const r0 = j * nx
      let steep = 0
      for (let i = 0; i < nx; i++) {
        const a = t[r0 + i]
        const b = t[r0 + nx + i]
        rowV[i] = a + (b - a) * fy
        rowD[i] = b - a
        if (i > 0)
          steep = Math.max(steep, (Math.abs(rowV[i] - rowV[i - 1]) + Math.abs(rowD[i]) + Math.abs(rowD[i - 1])) * inv)
      }
      // no pixel of this row whose band distance is below `reach` can be touched
      const reach = -0.5 * steep - 1e-4
      const dy = py + 0.5 - cy
      for (let px = x0; px < x1; px++, o++) {
        const gx = (px + 0.5) * inv
        const i = gx | 0
        const fx = gx - i
        const va = rowV[i]
        const dv = rowV[i + 1] - va
        const v = va + dv * fx
        const q = Math.floor(v / period)
        const u = v - q * period
        const dist = Math.min(u - bandLo, bandHi - u)
        if (dist <= reach) {
          words[o] = paperWord
          continue
        }
        let cov = 1
        if (hatch) {
          const dx = px + 0.5 - cx
          const inside = v < zero
          const c1 = inside ? -sa : ca
          const s1 = inside ? ca : sa
          cov = lineCover(dx * c1 + dy * s1, pitch, halfWidth)
          if (cross)
            cov = Math.max(cov, lineCover(-dx * s1 + dy * c1, pitch, halfWidth))
          if (cov <= 0) {
            words[o] = paperWord
            continue
          }
        }
        // gradient of the bilinear patch, in rhythm units per pixel
        const gxv = dv * inv
        const gyv = (rowD[i] + (rowD[i + 1] - rowD[i]) * fx) * inv
        let alpha = dist / (Math.sqrt(gxv * gxv + gyv * gyv) + 1e-6) + 0.5
        if (alpha <= 0) {
          words[o] = paperWord
          continue
        }
        if (alpha > 1)
          alpha = 1
        alpha *= cov
        const col = st.colours[((q % nCol) + nCol) % nCol]
        const k = o * 4
        data[k] = bg[0] + (col[0] - bg[0]) * alpha
        data[k + 1] = bg[1] + (col[1] - bg[1]) * alpha
        data[k + 2] = bg[2] + (col[2] - bg[2]) * alpha
        data[k + 3] = 255
      }
    }
    ctx.putImageData(img, x0, ys)
  }
}

/** One opaque RGBA pixel as a 32-bit word (ImageData is little-endian in every browser). */
function pack(r: number, g: number, b: number): number {
  return ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0
}

/** Coverage of a pixel by a family of parallel rules of the given pitch and half width. */
function lineCover(s: number, pitch: number, half: number): number {
  const f = s / pitch
  const d = Math.abs(f - Math.floor(f) - 0.5) * pitch
  return Math.max(0, Math.min(1, half + 0.5 - d))
}
