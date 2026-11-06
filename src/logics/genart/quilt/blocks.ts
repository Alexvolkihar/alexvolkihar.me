// Traditional patchwork blocks, as lists of patches in the unit square.
//
// Each block is the piecing diagram of a classic American block, written as
// polygons (curves are sampled) with a fabric role per patch: a light
// background ('bg', 'bg2'), two main colours ('a', 'b'), an accent ('c') and
// a dark ('d'). The roles are turned into actual fabrics by the series, so
// the same grammar serves a controlled colourway or a scrap quilt.
//
// Coordinates: x right, y down, the block is [0, 1]². Rotations are quarter
// turns clockwise about the block centre.

import type { Rng } from '../random'
import { chance, int, pick } from '../random'

export type Role = 'bg' | 'bg2' | 'a' | 'b' | 'c' | 'd'
export interface Patch { p: number[], role: Role }

export const BLOCK_TYPES = ['Log Cabin', 'Nine-Patch', 'Flying Geese', 'Half-Square Triangles', 'Ohio Star', 'Drunkard\'s Path'] as const
export type BlockType = typeof BLOCK_TYPES[number]

/** Per-piece choices inside the block grammars, drawn once from the hash. */
export interface Variants {
  rounds: number
  doubleNine: boolean
  geese: 'column' | 'dutchman'
  hstGrid: number
  hstO: number[]
  hstRole: Role[]
  starInner: Role
  pathQ: number[]
  pathSwap: boolean[]
}

/** Fixed number of draws whatever the outcome, so later draws never shift. */
export function blockVariants(r: Rng): Variants {
  const rounds = int(r, 3, 4)
  const doubleNine = chance(r, 0.4)
  const geese = chance(r, 0.5) ? 'column' : 'dutchman'
  const hstKind = pick(r, ['pinwheel', 'diamond', 'zigzag', 'pinwheels', 'scrap'] as const)
  const hstRand = Array.from({ length: 16 }, () => r())
  const starInner = chance(r, 0.35) ? 'b' : 'bg'
  const pathKind = chance(r, 0.5) ? 'circles' : 'path'
  const pathRand = Array.from({ length: 16 }, () => r())

  const hstGrid = hstKind === 'pinwheel' ? 2 : 4
  const hstO: number[] = []
  const hstRole: Role[] = []
  for (let j = 0; j < hstGrid; j++) {
    for (let i = 0; i < hstGrid; i++) {
      const k = j * hstGrid + i
      if (hstKind === 'pinwheel') {
        hstO.push([[0, 1], [3, 2]][j][i])
        hstRole.push('a')
      }
      else if (hstKind === 'pinwheels') {
        hstO.push([[0, 1], [3, 2]][j % 2][i % 2])
        hstRole.push(((i >> 1) + (j >> 1)) % 2 ? 'b' : 'a')
      }
      else if (hstKind === 'diamond') {
        // dark corners face the centre on the inner ring, away from it outside
        const quad = i < 2 ? (j < 2 ? 1 : 0) : (j < 2 ? 2 : 3)
        const inner = i >= 1 && i <= 2 && j >= 1 && j <= 2
        hstO.push((quad + (inner ? 0 : 2)) % 4)
        hstRole.push(inner ? 'b' : 'a')
      }
      else if (hstKind === 'zigzag') {
        hstO.push(i % 2 ? 3 : 0)
        hstRole.push(j % 2 ? 'b' : 'a')
      }
      else {
        hstO.push(Math.floor(hstRand[k] * 4))
        hstRole.push((['a', 'b', 'd'] as const)[Math.floor(hstRand[(k + 5) % 16] * 3)])
      }
    }
  }

  const pathQ: number[] = []
  const pathSwap: boolean[] = []
  for (let j = 0; j < 4; j++) {
    for (let i = 0; i < 4; i++) {
      if (pathKind === 'circles') {
        pathQ.push([[2, 3], [1, 0]][j % 2][i % 2])
        pathSwap.push(((i >> 1) + (j >> 1)) % 2 === 1)
      }
      else {
        pathQ.push(Math.floor(pathRand[j * 4 + i] * 4))
        pathSwap.push((i + j) % 2 === 1)
      }
    }
  }
  return { rounds, doubleNine, geese, hstGrid, hstO, hstRole, starInner, pathQ, pathSwap }
}

function rect(x0: number, y0: number, x1: number, y1: number, role: Role): Patch {
  return { p: [x0, y0, x1, y0, x1, y1, x0, y1], role }
}

function poly(role: Role, ...p: number[]): Patch {
  return { p, role }
}

/** Rotate a patch by k quarter turns clockwise about (cx, cy). */
export function rotate(pt: Patch, k: number, cx = 0.5, cy = 0.5): Patch {
  k = ((k % 4) + 4) % 4
  if (!k)
    return pt
  const p = pt.p.slice()
  for (let i = 0; i < p.length; i += 2) {
    let x = p[i] - cx
    let y = p[i + 1] - cy
    for (let t = 0; t < k; t++)
      [x, y] = [-y, x]
    p[i] = x + cx
    p[i + 1] = y + cy
  }
  return { p, role: pt.role }
}

/** Scale and move a patch from the unit square into [x, x + s] × [y, y + s]. */
function place(pt: Patch, x: number, y: number, s: number): Patch {
  return { p: pt.p.map((v, i) => (i % 2 ? y : x) + v * s), role: pt.role }
}

function logCabin(v: Variants): Patch[] {
  const w = 1 / (2 * v.rounds + 1)
  let x0 = 0.5 - w / 2
  let y0 = x0
  let x1 = 0.5 + w / 2
  let y1 = x1
  const out = [rect(x0, y0, x1, y1, 'c')]
  for (let k = 0; k < v.rounds; k++) {
    const light: Role = k % 2 ? 'bg2' : 'bg'
    const dark: Role = k % 2 ? 'b' : 'a'
    // light logs on the top and the left, dark ones below and to the right
    out.push(rect(x0, y0 - w, x1, y0, light))
    y0 -= w
    out.push(rect(x0 - w, y0, x0, y1, light))
    x0 -= w
    out.push(rect(x0, y1, x1, y1 + w, dark))
    y1 += w
    out.push(rect(x1, y0, x1 + w, y1, dark))
    x1 += w
  }
  return out
}

function ninePatch(v: Variants): Patch[] {
  const out: Patch[] = []
  const t = 1 / 3
  for (let j = 0; j < 3; j++) {
    for (let i = 0; i < 3; i++) {
      const on = (i + j) % 2 === 0
      if (v.doubleNine && on) {
        for (let jj = 0; jj < 3; jj++) {
          for (let ii = 0; ii < 3; ii++) {
            const role: Role = (ii + jj) % 2 === 0 ? (i === 1 ? 'c' : 'a') : 'bg'
            out.push(rect((i + ii / 3) * t, (j + jj / 3) * t, (i + (ii + 1) / 3) * t, (j + (jj + 1) / 3) * t, role))
          }
        }
      }
      else {
        let role: Role = on ? 'a' : 'bg'
        if (v.doubleNine)
          role = 'b'
        else if (i === 1 && j === 1)
          role = 'c'
        out.push(rect(i * t, j * t, (i + 1) * t, (j + 1) * t, role))
      }
    }
  }
  return out
}

/** One flying-geese unit, pointing up, in [x, x + w] × [y, y + h]. */
function goose(x: number, y: number, w: number, h: number, role: Role): Patch[] {
  return [
    poly(role, x, y + h, x + w, y + h, x + w / 2, y),
    poly('bg', x, y, x + w / 2, y, x, y + h),
    poly('bg', x + w, y, x + w, y + h, x + w / 2, y),
  ]
}

function flyingGeese(v: Variants): Patch[] {
  const out: Patch[] = []
  if (v.geese === 'column') {
    for (let c = 0; c < 2; c++) {
      for (let k = 0; k < 4; k++)
        out.push(...goose(c * 0.5, k * 0.25, 0.5, 0.25, (k + c) % 2 ? 'b' : 'a'))
    }
    return out
  }
  // Dutchman's Puzzle: four pairs of geese turning round the centre
  for (let q = 0; q < 4; q++) {
    const quad = [...goose(0, 0, 0.5, 0.25, q % 2 ? 'b' : 'a'), ...goose(0, 0.25, 0.5, 0.25, q % 2 ? 'b' : 'a')]
    for (const pt of quad)
      out.push(rotate(pt, q))
  }
  return out
}

function halfSquares(v: Variants): Patch[] {
  const out: Patch[] = []
  const m = v.hstGrid
  for (let j = 0; j < m; j++) {
    for (let i = 0; i < m; i++) {
      const k = j * m + i
      const unit = [poly(v.hstRole[k], 0, 0, 1, 0, 1, 1), poly('bg', 0, 0, 1, 1, 0, 1)]
      for (const pt of unit)
        out.push(place(rotate(pt, v.hstO[k]), i / m, j / m, 1 / m))
    }
  }
  return out
}

function ohioStar(v: Variants): Patch[] {
  const out: Patch[] = []
  const t = 1 / 3
  for (const [i, j] of [[0, 0], [2, 0], [2, 2], [0, 2]])
    out.push(rect(i * t, j * t, (i + 1) * t, (j + 1) * t, 'bg'))
  out.push(rect(t, t, 2 * t, 2 * t, 'c'))
  // the top point unit, turned to the four sides: a quarter-square-triangle
  // unit whose side triangles are the star points
  const cx = 0.5
  const cy = t / 2
  const unit = [
    poly('bg', t, 0, 2 * t, 0, cx, cy),
    poly(v.starInner, t, t, 2 * t, t, cx, cy),
    poly('a', t, 0, cx, cy, t, t),
    poly('a', 2 * t, 0, 2 * t, t, cx, cy),
  ]
  for (let q = 0; q < 4; q++) {
    for (const pt of unit)
      out.push(rotate(pt, q))
  }
  return out
}

const CORNERS = [[0, 0], [1, 0], [1, 1], [0, 1]] as const
function drunkardsPath(v: Variants, steps: number): Patch[] {
  const out: Patch[] = []
  const r = 0.62
  for (let j = 0; j < 4; j++) {
    for (let i = 0; i < 4; i++) {
      const k = j * 4 + i
      const q = v.pathQ[k]
      const [cx, cy] = CORNERS[q]
      const arc: number[] = []
      for (let s = 0; s <= steps; s++) {
        const a = (q + s / steps) * Math.PI / 2
        arc.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
      }
      const rest = arc.slice()
      for (const c of [3, 2, 1])
        rest.push(...CORNERS[(q + c) % 4])
      const swap = v.pathSwap[k]
      const pie: Patch = { p: [cx, cy, ...arc], role: swap ? 'bg' : 'a' }
      const ground: Patch = { p: rest, role: swap ? 'a' : 'bg' }
      out.push(place(ground, i / 4, j / 4, 0.25), place(pie, i / 4, j / 4, 0.25))
    }
  }
  return out
}

/**
 * Arc segments for a drunkard's path block drawn `px` pixels wide: about one
 * segment per 5 px of arc, so curves stay smooth at 8K and cheap on covers.
 */
export function arcSteps(px: number): number {
  return Math.max(4, Math.min(24, Math.ceil(px * 0.155 / 5)))
}

export function block(type: BlockType, v: Variants, steps = 14): Patch[] {
  switch (type) {
    case 'Log Cabin': return logCabin(v)
    case 'Nine-Patch': return ninePatch(v)
    case 'Flying Geese': return flyingGeese(v)
    case 'Half-Square Triangles': return halfSquares(v)
    case 'Ohio Star': return ohioStar(v)
    default: return drunkardsPath(v, steps)
  }
}

/** Blocks whose layout reads differently when turned: worth a rotation scheme. */
export function isDirectional(type: BlockType): boolean {
  return type === 'Log Cabin' || type === 'Drunkard\'s Path' || type === 'Flying Geese' || type === 'Half-Square Triangles'
}
