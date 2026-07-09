---
name: design-system
description: Use for ANY UI work in this repo - creating or editing components, screens, or pages; touching Tailwind classes, colors, typography, charts, icons, or motion; or editing anything under src/components/ or src/app/ that renders UI. Enforces the "Data Observatory" design system (dark-first theming, CSS color tokens, typography, motion, accessibility, copy rules).
---

# TrustNomiks Design System

**Read `docs/redesign/DESIGN-RULES.md` in full before touching any screen or component.** This
file is the summary; that file is the law. If a change cannot satisfy these rules, stop and flag
it rather than working around them.

## Non-negotiables

**Theme**
- Dark-first: `:root` holds the light values, `.dark` holds the dark values, `next-themes` runs
  with `defaultTheme="dark"`. Never invert this to `:root`=dark / `.light`.
- All design values come from CSS variables in `src/app/globals.css`. Never hardcode a hex, never
  use `bg-[#...]`, never create a second color map in a component.

**Color = concept**
- Same color always means the same concept, product-wide. Never recolor a concept.
- Two color spaces, never mixed: **graph space** (entity type) uses the `--data-*` taxonomy
  (token=violet, allocation=amber, vesting=emerald, emission=red, risk=orange, source=blue,
  chain=sky, sector=purple, hub=indigo, ...); **chart space** (allocation segment) uses
  `getChartColor`. Do not color a chart segment with a `--data-*` token, or a graph node with a
  segment color.
- The only JS to CSS color bridge is `src/lib/design/tokens.ts` (`getDataColor`, `getChartColor`,
  `DATA_CSS_VAR`). No fourth color source may appear.
- Color is never alone (AA): every data category pairs its color with a glyph/shape/icon
  (`<NodeGlyph>` for graph entities, an icon on status/risk pills). Meaning must survive grayscale.

**Typography**
- Geist (UI) and Geist Mono, loaded in `layout.tsx`. `font-mono` for addresses, tx hashes,
  contract IDs, triple IDs, token amounts.
- `.tabular` on every number (supply, %, $TRUST, counts, KPI values, chart labels). Non-negotiable.
- Real heading semantics: page title = `<h1>`, section title = `<h2>`. Never fake headings with
  bold text.

**Surfaces & motion**
- Surfaces via `bg-surface-1` (cards), `bg-surface-2` (raised/hover), `bg-surface-3`
  (overlays/dialogs). Hairline borders only, never a border-only "wireframe" look.
- The indigo -> violet brand gradient (`var(--gradient-brand)`, `<Button variant="brand">`) is
  used sparingly: hero, primary CTA, the living-graph set-piece, loaders. Never as a fill behind
  body text, never wall-to-wall.
- `.glass` is for interactive controls only (stake slider, command palette, publish panel). Never
  wall-to-wall blur.
- Motion is restrained in-task (hover ~100ms, transitions 150-400ms via `--dur-*`/`--ease-*`),
  expressive only where no task is blocked (hero, first graph reveal, "indexing complete"). Always
  honor `prefers-reduced-motion`; new JS animation must check it explicitly.

**Accessibility**
- One global `:focus-visible` ring on every focusable element; do not remove it.
- `aria-current` on active nav; focus-trap + `aria-live` on dialogs/drawers and progress.
- Verify AA contrast for any `--data-*` used as text or as a fill behind text, in both themes.

**Copy**
- Never use the em-dash character. Use commas, colons, parentheses, periods, or rephrase. Empty
  values render as "Not set", never an em-dash.
- Copy presents TrustNomiks (the tokenomics-intelligence product). Intuition Protocol is credited
  only as the underlying rail, discreetly, never as the headline pitch.
- All user-facing strings go through i18n where the project uses it; no hardcoded copy in shared
  components.

**Components**
- Reuse before building: `src/components/ui` (primitives, shadcn/Radix wrappers, re-token never
  rebuild), `src/components/composite` (domain-agnostic assemblies), `src/components/patterns`
  (domain-aware blocks), `src/components/brand` (the living-indexer signature).
- Add missing primitives with `npx shadcn@latest add <name>`. Never hand-roll a Radix primitive.
- Dependency direction is Feature -> Pattern -> Composite -> Primitive only; a primitive importing
  a pattern is a defect.
- Never pass a raw color as a prop; pass `category`/`status`/`tone` and let the component resolve
  the token.
- Reference screens when in doubt: landing `src/app/page.tsx`, dashboard
  `src/app/(authenticated)/dashboard/page.tsx`, token detail
  `src/app/(authenticated)/tokens/[id]/page.tsx`.
- Aliases: `@/components`, `@/lib`, `@/components/ui`, `@/hooks`.

## Before declaring UI work done

- `npm run lint` and `npm test` pass; `npm run build` passes (required for any UI/route change).
- Visual check in both dark and light themes.
- Run the acceptance checklist in `docs/redesign/DESIGN-RULES.md` section 8 (tokens only, both
  themes, `.tabular`/`font-mono`, non-color cues, surfaces/elevation, motion + reduced-motion,
  component tier/reuse, zero em-dash).
