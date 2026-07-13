import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
// Subpath imports (not the barrel): keeps the server bundle to the pure
// modules this route actually runs (same rule as the benchmarks route).
import {
  buildProjectionInputs,
  computeSupplyProjection,
} from '@/lib/tokenomics/projections'
import { buildStep4Schedules } from '@/lib/tokenomics/schedules'
import {
  toSupportedSegmentType,
  type EmissionModelFormData,
} from '@/lib/tokenomics/schemas'
import type { AllocationWithId } from '@/lib/tokenomics/math'
import {
  MAX_SAVED_SCENARIOS,
  SimulationInputError,
  factorySimulationScenarioSchema,
  runSimulation,
} from '@/lib/tokenomics/simulation'

/**
 * The client only sends scenario ASSUMPTIONS (price, depth, sell shares,
 * macro windows, liquidity events, crises, seed). The design itself is
 * reloaded from the database under RLS: the server never trusts
 * client-provided tokenomics. When `persist` is present the run is also
 * saved as a named snapshot, so persisted results are always
 * server-computed - and this route stays the single choke point for any
 * future run accounting.
 */
const bodySchema = z.object({
  projectId: z.string().uuid(),
  scenario: factorySimulationScenarioSchema,
  persist: z.object({ name: z.string().trim().min(1).max(80) }).optional(),
})

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Explicit contributor gate: client affordances are not trusted.
    const { data: isContributor, error: roleErr } =
      await supabase.rpc('is_contributor')
    if (roleErr) {
      return NextResponse.json({ error: roleErr.message }, { status: 500 })
    }
    if (!isContributor) {
      return NextResponse.json(
        { error: 'Contributor role required' },
        { status: 403 },
      )
    }

    const parsed = bodySchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.issues[0]?.message ?? 'Invalid simulation request',
        },
        { status: 400 },
      )
    }
    const { projectId, scenario, persist } = parsed.data

    // Owner-only RLS: a foreign or unknown project id reads as absent.
    const { data: project, error: projectErr } = await supabase
      .from('factory_projects')
      .select('id, category, updated_at')
      .eq('id', projectId)
      .maybeSingle()
    if (projectErr) {
      return NextResponse.json({ error: projectErr.message }, { status: 500 })
    }
    if (!project) {
      return NextResponse.json({ error: 'Design not found' }, { status: 404 })
    }
    if (!project.category) {
      // Same shape as the benchmarks route's no-sector gate: an explicit
      // reason, not an error (the panel routes the user to Identity).
      return NextResponse.json({ result: null, reason: 'no-category' })
    }

    // Persist pre-checks run BEFORE the simulation: the user never waits
    // for a run that cannot be saved. The DB (unique constraint + cap
    // trigger) remains the invariant; this is the friendly path.
    if (persist) {
      const { data: existing, error: existingErr } = await supabase
        .from('factory_simulation_snapshots')
        .select('name')
        .eq('project_id', projectId)
      if (existingErr) {
        return NextResponse.json(
          { error: existingErr.message },
          { status: 500 },
        )
      }
      const rows = existing ?? []
      if (rows.length >= MAX_SAVED_SCENARIOS) {
        return NextResponse.json(
          {
            error: `Scenario library is full (${MAX_SAVED_SCENARIOS} saved)`,
            reason: 'cap-reached',
          },
          { status: 409 },
        )
      }
      if (rows.some((row) => row.name === persist.name)) {
        return NextResponse.json(
          {
            error: 'A scenario with that name already exists',
            reason: 'duplicate-name',
          },
          { status: 409 },
        )
      }
    }

    const [supplyResult, allocationsResult, emissionResult] = await Promise.all(
      [
        supabase
          .from('factory_supply_metrics')
          .select('max_supply')
          .eq('project_id', projectId)
          .maybeSingle(),
        supabase
          .from('factory_allocation_segments')
          .select('id, segment_type, label, percentage, token_amount')
          .eq('project_id', projectId)
          .order('percentage', { ascending: false }),
        supabase
          .from('factory_emission_models')
          .select('type, annual_inflation_rate, inflation_schedule')
          .eq('project_id', projectId)
          .maybeSingle(),
      ],
    )
    if (supplyResult.error) {
      return NextResponse.json(
        { error: supplyResult.error.message },
        { status: 500 },
      )
    }
    if (allocationsResult.error) {
      return NextResponse.json(
        { error: allocationsResult.error.message },
        { status: 500 },
      )
    }
    if (emissionResult.error) {
      return NextResponse.json(
        { error: emissionResult.error.message },
        { status: 500 },
      )
    }

    const allocationRows = allocationsResult.data ?? []
    const maxSupply = supplyResult.data?.max_supply
      ? String(supplyResult.data.max_supply)
      : ''
    if (allocationRows.length === 0 || !maxSupply) {
      return NextResponse.json({ result: null, reason: 'no-design' })
    }

    const { data: vestingRows, error: vestingErr } = await supabase
      .from('factory_vesting_schedules')
      .select('*')
      .in(
        'allocation_id',
        allocationRows.map((row) => row.id),
      )
    if (vestingErr) {
      return NextResponse.json({ error: vestingErr.message }, { status: 500 })
    }

    const allocations: AllocationWithId[] = allocationRows.map((row) => ({
      id: row.id,
      segment_type: toSupportedSegmentType(row.segment_type),
      label: row.label,
      percentage: String(row.percentage ?? ''),
      token_amount: row.token_amount ? String(row.token_amount) : '',
    }))
    const schedules = buildStep4Schedules(
      allocationRows.map((row) => ({
        id: row.id,
        segment_type: row.segment_type,
      })),
      vestingRows ?? [],
    )
    const emissionRow = emissionResult.data
    const emission: EmissionModelFormData | null = emissionRow
      ? {
          type: emissionRow.type,
          annual_inflation_rate:
            emissionRow.annual_inflation_rate?.toString() || '',
          inflation_schedule: Array.isArray(emissionRow.inflation_schedule)
            ? (
                emissionRow.inflation_schedule as Array<{
                  year: number
                  rate: number
                }>
              ).map((item) => ({
                year: String(item.year),
                rate: String(item.rate),
              }))
            : [],
        }
      : null

    const supply = computeSupplyProjection(
      buildProjectionInputs({
        allocations,
        schedules,
        maxSupply,
        emission,
        tgeDate: null,
      }),
    )

    const result = runSimulation(supply, {
      seed: scenario.seed,
      nPaths: scenario.nPaths,
      initialPriceUsd: scenario.initialPriceUsd,
      marketDepthUsd: scenario.marketDepthUsd,
      category: project.category,
      pctSoldByType: scenario.pctSoldByType,
      pctSoldEmission: scenario.pctSoldEmission,
      macroWindows: scenario.macroWindows,
      crises: scenario.crises,
      liquidityEvents: scenario.liquidityEvents,
      horizonMonths: supply.horizonMonths,
    })

    if (persist) {
      const { data: snapshot, error: insertErr } = await supabase
        .from('factory_simulation_snapshots')
        .insert({
          project_id: projectId,
          name: persist.name,
          scenario,
          result,
          engine_version: result.meta.engineVersion,
          design_updated_at: project.updated_at,
        })
        .select()
        .single()
      if (insertErr) {
        // Residual race past the pre-checks (23505 unique name, 23514 cap
        // trigger): the run itself is fine, so return it with the reason
        // instead of discarding server work.
        const persistError =
          insertErr.code === '23505'
            ? 'duplicate-name'
            : insertErr.code === '23514'
              ? 'cap-reached'
              : 'insert-failed'
        return NextResponse.json({ result, snapshot: null, persistError })
      }
      return NextResponse.json({ result, snapshot })
    }

    return NextResponse.json({ result, snapshot: null })
  } catch (err) {
    if (err instanceof SimulationInputError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    console.error('Factory simulate error:', err)
    return NextResponse.json(
      { error: 'Failed to run the simulation' },
      { status: 500 },
    )
  }
}
