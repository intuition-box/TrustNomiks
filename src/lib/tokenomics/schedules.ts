import {
  IMMEDIATE_SEGMENT_TYPES,
  normalizeVestingFrequency,
  toSupportedSegmentType,
  type AllocationsFormData,
  type SupplyMetricsFormData,
  type TokenIdentityFormData,
} from './schemas'
import { parseDecimal } from './math'

export function buildStep4Schedules(
  allocationData: Array<{
    id: string
    segment_type: string
  }>,
  vestingData?: Array<{
    allocation_id: string
    frequency?: string | null
    cliff_months?: number | null
    duration_months?: number | null
    tge_percentage?: number | null
    cliff_unlock_percentage?: number | null
    notes?: string | null
  }>,
) {
  const schedules: Record<string, Record<string, string>> = {}

  allocationData.forEach((alloc) => {
    const vestingSchedule = vestingData?.find(
      (v) => v.allocation_id === alloc.id,
    )
    const segmentType = toSupportedSegmentType(alloc.segment_type)
    const isImmediate = IMMEDIATE_SEGMENT_TYPES.includes(segmentType)

    schedules[alloc.id] = vestingSchedule
      ? {
          allocation_id: alloc.id,
          frequency: normalizeVestingFrequency(
            vestingSchedule.frequency ||
              (isImmediate ? 'immediate' : 'monthly'),
          ),
          cliff_months:
            vestingSchedule.cliff_months?.toString() ||
            (isImmediate ? '0' : ''),
          duration_months:
            vestingSchedule.duration_months?.toString() ||
            (isImmediate ? '0' : ''),
          tge_percentage:
            vestingSchedule.tge_percentage?.toString() ||
            (isImmediate ? '100' : ''),
          cliff_unlock_percentage:
            vestingSchedule.cliff_unlock_percentage?.toString() || '',
          notes: vestingSchedule.notes || '',
        }
      : {
          allocation_id: alloc.id,
          frequency: normalizeVestingFrequency(
            isImmediate ? 'immediate' : 'monthly',
          ),
          cliff_months: isImmediate ? '0' : '',
          duration_months: isImmediate ? '0' : '',
          tge_percentage: isImmediate ? '100' : '',
          cliff_unlock_percentage: '',
          notes: '',
        }
  })

  return schedules
}

// Calculate completeness based on filled fields (steps 1-3 only; used ahead of
// the Step 4 RPC save, before vesting/emission/sources exist).
export function calculateCompleteness(
  step1Data: Pick<TokenIdentityFormData, 'contract_address' | 'tge_date'>,
  step2Data: Pick<
    SupplyMetricsFormData,
    'max_supply' | 'initial_supply' | 'tge_supply'
  >,
  step3Data: Pick<AllocationsFormData, 'segments'>,
): number {
  let score = 10 // Base score from step 1

  if (step1Data.contract_address) score += 5
  if (step1Data.tge_date) score += 5

  if (step2Data.max_supply) score += 10
  if (
    step2Data.max_supply &&
    (step2Data.initial_supply || step2Data.tge_supply)
  )
    score += 5

  if (step3Data.segments.length >= 3) score += 10
  // Recalculate total percentage from form data
  const calculatedTotal = step3Data.segments.reduce((total, segment) => {
    const percentage = parseDecimal(segment.percentage) || 0
    return total + percentage
  }, 0)
  if (calculatedTotal === 100) score += 10

  return Math.min(score, 100)
}
