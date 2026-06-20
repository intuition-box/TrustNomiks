# Appendix — Research & Audit Dossiers

## Codebase Audits



### A1. Visual & Shell Audit

I have everything needed. Producing the audit.

---

# TrustNomiks — Visual & Shell Audit (Current State)

Scope: app shell (layout, sidebar, mobile nav, user menu, wallet button), the design-token layer (`globals.css`, `tailwind.config.ts`), the shadcn primitives actually installed, and the login page. This is the "before" snapshot for the redesign brief.

---

## (a) What the app looks like today

### Layout & structure
- **Fixed left sidebar + offset main**, classic admin chrome. `authenticated-shell.tsx:51-56` pins a `w-64` (collapsed `w-20`) `<aside>` with `border-r bg-card`; main content gets a matching `lg:ml-64`/`lg:ml-20` margin (`:76`). Below `lg`, a `h-14` fixed top bar (`:57`) holds the burger + logo + wallet, and a `Sheet` drawer replaces the sidebar (`mobile-nav.tsx:51-58`).
- **Sidebar internal rhythm**: logo block → `Separator` → nav list → `Separator` → theme toggle → `UserMenu` (`sidebar-nav.tsx:38-131`). Five flat nav items, no grouping, no section labels (`:21-27`).
- **Desktop top strip is nearly empty**: on `lg`, the only thing above content is a right-aligned `WalletConnectButton` in a `mb-6` flex row (`authenticated-shell.tsx:78-80`). No page title, no breadcrumb, no global search, no context. The header is dead space.
- **Root has no front door**: `app/page.tsx:1-4` is `redirect('/dashboard')`. There is no marketing/landing/onboarding surface at `/` — confirms the brief's "NO marketing/onboarding entry."
- **Login is a single centered shadcn card** on a flat `bg-background` (`login/page.tsx:148-150`), `max-w-md`, header + form + footer. Zero brand, zero graph imagery, zero product framing — it reads as a boilerplate auth screen.

### Color
- Stock shadcn slate skin driven by HSL CSS vars (`globals.css:3-65`). Surfaces are nearly colorless: background `0 0% 100%`, card `0 0% 98.5%` — card vs background differ by **1.5% lightness**, so cards are essentially invisible without their border/shadow (`:5,:8`).
- Brand color exists only as `--primary` indigo (`239 84% 67%`) and `--secondary` violet (`266 83% 61%`) (`:14,:17`), and in practice **primary appears in exactly two places**: filled buttons and the active nav pill (`sidebar-nav.tsx:95`). Violet `--secondary` is defined but barely surfaces in the shell at all.
- The rich **graph taxonomy palette** (amber/emerald/red/orange/blue/teal/sky/purple per `node-config.ts`) described in the brief is **completely absent from the shell tokens** — `globals.css` and `tailwind.config.ts` know nothing about it. The brand DNA lives in one isolated config file and never reaches the chrome.
- Wallet "wrong network" state hardcodes raw Tailwind reds (`wallet-connect-button.tsx:63`) instead of `--destructive`, and the login error uses `destructive/10` (`login/page.tsx:164`) — two different red systems.

### Type
- **No font is loaded.** `layout.tsx` imports no `next/font`; `body` is just `antialiased` (`layout.tsx:19`). The app renders in the OS/Tailwind default sans (system-ui stack). No brand typeface, no `--font-*` variables, no display/mono pairing for a data product that shows tickers, addresses, and big numbers.
- Type scale is the shadcn default and shallow: card titles `font-semibold leading-none tracking-tight` (`card.tsx:38`), body/nav at `text-sm`, login title bumped to `text-2xl` (`login/page.tsx:152`). Numerics (TRUST balances, supply figures) use proportional default digits — no `tabular-nums`, e.g. `wallet-connect-button.tsx:122-131`.

### Density
- Comfortable-to-loose padding: cards `p-6` everywhere (`card.tsx:26,60,70`), sidebar nav `p-4` with `space-y-1` (`sidebar-nav.tsx:81`), main `p-4 sm:p-6 lg:p-8` (`authenticated-shell.tsx:76`). Fine for the data-entry MVP; for the data-*exploration* direction this is generous and offers **no density toggle / no compact table mode**.
- Tables are bare shadcn: `h-10` headers in `text-muted-foreground`, `p-2` cells, `hover:bg-muted/50` rows (`table.tsx:76,91,61`). No zebra, no sticky header, no column dividers, no numeric right-alignment baked in — every consumer must re-style.

### Elevation
- Flat and uniform. Almost everything sits at one shadow level: cards `shadow` (`card.tsx:13`), buttons `shadow`/`shadow-sm` (`button.tsx:13,15,17,19`), inputs/selects `shadow-sm` (`input.tsx:11`, `select.tsx:22`). Popovers/sheets/toasts jump straight to `shadow-lg` (`select.tsx:78`, `sheet.tsx:34`, `sonner.tsx:18`). There's no deliberate elevation ladder (resting → raised → overlay); it's binary.
- Because card≈background in lightness, the whole UI relies on `1px` borders (`--border 240 6% 90%`) to define every region — a low-contrast, "wireframe" feel.

### Motion
- Two motion systems, both narrow:
  1. The **logo "smoke" blobs** — four absolutely-positioned blurred divs with bespoke keyframes `smoke-a/b/c` (`globals.css:97-111`, `sidebar-nav.tsx:43-62`), opacity 0.03–0.18. It's an ad-hoc, hand-tuned effect bolted onto the logo only.
  2. A `score-flash` keyframe (`globals.css:114-118`) for completeness points.
- Everything else is shadcn defaults: `transition-colors` on nav/buttons/rows, `transition-[width]`/`transition-[margin]` `duration-300` on the sidebar collapse (`authenticated-shell.tsx:52,76`), and Radix enter/exit `animate-in/out` on sheet/select. **No motion expresses the "living graph / indexer in motion" idea** anywhere in the shell — the one custom animation (smoke) is unrelated to the graph metaphor.

---

## (b) Friction & "generic shadcn" tells

- **It is the stock new-york slate skin, verbatim.** `card.tsx`, `button.tsx`, `badge.tsx`, `input.tsx`, `select.tsx`, `table.tsx`, `sheet.tsx`, `sonner.tsx` are unmodified shadcn output (default `cva` strings, default radii, default shadow tokens). `components.json` confirms `style: new-york`, `baseColor: slate` (`components.json:3,9`). Anyone who has seen a shadcn starter will recognize this instantly.
- **No font = no brand voice.** The single biggest "generic" tell after color: shipping on system-ui (`layout.tsx`). Distinctive products almost always set a typeface; this one doesn't.
- **Brand DNA is stranded.** The graph color taxonomy — the actual signature — never touches the shell. Indigo is the only brand cue, and it's used so sparingly the product reads as neutral-gray, not "indigo-hub-of-a-living-graph."
- **Empty/loading states are undifferentiated.** Only primitives present are `Skeleton` (`animate-pulse bg-muted`, `skeleton.tsx:6`) and `Progress`. No graph-flavored loaders, no node-pulse, no empty-state illustration system — exactly the surfaces the brief wants to own.
- **Header real estate wasted.** Desktop renders an empty bar with only a wallet button (`authenticated-shell.tsx:78-80`) — no title, search, or breadcrumb. For an "exploration" app this is a missed primary affordance.
- **Two parallel nav definitions** (`sidebar-nav.tsx:21-27` and `mobile-nav.tsx:22-28`) are copy-pasted and can drift; not visual per se, but a maintenance smell that will cause desktop/mobile divergence during the redesign.
- **Login screen has zero product story** — no value prop, no "300 tokens" goal, no graph visual, no contributor/explorer framing. First impression is "a form."
- **Wallet button is hand-rolled bare `<button>`s** with ad-hoc classes (`wallet-connect-button.tsx:47-67`) instead of the `Button`/`buttonVariants` system — inconsistent height/shadow/hover language vs the rest of the UI, and it bypasses the design system entirely.
- **The "smoke" animation is off-brand.** It's a generic vapor effect on the logo, not the graph/indexer motif the brand is built on — effort spent on motion that doesn't reinforce the story.

---

## (c) Accessibility & hierarchy gaps

- **Focus visibility is weak and inconsistent.** Global focus is `focus-visible:ring-1 ring-ring` (button `:8`, input `:11`, select `:22`) — a 1px ring is easy to miss. Meanwhile `UserMenu` uses `ring-2 ring-primary ring-offset-2` (`user-menu.tsx:49`) and the hand-rolled wallet button has **no visible focus style at all** (`wallet-connect-button.tsx:47-67`). No single, strong, consistent focus token.
- **Active-nav contrast/semantics**: active item is `bg-primary text-primary-foreground` (`sidebar-nav.tsx:95`) — fine for contrast, but there's no `aria-current="page"` on the active `Link`, so the active state is purely visual.
- **Theme-toggle button lacks an `aria-label`** (`sidebar-nav.tsx:110-118`) — its accessible name is empty when collapsed (icon-only, label hidden). The sidebar collapse button is labeled (`:74`) but the theme toggle isn't.
- **Card semantics**: `CardTitle`/`CardDescription` render as `<div>`s (`card.tsx:35-41,47-53`), so card headings carry no heading role — screen-reader users get no document outline from cards. Page-level heading hierarchy isn't enforced anywhere in the shell.
- **Color-only state encoding**: "wrong network" is conveyed by red color + text only (`wallet-connect-button.tsx:58-67`); status/severity (risk flags, draft/review/validated) will lean on `Badge` color variants (`badge.tsx`) with no icon/shape redundancy — a problem for color-blind users and a thing to fix systemically.
- **Low ambient contrast**: `text-muted-foreground` (`240 4% 46%`) on `card`/`background` is used for nav idle, table headers, descriptions, and wallet secondary text (`sidebar-nav.tsx:96`, `table.tsx:76`, `wallet-connect-button.tsx:121`). At `text-xs`/`text-sm` this hovers near the AA boundary and is the default "resting" text color almost everywhere — flattening hierarchy.
- **Sheet overlay** is `bg-black/80` (`sheet.tsx:24`) — heavy scrim, fine — but the **smoke blobs use opacity as low as 0.03** (`sidebar-nav.tsx:60`), invisible to many users and pointless for those with reduced-motion needs; there is **no `prefers-reduced-motion` handling** for smoke/score-flash anywhere (`globals.css:96-118`).
- **Hierarchy is flat by construction**: card≈background lightness (1.5% delta), one shadow level, one accent color, muted-gray everywhere → the eye gets no guided path. This is the core "info-dense without hierarchy" problem the brief calls out, and it's rooted in the token values, not the components.

---

## (d) What is worth KEEPING

- **The shadcn/Radix primitive foundation.** Accessible behavior (focus trap, keyboard nav, portals) in `select.tsx`, `sheet.tsx`, `dropdown-menu`, `alert-dialog` is solid — *re-skin the tokens, don't rebuild the primitives.* The CSS-variable architecture (`globals.css:67-88` `@theme inline` mapping + `tailwind.config.ts` `hsl(var(--…))` colors) is exactly the right place to inject a richer palette and an elevation/type scale.
- **The token-driven theming setup itself** (HSL vars, light+dark already defined, `darkMode: class`, `next-themes` wired in `layout.tsx:20`). Dark theme exists and is reasonable; the redesign can lean into dark as the "graph in the void" canvas without rebuilding plumbing.
- **The collapsible sidebar with persisted state** done correctly via `useSyncExternalStore` (no SSR flash, no setState-in-effect — `authenticated-shell.tsx:21-47`). Keep the mechanism; restyle the chrome.
- **Responsive shell split** (fixed sidebar on `lg`, top-bar + `Sheet` drawer below) is a sound, conventional pattern (`authenticated-shell.tsx:51-73`). Structure is fine; it's the surface treatment and the empty header that need work.
- **The latent graph taxonomy in `node-config.ts`** — this is the asset to amplify. It already encodes families (atom/triple/source/hub) and per-type colors; promote it into design tokens, badge variants, loaders, and imagery.
- **`Progress` + `score-flash`** as the seed of a "completeness" feedback language (`progress.tsx`, `globals.css:114-118`) — the gamified completeness idea is worth keeping and extending (just add reduced-motion support and tie it to the graph metaphor).
- **Sonner toasts already theme-aware** (`sonner.tsx:9-26`) and RainbowKit/wallet summary logic (balance + staked TRUST formatting, `wallet-connect-button.tsx:138-152`) — keep the logic, just route the trigger through the `Button` system.

---

### One-line takeaway for the brief
The shell is structurally sound but visually **the default shadcn slate starter with no typeface**: brand color appears in ~2 places, cards are near-invisible (1.5% lightness delta), elevation is binary, the only custom motion ("smoke") is off-brand, and the product's real signature — the color-coded knowledge-graph taxonomy in `node-config.ts` — never reaches the chrome. The redesign's leverage points are the token layer (`globals.css`/`tailwind.config.ts`), a real type system in `layout.tsx`, a proper elevation/focus ladder, and promoting the graph palette into badges, loaders, empty states, and a real `/` entry + login experience.

### A2. IA & Journeys Audit

I now have everything needed: the full route map, the 7-section form mechanics (per-section save, dependency locking, live scoring), the publish pipeline location (embedded in token detail), and the explorer surfaces (Token House, dashboard knowledge graph). I have enough to produce the audit. Here it is.

---

# TrustNomiks — Information Architecture & Journey Audit

*Data for redesign brief. Scope: authenticated app shell, dashboard, tokens list, token detail, 7-section "new token" form, Token House, export, profile, login, middleware.*

## A. Current IA / Nav Model & Routes

### Route inventory (10 user-facing routes)
| Route | Type | Purpose | Persona |
|---|---|---|---|
| `/` | redirect | `redirect('/dashboard')` — **no landing, no marketing, no public surface** | — |
| `/login` | public | Combined login/signup card. Only public page. | both (entry) |
| `/dashboard` | RSC→client | Stats cards, collapsible completeness, knowledge-graph card | both (collision) |
| `/tokens` | client | Token Registry: search/filter/sort/paginate table | both (collision) |
| `/tokens/new` | client | **3,606-line** single-page 7-section form (also `?id=` = edit) | CONTRIBUTOR |
| `/tokens/[id]` | client | Full read view + status mgmt + per-token export + **embedded publish panel** | both (collision) |
| `/token-house` | client | Visual explorer (charts) — gated to tokens with "visual assets" | EXPLORER |
| `/export` | client | Batch JSON-triples export + on-chain publish history | CONTRIBUTOR |
| `/profile` | client | Gamification (tiers, share %, leaderboard) + on-chain activity | CONTRIBUTOR |

API-only: `/api/coingecko/*`, `/api/intuition/*`, `/api/knowledge-graph`. **No `/published-claims` route exists** despite a `published-claims-view.tsx` component — the publish pipeline is buried inside `/tokens/[id]`.

### Nav model
- **Single flat sidebar** (`sidebar-nav.tsx`), 5 items: Dashboard / Tokens / Token House / Export / Profile. No grouping, no persona split, no hierarchy. "Add Token" is NOT in the nav — it lives only as in-page CTA buttons.
- Auth gating is **doubled**: `middleware.ts` redirects unauth→`/login` for every non-login route, AND `(authenticated)/layout.tsx` re-checks `getUser()` and redirects again. Redundant round-trip; the RSC layout check is the load-bearing one, middleware is belt-and-suspenders.
- **No breadcrumbs**, no "you are here" beyond the active sidebar item. Token detail/edit/workspace cross-link ad hoc.
- Logo carries the only brand gesture: a CSS "smoke blob" animation (`smoke-a/b/c`) behind the logo — decorative, unrelated to the graph DNA.

### Structural finding: "stepper" is a misnomer
`token-form-stepper.tsx` is 111 lines and largely vestigial. The real form is `/tokens/new/page.tsx` — a **single long scrolling page** with 7 vertically-stacked sections, an anchor-link section nav, and a sticky live-score sidebar. There is no wizard "Next/Back"; each section has its own **independent Save button** that writes to Supabase immediately. `currentStep` is only used as a sentinel (`COMPLETION_STEP = 99`) for the post-save success screen. This is important: the redesign should treat this as **a document with savepoints**, not a wizard.

---

## B. CONTRIBUTOR Journey (signup → enter → complete → publish)

### Flow as built
1. `/login` (signup tab) → on submit, auto-creates `profiles` row, `router.push('/dashboard')`.
2. `/dashboard` → empty (0 tokens) → click "Add Token" → `/tokens/new`.
3. `/tokens/new`: fill 7 sections, Save each. Section dependency chain: **Identity must be saved first** (creates the token row + unlocks every other section via `lockedSection`). **Vesting additionally requires Allocations saved** (vesting schedules are derived from allocation segments).
4. Save Risk Flags (final) → `COMPLETION_STEP` success screen → "View Token Details" / "Back to Tokens" / "Add Another".
5. Set status draft→in_review→validated on `/tokens/[id]` (a `Select`).
6. Publish to Intuition: appears **only** as `<PublishPanel>` at the very bottom of `/tokens/[id]`, and **only when status is `in_review` or `validated`**.
7. Export JSON: per-token on detail page, or batch on `/export` (validated-only).

### The 7 sections (real names, scoring weights from live panel)
1. **Identity** (violet, 20pts) — name, ticker, chain, contract, TGE date, category→sector (constrained), notes. CoinGecko search autofill. Creates the row.
2. **Supply** (sky, 15pts) — max/initial/TGE/circulating supply, circulating date, source URL.
3. **Allocation** (amber, 20pts) — dynamic table; **must sum to 100%**; live delta badge ("X% remaining"/"X% over"); ≥3 segments for full points; bidirectional %↔token-amount calc from max supply.
4. **Vesting** (emerald, 20pts) — per-segment cliff/duration/frequency/TGE%/cliff-unlock%; `immediate` auto-set for certain segment types. **Locked until Allocations saved.**
5. **Emission** (10pts) — type, inflation rate, burn/buyback toggles+details.
6. **Sources** (10pts) — provenance rows + a **claim-attribution matrix** mapping each source to specific claims (identity/supply/each allocation/each vesting/emission).
7. **Risk Flags** — type/severity/justification/active toggle. Final save → completion.

### Friction points (CONTRIBUTOR)
- **F1 — No onboarding/orientation.** Signup dumps straight onto an empty dashboard. No "what is TrustNomiks", no first-run tour, no explanation of Atoms/Triples/$TRUST/the 300-token goal, no "do this next." The product's entire thesis is invisible to a new contributor.
- **F2 — The form is a 3,600-line wall.** Seven sections, ~40+ fields, all on one page. High perceived length. No save-and-resume affordance is surfaced (it actually auto-persists per section, but the user isn't told — they may fear losing work).
- **F3 — Hidden dependency locking.** Vesting/Supply/etc. show a `Lock` + "Save Identity first…". A user who scrolls down before saving Identity hits dead sections with no inline path back up except the anchor nav. The dependency (Vesting needs Allocations) is only discoverable by hitting the lock.
- **F4 — Allocation 100% gate is the hardest wall.** Must sum exactly to 100% (`Math.abs(total-100)<0.01`). Real whitepapers rarely sum cleanly (rounding, "other", undisclosed). No "normalize" / "add remainder as Unallocated" helper. This is the single most likely abandonment point.
- **F5 — Status is manual and meaningless.** draft→in_review→validated is a self-service `Select` with no review workflow, no validator, no criteria. "Validated" is whatever the author clicks. Downgrade triggers a confirm dialog (good) but the ladder has no teeth.
- **F6 — Publish is buried and conditional.** The on-chain publish (the actual point of the product) is at the bottom of a long detail page, invisible until status≥in_review. A contributor who finishes the form lands on a success screen that offers "View Details"/"Add Another" but **never mentions publishing**. The path from "data entered" to "claims on-chain" is undiscoverable.
- **F7 — Edit reuses the create form via `?id=`.** Editing a token re-renders the entire 3,600-line page. No deep-link to a single section; you scroll. The list's "Edit" and "View" both exist per row (redundant entry points to two different long pages).
- **F8 — Completion screen is a dead-end-ish funnel.** Three equal-weight buttons, no recommended next action, no "publish now," no "your score went up / here's what's missing."
- **F9 — Concurrency UX leaks.** Optimistic-locking errors ("modified by someone else, refresh") surface as toasts mid-form — jarring for what is effectively a solo data-entry tool.
- **F10 — Sources/attribution complexity is unguided.** The claim-attribution matrix (source→which claims) is powerful but presented as a dense grid with no example of why provenance matters for staking/$TRUST.

---

## C. EXPLORER Journey (browse / compare / graph)

### Flow as built
- Entry is the same sidebar; there is **no explorer landing**. An explorer sees Dashboard first (contributor-flavored: "Manage and track tokenomics data," "Add Token" CTA, completeness-by-cluster).
- **Token House** (`/token-house`) is the real explorer surface: left rail (search + category + chain filters) → select token → workspace renders KPI strip, allocation breakdown (bar+donut+legend), supply composition, unlock timeline. Cached per token.
- **Dashboard knowledge-graph card** + `graph-canvas.tsx` (react-force-graph-2d) render the node taxonomy — but it's a single card, not a destination.
- Token detail `/tokens/[id]` doubles as a read view with charts (allocation stacked bar, market price card).

### Where it's thin / missing
- **E1 — No comparison.** The brand promise is "compare tokenomics." Token House is strictly **one-token-at-a-time** (single `selectedId`). No multi-select, no side-by-side, no portfolio/aggregate view. Roadmap Phase 2 ("filtering & comparison," "portfolio-level views") is unbuilt.
- **E2 — Token House is gated and silently shrinks the universe.** It only shows tokens with `hasAnyVisualAsset(...)`. An explorer arriving with a sparse DB sees a near-empty list with no explanation of why most tokens are hidden.
- **E3 — The graph is decorative, not navigable.** `node-config.ts` defines a rich color-coded taxonomy (token=violet, allocation=amber, vesting=emerald, source=blue, hub=indigo…). But the graph is a dashboard card, not a first-class explore-by-graph experience. You can't click a node to drive navigation through the app. The product's stated signature ("an indexer rendered as a living graph") is latent, not realized.
- **E4 — No discovery scaffolding.** No "trending," "recently added," "most-staked," "highest-completeness," "tokens like this," curated collections, or search across the actual claim graph. Browsing = a sortable table (`/tokens`) + a one-at-a-time visual workspace.
- **E5 — Published/on-chain claims are not explorable.** `published-claims-view.tsx` exists but is reachable only from within a single token's detail/publish flow. There is no global "explore the verified knowledge graph" — which is the whole value proposition for an explorer/curator.
- **E6 — No read-only / public mode.** Everything is behind auth (middleware blocks all but `/login`). An explorer can't be enticed in; there's no shareable token page, no SEO surface, no "look what's inside" before signup.
- **E7 — No $TRUST / staking / curation surface for explorers.** Staking is mentioned in copy and exists in `/api/intuition/trustnomiks-stake`, but there's no explorer-facing "back this claim / challenge this claim" interaction.

---

## D. Onboarding Gaps

- **O1 — Zero front door.** `/` redirects to `/dashboard`. No marketing page, no value prop, no "300 tokens" mission, no graph hero, no demo. First contact for everyone is a bare login card titled "Log In."
- **O2 — No progressive onboarding spine.** The brief calls for "two personas welded by a progressive onboarding spine" — none exists. No persona selection (contribute vs explore), no role-aware first screen, no empty-state coaching beyond a generic "No tokens yet → Add your first token."
- **O3 — No concept education.** Atoms, Triples, claims, provenance, $TRUST staking, the Intuition graph — none are explained anywhere a new user will see. The login page doesn't even say what the product does.
- **O4 — No first-task guidance.** A new contributor isn't walked to their first token; a new explorer isn't shown a compelling token. Both land on the same ambiguous dashboard.
- **O5 — Empty states are functional, not directional.** `/tokens` empty state and Token House "Select a token" are fine micro-copy but don't teach the model or sell the next step.

---

## E. Dead-ends, Redundancy, Missing Progressive Disclosure

**Dead-ends**
- Completion screen (F8): no "publish" path, three flat options.
- Publish panel (F6): only reachable by manually setting status then scrolling to the bottom of detail.
- Token House missing-asset CTA → "Complete token data" → dumps into the full 3,600-line edit form (no deep-link to the missing section).
- Locked form sections (F3) with no inline "go fix Identity" action.
- `published-claims-view.tsx` / graph nodes: no clickable navigation out of them.

**Redundancy**
- **Stats quartet (Total/Validated/In Review/Drafts) is duplicated** between `/dashboard` and `/tokens` with near-identical markup.
- **Two auth checks** (middleware + layout) for the same redirect.
- **Two entry points per token row** (Edit→`/tokens/new?id=`, View→`/tokens/[id]`), and detail also has an Edit button → three paths to two long pages.
- **Export exists in two places** (per-token on detail, batch on `/export`) with separate code paths.
- **Completeness/cluster scoring is re-rendered in 4 places** (dashboard, tokens list, token detail, form sidebar) with copy-pasted color maps — design-system debt.
- Knowledge graph appears as a dashboard card AND underlies Token House, but neither is "the graph."

**Missing progressive disclosure**
- The form shows all 7 sections + all ~40 fields at once instead of revealing depth as you go. Inverse of what's needed: the *journey* should be progressive (1 token → first publish → explore), while the *form* should collapse advanced sections (Emission/Sources/Risk) until the core (Identity/Supply/Allocation) is done.
- No "core vs. enrich" tiering. Sections 5–7 (Emission/Sources/Risk, the `○` icons in nav vs `◆` for 1–4) are already visually de-emphasized but still fully expanded and demand attention.
- Risk/Emission/advanced provenance should be opt-in disclosure, not always-open.

---

## F. Ranked Friction List (highest leverage first)

| # | Friction | Where | Severity | Fix direction |
|---|---|---|---|---|
| 1 | No landing/onboarding; `/`→`/dashboard`; login is the whole front door | `/`, `/login` | **Critical** | Public landing with graph hero + concept primer; persona-aware first-run (contribute vs explore) |
| 2 | Publish-to-Intuition (the product's point) is buried, conditional, never surfaced post-completion | `/tokens/[id]`, completion screen | **Critical** | Promote publish to a first-class step in the contributor spine; add "Publish now" to completion screen |
| 3 | 3,600-line single-page form; all sections/fields exposed at once | `/tokens/new` | **Critical** | Tier into Core (Identity/Supply/Allocation) vs Enrich (Vesting/Emission/Sources/Risk); progressive disclosure; surface auto-save |
| 4 | Allocation must sum to exactly 100% with no helper | Allocation section | **High** | "Add remainder as Unallocated" / normalize; tolerance + warning instead of hard block |
| 5 | No comparison / portfolio view — core explorer promise unbuilt | `/token-house` | **High** | Multi-select compare, side-by-side, aggregate metrics |
| 6 | Graph is decorative, not navigable; taxonomy unused as a wayfinding system | dashboard card, `graph-canvas` | **High** | Make the graph a primary explore surface; clickable nodes drive navigation; amplify into empty states/loaders |
| 7 | Hidden section dependencies & locks with no inline recovery | `/tokens/new` | **Medium** | Inline "Save Identity to continue" actions; auto-scroll/focus; clearer dependency cues |
| 8 | Status ladder (draft→validated) is self-service and meaningless | `/tokens/[id]` | **Medium** | Tie status to completeness/validation criteria or a real review step |
| 9 | Dashboard is contributor-flavored and persona-ambiguous; explorer has no home | `/dashboard` | **Medium** | Role-aware dashboard; separate explore home |
| 10 | Token House silently hides most tokens (visual-asset gate) | `/token-house` | **Medium** | Show all with "complete data to unlock viz" affordance; deep-link to the exact missing section |
| 11 | Everything behind auth — no public token pages, no enticement | middleware | **Medium** | Read-only public token/graph pages for SEO + explorer pull |
| 12 | Redundant stats/scoring/export/auth across pages; copy-pasted color maps | multiple | **Low (debt)** | Extract shared components into the design system (single source for cluster colors, stat cards, completeness, export) |
| 13 | Completion screen is a flat dead-end | completion step | **Low** | Recommend next best action (publish / fill weakest cluster / add another) |
| 14 | Concurrency error toasts leak mid-form | `/tokens/new` | **Low** | Soften/contextualize for a mostly-solo tool |

---

### Key structural takeaways for the brief
1. **Three personas are colliding on Dashboard/Tokens/Token-detail.** The redesign needs an explicit fork: a contributor spine (orient → enter → complete → **publish**) and an explorer spine (land → browse/graph → compare → curate/stake), welded by onboarding.
2. **The "stepper" is actually a savepoint document.** Don't rebuild a wizard; restructure it as Core-first progressive disclosure with always-on auto-save made visible.
3. **The graph taxonomy in `node-config.ts` is the unused brand asset.** It should become the navigation and visual system, not a single dashboard card.
4. **Publishing is the missing climax of the contributor journey** and must be pulled out of the bottom of the detail page into the main flow.

Relevant files: `/Users/phyla/Documents/VsCode/TrustNomiks_app/trustnomiks-app/src/app/(authenticated)/tokens/new/page.tsx` (the 3,606-line form), `/Users/phyla/Documents/VsCode/TrustNomiks_app/trustnomiks-app/src/components/sidebar-nav.tsx` (flat nav), `/Users/phyla/Documents/VsCode/TrustNomiks_app/trustnomiks-app/src/app/page.tsx` (redirect-only root), `/Users/phyla/Documents/VsCode/TrustNomiks_app/trustnomiks-app/src/components/intuition/publish-panel.tsx` + `published-claims-view.tsx` (buried publish/explore surfaces), `/Users/phyla/Documents/VsCode/TrustNomiks_app/trustnomiks-app/src/components/token-house/token-workspace.tsx` (single-token explorer), `/Users/phyla/Documents/VsCode/TrustNomiks_app/trustnomiks-app/src/lib/knowledge-graph/node-config.ts` (latent brand taxonomy).

### A3. Tokens & Components Inventory

I have a complete picture. Producing the inventory.

---

# TrustNomiks — Design-System Inventory (redesign brief data)

## (a) CURRENT DESIGN-TOKEN SYSTEM (verbatim)

### Source of truth & wiring (a structural problem in itself)
Tokens live in **two places that partially disagree** — `src/app/globals.css` (Tailwind v4 `@import "tailwindcss"` + `@theme inline`) **and** a legacy **`tailwind.config.ts`** (Tailwind v3-style `theme.extend`). The CSS uses the v4 `@theme inline` block; the config file re-declares the same colors via `hsl(var(--…))` and is the **only** place `borderRadius` (`lg`/`md`/`sm`) is defined. This is a v3↔v4 hybrid (see gaps).

### Color tokens — `:root` (Light, DEFAULT)
All values are **space-separated HSL channels** (consumed as `hsl(var(--x))`):

| Token | Value | Note |
|---|---|---|
| `--background` | `0 0% 100%` | white |
| `--foreground` | `240 10% 3.9%` | near-black slate |
| `--card` | `0 0% 98.5%` | |
| `--card-foreground` | `240 10% 3.9%` | |
| `--popover` | `0 0% 100%` | |
| `--popover-foreground` | `240 10% 3.9%` | |
| `--primary` | `239 84% 67%` | Indigo #6366F1 |
| `--primary-foreground` | `0 0% 100%` | |
| `--secondary` | `266 83% 61%` | Violet #8B5CF6 |
| `--secondary-foreground` | `0 0% 100%` | |
| `--muted` | `240 5% 93%` | |
| `--muted-foreground` | `240 4% 46%` | |
| `--accent` | `240 5% 93%` | **same as `--muted`** |
| `--accent-foreground` | `240 10% 3.9%` | |
| `--destructive` | `0 84% 60%` | red |
| `--destructive-foreground` | `0 0% 98%` | |
| `--border` | `240 6% 90%` | |
| `--input` | `240 6% 90%` | **same as `--border`** |
| `--ring` | `239 84% 67%` | **= `--primary`** |

### Color tokens — `.dark`
| Token | Value |
|---|---|
| `--background` | `240 10% 3.9%` |
| `--foreground` | `0 0% 98%` |
| `--card` | `240 10% 5%` |
| `--card-foreground` | `0 0% 98%` |
| `--popover` | `240 10% 5%` |
| `--popover-foreground` | `0 0% 98%` |
| `--primary` | `239 84% 67%` (unchanged) |
| `--primary-foreground` | `0 0% 98%` |
| `--secondary` | `266 83% 61%` (unchanged) |
| `--secondary-foreground` | `0 0% 98%` |
| `--muted` | `240 10% 10%` |
| `--muted-foreground` | `240 5% 64.9%` |
| `--accent` | `240 10% 10%` |
| `--accent-foreground` | `0 0% 98%` |
| `--destructive` | `0 62.8% 30.6%` |
| `--destructive-foreground` | `0 0% 98%` |
| `--border` | `240 10% 15%` |
| `--input` | `240 10% 15%` |
| `--ring` | `239 84% 67%` |

### Radius — **single scalar**
- `--radius: 0.5rem;` (defined in `:root` only — **not redefined in `.dark`**, fine).
- Derived in `tailwind.config.ts`: `lg = var(--radius)`, `md = calc(var(--radius) - 2px)`, `sm = calc(var(--radius) - 4px)`. No `xl`/`2xl`/`full` token despite Card using `rounded-xl` (raw Tailwind default, not a token).

### Spacing — **none**
No spacing scale defined. Components hardcode Tailwind defaults (`p-6`, `space-y-1.5`, `px-4 py-2`, `gap-2`, `px-2.5 py-0.5`).

### Typography — **none as tokens**
- No font-family, font-size, line-height, letter-spacing, or weight tokens.
- Only global: `body { font-feature-settings: "rlig" 1, "calt" 1; }`.
- Sizes/weights are ad-hoc per component: `text-sm font-medium` (button), `text-xs font-semibold` (badge), `font-semibold leading-none tracking-tight` (CardTitle), `text-sm text-muted-foreground` (CardDescription).

### Shadows — **none as tokens**
Raw Tailwind `shadow` / `shadow-sm` only. Button default = `shadow`; outline/secondary/destructive = `shadow-sm`; Card = `shadow`; Badge default/destructive = `shadow`. No elevation scale, no colored/brand glow.

### Motion — partial, hand-rolled, orphaned
Defined in `globals.css` as `@keyframes` only — **no `animation`/`--ease`/`--duration` tokens, no `animate-*` utilities** generated, and grep finds **zero `animate-[…]` usages** in components (they are applied via inline `animation:` strings):
- `smoke-a`, `smoke-b`, `smoke-c` — logo backdrop "smoke" drift (opacity 0.05–0.18, small translate/scale).
- `score-flash` — completeness-points gain flash (translateY 0→-22px, scale 1.25→0.9, opacity 1→0).
No standard transition tokens; components use raw `transition-colors`.

### Chart / graph color systems — **3 parallel, uncoordinated palettes**
1. **`src/lib/utils/chart-colors.ts`** — `SEGMENT_TYPE_COLORS` (8 hex by allocation segment) + `FALLBACK_COLORS` (4 hex) + duplicate `SEGMENT_TYPE_TEXT_COLORS` (Tailwind `text-*-500` classes). Hardcoded hex, **decoupled from CSS vars**.
2. **`src/lib/knowledge-graph/node-config.ts`** — `NODE_CONFIG`: 16 node types → `{color, size, label}` (the brand DNA: graph_root indigo, token violet, allocation amber, vesting emerald, emission red, risk_flag orange, data_source blue, export_run teal, application teal-700, wallet/category slate, sector purple, chain sky, triple/predicate/literal slate-400).
3. **shadcn `--primary`/`--secondary`** — indigo/violet, the only ones in the token system.
These three **never reference each other**. The same indigo (#6366f1) is hardcoded in all three independently; violet appears as `--secondary` and as `token`/FALLBACK but is not shared.

---

## (b) COMPONENT INVENTORY

### PRIMITIVES — `src/components/ui/` (22 shadcn/Radix wrappers, new-york)
`accordion` · `alert-dialog` · `avatar` · `badge` · `button` · `calendar` · `card` · `checkbox` · `dropdown-menu` · `form` · `input` · `label` · `popover` · `progress` · `select` · `separator` · `sheet` · `skeleton` · `sonner` (toaster) · `switch` · `table` · `textarea`

Variant-bearing (CVA): **button** (variant: default/destructive/outline/ghost/secondary/link; size: default/sm/lg/icon) · **badge** (variant: default/secondary/destructive/outline). All others are unvaried structural wrappers.
Notably **absent** primitives: `tabs`, `tooltip`, `dialog` (only alert-dialog/sheet exist), `command` (palette), `scroll-area`, `slider`, `radio-group`, `toggle`, `breadcrumb`, `pagination`, `hover-card`, `collapsible`, `chart` (shadcn chart wrapper).

### COMPOSITES — cross-feature, reusable building blocks (`src/components/` root)
- `authenticated-shell.tsx` — app layout frame
- `sidebar-nav.tsx` — desktop nav (Dashboard/Tokens/Token House/Export/Profile + logo + smoke blob)
- `mobile-nav.tsx` — mobile nav
- `user-menu.tsx` — account dropdown
- `wallet-connect-button.tsx` — RainbowKit/wagmi connect
- `token-form-stepper.tsx` — multi-step form engine (drives the 6-step `/tokens/new`)
- `providers.tsx` — context providers (theme/query/wagmi)
- `coingecko-search.tsx` — token search input
- `token-price-card.tsx` — price display card

### FEATURE COMPONENTS — grouped by domain
**charts/** (recharts) — `allocation-breakdown-chart` · `allocation-donut-chart` · `supply-bar-chart` · `unlock-timeline-chart`
**knowledge-graph/** (react-force-graph-2d — the brand surface) — `dashboard-knowledge-graph-card` · `graph-canvas` · `graph-detail-panel` · `graph-legend` · `graph-toolbar`
**intuition/** (publish pipeline) — `account-activity-card` · `my-exports-block` · `publish-panel` · `publish-summary` · `published-claims-view` · `run-detail-dialog`
**token-house/** — `token-selector-card` · `token-workspace`

**Supporting non-component logic:** `src/hooks/` (`use-coingecko-search`, `use-knowledge-graph`) · `src/lib/` (`coingecko`, `intuition`, `knowledge-graph`, `supabase`, `utils`, `utils.ts`). `src/lib/utils.ts` = only the `cn()` helper (clsx + tailwind-merge).

**Inline-style hotspots:** 13 component files use `style={{…}}` (charts + graph + animated/dynamic-color surfaces) — i.e. dynamic color/motion already escapes the token system into JS.

---

## (c) NAMING INCONSISTENCIES & GAPS

**Token-system gaps**
1. **No semantic layer.** Tokens are role-primitive only (`primary`, `muted`…). Missing: `success`, `warning`, `info`, `danger` (only `destructive`), and no per-status colors for the app's own domain states (draft / in-review / validated; risk severity low/med/high). Components invent these inline with raw Tailwind `text-*-500`.
2. **Three disconnected color sources** (shadcn vars / `chart-colors.ts` hex / `node-config.ts` hex) with duplicated literals (#6366f1 in all three). No single brand palette; the **graph taxonomy — the actual brand DNA — is not in the token system at all**.
3. **No spacing scale** — every gap/padding is a raw Tailwind default.
4. **No type scale** — no font, size, weight, leading, or tracking tokens; typography is ad-hoc per component.
5. **No shadow/elevation scale** — `shadow`/`shadow-sm` only, no brand glow for the "graph in motion" aesthetic.
6. **Single radius scalar** (`--radius: 0.5rem`) with only lg/md/sm derivatives; Card uses raw `rounded-xl` outside the token system. No `xl`/`2xl`/`full` tokens.
7. **No motion tokens** — `@keyframes` exist but no `--duration-*`, `--ease-*`, no generated `animate-*` utilities; animations applied via inline JS strings and orphaned from Tailwind.
8. **Collisions/aliases that hide intent**: `--accent` ≡ `--muted`, `--input` ≡ `--border`, `--ring` ≡ `--primary`. Fine as defaults but means there is no distinct focus/input/accent identity to theme.

**Architecture / naming**
9. **v3↔v4 hybrid.** `@theme inline` (v4) **and** `tailwind.config.ts theme.extend` (v3) both define colors; radius lives **only** in the config. Two mental models, drift-prone. Tailwind v4 wants tokens in CSS (`@theme`), config minimal/removed.
10. **HSL channel format** (`239 84% 67%`) hardcodes the `hsl()` wrapper at the consumer; blocks easy move to OKLCH (preferred for perceptually-even brand ramps) and to alpha-aware color-mix.
11. **Color naming mismatch**: `chart-colors.ts` keys by **business segment** (`funding-private`…) while `node-config.ts` keys by **graph node type** (`token`, `allocation`…) — overlapping concepts, no shared vocabulary, so "allocation" is amber in the graph but each *segment* has its own unrelated hue in charts.
12. **Dark mode under-designed**: brand `--primary`/`--secondary` are identical in light/dark (no luminance adjustment for contrast on dark bg); light is the declared default while the product DNA (glowing graph) is inherently a dark-surface aesthetic.

---

## (d) WHAT A TAILWIND v4 + shadcn TOKEN ARCHITECTURE SHOULD EXPOSE

**0. One source of truth.** Move everything into `globals.css` `@theme` (v4); reduce/remove `tailwind.config.ts` to plugins only. Author brand colors in **OKLCH**, expose alpha via `color-mix`.

**1. Two-tier color: primitives → semantic.**
- *Primitive ramps* (50–950): `--brand-indigo-*`, `--brand-violet-*`, plus the full **graph taxonomy as first-class ramps** (`--graph-token`, `--graph-allocation`, `--graph-vesting`, `--graph-emission`, `--graph-risk`, `--graph-source`, `--graph-export`, `--graph-chain`, `--graph-sector`, `--graph-hub`, `--graph-triple`). This unifies the three palettes — charts, force-graph, and UI all consume the same vars.
- *Semantic aliases* mapping to primitives: `--background/foreground`, `--surface-{1,2,3}` (elevation), `--primary/secondary/accent`, `--success/warning/info/danger`, plus **domain-status tokens**: `--status-draft`, `--status-review`, `--status-validated`, `--risk-{low,med,high}`. shadcn vars become thin aliases over this layer.

**2. Spacing scale** — explicit `--space-*` (4-based: 0,1,2,3,4,6,8,12,16,24…) so density is tunable per persona (dense contributor tables vs. airy explorer pages).

**3. Type scale** — `--font-sans` / `--font-mono` (mono for addresses/hashes/triples), and a named size ramp `--text-{xs..display}` with paired `--leading-*` and `--tracking-*`; weights as tokens. Drives a real heading hierarchy (the brief's "info-dense without hierarchy" fix).

**4. Radius scale** — `--radius-{sm,md,lg,xl,2xl,full}` all derived from one base; replace raw `rounded-xl` in Card with a token.

**5. Elevation/shadow scale** — `--shadow-{xs,sm,md,lg,xl}` **plus brand glow tokens** (`--glow-primary`, `--glow-graph-node`) for the "living graph" surfaces (node hover, active claim, hub).

**6. Motion tokens** — `--duration-{fast,base,slow}`, `--ease-{standard,emphasized,spring}`, and **named keyframes promoted to `@theme` `--animate-*`** (`--animate-smoke`, `--animate-score-flash`, plus new `--animate-pulse-node`, `--animate-edge-flow`, `--animate-graph-settle`) so motion is utility-driven, not inline JS strings. Respect `prefers-reduced-motion`.

**7. Chart/graph contract** — a single typed `getGraphColor(nodeType)` / `getChartColor(segment)` that reads the CSS vars (via `getComputedStyle` or a generated TS map) so SVG/canvas and DOM never diverge again; deprecate the hardcoded hex in `chart-colors.ts` and `node-config.ts`.

**8. Dark-first theming** — treat the glowing-graph dark surface as the primary aesthetic; give `--primary`/`--secondary` distinct light/dark luminance, and define a `[data-density]` and `[data-persona]` hook so Contributor (dense, form-centric) and Explorer (spacious, graph-centric) share tokens but differ in spacing/elevation.

**9. Missing primitives to add** before composites are rebuilt: `tabs`, `tooltip`, `dialog`, `command` (palette / NL-query entry), `scroll-area`, `slider`, `breadcrumb`, `hover-card`, `chart` (shadcn wrapper) — so feature components stop hand-rolling with inline styles.

**Files referenced:** `/Users/phyla/Documents/VsCode/TrustNomiks_app/trustnomiks-app/src/app/globals.css` · `/Users/phyla/Documents/VsCode/TrustNomiks_app/trustnomiks-app/tailwind.config.ts` · `/Users/phyla/Documents/VsCode/TrustNomiks_app/trustnomiks-app/src/lib/utils.ts` · `/Users/phyla/Documents/VsCode/TrustNomiks_app/trustnomiks-app/src/lib/utils/chart-colors.ts` · `/Users/phyla/Documents/VsCode/TrustNomiks_app/trustnomiks-app/src/lib/knowledge-graph/node-config.ts` · `/Users/phyla/Documents/VsCode/TrustNomiks_app/trustnomiks-app/src/components/ui/` (22 primitives) · `/Users/phyla/Documents/VsCode/TrustNomiks_app/trustnomiks-app/src/components/` (composites + charts/ knowledge-graph/ intuition/ token-house/ feature groups).

### A4. Graph Narrative Audit

I have everything I need. Here is the redesign-brief data.

---

# TrustNomiks — Knowledge-Graph & Chart Rendering Audit (data-viz layer)

## (a) Current graph node/edge taxonomy & color system (verbatim)

### Node families (4) — `graph-types.ts`
```
atom    — domain entities (tokens, allocations, vestings…)
triple  — reified relationships (first-class triple nodes)
source  — provenance (data sources)
hub     — synthetic graph root (+ export_run, application)
```
`NodeFamily = 'atom' | 'triple' | 'source' | 'hub'`

### Node-type → family map (`NODE_FAMILY_MAP`)
| type | family | type | family |
|---|---|---|---|
| token | atom | application | hub |
| allocation | atom | wallet | atom |
| vesting | atom | category | atom |
| emission | atom | sector | atom |
| risk_flag | atom | chain | atom |
| data_source | **source** | predicate | atom |
| export_run | **hub** | literal | atom |
| | | triple | triple |
| | | graph_root | hub |

### Visual config (`node-config.ts`) — color, size, label (verbatim)
| type | color | hex meaning | size | label |
|---|---|---|---|---|
| `graph_root` | `#6366f1` | indigo (hub, largest) | **18** | TrustNomiks |
| `token` | `#8b5cf6` | violet | 12 | Token |
| `allocation` | `#f59e0b` | amber | 7 | Allocation |
| `vesting` | `#10b981` | emerald | 5 | Vesting |
| `emission` | `#ef4444` | red | 7 | Emission |
| `risk_flag` | `#f97316` | orange | 6 | Risk Flag |
| `data_source` | `#3b82f6` | blue | 6 | Source |
| `export_run` | `#14b8a6` | teal | 10 | Export Run |
| `application` | `#0f766e` | teal-700 | 9 | Application |
| `wallet` | `#475569` | slate | 6 | Wallet |
| `category` | `#64748b` | slate | 8 | Category |
| `sector` | `#a855f7` | purple | 6 | Sector |
| `chain` | `#0ea5e9` | sky | 6 | Chain |
| `triple` | `#94a3b8` | slate-400 (small) | **3** | Triple |
| `predicate` | `#94a3b8` | slate-400 | 4 | Predicate |
| `literal` | `#94a3b8` | slate-400 | 4 | Literal |

Size encodes hierarchy: hub (18) > token (12) > export_run (10) > application (9) / category (8) > allocation/emission (7) > risk/source/wallet/sector/chain (6) > vesting (5) > predicate/literal (4) > triple (3).

### Edge taxonomy — semantic predicates (`build-graph.ts`)
| predicate | label | meaning | direction |
|---|---|---|---|
| `belongs_to_graph` | "belongs to" | token atom → graph root (hub spokes) | token → hub |
| `subject_of` | "subject" | triple → its subject atom | triple → atom |
| `object_of` | "object" | triple → its object atom (structural triples only) | triple → atom |
| `justified_by` | `attests {claim_type}` | source atom → triple (provenance) | source → triple |

Edges are **reified**: a triple is itself a node (diamond glyph), wired to subject + object atoms and to its justifying source. Structural triples (`object_id != null`) always render; literal triples (`object_literal != null`) only when `includeLiterals` (default false), surfaced in the detail panel as "Canonical Facts." Orphan taxonomy atoms (category/sector/chain, no token_id) are pruned if unreferenced by any edge.

### Build options (default state of the graph)
`includeSources=true`, `includeTaxonomy=true`, `includeLiterals=false`. **But the dashboard card overrides to `includeSources:false, includeTaxonomy:false`** — so the live hero graph shows only hub + tokens + their allocation/vesting/emission/risk atoms + structural triples. Sources, taxonomy, and literals are hidden there.

---

## (b) How the graph is presented today + UX limits

### Presentation (canvas — `graph-canvas.tsx`)
- **Engine:** `react-force-graph-2d` (dynamic import, SSR off), custom canvas `nodeCanvasObject`. d3 forces from `d3-force-3d`: charge, link distance, collision, plus a custom `forceRadial` "tokenOrbit."
- **Layout = a literal hub-and-spoke orrery.** `graph_root` is pinned at (0,0) (`fx/fy=0`). Tokens orbit at a dynamic radius `max(300, 200 + tokenCount*50)`; charge, link distance, collision and orbit radius all scale with `tokenCount` so the system breathes as data grows.
- **Glyphs:** atoms = filled circles; triples = filled **diamonds** (moveTo/lineTo); hub gets a translucent indigo halo `rgba(99,102,241,0.15)`. Selection = node fills **white** with a 2.5px colored stroke ring.
- **Links:** faint slate `rgba(148,163,184,0.15)`, width 0.4, tiny directional arrows (length 2.5). Essentially whisper-thin — the structure reads as a dot cloud more than a wired graph.
- **Labels are scale-gated:** hub + pinned always; token labels at `globalScale > 0.8`; other non-triple labels only at `> 1.5`; triples never labeled. Label color: indigo for hub/pinned, slate-400 otherwise.
- **Motion:** warmup 0, cooldown 300 ticks, `d3AlphaDecay 0.02`, `velocityDecay 0.3` → a visible settle-then-freeze. Auto `zoomToFit(400,50)` after `1200 + tokenCount*20`ms. A "Center graph" recovery button fades in on engine stop.
- **Controls:** `graph-toolbar` (search by label/id, filter pills for token/allocation/vesting/emission/triple only, node·edge count badge, refresh, reset/fit). `graph-legend` (collapsible, only 6 of 16 types shown: graph_root/token/allocation/vesting/emission/triple). `graph-detail-panel` = right Sheet with type+family badges, parent chain, triple S-P-O breakdown, Canonical Facts, provenance, connected-nodes list, and a link to `/tokens/[id]`.
- **Dashboard card wrapper:** indigo-tinted card (`border-indigo-500/30`, `shadow-[0_0_20px_rgba(99,102,241,0.12)]`, header gradient `from-indigo-100/indigo-500/5`), `GitBranch` icon. Height fills the viewport below the header.

### UX limits
1. **Reads as scatter, not as a graph.** Links at 0.4px / 0.15 alpha + tiny arrows mean the *relationships* — the whole point of an Intuition graph — are nearly invisible. The atom/triple/source story doesn't visually land.
2. **Legend ≠ palette.** Only 6 of 16 node types appear in the legend; toolbar filters expose the same 6. Source (blue), risk_flag (orange), wallet, category, sector, chain, application, export_run colors exist in the system but are never explained to the user → unexplained color noise when those views are on.
3. **Settle-then-freeze, then stop.** After cooldown the graph is static; the only "life" is the manual recenter button. No ambient motion, no perpetual drift — the "living indexer" idea is asserted in the card chrome (glow, GitBranch) but not in the canvas.
4. **Dashboard hides the richest layer.** `includeSources:false, includeTaxonomy:false` strips provenance and taxonomy from the hero view — exactly the differentiators (sourced, machine-readable claims) are absent from the first thing users see.
5. **Selection palette collision.** Selected node fills **white**; against the light default theme (white-ish background) a selected node nearly disappears, identifiable only by its thin colored ring. Triples (already 3px diamonds) become almost invisible when selected.
6. **Label legibility cliff.** Most labels appear only above `globalScale 1.5`; at the default fit zoom of a multi-token graph, the canvas is a field of unlabeled colored dots. Identity is gated behind zooming.
7. **No empty / loading signature.** Empty state = a 30%-opacity `GitBranch` + sentence. Loading = a generic `Loader2` spinner. Neither uses the graph motif — a missed branding moment on the most-seen states.
8. **Triple glyph is under-scaled.** Triples (the literal "claim" — TrustNomiks' core unit) are the smallest, faintest, never-labeled, slate-grey element. The hero concept is the visually weakest node.

---

## (c) Chart inventory & styling

All in `src/components/charts/`. Two are recharts, two are pure CSS/flex bars. Categorical color comes from **`getSegmentChartColor`** (`lib/utils/chart-colors.ts`) keyed by `segment_type` for cross-token consistency — **a separate palette from the graph node palette.**

### Segment palette (`SEGMENT_TYPE_COLORS`) — cross-token stable
| segment_type | color | | segment_type | color |
|---|---|---|---|---|
| funding-private | `#3b82f6` blue | | marketing | `#22c55e` green |
| funding-public | `#a855f7` purple | | airdrop | `#14b8a6` teal |
| team-founders | `#ec4899` pink | | rewards | `#6366f1` indigo |
| treasury | `#f97316` orange | | liquidity | `#06b6d4` cyan |

Fallback rotation: `#ef4444 #eab308 #84cc16 #8b5cf6`. Sibling `SEGMENT_TYPE_TEXT_COLORS` mirrors these as Tailwind classes for non-SVG legends.

### Charts
1. **`allocation-donut-chart.tsx`** — recharts `PieChart`/donut. Two sizes (sm 160px / lg 280px), inner/outer radius pairs. 2px stroke in `--background` between slices. Centered `Max Supply` label (compact-formatted). Custom popover-styled tooltip on `lg` only (slice name, formatted type, %, token amount). Colors via `getSegmentChartColor(segment_type, index)`.
2. **`allocation-breakdown-chart.tsx`** — recharts horizontal `BarChart` (vertical layout), sorted desc by %. Custom Y tick (label truncated at 15 chars), custom X tick (`{value}%`), no axis/tick lines, dynamic Y-axis width. Rounded right corners `radius=[0,4,4,0]`, `barSize=20`, per-cell segment colors. Same custom tooltip.
3. **`supply-bar-chart.tsx`** — **not recharts**; pure Tailwind flex bar. Single rounded-full track, emerald (`bg-emerald-500`) circulating vs amber (`bg-amber-500`) locked, inline % labels when segment ≥12%. Fallback single sky bar when no circulating data. `transition-all duration-300`.
4. **`unlock-timeline-chart.tsx`** — recharts stacked `AreaChart`, `type="stepAfter"` (staircase unlocks), `stackId="1"`, `fillOpacity 0.6`, 1.5px strokes per segment. Dashed `ReferenceLine` at max supply ("Max: …"). Rich tooltip: per-segment breakdown + total + % of max. Outline badges list manual/un-plotted segments.

### Cross-cutting chart styling
- Tooltips are hand-built divs themed on `--popover`/`--popover-foreground`/`--border` with `shadow-lg`, focus outlines killed (`[&_svg:focus]:outline-none`).
- Numbers via `formatCompactNumber`; types via `formatSegmentTypeLabel`.
- Axis text on `--muted-foreground`/`--foreground`, no axis lines, ~11–12px.
- **Two disconnected color worlds:** the *graph* uses node-type colors (token=violet, allocation=amber…), the *charts* use segment-type colors (treasury=orange, team=pink…). `allocation` is amber in the graph but a specific allocation's color in a chart depends on its `segment_type`. A user can't carry one mental color-map across the two surfaces.

### Intuition publish surfaces (skim)
- **`publish-panel.tsx`** — phase Badges (atoms→triples→provenance) that turn green when passed, a `bg-primary` progress bar (`width: totalProgress%`), live counters, spinner-driven chunk status, color-coded alert callouts (yellow=connect/wrong-chain, blue=in-review, red=error, green=complete, orange=aborted). Mirrors the graph's atom/triple/source families but expresses them as **text badges**, not graph glyphs — a missed chance to animate the same diamonds/circles lighting up as they publish.
- **`published-claims-view.tsx`** — plain Card: status Badge (default/secondary/destructive), atoms/triples totals, last-publish date, truncated wallet, external link to `testnet.hub.intuition.systems`. No visual tie to the graph at all.

---

## (d) Opportunities — turn atom/triple/source/hub into the product's visual signature

Grouped by surface, each scoped to **not** hurt data legibility.

### Ambient / hero motion
- **Perpetual gentle drift on the dashboard hero.** Replace the settle-then-freeze with a near-zero residual jitter (very low alphaTarget reheat or a slow sinusoidal nudge on non-pinned nodes) so the indexer always looks *alive* without ever moving enough to harm reading. Pause on hover/drag.
- **Pulsing hub.** The indigo hub halo (`rgba(99,102,241,0.15)`) is static; animate a slow expanding-ring pulse from `graph_root` (a "heartbeat" of the index). One ring, ~3s, low alpha — ambient, not distracting.
- **Edge-flow animation for provenance.** Animate dashes traveling **source → triple → atom** along `justified_by`/`subject_of` edges to dramatize "claims being attested." Gate to selected/hovered subgraph so the full canvas stays calm.
- **Promote the triple glyph.** The core unit (the claim) is currently the weakest dot. Give selected/hovered triples a subtle glow or a connecting-line emphasis; on publish, have the diamond "ignite." Keep base size small for density but make it the star on interaction.

### Loaders (reuse the motif instead of a generic spinner)
- **Graph-assembly loader:** nodes fly in from edges and snap onto hub spokes, or a skeleton orrery where ghost atoms fade in around a pulsing hub. Replaces both `Loader2` in the dashboard card and the "Loading knowledge graph…" line.
- **Publish loader = the graph lighting up.** In `publish-panel`, instead of (or beside) the text phase-badges, render a mini live graph where atoms → triples → provenance glyphs turn from grey to their family color as each chunk confirms. The data exists (counters + chunkMappings, confirmed/failed/skipped statuses; canvas already supports a `nodeColor` status override).

### Empty states (brand the zero-data moment)
- **Dashboard empty:** replace the 30%-opacity `GitBranch` with a single faint hub + a few orbiting ghost atoms and a "seed the graph" CTA wired to `/tokens/new` — the contributor onboarding hook.
- **Per-token "not yet published":** `published-claims-view` returns `null` when never published. Instead show a ghost subgraph of *what would be published* (the dry-run plan already computes atoms/triples/provenance counts) — turning an empty card into a publish prompt.

### Onboarding / marketing imagery
- **Landing hero = the living graph.** Today `/` just `redirect('/dashboard')`. A landing should lead with an animated, read-only orrery (looped, low-density, beautiful) as the brand statement: "an indexer rendered as a living graph."
- **Two-persona split via the graph:** Contributor view zooms *into* one token's atom/triple/source cluster (data entry); Explorer view pulls *out* to the constellation of all tokens around the hub (comparison/discovery). The same orrery, two zoom levels — a natural progressive-onboarding spine.
- **Iconography from glyphs.** Derive product icons/illustrations from the actual node language: circle=atom, diamond=triple, blue circle=source, indigo hub=TrustNomiks. Consistency between docs, empty states, and the live canvas reinforces the taxonomy.

### Legibility & system-coherence fixes (do these regardless)
- **Strengthen edges in the hero, not the dense view.** Bump `linkWidth`/alpha for the focused/selected subgraph so relationships read; keep the global field faint to avoid clutter. The graph must *look like a graph*, not a scatter.
- **Fix the white-selection collision.** Selected fill = white is invisible on the light default theme. Switch to a high-contrast ring + slight size bump + halo in the node's own family color, keeping the node legible on both themes.
- **Reconcile the two palettes (or make the seam intentional).** Node-type colors and segment-type colors overlap confusingly (indigo = hub *and* rewards; teal = export_run *and* airdrop; amber = allocation node *and* treasury segment). Either unify into one documented token set or visually separate "graph space" vs "chart space" so users don't try to map across. This belongs in the design-system nomenclature.
- **Complete the legend / lift label floor.** Either show all rendered node types in the legend (auto-derive from what's on canvas) or restrict rendered types to the legended set. Lower the label-visibility scale threshold (or add always-on labels for hub + tokens) so the default-fit view isn't an anonymous dot field.
- **Surface provenance in the hero.** The dashboard strips `includeSources`/`includeTaxonomy`. Add a lightweight toggle (or a "show sources" reveal animation) so the differentiator — sourced, verifiable claims — is visible on the primary surface without permanently crowding it.

### Key files for the redesign
- Taxonomy/palette source of truth: `/Users/phyla/Documents/VsCode/TrustNomiks_app/trustnomiks-app/src/lib/knowledge-graph/node-config.ts` + `graph-types.ts`
- Graph construction & edge semantics: `/Users/phyla/Documents/VsCode/TrustNomiks_app/trustnomiks-app/src/lib/knowledge-graph/build-graph.ts`
- Canvas (motion, glyphs, labels, the `nodeColor` status hook): `/Users/phyla/Documents/VsCode/TrustNomiks_app/trustnomiks-app/src/components/knowledge-graph/graph-canvas.tsx`
- Hero card / loading / empty / data-scope overrides: `/Users/phyla/Documents/VsCode/TrustNomiks_app/trustnomiks-app/src/components/knowledge-graph/dashboard-knowledge-graph-card.tsx`
- Legend & toolbar (incomplete type coverage): `graph-legend.tsx`, `graph-toolbar.tsx`
- Detail panel (S-P-O, provenance, facts): `graph-detail-panel.tsx`
- Chart palette (the second color world): `/Users/phyla/Documents/VsCode/TrustNomiks_app/trustnomiks-app/src/lib/utils/chart-colors.ts`
- Charts: `allocation-donut-chart.tsx`, `allocation-breakdown-chart.tsx`, `supply-bar-chart.tsx`, `unlock-timeline-chart.tsx`
- Publish surfaces to graphify: `intuition/publish-panel.tsx`, `intuition/published-claims-view.tsx`

---

## Research Dossiers



### R1. Component Libraries

I have everything I need. The stack is confirmed: Next.js 16, React 19.2.3, Tailwind v4, recharts v3.8, react-force-graph-2d, Radix primitives, all current. Here is the research brief.

---

# TrustNomiks Redesign Brief — Component Library & Primitives Ecosystem Survey (2025–2026)

Stack of record (verified from `package.json`): Next.js 16.1.6 App Router + RSC, React 19.2.3, TypeScript strict, Tailwind v4, shadcn/ui (new-york/slate) on Radix primitives, recharts ^3.8, react-force-graph-2d ^1.29, TanStack Query, react-hook-form + Zod, lucide-react, sonner, next-themes. The recommendation **keeps recharts + react-force-graph** and only adds what's missing.

---

## 0. The one structural decision that frames everything: primitive layer

In **December 2025 Base UI shipped v1.0**, and shadcn/ui added the ability to choose Radix-backed or **Base UI-backed** components at init. This is now the single most consequential ecosystem shift.

| Primitive layer | Best at | Composes with shadcn/TW4 | Use / avoid for TrustNomiks |
|---|---|---|---|
| **Radix UI** | The incumbent. 30+ battle-tested accessible primitives. Already your entire `ui/` folder. | Native — shadcn was born on it. | **KEEP.** You have 15 Radix packages installed and a working `ui/`. Update velocity slowed post-WorkOS acquisition, but it's stable and you have zero migration cost. Avoid a rip-and-replace migration to Base UI — not worth it for a working MVP. |
| **Base UI** (MUI team) | Actively-developed primitives; ships **Combobox, multi-select, Autocomplete** that Radix lacks — exactly the gaps you'll hit building Explorer search/filter. Single consolidated package, render-prop pattern. | First-class in shadcn since the Base UI v1.0 release. | **Adopt surgically, not wholesale.** When you need a combobox/multiselect/autocomplete (token search, multi-token comparison filters, tag pickers), pull that *one* Base UI component rather than hand-rolling on Radix Popover+Command. Do not migrate existing Radix components. |
| **Ark UI / Park UI** | Cross-framework (React/Vue/Solid) via XState state machines. Park UI adds a Panda CSS theme editor. | Not Tailwind-native (Panda CSS); cross-framework is the selling point. | **Avoid.** You're React-only on Tailwind. No payoff; adds a styling system you don't use. |
| **React Aria (Adobe)** | Most accessibility-rigorous; hooks-first, 40+ patterns, best-in-class i18n. | Hooks, not components — more authoring code; not a shadcn drop-in. | **Avoid as a base**, but worth stealing its date/number/list patterns if a specific a11y-critical widget misbehaves. Overkill as the foundation. |
| **Radix Themes / Headless UI** | Radix Themes = pre-styled opinionated kit (fights shadcn). Headless UI = Tailwind team's ~10 components, ships with Tailwind styles. | Both conflict with the copy-paste/own-the-code shadcn model. | **Avoid.** Redundant with what you have. |

**Verdict on the base layer:** Stay on Radix for everything that exists; cherry-pick **Base UI Combobox/Multiselect/Autocomplete** for the new Explorer search-and-compare surfaces. This is the smallest correct diff.

---

## 1. shadcn ecosystem & registries

The registry/MCP system (a component is `npx shadcn@latest add <url>`) means these are not "frameworks to adopt" — they're **à la carte sources you copy from**. Mix freely.

| Registry | Best at | Signature patterns worth stealing | Use / avoid |
|---|---|---|---|
| **shadcn blocks / Tailwind UI / Shadcnblocks** | Full pre-composed sections (dashboard shells, auth, marketing, pricing). All migrated to **Tailwind v4** in 2025. | Dashboard shell layouts; the marketing/landing blocks you're missing (your `/` just redirects — no marketing entry). | **Use** for scaffolding the new landing/onboarding spine and dashboard chrome. High leverage, low risk. |
| **Origin UI** | The **breadth** play — 400+ free copy-paste components, 25+ categories, 1–59 variants each. Updated to **Tailwind v4 (Feb 2025)**, follows shadcn conventions. | Dense input variants, badges, status pills, table cells, timeline/stepper variants — perfect for a data-entry/monitoring app. | **Use as your default "I need a variant" library.** Closest match to a dense data app; no animation baggage. First place to look before hand-rolling. |
| **Kibo UI** | Composable **advanced** components on top of shadcn: enhanced **data tables, Kanban, Gantt, multi-step forms, command palette, AI-chat primitives**, dropzone. | Gantt (→ vesting/unlock timelines), Kanban (→ token review pipeline draft→review→validated), enhanced data table, multi-step form (→ your 6-step form). | **Use selectively.** Gantt + Kanban + dropzone map directly onto your roadmap. Don't import the whole registry — take the 3–4 that fit. |
| **Magic UI** | The **delight middle-ground** — polished, premium micro-interactions, not theatrical. Installs via shadcn CLI; configurable via props + CSS variables. | **Number Ticker** (animate dashboard KPIs / "tokens structured" counter toward 300), **Animated Beam** (connect nodes — literally your graph DNA: source→atom→triple flows), **Bento Grid** (dashboard/landing layout), **Blur Fade** (staggered reveals), **Shimmer/Border Beam** (highlight active/validated states). | **Use — this is your highest-ROI delight source.** Animated Beam + Number Ticker + Bento Grid are tailor-made for "indexer rendered as a living graph." |
| **Aceternity UI** | **Theatrical** hero effects, Framer-Motion-heavy. Spotlight, Background Beams, 3D Card, the screenshot-on-Twitter stuff. | Spotlight + Background Beams for the **landing/onboarding hero** only; Wobble/3D card for a marquee "featured token." | **Use sparingly, landing-only.** Avoid inside the app shell — too heavy/distracting for a dense monitoring surface and adds Framer Motion weight where it isn't earning its keep. |
| **react-bits** | 110+ animated text/UI/background bits. **CSS-first, no required Framer Motion dep** (Three/GSAP/Matter only as optional peers) → lightest-weight delight. Available in Tailwind variant; installs via shadcn CLI. | BlurText / ShinyText / GradientText for headings; Aurora / StarField backgrounds for dark-mode hero. | **Use for cheap text/background flourish** where you want motion without pulling Framer Motion. Good complement to Magic UI. |

**Registry strategy:** Origin UI = breadth of dense components · Kibo UI = advanced data structures · Magic UI = on-brand graph/motion delight · shadcn blocks = page scaffolds · Aceternity/react-bits = landing hero only.

---

## 2. Motion / animation library

| Option | Best at | Composes | Use / avoid |
|---|---|---|---|
| **Motion** (formerly Framer Motion) | Declarative, React-native layout/exit animations, gestures, `AnimatePresence`. Pairs with shadcn/Radix transitions cleanly. | Native React; what Magic UI/Aceternity already depend on. | **Adopt as the primary in-app motion lib** (package is now `motion`). Layout transitions, route/step transitions, list stagger, presence on toasts/dialogs. Right tool for "UI-heavy app." |
| **GSAP** | Timeline-driven, frame-precise, scroll choreography. **Doesn't trigger React's reconciler** (single rAF loop, batched DOM read/writes) → wins for complex/perf-critical sequences. | Imperative; lives outside React render. | **Add only for the signature graph/indexer set-piece** — the "living graph in motion" hero animation, scroll-told story, or an elaborate empty-state/loader where you want cinema-grade control. Don't use it for ordinary UI transitions. |
| **React Spring** | Physics-based, small API. | React-native. | **Skip.** Motion covers your needs; no reason to add a third paradigm. |

**Verdict:** **Motion for the app, GSAP reserved for the one or two graph hero set-pieces.** Most of your "indexer as living graph" feel comes free from react-force-graph's own physics + Magic UI's Animated Beam.

---

## 3. Charts

You already run **recharts ^3.8** — and shadcn's official Chart component is a thin, theme-aware wrapper over Recharts (`var(--chart-1..5)`, RSC-friendly until interactivity is needed). Keep it.

| Library | Best at | Verdict |
|---|---|---|
| **Recharts v3** (have it) | The default; 2.4M weekly dl. SVG, React-first, polished for small/medium datasets. shadcn charts are built on it; fully Tailwind-v4/CSS-var themeable. *Note: React 19 needs a `react-is` override.* | **KEEP as primary.** Your allocation donut, allocation breakdown, supply bar, unlock timeline already live here and theme cleanly to your node palette. |
| **Tremor** (now Vercel-owned) | Pre-styled SaaS dashboard charts + KPI cards that match shadcn aesthetics out of the box; templates ship on **Tailwind v4**; copy-paste model. | **Steal patterns, don't dual-adopt.** Running two SVG chart libs is bloat. Lift Tremor's **KPI card / spark-stat / category-bar** *compositions* and rebuild on Recharts, rather than installing Tremor alongside. |
| **visx** (Airbnb) | Low-level D3+React primitives, ~15KB, fully bespoke. | **Reserve for one bespoke viz** that Recharts can't express — e.g. a custom emission-curve / supply-over-time chart or a radial tokenomics fingerprint. Not for everyday charts. |
| **Nivo** | Beautiful out-of-box, 30+ types, SVG/Canvas/HTML, SSR. | **Avoid.** Overlaps Recharts; adds weight; its look fights your CSS-var theming. |
| **ECharts / Chart.js (Canvas)** | 100k+ point datasets. | **Avoid for now** — you're not at that data density. |

**Verdict:** **Recharts stays the one chart lib.** Borrow Tremor's KPI/card patterns; keep **visx in your back pocket** for a single signature bespoke viz.

---

## 4. Data grid

| Option | Best at | Verdict |
|---|---|---|
| **TanStack Table v8** | Headless table engine *below* the visual layer — sorting, filtering, faceting, grouping, column-pinning, server-side pagination. Powers the canonical shadcn data table. | **Adopt.** Your dashboard token table (sortable/searchable/filterable + completeness score) is exactly this. Use stable row IDs; drive sort/filter/page server-side against Supabase. |
| **TanStack Virtual** | Row/column virtualization (Table ships none built-in). | **Add when the table grows** toward 300 tokens × many columns, or for the unlock-timeline/long lists. Pair with TanStack Table; don't make the table engine own scrolling. |
| Origin UI / Kibo UI table cells | Pre-built cell/toolbar/faceted-filter variants on top of TanStack. | **Use** for the toolbar, faceted filters, row-actions, and status-pill cells so you don't rebuild table chrome. |

---

## 5. Command menu

| Option | Best at | Verdict |
|---|---|---|
| **cmdk** (Paco Coursey) | The Linear/Raycast/Vercel command palette. shadcn `Command`/`CommandDialog` is built on it; grouped items, nested, custom renderers, ARIA built-in. | **Adopt — high impact for the Explorer persona.** A ⌘K palette to jump tokens, run comparisons, switch routes, trigger export is the single biggest "makes users go deeper" lever. Show the ⌘K hint in the nav; trap focus; group commands; announce result counts. |
| **kbar** | Action-registry palette + Fuse.js fuzzy search + built-in virtualization. | **Consider only if** you outgrow cmdk's manual wiring and want a registered-action model with fuzzy search across hundreds of commands. Start with cmdk (you likely already have it via shadcn). |

---

## 6. Knowledge graph renderer (your brand DNA — handle with care)

You run **react-force-graph-2d** and the brief says keep it. Context for scaling:

| Option | Best at | Verdict |
|---|---|---|
| **react-force-graph-2d** (have it) | Canvas force-directed graph, easy React API, custom node/link rendering — already wired to your color-coded node taxonomy (`node-config.ts`: graph_root indigo, token violet, allocation amber, vesting emerald, etc.). | **KEEP.** It is the visual signature. Invest in custom node/link canvas painters keyed to your families (atom/triple/source/hub) and motion. |
| **Sigma.js / @react-sigma** | WebGL; 100k+ edges; struggles past ~5k nodes-with-icons and on layouts beyond ~50k edges. | **Fallback only** if you ever render the *entire* 300-token graph at once and Canvas stutters. Not needed for per-token / neighborhood views. |
| **Cosmograph** | WebGL, hundreds of thousands of nodes, GPU layout. | **Future** — only if you build a single "whole knowledge graph" galaxy view. Overkill today. |

**Verdict:** Keep react-force-graph-2d as the hero; note Sigma/Cosmograph as the WebGL escape hatch if/when you visualize the full graph at once.

---

## RECOMMENDED STACK FOR TRUSTNOMIKS

**Keep (already correct):** Radix primitives · recharts v3 · react-force-graph-2d · TanStack Query · react-hook-form + Zod · lucide-react · sonner · next-themes.

**Add — core (low risk, high leverage):**
- **`motion`** — primary in-app animation (layout, route/step transitions, presence, list stagger).
- **TanStack Table v8 (+ TanStack Virtual when needed)** — the dashboard token grid, faceted filters, server-side sort/filter/page on Supabase.
- **cmdk-backed shadcn `Command` palette (⌘K)** — global navigate/compare/export/jump; the top "go-deeper" lever for Explorer.
- **Base UI Combobox / Multiselect / Autocomplete** — pulled à la carte for token search and multi-token comparison filters (the gap Radix doesn't cover).

**Add — copy-paste registries (own the code):**
- **Origin UI** → default source for dense component variants (inputs, status pills, badges, table cells, steppers).
- **Kibo UI** → Gantt (vesting/unlock timelines), Kanban (draft→review→validated pipeline), enhanced data table, dropzone (source-doc upload), multi-step form (refactor the 3600-line 6-step form).
- **Magic UI** → **Number Ticker** (KPIs / "X of 300 structured" counter), **Animated Beam** (source→atom→triple flows = literal graph DNA), **Bento Grid** (dashboard + landing), Border Beam/Blur Fade (highlight validated/active states).
- **shadcn blocks / Shadcnblocks** → scaffold the missing landing + onboarding spine and dashboard shell.

**Add — landing/hero only (quarantine from the app shell):**
- **Aceternity UI** (Spotlight, Background Beams) + **react-bits** (BlurText/Aurora, CSS-first, no Framer dep) for the marketing/onboarding entry that today is just `redirect('/dashboard')`.

**Reserve (don't install yet):**
- **GSAP** — for the one signature "living graph / indexer" hero set-piece needing frame-precise, reconciler-free choreography.
- **visx** — for a single bespoke viz (emission curve / tokenomics radial fingerprint) Recharts can't express.
- **Sigma.js / Cosmograph** — WebGL escape hatch if you ever render the full 300-token graph at once.

**Explicitly avoid:** Tremor as a second chart lib (steal its KPI/card *patterns* onto Recharts instead) · Nivo/ECharts/Chart.js · Ark/Park UI · Radix Themes · Headless UI · migrating existing Radix components to Base UI.

**Through-line — the graph as brand signature:** drive every added piece from `node-config.ts`. Map the node palette to `--chart-1..5` and badge/status colors; use Magic UI Animated Beam + Motion for source→atom→triple flows; reserve GSAP for the indexer hero; render empty states and loaders as a graph coalescing rather than spinners. The motion vocabulary should make the product *feel* like a living indexer, not a stock shadcn skin.

---

Relevant project file grounding this brief: `/Users/phyla/Documents/VsCode/TrustNomiks_app/trustnomiks-app/src/lib/knowledge-graph/node-config.ts` (node taxonomy/palette to drive the design system) and `/Users/phyla/Documents/VsCode/TrustNomiks_app/trustnomiks-app/package.json` (confirmed installed stack).

Sources:
- [GreatFrontend — Top Headless UI Libraries 2026](https://www.greatfrontend.com/blog/top-headless-ui-libraries-for-react-in-2026)
- [Makers' Den — React UI libs 2025 (shadcn/Radix/Base UI)](https://makersden.io/blog/react-ui-libs-2025-comparing-shadcn-radix-mantine-mui-chakra)
- [DevKit — Best Shadcn UI Libraries 2025](https://www.devkit.best/blog/mdx/shadcn-ui-libraries-comparison-2025)
- [Awesome shadcn/ui — Component Registries](https://www.shadcn.io/awesome/registries)
- [Tremor (Vercel) — tremor.so](https://www.tremor.so/) · [Tremor GitHub](https://github.com/tremorlabs/tremor)
- [PkgPulse — Recharts v3 vs Tremor vs Nivo 2026](https://www.pkgpulse.com/guides/recharts-v3-vs-tremor-vs-nivo-react-charting-2026)
- [LogRocket — Best React chart libraries 2026](https://blog.logrocket.com/best-react-chart-libraries-2026/)
- [PkgPulse — Aceternity vs Magic UI vs shadcn 2026](https://www.pkgpulse.com/guides/aceternity-ui-vs-magic-ui-vs-shadcn-animated-react-2026)
- [Aceternity UI](https://ui.aceternity.com/) · [React Bits](https://reactbits.dev/) · [Magic UI components](https://lobehub.com/skills/petbrains-mvp-builder-frontend-magic-ui)
- [Origin UI GitHub (Tailwind v4)](https://github.com/shadcn/originui) · [Kibo UI docs](https://www.kibo-ui.com/docs)
- [Satish Kumar — GSAP vs Motion 2026](https://satishkumar.xyz/blogs/gsap-vs-motion-guide-2026) · [Good Fella Lab — GSAP vs Framer vs React Spring](https://lab.good-fella.com/blog/gsap-vs-framer-motion-vs-react-spring)
- [TanStack Table](https://tanstack.com/table/latest) · [TanStack Table virtualization guide](https://tanstack.com/table/v8/docs/guide/virtualization)
- [shadcn/ui — Tailwind v4](https://ui.shadcn.com/docs/tailwind-v4) · [shadcn/ui — React 19](https://ui.shadcn.com/docs/react-19) · [shadcn/ui — Theming](https://ui.shadcn.com/docs/theming)
- [UX Patterns — Command Palette](https://uxpatterns.dev/patterns/advanced/command-palette) · [cmdk setup guide](https://www.lmctogetherwebuild.com/cmdk-in-react-build-a-fast-command-palette-setup-examples/)
- [Cambridge Intelligence — React graph visualization](https://cambridge-intelligence.com/blog/react-graph-visualization-library/) · [react-force-graph GitHub](https://github.com/vasturiano/react-force-graph) · [Sigma.js](https://www.sigmajs.org/)

### R2. Web3/DeFi App Patterns

I have enough to synthesize a strong, well-cited brief. I've covered the key references (Intuition, Aave Glass, Uniswap, Bubblemaps, Arkham, Nansen, Dune/Etherscan terminal aesthetic, DefiLlama, Zapper/Zerion/DeBank, plus sector trend reports). Returning the markdown brief now.

---

# Web3 / DeFi / On-Chain-Data Design Language — Sector "Trame" for the TrustNomiks Redesign

Research brief. Per-app teardowns → recurring patterns → differentiators → positioning recommendation for TrustNomiks as the "Tokenomics Intelligence Graph."

> Note on method: several target apps (Bubblemaps, Arkham, Nansen, Intuition Portal) are JS-heavy SPAs whose visual detail isn't recoverable via text fetch. Where the live render couldn't be parsed, findings below combine search-surfaced descriptions, design case studies, official docs, and brand-color sources. Items inferred (not directly confirmed from a primary visual) are flagged `[inferred]`.

---

## 1. Per-app teardown

### Intuition Protocol (intuition.systems / Portal) — the closest cousin
- **Conceptual model = the brand.** Atoms (identities/nodes), Triples (subject–predicate–object claims/edges), Lists & Tags (themselves Atoms/Triples). **Signal** (staking) is rendered as *weight*: "each node and edge is an Atom… weight is represented by users' Signal… expressing who is presently attesting to what." This is the single most reusable idea for TrustNomiks: **stake = visual weight**.
- **Motif:** the eye (👁️) — vision / truth / "who attests to what." Positions itself as "the internet's trust layer."
- **Graph rendering:** explicitly "a network with nodes and edges," each node/edge an Atom — a literal knowledge-graph view as the hero object.
- **Theme/palette:** dark + light supported; an abstract knowledge-graph hero image. Concrete hex/type specs are not published `[inferred: web3-native dark-leaning, graph-as-hero]`.
- **Takeaway for TrustNomiks:** you already mirror their primitives. Your differentiation is *domain depth* (tokenomics) over their *general* trust graph — and a richer, color-coded node taxonomy than their generic nodes.

### Uniswap — the friendly-DeFi benchmark
- **Color:** primary pink **#FF007A**; dynamic gradient **#FF007A → #FDEE21** (and pink→purple variants) "to convey creativity and trust."
- **Type:** custom "Uniswap Interface" typeface with **rounded terminals**; otherwise Inter / Space Grotesk family — "rounded edges soften the technical nature of DeFi, making it approachable."
- **Philosophy:** vibrant gradient + geometric shapes + "dynamic flow" mirror "openness, liquidity, constant motion." Minimal, single-task surfaces.
- **Takeaway:** proof that one saturated brand color + a signature gradient + rounded, humanist type can de-intimidate DeFi without going neon-generic.

### Aave — "Glass" framework (the freshest sector signal, 2025–26)
- **Aave Glass** = Apple "Liquid Glass"–inspired framework adding **refraction, depth, motion** so components "feel like physical objects."
- **Technique:** a single SVG `feDisplacementMap` filter bends pixels of *live* HTML — interactive text/links stay functional under the glass; works cross-browser incl. Safari, no flags. (Open ref impl exists: `Z1Code/glass-refraction` — specular highlights + chromatic edge dispersion.)
- **Components:** sliders (handle refracts the track, value stays readable), toggle/segmented selectors (glass indicator slides between options), QR, video controls.
- **Takeaway:** glass/refraction is *the* 2025–26 DeFi flex, but Aave's lesson is **tactile glass on functional controls**, not decorative blur. Selective, not wall-to-wall.

### Bubblemaps — the network-viz reference
- Wallets = **bubbles**, size ∝ holdings; **connection lines** = transfers; **clusters** = coordinated/insider fingerprints. Click-drag pan, scroll zoom, hover for address/balance/% supply; updates live.
- **Takeaway:** the gold standard for "make a scary table into an explorable picture." Encodes meaning in **size (magnitude)** and **proximity/clustering (relationship)** — directly applicable to allocations, vesting cohorts, holder concentration. `[inferred: dark canvas, saturated category-colored bubbles with glow]`.

### Arkham Intelligence — the investigative graph
- **Visualizer** turns transactions into an interactive entity graph: nodes = entities (movable, expandable into constituent addresses), edges = flows. **Edge color = semantics:** **white** = internal/between-selected, **green** = inflows, **red** = outflows; hover shows value. Timeline + token filters tame density.
- **Takeaway:** **directional, semantically-colored edges** + **expand-on-demand nodes** + **filters as the density valve**. A clean recipe for legible dense graphs. Dark, investigative, "data terminal" mood `[inferred]`.

### Nansen — institutional on-chain intelligence
- Repositioned 2025 as **"agentic" AI** ("an entire research team in your pocket"): conversational explore + execute, Token Screener / Smart Money / Agent in one view, synced across web+mobile.
- **Takeaway:** institutional credibility via **density + an AI/agent layer** that *interprets* the data. A "smart money" trust signal. Dark, premium terminal aesthetic `[inferred]`.

### Dune Analytics & Etherscan — the data-terminal pole
- The sector's "Bloomberg Terminal" lineage: **dense tables, monospace numerics, scan-thousands-of-rows layouts**, dark-first, restrained accents (Dune leans purple/wizard; Etherscan a utilitarian light-or-dark with blue links).
- **Takeaway:** for *numbers you must trust and compare*, monospace tabular figures + tight rows + minimal chrome read as "real data," not marketing. TrustNomiks needs this register for tokenomics tables even while the graph carries the brand.

### DefiLlama — credibility-through-restraint
- "Accurate data without ads or sponsored content… transparency." Minimal, data-dense, near-no-decoration; horizontal-line tables, lots of whitespace, blue accent.
- **Takeaway:** *trust = restraint*. Neutrality and no fluff are themselves a brand. Good counterweight to over-designing.

### Zapper / Zerion / DeBank — portfolio-tracker UX patterns
- **Zerion** = "cleanest," easiest all-round; **Zapper** = broad chain coverage, "quick insights" cards; **DeBank** = EVM protocol-exposure/debt dashboards.
- **Takeaway:** the consumer end of the spectrum — **card-based aggregation, fast glanceable insight, friendly clarity**. This is the register for the EXPLORER persona's dashboard.

---

## 2. Recurring patterns (the sector "trame")

1. **Dark-first is the default register.** "Conveys sophistication and innovation… enhances data-viz clarity, reduces eye strain." (TrustNomiks currently defaults to light — a notable deviation from the sector.)
2. **One saturated brand hue + a signature gradient** (Uniswap pink→yellow; Aave's glassy violets) over a neutral dark canvas.
3. **Network/graph visualization as the hero object** — Intuition, Arkham, Bubblemaps all make the graph the centerpiece, not a side widget.
4. **Semantic encoding over decoration:** size = magnitude, color = category/direction, proximity = relationship, **weight = stake/signal** (Intuition).
5. **Density valves:** filters, timelines, expand-on-demand nodes, progressive disclosure — *show less, reveal on intent* (35% / 28% support-ticket reductions cited for progressive disclosure).
6. **Monospace tabular numerics** for the data-terminal register (Dune, Etherscan, "Bloomberg lineage").
7. **State-first UX (2026 consensus):** explicit wallet / network / transaction / risk / ownership states — "timelines often better than single spinners"; pending→submitted→confirmed→failed.
8. **Trust/verification cues as first-class UI:** audit/proof layers, custody/validator info, smart-money badges, source provenance, "who attests" (Intuition).
9. **Glass/refraction & spatial/tactile UI** is the current aesthetic frontier (Aave Glass; WebGL/WebGPU "spatial UI," cards that tilt/catch light) — but applied to *controls*, not as blanket blur.
10. **Friendly, humanist type + rounded geometry** to de-intimidate (Uniswap, Inter/Space Grotesk family).
11. **Micro-interactions** on wallet connect / tx confirm as feedback and "aliveness."

## 3. Differentiators (where leaders break from the pack)
- **Aave:** real-DOM refractive **Glass** — tactile physicality no one else ships at this fidelity.
- **Uniswap:** a *named, owned* gradient + custom rounded typeface = instant recognizability.
- **Intuition:** the **eye** + **stake-as-weight** semantic graph — trust made visible.
- **Bubblemaps:** clusters-reveal-collusion — *the visualization is the insight*.
- **Arkham:** directional green/red/white flow edges + expandable entities — investigative legibility.
- **DefiLlama:** anti-design as a trust signal (no ads, no fluff).
- **Nansen:** an **AI/agent interpretation layer** on top of the density.

## 4. Where TrustNomiks should sit — recommendation

**Positioning: "the living tokenomics graph."** Occupy the white space *between* the **data-terminal pole** (Dune/Etherscan/DefiLlama — trustworthy numbers) and the **graph-explorer pole** (Intuition/Bubblemaps/Arkham — explorable relationships). Be the explorer that earns terminal-grade trust.

**Concrete moves:**

1. **Flip to dark-first** (keep light as a toggle). Aligns with the sector's default register and makes your node-color taxonomy *glow*. This is the highest-leverage single change vs. today's light-default stock-shadcn skin.

2. **Make the node taxonomy the brand system, everywhere.** Your existing `node-config.ts` palette (indigo hub, violet token, amber allocation, emerald vesting, red emission, orange risk, blue source, teal export…) is a **ready-made semantic color language** richer than Intuition's generic nodes. Promote it from the graph into: chart series, badges, category chips, section accents, empty-state art, loaders, and the 6-step form's step colors. Same color = same concept across the whole app.

3. **Adopt the sector's semantic-encoding grammar in your charts/graph:**
   - **size = magnitude** (allocation %, supply) — Bubblemaps.
   - **proximity/cluster = relationship** (allocation cohorts, holder groups).
   - **edge color/direction** for emissions/unlocks/flows — Arkham's green/red/white.
   - **weight/glow = $TRUST signal/stake** — Intuition's stake-as-weight (your unique trust mechanic; make staking literally brighten/thicken a node or claim).

4. **Two registers, one spine:**
   - **EXPLORER** → card-based, glanceable, friendly (Zapper/Zerion clarity) with the graph as hero and motion.
   - **CONTRIBUTOR** → data-terminal discipline for the tokenomics tables: monospace tabular figures, tight rows, completeness meters; progressive disclosure across the 6 steps (don't show all 6 at once — reveal on intent).

5. **A signature, owned gradient** built from your DNA — **indigo #6366F1 → violet #8B5CF6** (graph-root → token) — as the TrustNomiks equivalent of Uniswap's pink→yellow. Use sparingly: hero, primary CTA, the "living graph" hero animation, loaders.

6. **Glass/refraction — selectively, on controls** (Aave's lesson): step selectors, the stake slider, the publish panel, modal overlays. Tactile depth on *interactive* elements, never wall-to-wall blur. Avoid the "generic neon/3D crypto look" that "looks familiar but says little."

7. **The indexer as a living graph in motion** (the brief's north star): an animated force-graph hero on the landing/onboarding (currently a bare `redirect('/dashboard')` — a missed first impression), graph-motif **empty states** ("no atoms yet → seed the graph"), and graph-particle **loaders**. Nodes drift, edges pulse with new signal — *an indexer you can feel breathing.*

8. **Trust cues as first-class UI** (your reason to exist): per-claim **provenance** (whitepaper / DAO proposal / on-chain — your `data_source` blue), **verification/attestation badges**, **signal/stake weight** visible on every claim, and the **300-token completeness** goal as an ambient progress system. Borrow Intuition's "who is attesting to what" and Nansen's smart-money credibility, expressed through *your* taxonomy.

9. **State-first feedback** for the Intuition publish pipeline: explicit atom/triple lifecycle (drafting → publishing → on-chain → attested), tx timelines over spinners, clear failure/retry — matching the 2026 "state over decoration" consensus and reinforcing trust.

**One-line north star:** *TrustNomiks = the warmth and clarity of Uniswap/Zerion, the explorable graph of Intuition/Bubblemaps/Arkham, and the trustworthy density of Dune/DefiLlama — fused by one color-coded, stake-weighted node taxonomy, rendered dark-first as a living indexer in motion.*

---

### Sources
- Intuition: [Delphi report](https://members.delphidigital.io/reports/intuition-protocol-building-the-internets-trust-layer), [Beta blog](https://www.intuition.systems/blog/the-intuition-beta-is-live), [Beta Medium post](https://medium.com/0xintuition/%EF%B8%8Fthe-intuition-beta-is-live-%EF%B8%8F-36e6ab97dfa6), [Portal case study](https://www.joshbl.com/work/intuition-portal), [Primitives docs](https://tech.docs.intuition.systems/primitives/)
- Aave Glass: [Dexalot](https://dexalot.com/en/blog/aave-glass-decentralized-finance-ux), [Intellectia](https://intellectia.ai/news/crypto/aave-launches-glass-design-framework-to-enhance-user-experience), [Fenado engineering writeup](https://fenado.ai/articles/aave-engineer-achieves-cross-browser-glass-on-the-web-with-real-refractions-and-dom-integration), [Coinsaga](https://coinsaga.com/news/altcoin-news/aave-glass-brings-apple-inspired-liquid-glass-design-to-web3-interfaces/), [glass-refraction repo](https://github.com/Z1Code/glass-refraction)
- Uniswap brand/design: [logotyp.us](https://logotyp.us/logo/uniswap/), [BrandPalettes](https://brandpalettes.com/uniswap-colors/), [Mama Doreen's teardown](https://mamadoreensemporium.co.uk/uniswap-logo-design-and-brand-identity-key-elements-explained/)
- Bubblemaps: [v2.bubblemaps.io](https://v2.bubblemaps.io/), [DEXTools tutorial](https://www.dextools.io/tutorials/how-to-use-bubblemaps-detect-token-manipulation-tutorial-2026), [Bitget academy](https://www.bitget.com/academy/what-is-bubblemaps-blockchain-data-visualization-guide)
- Arkham: [Visualizer Codex](https://codex.arkm.com/the-intelligence-platform/visualizer), [Visualizer 3.0](https://info.arkm.com/announcements/arkham-visualizer-3-0-is-live), [Coin Bureau review](https://coinbureau.com/review/arkham-intelligence-review)
- Nansen: [nansen.ai](https://nansen.ai/), [Top analytics platforms 2025](https://nansen.ai/post/top-crypto-analytics-platforms-2025)
- Dune/Etherscan terminal aesthetic: [Dune tutorial](https://jamesbachini.com/dune-analytics-tutorial/), [Web3edge guide](https://web3edge.io/guides/dune-analytics-beginners-guide/)
- DefiLlama: [data definitions](https://defillama.com/data-definitions)
- Zapper/Zerion/DeBank: [MyBFF comparison](https://www.mybff.xyz/blog/zerion-vs-zapper-vs-debank/), [Kubera comparison](https://www.kubera.com/blog/zerion-vs-zapper-vs-debank)
- Sector trends: [Merge.rocks 10 Web3 trends 2025](https://merge.rocks/blog/10-web3-design-trends-for-2025), [Heartbeat 10 visual trends](https://heartbeat.ua/blog/10-visual-trends-in-web3-you-need-to-use), [WriteUpCafe 2026 trends](https://writeupcafe.com/top-web3-design-trends-agencies-are-using-in-2026), [Bricx Web3 UX trends](https://bricxlabs.com/blogs/web-3-ux-design-trends)
- UX/onboarding: [Eleken fintech UX](https://www.eleken.co/blog-posts/fintech-ux-best-practices), [AufaitUX blockchain UX](https://www.aufaitux.com/blog/blockchain-ux-design-best-practices/), [LogRocket progressive disclosure](https://blog.logrocket.com/ux-design/progressive-disclosure-ux-types-use-cases/), [Stripe crypto onboarding](https://stripe.com/resources/more/crypto-onboarding-best-practices)

### R3. Data/Monitoring App Patterns

I now have comprehensive, source-backed material across all named apps and every cross-cutting pattern. Synthesizing into the redesign brief data.

---

# Best-in-Class Data/Monitoring App Design — Pattern Library for the TrustNomiks Redesign

Research synthesis from Linear, Vercel, Stripe, Grafana, Datadog, Retool, Mintlify, Height, Raycast. Every pattern gives the **rule** and a concrete **TrustNomiks application**. The through-line: *use visual weight, not deletion, to manage density; reveal complexity in layers; make every state intentional; keep the keyboard a first-class citizen.*

---

## 1. Information Hierarchy & Density Control

The core insight from Linear, Vercel, and the dense-interfaces research: **before deleting an element, ask whether it could stay if it were smaller, lower-contrast, or repositioned.** Density is managed with visual weight, not removal.

| # | Rule | TrustNomiks application |
|---|------|------------------------|
| 1.1 | **Opacity-tiered text.** Most text/icons sit at 40-60% opacity; full saturation is reserved for status, actionable, and critical elements (Linear). | On `/tokens` and `/token-house`, render metadata (timestamps, addresses, secondary labels) at ~50% opacity; reserve full-saturation indigo/violet for the token name, completeness score, and clickable actions. The 13-color node taxonomy is the *only* place full saturation lives at rest. |
| 1.2 | **4px spacing grid, every element aligned.** Consistent alignment to grid/baseline/edge/optical-center creates rhythm inside density (Linear, Vercel). Adjust ±1px optically when perception beats geometry. | Adopt a strict 4px (Tailwind default) spacing scale across cards, form rows, and graph side-panels. Audit the 3600-line `/tokens/new` form for off-grid padding. |
| 1.3 | **Type scale = hierarchy.** Stripe uses ~6 distinct type sizes/weights to encode importance; reduce size+contrast to deprioritize rather than hide. | Define a 6-step type scale in the design system (display / H1 / H2 / body / label / caption). Token KPIs use the largest tier; provenance/source metadata uses caption tier at low contrast. |
| 1.4 | **Tables/lists over cards for dense, scannable data** (dense-interfaces research). Cards are for entry points, not data grids. | The token list and published-claims-view should be dense tables, not card grids. Reserve cards for the dashboard's "glanceable zone" entry tiles. |
| 1.5 | **Tabular numbers everywhere comparisons happen.** `font-variant-numeric: tabular-nums` or a monospace (Vercel/Geist Mono). | All numeric columns — supply, allocation %, vesting durations, $TRUST stake amounts — render with tabular-nums so they align and scan vertically. Use a mono for on-chain hashes/addresses. |
| 1.6 | **Neutral backgrounds support legibility; accent color is disciplined.** Reserve color for meaning, never decoration. | The graph's color taxonomy IS the brand. Keep the rest of the chrome slate-neutral so the node colors (allocation amber, vesting emerald, risk red) carry real semantic weight wherever they appear — charts, badges, table row accents. |

---

## 2. Progressive Disclosure

The single most reused pattern. Linear's three-layer model and Retool's inspector overhaul are the gold standards.

| # | Rule | TrustNomiks application |
|---|------|------------------------|
| 2.1 | **Three-layer reveal: row → click → full detail** (Linear). Hover shows actions; click expands metadata; detail view shows everything. | Token rows: hover reveals quick actions (open graph, stake, export); click opens an inspector panel; "full view" navigates to `/tokens/[id]`. Apply the same to graph nodes. |
| 2.2 | **Basic/Advanced split — hide infrequent controls by default** (Retool moved rarely-used props into a collapsed Advanced panel). | In `/tokens/new`, each of the 6 steps shows only the 3-5 high-frequency fields; edge-case fields (custom vesting cliffs, exotic emission curves) live behind an "Advanced" disclosure. |
| 2.3 | **Effect-based grouping, subcomponent-first** (Retool collapsed 40 property sections into 3: Content / Interaction / Appearance). | Restructure the form/inspector into a small number of meaning-based groups (e.g. Identity / Supply / Distribution / Risk / Provenance) instead of a long flat field list. |
| 2.4 | **Incremental list editing** — add key-value rows progressively instead of showing all slots at once (Retool). | Allocation buckets, vesting schedules, and data sources should start with one row + "Add" rather than rendering N empty rows. Reduces the intimidation of the 3600-line form. |
| 2.5 | **Serve secondary info behind tooltips/"More" menus** (Stripe, Linear). Show "6 of 25" then link to the rest. | Risk flags and source citations show a summary count with a tooltip; the full list opens in the inspector. Don't front-load every triple on the token card. |

---

## 3. Empty / Loading / Skeleton States

| # | Rule | TrustNomiks application |
|---|------|------------------------|
| 3.1 | **Skeletons mirror final layout exactly, no layout shift** (Vercel). Users perceive skeleton content as loading ~50% faster than spinners. | Build skeleton variants for: token table rows, the force-graph canvas, charts (donut/bar/timeline), and the inspector. Each skeleton must match the real grid so nothing jumps. |
| 3.2 | **Spinners for actions, skeletons for content.** Don't show any loader under 300ms (flashes feel like glitches). | Publishing to Intuition (an action) → spinner/progress. Loading the graph or token list (content) → skeleton. Gate both behind a 300ms threshold. |
| 3.3 | **Empty states show the next action, not decoration** (Vercel shows `git push origin main` in monospace, copyable). No dead ends — every screen offers a next step. | Empty `/tokens` → "Structure your first token" CTA + the exact path forward, not a cartoon. Empty export history → "Run your first export." Empty graph → an animated mini-graph teaser (brand DNA) + "Add a token to grow the graph." |
| 3.4 | **Empty states double as onboarding** — introduce features, link docs (40%+ activation when paired with a checklist). | The first-run dashboard empty state seeds the contributor onboarding spine: explains Atoms/Triples, shows the completeness goal (300 tokens), links the 6-step form. |
| 3.5 | **Immediate visual response to every input.** Optimistic UI: update on likely success, reconcile on server, roll back / offer Undo on failure (Vercel). | When staking $TRUST or publishing a claim, reflect the new state instantly with a "pending/building" treatment (mirroring Vercel's favicon-state idea), then reconcile against the Intuition tx result. Provide Undo/rollback on failure. |

---

## 4. Command Palette & Keyboard-First UX

| # | Rule | TrustNomiks application |
|---|------|------------------------|
| 4.1 | **⌘K is the universal entrypoint** — search, navigate, AND act (Linear, Raycast, cmdk standard). Fully keyboard-completable, focus stays anchored in the input. | Add a `⌘K` palette (use `cmdk`). Scope: jump to any token, switch views (Dashboard/Tokens/Token House/Export), run actions ("Publish token X", "Export run", "Stake on…"), and global search across the knowledge graph. |
| 4.2 | **Grouped results: Commands / Pages / Recent**, recent-first ranking, fuzzy search (Raycast, cmdk). | Group palette results into "Tokens", "Actions", "Navigate", "Recent". Surface recently-viewed tokens before long-tail matches. |
| 4.3 | **"Search → act → done" model** — find an object, then act on it inline without leaving the surface (Raycast). | Selecting a token in the palette offers nested actions (open graph / open form / publish / export) without navigating away first. |
| 4.4 | **Discoverable single-letter shortcuts** (Linear: `C` create, `.` command menu, `G then I` goto). | `C` = new token, `G then G` = graph, `G then T` = tokens, `/` = focus search. Show a shortcuts cheat-sheet (`?`). |
| 4.5 | **Visible focus ring on every focusable element; `:focus-visible` not `:focus`; WAI-ARIA flows** (Vercel). Links are `<a>`, never `<div>`. | Audit shadcn components for focus-visible rings in both themes; ensure the whole publish flow and form are keyboard-operable end-to-end. |

---

## 5. Inspector / Detail Panels

| # | Rule | TrustNomiks application |
|---|------|------------------------|
| 5.1 | **Click row/node → load details in a side drawer**, keep context visible (Retool, Linear). Don't force a full navigation for a quick look. | Clicking a graph node or token row opens a right-side inspector showing the node's atoms/triples, stake weight, sources, and risk flags — graph stays visible behind it. |
| 5.2 | **On-canvas navigation** — clicking an element jumps to its properties (Retool). | In the force-graph, clicking an allocation node deep-links the inspector to that allocation's data and its source provenance. |
| 5.3 | **Inspector uses the same effect-based grouping + Advanced collapse** as the form (Retool). | Inspector sections mirror the form's groups (Identity / Supply / Distribution / Risk / Provenance) so contributors and explorers share one mental model. |

---

## 6. Multi-Step Forms Done Well

Directly targets the 3600-line 6-step `/tokens/new` form.

| # | Rule | TrustNomiks application |
|---|------|------------------------|
| 6.1 | **≤5 fields per step** — ~5 fields/view correlates with highest completion. | Cap each visible step at 5 primary fields; push the rest behind Advanced (see 2.2). |
| 6.2 | **Persistent progress indicator** + step labels — users must always know where they are and what remains. | A stepper across all 6 steps with completeness % per step, feeding the existing "tracking completeness" mechanic. Tie it visually to the 300-token global goal. |
| 6.3 | **Save & resume; never lose progress** (key anxiety reducer / completion driver). | Auto-save draft tokens to local + server on every step; "Resume draft" surfaces on dashboard. Critical because tokenomics data entry is long. |
| 6.4 | **Validate per-step, errors inline & immediate** — don't dump errors at the end. | Zod validation fires on step transition; field errors appear inline with recovery guidance, not a wall of errors at submit. |
| 6.5 | **Linear flow with a clear finish + review step.** | Final step = a publish-summary review (you already have `publish-summary`/`publish-panel`) showing the assembled Atoms/Triples before committing to Intuition. |

---

## 7. Onboarding Checklists & Progress

| # | Rule | TrustNomiks application |
|---|------|------------------------|
| 7.1 | **Visible checklist turns "set up your account" into a concrete, satisfying sequence** — externalizes progress, builds momentum, survives leave-and-return (40%+ activation vs 25-30% norm). | A persistent contributor checklist: Connect wallet → Structure first token → Add a source → Publish to Intuition → Stake $TRUST. This is the "progressive onboarding spine" welding the two personas. |
| 7.2 | **Checklist lives where the user lands and tracks completion state.** | Dashboard hosts the checklist for new users; collapses to a small progress pill once complete. Mirrors the token-completeness mechanic at the account level. |
| 7.3 | **Empty states feed the checklist** (see 3.4) — each blank screen advances one checklist item. | Each empty state CTA maps to one checklist step, so exploring the empty app naturally completes onboarding. |

---

## 8. Saved Views, Filters & Segments

| # | Rule | TrustNomiks application |
|---|------|------------------------|
| 8.1 | **Active filters shown as persistent chips** with individual × and a distinct "Clear All"; never hide active state behind a collapsed panel. | On `/tokens` and the graph, applied filters (sector, chain, completeness, risk level) render as removable chips in a sticky header. |
| 8.2 | **Saved views** = named filter combinations in a dropdown, shareable via URL, last-state remembered across sessions. | Let explorers save views like "DeFi tokens, high risk, incomplete" or "Top staked". Shareable URLs encode the exact graph/table filter state. |
| 8.3 | **Global vs component filters with consistent behavior.** Global dims (sector, chain, time) apply everywhere; component filters are local and scoped clearly. | A global sector/chain filter recolors and subsets the whole graph + charts simultaneously; per-chart filters stay local and labeled. |
| 8.4 | **Faceted/progressive filters** — surface top 3-4, hide the rest under Advanced; show live result counts; search for long option lists; sensible default state (no blank first load). | Surface sector / chain / completeness by default; bury exotic facets. Show "(n results)" live. Default the token list to "active, most complete first." |
| 8.5 | **≤8-10 visible options per multi-select**, search beyond that. | The sector filter (13+ taxonomy values incl. purple `sector` nodes) gets a searchable multi-select, not a giant checkbox wall. |

---

## 9. Dashboard Composition (the "calm dense" layout)

Stripe's canonical structure, validated by Datadog's out-of-the-box-readability advantage over Grafana's power-but-complexity.

| # | Rule | TrustNomiks application |
|---|------|------------------------|
| 9.1 | **Three-band layout: glanceable KPI row → trend/time-series band → granular tables.** Compress KPIs + context + next-best-action into the glanceable zone; drill on demand. | Dashboard top: KPI tiles (tokens structured / 300 goal, total staked, published claims, completeness avg). Middle: the living graph + unlock/supply trends. Bottom: dense token table. |
| 9.2 | **KPI card = number + trend arrow + sparkline** (Stripe's revenue/charges/payouts/disputes pattern). | Each KPI tile carries a value, delta indicator, and a sparkline (recharts) — e.g. "tokens structured this week ↑". |
| 9.3 | **Pre-configured, opinionated defaults beat infinite configurability** (Datadog vs Grafana lesson). Ship the right dashboard, don't make users build it. | Don't expose Grafana-style dashboard-building. Ship one excellent, opinionated dashboard per persona; let saved views (§8) handle personalization. |

---

## 10. Motion, Brand & "Living Graph" Signature

Ties the research to the latent brand DNA (the color-coded node taxonomy as the product's visual signature).

| # | Rule | TrustNomiks application |
|---|------|------------------------|
| 10.1 | **Animate only to clarify cause/effect or add deliberate delight; never `transition: all`; list explicit properties; animations cancelable** (Vercel). | The force-graph motion is the headline delight; everywhere else, animation is restrained (hover bg 100ms, active scale 0.98 like Vercel). No gratuitous motion competing with data. |
| 10.2 | **Honor `prefers-reduced-motion`** with a static variant. | The "living indexer" graph and any loader shimmer need a reduced-motion fallback (static graph snapshot, no shimmer). |
| 10.3 | **Speed is a feature** — sub-200ms loads, sub-100ms view transitions, skeletons over spinners (Linear). "No beautiful animation compensates for slow load." | Budget RSC/streaming so views feel instant; the graph mounts with a skeleton, not a spinner. |
| 10.4 | **The accent palette = semantic taxonomy, used consistently as table accents, badges, chart series, node colors, and empty-state imagery.** | Every surface reuses the 13-color node taxonomy (allocation amber, vesting emerald, emission red, risk orange, data_source blue, etc.) so the graph's language permeates charts, filters, badges, loaders, and illustrations — one coherent visual system. |

---

## Top cross-cutting principles to seed the design system

1. **Weight, not deletion** — manage density with opacity/size/position tiers (40-60% muted default, full saturation only for meaning/action).
2. **Layered reveal** — row → click → detail; basic → advanced; summary → full. Nothing front-loads complexity.
3. **Every state is designed** — empty (with a next action), loading (skeleton, 300ms gate), error (recover/undo), dense, sparse.
4. **Keyboard-first** — ⌘K palette + single-letter shortcuts + visible focus rings; the whole publish + form flow operable without a mouse.
5. **Speed is UX** — optimistic updates, skeletons not spinners, sub-200ms perceived loads.
6. **The taxonomy is the brand** — the color-coded node system is the single source of visual truth across graph, charts, badges, filters, loaders, and imagery; chrome stays slate-neutral so it can carry real semantic weight.

---

## Sources

- [925 Studios — Linear Design Breakdown](https://www.925studios.co/blog/linear-design-breakdown-saas-ui-2026)
- [Vercel — Web Interface Guidelines](https://vercel.com/design/guidelines)
- [Blake Crosley — Vercel: Developer Experience as Design](https://blakecrosley.com/guides/design/vercel)
- [MyDesigner — Dense Interfaces & Information Hierarchy 2026](https://mydesigner.gg/blog/dense-interfaces-information-hierarchy-2026)
- [Retool — Simplifying Retool's Inspector](https://retool.com/blog/simplifying-retools-inspector)
- [UX Patterns for Developers — Command Palette](https://uxpatterns.dev/patterns/advanced/command-palette)
- [Lazarev — Dashboard UX Design Best Practices](https://www.lazarev.agency/articles/dashboard-ux-design)
- [Pencil & Paper — Data Dashboard UX Patterns](https://www.pencilandpaper.io/articles/ux-pattern-analysis-data-dashboards)
- [Aufait UX — Dashboard Filter Design Guide](https://www.aufaitux.com/blog/dashboard-filter-design-guide/)
- [Pencil & Paper — Enterprise Filtering Patterns](https://www.pencilandpaper.io/articles/ux-pattern-analysis-enterprise-filtering)
- [Onething Design — Skeleton Screens vs Loading Spinners](https://www.onething.design/post/skeleton-screens-vs-loading-spinners)
- [LogRocket — Skeleton Loading Screen Design](https://blog.logrocket.com/ux-design/skeleton-loading-screen-design/)
- [NN/g — Skeleton Screens vs Progress Bars vs Spinners](https://www.nngroup.com/videos/skeleton-screens-vs-progress-bars-vs-spinners/)
- [Eleken — Empty State UX](https://www.eleken.co/blog-posts/empty-state-ux)
- [Lollypop — Wizard UI Design Best Practices](https://lollypop.design/blog/2026/january/wizard-ui-design/)
- [Userpilot — SaaS Onboarding UX Patterns](https://userpilot.medium.com/onboarding-ux-patterns-and-best-practices-in-saas-c46bcc7d562f)
- [SaaSUI — SaaS Onboarding UX Examples](https://www.saasui.design/blog/saas-onboarding-ux-examples)
- [Raycast — Hack Design Toolkit](https://www.hackdesign.org/toolkit/raycast/)
- [Tableau — Save Dashboard Filters with Custom Views](https://www.tableau.com/blog/save-dashboard-filters-custom-views-for-viewer-role-105941)
- [Mintlify — Design Matters (dashboard glow-up)](https://www.mintlify.com/blog/design-matters)
- [Middleware — Grafana vs Datadog](https://middleware.io/blog/grafana-vs-datadog/)
- [LogRocket — Progressive Disclosure in UX](https://blog.logrocket.com/ux-design/progressive-disclosure-ux-types-use-cases/)
- [IxDF — Progressive Disclosure](https://ixdf.org/literature/topics/progressive-disclosure)

### R4. Graph Motion & Imagery

I have comprehensive coverage across all requested areas. Compiling the brief.

---

# Knowledge-Graph as Visual Signature — Research Brief for TrustNomiks

Research data for the redesign. All ideas are expressed in the existing `atom | triple | source | hub` taxonomy and the node-config color system, and are buildable on the current stack (react-force-graph-2d, Tailwind v4, React 19, framer-motion-class animation).

---

## 1. Force-directed graph: aesthetics & performance (library decision)

### The scaling reality (pick the right tool per surface)
- **react-force-graph-2d (vasturiano, canvas/d3-force)** — what you already have. Renders on HTML5 canvas, physics via `d3-force`. Comfortable to ~**2–3k nodes** interactive, degrades past ~5–7k; the 3D/WebGL sibling chokes near 7k and OOMs at ~100k. This is the right engine for the *real* explorer graph at TrustNomiks' scale (300 tokens → low-thousands of atoms/triples). Keep it.
- **Sigma.js (WebGL)** — practical ceiling ~**100k–500k nodes**; the only one of the mainstream three viable above ~50k without server pre-render. Overkill now; note as the migration path if the graph ever spans all tokens × all wallets/sources at once.
- **Cosmograph / `@cosmograph/cosmos` (GPU, all layout + draw in WGSL/GLSL shaders)** — "fastest web-based library for large network graph visualization," hundreds of thousands of points/links real-time. Ships **knowledge-graph-specific** components: Timeline, Histogram, Legends, Search, cross-filtering. `@cosmograph/react` wraps it. **Strong candidate specifically for the ambient hero** (it looks alive and handles a dense decorative cloud with zero jank) and as a future "全TrustNomiks galaxy" view.
- **Cytoscape.js** — best when the graph is an *analysis object* (centrality, pathfinding, layout algorithms). Not your aesthetic driver.

**Recommendation:** `react-force-graph-2d` for interactive exploration (full control via canvas callbacks, matches your taxonomy colors trivially); **Cosmograph/cosmos for the decorative hero + any "whole-protocol" galaxy view**; hold Sigma.js as the scale escape hatch. Do not adopt 3D-force-graph — performance cliff and harder to keep data legible.

### Performance levers in react-force-graph (exact props — these are your motion + perf budget)
- **`cooldownTicks` / `cooldownTime`** — when the layout freezes. Set finite for static surfaces (saves CPU); set high/Infinity only for a deliberately "breathing" ambient graph.
- **`warmupTicks`** — dry-run layout cycles *before* first paint, so the graph appears pre-settled instead of exploding outward on load.
- **`d3AlphaDecay` / `d3AlphaMin`** — how fast motion dies down. Lower decay = longer, more "alive" settling; higher = snaps to rest.
- **`d3ReheatSimulation()`** — re-energize on new data (use it as the *"a new atom was indexed"* gesture).
- **`enablePointerInteraction={false}`**, **`enableZoomInteraction`**, **`enablePanInteraction`** — **disable pointer tracking on the ambient/hero graph**: it's the single biggest perf win when you don't need hover/click.
- **`autoPauseRedraw`** — auto-stops per-frame canvas redraw when the engine halts; **turn OFF** only for graphs with custom always-animating objects (your particle edges), otherwise leave on.
- **`onRenderFramePre` / `onRenderFramePost`** — hook your own canvas drawing before/after default render (glow halos, scanlines, vignette).
- **`emitParticle(link)`** — fire a single non-cyclical particle down an edge **on demand**: this is your literal "data flowing into the graph" primitive.

---

## 2. The "living graph" toolkit — animated edges, ingestion, ambient motion

### Animated edges (the core motif — "claims flowing through the graph")
- **`linkDirectionalParticles`** (count) + **`linkDirectionalParticleSpeed`** (ratio of link length/frame) + **`linkDirectionalParticleWidth` / `linkDirectionalParticleColor`** — particles travel **source → target**. Map this to semantics: a `triple` edge shows particles flowing subject → predicate → object; a `source` edge (data_source #3b82f6) pulses particles into the atom it backs. Color particles by the *target* node family.
- **`linkDirectionalArrowLength`** — directional arrowheads for triple directionality (0 hides). Use sparingly; particles read better than arrows for "flow."
- **`nodeCanvasObject` + `nodeCanvasObjectMode: 'before'/'after'/'replace'`** — per-frame custom node paint. This is where you render the taxonomy: colored fill, family-specific shape (hub = ring, atom = solid disc, triple = diamond, source = square/document glyph), and a **glow halo** drawn as a radial gradient (canvas, since WebGL graphs can't take CSS glow — that's a known Obsidian limitation you sidestep by being on canvas).
- **`linkCanvasObject`** — custom edge styling (gradient strokes from source-color → target-color, dashed for "unverified/low-stake" claims).

### Node ingestion / indexing animation (the signature moment)
The "indexer rendered as a living graph" idea, made concrete:
1. **Spawn at the hub.** New atoms enter from the `graph_root` hub (#6366f1) at center, scale 0 → 1 with a spring, then `d3ReheatSimulation()` lets them drift to their force position. Reads as the indexer *emitting* knowledge.
2. **Edge draw-on.** When a triple forms, animate the link's `linkDirectionalParticleSpeed` from a burst (fast particle salvo) then settle to a slow ambient pulse — the claim "lands."
3. **Progressive build-up for empty→full.** On dashboard/token load, don't render the final graph instantly: ingest nodes in staggered batches (50–80ms apart) so the user *watches it index*. Pair with a counter ("indexing 47 / 300 atoms"). This is the streaming-graph version of skeleton loading — it converts wait time into brand.
4. **Stake = mass/glow.** $TRUST staked on an atom → larger node radius + brighter halo + slower particle decay. Curation literally makes a node "heavier" and "brighter" in the graph. This is your unique mechanic made visible.

### Ambient / background network motion (hero + empty states + auth pages)
- **tsParticles** (`@tsparticles/react`, modern successor to particles.js) — HTML5-canvas constellation/network backgrounds, nearest-neighbor line-linking, hardware-accelerated, stable FPS on mobile, "without sacrificing Core Web Vitals." **Has a first-class reduced-motion plugin** (reduces/disables animation for `prefers-reduced-motion`). Use for: login/onboarding backdrop, hero ambient field, section dividers. Tint particles with the taxonomy palette (mostly indigo/violet hub+token tones, sparse amber/emerald/blue accents = the data families drifting by).
- **Cosmograph/cosmos** for a *real* (not faked) decorative graph in the hero — a slowly rotating, never-settling cloud of a few hundred nodes colored by family, pointer-interaction off, very low alpha decay. Looks like a live indexer because it *is* one.
- **Layering recipe for the hero:** vignette + faint grid → tsParticles constellation field (depth) → foreground force-graph or cosmos cloud (subject) → headline/CTA over a soft radial dark gradient so text stays legible.

---

## 3. Graph UIs in the wild — what to borrow

- **Bubblemaps** — wallets = bubbles, **size encodes holding, edges encode past transactions**; clusters reveal concentration/suspicious activity at a glance. *Borrow:* size-encodes-magnitude (your: stake or allocation %), and the "table → graph" reframe (they explicitly position graph as the antidote to text tables). Widget-embeddable into Etherscan/CoinGecko/DEXScreener — a model for a **TrustNomiks embeddable token-graph widget**.
- **Arkham Visualizer** — lets non-coders see connections between entities, real-time, no SQL. *Borrow:* the "expand a node to reveal its neighborhood" interaction and the labeled-entity overlay (your atoms already carry labels/DIDs).
- **Nansen** — enriches raw on-chain data with **labels + reputation**, real-time dashboards. *Borrow:* the label/reputation overlay — Intuition's whole thesis is "everything carries reputation tied to DIDs," so render reputation/stake as a visible node property (ring thickness, halo intensity).
- **Obsidian graph view** — the gold standard for "personal knowledge as living graph": glow nodes, color by tag/folder, focus-on-hover dimming of the rest. *Borrow:* **focus mode** (hover/select a node → neighbors stay lit, everything else fades to ~15% opacity) and **color-by-type legend**. Note their pain point — WebGL can't do CSS glow — which you avoid by being on canvas (`nodeCanvasObject` radial-gradient halos).
- **Intuition's own framing** — "token-curated knowledge graph… verifiable, tradable data assets," atoms = DIDs pointing to anything, triples = subject/predicate/object. Your visual signature should make *curation* (staking) and *verifiability* (sources) the two things the eye reads first.

---

## 4. Motion-design principles for data apps (the system rules)

From Atlassian Design Foundations + LottieFiles/Disney-principles motion skill. Encode these as design tokens.

### Duration budget
- **Micro-interactions (hover, press, toggle): 50–150ms.** Keep high-frequency motion under 150ms so it never makes the user wait.
- **Transitions (enter/exit, reposition): 150–400ms.** Larger elements → longer end of range.
- **Expressive / low-frequency moments (onboarding, first graph reveal, "indexing complete"): longer is allowed** — this is where you spend the motion budget for brand.

### Easing (ship as CSS custom properties)
- **Ease-out for entrances** — `cubic-bezier(0, 0.4, 0, 1)` (bold) or `cubic-bezier(0.4, 1, 0.6, 1)` (subtle). Things arrive fast, settle soft. Use for nodes spawning, cards mounting.
- **Ease-in-out for repositioning/modals** — `cubic-bezier(0.4, 0, 0, 1)`.
- **Ease-in for exits** — `cubic-bezier(0.6, 0, 0.8, 0.6)`; **make exits faster than entrances** so motion never blocks the workflow.

### Orchestration
- **One focal point per moment.** "When multiple elements animate, a single event leads and others support." Don't run competing simultaneous animations. On a chart filter change, animate the foreground metric slightly faster than background panels so the eye knows where to look.
- **Stagger for ingestion** — sequence node entrances ~50–80ms apart; the *sequence itself* communicates "indexing," whereas a simultaneous pop communicates nothing.

### When motion clarifies vs. distracts
- **Clarifies:** state changes, filter/data updates (animate chart elements + numbers so users track change without losing place), entrances/exits, feedback. "Motion is a clarifying layer, not decoration."
- **Distracts:** decorative flourish on high-frequency controls, anything that splits attention, anything that makes the user wait. The ambient hero graph is the *one* sanctioned decorative motion — and it lives where there's no task to block.

### Reduced motion (non-negotiable, common AI-gen failure)
- Honor `prefers-reduced-motion: reduce`. When active: **transitions become instant, ambient/particle motion turns OFF**, interface stays fully functional. tsParticles' motion plugin and a global Tailwind/CSS `motion-reduce:` strategy cover this. Provide a manual "reduce motion" toggle too. The graph still renders — it just stops *moving* (freeze the simulation, kill `linkDirectionalParticles`, no auto-reheat).

---

## 5. Concrete buildable deliverables for TrustNomiks

### A. Hero "indexing" animation (landing page — replaces the bare `redirect('/dashboard')`)
- Background: tsParticles constellation field, indigo/violet base, sparse family-colored accent particles, pointer-reactive but reduced-motion-safe.
- Midground: a Cosmograph/cosmos (or low-node react-force-graph) cloud, ~150–300 nodes colored by family, never settling (`cooldownTicks=Infinity`, low `d3AlphaDecay`), pointer interaction off.
- Foreground sequence on load: hub node ignites at center → atoms stream outward in staggered batches → triples draw with a particle salvo → a live counter ticks "0 → 300 tokens structured." Headline + CTA over a dark radial gradient for legibility.
- Respects reduced-motion: renders the *final settled* graph, statically, with no streaming/particles.

### B. Graph-themed loaders / empty states
- **Loader:** mini force-graph "assembling itself" — a few hub→atom→triple nodes drawing in on loop, instead of a spinner. Doubles as brand every time data fetches.
- **Empty state (no tokens yet):** a lone `graph_root` hub pulsing, copy: "Your tokenomics graph is empty. Add the first atom." CTA is the literal first node. For an empty token: faint ghost nodes (allocation/vesting/emission families at 15% opacity) showing *what could be filled* — the 6-step form maps onto graph regions to light up.

### C. Onboarding imagery (the contributor/explorer spine)
- Each of the 6 form steps = one node-family lighting up in a side-panel mini-graph (token → allocation → vesting → emission → risk_flag → data_source). Completeness % = how much of the graph is illuminated. The form *builds the graph in real time* beside the inputs — progress is spatial, not a bar.
- Explorer onboarding: a guided "tour" where focus-mode walks node by node, dimming the rest (Obsidian-style), narrating the taxonomy.

### D. Ambient motion system (design tokens to define once)
- **Palette → motion mapping:** particle/edge colors pull directly from `node-config.ts` (hub indigo, token violet, allocation amber, vesting emerald, emission red, risk orange, source blue, export teal). Edges colored by target family.
- **Encodings:** node radius = magnitude (stake / allocation %); halo brightness = $TRUST staked / verification strength; particle density on an edge = recency/activity; opacity = focus state.
- **Tokens to ship:** `--motion-micro: 120ms`, `--motion-transition: 280ms`, `--motion-expressive: 600ms`; `--ease-entrance: cubic-bezier(0,0.4,0,1)`; `--ease-exit: cubic-bezier(0.6,0,0.8,0.6)`; `--ease-move: cubic-bezier(0.4,0,0,1)`; stagger `--stagger-ingest: 64ms`. Global `motion-reduce` kill-switch.
- **Gestures as vocabulary:** *spawn-at-hub* (new atom), *particle-salvo* (new triple/claim), *swell-and-glow* (stake added), *focus-dim* (selection), *breathe* (idle ambient, very low alpha).

---

## Sources
- [vasturiano/react-force-graph](https://github.com/vasturiano/react-force-graph) · [react-force-graph docs](https://vasturiano.github.io/react-force-graph/) · [perf issue #223 (12k elements)](https://github.com/vasturiano/react-force-graph/issues/223) · [perf issue #202 (large datasets)](https://github.com/vasturiano/react-force-graph/issues/202)
- [vasturiano/force-graph (canvas API)](https://github.com/vasturiano/force-graph) · [vasturiano/3d-force-graph](https://github.com/vasturiano/3d-force-graph)
- [Sigma React graph viz — William Lyon](https://lyonwj.com/blog/sigma-react-graph-visualization) · [Best libraries for large network graphs — Medium](https://weber-stephen.medium.com/the-best-libraries-and-methods-to-render-large-network-graphs-on-the-web-d122ece2f4dc)
- [Cytoscape vs vis-network vs Sigma 2026 — PkgPulse](https://www.pkgpulse.com/blog/cytoscape-vs-vis-network-vs-sigma-graph-visualization-javascript-2026) · [JS graph/network viz comparison — Cylynx](https://www.cylynx.io/blog/a-comparison-of-javascript-graph-network-visualisation-libraries/) · [Top 13 JS graph libraries — Linkurious](https://linkurious.com/blog/top-javascript-graph-libraries/)
- [@cosmograph/cosmograph — npm](https://www.npmjs.com/package/@cosmograph/cosmograph) · [@cosmograph/react — npm](https://www.npmjs.com/package/@cosmograph/react) · [cosmosgl/graph (GPU force layout)](https://github.com/cosmosgl/graph) · [Cosmograph intro](https://cosmograph.app/versions/v1-docs/introduction/)
- [tsParticles — GitHub](https://github.com/tsparticles/tsparticles) · [tsParticles examples](https://freefrontend.com/tsparticles-js/) · [tsParticles background tutorial — DigitalOcean](https://www.digitalocean.com/community/tutorials/js-background-effects-particlesjs)
- [Bubblemaps on-chain analytics guide](https://blog.bubblemaps.io/on-chain-analytics-for-beginners-a-data-driven-guide/) · [What is Bubblemaps — Bitget](https://www.bitget.com/academy/what-is-bubblemaps-blockchain-data-visualization-guide) · [Arkham Visualizer](https://intel.arkm.com/visualizer) · [On-chain analysis guide — Arkham](https://info.arkm.com/research/on-chain-analysis-guide)
- [Obsidian graph view customization — Hub](https://publish.obsidian.md/hub/04+-+Guides,+Workflows,+&+Courses/Guides/Graph+view+customization) · [Obsidian graph node glow — forum](https://forum.obsidian.md/t/how-to-get-nodes-to-glow/83019)
- [Intuition Systems](https://www.intuition.systems/) · [$TRUST Tokenomics — Intuition Docs](https://www.docs.intuition.systems/docs/intuition-concepts/economics/tokenomics)
- [Atlassian Design — Motion foundations](https://atlassian.design/foundations/motion) · [LottieFiles motion-design-skill](https://github.com/LottieFiles/motion-design-skill) · [20 Motion Design Principles — Mockplus](https://www.mockplus.com/blog/post/20-motion-design-principles-with-examples)
- [Loading animations for data viz — Yunyi Zhang](https://yunyizhang.medium.com/design-loading-animations-for-data-visualizations-449dc1305a79) · [Skeleton loading screen design — LogRocket](https://blog.logrocket.com/ux-design/skeleton-loading-screen-design/)

### R5. Onboarding & Friction

I now have comprehensive coverage across all requested dimensions. Synthesizing into the redesign-brief deliverable.

---

# TrustNomiks — Onboarding & Retention Research (Redesign Brief Input)

Research synthesis for welding a data-**CONTRIBUTOR** and a data-**EXPLORER** persona under one progressive onboarding spine. Focus: complex/data-heavy + Web3 products. All claims sourced inline; sources listed at end.

---

## 0. Headline numbers (use these to justify the redesign)

- Average SaaS activation rate in 2025 is **37.5%** — 6 of 10 signups never hit a meaningful milestone. The bar to beat is low and the upside is large.
- Best-in-class products deliver the **aha moment in under 5 min**; doing so yields **~40% higher 30-day retention** vs products that take 15+ min.
- Cutting steps + adding SSO took one product from 12→7 steps and **8.2→1.6 days** to activation, lifting activation **42%→81%**.
- **Role/use-case-based flows increase activation 30–50%.** This is the single biggest lever for a dual-persona product like TrustNomiks.
- Behavior-triggered **contextual** guidance: **2.5× engagement** vs static tooltips; just-in-time onboarding **2.9× feature adoption** vs tours; **+38.4% 90-day retention** vs static approaches.
- LinkedIn's completeness bar lifted full-profile completion **+55%** — directly relevant to the contributor's 6-step form and TrustNomiks' "300 tokens structured" goal.

**Implication:** the redesign's ROI case rests on (1) role-split at entry, (2) sub-5-min aha for *each* persona, (3) replacing any upfront tour with progressive/contextual guidance, (4) a meaningfully-incremented completeness system.

---

## 1. The aha moment — defined per persona

The aha is the single point where the user *viscerally* feels "I see why this exists," ideally within 3 minutes. The entire flow should converge on it. TrustNomiks has two distinct ones — design must not blur them:

| Persona | Aha moment (what they must *feel*) | First-value artifact to surface fast |
|---|---|---|
| **EXPLORER** | "I can *see* the tokenomics of a token as a living, interrogable graph and compare it to another in seconds." | A pre-loaded, animated knowledge graph of a real well-known token (e.g. a marquee token already structured), with one comparison and one risk_flag visible. No wallet, no signup needed. |
| **CONTRIBUTOR** | "I entered a few facts and the system turned them into verifiable structured claims (Atoms/Triples) that render as graph nodes — and I can see my completeness climbing." | After step 1 of the form, show the partial graph *materializing* from their input + completeness ticking up. Value before completion. |

**Design rule:** the Explorer aha must be reachable with **zero auth** (sample/demo data — see §5). The Contributor aha must be reachable **before** finishing the long form and **before** publishing on-chain.

---

## 2. The two-interface problem and why a shared spine works

Contributors and Explorers have "fundamentally different roles, expectations, and needs" — a one-size interface leaves one side disengaged. A user who self-IDs one way should see different first steps; "the product is the same, but the path to value is different." TrustNomiks is effectively a **two-sided market** (contributors produce structured claims; explorers consume them), and two-sided networks have two distinct user groups whose value is interdependent.

But you don't want two disjoint products. The **spine** is the connective tissue: a shared entry, a shared graph metaphor, and **bridges** that let each persona discover the other role at the moment of curiosity (Explorer hits a gap in data → "contribute this"; Contributor publishes → "see your claim live in the explorer graph"). This is the welding point and the brief's core ask.

---

## 3. Progressive onboarding > upfront tour (the central architecture decision)

Static product tours that showcase many features at once cause information overload; users skip and forget them, then can't recall functionality when needed → drop-off. For "complex workflows, high-function tools, multiple sections" (exactly TrustNomiks), **progressive onboarding** wins: surface the right guidance at the moment of need, learn-by-doing.

**Sequencing logic to adopt:**
1. **Segment first** (role-select screen) — decide what each user sees and when.
2. **Branched entry paths** — "choose your own journey" at signup (e.g. ConvertKit's beginner vs experienced-with-data paths). Map directly to Explorer vs Contributor.
3. **Progressive revelation** — personalized empty states + educational modals; reveal hidden functions via hotspots/spotlights/native tooltips *as users progress*, not upfront.
4. **Trigger mechanisms** — nudges fire on: user actions, feature interaction (reveal adjacent capability when they touch a related tool), and progress milestones (checklist + progress bar).

**UI-pattern selection (least disruptive first):**
- Tooltips/banners for hints; **reserve modals only for major moments**.
- Avoid sequential multi-step tours pointing around the UI; prefer single, action-triggered steps.
- **Always provide skip/escape** routes.

---

## 4. Onboarding checklist / setup guide (Linear / Stripe / Notion pattern)

A checklist gives a "clear path on day one," brings steps/links into one place, enables progress tracking, and (Notion's "Getting Started" being the canonical example) presents a simple, actionable list of initial tasks. Stripe frames onboarding as the *first* interaction — "intuitive and polished, with minimal friction" — and codifies patterns (activation, sign-in, redirection).

**Apply to TrustNomiks** as a persistent, dismissible **"Getting Started" panel** on the dashboard, role-aware:
- *Explorer checklist:* Explore a sample token graph → Compare two tokens → Save/follow a token → (bridge) Spot a data gap → Connect wallet to weight a claim.
- *Contributor checklist:* Add your first token (step 1 only) → See it become graph nodes → Complete a section → Reach X% completeness → Publish first claim to Intuition → Stake/weight it.
- Each item must **clearly improve the user's state** — never arbitrary (see §7 pitfalls).

---

## 5. Empty-state-as-onboarding + sample/demo data

A blank dashboard on day one is a **dead end**; users "do nothing and leave." Convert every empty state into a guided starting point. Best practice: **seed 3–5 templates or pre-populated sample content** showing the product "when it's full," *before* the user does any work; pair with a clear primary CTA + secondary action, and a visual prompt/short animation over text. The canonical pattern: Dropbox's getting-started PDF, Gmail's sample email. Ratio guideline: **2 parts instruction : 1 part delight** — clarity over personality.

Critically, the empty state must serve the **actual flow context**: "if the user hits an empty state expecting information or direction, an empty state that's actually empty is a dead end." (Vimeo cautionary tale: great empty-state art, but the upload CTA was buried → still failed.)

**For TrustNomiks specifically:**
- **Explorer landing replaces `redirect('/dashboard')`** with a *live, pre-seeded graph* of real structured tokens — the demo IS the marketing and the onboarding. Let users **explore before sign-up** (sandbox/"play before you sign up" pattern; Figma/Slack/Notion-style dissected flows treat this as inspiration-grade).
- **Contributor empty states** (no tokens yet, empty allocation chart, empty unlock timeline): each shows a *ghost/sample* of what a completed token looks like (donut, supply bar, unlock timeline pre-filled with demo data) + one-click "Start with this token" or "Use sample to learn the form."
- Use the **node taxonomy as the imagery**: empty states render faint, animated graph nodes in the family colors (token=violet, allocation=amber, vesting=emerald, etc.) that "light up" as real data arrives. This is where the latent brand DNA becomes the onboarding.

---

## 6. Killing long-form friction (the 6-step / 3600-line form)

This is the contributor's biggest churn risk. Evidence-backed friction-killers:

- **Break into steps** (already done) — reduces cognitive overload that "accumulates stress" and causes drop-out. Keep it; refine it.
- **Autosave + draft resume** — "autosave often and recover drafts after refresh or reconnect"; let respondents save and return later. Non-negotiable for a long structured-data form.
- **Inline validation** — +22% success, −22% errors. Use **"reward early, punish late"**: confirm a fix immediately, but wait until blur to flag a first-time entry (don't yell while they type).
- **Smart defaults** — educated guesses that are "safe and editable" to offload work (e.g. infer chain, decimals, common allocation categories, standard vesting cliffs).
- **AI-assist / autofill** — 2025-mature: AI suggests field values from patterns/context and can **search the web** to pre-fill entity details (address/website/etc.); AI form-fillers read a PDF/whitepaper and "fill in the correct data within minutes." For TrustNomiks: **paste a whitepaper / proposal URL → AI proposes Atoms/Triples → human reviews & edits.** This is the strongest single contributor accelerator and aligns with the "data-entry → exploration" evolution.
- **Simplify inputs** (dropdowns over free text where possible) and minimize required fields per step.
- **Value before completion** — let the user see graph nodes + completeness rise after *each* step, so partial work already pays off.

---

## 7. Gamified completeness — done well, not cargo-culted

LinkedIn's completeness bar = **+55% full-profile completion**, by appealing to basic satisfaction. Why it works: **meaningful motivation copy** ("complete profiles are 40× more likely to receive opportunities"), **progression beyond 100%** (a strength indicator that keeps people active), and **clear incremental steps** where each step *visibly* improves the profile.

**Pitfalls to avoid:** progress bars fail when advancement feels **arbitrary/meaningless**, when goals are **too distant**, or when updates are **too infrequent** — users ignore bars that move unpredictably.

**For TrustNomiks' completeness scoring:**
- Tie each increment to a **named, valuable structured claim** ("+ vesting schedule = +12%, unlocks the unlock-timeline chart"). Each step must unlock something tangible (a chart, a graph branch, a comparison eligibility), mirroring LinkedIn's "each step clearly improves your profile."
- Provide **motivation copy** grounded in the product's mission ("Tokens at 80%+ completeness appear in Explorer comparisons / earn more $TRUST weighting").
- Consider a **strength tier beyond 100%** (e.g. "Verified" / "Community-weighted") so completion isn't a dead end — sustains contribution like LinkedIn's post-100% strength meter.
- Avoid one giant distant "300 tokens" bar as the *user's* motivator — that's a *platform* goal; give the individual contributor near-term, frequent, predictable increments.

---

## 8. Web3 / wallet onboarding without scaring users

The intimidation of wallet setup/seed-phrase management is described as a **"product-killer,"** not a UX nit. The fix in 2025–2026: **account abstraction / smart wallets + embedded wallets** — wallets that "operate more like apps than cryptographic vaults," removing seed-phrase risk and gas friction. Practical pattern: **embed wallet creation in sign-up via social login or email**, instead of forcing a MetaMask extension install immediately; users "may not even realize they are using crypto infrastructure." AA wallets in 2025 have moved from experimental into real consumer products.

**For TrustNomiks (stack-respecting — wagmi/viem/RainbowKit/Intuition SDK):**
- **Defer the wallet entirely** until the user has felt value. Explorer can browse the full graph and reach aha with **no wallet**. Contributor can fill the form and see nodes materialize with **no wallet** — the wallet is only needed at **publish/stake** ($TRUST weighting), framed as "make your claim verifiable & earn weight," not as a gate.
- Offer **email/social → embedded smart wallet** as the default path (RainbowKit supports embedded/social connectors); keep "connect existing wallet" (MetaMask et al.) as the secondary, advanced option for crypto-natives. Mirrors the dual persona: Web2-comfortable explorer vs crypto-native contributor.
- Use **just-in-time education** at the publish step (a contextual modal explaining Atoms/Triples/staking in plain language) rather than an upfront Web3 tour.

---

## 9. Accessibility (build into the spine, not bolted on)

WCAG 2.1/2.2 (and 2025 EAA/ADA pressure) is the benchmark; design for Perceivable/Operable/Understandable/Robust. Notably, **no major commercial onboarding platform (Appcues, Userpilot, Chameleon) certifies WCAG 2.1 AA** as of 2026 — so a custom, accessible onboarding layer is a genuine differentiator and you can't assume a vendor handles it.

**Concrete requirements for every onboarding/tour/checklist/graph element:**
- **`prefers-reduced-motion`** support — the graph animations, node "lighting up," and smoke/loaders must degrade to static/low-motion. Avoid flashing/jerky motion (vestibular/epilepsy risk). This is essential given TrustNomiks' motion-heavy graph brand.
- **Full keyboard operability** — tours/modals navigable via Tab/Arrow/Enter/Escape; dropdowns openable with Enter/down-arrow; custom widgets (graph, force-graph nodes) operable by keyboard alone with a fallback list/table view.
- **Focus trap** in modals/dialogs (publish dialog, run-detail dialog), **aria-live** announcements for progress/validation/toasts, visible focus rings.
- **Contrast**: verify the node-taxonomy colors (amber/emerald/red/orange on light theme) meet AA text/non-text contrast; provide non-color cues (icon/shape per node family) so the color-coded graph isn't color-only.
- Reference implementation pattern exists (Tour Kit: focus trap + keyboard + aria-live + reduced-motion in core) — match that bar even if you build custom.

---

## 10. PROPOSED ONBOARDING SPINE (contributor ↔ explorer)

A single progressive spine, branching by role, with explicit bridges. Replaces `redirect('/dashboard')`.

```
                         ┌─────────────────────────────────────────┐
   ENTRY (no auth)       │  Landing = LIVE pre-seeded graph demo     │
   "Explore before       │  of real structured tokens, in motion.    │
    you sign up"         │  CTA: "Explore the graph"  +  "Add a token"│
                         └───────────────┬───────────────────────────┘
                                         │  Lightweight role-select
                                         │  ("I want to… explore / contribute")
                         ┌───────────────┴───────────────┐
                         ▼                                ▼
        ┌──────────────────────────────┐   ┌──────────────────────────────┐
        │  EXPLORER PATH               │   │  CONTRIBUTOR PATH            │
        │  Aha < 5 min, no wallet      │   │  Aha < 5 min, no wallet      │
        │                              │   │                              │
        │  1 Open a sample token graph │   │  1 Add token: step 1 only    │
        │  2 Compare two tokens        │   │  2 SEE nodes materialize +   │
        │  3 See a risk_flag           │   │    completeness tick up      │
        │  4 Save/follow a token       │   │  3 AI-assist: paste paper →  │
        │                              │   │    proposed Atoms/Triples    │
        │  Checklist (Notion-style),   │   │  4 Autosave + resume draft   │
        │  contextual tooltips,        │   │  5 Inline validation,        │
        │  empty-state seeding         │   │    smart defaults            │
        └───────────────┬──────────────┘   └──────────────┬──────────────┘
                        │                                  │
            BRIDGE ►  "This token is                BRIDGE ►  "See your claim
            missing vesting data —                  LIVE in the Explorer graph"
            contribute it" (→ Contributor)          (→ Explorer)
                        │                                  │
                        └─────────────┬────────────────────┘
                                      ▼
                       ┌──────────────────────────────────────┐
                       │  WALLET — just-in-time, value-first   │
                       │  Only at PUBLISH / STAKE ($TRUST).    │
                       │  Default: email/social → embedded     │
                       │  smart wallet. Secondary: connect     │
                       │  existing wallet (crypto-natives).    │
                       │  Plain-language Atoms/Triples/staking  │
                       │  explainer (contextual modal).        │
                       └──────────────────────────────────────┘
```

**Spine principles:**
1. **Value before identity, identity before wallet.** Explore/contribute first; auth second; wallet last (only to publish/weight).
2. **One graph metaphor, two doors.** Same color-coded living graph is the demo, the empty state, the loader, the imagery, and the reward — for both personas.
3. **Bridges are first-class.** Every data gap an Explorer sees is a contribution prompt; every claim a Contributor publishes is an Explorer-graph reveal. This is the weld.
4. **Progressive, never a tour.** Role-select → branched path → contextual nudges on action/feature/milestone. Skippable everywhere.
5. **Completeness as the shared currency** — drives contributors to fill, gates/enriches what explorers can compare.

---

## 11. RANKED FRICTION-KILLERS (do in this order)

1. **Replace `redirect('/dashboard')` with a live, no-auth, pre-seeded graph demo + role-select.** Highest leverage: unlocks the Explorer aha with zero friction and segments users (role-based flows = +30–50% activation).
2. **Defer the wallet to publish/stake only; default to email/social → embedded smart wallet.** Removes the single biggest Web3 "product-killer" from the front door.
3. **Autosave + draft resume on the 6-step form.** Stops long-form abandonment from refresh/disconnect/return-later.
4. **Show value before completion** — render graph nodes + completeness increment after *each* form step (contributor aha before publishing).
5. **AI-assist intake:** paste whitepaper/proposal URL → AI proposes Atoms/Triples for human review. Largest contributor throughput gain; aligns with the entry→exploration pivot.
6. **Persistent role-aware "Getting Started" checklist** (Notion/Linear pattern) with meaningful, near-term increments + motivation copy.
7. **Inline validation with "reward early, punish late"** + smart defaults (chain, decimals, standard categories/cliffs).
8. **Empty-state seeding everywhere** (sample token, ghost charts, faint animated nodes) — 2:1 instruction:delight, clear primary CTA.
9. **Completeness scoring with tangible per-step unlocks + a tier beyond 100%** (avoid arbitrary/distant bars; never use the platform's "300 tokens" goal as the individual's motivator).
10. **Contextual progressive nudges** (tooltips/hotspots on action & milestone) instead of any multi-step tour; modals reserved for major moments; skip always available.
11. **Accessibility baked in:** `prefers-reduced-motion` for all graph/loader animation, full keyboard + focus-trap + aria-live on tours/modals/dialogs, non-color cues per node family, AA contrast on taxonomy colors, and a list/table fallback for the force-graph.
12. **Explicit contributor↔explorer bridges** (data-gap → contribute; publish → see-it-live) wired into the relevant empty states and success screens.

---

## Sources

- https://www.candu.ai/blog/best-saas-onboarding-examples-checklist-practices-for-2025
- https://www.digitalapplied.com/blog/customer-onboarding-time-to-value-2026-saas-metrics-framework
- https://www.artisangrowthstrategies.com/blog/user-activation-rate-find-fix-saas-aha-moment
- https://www.sanjaydey.com/saas-onboarding-get-users-to-aha-moment-in-3-minutes/
- https://www.appcues.com/blog/aha-moment-guide
- https://www.statsig.com/perspectives/aha-moment-saas-metrics
- https://docs.stripe.com/stripe-apps/onboarding
- https://www.notion.com/templates/new-hire-onboarding-2
- https://www.morgen.so/blog-posts/linear-project-management
- https://userpilot.com/blog/progressive-onboarding/
- https://www.setproduct.com/blog/how-to-replace-onboarding-with-contextual-help
- https://www.saasfactor.co/blogs/why-most-product-tours-fail-and-how-to-implement-contextual-onboarding
- https://www.useronboard.com/onboarding-ux-patterns/empty-states/
- https://www.smashingmagazine.com/2017/02/user-onboarding-empty-states-mobile-apps/
- https://mobbin.com/glossary/empty-state
- https://www.eleken.co/blog-posts/empty-state-ux
- https://www.setproduct.com/blog/empty-state-ui-design
- https://www.zuko.io/blog/form-ux-design-tips-best-practice-examples
- https://www.zuko.io/blog/how-to-use-defaults-to-optimize-your-form-ux
- https://www.reform.app/blog/inline-validation-improves-form-ux
- https://smart-interface-design-patterns.com/articles/inline-validation-ux/
- https://www.formstack.com/features/save-and-resume
- https://primer.style/product/ui-patterns/saving/
- https://www.microsoft.com/en-us/power-platform/blog/power-apps/introducing-copilot-assistance-for-filling-forms-in-model-driven-apps/
- https://learn.microsoft.com/en-us/dynamics365/release-plan/2025wave2/smb/dynamics365-business-central/get-better-field-suggestions-using-autofill-copilot
- https://www.lcx.com/crypto-ux-revolution-how-wallet-abstraction-is-making-web3-accessible-to-everyone/
- https://dev.to/wildanzr/web3-ux-finally-feels-normal-in-2026-smart-wallets-account-abstraction-and-the-end-of-seed-2okf
- https://medium.com/@joalavedra/the-ultimate-web3-authentication-guide-2025-wallet-sign-in-embedded-wallets-and-choosing-the-d4eace54f951
- https://bricxlabs.com/blogs/web-3-ux-design-trends
- https://blog.captainup.com/analysis-of-linkedin-driving-engagement-with-gamification/
- https://gamificationplus.uk/linkedin-progress-bar/
- https://sa-liberty.medium.com/the-31-core-gamification-techniques-part-1-progress-achievement-mechanics-d81229732f07
- https://medium.com/design-bootcamp/2025-accessibility-regulations-for-designers-how-wcag-eaa-and-ada-impact-ux-ui-eb785daf4436
- https://github.com/domidex01/tour-kit
- https://www.levelaccess.com/blog/keyboard-navigation-complete-web-accessibility-guide/
- https://onramp.us/blog/dual-roles
- https://www.appcues.com/blog/user-onboarding-best-practices
- https://insightsoftware.com/blog/the-role-of-persona-segmented-dashboards-in-user-onboarding/
- https://en.wikipedia.org/wiki/Two-sided_market
- https://supademo.com/blog/create-interactive-onboarding-demos
- https://supademo.com/blog/onboarding-ux-best-practices
- https://formbricks.com/blog/user-onboarding-best-practices