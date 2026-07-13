'use client'

import { useTheme } from 'next-themes'
import { AllocationDonutChart } from '@/components/charts/allocation-donut-chart'
import { AllocationDonutChartDither } from '@/components/charts/allocation-donut-chart-dither'
import { Button } from '@/components/ui/button'

const MAX_SUPPLY = '1,000,000,000'

/** Deliberately repeats funding-private and team-founders: those are what
 *  exercise the occurrence ramp, the part of our palette the kit has no notion
 *  of. If the two pools of a type are not tellable apart, the pilot failed. */
const SEGMENTS = [
  { label: 'Seed Round', segment_type: 'funding-private', percentage: 12 },
  { label: 'Series A', segment_type: 'funding-private', percentage: 8 },
  { label: 'Public Sale', segment_type: 'funding-public', percentage: 5 },
  { label: 'Team', segment_type: 'team-founders', percentage: 18 },
  { label: 'Advisors', segment_type: 'team-founders', percentage: 4 },
  { label: 'Treasury', segment_type: 'treasury', percentage: 20 },
  { label: 'Marketing', segment_type: 'marketing', percentage: 7 },
  { label: 'Airdrop', segment_type: 'airdrop', percentage: 6 },
  { label: 'Staking Rewards', segment_type: 'rewards', percentage: 15 },
  { label: 'Liquidity', segment_type: 'liquidity', percentage: 5 },
].map((s) => ({
  ...s,
  token_amount: String((s.percentage / 100) * 1_000_000_000),
}))

function Panel({
  title,
  note,
  children,
}: {
  title: string
  note: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-card p-6">
      <div className="text-center">
        <h2 className="font-semibold text-foreground text-sm">{title}</h2>
        <p className="text-muted-foreground text-xs">{note}</p>
      </div>
      {children}
    </div>
  )
}

export function ChartsLab() {
  const { resolvedTheme, setTheme } = useTheme()

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-semibold text-2xl text-foreground">
            Charts lab — dither-kit pilot
          </h1>
          <p className="text-muted-foreground text-sm">
            The allocation donut, rendered three ways from the same data and the
            same tokens. Left is what ships today.
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
            }
          >
            Toggle theme
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            Print preview
          </Button>
        </div>
      </header>

      <section className="grid gap-6 md:grid-cols-3">
        <Panel title="recharts (today)" note="SVG · vector on paper">
          <AllocationDonutChart
            segments={SEGMENTS}
            maxSupply={MAX_SUPPLY}
            size="lg"
          />
        </Panel>
        <Panel title="dither-kit · gradient" note="the kit's default fill">
          <AllocationDonutChartDither
            segments={SEGMENTS}
            maxSupply={MAX_SUPPLY}
            size="lg"
          />
        </Panel>
        <Panel title="dither-kit · solid" note="crisper slice boundaries">
          <AllocationDonutChartDither
            segments={SEGMENTS}
            maxSupply={MAX_SUPPLY}
            size="lg"
            variant="solid"
          />
        </Panel>
      </section>

      <section className="mt-6 grid gap-6 md:grid-cols-3">
        <Panel title="recharts — small" note="the data-room / compare size">
          <AllocationDonutChart segments={SEGMENTS} maxSupply={MAX_SUPPLY} />
        </Panel>
        <Panel
          title="dither-kit — small"
          note="does the dither survive at 160px?"
        >
          <AllocationDonutChartDither
            segments={SEGMENTS}
            maxSupply={MAX_SUPPLY}
          />
        </Panel>
        <Panel title="dither-kit — small · solid" note="same, crisper fill">
          <AllocationDonutChartDither
            segments={SEGMENTS}
            maxSupply={MAX_SUPPLY}
            variant="solid"
          />
        </Panel>
      </section>
    </main>
  )
}
