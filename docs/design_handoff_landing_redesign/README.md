# Handoff: Landing Page Redesign + Login + New Logo (TrustNomiks)

## Overview
Redesign of the public-facing surfaces of `trustnomiks-app`:
1. **Landing page** (`src/app/page.tsx`) — evolved from the current hero-only page into an ecosystem front door: nav, hero with living graph, value props, ecosystem cards (Docs / API & MCP / Whitepaper), 3-phase vision, community band, rich footer.
2. **Login page** (`src/app/login/page.tsx`) — same structure as today, with the new logo mark.
3. **New logo mark ("Orbit", direction 1c)** — replaces the current two-atom mark everywhere.

## About the Design Files
The files in this bundle are **design references created in HTML** — prototypes showing intended look and behavior, **not production code to copy directly**. The task is to **recreate these designs in the existing Next.js 16 / React 19 / Tailwind CSS 4 + shadcn/ui codebase**, using its established patterns: `Logo` / `LogoMark` components, `LiveGraph`, `Button` variants, the `globals.css` token system ("Data Observatory" design system, dark-first). Do not introduce new styling systems.

Note: the `.dc.html` files use a proprietary preview runtime (`support.js`) and won't render standalone — read them as annotated markup + logic references.

## Fidelity
**High-fidelity.** All colors, spacing, typography and copy are final and taken from the repo's own token system (`src/app/globals.css`, dark theme). Recreate pixel-perfectly using existing Tailwind tokens (`bg-surface-1`, `text-muted-foreground`, `bg-gradient-brand`, etc.) — the hex values below map 1:1 to existing CSS vars, so **use the tokens, not raw hexes**.

---

## 1. New logo mark — "Orbit" (1c)

Replaces the mark in `src/components/brand/logo.tsx` (`LogoMark`). Keep the gradient defs pattern (useId, primary→secondary) and the wordmark unchanged. New geometry (viewBox 0 0 32 32):

```svg
<circle cx="16" cy="16" r="10.5" fill="none" stroke="url(#grad)" stroke-width="2.8"/>
<circle cx="16" cy="16" r="3.4"  fill="url(#grad)"/>
<circle cx="24.6" cy="9.6" r="2.8" fill="var(--surface-behind-logo)" stroke="url(#grad)" stroke-width="2.4"/>
```

- Gradient: unchanged — `linearGradient x1=0 y1=32 x2=32 y2=0`, stops `hsl(var(--primary))` → `hsl(var(--secondary))`.
- The satellite's fill must match the surface behind the logo (`--background` on landing, `--surface-1` on the login panel). Use `fill="hsl(var(--background))"` or `currentColor` trickery per context — in the mock it's hardcoded per surface.
- Meaning: hub + core (the graph root) with a data satellite in orbit.
- Also update `src/app/icon.svg`, `favicon.ico`, `opengraph-image.tsx`, and the `LiveGraph` hub rendering (see §4).

## 2. Landing page — Screens & layout

Single page, max-width **1120px**, horizontal padding **24px**, background `--background` (#0A0A0C dark). Ambient wash: 820×480px ellipse, brand gradient, opacity 0.14, blur 80px, centered at top -160px.

### 2.1 Top nav
- Flex row space-between, padding 20px 24px.
- Left: Logo (mark 26px + wordmark 15px semibold; "Trust" in `--primary`, "Nomiks" in brand gradient text).
- Center: links 13px `--muted-foreground` → hover `--foreground`: Platform (#platform), Developers (#developers), Vision (#vision), **Whitepaper (disabled "SOON" state — see §6)**.
- Right: "Log in" outline button (h 32px, px 14, border `--border`, radius 8) → `/login`; "Launch app →" brand-gradient button (same size, font-weight 600) → `/dashboard`.

### 2.2 Hero
Grid `1.05fr 0.95fr`, gap 32px, padding 56px 24px 40px.

**Left column** (flex col, gap 26px):
- Live badge pill: border `rgba(secondary, .3)`, bg `surface-1/60` + blur, radius full, 12px text in gradient; 6px pulsing dot (`--secondary`, ping animation 1.6s). Copy: "The verifiable data layer for AI agents".
- H1: `clamp(36px, 4.6vw, 52px)`, weight 600, line-height 1.05, tracking -0.02em. "The Tokenomics<br/><gradient>Intelligence Graph.</gradient>"
- Paragraph: 16px/1.5 `--muted-foreground`, max-width 480px; highlighted spans in `--foreground`. Copy unchanged from current page.
- Capability pills (flex wrap, gap 8): "MCP server" (dot `--data-chain`), "REST + GraphQL API" (dot `--data-source`), "Machine-readable triples" (rotated square `--data-sector`), "On-chain provenance" (dot `--data-vesting`). Pill: border `--border`, bg `surface-1/70`, radius full, 12px.
- CTAs (flex, gap 12, each flex:1, h 52px, radius 10, 15px semibold, space-between with →):
  - "Explore trusted data" — brand gradient, glow `0 0 24px -6px rgba(primary,.5)` → `/login?intent=view`
  - "Contribute a token" — outline (border `--border`, bg `surface-1/70`) → `/login?intent=contribute`
- Goal counter (max-width 440px): row "The collective goal" (13px muted) / `{count} / 300 tokens structured` (mono, tabular-nums, count in gradient semibold). Progress bar h 6px, track `--surface-2`, fill brand gradient, width `count/300`. Caption 12px `--faint-foreground`: "Built on Intuition Protocol, curated by $TRUST." **Keep the existing `public_token_count` RPC + `useCountUp` wiring.**

**Right column**: `LiveGraph mode="hero"` (existing component), height 500px, with radial glow backdrop. **Change**: hub node now renders as the new logo (gradient ring, lineWidth ~4, r ~13, **plus a filled gradient core r ~4.2**) — see §4.

### 2.3 Value section (`id="platform"`, padding 64px 24px)
- Eyebrow centered, 12px, uppercase, tracking .14em, `--muted-foreground`: "From scattered docs to agent-ready intelligence".
- 4-col grid, gap 16. Card: border `--border`, radius 12, bg `--surface-1`, padding 24. Hover: border `--border-strong`, bg `--surface-2`, translateY(-3px), shadow `0 12px 32px -16px rgba(0,0,0,.6)`, transition 150–200ms.
- Card anatomy: 40×40 icon tile (radius 10, bg = accent at 14% alpha) containing a 12px glyph (circle, or square for "Feed agents") in the accent color with a small glow; h3 16px semibold; body 13.5px/1.55 muted.
- Cards (accent → copy): Structure (`--data-token`), Compare (`--data-allocation`), Verify (`--data-vesting`), Feed agents (`--data-chain`, square glyph). Copy identical to current page.

### 2.4 Ecosystem section (`id="developers"`, padding 64px 24px)
- Header: eyebrow "The TrustNomiks ecosystem"; h2 32px semibold "One graph. Every surface."; sub 15px muted, max-w 560px: "The app is the front door. Around it, the same verified graph is served to analysts, contributors and AI agents through open interfaces."
- Grid `1fr 1.2fr 1fr`, gap 16. Cards radius 14, padding 26, bg `--surface-1`.
- **Documentation** (disabled): opacity .75, non-clickable. Mono label `docs/` in `--data-source`; "SOON" pill; h3 "Documentation"; body copy in the mock; footer line "Available at launch" in `--faint-foreground`.
- **API & MCP server** (highlighted): border `rgba(primary,.35)` + glow `0 0 32px -12px`. Mono label `api/ · mcp/` in `--data-chain`; gradient-text tag "FOR AGENTS"; code block (bg `--background`, border `--border`, radius 10, mono 12px) showing an mcpServers JSON config; **waitlist form** (see §5).
- **Whitepaper** (disabled): same treatment as Documentation, mono label `paper/` in `--data-sector`.

### 2.5 Vision section (`id="vision"`, padding 64px 24px)
- Eyebrow "Where this is going"; h2 "From data layer to agent economy."
- 3-col grid. Each column: top border 1px `--border-strong`, padding-top 24. Row: mono index 01/02/03 in `--primary` + status tag 11px uppercase (Now `--success` / Next `--warning` / Ahead `--faint-foreground`). h3 17px semibold + body 13.5 muted:
  - 01 **Structure** — "300 tokens with complete, sourced tokenomics — one standardized ontology across supply, allocations, vesting and emissions."
  - 02 **Curate** — "Every claim published on Intuition and weighted by $TRUST staking — the community puts skin in the game on what's true."
  - 03 **Serve** — "AI agents, risk desks and protocols consume verified claims over MCP and API — trust as infrastructure, not a promise."

### 2.6 Community band
Card: border `rgba(primary,.3)`, radius 16, bg `--surface-1`, padding 48px 32px, centered, internal gradient bloom (600×300, opacity .12, blur 60). H2 28px "Built in the open. Curated by $TRUST."; sub 15px muted. CTAs: "Contribute a token →" (brand, h 44) → `/login?intent=contribute`; "Join the community" (outline, **disabled SOON state**).

### 2.7 Footer
Top border `--border`. 5-col grid `1.5fr 1fr 1fr 1fr 1fr`, gap 28, padding 48/24/32.
- Col 1: logo lockup (mark 22) + tagline 12.5px faint: "The verifiable tokenomics data layer for the agentic era. Built on Intuition Protocol."
- **Product**: Launch app → `/dashboard`; Explore the graph → `/login?intent=view`; Data Room → `/data-room`; Contribute → `/tokens/new`.
- **Developers**: "MCP server — waitlist" → `#developers`; Documentation (SOON).
- **Resources**: Whitepaper (SOON); Vision & roadmap → `#vision`; Intuition Protocol → `https://intuition.systems`; Blog (SOON).
- **Community**: Discord (SOON); X / Twitter (SOON); LinkedIn (SOON).
- Bottom row 12px faint: "© 2026 TrustNomiks" / tagline. Column heads: 11px semibold uppercase tracking .1em faint.

## 3. Login page
Structurally identical to the current `login/page.tsx` (all states preserved: mode tabs, intent copy, field validation, forgot password, resend confirmation, pending-confirmation view). Only change: **new logo mark**. The ambient `LiveGraph` hub also gets the ring+core treatment (§4).

## 4. LiveGraph hub change
In `live-graph.tsx` (canvas node paint), the `graph_root` node becomes the logo motif: gradient-stroked ring (stroke ≈ 4px at hero scale) **plus a filled gradient core** (~1/3 of ring radius). Keep glow/shadow as-is.

## 5. Waitlist (API & MCP card)
No backend exists yet. Implement with Supabase (already in stack):
- Table `waitlist (id uuid pk default gen_random_uuid(), email text not null, interest text default 'api-mcp', created_at timestamptz default now())`.
- RLS: enable; policy allowing **anonymous INSERT only** (no select/update/delete for anon).
- UI: email input (h 38, bg `--background`, border `--border`, radius 8, focus border `--primary`) + "Get notified" brand button. Client-side regex validation. On success swap form for confirmation box: border/bg `--success` at 30%/8% alpha, text `--success`, copy "You're on the list — we'll email you at launch." Helper text under form: "Be first to plug your agents in when the API & MCP server go live."

## 6. Disabled / "SOON" pattern
Used for every surface that doesn't exist yet (Docs, Whitepaper, Blog, Discord, X, LinkedIn, "Join the community"):
- Non-clickable (`<span>`/`cursor: default`), text at ~#55565E (between muted and faint), tiny pill "SOON" (9px semibold, tracking .08em, border `--border`, radius full, padding 1px 6px, color `--faint-foreground`).
- Ecosystem cards additionally get `opacity: .75` and a "Available at launch" footer line.
- Recommendation: drive these from one config object (e.g. `ecosystem = { docs: 'soon', mcp: 'waitlist', discord: 'soon', … }`) so flipping a surface live is a one-line change.

## Interactions & Behavior
- **Hero intro**: staggered fade-up on load (badge → h1 → paragraph → pills → CTAs → counter), 700ms, ease `cubic-bezier(0.22,1,0.36,1)`, 90ms stagger. Use WAAPI or the existing `StaggerReveal` pattern.
- **Scroll reveals**: value cards, ecosystem cards, vision columns, community band fade-up (22px, 650ms, same ease) on first intersection (threshold .12), 100ms stagger per sibling. Skip elements already in the viewport at load. **Honor `prefers-reduced-motion`** (skip entirely).
- **Card hover**: translateY(-3px) + shadow, 200ms.
- **Counter**: count-up 1600ms cubic ease-out on load (existing `useCountUp`).
- **Graph**: existing LiveGraph behavior (breathe, particles) unchanged apart from hub paint.
- Smooth-scroll for anchor links.

## State Management
Landing: `total` + `tokenNames` from existing RPCs (unchanged); waitlist form: `email`, `done` + Supabase insert. Login: unchanged from current implementation.

## Design Tokens
All from `src/app/globals.css` dark theme — no new tokens needed. Key mappings used in the mocks: background #0A0A0C, surface-1 #111114, surface-2 #18181C, surface-3 #202024, border #28282E, border-strong #3A3A42, foreground #FAFAFA, muted-foreground #A6A7AE, faint-foreground #7C7C84, primary #6366F1, secondary #8B5CF6, gradient 135deg primary→secondary, data-token #8B5CF6, data-allocation #F59E0B, data-vesting/success #10B981, data-source #3B82F6, data-chain #0EA5E9, data-sector #A855F7, warning #F59E0B. Type: Geist (400/600); mono = ui-monospace stack (Geist Mono when loaded); tabular-nums on all numerics.

## Assets
- `assets/Geist-Regular.ttf`, `assets/Geist-SemiBold.ttf` — copied from the repo (`src/assets/fonts/`); already available in-app via next/font.
- `assets/login-atmosphere.jpg` — copied from `public/backdrops/`; already in the repo.
- New logo = pure SVG (§1), no binary asset needed. Regenerate favicon/og-image from it.

## Files
- `Landing v2.dc.html` — landing page reference (template + logic incl. canvas graph, reveals, waitlist mock).
- `Login.dc.html` — login/signup reference.
- `Logo Explorations.dc.html` — the 5 logo directions; **1c "Orbit" is the chosen one**.
