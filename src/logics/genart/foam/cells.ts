// Bubble packing and power-diagram cells for the "Foam" series.
//
// A bubble is a disc (centre, radius r) with a wetness `a`. The packing is a
// soft-disc relaxation in the spirit of Durian's bubble model ("Foam mechanics
// at the bubble scale", Phys. Rev. Lett. 75, 1995): overlapping neighbours push
// each other apart until their centres sit at a target distance. In a dry foam
// (a = 0.5) that distance is sqrt(ri² + rj² - ri rj), the distance at which two
// circles cross at 120°, so neighbouring bubble surfaces meet the shared film
// at Plateau's angle. Wetter foams (a towards 1) push the centres apart until
// the discs barely touch, and beyond 1 they float free in the liquid.
//
// The cell of a bubble is its power (Laguerre) cell, with weight r², clipped by
// its own disc: Aurenhammer, "Power diagrams: properties, algorithms and
// applications" (SIAM J. Comput. 16, 1987). The edge between two overlapping
// discs lies on their radical axis, which passes through the two points where
// the circles cross, and a disc that does not overlap bubble i can never cut
// its cell, so only overlapping neighbours are visited. Every edge keeps the
// index of the neighbour that cut it (or -1 for the bubble's own free surface,
// -2 for a container wall), which is what lets the renderer bend each film by
// the pressure difference across it.
//
// All coordinates are in units of the canvas short side.

export interface Bubble {
  x: number
  y: number
  r: number
  /** Packing factor: 0.5 is a dry foam, 1 touching discs, above 1 apart. */
  a: number
  /** Plateau border radius as a fraction of r. */
  q: number
}

export type Domain
  = | { kind: 'box', x0: number, y0: number, x1: number, y1: number }
    | { kind: 'disc', cx: number, cy: number, R: number }
    | { kind: 'free', cx: number, cy: number, pull: number, sx: number, sy: number }

/** Convex polygon; edge k runs from vertex k to k + 1 and was cut by `lab[k]`. */
export interface Poly {
  x: number[]
  y: number[]
  lab: number[]
}

export interface Cell {
  /** Index of the bubble. */
  i: number
  /** Full power cell (clipped by the disc), shared edges touching. */
  full: Poly
  /** Cell eroded by the Plateau border radius plus half a film. */
  core: Poly
  /** Plateau border radius used to round the core back out. */
  q: number
  cx: number
  cy: number
  area: number
  /** Number of distinct neighbours (films) of the full cell. */
  sides: number
}

function target(p: Bubble, o: Bubble): number {
  const g = Math.sqrt(p.r * p.r + o.r * o.r - p.r * o.r)
  const a = (p.a + o.a) / 2
  return g + (2 * a - 1) * (p.r + o.r - g)
}

interface Grid {
  size: number
  x0: number
  y0: number
  gw: number
  gh: number
  start: Int32Array
  items: Int32Array
}

function buildGrid(bs: Bubble[], size: number): Grid {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const b of bs) {
    x0 = Math.min(x0, b.x)
    y0 = Math.min(y0, b.y)
    x1 = Math.max(x1, b.x)
    y1 = Math.max(y1, b.y)
  }
  const gw = Math.max(1, Math.min(1024, Math.ceil((x1 - x0) / size) + 1))
  const gh = Math.max(1, Math.min(1024, Math.ceil((y1 - y0) / size) + 1))
  const n = bs.length
  const cellOf = new Int32Array(n)
  const start = new Int32Array(gw * gh + 1)
  for (let i = 0; i < n; i++) {
    const gx = Math.min(gw - 1, Math.floor((bs[i].x - x0) / size))
    const gy = Math.min(gh - 1, Math.floor((bs[i].y - y0) / size))
    cellOf[i] = gy * gw + gx
    start[cellOf[i] + 1]++
  }
  for (let c = 0; c < gw * gh; c++)
    start[c + 1] += start[c]
  const fill = start.slice(0, gw * gh)
  const items = new Int32Array(n)
  for (let i = 0; i < n; i++)
    items[fill[cellOf[i]]++] = i
  return { size, x0, y0, gw, gh, start, items }
}

/** Calls fn(j) for every bubble j > i in the 3x3 grid cells around bubble i. */
function forNear(g: Grid, b: Bubble, i: number, fn: (j: number) => void) {
  const gx = Math.min(g.gw - 1, Math.floor((b.x - g.x0) / g.size))
  const gy = Math.min(g.gh - 1, Math.floor((b.y - g.y0) / g.size))
  for (let y = Math.max(0, gy - 1); y <= Math.min(g.gh - 1, gy + 1); y++) {
    for (let x = Math.max(0, gx - 1); x <= Math.min(g.gw - 1, gx + 1); x++) {
      const c = y * g.gw + x
      for (let k = g.start[c]; k < g.start[c + 1]; k++) {
        const j = g.items[k]
        if (j > i)
          fn(j)
      }
    }
  }
}

/**
 * Relaxes the packing in place. The discs start deflated and are inflated
 * over the first half of the run (as in Lubachevsky and Stillinger's
 * compression of hard discs), so a random start settles into a jammed foam
 * instead of a tangle of deep overlaps.
 */
export function relax(bs: Bubble[], dom: Domain, iterations: number) {
  const n = bs.length
  if (!n)
    return
  let rmax = 0
  let amax = 0.5
  for (const b of bs) {
    rmax = Math.max(rmax, b.r)
    amax = Math.max(amax, b.a)
  }
  const reachK = Math.max(1, 2 * amax - 1)
  // grid cells sized for the typical bubble; a big bubble looks further out
  const sorted = bs.map(b => b.r).sort((a, b) => a - b)
  const size = 2 * sorted[Math.floor(n / 2)] * reachK
  const dx = new Float64Array(n)
  const dy = new Float64Array(n)
  const w = bs.map(b => b.r * b.r)
  for (let it = 0; it < iterations; it++) {
    const grow = Math.min(1, 0.6 + 0.4 * it / (iterations * 0.5))
    dx.fill(0)
    dy.fill(0)
    const grid = buildGrid(bs, size)
    for (let i = 0; i < n; i++) {
      const p = bs[i]
      const ring = Math.ceil((p.r + rmax) * reachK / size)
      const gx = Math.min(grid.gw - 1, Math.floor((p.x - grid.x0) / size))
      const gy = Math.min(grid.gh - 1, Math.floor((p.y - grid.y0) / size))
      for (let y = Math.max(0, gy - ring); y <= Math.min(grid.gh - 1, gy + ring); y++) {
        for (let x = Math.max(0, gx - ring); x <= Math.min(grid.gw - 1, gx + ring); x++) {
          const c = y * grid.gw + x
          for (let k = grid.start[c]; k < grid.start[c + 1]; k++) {
            const j = grid.items[k]
            if (j <= i)
              continue
            const o = bs[j]
            let ex = o.x - p.x
            let ey = o.y - p.y
            const lim = (p.r + o.r) * reachK
            if (ex > lim || ex < -lim || ey > lim || ey < -lim)
              continue
            const t = target(p, o) * grow
            let d = Math.sqrt(ex * ex + ey * ey)
            if (d >= t)
              continue
            if (d < 1e-9) {
              // coincident centres: part them along a direction fixed by the indices
              const ang = (i * 7 + j * 13) % 360 * Math.PI / 180
              ex = Math.cos(ang)
              ey = Math.sin(ang)
              d = 1e-9
            }
            else {
              ex /= d
              ey /= d
            }
            const cc = (t - d) * 0.5
            const wi = w[j] / (w[i] + w[j])
            const wj = 1 - wi
            dx[i] -= ex * cc * wi
            dy[i] -= ey * cc * wi
            dx[j] += ex * cc * wj
            dy[j] += ey * cc * wj
          }
        }
      }
    }
    const fade = 1 - it / iterations
    for (let i = 0; i < n; i++) {
      const b = bs[i]
      b.x += dx[i] * 0.9
      b.y += dy[i] * 0.9
      if (dom.kind === 'box') {
        b.x = Math.min(dom.x1, Math.max(dom.x0, b.x))
        b.y = Math.min(dom.y1, Math.max(dom.y0, b.y))
      }
      else if (dom.kind === 'disc') {
        const ox = b.x - dom.cx
        const oy = b.y - dom.cy
        const d = Math.hypot(ox, oy)
        const lim = dom.R - b.r * b.a * 0.9
        if (d > lim && d > 0) {
          b.x = dom.cx + ox / d * lim
          b.y = dom.cy + oy / d * lim
        }
      }
      else {
        // surface tension of the raft: a pull towards an elliptical centre
        const k = dom.pull * fade
        b.x += (dom.cx - b.x) * k * dom.sx
        b.y += (dom.cy - b.y) * k * dom.sy
      }
    }
  }
}

function clip(p: Poly, nx: number, ny: number, h: number, label: number): Poly {
  const out: Poly = { x: [], y: [], lab: [] }
  const m = p.x.length
  for (let k = 0; k < m; k++) {
    const k1 = (k + 1) % m
    const ax = p.x[k]
    const ay = p.y[k]
    const bx = p.x[k1]
    const by = p.y[k1]
    const da = nx * ax + ny * ay - h
    const db = nx * bx + ny * by - h
    if (da <= 0) {
      out.x.push(ax)
      out.y.push(ay)
      out.lab.push(p.lab[k])
      if (db > 0) {
        const t = da / (da - db)
        out.x.push(ax + (bx - ax) * t)
        out.y.push(ay + (by - ay) * t)
        out.lab.push(label)
      }
    }
    else if (db <= 0) {
      const t = da / (da - db)
      out.x.push(ax + (bx - ax) * t)
      out.y.push(ay + (by - ay) * t)
      out.lab.push(p.lab[k])
    }
  }
  return out
}

function circle(cx: number, cy: number, r: number, segs: number, label: number): Poly {
  const p: Poly = { x: [], y: [], lab: [] }
  for (let k = 0; k < segs; k++) {
    const t = k / segs * Math.PI * 2
    p.x.push(cx + Math.cos(t) * r)
    p.y.push(cy + Math.sin(t) * r)
    p.lab.push(label)
  }
  return p
}

function centroid(p: Poly): [number, number, number] {
  let A = 0
  let cx = 0
  let cy = 0
  const m = p.x.length
  for (let k = 0; k < m; k++) {
    const k1 = (k + 1) % m
    const c = p.x[k] * p.y[k1] - p.x[k1] * p.y[k]
    A += c
    cx += (p.x[k] + p.x[k1]) * c
    cy += (p.y[k] + p.y[k1]) * c
  }
  if (Math.abs(A) < 1e-14)
    return [p.x[0] ?? 0, p.y[0] ?? 0, 0]
  return [cx / (3 * A), cy / (3 * A), Math.abs(A) / 2]
}

/** Distance from (x, y) to the nearest edge line of a convex polygon. */
function inradius(p: Poly, x: number, y: number): number {
  let best = Infinity
  const m = p.x.length
  for (let k = 0; k < m; k++) {
    const k1 = (k + 1) % m
    const ex = p.x[k1] - p.x[k]
    const ey = p.y[k1] - p.y[k]
    const L = Math.hypot(ex, ey)
    if (L < 1e-12)
      continue
    best = Math.min(best, Math.abs((x - p.x[k]) * ey - (y - p.y[k]) * ex) / L)
  }
  return best
}

/**
 * Power cells of the bubbles, each clipped by its own disc and by the domain
 * wall, plus the same cell eroded by its Plateau border radius and half the
 * film thickness `film`. `segLen` is the length of one segment of a disc
 * outline (a finer outline at a larger canvas, same shape).
 */
export function cells(bs: Bubble[], dom: Domain, film: number, segLen: number): Cell[] {
  const n = bs.length
  let rmax = 0
  for (const b of bs)
    rmax = Math.max(rmax, b.r)
  const grid = buildGrid(bs, 2 * rmax)
  const nb: number[][] = bs.map(() => [])
  for (let i = 0; i < n; i++) {
    forNear(grid, bs[i], i, (j) => {
      const d = Math.hypot(bs[j].x - bs[i].x, bs[j].y - bs[i].y)
      if (d < bs[i].r + bs[j].r) {
        nb[i].push(j)
        nb[j].push(i)
      }
    })
  }

  const build = (i: number, e: number): Poly => {
    const b = bs[i]
    const segs = Math.max(18, Math.min(220, Math.ceil(2 * Math.PI * b.r / segLen)))
    let p = circle(b.x, b.y, Math.max(1e-6, b.r - e), segs, -1)
    for (const j of nb[i]) {
      if (p.x.length < 3)
        break
      const o = bs[j]
      const ex = o.x - b.x
      const ey = o.y - b.y
      const L = Math.hypot(ex, ey)
      if (L < 1e-12)
        continue
      const h = (o.x * o.x + o.y * o.y - b.x * b.x - b.y * b.y - o.r * o.r + b.r * b.r) / (2 * L)
      p = clip(p, ex / L, ey / L, h - e, j)
    }
    if (dom.kind === 'disc' && p.x.length >= 3) {
      const d = Math.hypot(b.x - dom.cx, b.y - dom.cy)
      if (d + b.r > dom.R) {
        // the curved wall, as tangent half-planes facing the bubble
        const base = Math.atan2(b.y - dom.cy, b.x - dom.cx)
        const span = Math.min(Math.PI, 2.2 * b.r / dom.R + 0.1)
        const k = Math.max(4, Math.ceil(span * dom.R / segLen / 2))
        for (let s = -k; s <= k && p.x.length >= 3; s++) {
          const t = base + span * s / k
          const nx = Math.cos(t)
          const ny = Math.sin(t)
          p = clip(p, nx, ny, nx * dom.cx + ny * dom.cy + dom.R - e, -2)
        }
      }
    }
    return p
  }

  const out: Cell[] = []
  for (let i = 0; i < n; i++) {
    const b = bs[i]
    const full = build(i, 0)
    if (full.x.length < 3)
      continue
    const [cx, cy, area] = centroid(full)
    if (area < 1e-9)
      continue
    const inr = inradius(full, cx, cy)
    const q = Math.max(0, Math.min(b.q * b.r, 0.8 * inr - film / 2))
    const e = q + film / 2
    if (e >= inr * 0.95)
      continue
    const core = build(i, e)
    if (core.x.length < 3)
      continue
    const sides = new Set(full.lab.filter(l => l >= 0)).size
    out.push({ i, full, core, q, cx, cy, area, sides })
  }
  return out
}
