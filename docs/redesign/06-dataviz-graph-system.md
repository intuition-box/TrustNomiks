# Data-Viz & Graph Motion System

I have everything I need: the 16-color node taxonomy, the 8-color segment palette with its documented collisions (indigo = hub AND rewards; teal = export AND airdrop), the stock shadcn HSL token set, and the orphaned smoke/score-flash keyframes. Writing the section now.

---

# DATA-VIZ & GRAPH MOTION SYSTEM

> Governing principle: **two color spaces, one token layer.** "Graph space" (the knowledge graph, node families, the indexer aesthetic) and "chart space" (allocation/supply/emission analytics) are deliberately separated so a color never means two things on screen at once. The current code proves the need: `node-config.ts` and `chart-colors.ts` both hardcode `#6366f1` (hub *and* rewards) and `#14b8a6` (export *and* airdrop). We resolve this by giving each space its own token namespace and never letting `getGraphColor` leak into a chart or `getChartColor` leak onto a node. Everything below reads from CSS variables authored in OKLCH in `globals.css`; canvas (force-graph), SVG (recharts), and DOM (badges/legends) all resolve the **same** variable so they can never drift.

---

## 0. Token foundation these systems consume

Add to `@theme` in `globals.css`. Authored OKLCH, exposed as both the var and a Tailwind color. Light/dark are tuned for luminance, not just inverted.

```css
@theme {
  /* ── GRAPH SPACE — promoted from node-config.ts, 1:1 with NodeType ── */
  --graph-hub:         oklch(0.62 0.20 277);  /* graph_root  #6366f1 indigo  */
  --graph-token:       oklch(0.64 0.22 300);  /* token       #8b5cf6 violet  */
  --graph-allocation:  oklch(0.77 0.16 70);   /* allocation  #f59e0b amber   */
  --graph-vesting:     oklch(0.72 0.16 162);  /* vesting     #10b981 emerald */
  --graph-emission:    oklch(0.63 0.23 25);   /* emission    #ef4444 red     */
  --graph-risk:        oklch(0.70 0.19 45);   /* risk_flag   #f97316 orange  */
  --graph-source:      oklch(0.62 0.19 256);  /* data_source #3b82f6 blue    */
  --graph-export:      oklch(0.70 0.13 185);  /* export_run  #14b8a6 teal    */
  --graph-application: oklch(0.50 0.10 185);  /* application #0f766e teal-700*/
  --graph-wallet:      oklch(0.45 0.04 257);  /* wallet      #475569 slate    */
  --graph-category:    oklch(0.55 0.04 257);  /* category    #64748b slate    */
  --graph-sector:      oklch(0.66 0.22 313);  /* sector      #a855f7 purple   */
  --graph-chain:       oklch(0.68 0.16 233);  /* chain       #0ea5e9 sky      */
  --graph-triple:      oklch(0.71 0.03 257);  /* triple/predicate/literal slate-400 */

  /* family roll-ups for edges, glyphs, families */
  --graph-family-atom:   var(--graph-token);
  --graph-family-triple: var(--graph-triple);
  --graph-family-source: var(--graph-source);
  --graph-family-hub:    var(--graph-hub);

  /* ── CHART SPACE — promoted from chart-colors.ts, 1:1 with SegmentType ── */
  --chart-funding-private: oklch(0.62 0.19 256);
  --chart-funding-public:  oklch(0.66 0.22 313);
  --chart-team:            oklch(0.66 0.22 354);  /* pink   */
  --chart-treasury:        oklch(0.70 0.19 45);
  --chart-marketing:       oklch(0.73 0.20 146);  /* green  */
  --chart-airdrop:         oklch(0.70 0.13 185);
  --chart-rewards:         oklch(0.62 0.20 277);
  --chart-liquidity:       oklch(0.72 0.14 215);  /* cyan   */
  --chart-unallocated:     oklch(0.55 0.02 257);  /* slate — the remainder bucket */

  /* chart chrome */
  --chart-grid:    oklch(0.92 0.005 257);   /* light */
  --chart-axis:    oklch(0.55 0.01 257);
  --chart-cursor:  oklch(0.62 0.20 277 / 0.12);

  /* ── ELEVATION / SEMANTIC (consumed by tooltips, cards, states) ── */
  --surface-1: oklch(0.99 0 0);  --surface-2: oklch(0.97 0.003 257); --surface-3: oklch(0.95 0.005 257);
  --success: oklch(0.72 0.16 162); --warning: oklch(0.77 0.16 70); --info: oklch(0.62 0.19 256);

  /* ── MOTION (the whole §3 vocabulary keys off these) ── */
  --dur-instant: 90ms;  --dur-fast: 150ms; --dur-base: 240ms;
  --dur-slow: 400ms;    --dur-reveal: 900ms;
  --ease-out:   cubic-bezier(0.16, 1, 0.3, 1);    /* entrances, settle */
  --ease-inout: cubic-bezier(0.65, 0, 0.35, 1);   /* transforms       */
  --ease-spawn: cubic-bezier(0.34, 1.56, 0.64, 1);/* overshoot pop-in */
  --stagger-ingest: 64ms;  /* per-item delay when a series/graph crystallizes */
}

.dark {
  --chart-grid: oklch(0.27 0.01 257 / 0.6);
  --chart-axis: oklch(0.62 0.01 257);
  --chart-cursor: oklch(0.62 0.20 277 / 0.18);
  --surface-1: oklch(0.16 0.006 277); --surface-2: oklch(0.19 0.008 277); --surface-3: oklch(0.23 0.01 277);
  /* graph + chart hues hold; they were authored to glow on the dark void */
}
```

Two typed accessors are the **only** sanctioned way to get a viz color. They read the resolved CSS var so canvas/SVG/DOM never diverge:

```ts
// src/lib/viz/colors.ts
export const getGraphColor = (t: NodeType): string =>
  getCSSVar(`--graph-${GRAPH_VAR[t]}`);          // graph space ONLY
export const getChartColor = (s: SegmentType | 'unallocated'): string =>
  getCSSVar(`--chart-${CHART_VAR[s]}`);          // chart space ONLY
// getCSSVar resolves on the client; on server/canvas we read from a frozen JS mirror
// generated from the same @theme block at build time (single source, two emitters).
```

---

## 1. CHART TAXONOMY & STYLING SPEC

All charts are **recharts**, re-skinned (no new chart lib). Shared rules first, then per-chart.

### 1.1 Universal chart rules

| Aspect | Spec |
|---|---|
| **Palette** | Series colors come **only** from chart-space tokens via `getChartColor(segment)`. Stable mapping by `SegmentType` (already the intent in `chart-colors.ts`) so the same segment is the same color across every token → cross-token comparison reads instantly. Never `getGraphColor` in a chart. |
| **Grid** | `--chart-grid`, horizontal-only on bar/line, `strokeDasharray="3 3"`, no vertical grid (reduces ink). Donut/pie: no grid. |
| **Axes** | `--chart-axis`, 1px, no tick lines, 12px label, `tabular-nums`. Y-axis on supply/emission only; X always labeled. Hide the axis line itself, keep ticks as text. |
| **Numbers** | Every numeric uses `tabular-nums` + a single formatter: `formatCompact` (1.2B, 340M), `formatPct` (1 decimal, trailing-zero-trimmed), `formatToken` (thousands sep). Percent and token amount both shown in tooltips. |
| **Tooltip** | Custom component on `--surface-2`, 1px `border`, `--radius`, shadow-md, 8px pad. Row = swatch (6px rounded-full, series color) + label (foreground) + value (`tabular-nums`, right-aligned, font-medium). Title = category. Animation `--dur-fast` fade+2px-rise. Cursor = `--chart-cursor` fill (bar) or 1px dashed line (line). |
| **Legend** | Below chart, wrap, interactive: click toggles series (recharts `onClick`), hover dims others to 30% opacity over `--dur-fast`. Swatch shapes mirror chart type. |
| **Empty** | Never a blank box. Graph-motif empty card (§3.4): faint node-cluster glyph + "No allocation data yet — add it" deep-linked to the exact missing form section. One sentence, one CTA. |
| **Loading** | Skeleton that **mirrors the final chart geometry** (§3.2) — donut ring skeleton for the donut, stacked-bar skeleton for the bar — gated at 300ms (spinner only if exceeded). No layout shift on resolve; chart crystallizes in via §3.1 ingest stagger. |
| **Motion** | Mount: series draw in with `--stagger-ingest` per segment, `--ease-out`, `--dur-base`. Donut sweeps clockwise; bars grow from baseline; lines draw left→right (`strokeDashoffset`). Disabled entirely under `prefers-reduced-motion` (render final state immediately). |
| **A11y** | Each chart has a visually-hidden `<table>` data fallback (`role="img"` + `aria-label` summary on the SVG). Color is never the only encoder: donut/bar segments get a **leader label** with name+%, legend carries the text. Tooltips keyboard-reachable via focusable segments. |
| **Color-blind** | The 8 segment hues are ordered to maximize CVD separation (blue/purple/pink are the risk trio — verify with deuteranopia sim); where adjacency is ambiguous, add a subtle pattern overlay (see donut). |

### 1.2 Per-chart specs

**Allocation donut** (token detail, comparison)
- Donut not pie: `innerRadius 62%`, `outerRadius 88%`, `paddingAngle 1.5°`, `cornerRadius 3`. Center hole holds the **headline**: total supply (`formatCompact`, display weight) + "Total Supply" caption.
- Segments sorted descending; the **Unallocated** remainder (kills the hard 100% gate, see brief §2.4) renders in `--chart-unallocated` with a 6px diagonal hatch `<pattern>` so it reads as "to be filled," not a real category.
- Active segment: scale 1.04 from centroid, 2px ring in its own color, others dim to 55%.
- Reduced data (<3 segments): switch to a single labeled bar, not a near-circle.

**Allocation breakdown** (horizontal stacked bar — the one that exists today on `/tokens/[id]`)
- One full-width stacked bar, segments = chart-space colors, 28px tall, `--radius` on outer corners only. In-bar labels show % when segment ≥ 8% width; below that, label moves to legend only.
- Hover a segment → tooltip + that segment lifts to full opacity, siblings to 60%.
- This is the canonical "scan one token's distribution" view; donut is the "feel the proportion" view. Same colors, different geometry — never both competing on one screen.

**Supply bar** (max / initial / TGE / circulating)
- Grouped vertical bars, **not** stacked (these are independent measures, not parts of a whole). Single neutral series color = `--primary` at 0.9, since these aren't segment-typed. `barCategoryGap 28%`, `radius=[4,4,0,0]`.
- Y-axis `formatCompact`, horizontal grid only. Circulating bar gets a subtle `--success` tint to signal "live."
- Reference line at max supply (dashed `--chart-axis`) so TGE/circulating read as a fraction of cap.

**Unlock / vesting timeline** (area + step line over time)
- X = months from TGE (`tabular-nums`), Y = cumulative circulating %. **Stacked area per allocation segment** using chart-space colors → you see *which* cohorts unlock when. Cliffs render as vertical step risers (the data is stepwise; use `type="stepAfter"`).
- TGE marker = `--primary` vertical reference line labeled "TGE." Cliff dates = small diamond markers (echoing the triple glyph) on each segment's edge.
- Brush/zoom along X for long schedules; default window = first 48 months. Tooltip at an X shows the full cohort breakdown at that month + cumulative total.
- Light gradient fill under each area (color → transparent, 0.25→0 alpha).

**Emission chart** (future — supply curve over time)
- Single line/area, `type="monotone"`, color by emission model semantics (inflationary = `--graph-emission` family hue but **expressed through the chart-space `--chart-treasury`/neutral** to stay in chart space — document the mapping; do not import the graph red into a chart). Burn/buyback events = downward markers. Net-supply line overlaid dashed.

**Comparison charts** (future — the explorer promise)
- **Small multiples**, not overlaid spaghetti: a grid of mini-donuts (one per token, shared color scale + shared legend) for allocation; a single grouped/100%-stacked bar for side-by-side allocation; a multi-line unlock chart capped at ~4 tokens with a per-token line style (solid/dashed/dotted) **in addition** to color (CVD + overlap safety). Selected tokens get a persistent color assigned at selection time and reused across every comparison chart in the session.

---

## 2. KNOWLEDGE-GRAPH VISUAL SYSTEM

The hero surface. `react-force-graph-2d`, kept. Today it self-sabotages (links at 0.4px / 0.15 alpha read as scatter; legend shows 6 of 16 types; labels vanish on zoom; selection fills nodes **white** → invisible on light). Fixed below. **All node/edge color = `getGraphColor` (graph space only).**

### 2.1 Node families & styling

Four families with a **shape AND color** encoding (never color-only — accessibility + the brief's glyph system):

| Family | Glyph | Color source | Base size (from `node-config`) | Notes |
|---|---|---|---|---|
| **hub** | indigo **ring** (hollow → filled core) | `--graph-hub` | 18 | The one graph_root; largest; always labeled; faint perpetual halo (`breathe`). |
| **atom** | filled **circle** | per-type (`token`, `allocation`, `vesting`, `emission`, `risk`, `source`, `chain`, `sector`, `wallet`, `category`, `application`, `export`) | 5–12 per type | Radius from `NODE_CONFIG.size`. Token = 12, vesting = 5 — the existing hierarchy is correct, keep it. |
| **triple** | small **diamond** | `--graph-triple` (slate) | 3 | Reified relationships; deliberately recessive so domain atoms dominate. |
| **source** | rounded **square** | `--graph-source` | 6 | Provenance; square reads as "document." |

- Render on canvas via `nodeCanvasObject`: draw the glyph path (circle/diamond/square/ring) at `node.val` radius, fill `getGraphColor(type)`, 1.5px stroke at `color L+12%` for edge definition on both themes.
- **$TRUST stake = mass + glow** (the signature mechanic made visible): node radius scales `baseSize * (1 + log1p(stakeWeight)*k)` and a radial-gradient halo brightens with stake. This is the unique Intuition stake-as-weight rendering — wire it to real vault data when available, render flat when not.

### 2.2 Edge styling (the biggest current bug)

- Base links: **1.2px**, alpha **0.35** (not 0.4px/0.15). Color = midpoint blend of the two endpoint family colors at 0.35, so an edge inherits meaning from what it connects.
- **Focused subgraph** (a node selected): its incident edges go **2px, alpha 0.9, full endpoint color**; all non-incident edges drop to alpha 0.06 (`focus-dim`). This is the Obsidian neighbor-highlight that turns scatter into structure.
- Direction: `linkDirectionalArrowLength` 0 normally; on the focused subgraph only, show a 3px arrowhead so claim direction (subject→predicate→object) reads.
- Curvature: triple-mediated edges (atom→triple→atom) get slight `linkCurvature 0.15` so parallel relationships fan out instead of overlapping.

### 2.3 Labels

- **Label floor lifted**: hub + token labels **always** render regardless of zoom (the current behavior of hiding them below a zoom threshold is the bug). Other atoms label in when `globalScale > 1.4`; triples/literals/predicates only on hover/focus.
- Label = 11px mono-ish UI, foreground color with a 3px `--surface-1` halo stroke behind text for legibility over any node color, both themes.
- Collision: skip labels that would overlap a higher-priority (larger) node's label (greedy by node size).

### 2.4 Hover / focus / selected

| State | Visual | Timing |
|---|---|---|
| **hover** | node scales 1.12 (`--ease-spawn`), label forces on, cursor pointer, incident edges preview-brighten to 0.6 | `--dur-instant` |
| **focus** (keyboard) | same as hover + a 2px `:focus-visible`-equivalent ring in `--graph-hub` drawn on canvas; announced via aria-live | `--dur-fast` |
| **selected** (click) | **fix the white-fill bug** → node keeps its family color, gains a 3px outer **ring + soft halo in its own family color** (not white); `focus-dim` applied to the rest of the graph; inspector drawer opens | `--dur-base`, `--ease-out` |

### 2.5 Legend — complete all 16

Current legend shows 6/16 → unusable. New legend: a collapsible panel, **grouped by family** (Hub / Atoms / Triples / Sources), each row = glyph (correct shape) + color swatch + label from `NODE_CONFIG.label`. Clicking a row **filters** the graph to that type (dims others to 0.06). A "stake" key explains halo=weight. Generated by mapping over `NODE_CONFIG` so it can never fall out of sync again.

### 2.6 Detail / inspector panel

- Right-side **drawer** (shadcn Sheet), opens on node click, does **not** cover the graph (graph reflows to ~70% width so the focused subgraph stays visible).
- Header: family glyph + node label + type badge (badge color = `getGraphColor`). For tokens: ticker, chain, category.
- Body: the node's attributes; its **triples listed as `subject → predicate → object`** rows with each atom linked (click navigates the graph to that node). Stake panel: current $TRUST weight, stake/unstake CTA (deferred-wallet aware), halo preview.
- **Contributor↔explorer bridge** baked in: "This token is missing vesting → contribute it" linking to the exact form section (kills brief friction #7/#10).
- Footer: "open full page" → `/tokens/[id]`, and "center on graph."

### 2.7 Performance

- `warmupTicks` to pre-settle before first paint (no visible jitter); `cooldownTicks` finite on static/embedded surfaces so the sim stops; `autoPauseRedraw` on.
- Ambient/decorative graphs (hero, empty states): `enablePointerInteraction={false}`, low FPS cap.
- Above ~1.5k nodes: drop labels except hub/tokens, simplify glyphs to circles, and consider the documented Sigma/Cosmograph escape hatch (future, whole-graph only).
- Particle effects (§3) are pooled and capped (≤ N concurrent) so salvos don't unbound the canvas.

### 2.8 Accessibility

- **Reduced motion**: freeze the force simulation at settled positions, kill all particles/breathe/halo-pulse, keep hover/focus state changes as instant (no scale tween). The graph stays fully usable, just static.
- **Color-blind-safe**: shape-per-family is the primary encoder; color is secondary. Verify all 16 hues at AA contrast against `--surface-1` on both themes; the slate triple/predicate/literal trio is distinguished by **size+glyph**, not hue.
- **Keyboard**: full operability — Tab cycles nodes in a deterministic order (by family then size), Enter selects/opens inspector, arrow keys pan, +/- zoom, Esc clears focus. A **list/table fallback** (the same data as a navigable tree) is the non-canvas path and the screen-reader target. `aria-live` announces selection and neighbor counts.

---

## 3. GRAPH-AS-SIGNATURE MOTION SYSTEM

Motion vocabulary = the living indexer. Restrained inside workflows (one focal point, fast), expressive only where no task is blocked (hero, first reveal, "indexing complete"). The orphaned `smoke-*` keyframes in `globals.css` are **removed**; `score-flash` is kept (it's a real, useful gain-feedback gesture) and folded into the primitives below.

### 3.1 Hero "indexing" animation — data crystallizing into the graph

The landing-page set-piece (and the front door the product lacks today). Sequence, all `prefers-reduced-motion`-gated:

1. **Seed (0–400ms):** indigo hub fades in at center, `breathe` halo starts.
2. **Ingest stream (400ms–∞, looping):** scattered, dim "raw data" motes (low-alpha slate dots, representing whitepapers/proposals) drift in from the edges. On arrival each **crystallizes**: snaps to a node position with an `--ease-spawn` overshoot pop, takes its family color and glyph (`spawn-at-hub` gesture), and an edge **draws** from hub/parent (`strokeDashoffset` 0→1 over `--dur-reveal`).
3. **Claim salvo:** when an atom connects, a **particle travels the new edge** (`linkDirectionalParticles` / `emitParticle`) — the "new triple confirmed" gesture.
4. **Counter:** a `tabular-nums` counter ticks toward **300** as nodes land, tying the animation to the real goal.
5. **Idle:** once a comfortable cluster exists, settle to `breathe` ambient + occasional salvo. Never grows unbounded — recycle oldest motes.
- Easing: arrivals `--ease-spawn`, edge-draw `--ease-out`, drift linear. Stagger `--stagger-ingest`.
- The **signature gradient** (`--graph-hub` → `--graph-token`, indigo→violet) is used only here, on the primary CTA, and on the publish set-piece.

### 3.2 Graph-themed skeletons / loaders

- **Mini-graph assembling loader** (replaces `Loader2`): 5–7 nodes + edges draw in and gently re-settle on a loop; family-colored; ≤ 80px. Used for any >300ms async wait in graph/contributor surfaces.
- **Chart skeletons mirror final geometry** (§1.1): donut-ring skeleton, stacked-bar skeleton, axis+area skeleton — shimmer is a single sweep at `--dur-slow`, `--surface-2`→`--surface-3`. No layout shift on resolve.
- **Publish panel = the graph lighting up:** as on-chain chunks confirm, the corresponding nodes transition dim→full color + a salvo runs the edge (`swell-and-glow`). The publish progress *is* the indexer animating, not a generic progress bar (kills brief friction #2).

### 3.3 Empty states (graph-seeded)

Each empty state = a **faint, static (or barely breathing) mini-graph glyph** in the relevant family color + one sentence + one CTA that advances exactly one onboarding-checklist item and deep-links to the precise missing data:
- Dashboard empty → hub with no children: "Index your first token."
- Allocation chart empty → amber allocation glyph: "Add allocation segments."
- Graph empty → lone hub + faint orbit: "Your graph is waiting for its first claim."
Tone: invitation, never error. Reduced-motion → fully static.

### 3.4 Onboarding imagery / iconography

- Consistent glyph language everywhere (docs, empty states, loaders, checklist, badges): **circle = atom, diamond = triple, square = source, indigo ring = hub.** These are the same glyphs the canvas draws → the product teaches its own visual language by repetition.
- Concept education (Atoms/Triples/provenance/$TRUST/300-goal) uses tiny animated glyph vignettes (e.g., two atoms + a diamond snapping into a triple) rather than prose.

### 3.5 Ambient background motion

- A **very-low-alpha drifting node field** behind chrome on hero/empty/auth surfaces (NOT behind dense data views — never compete with a working table/form). Nodes: ≤ 30, alpha ≤ 0.08, slow linear drift, occasional faint edge fade-in/out. `enablePointerInteraction={false}`, FPS-capped, paused when tab hidden (`visibilitychange`) and when `prefers-reduced-motion`.
- This is the "indexer always running in the background" feeling — the brand's resting heartbeat — and the principled replacement for the deleted `smoke` blob.

### 3.6 When to disable (global rules)

- `prefers-reduced-motion: reduce` → freeze sim, no particles/breathe/halo-pulse/ambient drift/shimmer; charts render final frame; state changes become instant. **Interface stays 100% functional.**
- Tab hidden → pause all rAF loops.
- Dense work surfaces (the 6-step form's body, the token table, the publish *form*) → no ambient motion; motion only as direct, local feedback (save tick, score-flash, focus ring).
- Perf budget exceeded (low FPS / large graph) → auto-degrade: particles off first, then ambient, then label thinning.

---

## 4. REUSABLE MOTION / ANIM PRIMITIVES

Add to the design system. CSS keyframes promoted to `@theme`/utility classes (not inline JS strings); JS-driven ones use `motion`. All respect `prefers-reduced-motion` at the primitive level so callers can't forget.

```css
/* globals.css — promote keyframes to utilities (replaces smoke-*) */
@keyframes spawn-pop   { 0%{transform:scale(0);opacity:0} 70%{transform:scale(1.12)} 100%{transform:scale(1);opacity:1} }
@keyframes breathe     { 0%,100%{opacity:.5;transform:scale(1)} 50%{opacity:.85;transform:scale(1.04)} }
@keyframes draw-edge   { from{stroke-dashoffset:1} to{stroke-dashoffset:0} }
@keyframes shimmer     { from{background-position:-150% 0} to{background-position:250% 0} }
@keyframes ingest-rise { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
@keyframes score-flash { 0%{opacity:1;transform:translateY(0) scale(1.25)} 50%{opacity:1;transform:translateY(-14px) scale(1)} 100%{opacity:0;transform:translateY(-22px) scale(.9)} } /* kept */

@media (prefers-reduced-motion: reduce) {
  .anim-spawn,.anim-breathe,.anim-draw,.anim-shimmer,.anim-ingest { animation: none !important; }
}
```

| Primitive | Type | Gesture / use | Tokens |
|---|---|---|---|
| **`<SpawnPop>`** | motion/CSS | new node/atom appears (graph, form-builds-graph, checklist tick) — *spawn-at-hub* | `spawn-pop`, `--ease-spawn`, `--dur-base` |
| **`<EdgeDraw>`** | SVG/canvas | an edge/connection drawing in (chart line draw, new triple, hero) | `draw-edge`, `--ease-out`, `--dur-reveal` |
| **`<ParticleSalvo>`** | canvas | claim/triple confirmed; publish chunk lands — *particle-salvo* (`emitParticle`) | pooled, capped, `--dur-slow` |
| **`<Breathe>`** | CSS | idle ambient on hub/selected/stake-halo — *breathe / swell-and-glow* | `breathe`, infinite, alpha-only |
| **`<FocusDim siblings>`** | JS state | Obsidian neighbor-highlight (graph focus, legend filter, chart series hover) — *focus-dim* | opacity to 0.06, `--dur-fast` |
| **`<StaggerReveal>`** | motion | series/list/graph crystallizes in with per-item delay (charts, legend, table rows) | `--stagger-ingest`, `ingest-rise`, `--ease-out` |
| **`<CountUp tabularNums>`** | JS | the 300-goal counter, KPI tiles, stake totals | `--dur-slow`, ease-out, `tabular-nums` |
| **`<ScoreFlash>`** | CSS | completeness points gained (kept from current code) | `score-flash` |
| **`<GraphSkeleton>` / `<ChartSkeleton variant>`** | CSS | mini-graph-assembling loader; geometry-matched chart skeletons | `shimmer`, `breathe` |
| **`<AmbientField>`** | canvas | resting drifting-node background (hero/empty/auth only) | FPS-capped, visibility-paused, RM-off |

**Single-source guarantees:** (1) every viz color resolves from the `@theme` vars via `getGraphColor`/`getChartColor` — canvas, SVG, and DOM can't drift; (2) graph space and chart space never share an accessor, so `#6366f1` can mean hub *or* rewards but never both on one screen; (3) all motion keys off `--dur-*`/`--ease-*`/`--stagger-ingest` and degrades through one `prefers-reduced-motion` gate; (4) legend, glyphs, and node rendering all map over `NODE_CONFIG`, so the taxonomy stays in sync by construction.
