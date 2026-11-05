// "Courants" — streamlines traced through a hash-seeded value-noise field.
//
// Ported as-is from the original standalone sketch (self-hosted contract of
// the genart skill). The order of every random draw is kept identical, so a
// hash renders exactly the same piece here and in the sketch.

import type { Rng } from '../random'
import type { Series } from '../types'
import { stream, weighted } from '../random'

// Rarity table, decided before the code. Never reorder: it re-rolls the edition.
const PALETTES = [['Encre', 40], ['Seine', 30], ['Brique', 20], ['Nuit dorée', 10]] as const
const FIELDS = [['Laminaire', 35], ['Houle', 45], ['Tourbillon', 20]] as const
const DENSITY = [['Clairsemé', 25], ['Équilibré', 55], ['Serré', 20]] as const

type Palette = typeof PALETTES[number][0]
type Field = typeof FIELDS[number][0]
type Density = typeof DENSITY[number][0]

const PAL: Record<Palette, { bg: string, ink: readonly [string, string, string, string] }> = {
  'Encre': { bg: '#efe9dc', ink: ['#1d1c1a', '#3a3833', '#6b665c', '#b23a2a'] },
  'Seine': { bg: '#e8ece9', ink: ['#1f3a4a', '#3f6b7a', '#8fb3b5', '#d9a441'] },
  'Brique': { bg: '#f2e6d8', ink: ['#7a2e1f', '#b5532f', '#d98b5b', '#2b2a28'] },
  'Nuit dorée': { bg: '#15161a', ink: ['#e9c46a', '#c9a24a', '#f4e7c5', '#5c6b8a'] },
}

// Noise scale (normalised canvas units) and twist.
const FIELD: Record<Field, { scale: number, twist: number }> = {
  Laminaire: { scale: 1.1, twist: 0.6 },
  Houle: { scale: 2.2, twist: 1.4 },
  Tourbillon: { scale: 3.6, twist: 3.2 },
}

const LINES: Record<Density, number> = { 'Clairsemé': 380, 'Équilibré': 900, 'Serré': 1900 }

function features(hash: string) {
  const r = stream(hash, 'features')
  return {
    Palette: weighted(r, PALETTES),
    Champ: weighted(r, FIELDS),
    Densité: weighted(r, DENSITY),
  }
}

// Value noise on an integer-hashed lattice (no sin() in the randomness).
function makeNoise(r: Rng) {
  const P = 256
  const perm = new Uint8Array(P * 2)
  const val = new Float32Array(P)
  const idx = Array.from({ length: P }, (_, i) => i)
  for (let i = P - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]]
  }
  for (let i = 0; i < P * 2; i++)
    perm[i] = idx[i & 255]
  for (let i = 0; i < P; i++)
    val[i] = r()
  const fade = (t: number) => t * t * (3 - 2 * t)
  const v = (a: number, b: number) => val[perm[perm[a] + b]]
  return (x: number, y: number) => {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const X = xi & 255
    const Y = yi & 255
    const u = fade(x - xi)
    const w = fade(y - yi)
    const a = v(X, Y) + u * (v(X + 1, Y) - v(X, Y))
    const b = v(X, Y + 1) + u * (v(X + 1, Y + 1) - v(X, Y + 1))
    return a + w * (b - a)
  }
}

function render(g: CanvasRenderingContext2D, W: number, H: number, hash: string) {
  const f = features(hash)
  const pal = PAL[f.Palette]
  const fld = FIELD[f.Champ]
  const S = Math.min(W, H)

  g.globalAlpha = 1
  g.fillStyle = pal.bg
  g.fillRect(0, 0, W, H)

  const nr = stream(hash, 'noise')
  const lr = stream(hash, 'lines')
  const cr = stream(hash, 'color')
  const n1 = makeNoise(nr)
  const n2 = makeNoise(nr)
  const angleOffset = nr() * Math.PI * 2
  const field = (x: number, y: number) => {
    const a = n1(x * fld.scale + 11.3, y * fld.scale + 7.1)
    const b = n2(x * fld.scale * 2.3, y * fld.scale * 2.3) * 0.35
    return angleOffset + (a + b) * Math.PI * 2 * fld.twist
  }

  const margin = 0.08
  const step = 0.0022
  const count = LINES[f.Densité]
  g.lineCap = 'round'
  g.lineJoin = 'round'

  for (let i = 0; i < count; i++) {
    let x = margin + lr() * (1 - 2 * margin)
    let y = margin + lr() * (1 - 2 * margin)
    const len = 40 + Math.floor((lr() ** 2) * 260)
    const accent = cr() < 0.04
    let ink: string
    if (accent)
      ink = pal.ink[3]
    else
      ink = pal.ink[Math.floor(cr() * 3)]
    const weight = (0.0006 + (cr() ** 3) * 0.0034) * (accent ? 1.6 : 1)
    g.strokeStyle = ink
    g.globalAlpha = accent ? 0.95 : 0.35 + cr() * 0.55
    g.lineWidth = weight * S
    g.beginPath()
    g.moveTo(x * W, y * H)
    for (let k = 0; k < len; k++) {
      const a = field(x, y)
      x += Math.cos(a) * step
      y += Math.sin(a) * step
      if (x < margin || x > 1 - margin || y < margin || y > 1 - margin)
        break
      g.lineTo(x * W, y * H)
    }
    g.stroke()
  }
  g.globalAlpha = 1
}

export default {
  slug: 'courants',
  title: 'Courants',
  summary: 'Streamlines traced through a seeded noise field: laminar drifts, swells and eddies in ink, river, brick or gold.',
  order: 10,
  traits: { Palette: PALETTES, Champ: FIELDS, Densité: DENSITY },
  features,
  render,
  // Seed-of-seeds 0xc0c0c0c0 ("gallery" stream): the first hash found for each
  // palette × field pair, so the selection covers the whole table.
  gallery: [
    '0x9d958623d25beed6275af7e2c3b7ae41c2b77f7464c8e72e8710eed0da6a5f2a',
    '0x2245a2fbfd86c616ceab7e3c846665c269f9439d20fe7b1da13497150d5443e9',
    '0x08758db98187a003cc0115e6bbbbbf698f8396025933229f69055b47085be572',
    '0x049def1dfaf297e901a5cd708c54e14c1e55bc946a8beb5954734460d30c1b4b',
    '0xd94c3d6d700f90c2d7b1354fc8f6ec1c671aeaf7e8a07fde21837fddb5b0793a',
    '0x43ad250f645c30cb74e3eaa7484ef6e574eaf02d209a3275e758b9ae004e0bfd',
    '0x61a9bf251df7befb9b1b5c595881953e04a8c459b2decbdb4055a2df284fd903',
    '0x15f046621f00729d78aeec83fee71ce074e7da8d299464f53385650a24f4b2ee',
    '0x6fb042f9e983060d44109a541e8209509ecad64c9ab933b654cc4f3271410c63',
    '0x0c898193c8fc7281936df84d672c5e25eb409f7df5a713dfea4f985208fdbe64',
    '0xf676ab18ec1a70676d5be29e8079cdcd035505a9f7d0ae9a7838d3cdd447da76',
    '0x1c447568ee33b3ee1fa2adfedc013cadf518502524a95e23671f9bec95f315c5',
  ],
} satisfies Series
