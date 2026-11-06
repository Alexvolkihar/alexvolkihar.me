// Small colour helpers for the Quilt series: hex in, `rgb()` strings out.

export type Rgb = readonly [number, number, number]

export function hex(c: string): Rgb {
  const n = Number.parseInt(c.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function css(c: Rgb, alpha = 1): string {
  const [r, g, b] = c.map(v => Math.round(Math.max(0, Math.min(255, v))))
  return alpha >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`
}

export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

/** Relative lightness in [0, 1] (Rec. 601 weights, good enough for contrast picks). */
export function luma(c: Rgb): number {
  return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255
}

const WHITE: Rgb = [255, 255, 255]
const BLACK: Rgb = [0, 0, 0]

/** Lighten (k > 0) towards white or darken (k < 0) towards black. */
export function shade(c: Rgb, k: number): Rgb {
  return k >= 0 ? mix(c, WHITE, k) : mix(c, BLACK, -k)
}

/** A tone that reads on top of `c`: darker on light grounds, lighter on dark ones. */
export function contrastTone(c: Rgb, k: number): Rgb {
  return luma(c) > 0.45 ? shade(c, -k) : shade(c, k)
}
