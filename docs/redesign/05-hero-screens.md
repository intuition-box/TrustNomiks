# Hero Screen Redesign Directions

I have the two load-bearing files confirmed. The taxonomy is 16 hardcoded hexes; the chart palette is a second, colliding palette. I have everything needed to write the directions.

# TrustNomiks Redesign Directions — Three Hero Screens

> Working reference for implementation. Dark-first. Every color, motion, and component name below refers to the **design-system nomenclature** defined in §0. Build the token layer first; these screens consume it.

---

## §0. Nomenclature recap (the contract these screens obey)

**Surfaces (elevation ladder):** `--surface-0` (app void / canvas bg) → `--surface-1` (page) → `--surface-2` (card) → `--surface-3` (popover/inspector/dialog). Each step +3–4% lightness in dark, real `box-shadow` from `--elevation-1..3`. No more 1.5% card≈bg.

**Graph taxonomy tokens** (promoted from `node-config.ts`, authored OKLCH): `--graph-hub` (indigo #6366f1), `--graph-token` (violet #8b5cf6), `--graph-allocation` (amber #f59e0b), `--graph-vesting` (emerald #10b981), `--graph-emission` (red #ef4444), `--graph-risk` (orange #f97316), `--graph-source` (blue #3b82f6), `--graph-export` (teal #14b8a6), `--graph-application` (#0f766e), `--graph-sector` (#a855f7), `--graph-chain` (sky #0ea5e9), `--graph-triple` (slate-400). Consumed by chart series, badges, section accents, loaders, empty-state art. One typed accessor `getGraphColor(nodeType)` reads the var → canvas/SVG/DOM never diverge.

**Two-palette seam rule:** "graph space" (node colors, hub-relative) is **visually separated** from "chart space" (allocation segment colors from `chart-colors.ts`). Charts get a thin `--graph-token` violet hairline frame + "chart space" affordance so the indigo=hub/indigo=rewards and teal=export/teal=airdrop collisions never read as the same concept in one viewport. Documented in nomenclature.

**Signature gradient:** `--gradient-brand` = indigo `#6366F1` → violet `#8B5CF6`. Hero, primary CTA, living-graph set-piece, "indexing complete" only. Never wall-to-wall.

**Iconography glyphs:** ● circle = atom · ◆ diamond = triple · ▪ square = source · ◎ indigo ring = hub. Used in legends, badges, empty states, loaders, canvas. (Non-color cue → AA.)

**Motion vocabulary:** *spawn-at-hub* (new atom) · *particle-salvo* along edges (new triple/claim) · *swell-and-glow* ($TRUST stake = node mass + halo) · *focus-dim* (Obsidian neighbor highlight) · *breathe* (idle ambient). Tokens: `--duration-{fast 100,base 200,slow 400}`, `--ease-out`, `--stagger-ingest 64ms`. All gated on `prefers-reduced-motion` → freeze simulation, kill particles.

**Status / risk tokens:** `--status-{draft,review,validated}`, `--risk-{low,med,high}`, `--success/warning/info`.

**Type:** Geist (UI) + Geist Mono (addresses/hashes/triples). `tabular-nums` on every numeric. 6-step scale display→caption.

**Named components used across screens:** `<LiveGraph>` (react-force-graph-2d wrapper, props: `mode="hero|local|ambient"`), `<KpiTile>` (Tremor pattern on our tokens), `<NodeBadge glyph color>`, `<StatusPill>`, `<RiskPill>`, `<SectionCard accent>`, `<InspectorDrawer>`, `<GettingStartedChecklist>`, `<NextBestAction>`, `<GraphLoader>` (mini-graph assembling), `<GraphEmptyState>`, `<PublishPanel>`, `<CompareTray>`, `<CmdkPalette>` (⌘K).

---

## (A) DASHBOARD / HOME — the welding point

The single screen both personas land on after onboarding. Three-band layout. Role-aware: a contributor sees their checklist + draft tokens promoted; an explorer sees the graph + insights promoted. Same components, reordered by `role`.

### A.1 Layout — desktop (≥1280px)

```
┌──────────┬───────────────────────────────────────────────────────────────────┐
│          │  ┌─ Topbar ───────────────────────────────────────────────────┐    │
│  SIDEBAR │  │ TrustNomiks ◎    [⌘K Search atoms, tokens, triples… ]   ◑ ⬡│    │
│  ◎ logo  │  └─────────────────────────────────────────────────────────────┘   │
│          │                                                                      │
│ ●Dashbd  │  BAND 1 — KPI RAIL  (role-aware order)                               │
│ ●Tokens  │  ┌─KpiTile────┐┌─KpiTile────┐┌─KpiTile────┐┌─KpiTile──────────┐     │
│ ◆Token   │  │ 142 / 300  ││ Your drafts││ Validated  ││ $TRUST staked    │     │
│   House  │  │ ▓▓▓▓░░ 47% ││    3        ││   89       ││  12.4k  ↑        │     │
│ ▪Export  │  │ tokens     ││ resume →   ││ on-chain   ││  swell+glow      │     │
│ ●Profile │  └────────────┘└────────────┘└────────────┘└──────────────────┘     │
│          │                                                                      │
│ ─────    │  BAND 2 — LIVING GRAPH + RIGHT COLUMN                                │
│ Getting  │  ┌─ <LiveGraph mode="hero"> ───────────────┐ ┌─ NextBestAction ─┐   │
│ Started  │  │                          ◎               │ │ ◆ Solana is      │   │
│ ▓▓▓░ 3/5 │  │        ●         ╲   ╱        ●           │ │   missing vesting│   │
│          │  │           ●───◎ hub ◎───●  ·· particle    │ │   → Contribute   │   │
│ □ connect│  │        ╱      │     ╲      ╲              │ │ ─────────────────│   │
│ ☑ explore│  │      ●     ●  ◆  ●     ●    ●            │ │ ◆ 3 new claims   │   │
│ □ first  │  │   streaming nodes outward · counter↗142  │ │   staked near you│   │
│   token  │  │  [Legend ● atom ◆ triple ▪ source ◎ hub] │ │   → Explore graph│   │
│ □ publish│  └──────────────────────────────────────────┘ └──────────────────┘   │
│          │                                                                      │
│          │  BAND 3 — DENSE TOKEN TABLE (TanStack Table v8, virtualized)         │
│          │  ┌──────────────────────────────────────────────────────────────┐   │
│          │  │ Token ▾   Chain  Cat.   Compl.  Status     $TRUST   Updated   │   │
│          │  │ ◍ ETH    ⬡ L1   infra  ▓▓▓▓ 92  ●validated  4.1k    2d  [+]   │   │
│          │  │ ◍ SOL    ⬡ L1   infra  ▓▓░░ 58  ◐review     1.2k    5h  [+]   │   │
│          │  │ ◍ ARB    ⬡ L2   fin    ▓░░░ 31  ○draft      —       1h  [+]   │   │
│          │  └──────────────────────────────────────────────────────────────┘   │
└──────────┴───────────────────────────────────────────────────────────────────┘
```

### A.2 Components (nomenclature)

- **`<KpiTile>`** ×4 — Tremor pattern rendered on recharts/our tokens. Tile 1 = the **300-goal progress** (always present, the north star), bar uses `--gradient-brand`. Remaining three reorder by role: contributor → `Your drafts` (deep-links to resume) promoted to slot 2; explorer → `$TRUST staked` / `Validated on-chain` promoted. `tabular-nums`, `--surface-2`, `--elevation-1`.
- **`<LiveGraph mode="hero">`** — the brand set-piece. `enablePointerInteraction` ON (nodes clickable → route to token), `warmupTicks` pre-settle, `cooldownTicks` finite so it settles then *breathes* at low alpha. Streams nodes *spawn-at-hub* outward; a counter ticks toward 300 synced to KPI tile 1. `linkDirectionalParticles` fire a *particle-salvo* whenever a new claim lands (TanStack Query cache update). Selection = family-colored **ring + halo**, never white fill. Full 16-type legend in a collapsible chip row (fixes the "6 of 16" bug).
- **`<NextBestAction>`** — the contributor↔explorer **bridge engine**. Two stacked cards generated from data gaps: a *contribute* bridge ("X is missing vesting → Contribute", deep-links to the exact form section) and an *explore* bridge ("3 new claims staked near you → Explore graph"). This is the activation lever.
- **`<GettingStartedChecklist>`** in sidebar rail — persistent, role-aware, 4–5 tangible increments (connect / explore / first token / publish / stake). Each empty state elsewhere advances one item. Collapses to a `▓▓▓ 3/5` pill once dismissed.
- **`<TokenTable>`** — TanStack Table v8, **virtualized** (300×N budget). Completeness mini-bar uses `--gradient-brand`; `<StatusPill>` uses `--status-*`; chain/category as `<NodeBadge>` with glyph. Row `[+]` adds to `<CompareTray>`.

### A.3 Responsive

- **≥1280px:** 3-band as drawn; Band 2 is graph (2/3) + right column (1/3).
- **768–1279px:** KPI rail wraps 2×2; Band 2 stacks — `<LiveGraph>` full-width above a horizontally-scrollable `<NextBestAction>`; table gains horizontal scroll, pins Token + Status columns.
- **<768px:** Sidebar → bottom tab bar (glyph icons). KPI rail → horizontal snap-scroll of tiles. `<LiveGraph mode="ambient">` (pointer interaction OFF, `autoPauseRedraw`, lower particle budget) as a shorter banner; tap → full-screen graph. Table → stacked cards (Token + completeness ring + status). Checklist → dismissible top sheet.

### A.4 Motion moments

1. **Load:** KPI numbers count up (`tabular-nums`, 400ms ease-out, staggered `--stagger-ingest`). Graph does one expressive **first reveal** — nodes spawn-at-hub and fan out — then settles to *breathe*.
2. **Live claim arrives:** *particle-salvo* along the relevant edge + the matching `<KpiTile>` pulses once. One focal point.
3. **Hover token row:** its node in the graph does *focus-dim* (neighbors highlight, rest dim to 0.15) — links the table to the canvas. ~100ms.
4. **Reduced-motion:** simulation frozen on a pre-settled layout, no particles, count-up replaced by instant value.

### A.5 States

- **Empty (brand-new user, 0 tokens):** `<GraphEmptyState>` — a lone `◎ hub` glyph gently breathing with the line "Your graph starts here." `<NextBestAction>` shows the single CTA "Structure your first token". Checklist front-and-center. No fake data.
- **Loading:** `<GraphLoader>` (mini-graph **assembling** from hub outward) in the Band-2 slot; KPI tiles + table rows are layout-mirroring skeletons gated at 300ms (no spinner, no layout shift).
- **Error (data fetch fails):** Band 2 shows an inline `◎`-with-broken-edge motif + "Couldn't reach the indexer — Retry". KPIs/table keep last good cached values (stale-while-revalidate) rather than blanking.
- **Success / milestone:** crossing a 300-goal decile fires an "indexing complete" gradient sweep across the hero + toast (sonner).

### A.6 Friction removed

Kills **#1 no front door's** dead-end (this is now a guided, role-aware home, not a generic dash), **#8 persona-ambiguous flat hierarchy** (real elevation/type ladder + role-aware ordering + three-band guided path), **#10 no onboarding spine** (persistent checklist + explicit bridges), and surfaces **#2 publishing** via the KPI/`<NextBestAction>` path instead of burying it.

---

## (B) TOKEN DETAIL / GRAPH EXPLORER — the showcase

Rich but **calm**: progressive disclosure (Core always visible, Enrich tucked) + an **inspector drawer** so clicking any graph node or chart segment opens detail *in place* rather than navigating away. This is where structured tokenomics earns the word "intelligence".

### B.1 Layout — desktop (≥1280px)

```
┌──────────┬───────────────────────────────────────────────────────────────────┐
│ SIDEBAR   │ ┌─ IDENTITY HEADER ──────────────────────────────────────────────┐ │
│           │ │ ◍ SOL  Solana  ⬡ L1 · infrastructure · TGE 2020-03            │ │
│           │ │ ●validated  Compl. ▓▓▓▓░ 82%   $TRUST 1.2k ↑   [Compare][⋯]   │ │
│           │ │ ── Core ───────────────────  Enrich ⌄ (Vesting·Emission·Risk) │ │
│           │ └────────────────────────────────────────────────────────────────┘ │
│           │ ┌── LEFT: LOCAL GRAPH (sticky) ──┐ ┌── RIGHT: DATA SECTIONS ─────┐ │
│           │ │ <LiveGraph mode="local">       │ │ ▌Allocation  (accent amber)│ │
│           │ │        ●token(SOL)             │ │  ┌ donut ─┐  chart space ▎  │ │
│           │ │      ╱  │   ╲                  │ │  │  ◑ 58% │  ■ team 20%     │ │
│           │ │   ◆alloc ◆vest ◆emis           │ │  │        │  ■ eco 30% …    │ │
│           │ │    │      │     │               │ │  └────────┘                 │ │
│           │ │   ▪src   ▪src  ◆risk            │ │ ▌Supply     (accent violet)│ │
│           │ │  focus-dim on select           │ │  max/init/TGE/circ bars     │ │
│           │ │ ─────────────────────────────  │ │ ▌Vesting/Unlock (emerald)   │ │
│           │ │ Legend ● ◆ ▪ ◎  [fit][⤢]       │ │  unlock timeline area chart │ │
│           │ └────────────────────────────────┘ │ ▌Sources/Provenance (blue)  │ │
│           │                                     │  ▪ whitepaper ✔ 2024-06 ↗  │ │
│           │  ┌─ <PublishPanel> (sticky foot) ─┐ │ ▌Risk Flags (orange)        │ │
│           │  │ ◐ 3 chunks confirmed · 1 pend… │ │  ▲ high: unlock cliff …     │ │
│           │  │ [Publish to Intuition →] glow  │ │ Enrich ⌄ collapsed by dflt  │ │
│           │  └────────────────────────────────┘ └─────────────────────────────┘ │
└──────────┴───────────────────────────────────────────────────────────────────┘

    ┌─ <InspectorDrawer> (slides from right, --surface-3, on node/segment click) ─┐
    │ ◆ Triple · "SOL — allocates → Team 20%"                                     │
    │ Subject ●SOL · Predicate allocates · Object ●Team                           │
    │ Provenance ▪ whitepaper p.14 ↗   |   $TRUST staked 420  [Stake +]           │
    │ On-chain ✔ tx 0xabc…  ·  [View in full graph]                               │
    └────────────────────────────────────────────────────────────────────────────┘
```

### B.2 Components (nomenclature)

- **Identity header** — `◍` token glyph, name/ticker, `<NodeBadge>` for chain/category/sector, `<StatusPill>`, completeness bar, `$TRUST` figure with *swell* micro-cue, `[Compare]` (adds to `<CompareTray>`). A **Core / Enrich segmented control** governs progressive disclosure: Core (Allocation, Supply) always rendered; Enrich (Vesting, Emission, Sources, Risk) collapsed behind a `⌄` until expanded — kills the "info-dense without hierarchy" complaint.
- **`<LiveGraph mode="local">`** (left, **sticky**) — the token's local subgraph (token → allocation/vesting/emission triples → sources). Edges **strengthened** in this focused subgraph (fixes the 0.4px/0.15-alpha "scatter" bug). Clicking a node opens `<InspectorDrawer>`; *focus-dim* highlights its neighborhood. Label floor lifted for token + triple nodes.
- **`<SectionCard accent>`** ×N — each section carries its **taxonomy accent** on the left rule: Allocation amber, Supply violet, Vesting emerald, Emission red, Sources blue, Risk orange. Same color = same concept as the graph. Header is a real `<h2>` (AA heading semantics).
- **Charts (recharts, "chart space" framed):** allocation **donut** + breakdown legend (segment colors from `chart-colors.ts`, thin violet hairline frame + "chart space" tag so it doesn't read as graph colors), **supply bars** (max/init/TGE/circ, `tabular-nums`), **vesting/unlock timeline** area chart. Hovering a segment *focus-dim*s the corresponding graph node — chart↔graph are bound.
- **`<RiskPill>`** — `--risk-{low,med,high}` + a shape/icon prefix (▲) so severity is never color-only.
- **`<PublishPanel>`** (sticky footer, promoted) — first-class, **always visible**, not buried at page bottom. Renders publish state as the **graph lighting up**: each confirmed chunk *swells-and-glows* its node; `linkDirectionalParticles` fire as triples confirm. CTA `[Publish to Intuition →]` carries `--gradient-brand`. Glass/refraction allowed here (interactive control).
- **`<InspectorDrawer>`** (`--surface-3`, focus-trapped, `aria-live`) — opens on any node/segment click: shows the **reified triple** (subject/predicate/object), provenance link, on-chain tx, and `[Stake +]` ($TRUST). Rich detail without leaving the page.

### B.3 Responsive

- **≥1280px:** graph left (sticky ~40%) + sections right (scroll). `<PublishPanel>` sticky under graph. Inspector = right overlay drawer.
- **768–1279px:** graph collapses to a **tabbed strip** ("Graph | Data"); sections single-column full-width; `<PublishPanel>` becomes a sticky bottom bar; Inspector = bottom sheet.
- **<768px:** header compresses (ticker + status + completeness ring). Sections as an accordion (each `<SectionCard>` collapsed, Core expanded). Graph = tap-to-open full-screen `mode="ambient"`. Inspector = full-screen sheet. Publish = sticky bottom CTA.

### B.4 Motion moments

1. **Section expand (Enrich):** content reveals with a 200ms ease-out height/opacity; the corresponding graph nodes *spawn-at-hub* into the local graph (data appearing = graph growing).
2. **Chart segment ↔ node bind:** hover either → *focus-dim* the partner. ~100ms.
3. **Publish:** the marquee moment — chunks confirm → nodes *swell-and-glow* + *particle-salvo* along their edges, ending in a gradient sweep + "claims live" toast. Expressive (no task to block at this point).
4. **Stake from inspector:** node mass *swells*, halo brightens proportional to stake — Intuition's stake-as-weight made literally visible.
5. **Reduced-motion:** instant reveals, no particles; publish shows a deterministic step list with checkmarks instead of the light show.

### B.5 States

- **Empty section (e.g., no vesting yet):** `<GraphEmptyState>` inside the `<SectionCard>` — faint emerald `◆` glyph + "No vesting schedule yet — Contribute it" deep-linking to that exact form section (this is the **#7 "complete data to unlock viz"** affordance, per-section).
- **Loading:** `<GraphLoader>` in the graph slot; each section is a layout-mirroring skeleton (donut → ring skeleton, bars → bar skeletons) gated 300ms.
- **Error:** per-section inline error with retry; the rest of the page stays usable (sections fetch independently).
- **Publish states:** `idle → simulating → publishing (per-chunk progress, aria-live) → confirmed → error(retry failed chunks)`. Never a single opaque spinner — always chunk-level truth.
- **Not-connected wallet:** `<PublishPanel>` shows "Connect to publish" but the **entire read view + graph + inspector remain fully usable** — wallet deferred to the publish/stake moment only.

### B.6 Friction removed

Directly kills **#2 publishing buried & conditional** (promoted to a sticky first-class panel + the publish-as-graph-lighting-up moment), **#6 graph decorative not navigable** (clickable nodes → inspector, strengthened focused edges, ring+halo selection, lifted labels, full legend), **#7's "hidden incomplete data"** (per-section unlock affordances deep-linked to the missing form step), **#5 wallet gate** (read/explore needs no wallet), and the **info-dense-no-hierarchy** problem via Core/Enrich progressive disclosure + taxonomy-accented sections.

---

## (C) ONBOARDING / FIRST-RUN — the front door

Replaces `redirect('/dashboard')`. Public, **no-auth**, the living graph is the hero. A 4-beat spine: **welcome → choose path → connect wallet (optional) → first action**. Both personas reach their aha in <5 min with no wallet.

### C.1 Layout — beat by beat (desktop, single full-bleed `--surface-0` canvas)

**Beat 1 — Welcome / hero**
```
┌───────────────────────────────────────────────────────────────────────────┐
│  ◎ TrustNomiks                                              [Sign in]       │
│                                                                             │
│        The Tokenomics Intelligence Graph.                                   │
│        ───────────────────────────────────  (gradient-brand text)          │
│        Turn whitepapers into verifiable, on-chain claims.                   │
│                                                                             │
│        [ Explore the graph → ]   [ Contribute a token → ]                   │
│                                                                             │
│   <LiveGraph mode="hero"> streaming nodes outward from ◎ hub               │
│   ●──◎──●  ◆ ··· particle-salvo ···   counter:  142 / 300 structured        │
│        living indexer in motion, full-bleed behind the copy                 │
└───────────────────────────────────────────────────────────────────────────┘
```

**Beat 2 — Choose path (role select)**
```
┌───────────────────────────────────────────────────────────────────────────┐
│            How do you want to start?                                        │
│  ┌────────── EXPLORER ──────────┐   ┌──────── CONTRIBUTOR ─────────┐        │
│  │ ● browse the knowledge graph │   │ ◆ structure a token's data   │        │
│  │ ● compare tokenomics         │   │ ◆ publish verifiable claims  │        │
│  │ ● discover insights          │   │ ◆ stake $TRUST on truth      │        │
│  │ preview: mini live-graph     │   │ preview: 2 atoms → 1 triple  │        │
│  │        [ Explore → ]         │   │       [ Contribute → ]        │        │
│  └──────────────────────────────┘   └───────────────────────────────┘       │
│              ·· skip · just look around (→ dashboard, no choice) ··          │
└───────────────────────────────────────────────────────────────────────────┘
```

**Beat 3 — Connect wallet (OPTIONAL, deferred)**
```
┌───────────────────────────────────────────────────────────────────────────┐
│   You don't need a wallet yet.                                              │
│   Sign in to save your work — a wallet is only needed to publish or stake.  │
│   ┌─────────────┐ ┌─────────────┐    ┌──────────────────────────────┐       │
│   │  Email ▪    │ │  Google ▪   │    │ Connect existing wallet ⬡    │       │
│   │ (→ embedded │ │ (→ embedded │    │ (crypto-native secondary)    │       │
│   │   smart     │ │   smart     │    └──────────────────────────────┘       │
│   │   wallet)   │ │   wallet)   │       [ Continue without account → ]      │
│   └─────────────┘ └─────────────┘                                           │
└───────────────────────────────────────────────────────────────────────────┘
```

**Beat 4 — First action (path-dependent, the aha)**
```
EXPLORER aha                              CONTRIBUTOR aha
┌──────────────────────────────┐         ┌──────────────────────────────┐
│ Pick a token to explore:     │         │ Let's structure one token.   │
│ ◍ETH  ◍SOL  ◍ARB  ◍…         │         │ Paste a whitepaper / URL:    │
│ → opens Token Detail (B)     │         │ [ https://…              ]   │
│   with a guided spotlight:   │         │  ↳ AI proposes atoms/triples │
│   "click a node to inspect"  │         │  ● token ◆ allocation ▪ src  │
│                              │         │   [ Review & build graph → ] │
│  watch it assemble:          │         │  watch your graph form live  │
│  <GraphLoader> → focus-dim   │         │  beside the inputs           │
└──────────────────────────────┘         └──────────────────────────────┘
        first checklist item ☑ done · "see your claim live in the graph" bridge
```

### C.2 Components (nomenclature)

- **`<LiveGraph mode="hero">`** — same set-piece as Dashboard, here full-bleed behind hero copy: streams nodes outward from `◎ hub`, counter ticks toward 300. The product *is* a living indexer from the first second. On mobile / reduced-motion → static pre-settled layout.
- **Two dual CTAs** carrying the two-persona split, each with its glyph (● explorer / ◆ contributor). The skip link ("just look around") guarantees no dead-end.
- **Role-select cards** — each previews its payoff with a tiny **live mini-graph** (explorer) / an **atoms→triple** animation (contributor) so the choice is concrete, not abstract.
- **Wallet step = `<AuthPanel>`** — email/Google primary → **embedded smart wallet** (no seed phrase, no extension); "connect existing wallet" (RainbowKit) as the **secondary** crypto-native path. "Continue without account" keeps exploring. Wallet is never a gate.
- **Contributor first-action = AI-assist intake** — paste whitepaper/proposal URL → proposed Atoms/Triples for review; the form **builds the graph in real time** beside the inputs. This is the #3 "3,606-line form" antidote at the very first touch.
- **Explorer first-action = guided Token Detail** — drops into screen (B) with a one-time spotlight coachmark ("click a node to inspect"), then hands off.
- **`<GettingStartedChecklist>`** is seeded here — beat 4 completes its first item, carrying momentum into the Dashboard.

### C.3 Responsive

- **≥1280px:** full-bleed hero graph + centered copy; beats 2/3/4 as centered cards over the breathing graph.
- **768–1279px:** hero graph shorter; role cards stack 1×2 → may sit side-by-side; wallet options wrap.
- **<768px:** graph becomes a contained **top banner** (`mode="ambient"`, pointer off, low particle budget — performance); copy + single stacked CTA below; role cards full-width stacked; wallet step single-column; contributor intake field full-width with sticky "Review →".

### C.4 Motion moments

1. **Hero entrance:** nodes *spawn-at-hub* and fan outward over ~1.2s ease-out, counter counts up, gradient title wipes in. The one place expressive motion is unrestricted (no task to block).
2. **Path hover:** the chosen card's mini-graph animates (explorer cluster lights up / contributor atoms snap into a triple via *particle-salvo*).
3. **Wallet:** restrained — email/Google buttons have only a hover lift; no theatrics over an auth decision.
4. **First action (the aha):** contributor → pasted URL triggers a `<GraphLoader>` that **assembles their token's graph** node-by-node (*spawn-at-hub*, `--stagger-ingest`); explorer → target token's local graph *focus-dim* spotlights the first node. Ends with the checklist item ticking ☑.
5. **Reduced-motion:** hero is a static composed graph still-frame with the counter as a plain number; all assembly animations become instant final states; auth/first-action fully functional.

### C.5 States

- **Default (first-ever visit):** full hero, both CTAs, skip link.
- **Returning, not signed in:** hero compresses; `[Sign in]` + "Resume where you left off" if a local draft exists.
- **Loading (graph warming):** `<GraphLoader>` (mini-graph assembling) stands in for the hero until `warmupTicks` settle — never a blank canvas or a bare spinner.
- **Error (intake AI fails / URL unparseable):** contributor path falls back gracefully to the manual Core form pre-opened at Identity, with a toast "Couldn't read that doc — start manually, we'll keep what we got." No dead-end.
- **Auth error:** inline under the relevant button, other methods still available; "Continue without account" always works.
- **Success:** path chosen + first action done → route into Dashboard (A) with the checklist showing 1/5 and a `<NextBestAction>` bridge primed.

### C.6 Friction removed

Eliminates **#1 no front door** (this *is* the public, role-selecting, no-auth front door with the living graph as hero — the single biggest activation lever), **#5 wallet-as-gate** (wallet fully deferred; email/social → embedded smart wallet; both personas reach aha with no wallet), seeds the **#3 form antidote** (AI-assist intake at first touch instead of the 3,606-line wall), and plants the **#10 onboarding spine** (first checklist item + explicit contributor↔explorer bridge) that the Dashboard then carries forward.

---

## Cross-screen consistency checklist (build-time guardrails)

- **One token layer:** all three screens read `--surface-*`, `--graph-*`, `--status-*`, `--risk-*`, motion tokens from `globals.css` `@theme`. No component hardcodes a hex. `getGraphColor()` / `getChartColor()` are the only color accessors for canvas/SVG/DOM.
- **Graph space vs chart space** visually separated and labeled on every surface that shows both (Dashboard band 2 vs none; Token Detail graph vs framed charts).
- **AA baked in:** one `:focus-visible` ring everywhere (both themes); `aria-current` on active nav; heading semantics on every `<SectionCard>`; non-color cues via the ● ◆ ▪ ◎ + ▲ glyphs; focus-trap + `aria-live` on `<InspectorDrawer>`, `<PublishPanel>`, onboarding dialogs; full keyboard + `<CmdkPalette>`; graph has a table/list fallback; `prefers-reduced-motion` honored on all five motion gestures.
- **Performance:** dark-first; skeletons-not-spinners gated 300ms; `<LiveGraph>` budgeted (`warmupTicks`/finite `cooldownTicks`/`autoPauseRedraw`; `enablePointerInteraction={false}` + low particle budget on `mode="ambient"`); token table virtualized toward 300×N; sub-200ms perceived transitions; optimistic updates on stake/publish.
- **`<LiveGraph>` is one component, three modes** (`hero` | `local` | `ambient`) reused across all three screens — the single source of the "living indexer" signature.
