// "Contours" — topographic maps of imaginary terrain. The drawing lives in
// ../contours/: traits.ts (rarity table, palettes), terrain.ts (heightfield),
// march.ts (marching squares) and render.ts.

import type { Series } from '../types'
import { renderContours } from '../contours/render'
import { features, TRAITS } from '../contours/traits'

export default {
  slug: 'contours',
  title: 'Contours',
  summary: 'Survey sheets of terrain that does not exist: level lines, index contours, tints or hachures, lakes and shores.',
  order: 30,
  traits: TRAITS,
  features,
  render: renderContours,
  // Seed-of-seeds 0xc0a7c0a7 ("gallery" stream, 64-hex candidates): the first
  // hash found for each Style x Water pair, the two traits that change a map
  // the most, so the 12 tiles cover that whole grid (37 candidates drawn).
  // Only the order was chosen by eye: the clearest map first, as the cover.
  gallery: [
    '0x4b0ac24aa030661db4bcef7acaaaf4af2c9fb9bb0aee5ef7bea7cb5675334ccf', // Tinted / Archipelago
    '0x72a2d0e64ab7d42d13f4d2d78106fe51b5ef968282d701fadbf5a02bc96036d8', // Hachured / Coast
    '0x7c390bb8dc1baac098627974d9f560d8a3343de60d2d42d83e2fd4b48d6f281b', // Lines / Archipelago
    '0xd762778c5c3f6156c1616c30beea0b5518fdbbf87496952922a79ff2f39a6f0e', // Hachured / Archipelago
    '0x55ff940b15cc34b9c1eed71052ba0bc4ead50a6d9dea10c6683c65bc13fc0a36', // Lines / Coast
    '0xf03289c99ab30dbefdc85ec9cb6899dce47566c18addbb33c32402fe8a8564d7', // Tinted / Coast
    '0x0cc72c2c321202777710e5d708e7723937cf8b2c36bb97b3df2cb5fb95e78aa9', // Hachured / Lakes
    '0x15b784a8065266ff7f420da8e0cd4680f64aad075a961294a7202c5f0b6e508a', // Tinted / Lakes
    '0x809d6671bf71ba6340eb287ab69307e19e9412c645bcf391689d4eee29d0fcdc', // Lines / Lakes
    '0x94bb6b170d2628fedbb25945e212c4760bb2137c77d5d2b4cb51dfbae6581a81', // Hachured / None
    '0xea9f71e514053be27bab18c72867fd4b2bc532ae82c58d7f436ef709f95200af', // Lines / None
    '0x0866e190ddda841615dbf6abbb132bdbad4118f0c7da67bea1e1764b92f60928', // Tinted / None
  ],
} satisfies Series
