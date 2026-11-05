// Procedural "photographs" for the stippler: no image is loaded, each subject
// is a function of (u, v) in the units of the central square (0..1 across
// its short side, possibly beyond on wider or taller canvases).
//
// A field returns the tone of the material at that point, 0 for a fully lit
// surface and 1 for the deepest shadow, or a negative number where there is
// nothing but paper. A cast shadow returns SHADOW + its tone: it takes dark
// ink but never highlights.

import type { Rng } from '../random'
import { chance, range } from '../random'

export type Field = (u: number, v: number) => number

export const SHADOW = 2

function clamp01(t: number) {
  return Math.min(1, Math.max(0, t))
}

function smooth(a: number, b: number, t: number) {
  const x = clamp01((t - a) / (b - a))
  return x * x * (3 - 2 * x)
}

/** Value noise on an integer-hashed lattice, 0..1. */
export function makeNoise(r: Rng) {
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
  const at = (a: number, b: number) => val[perm[perm[a & 255] + (b & 255)]]
  return (x: number, y: number) => {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const u = fade(x - xi)
    const w = fade(y - yi)
    const a = at(xi, yi) + u * (at(xi + 1, yi) - at(xi, yi))
    const b = at(xi, yi + 1) + u * (at(xi + 1, yi + 1) - at(xi, yi + 1))
    return a + w * (b - a)
  }
}

function fbm(noise: (x: number, y: number) => number, x: number, y: number, octaves: number) {
  let s = 0
  let a = 0.5
  let norm = 0
  for (let o = 0; o < octaves; o++) {
    s += a * noise(x, y)
    norm += a
    x = x * 2.03 + 17.1
    y = y * 2.03 + 5.7
    a *= 0.5
  }
  return s / norm
}

/** A unit light vector from the upper left or upper right. */
function light(r: Rng): [number, number, number] {
  const side = chance(r, 0.5) ? -1 : 1
  const lx = side * range(r, 0.45, 0.75)
  const ly = -range(r, 0.35, 0.65)
  const lz = range(r, 0.45, 0.75)
  const l = Math.hypot(lx, ly, lz)
  return [lx / l, ly / l, lz / l]
}

/** Lambert shading of a height field given its gradient, as a tone. */
function shade(L: readonly number[], gx: number, gy: number, ambient: number) {
  const l = Math.hypot(gx, gy, 1)
  const lam = (-gx * L[0] - gy * L[1] + L[2]) / l
  return clamp01(1 - (ambient + (1 - ambient) * Math.max(0, lam)))
}

// --- Orb: a lit sphere resting on its cast shadow, sometimes with craters --

export function orb(r: Rng): Field {
  const L = light(r)
  const R = range(r, 0.25, 0.3)
  const cx = 0.5 + range(r, -0.03, 0.03)
  const cy = 0.47
  const cratered = chance(r, 0.5)
  const noise = makeNoise(r)
  const craters: [number, number, number][] = []
  const nc = cratered ? 14 : 0
  for (let i = 0; i < nc; i++) {
    // on the visible hemisphere, as (nx, ny, radius)
    const a = range(r, 0, Math.PI * 2)
    const d = Math.sqrt(r()) * 0.85
    craters.push([Math.cos(a) * d, Math.sin(a) * d, range(r, 0.05, 0.16) * (1 - d * 0.5)])
  }
  // Shadow on the ground, pushed away from the light.
  const gy = cy + R * 0.97
  const sx = cx - L[0] / Math.max(0.3, L[2]) * R * 0.55
  const srx = R * 1.25
  const sry = R * 0.2
  return (u, v) => {
    const nx = (u - cx) / R
    const ny = (v - cy) / R
    const q = nx * nx + ny * ny
    if (q < 1) {
      const nz = Math.sqrt(1 - q)
      let lam = nx * L[0] + ny * L[1] + nz * L[2]
      // reflected light from the ground on the shadow side
      lam = Math.max(lam, 0) + Math.max(0, -lam) * 0.12 * smooth(0.2, 1, ny)
      let t = 1 - (0.04 + 0.96 * clamp01(lam))
      t = t ** 0.9
      for (const [kx, ky, kr] of craters) {
        const dx = nx - kx
        const dy = ny - ky
        const dd = Math.sqrt(dx * dx + dy * dy) / kr
        if (dd < 1.15) {
          // rim lit towards the light, floor shaded away from it
          const side = (dx * L[0] + dy * L[1]) / (dd * kr + 1e-9)
          if (dd < 1)
            t += 0.28 * side * (1 - dd * dd)
          else
            t -= 0.12 * side
        }
      }
      t += (fbm(noise, u * 9, v * 9, 3) - 0.5) * (cratered ? 0.35 : 0.12)
      return clamp01(t)
    }
    const ex = (u - sx) / srx
    const ey = (v - gy) / sry
    const e = ex * ex + ey * ey
    if (e < 1)
      return SHADOW + 0.95 * (1 - e) ** 0.6
    return -1
  }
}

// --- Drapery: folds of hanging cloth, lit at a grazing angle --------------

export function drapery(r: Rng): Field {
  const L = light(r)
  const tilt = range(r, -0.3, 0.3)
  const ca = Math.cos(tilt)
  const sa = Math.sin(tilt)
  const noise = makeNoise(r)
  // a few broad folds and their harmonics: |sin| gives round crests and
  // sharp creases in the hollows
  const w0 = range(r, 7, 11)
  const folds: [number, number, number][] = []
  for (const [k, amp] of [[1, 1], [1.9, 0.45], [3.3, 0.18]] as const) {
    const w = w0 * k * range(r, 0.9, 1.1)
    folds.push([w, (amp * 1.3) / w0, range(r, 0, Math.PI * 2)])
  }
  const gather = range(r, 0.3, 0.8)
  const swing = range(r, -0.6, 0.6)
  const height = (u: number, v: number) => {
    const s = u * ca + v * sa
    const t = v * ca - u * sa
    const warp = (noise(u * 1.6, v * 1.6) - 0.5) * 0.3 + swing * t * t * 0.3
    // folds bunch together towards the top, like a gathered curtain
    const f = 1 + gather * (1 - clamp01(t))
    let h = 0
    for (const [w, a, p] of folds)
      h += a * Math.abs(Math.sin(w * f * (s - 0.5 + warp) + p))
    return h
  }
  const e = 0.0025
  return (u, v) => {
    const h = height(u, v)
    const gx = (height(u + e, v) - h) / e
    const gy = (height(u, v + e) - h) / e
    // lit by the light, plus occlusion deep in the creases
    const t = shade(L, gx, gy, 0.05)
    const hollow = clamp01(1 - (h * w0) / 1.1)
    return clamp01(t * 0.8 + 0.3 * hollow ** 2)
  }
}

// --- Nebula: a domain-warped cloud of noise -------------------------------

export function nebula(r: Rng): Field {
  const n1 = makeNoise(r)
  const n2 = makeNoise(r)
  const scale = range(r, 2.2, 3.4)
  const warp = range(r, 1.2, 2.2)
  const lo = range(r, 0.33, 0.41)
  const ecx = 0.5 + range(r, -0.08, 0.08)
  const ecy = 0.5 + range(r, -0.08, 0.08)
  const erx = range(r, 0.22, 0.34)
  const ery = range(r, 0.22, 0.34)
  return (u, v) => {
    const x = u * scale
    const y = v * scale
    const qx = fbm(n1, x, y, 4)
    const qy = fbm(n1, x + 5.2, y + 1.3, 4)
    const f = fbm(n2, x + warp * qx * 2, y + warp * qy * 2, 5)
    // soft clouds, threaded with bright filaments where the warp folds
    const ridge = 1 - Math.abs(2 * fbm(n1, x * 1.7 + qy * 3, y * 1.7 + qx * 3, 3) - 1)
    // the cloud gathers into one loose mass instead of an even texture
    const ex = (u - ecx) / erx
    const ey = (v - ecy) / ery
    const env = Math.exp(-0.5 * (ex * ex + ey * ey))
    return clamp01((smooth(lo, lo + 0.35, f) * 0.85 + 0.3 * ridge ** 6) * (0.25 + 0.95 * env) - 0.04)
  }
}

// --- Vase: a turned vessel on its shadow, with painted bands ---------------

/** Catmull-Rom through evenly spaced values, at t in [0, 1]. */
function spline(ys: readonly number[], t: number): number {
  const m = ys.length - 1
  const x = Math.min(m - 1e-9, Math.max(0, t * m))
  const i = Math.floor(x)
  const f = x - i
  const p0 = ys[Math.max(0, i - 1)]
  const p1 = ys[i]
  const p2 = ys[i + 1]
  const p3 = ys[Math.min(m, i + 2)]
  return 0.5 * ((2 * p1) + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f + (-p0 + 3 * p1 - 3 * p2 + p3) * f * f * f)
}

export function vase(r: Rng): Field {
  const L = light(r)
  const top = 0.13
  const bottom = 0.84
  const span = bottom - top
  // radius profile from lip to foot, a fraction of the short side
  // every radius is bounded by its neighbours, so the vessel never pinches
  // into two pieces
  const belly = range(r, 0.17, 0.26)
  const neck = belly * range(r, 0.3, 0.45)
  const lip = neck * range(r, 1.05, 1.6)
  const shoulder = range(r, neck * 1.4, belly * 0.95)
  const low = belly * range(r, 0.6, 0.85)
  const foot = low * range(r, 0.55, 0.75)
  const profile = [lip, neck * 1.05, neck, shoulder, belly, belly * range(r, 0.85, 1), low, foot * 0.9, foot]
  const bands: [number, number][] = []
  const nb = Math.floor(range(r, 0, 4))
  for (let i = 0; i < nb; i++)
    bands.push([range(r, 0.3, 0.85), range(r, 0.008, 0.03)])
  const rho = (t: number) => Math.max(0.02, spline(profile, t))
  const lipH = lip * 0.22
  const sx = 0.5 - L[0] / Math.max(0.3, L[2]) * 0.14
  return (u, v) => {
    const t = (v - top) / span
    const dx = u - 0.5
    if (t >= 0 && t <= 1) {
      const p = rho(t)
      if (Math.abs(dx) < p) {
        const xi = dx / p
        const slope = (rho(t + 0.004) - rho(t - 0.004)) / (0.008 * span)
        const nx = xi
        const ny = -slope
        const nz = Math.sqrt(1 - xi * xi)
        const l = Math.hypot(nx, ny, nz)
        const lam = (nx * L[0] + ny * L[1] + nz * L[2]) / l
        let tone = 1 - (0.05 + 0.95 * clamp01(lam))
        // the glaze catches a sharp highlight
        const spec = clamp01(lam) ** 24
        tone -= spec * 0.6
        for (const [bt, bw] of bands) {
          if (Math.abs(t - bt) < bw)
            tone = 0.35 + tone * 0.65
        }
        // the inside of the mouth
        const ey = (v - top - lipH * 0.4) / lipH
        if (t < 0.12 && xi * xi + ey * ey < 0.75)
          tone = 0.9 - 0.25 * ey
        return clamp01(tone)
      }
    }
    // cast shadow on the table
    const ex = (u - sx) / (belly * 1.6)
    const ey = (v - bottom - 0.004) / 0.035
    const e = ex * ex + ey * ey
    if (e < 1)
      return SHADOW + 0.9 * (1 - e) ** 0.6
    return -1
  }
}

// --- Shell: a nautilus-like logarithmic spiral with chambers ---------------

export function shell(r: Rng): Field {
  const L = light(r)
  const growth = range(r, 2.6, 3.4) // radius ratio per turn
  const b = Math.log(growth) / (Math.PI * 2)
  const dir = chance(r, 0.5) ? 1 : -1
  const theta0 = range(r, 0, Math.PI * 2)
  const R0 = 0.39
  const septa = Math.round(range(r, 9, 14))
  const ccx = 0.5
  const ccy = 0.5
  // the shell is slightly off its pole, like a real nautilus
  const px = ccx + range(r, -0.02, 0.02)
  const py = ccy + range(r, -0.02, 0.02)
  return (u, v) => {
    const dx = u - px
    const dy = v - py
    const rr = Math.hypot(dx, dy)
    if (rr < 1e-4)
      return 1
    let phi = (dir * Math.atan2(dy, dx) - theta0) % (Math.PI * 2)
    if (phi < 0)
      phi += Math.PI * 2
    const edge = R0 * Math.exp(-b * phi)
    if (rr > edge)
      return -1
    // whorls inside the outer edge: k counts turns inwards
    const k = Math.log(edge / rr) / (b * Math.PI * 2)
    const t = k - Math.floor(k)
    // rounded section: dark near both seams of a whorl, lit in the middle,
    // with the light side chosen by the global light
    const across = Math.sin(t * Math.PI)
    const nx = dx / rr
    const ny = dy / rr
    const lit = clamp01(0.5 + 0.5 * (nx * -L[0] + ny * -L[1]) * (t - 0.5) * -2 + 0.35 * across)
    let tone = 1 - (0.08 + 0.85 * lit * across ** 0.5)
    // chamber walls, curving with the whorl
    const s = ((phi + 1.6 * t) / (Math.PI * 2)) * septa
    const w = Math.abs(s - Math.round(s))
    if (k < 1)
      tone += 0.35 * smooth(0.06, 0, w) * across
    // inner turns sink into shadow
    tone += 0.12 * Math.min(3, Math.floor(k))
    return clamp01(tone)
  }
}
