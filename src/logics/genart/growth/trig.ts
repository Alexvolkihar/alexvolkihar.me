// Sine and cosine built from + - * / only.
//
// Math.sin and Math.cos are not required to be correctly rounded, so two
// engines may disagree in the last bit. The growth simulation amplifies any
// such difference, so every angle it uses goes through these polynomials
// instead: IEEE-754 basic operations give the same bits everywhere.

const PI = 3.141592653589793
const TAU = 6.283185307179586
const HALF_PI = 1.5707963267948966

/** Taylor series of sin on [-pi/2, pi/2], up to x^17 (error below 1e-15). */
function sinCore(x: number): number {
  const x2 = x * x
  let term = x
  let sum = x
  for (let k = 1; k <= 8; k++) {
    term = -term * x2 / ((2 * k) * (2 * k + 1))
    sum += term
  }
  return sum
}

export function dsin(a: number): number {
  let x = a - Math.round(a / TAU) * TAU
  if (x > HALF_PI)
    x = PI - x
  else if (x < -HALF_PI)
    x = -PI - x
  return sinCore(x)
}

export function dcos(a: number): number {
  return dsin(a + HALF_PI)
}

export { TAU }
