// "Sandpile" — the stable heights of an abelian sandpile.
//
// Grains are dropped on a lattice bounded by a sink: at one site, at a ring
// of sites, on top of a uniform plateau, or as the configuration 2 c_max
// whose stabilization, subtracted and stabilized again, gives the identity
// element of the sandpile group, on a tray sometimes pierced by a hole (Bak,
// Tang & Wiesenfeld 1987; Dhar 1990; Creutz 1991). Every site holding as
// many grains as it has neighbours topples, and the stable heights 0 .. T - 1
// are painted as tiles, as dots or as a shaded relief of the smoothed field.
//
// Everything is a pure function of the hash. The simulation size is fixed by
// the traits (never by the canvas), and every length is a fraction of the
// canvas short side.

import type { Rng } from '../random'
import type { Lattice, Pile } from '../sandpile/sim'
import type { Series } from '../types'
import { chance, pick, range, stream, weighted } from '../random'
import { stabilize, THRESHOLD } from '../sandpile/sim'

// Rarity table, decided before the drawing code. Never reorder: it re-rolls the edition.
const TRAITS = {
  Palette: [['Ember', 18], ['Delft', 20], ['Lichen', 16], ['Riso', 18], ['Abyss', 14], ['Graphite', 14]],
  Lattice: [['Von Neumann', 45], ['Moore', 25], ['Hexagonal', 30]],
  Source: [['Single', 35], ['Constellation', 25], ['Plateau', 20], ['Identity', 20]],
  Boundary: [['Disc', 35], ['Square', 35], ['Polygon', 30]],
  Render: [['Tiles', 40], ['Dots', 30], ['Relief', 30]],
} as const

type TraitName = keyof typeof TRAITS
type Features = { [K in TraitName]: typeof TRAITS[K][number][0] }

function features(hash: string): Features {
  const r = stream(hash, 'features')
  return {
    Palette: weighted(r, TRAITS.Palette),
    Lattice: weighted(r, TRAITS.Lattice),
    Source: weighted(r, TRAITS.Source),
    Boundary: weighted(r, TRAITS.Boundary),
    Render: weighted(r, TRAITS.Render),
  }
}

interface Palette {
  bg: string
  /** Ground under the dots. */
  tray: string
  /** Eight colours from height 0 up; a lattice with T heights takes T of them, evenly spread. */
  ramp: readonly string[]
}

const PAL: Record<Features['Palette'], Palette> = {
  Ember: { bg: '#0f0b0a', tray: '#1b1310', ramp: ['#24140f', '#4a1a12', '#7c2316', '#b53a1c', '#d9622a', '#f08c3a', '#f7b860', '#fbe7b8'] },
  Delft: { bg: '#f2efe7', tray: '#e3e2dc', ramp: ['#e7eaee', '#c4d3e4', '#94b2d4', '#6890c0', '#41689f', '#284a7e', '#16305b', '#0c1a36'] },
  Lichen: { bg: '#eeebdf', tray: '#e0ddcc', ramp: ['#dcdcc0', '#bfc697', '#9eae6f', '#7c9452', '#5b7840', '#3f5a31', '#2a3f24', '#182417'] },
  Riso: { bg: '#f5efe3', tray: '#ece3d3', ramp: ['#f6d2c6', '#ff8fa3', '#ff5e7e', '#e8a33a', '#f2c94c', '#2f8f9d', '#255f85', '#24203a'] },
  Abyss: { bg: '#060a12', tray: '#0b1320', ramp: ['#0d1a2b', '#12304a', '#1b4f72', '#24708a', '#2f8f9a', '#55b3a8', '#9fdcc4', '#e6f7e8'] },
  Graphite: { bg: '#ebe8e3', tray: '#dedad3', ramp: ['#d6d2cb', '#b9b4ac', '#9c978f', '#7b766f', '#5a5650', '#3c3936', '#262422', '#c4432b'] },
}

const KIND: Record<Features['Lattice'], Lattice> = { 'Von Neumann': 'square', 'Moore': 'moore', 'Hexagonal': 'hex' }

// Domain radius in sites, by source, lattice and boundary. The number of
// topplings grows like R^4 (the odometer) and shrinks with the symmetry the
// fold can use, so these were measured against the 250 ms budget of the
// /genart index (a square keeps only two mirrors of the hexagonal lattice).
type Radii = Record<Features['Boundary'], number>
const RADIUS: Record<Features['Source'], Record<Lattice, Radii>> = {
  Single: {
    square: { Disc: 66, Square: 60, Polygon: 74 },
    moore: { Disc: 66, Square: 58, Polygon: 66 },
    hex: { Disc: 58, Square: 48, Polygon: 62 },
  },
  Constellation: {
    square: { Disc: 64, Square: 58, Polygon: 74 },
    moore: { Disc: 64, Square: 58, Polygon: 62 },
    hex: { Disc: 58, Square: 44, Polygon: 60 },
  },
  Plateau: {
    square: { Disc: 74, Square: 70, Polygon: 80 },
    moore: { Disc: 70, Square: 62, Polygon: 70 },
    hex: { Disc: 66, Square: 54, Polygon: 64 },
  },
  Identity: {
    square: { Disc: 50, Square: 48, Polygon: 60 },
    moore: { Disc: 52, Square: 48, Polygon: 52 },
    hex: { Disc: 50, Square: 36, Polygon: 52 },
  },
}

// Mean stable height inside a pile grown from a point (measured), and the
// plateau each lattice is filled with.
const DENSITY: Record<Lattice, number> = { square: 2.2, moore: 4.5, hex: 3.5 }
const PLATEAU: Record<Lattice, number> = { square: 2, moore: 6, hex: 4 }
const EXCESS: Record<Lattice, number> = { square: 0.5, moore: 0.3, hex: 0.3 }

const SQ3 = Math.sqrt(3)

/** Screen position of an array offset (q, r) from the centre, in site units. */
function toScreen(lat: Lattice, q: number, r: number): [number, number] {
  return lat === 'hex' ? [q + r / 2, r * SQ3 / 2] : [q, r]
}

function inside(lat: Lattice, b: Features['Boundary'], q: number, r: number, R: number): boolean {
  const [x, y] = toScreen(lat, q, r)
  if (b === 'Disc')
    return lat === 'hex' ? q * q + q * r + r * r <= R * R : x * x + y * y <= R * R
  if (b === 'Square')
    return Math.abs(x) <= R && Math.abs(y) <= R
  if (lat === 'square')
    return Math.abs(x) + Math.abs(y) <= R
  if (lat === 'moore')
    return Math.abs(x) <= R && Math.abs(y) <= R && Math.abs(x) + Math.abs(y) <= R * Math.SQRT2
  return Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) <= R
}

interface Scene {
  pile: Pile
  R: number
}

// The stable pile is a pure function of the hash: it is kept for the next
// render of the same hash (another size, the download), never shared across hashes.
const cache = new Map<string, Scene>()

function build(hash: string, f: Features): Scene {
  const hit = cache.get(hash)
  if (hit)
    return hit
  const lat = KIND[f.Lattice]
  const T = THRESHOLD[lat]
  const sr = stream(hash, 'sources')
  let R = RADIUS[f.Source][lat][f.Boundary]
  // The identity element is fixed by the tray alone, so its size varies,
  // and half of the trays get a round hole that is part of the sink.
  let hole = 0
  if (f.Source === 'Identity') {
    R = Math.round(R * range(sr, 0.8, 1))
    if (chance(sr, 0.5))
      hole = R * range(sr, 0.1, 0.32)
  }
  const size = 2 * Math.ceil((lat === 'hex' ? 1.6 : 1) * R) + 5
  const c = size >> 1
  const mask = new Uint8Array(size * size)
  let area = 0
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const q = x - c
      const r = y - c
      // squared distance to the centre, exact on both lattices
      const d2 = lat === 'hex' ? q * q + q * r + r * r : q * q + r * r
      if (inside(lat, f.Boundary, q, r, R) && d2 >= hole * hole) {
        mask[y * size + x] = 1
        area++
      }
    }
  }
  const init = new Int32Array(size * size)
  const at = (q: number, r: number) => (r + c) * size + q + c
  let second = -1
  if (f.Source === 'Identity') {
    for (let i = 0; i < mask.length; i++)
      init[i] = mask[i] * 2 * (T - 1)
    second = 2 * (T - 1)
  }
  else if (f.Source === 'Plateau') {
    for (let i = 0; i < mask.length; i++)
      init[i] = mask[i] * PLATEAU[lat]
    init[at(0, 0)] += Math.round(range(sr, 0.35, 0.9) * EXCESS[lat] * area)
  }
  else if (f.Source === 'Single') {
    init[at(0, 0)] = Math.round(range(sr, 0.5, 1.05) * DENSITY[lat] * area)
  }
  else {
    const spots = ring(lat, f.Boundary, R, sr)
    const n = Math.round(range(sr, 0.5, 0.95) * DENSITY[lat] * area / spots.length)
    for (const [q, r] of spots)
      init[at(q, r)] += n
  }
  const pile = stabilize(lat, size, mask, init, second)
  const scene = { pile, R }
  if (cache.size > 48)
    cache.delete(cache.keys().next().value!)
  cache.set(hash, scene)
  return scene
}

/** A symmetric ring of sources, sometimes with one at the centre. */
function ring(lat: Lattice, b: Features['Boundary'], R: number, r: Rng): Array<[number, number]> {
  const d = Math.round(R * range(r, 0.24, b === 'Polygon' ? 0.4 : 0.5))
  let spots: Array<[number, number]>
  if (lat === 'hex') {
    const kind = pick(r, ['pair', 'triad', 'sextet'] as const)
    if (kind === 'pair')
      spots = [[d, 0], [-d, 0]]
    else if (kind === 'triad')
      spots = [[d, 0], [-d, d], [0, -d]]
    else
      spots = [[d, 0], [0, d], [-d, d], [-d, 0], [0, -d], [d, -d]]
  }
  else {
    const kind = pick(r, ['pair', 'axes', 'diagonals'] as const)
    const e = Math.round(d / Math.SQRT2)
    if (kind === 'pair')
      spots = [[d, 0], [-d, 0]]
    else if (kind === 'axes')
      spots = [[d, 0], [-d, 0], [0, d], [0, -d]]
    else
      spots = [[e, e], [-e, e], [e, -e], [-e, -e]]
  }
  if (chance(r, 0.35))
    spots.push([0, 0])
  return spots
}

// --- colour ------------------------------------------------------------------

function rgb(hex: string): [number, number, number] {
  const p = Number.parseInt(hex.slice(1), 16)
  return [(p >> 16) & 255, (p >> 8) & 255, p & 255]
}

/** T colours picked evenly from the ramp (no blending: the steps stay clean). */
function levels(ramp: readonly string[], T: number): Array<[number, number, number]> {
  return Array.from({ length: T }, (_, l) => rgb(ramp[Math.round(l * (ramp.length - 1) / (T - 1))]))
}

const css = (c: readonly number[]) => `rgb(${c[0]},${c[1]},${c[2]})`

// --- drawing -------------------------------------------------------------------

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

function layer(w: number, h: number): { cv: HTMLCanvasElement | OffscreenCanvas, g: Ctx2D } {
  if (typeof OffscreenCanvas !== 'undefined') {
    const cv = new OffscreenCanvas(w, h)
    return { cv, g: cv.getContext('2d')! }
  }
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  return { cv, g: cv.getContext('2d')! }
}

function render(g: CanvasRenderingContext2D, W: number, H: number, hash: string) {
  const f = features(hash)
  const pal = PAL[f.Palette]
  const { pile, R } = build(hash, f)
  const { lattice: lat, size, c, mask, height, T } = pile
  const col = levels(pal.ramp, T)

  const S = Math.min(W, H)
  const margin = 0.085
  // one site unit in pixels; the domain spans [-R, R] in both directions
  const u = S * (1 - 2 * margin) / (2 * R + 1)
  const cx = W / 2
  const cy = H / 2

  g.globalAlpha = 1
  g.fillStyle = pal.bg
  g.fillRect(0, 0, W, H)

  if (f.Render === 'Relief') {
    relief(g, pile, R, col, cx, cy, u)
    return
  }

  // every site, bucketed by height
  const sites: number[][] = Array.from({ length: T }, () => [])
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x
      if (!mask[i])
        continue
      const [px, py] = toScreen(lat, x - c, y - c)
      sites[height[i]].push(cx + px * u, cy + py * u)
    }
  }

  // Hexagonal cells are pointy-top hexagons of width u, square cells are u
  // wide. Paths are flushed every few dozen cells: one path of thousands of
  // abutting polygons sends the rasterizer down a very slow road.
  const hexR = u / SQ3
  const BATCH = 60
  const cells = (pts: number[], grow: number) => {
    if (lat !== 'hex') {
      const s = u * grow
      for (let k = 0; k < pts.length; k += 2)
        g.fillRect(pts[k] - s / 2, pts[k + 1] - s / 2, s, s)
      return
    }
    const rr = hexR * grow
    const hw = rr * SQ3 / 2
    g.beginPath()
    for (let k = 0; k < pts.length; k += 2) {
      const x = pts[k]
      const y = pts[k + 1]
      g.moveTo(x, y - rr)
      g.lineTo(x + hw, y - rr / 2)
      g.lineTo(x + hw, y + rr / 2)
      g.lineTo(x, y + rr)
      g.lineTo(x - hw, y + rr / 2)
      g.lineTo(x - hw, y - rr / 2)
      g.closePath()
      if ((k >> 1) % BATCH === BATCH - 1) {
        g.fill()
        g.beginPath()
      }
    }
    g.fill()
  }
  // a hair of overlap hides the antialiasing seams between cells
  const grow = 1 + Math.max(0.6 / u, 0.01)

  if (f.Render === 'Tiles') {
    for (let l = 0; l < T; l++) {
      g.fillStyle = css(col[l])
      cells(sites[l], grow)
    }
    return
  }

  // Dots: the tray, then one dot per site, wider and stronger with height.
  g.fillStyle = pal.tray
  for (let l = 0; l < T; l++)
    cells(sites[l], grow)
  const dr = stream(hash, 'dots')
  const jitter = range(dr, 0, 0.06)
  for (let l = 0; l < T; l++) {
    const rad = u * 0.5 * (0.28 + 0.72 * (l + 1) / T)
    g.fillStyle = css(col[l])
    g.beginPath()
    const s = sites[l]
    for (let k = 0; k < s.length; k += 2) {
      const x = s[k] + (dr() - 0.5) * jitter * u
      const y = s[k + 1] + (dr() - 0.5) * jitter * u
      g.moveTo(x + rad, y)
      g.arc(x, y, rad, 0, Math.PI * 2)
      if ((k >> 1) % (BATCH * 4) === BATCH * 4 - 1) {
        g.fill()
        g.beginPath()
      }
    }
    g.fill()
  }
}

/**
 * Relief: the heights are smoothed at the scale of the lattice (a [1, 2, 1]
 * filter along both axes of a square lattice, a 7-point average on the
 * hexagonal one), which flattens the period-two textures (checkerboards,
 * stripes) of the pile into plain tones and leaves the borders between its
 * patches. The smoothed field is sampled on a fine
 * raster (nearest site), softened by a fraction of a site, lit from the upper
 * left, and the raster is scaled to the canvas by the browser's filter.
 */
function relief(g: CanvasRenderingContext2D, pile: Pile, R: number, col: Array<[number, number, number]>, cx: number, cy: number, u: number) {
  const { lattice: lat, size, c, mask, height, T } = pile
  const N = size * size
  let hv = new Float32Array(N)
  let hw = new Float32Array(N)
  for (let i = 0; i < N; i++) {
    hv[i] = mask[i] * height[i]
    hw[i] = mask[i]
  }
  if (lat === 'hex') {
    // one 7-point pass: the centre counts four times, each neighbour once
    const tv = new Float32Array(N)
    const tw = new Float32Array(N)
    for (let i = size + 1; i < N - size - 1; i++) {
      tv[i] = 4 * hv[i] + hv[i - 1] + hv[i + 1] + hv[i - size] + hv[i + size] + hv[i - size + 1] + hv[i + size - 1]
      tw[i] = 4 * hw[i] + hw[i - 1] + hw[i + 1] + hw[i - size] + hw[i + size] + hw[i - size + 1] + hw[i + size - 1]
    }
    hv = tv
    hw = tw
  }
  else {
    // [1, 2, 1] along x, then along y
    let tv = new Float32Array(N)
    let tw = new Float32Array(N)
    for (const o of [1, size]) {
      for (let i = size + 1; i < N - size - 1; i++) {
        tv[i] = 2 * hv[i] + hv[i - o] + hv[i + o]
        tw[i] = 2 * hw[i] + hw[i - o] + hw[i + o]
      }
      ;[hv, tv] = [tv, hv]
      ;[hw, tw] = [tw, hw]
    }
  }

  const SP = 4
  const span = 2 * R + 3
  const n = Math.ceil(span * SP)
  const val = new Float32Array(n * n)
  const wgt = new Float32Array(n * n)
  for (let j = 0; j < n; j++) {
    const py = (j + 0.5) / SP - span / 2
    for (let i = 0; i < n; i++) {
      const px = (i + 0.5) / SP - span / 2
      let q: number
      let r: number
      if (lat === 'hex') {
        // nearest hexagon by cube rounding
        const fr = py * 2 / SQ3
        const fq = px - fr / 2
        const fs = -fq - fr
        q = Math.round(fq)
        r = Math.round(fr)
        const s = Math.round(fs)
        const dq = Math.abs(q - fq)
        const dr = Math.abs(r - fr)
        const ds = Math.abs(s - fs)
        if (dq > dr && dq > ds)
          q = -r - s
        else if (dr > ds)
          r = -q - s
      }
      else {
        q = Math.round(px)
        r = Math.round(py)
      }
      const x = q + c
      const y = r + c
      if (x < 0 || y < 0 || x >= size || y >= size)
        continue
      const k = y * size + x
      if (!mask[k])
        continue
      val[j * n + i] = hv[k] / hw[k]
      wgt[j * n + i] = 1
    }
  }
  // premultiplied, so the sink does not bleed into the field
  for (let k = 0; k < n * n; k++)
    val[k] *= wgt[k]
  blur(val, n, 1)
  blur(wgt, n, 1)

  const L = layer(n, n)
  const img = L.g.createImageData(n, n)
  const d = img.data
  const top = T - 1
  // slope (in heights per site) to brightness
  const light = SP / (2 * top) * 0.9
  for (let j = 1; j < n - 1; j++) {
    for (let i = 1; i < n - 1; i++) {
      const k = j * n + i
      const w = wgt[k]
      if (w < 0.02)
        continue
      const v = val[k] / w
      const gx = val[k + 1] / Math.max(wgt[k + 1], 0.02) - val[k - 1] / Math.max(wgt[k - 1], 0.02)
      const gy = val[k + n] / Math.max(wgt[k + n], 0.02) - val[k - n] / Math.max(wgt[k - n], 0.02)
      const shade = Math.max(0.6, Math.min(1.4, 1 - (gx + gy) * light))
      const t = Math.max(0, Math.min(top, v))
      const a = Math.min(top - 1, Math.floor(t))
      const fr = t - a
      const ca = col[a]
      const cb = col[a + 1]
      const p = k * 4
      for (let ch = 0; ch < 3; ch++) {
        const base = ca[ch] * (1 - fr) + cb[ch] * fr
        d[p + ch] = shade > 1 ? base + (255 - base) * (shade - 1) * 0.7 : base * shade
      }
      // a crisp edge for the domain
      d[p + 3] = (w - 0.5) * 4 * 255 + 128
    }
  }
  L.g.putImageData(img, 0, 0)
  g.imageSmoothingEnabled = true
  g.imageSmoothingQuality = 'high'
  const side = (n / SP) * u
  g.drawImage(L.cv, cx - side / 2, cy - side / 2, side, side)
}

/** Box blur of radius r, run twice along rows and columns (close to a Gaussian), in place. */
function blur(a: Float32Array, n: number, r: number) {
  const tmp = new Float32Array(n)
  const inv = 1 / (2 * r + 1)
  for (let pass = 0; pass < 4; pass++) {
    // even passes run along rows, odd passes along columns
    const step = pass % 2 ? n : 1
    const lineStep = pass % 2 ? 1 : n
    for (let line = 0; line < n; line++) {
      const o = line * lineStep
      let acc = 0
      for (let k = 0; k <= r && k < n; k++)
        acc += a[o + k * step]
      for (let k = 0; k < n; k++) {
        tmp[k] = acc * inv
        const add = k + r + 1
        const sub = k - r
        if (add < n)
          acc += a[o + add * step]
        if (sub >= 0)
          acc -= a[o + sub * step]
      }
      for (let k = 0; k < n; k++)
        a[o + k * step] = tmp[k]
    }
  }
}

export default {
  slug: 'sandpile',
  title: 'Sandpile',
  summary: 'Grains dropped on a lattice topple until every site is stable: abelian sandpiles, their identity elements and plateaus, as tiles, dots or relief.',
  order: 340,
  traits: TRAITS,
  features,
  render,
  // Seed-of-seeds 0x5a9d5a9d ("gallery" stream): the first hash found for each
  // Source x Render pair, in the order found, except that the third one (a
  // Delft identity element on a square, the archetype of the series) is moved
  // first to serve as the cover.
  gallery: [
    '0x984591dc2bc4cdac2aa1f205ad04f837a124c6d228505fcce3c84b6a66f42e50',
    '0x76975c195388d5adfdca9f352da681d1f904d878c964737141ff8a147ca2216c',
    '0x6d6da1da9a32e1984f5f2f6ce6eb5e465270a2dcd616dc3796830b609910340f',
    '0x492201afe61ed1085db4f8f990d09da1e2d2aa5c056192f27e39aa6c3abf6488',
    '0x6c2381d48096edb70b839990ff12a57421584f36930906d40c724df0830590c7',
    '0x75ea1f88385ddc38731b49b1178316898b9e2b309309bbc53862c3947c2396a4',
    '0xf509913a33a9875814fad3853e9cd69ed017511797a3b93d2ad556aa77ca6dda',
    '0xfad3dbcfb37cf807ef774cf9ea0904c37fc6ef7a0f1538ecb8ae53effcd59001',
    '0x060b30730b2b8d6572b721ddb3ec1ce86ea809d08066169a9d50d3fcb8e5cb03',
    '0x8caccafe8b157530fb3c6d73b8644863d1f42f32487599b2164b725eca3fd5ac',
    '0xd301e1cead6038f0a1665098c23851220893645b603dd75ea39d8c619ee9d00e',
    '0x2306795febf2e977706fbe791c24930b7f86dbaa1e939f3869bf402f07a24eb7',
  ],
} satisfies Series
