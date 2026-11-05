// "Harmonograph" — the line a pen leaves when damped pendulums move it.
//
// The Victorian harmonograph hangs a pen and a drawing table from two to four
// pendulums swinging at frequencies close to a small-integer ratio. Each
// pendulum adds a term A sin(2π f t + p) e^(−d t) to the pen position; the
// slight detune of the ratio makes the figure precess and the damping draws
// it inwards in one very long, fine line. A gimballed pendulum swings in an
// ellipse, a rotary table in a circle. The pen pressure fades along the run,
// and with several runs each one gets its own ink.
//
// Every point is evaluated directly from t (nothing is iterated), so the tiny
// last-bit differences of Math.sin/exp between engines never compound. All
// lengths are fractions of the canvas short side.

import type { Rng } from '../random'
import type { Series } from '../types'
import { pick, range, stream, weighted } from '../random'

// Rarity table, decided before the drawing code. Never reorder: it re-rolls the edition.
const TRAITS = {
  Palette: [['Paper', 26], ['Blueprint', 18], ['Sepia', 16], ['Night Gold', 16], ['Riso', 14], ['Chalk', 10]],
  Ratio: [['Unison', 18], ['Octave', 22], ['Fifth', 22], ['Fourth', 16], ['Third', 12], ['Exotic', 10]],
  Rig: [['Two pendulums', 30], ['Three pendulums', 32], ['Four pendulums', 18], ['Rotary table', 20]],
  Damping: [['Long', 30], ['Medium', 45], ['Short', 25]],
  Pen: [['Single', 50], ['Duo', 30], ['Layered', 20]],
} as const

type TraitName = keyof typeof TRAITS
type Features = { [K in TraitName]: typeof TRAITS[K][number][0] }

function features(hash: string): Features {
  const r = stream(hash, 'features')
  return {
    Palette: weighted(r, TRAITS.Palette),
    Ratio: weighted(r, TRAITS.Ratio),
    Rig: weighted(r, TRAITS.Rig),
    Damping: weighted(r, TRAITS.Damping),
    Pen: weighted(r, TRAITS.Pen),
  }
}

interface Palette {
  bg: string
  /** One ink per pen run, in order. */
  inks: readonly [string, string, string]
  /** Paper grain specks. */
  grain: string
  /** Darkened paper edge, or null for no vignette. */
  edge: string | null
  dark: boolean
  /** Overprint the runs (riso inks multiply on the paper). */
  multiply: boolean
}

const PAL: Record<Features['Palette'], Palette> = {
  'Paper': { bg: '#f2ece0', inks: ['#1d1c1a', '#b0362b', '#24467a'], grain: '#8a7e68', edge: '#b9a98a', dark: false, multiply: false },
  'Blueprint': { bg: '#163a64', inks: ['#eef4fa', '#f1cf72', '#8fc2ea'], grain: '#0c2442', edge: '#0a2140', dark: true, multiply: false },
  'Sepia': { bg: '#efe1c6', inks: ['#4a2c1a', '#93582c', '#2f5049'], grain: '#9c7f55', edge: '#b48d5c', dark: false, multiply: false },
  'Night Gold': { bg: '#111216', inks: ['#e8c26c', '#f4ead2', '#c27a3c'], grain: '#2a2a30', edge: '#000000', dark: true, multiply: false },
  'Riso': { bg: '#f5f0e6', inks: ['#ff48b0', '#0078bf', '#00a95c'], grain: '#a89c8a', edge: '#cbbfa8', dark: false, multiply: true },
  'Chalk': { bg: '#24292c', inks: ['#ecebe4', '#e9a6a0', '#94cfc6'], grain: '#3a4246', edge: '#101416', dark: true, multiply: false },
}

/** Frequency ratios (low : high). Exotic picks one of the rarer intervals. */
const RATIOS: Record<Features['Ratio'], ReadonlyArray<readonly [number, number]>> = {
  Unison: [[1, 1]],
  Octave: [[1, 2]],
  Fifth: [[2, 3]],
  Fourth: [[3, 4]],
  Third: [[4, 5]],
  Exotic: [[3, 5], [5, 7], [5, 8], [4, 7], [7, 9], [5, 9]],
}

/**
 * Length of the run, in repeats of the ideal Lissajous figure (capped so the
 * rare long-period ratios stay light), and amplitude left at the end.
 */
const DAMPING: Record<Features['Damping'], { repeats: number, end: number }> = {
  Long: { repeats: 150, end: 0.2 },
  Medium: { repeats: 118, end: 0.07 },
  Short: { repeats: 88, end: 0.03 },
}
/** Longest run, in cycles of the slowest pendulum. */
const MAX_CYCLES = 480

/** Pen line width (short side = 1) and number of runs. */
const PEN: Record<Features['Pen'], { runs: number, width: number }> = {
  Single: { runs: 1, width: 0.00125 },
  Duo: { runs: 2, width: 0.00105 },
  Layered: { runs: 3, width: 0.0009 },
}

/** x += ax sin(2π f t + p) e^(−d t), y += ay sin(2π f t + q) e^(−d t). */
interface Pendulum { ax: number, ay: number, f: number, p: number, q: number, d: number }

const TAU = Math.PI * 2
/** Share of the short side covered by the larger side of the figure. */
const FIT = 0.78
/** Smallest height / width (or width / height) of the fitted figure. */
const MIN_ASPECT = 0.55

const sign = (r: Rng) => (r() < 0.5 ? -1 : 1)

/** Run length in cycles of the slowest pendulum. */
function runCycles(f: Features, lo: number) {
  return Math.min(MAX_CYCLES, DAMPING[f.Damping].repeats * lo)
}

function buildMachine(f: Features, r: Rng): { pendulums: Pendulum[], cycles: number } {
  const [lo, hi] = pick(r, RATIOS[f.Ratio])
  const swap = r() < 0.5
  const fLo = 1
  const fHi = hi / lo
  const fx = swap ? fHi : fLo
  const fy = swap ? fLo : fHi
  const cycles = runCycles(f, lo)
  // The detune that makes the figure precess, given as the total phase slip
  // of the fastest pendulum over the run and shared out between pendulums.
  const slip = range(r, 0.7, 3.3) * sign(r)
  const drift = slip / (TAU * fHi * cycles)
  const tune = (base: number) => base * (1 + drift * range(r, 0.7, 1.3))
  const decay = Math.log(1 / DAMPING[f.Damping].end) / cycles
  const damp = () => decay * range(r, 0.84, 1.18)
  const phase = () => r() * TAU

  const ps: Pendulum[] = []
  if (f.Rig === 'Rotary table') {
    // One lateral pendulum carries the pen, the table turns in a circle at
    // the other frequency, and a weak second swing breaks the symmetry.
    const a = range(r, 0.7, 1)
    const p = phase()
    ps.push({ ax: 1, ay: 0, f: fLo, p: phase(), q: 0, d: damp() })
    ps.push({ ax: a, ay: a, f: tune(fHi), p, q: p + sign(r) * Math.PI / 2, d: damp() })
    ps.push({ ax: 0, ay: range(r, 0.15, 0.45), f: tune(fLo), p: 0, q: phase(), d: damp() })
    return { pendulums: ps, cycles }
  }
  ps.push({ ax: 1, ay: 0, f: fx, p: phase(), q: 0, d: damp() })
  ps.push({ ax: 0, ay: range(r, 0.78, 1), f: tune(fy), p: 0, q: phase(), d: damp() })
  if (f.Rig === 'Three pendulums') {
    // A gimballed pendulum under the table swings in an ellipse.
    const a = range(r, 0.35, 0.7)
    const p = phase()
    ps.push({ ax: a, ay: a * range(r, 0.6, 1), f: tune(r() < 0.5 ? fx : fy), p, q: p + sign(r) * range(r, Math.PI / 4, Math.PI / 2), d: damp() })
  }
  else if (f.Rig === 'Four pendulums') {
    // Two pendulums per axis, the second of each at the other axis' frequency.
    ps.push({ ax: range(r, 0.3, 0.7), ay: 0, f: tune(fy), p: phase(), q: 0, d: damp() })
    ps.push({ ax: 0, ay: range(r, 0.3, 0.7), f: tune(fx), p: 0, q: phase(), d: damp() })
  }
  return { pendulums: ps, cycles }
}

interface Run {
  t0: number
  t1: number
  pendulums: Pendulum[]
  /** Pen pressure wobble. */
  wobble: readonly [number, number, number]
}

function buildRuns(f: Features, machine: Pendulum[], cycles: number, r: Rng): Run[] {
  const runs: Run[] = []
  for (let k = 0; k < PEN[f.Pen].runs; k++) {
    // Every run after the first re-releases the pendulums a little differently
    // and lowers the pen a few swings later, so its figure sits inside.
    const shift = k === 0 ? 0 : range(r, 0.35, 1.1) * sign(r)
    const which = Math.floor(r() * machine.length)
    const pendulums = machine.map((p, i) => {
      const s = k === 0 ? 1 : range(r, 0.86, 1)
      const dp = i === which ? shift : 0
      return { ...p, ax: p.ax * s, ay: p.ay * s, p: p.p + dp, q: p.q + dp }
    })
    const t0 = k === 0 ? 0 : range(r, 0.01, 0.05) * cycles * k
    runs.push({ t0, t1: cycles, pendulums, wobble: [r() * TAU, r() * TAU, range(r, 1.5, 3.5)] })
  }
  return runs
}

function trace(run: Run, perCycle: number): Float64Array {
  const n = Math.ceil((run.t1 - run.t0) * perCycle) + 1
  const pts = new Float64Array(n * 2)
  const ps = run.pendulums
  for (let i = 0; i < n; i++) {
    const t = run.t0 + (run.t1 - run.t0) * (i / (n - 1))
    let x = 0
    let y = 0
    for (const p of ps) {
      const e = Math.exp(-p.d * t)
      const w = TAU * p.f * t
      if (p.ax !== 0)
        x += p.ax * Math.sin(w + p.p) * e
      if (p.ay !== 0)
        y += p.ay * Math.sin(w + p.q) * e
    }
    pts[i * 2] = x
    pts[i * 2 + 1] = y
  }
  return pts
}

function paper(g: CanvasRenderingContext2D, W: number, H: number, S: number, pal: Palette, fe: Features, r: Rng) {
  g.globalCompositeOperation = 'source-over'
  g.globalAlpha = 1
  g.fillStyle = pal.bg
  g.fillRect(0, 0, W, H)

  if (fe.Palette === 'Blueprint') {
    // Drafting grid, anchored on the centre so it frames the figure.
    const step = S / 24
    g.strokeStyle = '#cfe2f4'
    for (let k = -Math.ceil(W / step / 2); k <= Math.ceil(W / step / 2); k++) {
      g.globalAlpha = k % 4 === 0 ? 0.1 : 0.05
      g.lineWidth = S * 0.0007
      g.beginPath()
      g.moveTo(W / 2 + k * step, 0)
      g.lineTo(W / 2 + k * step, H)
      g.stroke()
    }
    for (let k = -Math.ceil(H / step / 2); k <= Math.ceil(H / step / 2); k++) {
      g.globalAlpha = k % 4 === 0 ? 0.1 : 0.05
      g.lineWidth = S * 0.0007
      g.beginPath()
      g.moveTo(0, H / 2 + k * step)
      g.lineTo(W, H / 2 + k * step)
      g.stroke()
    }
  }

  // Grain: a fixed number of specks per square of the short side.
  const count = Math.round(1600 * (W * H) / (S * S))
  g.fillStyle = pal.grain
  for (let i = 0; i < count; i++) {
    const x = r() * W
    const y = r() * H
    const s = S * range(r, 0.0006, 0.0018)
    g.globalAlpha = range(r, 0.06, 0.2)
    g.fillRect(x, y, s, s)
  }

  if (pal.edge) {
    const R = Math.hypot(W, H) / 2
    const grad = g.createRadialGradient(W / 2, H / 2, S * 0.3, W / 2, H / 2, R)
    grad.addColorStop(0, `${pal.edge}00`)
    grad.addColorStop(1, `${pal.edge}${pal.dark ? '80' : '40'}`)
    g.globalAlpha = 1
    g.fillStyle = grad
    g.fillRect(0, 0, W, H)
  }
}

function render(g: CanvasRenderingContext2D, W: number, H: number, hash: string) {
  const fe = features(hash)
  const pal = PAL[fe.Palette]
  const S = Math.min(W, H)

  const mr = stream(hash, 'machine')
  const pr = stream(hash, 'pen')
  const gr = stream(hash, 'paper')
  const { pendulums: machine, cycles } = buildMachine(fe, mr)
  const runs = buildRuns(fe, machine, cycles, pr)

  paper(g, W, H, S, pal, fe, gr)

  // Sampling only refines the polygon of the same analytic curve: denser on
  // bigger canvases, never a different figure.
  const fmax = Math.max(...machine.map(p => p.f))
  const perCycle = Math.ceil(fmax * Math.max(48, Math.min(S / 10, 260)))
  const traces = runs.map(run => trace(run, perCycle))

  // Fit every run together in the centred square.
  let x0 = Infinity
  let x1 = -Infinity
  let y0 = Infinity
  let y1 = -Infinity
  for (const pts of traces) {
    for (let i = 0; i < pts.length; i += 2) {
      x0 = Math.min(x0, pts[i])
      x1 = Math.max(x1, pts[i])
      y0 = Math.min(y0, pts[i + 1])
      y1 = Math.max(y1, pts[i + 1])
    }
  }
  // A flat figure is stretched on its thin axis, which is the same as giving
  // that pendulum a larger swing: the drawing never shrinks to a strip.
  const k = (FIT * S) / Math.max(x1 - x0, y1 - y0)
  const kx = Math.max(k, (MIN_ASPECT * FIT * S) / (x1 - x0))
  const ky = Math.max(k, (MIN_ASPECT * FIT * S) / (y1 - y0))
  const ox = W / 2 - kx * (x0 + x1) / 2
  const oy = H / 2 - ky * (y0 + y1) / 2

  g.globalCompositeOperation = pal.multiply ? 'multiply' : 'source-over'
  g.lineCap = 'butt'
  g.lineJoin = 'round'
  const w0 = PEN[fe.Pen].width * S
  const a0 = 0.8

  traces.forEach((pts, ri) => {
    const run = runs[ri]
    const n = pts.length / 2
    // One stroke per half swing of the slowest pendulum, each with its own pressure.
    const chunk = Math.max(8, Math.round(perCycle * Math.max(0.5, cycles / 240)))
    g.strokeStyle = pal.inks[ri]
    // Later runs sit on top: a lighter hand keeps the first one readable.
    const ink = a0 * 0.86 ** ri
    const [ph1, ph2, fq] = run.wobble
    for (let s = 0; s < n - 1; s += chunk) {
      const e = Math.min(n - 1, s + chunk)
      const u = ((s + e) / 2) / (n - 1)
      const fade = 1 - 0.62 * u ** 0.85
      const press = fade * (0.86 + 0.08 * Math.sin(TAU * (fq * u) + ph1) + 0.06 * Math.sin(TAU * (fq * 2.7 * u) + ph2))
      g.lineWidth = w0 * (0.5 + 0.5 * press)
      g.globalAlpha = ink * (0.25 + 0.75 * press)
      g.beginPath()
      g.moveTo(ox + kx * pts[s * 2], oy + ky * pts[s * 2 + 1])
      for (let i = s + 1; i <= e; i++)
        g.lineTo(ox + kx * pts[i * 2], oy + ky * pts[i * 2 + 1])
      g.stroke()
    }
    // The small blot where the pen was lowered onto the paper.
    g.fillStyle = pal.inks[ri]
    g.globalAlpha = ink * 0.9
    g.beginPath()
    g.arc(ox + kx * pts[0], oy + ky * pts[1], w0 * 1.5, 0, TAU)
    g.fill()
  })

  g.globalCompositeOperation = 'source-over'
  g.globalAlpha = 1
}

export default {
  slug: 'harmonograph',
  title: 'Harmonograph',
  summary: 'Damped pendulums tuned near a musical interval draw one long, fine pen line that precesses and spirals inwards.',
  order: 130,
  traits: TRAITS,
  features,
  render,
  // Seed-of-seeds 0x4a2a0a1a ("gallery" stream): the first hash found for each
  // palette × ratio pair, the Chalk fifth moved to the front as the cover.
  gallery: [
    '0x8019ac49e119230b6777b278edfe6360cf9ad284bc2021b91adb2e42aafce897',
    '0x31af855d58d1f5a6f8152612882000f895801cdf5e63cba274282f1b23fc97ca',
    '0x587ea9d58a5b4c679f3721489c957c7f96305404c877199fadbd47616ea1dd93',
    '0x5926fda78bebe6713599590ff81fe51d5f9f561b233244badd8006de851ea175',
    '0x5b20565f14950b9f535ae26298b5b030f8bdccf22567b17785cded963fb8d7d6',
    '0x3ed2b7d8584dd64bee67b591e3e869c4115929a169aceff165dde1e9cbc57911',
    '0x7dba8f4d9d11e406cc66bc26f2e99c2b324c90f7479644595d46d3d30169e7fe',
    '0x502f79b0bb8025632e302eead0af9fea49bd566eda9d486abc61ccae12af8d3c',
    '0x40207473e6e1467b84d3b95e42f435019dd0ae4840eedcd8c013ba96e198e40b',
    '0xc66d8d0da757e906c6633ee3aa0bb330faac08cf891dfdbd6d57977b48705516',
    '0xe98df3af28bdfd41b14900d6dbe06d1b6be5f4841dd1f816e5452da31c8b2b67',
    '0xf5a69061ad41f072b23412b0b1e2a265f8627f48dda9a4b6963c79e79e523e74',
  ],
} satisfies Series
