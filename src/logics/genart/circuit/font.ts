// A tiny single-stroke font for silkscreen legends, written for the series.
//
// Every glyph is a set of polylines on a 4 x 6 grid (x right, y down), the
// way vector plotters and photoplotters drew lettering with one pen width. No
// system font is ever used, so a hash draws the same letters everywhere.

// Each polyline is a run of two-digit points "xy" separated by spaces.
const GLYPHS: Record<string, readonly string[]> = {
  '0': ['10 30 41 45 36 16 05 01 10', '05 41'],
  '1': ['11 20 26', '06 46'],
  '2': ['01 10 30 41 42 06 46'],
  '3': ['01 10 30 41 42 33 13', '33 44 45 36 16 05'],
  '4': ['30 04 44', '30 36'],
  '5': ['40 00 02 32 43 45 36 06'],
  '6': ['30 10 01 05 16 36 45 44 33 03'],
  '7': ['00 40 16'],
  '8': ['13 02 01 10 30 41 42 33 13 04 05 16 36 45 44 33'],
  '9': ['43 13 02 01 10 30 41 45 36 16'],
  'A': ['06 02 20 42 46', '04 44'],
  'B': ['06 00 30 41 42 33 03', '33 44 45 36 06'],
  'C': ['41 30 10 01 05 16 36 45'],
  'D': ['00 20 41 45 26 06 00'],
  'E': ['40 00 06 46', '03 33'],
  'F': ['40 00 06', '03 33'],
  'G': ['41 30 10 01 05 16 36 45 43 23'],
  'H': ['00 06', '40 46', '03 43'],
  'I': ['10 30', '20 26', '16 36'],
  'J': ['20 40 45 36 16 05'],
  'K': ['00 06', '40 03 46'],
  'L': ['00 06 46'],
  'M': ['06 00 23 40 46'],
  'N': ['06 00 46 40'],
  'O': ['10 30 41 45 36 16 05 01 10'],
  'P': ['06 00 30 41 42 33 03'],
  'Q': ['10 30 41 45 36 16 05 01 10', '24 46'],
  'R': ['06 00 30 41 42 33 03', '23 46'],
  'S': ['41 30 10 01 02 13 33 44 45 36 16 05'],
  'T': ['00 40', '20 26'],
  'U': ['00 05 16 36 45 40'],
  'V': ['00 26 40'],
  'W': ['00 16 23 36 40'],
  'X': ['00 46', '40 06'],
  'Y': ['00 23 40', '23 26'],
  'Z': ['00 40 06 46'],
  '-': ['13 33'],
  '+': ['03 43', '21 25'],
  '.': ['25 26'],
  '/': ['40 06'],
  '_': ['06 46'],
  ' ': [],
}

// Parsed once: glyph -> polylines of [x, y] pairs.
const PARSED: Record<string, number[][]> = {}
for (const [ch, lines] of Object.entries(GLYPHS)) {
  PARSED[ch] = lines.map((l) => {
    const pts: number[] = []
    for (const tok of l.split(' '))
      pts.push(+tok[0], +tok[1])
    return pts
  })
}

/** Advance of one character, as a fraction of the text height. */
const ADVANCE = 5.4 / 6

export function textWidth(text: string, h: number): number {
  return text.length ? (text.length * ADVANCE - (ADVANCE - 4 / 6)) * h : 0
}

/**
 * Strokes `text` with its top-left corner at (x, y), letters `h` tall. The
 * caller sets strokeStyle and lineWidth. `vertical` turns the line of text
 * 90° anticlockwise (it then reads bottom to top, starting at (x, y + width)).
 */
export function strokeText(g: CanvasRenderingContext2D, text: string, x: number, y: number, h: number, vertical = false) {
  const k = h / 6
  const adv = ADVANCE * h
  const w = textWidth(text, h)
  g.beginPath()
  for (let i = 0; i < text.length; i++) {
    const glyph = PARSED[text[i]] ?? PARSED[' ']
    const ox = i * adv
    for (const pts of glyph) {
      for (let j = 0; j < pts.length; j += 2) {
        const gx = ox + pts[j] * k
        const gy = pts[j + 1] * k
        const px = vertical ? x + gy : x + gx
        const py = vertical ? y + w - gx : y + gy
        if (j === 0)
          g.moveTo(px, py)
        else
          g.lineTo(px, py)
      }
    }
  }
  g.stroke()
}
