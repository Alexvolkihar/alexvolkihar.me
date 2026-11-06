// "Isolines" — the level sets of a constructed distance field.
//
// A figure is built from a handful of signed distance functions (circles,
// boxes, capsules, triangles) joined by smooth unions, subtractions and
// shells, after Inigo Quilez's articles (see ../isolines/sdf.ts). The field
// is then cut into level lines spaced a fixed distance apart, in a rhythm of
// a few lines and a band: the bands are left blank, ruled with hatching or
// filled flat, and the hatching turns at the figure's outline. A few events
// chosen by the hash disturb the field locally: a seam where the lines step
// by a phase, a fold that creases them, a ripple that makes them wave.
//
// Everything is a pure function of the hash, and every length is a fraction
// of the canvas short side. The figure sits at the centre; on a wider or
// taller canvas its outer level lines keep going to the edges.

import type { BandStyle, RGB } from '../isolines/draw'
import type { EventName, FigureName } from '../isolines/figures'
import type { Series } from '../types'
import { paintBands, sampleGrid, traceLevel, traceLevels } from '../isolines/draw'
import { buildEvents, buildFigure, makeField } from '../isolines/figures'
import { int, stream, weighted } from '../random'

// ---------------------------------------------------------------------------
// Rarity table — decided before the drawing code, never reordered.
// Changing a weight or an order re-rolls the whole edition.
// ---------------------------------------------------------------------------

const TRAITS = {
  Palette: [['Graphite', 22], ['Riso', 20], ['Signal', 18], ['Ochre', 14], ['Verdigris', 12], ['Night', 14]],
  Figure: [['Emblem', 26], ['Pair', 20], ['Constellation', 24], ['Lattice', 15], ['Frame', 15]],
  Banding: [['Bare', 20], ['Hatched', 35], ['Cross-hatched', 15], ['Solid', 30]],
  Event: [['Calm', 10], ['Seam', 25], ['Fold', 25], ['Ripple', 25], ['Mixed', 15]],
  Spacing: [['Fine', 30], ['Medium', 45], ['Wide', 25]],
} as const satisfies Record<string, ReadonlyArray<readonly [string, number]>>

type TraitName = keyof typeof TRAITS
type Features = { [K in TraitName]: typeof TRAITS[K][number][0] }

/** Pure function of the hash, computed before (and without) any rendering. */
function features(hash: string): Features {
  const r = stream(hash, 'features')
  return {
    Palette: weighted(r, TRAITS.Palette),
    Figure: weighted(r, TRAITS.Figure),
    Banding: weighted(r, TRAITS.Banding),
    Event: weighted(r, TRAITS.Event),
    Spacing: weighted(r, TRAITS.Spacing),
  }
}

// ---------------------------------------------------------------------------
// Palettes: original, after printing inks rather than after any one artwork.
// ---------------------------------------------------------------------------

interface Palette {
  paper: string
  /** Lines outside the figure, and the frame rule. */
  ink: string
  /** Lines inside the figure. */
  inner: string
  /** The figure's outline. */
  outline: string
  /** Band colours, cycled from the outline outwards. */
  bands: readonly string[]
  /** Hatching weight: light rules on a dark paper need more body to read. */
  rule: number
}

const PAL: Record<Features['Palette'], Palette> = {
  Graphite: { paper: '#eeebe3', ink: '#232220', inner: '#4b4842', outline: '#c2412c', bands: ['#232220', '#8a847a'], rule: 1 },
  Riso: { paper: '#f4efe3', ink: '#2c4ea3', inner: '#de4a7c', outline: '#de4a7c', bands: ['#2c4ea3', '#de4a7c', '#f0b43c'], rule: 1 },
  Signal: { paper: '#f2eee7', ink: '#161616', inner: '#cf3a24', outline: '#cf3a24', bands: ['#cf3a24', '#161616'], rule: 1 },
  Ochre: { paper: '#f0e4c9', ink: '#3b2b1d', inner: '#8c4a20', outline: '#2d5c69', bands: ['#c88d2a', '#8c4a20', '#3b2b1d'], rule: 1 },
  Verdigris: { paper: '#e4ebe3', ink: '#163934', inner: '#3e7e6c', outline: '#b5582f', bands: ['#3e7e6c', '#163934', '#9dc0ad'], rule: 1 },
  Night: { paper: '#10131b', ink: '#d8d2c3', inner: '#8fb0d8', outline: '#e2a649', bands: ['#5b82c4', '#d8d2c3', '#e2a649'], rule: 1.5 },
}

function rgb(c: string): RGB {
  const v = Number.parseInt(c.slice(1), 16)
  return [v >> 16, (v >> 8) & 255, v & 255]
}

/** Gap between two neighbouring lines, as a fraction of the short side. */
const SPACING: Record<Features['Spacing'], number> = { Fine: 0.0062, Medium: 0.0088, Wide: 0.0125 }

const FILL: Record<Features['Banding'], BandStyle['fill'] | null> = {
  'Bare': null,
  'Hatched': 'hatch',
  'Cross-hatched': 'cross',
  'Solid': 'solid',
}

function render(ctx: CanvasRenderingContext2D, W: number, H: number, hash: string): void {
  const f = features(hash)
  const pal = PAL[f.Palette]
  const S = Math.min(W, H)
  const spacing = SPACING[f.Spacing]

  // Fixed stream order: rhythm, figure, events.
  const rr = stream(hash, 'rhythm')
  const lines = int(rr, 2, 5)
  const period = lines + int(rr, 1, 2)
  const phase = rr() * period
  const angle = rr() * Math.PI
  const shift = int(rr, 0, pal.bands.length - 1)

  const prims = buildFigure(stream(hash, 'figure'), f.Figure as FigureName)
  const events = buildEvents(stream(hash, 'events'), f.Event as EventName, prims, spacing, period * spacing)
  const field = makeField(prims, events)

  // Grid pitch in pixels: finer on small canvases, capped for 8K exports.
  const cell = S / Math.max(200, Math.min(800, S / 2.4))
  const grid = sampleGrid(field, W, H, S, cell, 1 / spacing, phase)

  const margin = Math.round(0.045 * S)
  const box = [margin, margin, W - margin, H - margin] as const
  const paper = rgb(pal.paper)
  ctx.globalAlpha = 1
  ctx.fillStyle = pal.paper
  ctx.fillRect(0, 0, W, H)

  const fill = FILL[f.Banding]
  if (fill) {
    const colours = pal.bands.map((_, i) => rgb(pal.bands[(i + shift) % pal.bands.length]))
    paintBands(ctx, grid, W, H, paper, {
      lines,
      period,
      gap: 0.42,
      fill,
      colours,
      zero: phase,
      angle,
      pitch: (fill === 'solid' ? 1 : 0.62) * spacing * S,
      halfWidth: 0.0007 * pal.rule * S,
    }, box)
  }

  // Lines: outside the figure, inside it, and its outline on top. Without
  // bands, the first line of each group leads, drawn heavier.
  const paths = [new Path2D(), new Path2D(), new Path2D(), new Path2D()]
  traceLevels(grid, (k) => {
    const slot = ((k % period) + period) % period
    if (slot >= lines)
      return -1
    return (k < phase ? 1 : 0) + (!fill && slot === 0 ? 2 : 0)
  }, paths)
  const outline = new Path2D()
  traceLevel(grid, phase, outline)

  ctx.save()
  ctx.beginPath()
  ctx.rect(box[0], box[1], box[2] - box[0], box[3] - box[1])
  ctx.clip()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (let i = 0; i < 4; i++) {
    ctx.lineWidth = (fill ? 0.0011 : i < 2 ? 0.0014 : 0.0034) * S
    ctx.strokeStyle = i % 2 ? pal.inner : pal.ink
    ctx.stroke(paths[i])
  }
  ctx.lineWidth = 0.0032 * S
  ctx.strokeStyle = pal.outline
  ctx.stroke(outline)
  ctx.restore()

  // A thin rule around the sheet.
  ctx.lineWidth = 0.0014 * S
  ctx.strokeStyle = pal.ink
  ctx.strokeRect(box[0] - 0.008 * S, box[1] - 0.008 * S, box[2] - box[0] + 0.016 * S, box[3] - box[1] + 0.016 * S)
}

export default {
  slug: 'isolines',
  title: 'Isolines',
  summary: 'Level lines of figures built from signed distance functions, banded, hatched or filled, and disturbed here and there by a seam, a fold or a ripple.',
  order: 280,
  traits: TRAITS,
  features,
  render,
  // Seed-of-seeds 0x150115e5 ("gallery" stream): the first hash found for each
  // figure × banding pair, so the selection covers the table. The cover (a
  // solid lattice) is moved to the front; the rest keep the order found.
  gallery: [
    '0xa53c41f8c0e4c9af4dad289037e4651969709d6969e567957d7dab5ffa6bc055', // Riso / Lattice / Solid / Calm / Medium
    '0x3b9d936964f2b22dd084b493247b40206f0c38e7e7d23b6d74b7f980fe7f3e4f', // Riso / Emblem / Cross-hatched / Mixed / Wide
    '0x77bb0e654f0e2791968471a09827acd12a56581ae815a47bdb9d655782be0145', // Graphite / Frame / Solid / Mixed / Wide
    '0x20d20bc75adf5b4855ebf234c35322047db8bbd0c40db6a3e5f9afb7866ef5e3', // Graphite / Constellation / Bare / Seam / Medium
    '0x170a788245ba6cd1a23c30d749768ff17f661cabe610cec87691e211b67753cc', // Signal / Lattice / Bare / Mixed / Medium
    '0xdc057d92e42e5c36230ee36a53dcf7d47c7bfbc54e584a0ad4732d363f1832e1', // Graphite / Emblem / Solid / Seam / Medium
    '0x758af604554bfa231785ff01774bf221dce06509cd929ab6d606290becd94110', // Ochre / Pair / Cross-hatched / Seam / Wide
    '0xbb0b32b631ebfbce57ac3f5259ae678d235c344a95eb48f08b5b50752d618321', // Riso / Frame / Cross-hatched / Seam / Wide
    '0xf9b8fa09ffa756f9abf4b1be760bffe49a50e9eb0e329f87e9a9a33c77006041', // Graphite / Constellation / Hatched / Ripple / Medium
    '0xc917345710a0ad83d8b57c2066ea5f60ec8693dff252d6ab4152bdb5b5cbb2ca', // Graphite / Emblem / Hatched / Fold / Wide
    '0x9f47bb9eaf2e6ed8727784d3c7991696aa1f405c475bb35146cd8c04aa70418b', // Verdigris / Pair / Hatched / Seam / Medium
    '0x054b5f33b905ad10b6990c6e07d4ac2b9d9cbe4b1cbc7fcf940b36da2df77b5e', // Riso / Pair / Solid / Seam / Medium
  ],
} satisfies Series
