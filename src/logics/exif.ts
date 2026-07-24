import type { PhotoExif } from '../../photos/data'

/**
 * One-line, label-less shooting summary.
 * e.g. `RICOH GR IIIx HDF · 40mm · ƒ/2.8 · 1/40s · ISO 2500`
 */
export function formatExif(exif?: PhotoExif): string | undefined {
  if (!exif?.camera)
    return undefined

  const parts = [exif.camera]
  if (exif.focalLength) {
    parts.push(exif.focalLengthReal
      ? `${exif.focalLengthReal}mm (${exif.focalLength}mm)`
      : `${exif.focalLength}mm`)
  }
  if (exif.fNumber)
    parts.push(`ƒ/${exif.fNumber}`)
  if (exif.exposureTime)
    parts.push(`${exif.exposureTime}s`)
  if (exif.iso)
    parts.push(`ISO ${exif.iso}`)

  return parts.join(' · ')
}
