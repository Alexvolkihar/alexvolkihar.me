// Torus knots T(p, q): a closed curve wound p times around the axis of a
// torus and q times through its hole, seen from above. With p and q coprime
// it is a single strand with q(p - 1) crossings in this projection, and the
// strand that passes over at each one is simply the one higher on the torus.
//
//   r(t) = R + a cos(q t),  x = r cos(p t),  y = r sin(p t),  z = a sin(q t)
//
// Two parameters t1, t2 land on the same point when p t2 = p t1 + 2πk and
// q t2 = -q t1 + 2πm, which gives every crossing in closed form:
//   t1 = π (m p - q k) / (p q),  t2 = t1 + 2πk / p.

import type { Crossing, Strand } from './geometry'

const TAU = Math.PI * 2

export function torusKnot(p: number, q: number, cx: number, cy: number, outer: number, inner: number, rot: number, width: number, colour: number): { strand: Strand, crossings: Crossing[] } {
  const R = (outer + inner) / 2
  const a = (outer - inner) / 2
  const cr = Math.cos(rot)
  const sr = Math.sin(rot)
  const pos = (t: number): [number, number] => {
    const r = R + a * Math.cos(q * t)
    const x = r * Math.cos(p * t)
    const y = r * Math.sin(p * t)
    return [cx + x * cr - y * sr, cy + x * sr + y * cr]
  }
  const vel = (t: number): [number, number] => {
    const r = R + a * Math.cos(q * t)
    const dr = -a * q * Math.sin(q * t)
    const x = dr * Math.cos(p * t) - r * p * Math.sin(p * t)
    const y = dr * Math.sin(p * t) + r * p * Math.cos(p * t)
    return [x * cr - y * sr, x * sr + y * cr]
  }
  const norm = (t: number): [number, number] => {
    const [x, y] = vel(t)
    const l = Math.hypot(x, y)
    return [x / l, y / l]
  }
  const wrap = (t: number) => ((t % TAU) + TAU) % TAU

  // Over points of every crossing, keyed by their parameter.
  const overs: { t: number, u: number }[] = []
  const seen = new Set<string>()
  for (let k = 1; k < p; k++) {
    for (let m = 0; m < 2 * q * p; m++) {
      const t1 = wrap((Math.PI * (m * p - q * k)) / (p * q))
      const t2 = wrap(t1 + (TAU * k) / p)
      const key = [t1, t2].map(t => Math.round(t * 1e6)).sort((x, y) => x - y).join(':')
      if (seen.has(key))
        continue
      seen.add(key)
      const over = Math.sin(q * t1) > Math.sin(q * t2)
      overs.push(over ? { t: t1, u: t2 } : { t: t2, u: t1 })
    }
  }

  // Samples: a regular sweep plus every over point, so each crossing starts a segment.
  const N = 40 * q + 16 * p
  const ts: { t: number, c: number }[] = []
  for (let i = 0; i < N; i++)
    ts.push({ t: (TAU * i) / N, c: -1 })
  overs.forEach((o, c) => ts.push({ t: o.t, c }))
  ts.sort((x, y) => x.t - y.t)
  const samples = ts.filter((s, i) => i === 0 || s.t - ts[i - 1].t > 1e-7 || s.c >= 0)

  const seg: number[] = []
  const crossings: Crossing[] = []
  for (let i = 0; i < samples.length; i++) {
    const t0 = samples[i].t
    const t1 = i + 1 < samples.length ? samples[i + 1].t : samples[0].t + TAU
    const dt = (t1 - t0) / 3
    const [x0, y0] = pos(t0)
    const [x3, y3] = pos(t1)
    const [vx0, vy0] = vel(t0)
    const [vx1, vy1] = vel(t1)
    seg.push(x0, y0, x0 + vx0 * dt, y0 + vy0 * dt, x3 - vx1 * dt, y3 - vy1 * dt, x3, y3)
    const c = samples[i].c
    if (c >= 0) {
      const [ox, oy] = norm(overs[c].t)
      const [ux, uy] = norm(overs[c].u)
      crossings.push({ x: x0, y: y0, ox, oy, ux, uy, strand: colour, seg: i })
    }
  }
  return { strand: { seg, colour, width }, crossings }
}
