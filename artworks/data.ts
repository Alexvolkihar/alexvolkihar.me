// Archived renders: images of pieces that can no longer be re-rendered from
// a hash. Managed by `pnpm artworks` (scripts/artworks-manage.ts): drop an
// image here, run the script, then edit `name` in its .json if you like.

export interface ArtworkMeta {
  /** Display title. Safe to edit by hand: the script never overwrites it. */
  name?: string
  /** Series slug, when known. */
  series?: string
  /** YYYY-MM-DD, from the original file's modification time. */
  date?: string
  /** Size of the original export. */
  width?: number
  height?: number
  blurhash?: string
  note?: string
}

export interface Artwork extends ArtworkMeta {
  /** File base name, e.g. `a-courants-1x8k2q-1`. */
  file: string
  url: string
}

const meta = import.meta.glob<ArtworkMeta>('./*.json', { eager: true, import: 'default' })

const artworks: Artwork[] = Object.entries(
  import.meta.glob<string>('./*.{webp,jpg,png}', { eager: true, query: '?url', import: 'default' }),
)
  .map(([path, url]): Artwork => {
    const file = path.replace(/^\.\//, '').replace(/\.\w+$/, '')
    return { ...meta[`./${file}.json`], file, url }
  })
  .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '') || a.file.localeCompare(b.file))

export default artworks
