// Event topologies for the "Tracks" series: what enters the chamber during
// one expansion, and what comes out of each interaction vertex.
//
// Interactions are on the protons of the liquid. Charge, baryon number and
// strangeness are conserved at every vertex; momenta follow a crude
// longitudinal phase space (forward fractions of the beam momentum, an
// exponential transverse momentum of mean ~0.35 GeV/c) and elastic scatters
// use a diffraction slope of 8 GeV^-2. It is not an event generator, but the
// tracks it gives read the way real ones do.

import type { Rng } from '../random'
import type { Kind, Medium, Particle, Product } from './physics'
import { int, range, weighted } from '../random'
import { MEDIA, SPECIES } from './physics'

export type EventKind = 'Interaction' | 'Strange' | 'Showers' | 'Cosmic' | 'Pile-up'

export const EVENT_MEDIUM: Record<EventKind, Medium> = {
  'Interaction': MEDIA.hydrogen,
  'Strange': MEDIA.hydrogen,
  'Showers': MEDIA.neonHydrogen,
  'Cosmic': MEDIA.propane,
  'Pile-up': MEDIA.hydrogen,
}

/** Distance from the beam entry point to the canvas centre, units. */
const START = 1.2

const expo = (r: Rng) => -Math.log(1 - r())
/** The target nucleon recoils slowly; produced hyperons do not. */
const isNucleon = (k: Kind) => k === 'p' || k === 'n'

interface Beam {
  tracks: Particle[]
  /** Offset of each track across the beam, units from the axis. */
  offsets: number[]
}

/** A band of parallel incoming tracks, curved so that they are tangent to theta at the centre line. */
function beam(r: Rng, n: number, kind: Kind, p: number, k: number, theta: number, half: number): Beam {
  const q = SPECIES[kind].q
  const c = Math.cos(theta)
  const s = Math.sin(theta)
  const tracks: Particle[] = []
  const offsets: number[] = []
  for (let i = 0; i < n; i++) {
    const off = -half + (i + 0.5 + (r() - 0.5) * 0.85) * ((2 * half) / n)
    const pp = p * (1 + (r() - 0.5) * 0.03)
    const a0 = theta - ((k * q) / pp) * START
    const dip = (r() - 0.5) * 0.03
    tracks.push({
      kind,
      x: 0.5 - START * c - off * s,
      y: 0.5 - START * s + off * c,
      z: (r() - 0.5) * 0.4,
      ux: Math.cos(a0) * Math.cos(dip),
      uy: Math.sin(a0) * Math.cos(dip),
      uz: Math.sin(dip),
      p: pp,
      age: 1,
    })
    offsets.push(off)
  }
  return { tracks, offsets }
}

/** Inelastic star: core particles (the first one leads), pion pairs, neutral pions. */
function star(r: Rng, beamKind: Kind, pb: number, core: readonly Kind[], pairs: number, pi0: number): Product[] {
  const list: Kind[] = [...core]
  for (let i = 0; i < pairs; i++) {
    if (r() < 0.1)
      list.push('K+', 'K-')
    else
      list.push('pi+', 'pi-')
  }
  for (let i = 0; i < pi0; i++)
    list.push('pi0')
  // charge balance with the target proton
  const Q = SPECIES[beamKind].q + 1
  let sum = 0
  for (const kd of list)
    sum += SPECIES[kd].q
  for (; sum < Q; sum++)
    list.push('pi+')
  for (; sum > Q; sum--)
    list.push('pi-')
  const w = list.map((kd, i) => expo(r) * (i === 0 ? 3 : 1) * (isNucleon(kd) ? 0.35 : 1))
  let tot = 0
  for (const v of w)
    tot += v
  return list.map((kind, i) => ({
    kind,
    pl: (0.8 * pb * w[i]) / tot - 0.05 - 0.1 * r(),
    pt: -0.17 * (Math.log(1 - r()) + Math.log(1 - r())),
    phi: 2 * Math.PI * r(),
  }))
}

/** Elastic scatter: the beam particle is barely deflected, the recoil proton leaves a short dense stub. */
function elastic(r: Rng, kind: Kind, pb: number): Product[] {
  const mp = SPECIES.p.m
  const t = expo(r) / 8
  const T = t / (2 * mp)
  const prec = Math.sqrt(T * T + 2 * T * mp)
  const eb = Math.sqrt(pb * pb + SPECIES[kind].m ** 2)
  const plr = Math.min(prec * 0.97, (T * (eb + mp)) / pb)
  const ptr = Math.sqrt(prec * prec - plr * plr)
  const phi = 2 * Math.PI * r()
  return [
    { kind, pl: pb - plr, pt: ptr, phi: phi + Math.PI },
    { kind: 'p', pl: plr, pt: ptr, phi },
  ]
}

/** Indices of beam tracks close to the axis, in a hash-shuffled order. */
function central(r: Rng, b: Beam, width: number): number[] {
  const idx = b.offsets.map((o, i) => [o, i] as const).filter(([o]) => Math.abs(o) < width).map(([, i]) => i)
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]]
  }
  return idx
}

function hit(t: Particle, at: number, products: Product[]) {
  t.vertexAt = at
  t.products = products
}

/** Starts a particle at (x, y) in the film plane, heading at angle a with a dip. */
function free(kind: Kind, x: number, y: number, a: number, dip: number, p: number, z: number, age: number): Particle {
  return { kind, x, y, z, ux: Math.cos(a) * Math.cos(dip), uy: Math.sin(a) * Math.cos(dip), uz: Math.sin(dip), p, age }
}

const STRANGE_STARS = [['Xi', 22], ['Lambda', 38], ['Sigma', 20], ['K0', 20]] as const

export function makeEvent(kind: EventKind, r: Rng, k: number): Particle[] {
  const theta = (r() < 0.5 ? 0 : Math.PI) + range(r, -0.14, 0.14)
  const seeds: Particle[] = []

  if (kind === 'Cosmic') {
    const muons = int(r, 3, 6)
    for (let i = 0; i < muons; i++) {
      const cx = range(r, 0.1, 0.9)
      const cy = range(r, 0.1, 0.9)
      const a = range(r, 0, Math.PI * 2)
      const kd: Kind = r() < 0.56 ? 'mu+' : 'mu-'
      seeds.push(free(kd, cx - Math.cos(a) * 1.15, cy - Math.sin(a) * 1.15, a, range(r, -0.3, 0.3), range(r, 0.5, 6), range(r, -0.2, 0.2), range(r, 0.75, 1.35)))
    }
    const stoppers = int(r, 3, 5)
    for (let i = 0; i < stoppers; i++) {
      const kd = weighted(r, [['mu+', 40], ['mu-', 25], ['pi+', 20], ['p', 15]] as const)
      const pr: Record<typeof kd, [number, number]> = { 'mu+': [0.07, 0.13], 'mu-': [0.07, 0.13], 'pi+': [0.09, 0.15], 'p': [0.25, 0.4] }
      seeds.push(free(kd, range(r, 0.15, 0.85), range(r, 0.15, 0.85), range(r, 0, Math.PI * 2), range(r, -0.25, 0.25), range(r, pr[kd][0], pr[kd][1]), range(r, -0.15, 0.15), range(r, 0.8, 1.25)))
    }
    // Compton electrons kicked by gamma rays from the surroundings
    const compton = int(r, 12, 22)
    for (let i = 0; i < compton; i++) {
      const T = 0.0006 + 0.008 * r() ** 2
      seeds.push(free('e-', range(r, -0.7, 1.7), range(r, -0.7, 1.7), range(r, 0, Math.PI * 2), range(r, -0.5, 0.5), Math.sqrt(T * T + 2 * T * 0.000511), range(r, -0.3, 0.3), range(r, 0.8, 1.3)))
    }
    // a nuclear star: a neutron breaking up a carbon nucleus, evaporating protons
    if (r() < 0.5) {
      const cx = range(r, 0.25, 0.75)
      const cy = range(r, 0.25, 0.75)
      const n = int(r, 3, 6)
      for (let i = 0; i < n; i++)
        seeds.push(free('p', cx, cy, range(r, 0, Math.PI * 2), range(r, -0.6, 0.6), range(r, 0.12, 0.34), 0, 1.1))
    }
    return seeds
  }

  if (kind === 'Strange') {
    const pb = range(r, 3.5, 5)
    const b = beam(r, int(r, 7, 12), 'K-', pb, k, theta, 0.78)
    seeds.push(...b.tracks)
    const c = central(r, b, 0.34)
    const nStars = Math.min(c.length, int(r, 2, 3))
    for (let i = 0; i < nStars; i++) {
      const type = weighted(r, STRANGE_STARS)
      let core: Kind[]
      if (type === 'Xi')
        core = ['X-', 'K+']
      else if (type === 'Lambda')
        core = ['L']
      else if (type === 'Sigma')
        core = [r() < 0.5 ? 'S+' : 'S-']
      else
        core = ['K0S', 'n']
      hit(b.tracks[c[i]], START + range(r, -0.5, 0.05), star(r, 'K-', pb, core, int(r, 1, 3), int(r, 0, 1)))
    }
    // a slow kaon from the beam halo that stops and is captured: K- p -> Sigma pi
    if (r() < 0.75) {
      const off = range(r, -0.3, 0.3)
      const p = range(r, 0.3, 0.4)
      const a0 = theta - ((k * -1) / p) * 0.6
      const c2 = Math.cos(theta)
      const s2 = Math.sin(theta)
      seeds.push(free('K-', 0.5 - START * c2 - off * s2, 0.5 - START * s2 + off * c2, a0, range(r, -0.05, 0.05), p, 0, 1))
    }
    return seeds
  }

  // pion beams
  const spec = {
    'Interaction': { p: [4, 16], n: [9, 15], half: 0.78, stars: [1, 2], el: [0, 2], pairs: [1, 4], pi0: [0, 3] },
    'Showers': { p: [6, 12], n: [4, 7], half: 0.7, stars: [2, 3], el: [0, 1], pairs: [1, 3], pi0: [3, 6] },
    'Pile-up': { p: [10, 20], n: [22, 32], half: 0.88, stars: [3, 5], el: [1, 3], pairs: [1, 4], pi0: [0, 3] },
  }[kind]
  const pb = range(r, spec.p[0], spec.p[1])
  const b = beam(r, int(r, spec.n[0], spec.n[1]), 'pi-', pb, k, theta, spec.half)
  seeds.push(...b.tracks)
  const c = central(r, b, kind === 'Pile-up' ? 0.4 : 0.34)
  const nStars = Math.min(c.length, int(r, spec.stars[0], spec.stars[1]))
  for (let i = 0; i < nStars; i++) {
    const core: Kind[] = ['pi-', r() < 0.6 ? 'p' : 'n']
    // associated production: pi- p -> Lambda K0 + pions
    if (kind !== 'Showers' && r() < 0.3)
      core.splice(1, 1, 'L', 'K0S')
    hit(b.tracks[c[i]], START + range(r, -0.42, 0.12), star(r, 'pi-', pb, core, int(r, spec.pairs[0], spec.pairs[1]), int(r, spec.pi0[0], spec.pi0[1])))
  }
  const nEl = Math.min(c.length - nStars, int(r, spec.el[0], spec.el[1]))
  for (let i = 0; i < nEl; i++)
    hit(b.tracks[c[nStars + i]], START + range(r, -0.5, 0.3), elastic(r, 'pi-', pb))
  // hard photons from upstream, converting in the heavy liquid
  if (kind === 'Showers') {
    const n = int(r, 1, 2)
    for (let i = 0; i < n; i++) {
      const off = range(r, -0.35, 0.35)
      const a = theta + range(r, -0.05, 0.05)
      seeds.push(free('g', 0.5 - START * Math.cos(theta) - off * Math.sin(theta), 0.5 - START * Math.sin(theta) + off * Math.cos(theta), a, 0, range(r, 0.4, 2.5), 0, 1))
    }
  }
  return seeds
}
