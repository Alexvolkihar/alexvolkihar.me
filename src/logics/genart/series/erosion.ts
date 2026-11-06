// "Erosion" — terrain carved by tens of thousands of simulated raindrops.
//
// A procedural landform (a massif, parallel ranges, a mesa plateau or
// volcanic cones) is built on a fixed grid, then rained on: every drop runs
// downhill, picks up sediment where it is fast and drops it where it slows
// down (particle hydraulic erosion after Beyer 2015 and Lague 2019, see
// ../erosion/erode.ts). The worn terrain is filled, routed and its flow
// accumulated (../erosion/drainage.ts), then mapped from above: hypsometric
// relief with rivers, a drainage sheet where the dendritic network is the
// subject, a shaded-relief print, or a scour map of where the rain took
// ground away and where it laid it down.
//
// The grid is fixed (its short side always has N cells), so the simulation
// gives the same terrain at every canvas size; only the raster that shades it
// and the strokes of the rivers follow the canvas. Every length is a fraction
// of the canvas short side.

import type { ErosionParams } from '../erosion/erode'
import type { Landform } from '../erosion/terrain'
import type { Series } from '../types'
import { drain, rivers, wetMask } from '../erosion/drainage'
import { erode, soften } from '../erosion/erode'
import { buildTerrain, makeNoise } from '../erosion/terrain'
import { range, stream, weighted } from '../random'

// Rarity table, decided before the drawing code. Never reorder: it re-rolls the edition.
const TRAITS = {
  Palette: [['Survey', 24], ['Sepia', 20], ['Canyon', 18], ['Glacier', 14], ['Nocturne', 14], ['Basalt', 10]],
  Style: [['Relief', 35], ['Drainage', 30], ['Shaded', 20], ['Scour', 15]],
  Terrain: [['Massif', 35], ['Ranges', 25], ['Plateau', 20], ['Cone', 20]],
  Rain: [['Drizzle', 30], ['Steady', 45], ['Deluge', 25]],
  Sea: [['Inland', 35], ['Coast', 40], ['Islands', 25]],
} as const

type TraitName = keyof typeof TRAITS
type Features = { [K in TraitName]: typeof TRAITS[K][number][0] }

function features(hash: string): Features {
  const r = stream(hash, 'features')
  return {
    Palette: weighted(r, TRAITS.Palette),
    Style: weighted(r, TRAITS.Style),
    Terrain: weighted(r, TRAITS.Terrain),
    Rain: weighted(r, TRAITS.Rain),
    Sea: weighted(r, TRAITS.Sea),
  }
}

type RGB = [number, number, number]

interface Palette {
  paper: string
  /** Neatline and drainage ink. */
  ink: string
  /** Hypsometric ramp, low to high. */
  ramp: readonly string[]
  shallow: string
  deep: string
  river: string
  shadow: string
  light: string
  /** Laid-down sediment, and ground carried away (Scour). */
  silt: string
  scour: string
}

const PAL: Record<Features['Palette'], Palette> = {
  Survey: { paper: '#f2eee3', ink: '#2b2a28', ramp: ['#9fbb88', '#c8d49c', '#e6d8a6', '#caa784', '#a88a72', '#f6f3ec'], shallow: '#c3dbe0', deep: '#86adbf', river: '#3b73a0', shadow: '#2f3138', light: '#fffdf6', silt: '#eadfb4', scour: '#8e4632' },
  Sepia: { paper: '#efe3c8', ink: '#3a2a1c', ramp: ['#ddc8a0', '#cdb084', '#b79466', '#93704b', '#6e5236', '#ead9b8'], shallow: '#dcd2b5', deep: '#beb18f', river: '#4e3522', shadow: '#2e2015', light: '#fbf3df', silt: '#f0dfb0', scour: '#7a2e1f' },
  Canyon: { paper: '#f4e8d8', ink: '#3d1f17', ramp: ['#e2b88a', '#d08c5c', '#b8603a', '#94462c', '#6e3324', '#e6c39a'], shallow: '#a9d0c6', deep: '#4f8f8b', river: '#1d6b74', shadow: '#2e130d', light: '#fff4e4', silt: '#f1d8ab', scour: '#3f6f7a' },
  Glacier: { paper: '#edf1f3', ink: '#25313f', ramp: ['#93aab9', '#adc1ce', '#c8d7e0', '#dfe8ee', '#f0f5f8', '#ffffff'], shallow: '#b2cbd9', deep: '#587f9c', river: '#2c5a85', shadow: '#26344a', light: '#ffffff', silt: '#c9b79f', scour: '#3a5d86' },
  Nocturne: { paper: '#0d111d', ink: '#c6d3e6', ramp: ['#18223a', '#202d48', '#2a3a56', '#384a66', '#4b5e7a', '#7a8ba5'], shallow: '#132038', deep: '#08101f', river: '#7fd6e6', shadow: '#03050b', light: '#c9d6ea', silt: '#c9a764', scour: '#5f93b8' },
  Basalt: { paper: '#131110', ink: '#e6d9c6', ramp: ['#282421', '#302b27', '#3b342e', '#4a4038', '#5e5247', '#8a7d6c'], shallow: '#1b2023', deep: '#0d1113', river: '#f0873a', shadow: '#000000', light: '#eadfcd', silt: '#c99a5a', scour: '#e2582c' },
}

// Drops per grid cell.
const RAIN: Record<Features['Rain'], number> = { Drizzle: 0.45, Steady: 0.8, Deluge: 1.25 }
// Sea level as a quantile of the uneroded heights (-1: no sea, only lakes).
const SEA: Record<Features['Sea'], number> = { Inland: -1, Coast: 0.27, Islands: 0.52 }

/** Cells along the short side of the map. */
const N = 150
/** Paper margin around the map, and the largest raster side used for shading. */
const MARGIN = 0.045
const RASTER_MAX = 1400
/** Filled depth above which a depression shows as a lake. */
const LAKE_MIN = 0.0035
const LAKE_AREA = 16

const BASE: Omit<ErosionParams, 'drops'> = {
  inertia: 0.05,
  capacity: 6,
  minCapacity: 0.01,
  erodeRate: 0.4,
  depositRate: 0.3,
  evaporation: 0.012,
  gravity: 4,
  lifetime: 28,
  radius: 3,
}

function rgb(hex: string): RGB {
  const v = Number.parseInt(hex.slice(1), 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}

function smooth(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

function quantile(h: Float32Array, q: number) {
  const s = Float32Array.from(h).sort()
  return s[Math.min(s.length - 1, Math.floor(q * s.length))]
}

/** Separable box blur of radius `r` with clamped edges. */
function boxBlur(src: Float32Array, gw: number, gh: number, r: number) {
  const tmp = new Float32Array(src.length)
  const out = new Float32Array(src.length)
  const n = 2 * r + 1
  for (let j = 0; j < gh; j++) {
    const o = j * gw
    for (let i = 0; i < gw; i++) {
      let s = 0
      for (let k = -r; k <= r; k++)
        s += src[o + Math.min(gw - 1, Math.max(0, i + k))]
      tmp[o + i] = s / n
    }
  }
  for (let j = 0; j < gh; j++) {
    for (let i = 0; i < gw; i++) {
      let s = 0
      for (let k = -r; k <= r; k++)
        s += tmp[Math.min(gh - 1, Math.max(0, j + k)) * gw + i]
      out[j * gw + i] = s / n
    }
  }
  return out
}

/** Taps (clamped source indices) and weights of one axis, `taps` = 2 (linear) or 4 (Catmull-Rom). */
function axis(n: number, m: number, taps: number) {
  const idx = new Int32Array(m * taps)
  const wt = new Float32Array(m * taps)
  for (let p = 0; p < m; p++) {
    const g = (p + 0.5) / m * n - 0.5
    const j = Math.floor(g)
    const t = g - j
    const o = p * taps
    if (taps === 2) {
      wt[o] = 1 - t
      wt[o + 1] = t
    }
    else {
      const t2 = t * t
      const t3 = t2 * t
      wt[o] = 0.5 * (-t3 + 2 * t2 - t)
      wt[o + 1] = 0.5 * (3 * t3 - 5 * t2 + 2)
      wt[o + 2] = 0.5 * (-3 * t3 + 4 * t2 + t)
      wt[o + 3] = 0.5 * (t3 - t2)
    }
    const first = taps === 2 ? j : j - 1
    for (let a = 0; a < taps; a++)
      idx[o + a] = Math.min(n - 1, Math.max(0, first + a))
  }
  return { idx, wt }
}

/** Separable resampling of a gw x gh grid to rw x rh. */
function resample(src: Float32Array, gw: number, gh: number, rw: number, rh: number, taps: number) {
  const X = axis(gw, rw, taps)
  const Y = axis(gh, rh, taps)
  const tmp = new Float32Array(gh * rw)
  for (let y = 0; y < gh; y++) {
    const so = y * gw
    const to = y * rw
    for (let p = 0; p < rw; p++) {
      let v = 0
      for (let a = 0; a < taps; a++)
        v += X.wt[p * taps + a] * src[so + X.idx[p * taps + a]]
      tmp[to + p] = v
    }
  }
  const out = new Float32Array(rw * rh)
  for (let q = 0; q < rh; q++) {
    const oo = q * rw
    for (let a = 0; a < taps; a++) {
      const w = Y.wt[q * taps + a]
      const ro = Y.idx[q * taps + a] * rw
      for (let p = 0; p < rw; p++)
        out[oo + p] += w * tmp[ro + p]
    }
  }
  return out
}

function render(g: CanvasRenderingContext2D, W: number, H: number, hash: string) {
  const f = features(hash)
  const pal = PAL[f.Palette]
  const S = Math.min(W, H)

  // --- layout: a map sheet with a paper margin ---------------------------
  const m = Math.round(MARGIN * S)
  const iw = W - 2 * m
  const ih = H - 2 * m
  const is = Math.min(iw, ih)
  const gw = Math.max(8, Math.round(N * iw / is))
  const gh = Math.max(8, Math.round(N * ih / is))
  const cells = gw * gh

  // --- terrain and rain (fixed grid: independent of the canvas size) -----
  const h = buildTerrain(stream(hash, 'terrain'), f.Terrain as Landform, gw, gh, N)
  const h0 = Float32Array.from(h)
  const sea = SEA[f.Sea] < 0 ? -1 : quantile(h, SEA[f.Sea])
  const trace = { sx: new Float32Array(cells), sy: new Float32Array(cells), sw: new Float32Array(cells) }
  erode(h, gw, gh, sea, stream(hash, 'rain'), { ...BASE, drops: Math.round(RAIN[f.Rain] * cells) }, trace)
  soften(h, gw, gh, 0.5)
  soften(h, gw, gh, 0.5)
  const dr = drain(h, gw, gh, sea)
  const wet = wetMask(h, dr.filled, gw, gh, sea, LAKE_MIN, LAKE_AREA)

  const lr = stream(hash, 'light')
  const az = (225 + range(lr, -28, 28)) * Math.PI / 180
  const alt = range(lr, 34, 50) * Math.PI / 180
  const zex = range(lr, 38, 52)
  const sx = Math.cos(alt) * Math.cos(az)
  const sy = Math.cos(alt) * Math.sin(az)
  const sz = Math.sin(alt)

  // --- shaded raster --------------------------------------------------------
  const k = Math.min(1, RASTER_MAX / is)
  const rw = Math.max(1, Math.round(iw * k))
  const rh = Math.max(1, Math.round(ih * k))
  const lakeG = new Float32Array(cells)
  const dG = new Float32Array(cells)
  const lost = new Float32Array(cells)
  const laid = new Float32Array(cells)
  let nLost = 0
  let nLaid = 0
  for (let c = 0; c < cells; c++) {
    // lake depth, or a negative value off the lakes so the shore interpolates
    lakeG[c] = wet[c] === 2 ? dr.filled[c] - h[c] : -LAKE_MIN
    dG[c] = h[c] - h0[c]
  }
  // Keep the local part of the balance (gullies cut, fans laid) and drop the
  // broad lowering of whole slopes: subtract a blurred copy.
  const dB = boxBlur(boxBlur(dG, gw, gh, 4), gw, gh, 4)
  for (let c = 0; c < cells; c++) {
    dG[c] -= dB[c]
    if (!wet[c]) {
      if (dG[c] < 0)
        lost[nLost++] = -dG[c]
      else
        laid[nLaid++] = dG[c]
    }
  }
  // the erosion balance is shown relative to its own spread, so that every
  // rain gives a readable map
  const pct = (xs: Float32Array, q: number) => {
    if (!xs.length)
      return 1
    xs.sort()
    return Math.max(1e-6, xs[Math.floor(q * (xs.length - 1))])
  }
  const lostScale = pct(lost.subarray(0, nLost), 0.92)
  const laidScale = pct(laid.subarray(0, nLaid), 0.92)
  // heights in Catmull-Rom (smooth shading), lakes and erosion balance bilinear
  const hr = resample(h, gw, gh, rw, rh, 4)
  let hasLake = false
  for (let c = 0; c < cells && !hasLake; c++)
    hasLake = wet[c] === 2
  const lake = hasLake ? resample(lakeG, gw, gh, rw, rh, 4) : null
  const dlt = f.Style === 'Drainage' ? null : resample(dG, gw, gh, rw, rh, 2)

  const style = f.Style
  const ramp = pal.ramp.map(rgb)
  const [paper, shallow, deep, shadow, light, silt, scour] = [pal.paper, pal.shallow, pal.deep, pal.shadow, pal.light, pal.silt, pal.scour].map(rgb)
  const coast = rgb(pal.ink)
  const seaBase = Math.max(0, sea)
  const per = rw / gw // raster pixels per grid cell
  const flat = sz
  const img = new ImageData(rw, rh)
  const px8 = img.data
  const water = new Uint8Array(rw * rh)
  const col: RGB = [0, 0, 0]
  const mix = (a: RGB, b: RGB, t: number, out: RGB) => {
    out[0] = a[0] + (b[0] - a[0]) * t
    out[1] = a[1] + (b[1] - a[1]) * t
    out[2] = a[2] + (b[2] - a[2]) * t
  }
  // hypsometric ramp as a 256-entry table
  const lut = new Float32Array(256 * 3)
  for (let q = 0; q < 256; q++) {
    const x = q / 255 * (ramp.length - 1 - 1e-6)
    const i = Math.floor(x)
    for (let ch = 0; ch < 3; ch++)
      lut[q * 3 + ch] = ramp[i][ch] + (ramp[i + 1][ch] - ramp[i][ch]) * (x - i)
  }
  const rampAt = (t: number, out: RGB) => {
    const q = (t <= 0 ? 0 : t >= 1 ? 255 : (t * 255) | 0) * 3
    out[0] = lut[q]
    out[1] = lut[q + 1]
    out[2] = lut[q + 2]
  }
  const SC = style === 'Relief' ? 0 : style === 'Drainage' ? 1 : style === 'Shaded' ? 2 : 3
  const tmp: RGB = [0, 0, 0]
  for (let py = 0; py < rh; py++) {
    const ya = Math.max(0, py - 1) * rw
    const yb = Math.min(rh - 1, py + 1) * rw
    for (let px = 0; px < rw; px++) {
      const o = py * rw + px
      const z = hr[o]
      const hx = (hr[py * rw + Math.min(rw - 1, px + 1)] - hr[py * rw + Math.max(0, px - 1)]) * 0.5 * per * zex
      const hy = (hr[yb + px] - hr[ya + px]) * 0.5 * per * zex
      const nl = 1 / Math.sqrt(hx * hx + hy * hy + 1)
      const L = Math.max(0, (-hx * sx - hy * sy + sz) * nl)
      const isSea = z < sea
      const isLake = !isSea && lake !== null && lake[o] > 0
      const t = (z - seaBase) / (1 - seaBase)
      if (isSea || isLake) {
        water[o] = 1
        const depth = isSea || lake === null ? (sea - z) / Math.max(0.05, sea) : lake[o] * 12
        if (SC === 0) {
          mix(shallow, deep, smooth(0, 0.7, depth), col)
        }
        else {
          // flat print tint, just darker offshore
          mix(shallow, deep, 0.25 * smooth(0, 1, depth), col)
          mix(paper, col, SC === 1 ? 0.55 : 0.7, col)
        }
      }
      else if (SC === 0) {
        rampAt(t, col)
        if (dlt !== null && dlt[o] > 0.6 * laidScale)
          mix(col, silt, 0.22 * smooth(0.6, 2, dlt[o] / laidScale), col)
        const s = 0.42 + 0.78 * L / flat * 0.82
        if (s < 1) {
          mix(shadow, col, 0.25 + 0.75 * s, col)
        }
        else {
          mix(col, light, Math.min(0.7, (s - 1) * 1.6), col)
        }
      }
      else if (SC === 1) {
        rampAt(t, tmp)
        mix(paper, tmp, 0.22, col)
        const s = (L - flat) * 0.6
        if (s < 0)
          mix(col, shadow, Math.min(0.3, -s), col)
        else
          mix(col, light, Math.min(0.4, s), col)
      }
      else if (SC === 2) {
        // aerial perspective: contrast grows with height (Imhof)
        const c = 0.55 + 0.45 * Math.min(1, Math.max(0, t))
        const s = Math.min(1, Math.max(0.12, 0.56 + (L - flat) * 1.25 * c))
        mix(shadow, light, s, col)
        rampAt(t, tmp)
        mix(col, tmp, 0.28, col)
        if (dlt !== null && dlt[o] > 0.8 * laidScale)
          mix(col, silt, 0.25 * smooth(0.8, 2.2, dlt[o] / laidScale), col)
      }
      else {
        // Scour: grey relief, ground lost and ground gained
        const s = Math.min(1, Math.max(0, 0.55 + (L - flat) * 1.3))
        mix(shadow, light, s, tmp)
        mix(paper, tmp, 0.6, col)
        const d = dlt === null ? 0 : dlt[o]
        if (d < 0)
          mix(col, scour, 0.85 * smooth(0.15, 1.2, -d / lostScale), col)
        else
          mix(col, silt, 0.85 * smooth(0.15, 1.2, d / laidScale), col)
      }
      px8[o * 4] = col[0]
      px8[o * 4 + 1] = col[1]
      px8[o * 4 + 2] = col[2]
      px8[o * 4 + 3] = 255
    }
  }
  // shore line: water pixels within cw pixels of land
  const cw = Math.max(1, Math.round(Math.min(rw, rh) * 0.0016))
  for (let py = 0; py < rh; py++) {
    for (let px = 0; px < rw; px++) {
      const o = py * rw + px
      if (!water[o])
        continue
      let near = false
      for (let d = 1; d <= cw && !near; d++) {
        if ((px >= d && !water[o - d]) || (px + d < rw && !water[o + d]) || (py >= d && !water[o - d * rw]) || (py + d < rh && !water[o + d * rw]))
          near = true
      }
      if (near) {
        const a = style === 'Relief' ? 0.55 : 0.75
        px8[o * 4] += (coast[0] - px8[o * 4]) * a
        px8[o * 4 + 1] += (coast[1] - px8[o * 4 + 1]) * a
        px8[o * 4 + 2] += (coast[2] - px8[o * 4 + 2]) * a
      }
    }
  }

  g.save()
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.globalAlpha = 1
  g.globalCompositeOperation = 'source-over'
  g.fillStyle = pal.paper
  g.fillRect(0, 0, W, H)
  if (rw === iw && rh === ih) {
    g.putImageData(img, m, m)
  }
  else {
    const off = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(rw, rh)
      : Object.assign(document.createElement('canvas'), { width: rw, height: rh })
    const oc = off.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
    if (oc) {
      oc.putImageData(img, 0, 0)
      g.imageSmoothingEnabled = true
      g.imageSmoothingQuality = 'high'
      g.drawImage(off, m, m, iw, ih)
    }
  }

  // --- rivers -----------------------------------------------------------------
  const RIV: Record<Features['Style'], { min: number, order: number, w0: number, wk: number, alpha: number }> = {
    Relief: { min: 40, order: 2, w0: 0.0009, wk: 0.006, alpha: 0.9 },
    Drainage: { min: 12, order: 2, w0: 0.001, wk: 0.009, alpha: 1 },
    Shaded: { min: 120, order: 2, w0: 0.0009, wk: 0.004, alpha: 0.8 },
    Scour: { min: 90, order: 2, w0: 0.0008, wk: 0.0035, alpha: 0.85 },
  }
  const rv = RIV[style]
  // A river runs through the water-weighted centroid of the drops that
  // crossed each cell rather than through the lattice, then the whole network
  // is bent by one smooth displacement field: shared confluences stay shared,
  // and the straight runs of 8-direction routing on flats start to wander.
  const vr = stream(hash, 'rivers')
  const wn1 = makeNoise(vr)
  const wn2 = makeNoise(vr)
  const WF = 0.16
  const WA = 0.7
  const net = rivers(dr, wet, gw, gh, rv.min, rv.order, (c, out) => {
    const i = c % gw
    const j = (c - i) / gw
    const w = trace.sw[c]
    let x = i
    let y = j
    if (w > 0.5) {
      const t = Math.min(1, w / 3)
      x += (trace.sx[c] / w - i) * t
      y += (trace.sy[c] / w - j) * t
    }
    out.push(x + WA * wn1(x * WF, y * WF), y + WA * wn2(x * WF, y * WF))
  })
  const cx = iw / gw
  const cy = ih / gh
  const BUCKETS = 14
  const paths: Path2D[] = Array.from({ length: BUCKETS }, () => new Path2D())
  const widthOf = (b: number) => S * (rv.w0 + rv.wk * ((b + 0.5) / BUCKETS) ** 2)
  // bucket from sqrt of the share of the map drained
  const bucketOf = (a: number) => Math.min(BUCKETS - 1, Math.floor(Math.sqrt(Math.sqrt(a / cells)) * BUCKETS * 1.05))
  for (const river of net) {
    // two rounds of Chaikin corner cutting, endpoints kept
    let p = river.pts
    let a = river.acc
    for (let it = 0; it < 2; it++) {
      const np: number[] = [p[0], p[1]]
      const na: number[] = [a[0]]
      for (let i = 0; i + 1 < a.length; i++) {
        const x0 = p[i * 2]
        const y0 = p[i * 2 + 1]
        const x1 = p[i * 2 + 2]
        const y1 = p[i * 2 + 3]
        np.push(0.75 * x0 + 0.25 * x1, 0.75 * y0 + 0.25 * y1, 0.25 * x0 + 0.75 * x1, 0.25 * y0 + 0.75 * y1)
        na.push(a[i], a[i + 1])
      }
      np.push(p[p.length - 2], p[p.length - 1])
      na.push(a[a.length - 1])
      p = np
      a = na
    }
    let cur = -1
    for (let i = 0; i < a.length; i++) {
      const b = bucketOf(a[i])
      const X = m + (p[i * 2] + 0.5) * cx
      const Y = m + (p[i * 2 + 1] + 0.5) * cy
      if (b !== cur) {
        if (cur >= 0)
          paths[cur].lineTo(X, Y)
        cur = b
        paths[b].moveTo(X, Y)
      }
      else {
        paths[b].lineTo(X, Y)
      }
    }
  }
  g.save()
  g.beginPath()
  g.rect(m, m, iw, ih)
  g.clip()
  g.lineCap = 'round'
  g.lineJoin = 'round'
  g.strokeStyle = style === 'Drainage' ? pal.ink : pal.river
  if (style === 'Drainage' && (f.Palette === 'Nocturne' || f.Palette === 'Basalt'))
    g.strokeStyle = pal.river
  g.globalAlpha = rv.alpha
  for (let b = 0; b < BUCKETS; b++) {
    g.lineWidth = widthOf(b)
    g.stroke(paths[b])
  }
  g.restore()

  // --- neatline -----------------------------------------------------------------
  g.globalAlpha = 1
  g.strokeStyle = pal.ink
  g.lineWidth = Math.max(1, 0.0016 * S)
  g.strokeRect(m, m, iw, ih)
  g.lineWidth = Math.max(0.5, 0.0007 * S)
  const o2 = 0.008 * S
  g.strokeRect(m - o2, m - o2, iw + 2 * o2, ih + 2 * o2)
  g.restore()
}

export default {
  slug: 'erosion',
  title: 'Erosion',
  summary: 'Massifs, ranges, mesas and volcanoes worn down by tens of thousands of simulated raindrops, then mapped from above as relief, drainage, shaded prints or scour.',
  order: 350,
  traits: TRAITS,
  features,
  render,
  // Seed-of-seeds 0xe7051011e7051011 ("gallery" stream, 64-hex candidates):
  // the first hash found for each Style x Terrain pair, the two traits that
  // change a map the most (12 of the 16 pairs, in 15 candidates). Only the
  // order was chosen by eye: the fifth one, an island massif in survey
  // colours, is moved first to serve as the cover.
  gallery: [
    '0x1694036b3cd442fec7ac0d9a1b8aa53b15134e81f9198f8fc19e730cb2320866', // Survey Relief Massif
    '0xdb45e2396634c9c4027a273e9d4c717d5bfbeec6c46073e1417c1f814ddcc122', // Sepia Shaded Ranges
    '0x84019309b9a19a420550231a5eb70af10dfd0759c3c549fe90457a6a40330cbd', // Glacier Drainage Plateau
    '0xede56b5c28a985de12f6b07e14b8ee98426a9e61f3cedfe8deac3fb597aaba31', // Survey Relief Plateau
    '0x35b0e3988211e6ebbb169df6124c8dd1e04a7d4e3a8c923446213dfa9a4e55a1', // Glacier Scour Cone
    '0x59082ba273dd4a49c30b769cff18cb4a43043adbbd193838738d37e2e83e03c6', // Nocturne Shaded Massif
    '0x8999cc29e737f701b3af99683baa9d77fa21c859fcd93b548fa6515ca87088b8', // Survey Shaded Cone
    '0x12c40b0795be68de72eb4f5427a58468a36c52907dbea92f8ca85877f44f53ee', // Canyon Scour Massif
    '0x17e647ca77c4bff7986611a45fef9960547f3a12a68329bab42236542c670c9d', // Canyon Relief Ranges
    '0x7c619a7bc2448adf5751a2b21277d4b88a9e8627c6c08f96c7402876f3eb98c2', // Nocturne Relief Cone
    '0x3d8e3a0828d4351ef4c076e84539397d8e0d6fe32605d4792daecd4f07a3bbee', // Survey Drainage Cone
    '0xfe140ea3afb6aa50d8cecf5641ea49e860d3116a7cd12540c8134c7f8208e7fb', // Glacier Drainage Massif
  ],
} satisfies Series
