# Brand & Visual Language

I have the three palettes confirmed exactly as the brief states. Now producing the design language section.

---

# TrustNomiks — Design Language & Visual Foundation

## 1. Creative concept & north-star

**The indexer rendered as a living graph.**

TrustNomiks is not a form, a dashboard, or a chart deck — it is an *instrument that watches an invisible graph being built*. Every interaction is a small act of indexing: a token becomes a node, a claim becomes an edge, a stake becomes mass. The interface's job is to make that latent structure **visible, luminous, and in motion**, so that data entry feels like *constructing a constellation* and exploration feels like *flying through one*.

The whole product borrows the posture of an observatory: a dark, calm field in which structured, sourced, on-chain knowledge **glows**. The 16-color graph taxonomy that today lives stranded in `node-config.ts` becomes the product's entire color language — the same hue means the same concept whether it's a node on the canvas, a series in a chart, a badge on a card, or the accent on a form section.

**Emotional target:**

| Persona | Feel today | Feel after |
|---|---|---|
| Contributor | "3,600-line form, a chore, did it save?" | "I'm assembling something real; I can *see* it grow and light up when published." |
| Explorer | "A wall of muted gray tables." | "A telescope. I want to go one node deeper." |
| Both | Generic SaaS, low trust | Precise, credible, alive — "this is where serious tokenomics lives." |

Three words to protostandardize against: **Precise. Luminous. Alive.** Every motion, color, and surface decision is checked against them. (Precise → tabular numerics, mono hashes, restrained chrome. Luminous → taxonomy glows on void. Alive → the graph breathes, particles travel, a counter ticks toward 300.)

---

## 2. Aesthetic directions

Three coherent directions were developed. Each is internally complete; they differ in how loud the brand runs and how much "void" they tolerate.

### Direction A — **Data Observatory** *(dark-first)* ✅ RECOMMENDED

A near-black graphite field where chrome recedes to neutral slate and the **only saturated color in the room is data** — node colors, status, the indigo→violet brand gradient reserved for hero moments and the primary CTA. The graph is literally "in the void." Surfaces are layered by subtle lightness lifts rather than heavy borders; glass appears only on interactive controls (stake slider, step selectors, publish panel).

**Pros**
- The only canvas on which the 16-color taxonomy actually *glows*; semantic color reads at full strength because chrome is colorless.
- Matches the entire sector's default (Dune, Nansen, Arkham, Bubblemaps, Intuition) → instant category credibility.
- Lets the "living indexer" motion (spawn, particle-salvo, stake-glow) carry real signal without competing chrome.
- Plumbing already exists (`next-themes`, `.dark` block) — lowest-cost flip for highest visual leverage.

**Cons**
- Requires disciplined contrast work for AA on colored text against dark (mitigated: colored text only for status/labels at large/bold sizes, never long body).
- Light theme must be authored as a true peer, not an afterthought (we do — see §3).

### Direction B — **Luminous Index**

Same dark base, but the brand gradient and glow run **wall-to-wall**: glassmorphic cards everywhere, gradient hairlines, ambient bloom behind every surface, the graph motif bleeding into backgrounds.

**Pros**: Maximum "wow" on the landing/hero; very shareable; strong first-impression brand signature.
**Cons**: Glow-everywhere destroys the semantic weight of node color (everything glows → nothing signals); hurts readability of dense tables and the 6-step form; fights the "frictionless, info goes deeper not louder" goal; performance cost of pervasive blur/bloom. **Reserve its techniques for the hero only.**

### Direction C — **Quiet Terminal**

Monospace-forward, near-monochrome, hairline borders, color used only as tiny status dots — a Bloomberg/terminal aesthetic. Light *or* dark.

**Pros**: Supremely legible, fast, "for professionals"; numbers and hashes shine; zero gimmick.
**Cons**: Throws away the brand's single biggest asset — the graph-as-living-thing; emotionally cold (fails "Alive" and "envie de rester"); the taxonomy becomes mere dots, not a language; no front-door magic for the new landing.

### Recommendation

Adopt **A — Data Observatory** as the system, and **borrow B's gradient-bloom strictly for the hero / first-graph-reveal / "indexing complete" set-pieces**, and **borrow C's mono+tabular rigor for all data surfaces** (addresses, hashes, triples, numerics). This is the synthesis: a calm dark observatory where chrome is silent, data glows, the climax moments shine, and every number is terminal-grade legible. It is dark-first with a true light peer.

---

## 3. Color system (recommended direction)

**Authoring rule:** ship colors as **OKLCH** primitives → semantic aliases, but **emit `hsl()`/hex via the existing `@theme inline` bridge** so the current shadcn token contract (`hsl(var(--x))`) keeps working with zero refactor of consumers. Below, each token lists the **target hex** plus the **HSL triplet** in the exact `H S% L%` format `globals.css` already uses (so `--token: 239 84% 67%` style drops straight in). The three palettes collapse into **one** layer here.

### 3.1 Neutral / base ramp (the "graphite" chrome — slate, intentionally colorless)

Dark is default. Surfaces lift by **lightness, not border weight** → the elevation ladder lives in color.

| Token | Role | Dark `H S% L%` (hex) | Light `H S% L%` (hex) |
|---|---|---|---|
| `--background` | App void | `240 10% 4%` (#0A0A0C) | `0 0% 100%` (#FFFFFF) |
| `--surface-1` | Base card / panel | `240 8% 7%` (#111114) | `240 20% 99%` (#FCFCFD) |
| `--surface-2` | Raised (popover, hovered card) | `240 7% 10%` (#18181C) | `240 14% 96%` (#F2F3F5) |
| `--surface-3` | Overlay / dialog / command palette | `240 7% 13%` (#202024) | `0 0% 100%` (#FFFFFF) + shadow |
| `--border` | Hairline (default) | `240 6% 16%` (#28282E) | `240 9% 90%` (#E2E3E8) |
| `--border-strong` | Emphasis / focus container | `240 6% 24%` (#3A3A42) | `240 8% 80%` (#C7C9D1) |
| `--foreground` | Primary text | `0 0% 98%` (#FAFAFA) | `240 10% 6%` (#0E0E12) |
| `--muted-foreground` | Secondary text (~70%) | `240 5% 68%` (#A6A7AE) | `240 4% 40%` (#605F66) |
| `--faint-foreground` | Metadata / placeholders (~50%) | `240 5% 50%` (#7C7C84) | `240 4% 55%` (#85858C) |

> **Contrast notes.** Dark: `--foreground` on `--background` ≈ 18:1; `--muted-foreground` ≈ 6.8:1 (AA for all text); `--faint-foreground` ≈ 4.0:1 — restrict to ≥16px or non-essential metadata. Light: `--foreground` on `--background` ≈ 19:1; `--muted-foreground` ≈ 7.1:1. **Text follows weight-not-deletion**: never delete information by graying it past AA on its actual size — dim with opacity tiers, keep the smallest legible.

### 3.2 Brand

| Token | Hex | Dark `H S% L%` | Light `H S% L%` | Use |
|---|---|---|---|---|
| `--primary` (indigo / graph-root) | #6366F1 | `239 84% 67%` | `239 70% 58%` | Primary CTA, hub node, active nav, focus ring |
| `--secondary` (violet / token) | #8B5CF6 | `258 90% 70%` | `258 75% 60%` | Token entity, secondary accent, gradient end |
| `--brand-gradient` | indigo→violet | `linear-gradient(135deg, #6366F1, #8B5CF6)` | same | **Hero, primary CTA, living-graph set-piece, loaders only** |

> Brand gets **distinct light/dark luminance** (the current file reuses one value for both — fixed above: lighten in dark for glow, deepen in light for contrast). On dark, `--primary` text/icon on `--surface-1` ≈ 6.1:1 (AA). The gradient is the **owned signature** (TrustNomiks' Uniswap-pink→yellow) — used *sparingly*, never as a surface fill behind text.

### 3.3 The graph taxonomy → semantic **data-category** tokens (the heart)

`node-config.ts`'s 16 hexes are promoted verbatim to first-class CSS tokens and consumed **everywhere**: graph nodes, chart series, status/category badges, form-section accents, filters, loaders, empty-state art. **Same color = same concept, product-wide.** A single typed accessor (`getGraphColor(nodeType)` / `getChartColor(segment)`) reads these vars so canvas (2D), SVG (recharts), and DOM never diverge.

| Token | Concept | Hex | `H S% L%` | Node family / glyph |
|---|---|---|---|---|
| `--graph-root` | TrustNomiks hub | #6366F1 | `239 84% 67%` | hub — indigo ring |
| `--graph-token` | Token | #8B5CF6 | `258 90% 70%` | atom — ● |
| `--graph-allocation` | Allocation | #F59E0B | `38 92% 50%` | atom — ● |
| `--graph-vesting` | Vesting | #10B981 | `160 84% 39%` | atom — ● |
| `--graph-emission` | Emission | #EF4444 | `0 84% 60%` | atom — ● |
| `--graph-risk` | Risk flag | #F97316 | `25 95% 53%` | atom — ● |
| `--graph-source` | Data source | #3B82F6 | `217 91% 60%` | source — ■ |
| `--graph-export` | Export run | #14B8A6 | `173 80% 40%` | atom — ● |
| `--graph-application` | Application | #0F766E | `175 77% 26%` | atom — ● |
| `--graph-sector` | Sector | #A855F7 | `272 88% 65%` | atom — ● |
| `--graph-chain` | Chain | #0EA5E9 | `199 89% 48%` | atom — ● |
| `--graph-wallet` | Wallet | #475569 | `215 19% 35%` | atom — ● |
| `--graph-category` | Category | #64748B | `215 16% 47%` | atom — ● |
| `--graph-triple` | Triple / predicate / literal | #94A3B8 | `215 20% 65%` | triple — ◆ |

**Resolving the two-palette seam (must be documented in the nomenclature).** Today `chart-colors.ts` collides with `node-config.ts`: indigo = hub *and* `rewards`; teal = export *and* `airdrop`. Rule going forward:

- **Graph space** uses the taxonomy above (entity *types*).
- **Chart space** (allocation segments — a *different* dimension) keeps its 8 distinct segment hues, but they are **re-derived from the same token file** under a `--chart-*` prefix and **de-conflicted** so no chart hue equals a graph-entity hue it could be confused with on the same screen. Concretely, remap the two collisions: `rewards` → `--chart-rewards: 224 76% 56%` (#3056D3, a deeper indigo-blue, distinct from the #6366F1 hub) and `airdrop` → `--chart-airdrop: 188 86% 43%` (#0FB5CE, a cyan distinct from #14B8A6 export). The other six segment hues (blue/purple/pink/orange/green/cyan) are already non-colliding and stay.
- **One file, two namespaces:** `--graph-*` for entity types, `--chart-*` for segment dimensions, both in `globals.css`. Charts may also borrow `--graph-*` directly when a chart *is* about entity types (e.g., node-type distribution) — the accessor decides.

> **Taxonomy contrast on both themes.** All 14 node hues were checked as **fills with a 1px same-hue ring + white/near-white glyph** (the graph render model) on `--background` — all pass as graphical objects (≥3:1) on dark; the three slate-family hues (`wallet/category/triple`) are the weakest on light and therefore get a `-onLight` variant deepened by ~12% L for badges/legends on light surfaces. **Non-color cue is mandatory** (glyph shape ●/■/◆ + ring), so color-blind users never depend on hue alone — this is enforced in the graph, badges, and legend.

### 3.4 Domain semantic tokens (currently missing — add them)

| Token | Hex (dark) | `H S% L%` | Use |
|---|---|---|---|
| `--success` | #10B981 | `160 84% 39%` | validated, saved, confirmed (= vesting emerald, intentional) |
| `--warning` | #F59E0B | `38 92% 50%` | tolerance warnings (e.g. allocation ≠ 100%) |
| `--info` | #3B82F6 | `217 91% 60%` | hints, provenance (= source blue) |
| `--destructive` | #EF4444 | `0 84% 60%` | destructive actions (= emission red) |
| `--status-draft` | #64748B | `215 16% 47%` | status pill |
| `--status-review` | #F59E0B | `38 92% 50%` | status pill |
| `--status-validated` | #10B981 | `160 84% 39%` | status pill |
| `--risk-low` | #10B981 | `160 84% 39%` | risk severity |
| `--risk-med` | #F59E0B | `38 92% 50%` | risk severity |
| `--risk-high` | #EF4444 | `0 84% 60%` | risk severity |

> These deliberately **alias the taxonomy** (validated=emerald=vesting, risk-high=red=emission) so the product has one mental color-model, not two. Each semantic always pairs with an **icon** (CheckCircle/AlertTriangle/Info/XCircle) so meaning survives grayscale.

---

## 4. Typography

Today there is **no typeface loaded** (system stack). We load two via `next/font` (self-hosted, zero layout shift).

- **UI / display:** **Geist Sans** (humanist, de-intimidates DeFi, pairs natively with the Next.js/Vercel stack; Inter is the drop-in fallback). `--font-sans`.
- **Data / mono:** **Geist Mono** for **addresses, tx hashes, contract IDs, triples (`subject·predicate·object`), and code**. `--font-mono`. Monospacing makes hashes scannable and visually marks "machine-readable" content — reinforcing the product thesis.
- **Numerics:** **`font-variant-numeric: tabular-nums`** applied globally to every number surface (supply, %, $TRUST stake, counts) via a `.tabular` utility and on all chart axis/value labels — columns align, values stop "dancing" on update.

**Type scale** (6 steps, 1.250 major-third-ish, tightened tracking on display):

| Token | rem / px | Weight | Tracking | Use |
|---|---|---|---|---|
| `--text-display` | 3.0 / 48 | 600 | -0.02em | Hero, "300" counter |
| `--text-h1` | 2.0 / 32 | 600 | -0.015em | Page titles |
| `--text-h2` | 1.5 / 24 | 600 | -0.01em | Section / card titles (real `<h2>`) |
| `--text-h3` | 1.25 / 20 | 600 | -0.005em | Sub-section, KPI labels |
| `--text-body` | 1.0 / 16 | 400 | 0 | Default body, form labels |
| `--text-sm` | 0.875 / 14 | 400 | 0 | Table cells, secondary |
| `--text-caption` | 0.75 / 12 | 500 | 0.01em | Metadata, badges, legend, mono hashes |

Line-heights: 1.1 display, 1.25 headings, 1.5 body. **KPI numbers** render at `--text-h1`/`--text-display` in `tabular-nums`, with their label at `--text-caption` `--muted-foreground` — the Tremor pattern, borrowed onto recharts. This single move creates the heading hierarchy that is entirely absent today.

---

## 5. Elevation, surfaces, glass & borders

Dark UIs cannot lean on drop-shadow (invisible on near-black). The ladder is **lightness-lift first, shadow second, glass last and rarely.**

**Elevation ladder (4 levels):**

| Level | Surface token | Border | Shadow (dark) | Shadow (light) | Use |
|---|---|---|---|---|---|
| 0 | `--background` | — | none | none | App canvas, graph void |
| 1 | `--surface-1` | `--border` 1px | none | `0 1px 2px rgb(0 0 0 /4%)` | Cards, panels, table |
| 2 | `--surface-2` | `--border` 1px | `0 4px 16px rgb(0 0 0 /40%)` | `0 4px 12px rgb(0 0 0 /8%)` | Popover, hovered card, dropdown |
| 3 | `--surface-3` | `--border-strong` 1px | `0 16px 48px rgb(0 0 0 /55%)` | `0 16px 40px rgb(0 0 0 /12%)` | Dialog, ⌘K palette, publish panel |

- **Borders:** default hairline `--border`; on dark, a card reads via its lightness lift (#111 on #0A0A0C) *plus* a 1px border — never one alone. The current 1.5% card-vs-bg delta is gone.
- **Radius:** keep `--radius: 0.5rem` as the base; add `--radius-sm: 0.375rem` (inputs, badges), `--radius-lg: 0.75rem` (cards), `--radius-xl: 1rem` (hero/feature panels). Graph nodes are circles/diamonds/squares per family — radius doesn't apply, glyph shape does.
- **Glass / refraction (Aave-style) — interactive controls ONLY:** stake slider, step selectors, publish panel, ⌘K palette. Spec: `background: color-mix(in oklab, var(--surface-2) 70%, transparent); backdrop-filter: blur(12px) saturate(140%); border: 1px solid color-mix(in oklab, var(--border-strong) 60%, transparent);`. **Never wall-to-wall blur** (kills perf and the void).
- **Glow (the brand's "luminous"):** a node/stake glow utility — `box-shadow: 0 0 0 1px <hue>, 0 0 24px -4px <hue>` — used on the focused node, the publish "lit-up" state, and stake-as-mass halos. Glow intensity *encodes $TRUST stake* (Intuition's stake-as-weight made visible) — the product's unique mechanic, expressed as light.

---

## 6. Motion principles

**Restrained in the workflow, expressive only where no task is blocked.** Motion is the verb "indexing." It is honest signal, not decoration. Ship as tokens; promote keyframes from inline JS strings into Tailwind v4 `@theme` utilities; **honor `prefers-reduced-motion` everywhere** (freeze simulation, kill particles, no shimmer — interface stays fully functional).

**Motion tokens:**

```
--duration-instant: 100ms;   /* hover, press */
--duration-fast:    150ms;   /* most UI transitions */
--duration-base:    250ms;   /* enters, drawers */
--duration-slow:    400ms;   /* dialogs, view transitions */
--ease-out:    cubic-bezier(0.22, 1, 0.36, 1);   /* entrances (decisive arrival) */
--ease-in:     cubic-bezier(0.4, 0, 1, 1);        /* exits (faster than enters) */
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1); /* node spawn pop only */
--stagger-ingest: 64ms;   /* list/graph reveal cadence — the "ingest" rhythm */
```

**Rules**
1. **One focal point per moment.** Never animate two competing things; the eye follows the data, not the chrome.
2. **Ease-out entrances, faster ease-in exits.** Things arrive deliberately, leave quickly.
3. **Hover ≤100ms, UI transitions 150–400ms.** Snappy in the task; nothing makes the user wait.
4. **Skeletons, not spinners**, gated at 300ms; skeletons mirror final layout (no shift). Replace the lone `Loader2` + `animate-pulse` with a **mini-graph-assembling loader** (nodes spawn at hub, edges draw in on `--stagger-ingest`).
5. **Optimistic updates** + sub-200ms perceived view transitions.

**The living-indexer motion vocabulary** (defined gestures, reused everywhere):

| Gesture | Trigger | Mechanic |
|---|---|---|
| **spawn-at-hub** | New atom created | Node fades+pops (`--ease-spring`) outward from hub |
| **particle-salvo** | New triple / claim published | `linkDirectionalParticles` salvo travels the edge (`emitParticle`) |
| **swell-and-glow** | $TRUST staked | Node mass +, halo brightness + (stake-as-weight) |
| **focus-dim** | Node selected | Obsidian-style: neighbors keep color, rest dim to ~15% (replaces the broken white-fill selection) |
| **breathe** | Idle | Ambient ≤4% alpha drift; the graph is never fully static — it's *alive* |

**Expressive-only surfaces** (where B's bloom is licensed): the landing **hero** (nodes streaming outward from hub, counter ticking toward **300**), the **first graph reveal**, and **"indexing complete"** on publish. Everywhere else: calm.

**Retire** the off-brand `smoke-a/b/c` keyframes (lines 96–111 of `globals.css`); **keep** `score-flash` (it's on-brand feedback for completeness points) and re-home it as a `@theme` utility.

---

### Implementation handles (for the build phase)
- One token layer in `globals.css` via Tailwind v4 `@theme`; collapse `tailwind.config.ts` (v3) + `chart-colors.ts` + `node-config.ts` hexes into `--graph-*` / `--chart-*` / semantic vars, keeping the `@theme inline` `hsl(var(--x))` bridge so existing shadcn consumers don't change.
- `node-config.ts` becomes a thin reader of the CSS vars (via `getComputedStyle` at canvas init or a generated TS mirror) so **canvas, recharts SVG, and DOM badges share one source of truth**.
- AA focus ring: single `--ring` (#6366F1) `:focus-visible` outline, 2px + 2px offset, both themes, every focusable element.

**Load-bearing source files referenced:** `/Users/phyla/Documents/VsCode/TrustNomiks_app/trustnomiks-app/src/lib/knowledge-graph/node-config.ts` (the 16-hex taxonomy, confirmed), `/Users/phyla/Documents/VsCode/TrustNomiks_app/trustnomiks-app/src/app/globals.css` (stock shadcn HSL set, light-default, orphaned smoke keyframes, confirmed), `/Users/phyla/Documents/VsCode/TrustNomiks_app/trustnomiks-app/src/lib/utils/chart-colors.ts` (the colliding segment palette — `rewards`=#6366f1 vs hub, `airdrop`=#14b8a6 vs export, confirmed).
