import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeWalletAddress } from '@/lib/intuition/utils'

/** Thrown when a caller-supplied wallet is not an active link of theirs. */
export class WalletNotVerifiedError extends Error {
  constructor(message = 'Wallet not linked to your account') {
    super(message)
    this.name = 'WalletNotVerifiedError'
  }
}

/**
 * Asserts that `walletAddress` is an active `wallet_links` row for `userId`.
 *
 * The publish-runs route records a client-supplied wallet address; without this
 * check a caller could log an on-chain run under a wallet they do not control.
 * wallet_links stores addresses lowercased, so normalize then lowercase before
 * matching. Throws WalletNotVerifiedError on any mismatch; the route maps it to
 * a 403.
 */
export async function assertWalletVerified(
  supabase: SupabaseClient,
  userId: string,
  walletAddress: string,
): Promise<void> {
  let normalized: string
  try {
    normalized = normalizeWalletAddress(walletAddress).toLowerCase()
  } catch {
    throw new WalletNotVerifiedError('Invalid wallet address')
  }

  const { count, error } = await supabase
    .from('wallet_links')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('wallet_address', normalized)
    .is('unlinked_at', null)

  if (error) {
    throw new WalletNotVerifiedError('Could not verify wallet ownership')
  }
  if (!count || count === 0) {
    throw new WalletNotVerifiedError()
  }
}
