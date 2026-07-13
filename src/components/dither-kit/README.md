# dither-kit (vendored, forked)

Composable dithered charts on a small canvas engine. Installed from the shadcn
registry, so the code lives here and we own it.

- Upstream: https://tripwire.sh/dither-kit — https://github.com/Boring-Software-Inc/dither-kit
- License: MIT
- Installed with:
  `npx shadcn@latest add https://tripwire.sh/r/{pie,bar,area}-chart.json`

**Re-running the installer overwrites this whole folder**, our edits included.
If you ever need to, commit first, then restore the forked files listed below
from git and re-check `npm test`.

## What we changed

**`palette.ts` — the colour bridge.** Upstream hardcodes seven RGB seeds
(`green`, `blue`, …). Our design system takes every colour from the `--chart-*`
tokens and ramps repeated segment types so two "Team" pools stay tellable apart.
A series colour is therefore a resolved `Rgb` triple from `chartRgbFor()` in
`src/lib/design/tokens.ts`, which reads the live token and replays our OKLab
ramp numerically — a canvas can parse neither `hsl(var(--x))` nor `color-mix()`.

**Three primitives the analytical charts need to state the truth:**

- `reference-line.tsx` (new) — a threshold across the plot: the hard cap, the
  2% market depth, the launch price. Pure SVG on the front layer, reading the
  same `ctx.y` the canvas paints against, exactly as `<Grid />` does.
- `scales.ts` — **range series**: a band read straight off two row fields
  (`{ p05_95: ['p05','p95'] }`). The engine already models every series as
  `[y0, y1]`, so this needed no new painting path, only a way to supply the
  pair instead of deriving it from the floor or the stack.
- `scales.ts` — **free y domain**: upstream hardcodes `domain([0, max])`, right
  for a supply chart and wrong for a price one. An envelope around $1.20
  flattens into a sliver when the axis starts at zero.
- `area.tsx` — the boundary guard is **relaxed** so `<Area>` and `<Line>` can be
  composed in one root. The canvas already painted per `spec.kind`; mixing them
  was only forbidden, never unsupported. This is recharts' `<ComposedChart />`.
- `dither-paint.ts` — **step curve** (`<Area curve="step" />`). The canvas never
  draws a path: it carries a `[top, floor]` surface across its backing columns
  and interpolates. So a step is a resample mode — hold the left value instead
  of ramping — not a new painter. A vesting cliff is a stair, and interpolated
  it would draw supply that has not unlocked yet.
- `dither-paint.ts` — **`paintRow`**, the transpose of `paintColumn`. The engine
  paints bars column by column, so it can only grow them upward; a horizontal
  bar needs the fill to run the other way. Used by
  `src/components/charts/dither-bar-row.tsx`, not by the bar root.

### Upstream bugs we fixed

- `resample` indexed `src[Math.floor(t)]` unclamped. A single-point series
  forces `last` to 1, so the final column read past the array, fell through
  `?? 0`, and the series collapsed to the floor at its right edge. It hit the
  linear path too — i.e. every chart.
- `strokeVariant` is **dead**: every series part registers it, the painter never
  reads it. `<Area strokeVariant="dashed" />` renders nothing dashed. Use a fill
  `variant` (`hatched`, `dotted`) for a non-colour cue instead — which is the
  better cue anyway, since it survives greyscale.

A chart that declares neither a range, a domain nor a curve behaves exactly as
upstream; the tests pin that as hard as they pin the new behaviour.

## Where it is used

Wrappers live in `src/components/charts/`:

| Chart | Screens |
|---|---|
| allocation donut | data room, token detail, compare board, lightpaper |
| unlock timeline | data room, token detail, factory projections, lightpaper |
| sell pressure | factory projections |
| price envelope | factory simulation studio, lightpaper stress test |
| allocation breakdown, supply bars | data room (via `dither-bar-row.tsx`) |

Nothing in the product renders recharts any more **except the print twins** (see
below).

## Printing

The canvas does **not** scale to `devicePixelRatio` — by design, since the
dither pattern has to be pixel-exact. It therefore cannot gain resolution on
paper. Anything that prints (the lightpaper) renders the recharts SVG twin via
`<PrintOnly>` in `src/components/charts/print-only.tsx`. Read that file before
touching the print path: the obvious `hidden print:block` looks like it works
and ships a blank chart.
