// Eccentric orbits for "Orbits": Keplerian ellipses with the system centre at
// one focus, and bodies placed at equal steps of time along them.
//
// Equal steps of time are equal steps of the mean anomaly M. The position on
// the ellipse needs the eccentric anomaly E, the root of Kepler's equation
// M = E - e sin E, found with Newton's method. Bodies then bunch up far from
// the focus and spread out near it, as Kepler's second law says they should.

export interface Orbit {
  /** Focus (the system centre), semi-major axis, eccentricity, apse angle. */
  fx: number
  fy: number
  a: number
  e: number
  omega: number
}

/** Root of Kepler's equation M = E - e sin E, for 0 <= e < 1. */
export function eccentricAnomaly(M: number, e: number): number {
  let E = e < 0.8 ? M : Math.PI
  for (let i = 0; i < 12; i++) {
    const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E))
    E -= d
    if (Math.abs(d) < 1e-10)
      break
  }
  return E
}

/** Position on the orbit at mean anomaly M (radians, measured from periapsis). */
export function orbitPoint(o: Orbit, M: number): readonly [number, number] {
  const E = eccentricAnomaly(M, o.e)
  const b = o.a * Math.sqrt(1 - o.e * o.e)
  // relative to the focus, periapsis on the +x axis
  const x = o.a * (Math.cos(E) - o.e)
  const y = b * Math.sin(E)
  const c = Math.cos(o.omega)
  const s = Math.sin(o.omega)
  return [o.fx + x * c - y * s, o.fy + x * s + y * c]
}

/** Adds the whole ellipse to the current path. */
export function traceOrbit(g: CanvasRenderingContext2D, o: Orbit) {
  const b = o.a * Math.sqrt(1 - o.e * o.e)
  const cx = o.fx - o.a * o.e * Math.cos(o.omega)
  const cy = o.fy - o.a * o.e * Math.sin(o.omega)
  g.moveTo(cx + o.a * Math.cos(o.omega), cy + o.a * Math.sin(o.omega))
  g.ellipse(cx, cy, o.a, b, o.omega, 0, Math.PI * 2)
}
