// Imports archived generative renders into artworks/ for /genart/collection.
//
// Use it only for pieces that can no longer be re-rendered from a hash
// (a live piece belongs in data/genart-collection.ts). Drop PNG/JPEG/WebP
// files into artworks/, then run:
//
//   pnpm artworks                         # series guessed from the file name
//   pnpm artworks --series courants       # set the series of the new files
//   pnpm artworks --name "Night Swim"     # set the name of the new files
//
// Each new file is resized (long side <= 2000px), re-encoded as WebP, renamed
// `a-<series>-<id>-<n>.webp` and gets a sidecar JSON. The `name` in that JSON
// can be edited by hand: the script never overwrites it. Re-running only
// fills missing blurhashes, so it is safe to run any time.

import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { encode as blurhashEncode } from 'blurhash'
import fg from 'fast-glob'
import { basename, join, parse } from 'pathe'
import sharp from 'sharp'
import { shortId, slugifyName } from '../src/logics/genart/export'
import { compressSharp } from './img-compress'

const folder = fileURLToPath(new URL('../artworks', import.meta.url))
const seriesFolder = fileURLToPath(new URL('../src/logics/genart/series', import.meta.url))
const LONG_SIDE = 2000

interface ArtworkJson {
  name?: string
  series?: string
  date?: string
  width?: number
  height?: number
  blurhash?: string
  note?: string
}

const { values: args } = parseArgs({
  options: {
    series: { type: 'string' },
    name: { type: 'string' },
  },
})

/** slug -> title, read from the `slug:` / `title:` lines of each series file. */
async function seriesTitles(): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  for (const file of await fg('*.ts', { cwd: seriesFolder, absolute: true })) {
    const src = await fs.readFile(file, 'utf-8')
    const m = src.match(/slug: *'([^']+)',[ \t]*\r?\n[ \t]*title: *'((?:[^'\\]|\\.)+)'/)
    if (m)
      map.set(m[1], m[2].replace(/\\'/g, '\''))
  }
  return map
}

/**
 * What the file name tells us. Handles the site's exports
 * (`<series>-<hash or 8 hex>-<w>x<h>`) and bare `0x<hex>` files.
 */
function parseFileName(base: string): { series?: string, hex?: string, fullHash: boolean } {
  const exported = base.match(/^([a-z0-9]+(?:-[a-z0-9]+)*?)-(0x[0-9a-f]{16,64}|[0-9a-f]{8})-\d+x\d+$/i)
  if (exported) {
    const hex = exported[2].toLowerCase().replace(/^0x/, '')
    return { series: exported[1].toLowerCase(), hex, fullHash: hex.length === 64 }
  }
  const bare = base.match(/^0x([0-9a-f]{16,64})$/i)
  if (bare)
    return { hex: bare[1].toLowerCase(), fullHash: bare[1].length === 64 }
  return { fullHash: false }
}

async function readJson(file: string): Promise<ArtworkJson> {
  if (!existsSync(file))
    return {}
  return JSON.parse(await fs.readFile(file, 'utf-8'))
}

async function writeJson(file: string, data: ArtworkJson) {
  await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`)
}

async function blurhashOf(file: string): Promise<string> {
  const { data, info } = await sharp(await fs.readFile(file))
    .raw()
    .ensureAlpha()
    .resize(32, 32, { fit: 'inside' })
    .toBuffer({ resolveWithObject: true })
  return blurhashEncode(new Uint8ClampedArray(data), info.width, info.height, 4, 4)
}

const titles = await seriesTitles()
function images() {
  return fg('*.{png,jpg,jpeg,webp}', { cwd: folder, absolute: true, caseSensitiveMatch: false })
    .then(files => files.sort((a, b) => a.localeCompare(b)))
}

let imported = 0
let hashed = 0

// 1. Import new files (anything not yet named `a-…`).
for (const filepath of await images()) {
  if (basename(filepath).startsWith('a-'))
    continue

  const { name: base } = parse(filepath)
  const parsed = parseFileName(base)
  const series = (args.series ?? parsed.series)?.toLowerCase()
  if (series && !titles.has(series))
    console.warn(`  ! ${basename(filepath)}: unknown series "${series}" (kept as is)`)
  if (parsed.fullHash && series && titles.has(series))
    console.warn(`  ! ${basename(filepath)}: full hash known, this piece can be re-rendered live: consider data/genart-collection.ts instead`)

  // A neutral id: the hash itself never ends up in the file name or the JSON.
  const id = shortId(parsed.hex ?? base)
  const title = series ? (titles.get(series) ?? series[0].toUpperCase() + series.slice(1)) : undefined
  const name = args.name ?? (title && parsed.hex ? `${title} · ${id}` : base)

  const prefix = `a-${slugifyName(series ?? 'misc') || 'misc'}-${id}-`
  let index = 1
  while (existsSync(join(folder, `${prefix}${index}.webp`)))
    index++
  const outFile = join(folder, `${prefix}${index}.webp`)

  const buffer = await fs.readFile(filepath)
  const img = sharp(buffer)
  const { width, height } = await img.metadata()
  const stat = await fs.stat(filepath)
  const { outBuffer, size, outSize } = await compressSharp(img, buffer, filepath, outFile, { longSide: LONG_SIDE, format: 'webp' })
  await fs.writeFile(outFile, outBuffer)
  await fs.unlink(filepath)

  const jsonFile = outFile.replace(/\.webp$/, '.json')
  const json = await readJson(jsonFile)
  json.name ??= name
  if (series)
    json.series ??= series
  json.date ??= stat.mtime.toISOString().slice(0, 10)
  json.width ??= width
  json.height ??= height
  await writeJson(jsonFile, json)

  imported++
  console.log(`  + ${basename(filepath)} -> ${basename(outFile)}  "${json.name}"  ${(size / 1024).toFixed(0)}K -> ${(outSize / 1024).toFixed(0)}K`)
}

// 2. Fill missing blurhashes (also picks up JSON files edited by hand).
for (const filepath of await images()) {
  if (!basename(filepath).startsWith('a-'))
    continue
  const jsonFile = filepath.replace(/\.\w+$/, '.json')
  const json = await readJson(jsonFile)
  if (json.blurhash)
    continue
  json.blurhash = await blurhashOf(filepath)
  json.name ??= parse(filepath).name
  await writeJson(jsonFile, json)
  hashed++
  console.log(`  ~ blurhash ${basename(filepath)}`)
}

// 3. Drop sidecars whose image is gone.
const kept = new Set((await images()).map(f => parse(f).name))
for (const json of await fg('*.json', { cwd: folder, absolute: true })) {
  if (!kept.has(parse(json).name)) {
    await fs.unlink(json)
    console.log(`  - removed orphan ${basename(json)}`)
  }
}

console.log(imported || hashed
  ? `artworks: ${imported} imported, ${hashed} blurhash(es) added`
  : 'artworks: nothing to do')
