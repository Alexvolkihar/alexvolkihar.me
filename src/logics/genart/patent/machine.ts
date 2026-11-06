// Assembly of an imaginary contraption, by plausible mechanical rules.
//
// Parts are placed one after another, each one attached to a part already on
// the sheet: a gear meshes with an existing gear (centre distance = sum of the
// pitch radii, same module, tooth phases interlocked), a pulley is belted to
// another pulley, a cam follower rides on a cam along a guided rod, a crank
// drives a slider or a four-bar beam. A candidate that would overlap a part it
// is not attached to is rejected and another direction is tried. The result
// is a list of draw calls (back to front), collision capsules for the label
// placer, label anchors, the gear meshes and the parts of one arbor to show
// exploded in Fig. 2. Model units: the whole machine spans one to two units.

import type { Rng } from '../random'
import type { View, Wheel } from './draw'
import type { CamKind, Pts } from './geom'
import { chance, int, pick, range } from '../random'
import { boxPts, circ, dashed, drawArrow, drawBlock, drawBolt, drawRod, drawSpiral, drawSpring, drawWheel, fs, hatch, line, poly, rodPts, sectionHatch, shadePts, sx, sy, TAU } from './draw'
import { beltTangents, camOutline, circleCircle, circlePts, escapeOutline, gearOutline, hull, offsetHull, pitchR, ratchetOutline, rollerDistance, segSegDist } from './geom'

export type Mechanism = 'Gear Train' | 'Belt Drive' | 'Cam Press' | 'Linkage' | 'Clockwork'
export type Complexity = 'Simple' | 'Compound' | 'Elaborate'

export interface Cap { ax: number, ay: number, bx: number, by: number, r: number, tag: number }
export interface Anchor { id: string, x: number, y: number }
export interface GearRef { x: number, y: number, n: number, m: number, phase: number, tag: number, wheel: Wheel }
export interface Mesh { a: GearRef, b: GearRef }

/** One part of the exploded arbor (Fig. 2), seen along its axis. */
export interface XPart { id: string, wheel: Wheel, thick: number, hubLen: number, drum?: boolean }

export interface Machine {
  items: { z: number, draw: (v: View) => void }[]
  caps: Cap[]
  anchors: Anchor[]
  meshes: Mesh[]
  explode: XPart[]
  bbox: [number, number, number, number]
}

class Build {
  items: Machine['items'] = []
  caps: Cap[] = []
  anchors: Anchor[] = []
  meshes: Mesh[] = []
  pivots: number[] = []
  /** Wheel arbors, which get their own standards when the frame is too wide for one plate. */
  arbors: number[] = []
  explode: XPart[] = []
  private t = 0
  constructor(public r: Rng) {}
  tag() {
    return ++this.t
  }

  add(z: number, draw: (v: View) => void) {
    this.items.push({ z, draw })
  }

  cap(ax: number, ay: number, bx: number, by: number, r: number, tag: number) {
    this.caps.push({ ax, ay, bx, by, r, tag })
  }

  /** True when a capsule would overlap a part other than the listed tags. */
  hits(ax: number, ay: number, bx: number, by: number, r: number, ok: number[] = [], clear = 0.025) {
    for (const c of this.caps) {
      if (c.tag === 0 || ok.includes(c.tag))
        continue
      if (segSegDist(ax, ay, bx, by, c.ax, c.ay, c.bx, c.by) < r + c.r + clear)
        return true
    }
    return false
  }

  anchor(id: string, x: number, y: number) {
    this.anchors.push({ id, x, y })
  }

  pivot(x: number, y: number) {
    this.pivots.push(x, y)
  }

  bbox(): [number, number, number, number] {
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity
    for (const c of this.caps) {
      x0 = Math.min(x0, c.ax - c.r, c.bx - c.r)
      y0 = Math.min(y0, c.ay - c.r, c.by - c.r)
      x1 = Math.max(x1, c.ax + c.r, c.bx + c.r)
      y1 = Math.max(y1, c.ay + c.r, c.by + c.r)
    }
    return [x0, y0, x1, y1]
  }
}

// --- wheels ---------------------------------------------------------------

function gearWheel(r: Rng, n: number, m: number, phase: number, solid = false): Wheel {
  const R = pitchR(n, m)
  const rRoot = R - 1.25 * m
  const hubR = Math.max(R * 0.2, m * 2.4)
  const w: Wheel = { outline: gearOutline(n, m, phase), rRoot, hubR, boreR: hubR * 0.42 }
  if (solid || n < 24)
    return w
  const k = r()
  w.rot = r() * TAU
  if (k < 0.55) {
    w.spokes = int(r, 4, 6)
    w.spokeW = rRoot * range(r, 0.055, 0.085)
    w.twist = chance(r, 0.3) ? range(r, -0.6, 0.6) : 0
  }
  else if (k < 0.82) {
    w.holes = int(r, 4, 6)
  }
  return w
}

function pulleyWheel(r: Rng, R: number, steps: number[] = []): Wheel {
  const hubR = R * range(r, 0.17, 0.22)
  return {
    outline: circlePts(R, 120),
    rRoot: R * 0.94,
    hubR,
    boreR: hubR * 0.42,
    spokes: int(r, 4, 6),
    spokeW: R * range(r, 0.045, 0.07),
    twist: chance(r, 0.35) ? range(r, -0.7, 0.7) : 0,
    rot: r() * TAU,
    rings: steps,
  }
}

function plainWheel(outline: Pts, rRoot: number, hubR: number, rings: number[] = []): Wheel {
  return { outline, rRoot, hubR, boreR: hubR * 0.42, rings }
}

/** Places a wheel: draw call, collision capsule, frame pivot. */
function putWheel(b: Build, x: number, y: number, w: Wheel, rOut: number, z: number, id: string, tag = b.tag(), hatchDir = 1) {
  b.add(z, v => drawWheel(v, x, y, w, hatchDir))
  b.cap(x, y, x, y, rOut, tag)
  b.pivot(x, y)
  b.arbors.push(x, y)
  b.anchor(id, x + Math.cos(-0.9) * (w.hubR + w.rRoot) * 0.55, y + Math.sin(-0.9) * (w.hubR + w.rRoot) * 0.55)
  return tag
}

function putGear(b: Build, x: number, y: number, n: number, m: number, phase: number, z: number, id: string, solid = false, hatchDir = 1): GearRef {
  const wheel = gearWheel(b.r, n, m, phase, solid)
  const tag = putWheel(b, x, y, wheel, pitchR(n, m) + m, z, id, b.tag(), hatchDir)
  return { x, y, n, m, phase, tag, wheel }
}

/** Centre and tooth phase of a gear of n2 teeth meshing with g at direction a. */
function meshAt(g: GearRef, n2: number, a: number) {
  const d = pitchR(g.n, g.m) + pitchR(n2, g.m)
  const p1 = TAU / g.n
  const frac = ((((a - g.phase) / p1) % 1) + 1) % 1
  return { x: g.x + Math.cos(a) * d, y: g.y + Math.sin(a) * d, phase: a + Math.PI - (TAU / n2) * (0.5 - frac) }
}

/** Directions to try, fanning out from a preferred one. */
function fan(base: number, n = 14, step = 0.32): number[] {
  const out = [base]
  for (let k = 1; k <= n; k++)
    out.push(base + k * step, base - k * step)
  return out
}

/** Adds a gear meshing with g, in a free direction near `dir`. */
function meshGear(b: Build, g: GearRef, n2: number, dir: number, z: number, id: string, ok: number[] = [], solid = false): GearRef | null {
  const r2 = pitchR(n2, g.m) + g.m
  for (const a of fan(dir)) {
    const c = meshAt(g, n2, a)
    if (b.hits(c.x, c.y, c.x, c.y, r2, [g.tag, ...ok]))
      continue
    const ng = putGear(b, c.x, c.y, n2, g.m, c.phase, z, id, solid, -1)
    b.meshes.push({ a: g, b: ng })
    return ng
  }
  return null
}

// --- shared assemblies ----------------------------------------------------

/** Hand crank on an arbor, with its dashed second position and handle path. */
function crank(b: Build, x: number, y: number, L: number, z: number, avoid: number[]) {
  let best = 0
  let bestD = -1
  for (let k = 0; k < 16; k++) {
    const a = k * TAU / 16 + 0.1
    const hx = x + Math.cos(a) * L
    const hy = y + Math.sin(a) * L
    let d = Infinity
    for (let i = 0; i < avoid.length; i += 2)
      d = Math.min(d, Math.hypot(hx - avoid[i], hy - avoid[i + 1]))
    if (d > bestD) {
      bestD = d
      best = a
    }
  }
  const a = best + range(b.r, -0.15, 0.15)
  const alt = a + range(b.r, 1.7, 2.4) * (chance(b.r, 0.5) ? 1 : -1)
  const hr = Math.max(0.03, L * 0.11)
  const arm = (ang: number) => rodPts(x, y, x + Math.cos(ang) * L, y + Math.sin(ang) * L, hr * 1.25, hr * 0.8)
  const hx = x + Math.cos(a) * L
  const hy = y + Math.sin(a) * L
  b.add(z - 0.5, (v) => {
    dashed(v, () => circ(v, x, y, L), [0.002, 0.006], v.lw * 0.6)
    dashed(v, () => poly(v, arm(alt)), [0.009, 0.006])
    dashed(v, () => circ(v, x + Math.cos(alt) * L, y + Math.sin(alt) * L, hr * 1.1), [0.009, 0.006])
  })
  b.add(z, (v) => {
    drawRod(v, arm(a))
    fs(v, () => circ(v, hx, hy, hr * 1.1))
    fs(v, () => circ(v, hx, hy, hr * 0.7), { fill: null, lw: v.lw * 0.6 })
    fs(v, () => circ(v, x, y, hr * 0.9), { fill: v.ink, stroke: null })
    drawArrow(v, x, y, L * 0.62, a + 0.5, 1.1)
  })
  b.cap(x, y, hx, hy, hr * 1.2, 0)
  b.anchor('handle', hx, hy)
  b.anchor('crank', x + Math.cos(a) * L * 0.5, y + Math.sin(a) * L * 0.5)
}

/**
 * Radial roller follower on a cam: forked roller, guided rod, return spring,
 * and a tool at the end (punch over a die, hammer over an anvil, or plunger
 * in a pump barrel). The dashed outline shows the tool at the top of its stroke.
 */
function follower(b: Build, cx: number, cy: number, cam: Pts, camR: number, dir: number, okTags: number[], z: number, k: number): boolean {
  const ux = Math.cos(dir)
  const uy = Math.sin(dir)
  const rho = camR * 0.3
  const D = rollerDistance(cam, ux, uy, rho)
  let Dmax = 0
  for (let i = 0; i < cam.length; i += 2)
    Dmax = Math.max(Dmax, Math.hypot(cam[i], cam[i + 1]))
  Dmax += rho
  const L = range(b.r, 0.55, 0.8)
  const wr = rho * 0.42
  const tool = pick(b.r, ['punch', 'hammer', 'plunger'] as const)
  const rx = cx + ux * D
  const ry = cy + uy * D
  const ex = rx + ux * L
  const ey = ry + uy * L
  const toolLen = 0.26
  if (b.hits(rx, ry, ex + ux * toolLen, ey + uy * toolLen, wr * 4.5, okTags))
    return false
  const tag = b.tag()
  b.cap(rx, ry, ex + ux * toolLen, ey + uy * toolLen, wr * 4.5, tag)
  const P = (t: number, s = 0): [number, number] => [rx + ux * t - uy * s, ry + uy * t + ux * s]
  const lift = Dmax - D
  const g1 = 0.42 * L
  const g2 = 0.78 * L
  // guides, bolted to a bracket that the frame reaches
  for (const gt of [g1, g2]) {
    const side = (gt === g1 ? 1 : -1) * (k % 2 ? -1 : 1)
    const [bx, by] = P(gt, side * wr * 7)
    b.pivot(bx, by)
  }
  const head = (off: number) => {
    const [hx, hy] = P(L + 0.045 + off)
    return boxPts(hx, hy, 0.045, wr * 3.2, dir)
  }
  b.add(z, (v) => {
    // brackets behind the rod
    for (const gt of [g1, g2]) {
      const side = (gt === g1 ? 1 : -1) * (k % 2 ? -1 : 1)
      const [ax, ay] = P(gt, side * wr * 1.5)
      const [bx, by] = P(gt, side * wr * 7)
      drawRod(v, rodPts(ax, ay, bx, by, 0.022, 0.03, false))
      drawBolt(v, bx, by, 0.022, dir)
    }
    // rod, fork, roller
    const [r0x, r0y] = P(rho * 0.9)
    drawRod(v, rodPts(r0x, r0y, ex, ey, wr, wr, false))
    const [fx, fy] = P(rho * 0.55)
    drawBlock(v, boxPts(fx, fy, rho * 0.75, rho * 0.95, dir))
    fs(v, () => circ(v, rx, ry, rho))
    shadePts(v, circlePts(rho, 32), rx, ry)
    fs(v, () => circ(v, rx, ry, rho * 0.3), { fill: v.ink, stroke: null })
    // collar and spring up to the first guide
    const [cx2, cy2] = P(0.17 * L)
    drawBlock(v, boxPts(cx2, cy2, 0.012, wr * 2.6, dir))
    const [s0x, s0y] = P(0.17 * L + 0.012)
    const [s1x, s1y] = P(g1 - 0.03)
    drawSpring(v, s0x, s0y, s1x, s1y, wr * 2.1, 7)
    for (const gt of [g1, g2]) {
      const [gx, gy] = P(gt)
      drawBlock(v, boxPts(gx, gy, 0.03, wr * 2.4, dir), -1)
    }
    // tool
    dashed(v, () => poly(v, head(lift)), [0.007, 0.005])
    if (tool === 'plunger') {
      const [bx, by] = P(L + 0.13)
      const outer = boxPts(bx, by, 0.12, wr * 3.4, dir)
      const inner = boxPts(bx - ux * 0.02, by - uy * 0.02, 0.105, wr * 1.6, dir)
      fs(v, () => poly(v, outer), { stroke: null })
      sectionHatch(v, () => {
        poly(v, outer)
        poly(v, inner)
      }, [bx - 0.2, by - 0.2, bx + 0.2, by + 0.2], 1, 'evenodd')
      fs(v, () => {
        poly(v, outer)
        poly(v, inner)
      }, { fill: null })
      shadePts(v, outer, 0, 0)
      const [px, py] = P(L + 0.04)
      fs(v, () => poly(v, boxPts(px, py, 0.05, wr * 1.5, dir)))
      const [ox, oy] = P(L + 0.2, wr * 3.4)
      const [ox2, oy2] = P(L + 0.2, wr * 6.5)
      drawRod(v, rodPts(ox, oy, ox2, oy2, wr * 0.8, wr * 0.8, false))
    }
    else {
      drawBlock(v, head(0), 1)
      const [ax, ay] = P(L + 0.09 + 0.045 + (tool === 'punch' ? 0.03 : 0.015))
      const anvil = boxPts(ax + ux * 0.05, ay + uy * 0.05, 0.05, wr * (tool === 'punch' ? 4.4 : 3.8), dir)
      if (tool === 'punch') {
        // the blank, a thin plate resting on the die
        const [px, py] = P(L + 0.09 + 0.045 + 0.012)
        fs(v, () => poly(v, boxPts(px, py, 0.008, wr * 5.2, dir)), { lw: v.lw * 0.8 })
      }
      drawBlock(v, anvil, -1, 1.4)
    }
  })
  b.anchor(`roller${k}`, rx + ux * rho * 0.2, ry + uy * rho * 0.2)
  b.anchor(`spring${k}`, ...P(0.17 * L + (g1 - 0.17 * L) / 2, wr * 1.9))
  b.anchor(`guide${k}`, ...P(g2, wr * 2.2))
  b.anchor(`tool${k}`, ...P(L + 0.06, wr * 2.6))
  return true
}

/** Crank, connecting rod, crosshead in guides and a piston in a cylinder in section. */
function crankSlider(b: Build, ox: number, oy: number, a: number, theta: number, beta: number, okTags: number[], z: number, k: number): boolean {
  const l = a * range(b.r, 3.2, 4.2)
  const ux = Math.cos(beta)
  const uy = Math.sin(beta)
  const lp = range(b.r, 0.18, 0.3)
  const ch = range(b.r, 0.075, 0.1)
  const sMin = l - a
  const sMax = l + a
  const cyl0 = sMin + lp + 0.05
  const cyl1 = sMax + lp + 0.07
  const end = cyl1 + 0.04
  if (b.hits(ox + ux * (a + 0.05), oy + uy * (a + 0.05), ox + ux * end, oy + uy * end, ch + 0.035, okTags))
    return false
  const tag = b.tag()
  b.cap(ox + ux * a, oy + uy * a, ox + ux * end, oy + uy * end, ch + 0.035, tag)
  const at = (s: number, t = 0): [number, number] => [ox + ux * s - uy * t, oy + uy * s + ux * t]
  const pose = (th: number) => {
    const px = ox + Math.cos(th) * a
    const py = oy + Math.sin(th) * a
    const pu = (px - ox) * ux + (py - oy) * uy
    const pv = -(px - ox) * uy + (py - oy) * ux
    const s = pu + Math.sqrt(l * l - pv * pv)
    return { px, py, s }
  }
  const p = pose(theta)
  const q = pose(theta + range(b.r, 2.2, 3.4))
  b.pivot(...at(cyl1))
  b.pivot(...at((sMin + sMax) / 2, ch * 1.5))
  const rodW = a * 0.16
  b.add(z, (v) => {
    // guide bars
    for (const sgn of [-1, 1]) {
      const [g0x, g0y] = at(sMin - 0.07, sgn * ch * 0.75)
      const [g1x, g1y] = at(sMax + 0.07, sgn * ch * 0.75)
      drawRod(v, rodPts(g0x, g0y, g1x, g1y, 0.012, 0.012, false))
    }
    // ghost pose
    const [qx, qy] = at(q.s)
    dashed(v, () => {
      poly(v, rodPts(q.px, q.py, qx, qy, rodW * 1.3, rodW))
      poly(v, boxPts(qx, qy, 0.04, ch * 0.6, beta))
    }, [0.008, 0.006])
    dashed(v, () => circ(v, ox, oy, a), [0.002, 0.006], v.lw * 0.6)
    // cylinder in section
    const [c0x, c0y] = at((cyl0 + cyl1) / 2)
    const outer = boxPts(c0x, c0y, (cyl1 - cyl0) / 2 + 0.03, ch + 0.03, beta)
    const inner = boxPts(c0x, c0y, (cyl1 - cyl0) / 2, ch, beta)
    fs(v, () => poly(v, outer), { stroke: null })
    sectionHatch(v, () => {
      poly(v, outer)
      poly(v, inner)
    }, [c0x - 0.6, c0y - 0.6, c0x + 0.6, c0y + 0.6], 1, 'evenodd')
    fs(v, () => {
      poly(v, outer)
      poly(v, inner)
    }, { fill: null })
    shadePts(v, outer, 0, 0)
    // ports on the cylinder
    for (const f of [0.25, 0.75]) {
      const [a0x, a0y] = at(cyl0 + (cyl1 - cyl0) * f, ch + 0.03)
      const [a1x, a1y] = at(cyl0 + (cyl1 - cyl0) * f, ch + 0.09)
      drawRod(v, rodPts(a0x, a0y, a1x, a1y, 0.022, 0.022, false))
      drawBlock(v, boxPts(a1x, a1y, 0.04, 0.012, beta))
    }
    // piston rod, piston, crosshead
    const [cx, cy] = at(p.s)
    const [pxx, pxy] = at(p.s + lp)
    drawRod(v, rodPts(cx, cy, pxx, pxy, rodW * 0.6, rodW * 0.6, false))
    drawBlock(v, boxPts(pxx, pxy, 0.03, ch * 0.98, beta), -1)
    for (const f of [-0.012, 0.012]) {
      const [lx, ly] = at(p.s + lp + f, -ch * 0.98)
      const [mx, my] = at(p.s + lp + f, ch * 0.98)
      fs(v, () => line(v, lx, ly, mx, my), { fill: null, lw: v.lw * 0.6 })
    }
    drawBlock(v, boxPts(cx, cy, 0.045, ch * 0.7, beta))
    // crank and connecting rod
    drawRod(v, rodPts(ox, oy, p.px, p.py, a * 0.32, a * 0.22), [[ox, oy, a * 0.2]])
    drawRod(v, rodPts(p.px, p.py, cx, cy, rodW * 1.4, rodW), [[p.px, p.py, rodW * 1.25], [cx, cy, rodW * 0.95]])
  })
  b.anchor(`rod${k}`, (p.px + at(p.s)[0]) / 2, (p.py + at(p.s)[1]) / 2)
  b.anchor(`crosshead${k}`, ...at(p.s, ch * 0.4))
  b.anchor(`cylinder${k}`, ...at((cyl0 + cyl1) / 2, ch + 0.015))
  b.anchor(`piston${k}`, ...at(p.s + lp, ch * 0.5))
  return true
}

/** Flywheel on an arbor: spoked, heavy rim. */
function flywheel(b: Build, x: number, y: number, R: number, z: number) {
  const w = pulleyWheel(b.r, R)
  w.rRoot = R * 0.84
  return putWheel(b, x, y, w, R, z, 'flywheel', b.tag(), 1)
}

// --- the five mechanisms --------------------------------------------------

function gearTrain(b: Build, cx: Complexity) {
  const r = b.r
  const arbors = { Simple: 2, Compound: 3, Elaborate: 4 }[cx]
  const flow = (chance(r, 0.5) ? 0 : Math.PI) + range(r, -0.5, 0.5)
  let m = 0.016
  const n0 = int(r, 11, 15)
  const p0 = putGear(b, 0, 0, n0, m, r() * TAU, 30, 'pinion0', true)
  let prev = p0
  let prevWheel = -1
  let last: GearRef = p0
  const centers = [0, 0]
  for (let i = 1; i < arbors; i++) {
    const nW = int(r, 38, 60)
    const W = meshGear(b, prev, nW, flow + range(r, -0.7, 0.7), i * 10, `wheel${i}`, prevWheel >= 0 ? [prevWheel] : [])
    if (!W)
      break
    if (i === 1)
      b.explode.push({ id: 'wheel1', wheel: W.wheel, thick: pitchR(nW, m) * 0.22, hubLen: pitchR(nW, m) * 0.12 })
    centers.push(W.x, W.y)
    last = W
    prevWheel = W.tag
    if (i < arbors - 1) {
      m *= 1.25
      const np = int(r, 11, 14)
      prev = putGear(b, W.x, W.y, np, m, r() * TAU, i * 10 + 1, `pinion${i}`, true)
      if (i === 1)
        b.explode.push({ id: `pinion${i}`, wheel: prev.wheel, thick: pitchR(np, m) * 0.6, hubLen: 0 })
    }
  }
  // drum, ratchet and pawl on the last arbor
  const R = pitchR(last.n, last.m)
  const rd = R * range(r, 0.5, 0.6)
  const drumTag = b.tag()
  b.add(80, v => drawWheel(v, last.x, last.y, plainWheel(circlePts(rd, 96), rd * 0.9, rd * 0.3, [rd * 0.9]), 1))
  const rr = rd * 0.62
  const nr = int(r, 14, 22)
  const rot = r() * TAU
  b.add(81, v => drawWheel(v, last.x, last.y, plainWheel(ratchetOutline(nr, rr, rr * 0.16, rot), rr * 0.8, rr * 0.36), -1))
  b.anchor('drum', last.x + rd * 0.95 * Math.cos(2.4), last.y + rd * 0.95 * Math.sin(2.4))
  b.anchor('ratchet', last.x + rr * 0.85 * Math.cos(-2.2), last.y + rr * 0.85 * Math.sin(-2.2))
  // pawl on the side of the flow
  const pa = flow + Math.PI + range(r, -0.6, 0.6)
  const pd = rd * 1.08
  const px = last.x + Math.cos(pa) * pd
  const py = last.y + Math.sin(pa) * pd
  const ta = pa + 0.55
  const tx = last.x + Math.cos(ta) * (rr - rr * 0.08)
  const ty = last.y + Math.sin(ta) * (rr - rr * 0.08)
  b.add(82, (v) => {
    drawRod(v, rodPts(px, py, tx, ty, rr * 0.13, rr * 0.05))
    drawBolt(v, px, py, rr * 0.11)
    const sx0 = px + Math.cos(pa + 1.4) * rr * 0.5
    const sy0 = py + Math.sin(pa + 1.4) * rr * 0.5
    fs(v, () => {
      v.g.moveTo(sx(v, sx0), sy(v, sy0))
      v.g.quadraticCurveTo(sx(v, (sx0 + tx) / 2 + Math.cos(pa) * rr * 0.3), sy(v, (sy0 + ty) / 2 + Math.sin(pa) * rr * 0.3), sx(v, (px + tx) / 2), sy(v, (py + ty) / 2))
    }, { fill: null, lw: v.lw * 1.2 })
  })
  b.anchor('pawl', (px + tx) / 2, (py + ty) / 2)
  // rope down to a weight, on the outer side
  const side = Math.cos(flow) > 0 ? 1 : -1
  const ropeX = last.x + side * rd
  const box = b.bbox()
  const hookY = box[3] + 0.12
  const wy = hookY + 0.1
  const wh = range(r, 0.09, 0.14)
  const ww = range(r, 0.07, 0.1)
  b.cap(ropeX, last.y, ropeX, wy + wh, ww, drumTag)
  b.pivot(last.x, last.y)
  b.add(83, (v) => {
    const g = v.g
    // rope: two lines with a lay of short twists
    fs(v, () => {
      line(v, ropeX - 0.009, last.y, ropeX - 0.009, hookY)
      line(v, ropeX + 0.009, last.y, ropeX + 0.009, hookY)
    }, { fill: null, lw: v.lw * 0.8 })
    g.beginPath()
    for (let y = last.y; y < hookY - 0.012; y += 0.016)
      line(v, ropeX - 0.009, y, ropeX + 0.009, y + 0.012)
    g.strokeStyle = v.ink
    g.lineWidth = v.lw * 0.5
    g.stroke()
    // hook and weight
    fs(v, () => {
      g.arc(sx(v, ropeX), sy(v, hookY + 0.03), 0.03 * v.s, -Math.PI / 2, Math.PI * 1.3)
    }, { fill: null, lw: v.lw * 1.6 })
    fs(v, () => {
      line(v, ropeX, hookY + 0.06, ropeX, wy)
    }, { fill: null, lw: v.lw * 1.3 })
    drawBlock(v, [ropeX - ww * 0.7, wy, ropeX + ww * 0.7, wy, ropeX + ww, wy + wh, ropeX - ww, wy + wh], 1, 1.3)
    fs(v, () => circ(v, ropeX, wy - 0.006, 0.012), { lw: v.lw * 0.8 })
  })
  b.anchor('rope', ropeX, (last.y + hookY) / 2)
  b.anchor('weight', ropeX + ww * 0.5, wy + wh * 0.6)
  crank(b, 0, 0, Math.max(0.22, pitchR(n0, 0.016) * 2.4), 90, centers.slice(2))
}

function beltDrive(b: Build, cx: Complexity) {
  const r = b.r
  const r0 = range(r, 0.26, 0.36)
  const steps0 = cx === 'Simple' ? [] : [r0 * 0.5]
  const P0 = pulleyWheel(r, r0, steps0)
  const t0 = putWheel(b, 0, 0, P0, r0 + 0.02, 10, 'pulley0')
  b.add(11, v => drawArrow(v, 0, 0, r0 * 0.62, -2.2, 1.0))
  const belts: [number, number, number, number, number, number, boolean][] = []
  // first driven pulley
  const r1 = range(r, 0.11, 0.17)
  const crossed = chance(r, 0.3)
  const dir1 = (chance(r, 0.5) ? 0.55 : Math.PI - 0.55) + range(r, -0.35, 0.35)
  const d1 = range(r, 1.05, 1.4)
  let x1 = 0
  let y1 = 0
  let placed = false
  for (const a of fan(dir1, 8, 0.2)) {
    x1 = Math.cos(a) * d1
    y1 = Math.sin(a) * d1
    if (!b.hits(x1, y1, x1, y1, r1 + 0.02, [t0])) {
      placed = true
      break
    }
  }
  if (!placed) {
    x1 = d1
    y1 = 0.3
  }
  const P1 = pulleyWheel(r, r1, [r1 * 0.78])
  const t1 = putWheel(b, x1, y1, P1, r1 + 0.02, 20, 'pulley1')
  belts.push([0, 0, r0, x1, y1, r1, crossed])
  const m = 0.014
  const np = int(r, 11, 14)
  const pin = putGear(b, x1, y1, np, m, r() * TAU, 21, 'pinion', true)
  b.explode.push({ id: 'pulley1', wheel: P1, thick: r1 * 0.9, hubLen: r1 * 0.3 })
  b.explode.push({ id: 'pinion', wheel: pin.wheel, thick: pitchR(np, m) * 0.7, hubLen: 0 })
  const away = Math.atan2(y1, x1)
  const G = meshGear(b, pin, int(r, 32, 52), away + range(r, -0.9, 0.9), 40, 'gear', [t1])
  if (G) {
    // the tool, behind its gear
    const tool = pick(r, ['saw', 'grindstone', 'fan'] as const)
    const RG = pitchR(G.n, G.m)
    const Rt = RG * range(r, 1.25, 1.6)
    if (!b.hits(G.x, G.y, G.x, G.y, Rt, [G.tag, pin.tag, t1])) {
      b.cap(G.x, G.y, G.x, G.y, Rt, b.tag())
      const nt = int(r, 40, 64)
      const blades = int(r, 4, 6)
      const twist = range(r, 0.5, 0.9)
      b.add(35, (v) => {
        if (tool === 'saw') {
          const out = ratchetOutline(nt, Rt, Rt * 0.07, 0, -1)
          drawWheel(v, G.x, G.y, plainWheel(out, Rt * 0.9, RG * 0.3, [Rt * 0.55]), 1)
        }
        else if (tool === 'grindstone') {
          drawWheel(v, G.x, G.y, plainWheel(circlePts(Rt, 120), Rt * 0.95, RG * 0.3), 1)
          const ring = () => {
            circ(v, G.x, G.y, Rt * 0.97)
            circ(v, G.x, G.y, RG * 1.1)
          }
          hatch(v, ring, G.x - Rt, G.y - Rt, G.x + Rt, G.y + Rt, 0.3, 0.004, { rule: 'evenodd', lw: v.lw * 0.3 })
          hatch(v, ring, G.x - Rt, G.y - Rt, G.x + Rt, G.y + Rt, -1.1, 0.0055, { rule: 'evenodd', lw: v.lw * 0.3 })
        }
        else {
          for (let i = 0; i < blades; i++) {
            const a0 = i * TAU / blades
            const p: Pts = []
            for (let k = 0; k <= 12; k++) {
              const t = k / 12
              const rr = RG * 0.4 + (Rt - RG * 0.4) * t
              p.push(G.x + rr * Math.cos(a0 + twist * t), G.y + rr * Math.sin(a0 + twist * t))
            }
            for (let k = 12; k >= 0; k--) {
              const t = k / 12
              const rr = RG * 0.4 + (Rt - RG * 0.4) * t
              const wdt = 0.35 + 0.25 * Math.sin(Math.PI * t)
              p.push(G.x + rr * Math.cos(a0 + twist * t + wdt), G.y + rr * Math.sin(a0 + twist * t + wdt))
            }
            fs(v, () => poly(v, p))
            sectionHatch(v, () => poly(v, p), [G.x - Rt, G.y - Rt, G.x + Rt, G.y + Rt], i % 2 ? 1 : -1)
            shadePts(v, p, 0, 0)
          }
        }
      })
      b.anchor(tool, G.x + Math.cos(-0.4) * Rt * 0.92, G.y + Math.sin(-0.4) * Rt * 0.92)
    }
    if (cx === 'Elaborate') {
      const G2 = meshGear(b, G, int(r, 24, 40), away + range(r, -1, 1), 41, 'gear2')
      if (G2) {
        const kind = pick(r, ['lobe', 'heart', 'eccentric'] as const)
        const R2 = pitchR(G2.n, G2.m)
        const rot = r() * TAU
        const cam = camOutline(kind, R2 * 0.45, R2 * 0.32, rot)
        b.add(42, v => drawWheel(v, G2.x, G2.y, plainWheel(cam, R2 * 0.6, R2 * 0.18), 1))
        b.anchor('cam', G2.x + cam[0] * 0.8, G2.y + cam[1] * 0.8)
        const base = Math.atan2(G2.y - G.y, G2.x - G.x)
        for (const a of fan(base, 6, 0.4)) {
          if (follower(b, G2.x, G2.y, cam, R2 * 0.6, a, [G2.tag], 43, 0))
            break
        }
      }
    }
  }
  if (cx !== 'Simple') {
    // second belt from the small step of the line pulley to a crank pulley
    const r2 = range(r, 0.13, 0.2)
    const dir2 = Math.atan2(y1, x1) + (chance(r, 0.5) ? 1 : -1) * range(r, 1.2, 2.2)
    const d2 = range(r, 0.85, 1.2)
    for (const a of fan(dir2, 8, 0.25)) {
      const x2 = Math.cos(a) * d2
      const y2 = Math.sin(a) * d2
      if (b.hits(x2, y2, x2, y2, r2 + 0.03, [t0]))
        continue
      const t2 = putWheel(b, x2, y2, pulleyWheel(r, r2), r2 + 0.02, 22, 'pulley2')
      belts.push([0, 0, r0 * 0.5, x2, y2, r2, false])
      const beta = Math.atan2(y2, x2) + range(r, -0.5, 0.5)
      crankSlider(b, x2, y2, r2 * 0.7, r() * TAU, beta, [t2], 50, 1)
      break
    }
  }
  // belts last: they run over the rims
  for (const [ax, ay, ra, bx, by, rb, cr] of belts) {
    const bt = beltTangents(ax, ay, ra, bx, by, rb, cr)
    if (!bt)
      continue
    b.cap(bt.a1[0], bt.a1[1], bt.a2[0], bt.a2[1], 0.012, 0)
    b.cap(bt.b1[0], bt.b1[1], bt.b2[0], bt.b2[1], 0.012, 0)
    b.anchor('belt', (bt.a1[0] * 0.4 + bt.a2[0] * 0.6), (bt.a1[1] * 0.4 + bt.a2[1] * 0.6))
    const th = 0.012
    b.add(60, (v) => {
      const g = v.g
      const strand = (build: () => void) => {
        g.lineCap = 'butt'
        g.beginPath()
        build()
        g.strokeStyle = v.ink
        g.lineWidth = th * 2 * v.s + v.lw * 2
        g.stroke()
        g.strokeStyle = v.bg
        g.lineWidth = Math.max(0.5, th * 2 * v.s - v.lw * 0.2)
        g.stroke()
        g.lineCap = 'round'
      }
      const off = (x: number, y: number, cx0: number, cy0: number, sgn = 1): [number, number] => {
        const d = Math.hypot(x - cx0, y - cy0)
        return [x + sgn * (x - cx0) / d * th, y + sgn * (y - cy0) / d * th]
      }
      const a1 = off(bt.a1[0], bt.a1[1], ax, ay)
      const a2 = off(bt.a2[0], bt.a2[1], bx, by)
      const b1 = off(bt.b1[0], bt.b1[1], ax, ay)
      const b2 = off(bt.b2[0], bt.b2[1], bx, by)
      const wrap = (x: number, y: number, rr: number, f: number, t: number) => {
        let e = t
        while (e < f)
          e += TAU
        g.moveTo(sx(v, x + Math.cos(f) * (rr + th)), sy(v, y + Math.sin(f) * (rr + th)))
        g.arc(sx(v, x), sy(v, y), (rr + th) * v.s, f, e)
      }
      strand(() => wrap(bx, by, rb, bt.arc2[0], bt.arc2[1]))
      strand(() => wrap(ax, ay, ra, bt.arc1[0], bt.arc1[1]))
      strand(() => line(v, b2[0], b2[1], b1[0], b1[1]))
      strand(() => line(v, a1[0], a1[1], a2[0], a2[1]))
    })
  }
}

function camPress(b: Build, cx: Complexity) {
  const r = b.r
  const RF = range(r, 0.34, 0.44)
  const fw = flywheel(b, 0, 0, RF, 10)
  const knobA = r() * TAU
  b.add(12, (v) => {
    const kx = Math.cos(knobA) * RF * 0.86
    const ky = Math.sin(knobA) * RF * 0.86
    fs(v, () => circ(v, kx, ky, RF * 0.07))
    fs(v, () => circ(v, kx, ky, RF * 0.04), { fill: null })
    drawArrow(v, 0, 0, RF * 1.15, knobA + 0.3, 0.9)
  })
  const m = 0.018
  const np = int(r, 11, 14)
  const pin = putGear(b, 0, 0, np, m, r() * TAU, 11, 'pinion', true)
  const dir = (chance(r, 0.5) ? 0 : Math.PI) + range(r, -0.5, 0.5)
  const G = meshGear(b, pin, int(r, 30, 44), dir, 20, 'gear', [fw])
  if (!G)
    return
  const RG = pitchR(G.n, G.m)
  const kind: CamKind = pick(r, ['lobe', 'heart', 'eccentric', 'double'] as const)
  const r0 = RG * 0.42
  const h = RG * 0.3
  const rot = r() * TAU
  const cam = camOutline(kind, r0, h, rot)
  const camW = plainWheel(cam, r0 * 0.85, r0 * 0.38)
  b.add(21, v => drawWheel(v, G.x, G.y, camW, 1))
  b.anchor('cam', G.x + cam[0] * 0.7, G.y + cam[1] * 0.7)
  b.explode.push({ id: 'gear', wheel: G.wheel, thick: RG * 0.2, hubLen: RG * 0.1 })
  b.explode.push({ id: 'cam', wheel: camW, thick: RG * 0.25, hubLen: RG * 0.12 })
  const followers = { Simple: 1, Compound: 2, Elaborate: 3 }[cx]
  const ok = [G.tag, pin.tag]
  const up = -Math.PI / 2
  const outward = Math.atan2(G.y, G.x)
  const cands = [up, up + 0.45 * Math.sign(Math.cos(outward)), outward, up - 0.45 * Math.sign(Math.cos(outward)), Math.PI / 2, outward + 0.8, outward - 0.8]
  let k = 0
  for (const a of cands) {
    if (k >= Math.min(followers, 2))
      break
    if (follower(b, G.x, G.y, cam, r0 + h, a + range(r, -0.1, 0.1), ok, 30 + k, k))
      k++
  }
  if (followers === 3 || k === 0) {
    // a second camshaft, geared 1:1 to the first
    const G2 = meshGear(b, G, G.n, outward + range(r, -0.8, 0.8), 22, 'gear2', [pin.tag])
    if (G2) {
      const kind2: CamKind = pick(r, ['lobe', 'heart', 'eccentric', 'double'] as const)
      const cam2 = camOutline(kind2, r0, h, r() * TAU)
      b.add(23, v => drawWheel(v, G2.x, G2.y, plainWheel(cam2, r0 * 0.85, r0 * 0.38), -1))
      b.anchor('cam2', G2.x + cam2[0] * 0.7, G2.y + cam2[1] * 0.7)
      const out2 = Math.atan2(G2.y - G.y, G2.x - G.x)
      for (const a of [up, out2, up + 0.5, up - 0.5, Math.PI / 2]) {
        if (follower(b, G2.x, G2.y, cam2, r0 + h, a, [G2.tag], 33, 2))
          break
      }
    }
  }
}

function linkage(b: Build, cx: Complexity) {
  const r = b.r
  const RF = range(r, 0.3, 0.4)
  const fw = flywheel(b, 0, 0, RF, 10)
  b.add(11, v => drawArrow(v, 0, 0, RF * 1.12, -2.4, 0.9))
  const beam = cx === 'Elaborate' || (cx === 'Compound' && chance(r, 0.55))
  const m = 0.016
  const np = int(r, 12, 15)
  const pin = putGear(b, 0, 0, np, m, r() * TAU, 12, 'pinion', true)
  b.explode.push({ id: 'flywheel', wheel: pulleyWheel(r, RF), thick: RF * 0.22, hubLen: RF * 0.15 })
  b.explode.push({ id: 'pinion', wheel: pin.wheel, thick: pitchR(np, m) * 0.7, hubLen: 0 })
  let crankOk = false
  if (beam) {
    // four-bar crank-rocker driving a walking beam and a pump
    for (let tries = 0; tries < 30 && !crankOk; tries++) {
      const d = range(r, 0.85, 1.15)
      const gam = -Math.PI / 2 + range(r, -0.55, 0.55)
      const O4x = Math.cos(gam) * d
      const O4y = Math.sin(gam) * d
      const a = range(r, 0.12, 0.17)
      const bl = d * range(r, 0.75, 1.05)
      const c = d * range(r, 0.45, 0.7)
      const branch = chance(r, 0.5) ? 1 : -1
      const sol: ([number, number] | null)[] = []
      let ok = true
      for (let i = 0; i < 72 && ok; i++) {
        const th = i * TAU / 72
        const s = circleCircle(Math.cos(th) * a, Math.sin(th) * a, bl, O4x, O4y, c, branch)
        sol.push(s)
        if (!s)
          ok = false
      }
      if (!ok)
        continue
      const i0 = int(r, 0, 71)
      const i1 = (i0 + int(r, 24, 48)) % 72
      const A = [Math.cos(i0 * TAU / 72) * a, Math.sin(i0 * TAU / 72) * a]
      const B = sol[i0]!
      const B1 = sol[i1]!
      const c2 = c * range(r, 0.9, 1.3)
      const E = (bb: [number, number]) => {
        const l = Math.hypot(O4x - bb[0], O4y - bb[1])
        return [O4x + (O4x - bb[0]) / l * c2, O4y + (O4y - bb[1]) / l * c2] as [number, number]
      }
      const E0 = E(B)
      let exMean = 0
      for (const s of sol)
        exMean += E(s!)[0] / 72
      const pumpY = Math.max(E0[1], O4y) + range(r, 0.45, 0.65)
      if (b.hits(E0[0], E0[1], exMean, pumpY + 0.15, 0.1, [fw]))
        continue
      if (b.hits(O4x, O4y, O4x, O4y, 0.08, [fw]))
        continue
      crankOk = true
      const tag = b.tag()
      b.cap(B[0], B[1], E0[0], E0[1], 0.06, tag)
      b.cap(E0[0], E0[1], exMean, pumpY + 0.15, 0.1, tag)
      b.cap(A[0], A[1], B[0], B[1], 0.03, tag)
      b.pivot(O4x, O4y)
      b.pivot(exMean, pumpY + 0.1)
      const off = range(r, -0.15, 0.15) * bl
      const tt = range(r, 0.35, 0.7)
      const trace: number[] = []
      for (let i = 0; i < 72; i++) {
        const th = i * TAU / 72
        const ax = Math.cos(th) * a
        const ay = Math.sin(th) * a
        const s = sol[i]!
        const l = Math.hypot(s[0] - ax, s[1] - ay)
        trace.push(ax + (s[0] - ax) * tt - (s[1] - ay) / l * off, ay + (s[1] - ay) * tt + (s[0] - ax) / l * off)
      }
      const beamPts = (bb: [number, number]) => {
        const e = E(bb)
        const ang = Math.atan2(e[1] - bb[1], e[0] - bb[0])
        const len = Math.hypot(e[0] - bb[0], e[1] - bb[1])
        const p: Pts = []
        // fish-bellied beam, deepest at the pivot
        const piv = c / len
        for (let k = 0; k <= 20; k++) {
          const t = k / 20
          const dpt = 0.025 + 0.045 * (t < piv ? t / piv : (1 - t) / (1 - piv))
          p.push(bb[0] + Math.cos(ang) * len * t - Math.sin(ang) * dpt, bb[1] + Math.sin(ang) * len * t + Math.cos(ang) * dpt)
        }
        for (let k = 20; k >= 0; k--) {
          const t = k / 20
          const dpt = 0.025 + 0.022 * (t < piv ? t / piv : (1 - t) / (1 - piv))
          p.push(bb[0] + Math.cos(ang) * len * t + Math.sin(ang) * dpt, bb[1] + Math.sin(ang) * len * t - Math.cos(ang) * dpt)
        }
        return p
      }
      const barrelH = 0.22
      const plY = (e: [number, number]) => e[1] + Math.sqrt(Math.max(0, (pumpY - E0[1]) ** 2 - (e[0] - exMean) ** 2))
      b.add(40, (v) => {
        // column under the beam pivot
        drawBlock(v, [O4x - 0.03, O4y, O4x + 0.03, O4y, O4x + 0.05, O4y + 0.32, O4x - 0.05, O4y + 0.32], -1, 0.7)
        // dotted coupler curve and the ghost of the beam
        v.g.setLineDash([0.0012 * v.S, 0.005 * v.S])
        fs(v, () => poly(v, trace), { fill: null, lw: v.lw * 0.9, stroke: v.accent })
        v.g.setLineDash([])
        dashed(v, () => poly(v, beamPts(B1)), [0.008, 0.006])
        dashed(v, () => circ(v, 0, 0, a), [0.002, 0.006], v.lw * 0.6)
        // pump barrel in section
        const top = pumpY - barrelH * 0.35
        const outer = boxPts(exMean, top + barrelH / 2, 0.075, barrelH / 2)
        const inner = boxPts(exMean, top + barrelH / 2 - 0.02, 0.05, barrelH / 2)
        fs(v, () => poly(v, outer), { stroke: null })
        sectionHatch(v, () => {
          poly(v, outer)
          poly(v, inner)
        }, [exMean - 0.1, top - 0.05, exMean + 0.1, top + barrelH + 0.05], 1, 'evenodd')
        fs(v, () => {
          poly(v, outer)
          poly(v, inner)
        }, { fill: null })
        shadePts(v, outer, 0, 0)
        drawRod(v, rodPts(exMean + 0.075, top + barrelH * 0.75, exMean + 0.17, top + barrelH * 0.75, 0.018, 0.018, false))
        const e = E0
        const pl = plY(e)
        drawRod(v, rodPts(e[0], e[1], exMean, pl, 0.012, 0.012), [[e[0], e[1], 0.018]])
        drawBlock(v, boxPts(exMean, pl, 0.048, 0.022), -1)
        // beam, coupler, crank
        drawBlock(v, beamPts(B), 1, 0.8)
        drawBolt(v, O4x, O4y, 0.03)
        drawRod(v, rodPts(A[0], A[1], B[0], B[1], 0.02, 0.016), [[A[0], A[1], 0.026], [B[0], B[1], 0.02]])
        drawRod(v, rodPts(0, 0, A[0], A[1], 0.045, 0.03), [[0, 0, 0.03]])
      })
      b.anchor('beam', O4x + (E0[0] - O4x) * 0.5, O4y + (E0[1] - O4y) * 0.5)
      b.anchor('coupler', (A[0] + B[0]) / 2, (A[1] + B[1]) / 2)
      b.anchor('column', O4x, O4y + 0.2)
      b.anchor('pump', exMean + 0.06, pumpY + 0.05)
      b.anchor('trace', trace[18], trace[19])
    }
  }
  if (!crankOk) {
    const beta = (chance(r, 0.5) ? 0 : Math.PI) + (chance(r, 0.3) ? range(r, -0.6, 0.6) : 0)
    for (const bb of fan(beta, 6, 0.4)) {
      if (crankSlider(b, 0, 0, range(r, 0.12, 0.16), r() * TAU, bb, [fw, pin.tag], 40, 0)) {
        crankOk = true
        break
      }
    }
  }
  // a geared second shaft: an eccentric driving a second slider
  const G = meshGear(b, pin, int(r, 28, 44), Math.PI / 2 + range(r, -1.2, 1.2), 20, 'gear', [fw])
  if (G && cx !== 'Simple') {
    const RG = pitchR(G.n, G.m)
    const beta = Math.atan2(G.y, G.x) + range(r, -0.6, 0.6)
    for (const bb of fan(beta, 5, 0.45)) {
      if (crankSlider(b, G.x, G.y, RG * 0.45, r() * TAU, bb, [G.tag, fw], 45, 1))
        break
    }
  }
}

function clockwork(b: Build, cx: Complexity) {
  const r = b.r
  const arbors = { Simple: 2, Compound: 3, Elaborate: 4 }[cx]
  const flow = -Math.PI / 2 + (chance(r, 0.5) ? 1 : -1) * range(r, 0.45, 1.05)
  let m = 0.0115
  const nB = int(r, 64, 80)
  const barrel = putGear(b, 0, 0, nB, m, r() * TAU, 10, 'barrel', true)
  const RB = pitchR(nB, m)
  const spiralRot = r() * TAU
  b.add(11, (v) => {
    fs(v, () => circ(v, 0, 0, RB * 0.8), { fill: null, lw: v.lw * 0.8 })
    drawSpiral(v, 0, 0, RB * 0.25, RB * 0.76, 6.5, spiralRot, v.lw * 0.75)
  })
  const rr = RB * 0.32
  const ratchetW = plainWheel(ratchetOutline(int(r, 16, 22), rr, rr * 0.17, r() * TAU), rr * 0.8, rr * 0.4)
  b.add(12, v => drawWheel(v, 0, 0, ratchetW, -1))
  const ca = flow + Math.PI + range(r, -0.5, 0.5)
  b.add(13, (v) => {
    const px = Math.cos(ca) * rr * 1.5
    const py = Math.sin(ca) * rr * 1.5
    const tx = Math.cos(ca + 0.5) * rr * 0.92
    const ty = Math.sin(ca + 0.5) * rr * 0.92
    drawRod(v, rodPts(px, py, tx, ty, rr * 0.12, rr * 0.05))
    drawBolt(v, px, py, rr * 0.1)
  })
  b.anchor('mainspring', Math.cos(flow + 2) * RB * 0.6, Math.sin(flow + 2) * RB * 0.6)
  b.anchor('click', Math.cos(ca) * rr * 1.2, Math.sin(ca) * rr * 1.2)
  b.explode.push({ id: 'barrel', wheel: barrel.wheel, thick: RB * 0.35, hubLen: RB * 0.08, drum: true })
  b.explode.push({ id: 'ratchet', wheel: ratchetW, thick: rr * 0.3, hubLen: 0 })
  let prev = barrel
  let prevWheel = -1
  let esc: { x: number, y: number, R: number } | null = null
  for (let i = 1; i <= arbors; i++) {
    const np = int(r, 10, 12)
    const isEsc = i === arbors
    const c = (() => {
      for (const a of fan(flow + range(r, -0.5, 0.5), 10, 0.25)) {
        const p = meshAt(prev, np, a)
        const Rw = isEsc ? 0.2 : pitchR(60, m * 0.85)
        if (b.hits(p.x, p.y, p.x, p.y, Rw, [prev.tag, ...(prevWheel >= 0 ? [prevWheel] : [])]))
          continue
        if (prevWheel >= 0 && b.hits(p.x, p.y, p.x, p.y, 0.03, [prev.tag]))
          continue
        return { ...p, a }
      }
      return null
    })()
    if (!c)
      break
    const ptag = b.tag()
    const pin = { x: c.x, y: c.y, n: np, m: prev.m, phase: c.phase, tag: ptag, wheel: gearWheel(r, np, prev.m, c.phase, true) }
    b.meshes.push({ a: prev, b: pin })
    const z = 20 + i * 10
    if (isEsc) {
      const R = range(r, 0.17, 0.22)
      const ne = int(r, 20, 30)
      const ew = gearWheel(r, 30, R / 15, 0)
      ew.outline = escapeOutline(ne, R, R * 0.28, r() * TAU)
      ew.rRoot = R * 0.7
      putWheel(b, c.x, c.y, ew, R, z, 'escape')
      esc = { x: c.x, y: c.y, R }
    }
    else {
      m *= 0.85
      const nw = int(r, 54, 72)
      const W = putGear(b, c.x, c.y, nw, m, r() * TAU, z, `wheel${i}`)
      prev = W
      prevWheel = W.tag
    }
    b.add(z + 1, v => drawWheel(v, c.x, c.y, pin.wheel, -1))
    b.cap(c.x, c.y, c.x, c.y, pitchR(np, pin.m) + pin.m, ptag)
  }
  if (!esc)
    return
  const { x: ex, y: ey, R } = esc
  // anchor (pallets) above the escape wheel, pendulum hanging from its arbor
  const Pa = [ex, ey - R * 1.5]
  const span = range(r, 0.5, 0.7)
  const pal = [-1, 1].map((s) => {
    const a = -Math.PI / 2 + s * span
    return [ex + Math.cos(a) * R * 0.97, ey + Math.sin(a) * R * 0.97, a] as const
  })
  b.cap(Pa[0], Pa[1], Pa[0], Pa[1], R * 0.5, 0)
  const box = b.bbox()
  const Lp = box[3] - Pa[1] + range(r, 0.3, 0.5)
  const bobR = range(r, 0.08, 0.12)
  const swing = range(r, 0.07, 0.11)
  const tilt = range(r, -0.6, 0.6) * swing
  const bob = (ang: number) => [Pa[0] + Math.sin(ang) * Lp, Pa[1] + Math.cos(ang) * Lp] as const
  const [bx, by] = bob(tilt)
  b.cap(Pa[0], Pa[1], bx, by, bobR, 0)
  b.cap(...bob(-swing), ...bob(swing), bobR, 0)
  b.pivot(Pa[0], Pa[1])
  b.add(5, (v) => {
    for (const s of [-swing, swing]) {
      const [gx, gy] = bob(s)
      dashed(v, () => {
        line(v, Pa[0], Pa[1], gx, gy)
        circ(v, gx, gy, bobR)
      }, [0.008, 0.006])
    }
    v.g.setLineDash([0.0012 * v.S, 0.005 * v.S])
    fs(v, () => {
      v.g.arc(sx(v, Pa[0]), sy(v, Pa[1]), Lp * v.s, Math.PI / 2 - swing * 1.3, Math.PI / 2 + swing * 1.3)
    }, { fill: null, lw: v.lw * 0.9, stroke: v.accent })
    v.g.setLineDash([])
    drawRod(v, rodPts(Pa[0], Pa[1], bx, by, 0.009, 0.009, false))
    const lens: Pts = []
    for (let k = 0; k < 40; k++) {
      const t = k * TAU / 40
      lens.push(bx + Math.cos(t) * bobR, by + Math.sin(t) * bobR * 0.8)
    }
    drawBlock(v, lens, 1, 1.2)
    fs(v, () => circ(v, bx, by, bobR * 0.18), { fill: v.ink, stroke: null })
  })
  b.add(90, (v) => {
    for (const [px, py, a] of pal) {
      drawRod(v, rodPts(Pa[0], Pa[1], px - Math.cos(a) * R * 0.08, py - Math.sin(a) * R * 0.08, R * 0.09, R * 0.06))
      drawBlock(v, boxPts(px - Math.cos(a) * R * 0.02, py - Math.sin(a) * R * 0.02, R * 0.07, R * 0.035, a + 0.35), -1)
    }
    drawBolt(v, Pa[0], Pa[1], R * 0.12)
  })
  b.anchor('anchor', Pa[0] + R * 0.5, Pa[1] + R * 0.3)
  b.anchor('pendulum', Pa[0] + Math.sin(tilt) * Lp * 0.7, Pa[1] + Math.cos(tilt) * Lp * 0.7)
  b.anchor('bob', bx + bobR * 0.5, by)
}

// --- frame -----------------------------------------------------------------

/** Cast frame plate behind the arbors, legs to a hatched ground line. */
function frame(b: Build) {
  const box = b.bbox()
  let reach = 0
  const A = b.arbors
  for (let i = 0; i < A.length; i += 2) {
    for (let j = i + 2; j < A.length; j += 2)
      reach = Math.max(reach, Math.hypot(A[i] - A[j], A[i + 1] - A[j + 1]))
  }
  if (reach > 1.3)
    return standards(b, box)
  const h = hull(b.pivots)
  const plate = offsetHull(h, 0.075)
  const n = h.length / 2
  const bolts: number[] = []
  for (let i = 0; i < (n > 1 ? n : 0); i++) {
    const ax = h[i * 2]
    const ay = h[i * 2 + 1]
    const bx2 = h[((i + 1) % n) * 2]
    const by2 = h[((i + 1) % n) * 2 + 1]
    const len = Math.hypot(bx2 - ax, by2 - ay)
    if (len < 0.25)
      continue
    const nx = (by2 - ay) / len
    const ny = -(bx2 - ax) / len
    bolts.push((ax + bx2) / 2 + nx * 0.04, (ay + by2) / 2 + ny * 0.04)
  }
  // legs from the outermost low pivots
  let li = 0
  let ri = 0
  for (let i = 0; i < b.pivots.length; i += 2) {
    if (b.pivots[i] - b.pivots[i + 1] * 0.3 < b.pivots[li] - b.pivots[li + 1] * 0.3)
      li = i
    if (b.pivots[i] + b.pivots[i + 1] * 0.3 > b.pivots[ri] + b.pivots[ri + 1] * 0.3)
      ri = i
  }
  const ground = box[3] + 0.05
  let lx = b.pivots[li]
  let ly = b.pivots[li + 1]
  let rx = b.pivots[ri]
  let ry = b.pivots[ri + 1]
  if (rx - lx < 0.3) {
    lx = (lx + rx) / 2 - 0.15
    rx = lx + 0.3
    ly = ry = Math.min(ly, ry)
  }
  const spread = (ground - Math.min(ly, ry)) * 0.18
  const legs = [[lx, ly, lx - spread], [rx, ry, rx + spread]]
  const gx0 = Math.min(box[0], lx - spread) - 0.12
  const gx1 = Math.max(box[2], rx + spread) + 0.12
  for (const [tx, ty, fx] of legs)
    b.cap(tx, ty, fx, ground, 0.05, 0)
  b.cap(gx0, ground, gx1, ground, 0.03, 0)
  b.add(-10, (v) => {
    for (const [tx, ty, fx] of legs) {
      const leg = [tx - 0.035, ty, tx + 0.035, ty, fx + 0.055, ground - 0.03, fx - 0.055, ground - 0.03]
      drawBlock(v, leg, 1, 0.6)
      drawBlock(v, boxPts(fx, ground - 0.015, 0.1, 0.015), -1)
      drawBolt(v, fx - 0.065, ground - 0.042, 0.016)
      drawBolt(v, fx + 0.065, ground - 0.042, 0.016)
    }
    fs(v, () => poly(v, plate), { stroke: null })
    // the plate stays light so the moving parts read in front of it
    if (v.shading !== 'Outline')
      hatch(v, () => poly(v, plate), box[0] - 0.2, box[1] - 0.2, box[2] + 0.2, box[3] + 0.2, -Math.PI / 4, v.shading === 'Hatched' ? 0.018 : 0.011, { lw: v.lw * 0.3 })
    fs(v, () => poly(v, plate), { fill: null })
    shadePts(v, plate, 0, 0)
    for (let i = 0; i < bolts.length; i += 2)
      drawBolt(v, bolts[i], bolts[i + 1], 0.017, 0.3)
    groundLine(v, gx0, gx1, ground)
  })
  b.anchor('frame', plate[0], plate[1])
  b.anchor('ground', gx1 - 0.1, ground)
}

/** One cast standard per arbor, down to a common ground line. */
function standards(b: Build, box: [number, number, number, number]) {
  const ground = box[3] + 0.05
  const tops: number[] = []
  for (let i = 0; i < b.arbors.length; i += 2) {
    const x = b.arbors[i]
    const y = b.arbors[i + 1]
    let dup = false
    for (let j = 0; j < tops.length; j += 2) {
      if (Math.abs(tops[j] - x) < 0.14)
        dup = true
    }
    if (!dup && ground - y > 0.12)
      tops.push(x, y)
  }
  let gx0 = box[0]
  let gx1 = box[2]
  for (let j = 0; j < tops.length; j += 2) {
    gx0 = Math.min(gx0, tops[j] - 0.2)
    gx1 = Math.max(gx1, tops[j] + 0.2)
    b.cap(tops[j], tops[j + 1], tops[j], ground, 0.05, 0)
  }
  gx0 -= 0.08
  gx1 += 0.08
  b.cap(gx0, ground, gx1, ground, 0.03, 0)
  b.add(-10, (v) => {
    for (let j = 0; j < tops.length; j += 2) {
      const x = tops[j]
      const y = tops[j + 1]
      const w0 = 0.04
      const w1 = 0.045 + (ground - y) * 0.035
      drawBlock(v, [x - w0, y, x + w0, y, x + w1, ground - 0.03, x - w1, ground - 0.03], 1, 0.6)
      drawBlock(v, boxPts(x, y, 0.07, 0.055), -1)
      drawBolt(v, x - 0.045, y + 0.035, 0.013)
      drawBolt(v, x + 0.045, y + 0.035, 0.013)
      drawBlock(v, boxPts(x, ground - 0.015, w1 + 0.05, 0.015), -1)
      drawBolt(v, x - w1 - 0.02, ground - 0.042, 0.016)
      drawBolt(v, x + w1 + 0.02, ground - 0.042, 0.016)
    }
    groundLine(v, gx0, gx1, ground)
  })
  b.anchor('frame', tops[0], (tops[1] + ground) / 2)
  b.anchor('ground', gx1 - 0.1, ground)
}

function groundLine(v: View, gx0: number, gx1: number, ground: number) {
  fs(v, () => line(v, gx0, ground, gx1, ground), { fill: null, lw: v.lw * 1.4 })
  const g = v.g
  g.beginPath()
  const step = 0.006 * v.S
  const depth = 0.012 * v.S
  for (let x = sx(v, gx0); x < sx(v, gx1) - depth; x += step) {
    g.moveTo(x + depth, sy(v, ground))
    g.lineTo(x, sy(v, ground) + depth)
  }
  g.strokeStyle = v.ink
  g.lineWidth = v.lw * 0.5
  g.stroke()
}

export function buildMachine(r: Rng, mech: Mechanism, cx: Complexity): Machine {
  const b = new Build(r)
  if (mech === 'Gear Train')
    gearTrain(b, cx)
  else if (mech === 'Belt Drive')
    beltDrive(b, cx)
  else if (mech === 'Cam Press')
    camPress(b, cx)
  else if (mech === 'Linkage')
    linkage(b, cx)
  else
    clockwork(b, cx)
  frame(b)
  b.items.sort((p, q) => p.z - q.z)
  return { items: b.items, caps: b.caps, anchors: b.anchors, meshes: b.meshes, explode: b.explode, bbox: b.bbox() }
}
