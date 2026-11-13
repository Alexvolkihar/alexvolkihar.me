// Smooth spheroids for the "Galaxy" series: bulges, elliptical galaxies and
// the shells around them, computed per buffer pixel instead of splatted.
//
// The surface brightness follows J. L. Sérsic's law
//   I(r) = Ie exp(-b_n ((r / Re)^(1/n) - 1)),
// with b_n from the asymptotic series of Ciotti & Bertin (1999); n = 4 is
// G. de Vaucouleurs' r^1/4 law of elliptical galaxies. Isophotes are ellipses
// with a small fourth-order term (boxy or discy, after R. Bender's a4 / a) and
// get rounder towards the centre. The profile is tabulated once against the
// square root of the radius, so a pixel costs one square root and a lookup,
// and the light is free of the grain a particle cloud would leave.
//
// Shells follow D. F. Malin and D. Carter's (1983) plates of NGC 3923 and its
// kin: thin arcs, each a caustic of stars from a swallowed companion piling up
// at the turning point of their orbits. Seen in projection a thin shell is
// brightest just inside its edge (limb brightening, 1 / sqrt(1 - (r / R)^2)),
// then cut off sharply. Along the major axis of an elongated galaxy they
// alternate sides at growing radii; around a round one they face any way.

import type { Light } from './light'

export interface Shell {
  /** Radius (galaxy units), direction of the arc (radians, galaxy frame), half opening (radians). */
  R: number
  dir: number
  open: number
  /** Brightness at the edge, as a fraction of the light of the galaxy there. */
  amp: number
}

export interface SpheroidSpec {
  /** Centre (buffer pixels) and pixels per galaxy unit. */
  cx: number
  cy: number
  sc: number
  /** Position angle of the major axis, apparent axis ratios at the edge and at the centre. */
  pa: number
  q: number
  qCore: number
  /** Fourth-order isophote term: > 0 discy, < 0 boxy. */
  a4: number
  re: number
  n: number
  /** The light ends smoothly at this radius (galaxy units). */
  rMax: number
  /**
   * 'linear': total light `lum`, as the particle bulge had (spiral bulges).
   * 'stretch': display brightness lum * (I / Ie)^gamma, a power stretch, so
   * a giant elliptical keeps a bright core and a halo that fades over many Re
   * (I spans four decades between the centre and 10 Re for n = 4).
   */
  mode: 'linear' | 'stretch'
  lum: number
  gamma: number
  /** Colour at the centre and in the halo (linear RGB, 0..1). */
  core: readonly [number, number, number]
  halo: readonly [number, number, number]
  shells: Shell[]
  shellColor: readonly [number, number, number]
}

const N = 1024
// limb brightening, normalised to 1 at the edge of a shell
const LB0 = Math.sqrt(0.03)

/** b_n of the Sérsic law (Ciotti & Bertin 1999). */
export function sersicB(n: number) {
  return 2 * n - 1 / 3 + 4 / (405 * n) + 46 / (25515 * n * n)
}

/** Adds the light of a spheroid (and its shells) to the buffer. */
export function drawSpheroid(L: Light, S: SpheroidSpec) {
  const b = sersicB(S.n)
  const prof = (r: number) => Math.exp(-b * ((r / S.re) ** (1 / S.n) - 1))
  // the profile against u = sqrt(r / rMax): fine steps where the core is steep
  const tr = new Float32Array(N + 2)
  const tg = new Float32Array(N + 2)
  const tb = new Float32Array(N + 2)
  const pix = 0.5 / S.sc
  let norm = 1
  if (S.mode === 'linear') {
    // normalise the light inside rMax to 1 (trapezoids in u: dr = 2 u rMax du)
    let acc = 0
    for (let i = 0; i <= N; i++) {
      const u = i / N
      const r = u * u * S.rMax
      const w = i === 0 || i === N ? 0.5 : 1
      acc += w * prof(r) * taper(r / S.rMax) * 2 * Math.PI * r * 2 * u * S.rMax / N
    }
    // the light per pixel is the density in the galaxy plane over the axis ratio
    norm = S.lum / (acc * S.q)
  }
  for (let i = 0; i <= N + 1; i++) {
    const u = Math.min(1, i / N)
    const r = u * u * S.rMax
    // a pixel never sees the very tip of the cusp
    const I = prof(Math.sqrt(r * r + pix * pix)) * taper(r / S.rMax)
    const v = S.mode === 'linear' ? I * norm : S.lum * I ** S.gamma
    // older, metal-rich stars in the middle: warmer colour inwards
    const c = Math.min(1, Math.sqrt(r / (S.re * 3)))
    tr[i] = v * (S.core[0] + (S.halo[0] - S.core[0]) * c)
    tg[i] = v * (S.core[1] + (S.halo[1] - S.core[1]) * c)
    tb[i] = v * (S.core[2] + (S.halo[2] - S.core[2]) * c)
  }

  const { w, h, r: LR, g: LG, b: LB } = L
  const ext = S.rMax * S.sc
  const x0 = Math.max(0, Math.floor(S.cx - ext))
  const x1 = Math.min(w - 1, Math.ceil(S.cx + ext))
  const y0 = Math.max(0, Math.floor(S.cy - ext))
  const y1 = Math.min(h - 1, Math.ceil(S.cy + ext))
  const c = Math.cos(S.pa) / S.sc
  const s = Math.sin(S.pa) / S.sc
  const invR2 = 1 / (S.rMax * S.rMax)
  const qo = S.q
  const dq = S.qCore - S.q
  const rq = S.re * 1.5
  const a4 = S.a4
  // shells: precomputed per arc
  const sh = S.shells.map(k => ({
    R: k.R,
    inv: 1 / k.R,
    cd: Math.cos(k.dir),
    sd: Math.sin(k.dir),
    cOpen: Math.cos(k.open),
    amp: k.amp,
    edge: 1.2 / (S.sc * k.R),
  }))
  const ns = sh.length
  const rShellMin = ns ? Math.min(...sh.map(k => k.R)) * 0.7 : Infinity
  const [sr, sg, sb] = S.shellColor
  for (let j = y0; j <= y1; j++) {
    const dy = j + 0.5 - S.cy
    for (let i = x0; i <= x1; i++) {
      const dx = i + 0.5 - S.cx
      // galaxy frame: u along the major axis
      const u = dx * c + dy * s
      const v = -dx * s + dy * c
      const u2 = u * u
      // rounder isophotes inside a few Re
      const r0 = u2 + v * v / (qo * qo)
      const qq = r0 < rq * rq * 16 ? qo + dq / (1 + r0 / (rq * rq)) : qo
      const vq = v / qq
      const v2 = vq * vq
      let r2 = u2 + v2
      if (a4 !== 0 && r2 > 0) {
        // cos(4 theta) of the scaled point
        const c4 = (u2 * u2 - 6 * u2 * v2 + v2 * v2) / (r2 * r2)
        const k = 1 - a4 * c4
        r2 *= k * k
      }
      const t = r2 * invR2
      if (t >= 1)
        continue
      const f = Math.sqrt(Math.sqrt(t)) * N
      const fi = f | 0
      const fr = f - fi
      const p = j * w + i
      LR[p] += tr[fi] + (tr[fi + 1] - tr[fi]) * fr
      LG[p] += tg[fi] + (tg[fi + 1] - tg[fi]) * fr
      LB[p] += tb[fi] + (tb[fi + 1] - tb[fi]) * fr
      if (ns === 0)
        continue
      const rr = Math.sqrt(r2)
      if (rr < rShellMin)
        continue
      let e = 0
      for (let k = 0; k < ns; k++) {
        const S2 = sh[k]
        const x = rr * S2.inv
        if (x > 1 + S2.edge || x < 0.7)
          continue
        // angle from the arc axis
        const ca = (u * S2.cd + vq * S2.sd) / rr
        if (ca < S2.cOpen)
          continue
        const ang = (ca - S2.cOpen) / (1 - S2.cOpen)
        const fade = ang < 0.35 ? ang / 0.35 : 1
        // limb-brightened, with a sharp but anti-aliased outer edge
        const d = 1 - x
        const lb = d > 0 ? LB0 / Math.sqrt(d * 12 + 0.03) : 1
        const cut = d >= S2.edge ? 1 : (d + S2.edge) / (2 * S2.edge)
        const inner = x > 0.9 ? 1 : (x - 0.7) / 0.2
        e += S2.amp * lb * cut * inner * inner * fade * fade
      }
      if (e > 0) {
        // a fraction of the galaxy's own light at this radius
        e *= tg[fi] + (tg[fi + 1] - tg[fi]) * fr
        LR[p] += sr * e
        LG[p] += sg * e
        LB[p] += sb * e
      }
    }
  }
}

/** 1 inside, smoothly 0 at the edge (x = r / rMax). */
function taper(x: number) {
  if (x >= 1)
    return 0
  if (x < 0.6)
    return 1
  const t = (1 - x) / 0.4
  return t * t * (3 - 2 * t)
}
