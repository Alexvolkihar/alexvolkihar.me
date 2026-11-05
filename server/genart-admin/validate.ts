// Strict server-side validation of a "add to collection" request body.
// The client checks nothing that matters: this is the gate.

// Same rule as isValidHash() in src/logics/genart/random.ts.
export const HASH_RE = /^0x[0-9a-f]{16,64}$/i
export const SERIES_RE = /^[a-z0-9-]{1,40}$/

// Same labels as RATIOS in src/logics/genart/export.ts (kept in sync by hand:
// the functions do not import site code; the admin test checks they match).
export const RATIO_LABELS = ['1:1', '4:5', '2:3', '3:2', '16:9', '9:16', '21:9', 'A4'] as const
export type Ratio = typeof RATIO_LABELS[number]

export const NAME_MAX = 60
export const NOTE_MAX = 200

export interface NewEntry {
  name: string
  series: string
  hash: string
  ratio: Ratio
  note?: string
}

const ALLOWED_KEYS = new Set(['name', 'series', 'hash', 'ratio', 'note'])

/**
 * NFC, no control/format characters that could hide text or break the file
 * (C0/C1 controls, line/paragraph separators, bidi overrides and isolates),
 * no braces (they delimit entries in the data file), collapsed whitespace.
 */
export function cleanText(value: string): string {
  return value
    .normalize('NFC')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, ' ')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export type Validation = { ok: true, entry: NewEntry } | { ok: false, error: string }

export function validateEntry(body: unknown): Validation {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    return { ok: false, error: 'Body must be a JSON object' }
  const b = body as Record<string, unknown>
  for (const key of Object.keys(b)) {
    if (!ALLOWED_KEYS.has(key))
      return { ok: false, error: `Unknown field: ${key.slice(0, 20)}` }
  }

  if (typeof b.series !== 'string' || !SERIES_RE.test(b.series))
    return { ok: false, error: 'Invalid series' }
  if (typeof b.hash !== 'string' || !HASH_RE.test(b.hash))
    return { ok: false, error: 'Invalid hash' }
  if (typeof b.name !== 'string')
    return { ok: false, error: 'Invalid name' }
  const name = cleanText(b.name)
  if (name.length < 1 || [...name].length > NAME_MAX)
    return { ok: false, error: `Name must be 1 to ${NAME_MAX} characters` }

  const ratio = b.ratio ?? '1:1'
  if (typeof ratio !== 'string' || !(RATIO_LABELS as readonly string[]).includes(ratio))
    return { ok: false, error: 'Invalid ratio' }

  let note: string | undefined
  if (b.note !== undefined && b.note !== null && b.note !== '') {
    if (typeof b.note !== 'string')
      return { ok: false, error: 'Invalid note' }
    note = cleanText(b.note) || undefined
    if (note && [...note].length > NOTE_MAX)
      return { ok: false, error: `Note must be at most ${NOTE_MAX} characters` }
  }

  return { ok: true, entry: { name, series: b.series, hash: b.hash.toLowerCase(), ratio: ratio as Ratio, note } }
}
