// "Weave" — a swatch of woven ribbons.
//
// Warp ribbons run down the canvas, weft ribbons across. At every crossing a
// weave structure (plain, twill, basket, satin, or a loom draft with its
// threading, treadling and tie-up, see ../weave/draft.ts) decides which one is
// on top. Each ribbon follows a height profile that rises over the crossings
// where it is on top and dives under the others; light from the upper left,
// the slope of that profile, a rounded cross-section and the shadow cast by
// the ribbon passing over give the cloth its depth. Colour stripes in warp
// and weft (single colours, bands, or a mirrored plaid sett) interact through
// the structure the way checks and tartans do; the setts are generated, not
// copied from any registered tartan.
//
// The piece is shaded per pixel: every pixel is mapped back into cloth space
// through a gentle displacement field (bent or rippled cloth), then the
// nearest warp and weft are found analytically, with edge coverage for
// anti-aliasing. Every length is a fraction of the canvas short side; on a
// non-square canvas the swatch simply grows to fill the long side.

import type { Rng } from '../random'
import type { Series } from '../types'
import type { PatternKind } from '../weave/draft'
import { chance, int, pick, range, stream, weighted } from '../random'
import { at, weaveStructure } from '../weave/draft'

// ---------------------------------------------------------------------------
// Rarity table — decided before the drawing code, never reordered.
// ---------------------------------------------------------------------------

const TRAITS = {
  Palette: [['Linen', 22], ['Madder', 20], ['Fjord', 16], ['Moss', 14], ['Saffron', 14], ['Nocturne', 14]],
  Pattern: [['Plain', 22], ['Twill', 26], ['Basket', 16], ['Satin', 14], ['Draft', 22]],
  Scale: [['Fine', 25], ['Medium', 45], ['Coarse', 30]],
  Warp: [['Straight', 40], ['Bent', 40], ['Rippled', 20]],
  Stripes: [['Solid', 25], ['Banded', 35], ['Plaid', 40]],
} as const

type TraitName = keyof typeof TRAITS
type Features = { [K in TraitName]: typeof TRAITS[K][number][0] }

/** Pure function of the hash, computed before (and without) any rendering. */
function features(hash: string): Features {
  const r = stream(hash, 'features')
  return {
    Palette: weighted(r, TRAITS.Palette),
    Pattern: weighted(r, TRAITS.Pattern),
    Scale: weighted(r, TRAITS.Scale),
    Warp: weighted(r, TRAITS.Warp),
    Stripes: weighted(r, TRAITS.Stripes),
  }
}

// ---------------------------------------------------------------------------
// Palettes: table, cast shadow, and five ribbon colours (ground first).
// ---------------------------------------------------------------------------

interface Palette {
  bg: string
  shadow: string
  /** Strength of the vignette on the table. */
  vignette: number
  ribbons: readonly [string, string, string, string, string]
}

const PAL: Record<Features['Palette'], Palette> = {
  Linen: { bg: '#ebe4d6', shadow: '#3d3022', vignette: 0.1, ribbons: ['#26365c', '#e2d4b4', '#b0472b', '#1d1f24', '#7f9073'] },
  Madder: { bg: '#f1e7d8', shadow: '#43251e', vignette: 0.1, ribbons: ['#8c1c22', '#ead9bb', '#d39a3a', '#25304a', '#cf6e5c'] },
  Fjord: { bg: '#e4e8e5', shadow: '#1b2930', vignette: 0.1, ribbons: ['#1f4e63', '#ebe5d3', '#5f9aa0', '#d8a23f', '#22282d'] },
  Moss: { bg: '#e7e4d6', shadow: '#2b2f22', vignette: 0.1, ribbons: ['#2f4a33', '#cbbf7a', '#6f8a3c', '#3c2d22', '#ebe1c4'] },
  Saffron: { bg: '#f3e9d2', shadow: '#45290f', vignette: 0.1, ribbons: ['#e09b1c', '#c2441d', '#2b5c72', '#f6e4b5', '#3a281d'] },
  Nocturne: { bg: '#121116', shadow: '#000000', vignette: 0.35, ribbons: ['#3a3248', '#c9a14a', '#e6dac0', '#8a3344', '#45698f'] },
}

function rgb(hex: string): [number, number, number] {
  const v = Number.parseInt(hex.slice(1), 16)
  return [v >> 16, (v >> 8) & 255, v & 255]
}

// ---------------------------------------------------------------------------
// Sizes, as fractions of the canvas short side.
// ---------------------------------------------------------------------------

/** Distance between ribbon centres. */
const PITCH: Record<Features['Scale'], number> = { Fine: 0.027, Medium: 0.043, Coarse: 0.068 }
/** Side margin of the swatch. */
const MARGIN = 0.08
/** Width of one fibre in a ribbon (texture and frayed ends). */
const FIBRE = 0.0042

// ---------------------------------------------------------------------------
// Colour stripes
// ---------------------------------------------------------------------------

/** One colour index per ribbon, for `n` ribbons, mirrored about the centre ribbon. */
function mirrorSequence(entries: ReadonlyArray<readonly [number, number]>, n: number): number[] {
  // a symmetric sett: the entries, then the same back, without repeating the pivots
  const unit: number[] = []
  const full = [...entries, ...entries.slice(1, -1).reverse()]
  for (const [c, count] of full) {
    for (let k = 0; k < count; k++)
      unit.push(c)
  }
  const centre = Math.floor(n / 2)
  return Array.from({ length: n }, (_, i) => unit[((i - centre) % unit.length + unit.length) % unit.length])
}

/** A generated sett: alternating colours with widths in canvas units, turned into ribbon counts. */
function makeSett(r: Rng, p: number, ground: number, others: readonly number[]): [number, number][] {
  const n = int(r, 3, 6)
  const out: [number, number][] = []
  let prev = -1
  for (let k = 0; k < n; k++) {
    let c = k === 0 ? ground : pick(r, others)
    if (c === prev)
      c = ground === prev ? pick(r, others) : ground
    const w = k === 0 ? range(r, 0.07, 0.15) : pick(r, [0.012, 0.025, 0.025, 0.045, 0.07, 0.1])
    out.push([c, Math.max(1, Math.round(w / p))])
    prev = c
  }
  return out
}

interface Colouring {
  warp: number[]
  weft: number[]
}

function luminance([r, g, b]: readonly number[]): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

function colouring(r: Rng, kind: Features['Stripes'], lum: readonly number[], nW: number, nF: number, p: number): Colouring {
  const order = [0, 1, 2, 3, 4]
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]]
  }
  // the ground colour is usually the palette's first one
  const ground = chance(r, 0.6) ? 0 : order[0]
  const rest = order.filter(c => c !== ground)
  // the colour that carries the weave against the ground: one of the two most contrasting
  const byContrast = [...rest].sort((a, b) => Math.abs(lum[b] - lum[ground]) - Math.abs(lum[a] - lum[ground]))
  const foil = byContrast[chance(r, 0.7) ? 0 : 1]
  const others = rest.filter(c => c !== foil)
  if (kind === 'Solid')
    return { warp: Array.from<number>({ length: nW }).fill(ground), weft: Array.from<number>({ length: nF }).fill(foil) }
  if (kind === 'Banded') {
    const bands = makeSett(r, p * 0.8, foil, [ground, others[0], others[1]])
    if (chance(r, 0.65))
      return { warp: Array.from<number>({ length: nW }).fill(ground), weft: mirrorSequence(bands, nF) }
    return { warp: mirrorSequence(bands, nW), weft: Array.from<number>({ length: nF }).fill(ground) }
  }
  const sett = makeSett(r, p, ground, [foil, ...others.slice(0, int(r, 1, 3))])
  const balanced = chance(r, 0.7)
  const weftSett = balanced ? sett : makeSett(r, p, ground, [foil, ...others.slice(0, 2)])
  return { warp: mirrorSequence(sett, nW), weft: mirrorSequence(weftSett, nF) }
}

// ---------------------------------------------------------------------------
// Displacement field: maps a canvas point back into flat cloth space.
// ---------------------------------------------------------------------------

interface Wave { kx: number, ky: number, phase: number, ax: number, ay: number }

function makeWaves(r: Rng, kind: Features['Warp']): Wave[] {
  const waves: Wave[] = []
  const add = (lambda: number, amp: number, theta: number, push: number) => {
    const k = (Math.PI * 2) / lambda
    waves.push({ kx: Math.cos(theta) * k, ky: Math.sin(theta) * k, phase: r() * Math.PI * 2, ax: Math.cos(push) * amp, ay: Math.sin(push) * amp })
  }
  if (kind === 'Bent') {
    for (let n = 0; n < 2; n++)
      add(range(r, 0.9, 1.7), range(r, 0.018, 0.03), r() * Math.PI * 2, r() * Math.PI * 2)
  }
  else if (kind === 'Rippled') {
    add(range(r, 1.1, 1.8), range(r, 0.01, 0.018), r() * Math.PI * 2, r() * Math.PI * 2)
    // ripples run across one family of ribbons and push the other one
    const across = chance(r, 0.6)
    const lambda = range(r, 0.2, 0.32)
    const amp = range(r, 0.009, 0.014)
    const tilt = range(r, -0.25, 0.25)
    if (across)
      add(lambda, amp, tilt, Math.PI / 2)
    else
      add(lambda, amp, Math.PI / 2 + tilt, 0)
  }
  return waves
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)

/** Integer hash for per-fibre lengths at the frayed ends. */
function fibreHash(i: number, k: number, side: number, salt: number): number {
  let h = Math.imul(i + 0x9E37, 0x85EBCA6B) ^ Math.imul(k + 0x7F4A, 0xC2B2AE35) ^ Math.imul(side + salt, 0x27D4EB2F)
  h ^= h >>> 15
  h = Math.imul(h, 0x2C1B3C6D)
  h ^= h >>> 12
  return (h >>> 0) / 4294967296
}

function render(g: CanvasRenderingContext2D, W: number, H: number, hash: string) {
  const f = features(hash)
  const pal = PAL[f.Palette]
  const S = Math.min(W, H)
  const invS = 1 / S
  const Wn = W / S
  const Hn = H / S

  // Named streams, so a change in one domain never shifts the others: layout,
  // structure, colour, field, and grain (created further down).
  const lr = stream(hash, 'layout')
  const sr = stream(hash, 'structure')
  const cr = stream(hash, 'color')
  const fr = stream(hash, 'field')

  // --- layout ---------------------------------------------------------------
  const p = PITCH[f.Scale]
  const ip = 1 / p
  const hwW = (p * range(lr, 0.72, 0.9)) / 2
  const hwF = (p * range(lr, 0.72, 0.9)) / 2
  const frayed = chance(lr, 0.65)
  const fringe = frayed ? range(lr, 0.045, 0.075) : 0
  const marginY = MARGIN + fringe
  const nW = Math.max(3, Math.floor((Wn - 2 * MARGIN) / p))
  const nF = Math.max(3, Math.floor((Hn - 2 * marginY) / p))
  const u0 = Wn / 2 - ((nW - 1) * p) / 2
  const v0 = Hn / 2 - ((nF - 1) * p) / 2
  const salt = int(lr, 0, 1 << 20)

  // a few missing ribbons, away from the edges
  const dropW = new Uint8Array(nW)
  const dropF = new Uint8Array(nF)
  if (chance(lr, 0.22)) {
    const n = int(lr, 1, 3)
    for (let k = 0; k < n; k++) {
      if (chance(lr, 0.5))
        dropW[int(lr, 2, nW - 3)] = 1
      else
        dropF[int(lr, 2, nF - 3)] = 1
    }
  }

  // warp ends (tips) and how far the fraying reaches into them
  const tipTop = new Float64Array(nW)
  const tipBot = new Float64Array(nW)
  const frayLen = new Float64Array(nW)
  const clothTop = v0 - p / 2
  const clothBot = v0 + (nF - 1) * p + p / 2
  for (let i = 0; i < nW; i++) {
    const lenT = frayed ? fringe * range(lr, 0.62, 1) : p * 0.22
    const lenB = frayed ? fringe * range(lr, 0.62, 1) : p * 0.22
    tipTop[i] = clothTop - lenT
    tipBot[i] = clothBot + lenB
    frayLen[i] = frayed ? fringe * range(lr, 0.4, 0.6) : 0
  }
  // weft ends, cut just past the outer warps
  const endL = new Float64Array(nF)
  const endR = new Float64Array(nF)
  for (let j = 0; j < nF; j++) {
    endL[j] = u0 - hwW - p * range(lr, 0.18, 0.32)
    endR[j] = u0 + (nW - 1) * p + hwW + p * range(lr, 0.18, 0.32)
  }

  // --- structure: heights at each crossing, padded by one row of zeros -----
  const lift = weaveStructure(f.Pattern as PatternKind, nW, nF, sr)
  const pF = nF + 2
  const pW = nW + 2
  const hWarp = new Float32Array(nW * pF)
  const hWeft = new Float32Array(nF * pW)
  for (let i = 0; i < nW; i++) {
    for (let j = 0; j < nF; j++) {
      if (dropW[i] || dropF[j])
        continue
      const up = lift[at(nF, i, j)] === 1
      hWarp[i * pF + j + 1] = up ? 1 : -1
      hWeft[j * pW + i + 1] = up ? -1 : 1
    }
  }

  // a hand-made unevenness: each stretch of ribbon between two crossings is a
  // little lighter or darker, blended smoothly along the ribbon (padded like the heights)
  const gr = stream(hash, 'grain')
  const grainW = new Float32Array(nW * pF)
  const grainF = new Float32Array(nF * pW)
  for (let k = 0; k < grainW.length; k++)
    grainW[k] = 1 + (gr() - 0.5) * 0.07
  for (let k = 0; k < grainF.length; k++)
    grainF[k] = 1 + (gr() - 0.5) * 0.07

  // --- colours ---------------------------------------------------------------
  const ribbonRGB = pal.ribbons.map(rgb)
  const cols = colouring(cr, f.Stripes, ribbonRGB.map(luminance), nW, nF, p)
  const warpRGB = new Float32Array(nW * 3)
  const weftRGB = new Float32Array(nF * 3)
  for (let i = 0; i < nW; i++) {
    const c = ribbonRGB[cols.warp[i]]
    const jit = 1 + (cr() - 0.5) * 0.06
    for (let k = 0; k < 3; k++)
      warpRGB[i * 3 + k] = c[k] * jit
  }
  for (let j = 0; j < nF; j++) {
    const c = ribbonRGB[cols.weft[j]]
    const jit = 1 + (cr() - 0.5) * 0.06
    for (let k = 0; k < 3; k++)
      weftRGB[j * 3 + k] = c[k] * jit
  }
  const [bgR, bgG, bgB] = rgb(pal.bg)
  const [shR, shG, shB] = rgb(pal.shadow)

  // --- displacement field, sampled on a coarse grid --------------------------
  const waves = makeWaves(fr, f.Warp)
  const bent = waves.length > 0
  const gs = Math.max(3, S / 140)
  const gw = Math.ceil(W / gs) + 2
  const gh = Math.ceil(H / gs) + 2
  const gdx = new Float32Array(bent ? gw * gh : 0)
  const gdy = new Float32Array(bent ? gw * gh : 0)
  if (bent) {
    for (let gy = 0; gy < gh; gy++) {
      for (let gx = 0; gx < gw; gx++) {
        const X = gx * gs * invS
        const Y = gy * gs * invS
        let dx = 0
        let dy = 0
        for (const w of waves) {
          const s = Math.sin(w.kx * X + w.ky * Y + w.phase)
          dx += w.ax * s
          dy += w.ay * s
        }
        gdx[gy * gw + gx] = dx
        gdy[gy * gw + gx] = dy
      }
    }
  }
  const rowDx = new Float32Array(gw)
  const rowDy = new Float32Array(gw)

  // --- shading constants ------------------------------------------------------
  const fibrePx = FIBRE * S
  const texAmp = 0.06 * clamp01((fibrePx - 1.5) / 2.5)
  const shadowLen = Math.min(0.32 * p, 0.013)
  const dropX = 0.0032
  const dropY = 0.0052
  const dropSoft = 0.0065
  const cx = Wn / 2
  const cy = Hn / 2
  const vigNorm = 1 / (cx * cx + cy * cy)

  // bounding box of the cloth and its shadow: outside it, only the table
  let uMin = Infinity
  let uMax = -Infinity
  let vMin = Infinity
  let vMax = -Infinity
  for (let j = 0; j < nF; j++) {
    uMin = Math.min(uMin, endL[j])
    uMax = Math.max(uMax, endR[j])
  }
  for (let i = 0; i < nW; i++) {
    vMin = Math.min(vMin, tipTop[i])
    vMax = Math.max(vMax, tipBot[i])
  }
  uMin = Math.min(uMin, u0 - hwW) - 0.02
  uMax = Math.max(uMax, u0 + (nW - 1) * p + hwW) + 0.02
  vMin = Math.min(vMin, v0 - hwF) - 0.02
  vMax = Math.max(vMax, v0 + (nF - 1) * p + hwF) + 0.02

  // One row of pixels. Kept in its own function so the engine optimises it
  // as a whole instead of on-stack-replacing the inner loop row after row.
  const paintRow = (data: Uint8ClampedArray, start: number, py: number) => {
    let o = start
    const Y = (py + 0.5) * invS
    if (bent) {
      const fy = (py + 0.5) / gs
      const iy = Math.floor(fy) | 0
      const ty = fy - iy
      for (let gx = 0; gx < gw; gx++) {
        const a = iy * gw + gx
        rowDx[gx] = gdx[a] + (gdx[a + gw] - gdx[a]) * ty
        rowDy[gx] = gdy[a] + (gdy[a + gw] - gdy[a]) * ty
      }
    }
    for (let px = 0; px < W; px++) {
      const X = (px + 0.5) * invS
      let u = X
      let v = Y
      if (bent) {
        const fx = (px + 0.5) / gs
        const ix = Math.floor(fx) | 0
        const tx = fx - ix
        u += rowDx[ix] + (rowDx[ix + 1] - rowDx[ix]) * tx
        v += rowDy[ix] + (rowDy[ix + 1] - rowDy[ix]) * tx
      }

      if (u < uMin || u > uMax || v < vMin || v > vMax) {
        const ddx = X - cx
        const ddy = Y - cy
        const vig = 1 - pal.vignette * (ddx * ddx + ddy * ddy) * vigNorm
        data[o] = bgR * vig
        data[o + 1] = bgG * vig
        data[o + 2] = bgB * vig
        data[o + 3] = 255
        o += 4
        continue
      }

      const a = (u - u0) * ip
      const i = Math.floor(a + 0.5) | 0
      const du = (a - i) * p
      const b = (v - v0) * ip
      const j = Math.floor(b + 0.5) | 0
      const dv = (b - j) * p

      // ---- warp coverage, with frayed tips
      let cW = 0
      let halfW = hwW
      const warpOk = i >= 0 && i < nW && dropW[i] === 0
      if (warpOk && v > tipTop[i] - invS && v < tipBot[i] + invS) {
        let prog = 0
        let side = 0
        if (frayed) {
          const fl = frayLen[i]
          if (v < clothTop) {
            prog = clamp01((tipTop[i] + fl - v) / fl)
          }
          else if (v > clothBot) {
            prog = clamp01((v - (tipBot[i] - fl)) / fl)
            side = 1
          }
        }
        const spread = 1 + 0.9 * prog * prog
        halfW = hwW * spread
        cW = clamp01((halfW - Math.abs(du)) * S + 0.5)
          * clamp01((v - tipTop[i]) * S + 0.5)
          * clamp01((tipBot[i] - v) * S + 0.5)
        if (prog > 0 && cW > 0) {
          const q = (du / spread + hwW) / FIBRE
          const k = Math.floor(q) | 0
          const fq = q - k
          const reach = frayLen[i] * 0.85 * fibreHash(i, k, side, salt)
          const fromTip = side === 0 ? v - tipTop[i] : tipBot[i] - v
          cW *= clamp01((fromTip - reach) * S + 0.5)
          const gap = (0.5 - Math.abs(fq - 0.5)) - 0.3 * prog
          cW *= clamp01(gap * fibrePx * spread + 0.5)
        }
      }

      // ---- weft coverage
      let cF = 0
      const weftOk = j >= 0 && j < nF && dropF[j] === 0
      if (weftOk && u > endL[j] - invS && u < endR[j] + invS) {
        cF = clamp01((hwF - Math.abs(dv)) * S + 0.5)
          * clamp01((u - endL[j]) * S + 0.5)
          * clamp01((endR[j] - u) * S + 0.5)
      }

      // ---- table, with the vignette and the cloth's drop shadow
      const ddx = X - cx
      const ddy = Y - cy
      const vig = 1 - pal.vignette * (ddx * ddx + ddy * ddy) * vigNorm
      let r = bgR * vig
      let gg = bgG * vig
      let bb = bgB * vig
      if (cW < 1 && cF < 1) {
        const ua = (u - dropX - u0) * ip
        const ui = Math.floor(ua + 0.5) | 0
        const vb = (v - dropY - v0) * ip
        const vj = Math.floor(vb + 0.5) | 0
        let sW = 0
        let sF = 0
        if (ui >= 0 && ui < nW && dropW[ui] === 0) {
          const vv = v - dropY
          sW = clamp01((hwW - Math.abs(ua - ui) * p) / dropSoft + 0.5)
            * clamp01((vv - tipTop[ui] - 0.55 * frayLen[ui]) / dropSoft + 0.5)
            * clamp01((tipBot[ui] - 0.55 * frayLen[ui] - vv) / dropSoft + 0.5)
        }
        if (vj >= 0 && vj < nF && dropF[vj] === 0) {
          const uu = u - dropX
          sF = clamp01((hwF - Math.abs(vb - vj) * p) / dropSoft + 0.5)
            * clamp01((uu - endL[vj]) / dropSoft + 0.5)
            * clamp01((endR[vj] - uu) / dropSoft + 0.5)
        }
        const sh = 0.42 * (1 - (1 - sW) * (1 - sF))
        r += (shR - r) * sh
        gg += (shG - gg) * sh
        bb += (shB - bb) * sh
      }

      if (cW > 0 || cF > 0) {
        // heights along each ribbon: smoothstep between crossings
        let hW = 0
        let slW = 0
        let gW = 1
        if (warpOk) {
          const ja = Math.floor(b) | 0
          if (ja >= -1 && ja < nF) {
            const t = b - ja
            const h0 = hWarp[i * pF + ja + 1]
            const h1 = hWarp[i * pF + ja + 2]
            const sm = t * t * (3 - 2 * t)
            hW = h0 + (h1 - h0) * sm
            slW = (h1 - h0) * 6 * t * (1 - t)
            const g0 = grainW[i * pF + ja + 1]
            gW = g0 + (grainW[i * pF + ja + 2] - g0) * sm
          }
        }
        let hF = 0
        let slF = 0
        let gF = 1
        if (weftOk) {
          const ia = Math.floor(a) | 0
          if (ia >= -1 && ia < nW) {
            const t = a - ia
            const h0 = hWeft[j * pW + ia + 1]
            const h1 = hWeft[j * pW + ia + 2]
            const sm = t * t * (3 - 2 * t)
            hF = h0 + (h1 - h0) * sm
            slF = (h1 - h0) * 6 * t * (1 - t)
            const g0 = grainF[j * pW + ia + 1]
            gF = g0 + (grainF[j * pW + ia + 2] - g0) * sm
          }
        }

        // warp shade: light from the upper left
        let wR = 0
        let wG = 0
        let wB = 0
        if (cW > 0) {
          const rr = du / halfW
          const r4 = rr * rr * rr * rr
          const fq = (du + hwW) / FIBRE
          const tri = Math.abs(fq - Math.floor(fq) - 0.5) * 4 - 1
          let shade = 0.9 + 0.13 * hW + 0.055 * slW - 0.07 * rr - 0.2 * r4 + texAmp * tri
          shade *= gW
          if (weftOk && hF > hW) {
            // shadow of a weft passing above, falling downwards
            const e = Math.abs(dv) - hwF
            if (e > 0) {
              const reach = dv > 0 ? shadowLen : shadowLen * 0.45
              shade *= 1 - 0.32 * (hF - hW) * clamp01(1 - e / reach)
            }
          }
          const hi = shade > 1 ? (shade - 1) * 110 : 0
          wR = warpRGB[i * 3] * shade + hi
          wG = warpRGB[i * 3 + 1] * shade + hi
          wB = warpRGB[i * 3 + 2] * shade + hi
        }
        let fR = 0
        let fG = 0
        let fB = 0
        if (cF > 0) {
          const rr = dv / hwF
          const r4 = rr * rr * rr * rr
          const fq = (dv + hwF) / FIBRE
          const tri = Math.abs(fq - Math.floor(fq) - 0.5) * 4 - 1
          let shade = 0.9 + 0.13 * hF + 0.045 * slF - 0.09 * rr - 0.2 * r4 + texAmp * tri
          shade *= gF
          if (warpOk && hW > hF) {
            // shadow of a warp passing above, falling to the right
            const e = Math.abs(du) - hwW
            if (e > 0) {
              const reach = du > 0 ? shadowLen : shadowLen * 0.45
              shade *= 1 - 0.32 * (hW - hF) * clamp01(1 - e / reach)
            }
          }
          const hi = shade > 1 ? (shade - 1) * 110 : 0
          fR = weftRGB[j * 3] * shade + hi
          fG = weftRGB[j * 3 + 1] * shade + hi
          fB = weftRGB[j * 3 + 2] * shade + hi
        }

        // composite: under ribbon first, then the top one
        const warpTop = cF === 0 || (cW > 0 && hW >= hF)
        if (warpTop) {
          if (cF > 0) {
            r += (fR - r) * cF
            gg += (fG - gg) * cF
            bb += (fB - bb) * cF
          }
          r += (wR - r) * cW
          gg += (wG - gg) * cW
          bb += (wB - bb) * cW
        }
        else {
          if (cW > 0) {
            r += (wR - r) * cW
            gg += (wG - gg) * cW
            bb += (wB - bb) * cW
          }
          r += (fR - r) * cF
          gg += (fG - gg) * cF
          bb += (fB - bb) * cF
        }
      }

      data[o] = r
      data[o + 1] = gg
      data[o + 2] = bb
      data[o + 3] = 255
      o += 4
    }
  }

  const BAND = 64
  for (let y0 = 0; y0 < H; y0 += BAND) {
    const bh = Math.min(BAND, H - y0)
    const img = g.createImageData(W, bh)
    for (let k = 0; k < bh; k++)
      paintRow(img.data, k * W * 4, y0 + k)
    g.putImageData(img, 0, y0)
  }
}

export default {
  slug: 'weave',
  title: 'Weave',
  summary: 'Ribbons woven over and under in plain, twill, basket, satin or loom-drafted structures, with striped warps and wefts that cross into checks and plaids.',
  order: 90,
  traits: TRAITS,
  features,
  render,
  // Seed-of-seeds 0xbeadbead ("gallery" stream): the first hash found for each
  // palette x pattern pair, until twelve pairs are covered; the fourth one
  // (a rippled, banded basket) was moved first as the cover.
  gallery: [
    '0xdcf47e8f29695858987465aa7f07117932290c6e7b7b8e5afbe76ef13174fc0d',
    '0x6c7e9fdff66cdff96cacb006ffd784187f345a5af4047e22494316b579cc644c',
    '0x3382a874277cae39011281870399588856a46215df391f5e7022b4190e9234ca',
    '0xc10a04ea370119b6bab4ae28f13d4387b914264848158e507e05c84cf116238a',
    '0x631934bd8a760bc5ac401025c20f63401542f4263da26b53cb6b9beeb8ba9f2e',
    '0x6606d5e2000941a97ec9cc5e625da45fabb35a8a6b3c6f8e9246c6b945badd3f',
    '0x687b92632d856c4a4a517d9b6656781e2c19a5342798506e8b590228fcafd5f0',
    '0x933bff517ad29a2bc8f7e172197d6e189168a807e7b3e978c2940beaf562e8b2',
    '0xdcc1cc28adb865641616d6a8100e93be3d04789abcc5ed336971f9bc06e1aef0',
    '0x3cbeefcb9f521a374ad232304e61b4b1f3fbb4e7ef3604c1d14446e8b5d94390',
    '0xa50f4b583a059a8e9ecf6e678f7207ee755dae3219b56568343289256804c79e',
    '0xbc5c126c893b29e72476a0c931678f575409fc96efcd951ad57b04dcd2469ace',
  ],
} satisfies Series
