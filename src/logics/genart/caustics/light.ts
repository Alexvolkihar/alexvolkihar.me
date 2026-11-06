// Light through the surface and onto the floor.
//
// Every lattice point of the surface sends one ray, refracted with the vector
// form of Snell's law, down to the floor; where it lands is the point's
// displacement. The brightness of the floor is the density of the landed
// light, gathered as in Arvo's illumination maps ("Backward Ray Tracing",
// 1986) and Evan Wallace's area ratio ("Rendering Realtime Caustics in
// WebGL", 2016): each small triangle of the surface carries a fixed amount of
// light, spread over the triangle it becomes on the floor. Triangles that
// shrink are splatted bilinearly as one photon; triangles that grow are cut
// into more photons, or rasterised when very large, so dim regions stay smooth
// instead of turning into dots.

/** Unit vector of the incoming sunlight (z points up, so iz < 0). */
export interface Sun { x: number, y: number, z: number }

/**
 * Horizontal displacement per unit depth of a ray refracted at a surface of
 * slopes (sx, sy), relative ratio eta = n_outside / n_inside, written to
 * out[o], out[o + 1]. The offset of a flat surface is removed, so a calm
 * surface maps every point onto itself.
 */
export type Refract = (sx: number, sy: number, out: Float32Array, o: number) => void

export function refractor(eta: number, sun: Sun): Refract {
  const ci0 = -sun.z
  const fz = eta * sun.z + eta * ci0 - Math.sqrt(Math.max(0, 1 - eta * eta * (1 - ci0 * ci0)))
  const offX = (eta * sun.x) / -fz
  const offY = (eta * sun.y) / -fz
  const e2 = eta * eta
  return (sx, sy, out, o) => {
    const inv = 1 / Math.sqrt(sx * sx + sy * sy + 1)
    const nx = -sx * inv
    const ny = -sy * inv
    const nz = inv
    const cosi = -(nx * sun.x + ny * sun.y + nz * sun.z)
    const k = 1 - e2 * (1 - cosi * cosi)
    const m = eta * cosi - Math.sqrt(k > 0 ? k : 0)
    const tz = -1 / (eta * sun.z + m * nz)
    out[o] = (eta * sun.x + m * nx) * tz - offX
    out[o + 1] = (eta * sun.y + m * ny) * tz - offY
  }
}

/**
 * Gathers the light of an nx × ny vertex lattice into its (nx-1) × (ny-1) cells.
 * `px`, `py` hold where each vertex lands, in lattice units (vertex i sits at
 * i on a calm surface, cell a is centred on a + 0.5); `weight` scales the
 * light each vertex lets through (null = all of it). Every surface cell is
 * cut into `k` × `k` sub-cells, two triangles each. A calm surface yields 1
 * in every cell.
 */
/** Largest floor area (cells) one bilinear photon may stand for. */
const PHOTON = 0.3
/** Past MAX_SPLIT^2 photons, a triangle is rasterised instead. */
const MAX_SPLIT = 6

export function gather(px: Float32Array, py: Float32Array, weight: Float32Array | null, nx: number, ny: number, k: number): Float32Array {
  const cw = nx - 1
  const ch = ny - 1
  const acc = new Float32Array(cw * ch)
  const e0 = 1 / (2 * k * k)

  const splat = (x: number, y: number, e: number) => {
    const fx = x - 0.5
    const fy = y - 0.5
    const ix = Math.floor(fx)
    const iy = Math.floor(fy)
    if (ix < 0 || iy < 0 || ix >= cw - 1 || iy >= ch - 1)
      return
    const tx = fx - ix
    const ty = fy - iy
    const o = iy * cw + ix
    const a = e * (1 - ty)
    const b = e * ty
    acc[o] += a * (1 - tx)
    acc[o + 1] += a * tx
    acc[o + cw] += b * (1 - tx)
    acc[o + cw + 1] += b * tx
  }

  const tri = (x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, e: number) => {
    const cross = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)
    const area = Math.abs(cross) * 0.5
    if (area < PHOTON) {
      splat((x0 + x1 + x2) / 3, (y0 + y1 + y2) / 3, e)
      return
    }
    const L = Math.ceil(Math.sqrt(area / PHOTON))
    if (L <= MAX_SPLIT) {
      // cut into L^2 equal triangles, one photon at each centroid
      const ux = (x1 - x0) / L
      const uy = (y1 - y0) / L
      const vx = (x2 - x0) / L
      const vy = (y2 - y0) / L
      const es = e / (L * L)
      for (let p = 0; p < L; p++) {
        for (let q = 0; q < L - p; q++) {
          splat(x0 + (p + 1 / 3) * ux + (q + 1 / 3) * vx, y0 + (p + 1 / 3) * uy + (q + 1 / 3) * vy, es)
          if (p + q < L - 1)
            splat(x0 + (p + 2 / 3) * ux + (q + 2 / 3) * vx, y0 + (p + 2 / 3) * uy + (q + 2 / 3) * vy, es)
        }
      }
      return
    }
    // large triangles: every cell centre inside gets the light per unit area
    const s = cross > 0 ? 1 : -1
    const v = e / area
    const a0 = Math.max(0, Math.ceil(Math.min(x0, x1, x2) - 0.5))
    const a1 = Math.min(cw - 1, Math.floor(Math.max(x0, x1, x2) - 0.5))
    const b0 = Math.max(0, Math.ceil(Math.min(y0, y1, y2) - 0.5))
    const b1 = Math.min(ch - 1, Math.floor(Math.max(y0, y1, y2) - 0.5))
    for (let b = b0; b <= b1; b++) {
      const cy = b + 0.5
      for (let a = a0; a <= a1; a++) {
        const cx = a + 0.5
        const w0 = s * ((x1 - x0) * (cy - y0) - (y1 - y0) * (cx - x0))
        const w1 = s * ((x2 - x1) * (cy - y1) - (y2 - y1) * (cx - x1))
        const w2 = s * ((x0 - x2) * (cy - y2) - (y0 - y2) * (cx - x2))
        if (w0 >= 0 && w1 >= 0 && w2 >= 0)
          acc[b * cw + a] += v
      }
    }
  }

  // sub-lattice of one surface cell, (k+1)^2 points
  const m = k + 1
  const sxv = new Float32Array(m * m)
  const syv = new Float32Array(m * m)
  const inv = 1 / k
  for (let j = 0; j < ch; j++) {
    for (let i = 0; i < cw; i++) {
      const o = j * nx + i
      let e = e0
      if (weight) {
        e *= 0.25 * (weight[o] + weight[o + 1] + weight[o + nx] + weight[o + nx + 1])
        if (e <= 0)
          continue
      }
      const ax = px[o]
      const ay = py[o]
      const bx = px[o + 1]
      const by = py[o + 1]
      const cx = px[o + nx]
      const cy = py[o + nx]
      const dx = px[o + nx + 1]
      const dy = py[o + nx + 1]
      // fast path: a cell that did not grow much is splatted as k^2 photons
      // at the centres of its sub-cells (calm area = 1 cell)
      const area = 0.5 * Math.abs((dx - ax) * (cy - by) - (cx - bx) * (dy - ay))
      if (area < 1.6) {
        for (let q = 0; q < k; q++) {
          const t = (q + 0.5) * inv
          const lx = ax + (cx - ax) * t
          const ly = ay + (cy - ay) * t
          const rx = bx + (dx - bx) * t
          const ry = by + (dy - by) * t
          for (let p = 0; p < k; p++) {
            const s = (p + 0.5) * inv
            splat(lx + (rx - lx) * s, ly + (ry - ly) * s, 2 * e)
          }
        }
        continue
      }
      for (let q = 0; q < m; q++) {
        const t = q * inv
        const lx = ax + (cx - ax) * t
        const ly = ay + (cy - ay) * t
        const rx = bx + (dx - bx) * t
        const ry = by + (dy - by) * t
        for (let p = 0; p < m; p++) {
          const s = p * inv
          sxv[q * m + p] = lx + (rx - lx) * s
          syv[q * m + p] = ly + (ry - ly) * s
        }
      }
      for (let q = 0; q < k; q++) {
        for (let p = 0; p < k; p++) {
          const i00 = q * m + p
          const i10 = i00 + 1
          const i01 = i00 + m
          const i11 = i01 + 1
          tri(sxv[i00], syv[i00], sxv[i10], syv[i10], sxv[i11], syv[i11], e)
          tri(sxv[i00], syv[i00], sxv[i11], syv[i11], sxv[i01], syv[i01], e)
        }
      }
    }
  }
  return acc
}

/** In-place [1 2 1] / 4 blur along both axes: removes the one-cell ripple of the photons. */
export function soften(a: Float32Array, w: number, h: number) {
  const row = new Float32Array(Math.max(w, h))
  for (let y = 0; y < h; y++) {
    const o = y * w
    for (let x = 0; x < w; x++)
      row[x] = a[o + x]
    for (let x = 1; x < w - 1; x++)
      a[o + x] = 0.25 * (row[x - 1] + row[x + 1]) + 0.5 * row[x]
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++)
      row[y] = a[y * w + x]
    for (let y = 1; y < h - 1; y++)
      a[y * w + x] = 0.25 * (row[y - 1] + row[y + 1]) + 0.5 * row[y]
  }
}
