# dither-kit (vendored)

Composable dithered charts on a small canvas engine. Installed from the shadcn
registry, so the code lives here and we own it.

- Upstream: https://tripwire.sh/dither-kit — https://github.com/Boring-Software-Inc/dither-kit
- License: MIT
- Installed with: `npx shadcn@latest add https://tripwire.sh/r/pie-chart.json`

## What we changed

Only `palette.ts`. Upstream hardcodes seven RGB seeds; our design system takes
all color from the `--chart-*` CSS tokens and adds an occurrence ramp so two
pools of the same type stay tellable apart. A slice color is therefore a
resolved `Rgb` triple from `chartRgbFor()` in `src/lib/design/tokens.ts`.

Everything else is upstream, untouched, so the kit's CLI can still diff and
update it. Keep it that way: adapt at the seams (`palette.ts`, or a wrapper in
`src/components/charts/`), not inside the engine.

## Where it is used

Only the allocation donut, via `src/components/charts/allocation-donut-chart-dither.tsx`
(data room, token detail, compare board, and the lightpaper on screen).

## Known gaps vs. our recharts charts

The engine has no reference line, no step curve, no min/max bands, no free Y
domain (it always stacks from zero), and bars are vertical only. Our unlock
timeline, sell-pressure and price-envelope charts need those, which is why they
stay on recharts.

The canvas does not scale to `devicePixelRatio` — by design, since the dither
pattern has to be pixel-exact. It cannot gain resolution on paper, so keep it
away from the printed lightpaper.
