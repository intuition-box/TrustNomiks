import {
  intuitionTestnet,
  getMultiVaultAddressFromChainId,
} from '@0xintuition/protocol'
import type { Address } from 'viem'

export const INTUITION_CHAIN = intuitionTestnet

export const INTUITION_CHAIN_ID = INTUITION_CHAIN.id

export const MULTIVAULT_ADDRESS: Address = getMultiVaultAddressFromChainId(
  INTUITION_CHAIN_ID,
)

export const INTUITION_GRAPHQL_ENDPOINT =
  'https://testnet.intuition.sh/v1/graphql'

/**
 * Delay between on-chain transactions (ms) to avoid RPC rate limiting.
 */
export const TX_DELAY_MS = 500

/**
 * Batch chunk sizes per phase.
 * Atoms use a smaller chunk (higher gas/payload variability).
 * Triples and provenance are more uniform.
 */
export const ATOM_CHUNK_SIZE = 25
export const TRIPLE_CHUNK_SIZE = 50
export const PROVENANCE_CHUNK_SIZE = 50
