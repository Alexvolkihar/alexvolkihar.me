// "Stipple" — weighted Voronoi stippling of a procedural subject.
//
// A subject (a lit orb, hanging drapery, a nebula, a turned vase, a
// nautilus shell) is evaluated as a tone on a grid; a few thousand points are
// spread over it in proportion to the ink it needs and relaxed by Lloyd
// rounds towards the weighted centroids of their Voronoi regions (Secord,
// 2002, see ../stipple/lloyd.ts). The points are then printed as dots, or
// threaded into one continuous line by a travelling-salesman tour (nearest
// neighbour + 2-opt, see ../stipple/tsp.ts), or both.
//
// Everything is a pure function of the hash, and every length is a fraction
// of the canvas short side. Wider or taller canvases extend the paper around
// the central square; fields that fill space (drapery, nebula) extend with it.

import type { Field } from '../stipple/fields'
import type { Series } from '../types'
import { stream, weighted } from '../random'
import { drapery, nebula, orb, SHADOW, shell, vase } from '../stipple/fields'
import { stipple } from '../stipple/lloyd'
import { singleLine } from '../stipple/tsp'

// ---------------------------------------------------------------------------
// Rarity table — decided before the drawing code, never reordered.
// ---------------------------------------------------------------------------

const TRAITS = {
  Subject: [['Orb', 25], ['Drapery', 20], ['Nebula', 20], ['Vase', 15], ['Shell', 20]],
  Rendering: [['Dots', 45], ['Single line', 35], ['Line & dots', 20]],
  Points: [['Sparse', 25], ['Medium', 50], ['Dense', 25]],
  Paper: [['Ivory', 28], ['Cotton', 20], ['Kraft', 17], ['Slate', 15], ['Night', 20]],
} as const

type TraitName = keyof typeof TRAITS
type Features = { [K in TraitName]: typeof TRAITS[K][number][0] }

function features(hash: string): Features {
  const r = stream(hash, 'features')
  return {
    Subject: weighted(r, TRAITS.Subject),
    Rendering: weighted(r, TRAITS.Rendering),
    Points: weighted(r, TRAITS.Points),
    Paper: weighted(r, TRAITS.Paper),
  }
}

// ---------------------------------------------------------------------------
// Papers. `ink` prints the shadows, `light` the highlights (toned papers get
// both, the dark paper only light ink); `accent` is the thread in Line & dots.
// ---------------------------------------------------------------------------

interface Paper { bg: string, ink: string | null, light: string | null, accent: string, lineInLight?: boolean }

const PAPER: Record<Features['Paper'], Paper> = {
  Ivory: { bg: '#efe8d9', ink: '#1b1915', light: null, accent: '#b2442e' },
  Cotton: { bg: '#f7f5f0', ink: '#1d2c48', light: null, accent: '#c8643c' },
  Kraft: { bg: '#b48f66', ink: '#24180f', light: '#f7ecd6', accent: '#6e1f14' },
  Slate: { bg: '#56616b', ink: '#101418', light: '#eef1ec', accent: '#e3b25a', lineInLight: true },
  Night: { bg: '#111215', ink: null, light: '#f0e7d3', accent: '#d7a24a' },
}

// Points for the central square; the line needs fewer to stay readable.
const COUNT: Record<Features['Rendering'], Record<Features['Points'], number>> = {
  'Dots': { Sparse: 1600, Medium: 3200, Dense: 5600 },
  'Single line': { Sparse: 900, Medium: 1900, Dense: 3400 },
  'Line & dots': { Sparse: 700, Medium: 1400, Dense: 2400 },
}

// A glowing subject is drawn in light ink where it is dense, on dark paper,
// and gets no highlights on toned paper.
const SUBJECT: Record<Features['Subject'], { make: (r: () => number) => Field, glow: boolean }> = {
  Orb: { make: orb, glow: false },
  Drapery: { make: drapery, glow: false },
  Nebula: { make: nebula, glow: true },
  Vase: { make: vase, glow: false },
  Shell: { make: shell, glow: false },
}

const MARGIN = 0.06
const ITERATIONS = 9
const CELLS_PER_POINT = 7
/** Field samples per unit of the short side. */
const TONE_RES = 128
/** Highlights get this share of the main pass's points. */
const LIGHT_SHARE = 0.35

// A cast shadow (SHADOW + tone) takes dark ink only.
function darkWeight(t: number) {
  if (t >= SHADOW)
    t -= SHADOW
  return t <= 0.06 ? 0 : ((t - 0.06) / 0.94) ** 1.3
}
const lightWeight = (t: number) => t >= 0.82 ? 0 : ((0.82 - t) / 0.82) ** 1.6

interface FieldGrid { C: number, fw: number, fh: number, v: Float32Array }

/** The field sampled once, TONE_RES samples per unit (it is smooth). */
function sampleField(field: Field, Wn: number, Hn: number, u0: number, v0: number): FieldGrid {
  const C = TONE_RES
  const fw = Math.ceil(Wn * C) + 2
  const fh = Math.ceil(Hn * C) + 2
  const v = new Float32Array(fw * fh)
  for (let j = 0; j < fh; j++) {
    for (let i = 0; i < fw; i++)
      v[j * fw + i] = field(i / C - u0, j / C - v0)
  }
  return { C, fw, fh, v }
}

/**
 * Tone of every Lloyd cell of side `cell`, interpolated from the sampled
 * field, except across the edge of the subject or of its shadow, where the
 * nearest sample keeps the silhouette crisp. Paper and margin are -1.
 */
function toneGrid(fg: FieldGrid, gw: number, gh: number, cell: number, Wn: number, Hn: number) {
  const { C, fw, fh, v } = fg
  const tone = new Float32Array(gw * gh)
  for (let j = 0; j < gh; j++) {
    const y = (j + 0.5) * cell
    const inY = y > MARGIN && y < Hn - MARGIN
    const fy = y * C
    const jy = Math.min(fh - 2, Math.floor(fy))
    const ty = fy - jy
    for (let i = 0; i < gw; i++) {
      const x = (i + 0.5) * cell
      if (!inY || x <= MARGIN || x >= Wn - MARGIN) {
        tone[j * gw + i] = -1
        continue
      }
      const fx = x * C
      const ix = Math.min(fw - 2, Math.floor(fx))
      const tx = fx - ix
      const k = jy * fw + ix
      const a = v[k]
      const b = v[k + 1]
      const c = v[k + fw]
      const d = v[k + fw + 1]
      const lo = Math.min(a, b, c, d)
      const hi = Math.max(a, b, c, d)
      // interpolate within one material only: paper, surface or shadow
      if (lo >= 0 && (hi < SHADOW || lo >= SHADOW)) {
        const top = a + (b - a) * tx
        const bottom = c + (d - c) * tx
        tone[j * gw + i] = top + (bottom - top) * ty
      }
      else if (ty < 0.5) {
        tone[j * gw + i] = tx < 0.5 ? a : b
      }
      else {
        tone[j * gw + i] = tx < 0.5 ? c : d
      }
    }
  }
  return tone
}

function render(g: CanvasRenderingContext2D, W: number, H: number, hash: string) {
  const f = features(hash)
  const paper = PAPER[f.Paper]
  const S = Math.min(W, H)
  const Wn = W / S
  const Hn = H / S
  // field coordinates: the central square spans 0..1
  const u0 = (Wn - 1) / 2
  const v0 = (Hn - 1) / 2

  // Fixed stream order: subject, then each ink pass.
  const subject = SUBJECT[f.Subject]
  const field = subject.make(stream(hash, 'subject'))
  const darkR = stream(hash, 'stipple')
  const lightR = stream(hash, 'highlight')

  g.globalAlpha = 1
  g.fillStyle = paper.bg
  g.fillRect(0, 0, W, H)

  const base = COUNT[f.Rendering][f.Points]
  const fg = sampleField(field, Wn, Hn, u0, v0)

  const dotsOnly = f.Rendering === 'Dots'
  const passes: { ink: string, weight: (t: number) => number, share: number, r: () => number, main: boolean }[] = []
  // The single line is drawn in whichever ink reads best on the paper.
  const lineInLight = !dotsOnly && (!paper.ink || !!paper.lineInLight)
  if (paper.ink && !lineInLight)
    passes.push({ ink: paper.ink, weight: darkWeight, share: 1, r: darkR, main: true })
  if (paper.light && (lineInLight || dotsOnly) && !(subject.glow && paper.ink && !lineInLight)) {
    const main = !paper.ink || lineInLight
    const weight = subject.glow ? darkWeight : lightWeight
    passes.push({ ink: paper.light, weight, share: main ? 1 : LIGHT_SHARE, r: lightR, main })
  }

  // Highlights first, so the shadows print over them.
  passes.sort((a, b) => Number(a.main) - Number(b.main))
  for (const pass of passes) {
    // Grid resolution follows the point count and the share of the paper
    // that takes ink, so every point owns about CELLS_PER_POINT cells for a
    // clean centroid. Independent of the pixel size.
    let inked = 0
    for (let k = 0; k < fg.v.length; k++) {
      if (fg.v[k] >= 0 && pass.weight(fg.v[k]) > 0)
        inked++
    }
    const cover = Math.max(0.05, inked / fg.v.length)
    const R = Math.round(Math.min(250, Math.max(90, Math.sqrt((CELLS_PER_POINT * base * pass.share) / cover))))
    const cell = 1 / R
    const gw = Math.ceil(Wn * R)
    const gh = Math.ceil(Hn * R)
    const tone = toneGrid(fg, gw, gh, cell, Wn, Hn)
    // A line reads tone by how tightly it folds: it needs more contrast
    // than dots, or every piece turns into an even maze.
    const lineContrast = pass.main && !dotsOnly
    const w = new Float32Array(gw * gh)
    let sum = 0
    let sum2 = 0
    let sumSquare = 0
    let max = 0
    for (let j = 0; j < gh; j++) {
      const y = (j + 0.5) * cell - v0
      for (let i = 0; i < gw; i++) {
        const t = tone[j * gw + i]
        if (t < 0)
          continue
        let v = pass.weight(t)
        if (lineContrast)
          v *= v
        w[j * gw + i] = v
        sum += v
        sum2 += v * v
        if (v > max)
          max = v
        const x = (i + 0.5) * cell - u0
        if (x >= 0 && x <= 1 && y >= 0 && y <= 1)
          sumSquare += v
      }
    }
    if (sum <= 0)
      continue
    // A wider canvas with more ink to lay down gets more points, at the
    // same spacing as in the central square.
    const extra = sumSquare > 0 ? Math.min(2.5, sum / sumSquare) : 1
    const n = Math.round(base * pass.share * extra)
    const pts = stipple({ gw, gh, cell, w }, n, ITERATIONS, pass.r)
    // Dot size follows the spacing of the points at a reference weight: the
    // ink-weighted mean, so a few very dark spots do not shrink every dot.
    const ref = Math.min(max, 1.5 * (sum2 / sum))
    const spacing = Math.sqrt((sum * cell * cell) / (pts.n * ref)) * S
    drawPass(g, pts, spacing, ref, pass.ink, pass.main ? f.Rendering : 'Dots', paper.accent, S)
  }
  g.globalAlpha = 1
}

function drawPass(
  g: CanvasRenderingContext2D,
  pts: ReturnType<typeof stipple>,
  spacing: number,
  ref: number,
  ink: string,
  mode: Features['Rendering'],
  accent: string,
  S: number,
) {
  const { n, x, y, tone } = pts
  if (mode !== 'Dots' && n > 3) {
    const order = singleLine(x, y, n)
    g.lineJoin = 'round'
    g.lineCap = 'round'
    g.strokeStyle = mode === 'Line & dots' ? accent : ink
    g.lineWidth = Math.max(0.6, spacing * (mode === 'Line & dots' ? 0.09 : 0.16))
    g.globalAlpha = mode === 'Line & dots' ? 0.85 : 1
    // a quadratic through the midpoints keeps the line supple
    g.beginPath()
    const X = (i: number) => x[order[i]] * S
    const Y = (i: number) => y[order[i]] * S
    g.moveTo(X(0), Y(0))
    for (let i = 1; i < n - 1; i++)
      g.quadraticCurveTo(X(i), Y(i), (X(i) + X(i + 1)) / 2, (Y(i) + Y(i + 1)) / 2)
    g.lineTo(X(n - 1), Y(n - 1))
    g.stroke()
    g.globalAlpha = 1
    if (mode === 'Single line')
      return
  }
  const k = mode === 'Dots' ? 0.4 : 0.3
  g.fillStyle = ink
  g.beginPath()
  for (let i = 0; i < n; i++) {
    const rad = Math.max(0.5, spacing * k * (0.55 + 0.45 * Math.sqrt(Math.min(1, tone[i] / ref))))
    const px = x[i] * S
    const py = y[i] * S
    g.moveTo(px + rad, py)
    g.arc(px, py, rad, 0, Math.PI * 2)
  }
  g.fill()
}

export default {
  slug: 'stipple',
  title: 'Stipple',
  summary: 'Procedural subjects drawn in thousands of dots by weighted Voronoi stippling, or threaded into a single unbroken line.',
  order: 180,
  traits: TRAITS,
  features,
  render,
  // Seed-of-seeds 0x5719915e ("gallery" stream, 64-hex candidates): the
  // first hash found for each Subject x Rendering pair, twelve pairs in the
  // order found.
  gallery: [
    '0x74dc2133bd15efdfac273febc85c6adbe09f6d5ff903035e1e62608ae594887d',
    '0xa57bcc4061f8223166f2ec0cee43eac9f916844e60a6570fd5b7dbb31138f237',
    '0xfa93248c06d3d1840c69ebe620b5da788e92e185722347de2067c076bf20ebe9',
    '0x611dceef44296fc0a7b3787fdcfdbcc3a58e86bff25a13acd73217f0498bcbaa',
    '0x26bc9f04b80ea76a339e6da9ca07cb76700e17fb2ad4ef568d099c7fc6cae890',
    '0x91331edb3bd6bd620f9e5dbfd698f05c7e7ce0125a4cbc37e1e6d042ffb06733',
    '0x54aea6e99d4e1b84a45403dbf9b59cd2ec1b81e4d1b801006f21cb00480604e5',
    '0x4b10bc5ad558db0fb9dcf0861ce86b3fdee0f224837162d131731a53d4f9fa5e',
    '0x17d830ef5e28d41e632bc49fd9183c3147895e426fa58c1ae8e9aa51b534599a',
    '0xe0acc9eb3adafd92420d4c3b1a2e5c30fa0c667163923bcecd1519ad2f0bd726',
    '0x695769c71512a511a7492a03447d11dd016ce87546538c1ca57d961c266da88a',
    '0xbb5a66c72e8ee7d796ae620eb3c7409f1fd9582dfd4528baaa1fe6999fe0dd2f',
  ],
} satisfies Series
