// Procedural grayscale subjects, computed on the dither grid. No image is
// loaded: every scene is built from the hash, then evaluated once per cell.
//
// Screen coordinates are in short sides: the short side spans [-0.5, 0.5]
// around the centre and a wider (or taller) canvas shows more of the same
// world instead of a stretched one.

import type { Rng } from '../random'
import type { Scene3, Sdf } from './raymarch'
import { chance, int, pick, range } from '../random'
import { fbm, valueNoise } from './noise'
import { renderScene } from './raymarch'

/** Euclidean length of 2 or 3 numbers (Math.hypot is slow in hot loops). */
function len(x: number, y: number, z = 0) {
  return Math.sqrt(x * x + y * y + z * z)
}

export type SceneFn = (tone: Float32Array, gw: number, gh: number, n: number) => void

// ---------------------------------------------------------------------------
// Distance-function toolkit (after Inigo Quilez's catalogue of primitives).
// ---------------------------------------------------------------------------

// A bounding volume stands in for the exact distance only beyond PROXY: the
// soft shadows and the ambient occlusion read distance values, not just
// zero crossings, and a closer switch would draw its outline on the floor.
const PROXY = 0.4

const clamp01 = (x: number) => x < 0 ? 0 : x > 1 ? 1 : x

function smin(a: number, b: number, k: number) {
  const h = Math.max(k - Math.abs(a - b), 0) / k
  return Math.min(a, b) - h * h * k * 0.25
}

function smax(a: number, b: number, k: number) {
  return -smin(-a, -b, k)
}

function sdEllipsoid(x: number, y: number, z: number, a: number, b: number, c: number) {
  const k0 = len(x / a, y / b, z / c)
  const k1 = len(x / (a * a), y / (b * b), z / (c * c))
  return k0 * (k0 - 1) / k1
}

function sdCapsule(x: number, y: number, z: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number) {
  const px = x - ax
  const py = y - ay
  const pz = z - az
  const ex = bx - ax
  const ey = by - ay
  const ez = bz - az
  const h = clamp01((px * ex + py * ey + pz * ez) / (ex * ex + ey * ey + ez * ez))
  return len(px - ex * h, py - ey * h, pz - ez * h) - r
}

function sdBox(x: number, y: number, z: number, bx: number, by: number, bz: number, rr: number) {
  const qx = Math.abs(x) - bx + rr
  const qy = Math.abs(y) - by + rr
  const qz = Math.abs(z) - bz + rr
  return len(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - rr
}

/** Vertical capped cylinder, centred, half height h. */
function sdCylinder(x: number, y: number, z: number, r: number, h: number) {
  const dx = len(x, z) - r
  const dy = Math.abs(y) - h
  return Math.min(Math.max(dx, dy), 0) + len(Math.max(dx, 0), Math.max(dy, 0))
}

/** Vertical capped cone (frustum), centred, half height h, radii r1 (bottom) and r2 (top). */
function sdCone(x: number, y: number, z: number, h: number, r1: number, r2: number) {
  const qx = len(x, z)
  const qy = y
  const k2x = r2 - r1
  const k2y = 2 * h
  const cax = qx - Math.min(qx, qy < 0 ? r1 : r2)
  const cay = Math.abs(qy) - h
  const t = clamp01(((r2 - qx) * k2x + (h - qy) * k2y) / (k2x * k2x + k2y * k2y))
  const cbx = qx - r2 + k2x * t
  const cby = qy - h + k2y * t
  const s = cbx < 0 && cay < 0 ? -1 : 1
  return s * Math.sqrt(Math.min(cax * cax + cay * cay, cbx * cbx + cby * cby))
}

function sdTorus(x: number, y: number, z: number, R: number, r: number) {
  return len(len(x, z) - R, y) - r
}

function sunDir(az: number, el: number): [number, number, number] {
  const c = Math.cos(el)
  return [Math.sin(az) * c, Math.sin(el), Math.cos(az) * c]
}

// ---------------------------------------------------------------------------
// Spheres: balls on an endless floor under an open sky, the classic subject
// of the first ray tracers.
// ---------------------------------------------------------------------------

export function spheres(r: Rng): SceneFn {
  const count = int(r, 3, 6)
  const radii = Array.from({ length: count }, () => range(r, 0.2, 0.55)).sort((a, b) => b - a)
  const balls: { x: number, y: number, z: number, r: number, alb: number, alb2: number, stripe: number, gloss: number }[] = []
  for (const rad of radii) {
    for (let tries = 0; tries < 80; tries++) {
      const x = range(r, -1.05, 1.05)
      const z = range(r, -1.1, 0.45)
      if (balls.every(b => len(b.x - x, b.z - z) > b.r + rad + 0.06)) {
        const stripe = chance(r, 0.3) ? range(r, 4, 8) / rad : 0
        balls.push({ x, y: rad, z, r: rad, alb: range(r, 0.45, 0.95), alb2: range(r, 0.08, 0.3), stripe, gloss: range(r, 0.1, 0.9) })
        break
      }
    }
  }
  const checker = chance(r, 0.55)
  const tile = range(r, 0.45, 0.8)
  const floorA = range(r, 0.62, 0.88)
  const floorB = range(r, 0.1, 0.3)
  const plain = range(r, 0.3, 0.52)
  const lightAz = range(r, -1.3, 1.3)
  const lightEl = range(r, 0.45, 0.9)
  const camAz = range(r, -0.5, 0.5)
  const L = sunDir(camAz + lightAz, lightEl)
  const camH = range(r, 0.8, 1.9)
  let cx = 0
  let cz = 0
  for (const b of balls) {
    cx += b.x / balls.length
    cz += b.z / balls.length
  }
  const camX = Math.sin(camAz) * 4.4 + cx
  const camZ = Math.cos(camAz) * 4.4 + cz
  let br = 0
  for (const b of balls)
    br = Math.max(br, len(b.x - cx, b.y - 0.4, b.z - cz) + b.r)
  const map: Sdf = (x, y, z) => {
    let d = 1e9
    for (const b of balls)
      d = Math.min(d, len(x - b.x, y - b.y, z - b.z) - b.r)
    return d
  }
  const nearest = (x: number, y: number, z: number) => {
    let best = balls[0]
    let bd = 1e9
    for (const b of balls) {
      const d = len(x - b.x, y - b.y, z - b.z) - b.r
      if (d < bd) {
        bd = d
        best = b
      }
    }
    return best
  }
  const sc: Scene3 = {
    map,
    albedo: (x, y, z) => {
      const b = nearest(x, y, z)
      if (b.stripe > 0 && Math.floor((y - b.y + b.r * 0.6 * (x - b.x)) * b.stripe * 0.5) % 2 === 0)
        return b.alb2
      return b.alb
    },
    gloss: (x, y, z) => nearest(x, y, z).gloss,
    bound: [cx, 0.4, cz, br + 0.05],
    floor: {
      y: 0,
      albedo: (x, z) => {
        if (!checker)
          return plain
        // far tiles fade to their mean tone instead of aliasing into noise
        const fade = clamp01((len(x - camX, z - camZ) - 3) / 6)
        const c = (Math.floor(x / tile) + Math.floor(z / tile)) & 1 ? floorA : floorB
        return c + ((floorA + floorB) / 2 - c) * fade
      },
    },
    wall: null,
    sky: (_dx, dy) => 0.96 - 0.7 * Math.sqrt(Math.max(dy, 0)),
    light: L,
    key: 0.95,
    ambient: 0.32,
    shadowK: 9,
    haze: 0.09,
    cam: { pos: [camX, camH, camZ], target: [cx, 0.32, cz], focal: 1.5 },
  }
  return (tone, gw, gh, n) => renderScene(sc, tone, gw, gh, n)
}

// ---------------------------------------------------------------------------
// Still life: solids set on a table against a wall, under window light.
// ---------------------------------------------------------------------------

type Solid = 'sphere' | 'box' | 'cylinder' | 'cone' | 'torus' | 'egg'

export function stillLife(r: Rng): SceneFn {
  const count = int(r, 3, 5)
  const kinds: Solid[] = ['sphere', 'box', 'cylinder', 'cone', 'torus', 'egg']
  const tones = [0.98, 0.8, 0.62, 0.44]
  const objs: { kind: Solid, x: number, z: number, s: number, h: number, rot: number, alb: number, gloss: number, foot: number, top: number, br: number }[] = []
  for (let k = 0; k < count; k++) {
    const kind = pick(r, kinds)
    const s = range(r, 0.2, 0.34)
    const h = range(r, 0.5, 1.6)
    const rot = range(r, 0, Math.PI)
    const alb = tones[(k + int(r, 0, 3)) % 4]
    const gloss = kind === 'sphere' || kind === 'egg' || kind === 'cylinder' ? range(r, 0.2, 0.8) : range(r, 0, 0.25)
    const foot = kind === 'box' ? s * 1.42 : kind === 'torus' ? s * 1.35 : s
    const TOPS: Record<Solid, number> = { sphere: 2, box: 1.2 * h, cylinder: 2 * h, cone: 2.4 * h, torus: 0.7, egg: 2.6 }
    const top = TOPS[kind] * s
    for (let tries = 0; tries < 80; tries++) {
      const x = range(r, -0.8, 0.8)
      const z = range(r, -0.65, 0.35)
      if (objs.every(o => len(o.x - x, o.z - z) > o.foot + foot + 0.04)) {
        objs.push({ kind, x, z, s, h, rot, alb, gloss, foot, top, br: len(foot, top / 2) + 0.02 })
        break
      }
    }
  }
  const side = chance(r, 0.5) ? 1 : -1
  const el = range(r, 0.5, 0.85)
  const L = sunDir(side * range(r, 0.5, 1.1), el)
  // a pale wall, or a dark backdrop that sets the solids off
  const darkWall = chance(r, 0.5)
  const tableA = darkWall ? range(r, 0.45, 0.7) : range(r, 0.35, 0.6)
  const wallA = darkWall ? range(r, 0.1, 0.22) : tableA + range(r, 0.25, 0.4)
  const edge = range(r, 0.85, 1.05)
  const camX = range(r, -0.6, 0.6)
  const camH = range(r, 0.9, 1.6)

  const one = (o: typeof objs[number], x: number, y: number, z: number) => {
    let px = x - o.x
    let pz = z - o.z
    const bnd = len(px, y - o.top / 2, pz) - o.br
    if (bnd > PROXY)
      return bnd
    const c = Math.cos(o.rot)
    const sn = Math.sin(o.rot)
    const t = px * c - pz * sn
    pz = px * sn + pz * c
    px = t
    const s = o.s
    switch (o.kind) {
      case 'sphere': return len(px, y - s, pz) - s
      case 'box': return sdBox(px, y - s * o.h * 0.6, pz, s, s * o.h * 0.6, s, 0.012)
      case 'cylinder': return sdCylinder(px, y - s * o.h, pz, s * 0.8, s * o.h) - 0.008
      case 'cone': return sdCone(px, y - s * o.h * 1.2, pz, s * o.h * 1.2, s, s * 0.08)
      case 'torus': return sdTorus(px, y - s * 0.35, pz, s, s * 0.35)
      case 'egg': return sdEllipsoid(px, y - s * 1.3, pz, s * 0.85, s * 1.3, s * 0.85)
    }
  }
  const map: Sdf = (x, y, z) => {
    let d = 1e9
    for (const o of objs)
      d = Math.min(d, one(o, x, y, z))
    return d
  }
  const nearest = (x: number, y: number, z: number) => {
    let best = objs[0]
    let bd = 1e9
    for (const o of objs) {
      const d = one(o, x, y, z)
      if (d < bd) {
        bd = d
        best = o
      }
    }
    return best
  }
  // bounding sphere of all the solids
  let bx = 0
  let bz = 0
  for (const o of objs) {
    bx += o.x / objs.length
    bz += o.z / objs.length
  }
  let bt = 0
  for (const o of objs)
    bt = Math.max(bt, o.top)
  let brad = 0
  for (const o of objs)
    brad = Math.max(brad, len(o.x - bx, o.z - bz) + o.br)
  brad = Math.max(brad, bt / 2 + 0.05)
  const sc: Scene3 = {
    map,
    albedo: (x, y, z) => nearest(x, y, z).alb,
    gloss: (x, y, z) => nearest(x, y, z).gloss,
    bound: [bx, bt / 2, bz, brad + 0.05],
    floor: { y: 0, albedo: (_x, z) => z > edge ? tableA * 0.25 : tableA },
    wall: { z: -1.15, albedo: (x, y) => wallA * (1 - 0.25 * clamp01(y / 3) - 0.1 * clamp01(Math.abs(x) / 3)) },
    sky: () => 0.5,
    light: L,
    key: 1.05,
    ambient: 0.4,
    shadowK: 7,
    haze: 0,
    cam: { pos: [camX, camH, 3.1], target: [0, 0.32, -0.15], focal: 1.55 },
  }
  return (tone, gw, gh, n) => renderScene(sc, tone, gw, gh, n)
}

// ---------------------------------------------------------------------------
// Bust: a plaster head and shoulders on a plinth, built from ellipsoids and
// capsules joined with smooth unions, lit from one side against a wall.
// ---------------------------------------------------------------------------

export function bust(r: Rng): SceneFn {
  const yaw = range(r, 0.2, 0.7) * (chance(r, 0.5) ? 1 : -1)
  const tilt = range(r, -0.1, 0.1)
  const nod = range(r, -0.06, 0.16)
  const hair = pick(r, ['cap', 'bun', 'curls', 'bald'] as const)
  const neckLen = range(r, 0.95, 1.1)
  const side = chance(r, 0.5) ? 1 : -1
  const L = sunDir(side * range(r, 0.7, 1.2), range(r, 0.45, 0.75))
  const wallA = range(r, 0.3, 0.6)
  const plinth = pick(r, ['block', 'drum', 'stepped'] as const)
  const camX = range(r, -0.2, 0.2)

  // Head pivot at the top of the neck; head points are rotated into the
  // head's own frame (yaw, then nod, then tilt) before evaluation.
  const PY = 0.6 * neckLen
  const cy = Math.cos(-yaw)
  const sy = Math.sin(-yaw)
  const cn = Math.cos(-nod)
  const sn = Math.sin(-nod)
  const ct = Math.cos(-tilt)
  const st = Math.sin(-tilt)
  const Hy = 0.3
  const cb = Math.cos(yaw * 0.25)
  const sb = Math.sin(yaw * 0.25)

  const head = (x0: number, y0: number, z0: number) => {
    let x = x0
    let y = y0 - PY
    let z = z0
    let t = x * cy + z * sy
    z = -x * sy + z * cy
    x = t
    t = y * cn - z * sn
    z = y * sn + z * cn
    y = t
    t = x * ct - y * st
    y = x * st + y * ct
    x = t
    const bnd = len(x, y - Hy, z) - 0.5
    if (bnd > PROXY)
      return bnd
    const ax = Math.abs(x)
    y -= Hy
    // cranium and face mass
    let d = sdEllipsoid(x, y - 0.03, z + 0.03, 0.25, 0.3, 0.29)
    d = smin(d, sdEllipsoid(x, y + 0.11, z - 0.06, 0.19, 0.22, 0.2), 0.1)
    // every detail below stays within 0.16 of this core
    if (d > PROXY + 0.16)
      return d - 0.16
    // The face details below (chin, cheekbones, nose, brow, eyes, lips) all
    // lie within 0.29 of a point in front of the face, and blend over at most
    // 0.09: farther than that from the point, they cannot change d.
    const face = len(x, y + 0.08, z - 0.2)
    if (face < 0.41 + Math.max(d, 0)) {
      d = smin(d, len(x, y + 0.29, z - 0.13) - 0.065, 0.09)
      // cheekbones
      d = smin(d, len(ax - 0.11, y + 0.06, z - 0.15) - 0.065, 0.06)
      // nose bridge to tip, brow ridge
      d = smin(d, sdCapsule(x, y, z, 0, 0.04, 0.235, 0, -0.085, 0.29, 0.032), 0.035)
      d = smin(d, sdCapsule(ax, y, z, 0, 0.06, 0.215, 0.105, 0.065, 0.195, 0.034), 0.05)
      // shallow sockets with blank eyeballs, as on a plaster cast
      d = smax(d, -(len(ax - 0.085, y - 0.012, z - 0.245) - 0.036), 0.03)
      d = smin(d, len(ax - 0.085, y - 0.012, z - 0.2) - 0.041, 0.015)
      // lips
      d = smin(d, sdCapsule(ax, y, z, 0, -0.152, 0.238, 0.048, -0.148, 0.218, 0.02), 0.02)
    }
    // ears
    d = smin(d, sdEllipsoid(ax - 0.25, y + 0.01, z + 0.02, 0.03, 0.07, 0.048), 0.03)
    if (hair === 'cap') {
      d = smin(d, sdEllipsoid(x, y - 0.07, z + 0.06, 0.265, 0.29, 0.295), 0.04)
    }
    else if (hair === 'bun') {
      d = smin(d, sdEllipsoid(x, y - 0.06, z + 0.05, 0.26, 0.28, 0.285), 0.03)
      d = smin(d, len(x, y - 0.14, z + 0.32) - 0.1, 0.05)
    }
    else if (hair === 'curls') {
      const c = sdEllipsoid(x, y - 0.07, z + 0.06, 0.275, 0.3, 0.3)
      if (c < 0.05) {
        const bump = Math.sin(x * 48) * Math.sin(y * 48 + 1.3) * Math.sin(z * 48 + 2.1)
        d = smin(d, c - 0.015 * bump, 0.03)
      }
      else {
        d = Math.min(d, c)
      }
    }
    return d
  }
  const body = (x: number, y: number, z: number) => {
    const bnd = len(x, y - 0.1, z) - 0.9
    if (bnd > PROXY)
      return bnd
    const bx = x * cb + z * sb
    const bz = -x * sb + z * cb
    const abx = Math.abs(bx)
    // chest and shoulders, cut flat at the base; the neck
    let d = sdEllipsoid(bx, y - 0.2, bz + 0.02, 0.48, 0.36, 0.24)
    d = smin(d, len(abx - 0.4, y - 0.32, bz + 0.03) - 0.13, 0.14)
    d = smax(d, -y + 0.02, 0.02)
    d = smin(d, sdCapsule(bx, y, bz, 0, 0.3, -0.01, 0, PY + 0.08, 0.0, 0.135), 0.1)
    let p: number
    if (plinth === 'block')
      p = sdBox(x, y + 0.29, z, 0.32, 0.29, 0.27, 0.01)
    else if (plinth === 'drum')
      p = sdCylinder(x, y + 0.29, z, 0.27, 0.29)
    else
      p = Math.min(sdBox(x, y + 0.06, z, 0.26, 0.06, 0.22, 0.01), sdBox(x, y + 0.35, z, 0.36, 0.24, 0.3, 0.01))
    return Math.min(d, p)
  }
  const map: Sdf = (x, y, z) => Math.min(head(x, y, z), body(x, y, z))
  const sc: Scene3 = {
    map,
    albedo: (_x, y) => y < 0 ? 0.7 : 0.92,
    gloss: () => 0.06,
    bound: [0, 0.42, 0, 1.08],
    floor: { y: -0.58, albedo: () => wallA * 0.9 },
    wall: { z: -0.9, albedo: (x, y) => wallA * (0.55 + 0.45 / (1 + 1.6 * ((x + side * 0.3) ** 2 + (y - 0.7) ** 2))) },
    sky: () => 0.2,
    light: L,
    key: 1.0,
    ambient: 0.26,
    shadowK: 10,
    haze: 0,
    cam: { pos: [camX, 0.75, 2.75], target: [0, 0.52, 0], focal: 1.4 },
  }
  return (tone, gw, gh, n) => renderScene(sc, tone, gw, gh, n)
}

// ---------------------------------------------------------------------------
// Landscape: a coast at sunrise or sunset — sky, sun, banks of cloud, a
// headland, the sea with the sun's glitter path and the headland's reflection.
// ---------------------------------------------------------------------------

export function landscape(r: Rng): SceneFn {
  const nz = valueNoise(r)
  const horizon = range(r, -0.16, 0.04)
  const sunX = range(r, -0.35, 0.35)
  const sunY = horizon + range(r, 0.05, 0.3)
  const sunR = range(r, 0.045, 0.09)
  const night = chance(r, 0.25)
  const cloudY = range(r, 0.12, 0.4)
  const cloudAmt = range(r, 0.35, 0.6)
  const capeSide = chance(r, 0.5) ? 1 : -1
  const capeX = capeSide * range(r, 0.15, 0.55)
  const capeH = range(r, 0.08, 0.22)
  const capeW = range(r, 0.35, 0.8)
  const farH = range(r, 0.02, 0.06)
  const boat = chance(r, 0.5) ? { x: range(r, -0.4, 0.4), s: range(r, 0.02, 0.035) } : null
  const ox = range(r, 0, 100)
  const oy = range(r, 0, 100)

  const ridge = (x: number) => {
    // headland: a bump of fractal noise, steep on the sea side
    const u = (x - capeX) / capeW
    const env = Math.max(0, 1 - u * u)
    return horizon + capeH * env * env * (0.55 + 0.6 * fbm(nz, x * 4 + ox, oy, 4))
  }
  const farRidge = (x: number) => horizon + farH * fbm(nz, x * 3 + 40 + ox, 7, 3)
  const skyTone = (x: number, y: number) => {
    const h = Math.max(0, y - horizon)
    const d = len(x - sunX, (y - sunY) * 1.3)
    const glow = Math.exp(-d * 4.5)
    if (night)
      return 0.1 + 0.25 * Math.exp(-h * 5) + 0.45 * glow
    return 0.25 + 0.45 * Math.exp(-h * 4) + 0.35 * glow
  }

  return (tone, gw, gh, n) => {
    for (let j = 0; j < gh; j++) {
      const y = (gh / 2 - (j + 0.5)) / n
      for (let i = 0; i < gw; i++) {
        const x = (i + 0.5 - gw / 2) / n
        let v: number
        if (y >= horizon) {
          const rg = ridge(x)
          if (y < rg) {
            // headland: lit by a pseudo-normal from the noise gradient
            const e = 0.01
            const sx = fbm(nz, (x + e) * 9 + ox, y * 9, 3) - fbm(nz, (x - e) * 9 + ox, y * 9, 3)
            const lit = clamp01(0.5 + 3 * sx * Math.sign(sunX - x))
            v = 0.07 + 0.22 * lit * (1 - (rg - y) / capeH * 0.5)
          }
          else if (y < farRidge(x)) {
            v = skyTone(x, horizon) * 0.62
          }
          else {
            v = skyTone(x, y)
            const ds = len(x - sunX, y - sunY)
            if (ds < sunR)
              v = night ? 0.92 - 0.15 * fbm(nz, x * 40, y * 40, 2) : 1
            // banks of cloud, stretched sideways
            const c = fbm(nz, x * 2.2 + ox, (y - cloudY) * 11 + oy, 4) - (1 - cloudAmt) - 0.35 * Math.abs(y - cloudY) / 0.2
            if (c > 0) {
              const below = fbm(nz, x * 2.2 + ox, (y - cloudY - 0.02) * 11 + oy, 4) - (1 - cloudAmt) - 0.35 * Math.abs(y - 0.02 - cloudY) / 0.2
              const rim = below < 0 ? 0.3 : 0
              v = 0.18 + 0.45 * Math.exp(-len(x - sunX, y - sunY) * 3) + rim - c * 0.4
            }
            if (boat) {
              const bx = (x - boat.x) / boat.s
              const by = (y - horizon) / boat.s
              if ((by > 0.15 && by < 2.6 && bx > 0 && bx < (2.6 - by) * 0.55) || (by > 0.35 && by < 2.1 && bx < -0.1 && bx > -(2.1 - by) * 0.4) || (by >= 0 && by <= 0.35 && Math.abs(bx) < 1.1 - (0.35 - by)))
                v = 0.06
            }
          }
        }
        else {
          // sea: depth below the horizon sets the scale of the waves
          const d = horizon - y
          const z = 1 / (d + 0.02)
          const wave = fbm(nz, x * z * 0.6 + ox, z * 1.6 + oy, 3)
          const mirror = horizon + d
          v = skyTone(x, mirror) * (0.55 + 0.25 * Math.exp(-d * 8))
          const xr = x + (wave - 0.5) * 0.04 * d * 10
          if (mirror < ridge(xr) && d < capeH * 1.1)
            v = 0.06 + 0.06 * wave
          const path = Math.exp(-(((x - sunX) / (sunR * 0.8 + d * 0.9)) ** 2))
          if (wave > 0.78 - 0.32 * path)
            v = Math.max(v, (night ? 0.75 : 0.95) * path + 0.1)
          else
            v -= 0.12 * (0.5 - wave)
        }
        tone[j * gw + i] = v
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Gradients: a poster of flat shapes, each filled with a smooth gradient,
// on a gradient ground. Dithering turns every ramp into a texture.
// ---------------------------------------------------------------------------

type ShapeKind = 'disc' | 'ring' | 'half' | 'quarter' | 'rect' | 'arch' | 'tri'

export function gradients(r: Rng): SceneFn {
  const bgA = range(r, 0.05, 0.4)
  const bgB = range(r, 0.6, 0.98)
  const bgAng = range(r, 0, Math.PI * 2)
  const count = int(r, 4, 8)
  const grid = 6
  const cellSz = 0.84 / grid
  interface Shape { kind: ShapeKind, cx: number, cy: number, w: number, h: number, c: number, s: number, a: number, b: number, gc: number, gs: number, radial: boolean, reach: number }
  const shapes: Shape[] = []
  for (let k = 0; k < count; k++) {
    const kind = pick(r, ['disc', 'ring', 'half', 'quarter', 'rect', 'arch', 'tri'] as const)
    const cw = int(r, 1, 4)
    const ch = kind === 'disc' || kind === 'ring' ? cw : int(r, 1, 4)
    const gx = int(r, 0, grid - cw)
    const gy = int(r, 0, grid - ch)
    const quarterTurns = int(r, 0, 3)
    const rot = quarterTurns * Math.PI / 2
    let a = range(r, 0, 1)
    let b = range(r, 0, 1)
    if (Math.abs(a - b) < 0.5)
      b = a > 0.5 ? a - 0.6 : a + 0.6
    if (chance(r, 0.5)) {
      const t = a
      a = b
      b = t
    }
    // a few shapes are flat ink or flat paper, anchors for the eye
    if (chance(r, 0.25)) {
      a = chance(r, 0.5) ? 0 : 1
      b = a
    }
    const ang = int(r, 0, 7) * Math.PI / 4
    const radial = chance(r, 0.35)
    // a quarter turn swaps the extents in the shape's own frame
    const odd = quarterTurns % 2 === 1
    const sw = cw * cellSz / 2
    const sh = ch * cellSz / 2
    shapes.push({
      kind,
      cx: -0.42 + (gx + cw / 2) * cellSz,
      cy: -0.42 + (gy + ch / 2) * cellSz,
      w: odd ? sh : sw,
      h: odd ? sw : sh,
      c: Math.round(Math.cos(rot)),
      s: Math.round(Math.sin(rot)),
      a,
      b,
      gc: Math.cos(ang),
      gs: Math.sin(ang),
      radial,
      reach: len(sw, sh) + 0.03,
    })
  }
  const shadowDx = range(r, -0.012, 0.012)
  const shadowDy = -0.014

  // Position in the shape's gradient, in [0, 1], or -1 outside the shape.
  const inside = (s: Shape, x: number, y: number): number => {
    const qx = x - s.cx
    const qy = y - s.cy
    const px = qx * s.c + qy * s.s
    const py = -qx * s.s + qy * s.c
    const w = s.w
    const h = s.h
    const rad = Math.min(w, h)
    let ok = false
    switch (s.kind) {
      case 'disc': ok = px * px + py * py < rad * rad
        break
      case 'ring': {
        const d = px * px + py * py
        ok = d < rad * rad && d > rad * rad * 0.3
        break
      }
      case 'half': ok = py > -h && len(px / w, (py + h) / (2 * h)) < 1
        break
      case 'quarter': ok = px > -w && py > -h && len((px + w) / (2 * w), (py + h) / (2 * h)) < 1
        break
      case 'rect': ok = Math.abs(px) < w && Math.abs(py) < h
        break
      case 'arch': ok = Math.abs(px) < w && py > -h && (py < h - w || len(px, py - (h - w)) < w)
        break
      case 'tri': ok = py > -h && py < h && Math.abs(px) < w * (h - py) / (2 * h)
        break
    }
    if (!ok)
      return -1
    if (s.radial)
      return clamp01(len(px + w * 0.35, py - h * 0.35) / (1.3 * Math.max(w, h)))
    return clamp01(0.5 + 0.5 * (px * s.gc + py * s.gs) / Math.max(w, h))
  }

  return (tone, gw, gh, n) => {
    const cb = Math.cos(bgAng)
    const sb = Math.sin(bgAng)
    const ext = 0.5 * Math.max(gw, gh) / n
    for (let j = 0; j < gh; j++) {
      const y = (gh / 2 - (j + 0.5)) / n
      for (let i = 0; i < gw; i++) {
        const x = (i + 0.5 - gw / 2) / n
        let v = bgA + (bgB - bgA) * clamp01(0.5 + 0.5 * (x * cb + y * sb) / ext)
        for (const s of shapes) {
          if (Math.abs(x - s.cx) > s.reach || Math.abs(y - s.cy) > s.reach)
            continue
          const t = inside(s, x, y)
          if (t >= 0)
            v = s.a + (s.b - s.a) * t
          else if (inside(s, x - shadowDx, y - shadowDy) >= 0)
            v *= 0.55
        }
        tone[j * gw + i] = v
      }
    }
  }
}
