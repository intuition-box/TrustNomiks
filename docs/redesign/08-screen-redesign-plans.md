# 08 · Screen-by-Screen Redesign Plans (July 2026)

> The execution plan that takes every remaining screen from shadcn-MVP to the Data Observatory
> language, and defines **the screen grammar ("la trame")** that every future tool (claim/debate
> room, data-room extensions, analytics) must be built on. Grounded in the sweep notes
> ([07-app-sweep-notes.md](./07-app-sweep-notes.md)) and bound by [DESIGN-RULES.md](./DESIGN-RULES.md).
>
> Nothing here invents a new visual language. It applies the locked one (docs 00-06) with a point
> of view per screen, and kills the frictions found in the sweep.

---

## 1. The Observatory Grammar — the reusable screen trame

Every TrustNomiks screen is **an instrument pointed at the same graph**. One skeleton, five bands.
A future tool is designed by filling this skeleton, never by inventing a new page shape.

```
┌──────────────────────────────────────────────────────────────────────┐
│ TOP BAR   brand · ⌘K search · network + wallet pill · avatar menu    │ shell
├────────┬─────────────────────────────────────────────┬───────────────┤
│        │ ① IDENTIFY  h1 + one-line job + 1 primary   │               │
│  RAIL  │    action (brand gradient only if core CTA) │  ④ GUIDE      │
│        │ ② QUANTIFY  3-5 StatTiles, .tabular,        │  next-best-   │
│ EXPLORE│    each tile answers one question, each     │  action,      │
│  zone  │    tile clickable = filter/drill-down       │  provenance,  │
│        │ ③ WORK  the instrument itself: table /      │  checklist,   │
│ CONTRIB│    studio / canvas / chart wall / pipeline. │  help. 320px, │
│  zone  │    Visually dominant (≥60% of viewport).    │  folds under  │
│        │    ONE instrument per screen.               │  ③ on mobile  │
│        ├─────────────────────────────────────────────┴───────────────┤
│        │ ⑤ PROVIDE  dense meta strip: counts, last sync, links       │
└────────┴──────────────────────────────────────────────────────────────┘
```

Bands ②, ④, ⑤ are optional per screen; ① and ③ are not. A screen with two instruments is two
screens. A screen whose primary CTA competes with another gradient button is wrong.

**The state contract** (every band, every future tool):

| State | Rendering | Never |
|---|---|---|
| Loading | `GraphLoader`, or a skeleton mirroring the final geometry (tables/charts) | text "Loading...", bare spinners, layout jump |
| Empty | `EmptyState` (graph-seeded) + exactly one next action, doubles as onboarding | gray icon in a dashed void |
| Error | `ErrorState` (new composite): plain-language message + Retry + digest in small mono | raw `error.message`, toast-only for pane-level failures, error disguised as empty |

**The interaction contract:**
- The whole row/card is the click target; it navigates. Secondary actions appear on hover / in a
  kebab. Destructive actions confirm, naming the target.
- Numbers: `.tabular` always; hashes/addresses/amounts: `font-mono` (use the new `HashText`).
- Wallet is requested **only at the on-chain boundary** (publish, stake), through one canonical
  `WalletGate` block that says why, never as ambient nagging. One wallet prompt per screen, max.
- Color = concept (`--data-*` accent per domain family), always paired with a glyph.
- Motion: task surfaces stay ≤400ms and functional; the expressive vocabulary (spawn-at-hub,
  particle-salvo, swell-and-glow, focus-dim, breathe) fires only at reveal/celebration moments,
  gated on `prefers-reduced-motion`.

**New shared components this plan requires** (tier placement per DESIGN-RULES §5):

| Component | Tier | Job |
|---|---|---|
| `PageHeader` | composite | band ①: title, job line, primary action slot |
| `ErrorState` | composite | the error contract (fractured-edge graph motif) |
| `WalletGate` | composite | the one connect-at-the-boundary block, with "why now" copy |
| `HashText` | composite | mono + middle-truncate + copy for addresses/hashes/ids |
| `ClusterMeter` | pattern | completeness as 4 cluster glyphs lighting up + % (replaces bare bars) |
| `CompareTray` | pattern | bottom dock collecting 2-4 tokens → Data Room compare |
| `CmdkPalette` | pattern | ⌘K: tokens, nodes, actions, jump-to, taxonomy-colored results |
| `TokenTable` | feature | TanStack v8 registry table (virtualized at scale) |
| `PublishPanel` re-skin | feature | `.glass` publish flow, `aria-live` progress, abort |

---

## 2. Shell & navigation

**Job:** hold both journeys (explore / contribute) without hiding either; give wallet one home.

- **Rail, two zones** (docs 04), replacing the flat 5-item list:
  - `EXPLORE` — Home · Tokens · Data Room (renamed from Token House) · Graph *(route lands Phase 3;
    until then the dashboard graph card expands)*
  - `CONTRIBUTE` — Add token · Publish & Export
  - Footer — Get-started ring (3/4), collapse toggle.
- Active item: hairline left accent + tinted text + `aria-current="page"`. Kill the full-width
  indigo pill; the rail must recede so the taxonomy can glow in the work area.
- **Real top bar** (56px): screen context · ⌘K search field (opens `CmdkPalette`) · network badge +
  wallet pill (`HashText`, TRUST balance `.tabular`) · avatar menu (Profile, Theme, Log out).
  This kills the floating "Connect wallet" button and the duplicate wallet prompts app-wide.
- Sidebar smoke-blob animation: gate on `prefers-reduced-motion` or retire.
- Mobile: top bar + hamburger sheet (zones preserved); no bottom tab bar for now.

## 3. `/login` — "the graph greets you"

**Job:** convert the landing's promise into a session with zero brand drop.

```
┌───────────────────────────┬──────────────────────────────────────────┐
│  ◎ TrustNomiks            │                                          │
│                           │        LiveGraph mode="ambient"          │
│  [ Log in | Create ]      │        (breathing, taxonomy nodes)       │
│  Email     [___________]  │                                          │
│  Password  [___________]  │   "Structure, verify and publish         │
│  (inline blur validation) │    tokenomics as a living graph."        │
│  [ Log in  → ] (brand)    │    ● token  ◆ claim  ▪ source            │
│                           │                                          │
│  No wallet needed here.   │                                          │
│  Connect only when you    │                                          │
│  publish on-chain.        │                                          │
└───────────────────────────┴──────────────────────────────────────────┘
```

- Auth panel (480px, `bg-surface-1`) + ambient graph pane (hidden on mobile).
- Log in / Create account as **segmented tabs**, not a buried footer link. Password rules visible
  before submit (live hint), confirm-match inline, Supabase errors mapped to human copy
  ("That email and password don't match" instead of raw API strings).
- Submit = the screen's one brand-gradient CTA. On success, the hub node ignites (spawn-at-hub)
  during the redirect. Reduced motion: instant redirect.
- Wallet-deferral copy (docs 04) sits under the form; no wallet UI on this screen at all.

## 4. `/dashboard` — refinements only

Keep the three-band structure. Fix the debts:
- StatTiles become **drill-downs**: Drafts → `/tokens?status=draft`, Validated → `/tokens?status=validated`.
- Graph card: fold search + type chips behind one Filter control; legend collapsed by default;
  keep the node/edge count as the single meta pill.
- Get-started: completed items = filled glyph + muted text (strikethrough reads as deleted).
- Next-best-action adds the publish bridge: "10 validated tokens ready to publish → Publish".

## 5. `/tokens` — "The Registry" (flagship rebuild)

**Job:** scan, filter and act on hundreds of tokens in one screen; feed Compare.

```
① Tokens — 18 of 300 structured          [ + Add token ] (brand)
② [Total 18▸] [Validated 10▸] [In review 0▸] [Drafts 8▸]   ← tiles are filters
③ [search____] [All|Draft|Review|Validated] [Category ▾]
   TOKEN            CHAIN    CATEGORY   COMPLETENESS   STATUS      UPDATED    [+]
   ● ApeCoin  APE   ethereum Open Digi  ◆●●○ 90%       ✓Validated  Feb 18      +
   ● Intuition TRUST ethereum Financial ◆●●○ 85%       ✓Validated  Feb 17      +
   (44px rows, whole row → detail, hover reveals Edit/Export, kebab holds Delete)
⑤ 18 tokens · sorted by completeness · last sync 2 min ago
└ CompareTray (docks when [+] used):  [●APE ×] [●TRUST ×]  Compare 2 →
```

- `TokenTable` on TanStack v8; client-side is fine at 18, virtualize + server-fetch when >100.
- **Completeness = `ClusterMeter`**, not a progress bar: the four cluster glyphs (identity, supply,
  allocation, vesting) light up in their taxonomy colors as data lands. The registry literally shows
  constellations forming — this is the screen's signature and the non-color cue in one.
- `[+]` per row collects into `CompareTray` (2-4) → `/data-room?compare=a,b`. This ships the core
  "compare tokenomics" promise that is currently absent.
- Status changes stay in detail (one authority), but the row shows StatusPill with icon.
- Error ≠ empty: failed fetch renders `ErrorState` with Retry. Mobile: rows collapse to compact
  cards (glyph + name + ClusterMeter + StatusPill); sort/filter in a sheet.

## 6. `/tokens/new` — "The Structuring Studio" (flagship UX rebuild)

**Job:** make structuring a token feel like feeding a graph, not filling a tax form. Kill the
padlock wall.

```
① Add token: ApeCoin            ✓ Saved 2s ago · 68/100
┌─ spine 240px ──┬─ one section at a time ─────────┬─ live graph 320px ─┐
│ CORE           │  ● Supply                        │      ◇ APE          │
│ ● Identity  20 │  "How much exists, now and at    │     ╱ │ ╲           │
│ ◐ Supply    10 │   the end." (accent: --data-…)   │    ●  ●  ◆          │
│ ○ Allocation   │  Max supply      [1,000,000,000] │  nodes spawn as     │
│ ENRICH         │  Initial supply  [___________]   │  sections save      │
│ ○ Vesting      │  TGE supply      [277,490,000]   │ ────────────────    │
│ ○ Emission     │  Circulating     [752,651,515]   │  ○ 68/100 ring      │
│ ○ Sources      │  Source URL      [___________]   │  AI-assist slot:    │
│ ○ Risk (opt)   │                                  │  [Paste whitepaper  │
│                │                                  │   URL → propose]    │
├────────────────┴──────────────────────────────────┴────────────────────┤
│  ← Identity        ✓ autosaved              Continue → Allocation      │
└─────────────────────────────────────────────────────────────────────────┘
```

- **One section visible at a time** (~5 fields), spine shows per-section state glyph
  (○ empty / ◐ partial / ● complete) + points. No locked walls: a draft auto-creates on the first
  valid name+ticker blur, silently unlocking everything. Sections are always browsable.
- **Autosave** on blur/debounce per section (keep the optimistic-lock RPCs), visible as the
  "✓ Saved 2s ago" chip. Per-section Save buttons and the dirty-loss trap disappear.
- **Allocation gate softened** (docs 04): a luminous sum bar under the segment rows, amber while
  ≠100, seals emerald at 100.0 with a particle-salvo. Two one-click fixes: "Add remainder as
  Unallocated" and "Normalize to 100". Tolerance ±0.1 warns without blocking; the hard check moves
  to "mark section complete", not every save.
- **CoinGecko autofill does its job**: picking a coin fills name, ticker, image, contract (per
  chain) and supply figures, and pre-seeds a CoinGecko row in Sources. One pick ≈ 40 points.
- **The graph is the progress bar**: each saved section spawns its nodes at the hub in the right
  pane (spawn-at-hub, then breathe). Completeness ring beneath. Reduced motion: nodes appear, ring
  fills, no travel.
- AI-assist slot designed now, shipped later (Phase: paste whitepaper/DAO URL → proposed values a
  human reviews field-by-field).
- Core complete → inline completion moment: "APE is structured · 3 atoms, 12 triples ready" +
  `Publish on-chain` (brand) + "Enrich to 100" path. Edit mode deep-links: `?section=vesting`.
- Mobile: spine becomes a horizontal chip rail; graph pane collapses to ring + node count.

## 7. `/tokens/[id]` — detail refinements (already reference quality)

- **PublishPanel re-skin**: `.glass` surface (rule 4 assigns glass to the publish panel),
  status-aware guidance for drafts ("Validate this token to publish it" + inline status action),
  `aria-live` progress, a visible **Abort** during chunked publishing, signature count up front.
- Allocation segment colors resolve via `getChartColor` (kill the hand-rolled map); emission
  burn/buyback boxes and publish stack move to tokens; em-dash purge (toasts included).
- Section EmptyStates deep-link to the studio section (`?section=supply`), not the form top.
- **Claim-ready provenance affordance** (seed for the debate tool): every data row keeps its source
  chip and gains a dormant stake chip (◆ + $TRUST weight, `.tabular`) that today opens provenance
  and tomorrow opens the Claim Room drawer (§10). Design the chip now so claims plug in without a
  reflow.

## 8. `/token-house` → **`/data-room`** — the analytics wall

**Job:** prove structured data pays off: visualize and compare tokenomics instantly.

- **Rename** to Data Room (nav: ◆ glyph). `/token-house` redirects.
- Left picker shows **all** tokens (never hide thin ones): mini `ClusterMeter` + StatusPill per
  card; thin tokens show "Complete supply to unlock charts →" deep link (the gap affordance,
  docs 00). Kill the color-only Alloc/Supply/Unlock/Circ chips.
- Workspace per token: KPI strip (`.tabular`), allocation donut + stacked bar (chart-space colors,
  hatched Unallocated), supply bars with max reference line, unlock timeline (stepAfter cliffs,
  TGE marker, diamond cliff markers per doc 06). Missing charts render as mini EmptyStates with
  deep links, not silence.
- **Compare mode** (`?compare=a,b,c`): the CompareTray's landing. 2-4 tokens as synced small
  multiples (donuts row, unlock timelines overlaid with line-style + color, allocation profile
  table). Series identity = line style + color, never color alone.
- Errors surface as pane-level `ErrorState` with retry (today: silent `null`).

## 9. `/export` → **Publish & Export** — the pipeline

**Job:** one selection, two deliveries: download JSON or light the graph on-chain.

```
① Publish & Export        [Runs ▸ history tab]
③ Step 1 SELECT   validated tokens, checkboxes + ClusterMeter
   Step 2 REVIEW   triples grouped by family with taxonomy accents:
                   ● APE · has max supply · 1,000,000,000   (mono, .tabular)
                   ◆ APE · allocates to · DAO Treasury (47%)
                   [toggle: raw JSON]
   Step 3 DELIVER  ┌ Download JSON ┐   ┌ Publish on-chain ────────────┐
                   │ no wallet     │   │ WalletGate: cost, signatures │
                   └───────────────┘   └──────────────────────────────┘
```

- Selection → review → deliver as one visible pipeline; the review is **human-readable triples**
  (the JSON dump becomes a toggle). One Download button. One wallet prompt, inside the publish
  card only.
- "About Intuition Triples" demotes to a footnote link (rule 7: the rail is credited, not
  headlined). Publish history ("My Exports") becomes the Runs tab, reusing the detail page's run
  components.
- Publishing animates as the graph lighting up from the hub (particle-salvo per confirmed chunk),
  `aria-live` counts, abort available.

## 10. `/profile` — "Your constellation"

**Job:** identity + proof of contribution, in the product's own vocabulary.

- **Identity card**: avatar, display name (finally editable: name/role/org collected at signup),
  wallet link status (`HashText`).
- **Contribution constellation**: your tokens as a local LiveGraph; your share and avg
  completeness as StatTiles (`.tabular`).
- **Tier ladder re-cut in the glyph system**, killing the emoji: ○ Observer → ● Contributor →
  ◆ Curator → ◎ Architect, colored by the taxonomy, icon + color (AA).
- Leaderboard shows display names (fallback "Contributor #12"), your row highlighted; counts
  `.tabular`. On-chain activity behind one `WalletGate`.

## 11. Error boundaries & system states

- One `ErrorState` composite everywhere: fractured-edge motif (two nodes, one broken edge), plain
  copy ("Something broke on our side. Your data is safe."), Retry + Go home, digest in small mono.
  Raw `error.message` never reaches the UI.
- Both error.tsx boundaries collapse into it; pane-level variant for Data Room/Registry fetches.

## 12. Future tools plug-in (how the trame extends)

- **Claim Room (debate a data point)**: opens as a drawer from any provenance/stake chip (§7).
  Band ① = the claim as a sentence (subject · predicate · object, taxonomy-colored). Band ③ = the
  two positions (for / against) with staked $TRUST as node mass (swell-and-glow), stake input on
  `.glass`. Band ④ = provenance chain + history. It inherits the state contract, WalletGate at the
  stake boundary, and ships as a Feature under `src/features/claims/`.
- **Any new analytics tool** lands as a Data Room workspace tab (band ③ swap), not a new page
  shape. **Any new intake tool** (AI-assist, bulk import) lands as a Studio spine entry.

## 13. Rollout order & acceptance

1. **Shell + login** (the frame everything hangs in) + `PageHeader`/`ErrorState`/`WalletGate`/`HashText`.
2. **Registry** (`TokenTable`, `ClusterMeter`, `CompareTray` shell).
3. **Structuring Studio** (biggest lift, biggest friction payoff).
4. **Data Room** (rename, all-tokens picker, compare landing).
5. **Publish & Export** pipeline + PublishPanel re-skin (shared with detail).
6. **Profile + error boundaries**, em-dash/`.tabular`/`aria` sweep app-wide.
7. Motion polish pass (spawn/salvo/swell moments, reduced-motion audit).

Every step ships only if the DESIGN-RULES §8 checklist passes (tokens only, both themes, tabular,
glyph pairing, surfaces, motion gating, tier placement, zero em-dash, lint+test+build green).
