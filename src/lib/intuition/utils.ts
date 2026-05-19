import { getAddress, isAddress, type Address } from 'viem'

export function normalizeWalletAddress(address: string): Address {
  if (!isAddress(address)) {
    throw new Error(`Invalid EVM address: ${address}`)
  }
  return getAddress(address)
}
