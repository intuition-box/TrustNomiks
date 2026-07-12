import type { StudioSectionKey } from '@/features/studio/studio-spine'

// The pure form math (parseDecimal, token-amount conversions, createSaveQueue)
// lives in the shared tokenomics domain library; re-exported here so existing
// importers stay untouched.
export {
  SAVE_QUEUE_TIMEOUT_MS,
  calculatePercentage,
  calculateTokenAmount,
  createSaveQueue,
  formatNumber,
  formatTokenAmount,
  parseDecimal,
} from '@/lib/tokenomics/math'
export type {
  AllocationWithId,
  AutosaveStatus,
  SaveOpts,
} from '@/lib/tokenomics/math'

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
