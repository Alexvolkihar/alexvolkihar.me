// "Julia" — escape-time fractals: Julia and Mandelbrot sets, Multibrot-type
// Julia sets, the Burning Ship and Newton fractals.
//
// The hash picks a family and a frame. Julia constants c are taken just
// inside or just outside the boundary of the matching Mandelbrot / Multibrot
// set (found by bisection along a ray from a hyperbolic component), where the
// Julia sets are the most intricate. Zoomed frames walk towards the boundary:
// a coarse preview is computed, a high-iteration pixel is picked as the next
// centre, and the view is magnified. A frame whose preview is too flat (low
// Shannon entropy of the iteration histogram) or mostly interior is rejected
// and another one is drawn, all from the same hash stream, so the choice is
// reproducible.
//
// Pixels are coloured from the smooth (renormalised) iteration count, the
// distance estimate, the potential normal or an orbit trap, then edges are
// supersampled where neighbouring pixels disagree. Every orbit is iterated
// with + - * / only (see ../julia/exact.ts), so a hash renders the same bits
// everywhere. Everything is a pure function of the hash, and every length is
// a fraction of the canvas short side: a wider canvas shows more of the plane.

import type { FractalSpec, Sample, Sampler, TrapKind } from '../julia/fractal'
import type { Rng } from '../random'
import type { Series } from '../types'
import { ln, sqrt } from '../julia/exact'
import { makeFinish, makeSampler, newSample } from '../julia/fractal'
import { int, range, stream, weighted } from '../random'

// Rarity table, decided before the drawing code. Never reorder: it re-rolls the edition.
const TRAITS = {
  Set: [['Julia', 34], ['Mandelbrot', 16], ['Multi-Julia', 14], ['Burning Ship', 14], ['Newton', 22]],
  Palette: [['Vellum', 18], ['Abyss', 20], ['Ember', 18], ['Celadon', 14], ['Orchid', 16], ['Graphite', 14]],
  Shading: [['Bands', 28], ['Relief', 26], ['Filament', 20], ['Trap', 14], ['Contour', 12]],
  Depth: [['Wide', 30], ['Mid', 45], ['Deep', 25]],
} as const

type TraitName = keyof typeof TRAITS
type Features = { [K in TraitName]: typeof TRAITS[K][number][0] }

// The Burning Ship is not holomorphic: its boundary carries a fine grain that
// lighting, glow and traps turn into speckle. Those shadings are drawn as
// smooth bands on the ship (the draw itself is unchanged, so the weights above
// stay the ones used for every other set).
const SHIP_SHADING: Record<Features['Shading'], Features['Shading']> = {
  Bands: 'Bands',
  Relief: 'Bands',
  Filament: 'Bands',
  Trap: 'Bands',
  Contour: 'Contour',
}

function features(hash: string): Features {
  const r = stream(hash, 'features')
  const Set = weighted(r, TRAITS.Set)
  const Palette = weighted(r, TRAITS.Palette)
  let Shading: Features['Shading'] = weighted(r, TRAITS.Shading)
  const Depth = weighted(r, TRAITS.Depth)
  if (Set === 'Burning Ship')
    Shading = SHIP_SHADING[Shading]
  return { Set, Palette, Shading, Depth }
}

interface Palette {
  /** Background, and the far end of the glow. */
  bg: string
  /** Bounded orbits (the filled set). */
  inner: string
  /** Colour ramp, read with a triangle wave so bands never jump. */
  ramp: readonly string[]
  /** Contour lines. */
  ink: string
}

const PAL: Record<Features['Palette'], Palette> = {
  Vellum: { bg: '#f1eadc', inner: '#1d1a16', ramp: ['#f1eadc', '#d8c39a', '#a07a4a', '#5a3b26', '#1d1a16'], ink: '#1d1a16' },
  Abyss: { bg: '#050a14', inner: '#050a14', ramp: ['#050a14', '#0f2f52', '#1b6f8a', '#58c2b5', '#e9f7ef'], ink: '#bfeee4' },
  Ember: { bg: '#0b0706', inner: '#0b0706', ramp: ['#0b0706', '#42120e', '#a8361a', '#ec8f2f', '#fff0c2'], ink: '#ffd98a' },
  Celadon: { bg: '#e8eee5', inner: '#1c3a37', ramp: ['#e8eee5', '#b5d0bd', '#5f9886', '#24504a', '#c9774c'], ink: '#1c3a37' },
  Orchid: { bg: '#100919', inner: '#100919', ramp: ['#100919', '#3a1b57', '#83398a', '#dc6f98', '#fbe2cf'], ink: '#fbe2cf' },
  Graphite: { bg: '#efeeea', inner: '#b8341f', ramp: ['#efeeea', '#c3c1ba', '#7a7872', '#2c2b29', '#121211'], ink: '#121211' },
}

type SetName = Features['Set']
type Depth = Features['Depth']

// Zoom walk: steps of magnification, and the iteration budget, per depth.
const DEPTH: Record<Depth, { steps: number, lo: number, hi: number, iter: number }> = {
  Wide: { steps: 0, lo: 1, hi: 1, iter: 200 },
  Mid: { steps: 2, lo: 3.5, hi: 6, iter: 300 },
  Deep: { steps: 5, lo: 4, hi: 7, iter: 420 },
}

/** A random unit vector, by rejection in the unit disc (no trigonometry). */
function unit(r: Rng): [number, number] {
  for (;;) {
    const x = 2 * r() - 1
    const y = 2 * r() - 1
    const d = x * x + y * y
    if (d > 0.04 && d < 1) {
      const n = sqrt(d)
      return [x / n, y / n]
    }
  }
}

/** Does the critical orbit of z^d + c escape within n steps? */
function escapes(cx: number, cy: number, d: number, n: number): boolean {
  let zx = 0
  let zy = 0
  for (let i = 0; i < n; i++) {
    let wx = zx
    let wy = zy
    for (let k = 1; k < d; k++) {
      const t = wx * zx - wy * zy
      wy = wx * zy + wy * zx
      wx = t
    }
    zx = wx + cx
    zy = wy + cy
    if (zx * zx + zy * zy > 16)
      return true
  }
  return false
}

// Centres of a few hyperbolic components of the Mandelbrot set (period 1, 2,
// 3, 3, 4), used as starting points of the rays.
const ANCHORS2 = [[0, 0, 40], [-1, 0, 22], [-0.1226, 0.7449, 14], [-0.1226, -0.7449, 14], [-1.7549, 0, 4], [0.2822, 0.5301, 6]] as const

interface Attractor {
  qx: number
  qy: number
  qeps2: number
  rho: number
}

/**
 * The attracting cycle of z^d + c, found by following the critical orbit
 * (Fatou: an attracting cycle attracts a critical point). Returns one cycle
 * point, the modulus of the multiplier, and a ball around the cycle point
 * inside its immediate basin, or null if the orbit has not settled.
 */
function attractor(cx: number, cy: number, d: number): Attractor | null {
  let zx = 0
  let zy = 0
  const step = () => {
    let wx = zx
    let wy = zy
    for (let k = 1; k < d; k++) {
      const t = wx * zx - wy * zy
      wy = wx * zy + wy * zx
      wx = t
    }
    zx = wx + cx
    zy = wy + cy
  }
  for (let i = 0; i < 6000; i++) {
    step()
    if (zx * zx + zy * zy > 16)
      return null
  }
  const H = 48
  const hx = new Float64Array(H)
  const hy = new Float64Array(H)
  for (let i = 0; i < H; i++) {
    step()
    hx[i] = zx
    hy[i] = zy
  }
  let p = 0
  for (let k = 1; k <= 24 && !p; k++) {
    const ex = hx[H - 1] - hx[H - 1 - k]
    const ey = hy[H - 1] - hy[H - 1 - k]
    if (ex * ex + ey * ey < 1e-16)
      p = k
  }
  if (!p)
    return null
  // multiplier: product of f'(z) = d z^(d-1) along the cycle
  let lx = 1
  let ly = 0
  let zmax = 0
  for (let j = 0; j < p; j++) {
    const px = hx[H - 1 - j]
    const py = hy[H - 1 - j]
    zmax = Math.max(zmax, px * px + py * py)
    let wx = d
    let wy = 0
    for (let k = 1; k < d; k++) {
      const t = wx * px - wy * py
      wy = wx * py + wy * px
      wx = t
    }
    const t = lx * wx - ly * wy
    ly = lx * wy + ly * wx
    lx = t
  }
  const rho = sqrt(lx * lx + ly * ly)
  if (rho >= 1)
    return null
  // a conservative contraction radius around the cycle point
  const eps = (1 - rho) / (4 * d * p * Math.max(1, zmax))
  return { qx: hx[H - 1], qy: hy[H - 1], qeps2: eps * eps, rho }
}

interface JuliaC {
  cx: number
  cy: number
  att: Attractor | null
}

/** A Julia constant just inside or just outside the connectedness locus. */
function pickC(r: Rng, d: number): JuliaC {
  let ax = 0
  let ay = 0
  if (d === 2) {
    const anchor = weighted(r, ANCHORS2.map(a => [a, a[2]] as const))
    ax = anchor[0]
    ay = anchor[1]
  }
  const [ux, uy] = unit(r)
  let tin = 0
  let tout = 3
  for (let t = 0.004; t < 3; t += 0.004) {
    if (escapes(ax + ux * t, ay + uy * t, d, 160)) {
      tout = t
      break
    }
    tin = t
  }
  for (let i = 0; i < 26; i++) {
    const m = (tin + tout) / 2
    if (escapes(ax + ux * m, ay + uy * m, d, 400))
      tout = m
    else
      tin = m
  }
  const inside = r() < 0.6
  const off = range(r, 0.0005, 0.004)
  const rhoMax = range(r, 0.9, 0.985)
  if (!inside) {
    // outside: a fine dust, just past the boundary
    const t = tout + 4 * off
    return { cx: ax + ux * t, cy: ay + uy * t, att: null }
  }
  // inside: a connected set with a filled interior. Walk towards the anchor
  // until the attracting cycle is strong enough to be detected quickly.
  let t = tin - off
  for (let i = 0; i < 60; i++) {
    const att = attractor(ax + ux * t, ay + uy * t, d)
    if (att && att.rho <= rhoMax)
      return { cx: ax + ux * t, cy: ay + uy * t, att }
    t *= 0.985
  }
  return { cx: ax + ux * t, cy: ay + uy * t, att: attractor(ax + ux * t, ay + uy * t, d) }
}

interface Frame {
  spec: FractalSpec
  cx: number
  cy: number
  /** Plane length across the canvas short side. */
  span: number
  rc: number
  rs: number
  /** Median smooth count of the escaping preview pixels. */
  nuRef: number
  /** Median orbit-trap distance of the preview (Trap shading). */
  trapRef: number
}

interface Preview {
  esc: Uint8Array
  nu: Float64Array
  basin: Int8Array
  trap: Float64Array
}

function preview(f: Frame, n: number, sampler: Sampler, finish: (out: Sample) => void): Preview {
  const s = newSample()
  const esc = new Uint8Array(n * n)
  const nu = new Float64Array(n * n)
  const basin = new Int8Array(n * n)
  const trap = new Float64Array(n * n)
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n - 0.5
      const v = (j + 0.5) / n - 0.5
      sampler(f.cx + f.span * (f.rc * u - f.rs * v), f.cy + f.span * (f.rs * u + f.rc * v), s)
      finish(s)
      esc[j * n + i] = s.esc
      nu[j * n + i] = s.nu
      basin[j * n + i] = s.basin
      trap[j * n + i] = s.trap
    }
  }
  return { esc, nu, basin, trap }
}

function median(xs: number[]): number {
  if (!xs.length)
    return 1
  const a = Float64Array.from(xs).sort()
  return a[a.length >> 1]
}

/**
 * Shannon entropy (bits) of the iteration histogram, the interior share, and
 * the roughness: the share of neighbouring preview pixels far apart in
 * colour (high for frames that are mostly noise), and the detail: the share
 * of neighbours that differ at all (low for an empty gradient).
 */
function frameScore(p: Preview, nuRef: number): { h: number, interior: number, rough: number, detail: number } {
  const n = p.esc.length
  const bins = new Float64Array(16 * 8)
  const lr = ln(1 + nuRef)
  const tv = new Float64Array(n)
  let interior = 0
  for (let i = 0; i < n; i++) {
    let b = 0
    if (!p.esc[i]) {
      interior++
    }
    else {
      tv[i] = 5 * ln(1 + p.nu[i]) / lr
      b = 1 + Math.floor(tv[i])
      if (b > 15)
        b = 15
      if (p.basin[i] > 0)
        b += 16 * Math.min(7, p.basin[i])
    }
    bins[b]++
  }
  const side = Math.round(sqrt(n))
  let rough = 0
  let detail = 0
  for (let j = 0; j < side; j++) {
    for (let i = 0; i + 1 < side; i++) {
      for (const [a, b] of [[j * side + i, j * side + i + 1], [i * side + j, (i + 1) * side + j]]) {
        const edge = p.esc[a] !== p.esc[b] || p.basin[a] !== p.basin[b]
        const dt = Math.abs(tv[a] - tv[b])
        if (edge || dt > 0.6)
          rough++
        if (edge || dt > 0.2)
          detail++
      }
    }
  }
  let h = 0
  for (const c of bins) {
    if (c > 0) {
      const q = c / n
      h -= q * ln(q)
    }
  }
  const pairs = 2 * side * (side - 1)
  return { h: h / ln(2), interior: interior / n, rough: rough / pairs, detail: detail / pairs }
}

function makeFrame(hash: string, f: Features): Frame {
  const r = stream(hash, 'frame')
  const set: SetName = f.Set
  const dep = DEPTH[f.Depth]
  const newton = set === 'Newton'
  const maxIter = newton ? Math.round(dep.iter / 5) : dep.iter

  // Newton roots: 3 to 6 points, kept apart, in a disc.
  const nRoots = int(r, 3, 6)
  const roots = new Float64Array(nRoots * 2)
  for (let k = 0; k < nRoots; k++) {
    for (let tries = 0; ; tries++) {
      const [ux, uy] = unit(r)
      const rad = range(r, 0.35, 1)
      const x = ux * rad
      const y = uy * rad
      let ok = true
      for (let m = 0; m < k; m++) {
        const dx = x - roots[2 * m]
        const dy = y - roots[2 * m + 1]
        if (dx * dx + dy * dy < 0.3 * 0.3)
          ok = false
      }
      if (ok || tries > 40) {
        roots[2 * k] = x
        roots[2 * k + 1] = y
        break
      }
    }
  }
  const relax = r() < 0.6 ? 1 : range(r, 0.8, 1.25)
  const degree = set === 'Multi-Julia' ? weighted(r, [[3, 50], [4, 30], [5, 20]] as const) : 2

  // Trap shape (only drawn by the Trap shading).
  const tr = stream(hash, 'trap')
  const trap: TrapKind = f.Shading === 'Trap' ? weighted(tr, [[1, 40], [2, 35], [3, 25]] as const) : 0
  const [tux, tuy] = unit(tr)
  const trad = range(tr, 0, 0.6)
  const tx = tux * trad
  const ty = tuy * trad
  const tring = range(tr, 0.3, 0.9)

  let best: Frame | undefined
  let bestScore = -Infinity
  // The Burning Ship has wide noisy regions: it gets more tries.
  const attempts = set === 'Burning Ship' ? 12 : 6
  for (let attempt = 0; attempt < attempts; attempt++) {
    let cx = 0
    let cy = 0
    let att: Attractor | null = null
    let julia = false
    let family: FractalSpec['family'] = 'poly'
    if (set === 'Julia' || set === 'Multi-Julia') {
      const jc = pickC(r, degree)
      cx = jc.cx
      cy = jc.cy
      att = jc.att
      julia = true
    }
    else if (set === 'Burning Ship') {
      family = 'ship'
    }
    else if (set === 'Newton') {
      family = 'newton'
    }
    const spec: FractalSpec = { family, julia, degree, cx, cy, roots, relax, maxIter, trap, tx, ty, tr: tring, qx: att?.qx ?? 0, qy: att?.qy ?? 0, qeps2: att?.qeps2 ?? 0 }
    const sampler = makeSampler(spec, false)
    const finish = makeFinish(spec, false)

    // Starting view; the Burning Ship keeps its upright orientation.
    let rc = 1
    let rs = 0
    if (set !== 'Burning Ship')
      [rc, rs] = unit(r)
    const fr: Frame = { spec, cx: 0, cy: 0, span: 4, rc, rs, nuRef: 1, trapRef: 1 }
    if (set === 'Mandelbrot') {
      fr.cx = -0.6
      fr.span = 3
    }
    else if (set === 'Burning Ship') {
      // the whole ship, or the "armada" of small ships along the antenna
      const v = weighted(r, [[[-0.45, -0.5, 3.2], 40], [[-1.755, -0.03, 0.14], 45], [[-1.62, -0.01, 0.35], 15]] as const)
      fr.cx = v[0]
      fr.cy = v[1]
      fr.span = v[2]
    }
    else if (newton) {
      fr.span = 3
    }
    else if (degree > 2) {
      fr.span = 3.2
    }

    // Fit the view to the set: bounding box of the interior and of the
    // slowest-escaping quarter of the preview.
    {
      const n = 40
      const p = preview(fr, n, sampler, finish)
      const esc: number[] = []
      for (let i = 0; i < n * n; i++) {
        if (p.esc[i])
          esc.push(p.nu[i])
      }
      const q = esc.length ? Float64Array.from(esc).sort()[Math.floor(esc.length * 0.75)] : 0
      let x0 = n
      let x1 = -1
      let y0 = n
      let y1 = -1
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          const k = j * n + i
          if (!newton && (!p.esc[k] || p.nu[k] > q)) {
            x0 = Math.min(x0, i)
            x1 = Math.max(x1, i)
            y0 = Math.min(y0, j)
            y1 = Math.max(y1, j)
          }
        }
      }
      if (newton) {
        // all roots in view, with room for the basins between them
        let mx = 0
        let my = 0
        for (let k = 0; k < nRoots; k++) {
          mx += roots[2 * k] / nRoots
          my += roots[2 * k + 1] / nRoots
        }
        let ext = 0
        for (let k = 0; k < nRoots; k++)
          ext = Math.max(ext, Math.abs(roots[2 * k] - mx), Math.abs(roots[2 * k + 1] - my))
        fr.cx = mx
        fr.cy = my
        fr.span = 2 * ext * 1.6 + 0.4
      }
      else if (x1 >= x0) {
        const u = ((x0 + x1 + 1) / 2) / n - 0.5
        const v = ((y0 + y1 + 1) / 2) / n - 0.5
        const ocx = fr.cx
        fr.cx = ocx + fr.span * (fr.rc * u - fr.rs * v)
        fr.cy = fr.cy + fr.span * (fr.rs * u + fr.rc * v)
        fr.span *= Math.max(x1 - x0 + 1, y1 - y0 + 1) / n * 1.04
      }
    }

    // Parameter-plane sets are never shown whole: one step in, at least.
    const steps = dep.steps + ((set === 'Mandelbrot' || set === 'Burning Ship') ? 1 : 0)
    for (let s = 0; s < steps; s++) {
      const n = 28
      const p = preview(fr, n, sampler, finish)
      const cand: number[] = []
      if (newton) {
        for (let j = 4; j < n - 4; j++) {
          for (let i = 4; i < n - 4; i++) {
            const k = j * n + i
            if (p.basin[k] !== p.basin[k + 1] || p.basin[k] !== p.basin[k + n])
              cand.push(k)
          }
        }
      }
      else {
        const esc: number[] = []
        for (let k = 0; k < n * n; k++) {
          if (p.esc[k])
            esc.push(p.nu[k])
        }
        const a = Float64Array.from(esc).sort()
        const q = a.length ? a[Math.floor(a.length * 0.75)] : 0
        for (let j = 4; j < n - 4; j++) {
          for (let i = 4; i < n - 4; i++) {
            const k = j * n + i
            if (p.esc[k] && p.nu[k] >= q)
              cand.push(k)
          }
        }
      }
      if (!cand.length)
        break
      const k = cand[Math.floor(r() * cand.length)]
      const u = ((k % n) + 0.5) / n - 0.5
      const v = (Math.floor(k / n) + 0.5) / n - 0.5
      const ocx = fr.cx
      fr.cx = ocx + fr.span * (fr.rc * u - fr.rs * v)
      fr.cy = fr.cy + fr.span * (fr.rs * u + fr.rc * v)
      fr.span /= range(r, dep.lo, dep.hi)
    }

    // Entropy test on a final preview.
    const n = 40
    const p = preview(fr, n, sampler, finish)
    const esc: number[] = []
    for (let i = 0; i < n * n; i++) {
      if (p.esc[i])
        esc.push(p.nu[i])
    }
    fr.nuRef = Math.max(1, median(esc))
    if (trap) {
      const ts: number[] = []
      for (let i = 0; i < n * n; i++)
        ts.push(p.trap[i])
      fr.trapRef = Math.max(1e-6, median(ts))
    }
    // Fine-scale noise, finer than a preview cell: each preview point against
    // the point one pixel to its right on a 600 px canvas.
    const q = preview({ ...fr, cx: fr.cx + fr.span * fr.rc / 600, cy: fr.cy + fr.span * fr.rs / 600 }, n, sampler, finish)
    const lr = ln(1 + fr.nuRef)
    let speckle = 0
    for (let i = 0; i < n * n; i++) {
      if (p.esc[i] !== q.esc[i] || p.basin[i] !== q.basin[i] || Math.abs(ln(1 + p.nu[i]) - ln(1 + q.nu[i])) > 0.15 * lr)
        speckle++
    }
    const fine = speckle / (n * n)
    // Rich but not noisy, not mostly filled, and not too slow to render.
    const { h, interior, rough, detail } = frameScore(p, fr.nuRef)
    const slow = fr.nuRef / maxIter
    const score = h - 4 * Math.max(0, interior - 0.6) - 6 * Math.max(0, rough - 0.3) - 8 * Math.max(0, slow - 0.15) - 10 * Math.max(0, 0.12 - detail) - 12 * Math.max(0, fine - 0.12)
    if (score > bestScore) {
      bestScore = score
      best = fr
    }
    if (h >= 2 && interior <= 0.6 && rough <= 0.3 && slow <= 0.15 && detail >= 0.12 && fine <= 0.12)
      break
  }
  return best!
}

type Rgb = [number, number, number]

function hex(c: string): Rgb {
  const v = Number.parseInt(c.slice(1), 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}

const LUT_N = 1024

function buildLut(ramp: readonly string[]): Float32Array {
  const stops = ramp.map(hex)
  const lut = new Float32Array(LUT_N * 3)
  for (let i = 0; i < LUT_N; i++) {
    const x = i / (LUT_N - 1) * (stops.length - 1)
    const k = Math.min(stops.length - 2, Math.floor(x))
    const t = x - k
    for (let c = 0; c < 3; c++)
      lut[i * 3 + c] = stops[k][c] + (stops[k + 1][c] - stops[k][c]) * t
  }
  return lut
}

const SHADE_ID: Record<Features['Shading'], number> = { Bands: 0, Relief: 1, Filament: 2, Trap: 3, Contour: 4 }

// Supersampling: extra sample offsets (pixel units, around the centre), from
// the richest pattern down. The first one that fits the budget is used.
const T = 1 / 3
const AA_PATTERNS: readonly (readonly number[])[] = [
  [-T, -T, 0, -T, T, -T, -T, 0, T, 0, -T, T, 0, T, T, T],
  [-0.25, -0.25, 0.25, -0.25, -0.25, 0.25, 0.25, 0.25],
  [-0.25, 0.25, 0.25, -0.25],
  [0.25, 0.25],
]
const AA_RATIO = 0.3
const CELL = 4
/** Largest colour difference (sum over channels) still interpolated. */
const SMOOTH = 24
const AA_CAP = 3e6

/**
 * Larger canvases are computed on a grid of at most MAX_PIXELS (4K UHD) and
 * scaled up: past that size the iteration cost grows with no visible gain,
 * and an 8K export stays within seconds.
 */
const MAX_PIXELS = 3840 * 2160

function render(g: CanvasRenderingContext2D, W: number, H: number, hash: string) {
  if (W * H <= MAX_PIXELS) {
    paint(g, W, H, hash)
    return
  }
  const k = sqrt(MAX_PIXELS / (W * H))
  const w = Math.max(1, Math.floor(W * k))
  const h = Math.max(1, Math.floor(H * k))
  paint(g, w, h, hash)
  g.save()
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.imageSmoothingEnabled = true
  g.imageSmoothingQuality = 'high'
  // drawing a canvas onto itself copies the source region first
  g.drawImage(g.canvas, 0, 0, w, h, 0, 0, W, H)
  g.restore()
}

function paint(g: CanvasRenderingContext2D, W: number, H: number, hash: string) {
  const f = features(hash)
  const pal = PAL[f.Palette]
  const fr = makeFrame(hash, f)
  const S = Math.min(W, H)
  const mode = SHADE_ID[f.Shading]
  const deriv = mode === 1 || mode === 2 || mode === 4
  const sampler = makeSampler(fr.spec, deriv)
  const finish = makeFinish(fr.spec, deriv)
  const smp = newSample()
  const lut = buildLut(pal.ramp)
  const bg = hex(pal.bg)
  const inner = hex(pal.inner)
  const ink = hex(pal.ink)

  // Colour parameters.
  const cr = stream(hash, 'color')
  const cyc = range(cr, 0.9, 2.2)
  const phase = cr()
  const [lx, ly] = unit(cr)
  const trapScale = fr.trapRef * range(cr, 0.6, 1.6)
  const levels = int(cr, 5, 9)
  const basinShift = range(cr, 0.18, 0.35)
  const lnRef = ln(1 + fr.nuRef)
  const lnD = ln(fr.spec.degree)
  const span = fr.span
  // Filament and contour widths, as fractions of the short side.
  const glowW = 0.0035
  const lineW = 0.0011

  const LM = LUT_N - 1
  // Writes the colour of the sample in `smp` into out[o..o+2].
  function colour(out: Float32Array, o: number) {
    const s = smp
    if (!s.esc) {
      if (mode === 3 && s.trap < Infinity) {
        const tt = s.trap / trapScale
        const i = ((0.04 + 0.92 / (1 + tt * tt)) * LM) | 0
        out[o] = lut[i * 3]
        out[o + 1] = lut[i * 3 + 1]
        out[o + 2] = lut[i * 3 + 2]
        return
      }
      out[o] = inner[0]
      out[o + 1] = inner[1]
      out[o + 2] = inner[2]
      return
    }
    let t = cyc * ln(1 + s.nu) / lnRef + phase
    if (s.basin >= 0)
      t += basinShift * s.basin
    let tri = t - Math.floor(t)
    tri = tri < 0.5 ? 2 * tri : 2 - 2 * tri
    let i: number
    if (mode === 0) {
      i = (tri * LM) | 0
      out[o] = lut[i * 3]
      out[o + 1] = lut[i * 3 + 1]
      out[o + 2] = lut[i * 3 + 2]
      return
    }
    if (mode === 1) {
      i = ((0.15 + 0.7 * tri) * LM) | 0
      let lam = (s.ux * lx + s.uy * ly + 1.4) / 2.4
      if (lam < 0)
        lam = 0
      const k = 0.28 + 0.92 * lam
      const l2 = lam * lam
      const spec = l2 * l2 * l2 * 70
      out[o] = Math.min(255, lut[i * 3] * k + spec)
      out[o + 1] = Math.min(255, lut[i * 3 + 1] * k + spec)
      out[o + 2] = Math.min(255, lut[i * 3 + 2] * k + spec)
      return
    }
    if (mode === 2) {
      const dn = s.de / span
      let gl = glowW / (glowW + dn)
      gl *= gl
      i = ((0.4 + 0.6 * tri) * LM) | 0
      out[o] = bg[0] + (lut[i * 3] - bg[0]) * gl
      out[o + 1] = bg[1] + (lut[i * 3 + 1] - bg[1]) * gl
      out[o + 2] = bg[2] + (lut[i * 3 + 2] - bg[2]) * gl
      return
    }
    if (mode === 3) {
      // the escaping side keeps its trap colour, a little washed towards the ground
      const tt = s.trap / trapScale
      i = ((0.04 + 0.92 / (1 + tt * tt)) * LM) | 0
      const m = 0.72
      out[o] = bg[0] + (lut[i * 3] - bg[0]) * m
      out[o + 1] = bg[1] + (lut[i * 3 + 1] - bg[1]) * m
      out[o + 2] = bg[2] + (lut[i * 3 + 2] - bg[2]) * m
      return
    }
    // Contour: posterised levels with ink lines between them.
    const lv = (t - phase) * levels
    const band = Math.floor(lv)
    // 0, 1, 2, 1, 0...: neighbouring bands never share a colour
    let q = band & 3
    if (q === 3)
      q = 1
    i = ((0.1 + 0.3 * q) * LM) | 0
    let fd = lv - band
    if (fd > 0.5)
      fd = 1 - fd
    // |grad nu| ~ 1 / (de ln d): distance to the nearest level line, in plane units
    const dtdnu = cyc * levels / ((1 + s.nu) * lnRef)
    const dist = fd * s.de * lnD / dtdnu / span
    let a = 1 - (dist - lineW) / lineW
    if (a < 0)
      a = 0
    if (a > 1)
      a = 1
    out[o] = lut[i * 3] + (ink[0] - lut[i * 3]) * a
    out[o + 1] = lut[i * 3 + 1] + (ink[1] - lut[i * 3 + 1]) * a
    out[o + 2] = lut[i * 3 + 2] + (ink[2] - lut[i * 3 + 2]) * a
  }

  const k = span / S
  const hw = W / 2
  const hh = H / 2
  const { rc, rs } = fr
  const ox = fr.cx
  const oy = fr.cy
  function shade(sx: number, sy: number, out: Float32Array, o: number) {
    const u = (sx - hw) * k
    const v = (sy - hh) * k
    sampler(ox + rc * u - rs * v, oy + rs * u + rc * v, smp)
    finish(smp)
    colour(out, o)
  }

  // Pass 1: one sample per pixel, by adaptive subdivision on a fixed grid of
  // 4 px cells. A cell whose four corners agree (all bounded, or colours
  // within a few levels) is filled without iterating: flat for the filled
  // set, bilinear for a smooth gradient. Any other cell is split in four.
  const P = W * H
  const img = g.createImageData(W, H)
  const data = img.data
  /** 0: not computed, 1: escaped, 2: bounded, 3: flagged for supersampling. */
  const state = new Uint8Array(P)
  const tmp = new Float32Array(3)
  const canFill = mode !== 3
  const px = (x: number, y: number): number => {
    const id = y * W + x
    const st = state[id]
    if (st)
      return st
    shade(x + 0.5, y + 0.5, tmp, 0)
    const p = id * 4
    data[p] = tmp[0]
    data[p + 1] = tmp[1]
    data[p + 2] = tmp[2]
    data[p + 3] = 255
    return (state[id] = smp.esc ? 1 : 2)
  }
  const near = (p: number, q: number) =>
    Math.abs(data[p] - data[q]) + Math.abs(data[p + 1] - data[q + 1]) + Math.abs(data[p + 2] - data[q + 2]) <= SMOOTH
  const cell = (x0: number, y0: number, x1: number, y1: number) => {
    const a = px(x0, y0)
    const b = px(x1, y0)
    const c = px(x0, y1)
    const d = px(x1, y1)
    if (x1 - x0 < 2 && y1 - y0 < 2)
      return
    const pa = (y0 * W + x0) * 4
    const pb = (y0 * W + x1) * 4
    const pc = (y1 * W + x0) * 4
    const pd = (y1 * W + x1) * 4
    const same = a === b && a === c && a === d
    if (same && ((a === 2 && canFill) || (near(pa, pb) && near(pa, pc) && near(pa, pd) && near(pb, pc) && near(pb, pd) && near(pc, pd)))) {
      const iw = 1 / (x1 - x0 || 1)
      const ih = 1 / (y1 - y0 || 1)
      for (let y = y0; y <= y1; y++) {
        const v = (y - y0) * ih
        for (let x = x0; x <= x1; x++) {
          const id = y * W + x
          if (state[id])
            continue
          const u = (x - x0) * iw
          const p = id * 4
          for (let ch = 0; ch < 3; ch++) {
            const top = data[pa + ch] + (data[pb + ch] - data[pa + ch]) * u
            const bot = data[pc + ch] + (data[pd + ch] - data[pc + ch]) * u
            data[p + ch] = top + (bot - top) * v
          }
          data[p + 3] = 255
          state[id] = a
        }
      }
      return
    }
    const xm = (x0 + x1) >> 1
    const ym = (y0 + y1) >> 1
    if (x1 - x0 < 2) {
      cell(x0, y0, x1, ym)
      cell(x0, ym, x1, y1)
    }
    else if (y1 - y0 < 2) {
      cell(x0, y0, xm, y1)
      cell(xm, y0, x1, y1)
    }
    else {
      cell(x0, y0, xm, ym)
      cell(xm, y0, x1, ym)
      cell(x0, ym, xm, y1)
      cell(xm, ym, x1, y1)
    }
  }
  for (let y = 0; y < H - 1 || y === 0; y += CELL) {
    for (let x = 0; x < W - 1 || x === 0; x += CELL)
      cell(x, y, Math.min(x + CELL, W - 1), Math.min(y + CELL, H - 1))
  }

  // Pass 2: flag pixels that differ from a neighbour.
  const THR = 56
  let flagged = 0
  const flag = (a: number) => {
    if (state[a] !== 3) {
      state[a] = 3
      flagged++
    }
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const a = y * W + x
      const p = a * 4
      if (x < W - 1) {
        const q = p + 4
        if (Math.abs(data[p] - data[q]) + Math.abs(data[p + 1] - data[q + 1]) + Math.abs(data[p + 2] - data[q + 2]) > THR) {
          flag(a)
          flag(a + 1)
        }
      }
      if (y < H - 1) {
        const q = p + W * 4
        if (Math.abs(data[p] - data[q]) + Math.abs(data[p + 1] - data[q + 1]) + Math.abs(data[p + 2] - data[q + 2]) > THR) {
          flag(a)
          flag(a + W)
        }
      }
    }
  }

  // Pass 3: extra samples on the flagged pixels. The budget grows with the
  // canvas, is capped, and sets how many samples each flagged pixel gets.
  const budget = Math.min(P * AA_RATIO, AA_CAP)
  let pattern: readonly number[] = []
  for (const pat of AA_PATTERNS) {
    if (flagged * pat.length / 2 <= budget) {
      pattern = pat
      break
    }
  }
  const ns = pattern.length / 2
  if (ns > 0) {
    const inv = 1 / (ns + 1)
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const a = y * W + x
        if (state[a] !== 3)
          continue
        const p = a * 4
        let R = data[p]
        let G = data[p + 1]
        let B = data[p + 2]
        for (let s = 0; s < ns; s++) {
          shade(x + 0.5 + pattern[2 * s], y + 0.5 + pattern[2 * s + 1], tmp, 0)
          R += tmp[0]
          G += tmp[1]
          B += tmp[2]
        }
        data[p] = R * inv
        data[p + 1] = G * inv
        data[p + 2] = B * inv
      }
    }
  }
  g.putImageData(img, 0, 0)
}

export default {
  slug: 'julia',
  title: 'Julia',
  summary: 'Escape-time fractals framed by the hash: Julia sets, Mandelbrot and Burning Ship zooms, Newton basins, in smooth bands, relief, filaments, traps or contours.',
  order: 490,
  traits: TRAITS,
  features,
  render,
  // Seed-of-seeds 0x4a554c49414a554c ("gallery" stream): the first hash found
  // for each Set x Palette pair, at most three per Set (so every Set shows),
  // in the order found, except that the third one (a whole Julia set in
  // Vellum relief, the archetype of the series) is moved first as the cover.
  gallery: [
    '0x9ae2ed6b11f8bb478c770722414ed6b85e6c22bb55db9ffdc4e00296b59cfe42',
    '0x4c5c94a0306198a9ac8297efa2ec9001b94766f5450c674e4ea7a4baffb26e2e',
    '0xe8d6e289f4143dcb7c837ff6eba35929578ae616ac0c00b3a668f774a43edb83',
    '0x307a53eee9095624034500b2c35aaf49196f6db16bf63395dd2526dd04fc7971',
    '0xdc63d6d9a6a3b440d9cbe24951d2efbe191e678619c2cde99f33dd4d13605650',
    '0x0bd03f9193f91459b8f7fc320ff5ae82a7eabb0b13a58f48aa03380350db5bf4',
    '0x4eb5886ce48fe5850f7299633763c7087675a2b1c706ab80442800f735163536',
    '0x5ba22d44253f793233f4c8fb38520d9509c55999d1244525642e6b97fa973035',
    '0x69d85e5cbe80f6e1fc2cfb29eb6b5def84fa153137b2b4b1543fdb690ed33507',
    '0x0cdb65acef3fd264f8875b5f9fc3ee20d3f1f8e56074f0354c766011f8481fe8',
    '0xa55c83bc1f2aa4488a94acbbbe9b25bd5ba5efb536f4c0c834c2a47c6a976a9c',
    '0x120ad1aa819061f612b87526d4f78685cf21afadbb851b8ec87ed8aeb92c0191',
  ],
} satisfies Series
