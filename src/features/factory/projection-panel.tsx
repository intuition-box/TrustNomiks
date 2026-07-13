'use client'

import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  TrendingDown,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { StatTile } from '@/components/composite/stat-tile'
import { UnlockTimelineChart } from '@/components/charts/unlock-timeline-chart'
import { SellPressureChart } from '@/components/charts/sell-pressure-chart'
import { getSegmentChartColor } from '@/lib/design/tokens'
import {
  DEFAULT_EMISSION_SELL_PCT,
  DEFAULT_SELL_PRESSURE_PCT,
  SEGMENT_TYPES,
  buildProjectionInputs,
  computeSellPressure,
  computeSupplyProjection,
  formatSegmentTypeLabel,
  formatUsd,
  parseDecimal,
  summarizeFundingRounds,
  summarizeProjection,
  type FactorySimulationScenarioInput,
  type ProjectionScenario,
  type SegmentType,
  type VestingTimelinePoint,
} from '@/lib/tokenomics'
import { useFactoryForm } from './factory-form-context'
import { SimulationStudio } from './simulation-studio'

/** Series key for minted supply; suffixed to dodge a same-named segment. */
const EMISSION_KEY = 'Emission (minted)'

const toPositive = (value: string): number | null => {
  if (!value.trim()) return null
  const parsed = parseDecimal(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

/**
 * Deterministic projections of the design's current form state (the panel
 * lives inside the builder as the Projections section, mounted for the whole
 * session): circulating-supply curve (unlocks + emission) and the nominal
 * monthly sell pressure the scenario assumptions imply. Assumptions are
 * ephemeral: they describe a hypothesis, not the design, and are not
 * persisted (a future iteration will snapshot them).
 */
export function ProjectionPanel() {
  const {
    projectId,
    allocations,
    step4Form,
    step5Form,
    _lw6rounds,
    maxSupply,
    preventScrollChange,
    selectInputValue,
  } = useFactoryForm()

  // Live subscriptions: the panel stays mounted while the user edits other
  // sections, so it must track the vesting and emission forms, not read
  // them once (watch() re-renders this component on every form change).
  const schedulesLive = step4Form.watch('schedules')
  const emissionLive = step5Form.watch()

  const inputs = useMemo(
    () =>
      buildProjectionInputs({
        allocations,
        schedules: schedulesLive,
        maxSupply,
        emission: emissionLive,
        tgeDate: null,
      }),
    [allocations, maxSupply, schedulesLive, emissionLive],
  )

  const supply = useMemo(() => computeSupplyProjection(inputs), [inputs])

  // Scenario knobs. pctSoldByType only stores user overrides; display and
  // the engine both fall back to DEFAULT_SELL_PRESSURE_PCT.
  const [pctSoldByType, setPctSoldByType] = useState<Record<string, number>>({})
  const [pctSoldEmission, setPctSoldEmission] = useState(
    DEFAULT_EMISSION_SELL_PCT,
  )
  // The reference price follows the latest funding round until the user
  // types their own value (rounds are usually added after this panel mounts):
  // the displayed value is derived, not synced through an effect.
  const [priceInput, setPriceInput] = useState('')
  const [priceTouched, setPriceTouched] = useState(false)
  const derivedPriceUsd = useMemo(
    () => summarizeFundingRounds(_lw6rounds ?? [], maxSupply).latestPriceUsd,
    [_lw6rounds, maxSupply],
  )
  const effectivePriceInput = priceTouched
    ? priceInput
    : derivedPriceUsd !== null
      ? String(derivedPriceUsd)
      : ''
  const [depthInput, setDepthInput] = useState('')

  const scenario = useMemo<ProjectionScenario>(
    () => ({
      pctSoldByType,
      pctSoldEmission,
      refPriceUsd: toPositive(effectivePriceInput),
      marketDepthUsd: toPositive(depthInput),
    }),
    [pctSoldByType, pctSoldEmission, effectivePriceInput, depthInput],
  )

  const pressure = useMemo(
    () => computeSellPressure(supply, scenario),
    [supply, scenario],
  )
  const summary = useMemo(
    () => summarizeProjection(supply, pressure, scenario),
    [supply, pressure, scenario],
  )

  const presentTypes = useMemo(() => {
    const present = new Set(
      inputs.allocations.map((a) => a.segment_type).filter(Boolean),
    )
    const ordered = SEGMENT_TYPES.filter((t) => present.has(t))
    const extras = [...present].filter(
      (t) => !(SEGMENT_TYPES as readonly string[]).includes(t),
    )
    return [...ordered, ...extras]
  }, [inputs])

  const pctFor = (type: string): number =>
    pctSoldByType[type] ?? DEFAULT_SELL_PRESSURE_PCT[type as SegmentType] ?? 0

  // Unlock areas + the minted series, on the supply projection's horizon
  // (the vesting timeline is held flat past its end).
  const supplyChartData = useMemo<VestingTimelinePoint[]>(() => {
    const lastTimelineIdx = supply.timeline.length - 1
    return supply.points.map((point) => {
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
  }, [supply])

  const chartSegments = useMemo(
    () =>
      supply.segmentKeys
        .filter(({ key }) => !supply.customSegments.includes(key))
        .map(({ key, segment_type }) => ({ label: key, segment_type })),
    [supply],
  )

  // Loading a saved scenario pushes its assumptions back into the panel's
  // knobs, so the deterministic charts and the studio agree again (plain
  // event-handler setState, same no-effect discipline as the prefill).
  const applyScenarioAssumptions = (
    saved: FactorySimulationScenarioInput,
  ): void => {
    setPriceTouched(true)
    setPriceInput(String(saved.initialPriceUsd))
    setDepthInput(
      saved.marketDepthUsd !== null ? String(saved.marketDepthUsd) : '',
    )
    setPctSoldByType(saved.pctSoldByType)
    setPctSoldEmission(saved.pctSoldEmission)
  }

  // Fully resolved record (overrides + defaults) for the stress-test route:
  // the server must see exactly the shares the sliders display.
  const resolvedPctSoldByType = useMemo(() => {
    const record: Record<string, number> = {}
    for (const type of presentTypes) {
      record[type] =
        pctSoldByType[type] ??
        DEFAULT_SELL_PRESSURE_PCT[type as SegmentType] ??
        0
    }
    return record
  }, [presentTypes, pctSoldByType])

  if (inputs.allocations.length === 0 || supply.maxSupply <= 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Add a max supply, allocations and vesting to project this design.
      </p>
    )
  }

  const monthsAbove = summary.monthsAboveDepth

  return (
    <section className="space-y-4">
      <p className="text-sm text-muted-foreground">
        A deterministic read of the design as it stands: how supply enters
        circulation, and the sell pressure your assumptions imply.
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          label="Implied FDV"
          icon={Banknote}
          accentVar="--data-wallet"
          value={
            summary.impliedFdvUsd !== null ? (
              <span className="tabular">
                ${formatUsd(summary.impliedFdvUsd)}
              </span>
            ) : (
              'Not set'
            )
          }
          hint="reference price x max supply"
        />
        <StatTile
          label="Heaviest month"
          icon={TrendingDown}
          value={
            summary.worstMonth ? (
              <span className="tabular">M{summary.worstMonth.month}</span>
            ) : (
              'Not set'
            )
          }
          hint={
            summary.worstMonth
              ? summary.worstMonth.soldUsd !== null
                ? `$${formatUsd(summary.worstMonth.soldUsd)} sold${
                    summary.worstMonth.priceImpactPct !== null
                      ? `, est. ${summary.worstMonth.priceImpactPct.toFixed(1)}% impact`
                      : ''
                  }`
                : 'set a reference price for USD figures'
              : 'nothing is sold under these assumptions'
          }
        />
        <StatTile
          label="Months above depth"
          icon={
            monthsAbove !== null && monthsAbove > 0
              ? AlertTriangle
              : CheckCircle2
          }
          accentVar={
            monthsAbove !== null && monthsAbove > 0 ? '--warning' : '--success'
          }
          value={
            monthsAbove !== null ? (
              <span className="tabular">{monthsAbove}</span>
            ) : (
              'Not set'
            )
          }
          hint={
            monthsAbove !== null
              ? 'months selling more than the 2% depth'
              : 'set a price and a market depth'
          }
        />
      </div>

      <div className="space-y-5 rounded-xl border bg-surface-1 px-5 py-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label
              htmlFor="projection-ref-price"
              className="text-sm font-medium"
            >
              Reference price (USD)
            </label>
            <Input
              id="projection-ref-price"
              type="number"
              min="0"
              step="0.0001"
              placeholder="e.g. 0.02"
              value={effectivePriceInput}
              onChange={(e) => {
                setPriceTouched(true)
                setPriceInput(e.target.value)
              }}
              onWheel={preventScrollChange}
              onDoubleClick={selectInputValue}
            />
            <p className="text-xs text-muted-foreground">
              Prefilled from the latest funding round when one exists.
            </p>
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="projection-market-depth"
              className="text-sm font-medium"
            >
              2% market depth (USD)
            </label>
            <Input
              id="projection-market-depth"
              type="number"
              min="0"
              step="1000"
              placeholder="e.g. 500000"
              value={depthInput}
              onChange={(e) => setDepthInput(e.target.value)}
              onWheel={preventScrollChange}
              onDoubleClick={selectInputValue}
            />
            <p className="text-xs text-muted-foreground">
              Order-book depth within 2% of the price you expect at launch.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium">Share sold at unlock</p>
          {presentTypes.map((type) => (
            <div key={type} className="flex items-center gap-3">
              <span
                className="inline-block h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: getSegmentChartColor(type) }}
                aria-hidden
              />
              <span className="w-32 truncate text-sm">
                {formatSegmentTypeLabel(type)}
              </span>
              <Slider
                value={[pctFor(type)]}
                min={0}
                max={100}
                step={5}
                aria-label={`Share of ${formatSegmentTypeLabel(type)} unlocks sold`}
                onValueChange={([value]) =>
                  setPctSoldByType((prev) => ({ ...prev, [type]: value }))
                }
                className="flex-1"
              />
              <span className="tabular w-10 text-right text-sm">
                {pctFor(type)}%
              </span>
            </div>
          ))}
          {supply.emissionActive && (
            <div className="flex items-center gap-3">
              <span
                className="inline-block h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: 'hsl(var(--data-emission))' }}
                aria-hidden
              />
              <span className="w-32 truncate text-sm">Emission</span>
              <Slider
                value={[pctSoldEmission]}
                min={0}
                max={100}
                step={5}
                aria-label="Share of newly emitted tokens sold"
                onValueChange={([value]) => setPctSoldEmission(value)}
                className="flex-1"
              />
              <span className="tabular w-10 text-right text-sm">
                {pctSoldEmission}%
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-3 rounded-xl border bg-surface-1 px-5 py-4">
        <h3 className="text-sm font-semibold">Circulating supply projection</h3>
        <UnlockTimelineChart
          data={supplyChartData}
          segments={chartSegments}
          maxSupply={supply.maxSupply}
          customSegments={supply.customSegments}
          emissionSeriesKey={supply.emissionActive ? EMISSION_KEY : undefined}
          height={400}
        />
      </div>

      <div className="space-y-3 rounded-xl border bg-surface-1 px-5 py-4">
        <h3 className="text-sm font-semibold">Monthly sell pressure</h3>
        {!pressure.hasPrice && (
          <p className="text-xs text-muted-foreground">
            Token counts for now: set a reference price to see USD pressure and
            the estimated price impact.
          </p>
        )}
        <SellPressureChart
          points={pressure.points}
          hasPrice={pressure.hasPrice}
          refPriceUsd={scenario.refPriceUsd}
          marketDepthUsd={scenario.marketDepthUsd}
          height={320}
        />
      </div>

      <SimulationStudio
        projectId={projectId}
        refPriceUsd={scenario.refPriceUsd}
        marketDepthUsd={scenario.marketDepthUsd}
        pctSoldByType={resolvedPctSoldByType}
        pctSoldEmission={pctSoldEmission}
        horizonMonths={supply.horizonMonths}
        applyScenarioAssumptions={applyScenarioAssumptions}
      />
    </section>
  )
}
