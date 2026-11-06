// Drainage network of the eroded terrain.
//
// Depressions are filled with the priority-flood algorithm of Barnes, Lehman
// & Mulla ("Priority-flood: An optimal depression-filling and watershed-
// labeling algorithm for digital elevation models", Computers & Geosciences
// 62, 2014), flooding inwards from the map edge and the sea. Each cell drains
// into the neighbour it was flooded from (8-connected), which routes water
// through pits and flats. Flow accumulation (O'Callaghan & Mark, 1984) then
// counts the cells upstream of each one, in reverse flood order.

export interface Drainage {
  /** Filled surface: lakes are where it stands above the terrain. */
  filled: Float32Array
  /** Cell each cell drains into, -1 for outlets. */
  down: Int32Array
  /** Number of cells upstream, itself included. */
  acc: Float32Array
}

const NX = [1, -1, 0, 0, 1, 1, -1, -1]
const NY = [0, 0, 1, -1, 1, -1, 1, -1]

export function drain(h: Float32Array, gw: number, gh: number, sea: number): Drainage {
  const n = gw * gh
  const filled = new Float32Array(n)
  const down = new Int32Array(n).fill(-1)
  const seen = new Uint8Array(n)
  const order = new Int32Array(n)
  let no = 0

  // binary min-heap of cell indices keyed by filled height
  const heap = new Int32Array(n)
  let hs = 0
  const push = (c: number) => {
    let i = hs++
    const v = filled[c]
    while (i > 0) {
      const p = (i - 1) >> 1
      if (filled[heap[p]] <= v)
        break
      heap[i] = heap[p]
      i = p
    }
    heap[i] = c
  }
  const pop = () => {
    const top = heap[0]
    const last = heap[--hs]
    const v = filled[last]
    let i = 0
    for (;;) {
      let m = 2 * i + 1
      if (m >= hs)
        break
      if (m + 1 < hs && filled[heap[m + 1]] < filled[heap[m]])
        m++
      if (filled[heap[m]] >= v)
        break
      heap[i] = heap[m]
      i = m
    }
    heap[i] = last
    return top
  }

  for (let j = 0; j < gh; j++) {
    for (let i = 0; i < gw; i++) {
      const c = j * gw + i
      if (i === 0 || j === 0 || i === gw - 1 || j === gh - 1 || h[c] < sea) {
        filled[c] = h[c]
        seen[c] = 1
        push(c)
      }
    }
  }
  const eps = 1e-6
  // hs shrinks and grows inside pop() and push()
  for (;;) {
    if (hs === 0)
      break
    const c = pop()
    order[no++] = c
    const ci = c % gw
    const cj = (c - ci) / gw
    for (let k = 0; k < 8; k++) {
      const i = ci + NX[k]
      const j = cj + NY[k]
      if (i < 0 || j < 0 || i >= gw || j >= gh)
        continue
      const q = j * gw + i
      if (seen[q])
        continue
      seen[q] = 1
      filled[q] = Math.max(h[q], filled[c] + eps)
      down[q] = c
      push(q)
    }
  }

  // On the filled surface, prefer the steepest descent (diagonals weighted by
  // 1/sqrt 2) over the flood parent: fewer 45-degree artefacts. A strictly
  // lower neighbour was always popped earlier, so the order stays topological.
  for (let c = 0; c < n; c++) {
    if (down[c] < 0)
      continue
    const ci = c % gw
    const cj = (c - ci) / gw
    let best = 0
    let to = -1
    for (let k = 0; k < 8; k++) {
      const i = ci + NX[k]
      const j = cj + NY[k]
      if (i < 0 || j < 0 || i >= gw || j >= gh)
        continue
      const q = j * gw + i
      const s = (filled[c] - filled[q]) * (k < 4 ? 1 : Math.SQRT1_2)
      if (s > best + 1e-9) {
        best = s
        to = q
      }
    }
    if (to >= 0)
      down[c] = to
  }

  const acc = new Float32Array(n).fill(1)
  for (let k = no - 1; k >= 0; k--) {
    const c = order[k]
    if (down[c] >= 0)
      acc[down[c]] += acc[c]
  }
  return { filled, down, acc }
}

export interface River {
  /** Strahler order at the outlet end. */
  order: number
  /** Grid coordinates (node units), upstream to downstream. */
  pts: number[]
  /** Flow accumulation at each point. */
  acc: number[]
}

/**
 * Splits the cells whose accumulation reaches `min` into polylines: each one
 * follows its largest tributary downstream, a smaller tributary ends at the
 * confluence. Wet cells (sea, lakes) are not rivers, but a river reaches the
 * first wet cell so it touches the shore. `at` appends the drawing position
 * of a cell (x, y in node units).
 */
export function rivers(d: Drainage, wet: Uint8Array, gw: number, gh: number, min: number, minOrder: number, at: (c: number, out: number[]) => void): River[] {
  const { down, acc } = d
  const n = gw * gh
  // Strahler order of the channel cells, upstream first (a donor always
  // drains less than its receiver)
  const chan: number[] = []
  for (let c = 0; c < n; c++) {
    if (acc[c] >= min && !wet[c])
      chan.push(c)
  }
  chan.sort((a, b) => acc[a] - acc[b] || a - b)
  const ord = new Uint8Array(n)
  const top = new Uint8Array(n)
  const tops = new Uint8Array(n)
  for (const c of chan) {
    ord[c] = top[c] === 0 ? 1 : tops[c] >= 2 ? top[c] + 1 : top[c]
    const p = down[c]
    if (p < 0)
      continue
    if (ord[c] > top[p]) {
      top[p] = ord[c]
      tops[p] = 1
    }
    else if (ord[c] === top[p]) {
      tops[p]++
    }
  }
  const isRiver = (c: number) => ord[c] >= minOrder
  // main donor of each cell: the upstream river cell with the largest flow
  const main = new Int32Array(n).fill(-1)
  const hasDonor = new Uint8Array(n)
  for (let c = 0; c < n; c++) {
    if (!isRiver(c))
      continue
    const p = down[c]
    if (p < 0)
      continue
    hasDonor[p] = 1
    if (main[p] < 0 || acc[c] > acc[main[p]] || (acc[c] === acc[main[p]] && c < main[p]))
      main[p] = c
  }
  const out: River[] = []
  for (let c0 = 0; c0 < n; c0++) {
    if (!isRiver(c0) || hasDonor[c0])
      continue
    const pts: number[] = []
    const ac: number[] = []
    let c = c0
    for (;;) {
      at(c, pts)
      ac.push(acc[c])
      const p = down[c]
      if (p < 0)
        break
      if (!isRiver(p) || main[p] !== c) {
        at(p, pts)
        ac.push(isRiver(p) ? acc[p] : acc[c])
        break
      }
      c = p
    }
    if (ac.length >= 2)
      out.push({ pts, acc: ac, order: ord[c] })
  }
  return out
}

/**
 * Wet mask: sea cells, and lakes (filled deeper than `minDepth`) whose
 * 8-connected area reaches `minArea` cells; smaller puddles stay dry.
 */
export function wetMask(h: Float32Array, filled: Float32Array, gw: number, gh: number, sea: number, minDepth: number, minArea: number): Uint8Array {
  const n = gw * gh
  const wet = new Uint8Array(n)
  const cand = new Uint8Array(n)
  for (let c = 0; c < n; c++) {
    if (h[c] < sea)
      wet[c] = 1
    else if (filled[c] - h[c] > minDepth)
      cand[c] = 1
  }
  const stack = new Int32Array(n)
  const comp: number[] = []
  for (let c0 = 0; c0 < n; c0++) {
    if (cand[c0] !== 1)
      continue
    comp.length = 0
    let sp = 0
    stack[sp++] = c0
    cand[c0] = 2
    while (sp > 0) {
      const c = stack[--sp]
      comp.push(c)
      const ci = c % gw
      const cj = (c - ci) / gw
      for (let k = 0; k < 8; k++) {
        const i = ci + NX[k]
        const j = cj + NY[k]
        if (i < 0 || j < 0 || i >= gw || j >= gh)
          continue
        const q = j * gw + i
        if (cand[q] === 1) {
          cand[q] = 2
          stack[sp++] = q
        }
      }
    }
    if (comp.length >= minArea) {
      for (const c of comp)
        wet[c] = 2
    }
  }
  return wet
}
