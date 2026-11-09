import type { RatioLabel } from '~/logics/genart/export'

// The numbered collection shown at /genart/collection. Every piece is
// re-rendered live from its series and hash, so only these few fields are
// stored. The hash never appears on the collection page: pieces are addressed
// by a slug of their name (/genart/collection?piece=<slug>).
//
// To add a piece: open it on its series page in `pnpm dev`, press
// "Copy for collection" (dev only) and paste the entry below. On the deployed
// site, the owner can also sign in and press "Add to collection", which
// appends an entry here through api/collection.ts (see docs/genart-admin.md):
// keep this file a single exported array of flat object literals.

export interface CollectionEntry {
  /** Display title, e.g. "Soleil d'encre". Also gives the URL slug. */
  name: string
  /** Series slug, e.g. 'strata' (the page /genart/<series>). */
  series: string
  /** Full hash of the piece (0x + 64 hex). */
  hash: string
  /** YYYY-MM, when the piece entered the collection. */
  date: string
  /** Catalogue number. Defaults to the position in this list (n°01, n°02…). */
  number?: number
  /** Aspect ratio of the piece. Defaults to '1:1'. */
  ratio?: RatioLabel
  /** Optional one-line note shown under the title. */
  note?: string
}

export const collection: CollectionEntry[] = [
  {
    name: 'Soleil d\'encre',
    series: 'strata',
    hash: '0x9f317995fc65b45a29501633ef797a0ece50b800bfc2d14fa83a04ec394c32f3',
    ratio: '16:9',
    date: '2026-11',
  },
  {
    name: 'Undertow',
    series: 'courants',
    hash: '0x9d958623d25beed6275af7e2c3b7ae41c2b77f7464c8e72e8710eed0da6a5f2a',
    ratio: '4:5',
    date: '2026-11',
  },
  {
    name: 'Fault Study',
    series: 'fault-lines',
    hash: '0x20c7a90b2d892bed9ecf896640cd16d289d7c3ab29299d3ba469d9f2a2a3ad47',
    ratio: '1:1',
    date: '2026-11',
  },
  {
    name: 'High Ground',
    series: 'contours',
    hash: '0x4b0ac24aa030661db4bcef7acaaaf4af2c9fb9bb0aee5ef7bea7cb5675334ccf',
    ratio: '3:2',
    date: '2026-11',
  },
  {
    name: 'Crowd',
    series: 'packing',
    hash: '0xfbda384abebd165ed6f01eeab14342b6dc679e789b88230ac931404f4fd9155a',
    ratio: '1:1',
    date: '2026-11',
  },
  {
    name: 'Reef',
    series: 'coral',
    hash: '0xa504d2557181ea5b95d77e78c677495c2e9b8a582a066f34117beb24ea35cf6e',
    ratio: '2:3',
    date: '2026-11',
  },
  {
    name: 'ShadesOfFonts',
    series: 'asemic',
    hash: '0x23bd9b5ae629a43712924c76391b385f4ffbcb25d30fcd5cbb47033ffd6afce4',
    ratio: '1:1',
    date: '2026-11',
  },
  {
    name: 'Wavesdigo',
    series: 'marbling',
    hash: '0x4b6b134bc2d7d48418ba6b76cb80f32762abb41674577588067757264ccb23ed',
    ratio: '1:1',
    date: '2026-11',
  },
]
