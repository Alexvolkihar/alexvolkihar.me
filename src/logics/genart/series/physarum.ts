// "Physarum" — slime-mould transport networks.
//
// Jeff Jones's agent model of Physarum polycephalum (Jones 2010): a few
// thousand agents, each with three forward sensors, walk a trail map. Every
// step an agent turns towards the strongest trail it smells, moves one cell if
// the cell is free (one agent per cell) and deposits trail there; the trail
// then diffuses and decays. The agents never see the network they build, yet
// the trail organises itself into reticulated meshes, coarse veins, foam,
// worm-like labyrinths or spots, depending only on the sensor angle, the
// rotation angle and the sensor offset. Oat flakes keep feeding trail into
// the map and become hubs of the network; stones are cells no agent may enter,
// so the network flows round them.
//
// The simulation runs on a fixed grid (short side 160 cells) for a fixed
// number of steps, whatever the size of the canvas, and is bit-exact (see
// ../physarum/sim.ts). The trail map is then developed at canvas resolution
// (capped) through a tone curve, a glow and a palette.
//
// Every length is a fraction of the canvas short side. An open culture takes
// the canvas aspect (a wide canvas is a wider culture, the agent density is
// the same); a Petri dish stays a centred disc.

import type { Rng } from '../random'
import type { Series } from '../types'
import { DIRS, simulate } from '../physarum/sim'
import { int, range, stream, weighted } from '../random'

// Rarity table, decided before the drawing code. Never reorder: it re-rolls the edition.
const TRAITS = {
  Palette: [['Plasmodium', 22], ['Agar', 20], ['Lumen', 18], ['Ink', 16], ['Ember', 12], ['Verdigris', 12]],
  Regime: [['Mesh', 30], ['Veins', 22], ['Foam', 18], ['Worms', 18], ['Spots', 12]],
  Culture: [['Lawn', 45], ['Oats', 30], ['Stones', 25]],
  Dish: [['Open', 65], ['Petri', 35]],
} as const

type TraitName = keyof typeof TRAITS
type Features = { [K in TraitName]: typeof TRAITS[K][number][0] }

function features(hash: string): Features {
  const r = stream(hash, 'features')
  return {
    Palette: weighted(r, TRAITS.Palette),
    Regime: weighted(r, TRAITS.Regime),
    Culture: weighted(r, TRAITS.Culture),
    Dish: weighted(r, TRAITS.Dish),
  }
}

interface Palette {
  /** Dark palettes add light over the ground, light ones lay pigment. */
  dark: boolean
  bg: string
  /** Outside a Petri dish. */
  table: string
  /** From faint trail to the densest veins. */
  ramp: readonly string[]
  food: string
  stone: string
  rim: string
}

const PAL: Record<Features['Palette'], Palette> = {
  Plasmodium: { dark: true, bg: '#100d08', table: '#0a0805', ramp: ['#100d08', '#4a3306', '#b8860f', '#f2cf4a', '#fff6c8'], food: '#e9dcc0', stone: '#2a241c', rim: '#5a4c36' },
  Agar: { dark: false, bg: '#f1e8d0', table: '#d9cdb0', ramp: ['#f1e8d0', '#ecd58a', '#e0ae2a', '#b0780e', '#5e3b06'], food: '#fbf6ea', stone: '#a89c84', rim: '#bfb294' },
  Lumen: { dark: true, bg: '#050a14', table: '#03060c', ramp: ['#050a14', '#0b3050', '#1a7fa6', '#6fe0dc', '#effffb'], food: '#f6d27a', stone: '#14233a', rim: '#2c4766' },
  Ink: { dark: false, bg: '#f2eee6', table: '#dcd6ca', ramp: ['#f2eee6', '#bdb8ae', '#6e6a63', '#2a2826', '#0c0c0c'], food: '#b8352a', stone: '#c9c2b5', rim: '#a49d90' },
  Ember: { dark: true, bg: '#0d0605', table: '#070303', ramp: ['#0d0605', '#4c100a', '#b8321a', '#ff9440', '#fff1cc'], food: '#f3e6d0', stone: '#2a1512', rim: '#55302a' },
  Verdigris: { dark: false, bg: '#dfe6d8', table: '#c6cfbe', ramp: ['#dfe6d8', '#a9c2a0', '#5d8c6e', '#245246', '#0e2622'], food: '#d9a441', stone: '#b2bca8', rim: '#97a38c' },
}

// Jones's parameters per regime: sensor angle and rotation angle in compass
// steps (256 = full turn, 16 = 22.5°), sensor offset in cells of the
// 160-cell grid; agents per free cell; trail fed per step on a food cell and
// along the wall of a dish.
const REGIME: Record<Features['Regime'], { sa: number, ra: number, so: number, density: number, food: number, rim: number }> = {
  Mesh: { sa: 16, ra: 32, so: 3.5, density: 0.12, food: 10, rim: 0.8 },
  Veins: { sa: 16, ra: 32, so: 12, density: 0.035, food: 10, rim: 0.8 },
  Foam: { sa: 32, ra: 32, so: 6, density: 0.2, food: 10, rim: 0.8 },
  Worms: { sa: 64, ra: 32, so: 6, density: 0.12, food: 4, rim: 0.5 },
  Spots: { sa: 64, ra: 64, so: 3, density: 0.05, food: 1.5, rim: 0 },
}

/** Trail grid short side, in cells. */
const G = 160
const STEPS = 200
/** Steps recorded at the end, as the fine grain of the agents' last moves. */
const RECORD = 40
const DK = 3
/** Trail kept per step after diffusion. */
const KEEP = 0.9
/** Longest side of the developed image before the canvas upscales it. */
const DEV_CAP = 1600
/** Widest culture, as a ratio of the short side (21:9 is 2.33). */
const MAX_ASPECT = 2.5

interface Disc { x: number, y: number, r: number }

// Squared length with plain products: `**` and Math.hypot are not exactly
// rounded in every engine, and these tests decide which cells are walls.
const sq = (dx: number, dy: number) => dx * dx + dy * dy

function hex(c: string): [number, number, number] {
  const v = Number.parseInt(c.slice(1), 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}

/** 256-entry colour table along the ramp. */
function lut(ramp: readonly string[]): Uint8ClampedArray {
  const cs = ramp.map(hex)
  const out = new Uint8ClampedArray(256 * 3)
  for (let i = 0; i < 256; i++) {
    const x = (i / 255) * (cs.length - 1)
    const k = Math.min(cs.length - 2, Math.floor(x))
    const t = x - k
    for (let c = 0; c < 3; c++)
      out[i * 3 + c] = Math.round(cs[k][c] * (1 - t) + cs[k + 1][c] * t)
  }
  return out
}

/** Box blur of radius 1, `passes` times (clamped edges). */
function blur(src: Float64Array, w: number, h: number, passes: number): Float64Array {
  const a = Float64Array.from(src)
  const b = new Float64Array(w * h)
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const o = y * w
        b[o + x] = (a[o + Math.max(0, x - 1)] + a[o + x] + a[o + Math.min(w - 1, x + 1)]) / 3
      }
    }
    for (let y = 0; y < h; y++) {
      const u = Math.max(0, y - 1) * w
      const d = Math.min(h - 1, y + 1) * w
      const o = y * w
      for (let x = 0; x < w; x++)
        a[o + x] = (b[u + x] + b[o + x] + b[d + x]) / 3
    }
  }
  return a
}

/** Value below which a fraction q of the non-zero cells fall. */
function quantile(v: Float64Array, q: number): number {
  let mx = 0
  for (let i = 0; i < v.length; i++) {
    if (v[i] > mx)
      mx = v[i]
  }
  if (mx <= 0)
    return 1
  const B = 1024
  const hist = new Uint32Array(B)
  let n = 0
  for (let i = 0; i < v.length; i++) {
    if (v[i] > 0) {
      hist[Math.min(B - 1, Math.floor((v[i] / mx) * B))]++
      n++
    }
  }
  let acc = 0
  for (let b = 0; b < B; b++) {
    acc += hist[b]
    if (acc >= q * n)
      return ((b + 1) / B) * mx
  }
  return mx
}

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

function scratch(w: number, h: number): { cv: HTMLCanvasElement | OffscreenCanvas, g: Ctx2D } {
  if (typeof OffscreenCanvas !== 'undefined') {
    const cv = new OffscreenCanvas(w, h)
    return { cv, g: cv.getContext('2d') as OffscreenCanvasRenderingContext2D }
  }
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  return { cv, g: cv.getContext('2d') as CanvasRenderingContext2D }
}

/** An oat flake: an irregular rounded polygon around (x, y). */
function flake(r: Rng): number[] {
  const k = int(r, 7, 10)
  const rot = range(r, 0, Math.PI * 2)
  const stretch = range(r, 0.65, 0.95)
  const pts: number[] = []
  for (let i = 0; i < k; i++) {
    const a = (i / k) * Math.PI * 2
    const rr = range(r, 0.78, 1.08)
    const x = Math.cos(a) * rr
    const y = Math.sin(a) * rr * stretch
    pts.push(x * Math.cos(rot) - y * Math.sin(rot), x * Math.sin(rot) + y * Math.cos(rot))
  }
  return pts
}

function render(g: CanvasRenderingContext2D, W: number, H: number, hash: string) {
  const f = features(hash)
  const pal = PAL[f.Palette]
  const reg = REGIME[f.Regime]
  const S = Math.min(W, H)
  const petri = f.Dish === 'Petri'

  // Fixed stream order: layout, agents, sim, then texture.
  const lr = stream(hash, 'layout')
  const ar = stream(hash, 'agents')
  const sr = stream(hash, 'sim')
  const tr = stream(hash, 'texture')

  // --- world ---------------------------------------------------------------
  // An open culture takes the canvas aspect; a dish is a square world.
  let aspect = W / H
  if (petri)
    aspect = 1
  aspect = Math.min(MAX_ASPECT, Math.max(1 / MAX_ASPECT, aspect))
  let gw = G
  let gh = G
  if (aspect > 1)
    gw = Math.round(G * aspect)
  else
    gh = Math.round(G / aspect)
  const N = gw * gh

  // regime, nudged per hash so two meshes are never quite the same scale
  const so = reg.so * range(lr, 0.88, 1.15)
  const sa = reg.sa + int(lr, -2, 2)
  const ra = reg.ra + int(lr, -2, 2)
  const density = reg.density * range(lr, 0.9, 1.1)

  const mask = new Uint8Array(N).fill(1)
  const cx = gw / 2
  const cy = gh / 2
  // dish radius leaves more than the sensor offset between the wall and the
  // grid edge, so the sensors never leave the grid
  const dishR = G / 2 - Math.ceil(so) - 3
  if (petri) {
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        if (sq(x + 0.5 - cx, y + 0.5 - cy) > dishR * dishR)
          mask[y * gw + x] = 0
      }
    }
  }
  const inWorld = (x: number, y: number, pad: number) => {
    if (petri)
      return sq(x - cx, y - cy) < (dishR - pad) * (dishR - pad)
    return x > pad && y > pad && x < gw - pad && y < gh - pad
  }

  // stones: discs no agent may enter
  const stones: Disc[] = []
  if (f.Culture === 'Stones') {
    const k = Math.round(int(lr, 3, 7) * (gw * gh) / (G * G))
    for (let tries = 0; stones.length < k && tries < 400; tries++) {
      const r = G * range(lr, 0.035, 0.085)
      const x = range(lr, 0, gw)
      const y = range(lr, 0, gh)
      if (!inWorld(x, y, r + 6))
        continue
      if (stones.some(s => Math.sqrt(sq(s.x - x, s.y - y)) < s.r + r + 10))
        continue
      stones.push({ x, y, r })
    }
    for (const s of stones) {
      for (let y = Math.max(0, Math.floor(s.y - s.r)); y <= Math.min(gh - 1, Math.ceil(s.y + s.r)); y++) {
        for (let x = Math.max(0, Math.floor(s.x - s.r)); x <= Math.min(gw - 1, Math.ceil(s.x + s.r)); x++) {
          if (sq(x + 0.5 - s.x, y + 0.5 - s.y) < s.r * s.r)
            mask[y * gw + x] = 0
        }
      }
    }
  }

  // oat flakes: food that keeps feeding trail into the map
  const foods: Disc[] = []
  if (f.Culture === 'Oats') {
    const k = Math.round(int(lr, 6, 14) * (gw * gh) / (G * G))
    for (let tries = 0; foods.length < k && tries < 400; tries++) {
      const r = G * range(lr, 0.014, 0.026)
      const x = range(lr, 0, gw)
      const y = range(lr, 0, gh)
      if (!inWorld(x, y, r + 8))
        continue
      if (foods.some(o => Math.sqrt(sq(o.x - x, o.y - y)) < G * 0.12))
        continue
      foods.push({ x, y, r })
    }
  }

  // Food feeds trail every step. A dish also gets a faint feed along its wall
  // (the meniscus where real plasmodia like to crawl), which anchors the
  // network to the rim instead of letting it contract to the middle.
  const feed = new Float64Array(N)
  for (const o of foods) {
    for (let y = Math.max(0, Math.floor(o.y - o.r)); y <= Math.min(gh - 1, Math.ceil(o.y + o.r)); y++) {
      for (let x = Math.max(0, Math.floor(o.x - o.r)); x <= Math.min(gw - 1, Math.ceil(o.x + o.r)); x++) {
        if (sq(x + 0.5 - o.x, y + 0.5 - o.y) <= o.r * o.r)
          feed[y * gw + x] = reg.food
      }
    }
  }
  if (petri && reg.rim > 0) {
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const d = dishR - Math.sqrt(sq(x + 0.5 - cx, y + 0.5 - cy))
        if (d > 0 && d < 2)
          feed[y * gw + x] = reg.rim
      }
    }
  }

  // --- agents ----------------------------------------------------------------
  const free = mask.reduce((a, v) => a + v, 0)
  const n = Math.round(free * density)
  const ax = new Float64Array(n)
  const ay = new Float64Array(n)
  const ah = new Uint8Array(n)
  const taken = new Uint8Array(N)
  let placed = 0
  for (let tries = 0; placed < n && tries < n * 20; tries++) {
    const c = Math.floor(ar() * N)
    if (!mask[c] || taken[c])
      continue
    taken[c] = 1
    ax[placed] = (c % gw) + ar()
    ay[placed] = Math.floor(c / gw) + ar()
    ah[placed] = Math.floor(ar() * DIRS)
    placed++
  }

  const sim = simulate({
    gw,
    gh,
    steps: STEPS,
    sa,
    ra,
    so,
    ss: 1,
    deposit: 5,
    keep: KEEP,
    feed,
    mask,
    wrap: !petri,
    dk: DK,
    recordFrom: STEPS - RECORD,
  }, { x: ax.subarray(0, placed), y: ay.subarray(0, placed), h: ah.subarray(0, placed) }, sr)

  // --- development -------------------------------------------------------------
  const trail = sim.trail
  const glow = blur(trail, gw, gh, 4)
  const vis = blur(sim.visits, sim.dw, sim.dh, 1)
  // Exposure: a high quantile of the trail, half-way (geometric mean) between
  // the whole map and the map away from the food, whose hubs would otherwise
  // leave the rest of the network faint.
  const away = new Uint8Array(N).fill(1)
  for (const o of foods) {
    const R = o.r * 4
    for (let y = Math.max(0, Math.floor(o.y - R)); y <= Math.min(gh - 1, Math.ceil(o.y + R)); y++) {
      for (let x = Math.max(0, Math.floor(o.x - R)); x <= Math.min(gw - 1, Math.ceil(o.x + R)); x++) {
        if (sq(x + 0.5 - o.x, y + 0.5 - o.y) <= R * R)
          away[y * gw + x] = 0
      }
    }
  }
  const hiT = Math.sqrt(quantile(trail, 0.985) * quantile(trail.map((v, k) => v * away[k]), 0.985))
  const hiG = Math.sqrt(quantile(glow, 0.985) * quantile(glow.map((v, k) => v * away[k]), 0.985))
  const hiV = quantile(vis, 0.985)

  // world rectangle on the canvas, in pixels: a dish is the centred square,
  // an open culture covers the canvas (it was given the canvas aspect, so it
  // is only cropped beyond MAX_ASPECT)
  let wpx = S
  let hpx = S
  if (!petri) {
    const cellPx = Math.max(W / gw, H / gh)
    wpx = gw * cellPx
    hpx = gh * cellPx
  }
  const ox = (W - wpx) / 2
  const oy = (H - hpx) / 2

  // developed image size: canvas resolution, capped
  const dev = Math.min(1, DEV_CAP / Math.max(wpx, hpx))
  const dw = Math.max(1, Math.round(wpx * dev))
  const dh = Math.max(1, Math.round(hpx * dev))

  const L = lut(pal.ramp)
  const sc = scratch(dw, dh)
  const img = sc.g.createImageData(dw, dh)
  const px = img.data

  // bilinear lookups, per column and per row
  const colI = new Int32Array(dw * 2)
  const colT = new Float64Array(dw)
  const rowI = new Int32Array(dh * 2)
  const rowT = new Float64Array(dh)
  const vcI = new Int32Array(dw * 2)
  const vcT = new Float64Array(dw)
  const vrI = new Int32Array(dh * 2)
  const vrT = new Float64Array(dh)
  const axis = (n: number, cells: number, I: Int32Array, T: Float64Array, wrapAxis: boolean) => {
    for (let i = 0; i < n; i++) {
      const u = ((i + 0.5) / n) * cells - 0.5
      let i0 = Math.floor(u)
      const t = u - i0
      let i1 = i0 + 1
      if (wrapAxis) {
        i0 = (i0 + cells) % cells
        i1 = i1 % cells
      }
      else {
        i0 = Math.max(0, Math.min(cells - 1, i0))
        i1 = Math.max(0, Math.min(cells - 1, i1))
      }
      I[i * 2] = i0
      I[i * 2 + 1] = i1
      T[i] = t
    }
  }
  axis(dw, gw, colI, colT, !petri)
  axis(dh, gh, rowI, rowT, !petri)
  axis(dw, sim.dw, vcI, vcT, !petri)
  axis(dh, sim.dh, vrI, vrT, !petri)

  const sample = (a: Float64Array, w: number, i0: number, i1: number, t: number, j0: number, j1: number, u: number) => {
    const p = a[j0 * w + i0] + (a[j0 * w + i1] - a[j0 * w + i0]) * t
    const q = a[j1 * w + i0] + (a[j1 * w + i1] - a[j1 * w + i0]) * t
    return p + (q - p) * u
  }

  const glowW = pal.dark ? 0.3 : 0.14
  const kT = 1 / hiT
  const kG = 1 / hiG
  const kV = 1 / hiV
  for (let y = 0; y < dh; y++) {
    const j0 = rowI[y * 2]
    const j1 = rowI[y * 2 + 1]
    const u = rowT[y]
    const vj0 = vrI[y * 2]
    const vj1 = vrI[y * 2 + 1]
    const vu = vrT[y]
    for (let x = 0; x < dw; x++) {
      const i0 = colI[x * 2]
      const i1 = colI[x * 2 + 1]
      const t = colT[x]
      const a = Math.min(1, sample(trail, gw, i0, i1, t, j0, j1, u) * kT)
      const b = Math.min(1, sample(glow, gw, i0, i1, t, j0, j1, u) * kG)
      const c = Math.min(1, sample(vis, sim.dw, vcI[x * 2], vcI[x * 2 + 1], vcT[x], vj0, vj1, vu) * kV)
      // tone: a smooth core, a wide soft glow, and the grain of the last moves
      const core = a * a * (3 - 2 * a)
      let v = core * 0.62 + b * b * glowW + c * 0.22
      if (v > 1)
        v = 1
      // pigment on a light ground reads heavier than light on a dark one
      if (!pal.dark)
        v *= Math.sqrt(v)
      const li = (v * 255) | 0
      const o = (y * dw + x) * 4
      px[o] = L[li * 3]
      px[o + 1] = L[li * 3 + 1]
      px[o + 2] = L[li * 3 + 2]
      px[o + 3] = 255
    }
  }
  sc.g.putImageData(img, 0, 0)

  // --- drawing -----------------------------------------------------------------
  g.globalAlpha = 1
  g.globalCompositeOperation = 'source-over'
  g.fillStyle = petri ? pal.table : pal.bg
  g.fillRect(0, 0, W, H)
  g.imageSmoothingEnabled = true
  g.imageSmoothingQuality = 'high'

  const X = (x: number) => ox + (x / gw) * wpx
  const Y = (y: number) => oy + (y / gh) * hpx
  const cell = wpx / gw

  if (petri) {
    // soft shadow of the dish, then the agar, then the culture clipped to it
    const R = (dishR + 1.5) * cell
    g.save()
    g.fillStyle = pal.dark ? '#000000' : pal.rim
    g.globalAlpha = pal.dark ? 0.5 : 0.35
    g.beginPath()
    g.arc(X(cx) + S * 0.006, Y(cy) + S * 0.009, R * 1.035, 0, Math.PI * 2)
    g.fill()
    g.restore()
    g.save()
    g.beginPath()
    g.arc(X(cx), Y(cy), R, 0, Math.PI * 2)
    g.clip()
    g.drawImage(sc.cv, ox, oy, wpx, hpx)
    g.restore()
    // glass rim: a thin wall and a faint inner highlight
    g.strokeStyle = pal.rim
    g.lineWidth = S * 0.006
    g.beginPath()
    g.arc(X(cx), Y(cy), R, 0, Math.PI * 2)
    g.stroke()
    g.strokeStyle = '#ffffff'
    g.globalAlpha = pal.dark ? 0.08 : 0.45
    g.lineWidth = S * 0.0025
    g.beginPath()
    g.arc(X(cx), Y(cy), R - S * 0.008, Math.PI * 1.05, Math.PI * 1.65)
    g.stroke()
    g.globalAlpha = 1
  }
  else {
    g.drawImage(sc.cv, ox, oy, wpx, hpx)
  }

  // stones, lit from the top left
  for (const s of stones) {
    const sx = X(s.x)
    const sy = Y(s.y)
    const sr = s.r * cell * 0.92
    const shade = g.createRadialGradient(sx - sr * 0.35, sy - sr * 0.4, sr * 0.1, sx, sy, sr)
    shade.addColorStop(0, pal.rim)
    shade.addColorStop(1, pal.stone)
    g.fillStyle = shade
    g.beginPath()
    g.arc(sx, sy, sr, 0, Math.PI * 2)
    g.fill()
    g.strokeStyle = pal.rim
    g.globalAlpha = 0.6
    g.lineWidth = S * 0.0018
    g.stroke()
    g.globalAlpha = 1
  }

  // oat flakes, drawn over the hubs they feed
  for (const o of foods) {
    const pts = flake(tr)
    const rr = o.r * cell * 1.25
    g.fillStyle = pal.food
    g.beginPath()
    for (let i = 0; i < pts.length; i += 2) {
      const x = X(o.x) + pts[i] * rr
      const y = Y(o.y) + pts[i + 1] * rr
      if (i === 0)
        g.moveTo(x, y)
      else
        g.lineTo(x, y)
    }
    g.closePath()
    g.globalAlpha = 0.92
    g.fill()
    g.globalAlpha = 1
  }
  g.globalAlpha = 1
}

export default {
  slug: 'physarum',
  title: 'Physarum',
  summary: 'Slime-mould transport networks after Jeff Jones\'s agent model: meshes, veins, foam, worms and spots grown by thousands of sensing agents, fed by oats and parted by stones.',
  order: 410,
  traits: TRAITS,
  features,
  render,
  // Seed-of-seeds 0x5117e5a1 ("gallery" stream): the first hash found for each
  // Palette x Regime pair, in the order found, except that the tenth one (an
  // Ember foam in a Petri dish) is moved first to serve as the cover.
  gallery: [
    '0xc115d3e16086c22f9fc2e9398d1a28e4375f3998012084272f4408c8bc146c81',
    '0x46b9a4dfdbe45047b20451204e31e638aa4600a4e7fccdc620041c0b14614c81',
    '0x13002e1d1b37753b6ed1e7eb21658911a3f027beaac168b3b03de2ba8cdcfc63',
    '0xd703177d138e6526f37aa7a2909da89346a04a4f38bb31cf9efa01428b6f1fad',
    '0x4d82122be1f6b1f2b19678097121ddce70294ffd0a152355d3f0a78e38438560',
    '0x64ca1891226e41d9c14089d93bd63017f687c702a03eaa34ea8bb98aba553aa4',
    '0xc9b214bff0c336a874fc3d333a8ea2ea44493e6e7e2fa2af633c5b5346da95ec',
    '0x0c5c882eb17a189e68ff757d8c4a33eeaffae55324d4a01f58b77a015ad47e60',
    '0xf7cad7c47214b8a857f219c59da17c7f1d354c503d5a580ca5e930c42afa736a',
    '0x68717d2d3c6095d3780529db727dfae1406ab0b5ebe6b088e8e4d701ebf72ad0',
    '0x7f1d79402520c047cc5f72763310f33810ac7111f9e856fa2a6555be4b476ccb',
    '0x35b166f4b75cbd61b9029627365191356f52f43bff614953e0de9bcf53e4674c',
  ],
} satisfies Series
