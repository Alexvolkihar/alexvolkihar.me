// Vector details drawn over the pixel pass: medullary rays, radial drying
// checks of log ends, end checks of boards, and board seams for the print.
//
// Each object draws from its own generator (keyed by its seed), so what is
// drawn on one log never depends on what else is visible.

import type { Rng } from '../random'
import type { Board, Finish, Piece, Round } from './raster'
import type { RGB, Species } from './species'
import { gaussian, int, range } from '../random'
import { barkEdge, rayRadius } from './raster'
import { subRng } from './tree'

const TAU = Math.PI * 2

const css = (c: RGB, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`

function pointAt(o: Round, th: number, t: number): [number, number] {
  const cu = Math.cos(th)
  const su = Math.sin(th)
  const r = t * rayRadius(o, cu, su)
  return [o.px + r * cu, o.py + r * su]
}

function outline(g: CanvasRenderingContext2D, o: Round, bark: boolean) {
  g.beginPath()
  const n = 360
  for (let i = 0; i <= n; i++) {
    const th = -Math.PI + (i / n) * TAU
    const t = bark ? barkEdge(o, th) + 0.01 : 0.985
    const [x, y] = pointAt(o, th, t)
    if (i === 0)
      g.moveTo(x, y)
    else
      g.lineTo(x, y)
  }
  g.closePath()
}

function enter(g: CanvasRenderingContext2D, o: Round, p: Piece, W: number, H: number, S: number) {
  g.save()
  g.translate(W / 2 + (o.cx + p.dx) * S, H / 2 + (o.cy + p.dy) * S)
  g.scale(S, S)
  g.rotate(o.rot)
  const big = 10
  g.beginPath()
  g.rect(Math.max(-big, p.x0), Math.max(-big, p.y0), Math.min(big, p.x1) - Math.max(-big, p.x0), Math.min(big, p.y1) - Math.max(-big, p.y0))
  g.clip()
}

interface Check { th: number, tin: number, w: number, lat: number[] }

function makeChecks(r: Rng, o: Round, pile: boolean): { checks: Check[], star: Check[] } {
  const k = o.R / 0.37
  const n = pile ? int(r, 1, 3) : int(r, 2, 6)
  const checks: Check[] = []
  for (let i = 0; i < n; i++) {
    const deep = i === 0 && r() < 0.6
    const lat: number[] = []
    let l = 0
    for (let s = 0; s <= 28; s++) {
      l += gaussian(r) * 0.0011 * k
      lat.push(l)
    }
    checks.push({ th: r() * TAU, tin: deep ? range(r, 0.04, 0.2) : range(r, 0.35, 0.8), w: range(r, 0.006, 0.017) * k * (deep ? 1.3 : 1), lat })
  }
  const star: Check[] = []
  if (r() < (pile ? 0.3 : 0.55)) {
    const m = int(r, 3, 5)
    const a0 = r() * TAU
    for (let i = 0; i < m; i++) {
      const lat: number[] = []
      let l = 0
      for (let s = 0; s <= 28; s++) {
        l += gaussian(r) * 0.0004 * k
        lat.push(l)
      }
      star.push({ th: a0 + (i / m) * TAU + range(r, -0.3, 0.3), tin: range(r, 0.05, 0.16), w: range(r, 0.0025, 0.005) * k, lat })
    }
  }
  return { checks, star }
}

/** A tapering wedge along a ray, from `tA` (closed) to `tB` (open). */
function wedge(g: CanvasRenderingContext2D, o: Round, c: Check, tA: number, tB: number) {
  const left: [number, number][] = []
  const right: [number, number][] = []
  const n = c.lat.length - 1
  for (let s = 0; s <= n; s++) {
    const t = tA + (tB - tA) * (s / n)
    const [x, y] = pointAt(o, c.th, t)
    const nx = -Math.sin(c.th)
    const ny = Math.cos(c.th)
    const hw = c.w * 0.5 * (s / n) ** 1.3
    const l = c.lat[s]
    left.push([x + nx * (l + hw), y + ny * (l + hw)])
    right.push([x + nx * (l - hw), y + ny * (l - hw)])
  }
  g.beginPath()
  g.moveTo(left[0][0], left[0][1])
  for (const p of left) g.lineTo(p[0], p[1])
  for (let i = right.length - 1; i >= 0; i--) g.lineTo(right[i][0], right[i][1])
  g.closePath()
  return left
}

export function overlayRound(g: CanvasRenderingContext2D, o: Round, sp: Species, finish: Finish, checked: boolean, pile: boolean, W: number, H: number, S: number) {
  const ink = finish === 'Ink'
  // rays: from anywhere inside towards the bark, never from the bark inwards
  const rr = subRng(o.seed, 3)
  const k = o.R / 0.37
  const nRays = Math.max(24, Math.round(sp.rays * k))
  const rays: { th: number, ts: number, te: number, w: number, a: number, wig: number }[] = []
  for (let i = 0; i < nRays; i++) {
    const ts = range(rr, 0.03, 0.85)
    rays.push({ th: rr() * TAU, ts, te: Math.min(0.975, ts + range(rr, 0.08, 0.85)), w: sp.rayWidth * range(rr, 0.45, 1.3) * Math.sqrt(k), a: range(rr, 0.5, 1), wig: range(rr, -0.006, 0.006) })
  }
  const cracks = checked ? makeChecks(subRng(o.seed, 4), o, pile) : null
  for (const p of o.pieces) {
    enter(g, o, p, W, H, S)
    outline(g, o, false)
    g.clip()
    g.lineCap = 'round'
    for (const ray of rays) {
      // too thin to see at this size: skip rather than smear
      if (ray.w * S < 0.35)
        continue
      g.strokeStyle = ink ? css(sp.paper, 0.75 * ray.a) : css(sp.ray, sp.rayAlpha * ray.a)
      g.lineWidth = ray.w
      g.beginPath()
      for (let s = 0; s <= 6; s++) {
        const t = ray.ts + (ray.te - ray.ts) * (s / 6)
        const [x, y] = pointAt(o, ray.th + ray.wig * Math.sin(s * 1.3), t)
        if (s === 0)
          g.moveTo(x, y)
        else
          g.lineTo(x, y)
      }
      g.stroke()
    }
    g.restore()
    if (cracks) {
      enter(g, o, p, W, H, S)
      outline(g, o, true)
      g.clip()
      const fill = ink ? css(sp.ink) : css(sp.crack)
      for (const c of cracks.checks) {
        const tb = barkEdge(o, c.th)
        const edge = wedge(g, o, c, c.tin, tb + 0.02)
        g.fillStyle = fill
        g.fill()
        if (!ink) {
          // the lit lip of the split
          g.strokeStyle = css(sp.ray, 0.28)
          g.lineWidth = 0.0012
          g.beginPath()
          edge.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y))
          g.stroke()
        }
      }
      for (const c of cracks.star) {
        // heart checks open at the pith and close outwards
        const mirrored = { ...c, lat: c.lat.slice().reverse() }
        wedge(g, o, mirrored, c.tin, 0)
        g.fillStyle = fill
        g.fill()
      }
      g.restore()
    }
  }
}

export function overlayBoard(g: CanvasRenderingContext2D, o: Board, sp: Species, finish: Finish, checked: boolean, W: number, H: number, S: number) {
  const ink = finish === 'Ink'
  g.save()
  g.translate(W / 2, H / 2)
  g.scale(S, S)
  g.beginPath()
  g.rect(o.x0, o.y0, o.x1 - o.x0, o.y1 - o.y0)
  g.clip()
  if (checked) {
    const r = subRng(o.seed, 5)
    const u0 = o.horiz ? o.x0 : o.y0
    const u1 = o.horiz ? o.x1 : o.y1
    const v0 = o.horiz ? o.y0 : o.x0
    const v1 = o.horiz ? o.y1 : o.x1
    const slits: { u: number, v: number, len: number, w: number, dir: number }[] = []
    for (const [end, dir] of [[u0, 1], [u1, -1]] as const) {
      const n = int(r, 0, 2)
      for (let i = 0; i < n; i++)
        slits.push({ u: end, v: range(r, v0 + 0.02, v1 - 0.02), len: range(r, 0.05, 0.24), w: range(r, 0.003, 0.0065), dir })
    }
    const m = int(r, 0, 2)
    for (let i = 0; i < m; i++)
      slits.push({ u: range(r, u0 + 0.1, u1 - 0.1), v: range(r, v0 + 0.02, v1 - 0.02), len: range(r, 0.03, 0.09), w: range(r, 0.0012, 0.0024), dir: 0 })
    g.fillStyle = ink ? css(sp.ink) : css(sp.crack, 0.92)
    for (const s of slits) {
      const pts: [number, number][] = []
      const n = 16
      const wob = r() * 10
      for (let side = 0; side < 2; side++) {
        for (let i = 0; i <= n; i++) {
          const q = side ? n - i : i
          const a = q / n
          let hw: number
          let u: number
          if (s.dir === 0) {
            u = s.u + (a - 0.5) * s.len
            hw = s.w * 0.5 * Math.sin(Math.PI * a)
          }
          else {
            u = s.u + s.dir * a * s.len
            hw = s.w * 0.5 * (1 - a) ** 1.2
          }
          const v = s.v + 0.0012 * Math.sin(a * 9 + wob) + (side ? -hw : hw)
          pts.push(o.horiz ? [u, v] : [v, u])
        }
      }
      g.beginPath()
      pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y))
      g.closePath()
      g.fill()
    }
  }
  g.restore()
  if (ink) {
    g.save()
    g.translate(W / 2, H / 2)
    g.scale(S, S)
    g.strokeStyle = css(sp.ink, 0.9)
    g.lineWidth = Math.max(0.0016, 1 / S)
    g.strokeRect(o.x0, o.y0, o.x1 - o.x0, o.y1 - o.y0)
    g.restore()
  }
}
