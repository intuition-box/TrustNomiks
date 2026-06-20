# Executive Summary & Adoption Roadmap

I have everything I need. The two load-bearing files confirm the brief exactly: `node-config.ts` is the 16 hardcoded hexes in one isolated config, and `globals.css` is the stock shadcn token set. Writing the executive summary and adoption roadmap now.

---

# TrustNomiks Redesign — Executive Summary & Adoption Roadmap

## Executive Summary

TrustNomiks is a tokenomics intelligence graph built on Intuition Protocol: it turns fragmented token data into verifiable, machine-readable claims — Atoms and Triples — curated by staking $TRUST. The product is real, but today it wears the **stock shadcn new-york/slate skin**: light-default, no typeface, cards that differ from the background by 1.5% lightness, a single shadow level, brand color in roughly two places, and one off-brand "smoke" animation. Meanwhile its actual signature — the **16-color knowledge-graph taxonomy** (indigo hub, violet token, amber allocation, emerald vesting, red emission, blue source, teal export…) — sits stranded in a single config file (`src/lib/knowledge-graph/node-config.ts`) and never reaches the interface.

The core idea of this redesign: **promote the graph into the design system and make the whole product feel like a living indexer.** We flip to **dark-first** — the only canvas on which the taxonomy glows, and the sector default (Dune, Nansen, Arkham, Intuition) — then lift those 16 colors into first-class CSS tokens consumed everywhere: charts, badges, section accents, loaders, empty states. Same color always means the same concept.

What changes: a real **front door** (live animated graph + role select, replacing `redirect('/dashboard')`), a navigable graph, a tiered contributor form, **publishing promoted to a first-class step**, and a token/type/elevation/motion ladder that creates the hierarchy now missing. The signature gradient (indigo → violet) and a defined motion vocabulary (spawn, particle-salvo, stake-as-mass) make the indexer visible.

Expected impact: role-based entry is the single biggest activation lever (+30–50% onboarding), and a product that *invites depth* instead of crushing with information directly lifts retention toward the 300-token goal.

---

## Guiding Principles

1. **The graph is the brand.** Every color, shape, loader, and empty state derives from the node taxonomy — same color, same concept, everywhere.
2. **Dark-first, taxonomy-forward.** Chrome stays slate-neutral so the 16 graph colors carry real semantic weight; the "graph in the void" is the signature.
3. **One token layer.** Collapse the three colliding palettes (shadcn vars / `chart-colors.ts` / `node-config.ts`) into a single OKLCH source of truth before building features.
4. **Weight, not deletion.** Create hierarchy through type scale, elevation, and opacity (metadata ~50%) — full saturation reserved for status, actions, and node colors.
5. **Defer friction to the moment of value.** No wallet at the door; both personas reach their aha in under five minutes with email/social.
6. **Promote the climax.** The on-chain publish is the entire point — it becomes a first-class step, never buried at the bottom of a page.
7. **Motion with intent.** Restrained in the workflow (100–400ms, one focal point), expressive only where no task is blocked (hero, first graph reveal, "indexing complete"); honor `prefers-reduced-motion` everywhere.
8. **Accessible by construction.** One strong `:focus-visible` ring, non-color cues per family, keyboard-operable graph with a table fallback — baked in, not bolted on.

---

## Adoption Roadmap

A phased path from proposal to shipping work. Effort is a rough sense (S ≈ days, M ≈ 1–2 weeks, L ≈ 2–4 weeks) for one focused engineer-designer, not a commitment.

### Phase 0 — Design-System Foundation *(effort: M, blocking)*
The bedrock. Nothing else ships cleanly until the token layer is unified.
- **Token consolidation.** Rewrite `globals.css` with Tailwind v4 `@theme`: OKLCH primitive ramps → semantic aliases. Add the missing domain tokens — `--graph-*` (the 16 taxonomy colors), `--surface-{1,2,3}` elevation ladder, `--success/warning/info`, `--status-{draft,review,validated}`, `--risk-{low,med,high}`, motion tokens (`--duration-*`, `--ease-*`, `--stagger-ingest`). Retire the v3 `tailwind.config.ts` and the "smoke" keyframes.
- **Single color accessor.** One typed `getGraphColor(nodeType)` / `getChartColor(segment)` reading the CSS vars, so canvas/SVG/DOM never diverge. `node-config.ts` becomes a consumer of tokens, not a separate source.
- **Type + theme.** Load Inter/Geist + a mono for addresses/hashes/triples; `tabular-nums` on all numerics; ship the 6-step type scale. **Flip default to dark** (light stays a toggle — plumbing exists via `next-themes`).
- **Re-skinned primitives + showcase.** Re-token (don't rebuild) the shadcn/Radix set; one strong `:focus-visible` ring both themes. Deliver a `/showcase` route documenting tokens, the two-palette rule (graph space vs chart space), badges, glyph iconography, and motion gestures — the living nomenclature.

### Phase 1 — Hero Screens *(effort: L)*
Prove the system on the three highest-leverage surfaces.
- **Landing / front door.** Replace `redirect('/dashboard')` with a public, no-auth page: live animated graph streaming nodes from the hub toward a "300" counter + lightweight role select (explore / contribute).
- **Dashboard, role-aware.** Three-band layout (KPI tiles → graph + trends → dense table), real elevation/contrast ladder, persona-aware default path, persistent "Getting Started" checklist.
- **Token detail / graph.** Make the graph navigable: clickable nodes → inspector drawer; strengthen focused-subgraph edges; family-colored selection ring+halo (fix the invisible white fill); raise the label floor for hub+tokens; complete the 16-type legend. Promote publish to a first-class action.

### Phase 2 — Roll Out to Remaining Screens *(effort: L)*
Apply the proven system breadth-first.
- **Tokens list** with TanStack Table v8 (virtualized toward 300×N) + multi-select side-by-side **compare** (the unbuilt explorer promise).
- **The 6-step form**, tiered into **Core** (Identity / Supply / Allocation) vs **Enrich** (Vesting / Emission / Sources / Risk): progressive disclosure, ~5 visible fields per section, *visible* auto-save, allocation's hard 100% gate softened ("add remainder as Unallocated" / normalize + tolerance warning), the graph building in real time beside inputs. Publish surfaced on the completion screen.
- **Export, token house, profile, login** re-skinned; export/publish panel reframed as the **graph lighting up** as chunks confirm; Token House shows all tokens with a deep-linked "complete data to unlock viz" affordance.
- **⌘K palette** (cmdk) + explorer search (Base UI combobox/multiselect).

### Phase 3 — Motion & Graph Signature Polish *(effort: M)*
The layer that makes it feel alive.
- Promote keyframes to `@theme` utilities; add `motion`. Implement the gesture vocabulary: *spawn-at-hub*, *particle-salvo* on new triple, *swell-and-glow* for **$TRUST stake rendered as node mass + halo** (the unique mechanic made visible), *focus-dim* neighbor highlight, idle *breathe*.
- Graph-motif loaders (mini-graph assembling) and graph-seeded empty states replacing `animate-pulse` / `Loader2`; each empty state advances one checklist item.
- Performance budget: `warmupTicks`/`cooldownTicks`, `enablePointerInteraction={false}` and `autoPauseRedraw` on ambient graphs, skeletons gated at 300ms, sub-200ms view transitions; full `prefers-reduced-motion` pass (freeze sim, kill particles).

---

## Success Metrics & Risks

**Success metrics**
- **Onboarding:** landing → first meaningful action (explore a token / start a contribution) +30–50%; time-to-aha < 5 min with no wallet.
- **Contribution:** form completion rate up (watch the allocation-gate abandonment point specifically); first-token-published rate up as publish becomes first-class.
- **Retention / depth:** sessions reaching the graph inspector or compare view; return rate; progression toward the 300-token goal.
- **System health:** three palettes → one token layer (0 duplicate color definitions); AA contrast verified on both themes; force-graph within frame budget.

**Risks & mitigations**
- **Token migration regressions** — re-skinning every primitive can cause visual drift. *Mitigate:* Phase 0 `/showcase` as a visual-regression baseline; ship behind the system, not feature-by-feature.
- **Graph performance at scale** — 300×N nodes can stall the canvas. *Mitigate:* pre-settle ticks, finite cooldown, ambient-graph pointer/redraw flags, table fallback.
- **Scope creep on the form** — the 3,606-line form is the riskiest rewrite. *Mitigate:* tier and progressively disclose; do not re-architect form logic in the same pass as the re-skin (smallest correct diff).
- **Dark-first contrast on the taxonomy** — 16 colors must stay distinguishable and AA-legible on dark. *Mitigate:* author in OKLCH with verified luminance, pair every color with a non-color cue (shape per family).
- **Two-palette collision** (indigo = hub *and* rewards; teal = export *and* airdrop) — *Mitigate:* document and enforce the graph-space vs chart-space rule in the nomenclature; the single color accessor makes it unambiguous.
