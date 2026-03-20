/**
 * Mapping from TrustNomiks chain identifiers to CoinGecko platform IDs.
 * Used by the /api/coingecko/resolve route to look up tokens by contract address.
 */
export const CHAIN_TO_COINGECKO_PLATFORM: Record<string, string> = {
  ethereum: 'ethereum',
  solana: 'solana',
  arbitrum: 'arbitrum-one',
  optimism: 'optimistic-ethereum',
  base: 'base',
  polygon: 'polygon-pos',
  'bnb-chain': 'binance-smart-chain',
  avalanche: 'avalanche',
  starknet: 'starknet',
}

export function toCoinGeckoPlatform(chain: string | null | undefined): string | null {
  if (!chain) return null
  return CHAIN_TO_COINGECKO_PLATFORM[chain] ?? null
}
