// Helpers shared by the export control, the collection and the series pages.

/** Aspect ratios offered by the export control and allowed in the collection. */
export const RATIOS = [
  { label: '1:1', w: 1, h: 1 },
  { label: '4:5', w: 4, h: 5 },
  { label: '2:3', w: 2, h: 3 },
  { label: '3:2', w: 3, h: 2 },
  { label: '16:9', w: 16, h: 9 },
  { label: '9:16', w: 9, h: 16 },
  { label: '21:9', w: 21, h: 9 },
  { label: 'A4', w: 1, h: Math.SQRT2 },
] as const

export type RatioLabel = typeof RATIOS[number]['label']

export function isRatioLabel(value: unknown): value is RatioLabel {
  return RATIOS.some(r => r.label === value)
}

/** Width divided by height of a ratio label (1 for an unknown label). */
export function ratioValue(label: string | undefined): number {
  const r = RATIOS.find(r => r.label === label)
  return r ? r.w / r.h : 1
}

/**
 * Neutral 6-character id for a piece, used in file names instead of its hash.
 * FNV-1a (32-bit) in base 36: stable for a hash, and it does not reveal it.
 */
export function shortId(hash: string): string {
  let h = 0x811C9DC5
  for (const ch of hash.toLowerCase()) {
    h ^= ch.charCodeAt(0)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36).padStart(6, '0').slice(-6)
}

/** URL- and file-safe slug of a display name: "Soleil d'encre" -> "soleil-d-encre". */
export function slugifyName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
