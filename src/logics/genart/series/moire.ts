// "Moiré" — interference between overlaid gratings.
//
// Two or three periodic gratings (parallel lines, concentric rings, radial
// spokes, wavy lines or an Archimedean spiral) are printed on top of each
// other with a slight offset, rotation, change of pitch or warp. Where their
// stripes fall in step the ground shows through, where they fall out of step
// it is covered: large, slow fringes appear that none of the gratings
// contains. Light palettes overprint with 'multiply', like inks on paper;
// dark ones with 'screen', like light through slits.
//
// Everything is a pure function of the hash, and every length is a fraction
// of the canvas short side. The gratings are infinite, so a wider or taller
// canvas shows more of the same interference field around the same centre.
// Small canvases are drawn supersampled and filtered down, so the stripes do
// not alias into false fringes on thumbnails.

import type { Ctx, Grating, View, Warp } from '../moire/gratings'
import type { Series } from '../types'
import { drawGrating } from '../moire/gratings'
import { stream, weighted } from '../random'

// ---------------------------------------------------------------------------
// Rarity table — decided before the drawing code, never reordered.
// Changing a weight or an order re-rolls the whole edition.
// ---------------------------------------------------------------------------

const TRAITS = {
  Palette: [['Ink', 24], ['Night', 18], ['Riso', 16], ['Vermilion', 14], ['Cobalt', 14], ['Brass', 14]],
  Gratings: [['Lines', 20], ['Rings', 22], ['Rings & Lines', 14], ['Spokes', 16], ['Waves', 16], ['Spiral', 12]],
  Pitch: [['Bold', 25], ['Medium', 50], ['Fine', 25]],
  Layers: [['Pair', 70], ['Triple', 30]],
  Window: [['Full bleed', 50], ['Lens', 30], ['Disc', 20]],
} as const satisfies Record<string, ReadonlyArray<readonly [string, number]>>

type TraitName = keyof typeof TRAITS
type Features = { [K in TraitName]: typeof TRAITS[K][number][0] }

/** Pure function of the hash, computed before (and without) any rendering. */
function features(hash: string): Features {
  const r = stream(hash, 'features')
  return {
    Palette: weighted(r, TRAITS.Palette),
    Gratings: weighted(r, TRAITS.Gratings),
    Pitch: weighted(r, TRAITS.Pitch),
    Layers: weighted(r, TRAITS.Layers),
    Window: weighted(r, TRAITS.Window),
  }
}

// ---------------------------------------------------------------------------
// Palettes: a ground, one ink per grating and the way inks combine.
// ---------------------------------------------------------------------------

interface Palette {
  bg: string
  inks: readonly [string, string, string]
  blend: 'multiply' | 'screen'
}

const PAL: Record<Features['Palette'], Palette> = {
  Ink: { bg: '#f2efe8', inks: ['#141414', '#141414', '#141414'], blend: 'multiply' },
  Night: { bg: '#0d0e12', inks: ['#eeece4', '#eeece4', '#eeece4'], blend: 'screen' },
  Riso: { bg: '#f4f0e6', inks: ['#1f6fc0', '#ff5a9e', '#f2c200'], blend: 'multiply' },
  Vermilion: { bg: '#efe8da', inks: ['#1c1b1a', '#de4320', '#1c1b1a'], blend: 'multiply' },
  Cobalt: { bg: '#0b1a4c', inks: ['#5ec8ff', '#ff8a3d', '#f0ebdf'], blend: 'screen' },
  Brass: { bg: '#12110f', inks: ['#d8b25e', '#d8b25e', '#d8b25e'], blend: 'screen' },
}

/** Grating period (fraction of the short side) per Pitch trait. */
const PITCH: Record<Features['Pitch'], number> = { Bold: 0.026, Medium: 0.018, Fine: 0.0125 }

interface Plan {
  layers: Grating[]
  /** Base period of the gratings. */
  pitch: number
  duty: number
  /** Lens: the upper gratings show only inside this disc. */
  lens?: { x: number, y: number, r: number }
  /** Disc: the whole interference field is cut to this disc. */
  disc?: { r: number }
}

/**
 * Every continuous parameter, from one stream with a fixed number of draws
 * (whatever the traits), so the edition stays stable across changes.
 */
function plan(hash: string, f: Features): Plan {
  const r = stream(hash, 'geometry')
  const u = Array.from({ length: 24 }, () => r())
  const U = (i: number, a: number, b: number) => a + u[i] * (b - a)
  const TAU = Math.PI * 2

  const p = PITCH[f.Pitch] * U(0, 0.92, 1.08)
  // target spacing of the main fringes
  const F = U(1, 0.13, 0.3)
  const sign = u[2] < 0.5 ? -1 : 1
  const theta = U(3, 0, Math.PI)
  const ox = U(4, -0.08, 0.08)
  const oy = U(5, -0.08, 0.08)
  // a rotation of delta between two equal line gratings gives fringes F apart
  const delta = sign * 2 * Math.asin(Math.min(0.5, p / (2 * F)))
  const nx = -Math.sin(theta)
  const ny = Math.cos(theta)

  let layers: Grating[]
  switch (f.Gratings) {
    case 'Lines': {
      const warp: Warp = u[9] < 0.55
        ? { kind: 'bulge', x: ox + U(10, -0.12, 0.12), y: oy + U(11, -0.12, 0.12), amount: U(12, -0.55, 0.85), radius: U(13, 0.18, 0.38) }
        : { kind: 'twist', x: ox + U(10, -0.12, 0.12), y: oy + U(11, -0.12, 0.12), amount: sign * U(12, 0.25, 0.7), radius: U(13, 0.18, 0.38) }
      layers = [
        { kind: 'lines', angle: theta, pitch: p, phase: u[6] },
        { kind: 'lines', angle: theta + delta, pitch: p * U(14, 0.97, 1.03), phase: u[7], warp },
        { kind: 'lines', angle: theta - delta * U(15, 0.7, 1.5), pitch: p, phase: u[8] },
      ]
      break
    }
    case 'Rings': {
      // two ring centres a few pitches apart: hyperbolic fringes
      const d = U(9, 2, 10) * p
      const squash = u[15] < 0.35 ? U(16, 0.9, 0.97) : 1
      layers = [
        { kind: 'rings', x: ox - (d / 2) * ny, y: oy + (d / 2) * nx, pitch: p, phase: u[6], squash: 1, tilt: 0 },
        { kind: 'rings', x: ox + (d / 2) * ny, y: oy - (d / 2) * nx, pitch: p * U(14, 0.96, 1.04), phase: u[7], squash, tilt: U(17, 0, Math.PI) },
        { kind: 'rings', x: ox + d * 0.87 * nx, y: oy + d * 0.87 * ny, pitch: p, phase: u[8], squash: 1, tilt: 0 },
      ]
      break
    }
    case 'Rings & Lines': {
      // rings over straight lines of the same pitch: parabolic fringes
      const d = U(9, 0.15, 0.35)
      layers = [
        { kind: 'lines', angle: theta, pitch: p * U(14, 0.98, 1.02), phase: u[6] },
        { kind: 'rings', x: ox, y: oy, pitch: p, phase: u[7], squash: 1, tilt: 0 },
        { kind: 'rings', x: ox + d * nx, y: oy + d * ny, pitch: p, phase: u[8], squash: 1, tilt: 0 },
      ]
      break
    }
    case 'Spokes': {
      // two radial gratings with offset centres: circular fringes through both
      const n = Math.round(U(9, 0.9, 1.8) / p * 1.2)
      // n * d sets how many fringe circles cross the view: a handful
      const d = U(10, 5, 12) / n
      layers = [
        { kind: 'spokes', x: ox - (d / 2) * Math.cos(theta), y: oy - (d / 2) * Math.sin(theta), count: n, turn: u[6] * TAU },
        { kind: 'spokes', x: ox + (d / 2) * Math.cos(theta), y: oy + (d / 2) * Math.sin(theta), count: n, turn: u[7] * TAU },
        { kind: 'spokes', x: ox + d * 0.87 * nx, y: oy + d * 0.87 * ny, count: n, turn: u[8] * TAU },
      ]
      break
    }
    case 'Waves': {
      // a gentle wave over straight lines: the fringes magnify the wave
      const slant = sign * 2 * Math.asin(Math.min(0.5, p / (5 * F)))
      layers = [
        { kind: 'lines', angle: theta, pitch: p, phase: u[6] },
        { kind: 'waves', angle: theta + slant, pitch: p * U(14, 0.96, 1.04), phase: u[7], amp: U(10, 0.35, 0.9) * p, wavelength: U(11, 0.3, 0.7), wavePhase: u[12] * TAU },
        { kind: 'waves', angle: theta - slant, pitch: p, phase: u[8], amp: U(13, 0.35, 0.9) * p, wavelength: U(15, 0.35, 0.8), wavePhase: u[16] * TAU },
      ]
      break
    }
    default: {
      // Spiral: an m-armed spiral over rings, centres a few pitches apart
      const arms = 1 + Math.floor(u[9] * 6)
      const d = U(10, 0, 3) * p
      layers = [
        { kind: 'rings', x: ox, y: oy, pitch: p, phase: u[6], squash: 1, tilt: 0 },
        { kind: 'spiral', x: ox + d * Math.cos(theta), y: oy + d * Math.sin(theta), pitch: p, arms, phase: u[7], hand: sign },
        // the mirror spiral over it turns the fringes into a rosette
        { kind: 'spiral', x: ox, y: oy, pitch: p, arms, phase: u[8], hand: -sign },
      ]
    }
  }

  return {
    layers: f.Layers === 'Triple' ? layers : layers.slice(0, 2),
    pitch: p,
    duty: U(21, 0.42, 0.55),
    lens: f.Window === 'Lens' ? { x: U(19, -0.06, 0.06), y: U(20, -0.06, 0.06), r: U(18, 0.28, 0.38) } : undefined,
    disc: f.Window === 'Disc' ? { r: 0.43 } : undefined,
  }
}

function paint(ctx: Ctx, W: number, H: number, pal: Palette, pl: Plan) {
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
  ctx.fillStyle = pal.bg
  ctx.fillRect(0, 0, W, H)

  const S = Math.min(W, H)
  ctx.setTransform(S, 0, 0, S, W / 2, H / 2)
  const view: View = { hx: W / 2 / S, hy: H / 2 / S }

  // One ink for every grating: plain painting gives the same union of stripes
  // as the blend, at a fraction of the cost.
  const blend = pal.inks.every(c => c === pal.inks[0]) ? 'source-over' : pal.blend
  ctx.globalCompositeOperation = blend
  const lens = pl.lens
  if (!lens) {
    pl.layers.forEach((g, i) => drawGrating(ctx, g, view, pl.duty, pal.inks[i]))
  }
  else {
    drawGrating(ctx, pl.layers[0], view, pl.duty, pal.inks[0])
    // The upper gratings go on a separate layer the size of the lens, cut to
    // the lens and blended down in one go: much faster than clipping every
    // stripe to a circle while blending.
    const x0 = Math.floor(W / 2 + (lens.x - lens.r) * S) - 1
    const y0 = Math.floor(H / 2 + (lens.y - lens.r) * S) - 1
    const side = Math.ceil(2 * lens.r * S) + 3
    const lc = new OffscreenCanvas(side, side)
    const lx = lc.getContext('2d', { willReadFrequently: true })
    if (lx) {
      lx.setTransform(S, 0, 0, S, W / 2 - x0, H / 2 - y0)
      lx.globalCompositeOperation = blend
      pl.layers.slice(1).forEach((g, i) => drawGrating(lx, g, view, pl.duty, pal.inks[i + 1]))
      lx.globalCompositeOperation = 'destination-in'
      lx.beginPath()
      lx.arc(lens.x, lens.y, lens.r, 0, Math.PI * 2)
      lx.fill()
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.drawImage(lc, x0, y0)
      ctx.setTransform(S, 0, 0, S, W / 2, H / 2)
    }
  }
  if (pl.disc) {
    // cover everything outside the disc with the ground (cheaper than a clip)
    ctx.globalCompositeOperation = 'source-over'
    ctx.beginPath()
    ctx.rect(-view.hx - 1, -view.hy - 1, 2 * view.hx + 2, 2 * view.hy + 2)
    ctx.arc(0, 0, pl.disc.r, 0, Math.PI * 2)
    ctx.fillStyle = pal.bg
    ctx.fill('evenodd')
  }
}

function render(g: CanvasRenderingContext2D, W: number, H: number, hash: string) {
  const f = features(hash)
  const pal = PAL[f.Palette]
  const pl = plan(hash, f)
  const S = Math.min(W, H)

  g.save()
  // When a period spans fewer than ~8 pixels the stripes start to alias into
  // false fringes: draw at up to 3x, so that it spans about 8, and filter down.
  const k = Math.min(3, 8 / (pl.pitch * S))
  if (k < 1.2) {
    paint(g, W, H, pal, pl)
  }
  else {
    const off = new OffscreenCanvas(Math.round(W * k), Math.round(H * k))
    const oc = off.getContext('2d', { willReadFrequently: true })
    if (oc) {
      paint(oc, off.width, off.height, pal, pl)
      g.setTransform(1, 0, 0, 1, 0, 0)
      g.globalCompositeOperation = 'source-over'
      g.globalAlpha = 1
      g.imageSmoothingEnabled = true
      g.imageSmoothingQuality = 'high'
      g.drawImage(off, 0, 0, W, H)
    }
    else {
      paint(g, W, H, pal, pl)
    }
  }
  g.restore()
}

export default {
  slug: 'moire',
  title: 'Moiré',
  summary: 'Two or three gratings of lines, rings, spokes, waves or spirals overprinted slightly out of step, until large interference fringes rise out of them.',
  order: 150,
  traits: TRAITS,
  features,
  render,
  // Seed-of-seeds 0x30a1e5e5 ("gallery" stream, 64-hex candidates): the
  // first hash found for each Palette x Gratings pair, twelve pairs. The
  // fifth one found (Night, warped lines) leads, as the index cover.
  gallery: [
    '0x170ce58ccab00de4d950e29a49e6b9f3efb1c9facd3f72a401f49d88fe47c0b2',
    '0x921dd4fe520db4208255faa50e864b9c4d4fbb82857a09efb644a3fbc3cc1020',
    '0xdc917111d582cc5ca96f1a0c9206199e9b235e36860c8e9e223d06902c2a8d77',
    '0xe2d9202724c0458d208470273ae1ceeffb29a92c2ea24b6d822fba593faebda5',
    '0x9323859c54a1f05eea02d54272f65f429ab4302302072d1519041b38181eaeb8',
    '0xadd7146cb9508d23265b73272bca25b1c6accceaaa71d71810bc4af00abaf8b0',
    '0xd9b639bd31221c950ff9ee6435d03367494045850e1b398b8d5d43ac5025883d',
    '0x7bef80eb0a5fd5387b15c680d6674465a70079ae951942fcc30f1c563b8a1932',
    '0x7c6fcd52569ae7ac12f31aa99dbcb37653183f6e6ae1f6278ffe3c33b4cd7901',
    '0xf41c8cc9e212bf03b485f325b69aae51263cadf504a859a956b73b80ec44c024',
    '0x6de640670aa9271f7ee35e4272ed5b8c695d5c195628cd2aa52058e21dcaea0d',
    '0x9d5762f54f6f3343411ae88005a2d186c1b47f0392cd66a37e29eb1e7087803a',
  ],
} satisfies Series
