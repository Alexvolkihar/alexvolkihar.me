// Contract shared by every generative series under src/logics/genart/series/.
//
// A series is a pure function of a hash: `features(hash)` and `render(...)`
// must never read Math.random, the clock or the environment. Every length is
// a fraction of the canvas short side, so a hash gives the same artwork at
// any size.

export type TraitTable = Record<string, ReadonlyArray<readonly [string, number]>>

export interface Series {
  /** URL segment: the page lives at /genart/<slug>. */
  slug: string
  title: string
  /** One sentence, shown on the /genart index card. */
  summary: string
  /** Sort key on the /genart index (ascending). */
  order: number
  /** Rarity table, decided before the drawing code. Shown on the series page. */
  traits: TraitTable
  features: (hash: string) => Record<string, string>
  render: (ctx: CanvasRenderingContext2D, width: number, height: number, hash: string) => void
  /** Fixed hashes shown in the series gallery. The first one is the index cover. */
  gallery: readonly string[]
}
