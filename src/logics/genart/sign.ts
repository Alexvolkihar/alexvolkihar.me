// Signature and metadata added to downloaded files only. The on-page canvases
// are never signed: this runs after `render()`, on the export canvas.

// The site monogram, copied from public/logo.svg (viewBox 0 0 121.9 121.9).
const LOGO_PATH = 'M94.2,5.6C88.3-5,78.3,17.1,76.2,21.7c-4.4,10-7.3,20.1-9.6,30.7c-2.6-2.8-4.4-6.1-6.4-9.3c-1.1-2-1.6-7.8-4.9-4.8 c-1.4-2.4-2.1-5.7-5.4-6.3c-12.1-1.1-23.9,21.8-22.2,32.3c2.7,15.1,21.1,0.2,25.4-6.7c-0.4,3.8-0.4,9.1,3.4,10.9 c4.4,2,5.9-1.6,8.5-4.2c-1.5,15.7-3.4,32,1.8,47.4c2.4,8.8,10.9,11,11.8,0.2c1.2-13.4-2.1-26.5-6.1-39.1c-1.1-3.6-2.9-6.7-4-10.3 c-0.6-5.2,2.2-0.6,3.5,0.8c2.2,2.4,7.1,8.1,10.8,7.8c0.5-0.3-0.9-1.6-1.2-1.9c-3.2-4-7-7.7-10.4-11.6c6.9-10,13.6-20.9,18.2-32.4 C91.4,19.3,95.6,11.8,94.2,5.6z M53.8,48.1c-2.2,6.1-4.8,10.8-9.9,15c-14.3,12.5-16.4-2.3-9.7-13.7C40.2,36.8,52.9,25.6,53.8,48.1z M55.8,40.2c0.4,0.6,0.8,1.1,1.1,1.7C56.1,42,55.3,41,55.8,40.2z M65.3,59.5c-1.6,2.3-2.5,5.4-5.2,6.3c-2.2,0.6-3.7-1.1-4.1-3.1 c-1.2-6.6,0.9-13.1,1.8-19.5c2.2,4.2,4,8.4,6.5,12.6C64.8,56.9,66,58.3,65.3,59.5z M65.8,56.9c-0.3-0.2-0.3-0.6-0.4-0.9 C65.8,56.2,66.2,56.5,65.8,56.9z M69.4,68.5c4.3,13.1,7.2,26.8,6,40.5c-1.2,12-5,3.3-6.5-2.8c-3.1-13.4-1.7-27.2-0.7-40.8 C68.6,66.4,69.1,67.8,69.4,68.5z M91.1,8.3c-2.1,14.2-12.5,34.2-21.3,45.4c1.8-9.4,4.4-18.5,8-27.4C78.1,24.5,91.3-1.9,91.1,8.3z'

// Ink bounding box of the path, measured once by rasterising logo.svg.
const BOX = { x0: 27.5, x1: 94.4, y0: 2.7, y1: 119.1 }

/** Mean relative luminance (0..1) of a canvas region. */
function meanLuminance(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): number {
  const { data } = ctx.getImageData(Math.floor(x), Math.floor(y), Math.max(1, Math.ceil(w)), Math.max(1, Math.ceil(h)))
  let sum = 0
  let n = 0
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3] / 255
    // A transparent pixel reads as the white page it would be seen on.
    const r = data[i] * a + 255 * (1 - a)
    const g = data[i + 1] * a + 255 * (1 - a)
    const b = data[i + 2] * a + 255 * (1 - a)
    sum += (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
    n++
  }
  return n ? sum / n : 1
}

/**
 * Draws the monogram in the bottom-right corner: about 3.5 % of the short
 * side tall, 2.5 % from the edges, dark or light depending on what lies under it.
 */
export function drawSignature(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const short = Math.min(width, height)
  const glyphH = short * 0.035
  const scale = glyphH / (BOX.y1 - BOX.y0)
  const glyphW = (BOX.x1 - BOX.x0) * scale
  const margin = short * 0.025
  const left = width - margin - glyphW
  const top = height - margin - glyphH

  const pad = glyphH * 0.25
  const lum = meanLuminance(ctx, left - pad, top - pad, glyphW + 2 * pad, glyphH + 2 * pad)

  ctx.save()
  ctx.setTransform(scale, 0, 0, scale, left - BOX.x0 * scale, top - BOX.y0 * scale)
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = lum > 0.5 ? 'rgba(20, 20, 20, 0.55)' : 'rgba(240, 240, 240, 0.6)'
  ctx.fill(new Path2D(LOGO_PATH))
  ctx.restore()
}

let crcTable: Uint32Array | undefined

function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++)
        c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
      crcTable[n] = c >>> 0
    }
  }
  let crc = 0xFFFFFFFF
  for (const b of bytes)
    crc = crcTable[(crc ^ b) & 0xFF] ^ (crc >>> 8)
  return (crc ^ 0xFFFFFFFF) >>> 0
}

function latin1(text: string): Uint8Array {
  return Uint8Array.from(text, ch => ch.charCodeAt(0))
}

/** One tEXt chunk, or iTXt (UTF-8) when the text does not fit in Latin-1. */
function textChunk(keyword: string, text: string): Uint8Array {
  const isLatin1 = [...text].every(ch => ch.charCodeAt(0) <= 0xFF)
  const type = latin1(isLatin1 ? 'tEXt' : 'iTXt')
  const body = isLatin1
    ? [latin1(keyword), Uint8Array.of(0), latin1(text)]
    // keyword \0, compression flag 0, method 0, empty language \0, empty translated keyword \0, UTF-8 text
    : [latin1(keyword), Uint8Array.of(0, 0, 0, 0, 0), new TextEncoder().encode(text)]
  const length = body.reduce((s, b) => s + b.length, 0)

  const chunk = new Uint8Array(12 + length)
  const view = new DataView(chunk.buffer)
  view.setUint32(0, length)
  chunk.set(type, 4)
  let offset = 8
  for (const b of body) {
    chunk.set(b, offset)
    offset += b.length
  }
  view.setUint32(8 + length, crc32(chunk.subarray(4, 8 + length)))
  return chunk
}

/** Returns the PNG with text chunks inserted just before IEND. */
export async function addPngText(png: Blob, fields: Record<string, string>): Promise<Blob> {
  const bytes = new Uint8Array(await png.arrayBuffer())
  const view = new DataView(bytes.buffer)
  let offset = 8 // PNG signature
  let iend = -1
  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset)
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8))
    if (type === 'IEND') {
      iend = offset
      break
    }
    offset += 12 + length
  }
  if (iend < 0)
    return png

  const chunks = Object.entries(fields)
    .filter(([, v]) => v)
    .map(([k, v]) => textChunk(k, v))
  return new Blob([bytes.subarray(0, iend), ...chunks, bytes.subarray(iend)], { type: 'image/png' })
}
