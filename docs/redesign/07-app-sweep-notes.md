# 07 · Full-App Sweep Notes (July 2026)

> Raw audit notes from a complete visual + code sweep of every screen, taken before writing the
> per-screen redesign plans in [08-screen-redesign-plans.md](./08-screen-redesign-plans.md).
> Visual ground truth: full-page screenshots of all 9 routes (dark), plus dashboard/tokens in light
> and mobile, captured against live data (18 tokens). Code ground truth: per-screen audits against
> [DESIGN-RULES.md](./DESIGN-RULES.md).

**State of the union.** Three screens speak the Data Observatory language (landing `/`, dashboard,
token detail). Six screens are still the shadcn MVP (login, tokens list, form, token house, export,
profile) plus the shell and error boundaries. The product currently reads as two different apps
welded together, and the seam shows exactly at the screens contributors use most (form, list).

---

## Screen-by-screen quick notes

### `/` Landing — GOOD, reference quality
- The hero thesis works: live graph, 300-counter, role-select doors, taxonomy chips.
- Keep as-is. Only note: counter shows `300 / 300` (goal met display bug when count>=goal?) worth a check later.

### `/login` — MVP, brand-dead
- A lone card floating in a pure-black void; zero brand, zero graph, no gradient CTA (flat indigo).
- Signup exists but hides behind a footer link; password rules surface only on submit; raw Supabase
  errors shown; no forgot-password; no wallet-deferral story (docs 04/05 spec a full panel).
- The first authenticated impression contradicts the landing's promise.

### `/dashboard` — redesigned, minor debts
- Three-band layout works with real data. Get-started checklist, NBA rail, graph card all present.
- Debts: `Connect wallet` floats alone in a void (no real top bar); sidebar active item is a heavy
  full-width indigo pill; graph card interior is busy (search + 5 filter chips + legend + count pill
  + 2 icon buttons); completed checklist items use strikethrough (reads as deleted, not done).

### `/tokens` list — MVP, flagship gap
- Vertical pile of tall rows, not a data table: ~120px per row, 18 rows = 2 screens of scroll for
  what a table shows in one. Row body not clickable; only small Edit/View buttons navigate.
- No multi-select, no Compare (core product promise absent). Sort hidden on mobile. Client-side
  everything (fetch-all). Error state masquerades as empty state, no retry.
- Style: hardcoded rgba shadows, raw violet/emerald/amber/sky literals, `bg-muted` wireframe
  surfaces, em-dashes in copy, cluster pills color-only (no glyphs), stat numbers missing `.tabular`.

### `/tokens/new` form — MVP, biggest UX debt
- NOT actually a 6-step stepper: `token-form-stepper.tsx` is dead code. Reality = 3,612-line page,
  7 stacked section cards, sections below Identity render as locked walls ("Save Identity first to
  unlock…") — a new contributor's first screen is one live section + six padlocks.
- Frictions (from code audit): hard 100% allocation zod gate contradicting its own "you can continue"
  banner; per-section manual Save with no dirty guard (scroll away = silent loss); CoinGecko picker
  resolves a token but fills only id+image (name/ticker/supply still hand-typed); category forces
  sector despite "optional" labels; completion screen only fires on one specific save order.
- Style: hardcoded section colors, no `--data-*` accents on Emission/Sources/Risk, gray dots, no
  live graph anywhere (docs 04 specs graph-beside-inputs), em-dashes, no `.tabular`.

### `/tokens/[id]` detail — redesigned, small debts
- Reference quality: identity band, taxonomy-accented SectionCards, local LiveGraph + legend,
  on-chain status, PublishPanel, market data, Enrich progressive disclosure.
- Debts: publish stack is old-language shadcn cards (rule 4 assigns `.glass` to the publish panel);
  allocation segment colors hand-rolled instead of `getChartColor`; em-dashes in publish copy/toasts;
  publish invisible for drafts with no path shown; per-chunk wallet signatures with no abort;
  "Contribute it" CTAs land on the top of the whole form, not the section.

### `/token-house` — MVP, identity crisis
- It is the "data room" (charts explorer: allocation donut/bars, supply, unlock timeline) but named
  "Token House" with a generic Building2 icon; nothing graph-flavored about it.
- Hides every token lacking a visual asset (users can't browse all); right pane silently `null` on
  error; empty state = gray bar-chart icon in a dashed void; chips (Alloc/Supply/Unlock/Circ) are
  color-only noise; status colors hardcoded; em-dashes as empty values; detail fetch waterfall.

### `/export` — MVP, wall of prose
- "Connect wallet" appears 3× on one screen. Flat checkbox list, giant full-width disabled indigo
  button, two identical Download buttons, raw `JSON.stringify` preview, "About Intuition Triples"
  educational card headlining the rail (rule 7 violation). Numbers missing `.tabular`. Fetch-all.

### `/profile` — MVP, worst styling offender
- Emoji tier ladder (🌱🏅⭐🔥👑), hardcoded emerald/violet/sky/orange literals, rgba shadows.
- No profile editing at all (signup collects display name/role/org, then they're unreachable).
- Leaderboard entries are opaque `Contributor ···8ca18c`. Two more wallet-connect prompts.

### Shell / nav
- Flat 5-item list (Dashboard, Tokens, Token House, Export, Profile) — no Explore/Contribute zones
  (docs 04), no ⌘K, no `/graph`, no `/compare`. No `aria-current`. No real top bar: wallet button
  floats top-right. Wallet "wrong network" hardcodes red literals; TRUST amounts not tabular; sidebar
  smoke-blob animation ignores `prefers-reduced-motion`. User menu contains only "Log out".

### Error boundaries
- Two near-identical generic cards; raw `error.message` leaked to users; no brand, no graph motif.

---

## Cross-cutting debts (every MVP screen)
1. **Color chaos:** raw Tailwind literals + rgba shadows instead of `--data-*`/`--status-*`/surfaces.
2. **`.tabular` absent** app-wide outside the 3 redesigned screens (only sporadic `tabular-nums`).
3. **Color-only meaning:** cluster pills, chips, legends without glyphs/icons (AA fail).
4. **Em-dashes** in copy and as empty values (rule 7: render "Not set").
5. **shadcn default surfaces** (`bg-card`/`bg-muted` + borders) instead of `bg-surface-1/2/3` lift.
6. **States:** loading = text or bare spinners (not GraphLoader); empty = gray icons (not EmptyState
   graph-seeded); error = toast-only or raw message (no retry affordance).
7. **A11y:** no `aria-current`, no `aria-live` on publish progress, motion not gated in sidebar.
8. **Composite reuse:** StatTile/EmptyState/DataBadge/NodeGlyph exist but MVP screens don't use them.

## What already works (don't touch)
- The token layer in `globals.css`, `tokens.ts` bridge, LiveGraph, NodeGlyph, GraphLoader,
  StatTile/EmptyState/SectionCard/DataBadge, the landing hero, dashboard bands, detail structure.
- Light theme + mobile hold up on redesigned screens (verified by screenshot).

## Sweep artifacts
- Screenshots: session scratchpad `screens/` (01-landing … 13-tokens-mobile). Ephemeral; re-run the
  sweep script if needed. Test account created via the public signup flow:
  `claude.design.review+<ts>@gmail.com` (delete freely).
