/**
 * Numeric color math — the canvas counterpart of our CSS colors.
 *
 * SVG and the DOM can hand a browser `hsl(var(--chart-treasury))` or
 * `color-mix(in oklab, … 82%, white)` and let it resolve them. A canvas cannot:
 * it needs literal channel values. This module reproduces, in JS, exactly what
 * the browser does for those two constructs, so a canvas-painted chart lands on
 * the same pixels as its SVG sibling.
 *
 * Pure and DOM-free by design (the CSS var read lives in ./tokens.ts) so the
 * math stays unit-testable without a browser.
 */

export type Rgb = [number, number, number]

export const WHITE: Rgb = [255, 255, 255]
export const BLACK: Rgb = [0, 0, 0]

/** Parse the bare HSL triplet our tokens store, e.g. `"217 91% 60%"`. */
export function parseHslTriplet(value: string): Rgb | null {
  const m = value.trim().match(/^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/)
  if (!m) return null
  return hslToRgb(Number(m[1]), Number(m[2]), Number(m[3]))
}

/** HSL (h in degrees, s/l in percent) → sRGB 0-255. */
export function hslToRgb(h: number, s: number, l: number): Rgb {
  const sat = s / 100
  const lig = l / 100
  const c = (1 - Math.abs(2 * lig - 1)) * sat
  const hp = (((h % 360) + 360) % 360) / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  const [r, g, b] =
    hp < 1
      ? [c, x, 0]
      : hp < 2
        ? [x, c, 0]
        : hp < 3
          ? [0, c, x]
          : hp < 4
            ? [0, x, c]
            : hp < 5
              ? [x, 0, c]
              : [c, 0, x]
  const m = lig - c / 2
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ]
}

/* ── OKLab ────────────────────────────────────────────────────────────────── */

const toLinear = (c: number) => {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

const toSrgb = (v: number) => {
  const c = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055
  return Math.max(0, Math.min(255, Math.round(c * 255)))
}

type Oklab = [number, number, number]

function rgbToOklab([r, g, b]: Rgb): Oklab {
  const lr = toLinear(r)
  const lg = toLinear(g)
  const lb = toLinear(b)
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

function oklabToRgb([L, A, B]: Oklab): Rgb {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3
  return [
    toSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    toSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    toSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ]
}

/**
 * The JS twin of `color-mix(in oklab, a <weightA>%, b)`. Both colors are opaque
 * here, so the spec's premultiplied-alpha step collapses to a plain lerp of the
 * OKLab coordinates.
 *
 * @param weightA share of `a` in the mix, 0-1.
 */
export function mixOklab(a: Rgb, b: Rgb, weightA: number): Rgb {
  const w = Math.max(0, Math.min(1, weightA))
  const [l1, a1, b1] = rgbToOklab(a)
  const [l2, a2, b2] = rgbToOklab(b)
  return oklabToRgb([
    l1 * w + l2 * (1 - w),
    a1 * w + a2 * (1 - w),
    b1 * w + b2 * (1 - w),
  ])
}

/** Lighten toward white in OKLab. `amount` 0 = unchanged, 1 = white. */
export const lighten = (color: Rgb, amount: number): Rgb =>
  mixOklab(color, WHITE, 1 - amount)
