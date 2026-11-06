// "Risograph" — procedural prints separated into two or three spot inks.
//
// A subject (a geometric poster, a bouquet or sprigs of leaves, a landscape,
// a still life) is drawn as colour separations: one greyscale plate per ink,
// where each shape is a solid, a flat tint or a ramp. The press then screens
// every plate into halftone dots, lines, squares or stochastic grain at its
// own angle, shifts it slightly out of register, and overprints the
// translucent inks on the paper (multiplied on white stock, screened on black
// stock). Coverage varies like a real drum: blotches, streaks along the feed,
// a fade towards the tail of the sheet and a few specks where the ink missed.
//
// Everything is a pure function of the hash and every length is a fraction of
// the canvas short side; the plates are drawn at a fixed resolution per short
// side, so a hash prints the same at any size. Wider or taller canvases show
// more of the background around the central square.

import type { Rng } from '../random'
import type { Frame } from '../risograph/plates'
import type { Layer, Spot } from '../risograph/print'
import type { Subject } from '../risograph/subjects'
import type { Series } from '../types'
import { range, stream, weighted } from '../random'
import { noise1, noise2, Plates } from '../risograph/plates'
import { canvas, INK_RES, PLATE_RES, print, readPlate } from '../risograph/print'
import { botanical, landscape, shapes, stillLife } from '../risograph/subjects'

// ---------------------------------------------------------------------------
// Rarity table — decided before the drawing code, never reordered.
// ---------------------------------------------------------------------------

const TRAITS = {
  Subject: [['Shapes', 30], ['Botanical', 25], ['Landscape', 25], ['Still life', 20]],
  Inks: [['Pink & Blue', 22], ['Sunflower & Teal', 18], ['Orange & Navy', 16], ['Yellow, Pink & Blue', 18], ['Mint, Red & Purple', 14], ['Black stock', 12]],
  Screen: [['Round dots', 40], ['Lines', 18], ['Squares', 22], ['Grain', 20]],
  Ruling: [['Fine', 25], ['Medium', 45], ['Coarse', 30]],
  Registration: [['Tight', 35], ['Loose', 45], ['Off', 20]],
} as const

type TraitName = keyof typeof TRAITS
type Features = { [K in TraitName]: typeof TRAITS[K][number][0] }

function features(hash: string): Features {
  const r = stream(hash, 'features')
  return {
    Subject: weighted(r, TRAITS.Subject),
    Inks: weighted(r, TRAITS.Inks),
    Screen: weighted(r, TRAITS.Screen),
    Ruling: weighted(r, TRAITS.Ruling),
    Registration: weighted(r, TRAITS.Registration),
  }
}

// ---------------------------------------------------------------------------
// Inks, lightest first, and papers. The ink colours are original
// approximations of common stencil-duplicator spot inks.
// ---------------------------------------------------------------------------

interface InkSet { paper: readonly string[], inks: readonly string[], dark?: boolean }

const INKS: Record<Features['Inks'], InkSet> = {
  'Pink & Blue': { paper: ['#f4efe4', '#f1ede6'], inks: ['#ff48b0', '#0078bf'] },
  'Sunflower & Teal': { paper: ['#f3eee2', '#efe8d6'], inks: ['#ffb511', '#00838a'] },
  'Orange & Navy': { paper: ['#f2ede1', '#ece6da'], inks: ['#ff6c2f', '#3d5588'] },
  'Yellow, Pink & Blue': { paper: ['#f5f1e8', '#f2eee6'], inks: ['#ffe800', '#ff48b0', '#0078bf'] },
  'Mint, Red & Purple': { paper: ['#f1eee6', '#efe9dd'], inks: ['#82d8d5', '#f15060', '#765ba7'] },
  'Black stock': { paper: ['#1d1c22', '#1a1d24'], inks: ['#ffe800', '#ff48b0', '#5ec8e5'], dark: true },
}

const SUBJECTS: Record<Features['Subject'], Subject> = {
  'Shapes': shapes,
  'Botanical': botanical,
  'Landscape': landscape,
  'Still life': stillLife,
}

const SPOT: Record<Features['Screen'], Spot> = {
  'Round dots': 'round',
  'Lines': 'line',
  'Squares': 'square',
  'Grain': 'grain',
}

/** Halftone cells per short side; grain uses much smaller cells. */
const RULING: Record<Features['Ruling'], { screen: number, grain: number }> = {
  Fine: { screen: 150, grain: 340 },
  Medium: { screen: 105, grain: 250 },
  Coarse: { screen: 66, grain: 180 },
}

/** Largest plate shift (fraction of the short side) and screen-angle error (degrees). */
const REGISTER: Record<Features['Registration'], { shift: number, turn: number }> = {
  Tight: { shift: 0.0012, turn: 0 },
  Loose: { shift: 0.0045, turn: 0.3 },
  Off: { shift: 0.011, turn: 1 },
}

/** Classic screen angles: the lightest ink alone at 0° on three-ink prints. */
const ANGLES: Record<number, readonly number[]> = { 2: [75, 15], 3: [0, 75, 15] }

const MARGIN = 0.035

function rgb(hex: string): [number, number, number] {
  const v = Number.parseInt(hex.slice(1), 16)
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255]
}

/** Ink coverage for one pass of the drum: blotches, feed streaks, a fade, specks. */
function inkMap(r: Rng, iw: number, ih: number, base: number): Float32Array {
  const nz = noise2(r)
  const st = noise1(r, 3)
  const streak = range(r, 0.04, 0.16)
  const fade = range(r, 0, 0.16)
  const bx = r() * 50
  const by = r() * 50
  const so = r() * 50
  const out = new Float32Array(iw * ih)
  const streaks = new Float32Array(iw)
  for (let i = 0; i < iw; i++)
    streaks[i] = 1 - streak * Math.max(0, st(i / INK_RES * 30 + so)) * 2
  for (let j = 0; j < ih; j++) {
    const v = j / INK_RES
    const tail = 1 - fade * j / ih
    for (let i = 0; i < iw; i++) {
      const u = i / INK_RES
      const blotch = nz(u * 4 + bx, v * 4 + by) * 0.6 + nz(u * 14 + by, v * 14 + bx) * 0.4
      let c = base * (1 - 0.28 * blotch) * streaks[i] * tail
      if (r() < 0.003)
        c *= 0.3
      out[j * iw + i] = c
    }
  }
  return out
}

function render(g: CanvasRenderingContext2D, W: number, H: number, hash: string) {
  const f = features(hash)
  const S = Math.min(W, H)
  // Fixed stream order: layout, print, ink.
  const lr = stream(hash, 'layout')
  const pr = stream(hash, 'print')
  const ir = stream(hash, 'ink')

  const set = INKS[f.Inks]
  const K = set.inks.length
  const w = W / S
  const h = H / S
  const F: Frame = { x0: -(w - 1) / 2, y0: -(h - 1) / 2, x1: (w + 1) / 2, y1: (h + 1) / 2 }

  // plates
  const pw = Math.ceil(w * PLATE_RES) + 1
  const ph = Math.ceil(h * PLATE_RES) + 1
  const gs = Array.from({ length: K }, () => {
    const { g: pg } = canvas(pw, ph)
    pg.fillStyle = '#000'
    pg.fillRect(0, 0, pw, ph)
    pg.setTransform(PLATE_RES, 0, 0, PLATE_RES, -F.x0 * PLATE_RES, -F.y0 * PLATE_RES)
    // the press never prints to the edge of the sheet
    pg.beginPath()
    pg.rect(F.x0 + MARGIN, F.y0 + MARGIN, w - 2 * MARGIN, h - 2 * MARGIN)
    pg.clip()
    return pg
  })
  SUBJECTS[f.Subject](lr, new Plates(gs), F)
  // On black stock a half-tint of light ink reads as murk: a tone curve thins
  // the washes and keeps the solids.
  const plates = gs.map(pg => readPlate(pg, pw, ph, set.dark ? 1.7 : 1))

  // press
  const reg = REGISTER[f.Registration]
  const paper = rgb(set.paper[Math.floor(pr() * set.paper.length)])
  const angles = ANGLES[K]
  const angleBase = (pr() < 0.5 ? 0 : 90)
  const iw = Math.ceil(w * INK_RES) + 1
  const ih = Math.ceil(h * INK_RES) + 1
  const layers: Layer[] = set.inks.map((hex, l) => {
    // the first plate is the reference the others are registered to
    const dx = l === 0 ? 0 : range(pr, -reg.shift, reg.shift)
    const dy = l === 0 ? 0 : range(pr, -reg.shift, reg.shift)
    const turn = range(pr, -reg.turn, reg.turn)
    const base = set.dark ? range(pr, 0.92, 1) : range(pr, 0.86, 0.96)
    return {
      rgb: rgb(hex),
      plate: plates[l],
      ink: inkMap(ir, iw, ih, base),
      dx,
      dy,
      angle: (angles[l] + angleBase + turn) * Math.PI / 180,
    }
  })
  const ruling = RULING[f.Ruling]
  const spot = SPOT[f.Screen]

  g.save()
  g.setTransform(1, 0, 0, 1, 0, 0)
  print(g, W, H, {
    paper,
    dark: !!set.dark,
    spot,
    cell: 1 / (spot === 'grain' ? ruling.grain : ruling.screen),
    layers,
    pw,
    ph,
    iw,
    ih,
  })
  g.restore()
}

export default {
  slug: 'risograph',
  title: 'Risograph',
  summary: 'Posters, bouquets, landscapes and still lifes separated into two or three spot inks, screened into halftone dots at different angles and overprinted slightly out of register.',
  order: 500,
  traits: TRAITS,
  features,
  render,
  gallery: [
    '0x912e5e42b88b3f3b5376cb6b6fd3ab897d3cf17108f5ed70de4c7a73b5230a22',
    '0xfc41bf939350cfb3a8a5f66fd6e8cdbfa47c950c08704d6cecb75ac1b9664543',
    '0x1cf4909f931c216f57d6aaa79db3c0316c3d24db49794a0b132cd47b6d0e4293',
    '0xc22de20b14ca5ad96aeede1b79501ae88aea9aeb7142b196c0e12496349e0f16',
    '0xb325e693a9fcae91944f1d65272b315a29069c9d79968014ee4b7639083a7fb1',
    '0xe40c7b32defe69e5ecdd3848ccf25e943c6c4c2e0002c675ea1c994f2aa3c56f',
    '0x48f61151355c9069efaa5ecf4ff54e575c2183d16d9a8edbe75ba0fb33ea0d33',
    '0x537fa23f09197f9d191108a943d7df26d69ca119129d3bf699ef50711bf1e956',
    '0x01654b3411d6af5d319a7a79793a381ca6800f50ab3e398c9730b3eb56c8cccd',
    '0x20b638b2721a27cdd3c6b8264a1d6d4494c17ac4c648c200addafd9985a07282',
    '0xccc23e059308922b6482ed0935fa8d6c718d1903a6c329ded826b5291cab1a6b',
    '0x45e1e5fb42975faed6f4c769f052cf924e5561f71ef232f136a678f609b89247',
  ],
} satisfies Series
