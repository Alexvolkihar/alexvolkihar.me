// The invented sky: a catalogue of stars on the unit sphere, a galactic plane
// with its Milky Way, constellations carved out of a right-ascension /
// declination cell grid, their stick figures, and deep-sky objects.
//
// Everything here lives on the celestial sphere and is independent of the
// canvas: the projections in ./proj.ts only decide where it lands.

import type { Rng } from '../random'
import { chance, gaussian, int, pick, range } from '../random'

export type Vec = [number, number, number]

const TAU = Math.PI * 2

export const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
function cross(a: Vec, b: Vec): Vec {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}
function norm(a: Vec): Vec {
  const l = Math.hypot(a[0], a[1], a[2]) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}
export function fromRaDec(ra: number, dec: number): Vec {
  const c = Math.cos(dec)
  return [c * Math.cos(ra), c * Math.sin(ra), Math.sin(dec)]
}
export function raOf(v: Vec): number {
  const a = Math.atan2(v[1], v[0])
  return a < 0 ? a + TAU : a
}
export const decOf = (v: Vec) => Math.asin(Math.max(-1, Math.min(1, v[2])))

function randomUnit(r: Rng): Vec {
  const z = 2 * r() - 1
  const a = TAU * r()
  const s = Math.sqrt(1 - z * z)
  return [s * Math.cos(a), s * Math.sin(a), z]
}

/** Great-circle interpolation from a to b, n + 1 points. */
export function slerp(a: Vec, b: Vec, n: number): Vec[] {
  const out: Vec[] = []
  const om = Math.acos(Math.max(-1, Math.min(1, dot(a, b))))
  const so = Math.sin(om)
  for (let i = 0; i <= n; i++) {
    const t = i / n
    if (so < 1e-6) {
      out.push(a)
      continue
    }
    const ka = Math.sin((1 - t) * om) / so
    const kb = Math.sin(t * om) / so
    out.push([a[0] * ka + b[0] * kb, a[1] * ka + b[1] * kb, a[2] * ka + b[2] * kb])
  }
  return out
}

// ---------------------------------------------------------------------------
// 3D value noise for the Milky Way (integer-hashed lattice, no sin()).

export function makeNoise3(r: Rng) {
  const P = 256
  const perm = new Uint8Array(P * 2)
  const val = new Float32Array(P)
  const idx = Array.from({ length: P }, (_, i) => i)
  for (let i = P - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    const t = idx[i]
    idx[i] = idx[j]
    idx[j] = t
  }
  for (let i = 0; i < P * 2; i++)
    perm[i] = idx[i & 255]
  for (let i = 0; i < P; i++)
    val[i] = r()
  const fade = (t: number) => t * t * (3 - 2 * t)
  const v = (x: number, y: number, z: number) => val[perm[perm[perm[x & 255] + (y & 255)] + (z & 255)]]
  return (x: number, y: number, z: number) => {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const zi = Math.floor(z)
    const u = fade(x - xi)
    const w = fade(y - yi)
    const s = fade(z - zi)
    const a = v(xi, yi, zi) + u * (v(xi + 1, yi, zi) - v(xi, yi, zi))
    const b = v(xi, yi + 1, zi) + u * (v(xi + 1, yi + 1, zi) - v(xi, yi + 1, zi))
    const c = v(xi, yi, zi + 1) + u * (v(xi + 1, yi, zi + 1) - v(xi, yi, zi + 1))
    const d = v(xi, yi + 1, zi + 1) + u * (v(xi + 1, yi + 1, zi + 1) - v(xi, yi + 1, zi + 1))
    const e = a + w * (b - a)
    const f = c + w * (d - c)
    return e + s * (f - e)
  }
}

// ---------------------------------------------------------------------------

export interface Galaxy {
  /** Galactic north pole and the direction of the galactic centre. */
  pole: Vec
  centre: Vec
  side: Vec
}

export type DsoKind = 'open' | 'globular' | 'galaxy' | 'nebula' | 'planetary'

export interface Dso {
  v: Vec
  kind: DsoKind
  /** Apparent size, radians. */
  size: number
  /** Position angle and axis ratio (galaxies). */
  pa: number
  ratio: number
  num: number
}

export interface Constellation {
  name: string
  /** Star indices of the figure, brightest first. */
  stars: number[]
  edges: [number, number][]
}

export interface Sky {
  n: number
  x: Float32Array
  y: Float32Array
  z: Float32Array
  mag: Float32Array
  /** 0..1 colour index (blue-white to orange). */
  tint: Float32Array
  galaxy: Galaxy
  cons: Constellation[]
  /** Owner constellation of each RA x Dec cell (RA_CELLS x DEC_CELLS). */
  owner: Int16Array
  dsos: Dso[]
  catalogue: string
  mLim: number
}

export const RA_CELLS = 48
export const DEC_CELLS = 36

export function cellOf(v: Vec): number {
  const ra = raOf(v)
  const dec = decOf(v)
  const i = Math.min(RA_CELLS - 1, Math.floor(ra / TAU * RA_CELLS))
  const j = Math.min(DEC_CELLS - 1, Math.max(0, Math.floor((dec + Math.PI / 2) / Math.PI * DEC_CELLS)))
  return j * RA_CELLS + i
}

export interface SkyOptions {
  /** Faintest magnitude in the catalogue. */
  mLim: number
  /** Share of faint stars gathered along the galactic plane. */
  band: number
  /** Number of deep-sky objects over the whole sphere. */
  dsoCount: number
  figures: 'Spanning Trees' | 'Chains' | 'Bordered'
}

// Real single-word constellation names: an invented name equal to one of them is rejected.
const REAL = new Set(['ANDROMEDA', 'ANTLIA', 'APUS', 'AQUARIUS', 'AQUILA', 'ARA', 'ARIES', 'AURIGA', 'BOOTES', 'CAELUM', 'CAMELOPARDALIS', 'CANCER', 'CAPRICORNUS', 'CARINA', 'CASSIOPEIA', 'CENTAURUS', 'CEPHEUS', 'CETUS', 'CHAMAELEON', 'CIRCINUS', 'COLUMBA', 'CRATER', 'CRUX', 'CYGNUS', 'DELPHINUS', 'DORADO', 'DRACO', 'EQUULEUS', 'ERIDANUS', 'FORNAX', 'GEMINI', 'GRUS', 'HERCULES', 'HOROLOGIUM', 'HYDRA', 'HYDRUS', 'INDUS', 'LACERTA', 'LEO', 'LEPUS', 'LIBRA', 'LUPUS', 'LYNX', 'LYRA', 'MENSA', 'MICROSCOPIUM', 'MONOCEROS', 'MUSCA', 'NORMA', 'OCTANS', 'OPHIUCHUS', 'ORION', 'PAVO', 'PEGASUS', 'PERSEUS', 'PHOENIX', 'PICTOR', 'PISCES', 'PUPPIS', 'PYXIS', 'RETICULUM', 'SAGITTA', 'SAGITTARIUS', 'SCORPIUS', 'SCULPTOR', 'SCUTUM', 'SERPENS', 'SEXTANS', 'TAURUS', 'TELESCOPIUM', 'TRIANGULUM', 'TUCANA', 'VELA', 'VIRGO', 'VOLANS', 'VULPECULA', 'ARGO', 'URSA', 'CANIS', 'COMA', 'CORONA', 'LEO MINOR', 'PISCIS'])

const ONSETS = ['C', 'D', 'F', 'G', 'L', 'M', 'N', 'P', 'R', 'S', 'T', 'V', 'TH', 'PH', 'CH', 'BR', 'CR', 'TR', 'ST', 'QU', 'X', 'Z']
const VOWELS = ['A', 'E', 'I', 'O', 'U', 'AE', 'EU', 'IA']
const ENDINGS = ['US', 'A', 'IS', 'ION', 'ULA', 'ARIUS', 'ORA', 'ES', 'IUM', 'ENS', 'ITA', 'ON', 'AX', 'ELLA', 'ANTE']

export function inventName(r: Rng): string {
  for (;;) {
    let s = ''
    const syl = int(r, 1, 3)
    if (chance(r, 0.25))
      s += pick(r, VOWELS)
    for (let i = 0; i < syl; i++)
      s += pick(r, ONSETS) + pick(r, VOWELS)
    s += pick(r, ONSETS).slice(0, 1) + pick(r, ENDINGS)
    s = s.replace(/([AEIOU])\1/g, '$1').replace(/^QU(?=[^AEIO])/, 'Q')
    if (s.length >= 5 && s.length <= 12 && !REAL.has(s))
      return s
  }
}

/** Best-candidate (Mitchell) points on the sphere. */
function spreadPoints(r: Rng, k: number, tries: number): Vec[] {
  const pts: Vec[] = []
  for (let i = 0; i < k; i++) {
    let best: Vec = randomUnit(r)
    let bestD = -Infinity
    for (let t = 0; t < tries; t++) {
      const c = t === 0 ? best : randomUnit(r)
      let near = Infinity
      for (const p of pts)
        near = Math.min(near, 1 - dot(p, c))
      if (near > bestD) {
        bestD = near
        best = c
      }
    }
    pts.push(best)
  }
  return pts
}

function prim(vs: Vec[]): [number, number][] {
  const n = vs.length
  const inT = new Uint8Array(n)
  const best = new Float64Array(n).fill(Infinity)
  const from = new Int32Array(n).fill(-1)
  const edges: [number, number][] = []
  best[0] = 0
  for (let k = 0; k < n; k++) {
    let u = -1
    for (let i = 0; i < n; i++) {
      if (!inT[i] && (u < 0 || best[i] < best[u]))
        u = i
    }
    inT[u] = 1
    if (from[u] >= 0)
      edges.push([from[u], u])
    for (let i = 0; i < n; i++) {
      const d = 1 - dot(vs[u], vs[i])
      if (!inT[i] && d < best[i]) {
        best[i] = d
        from[i] = u
      }
    }
  }
  return edges
}

/** Number of tree edges between a and b (BFS). */
function treeHops(n: number, edges: [number, number][], a: number, b: number): number {
  const adj: number[][] = Array.from({ length: n }, () => [])
  for (const [p, q] of edges) {
    adj[p].push(q)
    adj[q].push(p)
  }
  const dist = new Int32Array(n).fill(-1)
  dist[a] = 0
  const queue = [a]
  while (queue.length) {
    const u = queue.shift()!
    for (const w of adj[u]) {
      if (dist[w] < 0) {
        dist[w] = dist[u] + 1
        queue.push(w)
      }
    }
  }
  return dist[b]
}

/** Greedy nearest-neighbour walk; a jump much longer than the walk so far becomes a branch. */
function chain(vs: Vec[]): [number, number][] {
  const n = vs.length
  const used = new Uint8Array(n)
  const order = [0]
  used[0] = 1
  const edges: [number, number][] = []
  let total = 0
  for (let k = 1; k < n; k++) {
    const last = order[order.length - 1]
    let bi = -1
    let bd = Infinity
    for (let i = 0; i < n; i++) {
      const d = Math.acos(Math.min(1, dot(vs[last], vs[i])))
      if (!used[i] && d < bd) {
        bd = d
        bi = i
      }
    }
    const mean = k > 1 ? total / (k - 1) : bd
    let from = last
    if (k > 1 && bd > 1.7 * mean) {
      // branch: attach to the nearest star already in the figure
      let nd = Infinity
      for (const j of order) {
        const d = Math.acos(Math.min(1, dot(vs[j], vs[bi])))
        if (d < nd) {
          nd = d
          from = j
        }
      }
      bd = nd
    }
    edges.push([from, bi])
    total += bd
    used[bi] = 1
    order.push(bi)
  }
  return edges
}

export function buildSky(rs: { sky: Rng, figures: Rng, dso: Rng, names: Rng }, o: SkyOptions): Sky {
  const r = rs.sky
  // Galactic frame: a random pole, a centre direction in its plane.
  const pole = randomUnit(r)
  let ref: Vec = Math.abs(pole[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]
  ref = norm(cross(pole, ref))
  const ang = r() * TAU
  const side0 = cross(pole, ref)
  const centre = norm([
    ref[0] * Math.cos(ang) + side0[0] * Math.sin(ang),
    ref[1] * Math.cos(ang) + side0[1] * Math.sin(ang),
    ref[2] * Math.cos(ang) + side0[2] * Math.sin(ang),
  ])
  const side = cross(pole, centre)
  const galaxy: Galaxy = { pole, centre, side }
  const fromGal = (l: number, b: number): Vec => {
    const cb = Math.cos(b)
    const cl = Math.cos(l) * cb
    const sl = Math.sin(l) * cb
    const sb = Math.sin(b)
    return [
      centre[0] * cl + side[0] * sl + pole[0] * sb,
      centre[1] * cl + side[1] * sl + pole[1] * sb,
      centre[2] * cl + side[2] * sl + pole[2] * sb,
    ]
  }

  // Magnitudes: the cumulative count of stars brighter than m grows roughly as
  // 10^(0.45 m) at naked-eye magnitudes (Seares & van Rhijn star counts).
  const SLOPE = 0.45
  const n = Math.round(4200 * 10 ** (SLOPE * (o.mLim - 6)))
  const x = new Float32Array(n)
  const y = new Float32Array(n)
  const z = new Float32Array(n)
  const mag = new Float32Array(n)
  const tint = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    let m = o.mLim + Math.log10(1 - r()) / SLOPE
    const u = r()
    // the few stars beyond the brightest bound are spread just below it
    if (m < -1.4)
      m = -1.4 + u * 0.5
    let v: Vec
    if (m > 3.5 && r() < o.band) {
      // galactic longitude favours the centre, latitude is narrow
      let l = (r() - 0.5) * TAU
      if (r() < 0.45)
        l *= 0.35
      const b = gaussian(r) * (0.1 + 0.08 * Math.cos(l) ** 2)
      v = fromGal(l, b)
    }
    else {
      v = randomUnit(r)
    }
    x[i] = v[0]
    y[i] = v[1]
    z[i] = v[2]
    mag[i] = m
    tint[i] = r()
  }

  // Constellations: centres spread on the sphere own the RA/Dec cells, which
  // gives stepped boundaries along hour circles and parallels.
  const fr = rs.figures
  const k = int(fr, 40, 54)
  const centres = spreadPoints(fr, k, 10)
  const owner = new Int16Array(RA_CELLS * DEC_CELLS)
  for (let j = 0; j < DEC_CELLS; j++) {
    for (let i = 0; i < RA_CELLS; i++) {
      const v = fromRaDec((i + 0.5) / RA_CELLS * TAU, ((j + 0.5) / DEC_CELLS - 0.5) * Math.PI)
      let bi = 0
      let bd = -2
      for (let c = 0; c < k; c++) {
        const d = dot(v, centres[c])
        if (d > bd) {
          bd = d
          bi = c
        }
      }
      owner[j * RA_CELLS + i] = bi
    }
  }
  const members: number[][] = Array.from({ length: k }, () => [])
  const M_FIG = 4.4
  for (let i = 0; i < n; i++) {
    if (mag[i] < M_FIG)
      members[owner[cellOf([x[i], y[i], z[i]])]].push(i)
  }
  const cons: Constellation[] = []
  for (let c = 0; c < k; c++) {
    const want = int(fr, 4, 11)
    const loop = chance(fr, 0.4)
    const list = members[c].sort((a, b) => mag[a] - mag[b] || a - b).slice(0, want)
    const name = inventName(rs.names)
    const vs = list.map(i => [x[i], y[i], z[i]] as Vec)
    let edges: [number, number][] = []
    if (list.length >= 3) {
      edges = o.figures === 'Chains' ? chain(vs) : prim(vs)
      if (loop && list.length >= 5) {
        // close one loop: the shortest missing edge between stars at least three hops apart
        let best: [number, number] | null = null
        let bd = Infinity
        for (let a = 0; a < vs.length; a++) {
          for (let b = a + 1; b < vs.length; b++) {
            const d = 1 - dot(vs[a], vs[b])
            if (d < bd && treeHops(vs.length, edges, a, b) >= 3) {
              bd = d
              best = [a, b]
            }
          }
        }
        if (best)
          edges.push(best)
      }
    }
    cons.push({ name, stars: list, edges: edges.map(([a, b]) => [list[a], list[b]]) })
  }

  // Deep-sky objects, placed where their kind is found in a real galaxy.
  const dr = rs.dso
  const dsos: Dso[] = []
  for (let i = 0; i < o.dsoCount; i++) {
    const t = dr()
    let kind: DsoKind
    let v: Vec
    if (t < 0.3) {
      kind = 'open'
      v = fromGal((dr() - 0.5) * TAU, gaussian(dr) * 0.12)
    }
    else if (t < 0.48) {
      kind = 'globular'
      v = fromGal(gaussian(dr) * 0.5, gaussian(dr) * 0.45)
    }
    else if (t < 0.78) {
      kind = 'galaxy'
      const b = (dr() < 0.5 ? 1 : -1) * Math.asin(range(dr, 0.35, 1))
      v = fromGal(dr() * TAU, b)
    }
    else if (t < 0.9) {
      kind = 'nebula'
      v = fromGal((dr() - 0.5) * TAU * 0.8, gaussian(dr) * 0.06)
    }
    else {
      kind = 'planetary'
      v = fromGal((dr() - 0.5) * TAU, gaussian(dr) * 0.25)
    }
    const size = kind === 'galaxy' ? range(dr, 0.006, 0.02) : kind === 'nebula' ? range(dr, 0.012, 0.035) : range(dr, 0.005, 0.014)
    dsos.push({ v, kind, size, pa: dr() * Math.PI, ratio: range(dr, 0.3, 0.9), num: 0 })
  }
  // catalogue numbers run in right ascension, like the old catalogues
  dsos.slice().sort((a, b) => raOf(a.v) - raOf(b.v)).forEach((d, i) => d.num = i + 1)
  const catalogue = pick(dr, ['K', 'H', 'R', 'B', 'T', 'L'])

  return { n, x, y, z, mag, tint, galaxy, cons, owner, dsos, catalogue, mLim: o.mLim }
}

/** Milky Way surface brightness at v, 0..1. */
export function milkyDensity(gal: Galaxy, noise: (x: number, y: number, z: number) => number, strength: number) {
  return (v: Vec) => {
    const sb = dot(v, gal.pole)
    const b = Math.asin(Math.max(-1, Math.min(1, sb)))
    const cl = dot(v, gal.centre)
    const sl = dot(v, gal.side)
    const l = Math.atan2(sl, cl)
    const toward = (Math.cos(l) + 1) / 2
    const sigma = 0.12 + 0.1 * toward * toward
    const n1 = noise(v[0] * 2.6 + 9.1, v[1] * 2.6 + 3.3, v[2] * 2.6 + 1.7)
    const n2 = noise(v[0] * 7.0 + 31, v[1] * 7.0 + 17, v[2] * 7.0 + 5)
    const bw = b + (n1 - 0.5) * 0.12
    let d = Math.exp(-((bw / sigma) ** 2)) * (0.35 + 0.65 * toward)
    d *= 0.35 + 0.95 * n1 * (0.6 + 0.6 * n2)
    // the dark rift: a lane of dust along the plane, strongest toward the centre
    const rift = Math.exp(-(((b - 0.02 - (n2 - 0.5) * 0.05) / 0.028) ** 2)) * toward ** 2 * 0.75
    d *= 1 - rift
    return Math.max(0, Math.min(1, d * strength))
  }
}
