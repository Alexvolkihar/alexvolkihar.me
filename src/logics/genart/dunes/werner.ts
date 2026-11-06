// Werner's slab model of aeolian sand transport (Werner 1995, Geology 23).
//
// Sand lies on a periodic grid as a whole number of slabs per cell. At every
// event a cell is picked at random; if it holds sand and is not sheltered in
// the wind shadow of an upwind crest, one slab is lifted and carried `hop`
// cells downwind. It lands with probability `pSand` on sand, `pBare` on bare
// ground, always inside a shadow zone; otherwise it hops again. Any slope
// steeper than the angle of repose relaxes by slabs sliding down the steepest
// neighbour (avalanching), which builds slip faces. Run long enough, this
// handful of rules grows barchans, transverse ridges, linear seifs or star
// dunes depending on the wind regime and the sand supply.
//
// The implementation is original, written from Werner's description and the
// review of Kok, Parteli, Michaels & Karam (2012, Rep. Prog. Phys. 75).

import type { Rng } from '../random'

/** One wind: a lattice direction (dx, dy in -1..1) and its share of the events. */
export interface Wind {
  dx: number
  dy: number
  weight: number
}

export interface WernerParams {
  /**
   * Number of picks. Picks are drawn among the cells that hold sand: Werner
   * picks any cell and skips bare ones, which is the same process run slower.
   */
  events: number
  /** Saltation length, in cells along the wind. */
  hop: number
  pSand: number
  pBare: number
  /** Shadow slope in slabs per cell of upwind distance (tan 15 degrees / slab height). */
  shadow: number
  /** Largest stable height step between neighbours, in slabs (angle of repose). */
  repose: number
  /** Picks in one cycle of seasons, during which every wind blows once in turn. */
  season: number
}

/**
 * Runs the model in place on `h` (slabs per cell, gw x gh, periodic).
 * Consumes one draw per pick for the cell, and one per hop that lands
 * outside a shadow.
 */
export function werner(h: Int16Array, gw: number, gh: number, winds: readonly Wind[], p: WernerParams, r: Rng) {
  const cells = gw * gh
  const nw = winds.length
  const cum = new Float64Array(nw)
  let tot = 0
  for (let k = 0; k < nw; k++) {
    tot += winds[k].weight
    cum[k] = tot
  }
  for (let k = 0; k < nw; k++)
    cum[k] /= tot

  // x / y of every cell, and the wrapped neighbour tables
  const xs = new Int32Array(cells)
  const ys = new Int32Array(cells)
  for (let c = 0; c < cells; c++) {
    xs[c] = c % gw
    ys[c] = (c / gw) | 0
  }
  const wrapX = (x: number) => (x % gw + gw) % gw
  const wrapY = (y: number) => (y % gh + gh) % gh
  // Moore neighbours (8 per cell) for avalanching
  const NB = new Int32Array(cells * 8)
  const NDX = [1, 1, 0, -1, -1, -1, 0, 1]
  const NDY = [0, 1, 1, 1, 0, -1, -1, -1]
  for (let c = 0; c < cells; c++) {
    for (let k = 0; k < 8; k++)
      NB[c * 8 + k] = wrapY(ys[c] + NDY[k]) * gw + wrapX(xs[c] + NDX[k])
  }
  // diagonal steps are sqrt(2) long: their stable step is larger
  const rep = p.repose
  const repD = p.repose * Math.SQRT2

  // per wind: the hop offset, and the next cell along the wind
  const hopX = new Int32Array(nw)
  const hopY = new Int32Array(nw)
  const next: Int32Array[] = []
  const slopes = new Float64Array(nw)
  for (let k = 0; k < nw; k++) {
    const { dx, dy } = winds[k]
    const diag = dx !== 0 && dy !== 0
    const n = diag ? Math.max(1, Math.round(p.hop / Math.SQRT2)) : p.hop
    hopX[k] = dx * n
    hopY[k] = dy * n
    slopes[k] = p.shadow * (diag ? Math.SQRT2 : 1)
    const nx = new Int32Array(cells)
    for (let c = 0; c < cells; c++) {
      nx[c] = wrapY(ys[c] + dy) * gw + wrapX(xs[c] + dx)
    }
    next.push(nx)
  }

  // Shadow surface of the blowing wind: sh[c] = max over upwind cells u at
  // s steps of h[u] - s * slope. A cell is sheltered when sh[c] > h[c]. It
  // obeys sh[c] = max(h[prev], sh[prev]) - slope, so a change of height only
  // has to be carried downwind until the surface stops changing. Winds blow
  // in turn (seasons), and the surface is rebuilt when the wind turns.
  const sh = new Float64Array(cells)
  const orbit = new Int32Array(cells)
  const seen = new Uint8Array(cells)
  let kNow = -1
  const rebuild = (k: number) => {
    const nx = next[k]
    const sl = slopes[k]
    seen.fill(0)
    for (let c0 = 0; c0 < cells; c0++) {
      if (seen[c0])
        continue
      // one line of cells along the wind, closed by the torus
      let n = 0
      let c = c0
      do {
        seen[c] = 1
        orbit[n++] = c
        c = nx[c]
      } while (c !== c0)
      // two laps: the second starts from a settled value
      let v = -1e9
      for (let lap = 0; lap < 2; lap++) {
        for (let i = 0; i < n; i++) {
          const ci = orbit[i]
          const pi = orbit[i === 0 ? n - 1 : i - 1]
          v = Math.max(h[pi], v) - sl
          sh[ci] = v
        }
      }
    }
    kNow = k
  }
  const carry = (c: number) => {
    const nx = next[kNow]
    const sl = slopes[kNow]
    let u = c
    let t = nx[c]
    for (let guard = 0; guard < cells; guard++) {
      const v = Math.max(h[u], sh[u]) - sl
      if (v === sh[t])
        break
      sh[t] = v
      u = t
      t = nx[t]
    }
  }
  // cells holding sand, in a swap-remove list: picks only land on sand
  const occ = new Int32Array(cells)
  const pos = new Int32Array(cells).fill(-1)
  let nOcc = 0
  for (let c = 0; c < cells; c++) {
    if (h[c] > 0) {
      pos[c] = nOcc
      occ[nOcc++] = c
    }
  }
  const take = (c: number) => {
    if (--h[c] === 0) {
      const i = pos[c]
      const last = occ[--nOcc]
      occ[i] = last
      pos[last] = i
      pos[c] = -1
    }
    carry(c)
  }
  const give = (c: number) => {
    if (h[c]++ === 0) {
      pos[c] = nOcc
      occ[nOcc++] = c
    }
    carry(c)
  }
  const move = (from: number, to: number) => {
    take(from)
    give(to)
  }

  // A slab just landed on c: let it slide down the steepest unstable neighbour.
  const slideDown = (c: number) => {
    for (let guard = 0; guard < 64; guard++) {
      const hc = h[c]
      let best = -1
      let bestS = 0
      const o = c * 8
      for (let k = 0; k < 8; k++) {
        const n = NB[o + k]
        const d = hc - h[n]
        const lim = (k & 1) ? repD : rep
        if (d > lim) {
          const s = (k & 1) ? d * Math.SQRT1_2 : d
          if (s > bestS) {
            bestS = s
            best = n
          }
        }
      }
      if (best < 0)
        return
      move(c, best)
      c = best
    }
  }

  // A slab just left c: the steepest unstable neighbour above slides into it.
  const slideIn = (c: number) => {
    for (let guard = 0; guard < 64; guard++) {
      const hc = h[c]
      let best = -1
      let bestS = 0
      const o = c * 8
      for (let k = 0; k < 8; k++) {
        const n = NB[o + k]
        const d = h[n] - hc
        const lim = (k & 1) ? repD : rep
        if (d > lim) {
          const s = (k & 1) ? d * Math.SQRT1_2 : d
          if (s > bestS) {
            bestS = s
            best = n
          }
        }
      }
      if (best < 0)
        return
      move(best, c)
      c = best
    }
  }

  const pS = p.pSand
  const pB = p.pBare
  const maxHops = Math.ceil(Math.max(gw, gh) / Math.max(1, p.hop)) + 1
  // seasons: each wind blows for a share of the cycle proportional to its weight
  const cycle = Math.max(1, Math.round(p.season))
  const ends = new Float64Array(nw)
  for (let k = 0; k < nw; k++)
    ends[k] = cum[k] * cycle
  for (let e = 0; e < p.events; e++) {
    const phase = e % cycle
    let k = 0
    while (k < nw - 1 && phase >= ends[k])
      k++
    if (k !== kNow)
      rebuild(k)
    if (nOcc === 0)
      break
    const c = occ[(r() * nOcc) | 0]
    if (sh[c] > h[c])
      continue
    take(c)
    slideIn(c)
    let x = xs[c]
    let y = ys[c]
    const hx = hopX[k]
    const hy = hopY[k]
    let t = c
    // on a bare floor where nothing catches it, a slab settles after one lap
    for (let hops = 0; hops < maxHops; hops++) {
      x += hx
      y += hy
      if (x < 0)
        x += gw
      else if (x >= gw)
        x -= gw
      if (y < 0)
        y += gh
      else if (y >= gh)
        y -= gh
      t = y * gw + x
      if (sh[t] > h[t] || r() < (h[t] > 0 ? pS : pB))
        break
    }
    give(t)
    slideDown(t)
  }
}
