// A small sphere tracer for the 3D scenes (Spheres, Still life, Bust).
//
// Objects are signed distance functions (John C. Hart, "Sphere tracing",
// 1996); the floor and the back wall are planes intersected exactly. Soft
// shadows, the tetrahedral normal and the five-tap ambient occlusion follow
// Inigo Quilez's published articles on distance-field rendering. Marching is
// confined to a bounding sphere around the objects, so rays and shadow rays
// that miss it cost nothing.

function len(x: number, y: number, z = 0) {
  return Math.sqrt(x * x + y * y + z * z)
}

export type Sdf = (x: number, y: number, z: number) => number

export interface Scene3 {
  /** Distance to the objects (planes excluded). */
  map: Sdf
  /** Albedo of the objects at a surface point, 0..1. */
  albedo: (x: number, y: number, z: number) => number
  /** Specular strength of the objects at a surface point. */
  gloss: (x: number, y: number, z: number) => number
  bound: readonly [number, number, number, number]
  floor: { y: number, albedo: (x: number, z: number) => number } | null
  wall: { z: number, albedo: (x: number, y: number) => number } | null
  /** Tone of a ray that hits nothing. */
  sky: (dx: number, dy: number, dz: number) => number
  /** Unit vector towards the key light. */
  light: readonly [number, number, number]
  key: number
  ambient: number
  shadowK: number
  /** Distance haze towards the sky tone (0 = none). */
  haze: number
  cam: { pos: readonly [number, number, number], target: readonly [number, number, number], focal: number }
}

function sphereSpan(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, b: readonly [number, number, number, number]): [number, number] | null {
  const lx = ox - b[0]
  const ly = oy - b[1]
  const lz = oz - b[2]
  const bb = lx * dx + ly * dy + lz * dz
  const c = lx * lx + ly * ly + lz * lz - b[3] * b[3]
  const disc = bb * bb - c
  if (disc < 0)
    return null
  const s = Math.sqrt(disc)
  const t1 = -bb + s
  if (t1 < 0)
    return null
  return [Math.max(0, -bb - s), t1]
}

/**
 * Renders the scene into `tone` (gw×gh). `n` is the number of cells along the
 * short side: screen coordinates are measured in short sides, so a wider
 * canvas widens the field of view instead of stretching the scene.
 */
export function renderScene(sc: Scene3, tone: Float32Array, gw: number, gh: number, n: number) {
  const [px0, py0, pz0] = sc.cam.pos
  let wx = sc.cam.target[0] - px0
  let wy = sc.cam.target[1] - py0
  let wz = sc.cam.target[2] - pz0
  let l = len(wx, wy, wz)
  wx /= l
  wy /= l
  wz /= l
  // right = w × up(0,1,0), up = right × w
  let ux = -wz
  let uz = wx
  l = len(ux, uz)
  ux /= l
  uz /= l
  const vx = -uz * wy
  const vy = uz * wx - ux * wz
  const vz = ux * wy
  const [Lx, Ly, Lz] = sc.light
  const map = sc.map
  const b = sc.bound
  const fl = sc.floor
  const wall = sc.wall
  // Shadow rays start marching in a wider sphere: a ray that passes close to
  // an object, without entering its bound, still lies in its penumbra.
  const sb = [b[0], b[1], b[2], b[3] + 0.35] as const

  const aoMap = (x: number, y: number, z: number) => {
    let d = map(x, y, z)
    if (fl)
      d = Math.min(d, y - fl.y)
    if (wall)
      d = Math.min(d, z - wall.z)
    return d
  }

  const shadow = (x: number, y: number, z: number) => {
    const span = sphereSpan(x, y, z, Lx, Ly, Lz, sb)
    if (!span)
      return 1
    let res = 1
    let t = Math.max(span[0], 0.035)
    for (let k = 0; k < 32 && t < span[1]; k++) {
      const h = map(x + Lx * t, y + Ly * t, z + Lz * t)
      if (h < 0.0005)
        return 0
      res = Math.min(res, sc.shadowK * h / t)
      t += Math.min(Math.max(h, 0.012), 0.25)
    }
    res = Math.max(0, res)
    return res * res * (3 - 2 * res)
  }

  const nearBound = (x: number, y: number, z: number, m: number) => {
    const dx = x - b[0]
    const dy = y - b[1]
    const dz = z - b[2]
    return dx * dx + dy * dy + dz * dz < (b[3] + m) * (b[3] + m)
  }

  const ao = (x: number, y: number, z: number, nx: number, ny: number, nz: number) => {
    if (!nearBound(x, y, z, 0.35))
      return 1
    let occ = 0
    let sca = 1
    for (let i = 1; i <= 5; i++) {
      const hr = 0.02 + 0.07 * i
      const d = aoMap(x + nx * hr, y + ny * hr, z + nz * hr)
      occ += Math.max(0, hr - d) * sca
      sca *= 0.75
    }
    return Math.min(1, Math.max(0, 1 - 1.6 * occ))
  }

  const f = sc.cam.focal
  let kind = 0 // 0 sky, 1 object, 2 floor, 3 wall
  const shade = (sx: number, sy: number): number => {
    let dx = ux * sx + vx * sy + wx * f
    let dy = vy * sy + wy * f
    let dz = uz * sx + vz * sy + wz * f
    l = len(dx, dy, dz)
    dx /= l
    dy /= l
    dz /= l

    let tHit = Infinity
    kind = 0
    if (fl && dy < 0) {
      const t = (fl.y - py0) / dy
      if (t > 0) {
        tHit = t
        kind = 2
      }
    }
    if (wall && dz < 0) {
      const t = (wall.z - pz0) / dz
      if (t > 0 && t < tHit) {
        tHit = t
        kind = 3
      }
    }
    const span = sphereSpan(px0, py0, pz0, dx, dy, dz, b)
    if (span && span[0] < tHit) {
      let t = span[0]
      const tEnd = Math.min(span[1], tHit)
      for (let k = 0; k < 90 && t < tEnd; k++) {
        const h = map(px0 + dx * t, py0 + dy * t, pz0 + dz * t)
        if (h < 0.0004 * (1 + t)) {
          tHit = t
          kind = 1
          break
        }
        t += h
      }
    }

    let v: number
    if (kind === 0) {
      v = sc.sky(dx, dy, dz)
    }
    else {
      const x = px0 + dx * tHit
      const y = py0 + dy * tHit
      const z = pz0 + dz * tHit
      let nx = 0
      let ny = 0
      let nz = 0
      let alb: number
      let gl = 0
      if (kind === 1) {
        const e = 0.0012
        const a = map(x + e, y - e, z - e)
        const bq = map(x - e, y - e, z + e)
        const c = map(x - e, y + e, z - e)
        const d = map(x + e, y + e, z + e)
        nx = a - bq - c + d
        ny = -a - bq + c + d
        nz = -a + bq - c + d
        const nl = len(nx, ny, nz) || 1
        nx /= nl
        ny /= nl
        nz /= nl
        alb = sc.albedo(x, y, z)
        gl = sc.gloss(x, y, z)
      }
      else if (kind === 2) {
        ny = 1
        alb = fl!.albedo(x, z)
      }
      else {
        nz = 1
        alb = wall!.albedo(x, y)
      }
      const diff = nx * Lx + ny * Ly + nz * Lz
      let sh = 0
      if (diff > 0)
        sh = shadow(x + nx * 0.01, y + ny * 0.01, z + nz * 0.01)
      const occ = ao(x, y, z, nx, ny, nz)
      v = alb * (sc.key * Math.max(0, diff) * sh + sc.ambient * occ * (0.65 + 0.35 * ny))
      if (gl > 0 && diff > 0) {
      // Blinn–Phong highlight
        let hx = Lx - dx
        let hy = Ly - dy
        let hz = Lz - dz
        const hl = len(hx, hy, hz)
        hx /= hl
        hy /= hl
        hz /= hl
        const c = Math.max(0, nx * hx + ny * hy + nz * hz)
        const c2 = c * c
        const c4 = c2 * c2
        const c16 = c4 * c4 * c4 * c4
        v += gl * c16 * c16 * c2 * sh
      }
      if (sc.haze > 0) {
        const fog = Math.exp(-sc.haze * tHit)
        v = v * fog + sc.sky(dx, Math.max(dy, 0), dz) * (1 - fog)
      }
    }
    return v
  }

  // Adaptive sampling: shade one cell in two, three or four (finer grids),
  // then fill the cells in between by bilinear interpolation when the four
  // surrounding samples hit the same kind of surface with close tones, and
  // shade them exactly otherwise.
  const step = n >= 180 ? 4 : n >= 140 ? 3 : 2
  const xs: number[] = []
  for (let i = 0; i < gw; i += step)
    xs.push(i)
  if (xs[xs.length - 1] !== gw - 1)
    xs.push(gw - 1)
  const ys: number[] = []
  for (let j = 0; j < gh; j += step)
    ys.push(j)
  if (ys[ys.length - 1] !== gh - 1)
    ys.push(gh - 1)
  const cols = xs.length
  const cv = new Float32Array(cols * ys.length)
  const ck = new Uint8Array(cols * ys.length)
  const sxOf = (i: number) => (i + 0.5 - gw / 2) / n
  const syOf = (j: number) => (gh / 2 - (j + 0.5)) / n
  for (let yb = 0; yb < ys.length; yb++) {
    for (let xa = 0; xa < cols; xa++) {
      cv[yb * cols + xa] = shade(sxOf(xs[xa]), syOf(ys[yb]))
      ck[yb * cols + xa] = kind
      tone[ys[yb] * gw + xs[xa]] = cv[yb * cols + xa]
    }
  }
  for (let yb = 0; yb + 1 < ys.length; yb++) {
    const j0 = ys[yb]
    const j1 = ys[yb + 1]
    for (let xa = 0; xa + 1 < cols; xa++) {
      const i0 = xs[xa]
      const i1 = xs[xa + 1]
      const k00 = yb * cols + xa
      const v00 = cv[k00]
      const v10 = cv[k00 + 1]
      const v01 = cv[k00 + cols]
      const v11 = cv[k00 + cols + 1]
      const k = ck[k00]
      const smooth = k === ck[k00 + 1] && k === ck[k00 + cols] && k === ck[k00 + cols + 1]
        && Math.max(v00, v10, v01, v11) - Math.min(v00, v10, v01, v11) < 0.06
      for (let j = j0; j <= j1; j++) {
        const ty = (j - j0) / (j1 - j0)
        for (let i = i0; i <= i1; i++) {
          if ((i === i0 || i === i1) && (j === j0 || j === j1))
            continue
          if (smooth) {
            const tx = (i - i0) / (i1 - i0)
            const top = v00 + (v10 - v00) * tx
            tone[j * gw + i] = top + (v01 + (v11 - v01) * tx - top) * ty
          }
          else {
            tone[j * gw + i] = shade(sxOf(i), syOf(j))
          }
        }
      }
    }
  }
}
