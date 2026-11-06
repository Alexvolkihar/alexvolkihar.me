// "Pelt" — animal coats grown hair by hair.
//
// A skin is laid out along a spine (a close-up of a back, a flank, or a whole
// body curled on itself). A Turing-type activator-inhibitor process runs on
// the skin, in body coordinates, and leaves spots, rosettes, stripes, a
// reticulated net or piebald patches (../pelt/coat.ts). Then tens of
// thousands of short hairs are rooted on a jittered grid and combed along an
// anatomical direction field: away from the parting of the spine, drooping
// down the flanks, swirling around whorls, waved by a little noise. Each hair
// takes the pigment of the skin at its root, tapers, curls a little and
// lightens towards the tip; long coats gather into locks. Hairs are painted by
// a small rasteriser (../pelt/raster.ts), downstream ones first so each hair
// lies over the next like the real thing.
//
// Everything is a pure function of the hash, and every length is a fraction
// of the canvas short side.

import type { Frame } from '../pelt/body'
import type { CoatKind, CoatSample } from '../pelt/coat'
import type { RGB } from '../pelt/util'
import type { Series } from '../types'
import { arcBody, coilBody, newFrame } from '../pelt/body'
import { makeCoat } from '../pelt/coat'
import { allocStrands, drawBand } from '../pelt/raster'
import { clamp01, hash3, mix, rgb, smoothstep, valueNoise } from '../pelt/util'
import { int, range, stream, weighted } from '../random'

// Rarity table, decided before the drawing code. Never reorder: it re-rolls the edition.
const TRAITS = {
  Coat: [['Spots', 22], ['Rosettes', 22], ['Stripes', 22], ['Reticulated', 16], ['Piebald', 18]],
  Palette: [['Tawny', 24], ['Rust', 18], ['Snow', 18], ['Chestnut', 16], ['Melanistic', 14], ['Slate', 10]],
  Framing: [['Spine', 32], ['Flank', 36], ['Curled', 32]],
  Fur: [['Velvet', 22], ['Sleek', 38], ['Plush', 25], ['Shaggy', 15]],
  Whorls: [['None', 40], ['One', 35], ['Several', 25]],
} as const

type TraitName = keyof typeof TRAITS
type Features = { [K in TraitName]: typeof TRAITS[K][number][0] }

function features(hash: string): Features {
  const r = stream(hash, 'features')
  return {
    Coat: weighted(r, TRAITS.Coat),
    Palette: weighted(r, TRAITS.Palette),
    Framing: weighted(r, TRAITS.Framing),
    Fur: weighted(r, TRAITS.Fur),
    Whorls: weighted(r, TRAITS.Whorls),
  }
}

interface Palette {
  /** Page behind a curled body. */
  bg: string
  /** Ground colour of the coat. */
  base: string
  /** Pigmented marks. */
  mark: string
  /** Rosette cores and secondary ground. */
  inner: string
  /** White patches, reticulated lines, belly. */
  pale: string
  /** Tip lightening. */
  tip: string
  /** Shadowed skin under the coat. */
  skin: string
}

// Original palettes. Melanistic and Slate are the dark ones.
const PAL: Record<Features['Palette'], Palette> = {
  Tawny: { bg: '#efe7d8', base: '#c8913f', mark: '#2a1c12', inner: '#a8682a', pale: '#f1e2c4', tip: '#f6dfb0', skin: '#4a2e17' },
  Rust: { bg: '#ece3d6', base: '#d0672a', mark: '#1d1410', inner: '#b2501e', pale: '#f3e9dc', tip: '#f8c896', skin: '#4a1d0c' },
  Snow: { bg: '#e7e9ea', base: '#cfccc4', mark: '#46474b', inner: '#aaa59b', pale: '#f6f5f1', tip: '#ffffff', skin: '#5e5c58' },
  Chestnut: { bg: '#f0e9df', base: '#e9d7b4', mark: '#7a3c19', inner: '#a9683c', pale: '#fbf5ea', tip: '#fff4de', skin: '#6a4a2c' },
  Melanistic: { bg: '#111013', base: '#3b3029', mark: '#0d0a09', inner: '#2a221d', pale: '#5a4c41', tip: '#a08b79', skin: '#070605' },
  Slate: { bg: '#15181e', base: '#8893a1', mark: '#1e232e', inner: '#5b6573', pale: '#c6ccd5', tip: '#e6ebf1', skin: '#232831' },
}

interface Fur {
  /** Hair length. */
  len: number
  /** Segments per hair. */
  seg: number
  /** Root width. */
  width: number
  /** Hairs per unit area. */
  density: number
  /** Combing noise, radians. */
  wave: number
  /** Total bend along one hair, radians. */
  curl: number
  /** Pull of the hair tips towards the centre of their lock. */
  clump: number
  /** Tip lightening. */
  tip: number
}

const FUR: Record<Features['Fur'], Fur> = {
  Velvet: { len: 0.011, seg: 3, width: 0.0016, density: 80000, wave: 0.16, curl: 0.15, clump: 0, tip: 0.3 },
  Sleek: { len: 0.02, seg: 4, width: 0.0015, density: 52000, wave: 0.22, curl: 0.3, clump: 0.18, tip: 0.38 },
  Plush: { len: 0.03, seg: 5, width: 0.0016, density: 38000, wave: 0.38, curl: 0.75, clump: 0.42, tip: 0.48 },
  Shaggy: { len: 0.047, seg: 7, width: 0.0017, density: 26000, wave: 0.55, curl: 1.4, clump: 0.6, tip: 0.55 },
}

// Light from the top left, above the page (unit vector).
const LX = -0.45
const LY = -0.6
const LZ = 0.66

interface Whorl { x: number, y: number, rho: number, spin: number }

function render(ctx: CanvasRenderingContext2D, W: number, H: number, hash: string) {
  const f = features(hash)
  const pal = PAL[f.Palette]
  const fur = FUR[f.Fur]
  const S = Math.min(W, H)
  const EX = W / S / 2
  const EY = H / S / 2

  // Fixed stream order: body, comb, coat, strands.
  const br = stream(hash, 'body')
  const cr = stream(hash, 'comb')
  const pr = stream(hash, 'coat')
  const sr = stream(hash, 'strands')

  const coil = f.Framing === 'Curled'
  const body = coil
    ? coilBody(br, fur.len * 1.1)
    : arcBody(br, f.Framing === 'Flank', EX, EY, fur.len * 1.5)

  // --- combing field --------------------------------------------------------
  const slant = range(cr, 0.18, 0.4)
  const droop = range(cr, 0.7, 1.1)
  const noise = valueNoise(hash3(int(cr, 0, 1 << 30), 1, 2))
  const nfq = range(cr, 3.5, 6)
  const relief = valueNoise(hash3(int(cr, 0, 1 << 30), 3, 4))
  const nWhorls = f.Whorls === 'None' ? 0 : f.Whorls === 'One' ? 1 : int(cr, 2, 3)
  const whorls: Whorl[] = []
  for (let i = 0; i < nWhorls; i++) {
    let x: number
    let y: number
    let rho: number
    if (coil) {
      const L = body.u1 - body.u0
      ;[x, y] = body.point(body.u0 + L * range(cr, 0.2, 0.55), range(cr, -0.3, 0.3) * body.halfWidth(body.u0 + L * 0.4))
      rho = range(cr, 0.05, 0.085)
    }
    else {
      x = range(cr, -0.36, 0.36)
      y = range(cr, -0.36, 0.36)
      rho = range(cr, 0.09, 0.19)
    }
    const spin = (cr() < 0.5 ? 1 : -1) * range(cr, 0.75, 1.3)
    whorls.push({ x, y, rho, spin })
  }

  const fr = newFrame()
  /** Combing direction at a canvas-local point; also fills `fr`. */
  const comb = (x: number, y: number): number => {
    body.map(x, y, fr)
    const sv = fr.v / (Math.abs(fr.v) + 0.006)
    const a = sv * (slant + droop * Math.min(1, Math.abs(fr.v) / fr.h))
    const ca = Math.cos(a)
    const sa = Math.sin(a)
    let ang = Math.atan2(ca * fr.ty + sa * fr.ny, ca * fr.tx + sa * fr.nx)
    ang += fur.wave * (noise(x * nfq + 17.3, y * nfq - 4.1) * 2 - 1) * 1.6
    if (nWhorls) {
      let vx = 0
      let vy = 0
      let wsum = 0
      for (const w of whorls) {
        const dx = x - w.x
        const dy = y - w.y
        const ww = Math.exp(-(dx * dx + dy * dy) / (w.rho * w.rho))
        if (ww < 1e-3)
          continue
        const wa = Math.atan2(dy, dx) + w.spin
        vx += ww * Math.cos(wa)
        vy += ww * Math.sin(wa)
        wsum += ww
      }
      if (wsum > 0) {
        const keep = 1 - Math.min(1, wsum)
        ang = Math.atan2(vy + keep * Math.sin(ang), vx + keep * Math.cos(ang))
      }
    }
    return ang
  }

  // --- coat pattern -----------------------------------------------------------
  const coatSeed = int(pr, 0, 2 ** 31)
  const scale = (coil ? 0.6 : 1) * (1 + 3 * fur.len)
  const coat = makeCoat(f.Coat as CoatKind, body, coatSeed, scale)
  const cs: CoatSample = { mark: 0, inner: 0, pale: 0, tone: 0 }

  const P = {
    base: rgb(pal.base),
    mark: rgb(pal.mark),
    inner: rgb(pal.inner),
    pale: rgb(pal.pale),
    tip: rgb(pal.tip),
    skin: rgb(pal.skin),
    bg: rgb(pal.bg),
  }
  const flank = f.Framing === 'Flank'

  /** Hair colour at the root (frame already filled), before per-hair jitter. */
  const hairColour = (out: RGB, fr: Frame) => {
    coat(fr.u, fr.v, cs)
    let pale = cs.pale
    if (flank)
      pale = Math.max(pale, 0.7 * smoothstep(1.15, 1.5, fr.v))
    for (let c = 0; c < 3; c++) {
      let x = P.base[c]
      x = mix(x, P.inner[c], cs.inner)
      x = mix(x, P.mark[c], cs.mark)
      x = mix(x, P.pale[c], pale)
      out[c] = x * (1 + 0.14 * cs.tone)
    }
    return cs.mark
  }

  /** Body shading: a cylinder lit from the top left. */
  const bodyShade = (fr: Frame) => {
    const q = clamp01(Math.abs(fr.v) / fr.h)
    if (coil) {
      const nz = Math.sqrt(1 - q * q)
      const side = (fr.v >= 0 ? 1 : -1) * q
      return 0.55 + 0.4 * nz + 0.18 * side * (fr.nx * LX + fr.ny * LY)
    }
    return (1 - 0.22 * q * q) * (0.9 + 0.2 * relief(fr.u * 1.7, fr.v * 1.7))
  }

  // --- strands ------------------------------------------------------------------
  const sseed = int(sr, 0, 2 ** 31)
  const clumpSeed = int(sr, 0, 2 ** 31)
  const cell = 1 / Math.sqrt(fur.density)
  const margin = fur.len * 1.3
  const X0 = coil ? -0.5 : -EX - margin
  const X1 = coil ? 0.5 : EX + margin
  const Y0 = coil ? -0.5 : -EY - margin
  const Y1 = coil ? 0.5 : EY + margin
  const gi0 = Math.floor(X0 / cell)
  const gi1 = Math.ceil(X1 / cell)
  const gj0 = Math.floor(Y0 / cell)
  const gj1 = Math.ceil(Y1 / cell)
  const maxN = (gi1 - gi0 + 1) * (gj1 - gj0 + 1)
  const np = fur.seg + 1
  const st = allocStrands(maxN, np)
  const keys = new Float32Array(maxN)
  const clumpCell = fur.len * 0.75

  // The combing field is sampled once on a fine grid; hairs read it bilinearly.
  const dc = 0.007
  const dm = fur.len * 1.6
  const di0 = Math.floor((X0 - dm) / dc)
  const dj0 = Math.floor((Y0 - dm) / dc)
  const dnx = Math.ceil((X1 + dm) / dc) + 2 - di0
  const dny = Math.ceil((Y1 + dm) / dc) + 2 - dj0
  const dvx = new Float32Array(dnx * dny)
  const dvy = new Float32Array(dnx * dny)
  for (let j = 0; j < dny; j++) {
    for (let i = 0; i < dnx; i++) {
      const a = comb((di0 + i) * dc, (dj0 + j) * dc)
      dvx[j * dnx + i] = Math.cos(a)
      dvy[j * dnx + i] = Math.sin(a)
    }
  }
  let qx = 1
  let qy = 0
  const dirAt = (x: number, y: number) => {
    let gx = x / dc - di0
    let gy = y / dc - dj0
    gx = gx < 0 ? 0 : gx > dnx - 1.001 ? dnx - 1.001 : gx
    gy = gy < 0 ? 0 : gy > dny - 1.001 ? dny - 1.001 : gy
    const i = gx | 0
    const j = gy | 0
    const fx = gx - i
    const fy = gy - j
    const k = j * dnx + i
    const ax = dvx[k] + (dvx[k + 1] - dvx[k]) * fx
    const bx = dvx[k + dnx] + (dvx[k + dnx + 1] - dvx[k + dnx]) * fx
    const ay = dvy[k] + (dvy[k + 1] - dvy[k]) * fx
    const by = dvy[k + dnx] + (dvy[k + dnx + 1] - dvy[k + dnx]) * fx
    const vx = ax + (bx - ax) * fy
    const vy = ay + (by - ay) * fy
    const l = Math.sqrt(vx * vx + vy * vy) || 1
    qx = vx / l
    qy = vy / l
  }

  const col: RGB = [0, 0, 0]
  let n = 0
  for (let j = gj0; j <= gj1; j++) {
    for (let i = gi0; i <= gi1; i++) {
      // two hashes give every draw of this hair (16 or 8 bits each)
      const h1 = hash3(i, j, sseed)
      const h2 = hash3(i, j, sseed + 1)
      const x = (i + (h1 & 0xFFFF) / 65536) * cell
      const y = (j + (h1 >>> 16) / 65536) * cell
      body.map(x, y, fr)
      if (coil && fr.inside < 1 && fr.inside <= (h2 & 255) / 256)
        continue
      const mark = hairColour(col, fr)
      const shade = bodyShade(fr)
      const guard = ((h2 >>> 8) & 255) < 9
      const lenK = (guard ? 1.45 : 0.65 + 0.7 * ((h2 >>> 16) & 255) / 256) * fur.len
      const step = lenK / fur.seg
      const bend = fur.curl * ((h2 >>> 24) / 128 - 1) / fur.seg
      const cb = Math.cos(bend)
      const sb = Math.sin(bend)
      // lock (clump) centre: nearest jittered point of a coarser grid
      let cx = x
      let cy = y
      if (fur.clump > 0) {
        const ci = Math.floor(x / clumpCell)
        const cj = Math.floor(y / clumpCell)
        let best = Infinity
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            const hc = hash3(ci + di, cj + dj, clumpSeed)
            const px = (ci + di + (hc & 0xFFFF) / 65536) * clumpCell
            const py = (cj + dj + (hc >>> 16) / 65536) * clumpCell
            const d = (px - x) ** 2 + (py - y) ** 2
            if (d < best) {
              best = d
              cx = px
              cy = py
            }
          }
        }
      }
      const pullX = (cx - x) * fur.clump
      const pullY = (cy - y) * fur.clump
      // grow the hair
      const p = n * np * 2
      let hx = x
      let hy = y
      let ymin = Infinity
      let ymax = -Infinity
      dirAt(x, y)
      const tx = qx
      const ty = qy
      let ux = qx
      let uy = qy
      let rc = 1
      let rs = 0
      for (let k = 0; k <= fur.seg; k++) {
        const t = k / fur.seg
        const px = (hx + pullX * t * t + EX) * S
        const py = (hy + pullY * t * t + EY) * S
        st.pts[p + k * 2] = px
        st.pts[p + k * 2 + 1] = py
        if (py < ymin)
          ymin = py
        if (py > ymax)
          ymax = py
        if (k === fur.seg)
          break
        hx += ux * step
        hy += uy * step
        // the next heading: the field there, turned by the hair's own curl
        dirAt(hx, hy)
        const nc = rc * cb - rs * sb
        rs = rs * cb + rc * sb
        rc = nc
        ux = qx * rc - qy * rs
        uy = qx * rs + qy * rc
      }
      // sheen: a hair is brightest when it lies across the light (Kajiya & Kay)
      const tl = (tx * LX + ty * LY + 0.35 * LZ) / Math.hypot(1, 0.35)
      const kk = Math.sqrt(Math.max(0, 1 - tl * tl))
      const h3 = hash3(i, j, sseed + 2)
      const jit = 1 + ((h3 & 255) / 256 - 0.5) * 0.24
      const lum = shade * (0.78 + 0.3 * kk) * jit
      const tipAmt = (guard ? 0.75 : fur.tip * (0.6 + 0.8 * ((h3 >>> 8) & 255) / 256)) * (1 - 0.55 * mark)
      const c6 = n * 6
      const spec = 0.24 * kk ** 8
      for (let c = 0; c < 3; c++) {
        const h = Math.min(255, mix(col[c] * lum, P.tip[c], spec))
        st.col[c6 + c] = h
        st.col[c6 + 3 + c] = Math.min(255, mix(h, P.tip[c] * Math.min(1.1, lum), tipAmt))
      }
      const w = fur.width * S * (guard ? 0.8 : 0.85 + 0.3 * ((h3 >>> 16) & 255) / 256)
      st.wa[n * 2] = Math.max(w, 0.35)
      st.wa[n * 2 + 1] = Math.min(1, 0.92 * (w < 0.35 ? w / 0.35 : 1))
      st.ys[n * 2] = ymin - w - 1
      st.ys[n * 2 + 1] = ymax + w + 1
      // downstream hairs first: the key grows against the combing direction
      keys[n] = -(x * tx + y * ty)
      n++
    }
  }
  st.n = n
  // counting sort of the keys
  {
    let lo = Infinity
    let hi = -Infinity
    for (let k = 0; k < n; k++) {
      lo = Math.min(lo, keys[k])
      hi = Math.max(hi, keys[k])
    }
    const B = 4096
    const cnt = new Uint32Array(B + 1)
    const span = Math.max(hi - lo, 1e-9)
    const bin = new Uint16Array(n)
    for (let k = 0; k < n; k++) {
      bin[k] = Math.min(B - 1, ((keys[k] - lo) / span * B) | 0)
      cnt[bin[k] + 1]++
    }
    for (let b = 0; b < B; b++)
      cnt[b + 1] += cnt[b]
    for (let k = 0; k < n; k++)
      st.order[cnt[bin[k]]++] = k
  }

  // --- undercoat: shadowed skin on a coarse grid ------------------------------
  const uc = 0.008
  const ui0 = Math.floor(-EX / uc) - 1
  const uj0 = Math.floor(-EY / uc) - 1
  const unx = Math.ceil(EX / uc) + 2 - ui0
  const uny = Math.ceil(EY / uc) + 2 - uj0
  const under = new Float32Array(unx * uny * 3)
  const ufr = newFrame()
  // body silhouette on the coarse grid, and its cast shadow (a blurred copy,
  // offset away from the light)
  const ins = new Float32Array(unx * uny)
  if (coil) {
    for (let j = 0; j < uny; j++) {
      for (let i = 0; i < unx; i++) {
        body.map((ui0 + i) * uc, (uj0 + j) * uc, ufr)
        ins[j * unx + i] = clamp01((1 - Math.abs(ufr.v) / ufr.h) * 3) * (ufr.h > 0.005 ? 1 : 0)
      }
    }
  }
  // Cast shadow (offset away from the light) and ambient occlusion (darker
  // creases between the coils): two blurred copies of the silhouette.
  const blurGrid = (src: Float32Array, R: number) => {
    const a = Float32Array.from(src)
    const b = new Float32Array(src.length)
    for (let pass = 0; pass < 4; pass++) {
      const from = pass % 2 ? b : a
      const to = pass % 2 ? a : b
      const alongX = pass < 2
      for (let j = 0; j < uny; j++) {
        for (let i = 0; i < unx; i++) {
          let acc = 0
          for (let d = -R; d <= R; d++) {
            const ii = alongX ? i + d : i
            const jj = alongX ? j : j + d
            if (ii >= 0 && ii < unx && jj >= 0 && jj < uny)
              acc += from[jj * unx + ii]
          }
          to[j * unx + i] = acc / (2 * R + 1)
        }
      }
    }
    return a
  }
  let shadow = ins
  let occl = ins
  if (coil) {
    const shifted = new Float32Array(unx * uny)
    for (let j = 3; j < uny; j++) {
      for (let i = 2; i < unx; i++)
        shifted[j * unx + i] = ins[(j - 3) * unx + i - 2]
    }
    shadow = blurGrid(shifted, 3)
    occl = blurGrid(ins, 2)
  }
  for (let j = 0; j < uny; j++) {
    for (let i = 0; i < unx; i++) {
      const x = (ui0 + i) * uc
      const y = (uj0 + j) * uc
      const k = (j * unx + i) * 3
      const inside = coil ? ins[j * unx + i] : 1
      if (coil) {
        const sh = (1 - 0.28 * shadow[j * unx + i]) * (1 - 0.45 * occl[j * unx + i] * occl[j * unx + i])
        for (let c = 0; c < 3; c++)
          under[k + c] = P.bg[c] * sh
        if (inside <= 0)
          continue
      }
      body.map(x, y, ufr)
      hairColour(col, ufr)
      const shade = bodyShade(ufr) * 0.62
      for (let c = 0; c < 3; c++) {
        const u = mix(P.skin[c], col[c] * shade, 0.7)
        under[k + c] = coil ? mix(under[k + c], u, inside) : u
      }
    }
  }

  // --- paint, band by band ------------------------------------------------------
  const bandH = Math.max(1, Math.min(H, Math.floor(4_000_000 / W)))
  for (let y0 = 0; y0 < H; y0 += bandH) {
    const bh = Math.min(bandH, H - y0)
    const img = ctx.createImageData(W, bh)
    const px = img.data
    for (let yy = 0; yy < bh; yy++) {
      const gy = ((y0 + yy + 0.5) / S - EY) / uc - uj0
      const j = Math.min(uny - 2, Math.max(0, Math.floor(gy)))
      const fy = Math.min(1, Math.max(0, gy - j))
      let o = yy * W * 4
      for (let xx = 0; xx < W; xx++) {
        const gx = ((xx + 0.5) / S - EX) / uc - ui0
        const i = Math.min(unx - 2, Math.max(0, Math.floor(gx)))
        const fx = Math.min(1, Math.max(0, gx - i))
        const k = (j * unx + i) * 3
        const k2 = k + unx * 3
        for (let c = 0; c < 3; c++) {
          const a = under[k + c] + (under[k + 3 + c] - under[k + c]) * fx
          const b = under[k2 + c] + (under[k2 + 3 + c] - under[k2 + c]) * fx
          px[o + c] = a + (b - a) * fy
        }
        px[o + 3] = 255
        o += 4
      }
    }
    drawBand(px, W, y0, bh, st, 0.68)
    ctx.putImageData(img, 0, y0)
  }
}

export default {
  slug: 'pelt',
  title: 'Pelt',
  summary: 'Animal coats grown hair by hair: a Turing pattern on the skin colours tens of thousands of strands combed around partings and whorls.',
  order: 250,
  traits: TRAITS,
  features,
  render,
  gallery: [
    '0xfc808a0890ce7ae42d0c2a1334e5a686062e6afb8eeb1e3610d57ddebe458e70',
    '0xd4b2f620bc08e1de5cb1e58c93b3faeb2ff5ebdeb905ae50a7dae5be5f1e2b23',
    '0x71830af43c2401193624a5d3336da41e19bbabd4e7de8f6a6898083e863f5b86',
    '0xd2b7e93eab82dbddf36d0113ca9e74ca931ac7b3716ce63bd1d5c7b9a97731f8',
    '0x629db2d5873d23ce1868f9f1811da00f9943be217b32f8c310bb8f45985b6995',
    '0x77fa835bbbc6aeec27db3c70a71000fc3be732b102c4987804cbc2819b772dc3',
    '0x566b0b6b2ce9bf52b3d0feae140c1b3c2787689c845ed9372b34bd8c92f7e4a0',
    '0x48ad0eab653a5c87b3f5f772089f5f2b4de2bd3cbf01e78ba5dc58dc620012bb',
    '0xe5a46f3f09295971a41bc6e7636b5bfcd0196a36c2660d73cd1ec8084a93a3b6',
    '0xe9d850132fc1c3f46ec048641768b598c423d2b218ae3b446e2aa6cec7af98bb',
    '0xf6bfc225803cfa69dac14b7acb8b45483d4fd0dbd4c9825190a8a980da43f298',
    '0x6f63e1d88697b2a14f81554c0e38ad204987a9f51f7f7410a07ba281c128ef27',
  ],
} satisfies Series
