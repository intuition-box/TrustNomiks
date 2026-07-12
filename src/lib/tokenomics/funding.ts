/**
 * Funding rounds — Factory-only domain module (the screener has no funding
 * section). Form-space values are strings, like every other studio schema;
 * numbers are parsed at save time. Funding is an OPTIONAL enrich section and
 * does not participate in the computeFactoryScore / FACTORY_RESCALE contract.
 */
import { z } from 'zod'
import { formatNumber, parseDecimal } from './math'

export const FUNDING_ROUND_TYPE_OPTIONS = [
  { value: 'pre-seed', label: 'Pre-seed' },
  { value: 'seed', label: 'Seed' },
  { value: 'private', label: 'Private' },
  { value: 'strategic', label: 'Strategic' },
  { value: 'public', label: 'Public' },
  { value: 'other', label: 'Other' },
] as const

export type FundingRoundType =
  (typeof FUNDING_ROUND_TYPE_OPTIONS)[number]['value']

export const formatFundingRoundTypeLabel = (value: string): string =>
  FUNDING_ROUND_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value

export const fundingRoundSchema = z.object({
  id: z.string().optional(), // For tracking in UI
  round_type: z.string().min(1, 'Round type is required'),
  label: z.string().optional(),
  round_date: z.string().optional(),
  token_price_usd: z.string().optional(),
  tokens_sold: z.string().optional(),
  amount_usd: z.string().optional(),
  notes: z.string().optional(),
})

// Soft section: zero rounds is a perfectly valid design (funding is optional),
// mirroring the screener's risk-flags shape rather than allocations' min(1).
export const fundingRoundsSchema = z.object({
  rounds: z.array(fundingRoundSchema),
})

export type FundingRoundFormData = z.infer<typeof fundingRoundSchema>
export type FundingRoundsFormData = z.infer<typeof fundingRoundsSchema>

/**
 * Cross-calculate a round's raised amount from its token price and tokens
 * sold (the UI mirror of Step3's percentage -> token_amount). Returns '' when
 * either side is missing/unparsable so a partial row never shows a bogus 0.
 */
export function calculateRoundAmount(
  tokenPriceUsd: string,
  tokensSold: string,
): string {
  if (!tokenPriceUsd || !tokensSold) return ''
  const price = parseDecimal(tokenPriceUsd)
  const tokens = parseFloat(String(tokensSold).replace(/,/g, ''))
  if (Number.isNaN(price) || Number.isNaN(tokens)) return ''
  const amount = price * tokens
  if (!Number.isFinite(amount)) return ''
  return String(Math.round(amount * 100) / 100)
}

export interface FundingSummary {
  roundCount: number
  totalRaisedUsd: number
  totalTokensSold: number
  /** share of max supply sold across rounds; null without a max supply */
  pctOfMaxSupply: number | null
  /** price of the latest round (by date, then list order); null if none set */
  latestPriceUsd: number | null
  /** latest price x max supply; null without both */
  impliedFdvUsd: number | null
}

/**
 * Aggregate the rounds list for the section's summary bar. maxSupply is the
 * formatted form string (commas tolerated), '' when unset.
 */
export function summarizeFundingRounds(
  rounds: FundingRoundFormData[],
  maxSupply: string,
): FundingSummary {
  let totalRaisedUsd = 0
  let totalTokensSold = 0
  let latestPriceUsd: number | null = null
  let latestDate = ''

  for (const round of rounds) {
    const amount = round.amount_usd ? parseDecimal(round.amount_usd) : NaN
    if (!Number.isNaN(amount)) totalRaisedUsd += amount

    const tokens = round.tokens_sold
      ? parseFloat(String(round.tokens_sold).replace(/,/g, ''))
      : NaN
    if (!Number.isNaN(tokens)) totalTokensSold += tokens

    const price = round.token_price_usd
      ? parseDecimal(round.token_price_usd)
      : NaN
    if (!Number.isNaN(price)) {
      // Latest by date; an undated round wins only over nothing at all
      const date = round.round_date ?? ''
      if (latestPriceUsd === null || date >= latestDate) {
        latestPriceUsd = price
        latestDate = date
      }
    }
  }

  const max = maxSupply ? parseFloat(String(maxSupply).replace(/,/g, '')) : NaN
  const hasMax = !Number.isNaN(max) && max > 0

  return {
    roundCount: rounds.length,
    totalRaisedUsd: Math.round(totalRaisedUsd * 100) / 100,
    totalTokensSold,
    pctOfMaxSupply: hasMax
      ? Math.round((totalTokensSold / max) * 10000) / 100
      : null,
    latestPriceUsd,
    impliedFdvUsd:
      hasMax && latestPriceUsd !== null
        ? Math.round(latestPriceUsd * max * 100) / 100
        : null,
  }
}

/** Compact USD display for the summary bar: 1234567.89 -> "1,234,568". */
export function formatUsd(value: number): string {
  return formatNumber(String(Math.round(value)))
}
