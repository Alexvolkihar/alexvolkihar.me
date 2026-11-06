// Procedural quilting cottons for the Quilt series.
//
// A fabric is a small repeating tile (calico florets, shirting sprigs, pin
// dots, gingham, stripes, tone-on-tone "blender" scribbles or a plain solid)
// drawn once per piece and used as a canvas pattern. The motif layout is
// decided from the hash as fractions of the tile, and the tile size is a
// fraction of the canvas short side, so a print looks the same at any size.
// The prints are original: they only follow the general look of the small
// florals, ginghams and shirtings sold for patchwork.

import type { Rng } from '../random'
import type { Rgb } from './color'
import { int, range } from '../random'
import { css, mix, shade } from './color'

export type FabricKind = 'solid' | 'calico' | 'gingham' | 'dots' | 'stripe' | 'blender' | 'shirting'

export interface FabricSpec {
  kind: FabricKind
  base: Rgb
  ink: Rgb
  ink2: Rgb
  /** Tile size as a fraction of the canvas short side. */
  scale: number
  /** Motif layout, as fractions of the tile (meaning depends on the kind). */
  motifs: number[]
}

export interface Fabric {
  spec: FabricSpec
  fill: string | CanvasPattern
  /** Tile size in pixels (real, not rounded). */
  size: number
  /** Pattern scale correcting the integer tile size. */
  k: number
}

const SCALE: Record<FabricKind, readonly [number, number]> = {
  solid: [0.04, 0.04],
  calico: [0.034, 0.05],
  shirting: [0.04, 0.055],
  dots: [0.016, 0.026],
  gingham: [0.016, 0.028],
  stripe: [0.018, 0.03],
  blender: [0.03, 0.042],
}

/** Decide a fabric from the hash. Always consumes the same draws for a kind. */
export function fabricSpec(r: Rng, kind: FabricKind, base: Rgb, ink: Rgb, ink2: Rgb): FabricSpec {
  const [s0, s1] = SCALE[kind]
  const scale = range(r, s0, s1)
  const motifs: number[] = []
  if (kind === 'calico') {
    // florets: x, y, radius, rotation, colour pick
    const n = int(r, 4, 6)
    motifs.push(n)
    for (let i = 0; i < n; i++)
      motifs.push(r(), r(), range(r, 0.06, 0.1), r() * Math.PI * 2, r())
    // seed dots
    const d = int(r, 6, 10)
    motifs.push(d)
    for (let i = 0; i < d; i++)
      motifs.push(r(), r(), range(r, 0.012, 0.024))
  }
  else if (kind === 'shirting') {
    const n = int(r, 2, 3)
    motifs.push(n)
    for (let i = 0; i < n; i++)
      motifs.push(r(), r(), r() * Math.PI * 2, r())
  }
  else if (kind === 'dots') {
    motifs.push(range(r, 0.12, 0.2))
  }
  else if (kind === 'gingham') {
    motifs.push(range(r, 0.42, 0.55))
  }
  else if (kind === 'stripe') {
    // one wide and one or two pinstripes
    motifs.push(range(r, 0.18, 0.34), int(r, 1, 2), range(r, 0.04, 0.07))
  }
  else if (kind === 'blender') {
    const n = int(r, 12, 18)
    motifs.push(n)
    for (let i = 0; i < n; i++)
      motifs.push(r(), r(), range(r, 0.05, 0.11), r() * Math.PI * 2)
  }
  return { kind, base, ink, ink2, scale, motifs }
}

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

function tileCanvas(n: number): { cv: HTMLCanvasElement | OffscreenCanvas, g: Ctx2D } {
  if (typeof OffscreenCanvas !== 'undefined') {
    const cv = new OffscreenCanvas(n, n)
    return { cv, g: cv.getContext('2d')! }
  }
  const cv = document.createElement('canvas')
  cv.width = n
  cv.height = n
  return { cv, g: cv.getContext('2d')! }
}

/** Call `f` at (x, y) and at the copies needed for a seamless repeat. */
function wrap(T: number, x: number, y: number, rad: number, f: (x: number, y: number) => void) {
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const px = x + dx * T
      const py = y + dy * T
      if (px + rad < 0 || py + rad < 0 || px - rad > T || py - rad > T)
        continue
      f(px, py)
    }
  }
}

function drawTile(g: Ctx2D, f: FabricSpec, T: number) {
  const m = f.motifs
  g.fillStyle = css(f.base)
  g.fillRect(0, 0, T, T)
  if (f.kind === 'calico') {
    const n = m[0]
    for (let i = 0; i < n; i++) {
      const [x, y, rad, rot, c] = m.slice(1 + i * 5, 6 + i * 5)
      const R = rad * T
      wrap(T, x * T, y * T, R * 3, (px, py) => {
        // two leaves, five petals, a centre
        g.fillStyle = css(f.ink2)
        for (const s of [-1, 1]) {
          const a = rot + s * 1.9
          g.beginPath()
          g.ellipse(px + Math.cos(a) * R * 1.9, py + Math.sin(a) * R * 1.9, R * 0.95, R * 0.42, a, 0, Math.PI * 2)
          g.fill()
        }
        g.fillStyle = css(c < 0.65 ? f.ink : shade(f.ink, 0.35))
        g.beginPath()
        for (let k = 0; k < 5; k++) {
          const a = rot + k * Math.PI * 0.4
          g.moveTo(px + Math.cos(a) * R + R * 0.55, py + Math.sin(a) * R)
          g.arc(px + Math.cos(a) * R, py + Math.sin(a) * R, R * 0.55, 0, Math.PI * 2)
        }
        g.fill()
        g.fillStyle = css(f.base)
        g.beginPath()
        g.arc(px, py, R * 0.32, 0, Math.PI * 2)
        g.fill()
      })
    }
    const o = 1 + n * 5
    const d = m[o]
    g.fillStyle = css(f.ink2)
    for (let i = 0; i < d; i++) {
      const [x, y, rad] = m.slice(o + 1 + i * 3, o + 4 + i * 3)
      wrap(T, x * T, y * T, rad * T, (px, py) => {
        g.beginPath()
        g.arc(px, py, rad * T, 0, Math.PI * 2)
        g.fill()
      })
    }
  }
  else if (f.kind === 'shirting') {
    const n = m[0]
    g.strokeStyle = css(f.ink)
    g.fillStyle = css(f.ink)
    g.lineWidth = T * 0.025
    g.lineCap = 'round'
    for (let i = 0; i < n; i++) {
      const [x, y, rot, kind] = m.slice(1 + i * 4, 5 + i * 4)
      const R = T * 0.07
      wrap(T, x * T, y * T, R * 2, (px, py) => {
        if (kind < 0.5) {
          // a three-dot sprig
          for (let k = 0; k < 3; k++) {
            const a = rot + k * Math.PI * 2 / 3
            g.beginPath()
            g.arc(px + Math.cos(a) * R * 0.6, py + Math.sin(a) * R * 0.6, R * 0.32, 0, Math.PI * 2)
            g.fill()
          }
        }
        else {
          // a little stem with a bud
          g.beginPath()
          g.moveTo(px - Math.cos(rot) * R, py - Math.sin(rot) * R)
          g.quadraticCurveTo(px + Math.sin(rot) * R * 0.5, py - Math.cos(rot) * R * 0.5, px + Math.cos(rot) * R, py + Math.sin(rot) * R)
          g.stroke()
          g.beginPath()
          g.arc(px + Math.cos(rot) * R, py + Math.sin(rot) * R, R * 0.3, 0, Math.PI * 2)
          g.fill()
        }
      })
    }
  }
  else if (f.kind === 'dots') {
    const rad = m[0] * T
    g.fillStyle = css(f.ink)
    for (const [x, y] of [[0.25, 0.25], [0.75, 0.75]]) {
      g.beginPath()
      g.arc(x * T, y * T, rad, 0, Math.PI * 2)
      g.fill()
    }
  }
  else if (f.kind === 'gingham') {
    const b = m[0] * T
    g.fillStyle = css(f.ink, 0.5)
    g.fillRect(0, 0, T, b)
    g.fillRect(0, 0, b, T)
    // a hint of the woven threads
    g.fillStyle = css(f.ink, 0.12)
    for (let k = 0; k < 6; k++)
      g.fillRect(0, (k + 0.5) * T / 6, T, T * 0.02)
  }
  else if (f.kind === 'stripe') {
    const [wide, pins, pin] = m
    g.fillStyle = css(f.ink)
    g.fillRect(0, 0, wide * T, T)
    g.fillStyle = css(f.ink2)
    for (let k = 0; k < pins; k++)
      g.fillRect((wide + (k + 1) * (1 - wide) / (pins + 1) - pin / 2) * T, 0, pin * T, T)
  }
  else if (f.kind === 'blender') {
    const n = m[0]
    g.strokeStyle = css(f.ink)
    g.lineWidth = T * 0.02
    g.lineCap = 'round'
    for (let i = 0; i < n; i++) {
      const [x, y, rad, a0] = m.slice(1 + i * 4, 5 + i * 4)
      wrap(T, x * T, y * T, rad * T, (px, py) => {
        g.beginPath()
        g.arc(px, py, rad * T, a0, a0 + 3.6)
        g.stroke()
      })
    }
  }
}

/** Turn a spec into something `fillStyle` accepts, at the size of this canvas. */
export function realise(g: CanvasRenderingContext2D, f: FabricSpec, S: number): Fabric {
  const size = f.scale * S
  if (f.kind === 'solid')
    return { spec: f, fill: css(f.base), size, k: 1 }
  const n = Math.max(2, Math.ceil(size))
  const t = tileCanvas(n)
  drawTile(t.g, f, n)
  const pattern = g.createPattern(t.cv, 'repeat')
  if (!pattern)
    return { spec: f, fill: css(f.base), size, k: 1 }
  return { spec: f, fill: pattern, size, k: size / n }
}

/** Set `fab` as the fill, with the print shifted by (ox, oy) tiles: each patch is cut from its own place. */
export function useFabric(g: CanvasRenderingContext2D, fab: Fabric, ox: number, oy: number) {
  if (typeof fab.fill !== 'string')
    fab.fill.setTransform(new DOMMatrix([fab.k, 0, 0, fab.k, ox * fab.size, oy * fab.size]))
  g.fillStyle = fab.fill
}

/** The light ground used under gingham: the colour washed towards white. */
export function ginghamGround(c: Rgb): Rgb {
  return mix(c, [250, 248, 242], 0.82)
}
