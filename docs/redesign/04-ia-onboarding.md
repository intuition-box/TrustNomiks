# Information Architecture, Navigation & Onboarding Spine

I have everything I need. The code confirms the brief exactly: 5-item sidebar (Dashboard/Tokens/Token House/Export/Profile), the orphaned smoke-blob logo animation, `redirect('/dashboard')` as the only front door, a linear gated stepper, and the graph living only inside `dashboard-knowledge-graph-card`. Here is the section.

---

# Information Architecture, Navigation & Onboarding Spine

> **North star:** one shell, two journeys, zero dead ends. Every screen answers *"what's the next deeper thing I can do?"* The graph is not a page — it is the **substrate** the whole product navigates through. The contributor *builds* it; the explorer *reads* it; the same nodes, same 16 colors, same glyphs everywhere.

---

## 1. Redesigned IA & Navigation Model

### 1.1 The core problem with today's IA

| Today | Problem |
|---|---|
| `/` → `redirect('/dashboard')` | No front door, no role-select, wallet/auth gate before any value |
| Flat 5-item sidebar (Dashboard / Tokens / Token House / Export / Profile) | Persona-ambiguous; "Token House" is opaque; "Export" is a contributor-only terminal verb sitting in primary nav for everyone |
| Graph trapped in `dashboard-knowledge-graph-card` | The signature surface is a dashboard widget, not a navigable space |
| Publish buried in `/tokens/[id]` bottom | The climactic action has no home in nav |
| No search, no command palette | 300 tokens × N nodes is un-navigable by browsing alone |

### 1.2 The new navigation model — a *mode-aware* shell

Keep a single persistent shell (left rail + top bar), but split it into **three semantic zones** and make the rail **mode-aware** (Explore vs Contribute) without forcing a hard role lock — a user can toggle modes anytime via the top-bar switch. This welds the two personas into one chrome instead of two apps.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ◆ TrustNomiks        [ ⌘K  Search atoms, tokens, claims… ]      ◉Explore ◷Contribute │ ← top bar: brand · global search · mode switch · wallet pill · avatar
├────────────┬─────────────────────────────────────────────────────────────────┤
│            │                                                                  │
│  EXPLORE   │                                                                  │
│  ◉ Home    │                                                                  │
│  ⬡ Graph   │                    ── main content ──                            │
│  ◇ Tokens  │                                                                  │
│  ⇄ Compare │                                                                  │
│            │                                                                  │
│  CONTRIBUTE│                                                                  │
│  ＋ Add token                                                                   │
│  ▤ My drafts                                                                  │
│  ⟠ Publish │                                                                  │
│  ⬆ Exports │                                                                  │
│ ─────────  │                                                                  │
│  ⚑ Get started  ●●●○○○                                                        │ ← persistent onboarding progress (collapses to ring when complete)
│  ☼ Theme · ⚙ Profile                                                          │
└────────────┴─────────────────────────────────────────────────────────────────┘
```

**Zone-by-zone, vs today:**

| New item | Replaces / changes | Rationale |
|---|---|---|
| **Explore › Home** | today's `Dashboard` | Role-aware landing once authed; KPI band + live graph + activity. Not renamed "Dashboard" because explorers don't have a dashboard, they have a *home base*. |
| **Explore › Graph** ⬡ | **NEW** — promote the dashboard card to a first-class route `/graph` | The signature surface becomes navigable: click a node → inspector drawer → deep-link to the token. This is the "front door, internalized." |
| **Explore › Tokens** ◇ | today's `Tokens` | Stays, but becomes a true browse/filter/virtualized table (the explorer index), not a contributor work-queue. |
| **Explore › Compare** ⇄ | **NEW** (absorbs & renames `Token House`) | "Token House" is jargon. The actual job is **multi-select side-by-side comparison** — name it after the job. Single-token "house" view becomes the *token detail* page; the multi-select compare becomes `/compare`. |
| **Contribute › Add token** ＋ | today's `/tokens/new` | Now lives under an explicit Contribute zone, framed as a creative act. |
| **Contribute › My drafts** ▤ | **NEW** (was hidden inside Tokens filtering) | Draft-resume needs a *home*. Surfaces autosaved drafts with completeness rings. |
| **Contribute › Publish** ⟠ | **NEW** — promote from `/tokens/[id]` bottom | The on-chain publish gets a first-class destination: a queue of validated tokens ready to publish, the publish panel as graph-lighting-up set-piece. |
| **Contribute › Exports** ⬆ | today's `Export` | Demoted from everyone's primary nav into the Contribute zone where it belongs (JSON Triples is a contributor terminal action). |
| **Get started** ⚑ | **NEW** | Persistent onboarding checklist (see §2). |
| **Profile / Theme** | today's `Profile` + theme toggle | Move to the rail footer / avatar menu — not a primary nav peer. |

**Mode switch behavior:** the top-bar `Explore / Contribute` toggle re-weights the rail (bolds the active zone, dims the other) and changes Home's content emphasis. It never *hides* the other zone — the bridge between personas (§5) must always be one click away.

### 1.3 Command palette (⌘K)

The single highest-leverage navigation primitive for a 300-token × N-node graph. Built on `cmdk`, invoked from the top-bar search or `⌘K`.

```
┌─────────────────────────────────────────────────────────────┐
│  ⌘K   ›  uni                                                 │
├─────────────────────────────────────────────────────────────┤
│  TOKENS                                                      │
│   ◇ Uniswap (UNI)            violet · validated · 92% complete│
│   ◇ Unizen (ZCX)             violet · draft · 40% complete    │
│  ATOMS / NODES                                              │
│   ⬡ Allocation: Team 21.3%   amber                           │
│   ◇ Vesting: 4y linear       emerald                         │
│  ACTIONS                                                    │
│   ＋ Add a new token                                          │
│   ⟠ Publish validated tokens (3 ready)                       │
│   ⬡ Open in graph                                            │
│  JUMP TO                                                    │
│   ◉ Home · ⬡ Graph · ⇄ Compare · ⬆ Exports                  │
└─────────────────────────────────────────────────────────────┘
```

- **Searches across entities** (tokens), **graph nodes** (atoms/triples), **actions** (add/publish/export), and **navigation** — one box, ranked. Results carry the **taxonomy color + glyph** so the palette teaches the visual language while you use it.
- Keyboard-first, fully operable, focus-trapped — satisfies the AA keyboard constraint and gives both personas a power-user spine.

### 1.4 Global search vs command palette

- **Top-bar search field** = the always-visible affordance; focusing it opens the palette. One mental model, two entry points (click or `⌘K`).
- Search is **entity + node + content**: typing "team allocation" finds allocation *atoms* across tokens, not just token names — because the unit of value is the *claim*, not the token.

### 1.5 Where the graph lives

Three tiers, one canvas, one config (`node-config.ts` promoted to design tokens):

1. **Ambient** — hero (public landing) and Home, `enablePointerInteraction={false}`, `autoPauseRedraw`, breathing idle motion. Decorative-but-on-brand.
2. **Navigable** — `/graph` route + the inspector drawer. Clickable nodes drive navigation; focus-dim on select; deep-links into token detail. This is the explorer's primary surface.
3. **Generative** — the contributor form **builds the graph live** beside the inputs, and the publish panel is the graph **lighting up** as chunks confirm. The graph is the shared artifact both personas touch.

---

## 2. First-Run + Onboarding Spine

### 2.1 Landing / entry (the new front door)

Replace `redirect('/dashboard')` with a **public, no-auth `/` landing**. The hero *is* the live animated graph streaming nodes outward from the indigo hub while a counter ticks toward 300. No wallet, no login wall.

```
┌──────────────────────────────────────────────────────────────────────────┐
│  ◆ TrustNomiks                                          [ Log in ]  [⌘K]   │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│        The Tokenomics Intelligence Graph.                                  │
│        Verifiable tokenomics, one claim at a time.        ⬡  ◇            │
│                                                          ◇   ⬡◇    ◇       │
│        ┌────────────────────┐  ┌────────────────────┐  ⬡  ◉hub◇  ⬡   ◇    │
│        │  ◷  Contribute     │  │  ◉  Explore        │   ◇  ⬡   ◇  ◇        │
│        │  Structure a token │  │  Browse the graph  │      ◇    ⬡          │
│        │  → 6 guided steps  │  │  → no signup       │   ← nodes stream     │
│        └────────────────────┘  └────────────────────┘     from hub, live   │
│                                                                            │
│             ▓▓▓▓▓▓▓▓▓░░░░░░░░  142 / 300 tokens structured                  │
└──────────────────────────────────────────────────────────────────────────┘
```

- **Lightweight role-select** — two doors, "Explore" (no signup, straight into the graph on sample/live data) and "Contribute" (into the guided form). This is the +30–50% activation lever the brief calls for.
- The "300" counter makes the **collective goal** visible from second one — the mission *is* the hook.

### 2.2 Progressive onboarding checklist (the spine)

A persistent, **role-aware** `Get started` item in the rail (and a dismissible Home card). Each item is a **small, tangible increment** that advances the user one rung — and crucially, **each empty state completes one item** (§2.4).

```
┌─ Get started ───────────────────────────  ●●○○○  2/5 ─┐
│  EXPLORER                                              │
│   ✓ See the graph in motion                            │
│   ✓ Open your first token                              │
│   ○ Compare two tokens          → /compare             │
│   ○ Find a gap worth filling    → "missing vesting" ⚐  │
│   ○ Connect to claim a node     → wallet (deferred)    │
│  ── switch to ──                                        │
│   ◷ Contribute your first token  (bridge → §5)         │
└────────────────────────────────────────────────────────┘
```

- **Two tracks** (explorer / contributor) that visibly **bridge** into each other — the checklist is itself the handoff mechanism.
- Collapses to a small **progress ring** in the rail once complete, then disappears — never nags.
- Tangible verbs ("Open your first token", "Find a gap"), never abstract ("Learn about Atoms"). Concept education is **just-in-time** via inspector tooltips (what's an Atom? a Triple? provenance? $TRUST stake?), not a wall of docs.

### 2.3 The "aha moment" (target: < 5 min, no wallet)

- **Explorer aha:** click a node in the live graph → the **inspector drawer** slides in showing the claim, its provenance source, and its $TRUST stake-weight rendered as node mass/glow → "this is a *verifiable, sourced, weighted* fact, not a blog post."
- **Contributor aha:** as they fill the form, **a node spawns at the hub and a triple particle fires along an edge** in the live mini-graph beside the inputs → "I am literally building the graph." The completion screen then shows their token **lit up in the full graph** and offers the publish step.

Both ahas happen **before** any wallet. Wallet is deferred to publish/stake (§2.6).

### 2.4 Empty-states-as-onboarding

Every empty surface is owned, graph-motif, and **advances one checklist item** — no dead `animate-pulse`.

```
┌─ My drafts ─ (empty) ──────────────────────┐   ┌─ Compare ─ (0 selected) ────────────┐
│            ⬡                                │   │     ◇        ◇                       │
│         ◇  ◉  ◇   ← faint hub sketch        │   │      ╲      ╱   pick 2+ tokens to    │
│            ◇                                │   │       ◇ ⇄ ◇    see them side-by-side │
│   No drafts yet.                           │   │                                     │
│   Structuring a token spawns its first     │   │   [ Browse tokens ]  [ ＋ Add one ]  │
│   atoms in the graph.                      │   │                                     │
│   [ ＋ Add your first token ]               │   └─────────────────────────────────────┘
│   ↳ completes "Contribute your first token"│
└────────────────────────────────────────────┘
```

Skeletons **mirror final layout** (no layout shift), gated at 300ms, graph-motif loader (a mini-graph assembling) instead of `Loader2`.

### 2.5 Sample data

The Explore door must never show an empty void. On first run (and for logged-out explorers), seed the graph + token table with a **curated set of fully-structured reference tokens** (clearly badged `Sample`). This lets the explorer reach compare/inspect aha with zero contribution, and gives the contributor a **gold-standard template** to mirror. Sample data is visually distinct (a subtle dotted ring on sample nodes) so it never pollutes the real 300-count.

### 2.6 Wallet-connect timing

Defer the wallet entirely past both ahas — it is the brief's #5 friction point.

```
Public landing ──► Explore / Contribute ──► browse, inspect, fill form, complete  ──► [WALLET]
   no auth            email/social               (all reachable, no wallet)            Publish on-chain
                   → embedded smart wallet                                              / Stake $TRUST
                   "connect existing wallet"                                            (only here)
```

- **Default path:** email/social → embedded smart wallet (custodial-feel, zero crypto knowledge).
- **Crypto-native path:** "connect existing wallet" (RainbowKit) as the visible secondary.
- Wallet is requested **only** at the publish/stake boundary — the single moment it's actually needed — with inline copy explaining *why now* ("publishing writes your claim on-chain and stakes $TRUST as its weight").

---

## 3. Redesigned CONTRIBUTOR Flow

The 3,606-line linear gated stepper (Identity → Supply → Allocation → Vesting → Emission → Sources) becomes a **tiered, autosaving, low-friction build** with the graph growing beside it.

### 3.1 Core vs Enrich tiering (progressive disclosure)

```
┌─ Add token: Uniswap ────────────────────────────  ▓▓▓▓▓░░  68% complete · ✓ saved 2s ago ─┐
│                                                                                            │
│  CORE (unlocks the graph)            ENRICH (deepens it)        ┌─ live graph ───────────┐ │
│  ✓ ① Identity                        ○ ④ Vesting               │        ◇ token          │ │
│  ✓ ② Supply                          ○ ⑤ Emission              │       ╱ │ ╲             │ │
│  ● ③ Allocation  ◀ here              ○ ⑥ Sources               │   amber │  amber         │ │
│                                      ⚐ ⑦ Risk flags (opt)      │    ◆ allocation atoms    │ │
│  ┌──────────────────────────────────────────────┐             │   (spawns as you type)  │ │
│  │  Allocation segments      sum: 100.0% ✓       │             │                          │ │
│  │  Team        21.3% ▓▓▓                         │             └──────────────────────────┘ │
│  │  Treasury    18.0% ▓▓                          │             AI-assist:                   │
│  │  + add segment   [ add remainder as Unalloc. ] │             [ Paste whitepaper / DAO URL ]│
│  └──────────────────────────────────────────────┘              → proposes atoms for review   │
│                                                                                            │
│  [ ← Supply ]                                   [ Save draft ]   [ Continue → Vesting ]      │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Core** (Identity / Supply / Allocation) is the minimum to render a token in the graph and reach the contributor aha. **Enrich** (Vesting / Emission / Sources / Risk) is optional, clearly framed as *deepening* — not a gauntlet. Sections render ~5 fields max, the rest behind progressive disclosure.

### 3.2 Friction kills (mapped to the brief)

| Friction | Fix |
|---|---|
| **Autosave invisible** (the per-section autosave exists but is silent) | Persistent `✓ saved 2s ago` chip in the header; the act of saving fires a small graph pulse. |
| **No draft resume** | `Contribute › My drafts` lists every autosaved draft with a completeness ring; click resumes at the last section. |
| **Allocation hard 100% gate** (`abs(total-100)<0.01`, the #1 abandonment point) | Replace hard block with: live sum bar, **"add remainder as Unallocated"** one-click, **normalize** button, and a *tolerance warning* (soft) instead of a blocking error. Let them proceed and fix later. |
| **No inline validation** | Per-field inline validation on blur (Zod, already present) with positive affordances (green check), not just red errors. |
| **No smart defaults** | Chain/category pre-filled from CoinGecko resolve (API already exists); vesting frequency defaults to most-common; sources auto-suggest the whitepaper URL once entered in Identity. |
| **No AI-assist** | "Paste whitepaper / DAO proposal URL" → proposes Atoms/Triples → contributor **reviews/accepts each** (human-in-the-loop, never auto-commit). Turns a 6-step form into a 6-step *review*. |
| **Completion screen never mentions publish** | New completion screen: token lit up in the full graph + completeness score + **explicit "Publish on-chain" CTA** (the bridge to the Publish destination). |

### 3.3 Progress & completeness as motivation

Completeness (0–100%, already computed) is reframed from a *score* into a **graph-growth meter**: every field filled visibly grows the token's subgraph. Section headers show per-section rings; the global bar shows distance to "publishable." Motivation = *watching your contribution become part of the living graph*, not chasing a number.

---

## 4. Redesigned EXPLORER Flow

A continuous **browse → compare → graph → detail** loop with progressive disclosure and inspector panels — never a full page reload between steps.

### 4.1 The loop

```
   /tokens (index)          /compare              /graph                 /tokens/[id]
   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      ┌──────────────────┐
   │ filter·sort  │ ⇄  │ side-by-side │ ⬡  │ navigable    │  ◇   │ token detail +   │
   │ virtualized  │───►│ multi-select │───►│ click node → │─────►│ inspector drawer │
   │ table (300×N)│    │ 2–4 tokens   │    │ inspector    │      │ + "contribute    │
   └──────────────┘    └──────────────┘    └──────────────┘      │   missing X"     │
        ▲                                         │               └──────────────────┘
        └─────────────── ⌘K from anywhere ────────┘
```

### 4.2 Browse — `/tokens` index

Becomes the real explorer index: virtualized table (TanStack Table, budgeted for 300×N), faceted filters (category, sector, chain, risk, completeness, status) carrying **taxonomy colors**, multi-select checkboxes that feed Compare. Tokens with thin data are **shown, not hidden** (today's silent-hide is friction #7), each with a "complete data to unlock viz" affordance deep-linked to the exact missing section.

### 4.3 Compare — `/compare` (the unbuilt core promise)

Multi-select 2–4 tokens → side-by-side allocation donuts, supply bars, unlock timelines, risk flags, completeness. Recharts series and node badges share the **same taxonomy colors** so "amber = allocation" holds across every token and every chart.

### 4.4 Graph — `/graph` (first-class, navigable)

The brief's friction #6, fixed as IA:

- **Nodes are clickable navigation** → open the **inspector drawer**, not a dead tooltip.
- **Inspector drawer** = progressive disclosure: claim → source/provenance → $TRUST stake-weight → "open full token" → "contribute missing data." The drawer is the unit that welds explore↔contribute.
- Focus-dim on select (Obsidian-style), strengthened edges in the focused subgraph, complete 16-type legend, family-colored selection ring (never white fill), raised label floor for hub+tokens.

### 4.5 Detail — `/tokens/[id]` (absorbs single "Token House")

The old single-token "Token House" view becomes the **token detail page**: full read view, charts, its subgraph, status management, per-token export — and prominently, the **gap affordances** ("missing vesting — contribute it") that hand off to §5.

---

## 5. How the Two Journeys Hand Off

The product is one spine; the personas are two ends of it. Handoffs are **explicit, bidirectional, and live in the UI surfaces both personas already touch** — never a separate "switch account" act.

```
        EXPLORER  ───────────────────────────────►  CONTRIBUTOR
   inspector drawer / token detail                  guided form (pre-seeded)
   "⚐ This token is missing VESTING."               opens at the Vesting section,
   [ Contribute it → ]                              token context pre-filled
        ▲                                                   │
        │                                                   ▼
   "◉ See your claim live in the graph"  ◄──────────  completion / publish screen
   deep-link: /graph?focus=<new-node>                 "your atom is now in the graph"
        CONTRIBUTOR  ◄─────────────────────────────  EXPLORER
```

**The three concrete bridges:**

1. **Explorer → Contributor (the gap bridge):** every thin token / empty section in the graph, detail page, and compare view carries a **"contribute this" affordance** deep-linked to the *exact* missing form section, pre-seeded with token context. A passive reader becomes an active builder at the precise moment they feel the gap.
2. **Contributor → Explorer (the payoff bridge):** the form completion and publish screens **drop the user into `/graph` focused on the node they just created** — "see your claim live." The reward for contributing is *exploring your own contribution* in the shared graph.
3. **The onboarding checklist as the meta-bridge (§2.2):** the dual-track checklist explicitly invites each persona to try the other ("Compare two tokens" for the contributor; "Contribute your first token" for the explorer), so the spine itself nudges every user across the seam at least once.

**Mode switch (top bar)** makes the handoff stateless: toggling Explore/Contribute never logs out, never loses context — it only re-weights the rail and Home. A single human fluidly *reads* and *writes* the same graph, which is exactly the welded product the brief calls for.

---

### Reference anchors (for implementation handoff)

- Nav today: `src/components/sidebar-nav.tsx` (5-item flat array L21–27) and `src/components/mobile-nav.tsx` — both to be replaced by the two-zone, mode-aware model; kill the orphaned smoke-blob logo animation (L43–62).
- Front door: `src/app/page.tsx` (`redirect('/dashboard')`) → public landing.
- Graph promotion: `src/components/knowledge-graph/dashboard-knowledge-graph-card.tsx` → new `/graph` route + shared inspector drawer (`graph-detail-panel.tsx` already exists as the seed). Single color source: `src/lib/knowledge-graph/node-config.ts` → CSS tokens.
- Form: `src/components/token-form-stepper.tsx` (linear gated `FORM_STEPS`) → Core/Enrich tiering with visible autosave + draft resume.
- Routes: add `/graph`, `/compare` (absorbs `/token-house`), `/drafts`, `/publish` (promote from `/tokens/[id]`); demote `/export` into the Contribute zone.
