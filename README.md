# TrustNomiks

**Tokenomics Intelligence Graph — built on [Intuition Protocol](https://intuition.systems)**

TrustNomiks transforms fragmented tokenomics data (whitepapers, DAO proposals, on-chain records) into a structured, verifiable, and machine-readable knowledge graph. Every data point — supply, allocations, vesting, emissions — is represented as a sourced claim, ready to be curated and weighted by staking in **$TRUST**.

---

## Why TrustNomiks?

Tokenomics data today is fragmented across whitepapers, PDFs, landing pages, and DAO proposals. Sources are inconsistent, formats are non-standard, and none of it is machine-readable. This makes due diligence slow, risk assessment unreliable, and automation nearly impossible.

TrustNomiks solves this by providing:

- A **standardized ontology** for tokenomics data (Atoms & Triples)
- A **contributor interface** to collect and structure token data at scale
- A **JSON Triples export** aligned with Intuition's knowledge graph format

---

## Current Status

The app is the data collection and structuring layer for the TrustNomiks graph: a guided structuring studio for submitting comprehensive token data, a dashboard for monitoring progress, detailed token pages, a Data Room for side-by-side comparison, an interactive knowledge-graph view, and a Publish & Export pipeline targeting the Intuition knowledge graph.

**Target:** 300 tokens with complete tokenomics data.

---

## Data Model

Core tables (see `supabase/migrations/` for the authoritative, versioned schema):

| Table | Purpose | Key Fields |
|---|---|---|
| `tokens` | Core token identity | name, ticker, chain, category, sector, TGE date |
| `supply_metrics` | Supply data points | max supply, initial supply, TGE supply, circulating |
| `allocation_segments` | Token distribution breakdown | segment type, percentage, token amount, wallet |
| `vesting_schedules` | Unlock schedules per segment | cliff, duration, frequency, hatch % |
| `emission_models` | Token issuance model | type, inflation rate, burn/buyback mechanisms |
| `data_sources` | Provenance tracking | source type, URL, document, verification date |
| `risk_flags` | Risk signals | flag type, severity, justification, thresholds |
| `profiles` | User identity | display name, role, organization |

Supporting tables cover claim provenance (`claim_sources`), Intuition publish-run tracking, and knowledge-graph views.

### Domain Taxonomies

**Allocation Segments:** `funding-private` · `funding-public` · `team-founders` · `treasury` · `marketing` · `airdrop` · `rewards` · `liquidity`

**Token Categories:** `open-digital-economy` · `payment` · `two-sided-market` · `infrastructure` · `financial`

Sectors are constrained to their parent category. Both UI and DB-level CHECK constraints enforce consistency.

---

## App Features

- **Token structuring studio** — guided submission covering identity, supply, allocations (real-time validation, must sum to 100%), vesting, emission, and sources, with autosave
- **Dashboard** — status counts (draft / in review / validated), progress toward the 300-token goal, sortable/searchable token table, per-token completeness scoring (0–100%)
- **Token detail pages** — full read view, allocation charts, status management, per-token JSON Triples export
- **Data Room** — side-by-side token comparison
- **Knowledge graph** — interactive graph view of tokens and their claims
- **Publish & Export** — batch export of validated tokens to Intuition-compatible JSON Triples, plus on-chain publishing via the Intuition SDK with per-run tracking

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, RSC) · React 19 · TypeScript (strict) |
| UI | Tailwind CSS 4 + shadcn/ui (Radix primitives), recharts, react-force-graph-2d |
| Data & forms | TanStack Query, react-hook-form + Zod |
| Database | Supabase (PostgreSQL) + Row Level Security |
| Auth | Supabase Auth (email + password) |
| Web3 | Intuition SDK (`@0xintuition/*`), wagmi, viem, RainbowKit |
| Testing | Vitest |
| Deployment | Vercel (auto-deploy from GitHub) |

---

## Project Structure (high level)

```
src/
  app/                      # Landing, login, error/loading states
    (authenticated)/        # dashboard, tokens (list / new / [id]), data-room,
                            #   token-house, profile, export
    api/                    # coingecko, intuition, knowledge-graph route handlers
  middleware.ts             # Deny-by-default auth guard
  components/               # ui/ (shadcn), composite/, patterns/, brand/,
                            #   charts/, intuition/, knowledge-graph/
  features/                 # data-room/, studio/
  hooks/
  lib/                      # supabase/, intuition/, coingecko/, knowledge-graph/,
                            #   design/, utils/  (unit tests colocated)
  types/
scripts/                    # Intuition ops scripts (npx tsx --env-file=.env.local)
supabase/migrations/        # Versioned schema — apply in chronological order
docs/                       # Design system (docs/redesign/), audits, runbooks
```

---

## Local Development

### Prerequisites

- Node.js 20+
- npm 10+
- A Supabase project with the schema provisioned

### Setup

```bash
npm install
cp .env.example .env.local   # then fill in real values
```

### Run

```bash
npm run dev          # Development server → http://localhost:3000
npm run build        # Production build
npm run lint         # ESLint check
npm test             # Vitest unit tests
```

Intuition ops: `npm run intuition:pin-predicates` · `intuition:verify-registry` · `intuition:republish-status` (this one requires `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`).

---

## Database Migrations

Migrations are versioned in `supabase/migrations/` and are the source of truth for schema history, even when executed manually via the Supabase SQL Editor. Apply them in chronological (filename) order. Every new table must ship with its RLS policies in the same migration.

---

## Roadmap

### Phase 1 — Data Population 🚧 In Progress

Populate the database with real tokenomics data for 300 tokens. Ongoing enrichment via the app interface covering vesting schedules, emission models, sources, and risk flags.

### Phase 2 — Visualization & Analytics 🚧 In Progress

Dashboards that demonstrate the value of structured tokenomics data: allocation charts, emission curves, filtering and side-by-side comparison (Data Room), portfolio-level views.

### Phase 3 — Intuition Protocol Integration 🚧 In Progress

Production ingestion into the Intuition knowledge graph: the in-app publish pipeline creates claims via the Intuition SDK. Remaining: $TRUST staking signals on published claims and a full provenance chain linking each claim to its source document.

### Future Explorations

- **Natural language queries** — LLM interface to query the tokenomics database conversationally (e.g., "Find DeFi tokens with <10% team allocation and >$30M TVL")
- **Real-time data feeds** — connect to market data APIs for live circulating supply and pricing
- **Community curation** — open the platform to external curators who can submit, verify, and challenge claims

---

## Agent Tooling

This repo is agent-friendly: [`CLAUDE.md`](CLAUDE.md) (Claude Code) and `AGENTS.md` (Codex — a symlink to `CLAUDE.md`) carry the operating notes: verification gates, design-system rules, and security invariants. CI runs lint, tests, and build on every push and pull request.
