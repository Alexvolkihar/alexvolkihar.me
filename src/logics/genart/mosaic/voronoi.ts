// Voronoi cells by half-plane clipping, and Lloyd relaxation.
//
// Each cell starts as the domain rectangle and is clipped (Sutherland-Hodgman)
// by the perpendicular bisector between its site and every nearby site. Sites
// are bucketed in a uniform grid and visited ring by ring: once the farthest
// corner of the cell is closer than half the distance to the next ring, no
// further site can cut it, so each cell only looks at a couple of dozen
// neighbours. Lloyd relaxation (Lloyd, "Least squares quantization in PCM",
// 1982) then moves every site to the centroid of its cell, here weighted by a
// density so that small cells gather where the density is high.
//
// All coordinates are abstract units; nothing here reads the canvas.

export type Density = (x: number, y: number) => number

export interface Domain {
  x0: number
  y0: number
  x1: number
  y1: number
}

const MAX_VERTS = 96

/**
 * One convex polygon per site, as flat [x0, y0, x1, y1, ...] arrays.
 * A cell clipped to nothing (never for distinct sites) is an empty array.
 */
export function voronoi(xs: Float64Array, ys: Float64Array, d: Domain): Float64Array[] {
  const n = xs.length
  const w = d.x1 - d.x0
  const h = d.y1 - d.y0
  const cs = Math.sqrt((w * h) / Math.max(1, n)) * 1.2
  const gw = Math.max(1, Math.ceil(w / cs))
  const gh = Math.max(1, Math.ceil(h / cs))

  // Counting sort of the sites into grid buckets.
  const cellOf = new Int32Array(n)
  const start = new Int32Array(gw * gh + 1)
  for (let i = 0; i < n; i++) {
    const gx = Math.min(gw - 1, Math.max(0, Math.floor((xs[i] - d.x0) / cs)))
    const gy = Math.min(gh - 1, Math.max(0, Math.floor((ys[i] - d.y0) / cs)))
    cellOf[i] = gy * gw + gx
    start[cellOf[i] + 1]++
  }
  for (let c = 0; c < gw * gh; c++)
    start[c + 1] += start[c]
  const fill = start.slice(0, gw * gh)
  const items = new Int32Array(n)
  for (let i = 0; i < n; i++)
    items[fill[cellOf[i]]++] = i

  let a = new Float64Array(MAX_VERTS * 2)
  let b = new Float64Array(MAX_VERTS * 2)
  const out: Float64Array[] = []
  const maxRing = Math.max(gw, gh)

  for (let i = 0; i < n; i++) {
    const sx = xs[i]
    const sy = ys[i]
    a[0] = d.x0
    a[1] = d.y0
    a[2] = d.x1
    a[3] = d.y0
    a[4] = d.x1
    a[5] = d.y1
    a[6] = d.x0
    a[7] = d.y1
    let m = 4
    const cx = cellOf[i] % gw
    const cy = (cellOf[i] - cx) / gw

    for (let r = 0; r <= maxRing && m > 0; r++) {
      for (let gy = cy - r; gy <= cy + r; gy++) {
        if (gy < 0 || gy >= gh)
          continue
        const edge = gy === cy - r || gy === cy + r
        for (let gx = cx - r; gx <= cx + r; gx += edge ? 1 : 2 * r) {
          if (gx >= 0 && gx < gw) {
            const c = gy * gw + gx
            for (let k = start[c]; k < start[c + 1]; k++) {
              const j = items[k]
              if (j === i)
                continue
              // keep the side of the bisector that holds site i
              const dx = xs[j] - sx
              const dy = ys[j] - sy
              const lim = (dx * (xs[j] + sx) + dy * (ys[j] + sy)) * 0.5
              let q = 0
              for (let v = 0; v < m; v++) {
                const px = a[v * 2]
                const py = a[v * 2 + 1]
                const u = (v + 1) % m
                const qx = a[u * 2]
                const qy = a[u * 2 + 1]
                const sp = px * dx + py * dy - lim
                const sq = qx * dx + qy * dy - lim
                if (sp <= 0 && q < MAX_VERTS) {
                  b[q * 2] = px
                  b[q * 2 + 1] = py
                  q++
                }
                if ((sp <= 0) !== (sq <= 0) && q < MAX_VERTS) {
                  const t = sp / (sp - sq)
                  b[q * 2] = px + (qx - px) * t
                  b[q * 2 + 1] = py + (qy - py) * t
                  q++
                }
              }
              const tmp = a
              a = b
              b = tmp
              m = q
              if (m === 0)
                break
            }
          }
          if (r === 0)
            break
        }
      }
      // every site beyond ring r is at least r * cs away
      let far = 0
      for (let v = 0; v < m; v++) {
        const ex = a[v * 2] - sx
        const ey = a[v * 2 + 1] - sy
        far = Math.max(far, ex * ex + ey * ey)
      }
      if (4 * far <= (r * cs) * (r * cs))
        break
    }
    out.push(a.slice(0, m * 2))
  }
  return out
}

/**
 * Density-weighted centroid of a convex polygon, by fan triangles weighted by
 * their area and the density at their centroid. Writes into res[0], res[1].
 */
export function centroid(p: Float64Array, dens: Density | null, res: Float64Array): void {
  const m = p.length / 2
  let sw = 0
  let sx = 0
  let sy = 0
  for (let v = 1; v < m - 1; v++) {
    const ax = p[0]
    const ay = p[1]
    const bx = p[v * 2]
    const by = p[v * 2 + 1]
    const cx = p[v * 2 + 2]
    const cy = p[v * 2 + 3]
    const area = Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) * 0.5
    const gx = (ax + bx + cx) / 3
    const gy = (ay + by + cy) / 3
    const wgt = dens ? area * dens(gx, gy) : area
    sw += wgt
    sx += gx * wgt
    sy += gy * wgt
  }
  if (sw > 0) {
    res[0] = sx / sw
    res[1] = sy / sw
  }
}

/**
 * A few rounds of (weighted) Lloyd relaxation, in place, then the final cells.
 * The first `fixed` sites are pinned and never move.
 */
export function relax(xs: Float64Array, ys: Float64Array, d: Domain, dens: Density | null, rounds: number, fixed = 0): Float64Array[] {
  const c = new Float64Array(2)
  let cells = voronoi(xs, ys, d)
  for (let k = 0; k < rounds; k++) {
    for (let i = fixed; i < xs.length; i++) {
      if (cells[i].length < 6)
        continue
      c[0] = xs[i]
      c[1] = ys[i]
      centroid(cells[i], dens, c)
      xs[i] = c[0]
      ys[i] = c[1]
    }
    cells = voronoi(xs, ys, d)
  }
  return cells
}
