# Agent operating notes — TrustNomiks

_Read by Claude Code (`CLAUDE.md`) and Codex (`AGENTS.md`, a symlink to this file). Personal workflow rules live in the git-ignored `CLAUDE.local.md`. Product overview, features, data model, and setup: see [README.md](README.md)._

**Stack (actual versions):** Next.js 16 App Router + RSC · React 19 · TypeScript (strict) · Tailwind 4 + shadcn/ui (new-york, slate). Web3: Intuition SDK (`@0xintuition/*`) + wagmi + viem + RainbowKit. Data: TanStack Query, react-hook-form + Zod, recharts, react-force-graph-2d. Tests: Vitest.

## Commands (Node 20+, npm 10+)

- `npm run dev` (→ localhost:3000) · `npm run build` · `npm run lint` (ESLint 9) · `npm test` (Vitest run) · `npm run test:watch`
- Intuition ops (run via `npx tsx --env-file=.env.local`): `npm run intuition:pin-predicates` · `intuition:verify-registry` · `intuition:republish-status` · `intuition:verify-reads` · `intuition:audit-predicates` · `intuition:mint-missing-predicates`

**Before declaring done:** run `npm run lint` **and** `npm test`; for UI/route changes, `npm run build` must pass. Report real output. CI (`.github/workflows/ci.yml`) runs lint + test + build on every push and PR — keep it green.

## Repository map

- `src/app` — landing + login, `(authenticated)/{dashboard, tokens, tokens/new, tokens/[id], data-room, token-house, profile, export}`, `api/{coingecko, intuition, knowledge-graph}` route handlers
- `src/middleware.ts` — deny-by-default auth (everything protected except `/` and `/login`)
- `src/components/{ui, composite, patterns, brand, charts, intuition, knowledge-graph}` — reuse before creating
- `src/lib/{supabase, intuition, coingecko, knowledge-graph, design, utils}` — core logic; unit tests are colocated (`*.test.ts`)
- `src/features/{data-room, studio}` · `src/hooks` · `src/types` · `src/config/wagmi.ts`
- `supabase/migrations/` — versioned schema, source of truth, apply in chronological order
- `docs/redesign/` — design-system proposal + governance (README + 00..08)

## Session journal (all agents)

- `tasks/journal.md` (git-ignored, newest first) is the cross-session log. Read the top entries before starting work — Claude Code injects them at session start via hook; other agents (Codex…) must read the file.
- After completing any significant unit of work (anything worth a commit: feature, fix, refactor, audit), append an entry at the TOP before ending the session. ≤15 lines: date, agent/model, what was done, state (pushed/applied?), what's next, gotchas.
- `tasks/todo.md` = active plan · `tasks/lessons.md` = rules learned from user corrections.

## UI & design system (BINDING)

All UI work must follow `docs/redesign/DESIGN-RULES.md` (the "Data Observatory" design language). Read it before touching any screen or component. Non-negotiables in brief: dark-first (`:root`=light, `.dark`=dark, `defaultTheme="dark"`, never invert); all colors come from CSS tokens in `src/app/globals.css` (no hardcoded hex, no `bg-[#...]`); same color = same concept via the `--data-*` taxonomy (graph space), kept separate from allocation-segment colors (`getChartColor`); the only JS↔CSS color bridge is `src/lib/design/tokens.ts`; Geist + Geist Mono with `.tabular` on every number; surfaces via `bg-surface-*`; the indigo→violet brand gradient used sparingly; one global `:focus-visible` ring; color always paired with a glyph/icon (AA, non-color cue); motion honors `prefers-reduced-motion`; never use the em-dash character in copy (empty values render as "Not set"); copy presents TrustNomiks, with Intuition credited only as the underlying rail. Reuse existing components in `src/components/{ui,composite,patterns,brand}`; add missing primitives via `npx shadcn@latest add <name>`, never hand-roll Radix. Reference screens: landing `src/app/page.tsx`, dashboard, token detail. Aliases: `@/components`, `@/lib`, `@/components/ui`, `@/hooks`.

## Supabase / security

- RLS is mandatory on every table; any new table ships its policies in the same migration. Latest audit: `docs/rls-audit-*.md` — read it before schema work.
- Browser client = `src/lib/supabase/client.ts`, server = `src/lib/supabase/server.ts`. Never bypass RLS or expose the service-role key (only `scripts/republish-status.ts` reads it, locally via `--env-file=.env.local`).
- Schema changes go through versioned files in `supabase/migrations/`.

## On-chain / Web3

Intuition writes (atoms, triples, vaults, $TRUST staking) must follow the `intuition` skill in `.claude/skills/intuition/` for correct transactions. Never expose private keys; wallet flows are client-side via wagmi/RainbowKit.

## Secrets

`.env.local` is git-ignored — never commit it or hardcode keys. Required vars are in `.env.example` (tracked). `NEXT_PUBLIC_*` vars are public by design (the anon key is RLS-protected).

## Repo

`git@github.com:intuition-box/TrustNomiks.git`, default branch `main`.
