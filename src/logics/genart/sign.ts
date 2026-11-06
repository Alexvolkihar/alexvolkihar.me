// Signature and metadata added to downloaded files only. The on-page canvases
// are never signed: this runs after `render()`, on the export canvas.

// The site monogram: the stroked "Am" of src/components/Logo.vue (viewBox 0 0 100 100).
const LOGO_PATH = 'M20 58C17 48 24 32 33 27C42 32 49 48 46 58C44 50 42 44 40 44C36 44 30 44 26 46C32 50 38 51 44 50C46.5 42 48.5 35 51.5 35C53.5 35 53 52 54 58C55 51 57 35 60 35C62.5 35 62 52 63 58C64 51 66 35 69 35C71.5 35 71 52 72 58C72.5 61 74 61 77 52'
const LOGO_STROKE = 3

// Bounding box of the path (SVG getBBox) grown by half the stroke width.
const BOX = { x0: 19.3 - LOGO_STROKE / 2, x1: 77 + LOGO_STROKE / 2, y0: 27 - LOGO_STROKE / 2, y1: 59.8 + LOGO_STROKE / 2 }

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
  ctx.strokeStyle = lum > 0.5 ? 'rgba(20, 20, 20, 0.6)' : 'rgba(240, 240, 240, 0.65)'
  ctx.lineWidth = LOGO_STROKE
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.stroke(new Path2D(LOGO_PATH))
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
