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
  const percentNum = parseFloat(percentage)
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
