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

A chart that declares neither a range nor a domain behaves exactly as upstream;
`scales.test.ts` pins that as hard as it pins the new behaviour.

## Where it is used

Wrappers live in `src/components/charts/*-dither.tsx`:

| Chart | Screens |
|---|---|
| allocation donut | data room, token detail, compare board, lightpaper |
| sell pressure | factory projections |
| price envelope | factory simulation studio, lightpaper stress test |

The unlock timeline is still on recharts: it needs a **step-after curve** (a
vesting cliff is a stair, not a ramp — drawn as a smooth ramp the chart lies
about the schedule), and that means touching the canvas painter, not just the
seams. The allocation breakdown is also still recharts: its bars are horizontal
and `bar-canvas.tsx` only paints category-on-x.

## Printing

The canvas does **not** scale to `devicePixelRatio` — by design, since the
dither pattern has to be pixel-exact. It therefore cannot gain resolution on
paper. Anything that prints (the lightpaper) renders the recharts SVG twin via
`<PrintOnly>` in `src/components/charts/print-only.tsx`. Read that file before
touching the print path: the obvious `hidden print:block` looks like it works
and ships a blank chart.
