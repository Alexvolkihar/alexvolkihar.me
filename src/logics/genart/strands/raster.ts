// Pixel helpers for the "Strands" series: an RGBA buffer, a paper ground and
// round dots blended straight into the buffer (no canvas call per dot, so a
// few hundred thousand dots stay cheap at any size).

export type RGB = readonly [number, number, number]

export function hexRgb(hex: string): RGB {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

/** Integer hash of a pixel, in [0, 1). Deterministic grain, no stream needed. */
function grain(x: number, y: number, salt: number) {
  let h = Math.imul(x, 0x27D4EB2D) ^ Math.imul(y, 0x165667B1) ^ salt
  h = Math.imul(h ^ (h >>> 15), 0x85EBCA77)
  h = Math.imul(h ^ (h >>> 13), 0xC2B2AE3D)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/**
 * Flat ground with a fine paper grain and a soft vignette. `S` is the short
 * side in pixels, so the vignette has the same shape at every size.
 */
export function paintGround(d: Uint8ClampedArray, W: number, H: number, S: number, bg: RGB, grainAmp: number, vignette: number, salt: number) {
  const cx = W / 2
  const cy = H / 2
  const inv = 1 / (S * S)
  // coarse grain cells grow with the canvas, so the paper texture scales too
  const gs = Math.max(1, Math.round(S / 700))
  let i = 0
  for (let y = 0; y < H; y++) {
    const dy = (y - cy) * (y - cy)
    const gy = (y / gs) | 0
    for (let x = 0; x < W; x++) {
      const r2 = ((x - cx) * (x - cx) + dy) * inv
      const v = 1 - vignette * r2
      const n = (grain((x / gs) | 0, gy, salt) - 0.5) * grainAmp
      d[i] = bg[0] * v + n
      d[i + 1] = bg[1] * v + n
      d[i + 2] = bg[2] * v + n
      d[i + 3] = 255
      i += 4
    }
  }
}

/** One antialiased round dot of radius r (pixels) and opacity a. */
export function dot(d: Uint8ClampedArray, W: number, H: number, x: number, y: number, r: number, c: RGB, a: number) {
  if (r < 0.75) {
    // sub-pixel dot: one pixel, its opacity scaled by the disc area
    const ix = Math.floor(x)
    const iy = Math.floor(y)
    if (ix < 0 || iy < 0 || ix >= W || iy >= H)
      return
    const t = a * Math.min(1, Math.PI * r * r)
    const i = (iy * W + ix) * 4
    d[i] += (c[0] - d[i]) * t
    d[i + 1] += (c[1] - d[i + 1]) * t
    d[i + 2] += (c[2] - d[i + 2]) * t
    return
  }
  const xa = Math.max(0, Math.floor(x - r))
  const xb = Math.min(W - 1, Math.ceil(x + r))
  const ya = Math.max(0, Math.floor(y - r))
  const yb = Math.min(H - 1, Math.ceil(y + r))
  const r1 = r + 0.5
  const r1s = r1 * r1
  for (let py = ya; py <= yb; py++) {
    const dy = py + 0.5 - y
    const dy2 = dy * dy
    let i = (py * W + xa) * 4
    for (let px = xa; px <= xb; px++, i += 4) {
      const dx = px + 0.5 - x
      const q = dx * dx + dy2
      if (q >= r1s)
        continue
      const cov = r1 - Math.sqrt(q)
      const t = cov >= 1 ? a : a * cov
      d[i] += (c[0] - d[i]) * t
      d[i + 1] += (c[1] - d[i + 1]) * t
      d[i + 2] += (c[2] - d[i + 2]) * t
    }
  }
}
