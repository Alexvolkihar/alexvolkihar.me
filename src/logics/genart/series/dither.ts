// "Dither" — procedural grayscale scenes reduced to a few colours on a grid
// of chunky pixels.
//
// A subject (balls on a floor, a still life, a plaster bust, a coast at
// sunset, a poster of gradients) is computed as a tone on a coarse grid whose
// size is a fixed number of cells along the canvas short side. The tone is
// dithered to two, three or four levels by error diffusion (Floyd–Steinberg,
// Atkinson, Jarvis–Judice–Ninke) or by an ordered matrix (Bayer, or blue
// noise from void-and-cluster), mapped to a palette and blown up with
// nearest-neighbour scaling. The grid depends only on the hash and the aspect
// ratio, never on the pixel size, so a hash gives the same piece at any size.

import type { DitherMethod } from '../dither/dither'
import type { SceneFn } from '../dither/scenes'
import type { Rng } from '../random'
import type { Series } from '../types'
import { dither } from '../dither/dither'
import { bust, gradients, landscape, spheres, stillLife } from '../dither/scenes'
import { int, pick, range, stream, weighted } from '../random'

// ---------------------------------------------------------------------------
// Rarity table — decided before the drawing code, never reordered.
// ---------------------------------------------------------------------------

const TRAITS = {
  Scene: [['Spheres', 22], ['Still life', 22], ['Landscape', 22], ['Bust', 14], ['Gradients', 20]],
  Dither: [['Floyd–Steinberg', 28], ['Atkinson', 22], ['Jarvis–Judice–Ninke', 14], ['Bayer', 20], ['Blue noise', 16]],
  Palette: [['Handheld', 24], ['One-bit', 24], ['CGA', 14], ['Riso', 22], ['Phosphor', 16]],
  Pixels: [['Fine', 22], ['Medium', 40], ['Chunky', 26], ['Bold', 12]],
} as const

type TraitName = keyof typeof TRAITS
type Features = { [K in TraitName]: typeof TRAITS[K][number][0] }

function features(hash: string): Features {
  const r = stream(hash, 'features')
  return {
    Scene: weighted(r, TRAITS.Scene),
    Dither: weighted(r, TRAITS.Dither),
    Palette: weighted(r, TRAITS.Palette),
    Pixels: weighted(r, TRAITS.Pixels),
  }
}

const SCENES: Record<Features['Scene'], (r: Rng) => SceneFn> = {
  'Spheres': spheres,
  'Still life': stillLife,
  'Landscape': landscape,
  'Bust': bust,
  'Gradients': gradients,
}

const METHOD: Record<Features['Dither'], DitherMethod> = {
  'Floyd–Steinberg': 'floyd',
  'Atkinson': 'atkinson',
  'Jarvis–Judice–Ninke': 'jarvis',
  'Bayer': 'bayer',
  'Blue noise': 'blue',
}

const CONTRAST: Record<number, number> = { 2: 1.6, 3: 1.3, 4: 1.15 }

/** Cells along the short side of the canvas. */
const CELLS: Record<Features['Pixels'], number> = { Fine: 200, Medium: 150, Chunky: 108, Bold: 76 }

// ---------------------------------------------------------------------------
// Palettes, darkest level first. Riso is a pair of inks overprinted on paper.
// ---------------------------------------------------------------------------

const RAMPS: Record<Exclude<Features['Palette'], 'Riso'>, readonly string[]> = {
  // a green reflective LCD
  'Handheld': ['#15301b', '#3b5e2b', '#86a03a', '#c6d18f'],
  // black on a warm white
  'One-bit': ['#16161a', '#f1ede2'],
  // the high-intensity CGA mode 4 palette 1: black, magenta, cyan, white
  'CGA': ['#000000', '#ff55ff', '#55ffff', '#ffffff'],
  // an amber monitor: off, normal, bright
  'Phosphor': ['#120b05', '#8f5410', '#ffbd4a'],
}

// [paper, light ink, dark ink]
const RISO: readonly (readonly [string, string, string])[] = [
  ['#f3eee2', '#ff5ca8', '#2a6fc0'],
  ['#f2ece0', '#ff7a3d', '#16808a'],
  ['#efe9dc', '#f2c419', '#6b4fa0'],
]

/** Two quantiles of the tones, read from a 512-bin histogram over [0, 1]. */
function percentiles(tone: Float32Array, a: number, b: number): [number, number] {
  const B = 512
  const hist = new Uint32Array(B)
  for (let i = 0; i < tone.length; i++)
    hist[Math.min(B - 1, Math.max(0, Math.floor(tone[i] * B)))]++
  const qa = a * tone.length
  const qb = b * tone.length
  let acc = 0
  let lo = 0
  let hi = 1
  let seenA = false
  for (let k = 0; k < B; k++) {
    acc += hist[k]
    if (!seenA && acc >= qa) {
      lo = k / B
      seenA = true
    }
    if (acc >= qb) {
      hi = (k + 1) / B
      break
    }
  }
  return [lo, hi]
}

function hexRgb(h: string): [number, number, number] {
  const v = Number.parseInt(h.slice(1), 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

function layer(w: number, h: number): { cv: HTMLCanvasElement | OffscreenCanvas, g: Ctx2D } {
  if (typeof OffscreenCanvas !== 'undefined') {
    const cv = new OffscreenCanvas(w, h)
    return { cv, g: cv.getContext('2d')! }
  }
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  return { cv, g: cv.getContext('2d')! }
}

function paint(levels: Uint8Array, w: number, h: number, colours: ReadonlyArray<[number, number, number] | null>) {
  const L = layer(w, h)
  const img = L.g.createImageData(w, h)
  const d = img.data
  for (let i = 0; i < w * h; i++) {
    const c = colours[levels[i]]
    if (!c)
      continue
    d[i * 4] = c[0]
    d[i * 4 + 1] = c[1]
    d[i * 4 + 2] = c[2]
    d[i * 4 + 3] = 255
  }
  L.g.putImageData(img, 0, 0)
  return L.cv
}

function render(g: CanvasRenderingContext2D, W: number, H: number, hash: string) {
  const f = features(hash)
  const S = Math.min(W, H)
  const N = CELLS[f.Pixels]
  const gw = Math.max(1, Math.round(N * W / S))
  const gh = Math.max(1, Math.round(N * H / S))

  // Fixed stream order: scene, palette, dither.
  const sr = stream(hash, 'scene')
  const pr = stream(hash, 'palette')
  const dr = stream(hash, 'dither')

  const scene = SCENES[f.Scene](sr)
  const riso = pick(pr, RISO)
  const regX = range(pr, -1, 1)
  const regY = range(pr, -1, 1)
  const ox = int(dr, 0, 63)
  const oy = int(dr, 0, 63)

  const tone = new Float32Array(gw * gh)
  scene(tone, gw, gh, N)

  const levels = f.Palette === 'Riso' ? 4 : RAMPS[f.Palette].length
  // Auto-levels: the 2nd and 98th percentiles of the scene become black and
  // white. Then an S-curve around mid-grey, steeper with fewer levels: two
  // tones need more separation between the masses of a scene to stay readable.
  const [lo, hi] = percentiles(tone, 0.02, 0.98)
  const span = Math.max(hi - lo, 0.25)
  const c = CONTRAST[levels]
  for (let i = 0; i < tone.length; i++) {
    const v = Math.min(1, Math.max(0, (tone[i] - lo) / span))
    tone[i] = v < 0.5 ? 0.5 * (2 * v) ** c : 1 - 0.5 * (2 - 2 * v) ** c
  }
  const q = dither(tone, gw, gh, levels, METHOD[f.Dither], ox, oy)

  g.save()
  g.globalAlpha = 1
  g.globalCompositeOperation = 'source-over'
  g.imageSmoothingEnabled = false
  if (f.Palette !== 'Riso') {
    const cols = RAMPS[f.Palette].map(hexRgb)
    g.drawImage(paint(q, gw, gh, cols), 0, 0, W, H)
  }
  else {
    // Levels, darkest first: both inks, dark ink, light ink, paper. Each ink
    // is its own layer, multiplied onto the paper; the dark one is printed
    // slightly out of register.
    const light = hexRgb(riso[1])
    const dark = hexRgb(riso[2])
    g.fillStyle = riso[0]
    g.fillRect(0, 0, W, H)
    g.globalCompositeOperation = 'multiply'
    g.drawImage(paint(q, gw, gh, [light, null, light, null]), 0, 0, W, H)
    const off = 0.0016 * S
    g.drawImage(paint(q, gw, gh, [dark, dark, null, null]), regX * off, regY * off, W, H)
  }
  g.restore()
}

export default {
  slug: 'dither',
  title: 'Dither',
  summary: 'Procedural still lifes, busts, coasts and posters reduced to two, three or four colours by error diffusion or ordered dithering, in big square pixels.',
  order: 380,
  traits: TRAITS,
  features,
  render,
  // Seed-of-seeds 0xd17e4d17 ("gallery" stream, 64-hex candidates): the
  // first hash found for each Scene x Palette pair, twelve pairs; the
  // coast on the green LCD is moved to the front as the cover.
  gallery: [
    '0x34b56b18daeecc9ab39c2325f140553d192858cbe5119417ebd126c34120ebd7',
    '0xe9ed8d43335856b479cae6006a80b0558cc35b95323fba7dea06f63ef5953c61',
    '0x6ddf14c076280a0c872af6ba47c68e2ac2a3372cb9e494ce1b9dcd9e3214fd5f',
    '0x3266b017ec9b807138c503caf1c103e7831e453e72d46d9e115a0c6333240937',
    '0x21dd68237eafcb32c2b26b19334c861efe60e1082f15e96122d92c6e0916b9e9',
    '0x1aa74279879ebc3b1503916870c39c19dbb76b8ecfdc26742c07414bce1a9859',
    '0x979fcbae1023fbe49130269c401fde0c92f665f398e11acd0448ee07c205bb8d',
    '0x10e5f3736e0169646526a1cf4d8db8543ee86e9af801e921ff824c15025521c4',
    '0x6101f807c864cdf8b919b79da1cc5422ea685ef92f29e2f15b3f887465644e73',
    '0x087cb32994851a44c4bbe0443b53840ed47b68d177399593619a76b843d3ff61',
    '0xa06a59278e01ea274805b38440c43b0ec7217cad3da650f4511d79bd475cd42e',
    '0x8d8aa0271625916d80392322cf72a92c8cc12c930562382609b411c7413869cc',
  ],
} satisfies Series
