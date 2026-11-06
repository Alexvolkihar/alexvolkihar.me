// "Circuit" — printed circuit boards that were never fabricated.
//
// Parts are placed on a routing grid from footprints in real proportions (a
// grid cell is about 0.635 mm: SOIC leads 2 cells apart, header pins 4), a
// netlist ties their pins together (buses between facing chip sides,
// decoupling capacitors, a crystal and its load capacitors, LEDs and their
// resistors, random point-to-point nets, escape vias to the inner planes),
// and every connection is routed in turn by a grid maze router (A* over cells,
// layers and arrival directions, after Lee 1961 and Hart, Nilsson & Raphael
// 1968). Then the board is "fabricated": a ground pour with clearances and
// thermal reliefs, solder mask over the copper, gold pads, a silkscreen
// legend in a stroke font of its own, and, on assembled boards, the parts.
//
// Everything is a pure function of the hash; every length is a number of
// routing cells, and a cell is a fixed fraction of the canvas short side.

import type { BoardSpec, Layout } from '../circuit/board'
import type { Palette } from '../circuit/draw'
import type { Series } from '../types'
import { buildBoard } from '../circuit/board'
import { drawPads, drawParts, drawPour, drawSilk, drawTracks, drawVias, fillRR } from '../circuit/draw'
import { stream, weighted } from '../random'

// Rarity table, decided before the drawing code. Never reorder: it re-rolls the edition.
const TRAITS = {
  Mask: [['Green', 34], ['Blue', 18], ['Black', 16], ['Purple', 16], ['White', 16]],
  Layout: [['Logic', 35], ['Analog', 25], ['Power', 20], ['Memory', 20]],
  Routing: [['Mitred', 45], ['Right-angle', 25], ['Rounded', 15], ['Two-layer', 15]],
  Pour: [['None', 40], ['Solid', 40], ['Hatched', 20]],
  Assembly: [['Bare', 40], ['Populated', 40], ['Partial', 20]],
} as const

type TraitName = keyof typeof TRAITS
type Features = { [K in TraitName]: typeof TRAITS[K][number][0] }

function features(hash: string): Features {
  const r = stream(hash, 'features')
  return {
    Mask: weighted(r, TRAITS.Mask),
    Layout: weighted(r, TRAITS.Layout),
    Routing: weighted(r, TRAITS.Routing),
    Pour: weighted(r, TRAITS.Pour),
    Assembly: weighted(r, TRAITS.Assembly),
  }
}

// Solder masks over copper, gold (ENIG) pads, white or black legend.
const PAL: Record<Features['Mask'], Palette> = {
  Green: { bench: '#d9d5cb', base: '#15492b', tint: '#2c7444', hi: '#4a9461', ghost: '#286b3f', silk: '#f1efe6', gold: '#d2a54c', goldHi: '#f3dc96', edge: '#b9ad84' },
  Blue: { bench: '#dcd8cf', base: '#0f3466', tint: '#22528f', hi: '#4472b0', ghost: '#1f4c8b', silk: '#f3f3ee', gold: '#d4a94f', goldHi: '#f4de9a', edge: '#b5ac88' },
  Black: { bench: '#cdc8bd', base: '#131415', tint: '#2a2f33', hi: '#464d53', ghost: '#262a2d', silk: '#eeede7', gold: '#d6aa50', goldHi: '#f5df9c', edge: '#8f8a76' },
  Purple: { bench: '#dad6cc', base: '#381c57', tint: '#563487', hi: '#7553a8', ghost: '#4f2f7e', silk: '#f5f1e8', gold: '#dbb35a', goldHi: '#f7e2a4', edge: '#b3a684' },
  White: { bench: '#2b2c2f', base: '#e9e8e2', tint: '#d5d3c9', hi: '#fbfaf6', ghost: '#d9d7cd', silk: '#202022', gold: '#cfa24a', goldHi: '#f1d995', edge: '#c8c0a4' },
}

// Cells per short side, track widths and legend height, in cells.
const LAYOUT: Record<Layout, { perSide: number, traceW: number, powerW: number, labelH: number }> = {
  Logic: { perSide: 100, traceW: 0.34, powerW: 0.6, labelH: 1.6 },
  Analog: { perSide: 86, traceW: 0.42, powerW: 0.7, labelH: 1.7 },
  Power: { perSide: 80, traceW: 0.6, powerW: 0.95, labelH: 1.9 },
  Memory: { perSide: 112, traceW: 0.32, powerW: 0.55, labelH: 1.5 },
}

function render(g: CanvasRenderingContext2D, W: number, H: number, hash: string) {
  const f = features(hash)
  const pal = PAL[f.Mask]
  const lay = LAYOUT[f.Layout]
  const S = Math.min(W, H)
  const margin = 0.035
  // grid size from the aspect ratio alone, so 300 px and 3000 px agree
  const cols = Math.floor((W / S - 2 * margin) * lay.perSide + 1e-6)
  const rows = Math.floor((H / S - 2 * margin) * lay.perSide + 1e-6)
  const c = S / lay.perSide
  const X0 = (W - cols * c) / 2
  const Y0 = (H - rows * c) / 2

  // Fixed stream order: place, nets, silk.
  const spec: BoardSpec = {
    cols,
    rows,
    perSide: lay.perSide,
    layout: f.Layout,
    routing: f.Routing,
    assembly: f.Assembly,
    pour: f.Pour !== 'None',
    // hand-taped artwork used wider tracks
    traceW: lay.traceW * (f.Routing === 'Rounded' ? 1.3 : 1),
    powerW: lay.powerW * (f.Routing === 'Rounded' ? 1.15 : 1),
    labelH: lay.labelH,
  }
  const board = buildBoard(spec, stream(hash, 'place'), stream(hash, 'nets'), stream(hash, 'silk'))

  g.save()
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.globalAlpha = 1
  g.fillStyle = pal.bench
  g.fillRect(0, 0, W, H)

  // board outline and its shadow on the bench
  g.setTransform(c, 0, 0, c, X0 + c / 2, Y0 + c / 2)
  const bx0 = -0.5
  const by0 = -0.5
  const bx1 = cols - 0.5
  const by1 = rows - 0.5
  const corner = 1.8
  g.save()
  g.shadowColor = 'rgba(0,0,0,0.35)'
  g.shadowBlur = S * 0.012
  g.shadowOffsetY = S * 0.004
  fillRR(g, bx0, by0, bx1, by1, corner, pal.base)
  g.restore()
  fillRR(g, bx0, by0, bx1, by1, corner, pal.edge)
  fillRR(g, bx0 + 0.22, by0 + 0.22, bx1 - 0.22, by1 - 0.22, corner - 0.2, pal.base)

  if (spec.pour)
    drawPour(g, board, pal, f.Pour === 'Hatched', 0.38)
  drawTracks(g, board, pal)
  drawSilk(g, board, pal)
  drawPads(g, board, pal, f.Mask === 'White' ? '#3b3c3f' : '#2a2a2c')
  drawVias(g, board, pal)
  drawParts(g, board)

  // the key notch of an edge connector
  const edge = board.parts.find(p => p.kind === 'edge' && p.pads.length)
  if (edge) {
    const xs = edge.pads.map(p => p.x)
    let gap = xs[0]
    for (let i = 1; i < xs.length; i++) {
      if (xs[i] - xs[i - 1] > 2)
        gap = (xs[i] + xs[i - 1]) / 2
    }
    fillRR(g, gap - 0.9, rows - 4.2, gap + 0.9, rows + 1, 0.9, pal.bench)
    // chamfered corners of the edge connector strip
    g.fillStyle = pal.bench
    g.beginPath()
    g.moveTo(bx0 - 0.1, by1 - 2.2)
    g.lineTo(bx0 + 2.2, by1 + 0.1)
    g.lineTo(bx0 - 0.1, by1 + 0.1)
    g.moveTo(bx1 + 0.1, by1 - 2.2)
    g.lineTo(bx1 - 2.2, by1 + 0.1)
    g.lineTo(bx1 + 0.1, by1 + 0.1)
    g.fill()
  }
  g.restore()
}

export default {
  slug: 'circuit',
  title: 'Circuit',
  summary: 'Printed circuit boards that were never made: parts placed on a grid, nets routed by a maze router at 45° and 90°, ground pours, gold pads and silkscreen legends.',
  order: 480,
  traits: TRAITS,
  features,
  render,
  // Seed-of-seeds 0xc12c0170 ("gallery" stream): the first hash found for each
  // Mask x Layout pair, the first twelve pairs in the order found, except that
  // the seventh (a green memory module, the archetype of the series) is moved
  // first to serve as the cover.
  gallery: [
    '0x5be9ad8f1dbd009ff0d5aa7965740ff4b8d7d9a41deeb95754ec174c2221bda6',
    '0x42da1459265a8bed2026bf67bae70b1be5f591c5cc4a1145e8519492d9768fe0',
    '0x60788938f47b2a86fc9c0930db00ca87577b9fb525870d026a57a76f7e27f336',
    '0x9ee2c02a760e21f55fd53f71ebc50b92743c773cabd5479dc09da469b8d15c61',
    '0xa6d50b20af7693da34d60e9ef3e054886423bfd4a5073ffbe7ec35827ba799f3',
    '0x218bc3cb5b5d01abfda7adb6b6b7dbeaaf5f536b77bc359d8e9fd4c135602874',
    '0x6c9b02cba2d21f28f3a80f94740beb1c4a1a6124c8fa46e74cd8a57df0d9e59a',
    '0xd936016bcc00cb1412d3b71564c6ea20ee56b2c4b626e4057ecd17b3828ccbb9',
    '0xf598de23c242663761e90b6d9cf8a10a9ba77e4cbc003b3217e59efdc44ab93a',
    '0xbfe8354a69c57fc2b90e97a2ca475f0f92f9ee6ec16ac27e85c3648941c73912',
    '0xc9edbccfe6e3ea39cbc79cfdab6fde21d0473be94efdfff7010c5eeb67a65bf1',
    '0x956a3c0250720ad1459eda8e346ac16df29d775c81751a0151c69914a4420dcb',
  ],
} satisfies Series
