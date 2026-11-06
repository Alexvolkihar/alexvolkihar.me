// "Rings" — growth rings of wood: log ends, sawn slices, woodpiles and boards.
//
// A tree is a list of yearly ring widths (wide juvenile rings, slow narrowing,
// a red-noise climate, droughts and releases). Its wood is a solid texture: a
// scalar field t that is 0 at the pith and 1 under the bark, perturbed by
// noise, deflected by knots (see ../rings/raster.ts). A log end shows t around
// an off-centre pith; a board shows the same cylinder of rings cut by a plane,
// so the rings come out as nested cathedral arches (flat-sawn) or as straight
// stripes with ray fleck (quarter-sawn). Early and late wood, vessels, bark,
// medullary rays, drying checks and spalting are then painted per species.
//
// Everything is a pure function of the hash, and every length is a fraction
// of the canvas short side. Single logs are centred on a full-canvas ground;
// woodpiles and floors are laid out on a fixed field larger than any canvas
// and cropped, so a wider canvas shows more of the same pile.

import type { Rng } from '../random'
import type { Board, BoardKnot, Finish, Piece, Round, RoundKnot, Scene, Wood } from '../rings/raster'
import type { Species, SpeciesName } from '../rings/species'
import type { Growth, Tree } from '../rings/tree'
import type { Series } from '../types'
import { int, range, stream, weighted } from '../random'
import { overlayBoard, overlayRound } from '../rings/overlay'
import { buildGrid, paint, roundExtent } from '../rings/raster'
import { SPECIES } from '../rings/species'
import { growTree, makeNoise, periodic, subRng } from '../rings/tree'

// ---------------------------------------------------------------------------
// Rarity table — decided before the drawing code, never reordered.
// Changing a weight or an order re-rolls the whole edition.
// ---------------------------------------------------------------------------

const TRAITS = {
  Species: [['Oak', 26], ['Walnut', 22], ['Birch', 18], ['Cedar', 20], ['Ebony', 14]],
  Cut: [['End grain', 30], ['Slabbed', 16], ['Woodpile', 18], ['Flat-sawn', 22], ['Quarter-sawn', 14]],
  Growth: [['Steady', 35], ['Drought', 28], ['Reaction', 22], ['Ancient', 15]],
  Defect: [['Clear', 33], ['Knotty', 27], ['Checked', 25], ['Spalted', 15]],
  Finish: [['Raw', 50], ['Oiled', 30], ['Ink', 20]],
} as const satisfies Record<string, ReadonlyArray<readonly [string, number]>>

type TraitName = keyof typeof TRAITS
type Features = { [K in TraitName]: typeof TRAITS[K][number][0] }

/** Pure function of the hash, computed before (and without) any rendering. */
function features(hash: string): Features {
  const r = stream(hash, 'features')
  return {
    Species: weighted(r, TRAITS.Species),
    Cut: weighted(r, TRAITS.Cut),
    Growth: weighted(r, TRAITS.Growth),
    Defect: weighted(r, TRAITS.Defect),
    Finish: weighted(r, TRAITS.Finish),
  }
}

const TAU = Math.PI * 2
const WHOLE: Piece = { dx: 0, dy: 0, x0: -10, x1: 10, y0: -10, y1: 10 }

// ---------------------------------------------------------------------------
// Logs and boards. Each takes a seed from the layout stream and draws all its
// own parameters from a private generator, in a fixed order.
// ---------------------------------------------------------------------------

function makeRound(seed: number, cx: number, cy: number, R: number, f: Features, sp: Species, pile: boolean): Round {
  const r = subRng(seed, 1)
  const reaction = f.Growth === 'Reaction'
  const ecc = reaction ? range(r, 0.2, 0.4) : range(r, 0.01, 0.13)
  const ea = r() * TAU
  const harm: number[] = []
  for (let k = 2; k <= 6; k++) {
    const a = k === 2 ? range(r, 0.008, reaction ? 0.06 : 0.035) : range(r, 0, 0.018) / (k - 1)
    const ph = r() * TAU
    harm.push(a * Math.cos(ph), a * Math.sin(ph))
  }
  const barkT = sp.barkT * range(r, 0.8, 1.25)
  const fiss = periodic(r, sp.paperBark ? int(r, 70, 110) : int(r, 28, 64))
  const barkVar = periodic(r, 9)
  const streak = periodic(r, int(r, 180, 320))
  const wob = range(r, 0.012, 0.03)
  const knots: RoundKnot[] = []
  const nk = f.Defect === 'Knotty' ? (pile ? (r() < 0.5 ? 1 : 0) : int(r, 1, 3)) : 0
  for (let i = 0; i < 3; i++) {
    const kn = { th: r() * TAU, t0: range(r, 0, 0.15), t1: range(r, 0.45, 1.15), w: R * range(r, 0.022, 0.055), defl: range(r, 0.012, 0.032) }
    if (i < nk)
      knots.push(kn)
  }
  const deadKnots = r() < 0.4
  const heart = sp.heart > 0 ? sp.heart * range(r, 0.88, 1.06) : 0
  const tone = range(r, 0.93, 1.05)
  const offs = Array.from({ length: 8 }, () => r() * 200)
  const sa = r() * TAU
  const sd = range(r, 2.2, 3.4)
  const sawOn = r() < 0.75 && f.Finish === 'Raw'
  const rot = r() * TAU
  return {
    kind: 'round',
    cx,
    cy,
    rot,
    R,
    px: Math.cos(ea) * ecc * R,
    py: Math.sin(ea) * ecc * R,
    harm,
    barkT,
    fiss,
    barkVar,
    streak,
    wob,
    knots,
    deadKnots,
    heart,
    tone,
    offs,
    saw: sawOn ? [Math.cos(sa) * sd, Math.sin(sa) * sd] : null,
    pieces: [WHOLE],
    margin: pile ? 0.006 : 0.04,
    seed,
  }
}

interface Log { seed: number, Rlog: number }

function makeBoard(seed: number, rect: [number, number, number, number], horiz: boolean, log: Log, f: Features, sp: Species): Board {
  const r = subRng(seed, 1)
  const quarter = f.Cut === 'Quarter-sawn'
  const [x0, y0, x1, y1] = rect
  const u0 = horiz ? x0 : y0
  const u1 = horiz ? x1 : y1
  const v0 = horiz ? y0 : x0
  const v1 = horiz ? y1 : x1
  const bw = v1 - v0
  const R = log.Rlog
  const d = quarter ? range(r, 0, 0.03) * R : range(r, 0.2, 0.6) * R
  const side = r() < 0.5 ? -1 : 1
  const off = quarter ? side * range(r, bw / 2 + 0.05, Math.max(bw / 2 + 0.06, 0.8 * R - bw / 2)) : range(r, -0.1, 0.1)
  const taper = (quarter ? range(r, 0.03, 0.08) : range(r, 0.1, 0.22)) * (r() < 0.5 ? -1 : 1)
  const uRef = (u0 + u1) / 2 + range(r, -0.3, 0.3)
  const sweep = quarter ? range(r, 0.02, 0.05) : range(r, 0.05, 0.16)
  const amp = quarter ? range(r, 0.005, 0.012) : range(r, 0.01, 0.025)
  const mirror = r() < 0.5 ? -1 : 1
  const knots: BoardKnot[] = []
  const nk = f.Defect === 'Knotty' ? weighted(r, [[0, 30], [1, 45], [2, 25]] as const) : 0
  for (let i = 0; i < 2; i++) {
    const kn = {
      u: range(r, u0 + 0.06, u1 - 0.06),
      v: range(r, v0 + bw * 0.25, v1 - bw * 0.25),
      r: range(r, 0.012, 0.032),
      el: range(r, 1.1, 1.9),
      defl: range(r, 0.025, 0.06),
    }
    if (i < nk && u1 - u0 > 0.2)
      knots.push(kn)
  }
  const deadKnots = r() < 0.4
  const heart = sp.heart > 0 ? sp.heart * range(r, 0.9, 1.05) : 0
  const tone = range(r, 0.93, 1.06)
  const offs = Array.from({ length: 8 }, () => r() * 200)
  return {
    kind: 'board',
    x0,
    y0,
    x1,
    y1,
    horiz,
    vMid: (v0 + v1) / 2,
    mirror,
    v0: off,
    d,
    Rlog: R,
    taper,
    uRef,
    sweep,
    amp,
    knots,
    deadKnots,
    quarter,
    logSeed: log.seed,
    heart,
    tone,
    offs,
    seed,
  }
}

// ---------------------------------------------------------------------------
// Compositions
// ---------------------------------------------------------------------------

const seedOf = (r: Rng) => Math.floor(r() * 4294967296) >>> 0

/** Half-size of the fixed field that piles and floors are laid on. */
const FIELD = 1.3

function layout(f: Features, r: Rng, sp: Species): Wood[] {
  switch (f.Cut) {
    case 'End grain': {
      const o = makeRound(seedOf(r), range(r, -0.015, 0.015), range(r, -0.015, 0.015), 0.355, f, sp, false)
      return [o]
    }
    case 'Slabbed': {
      const n = int(r, 3, 6)
      const gap = range(r, 0.022, 0.045)
      const R = (0.42 - ((n - 1) / 2) * gap) / 1.13
      const o = makeRound(seedOf(r), 0, 0, R, f, sp, false)
      o.rot = (r() < 0.5 ? 0 : Math.PI / 2) + range(r, -0.07, 0.07)
      const cuts: number[] = []
      for (let j = 1; j < n; j++)
        cuts.push(R * (-0.78 + 1.56 * (j - 0.5 + range(r, -0.12, 0.12)) / (n - 1)))
      const c = Math.cos(o.rot)
      const s = Math.sin(o.rot)
      o.pieces = []
      for (let j = 0; j < n; j++) {
        const along = (j - (n - 1) / 2) * gap
        const slide = range(r, -0.022, 0.022)
        o.pieces.push({
          dx: along * c - slide * s,
          dy: along * s + slide * c,
          x0: j === 0 ? -10 : cuts[j - 1],
          x1: j === n - 1 ? 10 : cuts[j],
          y0: -10,
          y1: 10,
        })
      }
      return [o]
    }
    case 'Woodpile': {
      // logs stacked roughly in a hexagonal lattice, as they settle in a pile
      const rb = range(r, 0.085, 0.13)
      const sx = 2 * rb * 1.02
      const sy = sx * Math.sqrt(3) / 2
      const tilt = range(r, -0.08, 0.08)
      const out: Wood[] = []
      const rows = Math.ceil(FIELD / sy)
      const cols = Math.ceil(FIELD / sx) + 1
      for (let j = -rows; j <= rows; j++) {
        for (let i = -cols; i <= cols; i++) {
          const R = rb * range(r, 0.86, 1.02)
          const room = Math.max(0, sx / 2 - R * 1.05)
          const jx = range(r, -room, room)
          const jy = range(r, -room, room)
          const seed = seedOf(r)
          const split = r()
          const gx = (i + (j & 1) * 0.5) * sx
          const gy = j * sy
          const x = gx * Math.cos(tilt) - gy * Math.sin(tilt) + jx
          const y = gx * Math.sin(tilt) + gy * Math.cos(tilt) + jy
          const o = makeRound(seed, x, y, R, f, sp, true)
          // split firewood: halves cut through the pith, slid back into the
          // middle of their place in the stack
          const c = Math.cos(o.rot)
          const sn = Math.sin(o.rot)
          if (split < 0.1) {
            const k = R * 0.4
            o.pieces = [{ dx: k * c, dy: k * sn, x0: -10, x1: o.px, y0: -10, y1: 10 }]
          }
          out.push(o)
        }
      }
      return out
    }
    default: {
      const quarter = f.Cut === 'Quarter-sawn'
      const horiz = r() < 0.5
      const bw = quarter ? range(r, 0.09, 0.15) : range(r, 0.12, 0.2)
      const seam = 0.0045
      const logs: Log[] = []
      for (let i = 0; i < 3; i++)
        logs.push({ seed: seedOf(r), Rlog: quarter ? range(r, 0.5, 0.8) : range(r, 0.38, 0.62) })
      const out: Wood[] = []
      for (let v = -FIELD; v < FIELD; v += bw) {
        let u = -FIELD - range(r, 0, 1)
        while (u < FIELD) {
          const len = range(r, 0.8, 2)
          const seed = seedOf(r)
          const log = logs[int(r, 0, 2)]
          const a = u + seam / 2
          const b = u + len - seam / 2
          const rect: [number, number, number, number] = horiz ? [a, v + seam / 2, b, v + bw - seam / 2] : [v + seam / 2, a, v + bw - seam / 2, b]
          out.push(makeBoard(seed, rect, horiz, log, f, sp))
          u += len
        }
      }
      return out
    }
  }
}

function visible(o: Wood, hw: number, hh: number): boolean {
  if (o.kind === 'board')
    return o.x1 > -hw && o.x0 < hw && o.y1 > -hh && o.y0 < hh
  const e = roundExtent(o)
  return o.pieces.some(p => o.cx + p.dx + e > -hw && o.cx + p.dx - e < hw && o.cy + p.dy + e > -hh && o.cy + p.dy - e < hh)
}

function render(ctx: CanvasRenderingContext2D, W: number, H: number, hash: string) {
  const f = features(hash)
  const sp = SPECIES[f.Species as SpeciesName]
  const S = Math.min(W, H)
  const nr = stream(hash, 'noise')
  const noise = [makeNoise(nr), makeNoise(nr), makeNoise(nr), makeNoise(nr)]
  const all = layout(f, stream(hash, 'layout'), sp)
  const hw = W / 2 / S
  const hh = H / 2 / S
  const objects = all.filter(o => visible(o, hw, hh))
  const spalted = f.Defect === 'Spalted'
  const growth = f.Growth as Growth
  const logs = new Map<number, Tree>()
  for (const o of objects) {
    if (o.kind === 'round') {
      // firewood is cut from young stems: fewer, wider rings
      o.tree = growTree(subRng(o.seed, 2), growth, sp.lateStart, f.Cut === 'Woodpile' ? 0.5 : 1)
    }
    else {
      if (!logs.has(o.logSeed))
        logs.set(o.logSeed, growTree(subRng(o.logSeed, 2), growth, sp.lateStart, growth === 'Ancient' ? 1 : 1.5))
      o.tree = logs.get(o.logSeed)
    }
    // grid step: fine enough for the ring wobble, never finer than 1.5 px
    const step = Math.max(o.kind === 'round' ? Math.max(o.R / 90, 1 / 250) : 1 / 240, 1.5 / S)
    buildGrid(o, noise, spalted, step)
  }
  const finish = f.Finish as Finish
  const scene: Scene = {
    W,
    H,
    S,
    sp,
    finish,
    spalted,
    ground: f.Cut === 'End grain' || f.Cut === 'Slabbed' ? 'single' : 'deep',
    objects,
  }
  ctx.save()
  ctx.globalAlpha = 1
  paint(ctx, scene)
  const checked = f.Defect === 'Checked'
  for (const o of objects) {
    if (o.kind === 'round')
      overlayRound(ctx, o, sp, finish, checked, f.Cut === 'Woodpile', W, H, S)
    else
      overlayBoard(ctx, o, sp, finish, checked, W, H, S)
  }
  ctx.restore()
}

export default {
  slug: 'rings',
  title: 'Rings',
  summary: 'Growth rings of trees that never grew: log ends, sawn slices, woodpiles and floorboards in oak, walnut, birch, cedar or ebony, with knots, checks and spalting.',
  order: 360,
  traits: TRAITS,
  features,
  render,
  // Seed-of-seeds 0x7111e5c0 ("gallery" stream): the first hash found for each
  // species × cut pair, in order of discovery; the oak end grain leads as cover.
  gallery: [
    '0x5a28accd458f48f24bdadc304a47b4396c4a4f68171dd3e625c659f3e57bbaeb',
    '0xc69518124493fd64a71802aedc6f91b7742ef64952e867995697b42c210717b7',
    '0xb040b4e16be0964af9384e1f7ebd124bfa725179385f837cf5b96286fe3941f2',
    '0x7d3031958c83346b14716245f294d89afca81726c6999364a68f5cb613c666b3',
    '0x5576a701514c8414a7be2bc75b109d0b63c512d46e6e255d2e8c883aff9cc9cf',
    '0x6c233e9ee941abae45546818dd536a349c81b9df81df96110e337a311347894d',
    '0x7f00c501177e4c54a93bdfe5bf4c21418ba58042c60e3a57b9b237517ef6c469',
    '0x081542e66c4370d4ac37dd45ca2e3b39b9941f650b007a90e0027a3f8eca20a2',
    '0x9efcfc5557a18b01d9b42a9b0d877fd4199edc83a58d51fce704de47fd861da0',
    '0x07b4741150b5d12e45fd882d52e457c70aad657dd90b032f8b988cf0333abea0',
    '0xbaa8de307d8090f580681e1ba2feb1e798c301c49142b77da28f0b4e52e1d52f',
    '0x957c040e79474207ab5f7ac899cbd203c39e64e706722b0abc88e4a37516eed8',
  ],
} satisfies Series
