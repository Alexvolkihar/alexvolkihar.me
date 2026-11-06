// Procedural pixel sprites from mirrored random masks.
//
// The method is the one Dave Bollinger described for his Pixel Robots and
// Pixel Spaceships (2006), as written up and generalised by Zelimir Fedoran's
// pixel-sprite-generator (MIT): a half mask whose cells are "always empty",
// "maybe body", "body or border" or "always border" is sampled at random,
// mirrored around the vertical axis, and outlined. The masks here are not
// fixed grids: each one is built from a few hash-drawn shapes (ellipses for
// critters, boxes for robots, a tapered hull and wings for ships), so every
// family of sprites is new. Only the largest connected piece is kept, so
// nothing floats.

import type { Rng } from '../random'
import type { Colour, Pixels } from './pixels'
import { chance, int, range } from '../random'

export type Kind = 'critter' | 'robot' | 'ship'
export type Shading = 'Flat' | 'Rounded' | 'Banded'

// Mask cell codes (half mask, before sampling).
const T_EMPTY = 0
const T_MAYBE = 1 // empty or body
const T_DETAIL = 2 // body or dark detail
const T_SOLID = 3
const T_ACCENT = 4 // eye, visor, cockpit

// Sprite cell codes (after sampling).
export const EMPTY = 0
export const BODY = 1
export const ACCENT = 2
export const DETAIL = 3
export const LINE = 4

export interface Mask {
  kind: Kind
  /** Columns on one side of the axis (the axis column included when odd). */
  hw: number
  h: number
  /** Odd masks share their centre column: a single eye, a nose, a spine. */
  odd: boolean
  t: Uint8Array
}

export interface Sprite {
  /** Size including the one-cell outline margin. */
  w: number
  h: number
  c: Uint8Array
  /** Lowest occupied row, so a sprite can stand on a floor. */
  bottom: number
}

/** Mask height for a kind, from the base height of the size trait. */
export function kindHeight(kind: Kind, h: number) {
  if (kind === 'ship')
    return Math.round(h * 1.25)
  if (kind === 'robot')
    return Math.round(h * 1.1)
  return h
}

export function makeMask(kind: Kind, hw: number, baseH: number, r: Rng): Mask {
  const h = kindHeight(kind, baseH)
  const odd = chance(r, 0.5)
  const t = new Uint8Array(hw * h)
  const m: Mask = { kind, hw, h, odd, t }
  if (kind === 'critter')
    critter(m, r)
  else if (kind === 'robot')
    robot(m, r)
  else
    ship(m, r)
  return m
}

function put(m: Mask, c: number, y: number, v: number) {
  if (c < 0 || c >= m.hw || y < 0 || y >= m.h)
    return
  m.t[y * m.hw + c] = v
}

function at(m: Mask, c: number, y: number) {
  if (c < 0 || c >= m.hw || y < 0 || y >= m.h)
    return T_EMPTY
  return m.t[y * m.hw + c]
}

/** Horizontal distance of half-mask column c from the axis, in cells. */
function cx(m: Mask, c: number) {
  return m.odd ? c : c + 0.5
}

// Critters: a body ellipse, often a head, legs, horns and eyes.
function critter(m: Mask, r: Rng) {
  const { hw, h } = m
  const rx = hw * range(r, 0.55, 0.95)
  const ry = h * range(r, 0.22, 0.36)
  const cy = h * range(r, 0.45, 0.6)
  const hasHead = chance(r, 0.65)
  const hrx = hw * range(r, 0.35, 0.7)
  const hry = h * range(r, 0.14, 0.22)
  const hcy = Math.max(hry, cy - ry * range(r, 0.75, 1.05))
  const fuzz = range(r, 0.15, 0.4)
  for (let y = 0; y < h; y++) {
    for (let c = 0; c < hw; c++) {
      const dx = cx(m, c)
      const dy = y + 0.5
      let d = (dx / rx) ** 2 + ((dy - cy) / ry) ** 2
      if (hasHead)
        d = Math.min(d, (dx / hrx) ** 2 + ((dy - hcy) / hry) ** 2)
      let v = T_EMPTY
      if (d < 0.4)
        v = T_SOLID
      else if (d < 1)
        v = r() < 0.7 ? T_MAYBE : T_DETAIL
      else if (d < 1.5 && r() < fuzz)
        v = T_MAYBE
      put(m, c, y, v)
    }
  }
  // legs or tentacles down to the bottom row
  const legs = int(r, 1, Math.max(1, Math.min(3, hw - 1)))
  const legTop = Math.floor(cy + ry * 0.5)
  for (let k = 0; k < legs; k++) {
    let c = int(r, m.odd ? 1 : 0, hw - 1)
    for (let y = legTop; y < h; y++) {
      put(m, c, y, y === h - 1 ? T_DETAIL : T_SOLID)
      if (chance(r, 0.2))
        c = Math.max(0, Math.min(hw - 1, c + (r() < 0.5 ? -1 : 1)))
    }
  }
  // horns or antennae
  if (chance(r, 0.4)) {
    const top = Math.floor((hasHead ? hcy - hry : cy - ry))
    let c = int(r, 1, Math.max(1, hw - 2))
    for (let y = top; y >= Math.max(0, top - int(r, 2, 3)); y--) {
      put(m, c, y, T_SOLID)
      if (chance(r, 0.5))
        c = Math.min(hw - 1, c + 1)
    }
  }
  // eyes, kept inside the head or the upper body
  const ey = Math.round(hasHead ? hcy : cy - ry * 0.45)
  const reach = Math.max(1, Math.floor((hasHead ? hrx : rx) * 0.6))
  const ec = int(r, m.odd && chance(r, 0.25) ? 0 : 1, reach)
  put(m, Math.min(ec, hw - 1), ey, T_ACCENT)
  if (chance(r, 0.3))
    put(m, Math.min(ec, hw - 1), ey + 1, T_ACCENT)
}

// Robots: stacked boxes with solid cores and detail rims, arms, legs, a visor.
function robot(m: Mask, r: Rng) {
  const { hw, h } = m
  const box = (c1: number, y0: number, y1: number, rim: number) => {
    for (let y = y0; y <= y1; y++) {
      for (let c = 0; c <= c1; c++) {
        const edge = c === c1 || y === y0 || y === y1
        put(m, c, y, edge ? rim : T_SOLID)
      }
    }
  }
  const antenna = chance(r, 0.45) ? int(r, 1, 2) : 0
  const headW = int(r, Math.max(1, Math.round(hw * 0.35)), hw - 2)
  const headH = int(r, Math.max(2, Math.round(h * 0.18)), Math.max(2, Math.round(h * 0.28)))
  const headTop = antenna
  const neck = int(r, 0, 1)
  const torsoTop = headTop + headH + neck
  const torsoW = int(r, Math.max(1, Math.round(hw * 0.5)), hw - 1)
  const torsoH = int(r, Math.max(2, Math.round(h * 0.28)), Math.max(2, Math.round(h * 0.42)))
  const torsoBottom = Math.min(h - 2, torsoTop + torsoH - 1)
  box(headW, headTop, headTop + headH - 1, chance(r, 0.5) ? T_DETAIL : T_SOLID)
  for (let y = headTop + headH; y < torsoTop; y++)
    put(m, 0, y, T_SOLID)
  box(torsoW, torsoTop, torsoBottom, T_DETAIL)
  if (antenna) {
    const ac = int(r, 0, Math.max(0, headW - 1))
    for (let y = 0; y < headTop; y++)
      put(m, ac, y, y === 0 ? T_DETAIL : T_SOLID)
  }
  // arms hang from the shoulders
  if (torsoW < hw - 1 && chance(r, 0.85)) {
    const ac = int(r, torsoW + 1, hw - 1)
    const len = int(r, 2, Math.max(2, torsoH + 1))
    for (let c = torsoW + 1; c <= ac; c++)
      put(m, c, torsoTop + 1, T_SOLID)
    for (let y = torsoTop + 1; y < Math.min(h, torsoTop + 1 + len); y++)
      put(m, ac, y, T_SOLID)
    put(m, ac, Math.min(h - 1, torsoTop + 1 + len), T_DETAIL)
  }
  // legs, or a single wheel-like base
  const lc = int(r, m.odd ? 1 : 0, Math.max(m.odd ? 1 : 0, torsoW - 1))
  const lw = int(r, 1, 2)
  const knee = Math.floor((torsoBottom + h) / 2)
  for (let y = torsoBottom + 1; y < h; y++) {
    for (let c = lc; c < Math.min(hw, lc + lw); c++)
      put(m, c, y, y === knee ? T_DETAIL : T_SOLID)
  }
  if (lc + lw < hw)
    put(m, lc + lw, h - 1, T_DETAIL)
  // eyes or visor
  const ey = headTop + Math.max(1, Math.floor(headH / 2) - (headH > 3 ? 1 : 0))
  if (chance(r, 0.35)) {
    for (let c = 0; c < headW; c++)
      put(m, c, ey, T_ACCENT)
  }
  else {
    put(m, int(r, m.odd ? 1 : 0, Math.max(m.odd ? 1 : 0, headW - 1)), ey, T_ACCENT)
  }
  // chest light
  if (chance(r, 0.5))
    put(m, int(r, 0, Math.max(0, torsoW - 2)), torsoTop + int(r, 1, Math.max(1, torsoBottom - torsoTop - 1)), T_ACCENT)
}

// Ships, nose up: a tapered hull, swept wings, cannons, a cockpit.
function ship(m: Mask, r: Rng) {
  const { hw, h } = m
  const nose = int(r, 0, 1)
  const tail = h - 1 - int(r, 0, 1)
  const p = range(r, 0.45, 1.4)
  const maxW = hw * range(r, 0.3, 0.6)
  const hull: number[] = []
  for (let y = 0; y < h; y++) {
    if (y < nose || y > tail) {
      hull.push(0)
      continue
    }
    const v = (y - nose + 1) / (tail - nose + 1)
    const narrowTail = y >= tail - 1 ? 0.75 : 1
    const hwid = Math.max(1, maxW * v ** p * narrowTail)
    hull.push(hwid)
    for (let c = 0; c < hw; c++) {
      const d = cx(m, c) / hwid
      if (d < 0.55)
        put(m, c, y, T_SOLID)
      else if (d < 1.05)
        put(m, c, y, r() < 0.65 ? T_MAYBE : T_DETAIL)
    }
  }
  // wings
  const y0 = int(r, Math.round(h * 0.35), Math.round(h * 0.6))
  const y1 = Math.min(tail, y0 + int(r, 2, Math.max(2, Math.round(h * 0.35))))
  const q = range(r, 0.6, 1.8)
  const span = range(r, 0.75, 1)
  for (let y = y0; y <= y1; y++) {
    const f = ((y - y0 + 1) / (y1 - y0 + 1)) ** q
    const ext = hull[y] + (hw * span - hull[y]) * f
    for (let c = 0; c < hw; c++) {
      const d = cx(m, c)
      if (d >= hull[y] && d < ext)
        put(m, c, y, d > ext - 1 ? T_DETAIL : (r() < 0.75 ? T_SOLID : T_MAYBE))
    }
  }
  // cannons on the wings
  if (chance(r, 0.55)) {
    const gc = int(r, Math.max(1, Math.round(hw * 0.45)), hw - 1)
    for (let y = Math.max(0, y0 - int(r, 1, 3)); y < y0 + 1; y++)
      put(m, gc, y, T_SOLID)
  }
  // cockpit
  const cy = int(r, Math.max(nose + 1, Math.round(h * 0.15)), Math.round(h * 0.35))
  const cl = int(r, 1, 3)
  for (let y = cy; y < Math.min(h, cy + cl); y++) {
    put(m, 0, y, T_ACCENT)
    if (!m.odd && cl > 2 && at(m, 1, y) !== T_EMPTY && chance(r, 0.3))
      put(m, 1, y, T_ACCENT)
  }
}

/**
 * Samples a mask into a sprite. Consumes a fixed number of draws per attempt;
 * a sparse result is redrawn (at most four times) so every sprite reads.
 */
export function sample(m: Mask, r: Rng, diagonal: boolean): Sprite {
  const W = m.odd ? 2 * m.hw - 1 : 2 * m.hw
  const gw = W + 2
  const gh = m.h + 2
  let c = new Uint8Array(gw * gh)
  let solid = 0
  for (let k = 0; k < m.t.length; k++) {
    if (m.t[k] !== T_EMPTY)
      solid++
  }
  for (let attempt = 0; attempt < 4; attempt++) {
    c = new Uint8Array(gw * gh)
    for (let y = 0; y < m.h; y++) {
      for (let k = 0; k < m.hw; k++) {
        const v = m.t[y * m.hw + k]
        let out = EMPTY
        if (v === T_MAYBE)
          out = r() < 0.5 ? BODY : EMPTY
        else if (v === T_DETAIL)
          out = r() < 0.5 ? BODY : DETAIL
        else if (v === T_SOLID)
          out = BODY
        else if (v === T_ACCENT)
          out = ACCENT
        const xr = (m.odd ? m.hw - 1 + k : m.hw + k) + 1
        const xl = (m.hw - 1 - k) + 1
        c[(y + 1) * gw + xr] = out
        c[(y + 1) * gw + xl] = out
      }
    }
    const kept = keepLargest(c, gw, gh)
    if (kept >= solid * 0.9)
      break
  }
  // outline
  const o = c.slice()
  let bottom = 0
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      if (c[y * gw + x] !== EMPTY)
        continue
      let near = false
      for (let dy = -1; dy <= 1 && !near; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if ((dx === 0 && dy === 0) || (!diagonal && dx !== 0 && dy !== 0))
            continue
          const xx = x + dx
          const yy = y + dy
          if (xx >= 0 && yy >= 0 && xx < gw && yy < gh && c[yy * gw + xx] !== EMPTY) {
            near = true
            break
          }
        }
      }
      if (near)
        o[y * gw + x] = LINE
    }
  }
  for (let k = 0; k < o.length; k++) {
    if (o[k] !== EMPTY)
      bottom = Math.max(bottom, Math.floor(k / gw))
  }
  return { w: gw, h: gh, c: o, bottom }
}

/** Keeps the largest 8-connected group of filled cells; returns its size. */
function keepLargest(c: Uint8Array, w: number, h: number) {
  const label = new Int32Array(c.length)
  const stack = new Int32Array(c.length)
  let best = 0
  let bestLabel = 0
  let next = 0
  for (let s = 0; s < c.length; s++) {
    if (c[s] === EMPTY || label[s])
      continue
    next++
    let top = 0
    let size = 0
    stack[top++] = s
    label[s] = next
    while (top) {
      const k = stack[--top]
      size++
      const x = k % w
      const y = (k - x) / w
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx
          const yy = y + dy
          if (xx < 0 || yy < 0 || xx >= w || yy >= h)
            continue
          const n = yy * w + xx
          if (c[n] !== EMPTY && !label[n]) {
            label[n] = next
            stack[top++] = n
          }
        }
      }
    }
    if (size > best) {
      best = size
      bestLabel = next
    }
  }
  for (let k = 0; k < c.length; k++) {
    if (label[k] !== bestLabel)
      c[k] = EMPTY
  }
  return best
}

/** Turns a nose-up sprite to face right (a quarter turn clockwise). */
export function turnRight(s: Sprite): Sprite {
  const w = s.h
  const h = s.w
  const c = new Uint8Array(w * h)
  let bottom = 0
  for (let y = 0; y < s.h; y++) {
    for (let x = 0; x < s.w; x++) {
      const v = s.c[y * s.w + x]
      const nx = s.h - 1 - y
      const ny = x
      c[ny * w + nx] = v
      if (v !== EMPTY)
        bottom = Math.max(bottom, ny)
    }
  }
  return { w, h, c, bottom }
}

export interface Ink {
  ramp: readonly Colour[]
  /** Second ramp for banded shading (may be the same as `ramp`). */
  ramp2: readonly Colour[]
  accent: Colour
  outline: Colour
  /** Rows per band for banded shading. */
  band: number
}

function filled(s: Sprite, x: number, y: number) {
  if (x < 0 || y < 0 || x >= s.w || y >= s.h)
    return false
  const v = s.c[y * s.w + x]
  return v === BODY || v === ACCENT
}

/** Paints a sprite with its top-left corner at (x, y). */
export function drawSprite(p: Pixels, s: Sprite, x: number, y: number, ink: Ink, shading: Shading) {
  const iw = Math.max(1, s.w - 2)
  const ih = Math.max(1, s.h - 2)
  for (let j = 0; j < s.h; j++) {
    for (let i = 0; i < s.w; i++) {
      const v = s.c[j * s.w + i]
      if (v === EMPTY)
        continue
      let col: Colour
      if (v === LINE) {
        col = ink.outline
      }
      else if (v === ACCENT) {
        col = ink.accent
      }
      else {
        let ramp = ink.ramp
        if (shading === 'Banded' && Math.floor((j - 1) / ink.band) % 2 === 1)
          ramp = ink.ramp2
        const L = ramp.length
        if (v === DETAIL) {
          col = L >= 3 ? ramp[0] : ink.outline
        }
        else if (shading === 'Flat') {
          col = ramp[Math.max(0, L - 2)]
          if (L >= 3 && !filled(s, i, j - 1))
            col = ramp[L - 1]
        }
        else {
          const xn = (i - 0.5) / iw
          const yn = (j - 0.5) / ih
          let t = 0.55 * Math.sin(Math.PI * Math.min(1, Math.max(0, xn))) + 0.45 * (1 - yn)
          if (!filled(s, i, j - 1))
            t += 0.3
          if (!filled(s, i, j + 1))
            t -= 0.3
          if (shading === 'Rounded') {
            if (!filled(s, i - 1, j))
              t += 0.1
            if (!filled(s, i + 1, j))
              t -= 0.1
          }
          t = Math.min(1, Math.max(0, t))
          if (L >= 3)
            col = ramp[1 + Math.round(t * (L - 2))]
          else
            col = ramp[t > 0.72 ? L - 1 : 0]
        }
      }
      p.set(x + i, y + j, col)
    }
  }
}
