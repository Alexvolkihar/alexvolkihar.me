// "Sprites" — procedural pixel-art creatures, robots and spaceships.
//
// Each sprite is a half mask built from a few hash-drawn shapes, sampled at
// random, mirrored and outlined (Bollinger's Pixel Robots and Spaceships, as
// written up by Zelimir Fedoran: see ../sprites/sprite.ts). Body cells are
// shaded from their position in the sprite and from their exposed sides, in
// colour ramps taken from the fixed palettes of old consoles and home
// computers. The sprites are then set out as a specimen sheet with catalogue
// numbers, as a parade of families (one mask per lane, a new sampling for
// each member) or as a single hero in a pixel landscape or in space.
//
// The whole scene is drawn in art pixels: the short side always holds the
// same number of them and the blit rounds their edges to device pixels, so a
// hash gives the same crisp picture at 300 px and at 8K. Wider or taller
// canvases add columns, rows, lanes or scenery on both sides of the square.

import type { Rng } from '../random'
import type { Colour, Pixels } from '../sprites/pixels'
import type { Ink, Kind, Shading, Sprite } from '../sprites/sprite'
import type { Series } from '../types'
import { chance, int, pick, range, stream, weighted } from '../random'
import { blit, digits, dither, hash2, hex, makeBuffer, noise1 } from '../sprites/pixels'
import { drawSprite, EMPTY, kindHeight, makeMask, sample, turnRight } from '../sprites/sprite'

// ---------------------------------------------------------------------------
// Rarity table — decided before the drawing code, never reordered.
// ---------------------------------------------------------------------------

const TRAITS = {
  Palette: [['Famicom', 22], ['PICO-8', 22], ['Game Boy', 16], ['C64', 16], ['Spectrum', 12], ['CGA', 12]],
  Kind: [['Critters', 32], ['Robots', 24], ['Ships', 24], ['Mixed', 20]],
  Layout: [['Specimen sheet', 40], ['Parade', 32], ['Hero', 28]],
  Shading: [['Flat', 25], ['Rounded', 45], ['Banded', 30]],
  Size: [['Tiny', 25], ['Classic', 50], ['Large', 25]],
} as const

type TraitName = keyof typeof TRAITS
type Features = { [K in TraitName]: typeof TRAITS[K][number][0] }

function features(hash: string): Features {
  const r = stream(hash, 'features')
  return {
    Palette: weighted(r, TRAITS.Palette),
    Kind: weighted(r, TRAITS.Kind),
    Layout: weighted(r, TRAITS.Layout),
    Shading: weighted(r, TRAITS.Shading),
    Size: weighted(r, TRAITS.Size),
  }
}

// ---------------------------------------------------------------------------
// Palettes: colours from each machine's fixed hardware palette, grouped into
// ramps (dark to light) for the sprites and into a few roles for the scenery.
// ---------------------------------------------------------------------------

interface PaletteDef {
  bg: string
  panel: string
  frame: string
  label: string
  outline: string
  ramps: string[][]
  accents: string[]
  /** Ramp and frame of the rare "shiny" specimens. */
  shiny: string[]
  shinyFrame: string
  sky: string[]
  space: string[]
  far: string
  near: string
  /** Top edge of the near hills, when they need one to stand out. */
  ridge?: string
  /** Ground top line, fill, detail. */
  ground: [string, string, string]
  sun: string
  star: string
  shadow: string
  dark: boolean
}

const PALETTES: Record<Features['Palette'], PaletteDef> = {
  'Famicom': {
    bg: '#5c94fc',
    panel: '#fce0a8',
    frame: '#000000',
    label: '#881400',
    outline: '#000000',
    ramps: [
      ['#a81000', '#f83800', '#f87858', '#f0d0b0'],
      ['#005800', '#00a800', '#58d854', '#b8f8b8'],
      ['#940084', '#d800cc', '#f878f8', '#f8b8f8'],
      ['#881400', '#e45c10', '#fca044', '#fce0a8'],
      ['#004058', '#008888', '#00e8d8', '#b8f8d8'],
      ['#787878', '#bcbcbc', '#fcfcfc'],
    ],
    accents: ['#fcfcfc', '#f8b800', '#00e8d8', '#f83800'],
    shiny: ['#ac7c00', '#f8b800', '#f8d878', '#fcfcfc'],
    shinyFrame: '#f8b800',
    sky: ['#0058f8', '#5c94fc', '#a4e4fc'],
    space: ['#000000', '#0000bc', '#4428bc'],
    far: '#58d854',
    near: '#00a800',
    ground: ['#fca044', '#c84c0c', '#000000'],
    sun: '#f8d878',
    star: '#fcfcfc',
    shadow: '#881400',
    dark: false,
  },
  'PICO-8': {
    bg: '#1d2b53',
    panel: '#000000',
    frame: '#5f574f',
    label: '#83769c',
    outline: '#000000',
    ramps: [
      ['#7e2553', '#ff004d', '#ff77a8', '#ffccaa'],
      ['#ab5236', '#ffa300', '#ffec27', '#fff1e8'],
      ['#5f574f', '#008751', '#00e436', '#fff1e8'],
      ['#1d2b53', '#29adff', '#c2c3c7', '#fff1e8'],
      ['#5f574f', '#c2c3c7', '#fff1e8'],
      ['#7e2553', '#83769c', '#ff77a8', '#ffccaa'],
    ],
    accents: ['#ffec27', '#ff004d', '#00e436', '#29adff', '#fff1e8'],
    shiny: ['#ab5236', '#ffa300', '#ffec27', '#fff1e8'],
    shinyFrame: '#ffa300',
    sky: ['#000000', '#1d2b53', '#7e2553', '#ff77a8'],
    space: ['#000000', '#1d2b53'],
    far: '#7e2553',
    near: '#1d2b53',
    ground: ['#008751', '#000000', '#1d2b53'],
    sun: '#ffccaa',
    star: '#fff1e8',
    shadow: '#1d2b53',
    dark: true,
  },
  'Game Boy': {
    bg: '#9bbc0f',
    panel: '#9bbc0f',
    frame: '#306230',
    label: '#306230',
    outline: '#0f380f',
    // mostly mid green, so the sprites stand out from the pale screen
    ramps: [['#0f380f', '#306230', '#306230', '#306230', '#8bac0f'], ['#0f380f', '#0f380f', '#306230', '#306230', '#8bac0f']],
    accents: ['#9bbc0f', '#0f380f'],
    shiny: ['#0f380f', '#306230', '#9bbc0f'],
    shinyFrame: '#0f380f',
    sky: ['#9bbc0f'],
    space: ['#0f380f', '#306230'],
    far: '#8bac0f',
    near: '#9bbc0f',
    ridge: '#306230',
    ground: ['#0f380f', '#306230', '#8bac0f'],
    sun: '#8bac0f',
    star: '#9bbc0f',
    shadow: '#306230',
    dark: false,
  },
  'C64': {
    bg: '#6c5eb5',
    panel: '#352879',
    frame: '#000000',
    label: '#6c5eb5',
    outline: '#000000',
    ramps: [
      ['#433900', '#6f4f25', '#9a6759', '#b8c76f'],
      ['#433900', '#588d43', '#9ad284'],
      ['#444444', '#6c6c6c', '#959595', '#ffffff'],
      ['#444444', '#6f3d86', '#9a6759'],
      ['#444444', '#70a4b2', '#ffffff'],
    ],
    accents: ['#ffffff', '#b8c76f', '#9ad284', '#70a4b2'],
    shiny: ['#6f4f25', '#b8c76f', '#ffffff'],
    shinyFrame: '#b8c76f',
    sky: ['#352879', '#6c5eb5', '#70a4b2'],
    space: ['#000000', '#352879'],
    far: '#6f3d86',
    near: '#444444',
    ground: ['#588d43', '#433900', '#6f4f25'],
    sun: '#b8c76f',
    star: '#ffffff',
    shadow: '#433900',
    dark: true,
  },
  'Spectrum': {
    bg: '#000000',
    panel: '#0000d7',
    frame: '#00d7d7',
    label: '#ffffff',
    outline: '#000000',
    ramps: [
      ['#d70000', '#ff0000'],
      ['#d700d7', '#ff00ff'],
      ['#00d700', '#00ff00'],
      ['#00d7d7', '#00ffff'],
      ['#d7d700', '#ffff00'],
      ['#d7d7d7', '#ffffff'],
    ],
    accents: ['#ffffff', '#ffff00', '#00ffff', '#ff0000'],
    shiny: ['#d7d700', '#ffff00', '#ffffff'],
    shinyFrame: '#ffff00',
    sky: ['#000000', '#0000d7'],
    space: ['#000000'],
    far: '#d700d7',
    near: '#0000ff',
    ground: ['#00ff00', '#00d700', '#000000'],
    sun: '#ffff00',
    star: '#ffffff',
    shadow: '#000000',
    dark: true,
  },
  'CGA': {
    bg: '#000000',
    panel: '#000000',
    frame: '#ff55ff',
    label: '#55ffff',
    outline: '#000000',
    ramps: [['#55ffff', '#ffffff'], ['#ff55ff', '#ffffff']],
    accents: ['#ffffff', '#ff55ff', '#55ffff'],
    shiny: ['#55ffff', '#ff55ff', '#ffffff'],
    shinyFrame: '#ffffff',
    sky: ['#000000'],
    space: ['#000000'],
    far: '#ff55ff',
    near: '#55ffff',
    ground: ['#ffffff', '#55ffff', '#000000'],
    sun: '#ffffff',
    star: '#55ffff',
    shadow: '#000000',
    dark: true,
  },
}

interface Pal {
  bg: Colour
  panel: Colour
  frame: Colour
  label: Colour
  outline: Colour
  ramps: Colour[][]
  accents: Colour[]
  shiny: Colour[]
  shinyFrame: Colour
  sky: Colour[]
  space: Colour[]
  far: Colour
  near: Colour
  ridge: Colour
  ground: Colour[]
  sun: Colour
  star: Colour
  shadow: Colour
  dark: boolean
}

function compile(d: PaletteDef): Pal {
  return {
    bg: hex(d.bg),
    panel: hex(d.panel),
    frame: hex(d.frame),
    label: hex(d.label),
    outline: hex(d.outline),
    ramps: d.ramps.map(r => r.map(hex)),
    accents: d.accents.map(hex),
    shiny: d.shiny.map(hex),
    shinyFrame: hex(d.shinyFrame),
    sky: d.sky.map(hex),
    space: d.space.map(hex),
    far: hex(d.far),
    near: hex(d.near),
    ridge: hex(d.ridge ?? d.near),
    ground: d.ground.map(hex),
    sun: hex(d.sun),
    star: hex(d.star),
    shadow: hex(d.shadow),
    dark: d.dark,
  }
}

// Mask sizes (half width, height) per size trait; heroes are larger.
const SIZE: Record<Features['Size'], { hw: number, h: number }> = {
  Tiny: { hw: 4, h: 8 },
  Classic: { hw: 6, h: 12 },
  Large: { hw: 8, h: 16 },
}
const HERO: Record<Features['Size'], { hw: number, h: number }> = {
  Tiny: { hw: 7, h: 14 },
  Classic: { hw: 9, h: 18 },
  Large: { hw: 12, h: 24 },
}

const KINDS: Record<Exclude<Features['Kind'], 'Mixed'>, Kind> = {
  Critters: 'critter',
  Robots: 'robot',
  Ships: 'ship',
}
const ALL_KINDS: readonly Kind[] = ['critter', 'robot', 'ship']

/** Always one draw, so the stream stays aligned whatever the trait. */
function kindOf(k: Features['Kind'], r: Rng): Kind {
  const any = pick(r, ALL_KINDS)
  return k === 'Mixed' ? any : KINDS[k]
}

function makeInk(r: Rng, pal: Pal): Ink {
  const n = pal.ramps.length
  const a = int(r, 0, n - 1)
  let b = int(r, 0, n - 1)
  if (b === a && n > 1)
    b = (a + 1) % n
  return { ramp: pal.ramps[a], ramp2: pal.ramps[b], accent: pick(r, pal.accents), outline: pal.outline, band: int(r, 2, 3) }
}

/** Grid count along one axis: the square's count, plus pairs that fit outside. */
function fit(base: number, cell: number, extent: number, margin: number) {
  return base + 2 * Math.max(0, Math.floor((extent - 2 * margin - base * cell) / (2 * cell)))
}

function stars(p: Pixels, seed: number, density: number, col: Colour, under = Infinity) {
  for (let y = p.y0; y < Math.min(p.y1, under); y++) {
    for (let x = p.x0; x < p.x1; x++) {
      if (hash2(seed, x, y) < density)
        p.set(x, y, col)
    }
  }
}

function shadowUnder(p: Pixels, s: Sprite, x: number, row: number, col: Colour) {
  for (let i = 0; i < s.w; i++) {
    if (s.c[s.bottom * s.w + i] !== EMPTY || (s.bottom > 0 && s.c[(s.bottom - 1) * s.w + i] !== EMPTY))
      p.set(x + i, row, col)
  }
}

/** Exhaust behind a ship facing right: streaks leaving its tail. */
function trail(p: Pixels, s: Sprite, x: number, y: number, len: number, cols: readonly Colour[]) {
  for (let j = 0; j < s.h; j++) {
    let lx = -1
    for (let i = 0; i < s.w; i++) {
      if (s.c[j * s.w + i] !== EMPTY && s.c[j * s.w + i] !== 4) {
        lx = i
        break
      }
    }
    if (lx < 0 || lx > 2)
      continue
    for (let k = 1; k <= len; k++) {
      if (k > len / 2 && (k + j) % 2 === 1)
        continue
      p.set(x + lx - 1 - k, y + j, cols[Math.min(cols.length - 1, Math.floor(k / (len + 1) * cols.length))])
    }
  }
}

/** Flame under a ship facing up. */
function flame(p: Pixels, s: Sprite, x: number, y: number, len: number, cols: readonly Colour[]) {
  for (let i = 0; i < s.w; i++) {
    let by = -1
    for (let j = s.h - 1; j >= 0; j--) {
      const v = s.c[j * s.w + i]
      if (v !== EMPTY && v !== 4) {
        by = j
        break
      }
    }
    if (by < s.bottom - 2)
      continue
    const l = len - Math.abs(i - (s.w - 1) / 2) * 0.6
    for (let k = 1; k <= l; k++) {
      if (k > l / 2 && (k + i) % 2 === 1)
        continue
      p.set(x + i, y + s.bottom + k, cols[Math.min(cols.length - 1, Math.floor(k / (l + 1) * cols.length))])
    }
  }
}

// ---------------------------------------------------------------------------
// Layouts
// ---------------------------------------------------------------------------

interface Scene { N: number, p: Pixels, bg: Colour }

function specimenSheet(f: Features, pal: Pal, hash: string, W: number, H: number): Scene {
  const r = stream(hash, 'sheet')
  const sz = SIZE[f.Size]
  const boxW = 2 * sz.hw + 2
  const boxH = kindHeight('ship', sz.h) + 2
  // wide enough for a three-digit catalogue number inside the frame
  const CW = Math.max(boxW + 4, 15)
  const CH = boxH + 13
  const kx = { Tiny: 7, Classic: 5, Large: 4 }[f.Size]
  const ky = Math.max(1, Math.round(kx * CW / CH))
  const m = 3
  const N = Math.max(kx * CW, ky * CH) + 2 * m
  const p = makeBuffer(W, H, N, pal.bg)
  const diag = chance(r, 0.4)
  const numSeed = Math.floor(r() * 4294967296)
  const shinySeed = Math.floor(r() * 4294967296)
  const dotSeed = Math.floor(r() * 4294967296)
  const cols = fit(kx, CW, p.w, m)
  const rows = fit(ky, CH, p.h, m)
  const gx = Math.round(N / 2 - cols * CW / 2)
  const gy = Math.round(N / 2 - rows * CH / 2)
  // faint registration dots between the cells
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= cols; i++) {
      if (hash2(dotSeed, i, j) < 0.8)
        p.set(gx + i * CW - 1, gy + j * CH - 1, pal.panel)
    }
  }
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const dc = 2 * col - (cols - 1)
      const dr = 2 * row - (rows - 1)
      const sr = stream(hash, `specimen ${dc},${dr}`)
      const kind = kindOf(f.Kind, sr)
      const s = sample(makeMask(kind, sz.hw, sz.h, sr), sr, diag)
      let ink = makeInk(sr, pal)
      const shiny = hash2(shinySeed, dc, dr) < 0.06
      if (shiny)
        ink = { ...ink, ramp: pal.shiny, ramp2: pal.shiny }
      const x = gx + col * CW + 1
      const y = gy + row * CH + 1
      const w = CW - 2
      const h = CH - 2
      const frame = shiny ? pal.shinyFrame : pal.frame
      p.rect(x, y, w, h, pal.panel)
      p.rect(x, y, w, 1, frame)
      p.rect(x, y + h - 1, w, 1, frame)
      p.rect(x, y, 1, h, frame)
      p.rect(x + w - 1, y, 1, h, frame)
      p.set(x, y, pal.bg)
      p.set(x + w - 1, y, pal.bg)
      p.set(x, y + h - 1, pal.bg)
      p.set(x + w - 1, y + h - 1, pal.bg)
      // a rule above the label
      for (let i = 2; i < w - 2; i += 2)
        p.set(x + i, y + h - 9, frame)
      const sx = x + Math.floor((w - s.w) / 2)
      const sy = y + 2 + Math.floor((boxH - s.h) / 2)
      drawSprite(p, s, sx, sy, ink, f.Shading as Shading)
      const n = String(1 + Math.floor(hash2(numSeed, dc, dr) * 999)).padStart(3, '0')
      digits(p, n, x + Math.floor((w - 11) / 2), y + h - 7, pal.label)
    }
  }
  return { N, p, bg: pal.bg }
}

function parade(f: Features, pal: Pal, hash: string, W: number, H: number): Scene {
  const r = stream(hash, 'parade')
  const sz = SIZE[f.Size]
  const boxH = kindHeight('ship', sz.h) + 2
  const LH = boxH + 6
  const L = { Tiny: 6, Classic: 5, Large: 4 }[f.Size]
  const m = 2
  const N = L * LH + 2 * m
  const p = makeBuffer(W, H, N, pal.bg)
  const starSeed = Math.floor(r() * 4294967296)
  if (pal.dark)
    stars(p, starSeed, 0.006, pal.star)
  const lanes = fit(L, LH, p.h, m)
  const top = Math.round(N / 2 - lanes * LH / 2)
  for (let k = 0; k < lanes; k++) {
    const dl = 2 * k - (lanes - 1)
    const lr = stream(hash, `lane ${dl}`)
    const kind = kindOf(f.Kind, lr)
    const mask = makeMask(kind, sz.hw, sz.h, lr)
    const ink = makeInk(lr, pal)
    // the odd one out in each family wears the second ramp
    const swap = { ...ink, ramp: ink.ramp2, ramp2: ink.ramp }
    const diag = chance(lr, 0.4)
    const gap = int(lr, 1, 4)
    const yTop = top + k * LH
    const floorY = yTop + LH - 2
    if (kind !== 'ship') {
      p.rect(p.x0, floorY, p.w, 1, pal.ground[0])
      for (let x = p.x0; x < p.x1; x++)
        p.set(x, floorY + 1, ((x >> 1) + k) % 2 === 0 ? pal.ground[1] : pal.ground[2])
    }
    // walk a fixed stretch, so the lane is the same whatever the canvas width
    let x = -2 * N + int(lr, 0, 8)
    while (x < 3 * N) {
      let s = sample(mask, lr, diag)
      const odd = chance(lr, 0.2)
      const bob = int(lr, -1, 1)
      const tl = int(lr, 3, 10)
      if (kind === 'ship')
        s = turnRight(s)
      if (x + s.w + tl >= p.x0 && x - tl <= p.x1) {
        if (kind === 'ship') {
          const sy = yTop + 1 + Math.floor((LH - 2 - s.h) / 2) + bob
          trail(p, s, x, sy, tl, [ink.accent, ink.ramp[ink.ramp.length - 1], ink.ramp[Math.max(0, ink.ramp.length - 2)]])
          drawSprite(p, s, x, sy, odd ? swap : ink, f.Shading as Shading)
        }
        else {
          const sy = floorY - s.bottom
          shadowUnder(p, s, x, floorY, pal.shadow)
          drawSprite(p, s, x, sy, odd ? swap : ink, f.Shading as Shading)
        }
      }
      x += s.w + gap + (kind === 'ship' ? tl : 0)
    }
  }
  return { N, p, bg: pal.bg }
}

function hero(f: Features, pal: Pal, hash: string, W: number, H: number): Scene {
  const r = stream(hash, 'hero')
  const kind = kindOf(f.Kind, r)
  const sz = HERO[f.Size]
  const N = Math.round(sz.h * 2.7)
  const space = kind === 'ship'
  const p = makeBuffer(W, H, N, space ? pal.space[0] : pal.sky[0])
  const sceneSeed = Math.floor(r() * 4294967296)
  const ground = Math.round(N * range(r, 0.72, 0.8))

  if (space) {
    for (let y = p.y0; y < p.y1; y++) {
      const t = Math.min(1, Math.max(0, y / N))
      for (let x = p.x0; x < p.x1; x++)
        p.set(x, y, dither(pal.space, t, x, y))
    }
    stars(p, sceneSeed, 0.012, pal.star)
    for (let y = p.y0; y < p.y1; y++) {
      for (let x = p.x0; x < p.x1; x++) {
        if (hash2(sceneSeed ^ 0x5BD1E995, x, y) < 0.0012) {
          p.set(x - 1, y, pal.star)
          p.set(x + 1, y, pal.star)
          p.set(x, y - 1, pal.star)
          p.set(x, y + 1, pal.star)
        }
      }
    }
    // a planet, lit from one side and dithered across its ramp
    const pr = N * range(r, 0.2, 0.38)
    const pcx = N * range(r, 0.05, 0.95)
    const pcy = N * range(r, 0.72, 1.0)
    const ramp = pick(r, pal.ramps)
    const la = range(r, -2.6, -0.5)
    const lx = Math.cos(la)
    const ly = Math.sin(la)
    const ring = chance(r, 0.45)
    const tilt = range(r, -0.35, 0.35)
    const ringCol = pick(r, pal.accents)
    const drawRing = (front: boolean) => {
      for (let y = Math.floor(pcy - pr * 1.2); y <= pcy + pr * 1.2; y++) {
        for (let x = Math.floor(pcx - pr * 2.1); x <= pcx + pr * 2.1; x++) {
          const dx = (x + 0.5 - pcx) / pr
          const dy = (y + 0.5 - pcy) / pr - dx * tilt
          const e = dx * dx + (dy / 0.22) ** 2
          if (e < 1.55 ** 2 || e > 1.95 ** 2 || (dy > 0) !== front)
            continue
          if (!front && dx * dx + ((y + 0.5 - pcy) / pr) ** 2 < 1)
            continue
          p.set(x, y, (x + y) % 3 === 0 ? pal.outline : ringCol)
        }
      }
    }
    if (ring)
      drawRing(false)
    for (let y = Math.floor(pcy - pr); y <= pcy + pr; y++) {
      for (let x = Math.floor(pcx - pr); x <= pcx + pr; x++) {
        const dx = (x + 0.5 - pcx) / pr
        const dy = (y + 0.5 - pcy) / pr
        const d = dx * dx + dy * dy
        if (d > 1)
          continue
        const nz = Math.sqrt(1 - d)
        const l = Math.max(0, dx * lx + dy * ly) * 0.8 + nz * 0.35 - 0.1
        const band = 0.12 * Math.sin((dy * 7 + noise1(sceneSeed, dx * 3) * 2) * Math.PI)
        p.set(x, y, dither(ramp, Math.min(1, Math.max(0, l + band)), x, y))
      }
    }
    if (ring)
      drawRing(true)
  }
  else {
    for (let y = p.y0; y < Math.min(p.y1, ground); y++) {
      const t = Math.min(1, Math.max(0, y / ground))
      for (let x = p.x0; x < p.x1; x++)
        p.set(x, y, dither(pal.sky, t, x, y))
    }
    if (pal.dark)
      stars(p, sceneSeed, 0.01, pal.star, Math.round(ground * 0.55))
    // sun or moon
    const sr = N * range(r, 0.06, 0.1)
    const scx = N * range(r, 0.15, 0.85)
    const scy = N * range(r, 0.12, 0.3)
    const crescent = pal.dark && chance(r, 0.6)
    const off = sr * range(r, 0.35, 0.6)
    for (let y = Math.floor(scy - sr); y <= scy + sr; y++) {
      for (let x = Math.floor(scx - sr); x <= scx + sr; x++) {
        const dx = x + 0.5 - scx
        const dy = y + 0.5 - scy
        if (dx * dx + dy * dy > sr * sr)
          continue
        if (crescent && (dx - off) ** 2 + (dy + off * 0.4) ** 2 < sr * sr)
          continue
        p.set(x, y, pal.sun)
      }
    }
    // far range and near hills, defined for every x so the scene extends
    const farSeed = Math.floor(r() * 4294967296)
    const nearSeed = Math.floor(r() * 4294967296)
    const farH = range(r, 0.12, 0.3)
    const farScale = range(r, 0.12, 0.25)
    const steps = chance(r, 0.4)
    for (let x = p.x0; x < p.x1; x++) {
      let n = noise1(farSeed, x / (N * farScale)) * 0.75 + noise1(farSeed + 1, x / (N * farScale * 0.3)) * 0.25
      if (steps)
        n = Math.round(n * 5) / 5
      const ft = ground - Math.round(N * (0.04 + farH * n))
      for (let y = ft; y < ground; y++)
        p.set(x, y, pal.far)
      const nt = ground - Math.round(N * (0.02 + 0.08 * noise1(nearSeed, x / (N * 0.09))))
      for (let y = nt; y < ground; y++)
        p.set(x, y, y === nt ? pal.ridge : pal.near)
    }
    const brick = chance(r, 0.5)
    for (let y = ground; y < p.y1; y++) {
      for (let x = p.x0; x < p.x1; x++) {
        let c = pal.ground[1]
        const gy = y - ground - 1
        if (y === ground) {
          c = pal.ground[0]
        }
        else if (brick) {
          const course = Math.floor(gy / 3)
          if (gy % 3 === 2 || (x + course * 2) % 4 === 0)
            c = pal.ground[2]
        }
        else if (hash2(sceneSeed, x >> 1, y) < 0.1) {
          c = pal.ground[2]
        }
        // below the square (tall canvases), the ground darkens with depth
        if (y > N && c === pal.ground[1])
          c = dither([pal.ground[1], pal.ground[2]], Math.min(0.75, (y - N) / N), x, y)
        p.set(x, y, c)
      }
    }
  }

  // companions: small sprites of the same kind, out on both sides
  const diag = chance(r, 0.4)
  const shading = f.Shading as Shading
  const cr = stream(hash, 'companions')
  let cx = -1.5 * N + range(cr, 0, 0.2) * N
  while (cx < 2.5 * N) {
    const ck = kindOf(f.Kind, cr)
    const mk = makeMask(space ? 'ship' : (ck === 'ship' ? 'critter' : ck), 3, 6, cr)
    const s = sample(mk, cr, diag)
    const ink = makeInk(cr, pal)
    const yy = range(cr, 0.1, 0.6)
    const place = chance(cr, 0.55)
    const x = Math.round(cx)
    if (place && Math.abs(x + s.w / 2 - N / 2) > N * 0.2 + s.w) {
      if (space) {
        const y = Math.round(N * yy)
        flame(p, s, x, y, 3, [ink.accent, pal.sun])
        drawSprite(p, s, x, y, ink, shading)
      }
      else {
        shadowUnder(p, s, x, ground, pal.shadow)
        drawSprite(p, s, x, ground - s.bottom, ink, shading)
      }
    }
    cx += N * range(cr, 0.12, 0.3)
  }

  // the hero
  const mask = makeMask(kind, sz.hw, sz.h, r)
  const s = sample(mask, r, diag)
  // the hero must not melt into the hills behind it: redraw its ramp (a fixed
  // four times, so the stream stays aligned) and keep the first that stands out
  let ink = makeInk(r, pal)
  for (let k = 0; k < 4; k++) {
    const next = makeInk(r, pal)
    if (ink.ramp.includes(pal.far) || ink.ramp.includes(pal.near) || ink.ramp.includes(pal.space[0]))
      ink = next
  }
  const x = Math.round(N / 2 - s.w / 2)
  if (space) {
    const y = Math.round(N * 0.44 - s.h / 2)
    flame(p, s, x, y, Math.round(s.h * 0.35), [pal.sun, ink.accent, pal.star])
    drawSprite(p, s, x, y, ink, shading)
  }
  else {
    shadowUnder(p, s, x, ground, pal.shadow)
    drawSprite(p, s, x, ground - s.bottom, ink, shading)
  }
  return { N, p, bg: space ? pal.space[0] : pal.sky[0] }
}

function render(g: CanvasRenderingContext2D, W: number, H: number, hash: string) {
  const f = features(hash)
  const pal = compile(PALETTES[f.Palette])
  let scene: Scene
  if (f.Layout === 'Specimen sheet')
    scene = specimenSheet(f, pal, hash, W, H)
  else if (f.Layout === 'Parade')
    scene = parade(f, pal, hash, W, H)
  else
    scene = hero(f, pal, hash, W, H)
  blit(g, W, H, scene.N, scene.p, scene.bg)
}

export default {
  slug: 'sprites',
  title: 'Sprites',
  summary: 'Pixel-art critters, robots and spaceships grown from mirrored random masks, in console palettes, pinned to specimen sheets, marching in parades or posed as heroes.',
  order: 530,
  traits: TRAITS,
  features,
  render,
  // Seed-of-seeds 0x5b1e5000 ("gallery" stream): the first hash found for each
  // Layout x Kind pair (all twelve), in the order found, except that the
  // PICO-8 critter specimen sheet, the archetype of the series, is moved first
  // to serve as the cover.
  gallery: [
    '0xd6168dedfbf34fbba63c75f6359316faf4ee5f509e8ea1a503507d48c66cf69e',
    '0x9fa73596a842ec68b2ce9db4cfe380d6b92bb530f88f75cc42c1773e81639ee4',
    '0x64ae59be17caa0916ad2c3d568f70cbc1daa2821f14b12ce5efceb4a65fb5af2',
    '0x20f18d874a27b665cb16c7e065a9e54ab28c4ee3416ee83c77b8972a50245fc6',
    '0x81d11a22ac6d4cf9a8ccff6c0abe41c4801fc3dcdc66a2a4948cce776710e0aa',
    '0x12f391dc388df4855dfbc2ba56c6ddae3e9b2bf1cb55d4b348fa19d45d64113a',
    '0xb00188ced641ef65839710a9006e31a76fdf8b2434d2c3bbeec9e9898c787d70',
    '0x32ebb0e46e66db74b0500e63a7fb2662da8dc9b40055e5425cd9253547fefb85',
    '0xeff02a7c83a7b9a9e5d6360da5856ac8a691a0ddf198fd6ddc35dd5126f4d521',
    '0x86b16b246fc1b057bf46e23263ba4f8e6914c935a780527e1974fe9727494cd1',
    '0x684eb7c1fe3bf54e1b86509e0a57a611e2b198193ffa36a4b9af6735717d058d',
    '0xdb02571cc8e7aa815846d49bed2d08aae0febf2741f84bdfe13a513f9ecb78ab',
  ],
} satisfies Series
