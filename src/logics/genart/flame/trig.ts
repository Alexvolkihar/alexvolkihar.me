// Deterministic sine, cosine and arctangent for the chaos game.
//
// The orbit of an iterated function system visits millions of points, and
// Math.sin / Math.atan2 are allowed to differ in their last bit between
// JavaScript engines. Only +, -, *, / and sqrt are exactly specified by IEEE
// 754, so everything here is built from those: the sine table is filled with
// a Taylor series, the arctangent is the polynomial of Abramowitz & Stegun
// (4.4.49, error below 2e-8 rad). The same hash then gives the same flame in
// every browser, and the table is faster than Math.sin as well.

const N = 8192
const MASK = N - 1
const TO_TABLE = N / (2 * Math.PI)
const QUARTER = N / 4

export const PI = 3.141592653589793

function taylorSin(x: number): number {
  const x2 = x * x
  let term = x
  let sum = x
  for (let k = 1; k < 14; k++) {
    term *= -x2 / ((2 * k) * (2 * k + 1))
    sum += term
  }
  return sum
}

export const SIN_TABLE = (() => {
  const t = new Float64Array(N + 1)
  for (let k = 0; k <= QUARTER; k++) {
    const s = taylorSin((2 * PI * k) / N)
    t[k] = s
    t[N / 2 - k] = s
    t[N / 2 + k] = -s
    t[(N - k) & MASK] = -s
  }
  t[0] = 0
  t[N / 2] = 0
  t[N] = 0
  return t
})()

/**
 * Sine by linear interpolation in the table. Any finite argument works:
 * Math.floor and the integer mask reduce it exactly. A non-finite argument
 * gives NaN, which the chaos game treats as an escaped point.
 */
export function tsin(x: number): number {
  const q = x * TO_TABLE
  const i = Math.floor(q)
  const k = i & MASK
  return SIN_TABLE[k] + (q - i) * (SIN_TABLE[k + 1] - SIN_TABLE[k])
}

export function tcos(x: number): number {
  const q = x * TO_TABLE + QUARTER
  const i = Math.floor(q)
  const k = i & MASK
  return SIN_TABLE[k] + (q - i) * (SIN_TABLE[k + 1] - SIN_TABLE[k])
}

/** atan2(y, x) in (-PI, PI], from a degree-15 odd polynomial on [0, 1]. */
export function tatan2(y: number, x: number): number {
  const ax = x < 0 ? -x : x
  const ay = y < 0 ? -y : y
  const big = ax > ay ? ax : ay
  if (big === 0)
    return 0
  const z = (ax > ay ? ay : ax) / big
  const s = z * z
  let r = z * (0.9999993329 + s * (-0.3332985605 + s * (0.1994653599 + s * (-0.1390853351
    + s * (0.0964200441 + s * (-0.0559098861 + s * (0.0218612288 + s * -0.004054058)))))))
  if (ay > ax)
    r = PI / 2 - r
  if (x < 0)
    r = PI - r
  return y < 0 ? -r : r
}
