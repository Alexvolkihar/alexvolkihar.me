// "Rosette" — an imaginary star system drawn as ornament, like an enamelled or
// embroidered celestial chart rather than an astronomical one.
//
// Every body is a rosette: a stack of concentric layers (scalloped, petalled,
// star-pointed or crenellated discs, rings of dots, beads, rays, teardrops,
// chevrons and zigzags) whose motif counts divide one another, see
// ../rosette/motifs.ts. A sun with a double corona sits at the heart of the
// system; planets are threaded on orbits spaced by the size of what they
// carry, some with moons or a ring; a cluster is packed by greedy random
// placement instead. Small rosettes and sparkles fill the leftover room, and
// orbits may be stitched as threads, zigzags or waves. See ../rosette/layout.ts.
//
// Everything is a pure function of the hash, and every length a fraction of
// the canvas short side. The system is laid out once on a fixed field larger
// than the central square, so wide or tall canvases show more of it.

import type { Body, Comet, Orbit, Scene, Sparkle } from '../rosette/layout'
import type { Grammar, Rosette } from '../rosette/motifs'
import type { Series } from '../types'
import { pick, range, stream, weighted } from '../random'
import { compose } from '../rosette/layout'
import { designRosette, drawRosette } from '../rosette/motifs'

// ---------------------------------------------------------------------------
// Rarity table — decided before the drawing code, never reordered.
// ---------------------------------------------------------------------------

const TRAITS = {
  Palette: [['Velvet', 20], ['Indigo', 20], ['Lagoon', 18], ['Garnet', 14], ['Soot', 12], ['Linen', 16]],
  System: [['Solar', 35], ['Binary', 15], ['Offset', 25], ['Cluster', 25]],
  Orbits: [['Bare', 15], ['Thread', 25], ['Zigzag', 35], ['Wave', 25]],
  Motif: [['Floral', 25], ['Stellar', 25], ['Beaded', 20], ['Mixed', 30]],
  Sky: [['Quiet', 25], ['Starry', 45], ['Teeming', 18], ['Comet', 12]],
} as const satisfies Record<string, ReadonlyArray<readonly [string, number]>>

type TraitName = keyof typeof TRAITS
type Features = { [K in TraitName]: typeof TRAITS[K][number][0] }

function features(hash: string): Features {
  const r = stream(hash, 'features')
  return {
    Palette: weighted(r, TRAITS.Palette),
    System: weighted(r, TRAITS.System),
    Orbits: weighted(r, TRAITS.Orbits),
    Motif: weighted(r, TRAITS.Motif),
    Sky: weighted(r, TRAITS.Sky),
  }
}

// ---------------------------------------------------------------------------
// Palettes: flat, saturated inks on deep cloth, and one on undyed linen.
// Ink 0 is the "thread white" of the palette; `warm` lists the sun inks.
// ---------------------------------------------------------------------------

interface Palette {
  ground: string
  line: string
  inks: readonly string[]
  warm: readonly number[]
}

const PALETTES: Record<Features['Palette'], Palette> = {
  Velvet: { ground: '#25123a', line: '#7a56a8', inks: ['#fbf3e6', '#e8243c', '#ff8c1a', '#3d9bf0', '#ff86bd', '#ffd447'], warm: [1, 2, 5] },
  Indigo: { ground: '#0c1636', line: '#4a63a8', inks: ['#f6f2ea', '#f2545b', '#ffb627', '#4ecdf0', '#f5a3c7', '#8f6cf0'], warm: [1, 2, 4] },
  Lagoon: { ground: '#0a3a3d', line: '#3f8a87', inks: ['#fdf4e3', '#ee3b34', '#ff9b21', '#ffd25a', '#f7a6b4', '#2f63d1'], warm: [1, 2, 3] },
  Garnet: { ground: '#3a0c1d', line: '#8c3a58', inks: ['#fff3df', '#ff9a1f', '#ffd35c', '#5fc1f2', '#ff5c8e', '#2fa77a'], warm: [1, 2, 4] },
  Soot: { ground: '#131217', line: '#5c586c', inks: ['#ffffff', '#e63946', '#f6a24a', '#4a86c5', '#f2cf5b', '#ffa8cc'], warm: [1, 2, 4] },
  Linen: { ground: '#efe5d2', line: '#b39b70', inks: ['#1b2656', '#cc1f36', '#f0661c', '#2d7fc1', '#e8709a', '#f2b630'], warm: [1, 2, 5] },
}

// ---------------------------------------------------------------------------
// Motif grammars: how likely each layer kind is.
// ---------------------------------------------------------------------------

const GRAMMARS: Record<Features['Motif'], Grammar> = {
  Floral: {
    silhouettes: [['disc', 2], ['scallop', 4], ['petal', 5], ['star', 1], ['cog', 0.5]],
    decors: [['dots', 3], ['beads', 2], ['rays', 0.5], ['drops', 4], ['chevrons', 0.5], ['zigzag', 1], ['ring', 1]],
  },
  Stellar: {
    silhouettes: [['disc', 1], ['scallop', 0.5], ['petal', 1], ['star', 5], ['cog', 3]],
    decors: [['dots', 1.5], ['beads', 0.5], ['rays', 4], ['drops', 0.5], ['chevrons', 3], ['zigzag', 3], ['ring', 1]],
  },
  Beaded: {
    silhouettes: [['disc', 4], ['scallop', 2], ['petal', 1], ['star', 1], ['cog', 1]],
    decors: [['dots', 4], ['beads', 4], ['rays', 0.5], ['drops', 1], ['chevrons', 0.5], ['zigzag', 1], ['ring', 3]],
  },
  Mixed: {
    silhouettes: [['disc', 2], ['scallop', 2], ['petal', 2], ['star', 2], ['cog', 2]],
    decors: [['dots', 2], ['beads', 2], ['rays', 2], ['drops', 2], ['chevrons', 2], ['zigzag', 2], ['ring', 2]],
  },
}

const TAU = Math.PI * 2

interface View {
  x0: number
  y0: number
  x1: number
  y1: number
  S: number
}

const px = (v: View, x: number) => (x - v.x0) * v.S
const py = (v: View, y: number) => (y - v.y0) * v.S

function visible(v: View, x: number, y: number, r: number) {
  return x + r > v.x0 && x - r < v.x1 && y + r > v.y0 && y - r < v.y1
}

/** Does the annulus [rho - w, rho + w] around (cx, cy) cross the view? */
function circleVisible(v: View, cx: number, cy: number, rho: number, w: number) {
  const nx = Math.max(v.x0, Math.min(cx, v.x1))
  const ny = Math.max(v.y0, Math.min(cy, v.y1))
  const near = Math.hypot(nx - cx, ny - cy)
  const far = Math.max(Math.hypot(v.x0 - cx, v.y0 - cy), Math.hypot(v.x1 - cx, v.y0 - cy), Math.hypot(v.x0 - cx, v.y1 - cy), Math.hypot(v.x1 - cx, v.y1 - cy))
  return near <= rho + w && far >= rho - w
}

type Stitch = 'line' | 'dotted' | 'zigzag' | 'wave'

/** One orbit path, stitched around a centre. All sizes in world units. */
function stitch(g: CanvasRenderingContext2D, v: View, cx: number, cy: number, rho: number, kind: Stitch, amp: number, width: number) {
  const X = px(v, cx)
  const Y = py(v, cy)
  const R = rho * v.S
  const A = amp * v.S
  g.lineWidth = Math.max(0.5, width * v.S)
  g.beginPath()
  if (kind === 'line') {
    g.arc(X, Y, R, 0, TAU)
    g.stroke()
    return
  }
  if (kind === 'dotted') {
    const n = Math.max(12, Math.round(TAU * rho / (width * 4.5)))
    const s = Math.max(0.5, width * 0.9 * v.S)
    for (let k = 0; k < n; k++) {
      const a = k * TAU / n
      const x = X + Math.cos(a) * R
      const y = Y + Math.sin(a) * R
      g.moveTo(x + s, y)
      g.arc(x, y, s, 0, TAU)
    }
    g.fill()
    return
  }
  if (kind === 'zigzag') {
    const n = Math.max(8, 2 * Math.round(TAU * rho / (amp * 2.1) / 2))
    for (let k = 0; k <= n; k++) {
      const a = k * TAU / n
      const rr = R + (k % 2 ? A : -A)
      const x = X + Math.cos(a) * rr
      const y = Y + Math.sin(a) * rr
      if (k === 0)
        g.moveTo(x, y)
      else
        g.lineTo(x, y)
    }
    g.stroke()
    // a bead on every outer tip
    g.beginPath()
    const s = Math.max(0.6, width * 1.2 * v.S)
    for (let k = 1; k < n; k += 2) {
      const a = k * TAU / n
      const x = X + Math.cos(a) * (R + A)
      const y = Y + Math.sin(a) * (R + A)
      g.moveTo(x + s, y)
      g.arc(x, y, s, 0, TAU)
    }
    g.fill()
    return
  }
  // wave: one quadratic per half wavelength, its control point pushed out or in
  const n = Math.max(8, 2 * Math.round(TAU * rho / (amp * 5) / 2))
  g.moveTo(X + R, Y)
  for (let k = 0; k < n; k++) {
    const a0 = k * TAU / n
    const a1 = (k + 1) * TAU / n
    const am = (a0 + a1) / 2
    const rc = (R + (k % 2 ? 1.5 * A : -1.5 * A)) / Math.cos((a1 - a0) / 2)
    g.quadraticCurveTo(X + Math.cos(am) * rc, Y + Math.sin(am) * rc, X + Math.cos(a1) * R, Y + Math.sin(a1) * R)
  }
  g.stroke()
  // a dot cupped in every inner trough
  g.beginPath()
  const s = Math.max(0.6, width * 1.1 * v.S)
  for (let k = 0; k < n; k += 2) {
    const am = (k + 0.5) * TAU / n
    const x = X + Math.cos(am) * (R + 0.9 * A)
    const y = Y + Math.sin(am) * (R + 0.9 * A)
    g.moveTo(x + s, y)
    g.arc(x, y, s, 0, TAU)
  }
  g.fill()
}

function sparklePath(g: CanvasRenderingContext2D, x: number, y: number, s: number, rot: number, points: number, pinch: number) {
  for (let k = 0; k < points; k++) {
    const a = rot + k * TAU / points
    const b = a + Math.PI / points
    const tx = x + Math.cos(a) * s
    const ty = y + Math.sin(a) * s
    if (k === 0)
      g.moveTo(tx, ty)
    else
      g.lineTo(tx, ty)
    g.quadraticCurveTo(x + Math.cos(b) * s * pinch, y + Math.sin(b) * s * pinch, x + Math.cos(a + 2 * Math.PI / points) * s, y + Math.sin(a + 2 * Math.PI / points) * s)
  }
  g.closePath()
}

function drawSparkle(g: CanvasRenderingContext2D, v: View, sp: Sparkle, pal: Palette) {
  const x = px(v, sp.x)
  const y = py(v, sp.y)
  const s = sp.s * v.S
  const tint = (sp.kind * 7) % 10
  const col = tint < 5 ? pal.inks[0] : pal.inks[1 + (tint % 5)]
  g.fillStyle = col
  g.strokeStyle = col
  g.beginPath()
  if (sp.kind < 45) {
    sparklePath(g, x, y, s, sp.rot, 4, 0.12)
    g.fill()
  }
  else if (sp.kind < 58) {
    sparklePath(g, x, y, s, sp.rot, 4, 0.12)
    sparklePath(g, x, y, s * 0.55, sp.rot + Math.PI / 4, 4, 0.12)
    g.fill()
  }
  else if (sp.kind < 80) {
    g.arc(x, y, s * 0.32, 0, TAU)
    g.fill()
  }
  else if (sp.kind < 92) {
    // a six-spoked flake with a bead at every tip
    g.lineWidth = Math.max(0.5, s * 0.14)
    g.lineCap = 'round'
    for (let k = 0; k < 6; k++) {
      const a = sp.rot + k * TAU / 6
      g.moveTo(x, y)
      g.lineTo(x + Math.cos(a) * s * 0.8, y + Math.sin(a) * s * 0.8)
    }
    g.stroke()
    g.beginPath()
    for (let k = 0; k < 6; k++) {
      const a = sp.rot + k * TAU / 6
      const bx = x + Math.cos(a) * s * 0.9
      const by = y + Math.sin(a) * s * 0.9
      g.moveTo(bx + s * 0.16, by)
      g.arc(bx, by, s * 0.16, 0, TAU)
    }
    g.fill()
  }
  else {
    g.lineWidth = Math.max(0.5, s * 0.14)
    g.arc(x, y, s * 0.55, 0, TAU)
    g.stroke()
    g.beginPath()
    g.arc(x, y, s * 0.18, 0, TAU)
    g.fill()
  }
}

function drawRing(g: CanvasRenderingContext2D, v: View, b: Body, inks: readonly [string, string], ground: string, front: boolean) {
  const ring = b.ring
  if (!ring)
    return
  const X = px(v, b.x)
  const Y = py(v, b.y)
  const rx = ring.rx * v.S
  const ry = ring.ry * v.S
  const w = b.R * v.S * 0.16
  const a0 = front ? 0 : Math.PI
  g.save()
  g.translate(X, Y)
  g.rotate(ring.tilt)
  g.lineCap = 'butt'
  g.beginPath()
  g.ellipse(0, 0, rx, ry, 0, a0, a0 + Math.PI)
  g.strokeStyle = ground
  g.lineWidth = w * 1.9
  g.stroke()
  g.strokeStyle = inks[0]
  g.lineWidth = w
  g.stroke()
  g.strokeStyle = inks[1]
  g.lineWidth = w * 0.3
  g.stroke()
  g.restore()
}

function drawComet(g: CanvasRenderingContext2D, v: View, c: Comet, head: Rosette, pal: Palette, tones: readonly number[]) {
  const pts = c.tail.map(([x, y]) => [px(v, x), py(v, y)] as const)
  const R = c.R * v.S
  // three streamers fanning out behind the head
  g.lineCap = 'round'
  g.lineJoin = 'round'
  for (let s = 0; s < 3; s++) {
    const off = (s - 1) * 0.7
    g.beginPath()
    for (let i = 0; i < pts.length; i++) {
      const [x, y] = pts[i]
      const [nx, ny] = pts[Math.min(i + 1, pts.length - 1)]
      const [ox, oy] = pts[Math.max(i - 1, 0)]
      const dx = nx - ox
      const dy = ny - oy
      const l = Math.hypot(dx, dy) || 1
      const t = i / (pts.length - 1)
      const k = off * R * (0.4 + 1.6 * t)
      const qx = x - dy / l * k
      const qy = y + dx / l * k
      if (i === 0)
        g.moveTo(qx, qy)
      else
        g.lineTo(qx, qy)
    }
    g.strokeStyle = pal.inks[tones[s % tones.length]]
    g.lineWidth = R * (s === 1 ? 0.34 : 0.18)
    g.stroke()
  }
  // a string of beads shrinking down the tail
  for (let i = pts.length - 1; i >= 1; i--) {
    const t = i / (pts.length - 1)
    const [x, y] = pts[i]
    const s = R * (0.62 - 0.5 * t) * (i % 2 ? 0.6 : 1)
    g.beginPath()
    g.arc(x, y, s * 1.45, 0, TAU)
    g.fillStyle = pal.ground
    g.fill()
    g.beginPath()
    g.arc(x, y, s, 0, TAU)
    g.fillStyle = pal.inks[tones[i % tones.length]]
    g.fill()
  }
  g.beginPath()
  g.arc(pts[0][0], pts[0][1], R * 1.25, 0, TAU)
  g.fillStyle = pal.ground
  g.fill()
  drawRosette(g, pts[0][0], pts[0][1], R, head, pal.inks, pal.ground)
}

function render(g: CanvasRenderingContext2D, W: number, H: number, hash: string) {
  const f = features(hash)
  const pal = PALETTES[f.Palette]
  const gram = GRAMMARS[f.Motif]
  const S = Math.min(W, H)
  const v: View = { x0: 0.5 - W / (2 * S), y0: 0.5 - H / (2 * S), x1: 0.5 + W / (2 * S), y1: 0.5 + H / (2 * S), S }

  g.save()
  g.globalAlpha = 1
  g.fillStyle = pal.ground
  g.fillRect(0, 0, W, H)

  const bands = f.Orbits !== 'Bare'
  const scene: Scene = compose(hash, f.System, f.Sky, bands)

  // designs come from their own stream, in scene order, whatever is visible
  const dr = stream(hash, 'design')
  const cutRate = range(dr, 0.15, 0.85)
  const orbitInk = pick(dr, [0, 1, 2, 3, 4, 5])
  const ringInks: [string, string] = [pal.inks[pick(dr, [0, 1, 2, 3, 4, 5])], pal.inks[pick(dr, [0, 1, 2, 3, 4, 5])]]
  const designs = scene.bodies.map(b => designRosette(dr, b.role, gram, pal.inks.length, pal.warm, cutRate))
  const cometHead = designRosette(dr, 'moon', gram, pal.inks.length, pal.warm, cutRate)
  const cometTones = [pick(dr, pal.warm), 0, pick(dr, [3, 4, 5])]
  const tones = [pal.line, pal.inks[orbitInk]]

  // ---- orbit paths -----------------------------------------------------------
  const stitchKind: Record<Features['Orbits'], Stitch> = { Bare: 'line', Thread: 'line', Zigzag: 'zigzag', Wave: 'wave' }
  if (bands) {
    for (const o of scene.orbits as Orbit[]) {
      if (!circleVisible(v, o.cx, o.cy, o.rho, scene.band))
        continue
      const kind: Stitch = f.Orbits === 'Thread' && o.tone ? 'dotted' : stitchKind[f.Orbits]
      g.strokeStyle = tones[o.tone]
      g.fillStyle = tones[o.tone]
      g.lineJoin = 'round'
      g.lineCap = 'round'
      stitch(g, v, o.cx, o.cy, o.rho, kind, scene.band * 0.8, kind === 'line' ? 0.003 : 0.0034)
    }
  }
  // moon orbits: a fine dotted thread, or the band style itself in a cluster
  for (const b of scene.bodies) {
    if (!b.moonOrbit || !visible(v, b.x, b.y, b.sys) || f.Orbits === 'Bare')
      continue
    const cluster = f.System === 'Cluster'
    const kind: Stitch = cluster ? stitchKind[f.Orbits] : 'dotted'
    g.strokeStyle = cluster ? tones[1] : tones[0]
    g.fillStyle = g.strokeStyle
    stitch(g, v, b.x, b.y, b.moonOrbit, kind, b.R * 0.09, cluster ? 0.0022 : 0.0016)
  }

  // ---- sky ---------------------------------------------------------------------
  for (const sp of scene.sparkles) {
    if (visible(v, sp.x, sp.y, sp.s))
      drawSparkle(g, v, sp, pal)
  }
  if (scene.comet)
    drawComet(g, v, scene.comet, cometHead, pal, cometTones)

  // ---- bodies, each cut out of the ground by a halo -----------------------------
  for (let i = 0; i < scene.bodies.length; i++) {
    const b = scene.bodies[i]
    if (!visible(v, b.x, b.y, b.sys + 0.01))
      continue
    const X = px(v, b.x)
    const Y = py(v, b.y)
    const R = b.R * v.S
    g.beginPath()
    g.arc(X, Y, R + (b.R * 0.1 + 0.004) * v.S, 0, TAU)
    g.fillStyle = pal.ground
    g.fill()
    drawRing(g, v, b, ringInks, pal.ground, false)
    drawRosette(g, X, Y, R, designs[i], pal.inks, pal.ground)
    drawRing(g, v, b, ringInks, pal.ground, true)
  }
  g.restore()
}

export default {
  slug: 'rosette',
  title: 'Rosette',
  summary: 'An imaginary star system stitched as ornament: suns, planets and moons as layered rosettes of petals, rays and beads on deep cloth.',
  order: 670,
  traits: TRAITS,
  features,
  render,
  // Seed-of-seeds 0x70c3e770 ("gallery" stream, 64-hex candidates): the first
  // hash found for each Palette x System pair, in the order found, skipping
  // four weak or redundant ones (two near-empty Bare skies among them). The
  // cover, a Velvet offset sun, is moved to the front.
  gallery: [
    '0x02c88b68d269d5463d94f16c1edf19be9afa276eb2dc82c2b02e399ae2751643',
    '0xdfe2ea45288304362a8679dfdfe5606b2cc6f7b6d5654778ff8e7621aff44a13',
    '0x0d0b297acc2787416d25aa3e0ae4c5cffaf2a8f8f39bbc41d79e99c7ace4cf1e',
    '0x8065795d99588e56d905d89962f52949a3cf4465c3c28d8408458c7ddbb07d2b',
    '0x89af8180ffbdb9eab4a1b9a5e9d4656664fbfad07f6be465c81911d1c8748727',
    '0x60e254bbc60327235868e9e18c6bf2933a7abc4d56ba4db1add37bde18a8a299',
    '0xb5286e8d982792e86d3c7f854dce999c3f2c72897be298c4a9ed71f1219e55d0',
    '0x49199df9b8c0ead6246231dd9c14db8c18c0f23e909a2f32e3fde4b9f61d90dc',
    '0x885e9b71e7c61f3958fc51288e4c9dae581044e01bc75c529f8bc94f9712775a',
    '0x6a3e7c611aa962d937535fffad678537e69d9e33aa98bf5428caf22fe307c0c7',
    '0x795cb499f7a62b5f8c4378fd328faf2edc0005b500b45c675e5f2e6e9723d7a2',
    '0xee684aab41451a8bf26a17e311c19c1ba546f77af2f249564d7ee9448e4ff4aa',
  ],
} satisfies Series
