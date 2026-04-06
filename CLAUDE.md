# TrustNomiks

TrustNomiks is a Next.js 16 SaaS application for tokenomics data management. Users create and curate comprehensive token records through a 6-step guided form. The data is visualized as allocation charts, vesting timelines, and a semantic knowledge graph aligned with the Intuition Protocol.

---

## Commandes

```bash
npm run dev         # Serveur de développement (port 3000)
npm run build       # Build de production
npm run start       # Serveur de production
npm run lint        # ESLint (config Next.js, pas d'overrides custom)
npm run test        # Vitest run (single pass)
npm run test:watch  # Vitest watch
```

Tests dans `src/**/*.test.ts`. Couvrent : validation des schémas de formulaire, scoring de complétude, construction du knowledge graph, export de triples. L'environnement Vitest est `node` (pas de DOM).

---

## Stack technique

| Couche | Technologie |
|---|---|
| Framework | Next.js 16.1.6, React 19.2.3, TypeScript 5 |
| Database/Auth | Supabase (PostgreSQL + RLS) via `@supabase/ssr` |
| Styling | Tailwind CSS 4, variables CSS pour le thème |
| Composants UI | shadcn/ui style `new-york`, Radix UI, Lucide icons |
| Formulaires | React Hook Form 7 + Zod 4 (`@hookform/resolvers`) |
| Charts | Recharts 3, react-force-graph-2d |
| Toasts | Sonner (configuré dans le root layout, `richColors`, `top-right`) |
| Dates | date-fns 4, react-day-picker 9 |
| Tests | Vitest 4.1.0 |

Alias de chemin : `@/*` → `./src/*`

## Variables d'environnement

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

Pas de clé secrète Supabase côté serveur — l'app s'appuie sur RLS et les RPCs `SECURITY DEFINER` pour l'autorisation.

---

## Structure du projet

```
src/
  app/
    (authenticated)/          # Route group — toutes les pages protégées
      layout.tsx              # Auth guard : redirige vers /login si pas d'user
      dashboard/              # Stats, cluster completeness, knowledge graph card
      tokens/
        page.tsx              # Registre de tokens (liste, filtres, tri)
        new/page.tsx          # Formulaire de création 6 étapes ('use client', très grand fichier)
        [id]/page.tsx         # Vue détail token (lecture seule, changement de statut, suppression)
      token-house/            # Workspace pour l'analyse d'assets visuels
      export/                 # Export bulk de tokens validés en JSON triples
      profile/
    api/
      knowledge-graph/route.ts  # GET — construit le graphe sémantique depuis les vues SQL
      coingecko/
        search/route.ts         # Proxy de la recherche CoinGecko
        price/route.ts          # Données de prix en live
        resolve/route.ts        # Résolution des métadonnées par coingecko_id
    login/                    # Page d'authentification
    layout.tsx                # Root layout : ThemeProvider + Toaster
    page.tsx                  # Redirige vers /dashboard
    globals.css               # Tailwind base + CSS variable theme tokens
  components/
    ui/                       # Composants shadcn/ui de base (30+)
    knowledge-graph/          # graph-canvas, graph-toolbar, graph-detail-panel, graph-legend,
                              #   dashboard-knowledge-graph-card
    charts/                   # Wrappers Recharts : donut alloc, bar supply, unlock timeline
    token-house/              # Composants workspace Token House
    authenticated-shell.tsx   # Sidebar + mobile nav shell ; état sidebar via useSyncExternalStore
    token-form-stepper.tsx    # Composant indicateur d'étapes
    sidebar-nav.tsx
    mobile-nav.tsx
    token-price-card.tsx      # Affichage prix live CoinGecko
    coingecko-search.tsx      # Combobox avec recherche CoinGecko live
    user-menu.tsx
  hooks/
    use-knowledge-graph.ts    # Fetch /api/knowledge-graph ; gère abort, clé de cache
    use-coingecko-search.ts
  lib/
    supabase/
      client.ts               # createBrowserClient (utiliser dans les composants 'use client')
      server.ts               # createServerClient avec cookies() (server components / API routes)
    knowledge-graph/
      build-graph.ts          # Fonction pure : atoms + triples + sources → {nodes, edges}
      graph-types.ts          # NodeFamily, NodeType, GraphNode, GraphEdge, types canoniques
      node-config.ts
    coingecko/
      chain-map.ts
      rate-limiter.ts         # Sliding-window : 25 req/min (marge de sécurité tier gratuit)
    utils/
      completeness.ts         # ClusterScores, computeScores(), CLUSTER_MAX, CLUSTER_LABELS
      vesting-timeline.ts     # Timeline de déverrouillage mois par mois pour les charts
      triples-export.ts       # convertTokenToTriples(), downloadTriplesAsJSON()
      asset-readiness.ts      # Quels cluster scores sont requis par asset visuel
      chart-colors.ts
    utils.ts                  # Utilitaire cn() (clsx + tailwind-merge)
  types/
    token.ts                  # Token, TokenStatus, TokenFilters, SortField
    form.ts                   # TOUS les schémas Zod + types + constantes d'options (grand fichier)
    auth.ts
    knowledge-graph.ts        # KnowledgeGraphParams, KnowledgeGraphResponse
    coingecko.ts
  middleware.ts               # Rafraîchissement session + logique de redirection pour toutes les routes
supabase/
  migrations/                 # Nommées par date : YYYYMMDD_description.sql (12 migrations, fév–mars 2026)
docs/
  rls-audit-20260321.md       # Suivi des tables avec des politiques RLS confirmées
```

---

## Authentification & Middleware

`src/middleware.ts` s'exécute sur chaque route non-statique :
1. Rafraîchit la session Supabase via `createServerClient`.
2. Redirige les utilisateurs non-authentifiés vers `/login`.
3. Redirige les utilisateurs authentifiés hors de `/login` vers `/dashboard`.

Le layout `(authenticated)` double-vérifie l'auth avec `supabase.auth.getUser()` côté serveur et rend `<AuthenticatedShell>`.

Toujours utiliser `@/lib/supabase/server` dans les server components et API route handlers. Toujours utiliser `@/lib/supabase/client` dans les composants `'use client'`.

---

## Architecture du formulaire (création token 6 étapes)

Le formulaire de création à `src/app/(authenticated)/tokens/new/page.tsx` est un seul grand fichier `'use client'`. Chaque étape a son propre schéma Zod et instance `useForm` :

| Étape | Schéma | Contrainte clé |
|---|---|---|
| 1 — Identity | `tokenIdentitySchema` | le secteur doit appartenir à la catégorie choisie |
| 2 — Supply | `supplyMetricsSchema` | max ≥ initial ≥ TGE supply ; cross-field via `superRefine` |
| 3 — Allocations | `allocationsSchema` | les pourcentages doivent totaliser exactement 100% (±0.01) |
| 4 — Vesting | `vestingSchedulesSchema` | cliff ≤ duration ; TGE% + cliff unlock% ≤ 100% |
| 5 — Emission | `emissionModelSchema` | emission type est requis |
| 6 — Sources | `dataSourcesSchema` | les champs URL doivent être des URLs valides |

Tous les schémas, tableaux d'enums, constantes d'options et fonctions de formatage sont dans `src/types/form.ts`. Pour ajouter de nouveaux types de champs ou valeurs d'enum, mettre à jour `form.ts` et ajouter les helpers `normalize*` + `format*` correspondants.

Les champs numériques de supply sont stockés en **strings** dans l'état du formulaire (virgules autorisées, ex. `"1,000,000"`) et parsés en nombres uniquement à la validation/soumission.

---

## Scoring par clusters

`src/lib/utils/completeness.ts` définit le modèle de clusters :
- **identity** — max 20 pts (name + ticker + chain = 10, contract address = 5, TGE date = 5)
- **supply** — max 15 pts (max_supply = 10, initial ou TGE supply = 5)
- **allocation** — max 20 pts (≥3 segments = 10, somme = 100% = 10)
- **vesting** — max 20 pts (n'importe quel vesting schedule = 20)
- **extras** — emission type (5), emission detail (5), ≥1 source (10)

Total max : 100. Stocké dans `tokens.completeness` et `tokens.cluster_scores`. La DB stocke les scores via des RPCs `SECURITY DEFINER` ; `computeScores()` dans le code client est utilisé pour la prévisualisation en temps réel dans le formulaire.

---

## Base de données & RPCs

Les migrations sont nommées par date : `YYYYMMDD_description.sql`. Toujours suivre cette convention.

Les étapes 2–6 du formulaire sauvegardent via des RPCs transactionnels (`SECURITY DEFINER`) plutôt que des inserts directs :
- `save_supply_metrics_tx`
- `save_allocations_tx`
- `save_vesting_schedules_tx`
- `save_emission_model_tx`
- `save_data_sources_tx`

Chaque RPC utilise un **verrouillage optimiste** via `p_expected_updated_at` / `tokens.updated_at`. Un code d'erreur `serialization_failure` signifie qu'une autre session a modifié le token en même temps.

L'étape 1 (identity) sauvegarde directement dans `tokens` avec une vérification de propriété côté client.

Le knowledge graph est servi via trois vues SQL : `kg_atoms_v1`, `kg_triples_v1`, `kg_triple_sources_v1` (définies dans `20260322_knowledge_graph_views.sql`).

**Statut RLS** (voir `docs/rls-audit-20260321.md`) : seule `claim_sources` a des politiques de migration locales confirmées. La table `tokens` et les tables enfants s'appuient sur des politiques configurées depuis le dashboard Supabase ou les vérifications de propriété des RPCs.

---

## Knowledge Graph

Le graphe modélise les données token comme des triples sémantiques alignés avec l'Intuition Protocol :
- **atom** nodes — entités domaine (token, allocation, vesting, emission, data_source, category, sector, chain)
- **triple** nodes — relations réifiées (nœuds de premier ordre, pas juste des arêtes)
- **source** nodes — provenance (data sources)
- **hub** node — racine synthétique `graph:trustnomiks`

Prédicats d'arête : `belongs_to_graph`, `subject_of`, `object_of`, `justified_by`.

`buildGraph()` dans `src/lib/knowledge-graph/build-graph.ts` est une fonction pure. La route API `/api/knowledge-graph` met en cache les réponses 5 minutes dans un `Map` au niveau module. Le hook `useKnowledgeGraph` gère les abort controllers pour éviter les réponses obsolètes.

---

## Intégration CoinGecko

Trois routes API proxy sous `/api/coingecko/`. Le rate limiter (`src/lib/coingecko/rate-limiter.ts`) applique 25 req/min (tier gratuit CoinGecko = 30). C'est une sliding window en mémoire au niveau module — elle se réinitialise au redémarrage du serveur et ne se coordonne pas entre plusieurs instances.

---

## Conventions UI

- Tout le styling via **Tailwind CSS**. Pas de fichiers CSS custom sauf `globals.css`.
- Utiliser `cn()` de `@/lib/utils` pour la fusion conditionnelle de classes.
- Les composants shadcn/ui sont dans `src/components/ui/`. Ne pas éditer les fichiers shadcn générés directement — les composer ou les wrapper.
- Pour ajouter un composant shadcn : `npx shadcn@latest add <component>` (respecte `components.json` : style `new-york`, base color `slate`, CSS variables activées).
- Icônes : Lucide React uniquement.
- Toasts : `import { toast } from 'sonner'` — appeler `toast.success()`, `toast.error()`, etc.
- Thème : `next-themes` avec `defaultTheme="light"` et `enableSystem={false}`. Dark mode basé sur les classes.
- État sidebar : persisté dans `localStorage` clé `trustnomiks:sidebar-collapsed`, synchronisé via `useSyncExternalStore`.

---

## Localisation des enums/constantes clés

Toutes les valeurs d'enum métier sont dans `src/types/form.ts` :
- `CATEGORY_OPTIONS`, `SECTOR_OPTIONS` — avec `normalizeCategory()`, `normalizeSector()`
- `SEGMENT_TYPES`, `SEGMENT_TYPE_OPTIONS` — avec `normalizeSegmentType()`
- `VESTING_FREQUENCIES` — noter que `quarterly` est normalisé en `yearly` (migration legacy)
- `EMISSION_TYPE_OPTIONS`
- `SOURCE_TYPE_OPTIONS`
- `BLOCKCHAIN_OPTIONS`
- `FORM_STEPS` — id/nom/description de chaque étape

Les définitions de couleurs par cluster sont dupliquées entre `src/lib/utils/completeness.ts` (valeurs Tailwind string) et `src/app/(authenticated)/dashboard/page.tsx` (variantes indicator/dot/text complètes). Pour ajouter un nouveau cluster, mettre à jour les deux.

---

## Gotchas

- `src/app/(authenticated)/tokens/new/page.tsx` est extrêmement grand (formulaire 6 étapes complet). Pour travailler sur une étape spécifique, chercher le commentaire de section de l'étape ou le nom du schéma plutôt que de lire tout le fichier.
- Les champs numériques supply sont des strings dans tout l'état du formulaire. Parser avec `Number(value.replace(/,/g, ''))` avant tout calcul arithmétique.
- `normalizeVestingFrequency()` mappe la valeur legacy `quarterly` → `yearly`. Ne pas rajouter `quarterly` comme nouvelle option.
- La relation `category` ↔ `sector` est hiérarchique : chaque secteur appartient exactement à une catégorie. `isSectorCompatibleWithCategory()` l'applique. Le formulaire valide que si l'un est défini, les deux doivent l'être et être compatibles.
- La route API knowledge graph utilise un cache au niveau module (`Map`). En développement avec hot reload, ce cache est éphémère. En production, il persiste pour la durée de vie du processus serveur.
- Le rate limiter CoinGecko est aussi au niveau module. Sur des déploiements serverless, chaque instance a son propre compteur — la limite effective par déploiement sera donc supérieure à 25 req/min.
- La page détail token (`[id]/page.tsx`) effectue les changements de statut et suppressions via des appels Supabase client directs avec seulement une vérification de propriété côté client — elle n'utilise pas les RPCs transactionnels.
- L'environnement Vitest est `node`, donc les APIs navigateur (`document`, `window`, `URL.createObjectURL`) sont indisponibles dans les tests. `downloadTriplesAsJSON()` ne peut pas être testé en unit test tel quel.
