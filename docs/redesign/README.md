# TrustNomiks Redesign — "The Living Tokenomics Graph"

A complete redesign of TrustNomiks from a generic shadcn MVP into a **world-class, frictionless, dark-first product** where the knowledge graph *is* the brand. This folder is the proposal; the `trustnomiks-app` repo now also contains a **coded foundation + hero screens** implementing it.

> **One idea drives everything:** the 16-color knowledge-graph taxonomy that lived stranded in `node-config.ts` becomes the product's entire visual language — same color = same concept on a node, a chart series, a badge, a section accent, a loader, an empty state. The whole interface *feels like a living indexer in motion.*

---

## Implementing on this app? Read the rules first.

> **[DESIGN-RULES.md](./DESIGN-RULES.md) is the binding, operational law for every UI change.** It is the condensed,
> prescriptive set of do/don't rules (anchored on what is actually implemented). The project's `CLAUDE.md` points every
> agent to it. The numbered docs below are the full proposal (the "why"); `DESIGN-RULES.md` is the "what you must do".

## How to read this proposal

| # | Doc | What it covers |
|---|---|---|
| ★ | [**DESIGN-RULES.md**](./DESIGN-RULES.md) | **Binding rules for any UI change.** Tokens, color=concept, tiers, a11y, copy, the acceptance checklist. Read before coding. |
| 00 | [Executive Summary & Roadmap](./00-executive-summary-roadmap.md) | The vision in 250 words, 8 guiding principles, the phased adoption roadmap, success metrics & risks. **Start here.** |
| 01 | [Design Brief](./01-design-brief.md) | The synthesized problem, the 11 highest-impact friction points to kill, the decisive aesthetic POV. |
| 02 | [Brand & Visual Language](./02-brand-language.md) | Creative concept, 3 aesthetic directions (→ **Data Observatory**), color system, typography, elevation, motion. |
| 03 | [Design Tokens, Nomenclature & Taxonomy](./03-design-tokens-taxonomy.md) | **The governance layer.** 3-tier tokens, naming law, full token sets, component nomenclature, the glyph system, typed accessors, migration map. |
| 04 | [IA, Navigation & Onboarding Spine](./04-ia-onboarding.md) | The mode-aware shell, ⌘K palette, the front door, the progressive onboarding spine, the redesigned contributor & explorer flows, the persona handoffs. |
| 05 | [Hero Screen Directions](./05-hero-screens.md) | Detailed redesign of Dashboard, Token Detail / Graph Explorer, and Onboarding — wireframes, components, states, motion, friction removed. |
| 06 | [Data-Viz & Graph Motion System](./06-dataviz-graph-system.md) | Chart taxonomy, the knowledge-graph visual system, and the graph-as-signature motion vocabulary. |
| 99 | [Appendix](./99-appendix-research-audits.md) | The raw research dossiers (component libraries, Web3/DeFi apps, data/monitoring apps, graph-motion, onboarding) + codebase audits that ground the proposal. |

---

## The decisions (locked)

- **Direction:** *Data Observatory* — dark-first, chrome stays slate-neutral so the taxonomy carries the semantic weight; "the graph in the void." Borrow gradient-bloom for hero set-pieces only, and mono/tabular rigor for all data surfaces.
- **Both journeys, welded by onboarding:** one shell serves the **contributor** (structure tokens → publish) and the **explorer** (browse → compare → graph), bridged by a progressive Getting-Started spine and explicit contributor↔explorer handoffs.
- **The signature gradient:** indigo `#6366F1` → violet `#8B5CF6` (graph-root → token) — used sparingly (hero, primary CTA, the living-graph set-piece, loaders).
- **Motion vocabulary:** *spawn-at-hub*, *particle-salvo*, *swell-and-glow* (= $TRUST stake rendered as node mass + halo), *focus-dim*, *breathe* — all gated on `prefers-reduced-motion`.

---

## What is already coded (in `trustnomiks-app`)

This proposal ships with a **working reference**, not just a document.

### Phase 0 — Design-system foundation
- **`src/app/globals.css`** — rewritten as the single token layer: dark-first default, the full elevation ladder (`--surface-1/2/3`), the 14 promoted `--data-*` taxonomy tokens, `--status-*` / `--risk-*` / `--success|warning|info`, a radius scale, motion tokens, the graph motion keyframes (the orphaned `smoke-*` retired), one strong `:focus-visible` ring, `.tabular`, mono, and a full `prefers-reduced-motion` pass. Authored as HSL triplets through the `@theme` bridge so **every existing `dark:` utility and chart `hsl(var())` consumer keeps working** — zero refactor of the 6 screens not yet rebuilt.
- **`src/app/layout.tsx`** — loads **Geist + Geist Mono** (`next/font`), flips the default theme to **dark**.
- **`src/lib/design/tokens.ts`** — the one JS↔CSS bridge: `getDataColor` / `getChartColor` (canvas/SVG) + the glyph + lucide-icon taxonomy maps (`NodeGlyph` consumes these).
- **New components (nomenclature in practice):**
  - `components/patterns/node-glyph.tsx` — the ◎ ● ◆ ▪ shape-per-family system (the non-color cue for AA).
  - `components/patterns/graph-loader.tsx` — the mini-graph-assembling loader (replaces bare spinners).
  - `components/composite/data-badge.tsx` — `DataBadge`, `StatusPill`, `RiskPill`.
  - `components/composite/stat-tile.tsx` — KPI tiles (Tremor pattern on our tokens).
  - `components/composite/empty-state.tsx` — graph-seeded empties that double as onboarding.
  - `components/composite/section-card.tsx` — taxonomy-accented content sections.
  - `components/brand/live-graph.tsx` — **`<LiveGraph mode="hero|ambient|local">`**, the single source of the "living indexer" signature (synthetic hero/ambient, real-data local).
  - `components/ui/button.tsx` — extended additively with a `brand` (gradient) + `success` variant and `xl` size.

### Phase 1 — Hero screens
- **`/` — Landing / front door** (`src/app/page.tsx`): replaces `redirect('/dashboard')` with a public, no-auth role-selecting hero — the live graph streaming from the hub, the 300-token north-star counter, the glyph explainer. Friction #1 killed.
- **`/dashboard` — Home / welding point**: three-band layout (KPI rail → living graph + Next-Best-Action + Getting-Started checklist → recent tokens), real Supabase data preserved, persona bridges surfaced.
- **`/tokens/[id]` — Token detail / graph explorer**: identity header, Core/Enrich progressive disclosure, taxonomy-accented sections, a local `<LiveGraph>`, and **publish promoted to a first-class action** (no longer buried). All existing view/status/export/publish logic preserved.
> A `/showcase` route (a visual gallery of the system) was built during this work and then **removed** at the
> maintainer's request. The canonical, durable reference is this folder, with [DESIGN-RULES.md](./DESIGN-RULES.md) as the law.

### Run it
```bash
cd trustnomiks-app
npm run dev          # → http://localhost:3000
#   /            the new front door
#   /dashboard   the redesigned home (login required)
```

---

## What is deliberately deferred (Phase 2+)

Per the roadmap (doc 00), the remaining screens — tokens list (TanStack Table + multi-select **Compare**), the tiered 6-step form (Core/Enrich + AI-assist intake + softened allocation gate), a first-class `/graph` route, the ⌘K palette, the wallet-deferral auth panel, and the full motion/graph-signature polish — adopt the now-proven foundation breadth-first. The foundation and hero screens exist precisely so that work is a re-skin, not a re-architecture.
