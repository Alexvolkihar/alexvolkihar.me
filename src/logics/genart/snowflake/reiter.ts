// Reiter's hexagonal cellular automaton for snow crystal growth.
//
// C. A. Reiter, "A local cellular model for snow crystal growth", Chaos,
// Solitons & Fractals 23 (2005) 1111-1119. Every cell of a hexagonal grid
// holds an amount of water s >= 0 and is frozen once s >= 1. A cell is
// "receptive" when it is frozen or touches a frozen cell. Each step:
//   1. receptive cells keep their water and gain a constant gamma (vapour
//      added from the third dimension); the others hand theirs to the
//      diffusing part u;
//   2. u diffuses: u' = u + alpha / 2 * (mean of the six neighbours - u),
//      receptive cells taking part with u = 0, so they soak up what flows in;
//   3. s = u' + whatever the receptive cell kept.
// The outer edge is held at the background level beta. The seed is a single
// frozen cell in the middle.
//
// A crystal grown from a central seed on a hexagonal grid keeps the twelve
// symmetries of the hexagon (six rotations, six mirrors), so only one twelfth
// of the disc is simulated: every neighbour that falls outside the wedge is
// replaced by its mirror image inside it.

/** One stretch of the growth: the parameters hold until the crystal reaches `until` (fraction of the target radius). */
export interface Phase {
  until: number
  alpha: number
  beta: number
  gamma: number
}

export interface Crystal {
  /** Lattice radius of the simulated disc, in cells. */
  R: number
  /** Number of cells in the 1/12 wedge. */
  n: number
  /** Axial coordinates (q >= r >= 0) of the wedge cells. */
  cq: Int16Array
  cr: Int16Array
  /** Final water / ice mass. */
  s: Float32Array
  /** Step at which each cell froze, or -1. */
  t: Float32Array
  steps: number
  /** Distance of the farthest frozen cell from the seed, in cells. */
  extent: number
  /** Wedge index of any axial cell, or -1 outside the disc. Row-major over q, r in [-M, M]. */
  table: Int32Array
  M: number
}

const DQ = [1, -1, 0, 0, 1, -1]
const DR = [0, 0, 1, -1, -1, 1]
const H = Math.sqrt(3) / 2

/** Map an axial coordinate to its image in the wedge q >= r >= 0. */
function canonical(q: number, r: number): [number, number] {
  for (let k = 0; k < 6; k++) {
    if (q >= 0 && r >= 0 && !(q === 0 && r > 0))
      break
    // rotate by 60 degrees: (q, r) -> (-r, q + r)
    const nq = -r
    r = q + r
    q = nq
  }
  if (r > q) {
    const t = q
    q = r
    r = t
  }
  return [q, r]
}

/**
 * Grow a crystal on a disc of radius R cells until its farthest tip reaches
 * `target` * R or `maxSteps` steps have run. The phases are applied in
 * order as the crystal grows.
 */
export function grow(R: number, phases: readonly Phase[], target: number, maxSteps: number, reach = 1.6, pad = 10): Crystal {
  // axial coordinates of the disc reach |q| < 1.58 R and |r| < 1.16 R
  const M = Math.ceil(1.6 * R) + 1
  const side = 2 * M + 1
  const R2 = (R - 0.5) ** 2
  // wedge index of each canonical cell (q, r), q in [0, R], r in [0, q]
  const wedge = new Int32Array((R + 1) * (R + 1)).fill(-1)
  const cells: [number, number, number][] = []
  for (let q = 0; q <= R; q++) {
    for (let r = 0; r <= q; r++) {
      const x = q + r / 2
      const y = r * H
      if (x * x + y * y <= R2)
        cells.push([x * x + y * y, q, r])
    }
  }
  // sorted outwards, so the cells inside any radius are a prefix of the arrays
  cells.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2])
  const cqA = cells.map(c => c[1])
  const crA = cells.map(c => c[2])
  cells.forEach(([, q, r], i) => {
    wedge[q * (R + 1) + r] = i
  })
  const n = cqA.length
  const table = new Int32Array(side * side).fill(-1)
  for (let q = -M; q <= M; q++) {
    for (let r = -M; r <= M; r++) {
      const x = q + r / 2
      const y = r * H
      if (x * x + y * y > R2)
        continue
      const [a, b] = canonical(q, r)
      table[(q + M) * side + (r + M)] = wedge[a * (R + 1) + b]
    }
  }
  // neighbour indices; n is the boundary sentinel, held at beta
  const nb = new Int32Array(n * 6)
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 6; k++) {
      const q = cqA[i] + DQ[k]
      const r = crA[i] + DR[k]
      let j = n
      if (q >= -M && q <= M && r >= -M && r <= M) {
        const w = table[(q + M) * side + (r + M)]
        if (w >= 0)
          j = w
      }
      nb[i * 6 + k] = j
    }
  }
  const dist = new Float32Array(n)
  for (let i = 0; i < n; i++)
    dist[i] = Math.sqrt(cells[i][0])

  let ph = 0
  let { alpha, beta, gamma } = phases[0]
  // s: total water. u: the part that diffuses (0 on receptive cells), double-buffered.
  const s = new Float64Array(n).fill(beta)
  let u = new Float64Array(n + 1).fill(beta)
  let u2 = new Float64Array(n + 1).fill(beta)
  const rec = new Uint8Array(n)
  const frozen = new Uint8Array(n)
  const t = new Float32Array(n).fill(-1)
  const fresh = new Int32Array(n)
  const freeze = (i: number, step: number) => {
    frozen[i] = 1
    t[i] = step
    rec[i] = 1
    u[i] = 0
    for (let k = 0; k < 6; k++) {
      const j = nb[i * 6 + k]
      if (j < n) {
        rec[j] = 1
        u[j] = 0
      }
    }
  }
  s[0] = 1
  freeze(0, 0)

  let extent = 0
  const goal = target * R
  let step = 0
  // Only the cells within `reach` of the crystal are updated; beyond it the
  // vapour stays at beta. The far field is then held at a distance that grows
  // with the crystal instead of at the rim of the grid, which keeps the cost
  // proportional to the crystal and not to the grid.
  let na = 1
  while (step < maxSteps && extent < goal) {
    step++
    const reachR = Math.min(R, extent * reach + pad)
    while (na < n && dist[na] <= reachR)
      na++
    while (ph < phases.length - 1 && extent >= phases[ph].until * goal) {
      ph++
      // a change of humidity reaches the whole vapour field at once
      const shift = phases[ph].beta - beta
      ;({ alpha, beta, gamma } = phases[ph])
      for (let i = 0; i < n; i++) {
        if (!rec[i]) {
          s[i] = Math.max(0, s[i] + shift)
          u[i] = s[i]
          if (i >= na)
            u2[i] = s[i]
        }
      }
    }
    const half = alpha / 2
    u[n] = beta
    u2[n] = beta
    let nf = 0
    // one pass: diffuse u, add gamma on receptive cells, list the cells that freeze
    for (let i = 0; i < na; i++) {
      const o = i * 6
      const mean = (u[nb[o]] + u[nb[o + 1]] + u[nb[o + 2]] + u[nb[o + 3]] + u[nb[o + 4]] + u[nb[o + 5]]) / 6
      const ui = u[i]
      const d = ui + half * (mean - ui)
      if (rec[i]) {
        const v = s[i] + gamma + d
        s[i] = v
        u2[i] = 0
        if (!frozen[i] && v >= 1)
          fresh[nf++] = i
      }
      else {
        s[i] = d
        u2[i] = d
      }
    }
    const tmp = u
    u = u2
    u2 = tmp
    for (let k = 0; k < nf; k++) {
      const i = fresh[k]
      freeze(i, step)
      if (dist[i] > extent)
        extent = dist[i]
    }
  }
  const sf = new Float32Array(n)
  for (let i = 0; i < n; i++)
    sf[i] = s[i]
  return { R, n, cq: Int16Array.from(cqA), cr: Int16Array.from(crA), s: sf, t, steps: step, extent, table, M }
}
