// "Quilt" — patchwork quilts laid out on a wooden floor.
//
// Each hash pieces a quilt top from one of the classic block grammars of
// American patchwork (log cabin, nine-patch, flying geese, half-square
// triangles, Ohio star, drunkard's path, or a sampler of all of them; see
// ../quilt/blocks.ts), sets the blocks with sashing and cornerstones, edge to
// edge, or round a central medallion with a sawtooth frame, and adds an inner
// border, an outer border and a binding. The fabrics are procedural prints
// (calico florets, shirtings, pin dots, gingham, stripes, tone-on-tone; see
// ../quilt/fabric.ts), each patch cut from its own place in the print. The
// quilting is drawn last: every quilted line is a shallow valley lit from the
// upper left, with a running stitch on top, so the cloth puffs between lines.
//
// Everything is a pure function of the hash, and every length is a fraction of
// the canvas short side. On a non-square canvas the quilt simply gets more
// blocks along the long side.

import type { Patch, Role, Variants } from '../quilt/blocks'
import type { Fabric, FabricKind, FabricSpec } from '../quilt/fabric'
import type { Rng } from '../random'
import type { Series } from '../types'
import { arcSteps, block, BLOCK_TYPES, blockVariants, isDirectional, rotate } from '../quilt/blocks'
import { contrastTone, css, hex, mix, shade } from '../quilt/color'
import { fabricSpec, ginghamGround, realise, useFabric } from '../quilt/fabric'
import { chance, fnv1a, int, pick, range, stream, weighted } from '../random'

// ---------------------------------------------------------------------------
// Rarity table — decided before the drawing code, never reordered.
// ---------------------------------------------------------------------------

const TRAITS = {
  Palette: [['Homespun', 26], ['Feedsack', 20], ['Indigo', 18], ['Harvest', 18], ['Jewel', 18]],
  Block: [['Log Cabin', 17], ['Nine-Patch', 15], ['Flying Geese', 15], ['Half-Square Triangles', 17], ['Ohio Star', 15], ['Drunkard\'s Path', 13], ['Sampler', 8]],
  Setting: [['Sashed', 40], ['Edge to Edge', 36], ['Medallion', 24]],
  Fabric: [['Solids', 22], ['Calico', 34], ['Scrappy', 44]],
  Quilting: [['In the Ditch', 26], ['Echo', 26], ['Crosshatch', 26], ['Baptist Fan', 22]],
} as const

type TraitName = keyof typeof TRAITS
type Features = { [K in TraitName]: typeof TRAITS[K][number][0] }

function features(hash: string): Features {
  const r = stream(hash, 'features')
  return {
    Palette: weighted(r, TRAITS.Palette),
    Block: weighted(r, TRAITS.Block),
    Setting: weighted(r, TRAITS.Setting),
    Fabric: weighted(r, TRAITS.Fabric),
    Quilting: weighted(r, TRAITS.Quilting),
  }
}

// ---------------------------------------------------------------------------
// Palettes
// ---------------------------------------------------------------------------

interface Palette {
  /** Two floorboard tones. */
  floor: readonly [string, string]
  /** Background fabrics (light, except on the dark Jewel palette). */
  lights: readonly [string, string]
  colours: readonly string[]
  accent: string
  dark: string
  thread: string
}

const PAL: Record<Features['Palette'], Palette> = {
  Homespun: {
    floor: ['#7d5c40', '#694b33'],
    lights: ['#efe5cf', '#e3d4b4'],
    colours: ['#a8322d', '#2e4068', '#c4952f', '#56794a', '#7d4f34', '#8a5a7a'],
    accent: '#c43a2f',
    dark: '#1f2a44',
    thread: '#f6efdc',
  },
  Feedsack: {
    floor: ['#b8b1a2', '#a59e8f'],
    lights: ['#f8f4ea', '#eaf0e4'],
    colours: ['#e98d97', '#6fb0c4', '#e8c95c', '#8fc283', '#ab92cf', '#f09a5a'],
    accent: '#d9534f',
    dark: '#3d6f8e',
    thread: '#ffffff',
  },
  Indigo: {
    floor: ['#3b3733', '#2e2b28'],
    lights: ['#f3f1ea', '#e2e7ee'],
    colours: ['#1d3461', '#34588e', '#5f86b8', '#8fb0d6', '#26467a'],
    accent: '#b65a32',
    dark: '#142443',
    thread: '#f6f4ee',
  },
  Harvest: {
    floor: ['#5d4331', '#4b3527'],
    lights: ['#ecdcba', '#dfcba2'],
    colours: ['#a4482b', '#6e6a2c', '#5c2b3d', '#c28a2b', '#7a5232', '#3f5a4a'],
    accent: '#d6a23a',
    dark: '#33231a',
    thread: '#f1e5c8',
  },
  // Dark grounds and saturated solids, after the Amish quilts of Lancaster County.
  Jewel: {
    floor: ['#2b2421', '#221c19'],
    lights: ['#1d1c27', '#27243a'],
    colours: ['#6b2f80', '#23706b', '#a12c3d', '#3651a3', '#c46f2b', '#2f7040'],
    accent: '#d9a43c',
    dark: '#0f0e14',
    thread: '#a79fbf',
  },
}

// ---------------------------------------------------------------------------
// Hash-only helpers
// ---------------------------------------------------------------------------

/**
 * A number in [0, 1) for one cell of the layout. Cells further along the long
 * side only exist on wide canvases, so they must not consume a shared stream:
 * each one gets its own value, mixed from the piece seed and its indices.
 */
function cellRand(seed: number, a: number, b: number, c = 0): number {
  let h = (seed ^ Math.imul(a + 1013, 0x27D4EB2D) ^ Math.imul(b + 7919, 0x165667B1) ^ Math.imul(c + 31, 0x9E3779B1)) >>> 0
  h = Math.imul(h ^ (h >>> 15), 0x85EBCA6B)
  h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

const PRINT_KINDS = [['calico', 34], ['blender', 22], ['dots', 14], ['gingham', 12], ['stripe', 8], ['solid', 10]] as const
const LIGHT_KINDS = [['shirting', 50], ['solid', 20], ['dots', 15], ['gingham', 15]] as const

/** A print on a colour: the inks are tones of it, sometimes another palette colour. */
function printOn(r: Rng, kind: FabricKind, colour: string, pal: Palette): FabricSpec {
  const c = hex(colour)
  const other = hex(pick(r, pal.colours))
  const useOther = chance(r, 0.4)
  if (kind === 'gingham')
    return fabricSpec(r, kind, ginghamGround(c), c, c)
  if (kind === 'dots')
    return fabricSpec(r, kind, c, contrastTone(c, 0.55), c)
  if (kind === 'stripe')
    return fabricSpec(r, kind, c, contrastTone(c, 0.3), contrastTone(c, 0.6))
  if (kind === 'blender')
    return fabricSpec(r, kind, c, contrastTone(c, 0.18), c)
  const ink = useOther ? mix(other, contrastTone(c, 0.5), 0.3) : contrastTone(c, 0.42)
  return fabricSpec(r, kind, c, ink, contrastTone(c, 0.22))
}

/** A background fabric: the ground with sparse marks in a muted palette colour. */
function lightOn(r: Rng, kind: FabricKind, ground: string, pal: Palette): FabricSpec {
  const c = hex(ground)
  const tint = hex(pick(r, pal.colours))
  if (kind === 'gingham')
    return fabricSpec(r, kind, mix(c, tint, 0.08), mix(c, tint, 0.45), tint)
  return fabricSpec(r, kind, c, mix(c, tint, 0.5), mix(c, tint, 0.3))
}

type Roles = Record<Role, Fabric>

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

interface Piece {
  p: number[]
  fab: Fabric
  ox: number
  oy: number
}

function render(g: CanvasRenderingContext2D, W: number, H: number, hash: string) {
  const f = features(hash)
  const pal = PAL[f.Palette]
  const S = Math.min(W, H)
  const dark = f.Palette === 'Jewel'

  // fixed stream order: layout, blocks, fabrics, quilting, floor
  const L = stream(hash, 'layout')
  const B = stream(hash, 'blocks')
  const F = stream(hash, 'fabrics')
  const Q = stream(hash, 'quilting')
  const seed = fnv1a(hash) ^ Math.floor(L() * 4294967296)

  // ---- layout decisions (fixed number of draws) ---------------------------
  const nBySetting = { 'Sashed': [3, 4, 4, 5], 'Edge to Edge': [4, 5, 5, 6], 'Medallion': [5, 5, 6, 6] } as const
  const n = pick(L, nBySetting[f.Setting])
  const sashDraw = range(L, 0.14, 0.24)
  const sashRatio = f.Setting === 'Sashed' ? sashDraw : 0
  const cornerstones = chance(L, 0.75)
  const sashRole: Role = chance(L, 0.55) ? 'bg2' : 'd'
  const borderFrac = range(L, 0.034, 0.058)
  const innerBorder = chance(L, 0.7)
  const borderRole: Role = chance(L, 0.5) ? 'a' : 'd'
  const arrangement = weighted(L, [['same', 18], ['barn', 26], ['furrow', 22], ['lightdark', 22], ['random', 12]] as const)
  const alternatePlain = chance(L, 0.45)
  const medallionType = pick(L, ['Ohio Star', 'Log Cabin', 'Half-Square Triangles'] as const)
  const sawtoothRole: Role = chance(L, 0.5) ? 'a' : 'b'
  const waves = Array.from({ length: 4 }, () => [L(), L(), range(L, 0.25, 0.6), L()])

  const variants: Variants = blockVariants(B)

  // ---- fabrics (fixed order) ----------------------------------------------
  const lightKinds: FabricKind[] = [weighted(F, LIGHT_KINDS), weighted(F, LIGHT_KINDS)]
  const cols = pal.colours.slice()
  for (let i = cols.length - 1; i > 0; i--) {
    const j = Math.floor(F() * (i + 1));
    [cols[i], cols[j]] = [cols[j], cols[i]]
  }
  const solids = f.Fabric === 'Solids'
  const kindFor = (r: Rng): FabricKind => {
    const k = weighted(r, PRINT_KINDS)
    return solids ? 'solid' : k
  }
  const lightFor = (i: number): FabricKind => (solids ? 'solid' : lightKinds[i])
  const specs: Record<Role, FabricSpec> = {
    bg: lightOn(F, lightFor(0), pal.lights[0], pal),
    bg2: lightOn(F, lightFor(1), pal.lights[1], pal),
    a: printOn(F, kindFor(F), cols[0], pal),
    b: printOn(F, kindFor(F), cols[1], pal),
    c: printOn(F, kindFor(F), pal.accent, pal),
    d: printOn(F, kindFor(F), pal.dark, pal),
  }
  // scrap pool: every palette colour in two prints, plus a few backgrounds
  const pool: FabricSpec[] = []
  // first every colour in one print, then every colour in a second one
  for (let v = 0; v < 2; v++) {
    for (const c of cols)
      pool.push(printOn(F, kindFor(F), c, pal))
  }
  const lightPool: FabricSpec[] = [specs.bg2, lightOn(F, lightFor(0), pal.lights[1], pal), lightOn(F, lightFor(1), pal.lights[0], pal)]

  const fabOf = new Map<FabricSpec, Fabric>()
  const real = (s: FabricSpec): Fabric => {
    let fab = fabOf.get(s)
    if (!fab) {
      fab = realise(g, s, S)
      fabOf.set(s, fab)
    }
    return fab
  }
  const baseRoles = Object.fromEntries((Object.keys(specs) as Role[]).map(k => [k, real(specs[k])])) as Roles
  const varyColours = f.Fabric !== 'Calico'

  /** Fabrics for one block: fixed for Calico, shifting for Solids and Scrappy. */
  const rolesFor = (i: number, j: number): Roles => {
    if (!varyColours)
      return baseRoles
    const half = cols.length
    const ia = Math.floor(cellRand(seed, i, j, 1) * cols.length)
    let ib = Math.floor(cellRand(seed, i, j, 2) * (cols.length - 1))
    if (ib >= ia)
      ib++
    const va = cellRand(seed, i, j, 3) < 0.5 ? 0 : half
    const vb = cellRand(seed, i, j, 4) < 0.5 ? 0 : half
    let fa = pool[va + ia]
    let fb = pool[vb + ib]
    if (solids) {
      fa = pool[ia]
      fb = pool[ib]
    }
    return {
      ...baseRoles,
      bg2: real(lightPool[Math.floor(cellRand(seed, i, j, 5) * lightPool.length)]),
      a: real(fa),
      b: real(fb),
    }
  }

  // ---- geometry ----------------------------------------------------------
  const margin = 0.06 * S
  const bind = 0.009 * S
  const border = borderFrac * S
  const inner = innerBorder ? 0.011 * S : 0
  const frame = bind + border + inner
  const short = S - 2 * margin - 2 * frame
  const b = short / (n + (n + 1) * sashRatio)
  const s = b * sashRatio
  const longAvail = Math.max(W, H) - 2 * margin - 2 * frame
  let m = Math.max(n, Math.floor((longAvail - s) / (b + s) + 1e-6))
  if (f.Setting === 'Medallion' && (m - n) % 2)
    m--
  const nc = W >= H ? m : n
  const nr = W >= H ? n : m
  const iw = nc * b + (nc + 1) * s
  const ih = nr * b + (nr + 1) * s
  const ix = (W - iw) / 2
  const iy = (H - ih) / 2
  const qx = ix - frame
  const qy = iy - frame
  const qw = iw + 2 * frame
  const qh = ih + 2 * frame

  // ---- floor -------------------------------------------------------------
  drawFloor(g, W, H, S, pal, seed)

  // shadow of the quilt on the floor
  for (let k = 6; k >= 1; k--) {
    const e = k * 0.004 * S
    g.fillStyle = `rgba(0,0,0,${0.05})`
    g.fillRect(qx - e + 0.006 * S, qy - e + 0.012 * S, qw + 2 * e, qh + 2 * e)
  }

  // ---- piecing -----------------------------------------------------------
  const seams = new Path2D()
  const echo = new Path2D()
  const echoOn = f.Quilting === 'Echo'
  const echoD = 0.055 * Math.min(b, 0.16 * S)
  let cut = 0

  const lay = (p: number[], fab: Fabric) => {
    const piece: Piece = { p, fab, ox: cellRand(seed, cut, 7, 9), oy: cellRand(seed, cut, 8, 9) }
    cut++
    fillPiece(g, piece)
    tracePoly(seams, p)
    if (echoOn)
      echoPoly(echo, p, echoD)
  }
  const layRect = (x: number, y: number, w: number, h: number, fab: Fabric, echoIt = true) => {
    const p = [x, y, x + w, y, x + w, y + h, x, y + h]
    if (echoIt) {
      lay(p, fab)
      return
    }
    const piece: Piece = { p, fab, ox: cellRand(seed, cut, 7, 9), oy: cellRand(seed, cut, 8, 9) }
    cut++
    fillPiece(g, piece)
    tracePoly(seams, p)
  }
  const layBlock = (patches: Patch[], x: number, y: number, size: number, rot: number, roles: Roles) => {
    for (const pt of patches) {
      const q = rotate(pt, rot)
      lay(q.p.map((v, k) => (k % 2 ? y : x) + v * size), roles[q.role])
    }
  }

  // binding, borders
  layRect(qx, qy, qw, qh, baseRoles.d, false)
  const bx = qx + bind
  const by = qy + bind
  const bw = qw - 2 * bind
  const bh = qh - 2 * bind
  const bf = baseRoles[borderRole]
  layRect(bx, by, bw, border, bf, false)
  layRect(bx, by + bh - border, bw, border, bf, false)
  layRect(bx, by + border, border, bh - 2 * border, bf, false)
  layRect(bx + bw - border, by + border, border, bh - 2 * border, bf, false)
  if (innerBorder) {
    const cx0 = bx + border
    const cy0 = by + border
    const cw = bw - 2 * border
    const ch = bh - 2 * border
    const cf = baseRoles[borderRole === 'd' ? 'c' : 'd']
    layRect(cx0, cy0, cw, inner, cf, false)
    layRect(cx0, cy0 + ch - inner, cw, inner, cf, false)
    layRect(cx0, cy0 + inner, inner, ch - 2 * inner, cf, false)
    layRect(cx0 + cw - inner, cy0 + inner, inner, ch - 2 * inner, cf, false)
  }

  // sashing and cornerstones
  if (s > 0) {
    const sf = baseRoles[sashRole]
    const cf = cornerstones ? baseRoles.c : sf
    for (let j = 0; j <= nr; j++) {
      for (let i = 0; i <= nc; i++) {
        const x = ix + i * (b + s)
        const y = iy + j * (b + s)
        layRect(x, y, s, s, cf, false)
        if (i < nc)
          layRect(x + s, y, b, s, sf, false)
        if (j < nr)
          layRect(x, y + s, s, b, sf, false)
      }
    }
  }

  // medallion region, in cells
  const mk = f.Setting === 'Medallion' ? n - 2 : 0
  const mi0 = (nc - mk) / 2
  const mj0 = (nr - mk) / 2
  const inMedallion = (i: number, j: number) => mk > 0 && i >= mi0 && i < mi0 + mk && j >= mj0 && j < mj0 + mk

  const cache = new Map<string, Patch[]>()
  const patchesOf = (t: typeof BLOCK_TYPES[number], px: number) => {
    const steps = arcSteps(px)
    const key = `${t}/${steps}`
    let p = cache.get(key)
    if (!p) {
      p = block(t, variants, steps)
      cache.set(key, p)
    }
    return p
  }

  for (let j = 0; j < nr; j++) {
    for (let i = 0; i < nc; i++) {
      if (inMedallion(i, j))
        continue
      const x = ix + s + i * (b + s)
      const y = iy + s + j * (b + s)
      const roles = rolesFor(i, j)
      const type = f.Block === 'Sampler'
        ? BLOCK_TYPES[Math.floor(cellRand(seed, i, j, 11) * BLOCK_TYPES.length)]
        : f.Block
      if (f.Setting === 'Edge to Edge' && alternatePlain && !isDirectional(type) && (i + j) % 2 === 1) {
        layRect(x, y, b, b, roles.bg)
        continue
      }
      const rot = isDirectional(type) ? rotationFor(arrangement, i, j, nc, nr, seed) : 0
      layBlock(patchesOf(type, b), x, y, b, rot, roles)
    }
  }

  if (mk > 0) {
    const R = mk * b
    const x = ix + mi0 * b
    const y = iy + mj0 * b
    const q = 4 * mk
    const t = 1 / q
    const frameUnit: Patch[] = [{ p: [0, 0, t, 0, t, t, 0, t], role: 'c' }]
    for (let k = 1; k < q - 1; k++) {
      frameUnit.push({ p: [k * t, 0, (k + 1) * t, 0, (k + 1) * t, t], role: sawtoothRole })
      frameUnit.push({ p: [k * t, 0, (k + 1) * t, t, k * t, t], role: 'bg' })
    }
    const band = t * 0.6
    frameUnit.push({ p: [t, t, 1 - t, t, 1 - t - band, t + band, t + band, t + band], role: 'd' })
    for (let r = 0; r < 4; r++)
      layBlock(frameUnit, x, y, R, r, baseRoles)
    const ins = (t + band) * R
    const type = f.Block === 'Sampler' ? medallionType : f.Block
    layBlock(patchesOf(type, R - 2 * ins), x + ins, y + ins, R - 2 * ins, 0, baseRoles)
  }

  // gentle unevenness of a quilt lying on the floor
  g.save()
  g.beginPath()
  g.rect(qx, qy, qw, qh)
  g.clip()
  clothGrain(g, qx, qy, qw, qh, S, seed)
  for (const [u, v, rad, sign] of waves) {
    const cx = qx + u * qw
    const cy = qy + v * qh
    const rr = rad * S
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, rr)
    const tone = sign < 0.5 ? '255,255,255' : '0,0,0'
    gr.addColorStop(0, `rgba(${tone},${dark ? 0.05 : 0.07})`)
    gr.addColorStop(1, `rgba(${tone},0)`)
    g.fillStyle = gr
    g.fillRect(cx - rr, cy - rr, 2 * rr, 2 * rr)
  }

  // ---- quilting ------------------------------------------------------------
  const quilt = new Path2D()
  const body = { x: bx, y: by, w: bw, h: bh }
  const field = { x: ix, y: iy, w: iw, h: ih }
  if (f.Quilting === 'Echo') {
    quilt.addPath(echo)
    borderLines(quilt, body, border, 2)
  }
  else if (f.Quilting === 'Crosshatch') {
    crosshatch(quilt, field, (b + s) / 4)
    borderLines(quilt, body, border, 2)
  }
  else if (f.Quilting === 'Baptist Fan') {
    baptistFan(quilt, body, 0.085 * S, Q)
  }
  else {
    borderLines(quilt, body, border, 1)
  }

  const ditch = f.Quilting === 'In the Ditch'
  groove(g, seams, 0.007 * S, ditch ? 1 : 0.55, dark)
  groove(g, quilt, (ditch ? 0.007 : 0.008) * S, 1, dark)

  // running stitches
  g.lineCap = 'round'
  g.setLineDash([0.0055 * S, 0.0038 * S])
  g.lineWidth = 0.0017 * S
  g.strokeStyle = css(hex(pal.thread), ditch ? 0.5 : 0.88)
  g.stroke(ditch ? seams : quilt)
  if (ditch) {
    g.strokeStyle = css(hex(pal.thread), 0.88)
    g.stroke(quilt)
  }
  g.setLineDash([])
  g.restore()

  // binding edge: light on the upper left, shade on the lower right
  g.lineWidth = 0.0025 * S
  g.strokeStyle = 'rgba(255,255,255,0.18)'
  g.beginPath()
  g.moveTo(qx + 0.001 * S, qy + qh)
  g.lineTo(qx + 0.001 * S, qy + 0.001 * S)
  g.lineTo(qx + qw, qy + 0.001 * S)
  g.stroke()
  g.strokeStyle = 'rgba(0,0,0,0.3)'
  g.beginPath()
  g.moveTo(qx + qw - 0.001 * S, qy)
  g.lineTo(qx + qw - 0.001 * S, qy + qh - 0.001 * S)
  g.lineTo(qx, qy + qh - 0.001 * S)
  g.stroke()
}

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------

function fillPiece(g: CanvasRenderingContext2D, pc: Piece) {
  const p = pc.p
  g.beginPath()
  g.moveTo(p[0], p[1])
  for (let k = 2; k < p.length; k += 2)
    g.lineTo(p[k], p[k + 1])
  g.closePath()
  useFabric(g, pc.fab, pc.ox, pc.oy)
  g.fill()
}

function tracePoly(path: Path2D, p: number[]) {
  path.moveTo(p[0], p[1])
  for (let k = 2; k < p.length; k += 2)
    path.lineTo(p[k], p[k + 1])
  path.closePath()
}

function area(p: number[]): number {
  let a = 0
  for (let i = 0, n = p.length; i < n; i += 2) {
    const j = (i + 2) % n
    a += p[i] * p[j + 1] - p[j] * p[i + 1]
  }
  return a / 2
}

/** Offset a polygon inwards by d (mitred joins); skip it when it collapses. */
function inset(p: number[], d: number): number[] | null {
  const n = p.length / 2
  const a0 = area(p)
  const sgn = a0 > 0 ? 1 : -1
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    const ip = (i + n - 1) % n
    const inx = (i + 1) % n
    const ex1 = p[i * 2] - p[ip * 2]
    const ey1 = p[i * 2 + 1] - p[ip * 2 + 1]
    const ex2 = p[inx * 2] - p[i * 2]
    const ey2 = p[inx * 2 + 1] - p[i * 2 + 1]
    const l1 = Math.hypot(ex1, ey1) || 1
    const l2 = Math.hypot(ex2, ey2) || 1
    // inward normals (y down, positive area = clockwise on screen)
    const n1x = -ey1 / l1 * sgn
    const n1y = ex1 / l1 * sgn
    const n2x = -ey2 / l2 * sgn
    const n2y = ex2 / l2 * sgn
    const dot = n1x * n2x + n1y * n2y
    const k = d / Math.max(0.15, 1 + dot)
    out.push(p[i * 2] + (n1x + n2x) * k, p[i * 2 + 1] + (n1y + n2y) * k)
  }
  const a1 = area(out)
  if (a1 * sgn <= 0 || Math.abs(a1) < Math.abs(a0) * 0.08 || Math.abs(a1) >= Math.abs(a0))
    return null
  return out
}

function perimeter(p: number[]): number {
  let l = 0
  for (let i = 0, n = p.length; i < n; i += 2) {
    const j = (i + 2) % n
    l += Math.hypot(p[j] - p[i], p[j + 1] - p[i + 1])
  }
  return l
}

/** Echo quilting: one line inside the patch (two in large ones), never closer than the patch allows. */
function echoPoly(path: Path2D, p: number[], dMax: number) {
  // 2A/P is the inradius of a triangle or a square, a fair guide for the rest
  const d = Math.min(dMax, 0.42 * 2 * Math.abs(area(p)) / perimeter(p))
  const a = inset(p, d)
  if (!a)
    return
  tracePoly(path, a)
  if (d === dMax && Math.abs(area(p)) > (d * 9) ** 2) {
    const b = inset(p, d * 2.6)
    if (b)
      tracePoly(path, b)
  }
}

interface Box { x: number, y: number, w: number, h: number }

/** Straight lines running round the border, at even fractions of its width. */
function borderLines(path: Path2D, body: Box, border: number, count: number) {
  for (let k = 1; k <= count; k++) {
    const e = border * k / (count + 1)
    path.rect(body.x + e, body.y + e, body.w - 2 * e, body.h - 2 * e)
  }
}

/** Diagonal grid on the pieced field, each line clipped to it (Liang-Barsky). */
function crosshatch(path: Path2D, box: Box, step: number) {
  const seg = (x0: number, y0: number, x1: number, y1: number) => {
    let t0 = 0
    let t1 = 1
    const dx = x1 - x0
    const dy = y1 - y0
    const tests: [number, number][] = [[-dx, x0 - box.x], [dx, box.x + box.w - x0], [-dy, y0 - box.y], [dy, box.y + box.h - y0]]
    for (const [pp, qq] of tests) {
      if (pp === 0) {
        if (qq < 0)
          return
        continue
      }
      const t = qq / pp
      if (pp < 0)
        t0 = Math.max(t0, t)
      else
        t1 = Math.min(t1, t)
    }
    if (t1 - t0 < 1e-6)
      return
    path.moveTo(x0 + dx * t0, y0 + dy * t0)
    path.lineTo(x0 + dx * t1, y0 + dy * t1)
  }
  const n = Math.ceil((box.w + box.h) / step)
  for (let k = 0; k <= n; k++) {
    const o = k * step
    seg(box.x + o - box.h, box.y, box.x + o, box.y + box.h)
    seg(box.x + o, box.y, box.x + o - box.h, box.y + box.h)
  }
}

/**
 * Baptist fan: rows of concentric quarter arcs, each fan hiding the ones it
 * overlaps, as when the fans are quilted one after the other from the
 * lower left. Arcs are sampled and broken where a later fan covers them.
 */
function baptistFan(path: Path2D, box: Box, F: number, r: Rng) {
  const arcs = int(r, 4, 6)
  const R = F * 1.3
  const cols = Math.ceil(box.w / F) + 1
  const rows = Math.ceil(box.h / F) + 1
  // fan (i, j): centre at the lower-left corner of cell (i, j), covering the quarter above-right
  const cx = (i: number) => box.x + i * F
  const cy = (j: number) => box.y + box.h - j * F
  // priority: fans further right, then higher up, are quilted later (on top)
  const pri = (i: number, j: number) => j * 10000 + i
  const covered = (x: number, y: number, i: number, j: number) => {
    const p0 = pri(i, j)
    for (let jj = j; jj <= j + 2; jj++) {
      for (let ii = i - 2; ii <= i + 2; ii++) {
        if (pri(ii, jj) <= p0)
          continue
        const dx = x - cx(ii)
        const dy = cy(jj) - y
        if (dx >= 0 && dy >= 0 && dx * dx + dy * dy < R * R)
          return true
      }
    }
    return false
  }
  const steps = 18
  for (let j = 0; j < rows; j++) {
    for (let i = -1; i < cols; i++) {
      for (let a = 1; a <= arcs; a++) {
        const rad = R * a / arcs
        let pen = false
        for (let k = 0; k <= steps; k++) {
          const th = -Math.PI / 2 * k / steps
          const x = cx(i) + Math.cos(th) * rad
          const y = cy(j) + Math.sin(th) * rad
          const inside = x >= box.x - F && x <= box.x + box.w + F && y >= box.y - F && y <= box.y + box.h + F
          if (!inside || covered(x, y, i, j)) {
            pen = false
            continue
          }
          if (pen)
            path.lineTo(x, y)
          else
            path.moveTo(x, y)
          pen = true
        }
      }
    }
  }
}

/**
 * A quilted line as a shallow valley lit from the upper left: shade on the
 * side facing away from the light, a highlight on the side facing it.
 */
function groove(g: CanvasRenderingContext2D, path: Path2D, w: number, strength: number, dark: boolean) {
  g.lineJoin = 'bevel'
  g.lineCap = 'butt'
  const shadeA = (dark ? 0.2 : 0.095) * strength
  const lightA = (dark ? 0.06 : 0.1) * strength
  const o = w * 0.32
  g.save()
  g.translate(-o, -o)
  for (const k of [1, 0.45]) {
    g.lineWidth = w * k
    g.strokeStyle = `rgba(0,0,0,${shadeA})`
    g.stroke(path)
  }
  g.translate(2 * o, 2 * o)
  g.lineWidth = w * 0.8
  g.strokeStyle = `rgba(255,255,255,${lightA})`
  g.stroke(path)
  g.restore()
  g.lineWidth = w * 0.18
  g.strokeStyle = `rgba(0,0,0,${shadeA * 1.4})`
  g.stroke(path)
}

/** Faint warp and weft threads over the whole top, so solids read as cloth. */
function clothGrain(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, S: number, seed: number) {
  const size = 0.04 * S
  const n = Math.max(2, Math.ceil(size))
  const threads = 24
  const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(n, n) : document.createElement('canvas')
  cv.width = n
  cv.height = n
  const t = cv.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
  if (!t)
    return
  const lw = n / threads * 0.45
  for (let k = 0; k < threads; k++) {
    const p = (k + 0.5) * n / threads
    const u = cellRand(seed, k, 0, 51)
    const v = cellRand(seed, k, 1, 51)
    t.fillStyle = u < 0.5 ? `rgba(0,0,0,${0.022 + u * 0.04})` : `rgba(255,255,255,${0.012 + (u - 0.5) * 0.05})`
    t.fillRect(0, p - lw / 2, n, lw)
    t.fillStyle = v < 0.5 ? `rgba(0,0,0,${0.022 + v * 0.04})` : `rgba(255,255,255,${0.012 + (v - 0.5) * 0.05})`
    t.fillRect(p - lw / 2, 0, lw, n)
  }
  const pattern = g.createPattern(cv, 'repeat')
  if (!pattern)
    return
  const k = size / n
  pattern.setTransform(new DOMMatrix([k, 0, 0, k, x, y]))
  g.fillStyle = pattern
  g.fillRect(x, y, w, h)
}

function rotationFor(kind: 'same' | 'barn' | 'furrow' | 'lightdark' | 'random', i: number, j: number, nc: number, nr: number, seed: number): number {
  if (kind === 'same')
    return 0
  if (kind === 'furrow')
    return (i + j) % 2 ? 2 : 0
  if (kind === 'lightdark')
    return [[0, 1], [3, 2]][j % 2][i % 2]
  if (kind === 'random')
    return Math.floor(cellRand(seed, i, j, 21) * 4)
  // barn raising: quadrant turns, flipped on every other ring
  const dx = i - (nc - 1) / 2
  const dy = j - (nr - 1) / 2
  let q = 0
  if (dx >= 0 && dy < 0)
    q = 1
  else if (dx >= 0 && dy >= 0)
    q = 2
  else if (dx < 0 && dy >= 0)
    q = 3
  const ring = Math.floor(Math.max(Math.abs(dx), Math.abs(dy)))
  return (q + (ring % 2) * 2) % 4
}

/** Floorboards: rows of planks with staggered joints and a little grain. */
function drawFloor(g: CanvasRenderingContext2D, W: number, H: number, S: number, pal: Palette, seed: number) {
  const a = hex(pal.floor[0])
  const b = hex(pal.floor[1])
  const ph = 0.085 * S
  const rows = Math.ceil(H / ph / 2) + 1
  const y0 = H / 2 - rows * ph
  for (let r = 0; r < rows * 2; r++) {
    const y = y0 + r * ph
    let x = W / 2 - S * (1.2 + cellRand(seed, r, 0, 31) * 0.6) * 2
    let k = 0
    while (x < W) {
      const len = S * (0.7 + cellRand(seed, r, k, 32) * 0.9)
      const c = mix(a, b, cellRand(seed, r, k, 33))
      g.fillStyle = css(shade(c, (cellRand(seed, r, k, 34) - 0.5) * 0.12))
      g.fillRect(x, y, len, ph)
      // grain
      g.lineWidth = 0.0012 * S
      for (let l = 0; l < 4; l++) {
        const gy = y + ph * (0.15 + 0.7 * cellRand(seed, r, k, 40 + l))
        g.strokeStyle = css(shade(c, -0.25), 0.18)
        g.beginPath()
        g.moveTo(x, gy)
        g.bezierCurveTo(x + len * 0.3, gy + ph * 0.05, x + len * 0.6, gy - ph * 0.06, x + len, gy)
        g.stroke()
      }
      g.fillStyle = 'rgba(0,0,0,0.35)'
      g.fillRect(x, y, 0.0018 * S, ph)
      x += len
      k++
    }
    g.fillStyle = 'rgba(0,0,0,0.4)'
    g.fillRect(0, y, W, 0.0022 * S)
    g.fillStyle = 'rgba(255,255,255,0.06)'
    g.fillRect(0, y + 0.0022 * S, W, 0.0016 * S)
  }
}

export default {
  slug: 'quilt',
  title: 'Quilt',
  summary: 'Patchwork quilts pieced from classic blocks (log cabin, nine-patch, flying geese, Ohio star, drunkard\'s path) in calico, gingham and solids, set with sashing, borders and hand quilting.',
  order: 460,
  traits: TRAITS,
  features,
  render,
  // Seed-of-seeds 0x51c0ffee ("gallery" stream, 64-hex candidates): the first
  // hash found for each block × palette pair. The first pair of every block
  // type is taken before the later pairs, so all seven blocks are shown.
  gallery: [
    '0x635447fd9347ae6830cc96ede2592dfb73336653c7618852e7a59abd86f7e9d9',
    '0x5ebe29884e1094e2946552a94b27d7e7838aa48148bf2664f541cdabd3b3e5ef',
    '0x4a1aa74c7c50cc59fc32ff0a703cfc093cc0a842cdd72175605fc874a61011c0',
    '0xe3acd6231dd62fe1f0e2d0cd51ad4fe91a9b4bae9548023fdc8ae0999ef1435a',
    '0x681abe94ea73b60e277efc0adaddc716b9585b76a1681a20de7735220d306ab7',
    '0xcb4692800850deacf297750fdc3255c27906c1ebd14c71ca582bc1a7f1f2e783',
    '0xbd51ad07481c7567ed40454dfea697b08756b3845df54e4070cacc61fa32329e',
    '0x427565bc91999ac37567b785d80dbe81fa0fb58cb5c7d8cdda7ec9ead35091a9',
    '0xb336e8117d98e18ebec1a1b4eac8a287c12ac4564c701d68922756d899852520',
    '0xbd828a87764b47cc35a74595a37687f28db7a7e2d10bc954747274882ec611be',
    '0xc97126db9e9a4b97b5167c3940b1ea2ed86848acf8629153a5a5ce57bb23b340',
    '0x44404d2a7550a92a39a4baa2c161a8246f85b97eac8a99bbce2293ff844636c2',
  ],
} satisfies Series
