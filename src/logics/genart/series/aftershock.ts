// "Aftershock" — a calm patterned surface that has survived a few shocks.
//
// The surface is a field of fine patterns (ruled lines, waves, chevrons,
// dots, contours of a relief, rings around a few centres, or a patchwork of
// them) computed pixel by pixel from signed distances and value noise, with
// a slowly varying line weight. Then a main shock
// and its aftershocks, each smaller than the last, strike it: a shape whose
// inside is sliced along cracks and slid, pixelated, warped, eroded or
// inverted. Later shocks act on what the earlier ones left, so a crack can
// itself be pixelated or swirled. The plate sits in a paper margin.
//
// Everything is a pure function of the hash, and every length is a fraction
// of the canvas short side. On a wider or taller canvas the field runs to
// the margins and the shocks spread a little further along the long side.

import type { Field, Layer, RGB } from '../aftershock/field'
import type { Series } from '../types'
import { Baked, CHEVRON, CONTOURS, DOTS, makeLayer, RINGS, RULED, ValueNoise, WAVES } from '../aftershock/field'
import { buildShocks, ERODE, FAULT, INVERT, PIXEL, Plate, WARP } from '../aftershock/shocks'
import { int, range, stream, weighted } from '../random'

// ---------------------------------------------------------------------------
// Rarity table — decided before the drawing code, never reordered.
// Changing a weight or an order re-rolls the whole edition.
// ---------------------------------------------------------------------------

const TRAITS = {
  Palette: [['Soot', 26], ['Slate', 18], ['Ember', 14], ['Moss', 12], ['Cobalt', 14], ['Chalk', 16]],
  Surface: [['Ruled', 22], ['Waves', 18], ['Chevron', 12], ['Dots', 16], ['Contours', 16], ['Rings', 10], ['Patchwork', 6]],
  Shock: [['Faulted', 26], ['Pixelated', 18], ['Warped', 16], ['Eroded', 12], ['Inverted', 14], ['Mixed', 14]],
  Aftershocks: [['Few', 30], ['Several', 50], ['Swarm', 20]],
  Grain: [['Fine', 30], ['Medium', 45], ['Coarse', 25]],
} as const satisfies Record<string, ReadonlyArray<readonly [string, number]>>

type TraitName = keyof typeof TRAITS
type Features = { [K in TraitName]: typeof TRAITS[K][number][0] }

/** Pure function of the hash, computed before (and without) any rendering. */
function features(hash: string): Features {
  const r = stream(hash, 'features')
  return {
    Palette: weighted(r, TRAITS.Palette),
    Surface: weighted(r, TRAITS.Surface),
    Shock: weighted(r, TRAITS.Shock),
    Aftershocks: weighted(r, TRAITS.Aftershocks),
    Grain: weighted(r, TRAITS.Grain),
  }
}

// ---------------------------------------------------------------------------
// Palettes: original. Five dark grounds and one light one.
// ---------------------------------------------------------------------------

interface Palette {
  paper: string
  ground: string
  ink: string
  accent: string
  /** Hairline around the plate, for a ground close to the paper. */
  rule?: string
}

const PAL: Record<Features['Palette'], Palette> = {
  Soot: { paper: '#eee7d8', ground: '#141416', ink: '#e2dac8', accent: '#d5402c' },
  Slate: { paper: '#ebe7dd', ground: '#1b242c', ink: '#c8d2d5', accent: '#e3a43e' },
  Ember: { paper: '#f0e4d2', ground: '#22130f', ink: '#eccca8', accent: '#f0623a' },
  Moss: { paper: '#eae7d9', ground: '#141b16', ink: '#d0d6bc', accent: '#cf5b3d' },
  Cobalt: { paper: '#eeeae1', ground: '#0e1736', ink: '#dde2ee', accent: '#ff8b40' },
  Chalk: { paper: '#f5f1e8', ground: '#dcd5c5', ink: '#23211e', accent: '#c13a29', rule: '#23211e' },
}

function rgb(c: string): RGB {
  const v = Number.parseInt(c.slice(1), 16)
  return [v >> 16, (v >> 8) & 255, v & 255]
}

/** Pattern pitch, as a fraction of the short side. */
const PITCH: Record<Features['Grain'], number> = { Fine: 0.0072, Medium: 0.0098, Coarse: 0.0135 }

const FAMILY: Record<Exclude<Features['Surface'], 'Patchwork'>, number> = {
  Ruled: RULED,
  Waves: WAVES,
  Chevron: CHEVRON,
  Dots: DOTS,
  Contours: CONTOURS,
  Rings: RINGS,
}

const EFFECT: Record<Features['Shock'], number> = {
  Faulted: FAULT,
  Pixelated: PIXEL,
  Warped: WARP,
  Eroded: ERODE,
  Inverted: INVERT,
  Mixed: -1,
}

const COUNT: Record<Features['Aftershocks'], readonly [number, number]> = { Few: [2, 2], Several: [3, 4], Swarm: [5, 6] }

function buildField(hash: string, f: Features): Field {
  const r = stream(hash, 'field')
  const tone = new ValueNoise(r)
  const warp = new ValueNoise(r)
  const relief = new ValueNoise(r)
  const pitch = PITCH[f.Grain]
  const toneFreq = range(r, 1.2, 2.6)

  const layers: Layer[] = []
  const sx: number[] = []
  const sy: number[] = []
  if (f.Surface === 'Patchwork') {
    const n = int(r, 4, 7)
    const families = [RULED, WAVES, CHEVRON, DOTS, CONTOURS, RINGS]
    for (let i = 0; i < n; i++) {
      sx.push(range(r, -0.75, 0.75))
      sy.push(range(r, -0.75, 0.75))
      layers.push(makeLayer(r, families[int(r, 0, 5)], pitch, relief))
    }
  }
  else {
    layers.push(makeLayer(r, FAMILY[f.Surface], pitch, relief))
  }
  return { layers, sx, sy, gap: 0.0045, tone, warp, relief, toneFreq }
}

function clamp8(v: number): number {
  return v <= 0 ? 0 : v >= 255 ? 255 : (v + 0.5) | 0
}

function render(ctx: CanvasRenderingContext2D, W: number, H: number, hash: string): void {
  const f = features(hash)
  const pal = PAL[f.Palette]
  const S = Math.min(W, H)

  // Fixed stream order: field, then shocks.
  const field = buildField(hash, f)
  const sr = stream(hash, 'shocks')
  const [lo, hi] = COUNT[f.Aftershocks]
  const count = int(sr, lo, hi)
  const halfW = W / (2 * S)
  const halfH = H / (2 * S)
  const ground = rgb(pal.ground)
  const ink = rgb(pal.ink)
  const colours = { ground, ink, accent: rgb(pal.accent) }
  const shocks = buildShocks(sr, EFFECT[f.Shock], count, field.layers[0].pitch, 0.4 + 0.55 * (halfW - 0.5), 0.4 + 0.55 * (halfH - 0.5), colours)
  // shocks can fetch the surface from a little beyond the plate
  const baked = new Baked(field, -halfW - 0.2, -halfH - 0.2, halfW + 0.2, halfH + 0.2)
  const plate = new Plate(field, shocks, colours, S, baked)

  ctx.globalAlpha = 1
  ctx.fillStyle = pal.paper
  ctx.fillRect(0, 0, W, H)

  const margin = Math.round(0.05 * S)
  const iw = W - 2 * margin
  const ih = H - 2 * margin
  const top = shocks.length - 1
  const band = Math.max(1, Math.min(ih, Math.floor(4_000_000 / Math.max(1, iw))))
  for (let y0 = 0; y0 < ih; y0 += band) {
    const rows = Math.min(band, ih - y0)
    const img = ctx.createImageData(iw, rows)
    // one 32-bit word per pixel, alpha in the high byte (little-endian)
    const data = new Uint32Array(img.data.buffer)
    let o = 0
    for (let j = 0; j < rows; j++) {
      const y = (margin + y0 + j + 0.5 - H / 2) / S
      for (let i = 0; i < iw; i++) {
        plate.sample((margin + i + 0.5 - W / 2) / S, y, top)
        data[o++] = 0xFF000000 | (clamp8(plate.b) << 16) | (clamp8(plate.g) << 8) | clamp8(plate.r)
      }
    }
    ctx.putImageData(img, margin, margin + y0)
  }

  if (pal.rule) {
    ctx.lineWidth = 0.0012 * S
    ctx.strokeStyle = pal.rule
    ctx.strokeRect(margin, margin, iw, ih)
  }
}

export default {
  slug: 'aftershock',
  title: 'Aftershock',
  summary: 'A calm field of fine patterns struck by a main shock and its aftershocks: shapes whose inside is sliced along cracks, pixelated, warped, eroded or inverted.',
  order: 650,
  traits: TRAITS,
  features,
  render,
  // Seed-of-seeds 0xaf7e25c0 ("gallery" stream): the first hash found for
  // each surface × shock pair, weak pieces rejected after review. The cover
  // (a red stain over contours) is moved to the front; the rest keep the
  // order found.
  gallery: [
    '0xa81eb0105733598ab5a0580e1bdb96d381970b2279c36b989c126de0a06d380a', // Soot / Contours / Inverted / Several / Medium
    '0xdb97f949e7f2461c85d12b59f2c07212c847c951731b74b9fd5d84049d12711e', // Soot / Dots / Eroded / Several / Fine
    '0xa7a44b8f86070095a8e5895069eee46ce23b32fa5d17056bacfced6e10d27f95', // Slate / Chevron / Warped / Swarm / Medium
    '0xc1f72ff25853389241696ed37a0d071b00288becc774bc3f881c32345b0436d6', // Soot / Ruled / Mixed / Few / Coarse
    '0x35fa7656bf953b1a5a22894334f758bc96f5ea147d8c41288da5608f2d5d79da', // Moss / Waves / Pixelated / Few / Medium
    '0x568dbd744503b88f1bf51ec91edead13290616b8a1ac3577f556013e2364e4b0', // Moss / Contours / Eroded / Several / Coarse
    '0x09ac4c144dd9548470f4731eab2c7e8e5a986cab95da3e0a84735e236475e81d', // Cobalt / Ruled / Faulted / Swarm / Fine
    '0xacb6ce9e2b44f19794e24187848e1624214b8407415ffee59679af7c9d932e79', // Chalk / Waves / Warped / Several / Coarse
    '0x6aa851871bdb5c060c152e8b9231fa7cd27b2f29ebbcd88351b8f26b5623bcaa', // Slate / Patchwork / Pixelated / Swarm / Coarse
    '0x9d5047e8357c356226f3cba79d5c51a7d9d1c684a8559bfceb166108b39b6965', // Slate / Rings / Inverted / Few / Medium
    '0x45096c77317f8eac6022b33cbd7535a4820f50e0cca3e014b9fb476b618a7ece', // Soot / Rings / Mixed / Swarm / Medium
    '0xe1f51d2a5806e00084791277177136d7825c67ecd89bd63fbe63ed882a0bb5f5', // Ember / Dots / Inverted / Several / Coarse
  ],
} satisfies Series
