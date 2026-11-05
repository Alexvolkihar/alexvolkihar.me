import type { Series } from './types'

// Every file in ./series/ default-exports one Series. Adding a series is
// adding a file there plus its page in pages/genart/<slug>.md: no list to edit.
const modules = import.meta.glob<{ default: Series }>('./series/*.ts', { eager: true })

// A series file that is still being written (no default export yet, or an
// empty gallery) is skipped instead of breaking the whole index.
function isComplete(s: Series | undefined): s is Series {
  return !!s && typeof s.render === 'function' && typeof s.features === 'function' && s.gallery?.length > 0
}

export const allSeries: Series[] = Object.values(modules)
  .map(m => m.default)
  .filter(isComplete)
  .sort((a, b) => a.order - b.order)

export function getSeries(slug: string): Series {
  const s = allSeries.find(s => s.slug === slug)
  if (!s)
    throw new Error(`Unknown generative series: ${slug}`)
  return s
}

export type { Series, TraitTable } from './types'
