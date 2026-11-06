// Grounds for the "Threads" series: wood boards, velvet and linen.
//
// Every texture is laid out in units of the canvas short side S around the
// centre, and each grain line or yarn draws its own parameters from an
// integer hash of its index (not from a sequential stream), so a wider or a
// taller canvas shows more of the same board around the same composition.

export type GroundKind = 'wood' | 'velvet' | 'linen'

export interface GroundColors {
  kind: GroundKind
  base: string
  dark: string
  light: string
}

/** Uniform [0, 1) from a 32-bit seed, an index and a channel. */
export function hash01(seed: number, k: number, ch: number): number {
  let h = Math.imul(seed ^ Math.imul(k + 0x3C6EF372, 0x9E3779B1) ^ Math.imul(ch + 1, 0x632BE5AB), 0x85EBCA6B)
  h ^= h >>> 13
  h = Math.imul(h, 0xC2B2AE35)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

function wood(g: CanvasRenderingContext2D, W: number, H: number, S: number, c: GroundColors, seed: number) {
  const cx = W / 2
  const cy = H / 2
  const hw = W / S / 2 + 0.05
  const hh = H / S / 2 + 0.05
  const p1 = hash01(seed, 0, 10) * 6.283
  const p2 = hash01(seed, 0, 11) * 6.283
  const kx = (hash01(seed, 0, 12) - 0.5) * 1.4
  const ky = (hash01(seed, 0, 13) - 0.5) * 1.2
  const kr = 0.03 + hash01(seed, 0, 14) * 0.04
  const sp = 0.0068
  const k0 = Math.floor(-hh / sp) - 3
  const k1 = Math.ceil(hh / sp) + 3
  const steps = Math.ceil((2 * hw) / 0.02) + 1
  g.lineCap = 'butt'
  for (let k = k0; k <= k1; k++) {
    const h0 = hash01(seed, k, 0)
    const h1 = hash01(seed, k, 1)
    const h2 = hash01(seed, k, 2)
    const y0 = k * sp + (h0 - 0.5) * sp * 0.7
    const wide = h2 < 0.12
    g.strokeStyle = h1 < 0.78 || wide ? c.dark : c.light
    g.globalAlpha = wide ? 0.06 + h1 * 0.06 : 0.08 + h1 * 0.22
    g.lineWidth = (wide ? 0.012 + h0 * 0.02 : 0.0005 + h2 * 0.0022) * S
    g.beginPath()
    for (let i = 0; i <= steps; i++) {
      const x = -hw + i * 0.02
      let y = y0 + 0.011 * Math.sin(x * 1.9 + p1 + y0 * 2.6) + 0.004 * Math.sin(x * 5.1 + p2 - y0 * 6.3)
      // grain swerves around a knot
      const dx = x - kx
      const dy = y - ky
      y += dy * (kr * kr * 4) / (dx * dx * 0.5 + dy * dy + kr * kr)
      if (i === 0)
        g.moveTo(cx + x * S, cy + y * S)
      else
        g.lineTo(cx + x * S, cy + y * S)
    }
    g.stroke()
  }
  // the knot itself
  g.strokeStyle = c.dark
  for (let i = 0; i < 5; i++) {
    g.globalAlpha = 0.12 + i * 0.05
    g.lineWidth = 0.0016 * S
    g.beginPath()
    g.ellipse(cx + kx * S, cy + ky * S, kr * S * (1.1 - i * 0.2), kr * S * (0.5 - i * 0.09), 0, 0, Math.PI * 2)
    g.stroke()
  }
}

function velvet(g: CanvasRenderingContext2D, W: number, H: number, S: number, c: GroundColors, seed: number) {
  const cx = W / 2
  const cy = H / 2
  // the pile catches the light in broad, soft sheens
  for (let i = 0; i < 4; i++) {
    const x = cx + (hash01(seed, i, 20) - 0.5) * 1.2 * S
    const y = cy + (hash01(seed, i, 21) - 0.5) * 1.2 * S
    const r = (0.35 + hash01(seed, i, 22) * 0.5) * S
    const gr = g.createRadialGradient(x, y, 0, x, y, r)
    gr.addColorStop(0, c.light)
    gr.addColorStop(1, c.base)
    g.globalAlpha = 0.18 + hash01(seed, i, 23) * 0.18
    g.fillStyle = gr
    g.fillRect(0, 0, W, H)
  }
  // crushed pile: long, soft, lighter and darker streaks
  g.lineCap = 'round'
  for (let i = 0; i < 9; i++) {
    const x0 = (hash01(seed, i, 30) - 0.5) * 1.6
    const y0 = (hash01(seed, i, 31) - 0.5) * 1.6
    const a = hash01(seed, i, 32) * 6.283
    const l = 0.3 + hash01(seed, i, 33) * 0.6
    g.strokeStyle = i % 3 ? c.dark : c.light
    g.globalAlpha = 0.05 + hash01(seed, i, 34) * 0.05
    g.lineWidth = (0.03 + hash01(seed, i, 35) * 0.08) * S
    g.beginPath()
    g.moveTo(cx + x0 * S, cy + y0 * S)
    g.quadraticCurveTo(
      cx + (x0 + Math.cos(a) * l * 0.5 + 0.1) * S,
      cy + (y0 + Math.sin(a) * l * 0.5 - 0.1) * S,
      cx + (x0 + Math.cos(a) * l) * S,
      cy + (y0 + Math.sin(a) * l) * S,
    )
    g.stroke()
  }
}

function linen(g: CanvasRenderingContext2D, W: number, H: number, S: number, c: GroundColors, seed: number) {
  const cx = W / 2
  const cy = H / 2
  const sp = 0.0042
  const kx = Math.ceil(W / S / 2 / sp) + 1
  const ky = Math.ceil(H / S / 2 / sp) + 1
  g.lineCap = 'butt'
  for (let dir = 0; dir < 2; dir++) {
    const kk = dir ? ky : kx
    for (let k = -kk; k <= kk; k++) {
      const h0 = hash01(seed, k, 40 + dir)
      const h1 = hash01(seed, k, 42 + dir)
      const slub = h1 < 0.06
      g.strokeStyle = h0 < 0.6 ? c.dark : c.light
      g.globalAlpha = slub ? 0.22 : 0.05 + h0 * 0.12
      g.lineWidth = (slub ? 0.0026 : 0.0012 + h1 * 0.001) * S
      const p = k * sp * S
      g.beginPath()
      if (dir) {
        g.moveTo(0, cy + p)
        g.lineTo(W, cy + p)
      }
      else {
        g.moveTo(cx + p, 0)
        g.lineTo(cx + p, H)
      }
      g.stroke()
    }
  }
}

export function paintGround(g: CanvasRenderingContext2D, W: number, H: number, c: GroundColors, seed: number, dark: boolean) {
  const S = Math.min(W, H)
  g.globalAlpha = 1
  g.globalCompositeOperation = 'source-over'
  g.fillStyle = c.base
  g.fillRect(0, 0, W, H)
  if (c.kind === 'wood')
    wood(g, W, H, S, c, seed)
  else if (c.kind === 'velvet')
    velvet(g, W, H, S, c, seed)
  else
    linen(g, W, H, S, c, seed)
  // vignette, centred on the composition
  const cx = W / 2
  const cy = H / 2
  const vg = g.createRadialGradient(cx, cy, S * 0.35, cx, cy, Math.hypot(W, H) * 0.6)
  vg.addColorStop(0, 'rgba(0,0,0,0)')
  vg.addColorStop(1, dark ? 'rgba(0,0,0,0.55)' : 'rgba(40,24,8,0.28)')
  g.globalAlpha = 1
  g.fillStyle = vg
  g.fillRect(0, 0, W, H)
}
