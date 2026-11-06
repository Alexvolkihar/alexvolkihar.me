// "Tracks" — bubble-chamber photographs of events that never happened.
//
// A beam of parallel tracks (or, with the beam off, cosmic rays and stray
// gamma rays) crosses a chamber of superheated liquid in a magnetic field.
// Each particle is transported in 3D (see ../tracks/physics.ts): it curls
// in the field according to its charge and momentum, slows down by
// ionization and spirals in as it stops, scatters, knocks out delta rays,
// radiates and decays with real masses, lifetimes and two-body kinematics.
// Interactions on the protons of the liquid conserve charge, baryon number
// and strangeness (../tracks/events.ts). Neutral particles leave a gap, then
// the V of their decay; photons convert into electron-positron pairs that
// curl in opposite directions. Only bubbles are drawn: chains of tiny dots
// whose density reads as the ionization, on film with fiducial crosses,
// edge marks, a frame counter, scratches and dust.
//
// Everything is a pure function of the hash, and every length is a fraction
// of the canvas short side. The simulation covers a region wider than any
// export ratio, so a wider or taller canvas shows more of the same chamber.

import type { Bubbles } from '../tracks/physics'
import type { Series } from '../types'
import { int, pick, range, stream, weighted } from '../random'
import { EVENT_MEDIUM, makeEvent } from '../tracks/events'
import { digits, digitsWidth, dust, fiducials, grain, scratches } from '../tracks/film'
import { simulate } from '../tracks/physics'

// ---------------------------------------------------------------------------
// Rarity table — decided before the drawing code, never reordered.
// Changing a weight or an order re-rolls the whole edition.
// ---------------------------------------------------------------------------

const TRAITS = {
  Palette: [['Dark field', 28], ['Film', 24], ['Negative', 20], ['Sepia', 16], ['Blueprint', 12]],
  Event: [['Interaction', 32], ['Strange', 20], ['Showers', 16], ['Cosmic', 16], ['Pile-up', 16]],
  Field: [['Weak', 25], ['Standard', 50], ['Strong', 25]],
  Film: [['Clean', 40], ['Scratched', 40], ['Worn', 20]],
} as const satisfies Record<string, ReadonlyArray<readonly [string, number]>>

type TraitName = keyof typeof TRAITS
type Features = { [K in TraitName]: typeof TRAITS[K][number][0] }

/** Pure function of the hash, computed before (and without) any rendering. */
function features(hash: string): Features {
  const r = stream(hash, 'features')
  return {
    Palette: weighted(r, TRAITS.Palette),
    Event: weighted(r, TRAITS.Event),
    Field: weighted(r, TRAITS.Field),
    Film: weighted(r, TRAITS.Film),
  }
}

interface Palette {
  /** Film base at the edges, and under the light in the middle. */
  bg: string
  center: string
  /** Bubbles. */
  ink: string
  /** Fiducial crosses and the data box. */
  fid: string
  /** Film rebate around the frame, and the marks printed on it. */
  rebate: string
  mark: string
  scratch: string
  dust: string
  leak: string
  grain: string
  dark: boolean
}

const PAL: Record<Features['Palette'], Palette> = {
  'Dark field': { bg: '#060607', center: '#1b1b1d', ink: '#f3f0e7', fid: '#c9c5bb', rebate: '#000000', mark: '#8d897f', scratch: '#ece8dd', dust: '#f6f3ea', leak: '#ff8a3d', grain: '#ffffff', dark: true },
  'Film': { bg: '#15160f', center: '#2e2d20', ink: '#f1e3b8', fid: '#d8c27e', rebate: '#0a0906', mark: '#a08a52', scratch: '#f5e9c4', dust: '#050403', leak: '#ff6a2a', grain: '#fff2c8', dark: true },
  'Negative': { bg: '#dcdbd5', center: '#f6f5f1', ink: '#111111', fid: '#262626', rebate: '#121212', mark: '#c8c4ba', scratch: '#1a1a1a', dust: '#141414', leak: '#8a4b1c', grain: '#000000', dark: false },
  'Sepia': { bg: '#d7c19a', center: '#f1e4c9', ink: '#3a2312', fid: '#4b2f1b', rebate: '#24170c', mark: '#cfac76', scratch: '#3a2312', dust: '#2a1a0e', leak: '#b0501c', grain: '#2a1a0e', dark: false },
  'Blueprint': { bg: '#081a2d', center: '#17395c', ink: '#e6f1fb', fid: '#93bde3', rebate: '#030b14', mark: '#5f86ad', scratch: '#d8e9f8', dust: '#e6f1fb', leak: '#7fd0ff', grain: '#cfe6ff', dark: true },
}

/** Field strength in tesla. */
const FIELD: Record<Features['Field'], number> = { Weak: 1.0, Standard: 2.0, Strong: 3.5 }

/** Metres of chamber per unit (canvas short side). */
const SCALE = 0.8
/** Bubble radius at size factor 1, in units. */
const R0 = 0.00095
/** Film rebate width, units. */
const REBATE = 0.03

// The simulation does not depend on the canvas size: keep the last few.
const cache = new Map<string, Bubbles>()
function chamber(hash: string, f: Features): Bubbles {
  const hit = cache.get(hash)
  if (hit)
    return hit
  const k = 0.3 * FIELD[f.Field] * SCALE
  const seeds = makeEvent(f.Event, stream(hash, 'event'), k)
  const b = simulate(
    seeds,
    { k, L: SCALE, medium: EVENT_MEDIUM[f.Event], rate: 250, depth: 0.45, box: 1.25 },
    stream(hash, 'physics'),
    stream(hash, 'bubbles'),
  )
  cache.set(hash, b)
  if (cache.size > 6)
    cache.delete(cache.keys().next().value as string)
  return b
}

function render(g: CanvasRenderingContext2D, W: number, H: number, hash: string) {
  const f = features(hash)
  const pal = PAL[f.Palette]
  const S = Math.min(W, H)
  const ox = (W - S) / 2
  const oy = (H - S) / 2
  const bub = chamber(hash, f)
  const fr = stream(hash, 'film')
  const gr = stream(hash, 'grain')
  const bw = REBATE * S

  // film-stream draws, in a fixed order
  const roll = int(fr, 100, 999)
  const frame = int(fr, 0, 99999)
  const view = int(fr, 1, 3)
  const leakSide = pick(fr, [-1, 1] as const)
  const leakWidth = range(fr, 0.15, 0.35)
  const counts = {
    Clean: [int(fr, 0, 2), int(fr, 2, 6), 0],
    Scratched: [int(fr, 6, 12), int(fr, 10, 24), int(fr, 0, 2)],
    Worn: [int(fr, 14, 24), int(fr, 30, 60), int(fr, 2, 5)],
  }[f.Film]

  // --- film base under the light ----------------------------------------------
  g.globalAlpha = 1
  g.globalCompositeOperation = 'source-over'
  g.fillStyle = pal.bg
  g.fillRect(0, 0, W, H)
  const light = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, 0.55 * Math.hypot(W, H))
  light.addColorStop(0, pal.center)
  light.addColorStop(0.55, pal.center)
  light.addColorStop(1, pal.bg)
  g.fillStyle = light
  g.fillRect(0, 0, W, H)

  g.save()
  g.beginPath()
  g.rect(bw, bw, W - 2 * bw, H - 2 * bw)
  g.clip()

  grain(g, W, H, S, gr, pal.grain, 1400)

  // --- bubbles, bucketed by size so each bucket is one path ----------------------
  const NB = 10
  const LO = 0.6
  const STEPB = 0.16
  const n = bub.n
  const bucket = new Uint8Array(n)
  const start = new Int32Array(NB + 1)
  for (let i = 0; i < n; i++) {
    const b = Math.min(NB - 1, Math.max(0, Math.floor((bub.s[i] - LO) / STEPB)))
    bucket[i] = b
    start[b + 1]++
  }
  for (let b = 0; b < NB; b++)
    start[b + 1] += start[b]
  const order = new Int32Array(n)
  const fill = start.slice(0, NB)
  for (let i = 0; i < n; i++)
    order[fill[bucket[i]]++] = i
  g.fillStyle = pal.ink
  g.globalAlpha = 0.95
  for (let b = 0; b < NB; b++) {
    const rad = Math.max(0.5, (LO + (b + 0.5) * STEPB) * R0 * S)
    const small = rad < 1.25
    g.beginPath()
    for (let j = start[b]; j < start[b + 1]; j++) {
      const i = order[j]
      const X = ox + bub.x[i] * S
      const Y = oy + bub.y[i] * S
      if (X < bw - rad || X > W - bw + rad || Y < bw - rad || Y > H - bw + rad)
        continue
      if (small) {
        g.rect(X - rad, Y - rad, rad * 2, rad * 2)
      }
      else {
        g.moveTo(X + rad, Y)
        g.arc(X, Y, rad, 0, Math.PI * 2)
      }
    }
    g.fill()
  }
  g.globalAlpha = 1

  // --- engraved on the chamber window ----------------------------------------------
  g.strokeStyle = pal.fid
  g.globalAlpha = 0.85
  fiducials(g, W, H, S, bw)
  g.globalAlpha = 1

  // --- damage on the film ----------------------------------------------------------
  scratches(g, counts[0], ox, oy, S, fr, pal.scratch)
  dust(g, counts[1], counts[2], ox, oy, S, fr, pal.dust)
  if (f.Film === 'Worn') {
    const x0 = leakSide < 0 ? 0 : W
    const x1 = x0 - leakSide * leakWidth * S
    const lk = g.createLinearGradient(x0, 0, x1, 0)
    lk.addColorStop(0, pal.leak)
    lk.addColorStop(1, `${pal.leak}00`)
    g.globalCompositeOperation = pal.dark ? 'screen' : 'multiply'
    g.globalAlpha = 0.22
    g.fillStyle = lk
    g.fillRect(0, 0, W, H)
    g.globalAlpha = 1
    g.globalCompositeOperation = 'source-over'
  }

  // --- camera data box, bottom left of the frame -------------------------------------
  const dh = 0.017 * S
  const label = `${String(roll)} ${String(frame).padStart(5, '0')} ${view}`
  const bx = bw + 0.022 * S
  const by = H - bw - 0.022 * S - dh * 1.9
  const boxW = digitsWidth(label.length, dh) + dh * 0.9
  g.fillStyle = pal.bg
  g.globalAlpha = 0.7
  g.fillRect(bx, by, boxW, dh * 1.9)
  g.globalAlpha = 0.9
  g.strokeStyle = pal.fid
  g.lineWidth = Math.max(0.6, 0.0012 * S)
  g.strokeRect(bx, by, boxW, dh * 1.9)
  digits(g, label, bx + dh * 0.5, by + dh * 0.45, dh)
  g.globalAlpha = 1
  g.restore()

  // --- film rebate with edge marks and the frame number ---------------------------------
  g.fillStyle = pal.rebate
  g.fillRect(0, 0, W, bw)
  g.fillRect(0, H - bw, W, bw)
  g.fillRect(0, 0, bw, H)
  g.fillRect(W - bw, 0, bw, H)
  g.fillStyle = pal.mark
  g.strokeStyle = pal.mark
  const eh = bw * 0.38
  const numH = bw * 0.42
  const numText = String(frame % 1000).padStart(3, '0')
  const numEnd = bw + 0.04 * S + digitsWidth(numText.length, numH)
  const pitch = 0.06 * S
  for (let i = -Math.ceil(W / pitch); i <= Math.ceil(W / pitch); i++) {
    const x = W / 2 + i * pitch
    if (x < bw || x > W - bw - 0.02 * S)
      continue
    g.fillRect(x, H - bw / 2 - eh / 2, 0.022 * S, eh)
    if (x > numEnd + 0.02 * S)
      g.fillRect(x, bw / 2 - eh / 2, 0.022 * S, eh)
  }
  g.lineWidth = Math.max(0.6, 0.0012 * S)
  g.beginPath()
  for (let i = -Math.ceil(H / (0.1 * S)); i <= Math.ceil(H / (0.1 * S)); i++) {
    const y = H / 2 + i * 0.1 * S
    if (y < bw || y > H - bw)
      continue
    g.moveTo(bw * 0.35, y)
    g.lineTo(bw, y)
    g.moveTo(W - bw, y)
    g.lineTo(W - bw * 0.35, y)
  }
  g.stroke()
  digits(g, numText, bw + 0.04 * S, bw / 2 - numH / 2, numH)
}

export default {
  slug: 'tracks',
  title: 'Tracks',
  summary: 'Bubble-chamber photographs of events that never happened: beams, stars, kinks, V decays and electron spirals, simulated particle by particle and printed as chains of tiny bubbles.',
  order: 630,
  traits: TRAITS,
  features,
  render,
  // Seed-of-seeds 0x7ac4b2e5 ("gallery" stream): the first hash found for each
  // palette x event pair, the white-on-black pile-up moved first as the cover.
  gallery: [
    '0xa65f18bd1b2e96ad960f3df0da0f2861e5b0587cd3b4768dad94d0c565ee0e8e',
    '0x43ed3a70ab94b7dbb4245f5dceeb7a70f10c6c80b6a30572c062f18c047a1022',
    '0xb03279114cb8865534d1515380fc046481acd7fe96c05a80cacbf0d55ba909c0',
    '0x687f2773fdb9343bbb9fbd747cde4bf1b64859a486ed269cb7f71badd2086dd8',
    '0x1f574bf3d8a9d055ea9004c7ce582792e42ef40fc5fd4fecc6d68f49b303ba36',
    '0x05536d96058b958af69ebe2c6f2712f5e6f2b146fb2b69644bc67704ada44880',
    '0x9f596f1e54b3cc382d90cb2fdcc8c4777fd1203698bd6d0e25aa10b3b6eabfae',
    '0x23239c97a0a82f7af84d9034812a8ece07c1f812ebec5fa991a038203e8df3e3',
    '0x47ab5e9e00f6bb7326db50be00b1a713bdb61d906390643d5f5d78a99ca77843',
    '0x167cb77115080b7f91b49f91069e77e9db6f89c09f5101170b989d8c4ccfe796',
    '0xede17995a1a74e93fde7aeaf02ea29ba1cdec02ea5639baf5b456b8a24b4d85b',
    '0xac71478f19f7a6481766f7045fde3dfcd5905474fcba50da69d9a5771ac1f74b',
  ],
} satisfies Series
