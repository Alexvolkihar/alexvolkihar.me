// "Phyllotaxis" — flower heads grown from the golden angle.
//
// Every head follows H. Vogel's model of the sunflower capitulum ("A better
// way to construct the sunflower head", Mathematical Biosciences 44, 1979):
// floret n sits at angle n·α and radius c·√n, where α is the golden angle
// 360°·(2 − φ) ≈ 137.508°. The florets then lie on two families of crossing
// spirals (parastichies) whose counts are consecutive Fibonacci numbers.
// Here the radius exponent is allowed to drift above ½, so florets grow
// with their distance from the centre, and the angle itself can drift off
// golden, switch to the Lucas angle (≈ 99.502°, parastichies 4, 7, 11, 18…)
// or to a rational approximation of the golden angle, which breaks the
// spirals into straight spokes.
//
// The florets are drawn as seeds with a ring of ray petals (a sunflower),
// as overlapping petals (a dahlia or a succulent rosette), as scales (a
// pine cone), as the parastichy lattice itself, or as dots, on one head, a
// pair, a cluster or a whole field of heads.
//
// Everything is a pure function of the hash, and every length is a fraction
// of the canvas short side. The composition is laid out in a square centred
// on the canvas; wider or taller canvases show more of the background
// (a faint giant spiral, satellite heads or the rest of the field).

import type { Rng } from '../random'
import type { Series } from '../types'
import { range, stream, weighted } from '../random'

// ---------------------------------------------------------------------------
// Rarity table — decided before the drawing code, never reordered.
// Changing a weight or an order re-rolls the whole edition.
// ---------------------------------------------------------------------------

const TRAITS = {
  Palette: [['Sunflower', 22], ['Meadow', 18], ['Ink', 16], ['Verdigris', 16], ['Midnight', 16], ['Ember', 12]],
  Florets: [['Seeds', 28], ['Petals', 24], ['Scales', 18], ['Spirals', 16], ['Dots', 14]],
  Arrangement: [['Single', 40], ['Pair', 15], ['Cluster', 27], ['Field', 18]],
  Angle: [['Golden', 58], ['Drifting', 22], ['Lucas', 13], ['Spokes', 7]],
  Density: [['Loose', 25], ['Classic', 50], ['Packed', 25]],
} as const satisfies Record<string, ReadonlyArray<readonly [string, number]>>

type TraitName = keyof typeof TRAITS
type Features = { [K in TraitName]: typeof TRAITS[K][number][0] }

/** Pure function of the hash, computed before (and without) any rendering. */
function features(hash: string): Features {
  const r = stream(hash, 'features')
  return {
    Palette: weighted(r, TRAITS.Palette),
    Florets: weighted(r, TRAITS.Florets),
    Arrangement: weighted(r, TRAITS.Arrangement),
    Angle: weighted(r, TRAITS.Angle),
    Density: weighted(r, TRAITS.Density),
  }
}

// ---------------------------------------------------------------------------
// Palettes (original).
// ---------------------------------------------------------------------------

interface Palette {
  bg: string
  /** Base of the disc, seen between the florets. */
  ground: string
  /** Disc florets, centre to rim. */
  disc: readonly string[]
  /** Petals, inner to outer (ray petals, rosette petals). */
  ray: readonly string[]
  /** Second colour of the arm and ring patterns. */
  alt: string
  /** Outlines. */
  line: string
  pollen: string
  /** The faint background spiral. */
  ghost: string
  dark: boolean
}

const PAL: Record<Features['Palette'], Palette> = {
  Sunflower: { bg: '#efe4cc', ground: '#24160c', disc: ['#4b5a22', '#4a2c14', '#6e3f17', '#8f5a1f', '#b07a2a'], ray: ['#c9741a', '#e39a22', '#f2bf3c', '#f7d76a'], alt: '#e0a838', line: '#24160c', pollen: '#c9a253', ghost: '#8a6a35', dark: false },
  Meadow: { bg: '#dde3cb', ground: '#6b4a12', disc: ['#8a6414', '#c58a1d', '#e8b72f', '#f4d35e'], ray: ['#d7a7bd', '#ecd2dd', '#f9f1ee', '#ffffff'], alt: '#a9bd6e', line: '#4f5e3c', pollen: '#f3f4e6', ghost: '#71805a', dark: false },
  Ink: { bg: '#f1ede4', ground: '#0e0e10', disc: ['#3a3a3e', '#56565b', '#78777a', '#9d9b96'], ray: ['#1b1b1e', '#38383c', '#6a6966', '#a8a398'], alt: '#c23b22', line: '#121214', pollen: '#bdb6a8', ghost: '#6b6760', dark: false },
  Verdigris: { bg: '#e8e1cf', ground: '#12302f', disc: ['#173a3a', '#245a55', '#3f8577', '#79b39c', '#b8d6bf'], ray: ['#245a55', '#4f9480', '#9cc9ad', '#e3d6a4'], alt: '#c0683a', line: '#0f2626', pollen: '#b7c4a8', ghost: '#4f7a6c', dark: false },
  Midnight: { bg: '#0c0f1d', ground: '#151b36', disc: ['#1d2a55', '#2e4a8c', '#5a82c8', '#9dbcec', '#e2ecff'], ray: ['#2e4a8c', '#6d8fd6', '#b8cdf2', '#f2f6ff'], alt: '#f0c66a', line: '#060812', pollen: '#34436e', ghost: '#8aa2dc', dark: true },
  Ember: { bg: '#140e0c', ground: '#2a120c', disc: ['#4a140e', '#8a2614', '#c4471c', '#e8792e', '#f6b552'], ray: ['#8a2614', '#d2562a', '#f09a44', '#f8d38a'], alt: '#f7e3b8', line: '#0a0605', pollen: '#5a2a1a', ghost: '#e07a3a', dark: true },
}

// ---------------------------------------------------------------------------
// Geometry tables (canvas short side = 1).
// ---------------------------------------------------------------------------

const PHI = (1 + Math.sqrt(5)) / 2
const DEG = Math.PI / 180
const GOLDEN = 360 * (2 - PHI)
const LUCAS = 360 / (PHI + 2)
/** Rational approximations of the golden turn: 21, 34 or 55 straight spokes. */
const SPOKES = [[8, 21], [13, 34], [21, 55]] as const

const FIB = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233]
const LUC = [1, 3, 4, 7, 11, 18, 29, 47, 76, 123, 199]

/** Outer radius of a head over the radius of its disc of florets. */
const OUTER: Record<Features['Florets'], number> = { Seeds: 1.5, Petals: 1.1, Scales: 1.06, Spirals: 1.02, Dots: 1.05 }

/** Spacing of the florets at the rim of a head of disc radius 0.3. */
const SPACING: Record<Features['Density'], number> = { Loose: 0.03, Classic: 0.0215, Packed: 0.0158 }

/** Florets that overlap (petals, scales) need fewer, larger elements to read. */
const SPREAD: Record<Features['Florets'], number> = { Seeds: 1, Petals: 1.35, Scales: 1.12, Spirals: 1.05, Dots: 1 }

/** Radius exponent (½ is Vogel's uniform density); above ½ florets grow outwards. */
const EXPONENT: Record<Features['Florets'], readonly [number, number]> = {
  Seeds: [0.5, 0.56],
  Petals: [0.6, 0.7],
  Scales: [0.52, 0.6],
  Spirals: [0.5, 0.56],
  Dots: [0.5, 0.64],
}

// ---------------------------------------------------------------------------
// Colour helpers.
// ---------------------------------------------------------------------------

type RGB = readonly [number, number, number]

function hex(c: string): RGB {
  const v = Number.parseInt(c.slice(1), 16)
  return [v >> 16, (v >> 8) & 255, v & 255]
}

function mixRGB(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

function css(c: RGB, k = 1): string {
  const f = (x: number) => Math.max(0, Math.min(255, Math.round(x * k)))
  return `rgb(${f(c[0])},${f(c[1])},${f(c[2])})`
}

function ramp(stops: readonly RGB[], t: number): RGB {
  const x = Math.min(0.9999, Math.max(0, t)) * (stops.length - 1)
  const i = Math.floor(x)
  return mixRGB(stops[i], stops[i + 1], x - i)
}

/** Integer hash of (seed, n) in [0, 1): per-floret jitter that consumes no stream. */
function noise(seed: number, n: number): number {
  let h = seed ^ Math.imul(n + 0x3C6EF372, 0x9E3779B1)
  h = Math.imul(h ^ (h >>> 15), 0x85EBCA6B)
  h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

// ---------------------------------------------------------------------------
// Layout.
// ---------------------------------------------------------------------------

interface Slot {
  x: number
  y: number
  /** Outer radius, petals included. */
  ro: number
}

function fits(slots: Slot[], x: number, y: number, ro: number, gap: number): boolean {
  return slots.every(s => Math.hypot(s.x - x, s.y - y) >= s.ro + ro + gap)
}

function layout(arr: Features['Arrangement'], r: Rng): Slot[] {
  const slots: Slot[] = []
  if (arr === 'Single') {
    slots.push({ x: range(r, -0.025, 0.025), y: range(r, -0.025, 0.025), ro: range(r, 0.39, 0.43) })
    return slots
  }
  if (arr === 'Pair') {
    const ro1 = range(r, 0.27, 0.3)
    const ro2 = range(r, 0.17, 0.2)
    const quadrant = Math.floor(r() * 4)
    const a = (45 + 90 * quadrant) * DEG + range(r, -0.28, 0.28)
    const span = 2 * ro1 + 2 * ro2 + range(r, -0.02, 0.01)
    const ux = Math.cos(a)
    const uy = Math.sin(a)
    const d1 = -span / 2 + ro1
    const d2 = span / 2 - ro2
    slots.push({ x: ux * d1, y: uy * d1, ro: ro1 }, { x: ux * d2, y: uy * d2, ro: ro2 })
    // keep both inside the square
    for (const s of slots) {
      s.x = Math.max(-0.48 + s.ro, Math.min(0.48 - s.ro, s.x))
      s.y = Math.max(-0.48 + s.ro, Math.min(0.48 - s.ro, s.y))
    }
    return slots
  }
  if (arr === 'Cluster') {
    slots.push({ x: range(r, -0.09, 0.09), y: range(r, -0.09, 0.09), ro: range(r, 0.2, 0.26) })
    for (let i = 0; i < 300; i++) {
      const ro = 0.055 + 0.15 * r() ** 1.5
      const x = range(r, -0.475 + ro, 0.475 - ro)
      const y = range(r, -0.475 + ro, 0.475 - ro)
      if (slots.length < 9 && fits(slots, x, y, ro, 0.012))
        slots.push({ x, y, ro })
    }
    // Satellites outside the square: only wide or tall canvases show them.
    for (let i = 0; i < 500; i++) {
      const ro = 0.05 + 0.14 * r() ** 1.5
      const x = range(r, -1.3, 1.3)
      const y = range(r, -1.3, 1.3)
      if (Math.max(Math.abs(x), Math.abs(y)) - ro >= 0.5 && fits(slots, x, y, ro, 0.015))
        slots.push({ x, y, ro })
    }
    return slots
  }
  // Field: the square first, then the rest of the plane, large heads first.
  const phase = (n: number, half: number, big: number) => {
    for (let i = 0; i < n; i++) {
      const k = i / n
      const ro = Math.max(0.045, big * (1 - k) ** 1.4 + 0.04 * r())
      const x = range(r, -half, half)
      const y = range(r, -half, half)
      if (fits(slots, x, y, ro, 0.006))
        slots.push({ x, y, ro })
    }
  }
  phase(420, 0.5, 0.2)
  phase(900, 1.3, 0.17)
  return slots
}

// ---------------------------------------------------------------------------
// Heads.
// ---------------------------------------------------------------------------

interface Head {
  x: number
  y: number
  R: number
  N: number
  p: number
  /** Divergence angle (radians, signed: the sign is the chirality). */
  alpha: number
  rot: number
  /** Colour mode: radial ramp, alternating arms or concentric rings. */
  mode: 'ramp' | 'arms' | 'rings'
  /** Arm rank of each residue n mod F, for the arm colouring. */
  rank: Int32Array
  F: number
  rings: number
  seed: number
  /** Ray petals (Seeds only). */
  rays: number
}

function makeHead(slot: Slot, f: Features, alphaDeg: number, armSet: readonly number[], fixedF: number, hash: string, i: number): Head {
  const r = stream(hash, `head-${i}`)
  const R = slot.ro / OUTER[f.Florets]
  const [plo, phi] = EXPONENT[f.Florets]
  const p = range(r, plo, phi)
  // smaller heads get finer florets, but not proportionally finer: a field
  // of small heads stays within the drawing budget
  const field = f.Arrangement === 'Field' ? 1.2 : 1
  const d = SPACING[f.Density] * SPREAD[f.Florets] * field * (R / 0.3) ** 0.45
  const N = Math.max(70, Math.min(2600, Math.round(2 * Math.PI * p * (R / d) ** 2)))
  const chir = r() < 0.5 ? 1 : -1
  const rot = r() * Math.PI * 2
  const m = r()
  const mode = m < 0.45 ? 'ramp' : m < 0.82 ? 'arms' : 'rings'
  // the arm count most visible at the rim
  const target = Math.sqrt(N) * range(r, 0.75, 1.35)
  let F = armSet[0]
  for (const k of armSet) {
    if (Math.abs(k - target) < Math.abs(F - target))
      F = k
  }
  if (fixedF)
    F = fixedF
  const rings = 3 + Math.floor(r() * 5)
  const seed = Math.floor(r() * 4294967296) | 0
  const rays = Math.max(13, Math.min(55, FIB.reduce((b, k) => Math.abs(k - Math.sqrt(N) * 1.25) < Math.abs(b - Math.sqrt(N) * 1.25) ? k : b, 13)))
  const alpha = alphaDeg * DEG * chir
  // rank of arm j around the circle, so that neighbouring arms alternate
  const order = Array.from({ length: F }, (_, j) => j)
  const ang = (j: number) => ((j * alpha + 1000 * Math.PI) % (2 * Math.PI))
  order.sort((a, b) => ang(a) - ang(b))
  const rank = new Int32Array(F)
  order.forEach((j, k) => {
    rank[j] = k
  })
  return { x: slot.x, y: slot.y, R, N, p, alpha, rot, mode, rank, F, rings, seed, rays }
}

// ---------------------------------------------------------------------------
// Render.
// ---------------------------------------------------------------------------

function render(ctx: CanvasRenderingContext2D, width: number, height: number, hash: string): void {
  const f = features(hash)
  const pal = PAL[f.Palette]

  // Fixed stream order: angle, layout, heads (one stream each), background.
  const ar = stream(hash, 'angle')
  let alphaDeg = GOLDEN
  let armSet: readonly number[] = FIB
  let fixedF = 0
  const drift = range(ar, 0.18, 0.55) * (ar() < 0.5 ? -1 : 1)
  const spoke = SPOKES[Math.floor(ar() * SPOKES.length)]
  if (f.Angle === 'Drifting') {
    alphaDeg = GOLDEN + drift
  }
  else if (f.Angle === 'Lucas') {
    alphaDeg = LUCAS
    armSet = LUC
  }
  else if (f.Angle === 'Spokes') {
    alphaDeg = (360 * spoke[0]) / spoke[1]
    fixedF = spoke[1]
  }

  const slots = layout(f.Arrangement, stream(hash, 'layout'))
  const heads = slots.map((s, i) => makeHead(s, f, alphaDeg, armSet, fixedF, hash, i))

  const S = Math.min(width, height)
  const hw = width / (2 * S)
  const hh = height / (2 * S)
  const px = 1 / S

  ctx.save()
  ctx.setTransform(S, 0, 0, S, width / 2, height / 2)

  // --- background ----------------------------------------------------------
  const bg = hex(pal.bg)
  ctx.fillStyle = pal.bg
  ctx.fillRect(-hw - 1, -hh - 1, 2 * hw + 2, 2 * hh + 2)
  const vr = Math.hypot(hw, hh)
  const vig = ctx.createRadialGradient(0, 0, 0.1, 0, 0, vr)
  vig.addColorStop(0, css(bg, pal.dark ? 1.35 : 1.03))
  vig.addColorStop(1, css(bg, pal.dark ? 0.8 : 0.9))
  ctx.fillStyle = vig
  ctx.fillRect(-hw - 1, -hh - 1, 2 * hw + 2, 2 * hh + 2)

  const br = stream(hash, 'background')
  const visible = (x: number, y: number, m: number) => Math.abs(x) - m < hw && Math.abs(y) - m < hh

  // A giant faint spiral around the main head fills any aspect ratio.
  if (f.Arrangement !== 'Field') {
    const h0 = heads[0]
    const gd = 0.026
    const gR = 1.75
    const gN = Math.round(Math.PI * (gR / gd) ** 2)
    const gs = range(br, 0.0022, 0.0034)
    ctx.beginPath()
    for (let n = Math.round(Math.PI * ((h0.R * OUTER[f.Florets] + 0.03) / gd) ** 2); n < gN; n++) {
      const rr = gd * Math.sqrt(n / Math.PI)
      const a = n * h0.alpha + h0.rot
      const x = h0.x + rr * Math.cos(a)
      const y = h0.y + rr * Math.sin(a)
      if (!visible(x, y, 0.01))
        continue
      const s = gs * (0.6 + 0.8 * Math.min(1, rr / 1.2))
      ctx.moveTo(x + s, y)
      ctx.arc(x, y, s, 0, Math.PI * 2)
    }
    ctx.fillStyle = pal.ghost
    ctx.globalAlpha = pal.dark ? 0.22 : 0.2
    ctx.fill()
    ctx.globalAlpha = 1
  }
  else {
    br()
  }

  // Pollen grains scattered over the whole plane.
  ctx.beginPath()
  for (let i = 0; i < 900; i++) {
    const x = range(br, -1.3, 1.3)
    const y = range(br, -1.3, 1.3)
    const s = 0.0012 + 0.003 * br() ** 3
    if (!visible(x, y, s))
      continue
    ctx.moveTo(x + s, y)
    ctx.arc(x, y, s, 0, Math.PI * 2)
  }
  ctx.fillStyle = pal.pollen
  ctx.globalAlpha = 0.55
  ctx.fill()
  ctx.globalAlpha = 1

  // --- heads ---------------------------------------------------------------
  const disc = pal.disc.map(hex)
  const ray = pal.ray.map(hex)
  const alt = hex(pal.alt)
  const ground = hex(pal.ground)
  const line = hex(pal.line)
  const shadowRGB = pal.dark ? [0, 0, 0] as const : mixRGB(line, bg, 0.35)

  for (const h of heads) {
    const ro = h.R * OUTER[f.Florets]
    if (!visible(h.x, h.y, ro * 1.1))
      continue
    // soft shadow, light from the upper left
    const sx = h.x + ro * 0.05
    const sy = h.y + ro * 0.07
    const sg = ctx.createRadialGradient(sx, sy, ro * 0.6, sx, sy, ro * 1.12)
    sg.addColorStop(0, `rgba(${shadowRGB.map(Math.round).join(',')},${pal.dark ? 0.55 : 0.28})`)
    sg.addColorStop(1, `rgba(${shadowRGB.map(Math.round).join(',')},0)`)
    ctx.fillStyle = sg
    ctx.beginPath()
    ctx.arc(sx, sy, ro * 1.12, 0, Math.PI * 2)
    ctx.fill()
    drawHead(ctx, h, f.Florets, { disc, ray, alt, ground, line, bg, dark: pal.dark }, px)
  }

  ctx.restore()
}

interface Colours {
  disc: RGB[]
  ray: RGB[]
  alt: RGB
  ground: RGB
  line: RGB
  bg: RGB
  dark: boolean
}

function drawHead(ctx: CanvasRenderingContext2D, h: Head, kind: Features['Florets'], c: Colours, px: number): void {
  const { N, R, p } = h
  const xs = new Float64Array(N)
  const ys = new Float64Array(N)
  const rs = new Float64Array(N)
  const ds = new Float64Array(N)
  const k0 = Math.sqrt(2 * Math.PI * p)
  for (let n = 0; n < N; n++) {
    const t = (n + 0.5) / N
    const r = R * t ** p
    const a = n * h.alpha + h.rot
    xs[n] = h.x + r * Math.cos(a)
    ys[n] = h.y + r * Math.sin(a)
    rs[n] = r / R
    // local spacing of the florets around floret n
    ds[n] = (k0 * R * t ** p) / Math.sqrt(n + 0.5)
  }
  const dRim = ds[N - 1]

  // colour of floret n, from a stop ramp
  const colourAt = (n: number, stops: readonly RGB[], shade = 1): string => {
    const t = Math.round(rs[n] * 18) / 18
    let col = ramp(stops, t)
    const m = h.mode
    if (m === 'arms' && h.rank[n % h.F] % 2 === 1)
      col = mixRGB(col, c.alt, 0.5)
    else if (m === 'rings' && Math.floor(rs[n] * h.rings * 1.0001) % 2 === 1)
      col = mixRGB(col, c.alt, 0.42)
    const j = noise(h.seed, n)
    const k = j < 0.2 ? 0.9 : j > 0.85 ? 1.08 : 1
    return css(col, k * shade)
  }

  // Path2D batches: one fill per colour when florets do not overlap.
  const batches = new Map<string, Path2D>()
  const batch = (key: string) => {
    let b = batches.get(key)
    if (!b) {
      b = new Path2D()
      batches.set(key, b)
    }
    return b
  }
  const flush = () => {
    for (const [col, path] of batches) {
      ctx.fillStyle = col
      ctx.fill(path)
    }
    batches.clear()
  }

  const dir = (n: number): [number, number] => {
    const dx = xs[n] - h.x
    const dy = ys[n] - h.y
    const l = Math.hypot(dx, dy) || 1
    return [dx / l, dy / l]
  }

  if (kind === 'Seeds') {
    // ray petals behind the disc, two rows
    const K = h.rays
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < K; i++) {
        const j = noise(h.seed ^ 0x51ED, i + row * 97)
        const a = h.rot + ((i + row * 0.5) / K) * Math.PI * 2 + (j - 0.5) * 0.12
        const ux = Math.cos(a)
        const uy = Math.sin(a)
        const L = R * (row === 0 ? 0.56 : 0.46) * (0.88 + 0.24 * j)
        const W = ((Math.PI * 2 * R) / K) * (row === 0 ? 0.62 : 0.55)
        const b0 = R * 0.86
        petal(ctx, h.x + ux * b0, h.y + uy * b0, ux, uy, L, W, 0.4)
        const col = ramp(c.ray, row === 0 ? 0.25 + 0.3 * j : 0.55 + 0.45 * j)
        ctx.fillStyle = css(col, row === 0 ? 0.88 : 1)
        ctx.fill()
        // midrib
        ctx.beginPath()
        ctx.moveTo(h.x + ux * (b0 + L * 0.1), h.y + uy * (b0 + L * 0.1))
        ctx.lineTo(h.x + ux * (b0 + L * 0.8), h.y + uy * (b0 + L * 0.8))
        ctx.strokeStyle = css(col, 0.82)
        ctx.lineWidth = Math.max(px, W * 0.05)
        ctx.stroke()
      }
    }
    ctx.beginPath()
    ctx.arc(h.x, h.y, R * 1.01, 0, Math.PI * 2)
    ctx.fillStyle = css(c.ground)
    ctx.fill()
    for (let n = 0; n < N; n++) {
      const [ux, uy] = dir(n)
      const d = ds[n]
      const centre = rs[n] < 0.22
      const a = d * (centre ? 0.36 : 0.5)
      const b = d * (centre ? 0.3 : 0.3)
      const path = batch(colourAt(n, c.disc))
      path.moveTo(xs[n] + ux * a, ys[n] + uy * a)
      path.ellipse(xs[n], ys[n], a, b, Math.atan2(uy, ux), 0, Math.PI * 2)
    }
    flush()
    // a glint on each outer seed
    const glint = new Path2D()
    for (let n = Math.floor(N * 0.3); n < N; n++) {
      const d = ds[n]
      const [ux, uy] = dir(n)
      const s = d * 0.09
      const gx = xs[n] - ux * d * 0.16 - uy * d * 0.06
      const gy = ys[n] - uy * d * 0.16 + ux * d * 0.06
      glint.moveTo(gx + s, gy)
      glint.arc(gx, gy, s, 0, Math.PI * 2)
    }
    ctx.fillStyle = css(mixRGB(c.disc[c.disc.length - 1], [255, 255, 255], 0.4))
    ctx.globalAlpha = 0.35
    ctx.fill(glint)
    ctx.globalAlpha = 1
    return
  }

  if (kind === 'Petals') {
    // outermost first, so younger inner petals lie on top
    ctx.lineJoin = 'round'
    const stops = [c.disc[1], c.disc[2], ...c.ray]
    for (let n = N - 1; n >= 0; n--) {
      const [ux, uy] = dir(n)
      const d = ds[n]
      const t = rs[n]
      const L = d * (1.5 + 1.1 * t)
      const W = d * (0.95 + 0.25 * t)
      const bx = xs[n] - ux * L * 0.35
      const by = ys[n] - uy * L * 0.35
      petal(ctx, bx, by, ux, uy, L, W, 0.42)
      ctx.fillStyle = colourAt(n, stops)
      ctx.fill()
      ctx.strokeStyle = css(c.dark ? c.line : mixRGB(c.line, stops[0], 0.3))
      ctx.globalAlpha = 0.55
      ctx.lineWidth = Math.max(px * 0.8, d * 0.06)
      ctx.stroke()
      ctx.globalAlpha = 1
      // inner fold of the petal, lighter
      if (d > px * 3) {
        petal(ctx, bx + ux * L * 0.3, by + uy * L * 0.3, ux, uy, L * 0.62, W * 0.34, 0.5)
        ctx.fillStyle = css(mixRGB(ramp(stops, t), [255, 255, 255], 0.28))
        ctx.globalAlpha = 0.45
        ctx.fill()
        ctx.globalAlpha = 1
      }
    }
    return
  }

  if (kind === 'Scales') {
    ctx.beginPath()
    ctx.arc(h.x, h.y, R * 1.0, 0, Math.PI * 2)
    ctx.fillStyle = css(c.ground)
    ctx.fill()
    ctx.lineJoin = 'round'
    const edge = css(c.dark ? c.line : c.ground)
    // Rhombic scales, innermost first: each outer scale covers the inner tip
    // of the ones behind it, as on a pine cone seen from its base.
    for (let n = 0; n < N; n++) {
      const [ux, uy] = dir(n)
      const d = ds[n]
      const L = d * 1.45
      const W = d * 1.3
      const x = xs[n]
      const y = ys[n]
      const vx = -uy
      const vy = ux
      const ix = x - ux * L * 0.55
      const iy = y - uy * L * 0.55
      const ox = x + ux * L * 0.5
      const oy = y + uy * L * 0.5
      const lx = x + vx * W * 0.5 - ux * L * 0.05
      const ly = y + vy * W * 0.5 - uy * L * 0.05
      const rx = x - vx * W * 0.5 - ux * L * 0.05
      const ry = y - vy * W * 0.5 - uy * L * 0.05
      ctx.beginPath()
      ctx.moveTo(ix, iy)
      ctx.lineTo(lx, ly)
      ctx.quadraticCurveTo(ox + vx * W * 0.12, oy + vy * W * 0.12, ox, oy)
      ctx.quadraticCurveTo(ox - vx * W * 0.12, oy - vy * W * 0.12, rx, ry)
      ctx.closePath()
      const base = ramp(c.disc, rs[n])
      ctx.fillStyle = colourAt(n, c.disc, 0.82)
      ctx.fill()
      ctx.strokeStyle = edge
      ctx.lineWidth = Math.max(px * 0.8, d * 0.08)
      ctx.stroke()
      if (d < px * 3)
        continue
      // the exposed outer half catches the light; a ridge ends in the umbo
      ctx.beginPath()
      ctx.moveTo(lx * 0.7 + x * 0.3, ly * 0.7 + y * 0.3)
      ctx.quadraticCurveTo(ox + vx * W * 0.1, oy + vy * W * 0.1, ox * 0.92 + x * 0.08, oy * 0.92 + y * 0.08)
      ctx.quadraticCurveTo(ox - vx * W * 0.1, oy - vy * W * 0.1, rx * 0.7 + x * 0.3, ry * 0.7 + y * 0.3)
      ctx.quadraticCurveTo(x + ux * L * 0.12, y + uy * L * 0.12, lx * 0.7 + x * 0.3, ly * 0.7 + y * 0.3)
      ctx.fillStyle = colourAt(n, c.disc, 1.12)
      ctx.fill()
      ctx.beginPath()
      ctx.arc(x + ux * L * 0.28, y + uy * L * 0.28, d * 0.07, 0, Math.PI * 2)
      ctx.fillStyle = css(mixRGB(base, [255, 255, 255], 0.45))
      ctx.fill()
    }
    return
  }

  if (kind === 'Spirals') {
    // the parastichy lattice: each floret is joined to its two nearest
    // younger neighbours along the family offsets; segments are coloured by
    // the sense in which their spiral winds.
    const offsets = Array.from(new Set([...FIB, ...LUC, h.F])).sort((a, b) => a - b)
    const LEVELS = 6
    const paths: Path2D[][] = [[], []]
    for (let s = 0; s < 2; s++) {
      for (let l = 0; l < LEVELS; l++)
        paths[s].push(new Path2D())
    }
    for (let n = 0; n < N; n++) {
      // near the rim the true neighbours do not exist yet: no long chords
      const reach = (1.9 * ds[n]) ** 2
      let k1 = 0
      let d1 = reach
      for (const k of offsets) {
        if (n + k >= N)
          break
        const dd = (xs[n + k] - xs[n]) ** 2 + (ys[n + k] - ys[n]) ** 2
        if (dd < d1) {
          d1 = dd
          k1 = k
        }
      }
      if (!k1)
        continue
      const ax = xs[n + k1] - xs[n]
      const ay = ys[n + k1] - ys[n]
      let k2 = 0
      let d2 = reach
      for (const k of offsets) {
        if (n + k >= N)
          break
        if (k === k1)
          continue
        const bx = xs[n + k] - xs[n]
        const by = ys[n + k] - ys[n]
        const dd = bx * bx + by * by
        const sin = Math.abs(ax * by - ay * bx) / Math.sqrt(d1 * dd)
        if (sin > 0.5 && dd < d2) {
          d2 = dd
          k2 = k
        }
      }
      const [ux, uy] = dir(n)
      const level = Math.min(LEVELS - 1, Math.floor(rs[n] * LEVELS))
      for (const k of [k1, k2]) {
        if (!k)
          continue
        const bx = xs[n + k] - xs[n]
        const by = ys[n + k] - ys[n]
        const sense = bx * -uy + by * ux > 0 ? 0 : 1
        const path = paths[sense][level]
        path.moveTo(xs[n], ys[n])
        path.lineTo(xs[n + k], ys[n + k])
      }
    }
    ctx.lineCap = 'round'
    const colA = ramp(c.disc, c.dark ? 0.85 : 0.3)
    const colB = c.alt
    for (let s = 0; s < 2; s++) {
      for (let l = 0; l < LEVELS; l++) {
        const t = (l + 0.5) / LEVELS
        ctx.strokeStyle = css(mixRGB(s === 0 ? colA : colB, c.bg, 0.15 * (1 - t)))
        ctx.lineWidth = Math.max(px * 0.7, dRim * (0.07 + 0.13 * t))
        ctx.stroke(paths[s][l])
      }
    }
    for (let n = 0; n < N; n++) {
      const s = ds[n] * (0.12 + 0.14 * rs[n])
      const path = batch(colourAt(n, c.disc))
      path.moveTo(xs[n] + s, ys[n])
      path.arc(xs[n], ys[n], s, 0, Math.PI * 2)
    }
    flush()
    return
  }

  // Dots: size grows with the radius, a few rings in the accent colour.
  ctx.beginPath()
  ctx.arc(h.x, h.y, R * 1.03, 0, Math.PI * 2)
  ctx.fillStyle = css(mixRGB(c.ground, c.bg, c.dark ? 0.4 : 0.82))
  ctx.fill()
  const rings = new Path2D()
  for (let n = 0; n < N; n++) {
    const j = noise(h.seed ^ 0xD07, n)
    const s = ds[n] * (0.3 + 0.16 * rs[n]) * (0.85 + 0.3 * j)
    if (j < 0.07 && rs[n] > 0.25) {
      rings.moveTo(xs[n] + s * 0.85, ys[n])
      rings.arc(xs[n], ys[n], s * 0.85, 0, Math.PI * 2)
      continue
    }
    const path = batch(colourAt(n, c.disc))
    path.moveTo(xs[n] + s, ys[n])
    path.arc(xs[n], ys[n], s, 0, Math.PI * 2)
  }
  flush()
  ctx.strokeStyle = css(c.alt)
  ctx.lineWidth = Math.max(px, dRim * 0.07)
  ctx.stroke(rings)
}

/** Pointed petal from (bx, by) along (ux, uy): length L, width W, widest at `belly` of its length. */
function petal(ctx: CanvasRenderingContext2D, bx: number, by: number, ux: number, uy: number, L: number, W: number, belly: number): void {
  const vx = -uy
  const vy = ux
  const mx = bx + ux * L * belly
  const my = by + uy * L * belly
  const tx = bx + ux * L
  const ty = by + uy * L
  ctx.beginPath()
  ctx.moveTo(bx, by)
  ctx.bezierCurveTo(bx + vx * W * 0.5, by + vy * W * 0.5, mx + vx * W * 0.62, my + vy * W * 0.62, tx, ty)
  ctx.bezierCurveTo(mx - vx * W * 0.62, my - vy * W * 0.62, bx - vx * W * 0.5, by - vy * W * 0.5, bx, by)
  ctx.closePath()
}

export default {
  slug: 'phyllotaxis',
  title: 'Phyllotaxis',
  summary: 'Flower heads grown from the golden angle with Vogel\'s model: sunflowers, rosettes, pine cones and parastichy lattices.',
  order: 160,
  traits: TRAITS,
  features,
  render,
  // Seed-of-seeds 0x9b1d5eed ("gallery" stream, 64-hex candidates): the
  // first hash found for each Palette x Florets pair, twelve pairs; the
  // Midnight field of sunflowers is moved to the front as the cover.
  gallery: [
    '0xff99215103779cc0cea9e4e5385dd490ef6b6a087c4c14e9fd3699ede3a00482',
    '0x3941ae413e9c04a0fb06ce310d441226f9b98e9bc20f5572ae45b809188606b3',
    '0x462dc0ff34db4cf481f14b85a92198a0e23c6b1134ba4e1dcad5cba52febdca8',
    '0x47208e5bbc889ea13ffb81d346a83e913e5bbaad48756858f5d88b3e6b577fce',
    '0x3075ad6bd5e05b492247b8ddc1bcbfcedb5051e37909385f69fda1820d9a7499',
    '0x609fa64e6cc0754e775d9868988501f6ecfd69e85b55469e02bd6842dacca3ce',
    '0x441231ba838155e6e7795b4630d5b3f2f36d966080b1c4b8e0141fdceab3215a',
    '0xb6bf103a9e6413c54f5e61fbb17cc623815814bb396b2ba7bd7a1254fcfdbf72',
    '0x2fa6b1a66071a136c06f1cfad4c4ea977b7b9046a2023a1b7b40e0c4f1bee8e1',
    '0x6c091a18f8d07ac9cc105094c6cb25c61c8a882093b0a020c584ebac601227bf',
    '0xe82480879d03ad0801017f6f4e28fc23a2334a6215dad70cf8e560d4b8b990f9',
    '0xf08ee30e3c14f66b393817b5d83834d3f8b946c04970abd15513babb4125542c',
  ],
} satisfies Series
