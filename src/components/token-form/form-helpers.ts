import type { StudioSectionKey } from '@/features/studio/studio-spine'
import type { AllocationSegment } from '@/types/form'

export interface AllocationWithId extends AllocationSegment {
  id: string
  token_amount?: string
}

export interface SaveOpts {
  /** autosave / auto-draft: suppress success toasts and side scrolls */
  silent?: boolean
}

export type AutosaveStatus =
  'idle' | 'pending' | 'saving' | 'saved' | 'invalid' | 'error'

export const SECTION_ORDER: StudioSectionKey[] = [
  'identity',
  'supply',
  'allocation',
  'vesting',
  'emission',
  'sources',
  'risk',
]

export const SECTION_LABELS: Record<StudioSectionKey, string> = {
  identity: 'Identity',
  supply: 'Supply',
  allocation: 'Allocation',
  vesting: 'Vesting',
  emission: 'Emission',
  sources: 'Sources',
  risk: 'Risk flags',
}

/** app chain value → CoinGecko platform key (for contract autofill) */
export const CHAIN_PLATFORM: Record<string, string> = {
  ethereum: 'ethereum',
  solana: 'solana',
  arbitrum: 'arbitrum-one',
  optimism: 'optimistic-ethereum',
  base: 'base',
  polygon: 'polygon-pos',
  'bnb-chain': 'binance-smart-chain',
  avalanche: 'avalanche',
}

// Parse a user-typed decimal (percentage, rate, ...): tolerates a French-locale
// comma decimal separator ("18,52") when no dot is present, and treats commas
// as thousands separators (stripped) when a dot is also present ("1,000.5");
// otherwise behaves exactly like parseFloat, including its NaN cases.
export const parseDecimal = (value: string): number => {
  const trimmed = value.trim()
  const hasComma = trimmed.includes(',')
  const hasDot = trimmed.includes('.')
  if (hasComma && hasDot) return parseFloat(trimmed.replace(/,/g, ''))
  if (hasComma) return parseFloat(trimmed.replace(',', '.'))
  return parseFloat(trimmed)
}

// Format number with commas
export const formatNumber = (value: string) => {
  const digitsOnly = value.replace(/[^\d]/g, '')
  if (!digitsOnly) return ''
  return digitsOnly.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

// Calculate token amount from percentage
export const calculateTokenAmount = (
  percentage: string,
  maxSupply: string,
): string => {
  if (!percentage || !maxSupply) return '0'
  const percentNum = parseDecimal(percentage)
  // Handle both string and number for maxSupply
  const supplyStr = String(maxSupply).replace(/,/g, '')
  const supplyNum = parseFloat(supplyStr)
  if (isNaN(percentNum) || isNaN(supplyNum)) return '0'
  const amount = (supplyNum * percentNum) / 100
  return formatNumber(Math.floor(amount).toString())
}

// Calculate percentage from token amount (reverse calculation)
export const calculatePercentage = (
  tokenAmount: string,
  maxSupply: string,
): string => {
  if (!tokenAmount || !maxSupply) return ''
  // Handle both string and number for tokenAmount
  const amountStr = String(tokenAmount).replace(/,/g, '')
  const amountNum = parseFloat(amountStr)
  // Handle both string and number for maxSupply
  const supplyStr = String(maxSupply).replace(/,/g, '')
  const supplyNum = parseFloat(supplyStr)
  if (isNaN(amountNum) || isNaN(supplyNum) || supplyNum === 0) return ''
  const percentage = (amountNum / supplyNum) * 100
  return percentage.toFixed(2)
}

// Format token amount for display
export const formatTokenAmount = (amount: string | undefined) => {
  if (!amount) return '0'
  return formatNumber(amount)
}

// Ceiling on a single enqueued save (see createSaveQueue below). Generous
// relative to a normal RPC round trip, but finite: a save that runs longer
// than this is treated as hung.
export const SAVE_QUEUE_TIMEOUT_MS = 20_000

/**
 * Serializes async save calls: every enqueued fn runs strictly after the
 * previous one settles, so persistence never races itself (the optimistic
 * lock — tokens.updated_at — must advance strictly between saves). Every
 * persistence path in the studio (auto-draft, the debounced autosave, the
 * "Continue" and "Finish" footer buttons) shares one of these queues, so a
 * single stuck call — e.g. a Supabase await that never resolves — must not
 * be allowed to wedge every later save behind it forever.
 *
 * A hard per-save timeout is the safety net: past `timeoutMs`, the queue
 * moves on (the timed-out call resolves `false` instead of blocking the
 * chain) and `onTimeout` fires so the caller can reset any "saving" UI state
 * (e.g. the shared `loading` flag that gates the footer buttons). The
 * original call keeps running in the background in case it eventually
 * settles; that result is simply discarded.
 *
 * Callers in this codebase only ever enqueue functions that resolve to a
 * boolean ("did the save succeed"), so resolving a timeout as `false` keeps
 * every existing `ok ? ... : ...` call site working unchanged.
 */
export function createSaveQueue(
  options: {
    timeoutMs?: number
    onTimeout?: () => void
  } = {},
) {
  const { timeoutMs = SAVE_QUEUE_TIMEOUT_MS, onTimeout } = options
  let chain: Promise<unknown> = Promise.resolve()

  return function enqueueSave<T>(fn: () => Promise<T>): Promise<T> {
    const guarded = (): Promise<T> =>
      new Promise<T>((resolve) => {
        let settled = false
        const timer = setTimeout(() => {
          if (settled) return
          settled = true
          onTimeout?.()
          resolve(false as T)
        }, timeoutMs)
        // Routed through Promise.resolve().then(fn) rather than calling fn()
        // directly so a *synchronous* throw from fn also lands in the
        // rejection branch below instead of escaping the executor.
        Promise.resolve()
          .then(fn)
          .then(
            (value) => {
              if (settled) return
              settled = true
              clearTimeout(timer)
              resolve(value)
            },
            () => {
              if (settled) return
              settled = true
              clearTimeout(timer)
              resolve(false as T)
            },
          )
      })
    const next = chain.then(guarded, guarded)
    chain = next.catch(() => undefined)
    return next
  }
}
