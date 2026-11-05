// Page layouts for the "Asemic" series: lines of prose, vertical columns, a
// spiral, or a codex page with a large initial and notes in the margin.
//
// Layout lengths are in units of the canvas short side S (the page spans
// W/S by H/S), glyph lengths in x-height units. Line breaks are decided in
// those units only, so a hash lays out the same page at every size.

import type { Rng } from '../random'
import type { Alphabet } from './glyphs'
import type { Mapper, Scribe } from './pen'
import { gaussian, int, range } from '../random'
import { pickGlyph } from './glyphs'
import { Affine } from './pen'

export type Layout = 'Lines' | 'Codex' | 'Columns' | 'Spiral'
export type InkKind = 'ink' | 'accent' | 'note' | 'paper'

export interface Colours {
  bg: string
  accent: string
  note: string
  rule: string
  /** Tint behind initials. */
  wash: string
  /** Ink from freshly dipped (last) to nearly dry (first). */
  inks: string[]
}

export interface Page {
  g: CanvasRenderingContext2D
  W: number
  H: number
  S: number
  ab: Alphabet
  lex: number[][]
  scribe: Scribe
  /** Instance jitter. */
  hand: Rng
  /** Layout decisions. */
  lay: Rng
  /** Ink reservoir. */
  inkR: Rng
  col: Colours
  /** x-height (S units) and line pitch (x-height units). */
  h: number
  lead: number
  ink: number
  seal: boolean
}

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

function nextWord(p: Page): number[] {
  const r = p.lay
  if (r() < 0.12)
    return Array.from({ length: int(r, 2, 7) }, () => pickGlyph(r, p.ab))
  return p.lex[Math.floor(p.lex.length * r() ** 2.2)]
}

/** Width of a word, in x-height units. */
function measure(p: Page, w: number[]): number {
  let s = 0
  for (const i of w)
    s += p.ab.glyphs[i].w
  return s + p.ab.spacing * (w.length - 1)
}

function inkStyle(p: Page, kind: InkKind): [string, number] {
  if (kind === 'accent')
    return [p.col.accent, 0.92]
  if (kind === 'note')
    return [p.col.note, 0.88]
  if (kind === 'paper')
    return [p.col.bg, 1]
  const q = Math.min(p.col.inks.length - 1, Math.floor(p.ink * p.col.inks.length))
  return [p.col.inks[q], 0.7 + 0.27 * p.ink]
}

function spend(p: Page, kind: InkKind, len: number) {
  if (kind !== 'ink')
    return
  p.ink -= len * 0.0032
  if (p.ink < 0.12)
    p.ink = 1
}

/**
 * Writes one word with its baseline along the mapper's x axis, starting at
 * x0 (x-height units). Returns the abscissa where the word ends.
 */
export function writeWord(p: Page, word: number[], m: Mapper, x0: number, kind: InkKind): number {
  const { ab, hand, scribe } = p
  const pool = kind === 'paper' ? 0 : 1
  if (kind === 'ink' && p.ink < 0.55 && p.inkR() < 0.06)
    p.ink = 1
  let x = x0
  let chain: number[] | null = null
  let prevEnd: [number, number] | null = null
  const J = ab.jitter

  const flush = () => {
    if (chain && chain.length >= 4) {
      const [f, a] = inkStyle(p, kind)
      spend(p, kind, scribe.stroke(chain, true, m, f, a, pool))
    }
    chain = null
  }

  for (let gi = 0; gi < word.length; gi++) {
    const G = ab.glyphs[word[gi]]
    const sc = 1 + gaussian(hand) * 0.035
    const by = gaussian(hand) * 0.035
    const tf = (src: number[]) => {
      const out: number[] = Array.from({ length: src.length })
      for (let i = 0; i < src.length; i += 2) {
        const gx = src[i] * sc + (hand() - 0.5) * 2 * J
        const gy = src[i + 1] * sc + by + (hand() - 0.5) * 2 * J
        out[i] = x + gx - ab.slant * gy
        out[i + 1] = gy
      }
      return out
    }
    if (G.main) {
      const pts = tf(G.main.p)
      const join = chain !== null && hand() < ab.joinProb
      if (join) {
        chain!.push(...pts)
      }
      else {
        flush()
        chain = pts
      }
    }
    else if (prevEnd && hand() < ab.joinProb && G.strokes.length && !G.strokes[0].dot) {
      // an occasional ligature from the previous glyph
      const first = tf(G.strokes[0].p)
      if (prevEnd[1] > -0.7 && first[1] > -0.7) {
        const [f, a] = inkStyle(p, kind)
        const mx = (prevEnd[0] + first[0]) / 2
        scribe.stroke([prevEnd[0], prevEnd[1], mx, 0.12, first[0], first[1]], true, m, f, a * 0.9, 0)
      }
    }
    prevEnd = null
    for (const s of G.strokes) {
      const pts = tf(s.p)
      const [f, a] = inkStyle(p, kind)
      if (s.dot) {
        scribe.dot(pts[0], pts[1], m, f, a)
        continue
      }
      spend(p, kind, scribe.stroke(pts, s.smooth, m, f, a, pool))
      prevEnd = [pts[pts.length - 2], pts[pts.length - 1]]
    }
    x += G.w + ab.spacing
  }
  flush()
  const end = x - ab.spacing
  if (ab.headline) {
    const y = -1 + gaussian(hand) * 0.02
    const [f, a] = inkStyle(p, kind)
    spend(p, kind, scribe.stroke([x0 - 0.14, y, (x0 + end) / 2, y + gaussian(hand) * 0.015, end + 0.1, y], false, m, f, a, pool))
  }
  return end
}

/** A tapering wave that fills the end of a short line. */
function filler(p: Page, m: Mapper, x0: number, x1: number) {
  const pts: number[] = []
  const k = Math.max(2, Math.round((x1 - x0) / 0.7))
  for (let i = 0; i <= k; i++)
    pts.push(x0 + ((x1 - x0) * i) / k, -0.42 + (i % 2 ? -0.16 : 0.12) + gaussian(p.hand) * 0.03)
  const [f, a] = inkStyle(p, 'ink')
  p.scribe.stroke(pts, true, m, f, a * 0.85, 1)
}

// ---------------------------------------------------------------------------
// Shared ornaments
// ---------------------------------------------------------------------------

/** The glyph with the most material, used for initials and rosettes. */
function richGlyph(p: Page): number {
  let best = 0
  let bestScore = -1
  p.ab.glyphs.forEach((G, i) => {
    let s = G.main ? G.main.p.length * 1.5 : 0
    for (const st of G.strokes)
      s += st.dot ? 3 : 8 + st.p.length
    s -= Math.abs(G.w - 1.1) * 8
    if (s > bestScore) {
      bestScore = s
      best = i
    }
  })
  return best
}

function rule(p: Page, x0: number, y0: number, x1: number, y1: number, alpha: number) {
  const { g, S } = p
  g.globalAlpha = alpha
  g.strokeStyle = p.col.rule
  g.lineWidth = Math.max(0.5, 0.0011 * S)
  g.beginPath()
  g.moveTo(x0 * S, y0 * S)
  g.lineTo(x1 * S, y1 * S)
  g.stroke()
  g.globalAlpha = 1
}

/** A glyph drawn large and centred on (cx, cy), height `size` (S units). */
function bigGlyph(p: Page, gi: number, cx: number, cy: number, size: number, kind: InkKind, weight = 1.45) {
  const G = p.ab.glyphs[gi]
  const gh = G.bottom - G.top
  const k = size / Math.max(gh, G.w * 0.9)
  const m = new Affine()
  const ox = cx - (G.w / 2 + p.ab.slant * (G.top + G.bottom) / 2 * -1) * k
  const oy = cy - ((G.top + G.bottom) / 2) * k
  m.set(ox * p.S, oy * p.S, 1, 0, k * p.S)
  // a heavier pen for display glyphs
  const pen = p.scribe.pen
  const [b0, h0] = [pen.base, pen.hair]
  pen.base *= weight
  pen.hair *= weight
  writeWord(p, [gi], m, 0, kind)
  pen.base = b0
  pen.hair = h0
}

/** A square or round seal stamp, with glyphs carved out of the colour. */
export function seal(p: Page, cx: number, cy: number, size: number) {
  const { g, S, lay } = p
  const round = lay() < 0.3
  const pts: number[] = []
  const N = 44
  for (let i = 0; i < N; i++) {
    const t = i / N
    let x: number
    let y: number
    if (round) {
      x = Math.cos(t * Math.PI * 2) * 0.5
      y = Math.sin(t * Math.PI * 2) * 0.5
    }
    else {
      const side = Math.floor(t * 4)
      const u = t * 4 - side - 0.5
      ;[x, y] = side === 0 ? [u, -0.5] : side === 1 ? [0.5, u] : side === 2 ? [-u, 0.5] : [-0.5, -u]
    }
    pts.push(cx + (x + (lay() - 0.5) * 0.025) * size, cy + (y + (lay() - 0.5) * 0.025) * size)
  }
  g.globalAlpha = 0.9
  g.fillStyle = p.col.accent
  g.beginPath()
  g.moveTo(pts[0] * S, pts[1] * S)
  for (let i = 2; i < pts.length; i += 2)
    g.lineTo(pts[i] * S, pts[i + 1] * S)
  g.closePath()
  g.fill()
  // carved glyphs: a 2 x 2 block (one glyph in a round seal)
  const cells = round ? [[0, 0]] : [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]]
  const cs = round ? size * 0.5 : size * 0.33
  for (const [dx, dy] of cells)
    bigGlyph(p, pickGlyph(lay, p.ab), cx + dx * size, cy + dy * size, cs, 'paper', 1.25)
  // wear
  g.fillStyle = p.col.bg
  g.globalAlpha = 0.85
  g.beginPath()
  for (let i = 0; i < 26; i++) {
    const x = cx + (lay() - 0.5) * size * 0.98
    const y = cy + (lay() - 0.5) * size * 0.98
    const r = size * (0.006 + lay() ** 3 * 0.03)
    g.moveTo((x + r) * S, y * S)
    g.arc(x * S, y * S, r * S, 0, Math.PI * 2)
  }
  g.fill()
  g.globalAlpha = 1
}

// ---------------------------------------------------------------------------
// Lines and codex: justified prose in a text block
// ---------------------------------------------------------------------------

interface Block {
  x0: number
  x1: number
  y0: number
  y1: number
  /** Lines indented by `indent` S units at the top (for an initial). */
  dropLines: number
  dropIndent: number
  rubric: boolean
  ruled: boolean
}

/** Fills a block with paragraphs. Returns the end of the last line (S units). */
function prose(p: Page, b: Block, hs: number): [number, number] {
  const { lay, hand, S } = p
  const pitch = hs * p.lead
  let y = b.y0 + hs * p.ab.asc
  let line = 0
  let paraLeft = int(lay, 2, 7)
  let first = true
  let last: [number, number] = [b.x0, y]
  const m = new Affine()
  let pending: number[] | null = null
  while (y + hs * p.ab.desc <= b.y1) {
    const indent = line < b.dropLines ? b.dropIndent : 0
    const lx0 = b.x0 + indent + (first ? hs * 2.2 : 0)
    const widthU = (b.x1 - lx0) / hs
    // collect words
    const words: number[][] = []
    let used = 0
    for (;;) {
      const w = pending ?? nextWord(p)
      pending = null
      const ww = measure(p, w)
      const gap = words.length ? 0.95 : 0
      if (used + gap + ww > widthU) {
        if (!words.length) {
          // a word longer than the line: cut it
          words.push(w.slice(0, Math.max(1, Math.floor(w.length * widthU / ww) - 1)))
          used = measure(p, words[0])
        }
        else {
          pending = w
        }
        break
      }
      words.push(w)
      used += gap + ww
      if (paraLeft === 1 && used > widthU * range(lay, 0.35, 0.8))
        break
    }
    const endPara = paraLeft === 1
    const spare = widthU - used
    const extra = !endPara && words.length > 1 && spare < widthU * 0.25 ? spare / (words.length - 1) : 0
    const tilt = gaussian(hand) * 0.004
    if (b.ruled)
      rule(p, b.x0, y, b.x1, y, 0.35)
    m.set(lx0 * S, y * S, Math.cos(tilt), Math.sin(tilt), hs * S)
    let x = 0
    words.forEach((w, i) => {
      const kind: InkKind = b.rubric && first && i === 0 ? 'accent' : 'ink'
      x = writeWord(p, w, m, x, kind) + 0.95 + extra
    })
    last = [lx0 + (x - 0.95 - extra) * hs, y]
    if (endPara && spare > widthU * 0.3 && lay() < 0.35)
      filler(p, m, x + 0.2, widthU - 0.1)
    first = false
    paraLeft--
    y += pitch
    line++
    if (paraLeft === 0) {
      paraLeft = int(lay, 2, 7)
      first = true
      pending = null
      if (lay() < 0.4)
        y += pitch * 0.45
    }
  }
  return last
}

function linesLayout(p: Page) {
  const { W, H, S, lay } = p
  const pw = W / S
  const ph = H / S
  const mx = 0.09
  const my = 0.1
  const hs = p.h
  let y0 = my
  if (lay() < 0.55) {
    // a title line, centred, in the accent colour
    const n = int(lay, 1, 3)
    const words = Array.from({ length: n }, () => nextWord(p))
    const th = hs * 1.45
    let wu = 0
    for (const w of words)
      wu += measure(p, w) + 1.2
    wu -= 1.2
    const m = new Affine().set((pw / 2 - (wu * th) / 2) * S, (y0 + th * p.ab.asc) * S, 1, 0, th * S)
    let x = 0
    for (const w of words)
      x = writeWord(p, w, m, x, 'accent') + 1.2
    y0 += th * (p.ab.asc + p.ab.desc) + hs * p.lead * 0.6
  }
  const size = 0.07
  const y1 = ph - my - (p.seal ? size * 0.6 : 0)
  const end = prose(p, { x0: mx, x1: pw - mx, y0, y1, dropLines: 0, dropIndent: 0, rubric: lay() < 0.5, ruled: false }, hs)
  if (p.seal) {
    // after the last word if it fits, else below the text at the right
    if (end[0] + size * 1.6 < pw - mx)
      seal(p, end[0] + size * 0.9, end[1] - hs * 0.4, size)
    else
      seal(p, pw - mx - size / 2, Math.min(ph - size * 0.7, end[1] + hs * p.lead * 0.9), size)
  }
}

function codexLayout(p: Page) {
  const { W, H, S, lay, g } = p
  const pw = W / S
  const ph = H / S
  const spread = W / H >= 1.3
  const pages = spread ? 2 : 1
  const pageW = pw / pages
  const hs = p.h
  const my0 = 0.09
  const my1 = 0.11
  if (spread) {
    // gutter shadow between the two pages
    const cx = pw / 2 * S
    const grd = g.createLinearGradient(cx - 0.05 * S, 0, cx + 0.05 * S, 0)
    grd.addColorStop(0, 'rgba(0,0,0,0)')
    grd.addColorStop(0.5, 'rgba(0,0,0,0.22)')
    grd.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = grd
    g.fillRect(cx - 0.05 * S, 0, 0.1 * S, H)
  }
  const rubric = lay() < 0.6
  for (let pg = 0; pg < pages; pg++) {
    const left = pg * pageW
    // outer margin carries the notes: right on a single or recto page
    const outerRight = !spread || pg === 1
    const inner = 0.075 * Math.min(1, pageW)
    const outer = 0.25 * Math.min(1, pageW)
    const x0 = outerRight ? left + inner : left + outer
    const x1 = outerRight ? left + pageW - outer : left + pageW - inner
    const y0 = my0
    const y1 = ph - my1
    // drypoint ruling: frame lines
    rule(p, x0, y0 - 0.02, x0, y1 + 0.02, 0.4)
    rule(p, x1, y0 - 0.02, x1, y1 + 0.02, 0.4)
    let dropLines = 0
    let dropIndent = 0
    if (pg === 0) {
      dropLines = int(lay, 3, 4)
      const pitch = hs * p.lead
      const top = y0 + hs * (p.ab.asc - 1.25)
      const boxH = (dropLines - 1) * pitch + hs * 2.3
      const boxW = boxH * 0.92
      dropIndent = boxW + hs * 0.8
      // indent every line whose ascenders would reach the frame
      dropLines = Math.ceil((top + boxH + hs * 0.25 - y0) / pitch)
      g.globalAlpha = 0.13
      g.fillStyle = p.col.wash
      g.fillRect(x0 * S, top * S, boxW * S, boxH * S)
      g.globalAlpha = 0.85
      g.strokeStyle = p.col.accent
      g.lineWidth = Math.max(0.6, 0.0016 * S)
      g.strokeRect(x0 * S, top * S, boxW * S, boxH * S)
      const ins = hs * 0.25
      g.lineWidth = Math.max(0.4, 0.0008 * S)
      g.strokeRect((x0 + ins) * S, (top + ins) * S, (boxW - 2 * ins) * S, (boxH - 2 * ins) * S)
      // a dotted ground inside the frame
      g.globalAlpha = 0.4
      g.fillStyle = p.col.note
      g.beginPath()
      const step = (boxW - 4 * ins) / 9
      for (let i = 0; i <= 9; i++) {
        for (let j = 0; j <= Math.floor((boxH - 4 * ins) / step); j++) {
          const dx = x0 + 2 * ins + i * step + (j % 2 ? step / 2 : 0)
          if (dx > x0 + boxW - 2 * ins)
            continue
          const dy = top + 2 * ins + j * step
          g.moveTo((dx + 0.0016) * S, dy * S)
          g.arc(dx * S, dy * S, 0.0016 * S, 0, Math.PI * 2)
        }
      }
      g.fill()
      g.globalAlpha = 1
      bigGlyph(p, richGlyph(p), x0 + boxW / 2, top + boxH / 2, boxH * 0.66, 'accent')
    }
    prose(p, { x0, x1, y0, y1, dropLines, dropIndent, rubric, ruled: true }, hs)
    // notes in the outer margin
    const nx0 = outerRight ? x1 + 0.025 : left + 0.03
    const nx1 = outerRight ? left + pageW - 0.03 : x0 - 0.025
    const nh = hs * 0.58
    let ny = y0 + range(lay, 0.02, 0.2)
    const notes = int(lay, 1, 3)
    for (let k = 0; k < notes && ny < y1 - 0.1; k++) {
      const lines = int(lay, 2, 5)
      const tilt = gaussian(lay) * 0.03
      for (let l = 0; l < lines && ny < y1; l++) {
        const m = new Affine().set(nx0 * S, ny * S, Math.cos(tilt), Math.sin(tilt), nh * S)
        const wu = (nx1 - nx0) / nh * range(lay, 0.55, 1)
        let x = 0
        for (;;) {
          const w = nextWord(p)
          if (x + measure(p, w) > wu)
            break
          x = writeWord(p, w, m, x, 'note') + 0.9
        }
        ny += nh * p.lead
      }
      ny += range(lay, 0.06, 0.25)
    }
  }
}

// ---------------------------------------------------------------------------
// Columns: vertical writing, right to left
// ---------------------------------------------------------------------------

function columnsLayout(p: Page) {
  const { W, H, S, lay, ab } = p
  const pw = W / S
  const ph = H / S
  const hs = p.h * 1.05
  const mx = 0.09
  const y0 = 0.09
  const y1 = ph - 0.09
  // column pitch from the width of most glyphs; wider ones are shrunk
  const ws = ab.glyphs.map(G => G.w).sort((a, b) => a - b)
  const maxW = Math.min(1.4, Math.max(0.6, ws[Math.floor(ws.length * 0.8)]))
  const pitch = hs * (maxW + 0.85)
  const ruled = lay() < 0.55
  const m = new Affine()
  let cx = pw - mx - pitch / 2
  let y = y0
  let lastCol = cx
  let lastY = y
  const cols: number[] = [cx]
  while (cx - pitch / 2 >= mx - 1e-9) {
    const w = nextWord(p)
    for (const gi of w) {
      const G = ab.glyphs[gi]
      const k = Math.min(1, maxW / G.w)
      const gh = (G.bottom - G.top) * k
      if (y + gh * hs > y1) {
        cx -= pitch
        y = y0
        cols.push(cx)
        if (cx - pitch / 2 < mx - 1e-9)
          break
      }
      const ox = cx - (G.w * k / 2) * hs
      const oy = y - G.top * k * hs
      m.set(ox * S, oy * S, 1, 0, hs * k * S)
      writeWord(p, [gi], m, 0, 'ink')
      y += (gh + 0.38) * hs
      lastCol = cx
      lastY = y
    }
    if (cx - pitch / 2 < mx - 1e-9)
      break
    y += 0.75 * hs
    // a paragraph break: start a new column
    if (y > y0 + (y1 - y0) * 0.5 && lay() < 0.06) {
      cx -= pitch
      y = y0
      cols.push(cx)
    }
  }
  if (ruled) {
    for (const c of cols) {
      if (c - pitch / 2 >= mx - 1e-9)
        rule(p, c + pitch / 2, y0 - 0.015, c + pitch / 2, y1 + 0.015, 0.45)
    }
    const lastEdge = Math.max(cols[cols.length - 1], mx + pitch / 2)
    rule(p, lastEdge - pitch / 2, y0 - 0.015, lastEdge - pitch / 2, y1 + 0.015, 0.45)
  }
  if (p.seal) {
    const size = 0.075
    if (lastY + size * 1.4 < y1)
      seal(p, lastCol, lastY + size * 0.9, size)
    else
      seal(p, Math.max(mx + size / 2, lastCol - pitch), y1 - size / 2, size)
  }
}

// ---------------------------------------------------------------------------
// Spiral: one continuous line wound from the centre outwards, glyph tops
// facing out, growing with the radius.
// ---------------------------------------------------------------------------

class SpiralMapper implements Mapper {
  X = 0
  Y = 0
  th: Float64Array
  rr: Float64Array
  uu: Float64Array
  hh: Float64Array
  len: number
  constructor(public cx: number, public cy: number, public S: number, r0: number, R: number, h: number, lead: number) {
    const cap = 40000
    this.th = new Float64Array(cap)
    this.rr = new Float64Array(cap)
    this.uu = new Float64Array(cap)
    this.hh = new Float64Array(cap)
    let t = 0
    let r = r0
    let u = 0
    let i = 0
    const dt = 0.006
    while (r < R && i < cap) {
      const hr = h * (0.5 + 0.5 * r / R)
      this.th[i] = t
      this.rr[i] = r
      this.uu[i] = u
      this.hh[i] = hr
      i++
      t += dt
      r += (lead * hr / (Math.PI * 2)) * dt
      u += (r * dt) / hr
    }
    this.len = i
  }

  get uMax() {
    return this.uu[this.len - 1]
  }

  private at(x: number): [number, number] {
    const uu = this.uu
    let lo = 0
    let hi = this.len - 1
    if (x <= 0)
      return [0, 0]
    if (x >= uu[hi])
      return [hi, 0]
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (uu[mid] <= x)
        lo = mid
      else hi = mid
    }
    return [lo, (x - uu[lo]) / (uu[lo + 1] - uu[lo])]
  }

  map(x: number, y: number) {
    const [i, f] = this.at(x)
    const j = Math.min(i + 1, this.len - 1)
    const t = this.th[i] + (this.th[j] - this.th[i]) * f
    const r = this.rr[i] + (this.rr[j] - this.rr[i]) * f
    const hr = this.hh[i] + (this.hh[j] - this.hh[i]) * f
    const rad = r - y * hr
    this.X = (this.cx + Math.cos(t) * rad) * this.S
    this.Y = (this.cy + Math.sin(t) * rad) * this.S
  }

  scale(x: number) {
    const [i] = this.at(x)
    return this.hh[i] * this.S
  }
}

function spiralLayout(p: Page) {
  const { W, H, S, lay, g } = p
  const cx = W / S / 2
  const cy = H / S / 2
  const R = 0.43
  const r0 = 0.1
  const sm = new SpiralMapper(cx, cy, S, r0, R, p.h * 1.15, p.lead)
  // the centre: a ring and a large glyph, or the seal
  if (p.seal) {
    seal(p, cx, cy, r0 * 1.15)
  }
  else {
    g.globalAlpha = 0.12
    g.fillStyle = p.col.wash
    g.beginPath()
    g.arc(cx * S, cy * S, r0 * 0.78 * S, 0, Math.PI * 2)
    g.fill()
    g.globalAlpha = 0.85
    g.strokeStyle = p.col.accent
    g.lineWidth = Math.max(0.6, 0.0016 * S)
    g.stroke()
    g.globalAlpha = 1
    bigGlyph(p, richGlyph(p), cx, cy, r0 * 0.95, 'accent')
  }
  let x = 0.5
  const end = sm.uMax - 1
  for (;;) {
    const w = nextWord(p)
    const ww = measure(p, w)
    if (x + ww > end)
      break
    x = writeWord(p, w, sm, x, lay() < 0.04 ? 'accent' : 'ink') + 1
  }
  // a flourish trailing off the end of the line
  const pts: number[] = []
  for (let i = 0; i <= 8; i++)
    pts.push(x + i * 0.9, -0.3 + Math.sin(i * 1.3) * 0.22)
  const [f, a] = inkStyle(p, 'ink')
  p.scribe.stroke(pts, true, sm, f, a * 0.8, 1)
}

export function layout(p: Page, kind: Layout) {
  if (kind === 'Lines')
    linesLayout(p)
  else if (kind === 'Codex')
    codexLayout(p)
  else if (kind === 'Columns')
    columnsLayout(p)
  else
    spiralLayout(p)
}
