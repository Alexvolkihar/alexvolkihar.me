// Patchwork of shifted copies of the dune torus, for the "Dunes" series.
//
// The simulated field is periodic, so a wide canvas would show the same
// dunes over and over. Several copies of the torus, each shifted by a random
// fraction of a period, are laid over the plane instead, and every dune of
// every copy is kept or dropped as a whole: a copy keeps the dunes whose
// centre falls where its own slow noise is the highest of all copies.
// Where two kept dunes overlap, the taller one shows; the bare floor in
// between comes from any copy that is bare there. The noise never repeats,
// so neither does the field. A chain of dunes linked by low horns is told
// apart into its dunes; a dune that wraps around the torus has no single
// centre, and only the first copy keeps it.

import type { Noise2 } from './field'

/** Sand higher than this (cells) counts when two kept dunes overlap. */
const OVERLAP = 0.3
/** Length of the taper where the patchwork cuts a dune from its neighbour, in cells. */
const TAPER = 3

export interface Dunes {
  /** Dune of each cell (-1 on bare floor), on the n x n torus. */
  label: Int32Array
  /** Centre of each dune, in cells of the torus. */
  cx: Float64Array
  cy: Float64Array
  /**
   * Period of each cell relative to the centre of its dune: a dune that
   * straddles the edge of the torus has cells on both sides of it.
   */
  relX: Int32Array
  relY: Int32Array
  /** 1 when the dune wraps around the torus (a ridge running out of the period). */
  wraps: Uint8Array
  /** Share of the sand cells that belong to wrapping dunes. */
  wrapShare: number
}

/**
 * Splits the sand of `mask` into dunes on an n x n torus (8-neighbourhood).
 * Cells are flooded from the highest down; where two rising dunes meet, they
 * stay apart only if the neck between them is lower than `neck` times the
 * summit of the smaller one, so a chain of barchans linked by low horns
 * splits into its dunes while the bumps of one dune do not. Swells lower
 * than 0.4 cells (and the bare shadows cast on the floor) always join.
 * Dunes that still wrap around the torus are split again with each next,
 * laxer value of `necks`, which cuts a wrapping chain at its lowest necks.
 */
export function dunePatches(mask: Uint8Array, z: Float32Array, n: number, necks: readonly number[]): Dunes {
  const cells = n * n
  const label = new Int32Array(cells).fill(-1)
  const parent = new Int32Array(cells)
  const peak = new Float32Array(cells)
  const find = (c: number) => {
    let r = c
    while (parent[r] !== r)
      r = parent[r]
    while (parent[c] !== r) {
      const nx = parent[c]
      parent[c] = r
      c = nx
    }
    return r
  }
  let next = 0
  // floods the cells of `part` (highest first), labelling them from `next` on
  const flood = (part: number[], neck: number) => {
    for (const c of part) {
      parent[c] = -1
      label[c] = -2
    }
    const roots: number[] = []
    for (const c of part) {
      const x = c % n
      const y = (c / n) | 0
      roots.length = 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy)
            continue
          const m = ((y + dy + n) % n) * n + (x + dx + n) % n
          if (label[m] !== -2 || parent[m] < 0)
            continue
          const r = find(m)
          if (!roots.includes(r))
            roots.push(r)
        }
      }
      if (!roots.length) {
        parent[c] = c
        peak[c] = z[c]
        continue
      }
      let top = roots[0]
      for (const r of roots) {
        if (peak[r] > peak[top])
          top = r
      }
      parent[c] = top
      for (const r of roots) {
        if (r !== top && (z[c] > neck * peak[r] || peak[r] < 0.4))
          parent[r] = top
      }
    }
    const ids = new Map<number, number>()
    for (const c of part) {
      const r = find(c)
      let id = ids.get(r)
      if (id === undefined) {
        id = next++
        ids.set(r, id)
      }
      label[c] = id
    }
  }
  // walks every dune with unwrapped coordinates: meeting a cell again from
  // another period means it wraps; centres are the unwrapped means
  const ux = new Int32Array(cells)
  const uy = new Int32Array(cells)
  const seen = new Uint8Array(cells)
  const queue = new Int32Array(cells)
  const relX = new Int32Array(cells)
  const relY = new Int32Array(cells)
  const walk = (part: number[]) => {
    const cx: number[] = []
    const cy: number[] = []
    const wraps: number[] = []
    const size: number[] = []
    seen.fill(0)
    for (const s0 of part) {
      if (seen[s0])
        continue
      const id = label[s0]
      let head = 0
      let tail = 0
      let wrap = 0
      queue[tail++] = s0
      seen[s0] = 1
      ux[s0] = s0 % n
      uy[s0] = (s0 / n) | 0
      let sx = 0
      let sy = 0
      while (head < tail) {
        const c = queue[head++]
        sx += ux[c]
        sy += uy[c]
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy)
              continue
            const vx = ux[c] + dx
            const vy = uy[c] + dy
            const m = (((vy % n) + n) % n) * n + (((vx % n) + n) % n)
            if (label[m] !== id)
              continue
            if (!seen[m]) {
              seen[m] = 1
              ux[m] = vx
              uy[m] = vy
              queue[tail++] = m
            }
            else if (ux[m] !== vx || uy[m] !== vy) {
              wrap = 1
            }
          }
        }
      }
      const mx = sx / tail + 0.5
      const my = sy / tail + 0.5
      cx[id] = ((mx % n) + n) % n
      cy[id] = ((my % n) + n) % n
      const tmx = Math.floor(mx / n)
      const tmy = Math.floor(my / n)
      for (let i = 0; i < tail; i++) {
        const c = queue[i]
        relX[c] = Math.floor(ux[c] / n) - tmx
        relY[c] = Math.floor(uy[c] / n) - tmy
      }
      wraps[id] = wrap
      size[id] = tail
    }
    return { cx, cy, wraps, size }
  }
  const all: number[] = []
  for (let c = 0; c < cells; c++) {
    if (mask[c])
      all.push(c)
  }
  all.sort((a, b) => z[b] - z[a] || a - b)
  flood(all, necks[0])
  let w = walk(all)
  for (let i = 1; i < necks.length; i++) {
    const part = all.filter(c => w.wraps[label[c]])
    if (!part.length)
      break
    flood(part, necks[i])
    w = walk(all)
  }
  // renumber the dunes still in use
  const k = next
  const cx = new Float64Array(k)
  const cy = new Float64Array(k)
  const wraps = new Uint8Array(k)
  let wrapCells = 0
  for (let id = 0; id < k; id++) {
    if (w.size[id] === undefined)
      continue
    cx[id] = w.cx[id]
    cy[id] = w.cy[id]
    wraps[id] = w.wraps[id]
    if (wraps[id])
      wrapCells += w.size[id]
  }
  return { label, cx, cy, relX, relY, wraps, wrapShare: all.length ? wrapCells / all.length : 0 }
}

/**
 * Gives each shadow cell on bare floor (`shade` set, `sand` not) to the dune
 * that casts it: the first sand found walking towards the sun, along
 * (lx, ly). A shadow then comes and goes with its dune.
 */
export function castBy(d: Dunes, sand: Uint8Array, shade: Uint8Array, n: number, lx: number, ly: number) {
  for (let c = 0; c < n * n; c++) {
    if (sand[c] || !shade[c])
      continue
    let x = c % n + 0.5
    let y = ((c / n) | 0) + 0.5
    for (let s = 0; s < n; s++) {
      x += lx * 0.5
      y += ly * 0.5
      const m = (((Math.floor(y) % n) + n) % n) * n + (((Math.floor(x) % n) + n) % n)
      if (sand[m] && d.label[m] >= 0) {
        d.label[c] = d.label[m]
        // the walk may have crossed the edge of the torus
        d.relX[c] = d.relX[m] - Math.floor(x / n)
        d.relY[c] = d.relY[m] - Math.floor(y / n)
        break
      }
    }
  }
}

export interface Owners {
  /** World cell of the first grid entry, and the grid size. */
  x0: number
  y0: number
  bw: number
  bh: number
  /** Copy shown in each world cell. */
  own: Uint8Array
  /** A second copy with a kept dune in the cell (255 if none): the taller one shows. */
  alt: Uint8Array
  /** Below 1 near a cut: how much of the sand is left, tapering into the floor. */
  fade: Float32Array
}

/**
 * Picks the copy shown in every world cell of the box [x0, x0 + bw) x
 * [y0, y0 + bh). Copy k sits at world position p when the torus is read at
 * p + shift[k]. `z` is the height on the torus, `noise` one slow noise per
 * copy, read at world position / `size`. `firstBias`, read there too,
 * favours the first copy when two kept dunes overlap.
 */
export function owners(d: Dunes, z: Float32Array, n: number, shift: readonly (readonly [number, number])[], noise: readonly Noise2[], size: number, x0: number, y0: number, bw: number, bh: number, firstBias?: Noise2): Owners {
  const copies = shift.length
  const own = new Uint8Array(bw * bh)
  const alt = new Uint8Array(bw * bh).fill(255)
  const memo = new Map<number, boolean>()
  // how clearly each kept dune won its place: the clearer one stays
  const margin = new Map<number, number>()
  const nPatch = d.cx.length
  // is the instance of patch `id` of copy `k` lying in torus tile (tx, ty) kept?
  const kept = (k: number, id: number, tx: number, ty: number) => {
    if (d.wraps[id])
      return k === 0
    const key = ((k * nPatch + id) * 256 + (tx & 255)) * 256 + (ty & 255)
    let v = memo.get(key)
    if (v === undefined) {
      const wx = (tx * n + d.cx[id] - shift[k][0]) / size
      const wy = (ty * n + d.cy[id] - shift[k][1]) / size
      const mine = noise[k](wx, wy)
      let other = -Infinity
      for (let j = 0; j < copies; j++) {
        if (j !== k)
          other = Math.max(other, noise[j](wx, wy))
      }
      v = mine > other
      memo.set(key, v)
      margin.set(key, mine - other + (k === 0 && firstBias ? firstBias(wx, wy) : 0))
    }
    return v
  }
  const keyOf = (k: number, id: number, tx: number, ty: number) => ((k * nPatch + id) * 256 + (tx & 255)) * 256 + (ty & 255)
  // sand cells whose copy shows only floor there: the floor of a dropped dune
  const bareCell = new Uint8Array(bw * bh)
  // dune of each copy under each world cell (-1 on floor), and whether kept
  const idOf = new Int32Array(bw * bh * copies)
  const keptOf = new Uint8Array(bw * bh * copies)
  // Two passes: where kept dunes of two copies overlap, the smaller one is
  // dropped whole and the grid is filled again.
  const conflicts = new Map<number, number>()
  for (let round = 0; round < 2; round++) {
    conflicts.clear()
    for (let j = 0; j < bh; j++) {
      for (let i = 0; i < bw; i++) {
        const px = x0 + i + 0.5
        const py = y0 + j + 0.5
        let best = -1
        let bestZ = -Infinity
        let bestKey = 0
        let second = -1
        let bare = -1
        let low = 0
        let lowZ = Infinity
        for (let k = 0; k < copies; k++) {
          const u = px + shift[k][0]
          const v = py + shift[k][1]
          const fx = Math.floor(u / n)
          const fy = Math.floor(v / n)
          const lu = u - fx * n
          const lv = v - fy * n
          const c = Math.min(n - 1, lv | 0) * n + Math.min(n - 1, lu | 0)
          const id = d.label[c]
          const slot = (j * bw + i) * copies + k
          idOf[slot] = id
          keptOf[slot] = 0
          if (z[c] < lowZ) {
            lowZ = z[c]
            low = k
          }
          if (id < 0) {
            if (bare < 0)
              bare = k
            continue
          }
          const tx = fx - d.relX[c]
          const ty = fy - d.relY[c]
          if (!kept(k, id, tx, ty))
            continue
          keptOf[slot] = 1
          const key = keyOf(k, id, tx, ty)
          if (best >= 0 && round === 0 && z[c] > OVERLAP && bestZ > OVERLAP && !d.wraps[id]) {
            // two kept dunes overlap: drop the one that won its place less
            // clearly (a dune that wraps always stays)
            if ((margin.get(bestKey) ?? Infinity) >= (margin.get(key) ?? Infinity))
              conflicts.set(key, 1)
            else
              conflicts.set(bestKey, 1)
          }
          if (z[c] > bestZ) {
            second = best
            bestZ = z[c]
            best = k
            bestKey = key
          }
          else if (second < 0) {
            second = k
          }
        }
        // kept sand first, then bare floor; else the floor of the lowest sand
        const o = j * bw + i
        own[o] = best >= 0 ? best : bare >= 0 ? bare : low
        bareCell[o] = best < 0 && bare < 0 ? 1 : 0
        alt[o] = second >= 0 ? second : 255
      }
    }
    if (!conflicts.size)
      break
    for (const key of conflicts.keys())
      memo.set(key, false)
  }

  // A dune split from a dropped neighbour at a low neck would end in a
  // sharp cut: find those cuts and taper the kept sand into the floor over
  // TAPER cells, as a horn thins out.
  const cells = bw * bh
  const dist = new Float32Array(cells).fill(Infinity)
  const seed = new Int32Array(cells).fill(-1)
  const mine = new Int32Array(cells).fill(-1)
  for (let j = 0; j < bh; j++) {
    for (let i = 0; i < bw; i++) {
      const o = j * bw + i
      const k = own[o]
      const id = idOf[o * copies + k]
      if (id < 0 || !keptOf[o * copies + k])
        continue
      mine[o] = id
      for (let dy = -1; dy <= 1 && seed[o] < 0; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const ni = i + dx
          const nj = j + dy
          if ((!dx && !dy) || ni < 0 || nj < 0 || ni >= bw || nj >= bh)
            continue
          const m = (nj * bw + ni) * copies + k
          const id2 = idOf[m]
          if (id2 >= 0 && id2 !== id && !keptOf[m]) {
            dist[o] = 0.5
            seed[o] = id
            break
          }
        }
      }
    }
  }
  // two-pass chamfer distance from the cuts, within the dune that was cut
  const relax = (o: number, m: number, w: number) => {
    if (seed[m] < 0)
      return
    const dd = dist[m] + w
    if (dd < dist[o] && dd < TAPER && mine[o] === seed[m] && own[o] === own[m]) {
      dist[o] = dd
      seed[o] = seed[m]
    }
  }
  const pass = (from: number, to: number, step: number) => {
    for (let j = from; j !== to; j += step) {
      const nj = j - step
      const rowOk = nj >= 0 && nj < bh
      for (let ii = 0; ii < bw; ii++) {
        const i = step > 0 ? ii : bw - 1 - ii
        const o = j * bw + i
        if (mine[o] < 0)
          continue
        const ni = i - step
        if (ni >= 0 && ni < bw)
          relax(o, j * bw + ni, 1)
        if (rowOk) {
          relax(o, nj * bw + i, 1)
          if (ni >= 0 && ni < bw)
            relax(o, nj * bw + ni, Math.SQRT2)
          const pi = i + step
          if (pi >= 0 && pi < bw)
            relax(o, nj * bw + pi, Math.SQRT2)
        }
      }
    }
  }
  pass(0, bh, 1)
  pass(bh - 1, -1, -1)
  const fade = new Float32Array(cells).fill(1)
  for (let o = 0; o < cells; o++) {
    if (bareCell[o])
      fade[o] = 0
    else if (seed[o] >= 0)
      fade[o] = Math.min(1, dist[o] / TAPER) ** 1.5
  }
  return { x0, y0, bw, bh, own, alt, fade }
}
