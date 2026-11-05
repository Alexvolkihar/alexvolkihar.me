// "Coral" — branching growth by space colonization.
//
// A cloud of attractor points is scattered inside a shape; one or several
// seeds grow towards them, a node sprouting a child each step towards the
// mean direction of the attractors it is closest to, and every attractor
// reached is consumed (Runions, Lane & Prusinkiewicz, "Modeling Trees with a
// Space Colonization Algorithm", 2007, after Runions et al. 2005 for leaf
// veins). Branch widths follow the pipe model (Leonardo's rule: the squared
// width of a branch is the sum of its children's), colour follows the
// generation, from root to tip.
//
// Everything is a pure function of the hash, and every length is a fraction
// of the canvas short side.

import type { Rng } from '../random'
import type { Series } from '../types'
import { gaussian, int, range, stream, weighted } from '../random'

// Rarity table, decided before the drawing code. Never reorder: it re-rolls the edition.
const TRAITS = {
  Palette: [['Reef', 26], ['Abyss', 20], ['Kelp', 16], ['Bone', 16], ['Furnace', 12], ['Nacre', 10]],
  Growth: [['Sparse', 30], ['Bushy', 45], ['Dense', 25]],
  Seeds: [['Single', 45], ['Few', 35], ['Ring', 20]],
  Shape: [['Disc', 35], ['Fan', 25], ['Square', 20], ['Crescent', 20]],
  Taper: [['Fine', 30], ['Classic', 50], ['Heavy', 20]],
} as const

type TraitName = keyof typeof TRAITS
type Features = { [K in TraitName]: typeof TRAITS[K][number][0] }

function features(hash: string): Features {
  const r = stream(hash, 'features')
  return {
    Palette: weighted(r, TRAITS.Palette),
    Growth: weighted(r, TRAITS.Growth),
    Seeds: weighted(r, TRAITS.Seeds),
    Shape: weighted(r, TRAITS.Shape),
    Taper: weighted(r, TRAITS.Taper),
  }
}

interface Palette {
  bg: string
  /** Root to tip. */
  ramp: readonly string[]
  polyp: string
  dust: string
  /** Drop shadow under the branches, and the glow behind the shape. */
  shadow: string
  glow: string
}

const PAL: Record<Features['Palette'], Palette> = {
  Reef: { bg: '#f3ebe0', ramp: ['#4a1f2e', '#9c3242', '#d9604e', '#f0a07a'], polyp: '#2c6e6a', dust: '#cdb9a2', shadow: '#5a3a2a', glow: '#fbf5ec' },
  Abyss: { bg: '#0a1322', ramp: ['#2f6690', '#2a8aa6', '#45c1b2', '#c4f6dc'], polyp: '#f2fff6', dust: '#1f3a57', shadow: '#000000', glow: '#13284a' },
  Kelp: { bg: '#ebe8d6', ramp: ['#1d3a2b', '#3d6a3a', '#7f9b48', '#c8c46b'], polyp: '#c8692a', dust: '#c9c4a6', shadow: '#3a3a20', glow: '#f6f3e4' },
  Bone: { bg: '#efe9de', ramp: ['#1b1a18', '#35332f', '#5f5b54', '#948f85'], polyp: '#b2392a', dust: '#cfc8bb', shadow: '#3a3530', glow: '#f9f5ee' },
  Furnace: { bg: '#14110f', ramp: ['#94301b', '#c04a24', '#e47a3c', '#f6c86c'], polyp: '#fff0c4', dust: '#3a2a22', shadow: '#000000', glow: '#2e1a12' },
  Nacre: { bg: '#f4f0ec', ramp: ['#4b3f6b', '#8a6fa6', '#d28fae', '#f2c9bd'], polyp: '#4b3f6b', dust: '#ddd3d4', shadow: '#4b3f6b', glow: '#fdfaf6' },
}

// Attractor count, step length, influence and kill radii (canvas short side = 1).
const GROWTH: Record<Features['Growth'], { n: number, step: number, di: number, dk: number }> = {
  Sparse: { n: 420, step: 0.0095, di: 0.15, dk: 0.026 },
  Bushy: { n: 1200, step: 0.0072, di: 0.1, dk: 0.017 },
  Dense: { n: 2600, step: 0.0056, di: 0.075, dk: 0.012 },
}

// Pipe-model width: min + (max - min) * (leaves / maxLeaves) ^ (1 / exponent).
const TAPER: Record<Features['Taper'], { min: number, max: number, exp: number, polyp: number }> = {
  Fine: { min: 0.0011, max: 0.0075, exp: 2.6, polyp: 0.0028 },
  Classic: { min: 0.0013, max: 0.015, exp: 2.1, polyp: 0.0034 },
  Heavy: { min: 0.0017, max: 0.027, exp: 1.7, polyp: 0.004 },
}

const POLYP_SCALE: Record<Features['Growth'], number> = { Sparse: 1.35, Bushy: 1, Dense: 0.8 }

const LO = 0.07
const HI = 0.93
const MAX_NODES = 24000
const MAX_ITER = 700

type Inside = (x: number, y: number) => boolean

function makeShape(shape: Features['Shape'], r: Rng): { inside: Inside, base: number } {
  const box = (x: number, y: number) => x > LO && x < HI && y > LO && y < HI
  const down = Math.PI / 2
  if (shape === 'Disc') {
    const R2 = 0.41 ** 2
    return { inside: (x, y) => (x - 0.5) ** 2 + (y - 0.5) ** 2 < R2, base: down + range(r, -0.35, 0.35) }
  }
  if (shape === 'Fan') {
    const cx = 0.5
    const cy = 0.9
    const half = range(r, 0.62, 0.86)
    const R = 0.8
    return {
      inside: (x, y) => {
        const dx = x - cx
        const dy = y - cy
        const d = Math.hypot(dx, dy)
        return box(x, y) && d < R && d > 0.02 && Math.abs(Math.atan2(dx, -dy)) < half
      },
      base: down,
    }
  }
  if (shape === 'Square')
    return { inside: (x, y) => x > 0.11 && x < 0.89 && y > 0.11 && y < 0.89, base: down + range(r, -0.2, 0.2) }
  // Crescent: a disc with a smaller disc bitten out of it.
  const bite = range(r, 0, Math.PI * 2)
  const bx = 0.5 + Math.cos(bite) * 0.19
  const by = 0.5 + Math.sin(bite) * 0.19
  return {
    inside: (x, y) => (x - 0.5) ** 2 + (y - 0.5) ** 2 < 0.39 ** 2 && (x - bx) ** 2 + (y - by) ** 2 > 0.28 ** 2,
    base: bite + Math.PI,
  }
}

/** Point just inside the shape boundary, seen from (cx, cy) in direction a. */
function boundary(inside: Inside, cx: number, cy: number, a: number): [number, number] {
  const ux = Math.cos(a)
  const uy = Math.sin(a)
  for (let t = 0.75; t > 0; t -= 0.002) {
    const x = cx + ux * t
    const y = cy + uy * t
    if (inside(x, y))
      return [x - ux * 0.012, y - uy * 0.012]
  }
  return [cx, cy]
}

function mix(a: string, b: string, t: number): string {
  const pa = Number.parseInt(a.slice(1), 16)
  const pb = Number.parseInt(b.slice(1), 16)
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t)
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`
}

function rampColor(ramp: readonly string[], t: number): string {
  const x = Math.min(0.9999, Math.max(0, t)) * (ramp.length - 1)
  const i = Math.floor(x)
  return mix(ramp[i], ramp[i + 1], x - i)
}

function render(g: CanvasRenderingContext2D, W: number, H: number, hash: string) {
  const f = features(hash)
  const pal = PAL[f.Palette]
  const gr = GROWTH[f.Growth]
  const tp = TAPER[f.Taper]
  const S = Math.min(W, H)
  const ox = (W - S) / 2
  const oy = (H - S) / 2

  // Fixed stream order: shape, growth, then drawing.
  const sr = stream(hash, 'shape')
  const rr = stream(hash, 'growth')
  const cr = stream(hash, 'color')

  const shape = makeShape(f.Shape, sr)
  const base = shape.base

  // --- attractors, on a grid of cell size di -------------------------------
  const N = gr.n
  const ax = new Float64Array(N)
  const ay = new Float64Array(N)
  let na = 0
  for (let tries = 0; na < N && tries < N * 60; tries++) {
    const x = range(rr, LO, HI)
    const y = range(rr, LO, HI)
    if (shape.inside(x, y)) {
      ax[na] = x
      ay[na] = y
      na++
    }
  }
  let cx = 0
  let cy = 0
  for (let i = 0; i < na; i++) {
    cx += ax[i] / na
    cy += ay[i] / na
  }
  // Recentre the mass of the shape (a crescent or a fan is lopsided), then
  // drop whatever the shift pushed past the margin.
  const sx = 0.5 - cx
  const sy = 0.5 - cy
  const inside: Inside = (x, y) => x > LO && x < HI && y > LO && y < HI && shape.inside(x - sx, y - sy)
  let kept = 0
  for (let i = 0; i < na; i++) {
    const x = ax[i] + sx
    const y = ay[i] + sy
    if (inside(x, y)) {
      ax[kept] = x
      ay[kept] = y
      kept++
    }
  }
  na = kept
  cx = 0.5
  cy = 0.5
  const cell = gr.di
  const G = Math.ceil(1 / cell)
  const grid: number[][] = Array.from({ length: G * G }, () => [])
  const gi = (v: number) => Math.min(G - 1, Math.max(0, Math.floor(v / cell)))
  for (let i = 0; i < na; i++)
    grid[gi(ay[i]) * G + gi(ax[i])].push(i)
  const alive = new Uint8Array(na).fill(1)
  const closest = new Int32Array(na).fill(-1)
  const closestD = new Float64Array(na).fill(Infinity)
  let nAlive = na

  // --- nodes ---------------------------------------------------------------
  const nx = new Float64Array(MAX_NODES)
  const ny = new Float64Array(MAX_NODES)
  const parent = new Int32Array(MAX_NODES)
  const depth = new Int32Array(MAX_NODES)
  const tree = new Int32Array(MAX_NODES)
  const kids = new Int32Array(MAX_NODES)
  const lastDx = new Float64Array(MAX_NODES)
  const lastDy = new Float64Array(MAX_NODES)
  let nn = 0
  const di2 = gr.di * gr.di
  const dk2 = gr.dk * gr.dk

  function addNode(x: number, y: number, p: number, t: number) {
    const id = nn++
    nx[id] = x
    ny[id] = y
    parent[id] = p
    depth[id] = p < 0 ? 0 : depth[p] + 1
    tree[id] = t
    if (p >= 0)
      kids[p]++
    const c0 = gi(x)
    const r0 = gi(y)
    for (let r = Math.max(0, r0 - 1); r <= Math.min(G - 1, r0 + 1); r++) {
      for (let c = Math.max(0, c0 - 1); c <= Math.min(G - 1, c0 + 1); c++) {
        for (const a of grid[r * G + c]) {
          if (!alive[a])
            continue
          const d2 = (ax[a] - x) ** 2 + (ay[a] - y) ** 2
          if (d2 < dk2) {
            alive[a] = 0
            nAlive--
          }
          else if (d2 < di2 && d2 < closestD[a]) {
            closestD[a] = d2
            closest[a] = id
          }
        }
      }
    }
  }

  // --- seeds -----------------------------------------------------------------
  const angles: number[] = []
  if (f.Seeds === 'Single') {
    angles.push(base)
  }
  else if (f.Seeds === 'Few') {
    const k = int(sr, 2, 4)
    const spread = range(sr, 1.1, 1.9)
    for (let i = 0; i < k; i++)
      angles.push(base + spread * (i / (k - 1) - 0.5) + range(sr, -0.12, 0.12))
  }
  else {
    const k = int(sr, 5, 9)
    const off = range(sr, 0, Math.PI * 2)
    for (let i = 0; i < k; i++)
      angles.push(off + (i / k) * Math.PI * 2)
  }
  const seedTip: number[] = []
  const seedLive: boolean[] = []
  angles.forEach((a, t) => {
    const [x, y] = boundary(inside, cx, cy, a)
    seedTip.push(nn)
    seedLive.push(false)
    addNode(x, y, -1, t)
  })

  // --- growth ------------------------------------------------------------------
  const sumX = new Float64Array(MAX_NODES)
  const sumY = new Float64Array(MAX_NODES)
  const cnt = new Int32Array(MAX_NODES)
  const touched: number[] = []
  const wobble = 0.22
  for (let it = 0; it < MAX_ITER && nAlive > 0 && nn < MAX_NODES - 64; it++) {
    touched.length = 0
    for (let a = 0; a < na; a++) {
      const n = closest[a]
      if (!alive[a] || n < 0)
        continue
      const d = Math.sqrt(closestD[a])
      if (cnt[n] === 0)
        touched.push(n)
      sumX[n] += (ax[a] - nx[n]) / d
      sumY[n] += (ay[a] - ny[n]) / d
      cnt[n]++
    }
    let grown = 0
    for (const n of touched) {
      seedLive[tree[n]] = true
      let dx = sumX[n]
      let dy = sumY[n]
      const len = Math.hypot(dx, dy)
      sumX[n] = 0
      sumY[n] = 0
      const c = cnt[n]
      cnt[n] = 0
      const jitter = gaussian(rr) * wobble
      if (len < 0.15 * c)
        continue
      const ang = Math.atan2(dy, dx) + jitter
      dx = Math.cos(ang)
      dy = Math.sin(ang)
      // a node never sprouts twice in (almost) the same direction
      if (kids[n] > 0 && dx * lastDx[n] + dy * lastDy[n] > 0.985)
        continue
      lastDx[n] = dx
      lastDy[n] = dy
      addNode(nx[n] + dx * gr.step, ny[n] + dy * gr.step, n, tree[n])
      grown++
      if (nn >= MAX_NODES - 64)
        break
    }
    // seeds that no attractor reaches yet push a trunk towards the centre
    for (let t = 0; t < seedTip.length; t++) {
      if (seedLive[t])
        continue
      const n = seedTip[t]
      const a = Math.atan2(cy - ny[n], cx - nx[n])
      seedTip[t] = nn
      addNode(nx[n] + Math.cos(a) * gr.step, ny[n] + Math.sin(a) * gr.step, n, t)
      grown++
    }
    if (grown === 0)
      break
  }

  // --- pipe model --------------------------------------------------------------
  const leaves = new Float64Array(nn)
  for (let i = nn - 1; i >= 0; i--) {
    if (kids[i] === 0)
      leaves[i] = 1
    if (parent[i] >= 0)
      leaves[parent[i]] += leaves[i]
  }
  let maxLeaves = 1
  let maxDepth = 1
  for (let i = 0; i < nn; i++) {
    maxLeaves = Math.max(maxLeaves, leaves[i])
    maxDepth = Math.max(maxDepth, depth[i])
  }

  // --- drawing -----------------------------------------------------------------
  g.globalAlpha = 1
  g.fillStyle = pal.bg
  g.fillRect(0, 0, W, H)
  const glow = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, S * 0.62)
  glow.addColorStop(0, pal.glow)
  glow.addColorStop(1, pal.bg)
  g.fillStyle = glow
  g.fillRect(0, 0, W, H)
  const X = (x: number) => ox + x * S
  const Y = (y: number) => oy + y * S

  // unreached attractors stay as drifting dust
  g.fillStyle = pal.dust
  g.beginPath()
  const dustR = 0.0015 * S
  for (let a = 0; a < na; a++) {
    if (!alive[a])
      continue
    g.moveTo(X(ax[a]) + dustR, Y(ay[a]))
    g.arc(X(ax[a]), Y(ay[a]), dustR, 0, Math.PI * 2)
  }
  g.fill()

  // segments bucketed by (width, colour) so each bucket is one path
  const WB = 24
  const CB = 18
  const buckets: number[][] = Array.from({ length: WB * CB }, () => [])
  const hueShift = range(cr, -0.06, 0.06)
  for (let i = 0; i < nn; i++) {
    const p = parent[i]
    if (p < 0)
      continue
    const wt = (leaves[i] / maxLeaves) ** (1 / tp.exp)
    const wb = Math.min(WB - 1, Math.round(wt * (WB - 1)))
    const ct = depth[i] / maxDepth + hueShift
    const cb = Math.min(CB - 1, Math.max(0, Math.round(ct * (CB - 1))))
    buckets[wb * CB + cb].push(nx[p], ny[p], nx[i], ny[i])
  }
  g.lineCap = 'round'
  g.lineJoin = 'round'
  const widthOf = (wb: number) => (tp.min + (tp.max - tp.min) * (wb / (WB - 1))) * S
  const path = (seg: number[], dx: number, dy: number) => {
    g.beginPath()
    for (let k = 0; k < seg.length; k += 4) {
      g.moveTo(X(seg[k]) + dx, Y(seg[k + 1]) + dy)
      g.lineTo(X(seg[k + 2]) + dx, Y(seg[k + 3]) + dy)
    }
  }

  // soft drop shadow, one colour
  g.strokeStyle = pal.shadow
  g.globalAlpha = 0.16
  for (let wb = WB - 1; wb >= 0; wb--) {
    g.lineWidth = widthOf(wb) * 1.15
    for (let cb = 0; cb < CB; cb++) {
      const seg = buckets[wb * CB + cb]
      if (seg.length) {
        path(seg, 0.0035 * S, 0.0045 * S)
        g.stroke()
      }
    }
  }
  g.globalAlpha = 1

  for (let wb = WB - 1; wb >= 0; wb--) {
    const w = widthOf(wb)
    for (let cb = 0; cb < CB; cb++) {
      const seg = buckets[wb * CB + cb]
      if (!seg.length)
        continue
      g.strokeStyle = rampColor(pal.ramp, cb / (CB - 1))
      g.lineWidth = w
      path(seg, 0, 0)
      g.stroke()
    }
  }

  // a lighter core along the thicker branches reads as a rounded tube
  g.globalAlpha = 0.3
  g.strokeStyle = '#ffffff'
  for (let wb = WB - 1; wb >= 6; wb--) {
    g.lineWidth = widthOf(wb) * 0.28
    for (let cb = 0; cb < CB; cb++) {
      const seg = buckets[wb * CB + cb]
      if (seg.length) {
        path(seg, -widthOf(wb) * 0.18, -widthOf(wb) * 0.18)
        g.stroke()
      }
    }
  }
  g.globalAlpha = 1

  // polyps on the tips
  const pr = tp.polyp * S * POLYP_SCALE[f.Growth]
  g.fillStyle = pal.polyp
  g.globalAlpha = 0.9
  g.beginPath()
  for (let i = 0; i < nn; i++) {
    if (kids[i] !== 0 || parent[i] < 0)
      continue
    const r = pr * range(cr, 0.7, 1.15)
    g.moveTo(X(nx[i]) + r, Y(ny[i]))
    g.arc(X(nx[i]), Y(ny[i]), r, 0, Math.PI * 2)
  }
  g.fill()
  g.globalAlpha = 1
}

export default {
  slug: 'coral',
  title: 'Coral',
  summary: 'Branches grown by space colonization towards points scattered in a shape, tapering from root to polyp.',
  order: 60,
  traits: TRAITS,
  features,
  render,
  // Seed-of-seeds 0xc0a1c0a1 ("gallery" stream): the first hash found for each
  // Palette x Shape pair, in the order found, except that the second one (Reef
  // sea fan, the archetype of the series) is moved first to serve as the cover.
  gallery: [
    '0xa504d2557181ea5b95d77e78c677495c2e9b8a582a066f34117beb24ea35cf6e',
    '0xa3c38f74cadd23e112725b2bfe992898acba88506711507c987292fe7d2537b9',
    '0x14d895e0881a8798a37c7718023c2ac18144cada00593a1bef914473aa9b923a',
    '0x03463dd6308d510950a01296d569dba55d8b099d679b2d81ff3084c16db709ed',
    '0x0b9b547a2620966392e1673f697b526c7bf58854614bac33066ef24e6121c0e8',
    '0x4641a6ffb123a13d4fdd336baaa744ab52e8858b9f35ffaba2895b1c22c5b788',
    '0xe5cd736c52fb07ccba3468298c6dbb60ecca0fc9f6d5c97c4fff36628b1db5f1',
    '0x3e228b3d1e10a582bd64d281e63a886c9d330899c84ab2fd2976a270edb89e77',
    '0xd69b1a0597f70d4c1ff806935208b8b6682916b21eb2a3cb85cb8a57160b2d98',
    '0x560044d18dbc5e570b99227e7d9bb83d24c90e06bbe476cc4c94d7c413e4355d',
    '0xd41c6da71c3c292e0089033a4cd4231d15969fb34d310f8efab00caed608b711',
    '0xd43edfca8ae77b2f9bb5f6616024c5556d0795277208036547a0a31f476cbbf8',
  ],
} satisfies Series
