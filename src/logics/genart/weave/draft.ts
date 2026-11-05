// Weave structures for the "Weave" series: which ribbon is on top at each
// crossing of warp `i` and weft `j`.
//
// The classic structures (plain, twill, basket, satin) are closed formulas.
// "Draft" follows the way a shaft loom is written down: a threading (which
// shaft each warp end goes through), a treadling (which treadle is pressed for
// each pick) and a tie-up (which shafts each treadle lifts). A warp end is over
// the weft when the treadle of that pick lifts its shaft.

import type { Rng } from '../random'
import { chance, int, pick } from '../random'

export type PatternKind = 'Plain' | 'Twill' | 'Basket' | 'Satin' | 'Draft'

/** Index of crossing (i, j) in the lift array returned by `weaveStructure`. */
export const at = (nF: number, i: number, j: number) => i * nF + j

const mod = (a: number, n: number) => ((a % n) + n) % n

/**
 * Point-repeat unit for a threading or a treadling: a short walk over the
 * shafts, then the same walk backwards, so motifs come out as diamonds.
 */
function pointUnit(r: Rng, shafts: number): number[] {
  const len = int(r, 4, 9)
  const walk: number[] = []
  let s = int(r, 0, shafts - 1)
  let dir = chance(r, 0.5) ? 1 : -1
  for (let k = 0; k < len; k++) {
    walk.push(s)
    if (chance(r, 0.18))
      dir = -dir
    s = mod(s + dir, shafts)
  }
  const back = walk.slice(1, -1).reverse()
  return [...walk, ...back]
}

/** Tie-up: a twill tie-up with a few cells flipped, never all up nor all down. */
function tieUp(r: Rng, shafts: number): Uint8Array {
  const t = new Uint8Array(shafts * shafts)
  const up = int(r, 1, shafts - 1)
  for (let tr = 0; tr < shafts; tr++) {
    for (let s = 0; s < shafts; s++) {
      let v = mod(s - tr, shafts) < up ? 1 : 0
      if (chance(r, 0.16))
        v = 1 - v
      t[tr * shafts + s] = v
    }
    let sum = 0
    for (let s = 0; s < shafts; s++)
      sum += t[tr * shafts + s]
    if (sum === 0)
      t[tr * shafts + int(r, 0, shafts - 1)] = 1
    else if (sum === shafts)
      t[tr * shafts + int(r, 0, shafts - 1)] = 0
  }
  return t
}

/** Break floats longer than `max` crossings, first along warps, then along wefts. */
function capFloats(lift: Uint8Array, nW: number, nF: number, max: number) {
  for (let i = 0; i < nW; i++) {
    let run = 1
    for (let j = 1; j < nF; j++) {
      run = lift[at(nF, i, j)] === lift[at(nF, i, j - 1)] ? run + 1 : 1
      if (run > max) {
        lift[at(nF, i, j)] ^= 1
        run = 1
      }
    }
  }
  for (let j = 0; j < nF; j++) {
    let run = 1
    for (let i = 1; i < nW; i++) {
      run = lift[at(nF, i, j)] === lift[at(nF, i - 1, j)] ? run + 1 : 1
      if (run > max) {
        lift[at(nF, i, j)] ^= 1
        run = 1
      }
    }
  }
}

/** lift[at(nF, i, j)] is 1 when warp `i` passes over weft `j`. */
export function weaveStructure(kind: PatternKind, nW: number, nF: number, r: Rng): Uint8Array {
  const lift = new Uint8Array(nW * nF)
  let rule: (i: number, j: number) => boolean

  switch (kind) {
    case 'Plain': {
      rule = (i, j) => ((i + j) & 1) === 0
      break
    }
    case 'Twill': {
      // up/down counts, a direction, and sometimes a herringbone reversal
      const [up, down] = pick(r, [[2, 2], [2, 2], [2, 1], [1, 2], [3, 1], [1, 3], [3, 2]] as const)
      const n = up + down
      const dir = chance(r, 0.5) ? 1 : -1
      const herring = chance(r, 0.35) ? int(r, 4, 9) : 0
      rule = (i, j) => {
        let d = dir
        if (herring && (Math.floor(i / herring) & 1))
          d = -d
        return mod(i * d + j, n) < up
      }
      break
    }
    case 'Basket': {
      const bw = pick(r, [2, 2, 3])
      const bf = pick(r, [1, 2, 2, 3])
      rule = (i, j) => ((Math.floor(i / bw) + Math.floor(j / bf)) & 1) === 0
      break
    }
    case 'Satin': {
      const [n, steps] = pick(r, [[5, [2, 3]], [5, [2, 3]], [7, [2, 3, 4, 5]], [8, [3, 5]]] as const)
      const step = pick(r, steps)
      const warpFaced = chance(r, 0.5)
      rule = (i, j) => (mod(i * step - j, n) === 0) !== warpFaced
      break
    }
    default: {
      const shafts = pick(r, [4, 4, 6, 8])
      const threading = pointUnit(r, shafts)
      const treadling = chance(r, 0.5) ? threading : pointUnit(r, shafts)
      const tie = tieUp(r, shafts)
      rule = (i, j) => tie[treadling[j % treadling.length] * shafts + threading[i % threading.length]] === 1
    }
  }

  for (let i = 0; i < nW; i++) {
    for (let j = 0; j < nF; j++)
      lift[at(nF, i, j)] = rule(i, j) ? 1 : 0
  }
  if (kind === 'Draft')
    capFloats(lift, nW, nF, 5)
  return lift
}
