# TrustNomiks — Brief Technique pour Claude Code / WindSurf

Copie-colle ce document dans ton IDE AI au début de ta première session de travail.
Ensuite, donne-lui les prompts un par un dans l'ordre (Section 5).

---

## 1. Contexte Projet

Tu travailles sur **TrustNomiks**, une web app permettant de saisir et structurer des données tokenomics (crypto) dans une base de données.

C'est un MVP "contributeur" : un seul utilisateur (admin) entre manuellement les données de ~300 tokens via un formulaire multi-étapes, les review, les valide, et peut les exporter au format JSON.

---

## 2. Stack Technique (déjà installé)

- **Framework** : Next.js 14 (App Router, TypeScript, src/ directory)
- **Styling** : Tailwind CSS
- **UI Components** : shadcn/ui (à installer au fur et à mesure avec `npx shadcn@latest add [component]`)
- **Formulaires** : React Hook Form + Zod
- **Base de données** : Supabase (PostgreSQL) — déjà configurée avec les tables
- **Auth** : Supabase Auth (email + password)
- **Déploiement** : Vercel (auto-deploy depuis GitHub)

Les variables d'environnement sont déjà configurées dans `.env.local` :
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

Le client Supabase est déjà créé dans `src/lib/supabase/client.ts` :
```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

---

## 3. Schéma Base de Données (déjà créé dans Supabase)

### Table `tokens`
```sql
id UUID PRIMARY KEY
name TEXT NOT NULL
ticker TEXT NOT NULL
chain TEXT
contract_address TEXT
tge_date DATE
category TEXT
status TEXT DEFAULT 'draft' -- 'draft' | 'in_review' | 'validated'
completeness INTEGER DEFAULT 0
notes TEXT
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
created_by UUID (FK → auth.users)
```

### Table `supply_metrics`
```sql
id UUID PRIMARY KEY
token_id UUID (FK → tokens, UNIQUE)
max_supply BIGINT
initial_supply BIGINT
tge_supply BIGINT
circulating_supply BIGINT
circulating_date DATE
source_url TEXT
notes TEXT
```

### Table `allocation_segments`
```sql
id UUID PRIMARY KEY
token_id UUID (FK → tokens)
segment_type TEXT -- 'team' | 'investors' | 'treasury' | 'liquidity' | 'community' | 'ecosystem' | 'rewards' | 'advisors' | 'public_sale' | 'private_sale' | 'other'
label TEXT
percentage DECIMAL(5,2)
token_amount BIGINT
wallet_address TEXT
notes TEXT
```

### Table `vesting_schedules`
```sql
id UUID PRIMARY KEY
allocation_id UUID (FK → allocation_segments, UNIQUE)
cliff_months INTEGER DEFAULT 0
duration_months INTEGER DEFAULT 0
frequency TEXT DEFAULT 'monthly' -- 'daily' | 'monthly' | 'yearly' | 'immediate' | 'custom'
hatch_percentage DECIMAL(5,2) DEFAULT 0
start_date DATE
notes TEXT
```

### Table `emission_models`
```sql
id UUID PRIMARY KEY
token_id UUID (FK → tokens, UNIQUE)
type TEXT -- 'fixed_cap' | 'inflationary' | 'deflationary' | 'burn_mint' | 'rebase' | 'other'
annual_inflation_rate DECIMAL(5,2)
inflation_schedule JSONB
has_burn BOOLEAN DEFAULT false
burn_details TEXT
has_buyback BOOLEAN DEFAULT false
buyback_details TEXT
notes TEXT
```

### Table `data_sources`
```sql
id UUID PRIMARY KEY
token_id UUID (FK → tokens)
source_type TEXT -- 'whitepaper' | 'docs' | 'on_chain' | 'dao_proposal' | 'announcement' | 'api' | 'other'
url TEXT
document_name TEXT
version TEXT
verified_at DATE
notes TEXT
```

### Table `risk_flags`
```sql
id UUID PRIMARY KEY
token_id UUID (FK → tokens)
flag_type TEXT -- 'high_investor_concentration' | 'high_team_concentration' | 'aggressive_emission' | 'short_team_vesting' | 'high_tge_unlock' | 'governance_concentration' | 'no_vesting_insiders' | 'other'
severity TEXT -- 'low' | 'medium' | 'high' | 'critical'
is_flagged BOOLEAN DEFAULT false
justification TEXT
threshold_value TEXT
actual_value TEXT
assessed_by TEXT DEFAULT 'Nomiks'
assessed_at DATE
```

### Table `profiles`
```sql
id UUID PRIMARY KEY
user_id UUID (FK → auth.users, UNIQUE)
display_name TEXT
role TEXT DEFAULT 'admin' -- 'admin' | 'curator' | 'viewer'
organization TEXT DEFAULT 'Nomiks'
```

Row Level Security est activé sur toutes les tables. Les policies autorisent tous les CRUD pour les utilisateurs authentifiés.

---

## 4. Design & UX Guidelines

### Style général
- **Dark mode** par défaut (thème sombre, inspiré des dashboards crypto/DeFi)
- Palette : fond très sombre (#0A0A0F ou similaire), accents en bleu/violet (#6366F1 indigo ou #8B5CF6 violet), texte blanc/gris clair
- Police : Inter (déjà dans Next.js par défaut)
- Design clean et minimal, pas de surcharge visuelle
- Utiliser les composants shadcn/ui autant que possible

### Layout de l'app (une fois authentifié)
- **Sidebar gauche** fixe (largeur ~250px) avec :
  - Logo/titre "TrustNomiks" en haut
  - Navigation : Dashboard, Tokens, Export, Settings
  - Info utilisateur en bas
- **Zone principale** à droite avec le contenu de la page
- **Header** dans la zone principale avec le titre de la page et les actions

### Pages à construire
```
/login                    → Page de connexion (email + password)
/dashboard                → Dashboard avec stats + liste des tokens
/tokens/new               → Formulaire multi-étapes (création token)
/tokens/[id]              → Fiche token (vue lecture détaillée)
/tokens/[id]/edit         → Édition d'un token existant
/export                   → Export JSON Triples
```

---

## 5. Prompts à Donner dans l'Ordre

### ── PROMPT 1 : Layout + Auth ──

```
Construis le layout de base et l'authentification pour l'app TrustNomiks.

1. Installe les composants shadcn/ui nécessaires (button, input, card, label, separator, avatar, dropdown-menu, sheet, sidebar si disponible).

2. Crée une page de login `/login` avec :
   - Un formulaire email + mot de passe centré sur la page
   - Bouton "Se connecter" et lien "Créer un compte"
   - Un mode inscription (toggle entre login et signup)
   - Utilise Supabase Auth (signInWithPassword et signUp)
   - Après connexion réussie, redirige vers /dashboard
   - Crée aussi un profil dans la table `profiles` lors de l'inscription

3. Crée un layout authentifié `/dashboard/layout.tsx` (ou un layout global protégé) avec :
   - Vérification de session Supabase — redirige vers /login si pas connecté
   - Une sidebar gauche fixe avec : logo "TrustNomiks", liens de navigation (Dashboard, Tokens, Export, Settings), bouton de déconnexion en bas
   - Zone de contenu principale à droite
   - Dark mode par défaut

4. Crée un middleware Next.js pour protéger les routes (tout sauf /login doit être authentifié).

5. Crée un client Supabase côté serveur dans `src/lib/supabase/server.ts` pour les Server Components.

Le design doit être en dark mode, clean, avec la palette indigo/violet pour les accents.
```

### ── PROMPT 2 : Dashboard ──

```
Construis la page Dashboard `/dashboard/page.tsx` pour TrustNomiks.

Elle doit afficher :

1. **4 cartes de stats en haut** :
   - Total Tokens (nombre total dans la table tokens)
   - Validés (status = 'validated')
   - En Review (status = 'in_review')
   - Brouillons (status = 'draft')
   Chaque carte avec un nombre grand et un label. Icônes avec lucide-react.

2. **Barre de progression** : X/300 tokens saisis (avec pourcentage)

3. **Bouton "Ajouter un Token"** bien visible, qui redirige vers /tokens/new

4. **Table des tokens** avec les colonnes :
   - Token (name + ticker)
   - Chain
   - Complétude (barre de progression 0-100%)
   - Status (badge coloré : draft=gris, in_review=jaune, validated=vert)
   - Date de création
   - Action (lien vers la fiche token)
   
   La table doit :
   - Se charger depuis Supabase (table `tokens`)
   - Être triable par colonnes
   - Avoir un champ de recherche (filtre par name ou ticker)
   - Avoir des filtres par status
   - Pagination si > 20 tokens

Utilise les composants shadcn/ui : Card, Table, Badge, Input, Button, Progress.
Toutes les données viennent de Supabase. Si la table est vide, affiche un état vide avec un CTA "Ajouter votre premier token".
```

### ── PROMPT 3 : Formulaire Token — Étapes 1 et 2 ──

```
Construis le formulaire de création de token `/tokens/new/page.tsx` pour TrustNomiks.

Architecture :
- Un composant Stepper en haut qui montre les 6 étapes : Identité, Supply, Allocations, Vesting, Émission, Sources
- L'étape active est mise en surbrillance
- Navigation entre étapes avec boutons Précédent/Suivant
- Sauvegarde en base à chaque passage d'étape (le token est créé en brouillon dès l'étape 1)
- Utilise React Hook Form avec Zod pour la validation

ÉTAPE 1 — Identité du Token :
- Nom du projet (required) — text input
- Ticker (required) — text input, uppercase auto
- Blockchain — select/combobox avec options courantes : Ethereum, Solana, Arbitrum, Optimism, Base, Polygon, BNB Chain, Avalanche, Starknet, Other
- Adresse du contrat — text input (optionnel)
- Date du TGE — date picker (optionnel)
- Catégorie — select : Infrastructure, DeFi, Gaming, Social, AI, DePIN, L1, L2, Other
- Notes — textarea (optionnel)

Au clic "Suivant" :
- Valide les champs required
- Crée le token dans Supabase (table `tokens`) avec status='draft'
- Redirige vers l'étape 2 avec le token_id en state/URL

ÉTAPE 2 — Supply Metrics :
- Max Supply — number input (grand nombre)
- Initial Supply — number input (optionnel)
- TGE Supply — number input (optionnel)
- Circulating Supply — number input (optionnel)
- Date du circulating — date picker (si circulating renseigné)
- URL source — text input (optionnel)

Au clic "Suivant" :
- Sauvegarde dans Supabase (table `supply_metrics`, lié au token_id)
- Passe à l'étape 3

Les nombres doivent accepter les grands montants (milliards) et s'afficher avec des séparateurs de milliers.
Utilise les composants shadcn/ui.
```

### ── PROMPT 4 : Formulaire Token — Étape 3 (Allocations) ──

```
Construis l'étape 3 du formulaire de création de token : Allocations.

C'est un tableau dynamique où l'utilisateur ajoute des segments d'allocation.

Fonctionnalités :
1. **Tableau avec les colonnes** :
   - Type (select : team, investors, treasury, liquidity, community, ecosystem, rewards, advisors, public_sale, private_sale, other)
   - Label (text input, nom personnalisé ex: "Early Backers")
   - Pourcentage du Max Supply (number input, %)
   - Token Amount (calculé automatiquement : percentage × max_supply / 100, affiché en lecture seule, formaté avec séparateurs)
   - Wallet Address (text input, optionnel)
   - Bouton supprimer la ligne [×]

2. **Bouton "+ Ajouter un segment"** en bas du tableau

3. **Validation en temps réel** :
   - Afficher la somme des % en haut : "Total : XX%" 
   - Si total = 100% → badge vert ✅
   - Si total ≠ 100% → badge warning orange ⚠️ avec le delta
   - On peut quand même passer à l'étape suivante (certains tokens ont des allocations incomplètes dans les docs)
   - Chaque pourcentage doit être entre 0 et 100

4. Le **Token Amount** se calcule automatiquement à partir du max_supply (récupéré de l'étape 2 via Supabase).

Au clic "Suivant" :
- Sauvegarde tous les segments dans Supabase (table `allocation_segments`)
- Passe à l'étape 4

Au clic "Précédent" :
- Sauvegarde l'état actuel
- Retourne à l'étape 2
```

### ── PROMPT 5 : Formulaire Token — Étape 4 (Vesting) ──

```
Construis l'étape 4 du formulaire de création de token : Vesting Schedules.

Cette étape reprend automatiquement les segments d'allocation créés à l'étape 3, et pour chacun, permet de renseigner un vesting schedule.

Affichage :
- Liste des segments (un par un, ou en tableau)
- Pour chaque segment, afficher :
  - Nom du segment (label ou segment_type) — en lecture seule
  - Pourcentage — en lecture seule
  - Cliff (mois) — number input, défaut 0
  - Durée totale de vesting (mois) — number input, défaut 0
  - Fréquence — select : daily, monthly, yearly, immediate, custom
  - Hatch % (% libéré au TGE) — number input entre 0 et 100, défaut 0
  - Date de début — date picker, optionnel (par défaut = TGE date du token)
  - Notes — text input, optionnel

Comportement :
- Si fréquence = "immediate" → cliff, durée et hatch sont auto-remplis (cliff=0, durée=0, hatch=100%)
- Pré-remplir les segments qui sont typiquement immédiats (community airdrops, liquidity) avec immediate/100%

Au clic "Suivant" :
- Sauvegarde chaque vesting schedule dans Supabase (table `vesting_schedules`, lié à l'allocation_id)
- Passe à l'étape 5
```

### ── PROMPT 6 : Formulaire Token — Étapes 5 et 6 + Fin ──

```
Construis les étapes 5 et 6 du formulaire de création de token, plus la page de confirmation.

ÉTAPE 5 — Emission Model :
- Type d'émission (required) — select : fixed_cap, inflationary, deflationary, burn_mint, rebase, other
- Taux d'inflation annuel — number input (%, optionnel, grisé si type = fixed_cap)
- Schedule d'inflation — champ optionnel, permettre d'ajouter des lignes "Year X : Y%" (stocker en JSONB)
- Mécanisme de burn — toggle boolean + text input pour les détails si oui
- Programme de buyback — toggle boolean + text input pour les détails si oui
- Notes — textarea

Sauvegarde dans table `emission_models`.

ÉTAPE 6 — Sources :
- Tableau dynamique (comme allocations) pour ajouter des sources
- Chaque ligne :
  - Type de source — select : whitepaper, docs, on_chain, dao_proposal, announcement, api, other
  - Nom du document — text input
  - URL — text input
  - Version — text input (optionnel)
  - Date de vérification — date picker (optionnel)
- Bouton "+ Ajouter une source"
- Au moins 1 source recommandée (warning si 0 mais pas bloquant)

Sauvegarde dans table `data_sources`.

PAGE DE FIN :
Après l'étape 6, affiche une page récapitulative avec :
- Résumé du token (identité, supply, nombre de segments, nombre de sources)
- Score de complétude calculé (voir les critères ci-dessous)
- Bouton "Voir la fiche token" → redirige vers /tokens/[id]
- Bouton "Ajouter un autre token" → redirige vers /tokens/new

Score de complétude (sauvegarder dans tokens.completeness) :
- Identité complète (name + ticker + chain) : +10
- Contract address renseigné : +5
- TGE date renseigné : +5
- Supply (au moins max_supply + 1 autre) : +15
- Allocations (≥3 segments ET somme = 100%) : +20
- Vesting (renseigné pour chaque segment non-immédiat) : +20
- Emission model (type + au moins 1 détail) : +10
- Sources (au moins 1) : +10
- Risk flags évalués (au moins 1) : +5
Total possible : 100
```

### ── PROMPT 7 : Fiche Token (vue lecture) ──

```
Construis la page de fiche token `/tokens/[id]/page.tsx` pour TrustNomiks.

C'est une page de lecture qui affiche toutes les données d'un token de manière structurée et lisible.

Layout :
- Header avec : nom du token + ticker, badge de status (draft/in_review/validated avec couleurs), score de complétude (barre), chain, bouton "Modifier" → /tokens/[id]/edit

- Section Identité : contract address, TGE date, catégorie

- Section Supply : max supply, initial supply, TGE supply, circulating supply (avec date). Tous formatés avec séparateurs de milliers.

- Section Allocations : 
  - Barre horizontale empilée colorée (chaque segment = une couleur, proportionnel au %)
  - En dessous, liste des segments avec : type, label, %, token amount, wallet
  
- Section Vesting :
  - Pour chaque segment : "Label : Xm cliff → Ym linear frequency (Z% TGE)"
  - Format lisible, pas un tableau brut

- Section Émission :
  - Type, taux d'inflation, schedule, burn, buyback

- Section Risk Flags :
  - Liste des flags avec icônes (⚠️ flagged, ✅ clear)
  - Severity en couleur
  - Justification

- Section Sources :
  - Liste avec type, nom, URL cliquable, date de vérification

- Actions en bas :
  - Bouton "Changer le status" : dropdown avec les transitions possibles (draft→in_review, in_review→validated, validated→in_review, etc.)
  - Bouton "Exporter JSON Triples" (exporte ce token au format Intuition)
  - Bouton "Supprimer" (avec confirmation)

Charger toutes les données depuis Supabase avec les jointures nécessaires.
```

### ── PROMPT 8 : Export JSON Triples ──

```
Construis la page d'export `/export/page.tsx` et la fonction d'export au format Intuition Triples.

Créer une fonction utilitaire `src/lib/utils/triples-export.ts` qui prend un token (avec toutes ses relations) et le convertit en tableau de Triples au format :

{
  "subject": "string",
  "predicate": "string", 
  "object": "string | number | boolean | object"
}

Règles de conversion :
- Token identity → subject = ticker, predicates = "has Max Supply", "has Chain", "has TGE Date", etc.
- Allocations → subject = ticker, predicate = "has Allocation Segment", object = "Allocation_{ticker}_{segmentType}"
  Puis pour chaque segment : subject = "Allocation_{ticker}_{segmentType}", predicates = "percentage Of Max Supply", "token Amount", "segment Type"
- Vesting → subject = "Allocation_{ticker}_{segmentType}", predicate = "has Vesting Schedule", object = "Vesting_{ticker}_{segmentType}_v1"
  Puis pour chaque schedule : subject = "Vesting_{ticker}_{...}", predicates = "cliff Months", "duration Months", "vesting Frequency", "hatch Percentage"
- Emission → similar pattern
- Risk flags → subject = ticker, predicate = "has Risk Flag", object = "RiskFlag_{flagType}"
- Sources → subject = ticker, predicate = "has Data Source", object = "DataSource_{ticker}_{sourceType}"

Page `/export` :
- Liste de tous les tokens validés avec checkbox
- Bouton "Sélectionner tout"
- Bouton "Exporter les sélectionnés" → génère un fichier JSON téléchargeable
- Aperçu du JSON avant téléchargement (collapsible)
- Afficher le nombre total de triples générés
```

---

## 6. Conseils pour l'AI IDE

- Installe les composants shadcn/ui au fur et à mesure : `npx shadcn@latest add button card input table badge progress select tabs separator dropdown-menu dialog alert toast`
- Si tu as une erreur Supabase "row level security", c'est que l'utilisateur n'est pas authentifié — vérifie le middleware
- Pour les grands nombres (supply, token amounts), utilise le type `bigint` en DB mais `number` en TypeScript — attention aux overflow au-delà de 2^53
- N'oublie pas d'installer `react-hook-form`, `@hookform/resolvers`, et `zod` pour les formulaires
- Pour le dark mode shadcn/ui, configure le thème dans `tailwind.config.ts` et `globals.css`
