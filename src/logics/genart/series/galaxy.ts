// "Galaxy" — spiral galaxies grown from nested, rotated orbits.
//
// Stars are placed on ovals whose orientation turns a little with every step
// outwards; where the ovals crowd, the stars bunch into arms (Lin & Shu's
// density waves, drawn as ellipses after Kalnajs; see ../galaxy/model.ts).
// A Sérsic bulge, an optional bar, blue young stars and pink H II knots where
// the arms are densest, and dust lanes on the inner edge of each arm complete
// the picture. Light is splatted additively into float buffers, dimmed by the
// dust, given a glow, and developed with a soft tone curve on near-black.
// The Hubble sequence (Sa to Sd, barred SBa to SBc, ellipticals, irregulars)
// sets the proportions; the viewing angle can tilt the disc until it is seen
// edge-on.
//
// Everything is a pure function of the hash; every length is a fraction of
// the canvas short side.

import type { Light } from '../galaxy/light'
import type { Galaxy } from '../galaxy/model'
import type { Rng } from '../random'
import type { Series } from '../types'
import { develop, ellipseBlob, makeLight } from '../galaxy/light'
import { armMap, contrastAt, discRadius, fbm, fcos, fsin, height, mapAt, nearGauss, orbit, planeMap, sersicRadius, smooth } from '../galaxy/model'
import { gaussian, int, pick, range, stream, weighted } from '../random'

// Rarity table, decided before the drawing code. Never reorder: it re-rolls the edition.
const TRAITS = {
  Type: [['Sa', 12], ['Sb', 18], ['Sc', 16], ['Sd', 8], ['SBa', 8], ['SBb', 12], ['SBc', 10], ['Elliptical', 8], ['Irregular', 8]],
  Palette: [['Hubble', 32], ['Narrowband', 20], ['Infrared', 18], ['Ultraviolet', 16], ['Plate', 14]],
  View: [['Face-on', 38], ['Tilted', 34], ['Steep', 18], ['Edge-on', 10]],
  Company: [['Alone', 60], ['Satellite', 26], ['Pair', 14]],
  Field: [['Sparse', 30], ['Rich', 30], ['Deep field', 22], ['Nebula', 18]],
} as const

type TraitName = keyof typeof TRAITS
type Features = { [K in TraitName]: typeof TRAITS[K][number][0] }
type HubbleType = Features['Type']

function features(hash: string): Features {
  const r = stream(hash, 'features')
  return {
    Type: weighted(r, TRAITS.Type),
    Palette: weighted(r, TRAITS.Palette),
    View: weighted(r, TRAITS.View),
    Company: weighted(r, TRAITS.Company),
    Field: weighted(r, TRAITS.Field),
  }
}

type RGB = readonly [number, number, number]

interface Palette {
  bg: string
  /** Star colour from cool / old (first) to hot / young (last). */
  ramp: readonly string[]
  hii: string
  /** Dust either absorbs (reddening per channel) or glows in this colour. */
  extinction: RGB
  dustGlow: string | null
  nebula: readonly [string, string]
  /** Photographic negative: everything is inverted onto this paper at the end. */
  paper: string | null
}

const PAL: Record<Features['Palette'], Palette> = {
  // blackbody-like star colours after Mitchell Charity's table, pushed a little
  Hubble: { bg: '#030409', ramp: ['#ff8f45', '#ffb36e', '#ffd9a8', '#fff1e4', '#c9d8ff', '#86a8ff'], hii: '#ff4f8f', extinction: [0.75, 1, 1.3], dustGlow: null, nebula: ['#d0386e', '#3658c8'], paper: null },
  Narrowband: { bg: '#020909', ramp: ['#a35418', '#d98f34', '#efc66a', '#bfe3bf', '#4cc9bb', '#1d9fbf'], hii: '#ffe066', extinction: [0.8, 1, 1.2], dustGlow: null, nebula: ['#2bb59a', '#d9962e'], paper: null },
  Infrared: { bg: '#070203', ramp: ['#7a1f10', '#b8401c', '#e9833a', '#ffc98a', '#fff0dc', '#ffffff'], hii: '#ffe9c2', extinction: [0.2, 0.3, 0.4], dustGlow: '#ff5226', nebula: ['#b5301a', '#f2a050'], paper: null },
  Ultraviolet: { bg: '#04030c', ramp: ['#241a5c', '#3d2c96', '#6650cc', '#8c8ff2', '#78d2ff', '#dcf6ff'], hii: '#d690ff', extinction: [0.8, 1, 1.25], dustGlow: null, nebula: ['#5d3ad6', '#2a9fd4'], paper: null },
  // light colours are 1 - ink / paper, so the negative prints in blue-black ink
  Plate: { bg: '#000000', ramp: ['#d8cfb5', '#ddd4bb', '#e1d9c2', '#e1d9c2', '#e4dcc8', '#e6dfcc'], hii: '#5fd0cb', extinction: [1, 1, 1], dustGlow: null, nebula: ['#b8b09c', '#c8c0aa'], paper: '#ede5d4' },
}

// Proportions along the Hubble sequence (galaxy units: the disc fades out near 1).
interface TypeSpec { bulgeL: number, bulgeRe: number, bulgeN: number, rd: number, twist: number, qArm: number, rCore: number, aBar: number, youngL: number, hii: number, dust: number, flocc: number }
const TYPE: Record<HubbleType, TypeSpec> = {
  Sa: { bulgeL: 1.15, bulgeRe: 0.1, bulgeN: 4, rd: 0.29, twist: 6.2, qArm: 0.88, rCore: 0.22, aBar: 0, youngL: 0.3, hii: 10, dust: 1.1, flocc: 0.15 },
  Sb: { bulgeL: 0.65, bulgeRe: 0.075, bulgeN: 3, rd: 0.3, twist: 4.8, qArm: 0.83, rCore: 0.16, aBar: 0, youngL: 0.6, hii: 28, dust: 1, flocc: 0.25 },
  Sc: { bulgeL: 0.3, bulgeRe: 0.05, bulgeN: 2, rd: 0.32, twist: 3.6, qArm: 0.79, rCore: 0.1, aBar: 0, youngL: 0.9, hii: 55, dust: 0.8, flocc: 0.45 },
  Sd: { bulgeL: 0.1, bulgeRe: 0.04, bulgeN: 1, rd: 0.36, twist: 2.7, qArm: 0.85, rCore: 0.08, aBar: 0, youngL: 1, hii: 60, dust: 0.45, flocc: 0.85 },
  SBa: { bulgeL: 0.85, bulgeRe: 0.085, bulgeN: 4, rd: 0.29, twist: 4.4, qArm: 0.87, rCore: 0.2, aBar: 0.36, youngL: 0.35, hii: 12, dust: 1, flocc: 0.15 },
  SBb: { bulgeL: 0.5, bulgeRe: 0.065, bulgeN: 3, rd: 0.3, twist: 3.8, qArm: 0.82, rCore: 0.15, aBar: 0.32, youngL: 0.65, hii: 30, dust: 1, flocc: 0.25 },
  SBc: { bulgeL: 0.25, bulgeRe: 0.05, bulgeN: 2, rd: 0.32, twist: 3, qArm: 0.8, rCore: 0.1, aBar: 0.28, youngL: 0.9, hii: 50, dust: 0.8, flocc: 0.4 },
  Elliptical: { bulgeL: 2.4, bulgeRe: 0.15, bulgeN: 4, rd: 0.3, twist: 0, qArm: 1, rCore: 0, aBar: 0, youngL: 0, hii: 0, dust: 0, flocc: 0 },
  Irregular: { bulgeL: 0, bulgeRe: 0.05, bulgeN: 1, rd: 0.42, twist: 0, qArm: 1, rCore: 0, aBar: 0, youngL: 1, hii: 45, dust: 0.35, flocc: 1 },
}

// Inclination ranges (radians from face-on).
const VIEW: Record<Features['View'], readonly [number, number]> = {
  'Face-on': [0, 0.42],
  'Tilted': [0.7, 1.08],
  'Steep': [1.15, 1.36],
  'Edge-on': [1.47, 1.54],
}

// Particles per (galaxy size in buffer pixels)^2, and the light each one carries.
const DENS_OLD = 1.5
const DENS_YOUNG = 0.65
const DENS_BULGE = 0.85
const DENS_DUST = 0.9
const E_OLD = 0.75
const E_YOUNG = 0.36
const E_BULGE = 0.5
const TAU = 3.6

function makeGalaxy(r: Rng, type: HubbleType, incl: number, cx: number, cy: number, size: number): Galaxy {
  const T = TYPE[type]
  const j = (v: number, k = 0.12) => v * (1 + range(r, -k, k))
  const kind = type === 'Elliptical' ? 'elliptical' : type === 'Irregular' ? 'irregular' : 'spiral'
  const m = T.aBar > 0 ? 2 : weighted(r, [[2, 80], [3, 13], [4, 7]] as const)
  const G: Galaxy = {
    kind,
    m,
    twist: j(T.twist) * (m === 2 ? 1 : 0.8),
    qArm: Math.min(0.95, j(T.qArm, 0.04)),
    rCore: j(T.rCore),
    aBar: T.aBar > 0 ? j(T.aBar, 0.1) : 0,
    qBar: range(r, 0.28, 0.4),
    rd: j(T.rd, 0.08),
    bulgeRe: j(T.bulgeRe, 0.15),
    bulgeN: T.bulgeN,
    bulgeQ: range(r, 0.55, 0.8),
    bulgeL: j(T.bulgeL, 0.2),
    discL: kind === 'elliptical' ? 0 : 1,
    youngL: j(T.youngL, 0.15),
    hii: Math.round(j(T.hii, 0.25)),
    dust: j(T.dust, 0.2),
    flocc: Math.min(1, j(T.flocc, 0.2)),
    clumps: [],
    cx,
    cy,
    size,
    incl,
    pa: r() * Math.PI,
    spin: r() < 0.5 ? 1 : -1,
    phi0: r() * Math.PI * 2,
    shells: 0,
    noiseSeed: Math.floor(r() * 1e9),
  }
  if (kind === 'irregular') {
    // a lumpy chain of star-forming clumps, often with an off-centre bar
    let x = range(r, -0.2, 0.2)
    let y = range(r, -0.2, 0.2)
    let a = r() * Math.PI * 2
    const n = int(r, 4, 8)
    for (let i = 0; i < n; i++) {
      G.clumps.push([x, y, range(r, 0.09, 0.2), range(r, 0.5, 1.4)])
      a += range(r, -1.3, 1.3)
      const step = range(r, 0.18, 0.32)
      x = Math.max(-0.7, Math.min(0.7, x + Math.cos(a) * step))
      y = Math.max(-0.7, Math.min(0.7, y + Math.sin(a) * step))
    }
  }
  if (kind === 'elliptical') {
    G.bulgeQ = range(r, 0.6, 0.95)
    // Malin-Carter shells: ripples of a swallowed companion
    G.shells = r() < 0.6 ? int(r, 3, 7) : 0
  }
  return G
}

interface Sprite { x: number, y: number, r: number, t: number, a: number, hii?: boolean }

interface Scene {
  galaxies: Galaxy[]
  /** Faint stellar streams: points of a curve (canvas short-side units) and their width. */
  streams: Array<{ pts: Array<[number, number]>, w: number, L: number }>
}

function makeScene(hash: string, f: Features): Scene {
  const r = stream(hash, 'galaxy')
  const [i0, i1] = VIEW[f.View]
  // an irregular is a thick cloud: seen edge-on it would only pile its clumps on a line
  const incl = f.Type === 'Irregular' ? Math.min(1.05, range(r, i0, i1)) : range(r, i0, i1)
  const offAng = r() * Math.PI * 2
  const edgeBoost = f.View === 'Edge-on' ? 1.12 : f.View === 'Steep' ? 1.06 : 1
  const galaxies: Galaxy[] = []
  const streams: Scene['streams'] = []
  const cr = stream(hash, 'company')
  if (f.Company === 'Pair') {
    const main = makeGalaxy(r, f.Type, incl, -Math.cos(offAng) * 0.09, -Math.sin(offAng) * 0.09, 0.36 * edgeBoost)
    const ct = f.Type === 'Elliptical'
      ? weighted(cr, [['Sa', 25], ['Sb', 35], ['Sc', 25], ['SBb', 15]] as const)
      : weighted(cr, [['Sa', 20], ['Sb', 25], ['Sc', 25], ['SBb', 10], ['Elliptical', 20]] as const)
    const ci = range(cr, 0.2, 1.4)
    const d = range(cr, 0.34, 0.4)
    const other = makeGalaxy(cr, ct, ci, Math.cos(offAng) * d, Math.sin(offAng) * d, range(cr, 0.13, 0.17))
    galaxies.push(main, other)
    // a faint bridge of stripped stars between them
    const bend = range(cr, -0.12, 0.12)
    const mx = (main.cx + other.cx) / 2 - Math.sin(offAng) * bend
    const my = (main.cy + other.cy) / 2 + Math.cos(offAng) * bend
    streams.push({ pts: [[main.cx, main.cy], [mx, my], [other.cx, other.cy]], w: 0.05, L: 0.5 })
  }
  else {
    const main = makeGalaxy(r, f.Type, incl, 0, 0, 0.41 * edgeBoost)
    galaxies.push(main)
    if (f.Company === 'Satellite') {
      const d = range(cr, 0.33, 0.42)
      const sx = Math.cos(offAng) * d
      const sy = Math.sin(offAng) * d
      const sat = makeGalaxy(cr, 'Elliptical', 0.3, sx, sy, range(cr, 0.05, 0.075))
      sat.bulgeL *= 0.8
      galaxies.push(sat)
      // a tidal stream trailing the satellite around the host
      const dir = cr() < 0.5 ? 1 : -1
      const span = range(cr, 0.7, 1.4)
      const pts: Array<[number, number]> = []
      for (let k = 0; k <= 6; k++) {
        const a = offAng + dir * span * k / 6
        const rr = d * (1 - 0.18 * k / 6)
        pts.push([Math.cos(a) * rr, Math.sin(a) * rr])
      }
      streams.push({ pts, w: 0.045, L: 0.5 })
    }
  }
  return { galaxies, streams }
}

/** Projection of the galaxy plane (x, y, z) to buffer pixels. */
interface Proj { cx: number, cy: number, sc: number, ci: number, si: number, cp: number, sp: number }
function projection(G: Galaxy, L: Light): Proj {
  return {
    cx: L.w / 2 + G.cx * L.s,
    cy: L.h / 2 + G.cy * L.s,
    sc: G.size * L.s,
    ci: Math.cos(G.incl),
    si: Math.sin(G.incl),
    cp: Math.cos(G.pa),
    sp: Math.sin(G.pa),
  }
}

interface Lut { r: Float32Array, g: Float32Array, b: Float32Array }
const LUT_N = 64

function hexRGB(h: string): [number, number, number] {
  const n = Number.parseInt(h.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

function makeLut(ramp: readonly string[]): Lut {
  const cs = ramp.map(hexRGB)
  const lut = { r: new Float32Array(LUT_N), g: new Float32Array(LUT_N), b: new Float32Array(LUT_N) }
  for (let i = 0; i < LUT_N; i++) {
    const t = i / (LUT_N - 1) * (cs.length - 1)
    const k = Math.min(cs.length - 2, Math.floor(t))
    const u = t - k
    lut.r[i] = cs[k][0] + (cs[k + 1][0] - cs[k][0]) * u
    lut.g[i] = cs[k][1] + (cs[k + 1][1] - cs[k][1]) * u
    lut.b[i] = cs[k][2] + (cs[k + 1][2] - cs[k][2]) * u
  }
  return lut
}

/** Light and dust of one galaxy, plus its brightest stars as sprites. */
function drawGalaxy(L: Light, G: Galaxy, gi: number, hash: string, pal: Palette, lut: Lut, sprites: Sprite[]) {
  const P = projection(G, L)
  const pt = new Float64Array(2)
  const area = P.sc * P.sc
  const gr = stream(hash, `grain${gi}`)
  const kr = stream(hash, `knots${gi}`)
  const { r: LR, g: LG, b: LB, tau: LT, w, h } = L

  // splat one particle at galaxy-plane (x, y, z) with colour index t (0..1) and energy e
  const splat = (x: number, y: number, z: number, t: number, e: number) => {
    const y1 = y * P.ci - z * P.si
    const X = P.cx + P.sc * (x * P.cp - y1 * P.sp)
    const Y = P.cy + P.sc * (x * P.sp + y1 * P.cp)
    if (X < 0 || Y < 0 || X >= w || Y >= h)
      return
    const p = (Y | 0) * w + (X | 0)
    const k = Math.min(LUT_N - 1, Math.max(0, Math.round(t * (LUT_N - 1))))
    LR[p] += lut.r[k] * e
    LG[p] += lut.g[k] * e
    LB[p] += lut.b[k] * e
  }
  const toSprite = (x: number, y: number, z: number, rad: number, t: number, a: number, hii = false) => {
    const y1 = y * P.ci - z * P.si
    sprites.push({ x: G.cx + G.size * (x * P.cp - y1 * P.sp), y: G.cy + G.size * (x * P.sp + y1 * P.cp), r: rad, t, a, hii })
  }

  // --- bulge (and the whole of an elliptical): a Sérsic spheroid
  if (G.bulgeL > 0) {
    const boost = G.kind === 'elliptical' ? 2.4 : 1
    const n = Math.round(DENS_BULGE * area * boost)
    const e = G.bulgeL * E_BULGE / (DENS_BULGE * boost)
    // apparent flattening of an oblate spheroid seen at the disc's inclination
    const q = Math.sqrt(P.ci * P.ci + G.bulgeQ * G.bulgeQ * P.si * P.si)
    const cp = Math.cos(G.pa)
    const sp = Math.sin(G.pa)
    const cap = G.kind === 'elliptical' ? 1.3 : 0.8
    for (let i = 0; i < n; i++) {
      let rr = sersicRadius(gr, G.bulgeRe, G.bulgeN)
      // rejection with a soft edge: no ring where the profile is cut
      while (rr > cap || gr() > smooth(cap, cap * 0.55, rr))
        rr = sersicRadius(gr, G.bulgeRe, G.bulgeN)
      const a = gr() * Math.PI * 2
      const u = rr * fcos(a)
      const v = rr * fsin(a) * q
      const X = P.cx + P.sc * (u * cp - v * sp)
      const Y = P.cy + P.sc * (u * sp + v * cp)
      if (X < 0 || Y < 0 || X >= w || Y >= h)
        continue
      const p = (Y | 0) * w + (X | 0)
      const k = Math.round((0.08 + gr() * 0.24) * (LUT_N - 1))
      LR[p] += lut.r[k] * e
      LG[p] += lut.g[k] * e
      LB[p] += lut.b[k] * e
    }
    if (G.shells > 0) {
      // shells alternate sides, each with a sharp outer edge
      const n2 = Math.round(DENS_BULGE * area * 0.5)
      const e2 = E_BULGE * 0.22 / DENS_BULGE
      const base = G.phi0
      for (let i = 0; i < n2; i++) {
        const k = Math.floor(gr() * G.shells)
        const rad = G.bulgeRe * 1.6 * 1.32 ** k
        const ang = base + k * Math.PI + gaussian(gr) * 0.5
        const rr = rad * (1 - Math.abs(gaussian(gr)) * 0.08)
        const u = rr * Math.cos(ang)
        const v = rr * Math.sin(ang) * q
        const X = P.cx + P.sc * (u * cp - v * sp)
        const Y = P.cy + P.sc * (u * sp + v * cp)
        if (X < 0 || Y < 0 || X >= w || Y >= h)
          continue
        const p = (Y | 0) * w + (X | 0)
        const c = Math.round((0.2 + gr() * 0.25) * (LUT_N - 1))
        LR[p] += lut.r[c] * e2
        LG[p] += lut.g[c] * e2
        LB[p] += lut.b[c] * e2
      }
    }
    if (G.kind === 'elliptical') {
      // globular clusters swarming around the spheroid
      const ng = int(kr, 25, 70)
      for (let i = 0; i < ng; i++) {
        let rr = sersicRadius(kr, G.bulgeRe * 2.2, 2)
        while (rr > 1.5)
          rr = sersicRadius(kr, G.bulgeRe * 2.2, 2)
        const a = kr() * Math.PI * 2
        const u = rr * Math.cos(a)
        const v = rr * Math.sin(a) * q
        sprites.push({ x: G.cx + G.size * (u * cp - v * sp), y: G.cy + G.size * (u * sp + v * cp), r: 0.0018 + kr() * 0.0012, t: 0.3, a: 0.35 + kr() * 0.4 })
      }
    }
  }

  if (G.kind === 'elliptical')
    return

  const M = G.kind === 'spiral' ? armMap(G, stream(hash, `plan${gi}`)) : null
  // irregulars are puffy clouds, discs are thin
  const thick = G.kind === 'irregular' ? 0.14 : 0.035
  const ns = G.noiseSeed
  // how welcoming a point is to young stars: arm crests, broken up by patchiness
  const youthAt = (x: number, y: number) => {
    let p: number
    if (M) {
      p = smooth(1, M.hi, contrastAt(M, x, y)) ** 1.8
    }
    else {
      p = 0
      for (const [cx, cy, s, wgt] of G.clumps) {
        const d2 = ((x - cx) ** 2 + (y - cy) ** 2) / (s * s)
        p = Math.max(p, Math.exp(-d2) * Math.min(1, wgt))
      }
    }
    // bright and faint stretches along the arms, then small-scale patches
    const nl = smooth(0.25, 0.75, fbm(x * 2.6 + 1.9, y * 2.6 + 5.2, ns + 3, 2))
    p *= 0.35 + nl * 1.3
    const fl = Math.max(0.3, G.flocc)
    const nz = smooth(0.3, 0.72, fbm(x * 7 + 7.1, y * 7 + 3.3, ns, 3))
    p *= 1 - fl + fl * nz * 1.8
    return Math.min(1, p)
  }
  // dust: just inside each arm (the arm sampled one step outwards), plus a thin haze
  const dustAt = (x: number, y: number) => {
    let wgt: number
    if (M) {
      const rr = Math.hypot(x, y) + 1e-6
      const k = 1 + 0.035 / rr
      wgt = 0.05 + smooth(1.02, M.hi, contrastAt(M, x * k, y * k)) ** 2 * 0.95
      // no dust in the bulge; along a bar it would read as a hole
      const inner = G.aBar > 0 ? G.aBar * 0.85 : G.rCore * 0.35
      wgt *= smooth(inner, inner + G.rCore * 0.75 + 0.05, rr)
    }
    else {
      wgt = 0.5 * smooth(0.45, 0.7, fbm(x * 4, y * 4, ns + 77, 3))
    }
    if (G.flocc > 0)
      wgt *= 0.4 + 1.2 * smooth(0.3, 0.75, fbm(x * 7 + 1.7, y * 7, ns + 31, 3))
    return wgt
  }
  // both are tabulated once: sampling them per particle would cost far more
  const ext = G.kind === 'spiral' ? 1.65 : 1.9
  const YM = planeMap(ext, 112, youthAt)
  const DM = G.dust > 0 ? planeMap(ext, 112, dustAt) : null
  const youth = (x: number, y: number) => mapAt(YM, x, y)
  let clumpTotal = 0
  for (const c of G.clumps)
    clumpTotal += c[3]
  const sampleIrregular = (rr: Rng, out: Float64Array, spread: number) => {
    if (rr() < 0.45) {
      const a = discRadius(rr, G.rd * 0.9)
      const t = rr() * Math.PI * 2
      out[0] = a * fcos(t)
      out[1] = a * fsin(t) * 0.75
    }
    else {
      let u = rr() * clumpTotal
      let c = G.clumps[0]
      for (const cc of G.clumps) {
        u -= cc[3]
        if (u < 0) {
          c = cc
          break
        }
      }
      out[0] = c[0] + nearGauss(rr) * c[2] * spread
      out[1] = c[1] + nearGauss(rr) * c[2] * spread
    }
  }

  // --- old disc: every orbit, evenly in phase
  {
    const n = Math.round(DENS_OLD * area)
    const e = G.discL * E_OLD / DENS_OLD * (G.kind === 'irregular' ? 0.45 : 1)
    for (let i = 0; i < n; i++) {
      if (G.kind === 'spiral') {
        const a = discRadius(gr, G.rd)
        if (a > 1.8)
          continue
        orbit(G, a, gr() * Math.PI * 2, pt, gr() < 0.5 ? 0.3 : 1)
      }
      else {
        sampleIrregular(gr, pt, 1.2)
      }
      splat(pt[0], pt[1], height(gr, thick), 0.3 + gr() * 0.22, e)
    }
  }

  // --- young disc: kept where the arms are
  {
    const target = Math.round(DENS_YOUNG * area * G.youngL)
    const e = E_YOUNG / DENS_YOUNG * (G.kind === 'irregular' ? 0.4 : 1)
    let got = 0
    for (let tries = 0; tries < target * 7 && got < target; tries++) {
      if (G.kind === 'spiral') {
        const a = discRadius(gr, G.rd * 1.15)
        if (a > 1.6 || a < G.rCore * 0.5)
          continue
        orbit(G, a, gr() * Math.PI * 2, pt)
      }
      else {
        sampleIrregular(gr, pt, 0.8)
      }
      const p = youth(pt[0], pt[1])
      if (gr() >= p)
        continue
      got++
      const jit = (0.003 + 0.01 * gr()) * (0.6 + Math.hypot(pt[0], pt[1]))
      splat(pt[0] + nearGauss(gr) * jit, pt[1] + nearGauss(gr) * jit, height(gr, thick * 0.35), 0.62 + gr() * 0.38, e)
    }
  }

  // --- dust
  if (DM) {
    const tries = Math.round(DENS_DUST * area)
    const glow = pal.dustGlow ? hexRGB(pal.dustGlow) : null
    const amt = G.dust * TAU / DENS_DUST
    for (let i = 0; i < tries; i++) {
      if (G.kind === 'spiral') {
        const a = discRadius(gr, G.rd * 1.4)
        if (a > 1.4)
          continue
        orbit(G, a, gr() * Math.PI * 2, pt)
      }
      else {
        sampleIrregular(gr, pt, 1)
      }
      const wgt = mapAt(DM!, pt[0], pt[1])
      if (wgt <= 0)
        continue
      const z = height(gr, 0.008)
      const y1 = pt[1] * P.ci - z * P.si
      const X = P.cx + P.sc * (pt[0] * P.cp - y1 * P.sp)
      const Y = P.cy + P.sc * (pt[0] * P.sp + y1 * P.cp)
      if (X < 0 || Y < 0 || X >= w || Y >= h)
        continue
      const p = (Y | 0) * w + (X | 0)
      LT[p] += amt * wgt
      if (glow) {
        const e = amt * wgt * 0.9
        LR[p] += glow[0] * e
        LG[p] += glow[1] * e
        LB[p] += glow[2] * e
      }
    }
  }

  // --- H II regions (pink knots) and the brightest young stars: fixed counts,
  // drawn from their own stream so they do not depend on the canvas size
  {
    const hii = hexRGB(pal.hii)
    let got = 0
    const want = G.hii
    for (let tries = 0; tries < want * 60 && got < want; tries++) {
      if (G.kind === 'spiral') {
        const a = discRadius(kr, G.rd * 1.2)
        if (a > 1.3 || a < G.rCore * 0.7)
          continue
        orbit(G, a, kr() * Math.PI * 2, pt)
      }
      else {
        sampleIrregular(kr, pt, 0.7)
      }
      const p = youth(pt[0], pt[1])
      if (kr() >= p * p)
        continue
      got++
      const z = height(kr, 0.006)
      const y1 = pt[1] * P.ci - z * P.si
      const X = P.cx + P.sc * (pt[0] * P.cp - y1 * P.sp)
      const Y = P.cy + P.sc * (pt[0] * P.sp + y1 * P.cp)
      const sz = (0.004 + 0.011 * kr() ** 2) * P.sc
      const amp = (0.5 + kr() * 0.9) * 1.1
      ellipseBlob(L, X, Y, sz, sz * (P.ci * 0.7 + 0.3), G.pa, hii[0] * amp, hii[1] * amp, hii[2] * amp)
      // a cluster of hot stars inside the knot
      const nb = int(kr, 1, 3)
      for (let b = 0; b < nb; b++)
        toSprite(pt[0] + gaussian(kr) * 0.006, pt[1] + gaussian(kr) * 0.006, z, 0.0014 + kr() * 0.0016, 0.85 + kr() * 0.15, 0.55 + kr() * 0.45, b === 0)
    }
    const nStars = Math.round(G.size * 2200 * (0.3 + G.youngL))
    for (let i = 0, tries = 0; i < nStars && tries < nStars * 30; tries++) {
      if (G.kind === 'spiral') {
        const a = discRadius(kr, G.rd * 1.15)
        if (a > 1.5)
          continue
        orbit(G, a, kr() * Math.PI * 2, pt)
      }
      else {
        sampleIrregular(kr, pt, 0.9)
      }
      if (kr() >= youth(pt[0], pt[1]) * 0.9 + 0.05)
        continue
      i++
      toSprite(pt[0], pt[1], height(kr, 0.012), 0.0007 + kr() ** 3 * 0.0016, 0.55 + kr() * 0.45, 0.2 + kr() * 0.45)
    }
  }
}

/** A faint stream of stars along a polyline (canvas short-side units). */
function drawStream(L: Light, s: Scene['streams'][number], r: Rng, lut: Lut) {
  const segs = s.pts.length - 1
  const n = Math.round(0.35 * L.s * L.s * s.w * s.L)
  const e = 0.34
  for (let i = 0; i < n; i++) {
    const u = r() * segs
    const k = Math.min(segs - 1, Math.floor(u))
    const t = u - k
    const [x0, y0] = s.pts[k]
    const [x1, y1] = s.pts[k + 1]
    // straight segments: the bend comes from the middle points
    const x = x0 + (x1 - x0) * t + gaussian(r) * s.w * 0.45
    const y = y0 + (y1 - y0) * t + gaussian(r) * s.w * 0.45
    const X = L.w / 2 + x * L.s
    const Y = L.h / 2 + y * L.s
    if (X < 0 || Y < 0 || X >= L.w || Y >= L.h)
      continue
    const p = (Y | 0) * L.w + (X | 0)
    const c = Math.round((0.25 + r() * 0.3) * (LUT_N - 1))
    L.r[p] += lut.r[c] * e
    L.g[p] += lut.g[c] * e
    L.b[p] += lut.b[c] * e
  }
}

/** Foreground veil: emission clouds and dark filaments, entering from one side. */
function drawNebula(L: Light, r: Rng, pal: Palette) {
  const seed = Math.floor(r() * 1e9)
  const ang = r() * Math.PI * 2
  const dx = Math.cos(ang)
  const dy = Math.sin(ang)
  const c1 = hexRGB(pal.nebula[0])
  const c2 = hexRGB(pal.nebula[1])
  const amp = range(r, 0.35, 0.55)
  // evaluate the noise on a coarse grid, then interpolate per buffer pixel
  const step = Math.max(2, Math.round(L.s / 180))
  const gw = Math.ceil(L.w / step) + 2
  const gh = Math.ceil(L.h / step) + 2
  const em = new Float32Array(gw * gh)
  const mix = new Float32Array(gw * gh)
  const dark = new Float32Array(gw * gh)
  for (let j = 0; j < gh; j++) {
    for (let i = 0; i < gw; i++) {
      const x = (i * step - L.w / 2) / L.s
      const y = (j * step - L.h / 2) / L.s
      const side = smooth(-0.15, 0.75, x * dx + y * dy)
      const wx = fbm(x * 1.6 + 3, y * 1.6, seed + 5, 3) * 1.4
      const wy = fbm(x * 1.6, y * 1.6 + 9, seed + 6, 3) * 1.4
      const n = fbm(x * 2.2 + wx, y * 2.2 + wy, seed, 5)
      em[j * gw + i] = side * smooth(0.42, 0.8, n) ** 1.6
      mix[j * gw + i] = smooth(0.3, 0.7, fbm(x * 1.3, y * 1.3, seed + 9, 2))
      dark[j * gw + i] = side * smooth(0.55, 0.72, fbm(x * 3.1 + wy, y * 3.1 + wx, seed + 13, 4))
    }
  }
  for (let y = 0; y < L.h; y++) {
    const fy = y / step
    const j = Math.floor(fy)
    const v = fy - j
    for (let x = 0; x < L.w; x++) {
      const fx = x / step
      const i = Math.floor(fx)
      const u = fx - i
      const o = j * gw + i
      const bil = (a: Float32Array) => {
        const t0 = a[o] + (a[o + 1] - a[o]) * u
        const t1 = a[o + gw] + (a[o + gw + 1] - a[o + gw]) * u
        return t0 + (t1 - t0) * v
      }
      const e = bil(em) * amp
      const m = bil(mix)
      const p = y * L.w + x
      L.r[p] += (c1[0] + (c2[0] - c1[0]) * m) * e
      L.g[p] += (c1[1] + (c2[1] - c1[1]) * m) * e
      L.b[p] += (c1[2] + (c2[2] - c1[2]) * m) * e
      L.tau[p] += bil(dark) * 0.9
    }
  }
}

/** Faint, distant galaxies behind everything. */
function drawDeepField(L: Light, r: Rng, W: number, H: number, S: number) {
  const n = Math.round(70 * (W / S) * (H / S))
  const cols: RGB[] = [[1, 0.62, 0.38], [1, 0.8, 0.55], [0.75, 0.82, 1], [1, 0.5, 0.42]]
  for (let i = 0; i < n; i++) {
    const x = r() * L.w
    const y = r() * L.h
    const sz = (0.0016 + 0.0055 * r() ** 3) * L.s
    const q = range(r, 0.25, 1)
    const ang = r() * Math.PI
    const c = pick(r, cols)
    const amp = range(r, 0.15, 0.45)
    ellipseBlob(L, x, y, sz, sz * q, ang, c[0] * amp, c[1] * amp, c[2] * amp)
  }
}

type Cv = HTMLCanvasElement | OffscreenCanvas
type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

function canvas(w: number, h: number): { cv: Cv, g: Ctx2D } {
  if (typeof OffscreenCanvas !== 'undefined') {
    const cv = new OffscreenCanvas(w, h)
    return { cv, g: cv.getContext('2d')! }
  }
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  return { cv, g: cv.getContext('2d')! }
}

/** Soft round star sprites, one per colour bin, white-hot in the middle. */
function starSprites(colors: Array<[number, number, number]>): Cv[] {
  const px = 64
  return colors.map(([cr, cg, cb]) => {
    const { cv, g } = canvas(px, px)
    const grd = g.createRadialGradient(px / 2, px / 2, 0, px / 2, px / 2, px / 2)
    const c = (k: number, a: number) => `rgba(${Math.round(255 * (cr + (1 - cr) * k))},${Math.round(255 * (cg + (1 - cg) * k))},${Math.round(255 * (cb + (1 - cb) * k))},${a})`
    grd.addColorStop(0, c(0.85, 1))
    grd.addColorStop(0.12, c(0.5, 0.9))
    grd.addColorStop(0.3, c(0, 0.32))
    grd.addColorStop(0.6, c(0, 0.07))
    grd.addColorStop(1, c(0, 0))
    g.fillStyle = grd
    g.fillRect(0, 0, px, px)
    return cv
  })
}

function render(ctx: CanvasRenderingContext2D, W: number, H: number, hash: string) {
  const f = features(hash)
  const pal = PAL[f.Palette]
  const lut = makeLut(pal.ramp)
  const S = Math.min(W, H)
  const scene = makeScene(hash, f)

  const L = makeLight(W, H)
  if (f.Field === 'Deep field')
    drawDeepField(L, stream(hash, 'deep'), W, H, S)
  if (f.Field === 'Nebula')
    drawNebula(L, stream(hash, 'nebula'), pal)
  const sprites: Sprite[] = []
  const sr = stream(hash, 'streams')
  for (const s of scene.streams)
    drawStream(L, s, sr, lut)
  scene.galaxies.forEach((G, i) => drawGalaxy(L, G, i, hash, pal, lut, sprites))

  const px = develop(L, {
    extinction: pal.extinction,
    sharp: 0.12,
    glow: 1.15,
    bloom: 0.55,
    exposure: 1,
    bg: hexRGB(pal.bg),
  })
  const { cv: lc, g: lg } = canvas(L.w, L.h)
  const img = lg.createImageData(L.w, L.h)
  img.data.set(px)
  lg.putImageData(img, 0, 0)
  ctx.save()
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(lc, 0, 0, L.w, L.h, 0, 0, W, H)

  // --- resolved stars, at full resolution
  const bins = 8
  const cols: Array<[number, number, number]> = []
  for (let i = 0; i < bins; i++) {
    const k = Math.round(i / (bins - 1) * (LUT_N - 1))
    cols.push([lut.r[k], lut.g[k], lut.b[k]])
  }
  cols.push(hexRGB(pal.hii))
  const spr = starSprites(cols)
  ctx.globalCompositeOperation = 'lighter'
  const put = (x: number, y: number, rad: number, ci: number, a: number) => {
    const R = rad * S * 3.2
    if (R < 0.4)
      return
    ctx.globalAlpha = Math.min(1, a)
    ctx.drawImage(spr[ci], x - R, y - R, R * 2, R * 2)
  }
  for (const s of sprites) {
    const ci = s.hii ? bins : Math.min(bins - 1, Math.round(s.t * (bins - 1)))
    put(W / 2 + s.x * S, H / 2 + s.y * S, s.r * (s.hii ? 1.6 : 1), ci, s.a)
  }

  // foreground stars of our own galaxy, across the whole canvas
  const fr = stream(hash, 'field')
  const dens = f.Field === 'Rich' ? 700 : f.Field === 'Sparse' ? 140 : f.Field === 'Nebula' ? 320 : 200
  const nField = Math.round(dens * (W / S) * (H / S))
  const spikes: Array<[number, number, number, number]> = []
  const spikeAng = fr() * Math.PI / 2
  for (let i = 0; i < nField; i++) {
    const x = fr() * W
    const y = fr() * H
    // luminosity function: many faint stars, very few bright ones
    const lum = 0.012 / (fr() + 0.012)
    const t = fr()
    const ci = Math.min(bins - 1, Math.floor((t * t * 0.6 + t * 0.4) * bins))
    put(x, y, 0.0008 + 0.0042 * Math.sqrt(lum), ci, 0.25 + lum * 1.4)
    if (lum > 0.35 && f.Field !== 'Deep field')
      spikes.push([x, y, lum, ci])
  }
  // diffraction spikes of the brightest foreground stars (a four-vane spider)
  ctx.lineCap = 'round'
  for (const [x, y, lum, ci] of spikes.slice(0, 9)) {
    const [cr, cg, cb] = cols[ci]
    const len = (0.03 + 0.07 * lum) * S
    for (let k = 0; k < 4; k++) {
      const a = spikeAng + k * Math.PI / 2
      const ex = x + Math.cos(a) * len
      const ey = y + Math.sin(a) * len
      const grd = ctx.createLinearGradient(x, y, ex, ey)
      const rgb = `${Math.round(cr * 255)},${Math.round(cg * 255)},${Math.round(cb * 255)}`
      grd.addColorStop(0, `rgba(${rgb},0.85)`)
      grd.addColorStop(1, `rgba(${rgb},0)`)
      ctx.globalAlpha = 1
      ctx.strokeStyle = grd
      ctx.lineWidth = Math.max(0.6, 0.0016 * S)
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(ex, ey)
      ctx.stroke()
    }
  }

  // --- a photographic plate prints as a negative
  if (pal.paper) {
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'difference'
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, W, H)
    ctx.globalCompositeOperation = 'multiply'
    ctx.fillStyle = pal.paper
    ctx.fillRect(0, 0, W, H)
  }
  ctx.restore()
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
}

export default {
  slug: 'galaxy',
  title: 'Galaxy',
  summary: 'Spiral galaxies grown from nested, rotated orbits: density-wave arms, bars, dust lanes and pink H II knots along the Hubble sequence.',
  order: 620,
  traits: TRAITS,
  features,
  render,
  // Seed-of-seeds 0x6a1a0000 ("gallery" stream): the first hash found for each
  // type x palette pair, twelve pairs in all; a classic dusty Sb leads as the cover.
  gallery: [
    '0x05dc97636456c2a8ffe2bad50b634652b9ac4ef19e0a869fa9879fda0a1c779d',
    '0x68490ac03b14474418b3c09c0e030e804191be4eb925af53481f6fe1e3135b70',
    '0xa29c749cf3d11c268a2491652fbc49572d2ca03d474eee94d0f9a712e936ab49',
    '0x3d2b624e675f0606afcb75ff9d94f3fcf5aa1919611e04b182f1355b222009a9',
    '0x9bf3fcc528be781d1c67b44260e1589744f1174c4dcbdf9e2ab1040142e264f7',
    '0x13af9bfa929c3fe168b577d8ed23f0f1d97926a8e7a391b3a5aac40529765de5',
    '0x699f44da5559cbf6d898cb3380bfb90feea0727079a0c38ce5b330a956f7b0a2',
    '0x41e25b0315c3c4062f253e095e65501c23bedc68122d27f045213c6d5c097429',
    '0x1669a8efe9faa603bfd718153feb21a3c3ab2209a7c740dd02150c046f29acc0',
    '0xfe7903f66371b3bba717fddf3be05fb2c84df83670f42c63b7d173110e372485',
    '0x730221f37b753bd3c018fa567b6ea531929f3a418344f4478746921b54527d42',
    '0x1ad687e5786a00ca98d48ca395066f299d22246feb18d92a72640563427b7e7f',
  ],
} satisfies Series
