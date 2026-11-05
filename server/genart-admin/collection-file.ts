// Pure text edit of data/genart-collection.ts: find the exported array,
// detect duplicates, append one entry. Anything unexpected throws a
// FileShapeError so the caller answers 500 instead of committing a broken file.

import type { NewEntry } from './validate.js'

export class FileShapeError extends Error {}

const ARRAY_START = 'export const collection: CollectionEntry[] = ['

interface ParsedEntry {
  series?: string
  hash?: string
  number?: number
}

interface ParsedFile {
  /** Text up to and including the opening "[". */
  head: string
  /** Text between "[" and the closing "]", without the newline before "]". */
  body: string
  /** The closing "]" and whatever trails it (whitespace only). */
  tail: string
  entries: ParsedEntry[]
}

function field(block: string, name: string): string | undefined {
  // Single-quoted string literal, allowing escaped characters inside.
  const m = block.match(new RegExp(`^\\s*${name}:\\s*'((?:[^'\\\\\\n]|\\\\.)*)',?\\s*$`, 'm'))
  return m?.[1]
}

export function parseCollectionFile(text: string): ParsedFile {
  if (text.includes('\r'))
    throw new FileShapeError('unexpected line endings')
  const start = text.indexOf(ARRAY_START)
  if (start < 0 || text.includes(ARRAY_START, start + 1))
    throw new FileShapeError('array declaration not found exactly once')
  const head = text.slice(0, start + ARRAY_START.length)
  const rest = text.slice(head.length)

  // The array must be the last statement of the file: "...\n]\n".
  const m = rest.match(/^([\s\S]*?)\n?\](\s*)$/)
  if (!m)
    throw new FileShapeError('closing bracket not found at the end of the file')
  const body = m[1]
  const tail = `]${m[2]}`

  // Each entry is a flat object literal "{ ... }" (no nested braces); between
  // entries only commas and whitespace (and line comments) are allowed.
  const entries: ParsedEntry[] = []
  let leftover = body
  const blocks = body.match(/\{[^{}]*\}/g) ?? []
  for (const block of blocks) {
    leftover = leftover.replace(block, '')
    const numberText = block.match(/^\s*number:\s*(\d+),?\s*$/m)?.[1]
    entries.push({
      series: field(block, 'series'),
      hash: field(block, 'hash')?.toLowerCase(),
      number: numberText ? Number(numberText) : undefined,
    })
  }
  const stripped = leftover.replace(/^\s*\/\/.*$/gm, '')
  if (/[^\s,]/.test(stripped))
    throw new FileShapeError('unexpected content inside the array')

  return { head, body, tail, entries }
}

/** Escape for a TypeScript single-quoted string (control characters are already gone). */
export function tsString(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, '\\\'')}'`
}

export function hasEntry(file: ParsedFile, series: string, hash: string): boolean {
  const h = hash.toLowerCase()
  return file.entries.some(e => e.series === series && e.hash === h)
}

/** Catalogue number the new entry gets (position, or past the highest explicit number). */
export function nextNumber(file: ParsedFile): { number: number, explicit: boolean } {
  const used = new Set(file.entries.map((e, i) => e.number ?? i + 1))
  const positional = file.entries.length + 1
  if (!used.has(positional))
    return { number: positional, explicit: false }
  return { number: Math.max(...used) + 1, explicit: true }
}

export function appendEntry(text: string, entry: NewEntry, date: string): { text: string, number: number } {
  const file = parseCollectionFile(text)
  if (hasEntry(file, entry.series, entry.hash))
    throw new FileShapeError('duplicate entry')
  const { number, explicit } = nextNumber(file)

  const lines = [
    '  {',
    `    name: ${tsString(entry.name)},`,
    `    series: ${tsString(entry.series)},`,
    `    hash: ${tsString(entry.hash)},`,
    `    ratio: ${tsString(entry.ratio)},`,
    `    date: ${tsString(date)},`,
  ]
  if (explicit)
    lines.push(`    number: ${number},`)
  if (entry.note)
    lines.push(`    note: ${tsString(entry.note)},`)
  lines.push('  },')

  let body = file.body.replace(/\s+$/, '')
  if (body && !body.endsWith(','))
    body += ','
  const next = `${file.head}${body}\n${lines.join('\n')}\n${file.tail}`

  // Re-parse what we are about to commit: one more entry, ours exactly once.
  const check = parseCollectionFile(next)
  const ours = check.entries.filter(e => e.series === entry.series && e.hash === entry.hash)
  if (check.entries.length !== file.entries.length + 1 || ours.length !== 1)
    throw new FileShapeError('post-edit check failed')
  return { text: next, number }
}
