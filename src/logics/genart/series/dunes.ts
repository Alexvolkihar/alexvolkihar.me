// "Dunes" — dune fields grown by Werner's slab model of wind-blown sand.
//
// A bed of loose sand (a sheet, a few heaps) lies on a periodic grid. Wind
// lifts slabs one at a time and drops them downwind; crests shelter the
// cells in their lee, and slopes steeper than the angle of repose avalanche
// (Werner 1995, ../dunes/werner.ts). After a fixed number of picks the sand
// has gathered into barchans, barchanoid or transverse ridges, linear seifs
// or star dunes, depending on the wind regime and the sand supply. The field
// is then lit by a low or high sun with cast shadows, its slopes combed by
// wind ripples, and seen straight from above or from a low angle that runs
// to the horizon (the grid is a torus, so the field tiles seamlessly).
//
// The torus has a fixed size (N x N cells) whatever the canvas, so a hash
// gives the same dunes at every size and aspect: from above, a little less
// than two periods span the canvas short side (turned and gently warped);
// beyond the middle of the canvas, shifted copies of the torus keep or drop
// whole dunes so a wide canvas never shows the period (../dunes/patchwork.ts).
// At a low angle the camera is aimed at one of the tallest dunes and the
// field repeats towards the horizon, into the haze. Every length is a
// fraction of the canvas short side.

import type { Wind } from '../dunes/werner'
import type { Rng } from '../random'
import type { Series } from '../types'
import { blurAxis, blurWrap, latticeNoise, periodicNoise, resampleWrap, sampleWrap, sandBed } from '../dunes/field'
import { castBy, dunePatches, owners } from '../dunes/patchwork'
import { werner } from '../dunes/werner'
import { int, range, stream, weighted } from '../random'

// Rarity table, decided before the drawing code. Never reorder: it re-rolls the edition.
const TRAITS = {
  Palette: [['Erg', 22], ['Namib', 18], ['Gypsum', 16], ['Dusk', 14], ['Mars', 15], ['Nocturne', 15]],
  Wind: [['Unidirectional', 45], ['Bimodal', 30], ['Complex', 25]],
  Sand: [['Scarce', 30], ['Moderate', 40], ['Abundant', 30]],
  View: [['Aerial', 60], ['Oblique', 40]],
  Sun: [['High', 30], ['Low', 50], ['Grazing', 20]],
} as const

type TraitName = keyof typeof TRAITS
type Features = { [K in TraitName]: typeof TRAITS[K][number][0] }

function features(hash: string): Features {
  const r = stream(hash, 'features')
  return {
    Palette: weighted(r, TRAITS.Palette),
    Wind: weighted(r, TRAITS.Wind),
    Sand: weighted(r, TRAITS.Sand),
    View: weighted(r, TRAITS.View),
    Sun: weighted(r, TRAITS.Sun),
  }
}

type RGB = [number, number, number]

interface Palette {
  /** Sand tones from the deepest shade to full sun. */
  sand: readonly [string, string, string, string, string]
  /** Bare interdune floor (gravel, crust or rock), in shade and in sun. */
  floor: readonly [string, string]
  /** Sky at the zenith and at the horizon, for the low-angle view. */
  sky: readonly [string, string]
  /** Distant haze in the low-angle view, and how far it starts (in torus periods). */
  haze: string
  hazeFar: number
}

const PAL: Record<Features['Palette'], Palette> = {
  Erg: { sand: ['#5a2f2a', '#a3593a', '#d48b55', '#f0bb80', '#fde2b8'], floor: ['#8a6448', '#d9b08a'], sky: ['#6f9fcc', '#f2dcc0'], haze: '#ecd3b4', hazeFar: 2.6 },
  Namib: { sand: ['#232a4a', '#7e3a35', '#c95a33', '#f08a4e', '#ffc596'], floor: ['#5e4038', '#c99a7c'], sky: ['#2b62a0', '#f0c9a2'], haze: '#e9b892', hazeFar: 2.6 },
  Gypsum: { sand: ['#5d6286', '#9da0bd', '#d3d2da', '#f1eee9', '#ffffff'], floor: ['#c9bfae', '#f6f1e8'], sky: ['#5f97d4', '#e7eef4'], haze: '#dfe6ee', hazeFar: 2.6 },
  Dusk: { sand: ['#2f2447', '#6b4466', '#b46a7b', '#eba08f', '#ffd3b3'], floor: ['#4a3550', '#b88a90'], sky: ['#34336a', '#f4ad94'], haze: '#d99a95', hazeFar: 2.6 },
  Mars: { sand: ['#0a0708', '#2b1f1b', '#56433a', '#917866', '#d8bfa3'], floor: ['#3a1d15', '#bb7450'], sky: ['#9c6e50', '#e6c39c'], haze: '#d2a37c', hazeFar: 1.6 },
  Nocturne: { sand: ['#05070e', '#141b2c', '#2c3854', '#6a7c9e', '#c4d2e6'], floor: ['#0b0e16', '#323a4e'], sky: ['#03050a', '#1c2a44'], haze: '#18233a', hazeFar: 3.5 },
}

// Winds in the frame of the simulation, blowing towards +x first.
const WINDS: Record<Features['Wind'], readonly Wind[]> = {
  Unidirectional: [{ dx: 1, dy: 0, weight: 1 }],
  // two seasonal winds 135 degrees apart: dunes stretch along their resultant
  Bimodal: [{ dx: 1, dy: 0, weight: 0.56 }, { dx: -1, dy: 1, weight: 0.44 }],
  // winds from all four quarters: sand gathers into star dunes and networks
  Complex: [{ dx: 1, dy: 0, weight: 0.3 }, { dx: 0, dy: 1, weight: 0.25 }, { dx: -1, dy: 0, weight: 0.25 }, { dx: 0, dy: -1, weight: 0.2 }],
}

/** Picks per grid cell. */
const PICKS: Record<Features['Sand'], number> = { Scarce: 40, Moderate: 70, Abundant: 90 }

const BED = {
  Scarce: { sheet: 0, swell: 0, heaps: 2.2, heapHeight: 12, heapRadius: 4 },
  Moderate: { sheet: 1.5, swell: 1.5, heaps: 1.6, heapHeight: 10, heapRadius: 4.5 },
  Abundant: { sheet: 5, swell: 2.5, heaps: 1.5, heapHeight: 7, heapRadius: 4 },
} as const

/** Chance that a slab settles on bare ground: low values sweep the interdunes clean. */
const BARE: Record<Features['Sand'], number> = { Scarce: 0.05, Moderate: 0.2, Abundant: 0.4 }

const SUN: Record<Features['Sun'], readonly [number, number]> = { High: [48, 62], Low: [22, 32], Grazing: [9, 14] }

/** Cells along the canvas short side. */
const N = 64
/** Slab thickness in cell widths: a 2-slab step is the angle of repose (about 34 degrees). */
const SLAB = 1 / 3
const SHADOW = Math.tan(15 * Math.PI / 180) / SLAB
/** Largest raster side used for shading; bigger canvases are upscaled. */
const RASTER_MAX = 1600
/** Smoothed slope where slip faces begin, and the slope they are rebuilt with (tan 32 degrees). */
const SLIP_LO = 0.22
const REPOSE = 0.62
/** Ripple wavelength in cells. */
const RIPPLE = 1.1
/** Vertical exaggeration of the low-angle view: dunes seen edge-on need it to stand out. */
const LIFT = 1.5
/** Size of the fine grain drawn close up in the low-angle view, in cells. */
const GRAIN = 0.25
/** Patchwork of the aerial view: copies of the torus, and the size of the patches each one holds, in cells. */
const COPIES = 4
const PATCH_SIZE = 40
/** Dunes linked by a neck lower than this share of the smaller summit are told apart (laxer for dunes that wrap). */
const NECK = [0.5, 0.7, 0.85, 0.95] as const

function rgb(hex: string): RGB {
  const v = Number.parseInt(hex.slice(1), 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}

function smooth(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

// The simulation only depends on the hash and the grid size: keep the last
// few so a piece redrawn at another size (thumbnail, then full view) is not
// simulated twice.
const cache = new Map<string, Int16Array>()

/** Runs the dune field on a gw x gh torus, in the simulation frame (main wind towards +x). */
function simulate(hash: string, f: Features, gw: number, gh: number) {
  const key = `${hash}|${gw}x${gh}`
  const hit = cache.get(key)
  if (hit)
    return hit
  const h = sandBed(stream(hash, 'bed'), gw, gh, BED[f.Sand])
  werner(h, gw, gh, WINDS[f.Wind], {
    events: PICKS[f.Sand] * gw * gh,
    hop: 3,
    pSand: 0.6,
    pBare: BARE[f.Sand],
    shadow: SHADOW,
    repose: 2,
    season: 4 * gw * gh,
  }, stream(hash, 'wind'))
  cache.set(key, h)
  if (cache.size > 8)
    cache.delete(cache.keys().next().value!)
  return h
}

interface Field {
  /** Grid size (the torus is square). */
  gw: number
  gh: number
  /** Surface height in cell widths. */
  z: Float32Array
  /** The same without the swells of the floor: the sand alone. */
  sand: Float32Array
  /** Sand cover, 0 (bare floor) to 1. */
  cover: Float32Array
  /** Where the model built slip faces (steps at the angle of repose), 0 to 1. */
  slip: Float32Array
  /** Main wind direction (unit vector): the simulation frame blows towards +x. */
  wx: number
  wy: number
}

/** Simulates the field and smooths it into heights and sand cover. */
function buildField(hash: string, f: Features): Field {
  const hs = simulate(hash, f, N, N)
  const cells = N * N
  const raw = new Float32Array(cells)
  for (let c = 0; c < cells; c++)
    raw[c] = hs[c] * SLAB
  // Lines of cells along the wind only meet through avalanches, so crests
  // jitter from one line to the next: smooth twice more across the wind.
  // A third pass irons out the one-slab steps of the stoss slopes, which
  // would otherwise show as terraces under a low sun.
  let z = blurWrap(blurWrap(blurWrap(raw, N, N), N, N), N, N)
  for (let i = 0; i < 2; i++)
    z = blurAxis(z, N, N, 1)
  // Slip faces are where avalanching left steps at the angle of repose
  // (two slabs between neighbours); stoss slopes climb one slab at a time.
  // Only there are faces rebuilt steep when shading.
  const step = new Float32Array(cells)
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const c = y * N + x
      const v = hs[c]
      const d = Math.max(
        Math.abs(v - hs[y * N + (x + 1) % N]),
        Math.abs(v - hs[((y + 1) % N) * N + x]),
      )
      if (d >= 2)
        step[c] = 1
    }
  }
  const sb = blurWrap(blurWrap(step, N, N), N, N)
  const slip = new Float32Array(cells)
  for (let c = 0; c < cells; c++)
    slip[c] = smooth(0.12, 0.35, sb[c])
  // A slab or two is a passing streak over the floor; a dune starts at
  // about three slabs.
  const zb = blurWrap(z, N, N)
  const cover = new Float32Array(cells)
  for (let c = 0; c < cells; c++)
    cover[c] = smooth(0.45, 1.05, zb[c])
  // the bare floor is not a table: low swells and hollows, a fraction of a
  // cell high, that a low sun picks out
  const sand = z.slice()
  const fr = stream(hash, 'floor')
  const big = periodicNoise(fr, 6, 6)
  const fine = periodicNoise(fr, 16, 16)
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const c = y * N + x
      const n = 0.7 * big(x / N * 6, y / N * 6) + 0.3 * fine(x / N * 16, y / N * 16) - 0.5
      z[c] += 0.7 * n * (1 - cover[c])
    }
  }
  return { gw: N, gh: N, z, sand, cover, slip, wx: 1, wy: 0 }
}

/** Fraction of each cell hidden from the sun by the terrain upwind of the light. */
function castShadows(fd: Field, lx: number, ly: number, tanAlt: number) {
  const { gw, gh } = fd
  const z = blurWrap(fd.z, gw, gh)
  let zmax = 0
  for (let c = 0; c < z.length; c++)
    zmax = Math.max(zmax, z[c])
  const out = new Float32Array(gw * gh)
  const step = 0.5
  const dx = lx * step
  const dy = ly * step
  const rise = tanAlt * step
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const z0 = z[y * gw + x]
      let px = x
      let py = y
      let lim = z0
      let s = 0
      while (lim < zmax) {
        px += dx
        py += dy
        lim += rise
        const d = sampleWrap(z, gw, gh, px, py) - lim
        if (d > 0) {
          s = Math.max(s, Math.min(1, d / 0.3))
          if (s >= 1)
            break
        }
      }
      out[y * gw + x] = s
    }
  }
  return out
}

interface Light {
  sx: number
  sy: number
  sz: number
}

/** Shades a raster of rw x rh samples covering the field at `ppc` samples per cell. */
interface Look {
  /** Tone contrast around mid-grey. */
  contrast: number
  /** Share of the slope that tilts the floor's shading. */
  floorTilt: number
  /** Relief of the ripples in the texture. */
  rippleGain: number
  /** Light from the sky that lifts the deepest shade, 0 to 1. */
  sky: number
}

const AERIAL_LOOK: Look = { contrast: 1, floorTilt: 0.25, rippleGain: 1, sky: 0 }
// seen at a low angle, slopes foreshorten: more contrast keeps them legible,
// and the sky lights the shaded faces a little; ripples are redrawn crisply
const OBLIQUE_LOOK: Look = { contrast: 1.3, floorTilt: 0.6, rippleGain: 0.35, sky: 0.06 }

function shade(fd: Field, rw: number, rh: number, ppc: number, pal: Palette, light: Light, shadow: Float32Array, rr: Rng, look: Look) {
  const { contrast, floorTilt, sky } = look
  const { gw, gh } = fd
  const Z = resampleWrap(fd.z, gw, gh, rw, rh)
  const C = resampleWrap(fd.cover, gw, gh, rw, rh)
  const SH = resampleWrap(shadow, gw, gh, rw, rh)
  const SL = resampleWrap(fd.slip, gw, gh, rw, rh)
  // ripple field: crests across the main wind, bent by a wrapped noise and
  // gathered into patches; both are sampled on the grid, then resampled
  const wpx = Math.max(2, Math.round(gw / 5))
  const wpy = Math.max(2, Math.round(gh / 5))
  const warpN = periodicNoise(rr, wpx, wpy)
  const ppx = Math.max(2, Math.round(gw / 9))
  const ppy = Math.max(2, Math.round(gh / 9))
  const patchN = periodicNoise(rr, ppx, ppy)
  const gpx = Math.max(2, Math.round(gw / 2))
  const gpy = Math.max(2, Math.round(gh / 2))
  const gritN = periodicNoise(rr, gpx, gpy)
  // fine grain of the floor, 2.5 lattice cells per grid cell, wrapping
  const grain = periodicNoise(rr, Math.round(gw * 2.5), Math.round(gh * 2.5))
  const bend = range(rr, 1.6, 2.6)
  const wG = new Float32Array(gw * gh)
  const pG = new Float32Array(gw * gh)
  const fG = new Float32Array(gw * gh)
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      wG[y * gw + x] = bend * warpN((x + 0.5) / gw * wpx, (y + 0.5) / gh * wpy)
      pG[y * gw + x] = smooth(0.3, 0.7, patchN((x + 0.5) / gw * ppx, (y + 0.5) / gh * ppy))
      fG[y * gw + x] = gritN((x + 0.5) / gw * gpx, (y + 0.5) / gh * gpy)
    }
  }
  const WARP = resampleWrap(wG, gw, gh, rw, rh)
  const PATCH = resampleWrap(pG, gw, gh, rw, rh)
  const GRIT = resampleWrap(fG, gw, gh, rw, rh)
  // ripples finer than about three samples would alias: fade them out
  const rippleFade = smooth(2.2, 4.5, RIPPLE * ppc)
  // a grazing sun turns every ripple into a black stripe: flatten them
  const rippleAmp = 0.08 * look.rippleGain * Math.min(1, Math.max(0.35, light.sz * 2.4))
  const sand = pal.sand.map(rgb)
  const floor = pal.floor.map(rgb)
  const { sx, sy, sz } = light
  const out = new Uint8ClampedArray(rw * rh * 4)
  const rip = new Float32Array(rw * rh)
  const col: RGB = [0, 0, 0]
  const tone = (t: number, ramp: RGB[], o: RGB) => {
    const x = Math.min(0.9999, Math.max(0, t)) * (ramp.length - 1)
    const i = Math.floor(x)
    const k = x - i
    o[0] = ramp[i][0] + (ramp[i + 1][0] - ramp[i][0]) * k
    o[1] = ramp[i][1] + (ramp[i + 1][1] - ramp[i][1]) * k
    o[2] = ramp[i][2] + (ramp[i + 1][2] - ramp[i][2]) * k
  }
  const fl: RGB = [0, 0, 0]
  const inv = 1 / ppc
  const twoPi = Math.PI * 2
  for (let q = 0; q < rh; q++) {
    const qa = (q === 0 ? rh - 1 : q - 1) * rw
    const qb = (q === rh - 1 ? 0 : q + 1) * rw
    const v = (q + 0.5) * inv
    for (let p = 0; p < rw; p++) {
      const o = q * rw + p
      const pl = p === 0 ? rw - 1 : p - 1
      const pr = p === rw - 1 ? 0 : p + 1
      const z0 = Z[o]
      const zl = Z[q * rw + pl]
      const zr = Z[q * rw + pr]
      const zu = Z[qa + p]
      const zd = Z[qb + p]
      let hx = (zr - zl) * 0.5 * ppc
      let hy = (zd - zu) * 0.5 * ppc
      const slope = Math.sqrt(hx * hx + hy * hy)
      const cov = Math.min(1, Math.max(0, C[o]))
      // Slip faces: the smoothed field is steepest where the model built
      // them. Rebuild them at this resolution as planes at the angle of
      // repose, facing down the local slope: a crisp brink where the crest
      // is convex, a softer toe where the slope meets the floor.
      const curv = (zl + zr + zu + zd - 4 * z0) * ppc * ppc
      let lf = 0
      if (SL[o] > 0.02) {
        // blend the two by curvature rather than switch: no stair-steps
        const crisp = smooth(SLIP_LO, SLIP_LO + 0.025, slope)
        const soft = smooth(SLIP_LO - 0.04, SLIP_LO + 0.06, slope)
        lf = Math.min(1, SL[o]) * (soft + (crisp - soft) * smooth(0.05, -0.05, curv))
      }
      if (lf > 0) {
        const k = lf * (REPOSE / Math.max(1e-6, slope) - 1)
        hx += hx * k
        hy += hy * k
      }
      // ripples cover the flats and the stoss (windward) slopes, in patches
      const u = (p + 0.5) * inv
      const mask = rippleFade * cov * (1 - lf) * (1 - smooth(0.24, 0.34, slope)) * PATCH[o]
      rip[o] = mask
      if (mask > 0.01) {
        const ph = twoPi * ((u * fd.wx + v * fd.wy) / RIPPLE + WARP[o])
        const d = rippleAmp * mask * (Math.cos(ph) + 0.3 * Math.cos(2 * ph))
        hx += d * fd.wx
        hy += d * fd.wy
      }
      const L = (-hx * sx - hy * sy + sz) / Math.sqrt(hx * hx + hy * hy + 1)
      let t = L >= sz ? 0.62 + 0.38 * (L - sz) / (1 - sz) : 0.62 * Math.max(0, L) / sz
      const shd = Math.min(1, Math.max(0, SH[o]))
      t *= 1 - 0.55 * shd
      t = sky + (1 - sky) * t
      t = 0.5 + (t - 0.5) * contrast
      tone(t * 0.92 + 0.04, sand as RGB[], col)
      if (cov < 1) {
        // the floor: flat gravel or crust, in fine grain over broad tones
        const fx = hx * floorTilt
        const fy = hy * floorTilt
        const Lf = (-fx * sx - fy * sy + sz) / Math.sqrt(fx * fx + fy * fy + 1)
        let ft = Lf >= sz ? 0.62 + 0.38 * (Lf - sz) / (1 - sz) : 0.62 * Math.max(0, Lf) / sz
        ft *= (1 - 0.55 * shd) * (0.9 + 0.2 * GRIT[o]) * (0.92 + 0.16 * grain(u * 2.5, v * 2.5))
        fl[0] = floor[0][0] + (floor[1][0] - floor[0][0]) * ft
        fl[1] = floor[0][1] + (floor[1][1] - floor[0][1]) * ft
        fl[2] = floor[0][2] + (floor[1][2] - floor[0][2]) * ft
        col[0] = fl[0] + (col[0] - fl[0]) * cov
        col[1] = fl[1] + (col[1] - fl[1]) * cov
        col[2] = fl[2] + (col[2] - fl[2]) * cov
      }
      out[o * 4] = col[0]
      out[o * 4 + 1] = col[1]
      out[o * 4 + 2] = col[2]
      out[o * 4 + 3] = 255
    }
  }
  return { rgba: out, Z, rip, warp: WARP }
}

function lightFor(lr: Rng, f: Features, wx: number, wy: number): { light: Light, lx: number, ly: number, tanAlt: number } {
  // the sun stands upwind, off to one side: slip faces fall into shade
  const side = lr() < 0.5 ? -1 : 1
  const off = side * range(lr, 18, 68) * Math.PI / 180
  const a = Math.atan2(-wy, -wx) + off
  const [lo, hi] = SUN[f.Sun]
  const alt = range(lr, lo, hi) * Math.PI / 180
  const lx = Math.cos(a)
  const ly = Math.sin(a)
  return {
    light: { sx: Math.cos(alt) * lx, sy: Math.cos(alt) * ly, sz: Math.sin(alt) },
    lx,
    ly,
    tanAlt: Math.tan(alt),
  }
}

function blit(g: CanvasRenderingContext2D, rgba: Uint8ClampedArray, rw: number, rh: number, W: number, H: number) {
  const img = new ImageData(rgba as Uint8ClampedArray<ArrayBuffer>, rw, rh)
  if (rw === W && rh === H) {
    g.putImageData(img, 0, 0)
    return
  }
  const off = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(rw, rh)
    : Object.assign(document.createElement('canvas'), { width: rw, height: rh })
  const oc = off.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
  if (!oc)
    return
  oc.putImageData(img, 0, 0)
  g.imageSmoothingEnabled = true
  g.imageSmoothingQuality = 'high'
  g.drawImage(off, 0, 0, W, H)
}

function renderAerial(g: CanvasRenderingContext2D, W: number, H: number, hash: string, f: Features) {
  const pal = PAL[f.Palette]
  const S = Math.min(W, H)
  const k = Math.min(1, RASTER_MAX / S)
  const rw = Math.max(1, Math.round(W * k))
  const rh = Math.max(1, Math.round(H * k))
  const rs = Math.min(rw, rh)

  // The torus seen from above: turned to any angle, a little less than two
  // periods across the short side, and gently warped so its copies differ.
  const vr = stream(hash, 'view')
  const angle = vr() * Math.PI * 2
  const periods = range(vr, 1.6, 2)
  const cx = vr() * N
  const cy = vr() * N
  const warp = Array.from({ length: 4 }, () => ({ amp: range(vr, 1.2, 3.2), freq: range(vr, 0.6, 1.5), phase: vr() * Math.PI * 2 }))
  const cpp = periods * N / rs // cells per raster pixel

  const fd = buildField(hash, f)
  const lit = lightFor(stream(hash, 'light'), f, fd.wx, fd.wy)
  const shadow = castShadows(fd, lit.lx, lit.ly, lit.tanAlt)
  const tex = Math.min(12, Math.max(3, Math.ceil(1.05 / cpp)))
  const T = N * tex
  const { rgba: trgb, Z: tz } = shade(fd, T, T, tex, pal, lit.light, shadow, stream(hash, 'ripples'), AERIAL_LOOK)

  // warp offsets (cells), separable: one sine per screen axis and world axis
  const two = Math.PI * 2
  const rowX = new Float32Array(rh)
  const rowY = new Float32Array(rh)
  const colX = new Float32Array(rw)
  const colY = new Float32Array(rw)
  for (let q = 0; q < rh; q++) {
    rowX[q] = warp[0].amp * Math.sin(two * warp[0].freq * q / rs + warp[0].phase)
    rowY[q] = warp[1].amp * Math.sin(two * warp[1].freq * q / rs + warp[1].phase)
  }
  for (let p = 0; p < rw; p++) {
    colX[p] = warp[2].amp * Math.sin(two * warp[2].freq * p / rs + warp[2].phase)
    colY[p] = warp[3].amp * Math.sin(two * warp[3].freq * p / rs + warp[3].phase)
  }
  const ca = Math.cos(angle) * cpp
  const sa = Math.sin(angle) * cpp
  // world position (cells, unwrapped) of raster point (p, q): a row term
  // plus a column term
  const rowWX = new Float32Array(rh)
  const rowWY = new Float32Array(rh)
  const colWX = new Float32Array(rw)
  const colWY = new Float32Array(rw)
  for (let q = 0; q < rh; q++) {
    rowWX[q] = cx - sa * (q + 0.5 - rh / 2) + rowX[q]
    rowWY[q] = cy + ca * (q + 0.5 - rh / 2) + rowY[q]
  }
  for (let p = 0; p < rw; p++) {
    colWX[p] = ca * (p + 0.5 - rw / 2) + colX[p]
    colWY[p] = sa * (p + 0.5 - rw / 2) + colY[p]
  }
  const worldX = (p: number, q: number) => rowWX[q] + colWX[p]
  const worldY = (p: number, q: number) => rowWY[q] + colWY[p]

  // Patchwork (../dunes/patchwork.ts): copies of the torus, shifted by
  // random fractions of a period, keep or drop whole dunes so the field
  // never repeats, however wide the canvas.
  // sand, and the shadows it casts on the floor, one cell wider
  const sandMask = new Uint8Array(N * N)
  const shadeMask = new Uint8Array(N * N)
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const c = ((y + dy + N) % N) * N + (x + dx + N) % N
          if (fd.cover[c] > 0.03)
            sandMask[y * N + x] = 1
          if (shadow[c] > 0.03)
            shadeMask[y * N + x] = 1
        }
      }
    }
  }
  const pr = stream(hash, 'patch')
  const shift = Array.from({ length: COPIES }, (_, k) => k === 0 ? [0, 0] as const : [pr() * N, pr() * N] as const)
  const noise = Array.from({ length: COPIES }, () => latticeNoise(pr))
  // the first copy holds the middle of the canvas: a square crop shows the
  // simulated field as it grew, and wider ones gain new dunes on the sides
  const base = noise[0]
  const span = periods * N
  noise[0] = (x, y) => base(x, y) + 2 * (1 - smooth(0.35, 0.55, Math.hypot(x * PATCH_SIZE - cx, y * PATCH_SIZE - cy) / span))
  // world box seen by the canvas, with the warp and one cell to spare
  let bx0 = Infinity
  let by0 = Infinity
  let bx1 = -Infinity
  let by1 = -Infinity
  for (const [p, q] of [[0, 0], [rw - 1, 0], [0, rh - 1], [rw - 1, rh - 1]]) {
    bx0 = Math.min(bx0, worldX(p, q))
    bx1 = Math.max(bx1, worldX(p, q))
    by0 = Math.min(by0, worldY(p, q))
    by1 = Math.max(by1, worldY(p, q))
  }
  const margin = warp.reduce((a, w) => a + w.amp, 0) + 2
  const ox = Math.floor(bx0 - margin)
  const oy = Math.floor(by0 - margin)
  const ow = Math.ceil(bx1 + margin) - ox
  const oh = Math.ceil(by1 + margin) - oy
  // A sand sea or ridges running out of the period cannot be split into
  // dunes: those fields stay periodic, as transverse fields nearly are.
  const dunes = dunePatches(sandMask, fd.sand, N, NECK)
  castBy(dunes, sandMask, shadeMask, N, lit.lx, lit.ly)
  const copies = dunes.wrapShare > 0.3 ? 1 : COPIES
  const { own, alt } = owners(dunes, fd.sand, N, shift.slice(0, copies), noise.slice(0, copies), PATCH_SIZE, ox, oy, ow, oh)

  const out = new Uint8ClampedArray(rw * rh * 4)
  const acc = new Float32Array(3)
  // adds copy k's colour at world (wx, wy), with weight w, to acc
  const add = (k: number, wx: number, wy: number, w: number) => {
    const x = (wx + shift[k][0]) * tex - 0.5
    const y = (wy + shift[k][1]) * tex - 0.5
    const xf = Math.floor(x)
    const yf = Math.floor(y)
    const tx = x - xf
    const ty = y - yf
    let x0 = xf % T
    if (x0 < 0)
      x0 += T
    let y0 = yf % T
    if (y0 < 0)
      y0 += T
    const x1 = x0 + 1 === T ? 0 : x0 + 1
    const y1 = y0 + 1 === T ? 0 : y0 + 1
    const i00 = (y0 * T + x0) * 4
    const i10 = (y0 * T + x1) * 4
    const i01 = (y1 * T + x0) * 4
    const i11 = (y1 * T + x1) * 4
    const w00 = (1 - tx) * (1 - ty) * w
    const w10 = tx * (1 - ty) * w
    const w01 = (1 - tx) * ty * w
    const w11 = tx * ty * w
    acc[0] += trgb[i00] * w00 + trgb[i10] * w10 + trgb[i01] * w01 + trgb[i11] * w11
    acc[1] += trgb[i00 + 1] * w00 + trgb[i10 + 1] * w10 + trgb[i01 + 1] * w01 + trgb[i11 + 1] * w11
    acc[2] += trgb[i00 + 2] * w00 + trgb[i10 + 2] * w10 + trgb[i01 + 2] * w01 + trgb[i11 + 2] * w11
  }
  // sand height of copy k at world (wx, wy)
  const heightAt = (k: number, wx: number, wy: number) => {
    const x = (wx + shift[k][0]) * tex - 0.5
    const y = (wy + shift[k][1]) * tex - 0.5
    const xf = Math.floor(x)
    const yf = Math.floor(y)
    const tx = x - xf
    const ty = y - yf
    let x0 = xf % T
    if (x0 < 0)
      x0 += T
    let y0 = yf % T
    if (y0 < 0)
      y0 += T
    const x1 = x0 + 1 === T ? 0 : x0 + 1
    const y1 = y0 + 1 === T ? 0 : y0 + 1
    const a0 = tz[y0 * T + x0] + (tz[y0 * T + x1] - tz[y0 * T + x0]) * tx
    const a1 = tz[y1 * T + x0] + (tz[y1 * T + x1] - tz[y1 * T + x0]) * tx
    return a0 + (a1 - a0) * ty
  }
  const ks = new Int32Array(8)
  const kw = new Float32Array(8)
  for (let q = 0; q < rh; q++) {
    const rx = rowWX[q]
    const ry = rowWY[q]
    for (let p = 0; p < rw; p++) {
      const wx = rx + colWX[p]
      const wy = ry + colWY[p]
      // the four world cells around the point: one copy, or a soft seam
      const gx = wx - ox - 0.5
      const gy = wy - oy - 0.5
      const i = Math.floor(gx)
      const j = Math.floor(gy)
      const fx = gx - i
      const fy = gy - j
      const g0 = j * ow + i
      const a = own[g0]
      const b = own[g0 + 1]
      const c = own[g0 + ow]
      const d = own[g0 + ow + 1]
      acc[0] = 0
      acc[1] = 0
      acc[2] = 0
      const anyAlt = alt[g0] !== 255 || alt[g0 + 1] !== 255 || alt[g0 + ow] !== 255 || alt[g0 + ow + 1] !== 255
      if (anyAlt) {
        // kept dunes of two copies overlap: the taller sand shows
        let m = 0
        for (const k of [a, b, c, d, alt[g0], alt[g0 + 1], alt[g0 + ow], alt[g0 + ow + 1]]) {
          if (k !== 255 && !ks.subarray(0, m).includes(k))
            ks[m++] = k
        }
        let k1 = ks[0]
        let h1 = heightAt(k1, wx, wy)
        let k2 = -1
        let h2 = -Infinity
        for (let e = 1; e < m; e++) {
          const h = heightAt(ks[e], wx, wy)
          if (h > h1) {
            k2 = k1
            h2 = h1
            k1 = ks[e]
            h1 = h
          }
          else if (h > h2) {
            k2 = ks[e]
            h2 = h
          }
        }
        const w1 = k2 < 0 ? 1 : 0.5 + 0.5 * smooth(0, 0.12, h1 - h2)
        add(k1, wx, wy, w1)
        if (w1 < 1)
          add(k2, wx, wy, 1 - w1)
      }
      else if (a === b && a === c && a === d) {
        add(a, wx, wy, 1)
      }
      else {
        let m = 0
        const put = (k: number, w: number) => {
          for (let e = 0; e < m; e++) {
            if (ks[e] === k) {
              kw[e] += w
              return
            }
          }
          ks[m] = k
          kw[m++] = w
        }
        put(a, (1 - fx) * (1 - fy))
        put(b, fx * (1 - fy))
        put(c, (1 - fx) * fy)
        put(d, fx * fy)
        for (let e = 0; e < m; e++) {
          if (kw[e] > 0.001)
            add(ks[e], wx, wy, kw[e])
        }
      }
      const o = (q * rw + p) * 4
      out[o] = acc[0]
      out[o + 1] = acc[1]
      out[o + 2] = acc[2]
      out[o + 3] = 255
    }
  }
  blit(g, out, rw, rh, W, H)
}

function renderOblique(g: CanvasRenderingContext2D, W: number, H: number, hash: string, f: Features) {
  const pal = PAL[f.Palette]
  const S = Math.min(W, H)
  const vr = stream(hash, 'view')
  const fd = buildField(hash, f)
  const lit = lightFor(stream(hash, 'light'), f, fd.wx, fd.wy)
  const shadow = castShadows(fd, lit.lx, lit.ly, lit.tanAlt)
  const k = Math.min(1, 1200 / S)
  const rw = Math.max(1, Math.round(W * k))
  const rh = Math.max(1, Math.round(H * k))
  const rs = Math.min(rw, rh)
  // texture samples per cell: enough for the foreground at this size
  const TEX = Math.min(12, Math.max(5, Math.round(rs / 90)))
  const T = N * TEX
  const tex = shade(fd, T, T, TEX, pal, lit.light, shadow, stream(hash, 'ripples'), OBLIQUE_LOOK)
  const tz = tex.Z
  const trgb = tex.rgba
  const trip = tex.rip
  const twarp = tex.warp
  const grainN = periodicNoise(stream(hash, 'grain'), Math.round(N / GRAIN), Math.round(N / GRAIN))
  // close up, ripples are redrawn crisply from their phase rather than
  // magnified from the texture: brightness follows the light along the wind
  const ripLight = -(lit.light.sx * fd.wx + lit.light.sy * fd.wy) / Math.max(0.2, Math.hypot(lit.light.sx, lit.light.sy))
  let zmax = 0
  for (let c = 0; c < fd.z.length; c++)
    zmax = Math.max(zmax, fd.z[c])

  // Camera: looking across, along or against the wind, aimed at one of the
  // tallest dunes a few dune lengths ahead and just above the crests, so a
  // field with little sand still has a dune to look at.
  // (straight into the sun, every slip face is a dark wall: only obliquely)
  const look = Math.atan2(fd.wy, fd.wx) + [0, Math.PI * 0.7, Math.PI / 2, -Math.PI / 2][int(vr, 0, 3)] + range(vr, -0.45, 0.45)
  const fwx = Math.cos(look)
  const fwy = Math.sin(look)
  const rtx = -fwy
  const rty = fwx
  const tall: number[] = []
  for (let c = 0; c < fd.z.length; c++) {
    if (fd.z[c] >= 0.75 * zmax)
      tall.push(c)
  }
  // Several placements are drawn; the one with the clearest view of its
  // dune (nothing in between, low ground in front of the lens) is kept.
  const lift = range(vr, 1.25, 1.7)
  const camZ = zmax * LIFT * lift
  let camX = 0
  let camY = 0
  let best = Infinity
  for (let k = 0; k < 12; k++) {
    const target = tall[Math.min(tall.length - 1, Math.floor(vr() * tall.length))]
    const dist = Math.max(36, range(vr, 5, 7.5) * zmax * LIFT)
    const side = range(vr, -0.18, 0.18) * dist
    const tx = target % N + 0.5
    const ty = Math.floor(target / N) + 0.5
    const x0 = tx - fwx * dist - rtx * side
    const y0 = ty - fwy * dist - rty * side
    const top = fd.z[target] * LIFT
    let block = 0
    let near = 0
    for (let i = 1; i < 24; i++) {
      const t = i / 24
      const sight = camZ + (top - camZ) * t
      const h = sampleWrap(fd.z, N, N, x0 + (tx - x0) * t, y0 + (ty - y0) * t) * LIFT
      block = Math.max(block, h - sight)
      // close to the lens the field is too coarse to look sharp: keep it low
      if (t < 0.6)
        near = Math.max(near, h)
    }
    const score = block + near
    if (score < best) {
      best = score
      camX = x0
      camY = y0
    }
  }
  const horizon = range(vr, 0.3, 0.4)

  const focal = 1.05 * rs
  // the horizon keeps its height from the centre in short sides: a tall
  // canvas gains sky and far dunes rather than a blurred foreground
  const hy = rh / 2 - (0.5 - horizon) * rs

  const out = new Uint8ClampedArray(rw * rh * 4)
  // sky
  const [top, bot] = pal.sky.map(rgb)
  const haze = rgb(pal.haze)
  // a glow over the horizon on the side of the sun, fading with height
  const sunAz = Math.atan2(lit.ly, lit.lx)
  const glowCol = haze.map(v => Math.min(255, v * 1.12 + 14))
  const glowCols = new Float32Array(rw)
  for (let p = 0; p < rw; p++) {
    let d = look + Math.atan((p + 0.5 - rw / 2) / focal) - sunAz
    d = Math.atan2(Math.sin(d), Math.cos(d))
    glowCols[p] = 0.45 * Math.exp(-((d / 0.8) ** 2))
  }
  for (let q = 0; q < rh; q++) {
    const t = Math.min(1, Math.max(0, q / Math.max(1, hy))) ** 1.6
    const r = top[0] + (bot[0] - top[0]) * t
    const gg = top[1] + (bot[1] - top[1]) * t
    const b = top[2] + (bot[2] - top[2]) * t
    const rise = Math.exp(-Math.max(0, hy - q) / (0.22 * rs))
    for (let p = 0; p < rw; p++) {
      const o = (q * rw + p) * 4
      const w = glowCols[p] * rise
      out[o] = r + (glowCol[0] - r) * w
      out[o + 1] = gg + (glowCol[1] - gg) * w
      out[o + 2] = b + (glowCol[2] - b) * w
      out[o + 3] = 255
    }
  }

  // Voxel Space: march slices of constant depth from the camera outwards,
  // drawing each column only where it rises above everything nearer.
  const ybuf = new Float32Array(rw).fill(rh)
  const offs = new Float32Array(rw)
  for (let p = 0; p < rw; p++)
    offs[p] = (p + 0.5 - rw / 2) / focal
  const far = N * 5
  const hazeLen = N * pal.hazeFar
  let z = 1.5
  let dz = 0.02
  while (z < far) {
    const fog = 1 - Math.exp(-z / hazeLen)
    const cx = camX + fwx * z
    const cy = camY + fwy * z
    const scale = focal / z
    for (let p = 0; p < rw; p++) {
      const yb = ybuf[p]
      if (yb <= 0)
        continue
      const off = offs[p] * z
      const x = (cx + rtx * off) * TEX - 0.5
      const y = (cy + rty * off) * TEX - 0.5
      const xf = Math.floor(x)
      const yf = Math.floor(y)
      const tx = x - xf
      const ty = y - yf
      let x0 = xf % T
      if (x0 < 0)
        x0 += T
      let y0 = yf % T
      if (y0 < 0)
        y0 += T
      const x1 = x0 + 1 === T ? 0 : x0 + 1
      const y1 = y0 + 1 === T ? 0 : y0 + 1
      const i00 = y0 * T + x0
      const i10 = y0 * T + x1
      const i01 = y1 * T + x0
      const i11 = y1 * T + x1
      const w00 = (1 - tx) * (1 - ty)
      const w10 = tx * (1 - ty)
      const w01 = (1 - tx) * ty
      const w11 = tx * ty
      const ht = (tz[i00] * w00 + tz[i10] * w10 + tz[i01] * w01 + tz[i11] * w11) * LIFT
      const sy = hy + (camZ - ht) * scale
      // whole rows only, so no gap opens between two slices
      const from = Math.max(0, Math.floor(sy))
      if (from >= yb)
        continue
      const r = trgb[i00 * 4] * w00 + trgb[i10 * 4] * w10 + trgb[i01 * 4] * w01 + trgb[i11 * 4] * w11
      const gg = trgb[i00 * 4 + 1] * w00 + trgb[i10 * 4 + 1] * w10 + trgb[i01 * 4 + 1] * w01 + trgb[i11 * 4 + 1] * w11
      const b = trgb[i00 * 4 + 2] * w00 + trgb[i10 * 4 + 2] * w10 + trgb[i01 * 4 + 2] * w01 + trgb[i11 * 4 + 2] * w11
      let mod = 1
      const wxw = cx + rtx * off
      const wyw = cy + rty * off
      // close up, a fine grain keeps the ground from looking like a blur
      const gpx = GRAIN * scale
      if (gpx > 1.5 && GRAIN > 2 * dz)
        mod += 0.2 * smooth(1.5, 4, gpx) * smooth(2, 4, GRAIN / dz) * (grainN(wxw / GRAIN, wyw / GRAIN) - 0.5)
      const rpx = RIPPLE * scale
      // a ripple must span several pixels across and several slices deep
      if (rpx > 3 && RIPPLE > 3 * dz) {
        const rm = trip[i00] * w00 + trip[i10] * w10 + trip[i01] * w01 + trip[i11] * w11
        if (rm > 0.02) {
          const wp = twarp[i00] * w00 + twarp[i10] * w10 + twarp[i01] * w01 + twarp[i11] * w11
          const ph = 2 * Math.PI * ((wxw * fd.wx + wyw * fd.wy) / RIPPLE + wp)
          mod += 0.16 * rm * ripLight * smooth(3, 7, rpx) * (1 - smooth(14, 30, rpx)) * smooth(3, 6, RIPPLE / dz) * Math.sin(ph)
        }
      }
      const cr = r * mod + (haze[0] - r * mod) * fog
      const cg = gg * mod + (haze[1] - gg * mod) * fog
      const cb = b * mod + (haze[2] - b * mod) * fog
      for (let q = from; q < yb; q++) {
        const o = (q * rw + p) * 4
        out[o] = cr
        out[o + 1] = cg
        out[o + 2] = cb
      }
      ybuf[p] = from
    }
    z += dz
    dz *= 1.012
  }
  blit(g, out, rw, rh, W, H)
}

function render(g: CanvasRenderingContext2D, W: number, H: number, hash: string) {
  const f = features(hash)
  g.save()
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.globalAlpha = 1
  g.globalCompositeOperation = 'source-over'
  g.fillStyle = PAL[f.Palette].sand[2]
  g.fillRect(0, 0, W, H)
  if (f.View === 'Aerial')
    renderAerial(g, W, H, hash, f)
  else
    renderOblique(g, W, H, hash, f)
  g.restore()
}

export default {
  slug: 'dunes',
  title: 'Dunes',
  summary: 'Barchans, transverse ridges, seifs and star dunes grown slab by slab with Werner\'s model of wind-blown sand, lit by a high or grazing sun.',
  order: 580,
  traits: TRAITS,
  features,
  render,
  // Seed-of-seeds 0xd0e5d0e5d0e5d0e5 ("gallery" stream): the first hash found
  // for each of twelve palette x wind pairs; the Namib field under four winds
  // leads.
  gallery: [
    '0x9874bb97c47f0c65b8747c599a7bb34e93fbbe73ca3ffbb1b0cbd58d405f06c1',
    '0x59d1ec2ebd47ee0167424b848dc62aa81822f7cc8fc9961ae3da1e9bcc6def83',
    '0xaacaa6499aabc10be3d2a877549abe56d9acb45aabd9a35d1f01a9096e6003e0',
    '0x524c95a484a455db2f656ea615cc20ad8c29c058de174d20bf10f8c0859905ff',
    '0x16ebb29370ec548c6958cd4643c09030f88503681f1bafe003c5b576d26cde45',
    '0x43907120f2b95fdd4db35af60f7b2c9731ecd1c462b28da503d3f92c69b4b6b3',
    '0x26d4453fd5ec6ccbf4825960046de0c87ee260622b37e6788731753e385e3d21',
    '0x4a1a6b1969926a134ba3088bb2b537bf27c0d00cbd62141144dc4a5435acce9d',
    '0xdfed67a22d47a7479fc79b98ada57685d5ca687f1fd520cc60e5594fae103297',
    '0x5474e9879e28b189a12d7c2b0b51f7415b36eb165a41b1bcfdeb9309029ca315',
    '0xd7644ac3bce4bc3ed0ff0dd942f33cd3437c0645a07697b04a07d336177093a0',
    '0x4c80bd20d83edc856c4db72b1e45d6cf8536789b135a360531db3fe71ca44fdd',
  ],
} satisfies Series
