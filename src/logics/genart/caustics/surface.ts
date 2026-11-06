// Height fields for the refracting surface: a water surface or a pane of
// textured glass. Only the shape of a field matters: its amplitude and the
// depth of the floor are normalised afterwards from its slopes and its
// curvature, so a field is free to use any height unit.
//
// Sums of plane waves are evaluated on a lattice with the angle-addition
// identity sin(a + b) = sin a cos b + cos a sin b: one row and one column of
// sines per wave, then four multiplications per lattice point, no trigonometry.

import type { Rng } from '../random'
import { gaussian, int, range } from '../random'

export type SurfaceKind = 'Swell' | 'Chop' | 'Ruffled' | 'Drops'

interface Wave { kx: number, ky: number, phase: number, amp: number }
interface Drop { x: number, y: number, R: number, w: number, k: number, amp: number }

export interface Surface {
  /** Heights on the lattice xs × ys, row-major, into out (length xs.length * ys.length). */
  evaluate: (xs: Float64Array, ys: Float64Array, out: Float32Array) => void
  /** Percentile of the focusing curvature used to set the floor depth. */
  percentile: number
}

const TAU = Math.PI * 2

/** Narrow spectra fold everywhere at once: their depth is set by a higher percentile. */
const PERCENTILE: Record<SurfaceKind, number> = { Swell: 0.95, Chop: 0.95, Ruffled: 0.9, Drops: 0.975 }

/**
 * A plane wave of wavelength `lambda` (composition units) heading `theta`, whose
 * curvature amplitude amp * k^2 is `curv`: caustics follow curvature, not height.
 */
function wave(r: Rng, lambda: number, theta: number, curv: number): Wave {
  const k = TAU / lambda
  return { kx: k * Math.cos(theta), ky: k * Math.sin(theta), phase: r() * TAU, amp: curv / (k * k) }
}

function makeWaves(kind: SurfaceKind, r: Rng): Wave[] {
  const ws: Wave[] = []
  const dir = r() * TAU
  if (kind === 'Swell') {
    // long crests from one quarter, broken by shorter waves along them: the
    // light gathers into bands of elongated cells
    const n = int(r, 3, 4)
    for (let i = 0; i < n; i++) {
      const lambda = range(r, 0.14, 0.3)
      ws.push(wave(r, lambda, dir + gaussian(r) * 0.3, range(r, 0.8, 1)))
    }
    const m = int(r, 4, 6)
    for (let i = 0; i < m; i++)
      ws.push(wave(r, range(r, 0.06, 0.12), dir + range(r, -1.1, 1.1), range(r, 0.45, 0.7)))
  }
  else if (kind === 'Chop') {
    // the classic pool web: short waves from every direction
    const n = int(r, 10, 14)
    for (let i = 0; i < n; i++) {
      const theta = dir + (i + r() * 0.8) * Math.PI / n
      const lambda = 0.07 * (3 ** r())
      ws.push(wave(r, lambda, theta, Math.sqrt(lambda / 0.1) * range(r, 0.6, 1)))
    }
  }
  else if (kind === 'Ruffled') {
    // a broad wind spectrum: many scales, mostly downwind
    const n = int(r, 24, 32)
    for (let i = 0; i < n; i++) {
      const lambda = 0.03 * (12 ** r())
      const theta = dir + gaussian(r) * 0.75
      ws.push(wave(r, lambda, theta, (lambda / 0.1) ** 0.35 * range(r, 0.5, 1)))
    }
  }
  else {
    // a faint chop under the rings
    const n = int(r, 6, 8)
    for (let i = 0; i < n; i++)
      ws.push(wave(r, range(r, 0.06, 0.12), dir + (i + r()) * Math.PI / n, range(r, 0.1, 0.18)))
  }
  return ws
}

function makeDrops(r: Rng): Drop[] {
  const n = int(r, 2, 5)
  const ds: Drop[] = []
  for (let i = 0; i < n; i++) {
    const lambda = range(r, 0.028, 0.05)
    const k = TAU / lambda
    ds.push({
      x: range(r, -0.42, 0.42),
      y: range(r, -0.42, 0.42),
      R: range(r, 0.1, 0.42),
      w: range(r, 0.06, 0.16),
      k,
      amp: range(r, 0.7, 1) / (k * k),
    })
  }
  return ds
}

export function makeSurface(kind: SurfaceKind, r: Rng): Surface {
  // fixed draw order: waves, then drops (always drawn, used only by Drops)
  const waves = makeWaves(kind, r)
  const drops = makeDrops(r)
  return {
    percentile: PERCENTILE[kind],
    evaluate(xs, ys, out) {
      const nx = xs.length
      const ny = ys.length
      out.fill(0)
      const sx = new Float32Array(nx)
      const cx = new Float32Array(nx)
      const sy = new Float32Array(ny)
      const cy = new Float32Array(ny)
      for (const w of waves) {
        for (let i = 0; i < nx; i++) {
          const a = w.kx * xs[i] + w.phase
          sx[i] = Math.sin(a) * w.amp
          cx[i] = Math.cos(a) * w.amp
        }
        for (let j = 0; j < ny; j++) {
          const b = w.ky * ys[j]
          sy[j] = Math.sin(b)
          cy[j] = Math.cos(b)
        }
        for (let j = 0; j < ny; j++) {
          const o = j * nx
          const c = cy[j]
          const s = sy[j]
          for (let i = 0; i < nx; i++)
            out[o + i] += sx[i] * c + cx[i] * s
        }
      }
      if (kind !== 'Drops')
        return
      // ring packets: a few wavelengths around the front radius, fading
      // smoothly to zero (C2) at the packet edges and spreading as 1/sqrt(r)
      for (const d of drops) {
        const x0 = d.x - d.R - d.w
        const x1 = d.x + d.R + d.w
        const y0 = d.y - d.R - d.w
        const y1 = d.y + d.R + d.w
        for (let j = 0; j < ny; j++) {
          const y = ys[j]
          if (y < y0 || y > y1)
            continue
          const dy = y - d.y
          const o = j * nx
          for (let i = 0; i < nx; i++) {
            const x = xs[i]
            if (x < x0 || x > x1)
              continue
            const dx = x - d.x
            const rr = Math.sqrt(dx * dx + dy * dy)
            const u = (rr - d.R) / d.w
            if (u <= -1 || u >= 1)
              continue
            const e = 1 - u * u
            out[o + i] += d.amp * e * e * e * Math.sin(d.k * (rr - d.R)) * Math.sqrt(0.25 / Math.max(rr, 0.08))
          }
        }
      }
    },
  }
}
