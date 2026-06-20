# TrustNomiks Design Rules (binding)

> **Read this before touching any UI.** These are the non-negotiable rules every screen, component, and copy
> change must follow. They describe what is **actually implemented** in the codebase (not an ideal proposal).
> The "why" and the full spec live in the sibling docs `00`..`06` + `README.md`; this file is the operational law.
>
> If a change cannot satisfy these rules, stop and flag it rather than working around them.

---

## 0. North star

**"Data Observatory", dark-first.** The knowledge graph is the brand. Three words to check every decision against:
**Precise** (tabular numerics, mono hashes, restrained chrome), **Luminous** (the data taxonomy glows on a dark void),
**Alive** (the graph breathes, particles travel, a counter ticks toward 300). The product must feel like a living indexer,
and it must invite the user to go *deeper*, never crush them with information.

---

## 1. Theme & tokens (the single source of truth)

- **All design values come from CSS variables in `src/app/globals.css`.** Never hardcode a hex, never use `bg-[#...]`,
  never create a second color map in a component.
- **Theme structure (do not change):** `:root` holds the **light** values, `.dark` holds the **dark** values, and
  `next-themes` runs with `defaultTheme="dark"`. So dark is what users see, but light is a true peer.
  **Do NOT invert this to `:root`=dark / `.light`** — it would break the 259 existing `dark:` utilities and the charts
  that read `hsl(var(--x))` directly.
- **Token format:** every token is an HSL triplet `H S% L%`, exposed to Tailwind through
  `@theme inline { --color-x: hsl(var(--x)) }`. This keeps both Tailwind classes (`bg-primary`) and raw
  `hsl(var(--x))` consumers working.
- **To add a color:** add the semantic token in **both** `:root` and `.dark`, map it once in `@theme inline`, then use
  the generated Tailwind class. Primitive ramps and the rationale are in `03-design-tokens-taxonomy.md`.

Token families that exist today: surfaces `--surface-1/2/3`, brand `--primary`/`--secondary` + `--gradient-brand`,
text weights `--foreground`/`--muted-foreground`/`--faint-foreground`, the 14 `--data-*` taxonomy colors,
`--status-{draft,review,validated}`, `--risk-{low,med,high}`, `--success`/`--warning`/`--info`, a radius scale
(`rounded-xs..2xl`), and motion tokens (`--dur-*`, `--ease-*`, `--stagger-ingest`).

---

## 2. Color = concept (the most important rule)

- **Same color always means the same concept, product-wide.** A vesting value is `--data-vesting` (emerald) whether it
  is a graph node, a chart series, a badge, a section accent, a loader, or empty-state art. Never recolor a concept.
- **Two color spaces, never mixed:**
  - **Graph space** = entity *type* → the `--data-*` tokens (token=violet, allocation=amber, vesting=emerald,
    emission=red, risk=orange, source=blue, chain=sky, sector=purple, hub=indigo, ...).
  - **Chart space** = allocation *segment* → the segment palette in `src/lib/utils/chart-colors.ts` (`getChartColor`).
    These are different ontologies; do not color a chart segment with a `--data-*` token, or a node with a segment color.
- **JS ↔ CSS bridge is `src/lib/design/tokens.ts` only.** Canvas (react-force-graph) and SVG (recharts) resolve colors
  via `getDataColor(nodeType)` / `getChartColor(segment)`. DOM should prefer Tailwind classes (`bg-data-token`,
  `text-data-vesting`) or inline `hsl(var(--data-x))` via `DATA_CSS_VAR`. No fourth color source may appear.
- **Color is never alone (AA).** Every data category pairs its color with a **shape**: `◎` hub (ring), `●` atom (circle),
  `◆` triple (diamond), `▪` source (square), via `<NodeGlyph>`. Status/risk pills pair color with an icon. Meaning must
  survive grayscale and color-blindness.

---

## 3. Typography

- **Fonts:** Geist (UI) and Geist Mono, loaded in `layout.tsx`. Use `font-mono` for addresses, tx hashes, contract IDs,
  triple IDs, and token amounts.
- **`.tabular` on every number** (supply, %, $TRUST, counts, KPI values, chart labels). Non-negotiable.
- **Real heading semantics:** page title = `<h1>`, section title = `<h2>`. Do not fake headings with bold text.

---

## 4. Surfaces, elevation & motion

- **Elevation by lightness lift, not borders alone:** `bg-surface-1` (cards), `bg-surface-2` (raised/hover),
  `bg-surface-3` (overlays/dialogs). Borders are hairline (`border`). Never go back to a 1px-border-only "wireframe" look.
- **The signature gradient** `var(--gradient-brand)` (indigo→violet) is used **sparingly**: hero, primary CTA
  (`<Button variant="brand">`), the living-graph set-piece, loaders. Never as a fill behind body text, never wall-to-wall.
- **Glass** (`.glass`) is for interactive controls only (stake slider, command palette, publish panel). Never wall-to-wall blur.
- **Motion is restrained in the task** (hover ~100ms, transitions 150-400ms via `--dur-*`/`--ease-*`), **expressive only
  where no task is blocked** (hero, first graph reveal, "indexing complete"). The vocabulary: spawn-at-hub, particle-salvo,
  stake-swell (= $TRUST stake as node mass + halo), focus-dim, breathe.
- **Always honor `prefers-reduced-motion`** (globals.css already freezes animations; new JS animation must check it too,
  as `<LiveGraph>` and `useCountUp` do).

---

## 5. Component nomenclature (tiers, dependency goes down only)

| Tier | Folder | What | Examples (exist today) |
|---|---|---|---|
| Primitive | `src/components/ui/` | shadcn/Radix wrappers. **Re-token, never rebuild.** | `Button` (variants incl. `brand`/`success`, size `xl`), `Card`, `Badge`, ... |
| Composite | `src/components/composite/` | domain-agnostic assemblies | `StatTile`, `EmptyState`, `SectionCard`, `DataBadge`/`StatusPill`/`RiskPill` |
| Pattern | `src/components/patterns/` | domain-aware blocks | `NodeGlyph`, `GraphLoader` |
| Brand | `src/components/brand/` | the living-indexer signature | `LiveGraph` (modes `hero`/`ambient`/`local`) |
| Feature | `src/features/<domain>/` | page-level orchestration (create when needed) | (e.g. future `KnowledgeGraphExplorer`, `CompareBoard`) |

- Dependency direction: **Feature → Pattern → Composite → Primitive.** A primitive importing a pattern is a defect.
- Files `kebab-case.tsx`, components `PascalCase`. Props use the closed vocabulary `variant` / `size` / `tone|category` /
  `state`. **Never pass a raw color as a prop** — pass `category`/`status`/`tone` and let the component resolve the token.
- **Reuse before building.** Use the components above; add missing primitives with `npx shadcn@latest add <name>` (never
  hand-roll Radix primitives). Only build new when nothing fits, and place it in the right tier.

---

## 6. Accessibility (baked in, not bolted on)

- One strong `:focus-visible` ring on every focusable element (already global in `globals.css`); do not remove it.
- `aria-current` on active nav; focus-trap + `aria-live` on dialogs/drawers and progress.
- Non-color cues everywhere (glyph/shape/icon), full keyboard operability, a list/table fallback for the graph.
- Verify AA contrast for any `--data-*` used as text or as a fill behind text, in **both** themes.

---

## 7. Copy & product framing

- **Never use the em-dash "—".** Use commas, colons, parentheses, periods, or rephrase. Empty values render as
  `Not set`, never `—`.
- **The copy is about TrustNomiks**, the tokenomics-intelligence product (structure, compare, verify tokenomics).
  **Intuition Protocol is the rail underneath**, credited discreetly (e.g. a small badge), never the headline pitch.
  Do not describe Intuition's atom/triple/source ontology as if it were TrustNomiks' value proposition.
- All user-facing strings go through i18n where the project uses it; no hardcoded copy in shared components.

---

## 8. Acceptance checklist (every UI PR must pass)

- [ ] No hardcoded hex / `bg-[#...]`; colors come from tokens, Tailwind `*-data-*`/`*-surface-*` classes, or the
      `tokens.ts` accessors.
- [ ] Renders correctly in **both** dark and light.
- [ ] `.tabular` on all numbers; `font-mono` on hashes/addresses/amounts.
- [ ] Every data category shows a glyph/shape or icon in addition to color (non-color cue).
- [ ] Surfaces via `bg-surface-*`; elevation consistent; hairline borders.
- [ ] Motion honors `prefers-reduced-motion`; the brand gradient is used sparingly.
- [ ] Component is named and placed by tier, and reuses existing components.
- [ ] Zero em-dash; copy is TrustNomiks-centric.
- [ ] `npm run build` and `npm run lint` are green (baseline: pre-existing `<img>` LCP warnings only).

---

## 9. Where to go deeper

- `README.md` — index of the whole proposal + what is coded.
- `00-executive-summary-roadmap.md` — vision, principles, the phased roadmap (Phase 2+ still to build).
- `02-brand-language.md` — color/type/elevation/motion rationale.
- `03-design-tokens-taxonomy.md` — full token sets, naming law, the typed accessors, migration map (the detailed governance).
- `04-ia-onboarding.md` / `05-hero-screens.md` / `06-dataviz-graph-system.md` — IA, screen directions, graph/motion system.

When in doubt, match the three reference screens already built: the landing (`src/app/page.tsx`), the dashboard
(`src/app/(authenticated)/dashboard/page.tsx`), and the token detail (`src/app/(authenticated)/tokens/[id]/page.tsx`).
