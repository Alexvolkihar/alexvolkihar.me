// Cellular automata for the "Automata" series: one-dimensional rules whose
// space-time diagram is read row by row (time running down the cloth) and
// two-dimensional rules read as their final state.
//
// - Elementary: two states, radius one, the 256 rules numbered by Stephen
//   Wolfram ("Statistical mechanics of cellular automata", 1983).
// - Totalistic: three states, radius one, the next state a function of the
//   sum of the three cells (Wolfram's totalistic codes, 1984).
// - Life-like: two-state outer-totalistic rules on the Moore neighbourhood,
//   written B/S after John Conway's Game of Life (1970).
// - Cyclic: David Griffeath's cyclic cellular automaton (1989), where a cell
//   advances to the next of n states when enough neighbours are already there.
//
// The lattice is a repeat unit of P columns (and P rows in 2D). Its boundary
// is a wrap (a seamless repeat), a mirror (each repeat reflected) or a wall of
// dead cells (panels separated by a selvedge).
//
// Every rule, seed and boundary is drawn from one stream; a candidate whose
// result is almost blank, almost full, pure noise or plain stripes is
// rejected and the next draw from the same stream is tried.

import type { Rng } from '../random'
import { int, pick, range, weighted } from '../random'

export type Family = 'Elementary' | 'Totalistic' | 'Life-like' | 'Cyclic'
export type Boundary = 'wrap' | 'mirror' | 'wall'

/** Result: a colour index per lattice cell, 0 = ground, 1..4 = threads, 5 = accent. */
export interface Lattice {
  /** Columns of the repeat unit. */
  w: number
  /** Rows: the generations for 1D rules, the repeat unit for 2D ones. */
  h: number
  paint: Uint8Array
  /** Short description of the rule actually used, for debugging. */
  label: string
  /** Candidates drawn before one passed (debugging and census). */
  tries: number
}

// Rules known to make interesting cloth, tried first more often than not.
const ELEMENTARY = [18, 22, 26, 30, 45, 54, 60, 62, 75, 86, 89, 90, 99, 101, 105, 110, 122, 124, 126, 129, 135, 137, 146, 147, 149, 150, 161, 165, 169, 182, 193, 225] as const

/** Birth and survival masks (bit i = i live neighbours), generations, soup density. */
export const LIFE: ReadonlyArray<readonly [string, number, number, number, number]> = [
  ['B3/S23', 0b1000, 0b1100, 70, 0.4],
  ['B36/S23', 0b1001000, 0b1100, 70, 0.4],
  ['B3678/S34678', 0b111001000, 0b111011000, 90, 0.5],
  ['B3/S12345', 0b1000, 0b111110, 60, 0.35],
  ['B3/S1234', 0b1000, 0b11110, 60, 0.35],
  ['B3/S45678', 0b1000, 0b111110000, 50, 0.45],
  ['B4678/S35678', 0b111010000, 0b111101000, 110, 0.5],
  ['B35678/S5678', 0b111101000, 0b111100000, 80, 0.52],
  ['B45678/S2345', 0b111110000, 0b111100, 70, 0.45],
  ['B368/S245', 0b101001000, 0b110100, 70, 0.4],
]

/** Cyclic rules: states, threshold, Moore (true) or von Neumann neighbourhood, generations. */
export const CYCLIC: ReadonlyArray<readonly [number, number, boolean, number]> = [
  [3, 3, true, 120],
  [4, 3, true, 160],
  [5, 2, true, 160],
  [6, 2, true, 200],
  [10, 1, true, 260],
  [12, 1, true, 300],
  [7, 1, false, 200],
]

// ---------------------------------------------------------------------------
// Measures
// ---------------------------------------------------------------------------

export interface Stats {
  /** Share of the most common colour (ground included). */
  top: number
  /** Share of ground. */
  ground: number
  /** Entropy of 2x2 blocks over four times the entropy of single cells: 1 for noise, low for order. */
  ratio: number
  eqH: number
  eqV: number
}

/** Entropy in nats with the Miller-Madow bias correction (small samples look too ordered otherwise). */
function entropy(counts: Map<number, number> | Float64Array, n: number): number {
  let h = 0
  let bins = 0
  for (const c of counts.values()) {
    if (c > 0) {
      h -= (c / n) * Math.log(c / n)
      bins++
    }
  }
  return h + (bins - 1) / (2 * n)
}

/** Occupation and structure of a painted grid (colours 0..5, w x h). */
export function measure(st: Uint8Array, w: number, h: number): Stats {
  const one = new Float64Array(6)
  for (let i = 0; i < st.length; i++)
    one[st[i]]++
  const blocks = new Map<number, number>()
  let eh = 0
  let ev = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      const v = st[i]
      if (x + 1 < w && st[i + 1] === v)
        eh++
      if (y + 1 < h && st[i + w] === v)
        ev++
      if (x + 1 < w && y + 1 < h) {
        const code = ((v * 6 + st[i + 1]) * 6 + st[i + w]) * 6 + st[i + w + 1]
        blocks.set(code, (blocks.get(code) ?? 0) + 1)
      }
    }
  }
  const h1 = entropy(one, st.length)
  const h4 = entropy(blocks, (w - 1) * (h - 1))
  return {
    top: Math.max(...one) / st.length,
    ground: one[0] / st.length,
    ratio: h1 > 1e-9 ? h4 / (4 * h1) : 0,
    eqH: eh / ((w - 1) * h),
    eqV: ev / (w * (h - 1)),
  }
}

/** Neither blank nor a flat field of one colour. */
export function covered(m: Stats): boolean {
  return m.ground < 0.9 && m.top < 0.78
}

/**
 * A 1D diagram that is only its past shifted (stripes, diagonals, solid
 * cones, period-two flicker): over the live cells of either row, row t
 * agrees with row t - p shifted by s almost everywhere.
 */
export function shifted(st: Uint8Array, P: number, rows: number): boolean {
  const t0 = Math.max(2, rows >> 1)
  for (let p = 1; p <= 2; p++) {
    for (let s = -2; s <= 2; s++) {
      let agree = 0
      let union = 0
      for (let t = t0; t < rows; t++) {
        for (let x = 0; x < P; x++) {
          const a = st[t * P + x]
          const b = st[(t - p) * P + (((x + s) % P) + P) % P]
          if (a || b) {
            union++
            if (a === b)
              agree++
          }
        }
      }
      if (union > 0 && agree / union > 0.88)
        return true
    }
  }
  return false
}

/** Bounds of the block-entropy ratio: below is too plain, above is noise. */
export const RATIO = [0.3, 0.8] as const

/** Neither blank nor flat, neither noise nor plain stripes. */
export function acceptable(m: Stats): boolean {
  return m.ground < 0.9 && m.top < 0.78 && m.ratio > RATIO[0] && m.ratio < RATIO[1] && m.eqH < 0.97 && m.eqV < 0.97
}

// ---------------------------------------------------------------------------
// Initial rows / soups
// ---------------------------------------------------------------------------

type Init1D = 'single' | 'few' | 'random' | 'symmetric'

function initRow(r: Rng, P: number, k: number, mode: Init1D): Uint8Array {
  const row = new Uint8Array(P)
  const state = () => (k === 2 ? 1 : 1 + Math.floor(r() * (k - 1)))
  if (mode === 'single') {
    row[P >> 1] = k === 2 ? 1 : 1 + (r() < 0.5 ? 0 : 1)
  }
  else if (mode === 'few') {
    const n = int(r, 2, 5)
    for (let i = 0; i < n; i++)
      row[Math.floor(r() * P)] = state()
  }
  else {
    const d = range(r, 0.18, 0.55)
    const half = mode === 'symmetric' ? P >> 1 : P
    for (let x = 0; x < half; x++)
      row[x] = r() < d ? state() : 0
    if (mode === 'symmetric') {
      for (let x = 0; x < half; x++)
        row[P - 1 - x] = row[x]
    }
  }
  return row
}

type Sym2D = 'none' | 'mirror' | 'quad'

export function initSoup(r: Rng, P: number, k: number, d: number, sym: Sym2D): Uint8Array {
  const g = new Uint8Array(P * P)
  const draw = () => (k === 2 ? (r() < d ? 1 : 0) : Math.floor(r() * k))
  if (sym === 'none') {
    for (let i = 0; i < g.length; i++)
      g[i] = draw()
    return g
  }
  const hP = P >> 1
  if (sym === 'mirror') {
    for (let y = 0; y < P; y++) {
      for (let x = 0; x < hP; x++) {
        const v = draw()
        g[y * P + x] = v
        g[y * P + P - 1 - x] = v
      }
    }
    return g
  }
  // quad: one eighth drawn, reflected on both axes and the diagonal
  for (let y = 0; y < hP; y++) {
    for (let x = 0; x <= y; x++) {
      const v = draw()
      for (const [a, b] of [[x, y], [y, x]]) {
        g[b * P + a] = v
        g[b * P + P - 1 - a] = v
        g[(P - 1 - b) * P + a] = v
        g[(P - 1 - b) * P + P - 1 - a] = v
      }
    }
  }
  return g
}

// ---------------------------------------------------------------------------
// One-dimensional rules
// ---------------------------------------------------------------------------

interface Rule1D { kind: 'elementary' | 'totalistic', code: number, digits: Uint8Array }

/** Space-time diagram: states and, per cell, the sum of its three parents and its age. */
function run1D(rule: Rule1D, row0: Uint8Array, rows: number, b: Boundary) {
  const P = row0.length
  const st = new Uint8Array(P * rows)
  const parent = new Uint8Array(P * rows)
  const age = new Uint8Array(P * rows)
  st.set(row0)
  for (let x = 0; x < P; x++)
    age[x] = row0[x] ? 1 : 0
  for (let y = 1; y < rows; y++) {
    const o = (y - 1) * P
    const n = y * P
    for (let x = 0; x < P; x++) {
      let l: number
      let rr: number
      if (x > 0)
        l = st[o + x - 1]
      else
        l = b === 'wrap' ? st[o + P - 1] : b === 'mirror' ? st[o] : 0
      if (x < P - 1)
        rr = st[o + x + 1]
      else
        rr = b === 'wrap' ? st[o] : b === 'mirror' ? st[o + P - 1] : 0
      const c = st[o + x]
      let v: number
      if (rule.kind === 'elementary')
        v = (rule.code >> ((l << 2) | (c << 1) | rr)) & 1
      else
        v = rule.digits[l + c + rr]
      st[n + x] = v
      parent[n + x] = l + c + rr
      age[n + x] = v === 0 ? 0 : v === c ? Math.min(255, age[o + x] + 1) : 1
    }
  }
  return { st, parent, age }
}

function draw1D(r: Rng, family: 'Elementary' | 'Totalistic', curated: boolean): { rule: Rule1D, mode: Init1D } {
  const digits = new Uint8Array(7)
  let code = 0
  if (family === 'Elementary') {
    code = curated ? pick(r, ELEMENTARY) : int(r, 1, 255)
    // a blank neighbourhood that turns live and a full one that dies make the
    // whole ground flicker in stripes: shift such a rule to its even twin
    if (!curated && (code & 1) && !(code & 128))
      code ^= 1
  }
  else {
    // the quiescent ground stays ground: digit 0 is 0
    for (let s = 1; s < 7; s++) {
      digits[s] = Math.floor(r() * 3)
      code += digits[s] * 3 ** s
    }
  }
  const mode = weighted<Init1D>(r, [['single', 35], ['few', 20], ['random', 30], ['symmetric', 15]])
  return { rule: { kind: family === 'Elementary' ? 'elementary' : 'totalistic', code, digits }, mode }
}

// ---------------------------------------------------------------------------
// Two-dimensional rules
// ---------------------------------------------------------------------------

/** Copy the edges of a (P+2)^2 padded grid according to the boundary. */
function pad(g: Uint8Array, P: number, b: Boundary): void {
  const W = P + 2
  for (let i = 1; i <= P; i++) {
    let top: number
    let bottom: number
    let left: number
    let right: number
    if (b === 'wrap') {
      top = g[P * W + i]
      bottom = g[W + i]
      left = g[i * W + P]
      right = g[i * W + 1]
    }
    else if (b === 'mirror') {
      top = g[W + i]
      bottom = g[P * W + i]
      left = g[i * W + 1]
      right = g[i * W + P]
    }
    else {
      top = bottom = left = right = 0
    }
    g[i] = top
    g[(P + 1) * W + i] = bottom
    g[i * W] = left
    g[i * W + P + 1] = right
  }
  // corners
  const c = (x: number, y: number, sx: number, sy: number) => {
    if (b === 'wall')
      g[y * W + x] = 0
    else
      g[y * W + x] = g[sy * W + sx]
  }
  if (b === 'wrap') {
    c(0, 0, P, P)
    c(P + 1, 0, 1, P)
    c(0, P + 1, P, 1)
    c(P + 1, P + 1, 1, 1)
  }
  else {
    c(0, 0, 1, 1)
    c(P + 1, 0, P, 1)
    c(0, P + 1, 1, P)
    c(P + 1, P + 1, P, P)
  }
}

function padded(src: Uint8Array, P: number): Uint8Array {
  const W = P + 2
  const g = new Uint8Array(W * W)
  for (let y = 0; y < P; y++)
    g.set(src.subarray(y * P, y * P + P), (y + 1) * W + 1)
  return g
}

function unpad(g: Uint8Array, P: number): Uint8Array {
  const W = P + 2
  const out = new Uint8Array(P * P)
  for (let y = 0; y < P; y++)
    out.set(g.subarray((y + 1) * W + 1, (y + 1) * W + 1 + P), y * P)
  return out
}

/** Life-like run; returns final states, ages of live cells and time since death of dead ones. */
export function runLife(init: Uint8Array, P: number, birth: number, survive: number, gens: number, b: Boundary) {
  const W = P + 2
  let g = padded(init, P)
  let n = new Uint8Array(W * W)
  const age = new Uint16Array(W * W)
  const dead = new Uint16Array(W * W).fill(999)
  for (let i = 0; i < g.length; i++) {
    if (g[i])
      age[i] = 1
  }
  for (let t = 0; t < gens; t++) {
    pad(g, P, b)
    for (let y = 1; y <= P; y++) {
      for (let x = 1; x <= P; x++) {
        const i = y * W + x
        const k = g[i - W - 1] + g[i - W] + g[i - W + 1] + g[i - 1] + g[i + 1] + g[i + W - 1] + g[i + W] + g[i + W + 1]
        const v = g[i] ? (survive >> k) & 1 : (birth >> k) & 1
        n[i] = v
        if (v) {
          age[i] = g[i] ? Math.min(age[i] + 1, 60000) : 1
          dead[i] = 999
        }
        else {
          if (g[i])
            dead[i] = 1
          else if (dead[i] < 999)
            dead[i]++
          age[i] = 0
        }
      }
    }
    const tmp = g
    g = n
    n = tmp
  }
  return { st: unpad(g, P), age: unpadU16(age, P), dead: unpadU16(dead, P) }
}

function unpadU16(g: Uint16Array, P: number): Uint16Array {
  const W = P + 2
  const out = new Uint16Array(P * P)
  for (let y = 0; y < P; y++)
    out.set(g.subarray((y + 1) * W + 1, (y + 1) * W + 1 + P), y * P)
  return out
}

export function runCyclic(init: Uint8Array, P: number, states: number, threshold: number, moore: boolean, gens: number, b: Boundary): Uint8Array {
  const W = P + 2
  let g = padded(init, P)
  let n = new Uint8Array(W * W)
  const succ = new Uint8Array(states)
  for (let v = 0; v < states; v++)
    succ[v] = (v + 1) % states
  for (let t = 0; t < gens; t++) {
    pad(g, P, b)
    for (let y = 1; y <= P; y++) {
      for (let x = 1; x <= P; x++) {
        const i = y * W + x
        const v = g[i]
        const nx = succ[v]
        let k = (g[i - W] === nx ? 1 : 0) + (g[i - 1] === nx ? 1 : 0) + (g[i + 1] === nx ? 1 : 0) + (g[i + W] === nx ? 1 : 0)
        if (moore && k < threshold)
          k += (g[i - W - 1] === nx ? 1 : 0) + (g[i - W + 1] === nx ? 1 : 0) + (g[i + W - 1] === nx ? 1 : 0) + (g[i + W + 1] === nx ? 1 : 0)
        n[i] = k >= threshold ? nx : v
      }
    }
    const tmp = g
    g = n
    n = tmp
  }
  return unpad(g, P)
}

// ---------------------------------------------------------------------------
// The search
// ---------------------------------------------------------------------------

/**
 * Draw a rule, a seed and run the automaton on a P-wide repeat unit,
 * redrawing from the same stream until the result passes the tests.
 * `rows` is the number of generations shown for 1D rules (at least P);
 * the tests only look at the first P of them, so the rule never depends on
 * the canvas proportions.
 */
export function grow(r: Rng, family: Family, P: number, rows: number, b: Boundary): Lattice {
  if (family === 'Elementary' || family === 'Totalistic')
    return grow1D(r, family, P, rows, b)
  if (family === 'Life-like')
    return growLife(r, P, b)
  return growCyclic(r, P, b)
}

/** Elementary: colour by how many of the three parents were alive. Totalistic: by state and age. */
function paint1D(family: 'Elementary' | 'Totalistic', run: ReturnType<typeof run1D>): Uint8Array {
  const { st, parent, age } = run
  const paint = new Uint8Array(st.length)
  for (let i = 0; i < st.length; i++) {
    const v = st[i]
    if (!v)
      continue
    if (family === 'Elementary')
      paint[i] = parent[i] === 0 ? 4 : parent[i]
    else if (v === 1)
      paint[i] = age[i] >= 3 ? 1 : 2
    else
      paint[i] = age[i] >= 3 ? 3 : 4
  }
  return paint
}

function grow1D(r: Rng, family: 'Elementary' | 'Totalistic', P: number, rows: number, b: Boundary): Lattice {
  const k = family === 'Elementary' ? 2 : 3
  let chosen: { rule: Rule1D, row0: Uint8Array } | null = null
  let tries = 0
  while (tries < 16 && !chosen) {
    tries++
    const { rule, mode } = draw1D(r, family, r() < 0.55)
    const row0 = initRow(r, P, k, mode)
    const test = run1D(rule, row0, P, b)
    if (acceptable(measure(paint1D(family, test), P, P)) && !shifted(test.st, P, P))
      chosen = { rule, row0 }
  }
  if (!chosen) {
    // known to pass from a single seed: rule 90, and a three-state code
    const digits = new Uint8Array([0, 1, 2, 1, 0, 2, 1])
    const rule: Rule1D = family === 'Elementary' ? { kind: 'elementary', code: 90, digits } : { kind: 'totalistic', code: 0, digits }
    const row0 = new Uint8Array(P)
    row0[P >> 1] = 1
    chosen = { rule, row0 }
  }
  const h = Math.max(rows, P)
  const paint = paint1D(family, run1D(chosen.rule, chosen.row0, h, b))
  const name = chosen.rule.kind === 'elementary' ? `rule ${chosen.rule.code}` : `code ${Array.from(chosen.rule.digits).join('')}`
  return { w: P, h, paint, label: `${family} ${name}`, tries }
}

export function paintLife(res: ReturnType<typeof runLife>, P: number): Uint8Array {
  const paint = new Uint8Array(P * P)
  for (let i = 0; i < paint.length; i++) {
    if (res.st[i])
      paint[i] = res.age[i] >= 6 ? 1 : res.age[i] >= 2 ? 2 : 3
    else if (res.dead[i] <= 2)
      paint[i] = 4
  }
  return paint
}

function growLife(r: Rng, P: number, b: Boundary): Lattice {
  let tries = 0
  let last: Uint8Array | null = null
  while (tries < 6) {
    tries++
    let birth = 0
    let survive = 0
    let gens: number
    let name: string
    let d: number
    const curated = r() < 0.7
    if (curated) {
      const e = pick(r, LIFE)
      name = e[0]
      birth = e[1]
      survive = e[2]
      gens = e[3]
      d = e[4] + range(r, -0.04, 0.04)
    }
    else {
      for (let i = 2; i <= 8; i++)
        birth |= r() < 0.3 ? 1 << i : 0
      for (let i = 0; i <= 8; i++)
        survive |= r() < 0.45 ? 1 << i : 0
      gens = int(r, 40, 100)
      d = range(r, 0.3, 0.55)
      name = `B${birth.toString(2)}/S${survive.toString(2)} (bits)`
    }
    const sym = weighted<Sym2D>(r, [['none', 40], ['mirror', 25], ['quad', 35]])
    const init = initSoup(r, P, 2, d, sym)
    last = init
    const paint = paintLife(runLife(init, P, birth, survive, gens, b), P)
    // the curated rules were judged by eye: only an empty or flat result is redrawn
    const m = measure(paint, P, P)
    if (curated ? covered(m) : acceptable(m))
      return { w: P, h: P, paint, label: `Life ${name}`, tries }
  }
  // Walled cities (B45678/S2345) always settles into blocks from a soup.
  const paint = paintLife(runLife(last!, P, 0b111110000, 0b111100, 70, b), P)
  return { w: P, h: P, paint, label: 'Life B45678/S2345 (fallback)', tries }
}

export function paintCyclic(st: Uint8Array, states: number): Uint8Array {
  const paint = new Uint8Array(st.length)
  for (let i = 0; i < paint.length; i++)
    paint[i] = st[i] === 0 ? 0 : 1 + Math.floor(((st[i] - 1) * 4) / (states - 1))
  return paint
}

function growCyclic(r: Rng, P: number, b: Boundary): Lattice {
  let tries = 0
  let paint = new Uint8Array(0)
  let label = ''
  while (tries < 5) {
    tries++
    const [states, threshold, moore, gens] = pick(r, CYCLIC)
    const sym = weighted<Sym2D>(r, [['none', 45], ['mirror', 25], ['quad', 30]])
    const init = initSoup(r, P, states, 0, sym)
    paint = paintCyclic(runCyclic(init, P, states, threshold, moore, gens, b), states)
    label = `Cyclic ${states}/${threshold}/${moore ? 'M' : 'N'}`
    if (acceptable(measure(paint, P, P)))
      break
  }
  return { w: P, h: P, paint, label, tries }
}
