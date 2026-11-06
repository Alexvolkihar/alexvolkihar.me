// "Snowflake" — snow crystals grown on a hexagonal cellular automaton.
//
// Each crystal grows from a single frozen cell under Reiter's local model
// (see ../snowflake/reiter.ts): vapour diffuses across a hexagonal grid and
// freezes onto the cells that touch the ice. The background humidity beta,
// the vapour gamma added from the third dimension and the diffusion rate
// alpha decide the habit, from fern-like dendrites to stellar plates. As in
// the sky, where a falling crystal crosses layers of air of different
// humidity, the parameters can change while it grows: a plate that sprouts
// arms, a dendrite that ends in plates. Only one twelfth of each crystal is
// simulated, the rest follows from its symmetry.
//
// The grown crystal is then rendered from its fields: lit ice whose height
// follows the age of each cell (so the oldest spine of every branch stands
// as a ridge), a folded paper cut-out, or a chronicle that colours each cell
// by the moment it froze, as in Gravner & Griffeath's figures.
//
// Everything is a pure function of the hash; lengths are fractions of the
// canvas short side and the simulation never depends on the canvas size.

import type { Rng } from '../random'
import type { Field } from '../snowflake/field'
import type { Phase } from '../snowflake/reiter'
import type { Series } from '../types'
import { range, stream, weighted } from '../random'
import { unfold } from '../snowflake/field'
import { grow } from '../snowflake/reiter'

// Rarity table, decided before the drawing code. Never reorder: it re-rolls the edition.
const TRAITS = {
  Habit: [['Stellar dendrite', 30], ['Fernlike', 15], ['Stellar plate', 20], ['Plate & arms', 20], ['Layered', 15]],
  Finish: [['Ice', 40], ['Paper cut', 30], ['Chronicle', 30]],
  Palette: [['Polar night', 26], ['Aurora', 14], ['Linen', 18], ['Cyanotype', 18], ['Ember', 12], ['Rose', 12]],
  Layout: [['Single', 50], ['Trio', 25], ['Flurry', 25]],
} as const

type TraitName = keyof typeof TRAITS
type Features = { [K in TraitName]: typeof TRAITS[K][number][0] }

function features(hash: string): Features {
  const r = stream(hash, 'features')
  return {
    Habit: weighted(r, TRAITS.Habit),
    Finish: weighted(r, TRAITS.Finish),
    Palette: weighted(r, TRAITS.Palette),
    Layout: weighted(r, TRAITS.Layout),
  }
}

interface Palette {
  /** Dark grounds light the ice additively; light grounds darken it (multiply). */
  dark: boolean
  /** Radial background, centre then edge. */
  bg: readonly [string, string]
  /** Light of the ice on dark grounds, ink of the ice on light ones. */
  ice: string
  glint: string
  /** Tints on the lit and on the shaded flanks (a hint of dispersion). */
  warm: string
  cool: string
  paper: string
  shadow: string
  /** Chronicle colours, from the seed to the last cells. */
  ramp: readonly string[]
  line: string
}

const PAL: Record<Features['Palette'], Palette> = {
  'Polar night': { dark: true, bg: ['#0f1d36', '#040811'], ice: '#a9d4ff', glint: '#ffffff', warm: '#ffe9c2', cool: '#5f7dff', paper: '#eef3f8', shadow: '#000000', ramp: ['#f4fbff', '#9fd3f5', '#4f8fd6', '#24427a'], line: '#081226' },
  'Aurora': { dark: true, bg: ['#0b2226', '#03090b'], ice: '#9ff5d6', glint: '#f2fff9', warm: '#c9ff8f', cool: '#b07cff', paper: '#e6fbf2', shadow: '#000000', ramp: ['#e8ffd9', '#5fe0b0', '#3a8fb8', '#5b3d9e'], line: '#04100f' },
  'Linen': { dark: false, bg: ['#f5f0e6', '#e2d8c6'], ice: '#2f4a66', glint: '#ffffff', warm: '#b07a3c', cool: '#3c6fa8', paper: '#2e4a68', shadow: '#5c4a32', ramp: ['#1f2d3d', '#3f6587', '#a8723f', '#7a3d20'], line: '#f5f0e6' },
  'Cyanotype': { dark: true, bg: ['#22578f', '#0f2f57'], ice: '#cfe6ff', glint: '#ffffff', warm: '#ffffff', cool: '#7fb4ff', paper: '#f6f2e8', shadow: '#061a33', ramp: ['#ffffff', '#dcebf8', '#b3d3f0', '#86b8e6'], line: '#173f6e' },
  'Ember': { dark: true, bg: ['#24130c', '#080403'], ice: '#ffc98a', glint: '#fff6e6', warm: '#ffe08a', cool: '#ff6a3d', paper: '#f7e8d4', shadow: '#000000', ramp: ['#fff1cf', '#f2a64c', '#c4532a', '#6e2216'], line: '#140906' },
  'Rose': { dark: false, bg: ['#f8ebe8', '#ebd3cf'], ice: '#6e2a40', glint: '#ffffff', warm: '#c0563f', cool: '#6c4a9e', paper: '#8c2f4c', shadow: '#6e3a3a', ramp: ['#3a1828', '#7c2c4a', '#c4566f', '#d0806a'], line: '#f8ebe8' },
}

// --- growth parameters per habit ------------------------------------------------

const logRange = (r: Rng, a: number, b: number) => a * (b / a) ** r()

const dendrite = (r: Rng, until: number): Phase => ({ until, alpha: range(r, 0.8, 1.5), beta: range(r, 0.44, 0.58), gamma: logRange(r, 0.0008, 0.005) })
const plate = (r: Rng, until: number): Phase => ({ until, alpha: range(r, 0.8, 1.3), beta: range(r, 0.62, 0.74), gamma: logRange(r, 0.02, 0.07) })

function phasesFor(habit: Features['Habit'], r: Rng): Phase[] {
  if (habit === 'Stellar dendrite') {
    const a = dendrite(r, range(r, 0.35, 0.75))
    const b = dendrite(r, 1)
    return [a, b]
  }
  if (habit === 'Fernlike')
    return [{ until: 1, alpha: range(r, 0.8, 1.25), beta: range(r, 0.38, 0.46), gamma: logRange(r, 0.0002, 0.0015) }]
  if (habit === 'Stellar plate') {
    const p = { until: range(r, 0.7, 1), alpha: range(r, 0.8, 1.3), beta: range(r, 0.55, 0.68), gamma: logRange(r, 0.012, 0.05) }
    return [p, dendrite(r, 1)]
  }
  if (habit === 'Plate & arms')
    return [plate(r, range(r, 0.2, 0.42)), dendrite(r, 1)]
  // Layered: three or four alternating layers of air.
  const cuts = [range(r, 0.15, 0.35), range(r, 0.4, 0.6), range(r, 0.65, 0.85)]
  const startPlate = r() < 0.5
  return cuts.concat([1]).map((u, i) => ((i % 2 === 0) === startPlate ? plate(r, u) : dendrite(r, u)))
}

// --- layout -----------------------------------------------------------------------

interface Flake { x: number, y: number, size: number, rot: number }

/** Dart throwing in an aw x ah box (short side = 1); sizes are tip radii, larger flakes first. */
function scatter(r: Rng, sizes: number[], aw: number, ah: number): Flake[] {
  const out: Flake[] = []
  const m = 0.035
  for (let size of sizes) {
    let placed = false
    for (let attempt = 0; attempt < 6 && !placed; attempt++) {
      for (let k = 0; k < 120; k++) {
        const x = range(r, size + m, aw - size - m)
        const y = range(r, size + m, ah - size - m)
        if (out.every(o => Math.hypot(o.x - x, o.y - y) > (o.size + size) * 1.06 + 0.01)) {
          out.push({ x, y, size, rot: range(r, 0, Math.PI / 3) })
          placed = true
          break
        }
      }
      size *= 0.85
    }
  }
  return out
}

/**
 * Flakes in short-side units from the top left corner of the canvas. Single
 * and Trio compose a centred square; a flurry fills the whole canvas, with as
 * many flakes per unit of area at any aspect ratio.
 */
function layout(kind: Features['Layout'], r: Rng, aw: number, ah: number): Flake[] {
  const cx = (aw - 1) / 2
  const cy = (ah - 1) / 2
  const shift = (fl: Flake[]) => fl.map(o => ({ ...o, x: o.x + cx, y: o.y + cy }))
  if (kind === 'Single')
    return shift([{ x: 0.5, y: 0.5, size: 0.4, rot: range(r, 0, Math.PI / 3) }])
  if (kind === 'Trio')
    return shift(scatter(r, [range(r, 0.27, 0.31), range(r, 0.14, 0.18), range(r, 0.09, 0.12)], 1, 1))
  const n = 7 + Math.floor(r() * 5)
  const total = Math.min(28, Math.round(n * aw * ah))
  const sizes = Array.from({ length: total }, (_, i) => (i === 0 ? range(r, 0.17, 0.21) : range(r, 0.06, 0.15)))
  sizes.sort((a, b) => b - a)
  return scatter(r, sizes, aw, ah)
}

// --- colour helpers ------------------------------------------------------------------

type RGB = [number, number, number]
function rgb(hex: string): RGB {
  const v = Number.parseInt(hex.slice(1), 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}
function smooth(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

type Finish = Features['Finish']
type Surface = HTMLCanvasElement | OffscreenCanvas

function surface(w: number, h: number): Surface {
  if (typeof document === 'undefined')
    return new OffscreenCanvas(w, h)
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  return cv
}

const H3 = Math.sqrt(3) / 2

/**
 * Paint one crystal. The pixels of its bounding box are mapped back onto the
 * lattice, and every field is interpolated linearly on the triangle of cells
 * around the pixel, so edges are straight facets at any resolution.
 */
function paint(g: CanvasRenderingContext2D, fl: Field, flake: Flake, finish: Finish, pal: Palette, S: number, W: number, Hc: number) {
  const { M, side, E, ice, time, depth, height, crease, ridge, gx, gy, deficit } = fl
  const k = (flake.size * S) / E
  const span = finish === 'Ice' ? 1.5 : finish === 'Paper cut' ? 1.12 : 1.35
  const cx = flake.x * S
  const cy = flake.y * S
  const rad = E * span * k + 0.02 * S
  const x0 = Math.max(0, Math.floor(cx - rad))
  const x1 = Math.min(W, Math.ceil(cx + rad))
  const y0 = Math.max(0, Math.floor(cy - rad))
  const y1 = Math.min(Hc, Math.ceil(cy + rad))
  const bw = x1 - x0
  const bh = y1 - y0
  if (bw <= 0 || bh <= 0)
    return
  const cs = Math.cos(flake.rot)
  const sn = Math.sin(flake.rot)
  const inv = 1 / k
  const w = Math.min(0.5, 0.7 * inv)

  // Light from the upper left, turned into the lattice frame.
  const lcx = -0.6
  const lcy = -0.8
  const Lx = lcx * cs + lcy * sn
  const Ly = -lcx * sn + lcy * cs
  const bump = ridge * 0.5

  // Paper shadow: a soft copy of the cut-out, offset down and right.
  const shX = 0.006 * S
  const shY = 0.009 * S
  const ws = Math.min(0.5, 0.7 * inv + (0.006 * S) * inv)
  const nBands = 9 + Math.round(E / 14)
  // Paper cut-outs: inset slits, bridged on the fold lines.
  const period = Math.max(3, E * 0.1)
  const slit = Math.max(0.3, 0.6 * inv)

  const iceC = rgb(pal.ice)
  const glint = rgb(pal.glint)
  const warm = rgb(pal.warm)
  const cool = rgb(pal.cool)
  const paperC = rgb(pal.paper)
  const shadowC = rgb(pal.shadow)
  const lineC = rgb(pal.line)
  const ramp = pal.ramp.map(rgb)

  const cv = surface(bw, bh)
  const og = cv.getContext('2d') as CanvasRenderingContext2D
  const img = og.createImageData(bw, bh)
  const data = img.data

  // Interpolation state for the last sample.
  let ia = 0
  let ib = 0
  let ic = 0
  let wa = 0
  let wb = 0
  let wc = 0
  let X = 0
  let Y = 0
  const locate = (dx: number, dy: number): boolean => {
    X = (dx * cs + dy * sn) * inv
    Y = (-dx * sn + dy * cs) * inv
    const rf = Y / H3
    const qf = X - rf / 2
    const q0 = Math.floor(qf)
    const r0 = Math.floor(rf)
    if (q0 <= -M || q0 >= M - 1 || r0 <= -M || r0 >= M - 1)
      return false
    const fq = qf - q0
    const fr = rf - r0
    const base = (q0 + M) * side + (r0 + M)
    if (fq + fr <= 1) {
      ia = base
      ib = base + side
      ic = base + 1
      wa = 1 - fq - fr
      wb = fq
      wc = fr
    }
    else {
      ia = base + side + 1
      ib = base + 1
      ic = base + side
      wa = fq + fr - 1
      wb = 1 - fq
      wc = 1 - fr
    }
    return true
  }
  const at = (f: Float32Array) => f[ia] * wa + f[ib] * wb + f[ic] * wc

  for (let py = 0; py < bh; py++) {
    const dy = y0 + py + 0.5 - cy
    for (let px = 0; px < bw; px++) {
      const dx = x0 + px + 0.5 - cx
      const o = (py * bw + px) * 4
      if (dx * dx + dy * dy > rad * rad)
        continue
      if (finish === 'Paper cut') {
        let sh = 0
        if (locate(dx - shX, dy - shY))
          sh = smooth(0.5 - ws, 0.5 + ws, at(ice)) * 0.42
        let cov = 0
        let fold = 0
        if (locate(dx, dy)) {
          cov = smooth(0.5 - w, 0.5 + w, at(ice))
          if (cov > 0) {
            // twelve folds: alternate sectors catch the light differently
            const a = Math.atan2(Y, X) / (Math.PI / 6) + 6
            const sec = Math.floor(a)
            const t = a - sec
            fold = (sec % 2 === 0 ? t : 1 - t) * 0.07 - 0.035
            // inset cuts that follow the outline, one every `period` cells of depth
            const dv = at(depth)
            if (dv > period) {
              const fr = Math.abs((dv % period) - period / 2)
              const band = 1 - smooth(slit, slit + 0.6 * inv + 0.05, fr)
              // a bridge of paper along each fold keeps the cut-out in one piece
              const bridge = smooth(1.1, 1.6, Math.min(t, 1 - t) * (Math.PI / 6) * Math.hypot(X, Y))
              cov *= 1 - band * bridge
            }
          }
        }
        const al = cov + sh * (1 - cov)
        if (al <= 0.002)
          continue
        const pc = 1 + fold
        for (let ch = 0; ch < 3; ch++)
          data[o + ch] = (paperC[ch] * pc * cov + shadowC[ch] * sh * (1 - cov)) / al
        data[o + 3] = al * 255
        continue
      }
      if (!locate(dx, dy))
        continue
      const cov = smooth(0.5 - w, 0.5 + w, at(ice))
      const def = at(deficit)
      if (cov === 0) {
        // open air: only the halo of depleted vapour
        if (def < 0.002)
          continue
        if (finish === 'Chronicle') {
          const last = ramp[ramp.length - 1]
          data[o] = last[0]
          data[o + 1] = last[1]
          data[o + 2] = last[2]
          data[o + 3] = def * 0.3 * 255
        }
        else if (pal.dark) {
          data[o] = iceC[0] * def * 0.2
          data[o + 1] = iceC[1] * def * 0.2
          data[o + 2] = iceC[2] * def * 0.2
          data[o + 3] = 255
        }
        else {
          const a = def * 0.08
          data[o] = 255 * (1 - a) + iceC[0] * a
          data[o + 1] = 255 * (1 - a) + iceC[1] * a
          data[o + 2] = 255 * (1 - a) + iceC[2] * a
          data[o + 3] = 255
        }
        continue
      }
      if (finish === 'Chronicle') {
        const tv = at(time)
        const band = Math.min(nBands - 1, Math.floor(tv * nBands))
        const u = (band / (nBands - 1)) * (ramp.length - 1)
        const j = Math.min(ramp.length - 2, Math.floor(u))
        const fu = u - j
        // a hairline between bands, in the background colour
        const edge = (tv * nBands) % 1
        const hair = Math.max(0, 1 - Math.min(edge, 1 - edge) * k * nBands * 0.9 / 1.6) * 0.55
        const halo = def * 0.3 * (1 - cov)
        const al = cov + halo
        if (al <= 0.002)
          continue
        for (let ch = 0; ch < 3; ch++) {
          const c = ramp[j][ch] * (1 - fu) + ramp[j + 1][ch] * fu
          const ci = c * (1 - hair) + lineC[ch] * hair
          data[o + ch] = (ci * cov + ramp[ramp.length - 1][ch] * halo) / al
        }
        data[o + 3] = Math.min(1, al) * 255
        continue
      }
      // Ice
      const h = at(height)
      const gxv = at(gx)
      const gyv = at(gy)
      const g2 = gxv * gxv + gyv * gyv
      const lam = (-(gxv * Lx + gyv * Ly) * bump) / Math.sqrt(1 + bump * bump * g2)
      const lit = Math.max(0, lam)
      const dim = Math.max(0, -lam)
      // Dark-field optics: flat ice is nearly clear, slopes, ridges and the
      // rim bend the light towards the eye.
      const slope = Math.min(1, Math.sqrt(g2) * ridge * 0.8) * cov
      const cr = Math.min(1, at(crease)) * cov
      const rim = cov * (1 - smooth(0.55, 1.6, at(depth)))
      const spec = lit * lit * lit * cov
      if (pal.dark) {
        const body = cov * (0.06 + 0.1 * h) + slope * (0.14 + 0.12 * lam) + cr * 0.55 + rim * 0.42
        for (let ch = 0; ch < 3; ch++) {
          data[o + ch] = iceC[ch] * (body + def * 0.2) + glint[ch] * (spec * 0.5 + cr * cr * 0.5 + rim * 0.12)
            + warm[ch] * lit * 0.16 * cov + cool[ch] * dim * 0.16 * cov
        }
      }
      else {
        const a = Math.min(1, Math.max(0, cov * (0.12 + 0.14 * h) + slope * (0.24 - 0.16 * lam) + cr * 0.55 + rim * 0.7 + def * 0.08 - spec * 0.3))
        for (let ch = 0; ch < 3; ch++) {
          const ink = iceC[ch] * (1 - dim * 0.5) + cool[ch] * dim * 0.5
          data[o + ch] = 255 * (1 - a) + ink * a
        }
      }
      data[o + 3] = 255
    }
  }
  og.putImageData(img, 0, 0)
  g.save()
  if (finish === 'Ice') {
    g.globalCompositeOperation = pal.dark ? 'lighter' : 'multiply'
    if (!pal.dark) {
      // multiply needs white where nothing was drawn
      og.globalCompositeOperation = 'destination-over'
      og.fillStyle = '#ffffff'
      og.fillRect(0, 0, bw, bh)
    }
  }
  g.drawImage(cv as CanvasImageSource, x0, y0)
  g.restore()
}

function render(g: CanvasRenderingContext2D, W: number, H: number, hash: string) {
  const f = features(hash)
  const pal = PAL[f.Palette]
  const S = Math.min(W, H)

  // Fixed stream order: layout, growth, dust.
  const lr = stream(hash, 'layout')
  const gr = stream(hash, 'growth')
  const dr = stream(hash, 'dust')
  const flakes = layout(f.Layout, lr, W / S, H / S)

  g.save()
  g.globalAlpha = 1
  g.globalCompositeOperation = 'source-over'
  const bg = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.hypot(W, H) * 0.55)
  bg.addColorStop(0, pal.bg[0])
  bg.addColorStop(1, pal.bg[1])
  g.fillStyle = bg
  g.fillRect(0, 0, W, H)

  // Diamond dust: tiny ice motes over the whole canvas, as many per area at any aspect.
  const motes = Math.round((f.Finish === 'Ice' ? 90 : 30) * (W * H) / (S * S))
  g.fillStyle = pal.dark ? pal.glint : pal.ice
  for (let i = 0; i < motes; i++) {
    const x = dr() * W
    const y = dr() * H
    const rr = (0.0006 + dr() ** 3 * 0.0022) * S
    g.globalAlpha = (pal.dark ? 0.15 : 0.08) + dr() * (pal.dark ? 0.45 : 0.18)
    g.beginPath()
    g.arc(x, y, rr, 0, Math.PI * 2)
    g.fill()
  }
  g.globalAlpha = 1
  g.restore()

  for (const flake of flakes) {
    const phases = phasesFor(f.Habit, gr)
    const R = Math.round(34 + 225 * flake.size)
    const crystal = grow(R, phases, 0.8, 26 * R)
    const field = unfold(crystal, phases[phases.length - 1].beta, Math.max(3, crystal.extent * 0.7))
    paint(g, field, flake, f.Finish, pal, S, W, H)
  }
}

export default {
  slug: 'snowflake',
  title: 'Snowflake',
  summary: 'Snow crystals grown on a hexagonal cellular automaton, from fern-like dendrites to plates, rendered as lit ice, folded paper or a chronicle of their growth.',
  order: 420,
  traits: TRAITS,
  features,
  render,
  // Seed-of-seeds 0x5f1a4e00 ("gallery" stream): the first hash found for each
  // finish x habit pair, twelve of the fifteen; the cover (an icy stellar
  // dendrite) is moved to the front.
  gallery: [
    '0xaccd68e73eebcbc16a79a5459e22c93cd468fd82ffcd64ee5203d71dfed0c55e',
    '0x0686c46612e9c05f1e0c9a07df5e7fdefadd12d3ee484087dcb6d545c52473be',
    '0x12a2b4da04d2e84365a197c0f5c5c657dfe5ef8876f849b490c8ab34c2f6ff41',
    '0xfaa568e952619b8cd15e66129c3ff6adb1cca283dd3f650f98ced40bb83f700f',
    '0xc4211a8e0b08d89da3c98b775819a923ecf82d73c7c12700bd566de1ec9c9c80',
    '0x0a291da83712aa68560d4a9b42111a7f9d00e7bdb6e90ea8a1f86d54dc1c9962',
    '0x5d60dd402735de812c9fdc6ab208d5d5c9d3a1072f343ae2f98519199e14021d',
    '0x7bd75af1c7f0a318e0f1877cc30bf11c7d20b682ffa96ae462e7f2decde69261',
    '0x17c1d895ed2ce02a32a1919d1f8adbb7fd6799061d25785d4fc13a2d791c48fc',
    '0x64d5d8cf052980b6b6dfde2a950cd1ec706cfe718c082bde130c189b17a21862',
    '0x598c6b115aeed6280e9edf1488e67ffa911493e219f2d2a03b529c9f3f524f80',
    '0xde4e3dc1f50b2e5bed0eea69e88460a0eb44953cdd18747d36d8ef75dbe7d4cb',
  ],
} satisfies Series
