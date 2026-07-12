/**
 * Factory benchmark aggregation — pure functions over the knowledge-graph
 * read path (the kg_*_v1 Supabase views), no I/O. The API route resolves the
 * cohort's token ids FIRST, fetches atoms/triples bounded to that set, then
 * calls buildBenchmarkResponse.
 *
 * Trust model (tasks/factory-plan.md, Phase 2): any contributor can
 * self-promote their own token to 'validated', so the ATTESTED intersection
 * (intuition_atom_mappings.status = 'confirmed', the app's push ledger) is the
 * always-on cohort basis. MIN_COHORT_ATTESTED is a named constant with no
 * runtime override: no query param, header or body field may disable the
 * attested intersection or lower the threshold.
 *
 * NOTE: the cross-user cohort works because the screener child tables keep an
 * open USING(true) SELECT for authenticated users, surfaced through the
 * security_invoker kg views. If that RLS is ever tightened to owner-only,
 * cohorts silently shrink to the caller's own tokens — revisit this module.
 */
import {
  getSectorOption,
  normalizeCategory,
  normalizeSector,
  normalizeSegmentType,
  normalizeVestingFrequency,
  tokenIdentitySchema,
} from './schemas'

export const MIN_COHORT_ATTESTED = 3

// ── Row shapes (mirror kg_atoms_v1 / kg_triples_v1 / tokens) ────────────────

export interface KgAtomRow {
  atom_id: string
  atom_type: string
  label: string | null
  token_id: string | null
  metadata: Record<string, unknown> | null
}

export interface KgTripleRow {
  subject_id: string
  predicate: string
  object_id: string | null
  object_literal: string | null
  token_id: string | null
}

export interface CohortTokenRow {
  id: string
  status: string
  sector: string | null
  category: string | null
}

// ── Response shapes ──────────────────────────────────────────────────────────

export type CohortBasis = 'sector' | 'category' | 'all-attested' | 'none'
export type CohortConfidence = 'high' | 'medium' | 'low' | 'none'

export interface BenchmarkCohort {
  basis: CohortBasis
  /** the sector slug for basis 'sector', the parent category for 'category',
   *  null for 'all-attested'; echoes the requested sector for 'none' */
  key: string | null
  tokenCount: number
  confidence: CohortConfidence
}

export interface AllocationBenchmark {
  medianPct: number
  meanPct: number
  tokenCount: number
}

export interface VestingBenchmark {
  cliffMonths: number | null
  durationMonths: number | null
  tgePct: number | null
  cliffUnlockPct: number | null
  frequency: string | null
  tokenCount: number
}

export interface EmissionBenchmark {
  annualInflationRate: {
    median: number
    mean: number
    tokenCount: number
  } | null
}

export interface FactoryBenchmarkSnapshot {
  requestedSector: string
  cohort: BenchmarkCohort
  allocation: Record<string, AllocationBenchmark>
  vesting: Record<string, VestingBenchmark>
  emission: EmissionBenchmark
  /** stamped by the route when the snapshot is produced */
  generatedAt: string
}

// ── Small math helpers ───────────────────────────────────────────────────────

const round2 = (n: number) => Math.round(n * 100) / 100

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length
}

function mode(values: string[]): string | null {
  if (values.length === 0) return null
  const counts = new Map<string, number>()
  let best: string = values[0]
  for (const v of values) {
    const c = (counts.get(v) ?? 0) + 1
    counts.set(v, c)
    if (c > (counts.get(best) ?? 0)) best = v
  }
  return best
}

// ── Cohort resolution (the attested ladder) ─────────────────────────────────

/**
 * Resolve the cohort: validated ∩ attested tokens, widening
 * sector → parent category → all-attested, with MIN_COHORT_ATTESTED applied
 * identically at every rung. Never returns a cohort of fewer than
 * MIN_COHORT_ATTESTED tokens — below that the basis is 'none'.
 */
export function resolveCohort(input: {
  requestedSector: string
  tokens: CohortTokenRow[]
  attestedTokenIds: ReadonlySet<string>
}): { cohort: BenchmarkCohort; tokenIds: string[] } {
  const sector = normalizeSector(input.requestedSector)
  const attested = input.tokens.filter(
    (t) => t.status === 'validated' && input.attestedTokenIds.has(t.id),
  )

  if (sector) {
    const sectorRung = attested.filter(
      (t) => normalizeSector(t.sector) === sector,
    )
    if (sectorRung.length >= MIN_COHORT_ATTESTED) {
      return {
        cohort: {
          basis: 'sector',
          key: sector,
          tokenCount: sectorRung.length,
          confidence: 'high',
        },
        tokenIds: sectorRung.map((t) => t.id),
      }
    }

    const parentCategory = getSectorOption(sector)?.category ?? null
    if (parentCategory) {
      const categoryRung = attested.filter(
        (t) => normalizeCategory(t.category) === parentCategory,
      )
      if (categoryRung.length >= MIN_COHORT_ATTESTED) {
        return {
          cohort: {
            basis: 'category',
            key: parentCategory,
            tokenCount: categoryRung.length,
            confidence: 'medium',
          },
          tokenIds: categoryRung.map((t) => t.id),
        }
      }
    }
  }

  if (attested.length >= MIN_COHORT_ATTESTED) {
    return {
      cohort: {
        basis: 'all-attested',
        key: null,
        tokenCount: attested.length,
        confidence: 'low',
      },
      tokenIds: attested.map((t) => t.id),
    }
  }

  return {
    cohort: {
      basis: 'none',
      key: sector,
      tokenCount: 0,
      confidence: 'none',
    },
    tokenIds: [],
  }
}

// ── Aggregation ──────────────────────────────────────────────────────────────

/** Build Map<subject_id, number> for one numeric-literal predicate,
 *  restricted to the cohort. object_literal is the canonical numeric::text. */
function literalNumberMap(
  triples: KgTripleRow[],
  predicate: string,
  cohort: ReadonlySet<string>,
): Map<string, number> {
  const map = new Map<string, number>()
  for (const t of triples) {
    if (t.predicate !== predicate) continue
    if (!t.token_id || !cohort.has(t.token_id)) continue
    if (t.object_literal == null) continue
    const n = parseFloat(t.object_literal)
    if (!Number.isNaN(n)) map.set(t.subject_id, n)
  }
  return map
}

interface AllocationPoint {
  tokenId: string
  segmentType: string
  pct: number
}

/** One allocation data point per cohort allocation atom, taxonomy-normalized;
 *  atoms with an unmappable segment_type are dropped (never bucketed as-is). */
function allocationPoints(
  atoms: KgAtomRow[],
  triples: KgTripleRow[],
  cohort: ReadonlySet<string>,
): { points: AllocationPoint[]; byAtomId: Map<string, AllocationPoint> } {
  const pctByAtom = literalNumberMap(triples, 'has Percentage', cohort)
  const points: AllocationPoint[] = []
  const byAtomId = new Map<string, AllocationPoint>()
  for (const a of atoms) {
    if (a.atom_type !== 'allocation') continue
    if (!a.token_id || !cohort.has(a.token_id)) continue
    const rawType = a.metadata?.segment_type
    // normalizeSector collapses underscored slugs but normalizeSegmentType
    // does not; benchmarks bucket across eras of published data, so do it here.
    const segmentType = normalizeSegmentType(
      typeof rawType === 'string' ? rawType.replace(/_/g, '-') : null,
    )
    if (!segmentType) continue
    // Numbers come from the canonical literal triples; the atom metadata is
    // the fallback for rows published before percentages were tripled.
    const metaPct = a.metadata?.percentage
    const pct =
      pctByAtom.get(a.atom_id) ?? (typeof metaPct === 'number' ? metaPct : null)
    if (pct == null) continue
    const point = { tokenId: a.token_id, segmentType, pct }
    points.push(point)
    byAtomId.set(a.atom_id, point)
  }
  return { points, byAtomId }
}

/**
 * Allocation medians per segment type. A token's same-type segments are
 * SUMMED into one data point first (a token with five "team-founders" rows
 * contributes one value), so single-token structure cannot dominate the
 * cross-token median.
 */
export function computeAllocationBenchmarks(
  atoms: KgAtomRow[],
  triples: KgTripleRow[],
  tokenIds: string[],
): Record<string, AllocationBenchmark> {
  const cohort = new Set(tokenIds)
  const { points } = allocationPoints(atoms, triples, cohort)

  // (token, segment_type) → summed pct
  const perToken = new Map<string, number>()
  for (const p of points) {
    const key = `${p.tokenId}::${p.segmentType}`
    perToken.set(key, (perToken.get(key) ?? 0) + p.pct)
  }

  const bySegment = new Map<string, number[]>()
  for (const [key, sum] of perToken) {
    const segmentType = key.split('::')[1]
    const list = bySegment.get(segmentType) ?? []
    list.push(sum)
    bySegment.set(segmentType, list)
  }

  const result: Record<string, AllocationBenchmark> = {}
  for (const [segmentType, values] of bySegment) {
    result[segmentType] = {
      medianPct: round2(median(values)),
      meanPct: round2(mean(values)),
      tokenCount: values.length,
    }
  }
  return result
}

/**
 * Vesting medians per segment type. Vesting atoms carry no segment_type: it
 * is resolved through the 'has Vesting Schedule' triple back to the parent
 * allocation atom's metadata. Per (token, segment_type), the schedule of the
 * LARGEST same-segment allocation is the token's representative (reduction
 * BEFORE the cross-token median, mirroring the allocation pre-aggregation).
 */
export function computeVestingBenchmarks(
  atoms: KgAtomRow[],
  triples: KgTripleRow[],
  tokenIds: string[],
): Record<string, VestingBenchmark> {
  const cohort = new Set(tokenIds)
  const { byAtomId } = allocationPoints(atoms, triples, cohort)

  const cliffByVest = literalNumberMap(triples, 'has Cliff Months', cohort)
  const durationByVest = literalNumberMap(
    triples,
    'has Duration Months',
    cohort,
  )
  const tgeByVest = literalNumberMap(triples, 'has TGE Percentage', cohort)
  const cliffUnlockByVest = literalNumberMap(
    triples,
    'has Cliff Unlock Percentage',
    cohort,
  )
  const freqByVest = new Map<string, string>()
  for (const t of triples) {
    if (t.predicate !== 'has Frequency') continue
    if (!t.token_id || !cohort.has(t.token_id)) continue
    if (t.object_literal) freqByVest.set(t.subject_id, t.object_literal)
  }

  interface Representative {
    allocPct: number
    cliff: number | null
    duration: number | null
    tge: number | null
    cliffUnlock: number | null
    frequency: string | null
  }
  // (token, segment_type) → schedule of the largest same-segment allocation
  const representatives = new Map<string, Representative>()

  for (const t of triples) {
    if (t.predicate !== 'has Vesting Schedule') continue
    if (!t.token_id || !cohort.has(t.token_id)) continue
    if (!t.object_id) continue
    const alloc = byAtomId.get(t.subject_id)
    if (!alloc) continue // allocation missing or its segment_type unmappable

    const key = `${alloc.tokenId}::${alloc.segmentType}`
    const existing = representatives.get(key)
    if (existing && existing.allocPct >= alloc.pct) continue

    representatives.set(key, {
      allocPct: alloc.pct,
      cliff: cliffByVest.get(t.object_id) ?? null,
      duration: durationByVest.get(t.object_id) ?? null,
      tge: tgeByVest.get(t.object_id) ?? null,
      cliffUnlock: cliffUnlockByVest.get(t.object_id) ?? null,
      frequency: normalizeVestingFrequency(freqByVest.get(t.object_id)),
    })
  }

  const bySegment = new Map<string, Representative[]>()
  for (const [key, rep] of representatives) {
    const segmentType = key.split('::')[1]
    const list = bySegment.get(segmentType) ?? []
    list.push(rep)
    bySegment.set(segmentType, list)
  }

  const pick = (
    reps: Representative[],
    f: (r: Representative) => number | null,
  ) => {
    const values = reps.map(f).filter((v): v is number => v != null)
    return values.length ? round2(median(values)) : null
  }

  const result: Record<string, VestingBenchmark> = {}
  for (const [segmentType, reps] of bySegment) {
    result[segmentType] = {
      cliffMonths: pick(reps, (r) => r.cliff),
      durationMonths: pick(reps, (r) => r.duration),
      tgePct: pick(reps, (r) => r.tge),
      cliffUnlockPct: pick(reps, (r) => r.cliffUnlock),
      frequency: mode(
        reps.map((r) => r.frequency).filter((f): f is string => f != null),
      ),
      tokenCount: reps.length,
    }
  }
  return result
}

/** Annual inflation distribution across the cohort (one value per token —
 *  emission_models is UNIQUE per token). */
export function computeEmissionBenchmarks(
  triples: KgTripleRow[],
  tokenIds: string[],
): EmissionBenchmark {
  const cohort = new Set(tokenIds)
  const perToken = new Map<string, number>()
  for (const t of triples) {
    if (t.predicate !== 'has Annual Inflation Rate') continue
    if (!t.token_id || !cohort.has(t.token_id)) continue
    if (t.object_literal == null) continue
    const n = parseFloat(t.object_literal)
    if (!Number.isNaN(n)) perToken.set(t.token_id, n)
  }
  const values = [...perToken.values()]
  if (values.length === 0) return { annualInflationRate: null }
  return {
    annualInflationRate: {
      median: round2(median(values)),
      mean: round2(mean(values)),
      tokenCount: values.length,
    },
  }
}

/** Assemble the full snapshot (minus generatedAt, stamped by the caller). */
export function buildBenchmarkResponse(input: {
  requestedSector: string
  tokens: CohortTokenRow[]
  attestedTokenIds: ReadonlySet<string>
  atoms: KgAtomRow[]
  triples: KgTripleRow[]
}): Omit<FactoryBenchmarkSnapshot, 'generatedAt'> {
  const { cohort, tokenIds } = resolveCohort(input)
  if (cohort.basis === 'none') {
    return {
      requestedSector: input.requestedSector,
      cohort,
      allocation: {},
      vesting: {},
      emission: { annualInflationRate: null },
    }
  }
  return {
    requestedSector: input.requestedSector,
    cohort,
    allocation: computeAllocationBenchmarks(
      input.atoms,
      input.triples,
      tokenIds,
    ),
    vesting: computeVestingBenchmarks(input.atoms, input.triples, tokenIds),
    emission: computeEmissionBenchmarks(input.triples, tokenIds),
  }
}

// ── "Apply benchmark" seed helpers ───────────────────────────────────────────

/**
 * Largest-remainder normalization: scale positive shares so they sum to
 * exactly 100.00 (worked in hundredths so the invariant is exact). The seeded
 * cap table then earns the completeness sum bonus by construction.
 */
export function largestRemainderTo100(
  shares: Record<string, number>,
): Record<string, number> {
  const entries = Object.entries(shares).filter(([, v]) => v > 0)
  const total = entries.reduce((a, [, v]) => a + v, 0)
  if (total <= 0) return {}

  const scaled = entries.map(([key, v]) => {
    const hundredths = (v / total) * 10000
    return { key, floor: Math.floor(hundredths), rem: hundredths % 1 }
  })
  let leftover = 10000 - scaled.reduce((a, s) => a + s.floor, 0)
  const byRemainder = [...scaled].sort(
    (a, b) => b.rem - a.rem || b.floor - a.floor || a.key.localeCompare(b.key),
  )
  for (const s of byRemainder) {
    if (leftover <= 0) break
    s.floor += 1
    leftover -= 1
  }
  return Object.fromEntries(scaled.map((s) => [s.key, s.floor / 100]))
}

export interface VestingSeed {
  frequency: string
  cliff_months: string
  duration_months: string
  tge_percentage: string
  cliff_unlock_percentage: string
  notes: string
}

/**
 * Turn vesting medians into form-space values that satisfy
 * vestingSchedulesSchema's superRefine by construction: independent medians
 * can violate cliff <= duration and tge + cliffUnlock <= 100, so both are
 * clamped here rather than surfacing as validation errors on a seeded form.
 */
export function buildVestingSeed(v: VestingBenchmark): VestingSeed {
  const duration = Math.max(0, Math.round(v.durationMonths ?? 0))
  const cliff = Math.min(Math.max(0, Math.round(v.cliffMonths ?? 0)), duration)
  const tge = Math.min(Math.max(0, round2(v.tgePct ?? 0)), 100)
  const cliffUnlock = Math.min(
    Math.max(0, round2(v.cliffUnlockPct ?? 0)),
    round2(100 - tge),
  )
  return {
    frequency: normalizeVestingFrequency(v.frequency),
    cliff_months: String(cliff),
    duration_months: String(duration),
    tge_percentage: String(tge),
    cliff_unlock_percentage: cliffUnlock > 0 ? String(cliffUnlock) : '',
    notes: '',
  }
}

// ── Factory identity wrapper (advisory) ──────────────────────────────────────

/**
 * Factory-specific identity contract: a design needs a sector (transitively a
 * category) before the benchmark assist can resolve a cohort. This wraps the
 * SHARED tokenIdentitySchema without editing it (the screener legitimately
 * allows an optional sector). It is an ADVISORY gate: the builder never swaps
 * its resolver to this schema (pre-existing empty-sector designs must stay
 * openable); the benchmark panel uses it to explain what is missing.
 */
export const factoryIdentityWithSectorSchema = tokenIdentitySchema.superRefine(
  (data, ctx) => {
    if (!data.category) {
      ctx.addIssue({
        code: 'custom',
        path: ['category'],
        message: 'Pick a category to unlock market benchmarks',
      })
    }
    if (!data.sector) {
      ctx.addIssue({
        code: 'custom',
        path: ['sector'],
        message: 'Pick a sector to unlock market benchmarks',
      })
    }
  },
)
