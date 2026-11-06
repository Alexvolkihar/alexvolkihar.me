// Grains thrown about by a vibrating plate.
//
// Every grain is bounced at each step by a random kick proportional to the
// local amplitude |u|, so grains on the loops keep jumping while grains near a
// nodal line barely move: they pile up where the plate stands still, which is
// how Chladni's sand draws the nodal lines. A small drift (a damped Newton
// step towards u = 0) stands for the net slide of grains down the slope of
// the vibration, and keeps the simulation short.
//
// Fine powder (Chladni and Savart used lycopodium spores) does the opposite:
// air currents over the plate carry it to the antinodes, where it gathers in
// small round heaps (Faraday, "On a peculiar class of acoustical figures",
// 1831). Powder grains climb towards the loops instead.

import type { Rng } from '../random'
import type { Field } from './field'

export interface SandOptions {
  count: number
  /** Steps of the fully settled grains; a few grains stop early, still in transit. */
  iters: number
  /** Kick proportional to |u| (plate units, plate side = 1). */
  kick: number
  /** Kick floor: grains never sit perfectly still. */
  floor: number
  /** Fraction of the Newton step towards the nodal line taken per bounce. */
  pull: number
  /** true: lycopodium, climbs to the antinodes. */
  powder: boolean
}

/** Grain positions in plate coordinates [0, 1]^2, interleaved x, y. */
export function settle(field: Field, r: Rng, o: SandOptions): Float32Array {
  const { N, round } = field
  const M = N - 1
  // u, du/dx, du/dy interleaved: one cache line per lookup
  const F = new Float32Array(N * N * 3)
  for (let k = 0; k < N * N; k++) {
    F[k * 3] = field.u[k]
    F[k * 3 + 1] = field.gx[k]
    F[k * 3 + 2] = field.gy[k]
  }
  const N3 = N * 3
  // a grain this close to the nodal line has stopped moving
  const still = o.powder ? -1 : 0.015
  const eps = 0.012 * field.g2
  const cap = 0.035
  const out = new Float32Array(o.count * 2)

  for (let p = 0; p < o.count; p++) {
    // sprinkle uniformly over the plate
    let x = r()
    let y = r()
    if (round) {
      // area-uniform point in the disc, two draws as on the square
      const rad = 0.5 * Math.sqrt(x)
      const a = 2 * Math.PI * y
      x = 0.5 + rad * Math.cos(a)
      y = 0.5 + rad * Math.sin(a)
    }
    const t = r()
    const t3 = t * t * t
    const steps = o.iters - Math.floor(t3 * t3 * o.iters * 0.7)

    for (let s = 0; s < steps; s++) {
      // bilinear sample of u and its gradient
      const fx = x * M
      const fy = y * M
      let i = fx | 0
      let j = fy | 0
      if (i >= M)
        i = M - 1
      if (j >= M)
        j = M - 1
      const wx = fx - i
      const wy = fy - j
      const k = (j * N + i) * 3
      const w00 = (1 - wx) * (1 - wy)
      const w10 = wx * (1 - wy)
      const w01 = (1 - wx) * wy
      const w11 = wx * wy
      const k1 = k + 3
      const k2 = k + N3
      const k3 = k2 + 3
      const a = F[k] * w00 + F[k1] * w10 + F[k2] * w01 + F[k3] * w11
      const aa = a < 0 ? -a : a
      const dx = F[k + 1] * w00 + F[k1 + 1] * w10 + F[k2 + 1] * w01 + F[k3 + 1] * w11
      const dy = F[k + 2] * w00 + F[k1 + 2] * w10 + F[k2 + 2] * w01 + F[k3 + 2] * w11
      const gg = dx * dx + dy * dy

      let mx: number
      let my: number
      let kick: number
      if (aa < still) {
        // settled on the line: one last small bounce spreads it across it
        mx = 0
        my = 0
        kick = o.floor * 1.6
        s = steps
      }
      else if (!o.powder) {
        const d = (o.pull * a) / (gg + eps)
        mx = -d * dx
        my = -d * dy
        kick = o.kick * aa + o.floor
      }
      else {
        // climb |u|: unit step along sign(u) * grad u
        const d = (o.pull * (a < 0 ? -1 : 1)) / Math.sqrt(gg + eps * 0.1)
        mx = d * dx
        my = d * dy
        kick = o.kick * (1 - aa) + o.floor
      }
      const ml = mx * mx + my * my
      if (ml > cap * cap) {
        const sc = cap / Math.sqrt(ml)
        mx *= sc
        my *= sc
      }
      x += mx + kick * (2 * r() - 1)
      y += my + kick * (2 * r() - 1)

      // grains bounce back off the rim
      if (round) {
        const ox = x - 0.5
        const oy = y - 0.5
        const d2 = ox * ox + oy * oy
        if (d2 > 0.2475) {
          const sc = 0.4975 / Math.sqrt(d2)
          x = 0.5 + ox * sc
          y = 0.5 + oy * sc
        }
      }
      else {
        if (x < 0)
          x = -x
        else if (x > 1)
          x = 2 - x
        if (y < 0)
          y = -y
        else if (y > 1)
          y = 2 - y
        if (x < 0 || x > 1)
          x = 0.5
        if (y < 0 || y > 1)
          y = 0.5
      }
    }
    out[p * 2] = x
    out[p * 2 + 1] = y
  }
  return out
}
