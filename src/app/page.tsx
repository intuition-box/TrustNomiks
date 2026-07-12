'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LiveGraph } from '@/components/brand/live-graph'
import { Logo } from '@/components/brand/logo'
import { Reveal } from '@/components/patterns/reveal'
import { useCountUp } from '@/components/patterns/count-up'
import { createClient } from '@/lib/supabase/client'
import { TARGET_TOKENS as TARGET } from '@/lib/insights/constants'
import { cn } from '@/lib/utils'

/* ── Surface registry ─────────────────────────────────────────────────────────
   Ship-state of every surface the landing advertises before it exists.
   Flip an entry from 'soon' to its URL and the SOON chrome disappears. */
type SurfaceState = 'soon' | (string & {})

const SURFACES: Record<
  | 'docs'
  | 'whitepaper'
  | 'blog'
  | 'discord'
  | 'twitter'
  | 'linkedin'
  | 'community',
  SurfaceState
> = {
  docs: 'soon',
  whitepaper: 'soon',
  blog: 'soon',
  discord: 'soon',
  twitter: 'soon',
  linkedin: 'soon',
  community: 'soon',
}

const EMAIL_REGEX = /^\S+@\S+\.\S+$/

/* ── Content ─────────────────────────────────────────────────────────────── */

const NAV_LINKS = [
  { label: 'Platform', href: '#platform' },
  { label: 'Developers', href: '#developers' },
  { label: 'Vision', href: '#vision' },
]

const CAPABILITIES = [
  { label: 'MCP server', glyphClass: 'rounded-full bg-data-chain' },
  { label: 'REST + GraphQL API', glyphClass: 'rounded-full bg-data-source' },
  { label: 'Machine-readable triples', glyphClass: 'rotate-45 bg-data-sector' },
  { label: 'On-chain provenance', glyphClass: 'rounded-full bg-data-vesting' },
]

const VALUE_CARDS = [
  {
    accentVar: '--data-token',
    title: 'Structure',
    body: 'Turn a whitepaper or DAO proposal into clean, standardized tokenomics. Supply, allocations, vesting and emissions, all in one place.',
  },
  {
    accentVar: '--data-allocation',
    title: 'Compare',
    body: "See how any token's distribution, unlock schedule and emissions stack up against its peers, side by side.",
  },
  {
    accentVar: '--data-vesting',
    title: 'Verify',
    body: 'Every figure links back to its source, and can be published on-chain as a curated, stake-weighted claim.',
  },
  {
    accentVar: '--data-chain',
    square: true,
    title: 'Feed agents',
    body: 'Expose curated tokenomics over an MCP server and a REST + GraphQL API, so AI agents and copilots query verifiable claims instead of scraping PDFs.',
  },
]

const VISION_STEPS = [
  {
    index: '01',
    status: 'Now',
    statusClass: 'text-success',
    title: 'Structure',
    body: '300 tokens with complete, sourced tokenomics: one standardized ontology across supply, allocations, vesting and emissions.',
  },
  {
    index: '02',
    status: 'Next',
    statusClass: 'text-warning',
    title: 'Curate',
    body: "Every claim published on Intuition and weighted by $TRUST staking: the community puts skin in the game on what's true.",
  },
  {
    index: '03',
    status: 'Ahead',
    statusClass: 'text-faint-foreground',
    title: 'Serve',
    body: 'AI agents, risk desks and protocols consume verified claims over MCP and API: trust as infrastructure, not a promise.',
  },
]

interface FooterItemDef {
  label: string
  href?: string
  surface?: keyof typeof SURFACES
  external?: boolean
}

const FOOTER_COLS: Array<{ heading: string; items: FooterItemDef[] }> = [
  {
    heading: 'Product',
    items: [
      { label: 'Launch app', href: '/dashboard' },
      { label: 'Explore the graph', href: '/login?intent=view' },
      { label: 'Data Room', href: '/data-room' },
      { label: 'Contribute', href: '/tokens/new' },
    ],
  },
  {
    heading: 'Developers',
    items: [
      { label: 'MCP server (waitlist)', href: '#developers' },
      { label: 'Documentation', surface: 'docs' },
    ],
  },
  {
    heading: 'Resources',
    items: [
      { label: 'Whitepaper', surface: 'whitepaper' },
      { label: 'Vision & roadmap', href: '#vision' },
      {
        label: 'Intuition Protocol',
        href: 'https://intuition.systems',
        external: true,
      },
      { label: 'Blog', surface: 'blog' },
    ],
  },
  {
    heading: 'Community',
    items: [
      { label: 'Discord', surface: 'discord' },
      { label: 'X / Twitter', surface: 'twitter' },
      { label: 'LinkedIn', surface: 'linkedin' },
    ],
  },
]

const TAGLINE = 'The verifiable tokenomics data layer for the agentic era.'

/* ── Page ────────────────────────────────────────────────────────────────── */

export default function Landing() {
  // The counter states a fact, so it counts the real registry: every
  // structured token (the unified "/300 structured" vocabulary) via the
  // public_token_count RPC (SECURITY DEFINER), readable anonymously so the
  // number is real even before sign-in. Stays a goal statement if it fails.
  const [total, setTotal] = useState<number | null>(null)
  // Real validated token names orbit the hero graph (quality-gated public facts).
  const [tokenNames, setTokenNames] = useState<string[] | undefined>(undefined)
  useEffect(() => {
    const supabase = createClient()
    supabase.rpc('public_token_count').then(({ data, error }) => {
      if (!error && typeof data === 'number') setTotal(data)
    })
    supabase
      .rpc('public_token_names', { max_rows: 13 })
      .then(({ data, error }) => {
        if (!error && Array.isArray(data) && data.length > 0) {
          setTokenNames(data.map((r: { name: string }) => r.name))
        }
      })
  }, [])

  // Smooth anchor scrolling for the in-page nav, landing only. The global
  // prefers-reduced-motion kill-switch (globals.css) forces it back to auto.
  useEffect(() => {
    const root = document.documentElement
    const previous = root.style.scrollBehavior
    root.style.scrollBehavior = 'smooth'
    return () => {
      root.style.scrollBehavior = previous
    }
  }, [])

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      {/* ambient brand wash */}
      <div
        className="pointer-events-none absolute -top-40 left-1/2 h-[480px] w-[820px] -translate-x-1/2 rounded-full opacity-[0.14] blur-[80px]"
        style={{ background: 'var(--gradient-brand)' }}
        aria-hidden
      />

      {/* top nav */}
      <header className="relative z-10 mx-auto flex w-full max-w-[70rem] items-center justify-between gap-6 px-6 py-5">
        <Logo size={26} wordmarkClassName="text-[15px]" />
        <nav className="hidden items-center gap-7 text-[13px] md:flex">
          {NAV_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              {l.label}
            </a>
          ))}
          <SurfaceLink state={SURFACES.whitepaper}>Whitepaper</SurfaceLink>
        </nav>
        <div className="flex items-center gap-2.5">
          <Button
            asChild
            variant="outline"
            size="sm"
            className="px-3.5 text-[13px]"
          >
            <Link href="/login">Log in</Link>
          </Button>
          <Button
            asChild
            variant="brand"
            size="sm"
            className="gap-1.5 px-3.5 text-[13px] font-semibold"
          >
            <Link href="/dashboard">
              Launch app <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </header>

      {/* hero */}
      <section className="relative z-10 mx-auto grid w-full max-w-[70rem] items-center gap-8 px-6 pb-10 pt-8 lg:grid-cols-[1.05fr_0.95fr] lg:pt-14">
        <div className="flex flex-col gap-[26px]">
          <Reveal on="load" index={0} className="self-start">
            <span className="inline-flex items-center gap-2 rounded-full border border-secondary/30 bg-surface-1/60 px-3 py-[5px] text-xs backdrop-blur">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-secondary opacity-75 [animation-duration:1.6s]" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-secondary" />
              </span>
              <span className="text-gradient-brand font-semibold">
                The verifiable data layer for AI agents
              </span>
            </span>
          </Reveal>

          <Reveal on="load" index={1}>
            <h1 className="text-balance text-[clamp(2.25rem,4.6vw,3.25rem)] font-semibold leading-[1.05] tracking-[-0.02em]">
              The Tokenomics
              <br />
              <span className="text-gradient-brand">Intelligence Graph.</span>
            </h1>
          </Reveal>

          <Reveal on="load" index={2}>
            <p className="max-w-[480px] text-pretty text-base leading-normal text-muted-foreground">
              TrustNomiks turns fragmented whitepapers, DAO proposals and
              on-chain records into{' '}
              <span className="text-foreground">
                clean, verifiable, machine-readable claims
              </span>
              , then serves them to{' '}
              <span className="text-foreground">
                AI agents over MCP and API
              </span>
              . The tokenomics data layer your agents can actually trust.
            </p>
          </Reveal>

          {/* agent-ready capabilities */}
          <Reveal on="load" index={3}>
            <div className="flex flex-wrap gap-2">
              {CAPABILITIES.map((c) => (
                <span
                  key={c.label}
                  className="inline-flex items-center gap-[7px] rounded-full border bg-surface-1/70 px-3 py-[5px] text-xs text-muted-foreground backdrop-blur"
                >
                  <span className={cn('h-1.5 w-1.5', c.glyphClass)} />
                  {c.label}
                </span>
              ))}
            </div>
          </Reveal>

          {/* the two doors */}
          <Reveal on="load" index={4}>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                asChild
                variant="brand"
                size="xl"
                className="h-[52px] flex-1 justify-between gap-3 rounded-[10px] px-5 text-[15px] font-semibold shadow-[0_0_24px_-6px_hsl(var(--primary)/0.5)]"
              >
                <Link href="/login?intent=view">
                  Explore trusted data <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="xl"
                className="h-[52px] flex-1 justify-between gap-3 rounded-[10px] border-border bg-surface-1/70 px-5 text-[15px] font-semibold"
              >
                <Link href="/login?intent=contribute">
                  Contribute a token <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </Reveal>

          {/* north-star counter */}
          <Reveal on="load" index={5}>
            <GoalCounter total={total} />
          </Reveal>
        </div>

        {/* living graph */}
        <div className="relative h-[340px] w-full sm:h-[420px] lg:h-[500px]">
          <div
            className="pointer-events-none absolute inset-0 rounded-full opacity-60 blur-2xl"
            style={{
              background:
                'radial-gradient(closest-side, hsl(var(--primary) / 0.22), transparent)',
            }}
            aria-hidden
          />
          <LiveGraph
            mode="hero"
            count={tokenNames?.length ?? 13}
            tokenLabels={tokenNames}
          />
        </div>
      </section>

      {/* value */}
      <section
        id="platform"
        className="relative z-10 mx-auto w-full max-w-[70rem] px-6 py-16"
      >
        <p className="mb-8 text-center text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          From scattered docs to agent-ready intelligence
        </p>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {VALUE_CARDS.map((card, i) => (
            <Reveal key={card.title} index={i} className="h-full">
              <ValueCard {...card} />
            </Reveal>
          ))}
        </div>
      </section>

      {/* ecosystem */}
      <section
        id="developers"
        className="relative z-10 mx-auto w-full max-w-[70rem] px-6 py-16"
      >
        <div className="mb-9 flex flex-col gap-2.5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            The TrustNomiks ecosystem
          </p>
          <h2 className="text-[2rem] font-semibold tracking-[-0.015em]">
            One graph. Every surface.
          </h2>
          <p className="max-w-[560px] text-[15px] leading-normal text-muted-foreground">
            The app is the front door. Around it, the same verified graph is
            served to analysts, contributors and AI agents through open
            interfaces.
          </p>
        </div>

        <div className="grid items-stretch gap-4 lg:grid-cols-[1fr_1.2fr_1fr]">
          <Reveal index={0} className="h-full">
            <ComingSoonCard
              mono="docs/"
              monoClass="text-data-source"
              title="Documentation"
              body="The tokenomics ontology, contribution guides, and the Atoms & Triples data model: everything needed to read or extend the graph."
              soon={SURFACES.docs === 'soon'}
            />
          </Reveal>

          <Reveal index={1} className="h-full">
            <div className="flex h-full flex-col gap-3 rounded-xl border border-primary/35 bg-surface-1 p-[26px] shadow-[0_0_32px_-12px_hsl(var(--primary)/0.35)]">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-data-chain">
                  api/ · mcp/
                </span>
                <span className="text-gradient-brand text-[11px] font-semibold uppercase tracking-[0.06em]">
                  For agents
                </span>
              </div>
              <h3 className="text-lg font-semibold">API &amp; MCP server</h3>
              <p className="text-[13.5px] leading-[1.55] text-muted-foreground">
                Plug verified tokenomics straight into your agents and copilots.
                Query claims, provenance and stake weights, no PDF scraping.
              </p>
              <div className="overflow-hidden rounded-[10px] border bg-background px-4 py-3.5 font-mono text-xs leading-[1.7] text-muted-foreground">
                <div className="text-faint-foreground">
                  {'// claude / cursor config'}
                </div>
                <div>
                  <span className="text-secondary">&quot;mcpServers&quot;</span>
                  : {'{'}
                </div>
                <div>
                  {'  '}
                  <span className="text-data-chain">
                    &quot;trustnomiks&quot;
                  </span>
                  : {'{ '}
                  <span className="text-success">&quot;url&quot;</span>:{' '}
                  <span className="text-foreground">
                    &quot;mcp.trustnomiks.io&quot;
                  </span>
                  {' }'}
                </div>
                <div>{'}'}</div>
              </div>
              <WaitlistForm />
            </div>
          </Reveal>

          <Reveal index={2} className="h-full">
            <ComingSoonCard
              mono="paper/"
              monoClass="text-data-sector"
              title="Whitepaper"
              body="The full protocol design: the standardized ontology, $TRUST curation economics, and the road to a verifiable agentic data layer."
              soon={SURFACES.whitepaper === 'soon'}
            />
          </Reveal>
        </div>
      </section>

      {/* vision */}
      <section
        id="vision"
        className="relative z-10 mx-auto w-full max-w-[70rem] px-6 py-16"
      >
        <div className="mb-9 flex flex-col gap-2.5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Where this is going
          </p>
          <h2 className="text-[2rem] font-semibold tracking-[-0.015em]">
            From data layer to agent economy.
          </h2>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {VISION_STEPS.map((step, i) => (
            <Reveal key={step.index} index={i}>
              <div className="border-t border-border-strong px-1 pt-6">
                <div className="mb-3.5 flex items-center justify-between">
                  <span className="tabular font-mono text-[13px] text-primary">
                    {step.index}
                  </span>
                  <span
                    className={cn(
                      'text-[11px] font-semibold uppercase tracking-[0.06em]',
                      step.statusClass,
                    )}
                  >
                    {step.status}
                  </span>
                </div>
                <h3 className="text-[17px] font-semibold">{step.title}</h3>
                <p className="mt-1.5 text-[13.5px] leading-[1.55] text-muted-foreground">
                  {step.body}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* community band */}
      <section className="relative z-10 mx-auto w-full max-w-[70rem] px-6 pb-18 pt-8">
        <Reveal>
          <div className="relative overflow-hidden rounded-[16px] border border-primary/30 bg-surface-1 px-8 py-12 text-center">
            <div
              className="pointer-events-none absolute -top-[120px] left-1/2 h-[300px] w-[600px] -translate-x-1/2 rounded-full opacity-[0.12] blur-[60px]"
              style={{ background: 'var(--gradient-brand)' }}
              aria-hidden
            />
            <h2 className="relative text-[28px] font-semibold tracking-[-0.015em]">
              Built in the open. Curated by $TRUST.
            </h2>
            <p className="relative mx-auto mt-3 max-w-[480px] text-[15px] leading-normal text-muted-foreground">
              Every contribution makes the graph more complete, and more
              valuable to everyone who queries it.
            </p>
            <div className="relative mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button
                asChild
                variant="brand"
                size="xl"
                className="h-11 gap-2 rounded-[10px] px-[22px] text-sm font-semibold"
              >
                <Link href="/login?intent=contribute">
                  Contribute a token <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              {SURFACES.community === 'soon' ? (
                <span className="inline-flex h-11 cursor-default items-center gap-2 rounded-[10px] border bg-background/60 px-[22px] text-sm font-semibold text-faint-foreground/70">
                  Join the community <SoonPill />
                </span>
              ) : (
                <Button
                  asChild
                  variant="outline"
                  size="xl"
                  className="h-11 gap-2 rounded-[10px] px-[22px] text-sm font-semibold"
                >
                  <a href={SURFACES.community}>Join the community</a>
                </Button>
              )}
            </div>
          </div>
        </Reveal>
      </section>

      {/* footer */}
      <footer className="relative z-10 border-t">
        <div className="mx-auto grid w-full max-w-[70rem] grid-cols-2 gap-7 px-6 pb-8 pt-12 md:grid-cols-[1.5fr_1fr_1fr_1fr_1fr]">
          <div className="col-span-2 flex flex-col gap-3 md:col-span-1">
            <Logo size={22} wordmarkClassName="text-sm" />
            <p className="max-w-[260px] text-[12.5px] leading-[1.55] text-faint-foreground">
              {TAGLINE} Built on Intuition Protocol.
            </p>
          </div>
          {FOOTER_COLS.map((col) => (
            <div
              key={col.heading}
              className="flex flex-col items-start gap-2.5 text-[13px]"
            >
              <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-faint-foreground">
                {col.heading}
              </span>
              {col.items.map((item) => (
                <FooterItem key={item.label} item={item} />
              ))}
            </div>
          ))}
        </div>
        <div className="mx-auto flex w-full max-w-[70rem] flex-col gap-1 px-6 pb-8 text-xs text-faint-foreground sm:flex-row sm:items-center sm:justify-between">
          <span className="tabular">© 2026 TrustNomiks</span>
          <span>{TAGLINE}</span>
        </div>
      </footer>
    </div>
  )
}

/* ── bits ─────────────────────────────────────────────────────────────────── */

function SoonPill({ size = 'xs' }: { size?: 'xs' | 'sm' }) {
  return (
    <span
      className={cn(
        'rounded-full border font-semibold text-faint-foreground',
        size === 'xs'
          ? 'px-1.5 py-px text-[9px] tracking-[0.08em]'
          : 'px-2 py-0.5 text-[11px] uppercase tracking-[0.06em]',
      )}
    >
      {size === 'xs' ? 'SOON' : 'Soon'}
    </span>
  )
}

/** Link that collapses to a non-interactive SOON state until its surface ships. */
function SurfaceLink({
  state,
  className,
  children,
}: {
  state: SurfaceState
  className?: string
  children: React.ReactNode
}) {
  if (state !== 'soon') {
    return (
      <a
        href={state}
        className={cn(
          'text-muted-foreground transition-colors hover:text-foreground',
          className,
        )}
      >
        {children}
      </a>
    )
  }
  return (
    <span
      className={cn(
        'inline-flex cursor-default items-center gap-1.5 text-faint-foreground/70',
        className,
      )}
    >
      {children} <SoonPill />
    </span>
  )
}

function GoalCounter({ total }: { total: number | null }) {
  const count = useCountUp(total ?? 0, 1600)
  return (
    <div className="flex max-w-[440px] flex-col gap-2 pt-1">
      <div className="flex items-baseline justify-between text-[13px]">
        <span className="text-muted-foreground">The collective goal</span>
        {total === null ? (
          <span className="tabular font-mono text-muted-foreground">
            {TARGET} tokens structured
          </span>
        ) : (
          <span className="tabular font-mono text-foreground">
            <span className="text-gradient-brand font-semibold">{count}</span>
            <span className="text-muted-foreground">
              {' '}
              / {TARGET} tokens structured
            </span>
          </span>
        )}
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full transition-[width] duration-1000 ease-out"
          style={{
            width: `${total === null ? 3 : (count / TARGET) * 100}%`,
            background: 'var(--gradient-brand)',
          }}
        />
      </div>
      <p className="pt-0.5 text-xs text-faint-foreground">
        Built on Intuition Protocol, curated by $TRUST.
      </p>
    </div>
  )
}

function ValueCard({
  accentVar,
  square,
  title,
  body,
}: {
  accentVar: string
  square?: boolean
  title: string
  body: string
}) {
  const color = `hsl(var(${accentVar}))`
  return (
    <div className="h-full rounded-[12px] border bg-surface-1 p-6 transition-[border-color,background-color,transform,box-shadow] duration-200 hover:-translate-y-[3px] hover:border-border-strong hover:bg-surface-2 hover:shadow-[0_12px_32px_-16px_rgb(0_0_0/0.6)]">
      <span
        className="mb-4 flex h-10 w-10 items-center justify-center rounded-[10px]"
        style={{
          backgroundColor: `color-mix(in oklab, ${color} 14%, transparent)`,
        }}
      >
        <span
          className={cn('h-3 w-3', !square && 'rounded-full')}
          style={{
            backgroundColor: color,
            boxShadow: `0 0 12px -2px ${color}`,
          }}
        />
      </span>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-1.5 text-[13.5px] leading-[1.55] text-muted-foreground">
        {body}
      </p>
    </div>
  )
}

function ComingSoonCard({
  mono,
  monoClass,
  title,
  body,
  soon,
}: {
  mono: string
  monoClass: string
  title: string
  body: string
  soon: boolean
}) {
  return (
    <div
      className={cn(
        'flex h-full flex-col gap-3 rounded-xl border bg-surface-1 p-[26px]',
        soon && 'opacity-75',
      )}
    >
      <div className="flex items-center justify-between">
        <span className={cn('font-mono text-xs', monoClass)}>{mono}</span>
        {soon && <SoonPill size="sm" />}
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="flex-1 text-[13.5px] leading-[1.55] text-muted-foreground">
        {body}
      </p>
      {soon && (
        <span className="text-[13px] font-semibold text-faint-foreground">
          Available at launch
        </span>
      )}
    </div>
  )
}

function WaitlistForm() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'saving' | 'done'>('idle')
  const [error, setError] = useState('')

  if (status === 'done') {
    return (
      <div
        role="status"
        className="flex items-center gap-2 rounded-lg border border-success/35 bg-success/[0.08] px-3.5 py-2.5 text-[13px] text-success"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-success" />
        You&apos;re on the list. We&apos;ll email you at launch.
      </div>
    )
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const candidate = email.trim()
    if (!EMAIL_REGEX.test(candidate)) {
      setError('This does not look like an email address.')
      return
    }
    setError('')
    setStatus('saving')
    const { error: insertError } = await createClient()
      .from('waitlist')
      .insert({ email: candidate, interest: 'api-mcp' })
    if (insertError) {
      console.error('waitlist insert error:', insertError)
      setStatus('idle')
      setError('Could not save your email. Retry in a moment.')
      return
    }
    setStatus('done')
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2" noValidate>
      <div className="flex gap-2">
        <Input
          type="email"
          placeholder="you@company.com"
          aria-label="Email for the API and MCP server waitlist"
          aria-invalid={Boolean(error)}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={status === 'saving'}
          className="h-[38px] min-w-0 flex-1 rounded-lg bg-background text-[13px] md:text-[13px]"
        />
        <Button
          type="submit"
          variant="brand"
          disabled={status === 'saving'}
          className="h-[38px] rounded-lg px-4 text-[13px] font-semibold"
        >
          {status === 'saving' ? 'Saving…' : 'Get notified'}
        </Button>
      </div>
      {error ? (
        <span role="alert" className="text-[11.5px] text-destructive">
          {error}
        </span>
      ) : (
        <span className="text-[11.5px] text-faint-foreground">
          Be first to plug your agents in when the API &amp; MCP server go live.
        </span>
      )}
    </form>
  )
}

function FooterItem({ item }: { item: FooterItemDef }) {
  const linkClass =
    'text-muted-foreground transition-colors hover:text-foreground'
  if (item.surface || !item.href) {
    return (
      <SurfaceLink state={item.surface ? SURFACES[item.surface] : 'soon'}>
        {item.label}
      </SurfaceLink>
    )
  }
  if (item.external) {
    return (
      <a
        href={item.href}
        target="_blank"
        rel="noreferrer"
        className={linkClass}
      >
        {item.label}
      </a>
    )
  }
  if (item.href.startsWith('#')) {
    return (
      <a href={item.href} className={linkClass}>
        {item.label}
      </a>
    )
  }
  return (
    <Link href={item.href} className={linkClass}>
      {item.label}
    </Link>
  )
}
