// "Contours" — rarity table and palettes.
//
// The weights below were fixed before any drawing code was written. Never
// reorder an entry or change a weight: it re-rolls the whole edition.

import { stream, weighted } from '../random'

export const TRAITS = {
  Palette: [['Survey', 28], ['Ochre', 22], ['Glacier', 18], ['Lichen', 15], ['Nocturne', 12], ['Cinnabar', 5]],
  Relief: [['Gentle', 30], ['Hilly', 45], ['Alpine', 25]],
  Spacing: [['Wide', 25], ['Even', 50], ['Fine', 25]],
  Style: [['Lines', 40], ['Tinted', 35], ['Hachured', 25]],
  Water: [['None', 30], ['Lakes', 30], ['Coast', 30], ['Archipelago', 10]],
} as const

type TraitName = keyof typeof TRAITS
type TraitValue<K extends TraitName> = typeof TRAITS[K][number][0]

export type Features = { [K in TraitName]: TraitValue<K> }

/** Pure function of the hash, computed before (and without) any rendering. */
export function features(hash: string): Features {
  const r = stream(hash, 'features')
  return {
    Palette: weighted(r, TRAITS.Palette),
    Relief: weighted(r, TRAITS.Relief),
    Spacing: weighted(r, TRAITS.Spacing),
    Style: weighted(r, TRAITS.Style),
    Water: weighted(r, TRAITS.Water),
  }
}

export interface Palette {
  /** Paper, also the land colour of the Lines and Hachured styles. */
  paper: string
  /** Ordinary contours. */
  ink: string
  /** Index contours, frame and summit marks. */
  index: string
  /** Hypsometric ramp for the Tinted style, from the shore to the summits. */
  ramp: readonly string[]
  /** Shallow and deep water. */
  water: readonly [string, string]
  /** Shoreline and water lines. */
  waterInk: string
  /** Strength of the hill shading in the Tinted style. */
  shade: number
  dark: boolean
}

// Original palettes, loosely after the conventions of printed survey maps:
// brown relief, blue water, green-to-buff hypsometric tints.
export const PALETTES: Record<Features['Palette'], Palette> = {
  Survey: {
    paper: '#f2ecdf',
    ink: '#9a6a46',
    index: '#5b3519',
    ramp: ['#cbd8b6', '#dfe0b9', '#ebdcb2', '#e2c49c', '#d6b597', '#efe7da'],
    water: ['#c7dde2', '#9fc3cf'],
    waterInk: '#3b7590',
    shade: 0.85,
    dark: false,
  },
  Ochre: {
    paper: '#f4e7cf',
    ink: '#b0623a',
    index: '#6e2a10',
    ramp: ['#f0dcb4', '#ecc994', '#e3ac74', '#d48c58', '#bf6c42', '#a85434'],
    water: ['#b5d3cd', '#86b3ad'],
    waterInk: '#2b6766',
    shade: 0.8,
    dark: false,
  },
  Glacier: {
    paper: '#eef2f3',
    ink: '#71889a',
    index: '#2c4456',
    ramp: ['#d3dee3', '#dce5e9', '#e5ecef', '#eef2f4', '#f6f8f9', '#ffffff'],
    water: ['#c3d8e4', '#93b6cc'],
    waterInk: '#2a5d84',
    shade: 0.75,
    dark: false,
  },
  Lichen: {
    paper: '#ecebdd',
    ink: '#6f7a4f',
    index: '#2f3820',
    ramp: ['#bfcb9c', '#cdd3a5', '#dad8b0', '#d6c9a0', '#c9b893', '#ece6d6'],
    water: ['#c6d8d0', '#9ebfb3'],
    waterInk: '#3b6a5c',
    shade: 0.85,
    dark: false,
  },
  Nocturne: {
    paper: '#11161c',
    ink: '#a8996f',
    index: '#ecdcaa',
    ramp: ['#18212b', '#1c2732', '#212e3b', '#283745', '#304050', '#3a4a5b'],
    water: ['#0d1c28', '#081420'],
    waterInk: '#6ea4c4',
    shade: 0.9,
    dark: true,
  },
  Cinnabar: {
    paper: '#f4efe6',
    ink: '#d0583c',
    index: '#9a2c16',
    ramp: ['#f1ebe0', '#ece4d7', '#e7ddcd', '#e1d5c3', '#dbcdb9', '#f6f2ea'],
    water: ['#e3e2dc', '#cfd0cb'],
    waterInk: '#1d2730',
    shade: 0.75,
    dark: false,
  },
}
