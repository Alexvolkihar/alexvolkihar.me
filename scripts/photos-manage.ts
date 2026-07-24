import type { PhotoExif } from '../photos/data'
import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { encode as blurhashEncode } from 'blurhash'
import ExifReader from 'exifreader'
import fg from 'fast-glob'
import { basename, join, parse } from 'pathe'
import sharp from 'sharp'
import { compressSharp } from './img-compress'

const folder = fileURLToPath(new URL('../photos', import.meta.url))

/** EXIF numbers come either raw or as a `[numerator, denominator]` rational. */
function exifNumber(value: unknown): number | undefined {
  if (Array.isArray(value))
    return Number(value[0]) / Number(value[1])
  if (typeof value === 'number')
    return value
  return undefined
}

/**
 * Pick the few shooting fields we display. Returns undefined when the camera
 * model is missing, which is the case for photos whose EXIF was stripped.
 */
function extractExif(tags: ExifReader.Tags): PhotoExif | undefined {
  const camera = tags.Model?.description?.trim()
  if (!camera)
    return undefined

  const exif: PhotoExif = { camera }

  const focalLength35mm = exifNumber(tags.FocalLengthIn35mmFilm?.value)
  const focalLengthReal = exifNumber(tags.FocalLength?.value)
  const focalLength = focalLength35mm ?? focalLengthReal
  if (focalLength)
    exif.focalLength = Math.round(focalLength)
  if (focalLengthReal && Math.round(focalLengthReal) !== exif.focalLength)
    exif.focalLengthReal = Math.round(focalLengthReal)

  const fNumber = exifNumber(tags.FNumber?.value)
  if (fNumber)
    exif.fNumber = Math.round(fNumber * 10) / 10

  if (tags.ExposureTime?.description)
    exif.exposureTime = String(tags.ExposureTime.description)

  const iso = Number(tags.ISOSpeedRatings?.value)
  if (iso)
    exif.iso = iso

  return exif
}

async function readConfig(configFile: string): Promise<Record<string, any>> {
  if (!existsSync(configFile))
    return {}
  return JSON.parse(await fs.readFile(configFile, 'utf-8'))
}

let files = (await fg('**/*.{jpg,png,jpeg}', {
  caseSensitiveMatch: false,
  absolute: true,
  cwd: fileURLToPath(new URL('../photos', import.meta.url)),
}))
  .sort((a, b) => a.localeCompare(b))

// Compress photos
for (const filepath of files) {
  if (basename(filepath).startsWith('p-')) {
    continue
  }
  let writepath = filepath
  let { ext } = parse(filepath.toLowerCase())
  if (ext === '.jpeg')
    ext = '.jpg'
  const buffer = await fs.readFile(filepath)
  const img = await sharp(buffer)
  const exif = await ExifReader.load(buffer)

  let title: string | undefined

  let dateRaw = exif.DateTimeOriginal?.value || exif.DateTime?.value || exif.DateCreated?.value
  dateRaw ||= new Date(await fs.stat(filepath).then(stat => stat.birthtime || stat.mtime)).toISOString()
  if (Array.isArray(dateRaw))
    dateRaw = dateRaw[0] as string
  dateRaw = String(dateRaw)

  // convert 2025:02:02 10:07:10 to date object
  let date = new Date(dateRaw.replace(/:/g, (x, idx) => {
    if (idx < 10)
      return '-'
    return x
  }))
  if (Number.isNaN(+date)) {
    date = new Date()
  }

  const timeDiff = Date.now() - +date
  // 1 hour
  if (timeDiff < 1000 * 60 * 60) {
    console.warn(`Date of ${filepath} is too recent: ${dateRaw}`)
    continue
  }

  const base = `p-${date.toISOString().replace(/[:.a-z]+/gi, '-')}`
  let index = 1
  while (existsSync(join(folder, `${base}${index}${ext}`.toLowerCase())))
    index++
  writepath = join(folder, `${base}${index}${ext}`.toLowerCase())

  const { outBuffer, percent, outFile } = await compressSharp(img, buffer, filepath, writepath)
  if (outFile !== filepath || percent > -0.10)
    await fs.writeFile(outFile, outBuffer)
  if (outFile !== filepath)
    await fs.unlink(filepath)

  // Capture EXIF from the original: compressSharp strips all metadata.
  const exifData = extractExif(exif)
  if (title || exifData) {
    const configFile = outFile.replace(/\.\w+$/, '.json')
    const config = await readConfig(configFile)
    if (title)
      config.text = title
    if (exifData)
      config.exif = exifData
    await fs.writeFile(configFile, JSON.stringify(config, null, 2))
  }
}

// Generate blurhash
files = (await fg('**/*.{jpg,png,jpeg}', {
  caseSensitiveMatch: false,
  absolute: true,
  cwd: fileURLToPath(new URL('../photos', import.meta.url)),
}))
  .sort((a, b) => a.localeCompare(b))

for (const filepath of files) {
  if (!basename(filepath).startsWith('p-')) {
    continue
  }
  const configFile = filepath.replace(/\.\w+$/, '.json')
  const config = await readConfig(configFile)
  if (config.blurhash) {
    continue
  }
  const buffer = await fs.readFile(filepath)
  const img = sharp(buffer)
  const { data, info } = await img
    .raw()
    .ensureAlpha()
    .resize(32, 32, { fit: 'cover' })
    .toBuffer({ resolveWithObject: true })
  const blurhash = blurhashEncode(new Uint8ClampedArray(data), info?.width, info?.height, 4, 4)
  config.blurhash = blurhash
  await fs.writeFile(configFile, JSON.stringify(config, null, 2))
}

// Backfill EXIF for photos processed before it was captured on the original.
// Photos whose EXIF was stripped simply get no `exif` key.
for (const filepath of files) {
  if (!basename(filepath).startsWith('p-')) {
    continue
  }
  const configFile = filepath.replace(/\.\w+$/, '.json')
  const config = await readConfig(configFile)
  if (config.exif) {
    continue
  }
  const exif = extractExif(await ExifReader.load(await fs.readFile(filepath)))
  if (!exif) {
    continue
  }
  config.exif = exif
  await fs.writeFile(configFile, JSON.stringify(config, null, 2))
}

// Clean up json files that don't have a corresponding image
for (const json of await fg('**/*.json', {
  caseSensitiveMatch: false,
  absolute: true,
  cwd: fileURLToPath(new URL('../photos', import.meta.url)),
})) {
  if (!existsSync(json.replace(/\.json$/, '.jpg')))
    await fs.unlink(json)
}
