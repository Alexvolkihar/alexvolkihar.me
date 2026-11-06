// The four subjects of "Risograph", drawn as colour separations: every shape
// goes on one plate (one ink), as a solid, a flat tint or a halftone ramp.
// Plate 0 always carries the lightest ink, the last plate the darkest.
// Shapes either overprint (the inks mix where they cross) or knock out the
// other plates, which leaves the thin slivers of paper that misregistration
// opens along the edges.

import type { Rng } from '../random'
import type { Frame, Paint, Plates, Xf } from './plates'
import { chance, int, pick, range, weighted } from '../random'
import { curve, disc, ellipse, frame, leaf, line, noise1, onCurve, poly, radial, ramp, rect, tone } from './plates'

const TAU = Math.PI * 2

export type Subject = (r: Rng, P: Plates, F: Frame) => void

/** A plate other than `not`, at random. */
function other(r: Rng, K: number, not: number) {
  return (not + 1 + int(r, 0, K - 2)) % K
}

function frameRect(F: Frame) {
  return rect(F.x0 - 0.05, F.y0 - 0.05, F.x1 - F.x0 + 0.1, F.y1 - F.y0 + 0.1)
}

/** A ramp across a whole box in direction a, between two densities. */
function across(cx: number, cy: number, half: number, a: number, d0: number, d1: number): Paint {
  const dx = Math.cos(a) * half
  const dy = Math.sin(a) * half
  return ramp(cx - dx, cy - dy, cx + dx, cy + dy, [[0, d0], [1, d1]])
}

/** The paint of a flat shape: solid, tint or halftone ramp across it. */
function shapePaint(r: Rng, cx: number, cy: number, s: number): Paint {
  const kind = weighted(r, [['solid', 40], ['tint', 25], ['ramp', 35]] as const)
  const d = range(r, 0.3, 0.7)
  const a = Math.floor(r() * 8) * TAU / 8
  const d0 = range(r, 0, 0.15)
  if (kind === 'solid')
    return tone(1)
  if (kind === 'tint')
    return tone(d)
  return across(cx, cy, s * 0.5, a, d0, 1)
}

// ---------------------------------------------------------------------------
// Shapes: a poster of discs, half-discs, bars, triangles, rings, stripes and
// dot grids snapped to a grid, over a wash.
// ---------------------------------------------------------------------------

type Shape = 'disc' | 'half' | 'quarter' | 'bar' | 'triangle' | 'ring' | 'stripes' | 'dots' | 'arch'
const SHAPES: ReadonlyArray<readonly [Shape, number]> = [
  ['disc', 18],
  ['half', 14],
  ['quarter', 10],
  ['bar', 14],
  ['triangle', 10],
  ['ring', 9],
  ['stripes', 9],
  ['dots', 8],
  ['arch', 8],
]

function shapePath(type: Shape, cx: number, cy: number, s: number, rot: number, r: Rng): { path: Path2D, rule: CanvasFillRule } {
  const h = s / 2
  const T = frame(cx, cy, rot)
  const p = new Path2D()
  const rule: CanvasFillRule = type === 'ring' ? 'evenodd' : 'nonzero'
  switch (type) {
    case 'disc':
      p.arc(cx, cy, h, 0, TAU)
      break
    case 'half':
      p.arc(cx, cy, h, rot, rot + Math.PI)
      p.closePath()
      break
    case 'quarter': {
      const [ox, oy] = T(-h, h)
      p.moveTo(ox, oy)
      p.arc(ox, oy, s, rot - Math.PI / 2, rot)
      p.closePath()
      break
    }
    case 'bar': {
      const k = pick(r, [0.18, 0.28, 0.4])
      p.addPath(poly([T(-h * 1.4, -h * k), T(h * 1.4, -h * k), T(h * 1.4, h * k), T(-h * 1.4, h * k)]))
      break
    }
    case 'triangle':
      p.addPath(poly([T(-h, h), T(h, h), T(chance(r, 0.5) ? -h : 0, -h)]))
      break
    case 'ring':
      p.arc(cx, cy, h, 0, TAU)
      p.moveTo(cx + h * 0.58, cy)
      p.arc(cx, cy, h * 0.58, 0, TAU)
      break
    case 'stripes': {
      const n = int(r, 4, 7)
      const bw = s / (2 * n - 1)
      for (let i = 0; i < n; i++) {
        const y = -h + i * 2 * bw
        p.addPath(poly([T(-h, y), T(h, y), T(h, y + bw), T(-h, y + bw)]))
      }
      break
    }
    case 'dots': {
      const n = int(r, 3, 5)
      const step = s / n
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          const [x, y] = T(-h + (i + 0.5) * step, -h + (j + 0.5) * step)
          p.moveTo(x + step * 0.3, y)
          p.arc(x, y, step * 0.3, 0, TAU)
        }
      }
      break
    }
    case 'arch': {
      const [a1, a2] = [T(-h * 0.7, h), T(-h * 0.7, -h * 0.3)]
      p.moveTo(a1[0], a1[1])
      p.lineTo(a2[0], a2[1])
      const [c] = [T(0, -h * 0.3)]
      p.arc(c[0], c[1], h * 0.7, rot + Math.PI, rot + TAU)
      const b = T(h * 0.7, h)
      p.lineTo(b[0], b[1])
      p.closePath()
      break
    }
  }
  return { path: p, rule }
}

export const shapes: Subject = (r, P, F) => {
  const K = P.K
  const wash = weighted(r, [['none', 20], ['flat', 30], ['ramp', 50]] as const)
  const wd = range(r, 0.12, 0.3)
  const wa = Math.floor(r() * 8) * TAU / 8
  const cx = (F.x0 + F.x1) / 2
  const cy = (F.y0 + F.y1) / 2
  const half = Math.hypot(F.x1 - F.x0, F.y1 - F.y0) / 2
  if (wash === 'flat')
    P.fill(0, frameRect(F), tone(wd))
  else if (wash === 'ramp')
    P.fill(0, frameRect(F), across(cx, cy, half, wa, 0, wd + 0.25))

  // A long band through the whole canvas anchors wide and tall formats.
  if (chance(r, 0.55)) {
    const l = int(r, 0, K - 1)
    const vertical = chance(r, 0.5)
    const at = range(r, 0.2, 0.8)
    const th = range(r, 0.04, 0.12)
    const band = vertical ? rect(at - th / 2, F.y0 - 0.1, th, F.y1 - F.y0 + 0.2) : rect(F.x0 - 0.1, at - th / 2, F.x1 - F.x0 + 0.2, th)
    P.fill(l, band, tone(chance(r, 0.5) ? 1 : range(r, 0.4, 0.7)))
  }

  const n = int(r, 5, 8)
  const items = Array.from({ length: n }, (_, i) => {
    const type = weighted(r, SHAPES)
    // the first shape is the large anchor of the poster
    const s = i === 0 ? range(r, 0.45, 0.62) : pick(r, [0.16, 0.22, 0.3, 0.4])
    const gx = int(r, 0, 4)
    const gy = int(r, 0, 4)
    const x = 0.14 + gx * 0.18 + (i === 0 ? 0.0 : range(r, -0.02, 0.02))
    const y = 0.14 + gy * 0.18
    const rot = int(r, 0, 3) * Math.PI / 2 + (chance(r, 0.12) ? Math.PI / 4 : 0)
    return { type, s, x: i === 0 ? range(r, 0.38, 0.62) : x, y: i === 0 ? range(r, 0.38, 0.62) : y, rot }
  })
  items.sort((a, b) => b.s - a.s)
  let prev = int(r, 0, K - 1)
  for (const it of items) {
    const l = other(r, K, prev)
    prev = l
    const { path, rule } = shapePath(it.type, it.x, it.y, it.s, it.rot, r)
    const paint = shapePaint(r, it.x, it.y, it.s)
    P.fill(l, path, paint, chance(r, 0.22), rule)
  }
}

// ---------------------------------------------------------------------------
// Botanical: a bouquet in a vase in front of a sun or an arch, or sprigs of
// leaves, fronds and flowers scattered like a wallpaper.
// ---------------------------------------------------------------------------

function drawLeaf(r: Rng, P: Plates, l: number, x: number, y: number, a: number, len: number) {
  const T = frame(x, y, a)
  const kind = weighted(r, [['lance', 40], ['oval', 40], ['round', 20]] as const)
  const wid = len * (kind === 'lance' ? 0.2 : kind === 'oval' ? 0.34 : 0.5)
  const path = leaf(T, len, wid, kind === 'round' ? 0.5 : 0.4)
  const [bx, by] = T(0, 0)
  const [tx, ty] = T(len, 0)
  const paint = chance(r, 0.55) ? ramp(bx, by, tx, ty, [[0, 1], [1, range(r, 0.15, 0.45)]]) : tone(chance(r, 0.6) ? 1 : range(r, 0.45, 0.7))
  P.fill(l, path, paint)
  // midrib and veins, cut as bare paper
  const rib = len * 0.022
  P.cut(l, line(T, [[len * 0.04, 0], [len * 0.88, 0]]), rib)
  if (kind !== 'lance' && chance(r, 0.7)) {
    const nv = kind === 'round' ? 5 : int(r, 3, 5)
    for (let i = 1; i <= nv; i++) {
      const t = i / (nv + 1) * 0.85
      const w = wid * (kind === 'round' ? 0.95 : 0.62) * Math.sin(Math.PI * Math.min(1, t / 0.85))
      P.cut(l, line(T, [[len * t, 0], [len * (t + 0.12), -w]]), rib * 0.8)
      P.cut(l, line(T, [[len * t, 0], [len * (t + 0.12), w]]), rib * 0.8)
    }
  }
}

function drawFrond(r: Rng, P: Plates, l: number, x: number, y: number, a: number, len: number) {
  const bend = range(r, -0.35, 0.35)
  const T: Xf = frame(x, y, a)
  const [ex, ey] = T(len, 0)
  const [cx, cy] = T(len * 0.5, len * bend)
  P.stroke(l, curve(x, y, cx, cy, ex, ey), len * 0.018, tone(1))
  const n = int(r, 7, 12)
  const d = chance(r, 0.5) ? 1 : range(r, 0.5, 0.75)
  for (let i = 1; i <= n; i++) {
    const t = 0.12 + 0.85 * i / n
    const q = onCurve(x, y, cx, cy, ex, ey, t)
    const ll = len * 0.32 * (1 - t * 0.7)
    for (const side of [-1, 1]) {
      const ang = q.a + side * range(r, 0.75, 1.05)
      P.fill(l, leaf(frame(q.x, q.y, ang), ll, ll * 0.22), tone(d))
    }
  }
}

function drawFlower(r: Rng, P: Plates, l: number, x: number, y: number, rad: number) {
  const K = P.K
  const n = int(r, 5, 9)
  const a0 = r() * TAU
  const wid = range(r, 0.32, 0.5)
  const paint = chance(r, 0.5) ? radial(x, y, rad * 0.15, x, y, rad, [[0, 1], [1, range(r, 0.25, 0.5)]]) : tone(1)
  for (let i = 0; i < n; i++)
    P.fill(l, leaf(frame(x, y, a0 + i * TAU / n), rad, rad * wid, 0.55), paint)
  const c = other(r, K, l)
  P.fill(c, disc(x, y, rad * range(r, 0.22, 0.32)), tone(1), true)
}

function drawStem(P: Plates, l: number, ax: number, ay: number, cx: number, cy: number, bx: number, by: number, w: number) {
  P.stroke(l, curve(ax, ay, cx, cy, bx, by), w, tone(1))
}

function vase(r: Rng, P: Plates, l: number, x: number, base: number, w: number, h: number) {
  const p = new Path2D()
  const neck = w * range(r, 0.22, 0.34)
  const belly = range(r, 0.35, 0.6)
  p.moveTo(x - w * 0.3, base)
  p.bezierCurveTo(x - w * 0.62, base - h * belly * 0.4, x - w * 0.6, base - h * belly, x - neck, base - h * 0.85)
  p.lineTo(x - neck * 1.25, base - h)
  p.lineTo(x + neck * 1.25, base - h)
  p.lineTo(x + neck, base - h * 0.85)
  p.bezierCurveTo(x + w * 0.6, base - h * belly, x + w * 0.62, base - h * belly * 0.4, x + w * 0.3, base)
  p.closePath()
  const side = chance(r, 0.5) ? 1 : -1
  P.fill(l, p, ramp(x - side * w / 2, 0, x + side * w / 2, 0, [[0, 0.45], [0.3, 0.15], [1, 1]]), true)
  P.cut(-1, p, 0.004)
  // painted bands, cut as paper
  const nb = int(r, 0, 3)
  for (let i = 0; i < nb; i++) {
    const y = base - h * (0.15 + 0.2 * i)
    P.cut(l, line(frame(x, y, 0), [[-w * 0.6, 0], [w * 0.6, 0]]), h * 0.025)
  }
  return base - h
}

export const botanical: Subject = (r, P, F) => {
  const K = P.K
  const mode = weighted(r, [['bouquet', 55], ['sprigs', 45]] as const)
  if (mode === 'bouquet') {
    const back = weighted(r, [['sun', 40], ['arch', 30], ['wash', 30]] as const)
    const bd = range(r, 0.25, 0.55)
    if (back === 'sun') {
      P.fill(0, disc(0.5, range(r, 0.36, 0.46), range(r, 0.27, 0.36)), chance(r, 0.5) ? tone(bd) : ramp(0, 0.05, 0, 0.8, [[0, 0.9], [1, 0.1]]))
    }
    else if (back === 'arch') {
      const w = range(r, 0.27, 0.34)
      const p = new Path2D()
      p.moveTo(0.5 - w, 0.95)
      p.lineTo(0.5 - w, 0.42)
      p.arc(0.5, 0.42, w, Math.PI, TAU)
      p.lineTo(0.5 + w, 0.95)
      p.closePath()
      P.fill(0, p, ramp(0, 0.1, 0, 0.95, [[0, bd + 0.3], [1, 0.05]]))
    }
    else {
      P.fill(0, frameRect(F), ramp(0, F.y0, 0, F.y1, [[0, bd * 0.6], [1, 0.05]]))
    }
    // a table line under the vase
    const table = range(r, 0.86, 0.9)
    if (chance(r, 0.6))
      P.fill(other(r, K, 0), rect(F.x0 - 0.1, table, F.x1 - F.x0 + 0.2, F.y1 - table + 0.1), tone(range(r, 0.2, 0.4)))

    const vl = int(r, 0, K - 1)
    const vw = range(r, 0.2, 0.28)
    const vh = range(r, 0.2, 0.28)
    const mouth = table - vh
    const n = int(r, 6, 10)
    const stems = Array.from({ length: n }, () => {
      const a = -Math.PI / 2 + range(r, -1.05, 1.05)
      const len = range(r, 0.3, 0.52)
      const bx = 0.5 + range(r, -0.03, 0.03)
      const ex = bx + Math.cos(a) * len
      const ey = mouth + Math.sin(a) * len
      const cx = bx + Math.cos(a) * len * 0.3 + range(r, -0.06, 0.06)
      const cy = mouth + Math.sin(a) * len * 0.6
      const end = weighted(r, [['leaf', 40], ['flower', 35], ['frond', 25]] as const)
      return { a, len, bx, ex, ey, cx, cy, end, l: int(r, 0, K - 1) }
    })
    const stemPlate = K - 1
    for (const s of stems)
      drawStem(P, stemPlate, s.bx, mouth, s.cx, s.cy, s.ex, s.ey, 0.008)
    for (const s of stems) {
      // side leaves along the stem
      const q = onCurve(s.bx, mouth, s.cx, s.cy, s.ex, s.ey, range(r, 0.35, 0.65))
      if (chance(r, 0.6))
        drawLeaf(r, P, s.l, q.x, q.y, q.a + (chance(r, 0.5) ? 0.7 : -0.7), s.len * range(r, 0.3, 0.42))
      if (s.end === 'leaf')
        drawLeaf(r, P, s.l, s.ex, s.ey, Math.atan2(s.ey - s.cy, s.ex - s.cx), s.len * range(r, 0.32, 0.45))
      else if (s.end === 'frond')
        drawFrond(r, P, s.l, q.x, q.y, Math.atan2(s.ey - q.y, s.ex - q.x), s.len * 0.75)
    }
    for (const s of stems) {
      if (s.end === 'flower')
        drawFlower(r, P, s.l, s.ex, s.ey, range(r, 0.05, 0.085))
    }
    vase(r, P, vl, 0.5, table + 0.005, vw, vh)
  }
  else {
    if (chance(r, 0.7))
      P.fill(0, frameRect(F), tone(range(r, 0.08, 0.22)))
    const step = range(r, 0.2, 0.26)
    const cols = Math.ceil((F.x1 - F.x0) / step) + 1
    const rows = Math.ceil((F.y1 - F.y0) / step) + 1
    const ox = (F.x0 + F.x1) / 2 - (cols - 1) * step / 2
    const oy = (F.y0 + F.y1) / 2 - (rows - 1) * step / 2
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const x = ox + i * step + range(r, -0.3, 0.3) * step + (j % 2) * step * 0.5
        const y = oy + j * step + range(r, -0.3, 0.3) * step
        const a = r() * TAU
        const l = int(r, 0, K - 1)
        const kind = weighted(r, [['leaf', 40], ['frond', 30], ['flower', 30]] as const)
        if (kind === 'leaf')
          drawLeaf(r, P, l, x - Math.cos(a) * step * 0.4, y - Math.sin(a) * step * 0.4, a, step * range(r, 0.7, 0.95))
        else if (kind === 'frond')
          drawFrond(r, P, l, x - Math.cos(a) * step * 0.45, y - Math.sin(a) * step * 0.45, a, step * range(r, 0.85, 1.05))
        else
          drawFlower(r, P, l, x, y, step * range(r, 0.22, 0.32))
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Landscape: a sky ramp, a sun, ridges fading into mist, and a sea or hills.
// ---------------------------------------------------------------------------

export const landscape: Subject = (r, P, F) => {
  const K = P.K
  const hgt = F.y1 - F.y0
  const horizon = F.y0 + hgt * range(r, 0.5, 0.66)
  const sea = chance(r, 0.5)

  // sky: a ramp on the lightest plate, and for three inks a counter-ramp
  P.fill(0, rect(F.x0 - 0.1, F.y0 - 0.1, F.x1 - F.x0 + 0.2, horizon - F.y0 + 0.2), ramp(0, F.y0, 0, horizon, [[0, range(r, 0.45, 0.85)], [1, range(r, 0, 0.12)]]))
  if (K === 3 && chance(r, 0.6))
    P.fill(1, rect(F.x0 - 0.1, F.y0 - 0.1, F.x1 - F.x0 + 0.2, horizon - F.y0 + 0.2), ramp(0, F.y0, 0, horizon, [[0, 0], [1, range(r, 0.3, 0.55)]]))

  // the sun
  const sl = other(r, K, 0)
  const sx = range(r, 0.25, 0.75)
  const sr = range(r, 0.08, 0.15)
  const sy = horizon - range(r, 0.05, 0.25)
  P.fill(sl, disc(sx, sy, sr), chance(r, 0.5) ? tone(1) : ramp(0, sy - sr, 0, sy + sr, [[0, 1], [1, 0.3]]), chance(r, 0.4))
  if (chance(r, 0.45)) {
    // sunset bars cut through the lower half of the disc
    for (let i = 0; i < 5; i++) {
      const y = sy + sr * (0.12 + i * 0.19)
      P.cut(sl, line(frame(sx, y, 0), [[-sr, 0], [sr, 0]]), sr * 0.035 * (i + 1))
    }
  }

  // ridges, far to near
  const n = int(r, 3, 5)
  for (let i = 0; i < n; i++) {
    const t = i / Math.max(1, n - 1)
    const nz = noise1(r, 4)
    const freq = range(r, 2.5, 5) * (1 - t * 0.4)
    const amp = range(r, 0.06, 0.16) * (sea ? 1 : 1 - t * 0.4)
    const base = sea ? horizon + 0.002 : horizon + (F.y1 - horizon) * t * 0.75
    const off = r() * 100
    const pts: [number, number][] = []
    for (let x = F.x0 - 0.05; x <= F.x1 + 0.05; x += 0.004) {
      const v = nz(x * freq + off)
      const peak = sea ? Math.max(0, v * 1.6 + 0.2) : v
      pts.push([x, base - amp * (sea ? peak : 0.6 + 0.5 * peak)])
    }
    pts.push([F.x1 + 0.05, sea ? base : F.y1 + 0.1])
    pts.push([F.x0 - 0.05, sea ? base : F.y1 + 0.1])
    const l = i === n - 1 ? K - 1 : (i + 1) % K
    const top = base - amp * 1.1
    const foot = sea ? base : Math.min(F.y1, base + 0.25)
    const dTop = 0.45 + 0.55 * t
    P.fill(l, poly(pts), ramp(0, top, 0, foot, [[0, dTop], [1, range(r, 0.02, 0.2)]]), chance(r, 0.3))
  }

  if (sea) {
    const wl = K === 2 ? 1 : 2
    const water = rect(F.x0 - 0.1, horizon, F.x1 - F.x0 + 0.2, F.y1 - horizon + 0.1)
    P.fill(wl, water, ramp(0, horizon, 0, F.y1, [[0, range(r, 0.15, 0.35)], [1, range(r, 0.6, 0.9)]]))
    // swell lines cut as paper, closer together near the horizon
    let y = horizon + 0.012
    let k = 0
    while (y < F.y1 + 0.02 && k < 200) {
      const segs = int(r, 2, 6)
      for (let s = 0; s < segs; s++) {
        const x = range(r, F.x0, F.x1)
        const w = range(r, 0.03, 0.18)
        P.cut(wl, line(frame(x, y, 0), [[0, 0], [w, 0]]), 0.002 + (y - horizon) * 0.012)
      }
      y += 0.008 + (y - horizon) * 0.18
      k++
    }
    // the sun's reflection: dashes on the sun's plate
    let ry = horizon + 0.01
    let i = 0
    while (ry < F.y1 && i < 14) {
      const w = sr * (1.2 - i * 0.07) * range(r, 0.5, 1)
      if (w > 0.005)
        P.fill(sl, rect(sx - w / 2 + range(r, -0.01, 0.01), ry, w, 0.006 + i * 0.0015), tone(1))
      ry += 0.016 + i * 0.006
      i++
    }
  }

  // a few birds
  const birds = weighted(r, [[0, 50], [3, 30], [6, 20]] as const)
  for (let b = 0; b < birds; b++) {
    const x = range(r, 0.15, 0.85)
    const y = F.y0 + (horizon - F.y0) * range(r, 0.15, 0.5)
    const w = range(r, 0.012, 0.022)
    P.stroke(K - 1, line(frame(x, y, 0), [[-w, -w * 0.4], [-w * 0.3, -w * 0.5], [0, 0], [w * 0.3, -w * 0.5], [w, -w * 0.4]]), 0.003, tone(1))
  }
}

// ---------------------------------------------------------------------------
// Still life: fruit, vases and a bowl on a table against a wall, shaded with
// halftone ramps from one light.
// ---------------------------------------------------------------------------

type Thing = 'orange' | 'lemon' | 'pear' | 'bottle' | 'bowl' | 'cup'

export const stillLife: Subject = (r, P, F) => {
  const K = P.K
  const ty = range(r, 0.6, 0.68)
  const lx = chance(r, 0.5) ? -1 : 1 // light comes from this side

  // wall
  const wall = chance(r, 0.8)
  if (wall)
    P.fill(0, rect(F.x0 - 0.1, F.y0 - 0.1, F.x1 - F.x0 + 0.2, ty - F.y0 + 0.1), ramp(0, F.y0, 0, ty, [[0, range(r, 0.1, 0.35)], [1, range(r, 0.3, 0.55)]]))
  if (chance(r, 0.35) || !wall) {
    // a window or a framed picture behind the table
    const ww = range(r, 0.2, 0.3)
    const wx = range(r, 0.2, 0.8)
    P.fill(other(r, K, 0), rect(wx - ww / 2, ty - 0.45, ww, 0.3), tone(range(r, 0.35, 0.6)))
  }

  // table and cloth
  const tl = other(r, K, 0)
  const table = rect(F.x0 - 0.1, ty, F.x1 - F.x0 + 0.2, F.y1 - ty + 0.1)
  if (chance(r, 0.4)) {
    // gingham: a band of stripes on two plates, darker where they cross
    const step = range(r, 0.03, 0.05)
    const a = 0
    const b = other(r, K, 0)
    P.fill(a, table, tone(0.15))
    for (let x = F.x0 - 0.1; x < F.x1 + 0.1; x += step * 2)
      P.fill(a, rect(x, ty, step, F.y1 - ty + 0.1), tone(0.6))
    for (let y = ty; y < F.y1 + 0.1; y += step * 2)
      P.fill(b, rect(F.x0 - 0.1, y, F.x1 - F.x0 + 0.2, step), tone(0.5))
  }
  else {
    P.fill(tl, table, ramp(0, ty, 0, F.y1, [[0, range(r, 0.45, 0.7)], [1, range(r, 0.15, 0.35)]]))
  }
  P.cut(-1, line(frame(0, ty, 0), [[F.x0 - 0.1, 0], [F.x1 + 0.1, 0]]), 0.004)

  const n = int(r, 2, 4)
  const xs = Array.from({ length: n }, (_, i) => 0.2 + (i + range(r, 0.3, 0.7)) / n * 0.6)
  const things = xs.map(x => ({
    x,
    base: ty + range(r, 0.04, 0.14),
    kind: weighted(r, [['orange', 26], ['lemon', 16], ['pear', 16], ['bottle', 20], ['bowl', 10], ['cup', 12]] as ReadonlyArray<readonly [Thing, number]>),
    size: range(r, 1, 1.3),
    l: int(r, 0, K - 1),
  }))
  things.sort((a, b) => a.base - b.base)

  const shade: ReadonlyArray<readonly [number, number]> = [[0, 0.22], [0.5, 0.62], [1, 1]]
  // each object knocks out the inks behind it and keeps a thin paper outline
  const object = (l: number, path: Path2D, paint: Paint) => {
    P.fill(l, path, paint, true)
    P.cut(-1, path, 0.004)
  }
  for (const t of things) {
    const s = t.size
    const sh = K - 1
    // cast shadow on the table, away from the light
    P.darken(sh, ellipse(t.x - lx * 0.06 * s, t.base, 0.11 * s, 0.022 * s), radial(t.x - lx * 0.04 * s, t.base, 0, t.x - lx * 0.06 * s, t.base, 0.11 * s, [[0, 0.8], [1, 0]]))
    if (t.kind === 'orange' || t.kind === 'lemon') {
      const rx = (t.kind === 'orange' ? 0.075 : 0.09) * s
      const ry = (t.kind === 'orange' ? 0.075 : 0.06) * s
      const cy = t.base - ry
      object(t.l, ellipse(t.x, cy, rx, ry), radial(t.x + lx * rx * 0.4, cy - ry * 0.4, 0, t.x - lx * rx * 0.1, cy + ry * 0.1, Math.max(rx, ry) * 1.15, shade))
    }
    else if (t.kind === 'pear') {
      const R = 0.07 * s
      const cy = t.base - R
      const x = t.x
      const p = new Path2D()
      p.moveTo(x, cy - R * 1.8)
      p.bezierCurveTo(x + R * 0.45, cy - R * 1.8, x + R * 0.4, cy - R * 0.9, x + R * 0.85, cy - R * 0.5)
      p.bezierCurveTo(x + R * 1.25, cy - R * 0.1, x + R * 1.05, cy + R, x, cy + R)
      p.bezierCurveTo(x - R * 1.05, cy + R, x - R * 1.25, cy - R * 0.1, x - R * 0.85, cy - R * 0.5)
      p.bezierCurveTo(x - R * 0.4, cy - R * 0.9, x - R * 0.45, cy - R * 1.8, x, cy - R * 1.8)
      p.closePath()
      object(t.l, p, radial(x + lx * R * 0.4, cy - R * 0.9, 0, x, cy - R * 0.4, R * 1.9, shade))
      P.stroke(K - 1, line(frame(t.x, cy - R * 1.75, 0), [[0, 0], [lx * R * 0.15, -R * 0.4]]), R * 0.09, tone(1))
    }
    else if (t.kind === 'bottle') {
      vase(r, P, t.l, t.x, t.base, 0.16 * s, range(r, 0.24, 0.36) * s)
    }
    else if (t.kind === 'bowl') {
      const w = 0.17 * s
      const rim = t.base - 0.08 * s
      // fruit in the bowl first, then the bowl in front
      for (let k = 0; k < 3; k++) {
        const fx = t.x + (k - 1) * w * 0.55
        const fr = 0.055 * s
        object(other(r, K, t.l), disc(fx, rim - fr * 0.4, fr), radial(fx + lx * fr * 0.4, rim - fr, 0, fx, rim - fr * 0.4, fr * 1.15, shade))
      }
      const p = new Path2D()
      p.ellipse(t.x, rim, w, 0.08 * s, 0, 0, Math.PI)
      p.closePath()
      object(t.l, p, ramp(t.x + lx * w, 0, t.x - lx * w, 0, [[0, 0.25], [1, 1]]))
      P.cut(t.l, line(frame(t.x, rim + 0.03 * s, 0), [[-w * 0.85, 0], [w * 0.85, 0]]), 0.006 * s)
    }
    else {
      const w = 0.06 * s
      const h = 0.1 * s
      const p = rect(t.x - w, t.base - h, w * 2, h)
      P.stroke(t.l, disc(t.x - lx * w * 1.25, t.base - h * 0.55, h * 0.26), 0.012 * s, tone(1))
      object(t.l, p, ramp(t.x + lx * w, 0, t.x - lx * w, 0, [[0, 0.2], [1, 1]]))
    }
  }
}
