// A small strand rasteriser for Pelt.
//
// Hundreds of thousands of hairs, each with its own colour, width and alpha
// ramp, are far too many for one canvas stroke each. Here every strand is a
// short polyline, walked one pixel at a time along its major axis; each step
// paints a span across the strand whose ends are anti-aliased by coverage.
// Width tapers to the tip, alpha rises from the root (which disappears under
// the neighbouring hair) and the colour runs from a shaded root through the
// hair colour to a lighter tip.
//
// Output goes straight into an RGBA buffer, one horizontal band at a time so a
// 8K export never holds more than a few megapixels of scratch memory.

export interface Strands {
  n: number
  /** Points per strand. */
  np: number
  /** x, y in pixels, np points per strand. */
  pts: Float32Array
  /** Hair colour then tip colour, 0..255. */
  col: Float32Array
  /** Root width (px) and opacity. */
  wa: Float32Array
  /** Vertical extent in pixels, for band culling. */
  ys: Float32Array
  /** Drawing order. */
  order: Uint32Array
}

export function allocStrands(n: number, np: number): Strands {
  return {
    n,
    np,
    pts: new Float32Array(n * np * 2),
    col: new Float32Array(n * 6),
    wa: new Float32Array(n * 2),
    ys: new Float32Array(n * 2),
    order: new Uint32Array(n),
  }
}

/** Paints every strand that crosses rows [y0, y0 + bh) into `px` (W x bh). */
export function drawBand(px: Uint8ClampedArray, W: number, y0: number, bh: number, s: Strands, rootShade: number) {
  const np = s.np
  const ns = np - 1
  const y1 = y0 + bh
  const { pts, col, wa, ys, order } = s
  for (let oi = 0; oi < s.n; oi++) {
    const id = order[oi]
    if (ys[id * 2 + 1] < y0 || ys[id * 2] >= y1)
      continue
    const w0 = wa[id * 2]
    const a0 = wa[id * 2 + 1]
    const cr = col[id * 6]
    const cg = col[id * 6 + 1]
    const cb = col[id * 6 + 2]
    const tr = col[id * 6 + 3]
    const tg = col[id * 6 + 4]
    const tb = col[id * 6 + 5]
    const p = id * np * 2
    for (let k = 0; k < ns; k++) {
      const xa = pts[p + k * 2]
      const ya = pts[p + k * 2 + 1]
      const dx = pts[p + k * 2 + 2] - xa
      const dy = pts[p + k * 2 + 3] - ya
      const adx = Math.abs(dx)
      const ady = Math.abs(dy)
      const major = adx > ady ? adx : ady
      if (major < 1e-6)
        continue
      const len = Math.sqrt(dx * dx + dy * dy)
      const steps = Math.max(1, Math.ceil(major))
      const weight = major / steps
      const alongX = adx >= ady
      const stretch = len / major
      for (let q = 0; q < steps; q++) {
        const f = (q + 0.5) / steps
        const t = (k + f) / ns
        const x = xa + dx * f
        const y = ya + dy * f
        const w = w0 * (1 - 0.62 * t * t)
        const a = a0 * weight * (t < 0.3 ? 0.3 + t * 2.333 : 1) * (1 - 0.2 * t)
        // colour: shaded root -> hair -> tip
        let r: number, g: number, b: number
        if (t < 0.45) {
          const m = rootShade + (1 - rootShade) * (t / 0.45)
          r = cr * m
          g = cg * m
          b = cb * m
        }
        else {
          let m = (t - 0.5) / 0.5
          m = m < 0 ? 0 : m * m * (3 - 2 * m)
          r = cr + (tr - cr) * m
          g = cg + (tg - cg) * m
          b = cb + (tb - cb) * m
        }
        const ht = 0.5 * w * stretch
        if (alongX) {
          const ix = Math.floor(x)
          if (ix < 0 || ix >= W)
            continue
          const lo = y - ht
          const hi = y + ht
          let iy = Math.floor(lo)
          const iyEnd = Math.min(Math.floor(hi), y1 - 1)
          if (iy < y0)
            iy = y0
          for (; iy <= iyEnd; iy++) {
            const cov = (hi < iy + 1 ? hi : iy + 1) - (lo > iy ? lo : iy)
            if (cov <= 0)
              continue
            const al = a * cov
            const o = ((iy - y0) * W + ix) * 4
            px[o] += (r - px[o]) * al
            px[o + 1] += (g - px[o + 1]) * al
            px[o + 2] += (b - px[o + 2]) * al
          }
        }
        else {
          const iy = Math.floor(y)
          if (iy < y0 || iy >= y1)
            continue
          const lo = x - ht
          const hi = x + ht
          let ix = Math.floor(lo)
          const ixEnd = Math.min(Math.floor(hi), W - 1)
          if (ix < 0)
            ix = 0
          const row = (iy - y0) * W
          for (; ix <= ixEnd; ix++) {
            const cov = (hi < ix + 1 ? hi : ix + 1) - (lo > ix ? lo : ix)
            if (cov <= 0)
              continue
            const al = a * cov
            const o = (row + ix) * 4
            px[o] += (r - px[o]) * al
            px[o + 1] += (g - px[o + 1]) * al
            px[o + 2] += (b - px[o + 2]) * al
          }
        }
      }
    }
  }
}
