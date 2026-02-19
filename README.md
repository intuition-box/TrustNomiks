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

The app is a functional MVP serving as the data collection and structuring layer for the TrustNomiks graph. It provides a 6-step guided form for submitting comprehensive token data, a dashboard for monitoring progress, detailed token pages, and export capabilities.

**Target:** 300 tokens with complete tokenomics data.

---

## Data Model

The app structures tokenomics data across 8 tables, mapping directly to the TrustNomiks ontology:

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

### Domain Taxonomies

**Allocation Segments:** `funding-private` · `funding-public` · `team-founders` · `treasury` · `marketing` · `airdrop` · `rewards` · `liquidity`

**Token Categories:** `open-digital-economy` · `payment` · `two-sided-market` · `infrastructure` · `financial`

Sectors are constrained to their parent category. Both UI and DB-level CHECK constraints enforce consistency.

---

## App Features

### Token Submission (6-step form)

1. **Identity** — name, ticker, chain, contract, TGE date, category/sector (guided selection)
2. **Supply** — max supply, initial supply, TGE supply, circulating supply
3. **Allocations** — dynamic table with real-time percentage validation (must sum to 100%)
4. **Vesting** — per-segment schedules: cliff, duration, frequency, hatch %
5. **Emission** — model type, inflation schedule, burn/buyback mechanisms
6. **Sources** — provenance tracking with document type, URL, and verification date

### Dashboard

- Token count by status (draft / in review / validated)
- Progress tracker toward database population goal
- Sortable, searchable, filterable token table
- Completeness scoring (0–100%) per token

### Token Detail Pages

- Full read view of all token data
- Stacked allocation bar chart
- Status management (draft → in review → validated)
- Per-token JSON Triples export

### Export

- Batch export of validated tokens to **Intuition-compatible JSON Triples**
- Preview before download
- Triple count summary

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js (App Router, TypeScript) |
| UI | Tailwind CSS + shadcn/ui (Radix primitives) |
| Forms | react-hook-form + Zod validation |
| Database | Supabase (PostgreSQL) + Row Level Security |
| Auth | Supabase Auth (email + password) |
| Deployment | Vercel (auto-deploy from GitHub) |

---

## Project Structure

```
src/
  app/
    login/                          # Authentication
    (authenticated)/
      dashboard/                    # Main dashboard
      tokens/new/                   # 6-step token form
      tokens/[id]/                  # Token detail + edit
      export/                       # JSON Triples export
  components/
    authenticated-shell.tsx         # Layout + navigation
    token-form-stepper.tsx          # Multi-step form engine
    ui/                             # shadcn/ui components
  lib/
    supabase/client.ts              # Browser Supabase client
    supabase/server.ts              # Server Supabase client
    utils/triples-export.ts         # Intuition Triples formatter
  types/
    form.ts                         # Zod schemas + form types
    token.ts                        # Token domain types
supabase/
  migrations/                       # Versioned schema migrations
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
```

Create `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### Run

```bash
npm run dev          # Development server → http://localhost:3000
npm run build        # Production build
npm run lint         # ESLint check
```

---

## Database Migrations

Migrations are versioned in `supabase/migrations/` and serve as the source of truth for schema history, even when executed manually via SQL Editor.

| Migration | Description |
|---|---|
| `20260219_replace_quarterly_with_yearly_in_vesting_frequency` | Updates vesting frequency enum (yearly replaces quarterly) |
| `20260219_update_allocation_segment_types` | Normalizes allocation segment taxonomy + CHECK constraints |
| `20260219_add_sector_to_tokens_and_refresh_category_taxonomy` | Adds sector field + category/sector parent-child constraints |

Execution order matters — run in chronological order.

---

## Roadmap

### Phase 1 — Data Population ✅ In Progress

Populate the database with real tokenomics data for 300 tokens. Ongoing enrichment via the app interface covering vesting schedules, emission models, sources, and risk flags.

### Phase 2 — Visualization & Analytics

Build dashboards that demonstrate the value of structured tokenomics data:

- **Allocation charts** — pie/bar charts comparing token distribution across projects
- **Emission curves** — visual supply schedules over time
- **Filtering & comparison** — filter tokens by category, sector, allocation profile, risk flags
- **Portfolio-level views** — aggregate metrics across token selections

### Phase 3 — Intuition Protocol Integration

Optimize the data export pipeline for production ingestion into the Intuition knowledge graph:

- Refine JSON Triples format based on Intuition SDK requirements
- Implement batch claim creation via Intuition API
- Enable $TRUST staking signals on published claims
- Build provenance chain linking each claim to its source document

### Future Explorations

- **Natural language queries** — LLM interface to query the tokenomics database conversationally (e.g., "Find DeFi tokens with <10% team allocation and >$30M TVL")
- **Real-time data feeds** — connect to market data APIs for live circulating supply and pricing
- **Community curation** — open the platform to external curators who can submit, verify, and challenge claims
