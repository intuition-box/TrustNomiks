import { formatSegmentTypeLabel, type ClaimAttribution } from '@/types/form'
import type { AllocationWithId } from './form-helpers'

// The pure schedule builders (buildStep4Schedules, calculateCompleteness) live
// in the shared tokenomics domain library; re-exported here so existing
// importers stay untouched. The Sources-only attribution helpers below are
// screener-specific and stay in this file.
export {
  buildStep4Schedules,
  calculateCompleteness,
} from '@/lib/tokenomics/schedules'

// Build the default attribution rows.
// Uses allocation.id as claim_id for both allocation_segment and vesting_schedule.
export function buildDefaultAttributions(
  allocations: AllocationWithId[],
  existingAttributions?: ClaimAttribution[],
): ClaimAttribution[] {
  const rows: ClaimAttribution[] = [
    {
      claim_type: 'token_identity',
      claim_id: null,
      label: 'Token Identity',
      data_source_ids: [],
    },
    {
      claim_type: 'supply_metrics',
      claim_id: null,
      label: 'Supply Metrics',
      data_source_ids: [],
    },
    ...allocations.map((a) => ({
      claim_type: 'allocation_segment' as const,
      claim_id: a.id,
      label: `${a.label} (${formatSegmentTypeLabel(a.segment_type)})`,
      data_source_ids: [] as string[],
    })),
    ...allocations.map((a) => ({
      claim_type: 'vesting_schedule' as const,
      claim_id: a.id,
      label: `Vesting: ${a.label}`,
      data_source_ids: [] as string[],
    })),
    {
      claim_type: 'emission_model',
      claim_id: null,
      label: 'Emission Model',
      data_source_ids: [],
    },
  ]
  if (!existingAttributions || existingAttributions.length === 0) return rows
  // Merge existing selections into the default rows
  return rows.map((row) => {
    const key = `${row.claim_type}:${row.claim_id ?? 'null'}`
    const existing = existingAttributions.find(
      (a) => `${a.claim_type}:${a.claim_id ?? 'null'}` === key,
    )
    return existing
      ? { ...row, data_source_ids: existing.data_source_ids }
      : row
  })
}

// Aggregate selection state of one source across a family of attribution rows
// (e.g. every allocation-segment row, or every vesting-schedule row). Powers
// the bulk pill in Step6Sources: 'all' when every row in rowIdxs already has
// the source, 'some' when at least one (but not all) does, 'none' otherwise.
export type BulkPillState = 'all' | 'some' | 'none'

export function getBulkPillState(
  attributions: ClaimAttribution[],
  rowIdxs: number[],
  sourceIdx: string,
): BulkPillState {
  if (rowIdxs.length === 0) return 'none'
  const selectedCount = rowIdxs.filter((i) =>
    attributions[i]?.data_source_ids.includes(sourceIdx),
  ).length
  if (selectedCount === 0) return 'none'
  if (selectedCount === rowIdxs.length) return 'all'
  return 'some'
}

// Toggle one source across every row in rowIdxs in a single pass: if all rows
// already carry it, remove it from all of them; otherwise add it to whichever
// rows are missing it. Mirrors the single-pill handler in Step6Sources, just
// applied over a mapped set of rows instead of one.
export function toggleBulkAttribution(
  attributions: ClaimAttribution[],
  rowIdxs: number[],
  sourceIdx: string,
): ClaimAttribution[] {
  const shouldRemove =
    getBulkPillState(attributions, rowIdxs, sourceIdx) === 'all'
  return attributions.map((a, i) => {
    if (!rowIdxs.includes(i)) return a
    const has = a.data_source_ids.includes(sourceIdx)
    if (shouldRemove) {
      if (!has) return a
      return {
        ...a,
        data_source_ids: a.data_source_ids.filter((id) => id !== sourceIdx),
      }
    }
    if (has) return a
    return { ...a, data_source_ids: [...a.data_source_ids, sourceIdx] }
  })
}
