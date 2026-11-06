// Thin-film interference colours for the "Foam" series.
//
// A soap film (refractive index 1.33) a few hundred nanometres thick reflects
// light from its two faces; the two reflections interfere, and which
// wavelengths survive depends on the thickness. With r = (1 - n) / (1 + n) at
// the front face and -r at the back one, the reflectance at normal incidence
// is the Airy sum
//
//   R(λ) = 2r²(1 - cos δ) / (1 + r⁴ - 2r² cos δ),   δ = 4π n d / λ
//
// It is integrated over the visible spectrum against the CIE 1931 colour
// matching functions, using the multi-lobe Gaussian fits of Wyman, Sloan and
// Shirley ("Simple analytic approximations to the CIE XYZ color matching
// functions", JCGT 2(2), 2013), then converted to sRGB. The result is Newton's
// sequence of colours: black film below ~30 nm, grey and white, then straw,
// magenta, blue, and fainter, paler orders as the film thickens.
//
// The film texture is a thickness field: thin at the top (the film drains
// under gravity) and stirred by domain-warped value noise into the swirls seen
// on a real bubble. Each bubble later shows a different window of it.

import type { Rng } from '../random'

const LUT_SIZE = 512
/** Thickest film in the LUT, in nanometres. */
export const MAX_NM = 820

function lobe(x: number, mu: number, s1: number, s2: number): number {
  const t = (x - mu) / (x < mu ? s1 : s2)
  return Math.exp(-0.5 * t * t)
}

function cie(l: number): [number, number, number] {
  return [
    1.056 * lobe(l, 599.8, 37.9, 31.0) + 0.362 * lobe(l, 442.0, 16.0, 26.7) - 0.065 * lobe(l, 501.1, 20.4, 26.2),
    0.821 * lobe(l, 568.8, 46.9, 40.5) + 0.286 * lobe(l, 530.9, 16.3, 31.1),
    1.217 * lobe(l, 437.0, 11.8, 36.0) + 0.681 * lobe(l, 459.0, 26.0, 13.8),
  ]
}

function gamma(c: number): number {
  const v = Math.max(0, Math.min(1, c))
  return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055
}

let cached: { reflect: Uint8Array, transmit: Uint8Array } | null = null

/**
 * Two colour ramps over thickness 0..MAX_NM: the reflected colour (seen on a
 * dark backdrop), brightened so the first-order white reaches 1, and an
 * exaggerated transmitted colour (seen against a light backdrop).
 */
export function filmLut(): { reflect: Uint8Array, transmit: Uint8Array } {
  if (cached)
    return cached
  const n = 1.33
  const r = (1 - n) / (1 + n)
  const r2 = r * r
  const steps = 40
  const cmf: [number, number, number][] = []
  let wy = 0
  for (let s = 0; s < steps; s++) {
    const l = 390 + (s + 0.5) * (330 / steps)
    const c = cie(l)
    cmf.push(c)
    wy += c[1]
  }
  const lin: number[][] = []
  let peak = 0
  for (let k = 0; k < LUT_SIZE; k++) {
    const d = k / (LUT_SIZE - 1) * MAX_NM
    let X = 0
    let Y = 0
    let Z = 0
    for (let s = 0; s < steps; s++) {
      const l = 390 + (s + 0.5) * (330 / steps)
      const cd = Math.cos(4 * Math.PI * n * d / l)
      const R = 2 * r2 * (1 - cd) / (1 + r2 * r2 - 2 * r2 * cd)
      X += R * cmf[s][0]
      Y += R * cmf[s][1]
      Z += R * cmf[s][2]
    }
    X /= wy
    Y /= wy
    Z /= wy
    const rgb = [
      3.2406 * X - 1.5372 * Y - 0.4986 * Z,
      -0.9689 * X + 1.8758 * Y + 0.0415 * Z,
      0.0557 * X - 0.2040 * Y + 1.0570 * Z,
    ]
    peak = Math.max(peak, Y)
    lin.push(rgb)
  }
  const reflect = new Uint8Array(LUT_SIZE * 3)
  const transmit = new Uint8Array(LUT_SIZE * 3)
  for (let k = 0; k < LUT_SIZE; k++) {
    const [R, G, B] = lin[k].map(v => Math.max(0, v / peak))
    // a little extra saturation, as on a photograph against black velvet
    const m = (R + G + B) / 3
    const sat = [R, G, B].map(v => m + (v - m) * 1.25)
    for (let c = 0; c < 3; c++) {
      reflect[k * 3 + c] = Math.round(255 * gamma(sat[c] * 0.95))
      transmit[k * 3 + c] = Math.round(255 * gamma(1 - 0.45 * Math.max(0, Math.min(1, sat[c]))))
    }
  }
  cached = { reflect, transmit }
  return cached
}

/** Value noise on a shuffled 256 lattice, smoothstep-interpolated. */
export function makeNoise(r: Rng): (x: number, y: number) => number {
  const P = 256
  const perm = new Uint8Array(P * 2)
  const val = new Float32Array(P)
  const idx = Array.from({ length: P }, (_, i) => i)
  for (let i = P - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    const t = idx[i]
    idx[i] = idx[j]
    idx[j] = t
  }
  for (let i = 0; i < P * 2; i++)
    perm[i] = idx[i & 255]
  for (let i = 0; i < P; i++)
    val[i] = r()
  return (x: number, y: number) => {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const X = xi & 255
    const Y = yi & 255
    const fu = x - xi
    const fw = y - yi
    const u = fu * fu * (3 - 2 * fu)
    const w = fw * fw * (3 - 2 * fw)
    const a = val[perm[perm[X] + Y]]
    const b = val[perm[perm[X + 1] + Y]]
    const c = val[perm[perm[X] + Y + 1]]
    const d = val[perm[perm[X + 1] + Y + 1]]
    const top = a + u * (b - a)
    return top + w * (c + u * (d - c) - top)
  }
}

function fbm(nz: (x: number, y: number) => number, x: number, y: number): number {
  return (nz(x, y) * 0.57 + nz(x * 2.03 + 17.1, y * 2.03 + 3.7) * 0.29 + nz(x * 4.1 + 5.3, y * 4.1 + 41.9) * 0.14)
}

/**
 * Film thickness texture of `size` x `size` texels, already mapped to colour.
 * Its content depends only on the generator, not on `size`.
 */
export function filmTexture(r: Rng, size: number, transmit: boolean): ImageData {
  const lut = filmLut()
  const ramp = transmit ? lut.transmit : lut.reflect
  const n1 = makeNoise(r)
  const n2 = makeNoise(r)
  const n3 = makeNoise(r)
  const ox = r() * 50
  const oy = r() * 50
  const stir = 0.45 + r() * 0.3
  const img = new ImageData(size, size)
  const data = img.data
  for (let py = 0; py < size; py++) {
    const v = (py + 0.5) / size
    for (let px = 0; px < size; px++) {
      const u = (px + 0.5) / size
      // two rounds of domain warping give the marbled swirls
      const wx = fbm(n1, u * 2.4 + ox, v * 2.4 + oy) - 0.5
      const wy = fbm(n2, u * 2.4 + oy, v * 2.4 + ox) - 0.5
      const u2 = u + stir * wx
      const v2 = v + stir * wy
      const sw = fbm(n3, u2 * 3.6, v2 * 3.6) - 0.5
      let t = v2 * 0.62 + 0.34 * sw + 0.12
      t = Math.max(0, Math.min(1, t))
      const d = t ** 1.2
      const k = Math.min(LUT_SIZE - 1, Math.floor(d * (LUT_SIZE - 1))) * 3
      const o = (py * size + px) * 4
      data[o] = ramp[k]
      data[o + 1] = ramp[k + 1]
      data[o + 2] = ramp[k + 2]
      data[o + 3] = 255
    }
  }
  return img
}
