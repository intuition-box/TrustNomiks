import { scaleBand, scaleLinear, scalePoint } from 'd3-scale'
import { stack as d3Stack, stackOffsetExpand } from 'd3-shape'

export type StackType = 'default' | 'stacked' | 'percent'

type Row = Record<string, unknown>

const num = (v: unknown) =>
  typeof v === 'number' && Number.isFinite(v) ? v : 0

/**
 * ADDED (fork): a series whose band is read straight off two row fields rather
 * than derived from the floor or the stack — `{ p05_95: ['p05', 'p95'] }`. The
 * engine already models every series as `[y0, y1]`, so a min/max band needs no
 * new painting path, only a way to supply the pair. This is what a Monte-Carlo
 * percentile envelope is made of.
 */
export type RangeKeys = Record<string, [string, string]>

/**
 * Per-series [y0, y1] bands for every row. For `default` every series sits on
 * the floor (y0 = 0); for `stacked`/`percent` they pile on top of each other
 * via d3's stack layout. Range series (see {@link RangeKeys}) bypass both and
 * carry their own floor and ceiling. The shape `bands[key][i] = [y0, y1]` is
 * what both the SVG area paths and the canvas overlay read from.
 *
 * `min` is 0 for the floored/stacked cases — so an all-stacked chart scales
 * exactly as it did before ranges existed — and drops only for a range series
 * that reaches below zero-floor territory.
 */
export function computeBands(
  data: Row[],
  keys: string[],
  stackType: StackType,
  ranges?: RangeKeys,
): { bands: Record<string, [number, number][]>; max: number; min: number } {
  const bands: Record<string, [number, number][]> = {}
  let max = 0
  let min = 0
  let seenRange = false

  const rangeKeys = keys.filter((k) => ranges?.[k])
  for (const key of rangeKeys) {
    const [lo, hi] = ranges![key]
    bands[key] = data.map((row) => {
      const a = num(row[lo])
      const b = num(row[hi])
      const y0 = Math.min(a, b)
      const y1 = Math.max(a, b)
      if (!seenRange) {
        min = y0
        seenRange = true
      } else if (y0 < min) min = y0
      if (y1 > max) max = y1
      return [y0, y1]
    })
  }

  // Range series own their floor, so they must not join the stack.
  const plainKeys = keys.filter((k) => !ranges?.[k])

  if (stackType === 'default') {
    for (const key of plainKeys) {
      bands[key] = data.map((row) => {
        const v = num(row[key])
        if (v > max) max = v
        return [0, v]
      })
    }
  } else if (plainKeys.length > 0) {
    const series = d3Stack<Row>()
      .keys(plainKeys)
      .value((row, key) => num(row[key]))
      .offset(
        stackType === 'percent' ? stackOffsetExpand : (undefined as never),
      )(data)

    series.forEach((layer) => {
      bands[layer.key] = layer.map((point) => {
        if (point[1] > max) max = point[1]
        return [point[0], point[1]]
      })
    })
  }

  // A floored or stacked series always sits on 0, so a chart without a range
  // series scales exactly as it did before ranges existed.
  return { bands, max: max || 1, min: seenRange ? min : 0 }
}

/** x positions for each row index, evenly spread across the plot width. */
export function buildXScale(length: number, plotWidth: number) {
  return scalePoint<number>()
    .domain(Array.from({ length }, (_, i) => i))
    .range([0, plotWidth])
}

/** Banded x for bar categories — each index owns a slot of `bandwidth` width. */
export function buildBandScale(length: number, plotWidth: number) {
  return scaleBand<number>()
    .domain(Array.from({ length }, (_, i) => i))
    .range([0, plotWidth])
    .paddingInner(0.28)
    .paddingOuter(0.18)
}

/** Index of the category whose band a horizontal pixel offset falls in. */
export function indexAtBand(px: number, length: number, plotWidth: number) {
  if (length <= 0 || plotWidth <= 0) return 0
  const t = Math.max(0, Math.min(0.999, px / plotWidth))
  return Math.min(length - 1, Math.floor(t * length))
}

/**
 * value → vertical pixel, with the floor at the bottom of the plot.
 *
 * ADDED (fork): an explicit `domain`. Upstream always anchors at zero, which is
 * right for a supply chart and wrong for a price one — an envelope around $1.20
 * flattens into an unreadable sliver when the axis starts at 0. Omit it and the
 * behaviour is unchanged.
 */
export function buildYScale(
  min: number,
  max: number,
  plotHeight: number,
  domain?: [number, number],
) {
  return scaleLinear()
    .domain(domain ?? [min, max])
    .nice()
    .range([plotHeight, 0])
}

/** Index of the row nearest a horizontal pixel offset within the plot. */
export function nearestIndex(px: number, length: number, plotWidth: number) {
  if (length <= 1 || plotWidth <= 0) return 0
  const t = Math.max(0, Math.min(1, px / plotWidth))
  return Math.round(t * (length - 1))
}
