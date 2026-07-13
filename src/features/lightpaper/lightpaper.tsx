import { Logo } from '@/components/brand/logo'
import { AllocationDonutChart } from '@/components/charts/allocation-donut-chart'
import { AllocationDonutChartDither } from '@/components/charts/allocation-donut-chart-dither'
import { UnlockTimelineChart } from '@/components/charts/unlock-timeline-chart'
import {
  CATEGORY_OPTIONS,
  SECTOR_OPTIONS,
  buildProjectionInputs,
  buildStep4Schedules,
  computeSupplyProjection,
  formatSegmentTypeLabel,
  formatUsd,
  toSupportedSegmentType,
  type AllocationWithId,
  type EmissionModelFormData,
  type VestingTimelinePoint,
} from '@/lib/tokenomics'
import { formatCompactNumber } from '@/lib/utils/vesting-timeline'
import type { FactorySharedDesign } from '@/types/factory'
import { LightpaperStats } from './lightpaper-stats'
import { LightpaperStressTest } from './lightpaper-stress-test'
import { PrintButton } from './print-button'

/** Series key for minted supply (mirrors the studio's supply chart). */
const EMISSION_KEY = 'Emission (minted)'

const EMISSION_TYPE_LABELS: Record<string, string> = {
  fixed_cap: 'Fixed cap (no new emission)',
  inflationary: 'Inflationary',
  deflationary: 'Deflationary',
  hybrid: 'Hybrid',
}

function Section({
  title,
  kicker,
  children,
}: {
  title: string
  kicker: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-4 border-t pt-8">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {kicker}
        </p>
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      </div>
      {children}
    </section>
  )
}

/**
 * The public, read-only lightpaper of a shared Factory design: the design's
 * substance rendered in the app's design language, no controls, no session.
 * Server component; the charts and KPI tables mount as client islands.
 * Sections render only when the design carries their data.
 */
export function Lightpaper({ design }: { design: FactorySharedDesign }) {
  const { project } = design

  const categoryLabel =
    CATEGORY_OPTIONS.find((option) => option.value === project.category)
      ?.label ?? project.category
  const sectorLabel =
    SECTOR_OPTIONS.find((option) => option.value === project.sector)?.label ??
    project.sector

  // Rebuild the deterministic projection from the curated payload, exactly
  // like the simulate route does from the database rows.
  const allocations: AllocationWithId[] = design.allocations.map((row) => ({
    id: row.id,
    segment_type: toSupportedSegmentType(row.segment_type),
    label: row.label,
    percentage: row.percentage !== null ? String(row.percentage) : '',
    token_amount: row.token_amount !== null ? String(row.token_amount) : '',
  }))
  const schedules = buildStep4Schedules(
    design.allocations.map((row) => ({
      id: row.id,
      segment_type: row.segment_type ?? 'other',
    })),
    design.vesting,
  )
  const emission: EmissionModelFormData | null = design.emission?.type
    ? {
        type: design.emission.type as EmissionModelFormData['type'],
        annual_inflation_rate:
          design.emission.annual_inflation_rate?.toString() || '',
        inflation_schedule: Array.isArray(design.emission.inflation_schedule)
          ? design.emission.inflation_schedule.map((item) => ({
              year: String(item.year),
              rate: String(item.rate),
            }))
          : [],
      }
    : null
  const maxSupply = design.supply?.max_supply
    ? String(design.supply.max_supply)
    : ''
  const supply = computeSupplyProjection(
    buildProjectionInputs({
      allocations,
      schedules,
      maxSupply,
      emission,
      tgeDate: project.tge_date,
    }),
  )
  const hasProjection = allocations.length > 0 && supply.maxSupply > 0

  // Unlock areas + the minted series (same assembly as the studio panel).
  const lastTimelineIdx = supply.timeline.length - 1
  const supplyChartData: VestingTimelinePoint[] = hasProjection
    ? supply.points.map((point) => {
        const base = supply.timeline[Math.min(point.month, lastTimelineIdx)]
        const row: VestingTimelinePoint = {
          month: point.month,
          date: point.date,
          total: point.circulating,
        }
        for (const { key } of supply.segmentKeys) {
          if (supply.customSegments.includes(key)) continue
          row[key] = (base[key] as number) ?? 0
        }
        if (supply.emissionActive) row[EMISSION_KEY] = point.minted
        return row
      })
    : []
  const chartSegments = supply.segmentKeys
    .filter(({ key }) => !supply.customSegments.includes(key))
    .map(({ key, segment_type }) => ({ label: key, segment_type }))

  const donutSegments = design.allocations
    .filter((row) => row.percentage !== null && row.percentage > 0)
    .map((row) => ({
      label: row.label,
      segment_type: row.segment_type ?? 'other',
      percentage: Number(row.percentage),
      token_amount: row.token_amount !== null ? String(row.token_amount) : null,
    }))

  const vestingByAllocation = new Map(
    design.vesting.map((row) => [row.allocation_id, row]),
  )
  const totalRaisedUsd = design.funding.reduce(
    (sum, round) => sum + (round.amount_usd ?? 0),
    0,
  )

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-4xl items-center justify-between px-6 py-6">
        <Logo />
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            Shared tokenomics design
          </span>
          <PrintButton />
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl space-y-10 px-6 pb-20">
        {/* ── Identity ─────────────────────────────────────────────────── */}
        <section className="space-y-3 pt-6">
          <div className="flex flex-wrap items-baseline gap-3">
            <h1 className="text-4xl font-semibold tracking-tight">
              {project.name}
            </h1>
            <span className="tabular text-xl text-muted-foreground">
              {project.ticker}
            </span>
          </div>
          {(categoryLabel || sectorLabel) && (
            <p className="text-sm text-muted-foreground">
              {[categoryLabel, sectorLabel].filter(Boolean).join(' · ')}
            </p>
          )}
          {project.notes && (
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {project.notes}
            </p>
          )}
        </section>

        {/* ── Headline facts ───────────────────────────────────────────── */}
        {hasProjection && (
          <LightpaperStats
            ticker={project.ticker}
            maxSupply={supply.maxSupply}
            finalCirculating={supply.finalCirculating}
            finalCirculatingPctOfMax={supply.finalCirculatingPctOfMax}
            horizonMonths={supply.horizonMonths}
            totalRaisedUsd={totalRaisedUsd}
            roundsCount={design.funding.length}
          />
        )}

        {/* ── Allocation ───────────────────────────────────────────────── */}
        {donutSegments.length > 0 && (
          <Section kicker="Distribution" title="Token allocation">
            <div className="flex flex-col items-center gap-8 sm:flex-row">
              {/* The dithered donut is a canvas, and the canvas is painted at
                  one device-independent pixel per dither cell — that is what
                  keeps the pattern crisp on screen, and what stops it gaining
                  any resolution on paper. So the SVG donut takes over for the
                  print, which is the artifact an investor keeps. */}
              <div className="print:hidden">
                <AllocationDonutChartDither
                  segments={donutSegments}
                  maxSupply={maxSupply || null}
                  size="lg"
                />
              </div>
              <div className="hidden print:block">
                <AllocationDonutChart
                  segments={donutSegments}
                  maxSupply={maxSupply || null}
                  size="lg"
                />
              </div>
              <div className="w-full flex-1 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="py-1.5 pr-3 text-left font-medium">
                        Segment
                      </th>
                      <th className="py-1.5 px-3 text-right font-medium">
                        Share
                      </th>
                      <th className="py-1.5 pl-3 text-right font-medium">
                        Tokens
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {donutSegments.map((segment) => (
                      <tr
                        key={segment.label}
                        className="border-b last:border-b-0"
                      >
                        <td className="py-1.5 pr-3">
                          {segment.label ||
                            formatSegmentTypeLabel(segment.segment_type)}
                        </td>
                        <td className="tabular py-1.5 px-3 text-right">
                          {segment.percentage.toFixed(2)}%
                        </td>
                        <td className="tabular py-1.5 pl-3 text-right">
                          {segment.token_amount
                            ? formatCompactNumber(Number(segment.token_amount))
                            : '·'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Section>
        )}

        {/* ── Vesting and circulating supply ───────────────────────────── */}
        {hasProjection && (
          <Section kicker="Release" title="Vesting and circulating supply">
            <UnlockTimelineChart
              data={supplyChartData}
              segments={chartSegments}
              maxSupply={supply.maxSupply}
              customSegments={supply.customSegments}
              emissionSeriesKey={
                supply.emissionActive ? EMISSION_KEY : undefined
              }
              height={360}
            />
            {design.vesting.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="py-1.5 pr-3 text-left font-medium">
                        Segment
                      </th>
                      <th className="py-1.5 px-3 text-right font-medium">
                        TGE unlock
                      </th>
                      <th className="py-1.5 px-3 text-right font-medium">
                        Cliff
                      </th>
                      <th className="py-1.5 px-3 text-right font-medium">
                        Duration
                      </th>
                      <th className="py-1.5 pl-3 text-right font-medium">
                        Frequency
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {design.allocations.map((allocation) => {
                      const schedule = vestingByAllocation.get(allocation.id)
                      if (!schedule) return null
                      return (
                        <tr
                          key={allocation.id}
                          className="border-b last:border-b-0"
                        >
                          <td className="py-1.5 pr-3">
                            {allocation.label ||
                              formatSegmentTypeLabel(
                                allocation.segment_type ?? 'other',
                              )}
                          </td>
                          <td className="tabular py-1.5 px-3 text-right">
                            {schedule.tge_percentage ?? 0}%
                          </td>
                          <td className="tabular py-1.5 px-3 text-right">
                            {schedule.cliff_months ?? 0}m
                          </td>
                          <td className="tabular py-1.5 px-3 text-right">
                            {schedule.duration_months ?? 0}m
                          </td>
                          <td className="py-1.5 pl-3 text-right">
                            {schedule.frequency ?? 'monthly'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        )}

        {/* ── Emission ─────────────────────────────────────────────────── */}
        {emission && (
          <Section kicker="Monetary policy" title="Emission">
            <p className="text-sm">
              {EMISSION_TYPE_LABELS[emission.type] ?? emission.type}
              {emission.annual_inflation_rate &&
                `, ${emission.annual_inflation_rate}% annual inflation`}
              {supply.emissionActive &&
                supply.finalCirculatingPctOfMax !== null &&
                supply.finalCirculatingPctOfMax > 100 &&
                ` (supply grows past the hard cap over the horizon)`}
            </p>
            {(emission.inflation_schedule ?? []).length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-auto text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="py-1.5 pr-6 text-left font-medium">
                        Year
                      </th>
                      <th className="py-1.5 text-right font-medium">Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(emission.inflation_schedule ?? []).map((item) => (
                      <tr key={item.year} className="border-b last:border-b-0">
                        <td className="tabular py-1.5 pr-6">Y{item.year}</td>
                        <td className="tabular py-1.5 text-right">
                          {item.rate}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        )}

        {/* ── Funding ──────────────────────────────────────────────────── */}
        {design.funding.length > 0 && (
          <Section kicker="Capital" title="Funding rounds">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="py-1.5 pr-3 text-left font-medium">Round</th>
                    <th className="py-1.5 px-3 text-left font-medium">Date</th>
                    <th className="py-1.5 px-3 text-right font-medium">
                      Token price
                    </th>
                    <th className="py-1.5 px-3 text-right font-medium">
                      Tokens
                    </th>
                    <th className="py-1.5 pl-3 text-right font-medium">
                      Raised
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {design.funding.map((round, index) => (
                    <tr key={index} className="border-b last:border-b-0">
                      <td className="py-1.5 pr-3 capitalize">
                        {round.label || round.round_type}
                      </td>
                      <td className="py-1.5 px-3">
                        {round.round_date ?? 'Not set'}
                      </td>
                      <td className="tabular py-1.5 px-3 text-right">
                        {round.token_price_usd !== null
                          ? `$${round.token_price_usd}`
                          : '·'}
                      </td>
                      <td className="tabular py-1.5 px-3 text-right">
                        {round.tokens_sold !== null
                          ? formatCompactNumber(round.tokens_sold)
                          : '·'}
                      </td>
                      <td className="tabular py-1.5 pl-3 text-right">
                        {round.amount_usd !== null
                          ? `$${formatUsd(round.amount_usd)}`
                          : '·'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        {/* ── Stress test ──────────────────────────────────────────────── */}
        {design.snapshots.length > 0 && (
          <Section kicker="Monte-Carlo" title="Stress test">
            <LightpaperStressTest snapshots={design.snapshots} />
          </Section>
        )}
      </main>

      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-3 px-6 py-6 text-xs text-muted-foreground">
          <Logo />
          <span>
            Designed with TrustNomiks Factory. Projections are hypothetical
            stress outcomes, not predictions.
          </span>
        </div>
      </footer>
    </div>
  )
}
