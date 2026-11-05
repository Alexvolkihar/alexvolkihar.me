import type { RatioLabel } from './export'
import artworks from '../../../artworks/data'
import { collection } from '../../../data/genart-collection'
import { isRatioLabel, ratioValue, slugifyName } from './export'
import { allSeries } from './index'
import { isValidHash } from './random'

// Turns data/genart-collection.ts (live pieces) and artworks/ (archived
// renders) into one validated list for /genart/collection. A bad entry is
// skipped with a warning in dev; it never breaks the page.

interface PieceBase {
  /** URL key: /genart/collection?piece=<slug>. */
  slug: string
  name: string
  seriesSlug?: string
  seriesTitle?: string
  /** Width / height. */
  aspect: number
  year?: number
  note?: string
}

export interface LivePiece extends PieceBase {
  kind: 'live'
  number: number
  seriesSlug: string
  seriesTitle: string
  hash: string
  ratio: RatioLabel
  year: number
}

export interface ArchivedPiece extends PieceBase {
  kind: 'archived'
  url: string
  blurhash?: string
  width?: number
  height?: number
}

export type Piece = LivePiece | ArchivedPiece

function warn(message: string) {
  if (import.meta.env.DEV)
    console.warn(`[genart collection] ${message}`)
}

/** "n°01" */
export function formatNumber(n: number): string {
  return `n°${String(n).padStart(2, '0')}`
}

function uniqueSlug(base: string, used: Set<string>): string {
  let slug = base
  for (let i = 2; used.has(slug); i++)
    slug = `${base}-${i}`
  used.add(slug)
  return slug
}

function buildPieces(): Piece[] {
  const used = new Set<string>()
  const numbers = new Set<number>()
  const pieces: Piece[] = []

  collection.forEach((entry, index) => {
    const where = `entry #${index + 1} (${JSON.stringify(entry?.name ?? '')})`
    const name = typeof entry?.name === 'string' ? entry.name.trim() : ''
    if (!name)
      return warn(`${where}: missing name, skipped.`)
    const series = allSeries.find(s => s.slug === entry.series)
    if (!series)
      return warn(`${where}: unknown series ${JSON.stringify(entry.series)}, skipped.`)
    if (!isValidHash(entry.hash))
      return warn(`${where}: invalid hash, skipped.`)
    if (typeof entry.date !== 'string' || !/^\d{4}-(?:0[1-9]|1[0-2])$/.test(entry.date))
      return warn(`${where}: date must be YYYY-MM, skipped.`)

    let ratio: RatioLabel = '1:1'
    if (entry.ratio !== undefined) {
      if (isRatioLabel(entry.ratio))
        ratio = entry.ratio
      else
        warn(`${where}: unknown ratio ${JSON.stringify(entry.ratio)}, using 1:1.`)
    }

    const number = Number.isInteger(entry.number) && entry.number! > 0 ? entry.number! : index + 1
    if (numbers.has(number))
      warn(`${where}: number ${number} is used twice.`)
    numbers.add(number)

    pieces.push({
      kind: 'live',
      slug: uniqueSlug(slugifyName(name) || `piece-${number}`, used),
      name,
      number,
      seriesSlug: series.slug,
      seriesTitle: series.title,
      hash: entry.hash.toLowerCase(),
      ratio,
      aspect: ratioValue(ratio),
      year: Number(entry.date.slice(0, 4)),
      note: entry.note,
    })
  })

  for (const art of artworks) {
    const name = art.name?.trim() || art.file
    const series = allSeries.find(s => s.slug === art.series)
    const aspect = art.width && art.height ? art.width / art.height : 1
    pieces.push({
      kind: 'archived',
      slug: uniqueSlug(slugifyName(name) || art.file, used),
      name,
      seriesSlug: series?.slug,
      seriesTitle: series?.title,
      aspect,
      year: art.date ? Number(art.date.slice(0, 4)) : undefined,
      note: art.note,
      url: art.url,
      blurhash: art.blurhash,
      width: art.width,
      height: art.height,
    })
  }

  // Numbered pieces in catalogue order, archived renders after them.
  const live = pieces.filter((p): p is LivePiece => p.kind === 'live').sort((a, b) => a.number - b.number)
  return [...live, ...pieces.filter(p => p.kind === 'archived')]
}

export const pieces: Piece[] = buildPieces()
