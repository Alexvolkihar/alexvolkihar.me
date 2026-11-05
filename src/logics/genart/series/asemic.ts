// "Asemic" — pages of an invented script that reads like handwriting but
// means nothing.
//
// Each hash builds an alphabet of 20 to 40 glyphs from a small stroke
// vocabulary (humps, loops, hooks, bars, rings, dots) under the rules of one
// script, a lexicon of words made of those glyphs, then writes them out with
// a pen model: broad nib, pointed pen or brush, slight tremor, ink running
// dry and pooling where the pen lifts. No font is used: every mark is a path.
//
// Techniques (shared heritage, credited): centripetal Catmull-Rom splines
// (Barry & Goldman's pyramidal form), a swept-nib outline for the broad
// pen, Zipf-like letter and word frequencies for a text-like rhythm.

import type { Layout } from '../asemic/layout'
import type { Pen, PenKind } from '../asemic/pen'
import type { Rng } from '../random'
import type { Series } from '../types'
import { makeAlphabet, makeLexicon } from '../asemic/glyphs'
import { layout } from '../asemic/layout'
import { Scribe } from '../asemic/pen'
import { range, stream, weighted } from '../random'

// ---------------------------------------------------------------------------
// Rarity table — decided before the drawing code, never reordered.
// Changing a weight or an order re-rolls the whole edition.
// ---------------------------------------------------------------------------

const TRAITS = {
  Palette: [['Parchment', 24], ['Iron gall', 18], ['Indigo', 18], ['Vermilion', 16], ['Night', 14], ['Murex', 10]],
  Script: [['Looped', 30], ['Angular', 25], ['Geometric', 25], ['Hanging', 20]],
  Layout: [['Lines', 40], ['Codex', 25], ['Columns', 22], ['Spiral', 13]],
  Pen: [['Broad nib', 45], ['Fine', 30], ['Brush', 25]],
  Density: [['Sparse', 25], ['Even', 50], ['Dense', 25]],
} as const

type TraitName = keyof typeof TRAITS
type Features = { [K in TraitName]: typeof TRAITS[K][number][0] }

/** Pure function of the hash, computed before (and without) any rendering. */
function features(hash: string): Features {
  const r = stream(hash, 'features')
  return {
    Palette: weighted(r, TRAITS.Palette),
    Script: weighted(r, TRAITS.Script),
    Layout: weighted(r, TRAITS.Layout),
    Pen: weighted(r, TRAITS.Pen),
    Density: weighted(r, TRAITS.Density),
  }
}

// ---------------------------------------------------------------------------
// Palettes (original to this site): paper, its stains and edge, fresh and
// dry ink, accent (rubrics, initials, seals), marginal notes, ruling.
// ---------------------------------------------------------------------------

interface Palette {
  bg: string
  edge: string
  stain: string
  ink: string
  dry: string
  accent: string
  note: string
  rule: string
  dark: boolean
}

const PALETTES: Record<Features['Palette'], Palette> = {
  'Parchment': { bg: '#ecdfc1', edge: '#a8834e', stain: '#9c7642', ink: '#2a1f16', dry: '#6e5539', accent: '#a3301f', note: '#7a5a3a', rule: '#b49a70', dark: false },
  'Iron gall': { bg: '#e9e2d0', edge: '#958467', stain: '#8a7757', ink: '#2e211a', dry: '#85603d', accent: '#3d5c4a', note: '#6e5642', rule: '#bbae93', dark: false },
  'Indigo': { bg: '#e7e8e2', edge: '#949ea5', stain: '#7a8792', ink: '#1b2850', dry: '#4f6593', accent: '#c4552f', note: '#566a92', rule: '#b4bdc3', dark: false },
  'Vermilion': { bg: '#f2ecdd', edge: '#c3b08c', stain: '#ab9a76', ink: '#141311', dry: '#4c4842', accent: '#c4321d', note: '#5e5953', rule: '#d8cbae', dark: false },
  'Night': { bg: '#151c2e', edge: '#04060c', stain: '#2b3754', ink: '#dfb85e', dry: '#93794a', accent: '#e8dfca', note: '#8fa1c2', rule: '#2f3c5a', dark: true },
  'Murex': { bg: '#3a142f', edge: '#10040d', stain: '#5c2449', ink: '#eddcb2', dry: '#a88f6e', accent: '#dca744', note: '#cf9fbb', rule: '#5f2c50', dark: true },
}

/** x-height (fraction of the short side) and line pitch factor. */
const DENSITY: Record<Features['Density'], { h: number, lead: number }> = {
  Sparse: { h: 0.034, lead: 1.06 },
  Even: { h: 0.025, lead: 1 },
  Dense: { h: 0.0185, lead: 0.95 },
}

/** Line pitch in x-heights: loops need more room than rings. */
const LEAD: Record<Features['Script'], number> = { Looped: 3.35, Angular: 2.95, Geometric: 2.9, Hanging: 3.05 }

function hexToRgb(hex: string): [number, number, number] {
  const v = Number.parseInt(hex.slice(1), 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}

function rgba(hex: string, a: number) {
  const [r, g, b] = hexToRgb(hex)
  return `rgba(${r},${g},${b},${a.toFixed(3)})`
}

function mix(a: string, b: string, t: number) {
  const A = hexToRgb(a)
  const B = hexToRgb(b)
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`
}

// ---------------------------------------------------------------------------
// Paper: stains, an aged edge, fibres and specks.
// ---------------------------------------------------------------------------

function paper(g: CanvasRenderingContext2D, W: number, H: number, S: number, pal: Palette, r: Rng) {
  g.globalAlpha = 1
  g.fillStyle = pal.bg
  g.fillRect(0, 0, W, H)
  for (let i = 0; i < 28; i++) {
    const x = r() * W
    const y = r() * H
    const rad = range(r, 0.06, 0.34) * S
    const a = range(r, 0.03, pal.dark ? 0.09 : 0.075)
    const grd = g.createRadialGradient(x, y, 0, x, y, rad)
    grd.addColorStop(0, rgba(pal.stain, a))
    grd.addColorStop(1, rgba(pal.stain, 0))
    g.fillStyle = grd
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2)
  }
  // edge darkening
  const D = Math.hypot(W, H) / 2
  const v = g.createRadialGradient(W / 2, H / 2, D * 0.45, W / 2, H / 2, D)
  v.addColorStop(0, rgba(pal.edge, 0))
  v.addColorStop(1, rgba(pal.edge, pal.dark ? 0.55 : 0.4))
  g.fillStyle = v
  g.fillRect(0, 0, W, H)
  // fibres
  g.strokeStyle = rgba(pal.dark ? pal.note : pal.stain, pal.dark ? 0.08 : 0.13)
  g.lineWidth = Math.max(0.4, 0.0007 * S)
  g.beginPath()
  for (let i = 0; i < 160; i++) {
    const x = r() * W
    const y = r() * H
    const a = r() * Math.PI * 2
    const l = range(r, 0.01, 0.045) * S
    const bend = (r() - 0.5) * l * 0.6
    g.moveTo(x, y)
    g.quadraticCurveTo(x + Math.cos(a) * l / 2 - Math.sin(a) * bend, y + Math.sin(a) * l / 2 + Math.cos(a) * bend, x + Math.cos(a) * l, y + Math.sin(a) * l)
  }
  g.stroke()
  // specks (foxing on light paper)
  g.fillStyle = pal.dark ? rgba(pal.note, 0.18) : rgba(pal.stain, 0.3)
  g.beginPath()
  for (let i = 0; i < 90; i++) {
    const x = r() * W
    const y = r() * H
    const rad = (0.0005 + r() ** 3 * 0.003) * S
    g.moveTo(x + rad, y)
    g.arc(x, y, rad, 0, Math.PI * 2)
  }
  g.fill()
}

// ---------------------------------------------------------------------------

function makePen(r: Rng, kind: PenKind, slant: number): Pen {
  const dl = Math.hypot(slant, 1)
  const base = { kind, dx: -slant / dl, dy: 1 / dl }
  if (kind === 'Broad nib') {
    const a = range(r, 25, 45) * Math.PI / 180
    return { ...base, base: range(r, 0.1, 0.13), hair: 0.017, nx: Math.cos(a), ny: -Math.sin(a) }
  }
  if (kind === 'Fine')
    return { ...base, base: range(r, 0.085, 0.105), hair: 0.022, nx: 1, ny: 0 }
  return { ...base, base: range(r, 0.11, 0.14), hair: 0.02, nx: 1, ny: 0 }
}

function render(g: CanvasRenderingContext2D, W: number, H: number, hash: string) {
  const f = features(hash)
  const pal = PALETTES[f.Palette]
  const S = Math.min(W, H)

  // Fixed stream order: paper, alphabet, lexicon, pen, layout, hand, ink.
  const pr = stream(hash, 'paper')
  const ar = stream(hash, 'alphabet')
  const xr = stream(hash, 'lexicon')
  const nr = stream(hash, 'pen')
  const lay = stream(hash, 'layout')
  const hand = stream(hash, 'hand')
  const inkR = stream(hash, 'ink')

  g.save()
  g.lineCap = 'round'
  g.lineJoin = 'round'
  paper(g, W, H, S, pal, pr)

  const ab = makeAlphabet(ar, f.Script)
  const lex = makeLexicon(xr, ab)
  const pen = makePen(nr, f.Pen, ab.slant)
  const scribe = new Scribe(g, pen)
  const d = DENSITY[f.Density]
  const inks = Array.from({ length: 6 }, (_, i) => mix(pal.dry, pal.ink, (i + 0.5) / 6))

  layout({
    g,
    W,
    H,
    S,
    ab,
    lex,
    scribe,
    hand,
    lay,
    inkR,
    col: { bg: pal.bg, accent: pal.accent, note: pal.note, rule: pal.rule, wash: pal.dark ? pal.ink : pal.accent, inks },
    h: d.h,
    lead: LEAD[f.Script] * d.lead,
    ink: 1,
    seal: f.Palette === 'Vermilion' || lay() < 0.2,
  }, f.Layout as Layout)

  scribe.flushPools(pal.dark ? 0.22 : 0.3)
  g.restore()
  g.globalAlpha = 1
}

export default {
  slug: 'asemic',
  title: 'Asemic',
  summary: 'Pages of an invented script: an alphabet grown from a hash, written out in lines, columns, a spiral or a codex with broad nib, pointed pen or brush.',
  order: 100,
  traits: TRAITS,
  features,
  render,
  // Seed-of-seeds 0xa5e41c ("gallery" stream): the first hash found for each
  // Palette x Layout pair, in the order found, except that the second one
  // (Murex angular spiral) is moved first to serve as the cover.
  gallery: [
    '0x23bd9b5ae629a43712924c76391b385f4ffbcb25d30fcd5cbb47033ffd6afce4',
    '0xc0b77330c5031c29185a1b5ad55602352f9cb0d6ae6974b334709faacc8f2d06',
    '0x1fc07d63032c2c2fe8794ed836411d65f6492e29c22a8a33d371b75f8fb21046',
    '0x66b699f10c937edb0674183b8d4723b4bf0724dcdaa9623b300ebe580c64491b',
    '0x6652c294d28e5369701e2afeafefc1d524bb67e207e6d546f431fd10ae5d7d2b',
    '0xce41bc110869f3dae2953e8b8164e6706755ed6dbd8e75aeab027e96927ea4ee',
    '0x5b31c10315b1d38c427d2367db5f3e89c8cabd2d48c05f01a95ee0425536b8d4',
    '0xebe8b000b4f078c25dcfb70ff78283f8032245e87684cd511e87afd063fd99cc',
    '0x2540248f00e17146f2f6d68573006efe8ccb1e10d8a15c4161d1f31b91e04643',
    '0xe4cc7c00f864a490b04ca2b4566c668989f6e7ad8b402d1eecfef5876b0709bf',
    '0x3e541405302dde871815380ff214c7ef430910a46141d38d27e0235e94a38ac0',
    '0xa408ca9a8fae22c5f8b62376a27f4fa9c6e1ff4d02389897f10d10505929c6d6',
  ],
} satisfies Series
