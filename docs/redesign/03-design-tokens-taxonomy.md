# Design Tokens, Nomenclature & Taxonomy

I have the three source files confirmed. The graph taxonomy is 16 hardcoded hexes, `globals.css` is stock shadcn HSL with light default and orphaned smoke keyframes, and `chart-colors.ts` is a separate 8-color segment palette that collides (indigo=hub/rewards, teal=export/airdrop). I have everything needed. Producing the governance document now.

---

# TrustNomiks Design System — Tokens, Nomenclature & Taxonomy

> **Status:** Governance layer (v1). This is the single source of truth for every design value and every component name in TrustNomiks. Author once here; consume everywhere via CSS variables and the typed accessors in §6. No raw hex, no magic px, no ad-hoc color map may ship after this lands.
>
> **Direction implemented:** dark-first, OKLCH-authored, two-tier color, graph taxonomy promoted to first-class data tokens, one Tailwind v4 `@theme` layer collapsing the three legacy palettes (`globals.css` HSL vars + `chart-colors.ts` hex + `node-config.ts` hex).

---

## 0. Reading guide

| You want to… | Go to |
|---|---|
| Understand the naming law | §1 |
| Get raw values (color/space/type/etc.) | §2 |
| Paste working CSS into `globals.css` | §3 |
| Name a component / file / variant / prop | §4 |
| Map a node type → color/icon/shape | §5 |
| Wire the typed accessors (`getDataColor`, `getChartColor`) | §6 |
| Migrate off the 3 legacy palettes | §7 |

---

## 1. Token architecture & naming convention

### 1.1 Three tiers (strict dependency direction)

```
PRIMITIVE  →  SEMANTIC  →  COMPONENT
(raw)         (role)        (part)
```

- **Tier 1 — Primitive (`--tnk-{family}-{scale}`).** Raw, context-free values: color ramps, the spacing scale, the type scale, raw radii/durations. **Never referenced directly in a component or className.** Primitives only feed semantics.
- **Tier 2 — Semantic (`--{role}` / `--{role}-{modifier}`).** What a value *means* in the UI: `--background`, `--surface-2`, `--foreground`, `--border`, `--primary`, `--success`, `--data-token`, `--status-validated`. **This is the layer the app reads** (directly, or via shadcn's `@theme` mapping). Themes (`.dark`, `:root`) only ever reassign **semantic** tokens to different **primitives**.
- **Tier 3 — Component (`--{component}-{part}-{state?}`).** Optional, used only when a primitive part of a component needs to deviate from a semantic alias (e.g. `--sidebar-bg`, `--stake-slider-track`, `--graph-canvas-bg`). Component tokens reference **semantic** tokens, falling back to primitives only for one-off chrome.

> **Hard rule:** a token may only reference its own tier or one tier **up** (Component→Semantic→Primitive). A component never reads a primitive. A semantic never reads a component. This keeps theming a one-layer operation.

### 1.2 The naming convention (documented)

```
--tnk-<family>-<scale>           PRIMITIVE   (prefixed, never in markup)
--<role>                         SEMANTIC    (unprefixed — shadcn-compatible)
--<role>-<modifier>              SEMANTIC variant
--data-<category>                SEMANTIC    (graph taxonomy → see §5)
--data-<category>-<modifier>     SEMANTIC    (-soft / -ring / -on)
--<component>-<part>[-<state>]   COMPONENT
```

Rules:
1. **lowercase-kebab-case** only. No camelCase, no caps, no underscores.
2. **Primitives are namespaced `--tnk-`**; semantics are bare so they drop into shadcn/Radix conventions unchanged.
3. **Family** = the conceptual group: `indigo`, `violet`, `slate`, `amber`, `space`, `text`, `radius`, `dur`, `ease`, `z`, `shadow`.
4. **Scale** = numeric step. Color ramps use **50→950** (Tailwind convention). Spacing/type/radius use **t-shirt or numeric** steps defined in §2.
5. **Modifiers** are a closed vocabulary: `-foreground` (text/icon resting on the role), `-soft` (low-alpha/tinted fill), `-ring` (focus/selection), `-hover`, `-active`, `-muted`, `-on` (the readable text color to place *on* a data color). Never invent a modifier outside this list without adding it here.
6. **State suffixes** (component tier only): `-hover`, `-active`, `-focus`, `-disabled`, `-selected`.
7. **No semantic value may be a literal color in markup.** If you typed `#` or `bg-[…]` in a component, you broke the system.

### 1.3 Value-format law

- **All colors authored in OKLCH** at the primitive tier (perceptually uniform ramps, predictable dark/light luminance). Semantics reference primitives via `var()`.
- shadcn aliases are exposed through `@theme inline` so existing `bg-primary`, `text-muted-foreground`, etc. keep working.
- Numbers that scale (space, radius, type) live as primitives and are surfaced as Tailwind theme keys so `p-4`, `rounded-lg`, `text-lg` resolve to **our** scale.

---

## 2. Concrete token sets

### 2.1 Color — primitive ramps (OKLCH)

Brand ramps are anchored on the two DNA hexes (`#6366F1` indigo, `#8B5CF6` violet) and extended. Data ramps reuse the exact 16 taxonomy hues from `node-config.ts`, re-expressed in OKLCH so they tune per-theme.

| Family | Anchor | Role |
|---|---|---|
| `indigo` (brand-1) | `#6366F1` | graph-root / primary |
| `violet` (brand-2) | `#8B5CF6` | token / secondary |
| `slate` (neutral) | `#64748B` | chrome, surfaces, text |
| `emerald` | `#10B981` | success / vesting |
| `amber` | `#F59E0B` | warning / allocation |
| `red` | `#EF4444` | destructive / emission |
| `orange` | `#F97316` | risk |
| `blue` | `#3B82F6` | info / source |
| `teal` | `#14B8A6` | export |
| `sky` | `#0EA5E9` | chain |
| `purple` | `#A855F7` | sector |

Each ramp ships steps `50 100 200 300 400 500 600 700 800 900 950`. The full `--tnk-*` declarations are in §3 (the paste block) — values there are canonical; this table is the index.

### 2.2 Spacing scale (4px base, `--tnk-space-*` → Tailwind `spacing`)

| Token | rem | px | Use |
|---|---|---|---|
| `space-0` | 0 | 0 | reset |
| `space-px` | — | 1 | hairline |
| `space-0_5` | 0.125 | 2 | icon nudge |
| `space-1` | 0.25 | 4 | tightest gap |
| `space-2` | 0.5 | 8 | inline gap, chip padding |
| `space-3` | 0.75 | 12 | control padding-y |
| `space-4` | 1 | 16 | **base** card/section padding |
| `space-5` | 1.25 | 20 | — |
| `space-6` | 1.5 | 24 | card padding (comfortable) |
| `space-8` | 2 | 32 | block separation |
| `space-10` | 2.5 | 40 | — |
| `space-12` | 3 | 48 | section gap |
| `space-16` | 4 | 64 | page gutter |
| `space-20` | 5 | 80 | hero rhythm |
| `space-24` | 6 | 96 | hero rhythm |

> Keeps Tailwind's default numeric API (`p-4`, `gap-6`) but pins it to a documented 4px grid. Half-steps (`0_5`, `1_5`) only where listed.

### 2.3 Radius scale (`--radius` base = 0.625rem / 10px)

| Token | calc | px | Use |
|---|---|---|---|
| `--radius-xs` | `calc(var(--radius) - 6px)` | 4 | badges, inputs-sm, chips |
| `--radius-sm` | `calc(var(--radius) - 4px)` | 6 | inputs, small buttons |
| `--radius-md` | `calc(var(--radius) - 2px)` | 8 | buttons, default control |
| `--radius-lg` | `var(--radius)` | 10 | cards, popovers |
| `--radius-xl` | `calc(var(--radius) + 4px)` | 14 | feature cards, dialogs |
| `--radius-2xl` | `calc(var(--radius) + 12px)` | 22 | hero panels, sheets |
| `--radius-full` | `9999px` | — | pills, avatars, node glyphs |

> Bumped base from the stock `0.5rem` to `0.625rem` — a touch softer reads more premium against dark surfaces while staying tight enough for dense tables.

### 2.4 Typography scale

**Families** (load via `next/font`, expose as `--tnk-font-*`):

| Token | Stack | Use |
|---|---|---|
| `font-sans` | **Geist** → Inter → system-ui | all UI text |
| `font-mono` | **Geist Mono** → ui-monospace | addresses, hashes, triples, token amounts |
| `font-display` | Geist (tight tracking) | hero / display only |

**Type steps** (`--tnk-text-*`; `size / line-height / tracking / weight`):

| Token | size | line | tracking | weight | Use |
|---|---|---|---|---|---|
| `text-display` | 3.25rem / 52px | 1.05 | -0.02em | 600 | landing hero |
| `text-h1` | 2rem / 32px | 1.15 | -0.015em | 600 | page title |
| `text-h2` | 1.5rem / 24px | 1.2 | -0.01em | 600 | section |
| `text-h3` | 1.25rem / 20px | 1.3 | -0.005em | 600 | card title |
| `text-lg` | 1.125rem / 18px | 1.5 | 0 | 500 | lead |
| `text-base` | 1rem / 16px | 1.5 | 0 | 400 | body |
| `text-sm` | 0.875rem / 14px | 1.45 | 0 | 400 | secondary / table |
| `text-xs` | 0.75rem / 12px | 1.4 | 0.01em | 500 | labels, badges |
| `text-caption` | 0.6875rem / 11px | 1.3 | 0.02em | 500 | metadata, axis ticks |

> **Numeric law:** every number (supply, %, stake, counts) renders with `font-variant-numeric: tabular-nums`. Ship a `.tabular` utility and apply it on all data cells/KPIs. Addresses/hashes/triple-IDs use `font-mono`.

### 2.5 Shadow / elevation ladder

Elevation is **surface lightness + shadow**, not shadow alone (shadows are nearly invisible on dark, so surface lift carries the hierarchy — see `--surface-1/2/3` in §3).

| Token | Light value | Dark value | Use |
|---|---|---|---|
| `--shadow-none` | `none` | `none` | flush |
| `--shadow-xs` | `0 1px 2px oklch(0 0 0 / .05)` | `0 1px 2px oklch(0 0 0 / .4)` | inputs, chips |
| `--shadow-sm` | `0 1px 3px oklch(0 0 0 / .08), 0 1px 2px oklch(0 0 0 / .06)` | `0 1px 3px oklch(0 0 0 / .5)` | cards (resting) |
| `--shadow-md` | `0 4px 12px oklch(0 0 0 / .08)` | `0 4px 14px oklch(0 0 0 / .55)` | dropdowns, hover-lift |
| `--shadow-lg` | `0 12px 32px oklch(0 0 0 / .12)` | `0 16px 40px oklch(0 0 0 / .6)` | popovers, dialogs |
| `--shadow-xl` | `0 24px 60px oklch(0 0 0 / .16)` | `0 28px 70px oklch(0 0 0 / .7)` | hero / command palette |
| `--glow-brand` | `0 0 0 1px var(--primary), 0 0 24px -4px var(--primary)` | same | primary CTA, live-graph set-piece |
| `--glow-data` | `0 0 0 1px var(--ring-color), 0 0 20px -6px var(--ring-color)` | same | **stake-as-mass** node halo / selected node |

### 2.6 Motion tokens

| Token | Value | Use |
|---|---|---|
| `--dur-instant` | `80ms` | hover/press feedback |
| `--dur-fast` | `120ms` | tooltips, small toggles |
| `--dur-base` | `200ms` | default transition, view swaps |
| `--dur-slow` | `320ms` | drawers, dialogs, accordions |
| `--dur-slower` | `480ms` | hero / graph reveal |
| `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | entrances (decisive) |
| `--ease-in` | `cubic-bezier(0.4, 0, 1, 1)` | exits (faster) |
| `--ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` | moves/reorders |
| `--ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | node spawn / stake swell |
| `--stagger-ingest` | `64ms` | per-item delay in "indexing" reveals |

> **Law:** entrances use `--ease-out`, exits `--ease-in` and one step faster. Workflow surfaces cap at `--dur-base`. Expressive motion (`--dur-slower`, spring) only where no task is blocked: hero, first graph reveal, "indexing complete". All of it sits behind `prefers-reduced-motion` (see §3).

### 2.7 Z-index scale (`--tnk-z-*`)

| Token | Value | Layer |
|---|---|---|
| `z-base` | 0 | document flow |
| `z-graph-ui` | 10 | controls floating over the canvas |
| `z-sticky` | 20 | sticky headers, form stepper rail |
| `z-sidebar` | 30 | app sidebar |
| `z-dropdown` | 40 | menus, selects, comboboxes |
| `z-overlay` | 50 | dialog/sheet scrim |
| `z-modal` | 60 | dialog/sheet content |
| `z-popover` | 70 | popovers, hovercards |
| `z-toast` | 80 | sonner |
| `z-command` | 90 | ⌘K palette |
| `z-tooltip` | 100 | tooltips (always on top) |

### 2.8 Breakpoints (match Tailwind v4 defaults; documented for layout intent)

| Token | min-width | Layout intent |
|---|---|---|
| `sm` | 640px | stack → 2-col cards |
| `md` | 768px | sidebar collapses to icons below this |
| `lg` | 1024px | full sidebar + 3-band dashboard |
| `xl` | 1280px | graph + inspector drawer side-by-side |
| `2xl` | 1536px | max content `--container-max: 1440px` |

---

## 3. Ready-to-paste Tailwind v4 / shadcn block

> Drop-in replacement for `src/app/globals.css`. Implements dark-first (`:root` **is** dark; `.light` opts out), OKLCH primitives, semantic + data + status tokens, the scales above, and the `@theme inline` mapping that keeps every existing shadcn className working. Promotes graph keyframes; deletes the orphaned `smoke-*`.

```css
@import "tailwindcss";

@custom-variant dark (&:where(.dark, .dark *));

/* ============================================================
   TIER 1 — PRIMITIVES  (--tnk-*)  never used directly in markup
   ============================================================ */
:root {
  /* Brand: indigo (graph-root / primary) — anchor #6366F1 */
  --tnk-indigo-50:  oklch(0.970 0.014 277);
  --tnk-indigo-100: oklch(0.936 0.032 277);
  --tnk-indigo-200: oklch(0.876 0.060 277);
  --tnk-indigo-300: oklch(0.806 0.095 277);
  --tnk-indigo-400: oklch(0.730 0.140 277);
  --tnk-indigo-500: oklch(0.658 0.178 277);   /* ≈ #6366F1 */
  --tnk-indigo-600: oklch(0.590 0.196 277);
  --tnk-indigo-700: oklch(0.515 0.182 277);
  --tnk-indigo-800: oklch(0.440 0.150 277);
  --tnk-indigo-900: oklch(0.375 0.118 277);
  --tnk-indigo-950: oklch(0.275 0.085 277);

  /* Brand: violet (token / secondary) — anchor #8B5CF6 */
  --tnk-violet-50:  oklch(0.972 0.016 303);
  --tnk-violet-100: oklch(0.943 0.035 303);
  --tnk-violet-200: oklch(0.890 0.068 303);
  --tnk-violet-300: oklch(0.820 0.110 303);
  --tnk-violet-400: oklch(0.740 0.155 303);
  --tnk-violet-500: oklch(0.665 0.190 303);   /* ≈ #8B5CF6 */
  --tnk-violet-600: oklch(0.600 0.205 303);
  --tnk-violet-700: oklch(0.525 0.190 303);
  --tnk-violet-800: oklch(0.450 0.158 303);
  --tnk-violet-900: oklch(0.385 0.125 303);
  --tnk-violet-950: oklch(0.285 0.090 303);

  /* Neutral: slate (chrome / surfaces / text) — anchor #64748B */
  --tnk-slate-50:  oklch(0.984 0.003 248);
  --tnk-slate-100: oklch(0.968 0.005 248);
  --tnk-slate-200: oklch(0.929 0.009 248);
  --tnk-slate-300: oklch(0.869 0.013 248);
  --tnk-slate-400: oklch(0.711 0.020 248);   /* ≈ #94A3B8 triple/predicate/literal */
  --tnk-slate-500: oklch(0.586 0.024 248);   /* ≈ #64748B category */
  --tnk-slate-600: oklch(0.487 0.026 248);   /* ≈ #475569 wallet */
  --tnk-slate-700: oklch(0.398 0.024 256);
  --tnk-slate-800: oklch(0.293 0.022 256);
  --tnk-slate-850: oklch(0.235 0.018 258);
  --tnk-slate-900: oklch(0.197 0.016 258);
  --tnk-slate-950: oklch(0.146 0.013 258);
  --tnk-black:     oklch(0.118 0.012 258);

  /* Data ramps — 500 = exact taxonomy hue from node-config.ts */
  --tnk-emerald-400: oklch(0.808 0.150 162);
  --tnk-emerald-500: oklch(0.724 0.160 162);  /* #10B981 vesting / success */
  --tnk-emerald-600: oklch(0.640 0.150 162);
  --tnk-amber-400:   oklch(0.840 0.150 79);
  --tnk-amber-500:   oklch(0.769 0.160 70);   /* #F59E0B allocation / warning */
  --tnk-amber-600:   oklch(0.690 0.155 64);
  --tnk-red-400:     oklch(0.710 0.180 25);
  --tnk-red-500:     oklch(0.637 0.208 25);   /* #EF4444 emission / destructive */
  --tnk-red-600:     oklch(0.577 0.215 27);
  --tnk-orange-400:  oklch(0.760 0.160 52);
  --tnk-orange-500:  oklch(0.705 0.180 49);   /* #F97316 risk */
  --tnk-orange-600:  oklch(0.646 0.185 44);
  --tnk-blue-400:    oklch(0.710 0.150 256);
  --tnk-blue-500:    oklch(0.623 0.190 259);  /* #3B82F6 source / info */
  --tnk-blue-600:    oklch(0.546 0.215 263);
  --tnk-teal-400:    oklch(0.780 0.115 184);
  --tnk-teal-500:    oklch(0.704 0.130 183);  /* #14B8A6 export */
  --tnk-teal-700:    oklch(0.511 0.096 186);  /* #0F766E application */
  --tnk-sky-500:     oklch(0.685 0.150 233);  /* #0EA5E9 chain */
  --tnk-purple-500:  oklch(0.627 0.230 304);  /* #A855F7 sector */
  --tnk-pink-500:    oklch(0.656 0.215 354);  /* #EC4899 team segment */
  --tnk-cyan-500:    oklch(0.715 0.130 215);  /* #06B6D4 liquidity segment */
  --tnk-green-500:   oklch(0.723 0.190 150);  /* #22C55E marketing segment */

  /* The signature gradient (graph-root → token) */
  --tnk-gradient-brand: linear-gradient(135deg, var(--tnk-indigo-500), var(--tnk-violet-500));

  /* Spacing (4px grid) */
  --tnk-space-px: 1px;
  --tnk-space-0_5: 0.125rem; --tnk-space-1: 0.25rem;  --tnk-space-2: 0.5rem;
  --tnk-space-3: 0.75rem;    --tnk-space-4: 1rem;     --tnk-space-5: 1.25rem;
  --tnk-space-6: 1.5rem;     --tnk-space-8: 2rem;     --tnk-space-10: 2.5rem;
  --tnk-space-12: 3rem;      --tnk-space-16: 4rem;    --tnk-space-20: 5rem;
  --tnk-space-24: 6rem;

  /* Radius */
  --radius: 0.625rem;

  /* Type */
  --tnk-font-sans: var(--font-geist-sans), "Inter", system-ui, sans-serif;
  --tnk-font-mono: var(--font-geist-mono), ui-monospace, "SFMono-Regular", monospace;

  /* Motion */
  --dur-instant: 80ms;  --dur-fast: 120ms; --dur-base: 200ms;
  --dur-slow: 320ms;    --dur-slower: 480ms;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in: cubic-bezier(0.4, 0, 1, 1);
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  --stagger-ingest: 64ms;

  /* Z-index */
  --tnk-z-base: 0;    --tnk-z-graph-ui: 10; --tnk-z-sticky: 20;
  --tnk-z-sidebar: 30; --tnk-z-dropdown: 40; --tnk-z-overlay: 50;
  --tnk-z-modal: 60;  --tnk-z-popover: 70;  --tnk-z-toast: 80;
  --tnk-z-command: 90; --tnk-z-tooltip: 100;

  --container-max: 1440px;
}

/* ============================================================
   TIER 2 — SEMANTIC (DARK = DEFAULT)
   Themes only reassign these. App reads only these (+ component tier).
   ============================================================ */
:root {
  /* Base & elevation ladder */
  --background:        var(--tnk-black);
  --foreground:        var(--tnk-slate-50);
  --surface-1:         var(--tnk-slate-950);   /* resting card */
  --surface-2:         var(--tnk-slate-900);   /* raised / hover */
  --surface-3:         var(--tnk-slate-850);   /* popover / dialog */
  --card:              var(--surface-1);
  --card-foreground:   var(--tnk-slate-50);
  --popover:           var(--surface-3);
  --popover-foreground:var(--tnk-slate-50);

  /* Brand */
  --primary:            var(--tnk-indigo-500);
  --primary-foreground: oklch(0.985 0 0);
  --secondary:            var(--tnk-violet-500);
  --secondary-foreground: oklch(0.985 0 0);
  --accent:             var(--tnk-slate-850);
  --accent-foreground:  var(--tnk-slate-50);

  /* Text weights (weight-not-deletion) */
  --muted:             var(--tnk-slate-900);
  --muted-foreground:  var(--tnk-slate-400);   /* ~50% read */

  /* Lines & fields */
  --border:  oklch(1 0 0 / 0.10);
  --input:   oklch(1 0 0 / 0.14);
  --ring:    var(--tnk-indigo-500);

  /* Status — semantic feedback */
  --success:             var(--tnk-emerald-500);
  --success-foreground:  oklch(0.985 0 0);
  --warning:             var(--tnk-amber-500);
  --warning-foreground:  var(--tnk-black);
  --destructive:             var(--tnk-red-500);
  --destructive-foreground:  oklch(0.985 0 0);
  --info:             var(--tnk-blue-500);
  --info-foreground:  oklch(0.985 0 0);

  /* Workflow status (draft → review → validated) */
  --status-draft:      var(--tnk-slate-400);
  --status-review:     var(--tnk-amber-500);
  --status-validated:  var(--tnk-emerald-500);

  /* Risk severity */
  --risk-low:   var(--tnk-emerald-500);
  --risk-med:   var(--tnk-amber-500);
  --risk-high:  var(--tnk-orange-500);

  /* ---- DATA CATEGORY (the graph taxonomy, promoted) ---- */
  --data-hub:         var(--tnk-indigo-500);   /* graph_root */
  --data-token:       var(--tnk-violet-500);
  --data-allocation:  var(--tnk-amber-500);
  --data-vesting:     var(--tnk-emerald-500);
  --data-emission:    var(--tnk-red-500);
  --data-risk:        var(--tnk-orange-500);   /* risk_flag */
  --data-source:      var(--tnk-blue-500);     /* data_source */
  --data-export:      var(--tnk-teal-500);     /* export_run */
  --data-application: var(--tnk-teal-700);
  --data-wallet:      var(--tnk-slate-600);
  --data-category:    var(--tnk-slate-500);
  --data-sector:      var(--tnk-purple-500);
  --data-chain:       var(--tnk-sky-500);
  --data-triple:      var(--tnk-slate-400);    /* triple / predicate / literal */

  /* Graph chrome */
  --graph-canvas-bg:  var(--tnk-black);
  --graph-edge:       oklch(1 0 0 / 0.18);
  --graph-edge-focus: oklch(1 0 0 / 0.55);

  /* Shadows / glow (dark) */
  --shadow-xs: 0 1px 2px oklch(0 0 0 / 0.40);
  --shadow-sm: 0 1px 3px oklch(0 0 0 / 0.50);
  --shadow-md: 0 4px 14px oklch(0 0 0 / 0.55);
  --shadow-lg: 0 16px 40px oklch(0 0 0 / 0.60);
  --shadow-xl: 0 28px 70px oklch(0 0 0 / 0.70);
  --glow-brand: 0 0 0 1px var(--primary), 0 0 24px -4px var(--primary);
}

/* ---- LIGHT THEME (opt-in) ---- */
.light {
  --background:        oklch(1 0 0);
  --foreground:        var(--tnk-slate-950);
  --surface-1:         oklch(1 0 0);
  --surface-2:         var(--tnk-slate-50);
  --surface-3:         oklch(1 0 0);
  --card:              var(--surface-1);
  --card-foreground:   var(--tnk-slate-950);
  --popover:           oklch(1 0 0);
  --popover-foreground:var(--tnk-slate-950);

  --primary:            var(--tnk-indigo-500);
  --primary-foreground: oklch(1 0 0);
  --secondary:            var(--tnk-violet-500);
  --secondary-foreground: oklch(1 0 0);
  --accent:             var(--tnk-slate-100);
  --accent-foreground:  var(--tnk-slate-950);

  --muted:             var(--tnk-slate-100);
  --muted-foreground:  var(--tnk-slate-500);

  --border:  var(--tnk-slate-200);
  --input:   var(--tnk-slate-300);
  --ring:    var(--tnk-indigo-500);

  --success: var(--tnk-emerald-600); --warning: var(--tnk-amber-600);
  --warning-foreground: var(--tnk-black);
  --destructive: var(--tnk-red-500); --info: var(--tnk-blue-600);

  --status-draft: var(--tnk-slate-500);
  --status-review: var(--tnk-amber-600);
  --status-validated: var(--tnk-emerald-600);
  --risk-low: var(--tnk-emerald-600); --risk-med: var(--tnk-amber-600); --risk-high: var(--tnk-orange-600);

  --data-allocation: var(--tnk-amber-600);   /* darker for AA on white */
  --data-vesting:    var(--tnk-emerald-600);
  --data-source:     var(--tnk-blue-600);
  /* others inherit primitives — verify contrast per §5.3 */

  --graph-canvas-bg: var(--tnk-slate-50);
  --graph-edge:       oklch(0 0 0 / 0.12);
  --graph-edge-focus: oklch(0 0 0 / 0.45);

  --shadow-xs: 0 1px 2px oklch(0 0 0 / 0.05);
  --shadow-sm: 0 1px 3px oklch(0 0 0 / 0.08), 0 1px 2px oklch(0 0 0 / 0.06);
  --shadow-md: 0 4px 12px oklch(0 0 0 / 0.08);
  --shadow-lg: 0 12px 32px oklch(0 0 0 / 0.12);
  --shadow-xl: 0 24px 60px oklch(0 0 0 / 0.16);
}

/* ============================================================
   @theme — expose semantics to Tailwind utilities (shadcn-compatible)
   ============================================================ */
@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);

  /* New semantic surfaces / status */
  --color-surface-1: var(--surface-1);
  --color-surface-2: var(--surface-2);
  --color-surface-3: var(--surface-3);
  --color-success: var(--success);
  --color-warning: var(--warning);
  --color-info: var(--info);
  --color-status-draft: var(--status-draft);
  --color-status-review: var(--status-review);
  --color-status-validated: var(--status-validated);
  --color-risk-low: var(--risk-low);
  --color-risk-med: var(--risk-med);
  --color-risk-high: var(--risk-high);

  /* Data categories → bg-data-token, text-data-vesting, border-data-source… */
  --color-data-hub: var(--data-hub);
  --color-data-token: var(--data-token);
  --color-data-allocation: var(--data-allocation);
  --color-data-vesting: var(--data-vesting);
  --color-data-emission: var(--data-emission);
  --color-data-risk: var(--data-risk);
  --color-data-source: var(--data-source);
  --color-data-export: var(--data-export);
  --color-data-application: var(--data-application);
  --color-data-wallet: var(--data-wallet);
  --color-data-category: var(--data-category);
  --color-data-sector: var(--data-sector);
  --color-data-chain: var(--data-chain);
  --color-data-triple: var(--data-triple);

  /* Fonts */
  --font-sans: var(--tnk-font-sans);
  --font-mono: var(--tnk-font-mono);

  /* Radius (Tailwind rounded-*) */
  --radius-xs: calc(var(--radius) - 6px);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
  --radius-2xl: calc(var(--radius) + 12px);

  /* Motion → Tailwind duration-*/ease-* / animate utilities */
  --ease-out: var(--ease-out);
  --ease-in: var(--ease-in);
  --ease-spring: var(--ease-spring);
  --animate-node-spawn: node-spawn var(--dur-slow) var(--ease-spring);
  --animate-edge-particle: edge-particle var(--dur-slower) var(--ease-out);
  --animate-stake-swell: stake-swell var(--dur-slow) var(--ease-spring);
  --animate-graph-breathe: graph-breathe 6s ease-in-out infinite;
}

/* ============================================================
   BASE
   ============================================================ */
@layer base {
  * { border-color: var(--border); }
  body {
    background: var(--background);
    color: var(--foreground);
    font-family: var(--font-sans);
    font-feature-settings: "rlig" 1, "calt" 1;
  }
  .tabular { font-variant-numeric: tabular-nums; }
  code, kbd, samp, .font-mono { font-family: var(--font-mono); }

  /* One AA focus ring, both themes, every focusable */
  :where(a, button, input, select, textarea, [tabindex]):focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
    border-radius: var(--radius-xs);
  }
}

/* ============================================================
   MOTION VOCABULARY (graph-as-signature) — replaces smoke-*
   ============================================================ */
@keyframes node-spawn {
  0%   { transform: scale(0); opacity: 0; }
  60%  { transform: scale(1.12); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}
@keyframes edge-particle {
  0%   { offset-distance: 0%;  opacity: 0; }
  15%  { opacity: 1; }
  85%  { opacity: 1; }
  100% { offset-distance: 100%; opacity: 0; }
}
@keyframes stake-swell {   /* $TRUST stake → node mass + halo */
  0%   { transform: scale(1);    filter: brightness(1); }
  50%  { transform: scale(1.18); filter: brightness(1.4); }
  100% { transform: scale(1.06); filter: brightness(1.15); }
}
@keyframes graph-breathe { /* idle ambient, very low alpha */
  0%, 100% { opacity: 0.45; }
  50%      { opacity: 0.65; }
}
@keyframes score-flash {   /* kept — completeness points gained */
  0%   { opacity: 1; transform: translateY(0) scale(1.25); }
  50%  { opacity: 1; transform: translateY(-14px) scale(1); }
  100% { opacity: 0; transform: translateY(-22px) scale(0.9); }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
    scroll-behavior: auto !important;
  }
}
```

> **`next-themes` note:** set `attribute="class"` and `defaultTheme="dark"`. Because dark is `:root`, dark renders with zero class on first paint (no flash); light is the explicit `.light` opt-in. Keep the existing `darkMode` plumbing — only the default flips.

---

## 4. Component nomenclature & taxonomy

### 4.1 The four naming layers

| Layer | Definition | Owns | Examples |
|---|---|---|---|
| **Primitive** | Unstyled/lightly-styled shadcn/Radix wrapper. No domain knowledge. | `src/components/ui/` | `Button`, `Card`, `Badge`, `Dialog`, `Input`, `Tabs` |
| **Composite** | 2+ primitives assembled, still domain-agnostic. | `src/components/composite/` | `StatTile`, `EmptyState`, `SectionHeader`, `DataBadge`, `CopyableHash` |
| **Pattern** | Reusable, domain-aware block bound to TrustNomiks concepts. | `src/components/patterns/` | `AllocationDonut`, `UnlockTimeline`, `CompletenessRing`, `NodeGlyph`, `StakeSlider` |
| **Feature** | Page-level orchestration for one route/journey. Composes patterns. | `src/features/<domain>/` | `TokenForm`, `PublishPanel`, `KnowledgeGraphExplorer`, `CompareBoard`, `OnboardingChecklist` |

> Dependency direction is **down only**: Feature → Pattern → Composite → Primitive. A primitive importing a pattern is a defect.

### 4.2 File & symbol conventions

- **Files:** `kebab-case.tsx` (`stat-tile.tsx`, `knowledge-graph-explorer.tsx`). Matches the existing repo (`token-form-stepper.tsx`, `authenticated-shell.tsx`).
- **Components:** `PascalCase`, file name = component name kebabed.
- **Hooks:** `use-<thing>.ts` → `useThing`. **Types:** `PascalCase`; suffix `Props` for component props, `Variant` for variant unions.
- **One component per file** at pattern/feature tier; primitives may co-locate sub-parts (shadcn `Card`/`CardHeader`).
- **Co-locate** variants in the same file via CVA; export the `*Variants` for reuse.
- **Index barrels** only per tier folder (`composite/index.ts`), never a global mega-barrel (keeps RSC tree-shaking honest).

### 4.3 Prop conventions (closed vocabulary)

| Prop | Type | Meaning |
|---|---|---|
| `variant` | union | visual intent — see §4.4 |
| `size` | `'xs'\|'sm'\|'md'\|'lg'\|'xl'` | scale; `md` default |
| `tone` / `category` | `NodeType` / status union | **data-driven color** (drives `--data-*`) |
| `state` | union | `'default'\|'hover'\|'active'\|'selected'\|'disabled'\|'loading'` |
| `asChild` | boolean | Radix slot passthrough (keep shadcn idiom) |
| `className` | string | escape hatch, merged last via `cn()` |

- Booleans are positive and prefixed `is`/`has`/`with` (`isLoading`, `hasError`, `withGlow`). No `disabled={false}` double-negatives in new code beyond native DOM.
- Event props `on<Event>`; render props `render<Slot>`.
- **Never** pass raw colors as props — pass `category`/`tone`/`status` and let the component resolve the token.

### 4.4 Variant naming (closed set per kind)

- **Intent variants:** `primary` `secondary` `outline` `ghost` `link` `destructive` `success` (Button/Badge).
- **Surface variants:** `flat` `raised` `overlay` (maps to `--surface-1/2/3`).
- **Emphasis variants:** `solid` `soft` `outline` (Badge/Pill: solid fill, low-alpha `-soft`, bordered).
- **Density variants:** `comfortable` `compact` (tables, lists).
- A component declares variants via **CVA**; the union type is the source of truth and must be named `<Component>Variant`.

### 4.5 Starter catalog (build order = activation order)

| Name | Tier | Tokens it consumes | Purpose |
|---|---|---|---|
| `Button` | primitive | `--primary`, `--radius-md`, `--glow-brand` (withGlow) | actions; primary uses brand gradient on CTA |
| `Badge` / `DataBadge` | primitive / composite | `--data-*`, `-soft` | category & status chips, color = concept |
| `StatTile` | composite | `--surface-1`, `text-h2`, `.tabular` | KPI tiles (dashboard top band) |
| `EmptyState` | composite | `--muted-foreground`, NodeGlyph | graph-seeded empties; one onboarding step each |
| `CopyableHash` | composite | `--font-mono`, `--info` | addresses / triple-IDs |
| `SectionHeader` | composite | type scale, `--border` | form/section titling |
| `NodeGlyph` | pattern | `--data-*`, shape map (§5) | the circle/diamond/square/ring icon system |
| `CompletenessRing` | pattern | `--status-*`, `--success` | per-token 0–100% completeness |
| `AllocationDonut` | pattern | `getChartColor()` | recharts donut (segment colors) |
| `UnlockTimeline` | pattern | `--data-vesting/-emission` | vesting/emission schedule |
| `StakeSlider` | pattern | glass control, `--glow-data` | $TRUST stake (glass + halo only here) |
| `GraphLoader` | pattern | `--animate-node-spawn`, stagger | mini-graph-assembling loader (replaces `Loader2`) |
| `KnowledgeGraphExplorer` | feature | `--data-*`, `--graph-*` | the hero canvas + inspector drawer |
| `PublishPanel` | feature | `--status-*`, `--animate-edge-particle` | graph lights up as chunks confirm |
| `CompareBoard` | feature | StatTile, AllocationDonut | multi-select side-by-side |
| `OnboardingChecklist` | feature | `--status-*`, bridges | persistent role-aware spine |
| `CommandPalette` | feature | `--tnk-z-command` | cmdk ⌘K |

---

## 5. Iconography & data-category mapping

### 5.1 The glyph system (non-color cue — AA requirement)

Color **never** carries meaning alone. Every node family pairs a color with a **shape**, so the taxonomy survives color-blindness and grayscale.

| Family | Shape (glyph) | lucide pairing | Members |
|---|---|---|---|
| **hub** | indigo **ring** (○ with stroke) | `Hexagon` | `graph_root` |
| **atom** | filled **circle** ● | `Circle` | `token`, `allocation`, `vesting`, `emission`, `risk_flag`, `application`, `wallet`, `category`, `sector`, `chain` |
| **triple** | **diamond** ◆ | `Diamond` | `triple`, `predicate`, `literal` |
| **source** | **square** ■ | `Square` / `FileText` | `data_source` |

### 5.2 Per-type mapping (single source — mirror in `node-config.ts`)

| `NodeType` | `--data-*` token | Tailwind class | lucide icon | Glyph family |
|---|---|---|---|---|
| `graph_root` | `--data-hub` | `bg-data-hub` | `Hexagon` | hub |
| `token` | `--data-token` | `text-data-token` | `Coins` | atom |
| `allocation` | `--data-allocation` | `bg-data-allocation` | `PieChart` | atom |
| `vesting` | `--data-vesting` | `text-data-vesting` | `CalendarClock` | atom |
| `emission` | `--data-emission` | `text-data-emission` | `Flame` | atom |
| `risk_flag` | `--data-risk` | `text-data-risk` | `TriangleAlert` | atom |
| `data_source` | `--data-source` | `text-data-source` | `FileText` | source |
| `export_run` | `--data-export` | `text-data-export` | `Share2` | atom |
| `application` | `--data-application` | `text-data-application` | `AppWindow` | atom |
| `wallet` | `--data-wallet` | `text-data-wallet` | `Wallet` | atom |
| `category` | `--data-category` | `text-data-category` | `Layers` | atom |
| `sector` | `--data-sector` | `text-data-sector` | `Network` | atom |
| `chain` | `--data-chain` | `text-data-chain` | `Link2` | atom |
| `triple`/`predicate`/`literal` | `--data-triple` | `text-data-triple` | `Diamond` | triple |

### 5.3 Mapping rules (governance)

1. **Same color = same concept, product-wide.** A vesting value is `--data-vesting` whether it's a graph node, a chart series, a badge, a section accent, a loader, or empty-state art.
2. **Resolve the graph↔chart collision (the §3-brief seam).** Two color spaces, documented and separated:
   - **Graph space** = node *type* → `--data-*` (the 14 tokens above).
   - **Chart space** = allocation *segment* → segment palette below. These are **different ontologies** (segment ≠ node type) and may share hues without meaning the same thing. Rule: **never** use a `--data-*` token to color a chart segment, and never use a segment color for a node. The two accessors in §6 enforce this.
   - Segment palette (from `chart-colors.ts`, retained): `funding-private`=blue · `funding-public`=purple · `team-founders`=pink · `treasury`=orange · `marketing`=green · `airdrop`=teal · `rewards`=indigo · `liquidity`=cyan.
3. **Status ≠ category.** Workflow status uses `--status-*`; risk uses `--risk-*`. Don't borrow a data hue for status (amber is `--warning`/`--status-review` *and* `--data-allocation` — disambiguated by **shape + context**, never overloaded in the same surface).
4. **Contrast:** every `--data-*` used for **text or as a fill behind text** must hit AA on its surface in both themes. Where the dark primitive fails on light, the `.light` block down-shifts to `-600` (already done for allocation/vesting/source). Each data color ships a `-on` companion (auto: white for dark-mode dots, the `-600`/`-foreground` for light fills) for text placed *on* it.
5. **Stake-as-mass:** $TRUST staking is visualized as node **size + halo brightness** (`--glow-data`, `stake-swell`), never as a new color. Weight is luminance/scale, not hue.

---

## 6. Typed accessors (kill the three palettes)

Single resolver per color space, reading CSS vars so canvas (force-graph), SVG (recharts), and DOM never diverge. Replace direct hex reads in `node-config.ts` and `chart-colors.ts`.

```ts
// src/lib/design/tokens.ts  — the ONLY place that bridges JS ↔ CSS vars
import type { NodeType } from '@/lib/knowledge-graph/graph-types'
import type { SegmentType } from '@/types/form'

const readVar = (name: string): string =>
  typeof window === 'undefined'
    ? '' // SSR: components pass className; canvas resolves client-side
    : getComputedStyle(document.documentElement).getPropertyValue(name).trim()

/** GRAPH SPACE — node type → resolved color (for react-force-graph canvas). */
const DATA_VAR: Record<NodeType, string> = {
  graph_root: '--data-hub', token: '--data-token', allocation: '--data-allocation',
  vesting: '--data-vesting', emission: '--data-emission', risk_flag: '--data-risk',
  data_source: '--data-source', export_run: '--data-export', application: '--data-application',
  wallet: '--data-wallet', category: '--data-category', sector: '--data-sector',
  chain: '--data-chain', triple: '--data-triple', predicate: '--data-triple', literal: '--data-triple',
}
export const getDataColor = (t: NodeType) => readVar(DATA_VAR[t]) || '#94a3b8'

/** CHART SPACE — allocation segment → resolved color (for recharts). */
const SEGMENT_VAR: Record<SegmentType, string> = {
  'funding-private': '--tnk-blue-500', 'funding-public': '--tnk-purple-500',
  'team-founders': '--tnk-pink-500', 'treasury': '--tnk-orange-500',
  'marketing': '--tnk-green-500', 'airdrop': '--tnk-teal-500',
  'rewards': '--tnk-indigo-500', 'liquidity': '--tnk-cyan-500',
}
export const getChartColor = (s: SegmentType) => readVar(SEGMENT_VAR[s]) || '#6366f1'
```

> For DOM, prefer the Tailwind classes (`bg-data-token`, `text-data-vesting`) over these resolvers; reserve `getDataColor`/`getChartColor` for canvas/SVG that can't use classNames.

---

## 7. Migration map (one token layer)

| Legacy source | Action |
|---|---|
| `globals.css` HSL `:root`/`.dark` | **Replace** with §3 block. Dark becomes `:root`; light becomes `.light`. |
| `globals.css` `smoke-a/b/c` keyframes | **Delete** — replaced by `node-spawn`/`edge-particle`/`stake-swell`/`graph-breathe`. Keep `score-flash`. |
| `node-config.ts` hard hex | Keep `size`/`label`; swap `color` to read `getDataColor(type)` (or keep hex as canvas SSR fallback, comment it as "= `--data-*`"). |
| `chart-colors.ts` hex map | Re-point to `getChartColor`; delete duplicated `*_TEXT_COLORS` in favor of `text-data-*` / segment classes. |
| `tailwind.config.ts` (v3 hybrid) | Collapse into `@theme`; remove duplicate color/radius definitions — `@theme` is now the single source. |
| Copy-pasted cluster-color maps / stat quartets (4 surfaces) | Replace with `DataBadge` + `StatTile` consuming `--data-*` / `--surface-*`. |

**Acceptance gate for any future PR:** no raw hex in components, no `bg-[#…]`, no second color map; new colors enter only as a `--tnk-*` primitive + a `--data-*`/semantic alias + (if data) a row in §5.2; `npm run lint` and `npm run build` green; AA verified on both themes.

---

**Governance summary:** one primitive ramp set (`--tnk-*`, OKLCH) → one semantic layer the app reads (`--background`/`--surface-*`/`--data-*`/`--status-*`) → optional component tokens; dark is `:root`, light is `.light`; the 16-hue graph taxonomy is now first-class (`--data-*`, Tailwind `*-data-*`, glyph shapes, two typed resolvers); the three legacy palettes collapse per §7; every component named by tier (primitive→composite→pattern→feature) with a closed variant/prop vocabulary.

Source files grounding this: `/Users/phyla/Documents/VsCode/TrustNomiks_app/trustnomiks-app/src/app/globals.css`, `/Users/phyla/Documents/VsCode/TrustNomiks_app/trustnomiks-app/src/lib/knowledge-graph/node-config.ts`, `/Users/phyla/Documents/VsCode/TrustNomiks_app/trustnomiks-app/src/lib/utils/chart-colors.ts`, `/Users/phyla/Documents/VsCode/TrustNomiks_app/trustnomiks-app/tailwind.config.ts`.
