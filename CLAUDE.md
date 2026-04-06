# TrustNomiks

Application SaaS de gestion de tokenomics — permet de créer et gérer des données complètes sur les tokens crypto avec un workflow guidé en 6 étapes, visualisation par knowledge graph, et intégration CoinGecko.

## Stack technique

- **Framework:** Next.js 16 + React 19 + TypeScript 5
- **Base de données / Auth:** Supabase (PostgreSQL + RLS) via `@supabase/ssr`
- **UI:** Tailwind CSS 4, shadcn/ui (style new-york, Radix UI), Lucide icons
- **Formulaires:** React Hook Form 7 + Zod 4
- **Charts:** Recharts 3, react-force-graph-2d (knowledge graph)
- **Tests:** Vitest 4
- **Dates:** date-fns 4, react-day-picker 9
- **Alias de chemin:** `@/*` → `./src/*`

## Commandes

```bash
npm run dev          # Serveur de développement
npm run build        # Build de production
npm run lint         # ESLint
npm run test         # Tests Vitest (run once)
npm run test:watch   # Tests Vitest (watch mode)
```

## Variables d'environnement

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

## Structure du projet

```
src/
  app/
    (authenticated)/      # Routes protégées (middleware auth)
      dashboard/          # Page principale avec scoring par clusters
      tokens/             # Liste des tokens (registre)
      tokens/[id]/        # Détail token avec charts et market data
      tokens/new/         # Formulaire de création 6 étapes
      token-house/        # Workspace d'analyse de tokens
      profile/            # Profil utilisateur
      export/             # Export bulk de tokens validés
    api/
      knowledge-graph/    # GET /api/knowledge-graph (cache 5min)
      coingecko/
        search/           # GET ?q= — recherche de tokens
        price/            # GET ?id= — prix en temps réel
        resolve/          # GET ?address=&chain= — résolution adresse
    login/                # Page d'authentification
    layout.tsx            # Layout racine
    page.tsx              # Redirige vers /dashboard
    error.tsx             # Error boundary global
  components/
    ui/                   # Composants shadcn/ui (30+)
    knowledge-graph/      # graph-canvas, graph-toolbar, graph-detail-panel, graph-legend
    charts/               # Recharts : donut alloc, bar supply, unlock timeline
    token-house/          # Composants workspace Token House
    authenticated-shell.tsx   # Layout principal avec sidebar
    token-form-stepper.tsx    # Stepper 6 étapes
    sidebar-nav.tsx
    mobile-nav.tsx
  hooks/
    use-knowledge-graph.ts    # Fetch graph avec AbortController
    use-coingecko-search.ts   # Recherche avec debounce
  lib/
    supabase/
      client.ts           # Client navigateur
      server.ts           # Client serveur (cookies SSR)
    knowledge-graph/
      build-graph.ts      # Construction du graphe sémantique
      graph-types.ts
      node-config.ts
    coingecko/
      chain-map.ts        # Mapping blockchain → CoinGecko platform
      rate-limiter.ts     # Rate limiting API CoinGecko
    utils/
      completeness.ts     # Scoring 4 clusters (identity/supply/allocation/vesting)
      vesting-timeline.ts # Calcul des schedules de vesting
      triples-export.ts   # Export Intuition Triples (RDF)
      asset-readiness.ts  # Métriques de validation
      chart-colors.ts     # Palette de couleurs cohérente
    utils.ts              # cn(), helpers généraux
  types/
    token.ts              # Interfaces domaine Token
    form.ts               # Schémas Zod + types formulaires (source de vérité)
    auth.ts
    knowledge-graph.ts
    coingecko.ts
  middleware.ts            # Rafraîchissement session Supabase + redirections auth
supabase/
  migrations/             # Migrations SQL nommées YYYYMMDD_description.sql
docs/
  rls-audit-20260321.md   # Audit RLS (Row-Level Security)
```

## Architecture et patterns clés

### Authentification
- `src/middleware.ts` rafraîchit la session Supabase sur chaque requête
- Routes non-auth redirigent vers `/login`, `/login` redirige vers `/dashboard` si déjà connecté
- Toutes les routes sous `(authenticated)/` sont protégées

### Formulaire token 6 étapes
Défini dans `src/types/form.ts` (schémas Zod) et `src/components/token-form-stepper.tsx` :
1. **Identity** — nom, ticker, chain, catégorie, secteur
2. **Supply Metrics** — max/initial/circulating/TGE supply (accepte les nombres avec virgules)
3. **Allocations** — segments avec pourcentages (doivent totaliser 100%, tolérance 0.01%)
4. **Vesting Schedules** — cliff, durée, fréquence, TGE%, cliff unlock%
5. **Emission Model** — type, taux d'inflation, burn, buyback
6. **Data Sources** — whitepaper, docs, données on-chain, etc.

### Scoring par clusters
`src/lib/utils/completeness.ts` calcule un score 0-100% pour 4 clusters :
- **Identity** : nom, ticker, chain, catégorie, secteur
- **Supply** : max, initial, circulating, TGE supply
- **Allocation** : segments avec pourcentages
- **Vesting** : schedules de déverrouillage

### Knowledge Graph (Intuition Protocol)
- Vues Supabase projettent les tables relationnelles en atoms/triples sémantiques
- Préfixes UUID : `atom:token:`, `atom:alloc:`, etc.
- Triples avec provenance (claim_group, origin_table, origin_row_id)
- Export via `src/lib/utils/triples-export.ts`

### Supabase / Base de données
- Sauvegardes transactionnelles via RPCs (`SECURITY DEFINER`)
- Pas de RLS directe visible en local — dépend de la config Supabase remote
- Migrations datées en `supabase/migrations/`
- Client navigateur : `src/lib/supabase/client.ts`
- Client serveur (SSR) : `src/lib/supabase/server.ts`

### Composants UI
- Toujours préférer les composants existants dans `src/components/ui/` (shadcn)
- Pour ajouter un composant shadcn : `npx shadcn@latest add <component>`
- Thème : variables CSS HSL, dark mode via classe `.dark`
- Icônes : Lucide React uniquement

## Tests

Tests unitaires dans `src/**/*.test.ts` couvrant :
- `src/types/form.test.ts` — validation des schémas Zod (boundary conditions, comma numbers, cross-field)
- `src/lib/knowledge-graph/build-graph.test.ts` — construction du graphe
- `src/lib/utils/completeness.test.ts` — scoring
- `src/lib/utils/triples-export.test.ts` — format d'export

Run : `npm run test`

## Conventions

- **Styling :** Tailwind uniquement, pas de CSS custom sauf `globals.css`
- **Types :** Zod schemas dans `src/types/form.ts` sont la source de vérité pour les types formulaires
- **Migrations DB :** Nommage `YYYYMMDD_description.sql`
- **Server vs Client :** Marquer `'use client'` uniquement quand nécessaire (hooks, interactivité). Layouts et pages = Server Components par défaut
- **Toasts :** Utiliser `sonner` (import depuis `@/components/ui/sonner`)
- **Erreurs :** Error boundaries Next.js (`error.tsx`) + Sonner pour feedback utilisateur
