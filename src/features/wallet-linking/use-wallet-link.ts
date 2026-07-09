'use client'

import { useCallback, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAccount, useSignMessage } from 'wagmi'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'

export interface WalletLink {
  user_id: string
  wallet_address: string
  chain_id: number
  is_primary: boolean
  linked_at: string
  unlinked_at: string | null
}

const WALLET_LINKS_QUERY_KEY = ['wallet-links', 'mine'] as const

async function fetchWalletLinks(): Promise<WalletLink[]> {
  const supabase = createClient()
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser()
  if (authErr || !user) return []

  const { data, error } = await supabase
    .from('wallet_links')
    .select('*')
    .eq('user_id', user.id)
    .is('unlinked_at', null)
    .order('linked_at', { ascending: true })

  if (error) throw error
  return (data ?? []) as WalletLink[]
}

/** Supabase/Postgrest errors are plain objects, not `Error` instances. */
function extractErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message
  if (
    err &&
    typeof err === 'object' &&
    'message' in err &&
    typeof (err as { message?: unknown }).message === 'string'
  ) {
    return (err as { message: string }).message
  }
  return fallback
}

/**
 * Maps a wallet-link error to user-facing copy. The active-wallet unique
 * index (`wallet_links_one_active_per_wallet`) is enforced two ways that
 * both reach the client here: the nonce/verify API routes forward a Postgres
 * `RAISE EXCEPTION` message verbatim as `error.message` (re-raised as
 * `"CONFLICT: wallet already linked to an account"` in
 * `confirm_wallet_link_tx` / `request_wallet_link_nonce_tx`, see
 * supabase/migrations/20260709_add_wallet_linking.sql), and a direct
 * `supabase.rpc` call can surface the raw Postgrest unique-violation error
 * (`code: '23505'`). Both map to the same friendly copy; everything else
 * falls back to a generic message. Pure, exported for unit testing.
 */
export function humanizeWalletLinkError(err: unknown): string {
  const code =
    err && typeof err === 'object' && 'code' in err
      ? (err as { code?: unknown }).code
      : undefined
  const message = extractErrorMessage(err, '')

  const isActiveWalletConflict =
    code === '23505' ||
    (/CONFLICT/i.test(message) && /already linked/i.test(message))

  if (isActiveWalletConflict) {
    return 'This wallet is already linked to a different TrustNomiks account.'
  }

  return extractErrorMessage(err, 'Failed to link wallet')
}

/**
 * Linking/unlinking wallets for the current user (milestone J1d).
 * Read side: TanStack Query over `wallet_links`. Write side: the nonce +
 * sign + verify handshake for linking (`/api/wallet-links/*`), and direct
 * RPC calls for unlink/set-primary (no signature required for those).
 */
export function useWalletLink() {
  const queryClient = useQueryClient()
  const { address } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const [isLinking, setIsLinking] = useState(false)
  const [isUnlinking, setIsUnlinking] = useState(false)
  const [isSettingPrimary, setIsSettingPrimary] = useState(false)

  const {
    data: links = [],
    isLoading,
    error: queryError,
  } = useQuery({
    queryKey: WALLET_LINKS_QUERY_KEY,
    queryFn: fetchWalletLinks,
  })

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: WALLET_LINKS_QUERY_KEY }),
    [queryClient],
  )

  const linkWallet = useCallback(async () => {
    if (!address) {
      toast.error('Connect a wallet first')
      return
    }
    setIsLinking(true)
    try {
      const nonceRes = await fetch('/api/wallet-links/nonce', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: address }),
      })
      if (!nonceRes.ok) {
        const body = await nonceRes.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${nonceRes.status}`)
      }
      const { nonce, message } = (await nonceRes.json()) as {
        nonce: string
        message: string
        expiresAt: string
      }

      const signature = await signMessageAsync({ message })

      const verifyRes = await fetch('/api/wallet-links/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nonce, signature }),
      })
      if (!verifyRes.ok) {
        const body = await verifyRes.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${verifyRes.status}`)
      }

      await invalidate()
      toast.success('Wallet linked')
    } catch (err) {
      toast.error(humanizeWalletLinkError(err))
    } finally {
      setIsLinking(false)
    }
  }, [address, invalidate, signMessageAsync])

  const unlink = useCallback(
    async (walletAddress: string) => {
      setIsUnlinking(true)
      try {
        const supabase = createClient()
        const { error } = await supabase.rpc('unlink_wallet_tx', {
          p_wallet_address: walletAddress,
        })
        if (error) throw error
        await invalidate()
        toast.success('Wallet unlinked')
      } catch (err) {
        toast.error(extractErrorMessage(err, 'Failed to unlink wallet'))
      } finally {
        setIsUnlinking(false)
      }
    },
    [invalidate],
  )

  const setPrimary = useCallback(
    async (walletAddress: string) => {
      setIsSettingPrimary(true)
      try {
        const supabase = createClient()
        const { error } = await supabase.rpc('set_primary_wallet_tx', {
          p_wallet_address: walletAddress,
        })
        if (error) throw error
        await invalidate()
        toast.success('Primary wallet updated')
      } catch (err) {
        toast.error(extractErrorMessage(err, 'Failed to set primary wallet'))
      } finally {
        setIsSettingPrimary(false)
      }
    },
    [invalidate],
  )

  return {
    links,
    isLoading,
    error: queryError
      ? extractErrorMessage(queryError, 'Failed to load wallet links')
      : null,
    linkWallet,
    isLinking,
    unlink,
    isUnlinking,
    setPrimary,
    isSettingPrimary,
  }
}
