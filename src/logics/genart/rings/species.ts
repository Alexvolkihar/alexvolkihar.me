// Wood species for "Rings": colours and a little anatomy.
//
// The anatomy is simplified from wood identification keys: ring-porous woods
// (oak) open each year with a band of large earlywood vessels, semi-ring-porous
// woods (walnut) fade from early to late wood, diffuse-porous woods (birch)
// barely mark their rings, softwoods (cedar) have no vessels at all but a dark,
// dense band of latewood. Oak carries broad medullary rays, the others fine
// ones. Every palette is original.

export type RGB = readonly [number, number, number]

export interface Species {
  /** Heartwood, then sapwood: early and late wood. */
  earlyHeart: RGB
  lateHeart: RGB
  earlySap: RGB
  lateSap: RGB
  /** Heartwood limit as a fraction of the radius (0 = no coloured heart). */
  heart: number
  /** Ramp from early to late wood inside a ring, as a fraction of the ring. */
  lateRamp: number
  /** Mean latewood start inside a ring. */
  lateStart: number
  /** Vessels: band of the ring where they appear, density, size, darkness. */
  poreBand: number
  poreDensity: number
  poreSize: number
  pore: RGB
  poreAlpha: number
  /** Medullary rays: count around a log, width (short side), colour, opacity. */
  rays: number
  rayWidth: number
  ray: RGB
  rayAlpha: number
  /** Strength of the large-scale colour figure. */
  figure: number
  pith: RGB
  knot: RGB
  knotDark: RGB
  /** Bark: phloem, two layers of rhytidome, crevices; thickness in t units. */
  barkInner: RGB
  barkA: RGB
  barkB: RGB
  crevice: RGB
  barkT: number
  /** Birch-like bark: pale, peeling in thin papery layers. */
  paperBark: boolean
  crack: RGB
  /** Ground under the wood (a centre colour and a vignette colour), and its shadow. */
  bg: RGB
  bg2: RGB
  /** Gaps of a woodpile and seams between boards. */
  deep: RGB
  shadow: RGB
  /** Spalting: zone lines and bleached wood. */
  spalt: RGB
  bleach: RGB
  /** The relief-print finish: paper, ink and a second ink. */
  paper: RGB
  ink: RGB
  accent: RGB
}

function hex(h: string): RGB {
  const n = Number.parseInt(h.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export type SpeciesName = 'Oak' | 'Walnut' | 'Birch' | 'Cedar' | 'Ebony'

export const SPECIES: Record<SpeciesName, Species> = {
  Oak: {
    earlyHeart: hex('#d2a66e'),
    lateHeart: hex('#8e5c2e'),
    earlySap: hex('#e8d3a8'),
    lateSap: hex('#bf9a64'),
    heart: 0.74,
    lateRamp: 0.22,
    lateStart: 0.24,
    poreBand: 0.24,
    poreDensity: 0.62,
    poreSize: 0.5,
    pore: hex('#5c3c22'),
    poreAlpha: 0.75,
    rays: 230,
    rayWidth: 0.0022,
    ray: hex('#f0dcb0'),
    rayAlpha: 0.5,
    figure: 0.14,
    pith: hex('#6a4626'),
    knot: hex('#7a4c26'),
    knotDark: hex('#3b2512'),
    barkInner: hex('#b57a4a'),
    barkA: hex('#6e6255'),
    barkB: hex('#4f453c'),
    crevice: hex('#211b16'),
    barkT: 0.065,
    paperBark: false,
    crack: hex('#1e150e'),
    bg: hex('#e9e4da'),
    bg2: hex('#cdc5b7'),
    deep: hex('#2a2119'),
    shadow: hex('#3a2c1e'),
    spalt: hex('#1d1712'),
    bleach: hex('#ece5d2'),
    paper: hex('#f2ece0'),
    ink: hex('#2b1e14'),
    accent: hex('#a8462b'),
  },
  Walnut: {
    earlyHeart: hex('#80573a'),
    lateHeart: hex('#432818'),
    earlySap: hex('#e0c99f'),
    lateSap: hex('#c3a276'),
    heart: 0.8,
    lateRamp: 0.55,
    lateStart: 0.36,
    poreBand: 0.45,
    poreDensity: 0.32,
    poreSize: 0.42,
    pore: hex('#2c1a10'),
    poreAlpha: 0.6,
    rays: 130,
    rayWidth: 0.0008,
    ray: hex('#9a7658'),
    rayAlpha: 0.28,
    figure: 0.2,
    pith: hex('#2e1d12'),
    knot: hex('#3e2717'),
    knotDark: hex('#1d120a'),
    barkInner: hex('#8a5a3c'),
    barkA: hex('#3f3630'),
    barkB: hex('#2c2521'),
    crevice: hex('#110d0b'),
    barkT: 0.055,
    paperBark: false,
    crack: hex('#140d08'),
    bg: hex('#ddd6ca'),
    bg2: hex('#bdb3a4'),
    deep: hex('#1c1511'),
    shadow: hex('#2a1f17'),
    spalt: hex('#120c08'),
    bleach: hex('#c9b28f'),
    paper: hex('#efe7da'),
    ink: hex('#2b1a12'),
    accent: hex('#3d5d6e'),
  },
  Birch: {
    earlyHeart: hex('#dcc194'),
    lateHeart: hex('#a8814f'),
    earlySap: hex('#f0e1bf'),
    lateSap: hex('#bf9c68'),
    // no true heartwood: a brownish "false heart" in older stems
    heart: 0.45,
    lateRamp: 0.12,
    lateStart: 0.8,
    poreBand: 1,
    poreDensity: 0.22,
    poreSize: 0.3,
    pore: hex('#b89c70'),
    poreAlpha: 0.45,
    rays: 100,
    rayWidth: 0.0006,
    ray: hex('#f6ecd2'),
    rayAlpha: 0.3,
    figure: 0.2,
    pith: hex('#9c7a52'),
    knot: hex('#8a6440'),
    knotDark: hex('#4a3420'),
    barkInner: hex('#c78f5e'),
    barkA: hex('#f1ede4'),
    barkB: hex('#d7d0c3'),
    crevice: hex('#2b2723'),
    barkT: 0.04,
    paperBark: true,
    crack: hex('#2e2419'),
    bg: hex('#3a4248'),
    bg2: hex('#1e2327'),
    deep: hex('#161a1d'),
    shadow: hex('#06080a'),
    spalt: hex('#231c16'),
    bleach: hex('#f5efe2'),
    paper: hex('#eef0ec'),
    ink: hex('#1f2f42'),
    accent: hex('#b5523b'),
  },
  Cedar: {
    earlyHeart: hex('#cf8a5c'),
    lateHeart: hex('#6c2e18'),
    earlySap: hex('#f0dbb6'),
    lateSap: hex('#b88858'),
    heart: 0.76,
    lateRamp: 0.28,
    lateStart: 0.6,
    poreBand: 0,
    poreDensity: 0,
    poreSize: 0,
    pore: hex('#7c3a22'),
    poreAlpha: 0,
    rays: 90,
    rayWidth: 0.0005,
    ray: hex('#e0a882'),
    rayAlpha: 0.22,
    figure: 0.16,
    pith: hex('#5a2a16'),
    knot: hex('#6a321c'),
    knotDark: hex('#33170b'),
    barkInner: hex('#b0663e'),
    barkA: hex('#8c6c5a'),
    barkB: hex('#6a4e42'),
    crevice: hex('#2a1d17'),
    barkT: 0.045,
    paperBark: false,
    crack: hex('#2a130a'),
    bg: hex('#e3e2db'),
    bg2: hex('#c3c3b8'),
    deep: hex('#241812'),
    shadow: hex('#2e1d14'),
    spalt: hex('#1f120c'),
    bleach: hex('#e6cdb4'),
    paper: hex('#f3ede4'),
    ink: hex('#5a2216'),
    accent: hex('#2f5047'),
  },
  Ebony: {
    earlyHeart: hex('#33291f'),
    lateHeart: hex('#17110c'),
    earlySap: hex('#d2bb92'),
    lateSap: hex('#ae9369'),
    heart: 0.8,
    lateRamp: 0.45,
    lateStart: 0.5,
    poreBand: 1,
    poreDensity: 0.14,
    poreSize: 0.32,
    pore: hex('#0a0705'),
    poreAlpha: 0.6,
    rays: 100,
    rayWidth: 0.0005,
    ray: hex('#4a3d32'),
    rayAlpha: 0.25,
    figure: 0.55,
    pith: hex('#0b0806'),
    knot: hex('#140e0a'),
    knotDark: hex('#050302'),
    barkInner: hex('#7a6450'),
    barkA: hex('#4c443d'),
    barkB: hex('#37312c'),
    crevice: hex('#0b0a09'),
    barkT: 0.04,
    paperBark: false,
    crack: hex('#030202'),
    bg: hex('#1b1917'),
    bg2: hex('#0a0909'),
    deep: hex('#060505'),
    shadow: hex('#000000'),
    spalt: hex('#000000'),
    bleach: hex('#6a5a48'),
    paper: hex('#151311'),
    ink: hex('#ddcfae'),
    accent: hex('#c65a3c'),
  },
}
