// "Orbits" — concentric orbital systems built from a small grammar of rings.
//
// Around a centre, rings are stacked from the inside out at hash-chosen radii
// and phases: grooves of hairlines, dashed rings, dial scales of ticks, broken
// arcs, dotted Archimedean spirals, gear-tooth rims, strings of beads and solid
// bands (see ../orbits/rings.ts). Small satellites sit on some rings, cut into
// them by a halo. Keplerian orbits cross the stack with the centre at a focus,
// their bodies spaced at equal steps of time (see ../orbits/kepler.ts).
//
// The layout is one system, a binary pair whose rings interpenetrate, a
// primary carrying moon systems on its rings, a vast system centred near a
// corner, or an eccentric stack whose ring centres drift with the radius.
//
// Everything is a pure function of the hash, and every length is a fraction
// of the canvas short side. Past its nominal radius a stack keeps going in a
// lighter, fading register until the farthest corner, so a wider or taller
// canvas shows more of the same system rather than empty margins.

import type { DrawEnv, KindWeights, Ring, Satellite } from '../orbits/rings'
import type { Rng } from '../random'
import type { Series } from '../types'
import { orbitPoint, traceOrbit } from '../orbits/kepler'
import { buildStack, drawRing, drawSatellite } from '../orbits/rings'
import { int, range, stream, weighted } from '../random'

// ---------------------------------------------------------------------------
// Rarity table — decided before the drawing code, never reordered.
// Changing a weight or an order re-rolls the whole edition.
// ---------------------------------------------------------------------------

const TRAITS = {
  Palette: [['Observatory', 20], ['Almanac', 20], ['Lapis', 16], ['Eclipse', 14], ['Patina', 15], ['Sorbet', 15]],
  Layout: [['Solo', 30], ['Binary', 20], ['Planetary', 20], ['Corner', 16], ['Eccentric', 14]],
  Grammar: [['Instrument', 26], ['Celestial', 30], ['Mechanical', 20], ['Mixed', 24]],
  Density: [['Sparse', 25], ['Balanced', 50], ['Dense', 25]],
  Phase: [['Aligned', 30], ['Swirl', 25], ['Free', 45]],
} as const satisfies Record<string, ReadonlyArray<readonly [string, number]>>

type TraitName = keyof typeof TRAITS
type Features = { [K in TraitName]: typeof TRAITS[K][number][0] }

/** Pure function of the hash, computed before (and without) any rendering. */
function features(hash: string): Features {
  const r = stream(hash, 'features')
  return {
    Palette: weighted(r, TRAITS.Palette),
    Layout: weighted(r, TRAITS.Layout),
    Grammar: weighted(r, TRAITS.Grammar),
    Density: weighted(r, TRAITS.Density),
    Phase: weighted(r, TRAITS.Phase),
  }
}

// ---------------------------------------------------------------------------
// Palettes: original sets after brass instruments at night, almanac ink and
// vermilion, lapis on white, a total eclipse, verdigris, and riso pinks.
// ---------------------------------------------------------------------------

interface Palette {
  bg: string
  /** Darker or lighter tone towards the corners. */
  edge: string
  dark: boolean
  inks: readonly [string, string, string]
  accent: string
}

const PALETTES: Record<Features['Palette'], Palette> = {
  Observatory: { bg: '#13120f', edge: '#070605', dark: true, inks: ['#d9b56b', '#f0e5c6', '#8a7246'], accent: '#d0532f' },
  Almanac: { bg: '#efe8d9', edge: '#d9cfba', dark: false, inks: ['#1c1b19', '#4f4a42', '#9b917e'], accent: '#d2452b' },
  Lapis: { bg: '#f4f2ec', edge: '#dcdcd6', dark: false, inks: ['#1f3c9e', '#14183a', '#8a9bd2'], accent: '#e9a823' },
  Eclipse: { bg: '#0b0b0d', edge: '#000000', dark: true, inks: ['#ecebe5', '#9c9b96', '#4c4c50'], accent: '#e3402b' },
  Patina: { bg: '#0f2523', edge: '#061311', dark: true, inks: ['#82c9b1', '#e1eee4', '#3e877a'], accent: '#de8c4c' },
  Sorbet: { bg: '#f7e4de', edge: '#ecc9c1', dark: false, inks: ['#25386c', '#2c9a93', '#e5789a'], accent: '#ff4a62' },
}

// ---------------------------------------------------------------------------
// Grammars: which ring kinds a stack is made of, and how often it carries
// satellites and Keplerian orbits.
// ---------------------------------------------------------------------------

interface Grammar {
  kinds: KindWeights
  satellites: number
  orbits: readonly [number, number]
  axes: number
}

const GRAMMARS: Record<Features['Grammar'], Grammar> = {
  Instrument: {
    kinds: [['hairlines', 20], ['dashed', 18], ['ticked', 32], ['broken', 8], ['spiral', 3], ['gear', 9], ['beads', 8], ['band', 2]],
    satellites: 0.05,
    orbits: [0, 1],
    axes: 0.75,
  },
  Celestial: {
    kinds: [['hairlines', 18], ['dashed', 16], ['ticked', 5], ['broken', 24], ['spiral', 17], ['gear', 2], ['beads', 14], ['band', 4]],
    satellites: 0.24,
    orbits: [1, 3],
    axes: 0.15,
  },
  Mechanical: {
    kinds: [['hairlines', 11], ['dashed', 10], ['ticked', 15], ['broken', 20], ['spiral', 3], ['gear', 28], ['beads', 4], ['band', 14]],
    satellites: 0.06,
    orbits: [0, 1],
    axes: 0.35,
  },
  Mixed: {
    kinds: [['hairlines', 15], ['dashed', 15], ['ticked', 14], ['broken', 16], ['spiral', 11], ['gear', 11], ['beads', 11], ['band', 7]],
    satellites: 0.12,
    orbits: [0, 2],
    axes: 0.35,
  },
}

const GAP: Record<Features['Density'], number> = { Sparse: 1.9, Balanced: 1, Dense: 0.55 }

const TAU = Math.PI * 2

interface System {
  centre: (r: number) => readonly [number, number]
  R: number
  reach: number
  /** Stream label of its rings. */
  label: string
}

function farthestCorner(x: number, y: number, W: number, H: number) {
  return Math.max(Math.hypot(x, y), Math.hypot(W - x, y), Math.hypot(x, H - y), Math.hypot(W - x, H - y))
}

function render(g: CanvasRenderingContext2D, W: number, H: number, hash: string) {
  const f = features(hash)
  const pal = PALETTES[f.Palette]
  const gram = GRAMMARS[f.Grammar]
  const S = Math.min(W, H)
  const hair = 0.0011 * S
  const env: DrawEnv = { hair, bg: pal.bg }

  g.save()
  g.globalAlpha = 1
  g.globalCompositeOperation = 'source-over'
  g.fillStyle = pal.bg
  g.fillRect(0, 0, W, H)

  // ---- layout: where the systems sit, how large they are -----------------
  const lr = stream(hash, 'layout')
  const phaseBase = lr() * TAU
  const swirl = (lr() < 0.5 ? -1 : 1) * range(lr, 0.18, 0.5)
  const phaseFn = (d: number, r: number, R: number) => {
    if (f.Phase === 'Aligned')
      return phaseBase + (d - 0.5) * 0.14
    if (f.Phase === 'Swirl')
      return phaseBase + swirl * TAU * (r / R) + (d - 0.5) * 0.12
    return d * TAU
  }
  const jx = range(lr, -1, 1)
  const jy = range(lr, -1, 1)
  const size = lr()
  const size2 = lr()
  const angle = lr()
  const spread = lr()
  const cornerPick = lr()

  const systems: System[] = []
  const mid = [W / 2, H / 2] as const
  switch (f.Layout) {
    case 'Solo':
    case 'Planetary': {
      const R = S * (f.Layout === 'Solo' ? 0.3 + size * 0.16 : 0.34 + size * 0.08)
      const c = [mid[0] + jx * 0.05 * S, mid[1] + jy * 0.05 * S] as const
      systems.push({ centre: () => c, R, reach: farthestCorner(c[0], c[1], W, H), label: 'rings-0' })
      break
    }
    case 'Corner': {
      const corner = Math.floor(cornerPick * 4)
      const sx = corner & 1 ? -1 : 1
      const sy = corner & 2 ? -1 : 1
      const c = [
        (sx > 0 ? 0 : W) + sx * (0.06 + (jx + 1) * 0.12) * S,
        (sy > 0 ? 0 : H) + sy * (0.06 + (jy + 1) * 0.12) * S,
      ] as const
      const R = S * (0.9 + size * 0.3)
      systems.push({ centre: () => c, R, reach: farthestCorner(c[0], c[1], W, H), label: 'rings-0' })
      break
    }
    case 'Binary': {
      const RA = S * (0.29 + size * 0.1)
      const RB = S * (0.17 + size2 * 0.1)
      const aspect = W / H
      let a: number
      if (aspect > 1.15)
        a = (angle - 0.5) * 0.5
      else if (aspect < 0.87)
        a = Math.PI / 2 + (angle - 0.5) * 0.5
      else
        a = Math.PI / 4 + Math.floor(angle * 4) * (Math.PI / 2) + (spread - 0.5) * 0.4
      const d = (RA + RB) * (0.58 + spread * 0.26)
      const ux = Math.cos(a)
      const uy = Math.sin(a)
      const ca = [mid[0] - ux * d * 0.42, mid[1] - uy * d * 0.42] as const
      const cb = [mid[0] + ux * d * 0.58, mid[1] + uy * d * 0.58] as const
      systems.push({ centre: () => ca, R: RA, reach: farthestCorner(ca[0], ca[1], W, H), label: 'rings-0' })
      systems.push({ centre: () => cb, R: RB, reach: RB, label: 'rings-1' })
      break
    }
    case 'Eccentric': {
      const R = S * (0.4 + size * 0.08)
      const k = 0.3 + spread * 0.3
      const a = angle * TAU
      const ux = Math.cos(a) * k
      const uy = Math.sin(a) * k
      // the middle ring is centred on the canvas, inner and outer ones drift apart
      const centre = (r: number) => [mid[0] + ux * (r - R / 2), mid[1] + uy * (r - R / 2)] as const
      const far = centre(R)
      systems.push({ centre, R, reach: farthestCorner(far[0], far[1], W, H) + k * S, label: 'rings-0' })
      break
    }
  }

  // ---- ground: a soft vignette and a dust of stars or paper specks ---------
  const gx = systems[0].centre(0)
  const vg = g.createRadialGradient(gx[0], gx[1], S * 0.2, gx[0], gx[1], farthestCorner(gx[0], gx[1], W, H))
  vg.addColorStop(0, pal.bg)
  vg.addColorStop(1, pal.edge)
  g.fillStyle = vg
  g.fillRect(0, 0, W, H)

  const gr = stream(hash, 'ground')
  const dust = Math.round((pal.dark ? 300 : 120) * (W * H) / (S * S))
  g.fillStyle = pal.dark ? pal.inks[1] : pal.inks[2]
  for (let i = 0; i < dust; i++) {
    const x = gr() * W
    const y = gr() * H
    const big = gr()
    const a = gr()
    g.globalAlpha = pal.dark ? 0.15 + a * 0.6 : 0.08 + a * 0.18
    g.beginPath()
    g.arc(x, y, S * (0.0005 + big ** 4 * 0.0022), 0, TAU)
    g.fill()
  }

  // ---- axes: a graticule through the main centre on instrument-like pieces
  const ar = stream(hash, 'axes')
  if (ar() < gram.axes) {
    const [cx, cy] = systems[0].centre(0)
    const tilt = f.Phase === 'Free' ? 0 : phaseBase
    const L = farthestCorner(cx, cy, W, H)
    const tickStep = S * (0.02 + ar() * 0.03)
    g.globalAlpha = pal.dark ? 0.45 : 0.5
    g.strokeStyle = pal.inks[2]
    g.lineWidth = hair
    g.beginPath()
    for (let q = 0; q < 2; q++) {
      const a = tilt + q * Math.PI / 2
      const ux = Math.cos(a)
      const uy = Math.sin(a)
      g.moveTo(cx - ux * L, cy - uy * L)
      g.lineTo(cx + ux * L, cy + uy * L)
      for (let t = tickStep; t < L; t += tickStep) {
        const len = S * 0.006
        for (const sgn of [-1, 1]) {
          const px = cx + ux * t * sgn
          const py = cy + uy * t * sgn
          g.moveTo(px - uy * len, py + ux * len)
          g.lineTo(px + uy * len, py - ux * len)
        }
      }
    }
    g.stroke()
  }

  // ---- systems -------------------------------------------------------------
  const stackOf = (sys: System, label: string) => {
    const u = Math.min(Math.max(sys.R, 0.22 * S), 0.45 * S)
    return buildStack(stream(hash, label), {
      centre: sys.centre,
      R: sys.R,
      reach: sys.reach,
      u,
      hair,
      kinds: gram.kinds,
      gapScale: GAP[f.Density],
      satelliteChance: gram.satellites,
      phase: (d, r) => phaseFn(d, r, sys.R),
      inks: pal.inks,
      accent: pal.accent,
      bg: pal.bg,
      fade: 0.8 * S,
      floor: 0.14,
    })
  }

  const drawStack = (sys: System, rings: Ring[], hub: number, hubRng: Rng) => {
    for (const ring of rings) {
      const [cx, cy] = sys.centre(ring.r + ring.h / 2)
      drawRing(g, cx, cy, ring, env)
    }
    // hub: a body at the centre, with a fine ring around it
    const [cx, cy] = sys.centre(0)
    const style = hubRng()
    g.globalAlpha = 1
    g.fillStyle = style < 0.45 ? pal.accent : pal.inks[0]
    g.strokeStyle = pal.inks[0]
    g.beginPath()
    g.arc(cx, cy, hub * (style < 0.75 ? 0.6 : 0.25), 0, TAU)
    g.fill()
    g.lineWidth = hair * 1.4
    g.beginPath()
    g.arc(cx, cy, hub, 0, TAU)
    g.stroke()
  }

  const knock = (x: number, y: number, r: number) => {
    g.globalAlpha = 1
    g.fillStyle = pal.bg
    g.beginPath()
    g.arc(x, y, r, 0, TAU)
    g.fill()
  }

  const hubRng = stream(hash, 'hub')
  const pending: Satellite[] = []
  const main = systems[0]
  const mainStack = stackOf(main, main.label)
  drawStack(main, mainStack.rings, mainStack.hub, hubRng)
  pending.push(...mainStack.satellites)

  // ---- cutaway: aligned pieces may lose a wedge, like a sectioned drawing ---
  const cr = stream(hash, 'cut')
  const cutRoll = cr()
  const cutWidth = range(cr, 0.3, 1.1)
  if (f.Phase === 'Aligned' && f.Layout !== 'Eccentric' && cutRoll < 0.6) {
    const [cx, cy] = main.centre(0)
    const inner = mainStack.hub * 1.6
    const outer = Math.min(main.R, main.reach)
    const a0 = phaseBase - cutWidth
    const a1 = phaseBase
    g.globalAlpha = 1
    g.fillStyle = vg
    g.beginPath()
    g.arc(cx, cy, outer, a0, a1)
    g.arc(cx, cy, inner, a1, a0, true)
    g.closePath()
    g.fill()
    g.strokeStyle = pal.inks[2]
    g.lineWidth = hair * 1.2
    g.beginPath()
    for (const a of [a0, a1]) {
      g.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner)
      g.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer)
    }
    g.stroke()
    // the section line: a dashed arc closing the wedge at the nominal radius
    g.setLineDash([hair * 6, hair * 4])
    g.beginPath()
    g.arc(cx, cy, outer, a0, a1)
    g.stroke()
    g.setLineDash([])
  }

  // ---- Keplerian orbits around the main centre ------------------------------
  const or = stream(hash, 'orbits')
  let orbitCount = int(or, gram.orbits[0], gram.orbits[1])
  if (f.Layout === 'Eccentric' || f.Layout === 'Corner')
    orbitCount += 1
  for (let i = 0; i < orbitCount; i++) {
    const [fx, fy] = main.centre(0)
    const a = main.R * range(or, 0.5, 1.05)
    const e = range(or, 0.3, 0.82)
    const omega = f.Phase === 'Free' ? or() * TAU : phaseBase + Math.PI / 2 + (or() - 0.5) * 1.2
    const n = int(or, 14, 40)
    const bodyAt = or() * TAU
    const apse = or() < 0.5
    const dotSize = or()
    const o = { fx, fy, a, e, omega }
    g.globalAlpha = 0.9
    g.strokeStyle = pal.inks[1]
    g.lineWidth = hair * 1.3
    g.beginPath()
    traceOrbit(g, o)
    if (apse) {
      const [px, py] = orbitPoint(o, 0)
      const [qx, qy] = orbitPoint(o, Math.PI)
      g.moveTo(px, py)
      g.lineTo(qx, qy)
    }
    g.stroke()
    // equal steps of time: bunched far from the focus, spread out close to it
    g.globalAlpha = 0.95
    g.fillStyle = pal.inks[0]
    g.beginPath()
    const dot = S * (0.0025 + dotSize * 0.003)
    for (let k = 0; k < n; k++) {
      const [x, y] = orbitPoint(o, (k / n) * TAU)
      g.moveTo(x + dot, y)
      g.arc(x, y, dot, 0, TAU)
    }
    g.fill()
    const [bx, by] = orbitPoint(o, bodyAt)
    pending.push({ x: bx, y: by, s: S * (0.008 + or() * 0.01), ink: { color: pal.accent, alpha: 1 }, halo: pal.bg, moonAngle: or() * TAU })
  }

  for (const sat of pending)
    drawSatellite(g, sat, env)
  pending.length = 0

  // ---- secondary systems: the binary companion, or moons on the primary ----
  if (f.Layout === 'Binary') {
    const b = systems[1]
    const st = stackOf(b, b.label)
    const [cx, cy] = b.centre(0)
    knock(cx, cy, b.R * 0.5)
    drawStack(b, st.rings, st.hub, hubRng)
    for (const sat of st.satellites)
      drawSatellite(g, sat, env)
  }
  else if (f.Layout === 'Planetary') {
    const mr = stream(hash, 'moons')
    const want = int(mr, 2, 5)
    const [cx, cy] = main.centre(0)
    const carriers = mainStack.rings.filter(x => x.r > main.R * 0.45 && x.r < main.R * 1.05)
    const moons: { x: number, y: number, R: number }[] = []
    for (let i = 0; i < 40 && moons.length < want; i++) {
      const R = S * range(mr, 0.06, 0.13)
      const pickRoll = mr()
      const a = mr() * TAU
      if (!carriers.length)
        continue
      const ring = carriers[Math.floor(pickRoll * carriers.length)]
      const m = ring.r + ring.h / 2
      const x = cx + Math.cos(a) * m
      const y = cy + Math.sin(a) * m
      if (moons.every(o => Math.hypot(o.x - x, o.y - y) > (o.R + R) * 1.2))
        moons.push({ x, y, R })
    }
    moons.forEach((moon, i) => {
      const sys: System = { centre: () => [moon.x, moon.y], R: moon.R, reach: moon.R, label: `moon-${i}` }
      knock(moon.x, moon.y, moon.R * 1.08)
      const st = stackOf(sys, sys.label)
      drawStack(sys, st.rings, st.hub, hubRng)
      for (const sat of st.satellites)
        drawSatellite(g, sat, env)
    })
  }

  g.restore()
}

export default {
  slug: 'orbits',
  title: 'Orbits',
  summary: 'Concentric orbital systems from a grammar of rings: dial scales, broken arcs, dotted spirals, gear rims and Keplerian orbits with their satellites.',
  order: 290,
  traits: TRAITS,
  features,
  render,
  // Seed-of-seeds 0x0eb17500 ("gallery" stream): the first hash found for each
  // palette × layout pair, until twelve pairs are covered. The Patina
  // planetary system is moved first as the cover.
  gallery: [
    '0xeb98bce99ef8ff10c38c05cfd234821b81fee8df9a96ad54c0ec1b26a4d76cc1',
    '0xec45f5a8bd26e7e84076cf61de096060ffccf85f1e164f47f4ea11a107f0ba38',
    '0x6ad96dd4004a5210b326e0707952989ec3dfe4df88c9b8db72c22247fa85e958',
    '0xb6e5d9cf64115b33c06c4b8b44f531a20d785486ce97a59999a961b2bd57bb68',
    '0x3e9ef7b78fe4c6835daddab03d7a5e4d86fe8c57960eae3cb728d2b450bacfc4',
    '0x006ec6b81e7acaa6dbf913e9d94acea2fc23ec56d40305802f5850bc27cce828',
    '0x99b3ce6b7b2a014be343eb152326f02f62d0f3cfbf296c955c536aef2bc173fe',
    '0xcf9c3ccb6f80ce145395870e18bde4a41dba786c769479c0856e0a09c993686c',
    '0xe015a43b39c3edfb49beaf3b72b45759b5a6dac1b44c1b4ecb1593c56a8da48c',
    '0xf95470990a13b43f1e4be6c99bf2e3c485b3acf939846fd29ffd3bb7c87e90e3',
    '0xcae292ec634ceeec646b0eb7a330a61aed52427de9a649c79348e6fcb50590a4',
    '0x8c3c8b1b956e0cb9b6ee5a1bb580cdf09aaa277ec53376cf290fc6ff4dbd16db',
  ],
} satisfies Series
