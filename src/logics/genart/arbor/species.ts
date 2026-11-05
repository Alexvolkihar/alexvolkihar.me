// The plants of "Arbor": four families of stochastic parametric L-systems.
//
// Each builder draws its own individual parameters (angles, ratios, number of
// steps) from the plant's stream, then returns a grammar. Angles are radians,
// lengths are in the plant's own units: the series rescales every plant to
// its place on the sheet afterwards.

import type { Rng } from '../random'
import type { Grammar, Mod } from './lsystem'
import { chance, int, range } from '../random'
import { m } from './lsystem'

export type Species = 'Herb' | 'Tree' | 'Fern' | 'Umbel'

/** What the season puts on the plant. */
export interface Look {
  leaves: boolean
  /** Probability that an apex flowers / fruits / shows a bud. */
  bloom: number
  fruit: number
  bud: number
  /** Probability that a leaf takes the autumn tone. */
  autumn: number
  /** 0 for a small cell of a plate, 1 for a single specimen. */
  detail: number
}

const deg = (d: number) => d * Math.PI / 180

function tone(r: Rng, look: Look) {
  if (look.autumn > 0 && r() < look.autumn)
    return 3
  return Math.floor(r() * 3)
}

/** Flower, fruit or bud at an apex, in that order of priority. */
function tip(r: Rng, look: Look, size: number, kind: number): Mod[] {
  const x = r()
  if (x < look.bloom)
    return [m('K', size, kind)]
  if (x < look.bloom + look.fruit)
    return [m('R', size * 0.32)]
  if (x < look.bloom + look.fruit + look.bud)
    return [m('B', size * 0.18)]
  return []
}

// --- Herb: the stochastic bracketed weeds of ABOP fig. 1.24 -------------------

function herb(r: Rng, look: Look): Grammar {
  const a = deg(range(r, 19, 30))
  const steps = look.detail > 0.5 ? 7 : 6
  // weights of the four productions of X: each individual leans its own way
  const wt = [range(r, 0.2, 1), range(r, 0.2, 1), range(r, 0.2, 1), range(r, 0, 0.6)]
  const tot = wt[0] + wt[1] + wt[2] + wt[3]
  const leaf = range(r, 2.2, 3.4)
  const leafA = deg(range(r, 25, 50))
  const flower = range(r, 2.2, 3.2)
  const j = () => a * range(r, 0.75, 1.25)
  return {
    axiom: [m('X')],
    steps,
    width: range(r, 1.4, 2.2),
    branchTaper: 0.68,
    elasticity: 0.004,
    sub: 1,
    gravity: 0,
    rule: (mod) => {
      if (mod[0] === 'F')
        return [m('F', 1), m('F', 1)]
      if (mod[0] !== 'X')
        return null
      const x = r() * tot
      if (x < wt[0])
        return [m('F', 1), m('['), m('+', j()), m('X'), m(']'), m('F', 1), m('['), m('-', j()), m('X'), m(']'), m('+', j() * 0.4), m('X')]
      if (x < wt[0] + wt[1])
        return [m('F', 1), m('['), m('+', j()), m('X'), m(']'), m('['), m('-', j()), m('X'), m(']'), m('F', 1), m('X')]
      if (x < wt[0] + wt[1] + wt[2])
        return [m('F', 1), m('['), m('-', j()), m('X'), m(']'), m('F', 1), m('['), m('+', j()), m('X'), m(']'), m('-', j() * 0.4), m('X')]
      return [m('F', 1), m('['), m('+', j() * 1.4), m('X'), m(']'), m('F', 1), m('X')]
    },
    organ: (mod) => {
      if (mod[0] !== 'X')
        return null
      const out: Mod[] = []
      if (look.leaves) {
        out.push(m('L', leaf * range(r, 0.7, 1.15), leafA, tone(r, look)))
        out.push(m('L', leaf * range(r, 0.6, 1), -leafA, tone(r, look)))
      }
      return out.concat(tip(r, look, flower, 0))
    },
  }
}

// --- Tree: sympodial (Aono & Kunii) or monopodial (Honda), ABOP ch. 2 ---------

function tree(r: Rng, look: Look): Grammar {
  const sympodial = chance(r, 0.6)
  const weeping = chance(r, 0.12)
  const steps = look.detail > 0.5 ? 11 : look.detail > 0.2 ? 10 : 9
  const wr = 0.707
  const leaf = range(r, 0.07, 0.11)
  const flower = leaf * range(r, 0.8, 1.1)
  const organ = (mod: Mod): readonly Mod[] | null => {
    if (mod[0] !== 'A' && mod[0] !== 'B' && mod[0] !== 'C')
      return null
    const out: Mod[] = []
    if (look.leaves) {
      const n = 2 + (r() < 0.5 ? 1 : 0)
      for (let i = 0; i < n; i++)
        out.push(m('L', leaf * range(r, 0.7, 1.2), deg(r() * 140 - 70), tone(r, look)))
    }
    return out.concat(tip(r, look, flower, 0))
  }
  if (sympodial) {
    const r1 = range(r, 0.78, 0.9)
    const r2 = range(r, 0.62, 0.82)
    const a1 = deg(range(r, 6, 28))
    const a2 = deg(range(r, 28, 55))
    const drop = range(r, 0, 0.1)
    return {
      axiom: [m('A', 1, 0.09)],
      steps,
      width: 0.09,
      branchTaper: 1,
      elasticity: weeping ? 0.35 : 0.08,
      sub: 3,
      gravity: weeping ? 1.2 : 0.05,
      rule: (mod) => {
        if (mod[0] !== 'A')
          return null
        const [, l, w] = mod
        const s = r() < 0.5 ? 1 : -1
        const out: Mod[] = [m('!', w), m('F', l * range(r, 0.85, 1.15))]
        const p = mod[3] > 2 ? drop : 0
        if (r() >= p)
          out.push(m('['), m('+', s * a1 * range(r, 0.6, 1.4)), m('A', l * r1, w * wr, mod[3] + 1), m(']'))
        if (r() >= p)
          out.push(m('['), m('-', s * a2 * range(r, 0.7, 1.3)), m('A', l * r2, w * wr, mod[3] + 1), m(']'))
        return out
      },
      organ,
    }
  }
  const r1 = range(r, 0.86, 0.94)
  const r2 = range(r, 0.5, 0.7)
  const a0 = deg(range(r, 35, 65))
  const a2 = deg(range(r, 30, 50))
  const wt = range(r, 0.78, 0.86)
  return {
    axiom: [m('A', 1, 0.08, 1)],
    steps: steps + 1,
    width: 0.08,
    branchTaper: 1,
    elasticity: weeping ? 0.4 : 0.1,
    sub: 2,
    gravity: weeping ? 1 : 0.15,
    rule: (mod) => {
      const [s, l, w, side] = mod
      if (s === 'A') {
        return [
          m('!', w),
          m('F', l),
          m('['),
          m('+', side * a0 * range(r, 0.8, 1.2)),
          m('B', l * r2, w * wr),
          m(']'),
          m('+', side * deg(range(r, -4, 4))),
          m('A', l * r1, w * wt, -side),
        ]
      }
      if (s === 'B' || s === 'C') {
        const t = s === 'B' ? -1 : 1
        return [
          m('!', w),
          m('F', l),
          m('['),
          m('+', t * a2 * range(r, 0.8, 1.2)),
          m(s === 'B' ? 'C' : 'B', l * r2, w * wr),
          m(']'),
          m(s === 'B' ? 'C' : 'B', l * r1, w * wr),
        ]
      }
      return null
    },
    organ,
  }
}

// --- Fern: fronds of paired pinnae, younger tips curling ----------------------

function fern(r: Rng, look: Look): Grammar {
  const fronds = int(r, 3, 7)
  const spread = deg(range(r, 35, 80))
  const steps = Math.round(17 + look.detail * 9)
  const pa = deg(range(r, 50, 72))
  const ratio = range(r, 1.8, 2.9)
  const bend = deg(range(r, 2, 6))
  const sori = look.bloom + look.fruit > 0
  const axiom: Mod[] = []
  for (let i = 0; i < fronds; i++) {
    const t = fronds === 1 ? 0 : i / (fronds - 1) - 0.5
    const curl = deg(range(r, 0.5, 1.8)) * (t < 0 ? -1 : 1) * (r() < 0.25 ? -1 : 1)
    axiom.push(m('['), m('+', t * spread + deg(range(r, -6, 6))), m('!', 0.05), m('A', (1 - Math.abs(t) * 0.6) * range(r, 0.85, 1.05), 0, curl), m(']'))
  }
  return {
    axiom,
    steps,
    width: 0.05,
    branchTaper: 0.4,
    elasticity: 0.02,
    sub: 1,
    gravity: 0.06,
    rule: (mod) => {
      const [s, l, k, c] = mod
      if (s === 'A') {
        const pl = l * ratio * Math.min(1, (k + 1) / 5)
        return [
          m('F', l),
          m('['),
          m('+', pa),
          m('P', pl, 1),
          m(']'),
          m('['),
          m('-', pa),
          m('P', pl, -1),
          m(']'),
          m('+', c * (1 + k * 0.07)),
          m('A', l * 0.955, k + 1, c),
        ]
      }
      if (s === 'P') {
        const size = l * 0.42
        if (l < 0.06)
          return look.leaves ? [m('L', size * 1.3, 0, tone(r, look))] : []
        const out: Mod[] = [m('F', l * 0.2)]
        if (look.leaves) {
          out.push(m('L', size, deg(62), tone(r, look)), m('L', size, -deg(62), tone(r, look)))
          if (sori && r() < (look.bloom + look.fruit) * 0.9)
            out.push(m('['), m('+', deg(70)), m('f', size * 0.45), m('R', size * 0.09), m(']'))
        }
        out.push(m('-', k * bend), m('P', l * 0.84, k))
        return out
      }
      return null
    },
    organ: (mod) => {
      // the youngest tip is a crozier, still rolled up
      if (mod[0] !== 'A')
        return null
      const l = mod[1]
      const c = mod[3] < 0 ? -1 : 1
      return [m('F', l * 0.7), m('+', c * deg(40)), m('F', l * 0.5), m('+', c * deg(55)), m('F', l * 0.35), m('+', c * deg(70)), m('F', l * 0.25)]
    },
  }
}

// --- Umbel: stems ending in compound umbels, like wild carrot or fennel -------

function umbel(r: Rng, look: Look): Grammar {
  const stems = int(r, 1, 3)
  const nodes = int(r, 4, 6)
  const rays = int(r, 7, 13)
  const fan = deg(range(r, 70, 120))
  const leaf = range(r, 0.5, 0.8)
  const floret = range(r, 0.05, 0.075)
  const axiom: Mod[] = []
  for (let i = 0; i < stems; i++) {
    const t = stems === 1 ? 0 : i / (stems - 1) - 0.5
    axiom.push(m('['), m('+', t * deg(40) + deg(range(r, -5, 5))), m('!', 0.06), m('S', nodes + (i === 1 ? 1 : 0), range(r, 0.9, 1.15), 0), m(']'))
  }
  return {
    axiom,
    steps: nodes + 6,
    width: 0.06,
    branchTaper: 0.55,
    elasticity: 0.03,
    sub: 3,
    gravity: 0,
    rule: (mod, rr) => {
      const [s, a, b, c] = mod
      if (s === 'S') {
        if (a <= 0)
          return [m('U', b * (c > 0 ? 0.55 : 0.85), c)]
        const side = rr() < 0.5 ? 1 : -1
        const out: Mod[] = [m('F', b), m('+', deg(range(rr, -6, 6)))]
        if (look.leaves)
          out.push(m('L', leaf * (c > 0 ? 0.6 : 1) * range(rr, 0.7, 1.1), side * deg(range(rr, 35, 60)), tone(rr, look)))
        if (c < 1 && a > 1 && a < nodes && rr() < 0.45)
          out.push(m('['), m('+', side * deg(range(rr, 25, 45))), m('S', a - 1, b * 0.75, c + 1), m(']'))
        out.push(m('S', a - 1, b * 0.93, c))
        return out
      }
      if (s === 'U') {
        const out: Mod[] = []
        for (let i = 0; i < rays; i++) {
          const t = i / (rays - 1) - 0.5
          // outer rays are longer, so the umbel is a flat dome
          const len = a / Math.cos(t * fan * 0.8) * range(rr, 0.9, 1.05)
          out.push(m('['), m('+', t * fan), m('F', len), m('-', t * fan * 0.6), m('V', a * 0.32), m(']'))
        }
        return out
      }
      if (s === 'V') {
        const n = 5 + Math.floor(rr() * 5)
        const out: Mod[] = []
        for (let i = 0; i < n; i++) {
          const t = i / (n - 1) - 0.5
          out.push(m('['), m('+', t * deg(120)), m('F', a / Math.cos(t * 1.5)), m('T'), m(']'))
        }
        return out
      }
      return null
    },
    organ: (mod) => {
      if (mod[0] !== 'T')
        return null
      if (look.leaves || look.bloom > 0)
        return tip(r, { ...look, bloom: look.bloom > 0 ? 0.92 : 0, fruit: look.fruit > 0 ? 0.9 : 0, bud: 1 }, floret, 1)
      return [m('B', floret * 0.6)]
    },
  }
}

export const SPECIES: Record<Species, (r: Rng, look: Look) => Grammar> = {
  Herb: herb,
  Tree: tree,
  Fern: fern,
  Umbel: umbel,
}
