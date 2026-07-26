import { z } from 'zod'

import { VESTING_FREQUENCIES } from '@/lib/tokenomics/schemas'

/**
 * Contract for what the extraction model returns (structured output).
 *
 * Design rules baked into the shape (tasks/import-eval/form-mapping-gaps.md):
 * - No segment_type here: categorization stays with the user (decision D1).
 * - The model reports rates as it saw them (rate_percent_per_period) so the
 *   deterministic normalizer converts them; the model never does arithmetic.
 * - data_unavailable marks buckets the source explicitly leaves undocumented
 *   (e.g. an "Untracked" row): honesty over invention.
 */
export const extractedVestingSchema = z.object({
  tge_percentage: z.number().nullable(),
  cliff_months: z.number().nullable(),
  cliff_unlock_percentage: z.number().nullable(),
  duration_months: z.number().nullable(),
  frequency: z.enum(VESTING_FREQUENCIES).nullable(),
  rate_percent_per_period: z.number().nullable(),
  rate_period: z.enum(['day', 'month', 'year']).nullable(),
  start_offset_months: z.number().nullable(),
  notes: z.string().nullable(),
})

export const extractedSegmentSchema = z.object({
  label: z.string(),
  percentage: z.number().nullable(),
  token_amount: z.number().nullable(),
  data_unavailable: z.boolean(),
  confidence: z.enum(['high', 'medium', 'low']),
  /**
   * When existing segment labels were provided with the request, the EXACT
   * existing label this round corresponds to (closed list, so the model can
   * only point at a real segment), else null. Enrichment mode hangs on this.
   */
  matched_label: z.string().nullable(),
  vesting: extractedVestingSchema.nullable(),
  notes: z.string().nullable(),
})

export const extractionResultSchema = z.object({
  token_name: z.string().nullable(),
  token_ticker: z.string().nullable(),
  supply_basis: z.enum(['max', 'genesis', 'unknown']),
  base_supply: z.number().nullable(),
  segments: z.array(extractedSegmentSchema),
  warnings: z.array(z.string()),
})

export type ExtractedVesting = z.infer<typeof extractedVestingSchema>
export type ExtractedSegment = z.infer<typeof extractedSegmentSchema>
export type ExtractionResult = z.infer<typeof extractionResultSchema>

/** Request body accepted by POST /api/import/extract. */
export const extractRequestSchema = z
  .object({
    text: z.string().max(20_000).optional(),
    image: z
      .object({
        media_type: z.enum(['image/png', 'image/jpeg', 'image/webp']),
        // ~5MB binary once base64-decoded
        data: z.string().max(7_000_000),
      })
      .optional(),
    source_url: z.string().url().optional(),
    /** Segments already in the form (label + held %), for enrichment matching. */
    existing_segments: z
      .array(
        z.object({
          label: z.string().min(1).max(120),
          percentage: z.number().nullable(),
        }),
      )
      .max(60)
      .optional(),
  })
  .refine((body) => Boolean(body.text?.trim()) || Boolean(body.image), {
    message: 'Provide pasted text or an image',
  })

export type ExtractRequest = z.infer<typeof extractRequestSchema>

/**
 * What the review UI consumes: form-ready values (strings, like the form
 * stores them) plus per-segment warnings the user must see.
 */
export interface SuggestedVesting {
  frequency: (typeof VESTING_FREQUENCIES)[number] | ''
  tge_percentage: string
  cliff_months: string
  duration_months: string
  cliff_unlock_percentage: string
  notes: string
}

export interface SuggestedSegment {
  label: string
  percentage: string
  token_amount: string
  confidence: 'high' | 'medium' | 'low'
  dataUnavailable: boolean
  /** Existing segment this row enriches (validated against the form), or null for a new segment. */
  matchedLabel: string | null
  vesting: SuggestedVesting | null
  warnings: string[]
}

export interface ImportSuggestions {
  tokenName: string | null
  tokenTicker: string | null
  supplyBasis: 'max' | 'genesis' | 'unknown'
  baseSupply: string | null
  segments: SuggestedSegment[]
  warnings: string[]
}
