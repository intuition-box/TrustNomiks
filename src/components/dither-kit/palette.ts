/**
 * ADAPTED FROM UPSTREAM (dither-kit, MIT — github.com/Boring-Software-Inc/dither-kit).
 * The only file in this folder we rewrite; the rest stays pristine so the kit's
 * CLI can still diff and update it.
 *
 * Upstream ships seven hardcoded RGB seeds ("green", "blue", …). Our design
 * system forbids hardcoded color, and an allocation chart needs the eight
 * semantic `--chart-*` tokens plus the occurrence ramp that keeps five "Team"
 * pools tellable apart.
 *
 * So a slice color here is a resolved `Rgb` triple, produced by `chartRgbFor()`
 * in src/lib/design/tokens.ts — the one JS ↔ CSS bridge, which reads the live
 * token and replays the ramp in OKLab. The caller resolves, and re-resolves on
 * theme change (getComputedStyle is not reactive); this module only derives the
 * line and star highlights from the fill.
 */

import { lighten, type Rgb } from "@/lib/design/color-space"
import { getNeutralRgb } from "@/lib/design/tokens"

export type { Rgb }

/** A slice/series color: a resolved token, or the kit's "no data" fallback. */
export type DitherColor = Rgb | "grey"

export type Seed = { fill: Rgb; line: Rgb; star: Rgb }

/** The bright series line and the star sparkle are the fill lifted toward
 *  white, so a token change carries through the whole seed. Ratios picked to
 *  land where upstream's hand-tuned seeds sat. */
const seedFrom = (fill: Rgb): Seed => ({
  fill,
  line: lighten(fill, 0.45),
  star: lighten(fill, 0.68),
})

export const rgb = ([r, g, b]: Rgb, k = 1, a = 1) =>
  `rgba(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)},${a})`

export const seedOfColor = (color: DitherColor): Seed =>
  seedFrom(color === "grey" ? getNeutralRgb() : color)

export const isDitherColor = (value: unknown): value is DitherColor =>
  value === "grey" ||
  (Array.isArray(value) && value.length === 3 && value.every(Number.isFinite))
