// Layout of a "Rosette" star system, in world units where the central square
// of every canvas is [0, 1]². The world is a fixed 2.5 × 2.5 field centred on
// that square, laid out once per hash: any canvas shows a centred crop of it,
// so a square, a 21:9 banner and a 9:16 poster all show the same system, the
// wider ones simply reaching further out.
//
// Bodies never overlap. Planets are threaded on orbits whose radii are spaced
// by the size of the systems they carry; a cluster is packed by greedy random
// placement with shrinking radii; small filler rosettes and sparkles are then
// dropped into whatever room is left, rejecting any candidate that would touch
// a body, an orbit band or the comet.

import type { Rng } from '../random'
import { chance, int, range, stream, weighted } from '../random'

export const WORLD_MIN = -0.75
export const WORLD_MAX = 1.75

export type SystemKind = 'Solar' | 'Binary' | 'Offset' | 'Cluster'
export type SkyKind = 'Quiet' | 'Starry' | 'Teeming' | 'Comet'

export interface Ring {
  rx: number
  ry: number
  tilt: number
}

export interface Body {
  x: number
  y: number
  R: number
  role: 'sun' | 'planet' | 'moon' | 'speck'
  /** Clearance radius of the whole system around the body (moons, ring). */
  sys: number
  ring?: Ring
  /** Radius of the moon orbit drawn around a planet, 0 when it has none. */
  moonOrbit: number
}

export interface Orbit {
  cx: number
  cy: number
  rho: number
  /** Which of the two orbit colours. */
  tone: number
}

export interface Sparkle {
  x: number
  y: number
  s: number
  kind: number
  rot: number
}

export interface Comet {
  x: number
  y: number
  R: number
  /** Points along the tail, head first. */
  tail: Array<[number, number]>
}

export interface Scene {
  bodies: Body[]
  orbits: Orbit[]
  sparkles: Sparkle[]
  comet?: Comet
  /** Half-width of an orbit band, used to keep fillers off it. */
  band: number
}

const TAU = Math.PI * 2

interface Disc { x: number, y: number, r: number }

function clear(x: number, y: number, r: number, obstacles: readonly Disc[], gap: number) {
  for (const o of obstacles) {
    const m = o.r + r + gap
    const dx = o.x - x
    const dy = o.y - y
    if (dx * dx + dy * dy < m * m)
      return false
  }
  return true
}

function offBands(x: number, y: number, r: number, orbits: readonly Orbit[], band: number) {
  for (const o of orbits) {
    const d = Math.hypot(x - o.cx, y - o.cy)
    if (Math.abs(d - o.rho) < r + band)
      return false
  }
  return true
}

function farthest(cx: number, cy: number) {
  let m = 0
  for (const x of [WORLD_MIN, WORLD_MAX]) {
    for (const y of [WORLD_MIN, WORLD_MAX])
      m = Math.max(m, Math.hypot(x - cx, y - cy))
  }
  return m
}

interface Planet {
  body: Body
  moons: number
  Rm: number
  phase: number
}

/** A planet with its moons and maybe a ring. Consumes a fixed number of draws. */
function planet(r: Rng, Rp: number, moonRate: number, budget: number): Planet {
  const nMoons = weighted(r, [[0, 1 - moonRate], [1, moonRate * 0.45], [2, moonRate * 0.35], [3, moonRate * 0.2]] as const)
  const hasRing = chance(r, 0.16)
  const rx = Rp * range(r, 1.55, 1.85)
  const ry = rx * range(r, 0.2, 0.32)
  const tilt = range(r, -0.7, 0.7)
  const Rm = Math.max(0.008, Rp * range(r, 0.24, 0.34))
  const gapM = range(r, 0.008, 0.02)
  const phase = r() * TAU
  const body: Body = { x: 0, y: 0, R: Rp, role: 'planet', sys: Rp * 1.15, moonOrbit: 0 }
  if (hasRing) {
    body.ring = { rx, ry, tilt }
    body.sys = rx * 1.05
  }
  if (nMoons > 0) {
    const inner = hasRing ? rx : Rp * 1.12
    const mo = inner + gapM + Rm
    if (mo + Rm * 1.2 <= budget) {
      body.moonOrbit = mo
      body.sys = Math.max(body.sys, mo + Rm * 1.2)
    }
  }
  if (body.sys > budget && body.ring) {
    body.ring = undefined
    body.sys = Math.max(Rp * 1.15, body.moonOrbit ? body.moonOrbit + Rm * 1.2 : 0)
  }
  return { body, moons: body.moonOrbit ? nMoons : 0, Rm, phase }
}

function place(bodies: Body[], p: Planet, x: number, y: number) {
  const b = p.body
  b.x = x
  b.y = y
  bodies.push(b)
  for (let k = 0; k < p.moons; k++) {
    const a = p.phase + k * TAU / p.moons
    bodies.push({ x: x + Math.cos(a) * b.moonOrbit, y: y + Math.sin(a) * b.moonOrbit, R: p.Rm, role: 'moon', sys: p.Rm * 1.2, moonOrbit: 0 })
  }
}

function sunBody(x: number, y: number, R: number): Body {
  return { x, y, R, role: 'sun', sys: R * 1.06, moonOrbit: 0 }
}

/** The comet is laid down before the planets, so the planets make room for it. */
function placeComet(r: Rng, suns: readonly Body[]): Comet {
  const R = range(r, 0.026, 0.036)
  let best: Comet | undefined
  for (let attempt = 0; attempt < 400; attempt++) {
    const x = range(r, 0.18, 0.82)
    const y = range(r, 0.18, 0.82)
    const dir = r() * TAU
    const len = range(r, 0.26, 0.4) * (attempt < 200 ? 1 : 0.7)
    const bend = range(r, -0.8, 0.8)
    const tail: Array<[number, number]> = []
    let ok = true
    for (let i = 0; i <= 16; i++) {
      const t = i / 16
      const a = dir + bend * t * t * 0.6
      const px = x + Math.cos(a) * len * t
      const py = y + Math.sin(a) * len * t
      tail.push([px, py])
      if (!clear(px, py, R * 1.6, suns.map(s => ({ x: s.x, y: s.y, r: s.sys })), 0.03))
        ok = false
    }
    if (ok) {
      best = { x, y, R, tail }
      break
    }
  }
  return best ?? { x: 0.82, y: 0.2, R, tail: [[0.82, 0.2], [0.9, 0.12]] }
}

function cometDiscs(c: Comet | undefined): Disc[] {
  if (!c)
    return []
  return c.tail.map(([x, y], i) => ({ x, y, r: i === 0 ? c.R * 1.4 : c.R * 1.1 }))
}

export function compose(hash: string, system: SystemKind, sky: SkyKind, hasBands: boolean): Scene {
  const r = stream(hash, 'layout')
  const cr = stream(hash, 'comet')
  const bodies: Body[] = []
  const orbits: Orbit[] = []
  const band = range(r, 0.008, 0.013)

  // ---- suns -------------------------------------------------------------
  let ocx = 0.5 + range(r, -0.04, 0.04)
  let ocy = 0.5 + range(r, -0.04, 0.04)
  let core = 0
  if (system === 'Solar') {
    const R = range(r, 0.1, 0.17)
    bodies.push(sunBody(ocx, ocy, R))
    core = R * 1.06
  }
  else if (system === 'Binary') {
    const R1 = range(r, 0.075, 0.1)
    const R2 = R1 * range(r, 0.6, 0.95)
    const sep = R1 + R2 + range(r, 0.04, 0.07)
    const ax = r() * Math.PI
    const c = Math.cos(ax)
    const s = Math.sin(ax)
    const w1 = R2 / (R1 + R2)
    bodies.push(sunBody(ocx - c * sep * w1, ocy - s * sep * w1, R1))
    bodies.push(sunBody(ocx + c * sep * (1 - w1), ocy + s * sep * (1 - w1), R2))
    core = Math.max(sep * w1 + R1, sep * (1 - w1) + R2) * 1.04
  }
  else if (system === 'Offset') {
    const a = Math.floor(r() * 8) * TAU / 8 + range(r, -0.2, 0.2)
    const dist = range(r, 0.3, 0.42)
    ocx = 0.5 + Math.cos(a) * dist
    ocy = 0.5 + Math.sin(a) * dist
    const R = range(r, 0.2, 0.27)
    bodies.push(sunBody(ocx, ocy, R))
    core = R * 1.06
  }
  else {
    ocx = range(r, 0.3, 0.7)
    ocy = range(r, 0.3, 0.7)
    const R = range(r, 0.085, 0.12)
    bodies.push(sunBody(ocx, ocy, R))
    core = R * 1.06
  }

  const comet = sky === 'Comet' ? placeComet(cr, bodies) : undefined
  const blocked: Disc[] = cometDiscs(comet)

  // ---- planets ------------------------------------------------------------
  if (system !== 'Cluster') {
    const reach = farthest(ocx, ocy)
    const arcGap = range(r, 0.1, 0.3)
    const moonRate = range(r, 0.3, 0.6)
    let edge = core
    let tone = 0
    while (edge < reach) {
      const Rp = 0.032 + 0.068 * r() ** 1.5
      const budget = Rp * range(r, 1.5, 2.2)
      const gap = range(r, 0.012, 0.045)
      const rho = edge + gap + budget
      edge = rho + budget
      const kMax = Math.max(1, Math.floor(TAU * rho / (2 * budget + arcGap)))
      const k = Math.min(kMax, Math.max(2, Math.ceil(kMax * range(r, 0.35, 1))))
      const theta0 = r() * TAU
      const slack = (TAU * rho / k - 2 * budget) / rho
      orbits.push({ cx: ocx, cy: ocy, rho, tone })
      tone = 1 - tone
      for (let j = 0; j < k; j++) {
        const p = planet(r, Rp * range(r, 0.7, 1), moonRate, budget)
        const a = theta0 + j * TAU / k + range(r, -0.3, 0.3) * slack
        const x = ocx + Math.cos(a) * rho
        const y = ocy + Math.sin(a) * rho
        const m = p.body.sys
        const inWorld = x > WORLD_MIN - m && x < WORLD_MAX + m && y > WORLD_MIN - m && y < WORLD_MAX + m
        if (inWorld && clear(x, y, m, blocked, 0.012))
          place(bodies, p, x, y)
      }
    }
  }
  else {
    const sysDiscs: Disc[] = bodies.map(b => ({ x: b.x, y: b.y, r: b.sys }))
    const tries = 900
    for (let i = 0; i < tries; i++) {
      const t = i / tries
      const Rp = 0.075 - 0.052 * Math.sqrt(t) + range(r, -0.006, 0.006)
      const p = planet(r, Rp, 0.7, Rp * 2.4)
      const x = range(r, WORLD_MIN, WORLD_MAX)
      const y = range(r, WORLD_MIN, WORLD_MAX)
      const gap = range(r, 0.025, 0.06)
      if (!clear(x, y, p.body.sys, sysDiscs, gap) || !clear(x, y, p.body.sys, blocked, 0.012))
        continue
      sysDiscs.push({ x, y, r: p.body.sys })
      place(bodies, p, x, y)
    }
  }

  // ---- fillers: small rosettes in the leftover room -------------------------
  const fr = stream(hash, 'fill')
  const obstacles: Disc[] = bodies.filter(b => b.role !== 'moon').map(b => ({ x: b.x, y: b.y, r: b.sys }))
  for (const b of bodies) {
    if (b.role === 'moon')
      obstacles.push({ x: b.x, y: b.y, r: b.sys })
  }
  obstacles.push(...blocked)
  const bands = hasBands ? orbits : []
  const fillTries = { Quiet: 300, Starry: 600, Teeming: 1000, Comet: 550 }[sky]
  for (let i = 0; i < fillTries; i++) {
    const R = 0.008 + 0.02 * fr() ** 1.8
    const x = range(fr, WORLD_MIN, WORLD_MAX)
    const y = range(fr, WORLD_MIN, WORLD_MAX)
    if (!clear(x, y, R, obstacles, 0.022) || !offBands(x, y, R, bands, band + 0.012))
      continue
    obstacles.push({ x, y, r: R * 1.15 })
    bodies.push({ x, y, R, role: 'speck', sys: R * 1.15, moonOrbit: 0 })
  }

  // ---- sparkles -------------------------------------------------------------
  const sr = stream(hash, 'sky')
  const density = { Quiet: 70, Starry: 170, Teeming: 330, Comet: 150 }[sky]
  const area = (WORLD_MAX - WORLD_MIN) ** 2
  const n = Math.round(density * area)
  const sparkles: Sparkle[] = []
  const sparkDiscs: Disc[] = []
  for (let i = 0; i < n; i++) {
    const s = 0.0025 + 0.0075 * sr() ** 2.2
    const x = range(sr, WORLD_MIN, WORLD_MAX)
    const y = range(sr, WORLD_MIN, WORLD_MAX)
    const kind = int(sr, 0, 99)
    const rot = sr() * TAU
    if (!clear(x, y, s, obstacles, 0.008) || !offBands(x, y, s, bands, band + 0.006) || !clear(x, y, s, sparkDiscs, 0.004))
      continue
    sparkDiscs.push({ x, y, r: s })
    sparkles.push({ x, y, s, kind, rot })
  }

  return { bodies, orbits, sparkles, comet, band }
}
