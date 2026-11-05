// A small stochastic, parametric, bracketed L-system with a 2D turtle.
//
// After Lindenmayer (1968) and Prusinkiewicz & Lindenmayer, "The Algorithmic
// Beauty of Plants" (1990). Modules are a symbol plus up to three numeric
// parameters; a grammar maps a module to its successor (or to null when the
// module has no production and stays as it is).
//
// The derivation is depth-first: each module is rewritten for the remaining
// number of steps before the next one is looked at, and the turtle reads the
// leaves of that derivation tree from left to right. For a context-free
// (0L) system this yields exactly the word that `steps` parallel rewriting
// steps would produce, without ever storing it.
//
// Turtle symbols:
//   F(l)        draw forward, bent by tropism      f(l)  move forward
//   +(a) -(a)   turn clockwise / anticlockwise     [ ]   push / pop
//   !(w)        set the stroke width               L(s, a, tone)  leaf
//   K(s, kind)  flower                             R(s)  fruit     B(s)  bud
// Any other symbol is an apex that is simply not drawn.

import type { Rng } from '../random'

export type Mod = readonly [sym: string, a: number, b: number, c: number]

export const m = (sym: string, a = 0, b = 0, c = 0): Mod => [sym, a, b, c]

export interface Grammar {
  axiom: readonly Mod[]
  steps: number
  rule: (mod: Mod, r: Rng) => readonly Mod[] | null
  /**
   * Interpretation of the modules left when the derivation stops (the
   * homomorphism of ABOP, ch. 1.10): turns apices into leaves and flowers.
   */
  organ?: (mod: Mod, r: Rng) => readonly Mod[] | null
  /** Initial stroke width. */
  width: number
  /** Width factor applied on every '[' (when no '!' follows). */
  branchTaper: number
  /** Tropism elasticity per unit length, before the thin-branch boost. */
  elasticity: number
  /** Sub-steps per F, so long internodes bend smoothly. */
  sub: number
  /** Downward pull added to the tropism (weeping branches). */
  gravity: number
}

export interface Plant {
  /** x0 y0 x1 y1 width depth, per segment. */
  seg: number[]
  /** x y angle size tone, per leaf. */
  leaf: number[]
  /** x y size kind angle, per flower. */
  bloom: number[]
  /** x y size, per fruit. */
  fruit: number[]
  /** x y size, per bud. */
  bud: number[]
  maxW: number
}

/** Environment of the turtle: a tropism vector (wind and gravity). */
export interface Env { tx: number, ty: number, lean: number }

const MAX_SEG = 40000

export function grow(g: Grammar, r: Rng, env: Env): Plant {
  const p: Plant = { seg: [], leaf: [], bloom: [], fruit: [], bud: [], maxW: g.width }
  // turtle: heading 0 points up, positive turns are clockwise on screen
  let x = 0
  let y = 0
  let th = env.lean
  let w = g.width
  let depth = 0
  const stack: number[] = []
  let full = false
  const tx = env.tx
  const ty = env.ty + g.gravity
  const tLen = Math.hypot(tx, ty)

  const read = (mod: Mod) => {
    switch (mod[0]) {
      case 'F': {
        if (p.seg.length >= MAX_SEG * 6) {
          full = true
          return
        }
        const k = g.sub
        const l = mod[1] / k
        // thin twigs give way to the wind more than the trunk does
        const e = g.elasticity * Math.min(5, Math.sqrt(g.width / Math.max(w, g.width * 0.02))) * l
        for (let i = 0; i < k; i++) {
          if (tLen > 0) {
            const hx = Math.sin(th)
            const hy = -Math.cos(th)
            th += e * (hx * ty - hy * tx)
          }
          const nx = x + Math.sin(th) * l
          const ny = y - Math.cos(th) * l
          p.seg.push(x, y, nx, ny, w, depth)
          x = nx
          y = ny
        }
        break
      }
      case 'f':
        x += Math.sin(th) * mod[1]
        y -= Math.cos(th) * mod[1]
        break
      case '+':
        th += mod[1]
        break
      case '-':
        th -= mod[1]
        break
      case '[':
        stack.push(x, y, th, w, depth)
        w *= g.branchTaper
        depth++
        break
      case ']':
        depth = stack.pop()!
        w = stack.pop()!
        th = stack.pop()!
        y = stack.pop()!
        x = stack.pop()!
        break
      case '!':
        w = mod[1]
        break
      case 'L': {
        // leaves turn their face away from the wind
        let a = th + mod[2]
        const dx = Math.sin(a) + env.tx * 0.9
        const dy = -Math.cos(a) + env.ty * 0.25
        a = Math.atan2(dx, -dy)
        p.leaf.push(x, y, a, mod[1], mod[3])
        break
      }
      case 'K':
        p.bloom.push(x, y, mod[1], mod[2], th)
        break
      case 'R':
        p.fruit.push(x, y, mod[1])
        break
      case 'B':
        p.bud.push(x, y, mod[1])
        break
    }
  }

  const derive = (mod: Mod, n: number) => {
    if (full)
      return
    if (n > 0) {
      const succ = g.rule(mod, r)
      if (succ) {
        for (const s of succ)
          derive(s, n - 1)
        return
      }
    }
    const o = g.organ?.(mod, r)
    if (o) {
      for (const s of o)
        read(s)
    }
    else {
      read(mod)
    }
  }
  for (const mod of g.axiom)
    derive(mod, g.steps)
  return p
}

/** Bounding box of a plant: [minX, minY, maxX, maxY]. */
export function bounds(p: Plant): [number, number, number, number] {
  let x0 = 0
  let y0 = 0
  let x1 = 0
  let y1 = 0
  const add = (x: number, y: number, pad: number) => {
    x0 = Math.min(x0, x - pad)
    x1 = Math.max(x1, x + pad)
    y0 = Math.min(y0, y - pad)
    y1 = Math.max(y1, y + pad)
  }
  for (let i = 0; i < p.seg.length; i += 6)
    add(p.seg[i + 2], p.seg[i + 3], 0)
  for (let i = 0; i < p.leaf.length; i += 5)
    add(p.leaf[i] + Math.sin(p.leaf[i + 2]) * p.leaf[i + 3] * 0.6, p.leaf[i + 1] - Math.cos(p.leaf[i + 2]) * p.leaf[i + 3] * 0.6, p.leaf[i + 3] * 0.45)
  for (let i = 0; i < p.bloom.length; i += 5)
    add(p.bloom[i], p.bloom[i + 1], p.bloom[i + 2])
  for (let i = 0; i < p.fruit.length; i += 3)
    add(p.fruit[i], p.fruit[i + 1], p.fruit[i + 2])
  return [x0, y0, x1, y1]
}

/** Scales a plant in place, coordinates, widths and organ sizes alike. */
export function scale(p: Plant, k: number) {
  for (let i = 0; i < p.seg.length; i += 6) {
    p.seg[i] *= k
    p.seg[i + 1] *= k
    p.seg[i + 2] *= k
    p.seg[i + 3] *= k
    p.seg[i + 4] *= k
  }
  for (let i = 0; i < p.leaf.length; i += 5) {
    p.leaf[i] *= k
    p.leaf[i + 1] *= k
    p.leaf[i + 3] *= k
  }
  for (let i = 0; i < p.bloom.length; i += 5) {
    p.bloom[i] *= k
    p.bloom[i + 1] *= k
    p.bloom[i + 2] *= k
  }
  for (const arr of [p.fruit, p.bud]) {
    for (let i = 0; i < arr.length; i += 3) {
      arr[i] *= k
      arr[i + 1] *= k
      arr[i + 2] *= k
    }
  }
  p.maxW *= k
}
