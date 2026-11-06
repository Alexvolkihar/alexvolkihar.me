// Logarithm and square root built from + - * / only.
//
// Math.log and friends are "implementation-approximated" in the ECMAScript
// spec, so two engines may disagree in the last bit. Escape-time fractals are
// chaotic: one ulp in a smooth-colouring term is invisible, but one ulp fed
// back into a framing decision (the entropy test, a median) could pick another
// frame. These versions read the binary exponent straight from the IEEE 754
// bits (exact) and only use + - * / on the mantissa, so they return the same
// bits in every engine.

const LN2 = 0.6931471805599453
const SQRT2 = 1.4142135623730951

const f64 = new Float64Array(1)
const u32 = new Uint32Array(f64.buffer)
// index of the high word (sign, exponent, top of the mantissa)
const HI = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1 ? 1 : 0

/** ln(m) for m in [1/sqrt2, sqrt2], by the atanh series (slow, exact ops). */
function lnSeries(m: number): number {
  const s = (m - 1) / (m + 1)
  const s2 = s * s
  return s * (2 + s2 * (2 / 3 + s2 * (2 / 5 + s2 * (2 / 7 + s2 * (2 / 9 + s2 * (2 / 11 + s2 * (2 / 13 + s2 * (2 / 15))))))))
}

// ln(1 + k / 64), k = 0..64, built once with the series above.
const LN_TABLE = new Float64Array(65)
for (let k = 0; k <= 64; k++) {
  const m = 1 + k / 64
  LN_TABLE[k] = m > SQRT2 ? lnSeries(m / 2) + LN2 : lnSeries(m)
}

/** Natural logarithm. Returns -Infinity for x <= 0. */
export function ln(x: number): number {
  if (!(x > 0))
    return -Infinity
  if (x === Infinity)
    return Infinity
  let e = 0
  if (x < 2.2250738585072014e-308) {
    // subnormal: scale into the normal range first (exact)
    x *= 18014398509481984 // 2^54
    e = -54
  }
  f64[0] = x
  const hi = u32[HI]
  e += ((hi >>> 20) & 0x7FF) - 1023
  // same mantissa, exponent 0: m in [1, 2)
  u32[HI] = (hi & 0x000FFFFF) | 0x3FF00000
  const m = f64[0]
  // m = t (1 + r) with t = 1 + k/64 from the table and 0 <= r < 1/64
  const k = (hi >>> 14) & 63
  const t = 1 + k / 64
  const r = (m - t) / t
  const lr = r * (1 + r * (-1 / 2 + r * (1 / 3 + r * (-1 / 4 + r * (1 / 5)))))
  return LN_TABLE[k] + lr + e * LN2
}

/** Square root by Newton's method on a mantissa scaled into [1, 4). */
export function sqrt(x: number): number {
  if (!(x > 0))
    return 0
  if (x === Infinity)
    return Infinity
  let k = 0
  if (x < 2.2250738585072014e-308) {
    x *= 18014398509481984 // 2^54
    k = -54
  }
  f64[0] = x
  const hi = u32[HI]
  k += ((hi >>> 20) & 0x7FF) - 1023
  u32[HI] = (hi & 0x000FFFFF) | 0x3FF00000
  let m = f64[0]
  // x = m 2^k with k even, m in [1, 4)
  if (k & 1) {
    m *= 2
    k--
  }
  // linear first guess (error < 0.06 on [1, 4]), then four quadratic steps
  let g = 0.3333 * m + 0.7
  g = 0.5 * (g + m / g)
  g = 0.5 * (g + m / g)
  g = 0.5 * (g + m / g)
  g = 0.5 * (g + m / g)
  // times 2^(k/2), built exactly in the exponent field
  u32[HI] = ((k / 2 + 1023) << 20) >>> 0
  u32[1 - HI] = 0
  return g * f64[0]
}
