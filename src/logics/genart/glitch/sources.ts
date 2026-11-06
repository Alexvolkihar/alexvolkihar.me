// Procedural source images for the "Glitch" series.
//
// Each source paints a clean picture with the Canvas 2D API on the working
// canvas: a sunset over the sea, soft gradients, a modernist poster, a night
// skyline or a television test card. Every length is a fraction of the short
// side `u`, the composition is centred, and backgrounds (sky, sea, bars)
// extend to the canvas edges so wide and tall canvases stay full.
//
// A source consumes a number of draws that depends only on the draws
// themselves, never on the pixel size, so the same hash paints the same
// picture at 300 px and at 8K.

import type { Rng } from '../random'
import { int, range } from '../random'

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

export interface Palette {
  /** Five colours, darkest first. */
  ramp: readonly [string, string, string, string, string]
  accent: string
  accent2: string
}

/** Paints the picture and returns its focus (the sun, the orb...) in pixels. */
export type SourceFn = (g: Ctx2D, w: number, h: number, r: Rng, p: Palette) => readonly [number, number]

/** Integer hash to [0, 1): per-window decisions without consuming the stream. */
export function ihash(a: number, b: number, c: number): number {
  let h = Math.imul(a ^ 0x9E3779B1, 0x85EBCA6B) ^ Math.imul(b + 0x632BE5AB, 0xC2B2AE35) ^ Math.imul(c + 0x27D4EB2F, 0x165667B1)
  h ^= h >>> 15
  h = Math.imul(h, 0x2C1B3C6D)
  h ^= h >>> 12
  h = Math.imul(h, 0x297A2D39)
  h ^= h >>> 15
  return (h >>> 0) / 4294967296
}

/** Smooth periodic 1D value noise on a fixed lattice of `n` draws. */
export function noise1(r: Rng, n = 32): (t: number) => number {
  const v = Float32Array.from({ length: n }, () => r())
  return (t: number) => {
    const i = Math.floor(t)
    const f = t - i
    const a = v[((i % n) + n) % n]
    const b = v[(((i + 1) % n) + n) % n]
    const s = f * f * (3 - 2 * f)
    return a + (b - a) * s
  }
}

/** Smooth periodic 2D value noise on a fixed n x n lattice. */
export function noise2(r: Rng, n = 16): (x: number, y: number) => number {
  const v = Float32Array.from({ length: n * n }, () => r())
  const at = (i: number, j: number) => v[(((j % n) + n) % n) * n + (((i % n) + n) % n)]
  return (x: number, y: number) => {
    const i = Math.floor(x)
    const j = Math.floor(y)
    let fx = x - i
    let fy = y - j
    fx = fx * fx * (3 - 2 * fx)
    fy = fy * fy * (3 - 2 * fy)
    const a = at(i, j) + (at(i + 1, j) - at(i, j)) * fx
    const b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * fx
    return a + (b - a) * fy
  }
}

export function hexRgb(c: string): [number, number, number] {
  const v = Number.parseInt(c.slice(1), 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}

export function mix(a: string, b: string, t: number): string {
  const x = hexRgb(a)
  const y = hexRgb(b)
  const f = (i: number) => Math.round(x[i] + (y[i] - x[i]) * t)
  return `rgb(${f(0)},${f(1)},${f(2)})`
}

function rgba(c: string, a: number): string {
  const [r, g, b] = hexRgb(c)
  return `rgba(${r},${g},${b},${a})`
}

/** A ridge line across the whole width, as a filled silhouette down to `base`. */
function ridge(g: Ctx2D, w: number, u: number, base: number, top: number, amp: number, n: (t: number) => number, freq: number, fill: string) {
  const cx = w / 2
  g.fillStyle = fill
  g.beginPath()
  g.moveTo(0, base)
  const step = Math.max(1, u / 240)
  for (let x = 0; x <= w + step; x += step) {
    const t = (x - cx) / u
    const y = top - amp * (n(t * freq + 7) * 0.7 + n(t * freq * 3.1 + 19) * 0.3)
    g.lineTo(x, y)
  }
  g.lineTo(w, base)
  g.closePath()
  g.fill()
}

// ---------------------------------------------------------------------------
// Sunset: sky ramp, a sun low on the horizon, two ridges, the sea and the
// sun's broken reflection.
// ---------------------------------------------------------------------------

export const sunset: SourceFn = (g, w, h, r, p) => {
  const u = Math.min(w, h)
  const cx = w / 2
  const cy = h / 2
  const horizon = cy + range(r, 0.04, 0.18) * u
  const sunX = cx + range(r, -0.2, 0.2) * u
  const sunR = range(r, 0.12, 0.2) * u
  const sunY = horizon - sunR * range(r, 0.25, 0.95)
  const n = noise1(r, 48)
  const farTop = range(r, 0.06, 0.14) * u
  const nearTop = range(r, 0.02, 0.07) * u
  const reflect = Array.from({ length: 22 }, () => [r(), r()] as const)

  const sky = g.createLinearGradient(0, horizon - 0.95 * u, 0, horizon)
  sky.addColorStop(0, p.ramp[0])
  sky.addColorStop(0.35, p.ramp[1])
  sky.addColorStop(0.7, p.ramp[2])
  sky.addColorStop(0.92, p.ramp[3])
  sky.addColorStop(1, p.ramp[4])
  g.fillStyle = sky
  g.fillRect(0, 0, w, horizon + 1)

  const glow = g.createRadialGradient(sunX, sunY, sunR * 0.8, sunX, sunY, sunR * 3.2)
  glow.addColorStop(0, rgba(p.accent2, 0.55))
  glow.addColorStop(1, rgba(p.accent2, 0))
  g.fillStyle = glow
  g.fillRect(0, 0, w, horizon)
  const disc = g.createLinearGradient(0, sunY - sunR, 0, sunY + sunR)
  disc.addColorStop(0, p.accent2)
  disc.addColorStop(1, p.ramp[4])
  g.fillStyle = disc
  g.beginPath()
  g.arc(sunX, sunY, sunR, 0, Math.PI * 2)
  g.fill()

  ridge(g, w, u, horizon + 1, horizon - farTop * 0.4, farTop, n, 2.2, mix(p.ramp[1], p.ramp[2], 0.5))
  ridge(g, w, u, horizon + 1, horizon, nearTop, n, 4.5, p.ramp[1])

  const sea = g.createLinearGradient(0, horizon, 0, horizon + 0.6 * u)
  sea.addColorStop(0, p.ramp[2])
  sea.addColorStop(0.25, p.ramp[1])
  sea.addColorStop(1, p.ramp[0])
  g.fillStyle = sea
  g.fillRect(0, horizon, w, h - horizon)

  for (let k = 0; k < reflect.length; k++) {
    const t = k / reflect.length
    const y = horizon + 0.01 * u + t ** 1.4 * 0.42 * u
    const hw = sunR * (1.05 - t * 0.55) * (0.35 + reflect[k][0] * 0.8)
    const off = (reflect[k][1] - 0.5) * 0.05 * u
    g.fillStyle = rgba(p.accent2, 0.85 - t * 0.55)
    g.fillRect(sunX + off - hw, y, hw * 2, (0.004 + t * 0.008) * u)
  }
  return [sunX, sunY]
}

// ---------------------------------------------------------------------------
// Gradient: a linear wash at any angle under large soft colour blobs and a
// bright horizon line.
// ---------------------------------------------------------------------------

export const gradient: SourceFn = (g, w, h, r, p) => {
  const u = Math.min(w, h)
  const cx = w / 2
  const cy = h / 2
  const all = [...p.ramp, p.accent, p.accent2]
  const a = r() * Math.PI * 2
  const c0 = p.ramp[int(r, 0, 1)]
  const c1 = all[int(r, 1, 6)]
  const c2 = p.ramp[int(r, 3, 4)]
  const L = 0.9 * u
  const lin = g.createLinearGradient(cx - Math.cos(a) * L, cy - Math.sin(a) * L, cx + Math.cos(a) * L, cy + Math.sin(a) * L)
  lin.addColorStop(0, c0)
  lin.addColorStop(0.5, c1)
  lin.addColorStop(1, c2)
  g.fillStyle = lin
  g.fillRect(0, 0, w, h)

  for (let k = 0; k < 5; k++) {
    const bx = cx + range(r, -0.45, 0.45) * u
    const by = cy + range(r, -0.42, 0.42) * u
    const br = range(r, 0.16, 0.42) * u
    const col = all[int(r, 0, 6)]
    const al = range(r, 0.55, 0.95)
    const rg = g.createRadialGradient(bx, by, 0, bx, by, br)
    rg.addColorStop(0, rgba(col, al))
    rg.addColorStop(0.55, rgba(col, al * 0.6))
    rg.addColorStop(1, rgba(col, 0))
    g.fillStyle = rg
    g.fillRect(0, 0, w, h)
  }

  // a glossy orb above a few crisp bands
  const ox = cx + range(r, -0.25, 0.25) * u
  const or = range(r, 0.13, 0.24) * u
  const oy = cy + range(r, -0.2, 0.05) * u
  const orb = g.createRadialGradient(ox - or * 0.35, oy - or * 0.4, or * 0.05, ox, oy, or)
  orb.addColorStop(0, p.ramp[4])
  orb.addColorStop(0.25, p.accent2)
  orb.addColorStop(0.7, p.accent)
  orb.addColorStop(1, p.ramp[0])
  g.fillStyle = orb
  g.beginPath()
  g.arc(ox, oy, or, 0, Math.PI * 2)
  g.fill()
  let by = oy + or + range(r, 0.04, 0.1) * u
  for (let k = 0; k < 5; k++) {
    const bh = range(r, 0.008, 0.04) * u
    g.fillStyle = all[int(r, 0, 6)]
    g.fillRect(0, by, w, bh)
    by += bh + range(r, 0.01, 0.05) * u
  }

  const ly = cy + range(r, -0.3, 0.3) * u
  const lh = range(r, 0.004, 0.02) * u
  const band = g.createLinearGradient(0, ly - lh * 6, 0, ly + lh * 6)
  band.addColorStop(0, rgba(p.ramp[4], 0))
  band.addColorStop(0.5, rgba(p.ramp[4], 0.9))
  band.addColorStop(1, rgba(p.ramp[4], 0))
  g.fillStyle = band
  g.fillRect(0, ly - lh * 6, w, lh * 12)
  return [ox, oy]
}

// ---------------------------------------------------------------------------
// Geometry: a modernist poster of a disc, bars and a triangle over a wall and
// a floor, with thin stripes running edge to edge.
// ---------------------------------------------------------------------------

export const geometry: SourceFn = (g, w, h, r, p) => {
  const u = Math.min(w, h)
  const cx = w / 2
  const cy = h / 2
  const floor = cy + range(r, 0.1, 0.26) * u
  const wall = g.createLinearGradient(0, cy - 0.6 * u, 0, floor)
  wall.addColorStop(0, p.ramp[4])
  wall.addColorStop(1, p.ramp[3])
  g.fillStyle = wall
  g.fillRect(0, 0, w, floor)
  const fl = g.createLinearGradient(0, floor, 0, floor + 0.5 * u)
  fl.addColorStop(0, p.ramp[1])
  fl.addColorStop(1, p.ramp[0])
  g.fillStyle = fl
  g.fillRect(0, floor, w, h - floor)

  // stripes across the wall
  const sy = cy + range(r, -0.42, -0.2) * u
  const sn = int(r, 3, 6)
  for (let k = 0; k < 6; k++) {
    const th = range(r, 0.004, 0.012) * u
    if (k < sn) {
      g.fillStyle = k % 2 ? p.ramp[2] : p.accent
      g.fillRect(0, sy + k * 0.03 * u, w, th)
    }
  }

  // the disc
  const dx = cx + range(r, -0.18, 0.18) * u
  const dr = range(r, 0.2, 0.3) * u
  const dy = floor - dr * range(r, 0.6, 1.1)
  const dg = g.createLinearGradient(dx - dr, dy - dr, dx + dr, dy + dr)
  dg.addColorStop(0, p.accent2)
  dg.addColorStop(1, p.accent)
  g.fillStyle = dg
  g.beginPath()
  g.arc(dx, dy, dr, 0, Math.PI * 2)
  g.fill()

  // two bars standing on the floor
  for (let k = 0; k < 2; k++) {
    const bw = range(r, 0.05, 0.14) * u
    const bh = range(r, 0.25, 0.6) * u
    const bx = cx + range(r, -0.42, 0.32) * u
    g.fillStyle = k ? p.ramp[2] : p.ramp[0]
    g.fillRect(bx, floor - bh, bw, bh)
  }

  // a triangle
  const tx = cx + range(r, -0.3, 0.3) * u
  const ts = range(r, 0.12, 0.24) * u
  g.fillStyle = mix(p.accent, p.ramp[0], 0.35)
  g.beginPath()
  g.moveTo(tx - ts, floor)
  g.lineTo(tx + ts, floor)
  g.lineTo(tx + ts * range(r, -0.6, 0.6), floor - ts * 1.6)
  g.closePath()
  g.fill()
  return [dx, dy]
}

// ---------------------------------------------------------------------------
// Skyline: a night city with lit windows under a large moon.
// ---------------------------------------------------------------------------

export const skyline: SourceFn = (g, w, h, r, p) => {
  const u = Math.min(w, h)
  const cx = w / 2
  const cy = h / 2
  const ground = cy + range(r, 0.2, 0.32) * u
  const mx = cx + range(r, -0.3, 0.3) * u
  const my = cy + range(r, -0.32, -0.12) * u
  const mr = range(r, 0.07, 0.12) * u
  const salt = Math.floor(r() * 2 ** 31)

  const sky = g.createLinearGradient(0, ground - 1.05 * u, 0, ground)
  sky.addColorStop(0, p.ramp[0])
  sky.addColorStop(0.6, p.ramp[1])
  sky.addColorStop(1, p.ramp[3])
  g.fillStyle = sky
  g.fillRect(0, 0, w, ground)
  const halo = g.createRadialGradient(mx, my, mr, mx, my, mr * 4)
  halo.addColorStop(0, rgba(p.accent2, 0.4))
  halo.addColorStop(1, rgba(p.accent2, 0))
  g.fillStyle = halo
  g.fillRect(0, 0, w, ground)
  g.fillStyle = p.accent2
  g.beginPath()
  g.arc(mx, my, mr, 0, Math.PI * 2)
  g.fill()

  // two rows of buildings over a fixed span, wide enough for 21:9
  for (let layer = 0; layer < 2; layer++) {
    let x = -1.3
    let b = 0
    const front = layer === 1
    while (x < 1.3) {
      const bw = range(r, 0.05, 0.13)
      const bh = front ? range(r, 0.1, 0.42) : range(r, 0.2, 0.55)
      const left = cx + x * u
      const top = ground - bh * u
      g.fillStyle = front ? p.ramp[0] : mix(p.ramp[1], p.ramp[0], 0.3)
      g.fillRect(left, top, bw * u + 1, bh * u + 1)
      if (front) {
        const cell = 0.022
        const cols = Math.max(1, Math.floor((bw - 0.01) / cell))
        const rows = Math.max(1, Math.floor((bh - 0.02) / (cell * 1.3)))
        const lit = 0.25 + ihash(salt, b, 999) * 0.4
        for (let j = 0; j < rows; j++) {
          for (let i = 0; i < cols; i++) {
            const q = ihash(salt, b * 131 + i, j)
            if (q < lit) {
              g.fillStyle = q < lit * 0.15 ? p.accent : p.accent2
              g.fillRect(left + (0.008 + i * cell) * u, top + (0.014 + j * cell * 1.3) * u, cell * 0.55 * u, cell * 0.7 * u)
            }
          }
        }
      }
      x += bw + range(r, 0, 0.015)
      b++
    }
  }
  const street = g.createLinearGradient(0, ground, 0, ground + 0.4 * u)
  street.addColorStop(0, p.ramp[1])
  street.addColorStop(1, p.ramp[0])
  g.fillStyle = street
  g.fillRect(0, ground, w, h - ground)
  g.fillStyle = rgba(p.accent, 0.8)
  g.fillRect(0, ground + 0.012 * u, w, 0.004 * u)
  return [mx, my + 0.25 * u]
}

// ---------------------------------------------------------------------------
// Test card: colour bars, a reversed strip, a step ramp and a circle with a
// cross, after the broadcast test patterns of the colour television era.
// ---------------------------------------------------------------------------

const BARS = ['#c0c0c0', '#c0c000', '#00c0c0', '#00c000', '#c000c0', '#c00000', '#0000c0'] as const

export const testCard: SourceFn = (g, w, h, r, p) => {
  const u = Math.min(w, h)
  const cx = w / 2
  const cy = h / 2
  const tint = range(r, 0.3, 0.55)
  const shift = int(r, 0, 6)
  const ring = range(r, 0.3, 0.4) * u
  const ox = range(r, -0.08, 0.08) * u
  const top = cy - 0.6 * u
  const barsEnd = cy + 0.18 * u
  const stripEnd = cy + 0.26 * u
  const bw = w / 7
  const tones = [p.ramp[4], p.accent2, p.accent, p.ramp[3], p.ramp[2], p.accent, p.ramp[1]]
  g.fillStyle = p.ramp[0]
  g.fillRect(0, 0, w, h)
  for (let k = 0; k < 7; k++) {
    const i = (k + shift) % 7
    g.fillStyle = mix(BARS[i], tones[i], tint)
    g.fillRect(Math.floor(k * bw), Math.min(0, top), Math.ceil(bw) + 1, barsEnd - Math.min(0, top))
    g.fillStyle = mix(BARS[(13 - k - shift) % 7], p.ramp[1], 0.5)
    g.fillRect(Math.floor(k * bw), barsEnd, Math.ceil(bw) + 1, stripEnd - barsEnd)
  }
  const sw = w / 10
  for (let k = 0; k < 10; k++) {
    const t = k / 9
    const i = Math.min(3, Math.floor(t * 4))
    g.fillStyle = mix(p.ramp[i], p.ramp[i + 1], t * 4 - i)
    g.fillRect(Math.floor(k * sw), stripEnd, Math.ceil(sw) + 1, h - stripEnd)
  }
  g.strokeStyle = p.ramp[4]
  g.lineWidth = 0.012 * u
  g.beginPath()
  g.arc(cx + ox, cy, ring, 0, Math.PI * 2)
  g.stroke()
  g.lineWidth = 0.006 * u
  g.beginPath()
  g.moveTo(cx + ox - ring, cy)
  g.lineTo(cx + ox + ring, cy)
  g.moveTo(cx + ox, cy - ring)
  g.lineTo(cx + ox, cy + ring)
  g.stroke()
  g.fillStyle = p.ramp[0]
  g.fillRect(cx + ox - ring * 0.32, cy - ring * 0.62, ring * 0.64, ring * 0.24)
  g.fillStyle = p.ramp[4]
  g.fillRect(cx + ox - ring * 0.26, cy - ring * 0.56, ring * 0.52, ring * 0.12)
  return [cx + ox, cy]
}
