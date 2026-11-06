// Stable Fluids on a small fixed grid, after Jos Stam.
//
// The velocity field lives on a collocated grid of nx x ny cells with a
// one-cell ghost border (Stam's layout: interior cell i has its centre at
// x = i, the walls run along x = 0.5 and x = nx + 0.5). One step is:
//
//   forces (jets, buoyancy, vorticity confinement), times dt
//   -> optional viscous diffusion (implicit, Jacobi)
//   -> semi-Lagrangian self-advection
//   -> pressure projection (Jacobi iterations on the Poisson equation)
//
// then the dye, held on a grid twice as fine, is carried by the projected
// velocity. References: J. Stam, "Stable Fluids" (SIGGRAPH 1999) and
// "Real-Time Fluid Dynamics for Games" (GDC 2003); vorticity confinement from
// R. Fedkiw, J. Stam and H. W. Jensen, "Visual Simulation of Smoke"
// (SIGGRAPH 2001); the Jacobi pressure solve as in M. Harris, "Fast Fluid
// Dynamics Simulation on the GPU" (GPU Gems, 2004).
//
// Determinism: the step loop only uses + - * /, comparisons, Math.floor,
// Math.abs and Math.sqrt (all exactly specified by IEEE 754), so a hash gives
// bit-identical fields in every engine. No exp or trig runs inside the loop.

export interface Fluid {
  nx: number
  ny: number
  /** Row stride of the velocity arrays: nx + 2. */
  s: number
  u: Float32Array
  v: Float32Array
  u0: Float32Array
  v0: Float32Array
  p: Float32Array
  p0: Float32Array
  div: Float32Array
  curl: Float32Array
  /** Dye grid: (2 nx) x (2 ny) cells, one plane per ink. */
  dw: number
  dh: number
  dye: Float32Array[]
  dye0: Float32Array
  /** Back-trace scratch: source cell and fractions per dye cell. */
  q: Int32Array
  tx: Float32Array
  ty: Float32Array
}

export function makeFluid(nx: number, ny: number, k: number): Fluid {
  const n = (nx + 2) * (ny + 2)
  const dn = 4 * nx * ny
  return {
    nx,
    ny,
    s: nx + 2,
    u: new Float32Array(n),
    v: new Float32Array(n),
    u0: new Float32Array(n),
    v0: new Float32Array(n),
    p: new Float32Array(n),
    p0: new Float32Array(n),
    div: new Float32Array(n),
    curl: new Float32Array(n),
    dw: 2 * nx,
    dh: 2 * ny,
    dye: Array.from({ length: k }, () => new Float32Array(dn)),
    dye0: new Float32Array(dn),
    q: new Int32Array(dn),
    tx: new Float32Array(dn),
    ty: new Float32Array(dn),
  }
}

/**
 * Wall conditions (Stam's set_bnd): b = 1 mirrors the x component across the
 * left and right walls, b = 2 the y component across the top and bottom,
 * b = 0 copies a scalar into the ghost cells.
 */
export function walls(f: Fluid, b: 0 | 1 | 2, x: Float32Array): void {
  const { nx, ny, s } = f
  const last = (ny + 1) * s
  for (let i = 1; i <= nx; i++) {
    x[i] = b === 2 ? -x[s + i] : x[s + i]
    x[last + i] = b === 2 ? -x[last - s + i] : x[last - s + i]
  }
  for (let j = 1; j <= ny; j++) {
    const r = j * s
    x[r] = b === 1 ? -x[r + 1] : x[r + 1]
    x[r + nx + 1] = b === 1 ? -x[r + nx] : x[r + nx]
  }
  x[0] = 0.5 * (x[1] + x[s])
  x[nx + 1] = 0.5 * (x[nx] + x[s + nx + 1])
  x[last] = 0.5 * (x[last + 1] + x[last - s])
  x[last + nx + 1] = 0.5 * (x[last + nx] + x[last - s + nx + 1])
}

/** Bilinear sample of a padded velocity-grid array at (x, y) in cell units. */
function sample(a: Float32Array, s: number, nx: number, ny: number, x: number, y: number): number {
  x = Math.min(nx + 0.4999, Math.max(0.5, x))
  y = Math.min(ny + 0.4999, Math.max(0.5, y))
  const i = Math.floor(x)
  const j = Math.floor(y)
  const tx = x - i
  const ty = y - j
  const o = j * s + i
  const a0 = a[o] + (a[o + 1] - a[o]) * tx
  const a1 = a[o + s] + (a[o + s + 1] - a[o + s]) * tx
  return a0 + (a1 - a0) * ty
}

/** Semi-Lagrangian self-advection of the velocity over a time step dt. */
export function advectVelocity(f: Fluid, dt: number): void {
  const { nx, ny, s, u, v, u0, v0 } = f
  u0.set(u)
  v0.set(v)
  for (let j = 1; j <= ny; j++) {
    let o = j * s + 1
    for (let i = 1; i <= nx; i++, o++) {
      const x = i - dt * u0[o]
      const y = j - dt * v0[o]
      u[o] = sample(u0, s, nx, ny, x, y)
      v[o] = sample(v0, s, nx, ny, x, y)
    }
  }
  walls(f, 1, u)
  walls(f, 2, v)
}

/** Implicit viscous diffusion, (I - a laplacian) u = u0, by Jacobi sweeps. */
export function diffuse(f: Fluid, a: number, iterations: number): void {
  const { nx, ny, s } = f
  const c = 1 / (1 + 4 * a)
  for (const [b, x, x0] of [[1, f.u, f.u0], [2, f.v, f.v0]] as const) {
    x0.set(x)
    const tmp = f.p0
    for (let it = 0; it < iterations; it++) {
      for (let j = 1; j <= ny; j++) {
        let o = j * s + 1
        for (let i = 1; i <= nx; i++, o++)
          tmp[o] = (x0[o] + a * (x[o - 1] + x[o + 1] + x[o - s] + x[o + s])) * c
      }
      for (let j = 1; j <= ny; j++) {
        const o = j * s + 1
        x.set(tmp.subarray(o, o + nx), o)
      }
      walls(f, b, x)
    }
  }
}

/**
 * Pressure projection: makes the velocity divergence-free. The pressure of
 * the previous step is the starting guess, so a fixed, small number of
 * Jacobi iterations keeps converging over the run.
 */
export function project(f: Fluid, iterations: number): void {
  const { nx, ny, s, u, v, div } = f
  let p = f.p
  let q = f.p0
  for (let j = 1; j <= ny; j++) {
    let o = j * s + 1
    for (let i = 1; i <= nx; i++, o++)
      div[o] = -0.5 * (u[o + 1] - u[o - 1] + v[o + s] - v[o - s])
  }
  walls(f, 0, div)
  walls(f, 0, p)
  for (let it = 0; it < iterations; it++) {
    for (let j = 1; j <= ny; j++) {
      let o = j * s + 1
      for (let i = 1; i <= nx; i++, o++)
        q[o] = 0.25 * (div[o] + p[o - 1] + p[o + 1] + p[o - s] + p[o + s])
    }
    walls(f, 0, q)
    const t = p
    p = q
    q = t
  }
  if (p !== f.p)
    f.p.set(p)
  p = f.p
  for (let j = 1; j <= ny; j++) {
    let o = j * s + 1
    for (let i = 1; i <= nx; i++, o++) {
      u[o] -= 0.5 * (p[o + 1] - p[o - 1])
      v[o] -= 0.5 * (p[o + s] - p[o - s])
    }
  }
  walls(f, 1, u)
  walls(f, 2, v)
}

/**
 * Vorticity confinement: pushes along N x w, where N points up the gradient
 * of |w|, so small eddies that numerical dissipation would smear out are fed
 * back. eps is in cells per step squared.
 */
export function confine(f: Fluid, eps: number): void {
  if (eps <= 0)
    return
  const { nx, ny, s, u, v, curl } = f
  for (let j = 1; j <= ny; j++) {
    let o = j * s + 1
    for (let i = 1; i <= nx; i++, o++)
      curl[o] = 0.5 * (v[o + 1] - v[o - 1] - u[o + s] + u[o - s])
  }
  for (let j = 2; j < ny; j++) {
    let o = j * s + 2
    for (let i = 2; i < nx; i++, o++) {
      const gx = 0.5 * (Math.abs(curl[o + 1]) - Math.abs(curl[o - 1]))
      const gy = 0.5 * (Math.abs(curl[o + s]) - Math.abs(curl[o - s]))
      const len = Math.sqrt(gx * gx + gy * gy) + 1e-6
      const w = curl[o] * eps / len
      u[o] += gy * w
      v[o] -= gx * w
    }
  }
}

/**
 * Buoyancy: every velocity cell is pushed along y by -lift times the total
 * dye density of the four dye cells it covers (lift > 0 rises, < 0 sinks).
 */
export function buoyancy(f: Fluid, lift: number): void {
  if (lift === 0)
    return
  const { nx, ny, s, v, dye, dw } = f
  const c = -lift * 0.25
  for (const d of dye) {
    for (let j = 1; j <= ny; j++) {
      let o = j * s + 1
      let a = (2 * (j - 1)) * dw
      for (let i = 1; i <= nx; i++, o++, a += 2)
        v[o] += c * (d[a] + d[a + 1] + d[a + dw] + d[a + dw + 1])
    }
  }
}

/**
 * Semi-Lagrangian advection of every dye plane by the current velocity: the
 * back-trace is computed once per dye cell, then shared by all the planes.
 */
export function advectDye(f: Fluid, dt: number): void {
  const { s, u, v, dw, dh, dye, dye0, q, tx, ty } = f
  const maxX = dw - 1.0001
  const maxY = dh - 1.0001
  const row = dw
  const k = 2 * dt
  for (let b = 0; b < dh; b++) {
    // Dye cell b has its centre at y = 0.75 + b / 2 in velocity cells, so it
    // always sits a quarter or three quarters of the way between two velocity
    // rows (the ghost row included): the bilinear weights are fixed.
    const jv = (b + 1) >> 1
    const wy = (b & 1) ? 0.25 : 0.75
    const r0 = jv * s
    const r1 = r0 + s
    let o = b * row
    for (let a = 0; a < dw; a++, o++) {
      const iv = (a + 1) >> 1
      const wx = (a & 1) ? 0.25 : 0.75
      const p0 = r0 + iv
      const p1 = r1 + iv
      const u0r = u[p0] + (u[p0 + 1] - u[p0]) * wx
      const u1r = u[p1] + (u[p1 + 1] - u[p1]) * wx
      const v0r = v[p0] + (v[p0 + 1] - v[p0]) * wx
      const v1r = v[p1] + (v[p1 + 1] - v[p1]) * wx
      // back-trace, in dye cells (two per velocity cell); min/max rather
      // than branches: the clamps are unpredictable and this loop is hot
      const fx = Math.min(maxX, Math.max(0, a - k * (u0r + (u1r - u0r) * wy)))
      const fy = Math.min(maxY, Math.max(0, b - k * (v0r + (v1r - v0r) * wy)))
      const i = Math.floor(fx)
      const j = Math.floor(fy)
      q[o] = j * row + i
      tx[o] = fx - i
      ty[o] = fy - j
    }
  }
  // then every ink plane is resampled with the same weights
  const n = dw * dh
  for (const d of dye) {
    dye0.set(d)
    for (let o = 0; o < n; o++) {
      const p = q[o]
      const t = tx[o]
      const t0 = dye0[p] + (dye0[p + 1] - dye0[p]) * t
      const t1 = dye0[p + row] + (dye0[p + row + 1] - dye0[p + row]) * t
      d[o] = t0 + (t1 - t0) * ty[o]
    }
  }
}

/**
 * Adds a compact smooth bump (1 - d^2 / R^2)^3 to the velocity, centred at
 * (x, y) in velocity cells, with radius R in cells.
 */
export function splatForce(f: Fluid, x: number, y: number, R: number, fx: number, fy: number): void {
  const { nx, ny, s, u, v } = f
  const i0 = Math.max(1, Math.floor(x - R))
  const i1 = Math.min(nx, Math.ceil(x + R))
  const j0 = Math.max(1, Math.floor(y - R))
  const j1 = Math.min(ny, Math.ceil(y + R))
  const r2 = 1 / (R * R)
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const dx = i - x
      const dy = j - y
      const t = 1 - (dx * dx + dy * dy) * r2
      if (t <= 0)
        continue
      const w = t * t * t
      const o = j * s + i
      u[o] += fx * w
      v[o] += fy * w
    }
  }
}

/** Same bump, added to one dye channel; (x, y) and R in velocity cells. */
export function splatDye(f: Fluid, x: number, y: number, R: number, c: number, amount: number): void {
  const { dw, dh, dye } = f
  const d = dye[c]
  // to dye cells
  const X = (x - 0.75) * 2
  const Y = (y - 0.75) * 2
  const RR = R * 2
  const a0 = Math.max(0, Math.floor(X - RR))
  const a1 = Math.min(dw - 1, Math.ceil(X + RR))
  const b0 = Math.max(0, Math.floor(Y - RR))
  const b1 = Math.min(dh - 1, Math.ceil(Y + RR))
  const r2 = 1 / (RR * RR)
  for (let b = b0; b <= b1; b++) {
    for (let a = a0; a <= a1; a++) {
      const dx = a - X
      const dy = b - Y
      const t = 1 - (dx * dx + dy * dy) * r2
      if (t <= 0)
        continue
      d[b * dw + a] += amount * t * t * t
    }
  }
}

/**
 * Adds a solid-body-like eddy: tangential speed w r (1 - r^2 / R^2)^2 / R,
 * peaking near R / 2.2. (x, y), R in velocity cells, w in cells per step.
 */
export function swirl(f: Fluid, x: number, y: number, R: number, w: number): void {
  const { nx, ny, s, u, v } = f
  const i0 = Math.max(1, Math.floor(x - R))
  const i1 = Math.min(nx, Math.ceil(x + R))
  const j0 = Math.max(1, Math.floor(y - R))
  const j1 = Math.min(ny, Math.ceil(y + R))
  const r2 = 1 / (R * R)
  const k = 2.2 * w / R
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const dx = i - x
      const dy = j - y
      const t = 1 - (dx * dx + dy * dy) * r2
      if (t <= 0)
        continue
      const o = j * s + i
      u[o] -= dy * k * t * t
      v[o] += dx * k * t * t
    }
  }
}
