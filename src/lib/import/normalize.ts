import type {
  ExtractedSegment,
  ExtractedVesting,
  ExtractionResult,
  ImportSuggestions,
  SuggestedSegment,
  SuggestedVesting,
} from './schemas'

const DAYS_PER_MONTH = 30.44

/** Format a number the way the form stores it: plain string, no exponent. */
export function formatFormNumber(value: number): string {
  if (!Number.isFinite(value)) return ''
  if (Number.isInteger(value) && Math.abs(value) < Number.MAX_SAFE_INTEGER) {
    return value.toLocaleString('en-US', { useGrouping: false })
  }
  // Two decimals max, trailing zeros trimmed ("24.50" -> "24.5")
  return value
    .toFixed(2)
    .replace(/\.?0+$/, '')
    .replace(/^-0$/, '0')
}

/**
 * Deterministic conversion of an extracted vesting description into the
 * form's model (tge%, cliff months, cliff unlock %, total duration from TGE,
 * frequency). Never invents: what cannot be derived stays empty, with a
 * warning the review UI must surface.
 */
export function normalizeVesting(
  raw: ExtractedVesting,
  segmentLabel: string,
): { vesting: SuggestedVesting; warnings: string[] } {
  const warnings: string[] = []
  const noteParts: string[] = raw.notes ? [raw.notes] : []

  const tge = raw.tge_percentage
  const cliffUnlock = raw.cliff_unlock_percentage
  let cliff = raw.cliff_months
  let duration = raw.duration_months
  let frequency = raw.frequency

  // R3: a vesting start offset from TGE has no form field; fold it into the
  // cliff so the timeline stays truthful from the TGE reference point.
  if (raw.start_offset_months && raw.start_offset_months > 0) {
    cliff = (cliff ?? 0) + raw.start_offset_months
    if (duration != null) duration += raw.start_offset_months
    noteParts.push(
      `Vesting starts ${formatFormNumber(raw.start_offset_months)} months after TGE; folded into the cliff.`,
    )
  }

  // R3: derive duration from a per-period rate when the source gives one.
  const remaining = 100 - (tge ?? 0) - (cliffUnlock ?? 0)
  if (raw.rate_percent_per_period && raw.rate_period) {
    const periods = remaining / raw.rate_percent_per_period
    const monthsOfLinear =
      raw.rate_period === 'day'
        ? periods / DAYS_PER_MONTH
        : raw.rate_period === 'year'
          ? periods * 12
          : periods
    const derived = Math.round((cliff ?? 0) + monthsOfLinear)

    if (duration == null) {
      duration = derived
    } else if (Math.abs(duration - derived) > 1) {
      warnings.push(
        `${segmentLabel}: stated duration (${duration} months) disagrees with the ${raw.rate_percent_per_period}% per ${raw.rate_period} rate (${derived} months); kept the stated duration.`,
      )
    }
    if (!frequency) {
      frequency =
        raw.rate_period === 'day'
          ? 'daily'
          : raw.rate_period === 'year'
            ? 'yearly'
            : 'monthly'
    }
  }

  // Constraint guards mirroring the form's superRefine rules: flag, never
  // silently rewrite user-visible numbers.
  if (cliff != null && duration != null && cliff > duration) {
    warnings.push(
      `${segmentLabel}: cliff (${formatFormNumber(cliff)} months) exceeds total duration (${formatFormNumber(duration)} months); check the source.`,
    )
  }
  if ((tge ?? 0) + (cliffUnlock ?? 0) > 100) {
    warnings.push(
      `${segmentLabel}: TGE unlock plus cliff unlock exceeds 100%; check the source.`,
    )
  }

  return {
    vesting: {
      frequency: frequency ?? '',
      tge_percentage: tge != null ? formatFormNumber(tge) : '',
      cliff_months: cliff != null ? String(Math.round(cliff)) : '',
      duration_months: duration != null ? String(Math.round(duration)) : '',
      cliff_unlock_percentage:
        cliffUnlock != null ? formatFormNumber(cliffUnlock) : '',
      notes: noteParts.join(' '),
    },
    warnings,
  }
}

export interface ExistingSegmentRef {
  label: string
  percentage: number | null
}

export function normalizeSegment(
  raw: ExtractedSegment,
  existing: ExistingSegmentRef[] = [],
): SuggestedSegment {
  const warnings: string[] = []
  let vesting: SuggestedVesting | null = null

  // Enrichment guard: the model may only point at a label that is really in
  // the form (closed list). Anything else downgrades to a new segment.
  let matchedLabel: string | null = null
  if (raw.matched_label) {
    const target = existing.find((e) => e.label === raw.matched_label)
    if (target) {
      matchedLabel = target.label
      // Float tolerance (R2/rounding): percentages from two sources rarely
      // agree to the decimal. The existing allocation stays authoritative;
      // a large gap is surfaced, never silently reconciled.
      if (raw.percentage != null && target.percentage != null) {
        const delta = Math.abs(raw.percentage - target.percentage)
        if (delta > 0.75) {
          warnings.push(
            `${raw.label}: this source states ${formatFormNumber(raw.percentage)}% but the segment "${target.label}" holds ${formatFormNumber(target.percentage)}%; your allocation figure is kept.`,
          )
        }
      }
    } else {
      warnings.push(
        `${raw.label}: the extractor pointed at "${raw.matched_label}", which is not in the form; treated as a new segment.`,
      )
    }
  }

  if (raw.data_unavailable) {
    warnings.push(
      `${raw.label}: the source marks this bucket as undocumented; no vesting was suggested.`,
    )
  } else if (raw.vesting) {
    const normalized = normalizeVesting(raw.vesting, raw.label)
    vesting = normalized.vesting
    warnings.push(...normalized.warnings)
  }

  if (raw.confidence === 'low') {
    warnings.push(
      `${raw.label}: low extraction confidence (truncated or ambiguous in the source); verify before saving.`,
    )
  }

  return {
    label: raw.label,
    percentage: raw.percentage != null ? formatFormNumber(raw.percentage) : '',
    token_amount:
      raw.token_amount != null ? formatFormNumber(raw.token_amount) : '',
    confidence: raw.confidence,
    dataUnavailable: raw.data_unavailable,
    matchedLabel,
    vesting,
    warnings,
  }
}

export function normalizeExtraction(
  raw: ExtractionResult,
  existing: ExistingSegmentRef[] = [],
): ImportSuggestions {
  const warnings = [...raw.warnings]
  const segments = raw.segments.map((s) => normalizeSegment(s, existing))

  // R4/soft gate: the sum is informative, never blocking. Only NEW segments
  // count: enrichment rows re-describe allocations already in the form.
  const newRaw = raw.segments.filter((s, i) => segments[i].matchedLabel == null)
  const total = newRaw.reduce((sum, s) => sum + (s.percentage ?? 0), 0)
  if (newRaw.some((s) => s.percentage != null)) {
    const rounded = Math.round(total * 100) / 100
    if (Math.abs(rounded - 100) > 0.5) {
      warnings.push(
        `Extracted allocations sum to ${formatFormNumber(rounded)}%, not 100%; the source may be partial.`,
      )
    }
  }

  // R2: percentages relative to something other than a hard max supply must
  // be flagged so the Supply section is filled accordingly.
  if (raw.supply_basis === 'genesis') {
    warnings.push(
      'Percentages are relative to the genesis/initial supply (no hard max supply in the source); fill Supply accordingly.',
    )
  } else if (raw.supply_basis === 'unknown') {
    warnings.push(
      'The source does not state which supply the percentages refer to.',
    )
  }

  return {
    tokenName: raw.token_name || null,
    tokenTicker: raw.token_ticker || null,
    supplyBasis: raw.supply_basis,
    baseSupply:
      raw.base_supply != null ? formatFormNumber(raw.base_supply) : null,
    segments,
    warnings,
  }
}
