// Charged-particle transport through a bubble chamber, for the "Tracks" series.
//
// Every particle is followed in three dimensions through a uniform magnetic
// field along z (perpendicular to the film), so a charged track is a helix
// whose projection on the film is a circle of radius R = p_T / (0.3 B) (metres,
// GeV/c, tesla). Along the way it
//   - loses energy by ionization, following a reduced Bethe formula whose
//     relativistic rise is flattened as the density effect does in liquids,
//     so slow particles leave dense tracks and spiral in as they stop,
//   - is deflected by multiple Coulomb scattering (Highland's formula, with
//     its logarithmic term),
//   - knocks electrons out of the liquid (delta rays, with the 1/T^2 spectrum
//     of the Rutherford cross section and the kinematic emission angle),
//   - radiates (electrons only: bremsstrahlung photons with a 1/k spectrum),
//   - decays in flight or at rest with real masses, lifetimes and two-body
//     kinematics boosted into the lab (muons with the Michel spectrum).
// Photons convert into electron-positron pairs after an exponential distance
// of 9/7 radiation lengths. Neutral particles leave no bubbles: what shows up
// on the film is the gap, then the V of their decay.
//
// Bubbles are emitted along the 3D path as a Poisson process whose rate is
// proportional to the ionization, so the bubble density along a track reads
// as 1/beta^2, the way physicists read particle masses off the photographs.
//
// Units: lengths in "units" (the canvas short side), momenta and energies in
// GeV. Values are textbook figures (PDG Review of Particle Physics).

import type { Rng } from '../random'
import { gaussian } from '../random'

export type Kind
  = | 'e-' | 'e+' | 'mu-' | 'mu+' | 'pi-' | 'pi+' | 'pi0' | 'K-' | 'K+' | 'K0S'
    | 'p' | 'n' | 'L' | 'S+' | 'S-' | 'X-' | 'g' | 'nu'

type Channel = readonly [number, Kind, Kind]

interface Spec {
  /** Mass, GeV. */
  m: number
  q: number
  /** Mean proper decay length c*tau, metres (Infinity when stable here). */
  ctau: number
  decay?: readonly Channel[]
}

export const SPECIES: Record<Kind, Spec> = {
  'e-': { m: 0.000511, q: -1, ctau: Infinity },
  'e+': { m: 0.000511, q: 1, ctau: Infinity },
  // muons only decay once stopped (c*tau = 659 m), with the Michel spectrum
  'mu-': { m: 0.10566, q: -1, ctau: Infinity },
  'mu+': { m: 0.10566, q: 1, ctau: Infinity },
  'pi-': { m: 0.13957, q: -1, ctau: 7.8045, decay: [[1, 'mu-', 'nu']] },
  'pi+': { m: 0.13957, q: 1, ctau: 7.8045, decay: [[1, 'mu+', 'nu']] },
  'pi0': { m: 0.13498, q: 0, ctau: 0, decay: [[1, 'g', 'g']] },
  'K-': { m: 0.49368, q: -1, ctau: 3.712, decay: [[0.75, 'mu-', 'nu'], [0.25, 'pi-', 'pi0']] },
  'K+': { m: 0.49368, q: 1, ctau: 3.712, decay: [[0.75, 'mu+', 'nu'], [0.25, 'pi+', 'pi0']] },
  'K0S': { m: 0.49761, q: 0, ctau: 0.02684, decay: [[0.69, 'pi+', 'pi-'], [0.31, 'pi0', 'pi0']] },
  'p': { m: 0.93827, q: 1, ctau: Infinity },
  'n': { m: 0.93957, q: 0, ctau: Infinity },
  'L': { m: 1.11568, q: 0, ctau: 0.0789, decay: [[0.64, 'p', 'pi-'], [0.36, 'n', 'pi0']] },
  'S+': { m: 1.18937, q: 1, ctau: 0.02404, decay: [[0.52, 'p', 'pi0'], [0.48, 'n', 'pi+']] },
  'S-': { m: 1.19745, q: -1, ctau: 0.0443, decay: [[1, 'n', 'pi-']] },
  'X-': { m: 1.32171, q: -1, ctau: 0.0491, decay: [[1, 'L', 'pi-']] },
  'g': { m: 0, q: 0, ctau: Infinity },
  'nu': { m: 0, q: 0, ctau: Infinity },
}

export interface Medium {
  /** Minimum-ionizing energy loss, GeV per metre. */
  dedx: number
  /** Radiation length, metres. */
  x0: number
  /** Density times Z/A, g/cm^3 (sets the delta-ray rate). */
  zar: number
  /** Mean excitation energy, eV. */
  iexc: number
}

// Approximate liquid properties.
export const MEDIA = {
  hydrogen: { dedx: 0.0285, x0: 8.9, zar: 0.0702, iexc: 21.8 },
  propane: { dedx: 0.097, x0: 1.05, zar: 0.254, iexc: 47 },
  neonHydrogen: { dedx: 0.124, x0: 0.42, zar: 0.37, iexc: 120 },
} as const satisfies Record<string, Medium>

/** A secondary leaving a vertex, relative to the incoming direction. */
export interface Product {
  kind: Kind
  /** Momentum along the incoming direction, GeV (may be negative). */
  pl: number
  /** Transverse momentum, GeV, at azimuth phi around the incoming direction. */
  pt: number
  phi: number
}

export interface Particle {
  kind: Kind
  x: number
  y: number
  z: number
  ux: number
  uy: number
  uz: number
  p: number
  /** Bubble size factor: tracks that crossed earlier in the cycle grew bigger bubbles. */
  age: number
  /** Path length after which the particle interacts with a proton of the liquid. */
  vertexAt?: number
  products?: readonly Product[]
}

export interface Chamber {
  /** 0.3 * B * metres per unit: curvature (rad per unit) of a unit charge at 1 GeV/c. */
  k: number
  /** Metres per unit. */
  L: number
  medium: Medium
  /** Bubbles per unit of path at minimum ionization. */
  rate: number
  /** Half depth of the liquid, units. */
  depth: number
  /** Half extent of the simulated region around the canvas centre, units. */
  box: number
}

export interface Bubbles {
  x: Float32Array
  y: Float32Array
  /** Size factor (1 = a minimum-ionizing bubble of an average age). */
  s: Float32Array
  n: number
}

const ME = 0.000511
const MAX_PARTICLES = 1600
const MAX_STEPS = 900_000
const MAX_BUBBLES = 320_000
const STEP = 0.004
/** Ionization above this ratio saturates: the track is a solid line already. */
const GCAP = 8
/** Softest delta ray followed, GeV kinetic energy. */
const TMIN_DELTA = 0.003
/** Softest bremsstrahlung photon accounted for, and followed, GeV. */
const KMIN = 0.002
const KFOLLOW = 0.008

const expo = (r: Rng) => -Math.log(1 - r())

// Two unit vectors perpendicular to (ux, uy, uz) and to each other.
const B = new Float64Array(6)
function basis(ux: number, uy: number, uz: number) {
  const ay = 0
  let ax = 0
  let az = 1
  if (Math.abs(uz) > 0.9) {
    ax = 1
    az = 0
  }
  // e1 = a x u
  let e1x = ay * uz - az * uy
  let e1y = az * ux - ax * uz
  let e1z = ax * uy - ay * ux
  const n = Math.hypot(e1x, e1y, e1z) || 1
  e1x /= n
  e1y /= n
  e1z /= n
  B[0] = e1x
  B[1] = e1y
  B[2] = e1z
  B[3] = uy * e1z - uz * e1y
  B[4] = uz * e1x - ux * e1z
  B[5] = ux * e1y - uy * e1x
}

/** Reduced Bethe ionization, before normalisation; bg is beta * gamma. */
function bethe(bg: number, iexc: number) {
  const b = Math.max(0.04, Math.min(bg, 4))
  const b2 = (b * b) / (1 + b * b)
  return (Math.log((2 * 511000 * b * b) / iexc) - b2) / b2
}

export function simulate(seeds: readonly Particle[], ch: Chamber, r: Rng, rb: Rng): Bubbles {
  const out: Bubbles = {
    x: new Float32Array(MAX_BUBBLES),
    y: new Float32Array(MAX_BUBBLES),
    s: new Float32Array(MAX_BUBBLES),
    n: 0,
  }
  const { k, L, medium, rate, depth, box } = ch
  const dedxU = medium.dedx * L
  const x0U = medium.x0 / L
  const fmin = bethe(3.5, medium.iexc)
  // Rutherford knock-on rate: 0.1535 MeV cm^2/g * Z/A * rho, per unit of path, times 1/T (MeV)
  const deltaK = 0.1535 * medium.zar * 100 * L
  const queue: Particle[] = seeds.map(s => ({ ...s }))
  let steps = 0

  const inside = (x: number, y: number, z: number) =>
    Math.abs(x - 0.5) < box && Math.abs(y - 0.5) < box && Math.abs(z) < depth

  const spawn = (kind: Kind, x: number, y: number, z: number, px: number, py: number, pz: number, age: number) => {
    if (kind === 'nu' || kind === 'n' || queue.length >= MAX_PARTICLES)
      return
    const p = Math.hypot(px, py, pz)
    if (p < 1e-7)
      return
    queue.push({ kind, x, y, z, ux: px / p, uy: py / p, uz: pz / p, p, age })
  }

  // Two-body decay of a parent of mass M and momentum (px, py, pz), boosted to the lab.
  const twoBody = (M: number, px: number, py: number, pz: number, x: number, y: number, z: number, a: Kind, b: Kind, age: number) => {
    const m1 = SPECIES[a].m
    const m2 = SPECIES[b].m
    if (M <= m1 + m2)
      return
    const ps = Math.sqrt((M * M - (m1 + m2) ** 2) * (M * M - (m1 - m2) ** 2)) / (2 * M)
    const P = Math.hypot(px, py, pz)
    let ux = 0
    let uy = 0
    let uz = 1
    if (P > 1e-9) {
      ux = px / P
      uy = py / P
      uz = pz / P
    }
    const gam = Math.sqrt(P * P + M * M) / M
    const bg = P / M
    const c = 2 * r() - 1
    const s = Math.sqrt(Math.max(0, 1 - c * c))
    const phi = 2 * Math.PI * r()
    basis(ux, uy, uz)
    const cp = Math.cos(phi)
    const sp = Math.sin(phi)
    const tx = B[0] * cp + B[3] * sp
    const ty = B[1] * cp + B[4] * sp
    const tz = B[2] * cp + B[5] * sp
    const l1 = gam * ps * c + bg * Math.sqrt(ps * ps + m1 * m1)
    const l2 = -gam * ps * c + bg * Math.sqrt(ps * ps + m2 * m2)
    const t = ps * s
    spawn(a, x, y, z, ux * l1 + tx * t, uy * l1 + ty * t, uz * l1 + tz * t, age)
    spawn(b, x, y, z, ux * l2 - tx * t, uy * l2 - ty * t, uz * l2 - tz * t, age)
  }

  const pickChannel = (kind: Kind): Channel | undefined => {
    const d = SPECIES[kind].decay
    if (!d)
      return undefined
    let x = r()
    for (const ch of d) {
      x -= ch[0]
      if (x < 0)
        return ch
    }
    return d[d.length - 1]
  }

  // Muon decay at rest: electron energy from the Michel spectrum x^2 (3 - 2x).
  const michel = (charge: number, x: number, y: number, z: number, age: number) => {
    let e = 0
    for (let i = 0; i < 64; i++) {
      e = r()
      if (r() < e * e * (3 - 2 * e))
        break
    }
    const E = Math.max(ME * 1.05, e * 0.0528)
    const p = Math.sqrt(E * E - ME * ME)
    const c = 2 * r() - 1
    const s = Math.sqrt(1 - c * c)
    const phi = 2 * Math.PI * r()
    spawn(charge > 0 ? 'e+' : 'e-', x, y, z, p * s * Math.cos(phi), p * s * Math.sin(phi), p * c, age)
  }

  // Photon conversion: energy shared by the Bethe-Heitler 1 - 4/3 x(1 - x) law.
  const pair = (kg: number, x: number, y: number, z: number, ux: number, uy: number, uz: number, age: number) => {
    if (kg < 2.2 * ME)
      return
    let f = 0.5
    for (let i = 0; i < 32; i++) {
      f = r()
      if (r() < 1 - (4 / 3) * f * (1 - f))
        break
    }
    const ee = ME + f * (kg - 2 * ME)
    const ep = kg - ee
    basis(ux, uy, uz)
    const phi = 2 * Math.PI * r()
    for (const [kind, E, sgn] of [['e-', ee, 1], ['e+', ep, -1]] as const) {
      const p = Math.sqrt(Math.max(0, E * E - ME * ME))
      // typical opening angle m_e / E
      const th = Math.min(0.5, ME / E)
      const tx = (B[0] * Math.cos(phi) + B[3] * Math.sin(phi)) * sgn * th
      const ty = (B[1] * Math.cos(phi) + B[4] * Math.sin(phi)) * sgn * th
      const tz = (B[2] * Math.cos(phi) + B[5] * Math.sin(phi)) * sgn * th
      spawn(kind, x, y, z, (ux + tx) * p, (uy + ty) * p, (uz + tz) * p, age)
    }
  }

  // Stopped particles: decays and captures at rest on a proton of the liquid.
  const atRest = (kind: Kind, x: number, y: number, z: number, age: number) => {
    const mp = SPECIES.p.m
    switch (kind) {
      case 'mu-':
      case 'mu+':
        michel(SPECIES[kind].q, x, y, z, age)
        return
      case 'pi-':
        // pi- p -> pi0 n (60%) or gamma n (40%), the Panofsky ratio
        if (r() < 0.6)
          twoBody(SPECIES['pi-'].m + mp, 0, 0, 0, x, y, z, 'pi0', 'n', age)
        else
          twoBody(SPECIES['pi-'].m + mp, 0, 0, 0, x, y, z, 'g', 'n', age)
        return
      case 'K-': {
        const u = r()
        const pairs: readonly (readonly [Kind, Kind])[] = [['S+', 'pi-'], ['S-', 'pi+'], ['L', 'pi0']]
        const [a, b] = pairs[u < 0.33 ? 0 : u < 0.66 ? 1 : 2]
        twoBody(SPECIES['K-'].m + mp, 0, 0, 0, x, y, z, a, b, age)
        return
      }
      case 'pi+':
      case 'K+':
      case 'S+':
      case 'S-':
      case 'X-': {
        const chn = pickChannel(kind)
        if (chn)
          twoBody(SPECIES[kind].m, 0, 0, 0, x, y, z, chn[1], chn[2], age)
        break
      }
      default:
    }
  }

  const neutral = (pt: Particle) => {
    const sp = SPECIES[pt.kind]
    let d = 0
    if (pt.kind === 'g')
      d = expo(r) * (9 / 7) * x0U
    else if (sp.decay)
      d = sp.ctau > 0 ? (expo(r) * sp.ctau / L) * (pt.p / sp.m) : 0
    else
      return
    const x = pt.x + pt.ux * d
    const y = pt.y + pt.uy * d
    const z = pt.z + pt.uz * d
    if (!inside(x, y, z))
      return
    if (pt.kind === 'g') {
      pair(pt.p, x, y, z, pt.ux, pt.uy, pt.uz, pt.age)
      return
    }
    const chn = pickChannel(pt.kind)
    if (chn)
      twoBody(sp.m, pt.ux * pt.p, pt.uy * pt.p, pt.uz * pt.p, x, y, z, chn[1], chn[2], pt.age)
  }

  const charged = (pt: Particle) => {
    const sp = SPECIES[pt.kind]
    const m = sp.m
    const q = sp.q
    const isE = m < 0.001
    let { x, y, z, ux, uy, uz, p } = pt
    let E = Math.sqrt(p * p + m * m)
    const tStop = isE ? 0.00025 : 0.0012
    let tau = sp.decay ? expo(r) * sp.ctau / L : Infinity
    let nb = expo(rb)
    let nd = expo(r)
    let nr = expo(r)
    let s = 0
    const vAt = pt.vertexAt ?? Infinity
    for (let i = 0; i < 40000; i++) {
      if (steps++ > MAX_STEPS)
        return
      const T = E - m
      if (T < tStop) {
        atRest(pt.kind, x, y, z, pt.age)
        return
      }
      const bg = p / m
      const b2 = (p * p) / (E * E)
      const g = Math.max(0.9, bethe(bg, medium.iexc) / fmin)
      const dEds = dedxU * g
      const kap = (k * q) / p
      let ds = Math.min(STEP, 0.07 / Math.abs(kap), (0.06 * T) / dEds)
      ds = Math.max(ds, 1.5e-5)
      // decay in flight: proper length = path / (beta gamma)
      if (tau !== Infinity) {
        tau -= (ds * m) / p
        if (tau <= 0) {
          const chn = pickChannel(pt.kind)
          if (chn)
            twoBody(m, ux * p, uy * p, uz * p, x, y, z, chn[1], chn[2], pt.age)
          return
        }
      }
      // interaction with a proton of the liquid
      if (s + ds >= vAt && pt.products) {
        basis(ux, uy, uz)
        for (const pr of pt.products) {
          const cp = Math.cos(pr.phi)
          const sn = Math.sin(pr.phi)
          spawn(
            pr.kind,
            x,
            y,
            z,
            ux * pr.pl + (B[0] * cp + B[3] * sn) * pr.pt,
            uy * pr.pl + (B[1] * cp + B[4] * sn) * pr.pt,
            uz * pr.pl + (B[2] * cp + B[5] * sn) * pr.pt,
            pt.age,
          )
        }
        return
      }
      s += ds
      // the transverse direction turns around the field
      const a = kap * ds
      const ca = Math.cos(a)
      const sa = Math.sin(a)
      const nx = ux * ca - uy * sa
      uy = ux * sa + uy * ca
      ux = nx
      // multiple Coulomb scattering (Highland)
      const xr = (ds * L) / medium.x0
      const th = (0.0136 / (Math.sqrt(b2) * p)) * Math.sqrt(xr) * Math.max(0.3, 1 + 0.038 * Math.log(xr))
      if (th > 1e-4) {
        const g1 = gaussian(r) * th
        const g2 = gaussian(r) * th
        basis(ux, uy, uz)
        ux += B[0] * g1 + B[3] * g2
        uy += B[1] * g1 + B[4] * g2
        uz += B[2] * g1 + B[5] * g2
        const n = Math.hypot(ux, uy, uz)
        ux /= n
        uy /= n
        uz /= n
      }
      x += ux * ds
      y += uy * ds
      z += uz * ds
      if (!inside(x, y, z))
        return
      E -= dEds * ds
      // bremsstrahlung (electrons): 1/k spectrum, mean loss E / X0
      if (isE && E > 2 * KMIN) {
        nr -= (ds / x0U) * Math.log(E / KMIN)
        if (nr <= 0) {
          nr = expo(r)
          let kg = E * Math.exp(Math.log(KMIN / E) * (1 - r()))
          kg = Math.min(kg, 0.9 * (E - m))
          E -= kg
          if (kg > KFOLLOW)
            spawn('g', x, y, z, ux * kg, uy * kg, uz * kg, pt.age)
        }
      }
      if (E <= m * 1.0001) {
        atRest(pt.kind, x, y, z, pt.age)
        return
      }
      p = Math.sqrt(E * E - m * m)
      // bubbles, a Poisson process proportional to ionization
      const gb = Math.min(g, GCAP)
      const lam = rate * gb * ds
      nb -= lam
      while (nb <= 0 && out.n < MAX_BUBBLES) {
        const t = -nb / lam
        const i2 = out.n++
        out.x[i2] = x - ux * ds * t
        out.y[i2] = y - uy * ds * t
        out.s[i2] = pt.age * (0.78 + 0.44 * rb()) * (1 + 0.1 * (gb - 1))
        nb += expo(rb)
      }
      // delta rays (heavy particles): thinning of a 1/T^2 knock-on spectrum
      if (!isE) {
        nd -= (deltaK / (TMIN_DELTA * 1000)) * ds / b2
        if (nd <= 0) {
          nd = expo(r)
          const T = TMIN_DELTA / (1 - r())
          const g2 = E / m
          const tmax = (2 * ME * bg * bg) / (1 + (2 * g2 * ME) / m + (ME / m) ** 2)
          if (T < tmax) {
            const pd = Math.sqrt(T * T + 2 * T * ME)
            const c = Math.min(1, (T / pd) * ((E + ME) / p))
            const sn = Math.sqrt(1 - c * c)
            const phi = 2 * Math.PI * r()
            basis(ux, uy, uz)
            const cp = Math.cos(phi)
            const spn = Math.sin(phi)
            spawn(
              'e-',
              x,
              y,
              z,
              pd * (ux * c + (B[0] * cp + B[3] * spn) * sn),
              pd * (uy * c + (B[1] * cp + B[4] * spn) * sn),
              pd * (uz * c + (B[2] * cp + B[5] * spn) * sn),
              pt.age,
            )
            E -= T
            p = Math.sqrt(Math.max(1e-12, E * E - m * m))
          }
        }
      }
    }
  }

  for (let qi = 0; qi < queue.length; qi++) {
    if (steps >= MAX_STEPS)
      break
    const pt = queue[qi]
    if (SPECIES[pt.kind].q === 0)
      neutral(pt)
    else
      charged(pt)
  }
  return out
}
