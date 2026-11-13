// Stage 3 of the Wash series: watercolour, pixel by pixel.
//
// A simplified, non-physical reading of Curtis, Anderson, Seims, Fleischer &
// Salesin, "Computer-Generated Watercolor" (SIGGRAPH 1997): there is no fluid
// simulation, but each band of the river is a separate wash whose pigment
// behaves the way their model makes it behave once dry:
// - edge darkening: pigment carried to the drying rim of a wash, so the
//   concentration rises sharply over the last fraction of a millimetre;
// - granulation: pigment settling in the valleys of the paper, stronger for
//   some pigments than others;
// - back-runs (blooms): water creeping back into a damp wash pushes the
//   pigment out, leaving a pale patch inside a dark, branching rim;
// - wet-in-wet: neighbouring washes bleeding into each other;
// - glazing: a second, broader layer of washes laid over the first.
// Pigments mix subtractively: each is an absorbance per channel and layers
// add up before the exponential (Beer–Lambert), a crude stand-in for the
// Kubelka–Munk compositing of the paper. On the dark ground the paints are
// treated as opaque gouache instead. The ink drawn beforehand is read back
// from the canvas and laid over the colour, skipping the peaks of the
// cold-pressed paper where the pen ran dry.

export interface BandTable {
  /** Band number of entry 0. */
  k0: number
  n: number
  on: Uint8Array
  /** Six numbers per band: pigment 1 and pigment 2 (absorbance, or colour on a dark ground). */
  pig: Float32Array
  dens: Float32Array
  gap: Float32Array
  gran: Float32Array
  bloom: Uint8Array
}

export interface PaintJob {
  W: number
  H: number
  S: number
  margin: number
  dark: boolean
  paper: readonly [number, number, number]
  /** Field grid, stride 8: L, |grad L|, stone sdf, island sdf, nLow, nMix, nBloom, wobble. */
  grid: Float32Array
  gw: number
  gx0: number
  gy0: number
  step: number
  paperH: Float32Array
  paperS: Float32Array
  /** Paper tile size in texels (a power of two); the tile spans the short side. */
  pn: number
  bands: BandTable
  glaze: BandTable
  glazeInv: number
  glazeOff: number
  rings: BandTable
  ringStep: number
  stone: readonly [number, number, number]
  stoneDens: number
  edgeE: number
  edgeW: number
  soft: number
  bleed: number
  bleedW: number
  gran: number
  dryGap: number
  bloomThr: number
  inkDry: number
}

const STRIDE = 8
const DARK_K = 2.4

// exp(-x) for x >= 0 by table lookup with linear interpolation (|error| < 2e-5)
const EXP_MAX = 16
const EXP_RES = 256
const EXP_LUT = new Float32Array(EXP_MAX * EXP_RES + 2)
for (let i = 0; i < EXP_LUT.length; i++)
  EXP_LUT[i] = Math.exp(-i / EXP_RES)
function expNeg(x: number): number {
  if (x <= 0)
    return 1
  if (x >= EXP_MAX)
    return 0
  const f = x * EXP_RES
  const i = f | 0
  return EXP_LUT[i] + (EXP_LUT[i + 1] - EXP_LUT[i]) * (f - i)
}

/**
 * Lay one wash of pigment p mixed with pigment q (offsets in `pig`) by m.
 * acc holds the absorbance (0..2) and, on a dark ground, the colour (3..5).
 */
function lay(acc: Float64Array, dark: boolean, pig: Float32Array, p: number, q: number, m: number, conc: number) {
  const cr = pig[p] + (pig[q] - pig[p]) * m
  const cg = pig[p + 1] + (pig[q + 1] - pig[p + 1]) * m
  const cb = pig[p + 2] + (pig[q + 2] - pig[p + 2]) * m
  if (dark) {
    const al = 1 - expNeg(conc * DARK_K)
    acc[3] += (cr - acc[3]) * al
    acc[4] += (cg - acc[4]) * al
    acc[5] += (cb - acc[5]) * al
  }
  else {
    acc[0] += cr * conc
    acc[1] += cg * conc
    acc[2] += cb * conc
  }
}

/** Paint rows [y0, y0 + rows) into `data` (RGBA, holding the ink on a transparent ground). */
export function paintRows(job: PaintJob, data: Uint8ClampedArray, y0: number, rows: number) {
  const { W, H, S, margin, dark, grid: G, gw, step, paperH, paperS, pn, bands, glaze, rings } = job
  const invS = 1 / S
  const invStep = 1 / step
  const px1 = 1 / S
  const softW = Math.max(job.soft, px1)
  const invSoft = 1 / softW
  const invEdge = 1 / job.edgeW
  const invBleed = job.bleed > 0 ? 1 / job.bleedW : 0
  const [pr, pg, pb] = job.paper
  const kb0 = bands.k0
  const kg0 = glaze.k0
  const acc = new Float64Array(6)
  const line = new Float32Array(gw * STRIDE)
  const pscale = pn / S
  const pmask = pn - 1

  const stonePig = new Float32Array([job.stone[0], job.stone[1], job.stone[2]])

  for (let row = 0; row < rows; row++) {
    const py = y0 + row
    const v = (py + 0.5 - H / 2) * invS
    const gyf = (v - job.gy0) * invStep
    const gj = Math.floor(gyf)
    const fy = gyf - gj
    // the two grid rows around this pixel row, blended once
    const r0 = gj * gw * STRIDE
    const r1 = r0 + gw * STRIDE
    for (let k = 0; k < line.length; k++)
      line[k] = G[r0 + k] + (G[r1 + k] - G[r0 + k]) * fy
    const pyf = (py + 0.5) * pscale
    const pjf = Math.floor(pyf)
    const pfy = pyf - pjf
    const pr0 = (pjf & pmask) * pn
    const pr1 = ((pjf + 1) & pmask) * pn
    const dyEdge = Math.min(py, H - 1 - py)
    for (let px = 0; px < W; px++) {
      const o4 = (row * W + px) * 4
      const u = (px + 0.5 - W / 2) * invS
      // paper relief
      const pxf = (px + 0.5) * pscale
      const pif = Math.floor(pxf)
      const pfx = pxf - pif
      const pc0 = pif & pmask
      const pc1 = (pif + 1) & pmask
      const q00 = (1 - pfx) * (1 - pfy)
      const q01 = pfx * (1 - pfy)
      const q10 = (1 - pfx) * pfy
      const q11 = pfx * pfy
      const ph = paperH[pr0 + pc0] * q00 + paperH[pr0 + pc1] * q01 + paperH[pr1 + pc0] * q10 + paperH[pr1 + pc1] * q11
      const shade = paperS[pr0 + pc0] * q00 + paperS[pr0 + pc1] * q01 + paperS[pr1 + pc0] * q10 + paperS[pr1 + pc1] * q11
      acc[0] = 0
      acc[1] = 0
      acc[2] = 0
      acc[3] = pr * shade
      acc[4] = pg * shade
      acc[5] = pb * shade
      const bd = Math.min(px, W - 1 - px, dyEdge) - margin
      if (bd >= 0) {
        const borderD = (bd + 0.5) * invS
        const gxf = (u - job.gx0) * invStep
        const gi = Math.floor(gxf)
        const fx = gxf - gi
        const o0 = gi * STRIDE
        const o1 = o0 + STRIDE
        const L = line[o0] + (line[o1] - line[o0]) * fx
        const grad = line[o0 + 1] + (line[o1 + 1] - line[o0 + 1]) * fx
        const rock = line[o0 + 2] + (line[o1 + 2] - line[o0 + 2]) * fx
        const isl = line[o0 + 3] + (line[o1 + 3] - line[o0 + 3]) * fx
        const nLow = line[o0 + 4] + (line[o1 + 4] - line[o0 + 4]) * fx
        const nMix = line[o0 + 5] + (line[o1 + 5] - line[o0 + 5]) * fx
        const nBloom = line[o0 + 6] + (line[o1 + 6] - line[o0 + 6]) * fx
        const wob = line[o0 + 7] + (line[o1 + 7] - line[o0 + 7]) * fx
        const valley = 0.5 - ph
        const vary = 0.5 + nLow
        let mix = (nMix - 0.32) * 2.8
        if (mix < 0)
          mix = 0
        else if (mix > 1)
          mix = 1
        const g = grad > 1e-3 ? grad : 1e-3
        const invG = 1 / g

        // glaze: a broad, pale second layer
        const gl = L * job.glazeInv + job.glazeOff
        let gk = Math.floor(gl) - kg0
        if (gk < 0)
          gk = 0
        else if (gk >= glaze.n)
          gk = glaze.n - 1
        if (glaze.on[gk]) {
          const gf = gl - Math.floor(gl)
          const gInv = invG / job.glazeInv
          let de = Math.min(gf, 1 - gf) * gInv - glaze.gap[gk] * (0.4 + wob)
          if (borderD < de)
            de = borderD
          if (de > 0) {
            let cov = de * invSoft
            if (cov > 1)
              cov = 1
            const conc = glaze.dens[gk] * vary * (1 + job.edgeE * 0.8 * expNeg(de * invEdge)) * (1 + glaze.gran[gk] * job.gran * valley * 2)
            lay(acc, dark, glaze.pig, gk * 6, gk * 6 + 3, mix, conc * cov)
          }
        }

        if (rock < 0 || isl < 0) {
          if (rock < 0) {
            // a stone: dark granular wash with a pooled rim
            let cov = -rock * S
            if (cov > 1)
              cov = 1
            const conc = job.stoneDens * vary * (1 + 1.2 * expNeg(-rock * invEdge * 0.7)) * (1 + 1.6 * valley)
            lay(acc, dark, stonePig, 0, 0, 0, conc * cov)
          }
          else {
            // an island: a sandy rim, then a mottled, granular interior
            const inner = -isl > job.ringStep
            const idx = inner ? 1 : 0
            let de = inner ? -isl - job.ringStep : Math.min(-isl, job.ringStep + isl)
            de -= rings.gap[idx] * (0.4 + wob)
            if (de > 0) {
              let cov = de * invSoft
              if (cov > 1)
                cov = 1
              let conc = rings.dens[idx] * vary * (1 + job.edgeE * expNeg(de * invEdge)) * (1 + rings.gran[idx] * valley * 2.5)
              if (inner)
                conc *= 0.45 + 1.1 * wob
              lay(acc, dark, rings.pig, idx * 6, idx * 6 + 3, mix, conc * cov)
            }
          }
        }
        else {
          const kf = Math.floor(L)
          let bi = kf - kb0
          if (bi < 0)
            bi = 0
          else if (bi >= bands.n)
            bi = bands.n - 1
          const f = L - kf
          const dLo = f * invG
          const dHi = (1 - f) * invG
          // stones keep a thin rim of white water around them
          const rockGap = Math.min(rock, isl) - 0.004
          if (bands.on[bi]) {
            const gp = bands.gap[bi] * (0.35 + wob * 1.3) + job.dryGap * (ph > 0.5 ? ph - 0.5 : 0)
            let de = Math.min(dLo, dHi) - gp
            if (borderD < de)
              de = borderD
            if (rockGap < de)
              de = rockGap
            if (de > 0) {
              let cov = de * invSoft
              if (cov > 1)
                cov = 1
              let conc = bands.dens[bi] * vary * (1 + job.edgeE * expNeg(de * invEdge)) * (1 + bands.gran[bi] * job.gran * valley * 2)
              if (bands.bloom[bi]) {
                const b = nBloom - job.bloomThr
                const ab = b < 0 ? -b : b
                conc *= 1 + 1.7 * expNeg(ab * 70)
                if (b > 0)
                  conc *= 0.32 + 0.68 * expNeg(b * 25)
              }
              lay(acc, dark, bands.pig, bi * 6, bi * 6 + 3, mix, conc * cov)
            }
          }
          if (invBleed > 0 && rockGap > 0) {
            // wet in wet: the neighbours' pigment creeps over the boundary
            const nb = f < 0.5 ? bi - 1 : bi + 1
            const d = f < 0.5 ? dLo : dHi
            if (nb >= 0 && nb < bands.n && bands.on[nb]) {
              const conc = bands.dens[nb] * vary * job.bleed * expNeg(d * invBleed) * (1 + bands.gran[nb] * job.gran * valley)
              lay(acc, dark, bands.pig, nb * 6, nb * 6 + 3, 1 - mix, conc)
            }
          }
        }
      }
      let oR = acc[3]
      let oG = acc[4]
      let oB = acc[5]
      if (!dark) {
        oR *= expNeg(acc[0])
        oG *= expNeg(acc[1])
        oB *= expNeg(acc[2])
      }
      // ink over the colour, broken on the peaks of the paper
      let ia = data[o4 + 3] / 255
      if (ia > 0) {
        const dry = job.inkDry * (ph > 0.45 ? ph - 0.45 : 0) * 2.2
        ia *= dry < 1 ? 1 - dry : 0
        const k = 1 / 255
        oR += (data[o4] * k - oR) * ia
        oG += (data[o4 + 1] * k - oG) * ia
        oB += (data[o4 + 2] * k - oB) * ia
      }
      data[o4] = oR * 255
      data[o4 + 1] = oG * 255
      data[o4 + 2] = oB * 255
      data[o4 + 3] = 255
    }
  }
}
