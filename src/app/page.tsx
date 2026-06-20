'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Compass, PenLine, ShieldCheck, Layers, Scale, Bot, Plug, Code2, Boxes } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LiveGraph } from '@/components/brand/live-graph'

const TARGET = 300

export default function Landing() {
  const count = useCountUp(TARGET, 1600)

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      {/* ambient brand wash */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-brand-soft opacity-40" aria-hidden />
      <div
        className="pointer-events-none absolute -top-40 left-1/2 h-[480px] w-[820px] -translate-x-1/2 rounded-full opacity-30 blur-3xl"
        style={{ background: 'var(--gradient-brand)' }}
        aria-hidden
      />

      {/* top bar */}
      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <HubMark />
          <span className="text-sm font-semibold tracking-tight">TrustNomiks</span>
        </div>
        <nav className="flex items-center gap-2">
          <Link href="/login">
            <Button variant="outline" size="sm">
              Log in
            </Button>
          </Link>
        </nav>
      </header>

      {/* hero */}
      <section className="relative z-10 mx-auto grid w-full max-w-6xl items-center gap-8 px-6 pb-10 pt-8 lg:grid-cols-[1.05fr_0.95fr] lg:pt-16">
        <div className="space-y-7">
          <span className="inline-flex items-center gap-2 rounded-full border border-data-token/30 bg-surface-1/60 px-3 py-1 text-xs backdrop-blur">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-data-token opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-data-token" />
            </span>
            <span className="font-medium text-gradient-brand">The verifiable data layer for AI agents</span>
          </span>

          <h1 className="text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-[3.25rem]">
            The Tokenomics
            <br />
            <span className="text-gradient-brand">Intelligence Graph.</span>
          </h1>

          <p className="max-w-lg text-pretty text-base leading-relaxed text-muted-foreground">
            TrustNomiks turns fragmented whitepapers, DAO proposals and on-chain records into{' '}
            <span className="text-foreground">clean, verifiable, machine-readable claims</span>, then serves them to{' '}
            <span className="text-foreground">AI agents over MCP and API</span>. The tokenomics data layer your agents
            can actually trust.
          </p>

          {/* agent-ready capabilities — omnipresent */}
          <div className="flex flex-wrap gap-2">
            <CapabilityPill icon={Plug} label="MCP server" />
            <CapabilityPill icon={Code2} label="REST + GraphQL API" />
            <CapabilityPill icon={Boxes} label="Machine-readable triples" />
            <CapabilityPill icon={ShieldCheck} label="On-chain provenance" />
          </div>

          {/* role select = two doors */}
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link href="/login" className="flex-1">
              <Button variant="brand" size="xl" className="w-full justify-between gap-3">
                <span className="flex items-center gap-2">
                  <Compass className="h-5 w-5" /> Explore the graph
                </span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/login" className="flex-1">
              <Button variant="outline" size="xl" className="w-full justify-between gap-3">
                <span className="flex items-center gap-2">
                  <PenLine className="h-5 w-5" /> Contribute a token
                </span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>

          {/* north-star counter */}
          <div className="max-w-md space-y-2 pt-2">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-muted-foreground">The collective goal</span>
              <span className="tabular font-mono text-foreground">
                <span className="text-gradient-brand font-semibold">{count}</span>
                <span className="text-muted-foreground"> / {TARGET} tokens structured</span>
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full transition-[width] duration-1000 ease-out"
                style={{ width: `${(count / TARGET) * 100}%`, background: 'var(--gradient-brand)' }}
              />
            </div>
            <p className="pt-1 text-xs text-faint-foreground">
              Built on Intuition Protocol, curated by $TRUST.
            </p>
          </div>
        </div>

        {/* living graph */}
        <div className="relative h-[340px] w-full sm:h-[420px] lg:h-[520px]">
          <div
            className="pointer-events-none absolute inset-0 rounded-full opacity-60 blur-2xl"
            style={{ background: 'radial-gradient(closest-side, hsl(var(--primary) / 0.22), transparent)' }}
            aria-hidden
          />
          <LiveGraph mode="hero" count={13} />
        </div>
      </section>

      {/* what TrustNomiks does for you (the product value) */}
      <section className="relative z-10 mx-auto w-full max-w-6xl px-6 py-14">
        <p className="mb-8 text-center text-xs font-medium uppercase tracking-widest text-muted-foreground">
          From scattered docs to agent-ready intelligence
        </p>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <ValueCard
            icon={Layers}
            accentVar="--data-token"
            title="Structure"
            body="Turn a whitepaper or DAO proposal into clean, standardized tokenomics. Supply, allocations, vesting and emissions, all in one place."
          />
          <ValueCard
            icon={Scale}
            accentVar="--data-allocation"
            title="Compare"
            body="See how any token's distribution, unlock schedule and emissions stack up against its peers, side by side."
          />
          <ValueCard
            icon={ShieldCheck}
            accentVar="--data-vesting"
            title="Verify"
            body="Every figure links back to its source, and can be published on-chain as a curated, stake-weighted claim."
          />
          <ValueCard
            icon={Bot}
            accentVar="--data-chain"
            title="Feed agents"
            body="Expose curated tokenomics over an MCP server and a REST + GraphQL API, so AI agents and copilots query verifiable claims instead of scraping PDFs."
          />
        </div>
      </section>

      <footer className="relative z-10 mx-auto w-full max-w-6xl px-6 py-10 text-center text-xs text-faint-foreground">
        The verifiable tokenomics data layer for the agentic era.
      </footer>
    </div>
  )
}

/* ── bits ─────────────────────────────────────────────────────────────────── */

function CapabilityPill({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border bg-surface-1/70 px-2.5 py-1 text-xs text-muted-foreground backdrop-blur">
      <Icon className="h-3.5 w-3.5 text-data-chain" />
      {label}
    </span>
  )
}

function HubMark() {
  return (
    <span className="flex h-7 w-7 items-center justify-center">
      <svg width={24} height={24} viewBox="0 0 24 24" aria-hidden>
        <circle cx={12} cy={12} r={7} fill="none" stroke="hsl(var(--data-hub))" strokeWidth={2.4} />
        <circle cx={12} cy={12} r={2.4} fill="hsl(var(--data-hub))" />
      </svg>
    </span>
  )
}

function ValueCard({
  icon: Icon,
  accentVar,
  title,
  body,
}: {
  icon: LucideIcon
  accentVar: string
  title: string
  body: string
}) {
  const color = `hsl(var(${accentVar}))`
  return (
    <div className="rounded-xl border bg-surface-1 p-6">
      <span
        className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg"
        style={{ backgroundColor: `color-mix(in oklab, ${color} 15%, transparent)`, color }}
      >
        <Icon className="h-5 w-5" />
      </span>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
    </div>
  )
}

function useCountUp(target: number, duration: number) {
  const [value, setValue] = useState(0)
  const raf = useRef<number>(0)
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const dur = reduce ? 0 : duration
    const start = performance.now()
    const tick = (now: number) => {
      const p = dur === 0 ? 1 : Math.min(1, (now - start) / dur)
      const eased = 1 - Math.pow(1 - p, 3)
      setValue(Math.round(eased * target))
      if (p < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [target, duration])
  return value
}
