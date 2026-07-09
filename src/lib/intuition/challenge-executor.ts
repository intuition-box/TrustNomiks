/**
 * Client-side challenge executor — dispute a claim / withdraw a dispute.
 *
 * A dispute is a deposit of tTRUST into a claim triple's COUNTER-triple
 * (every triple gets an automatic counter-triple vault on creation; opening a
 * dispute and adding to an existing dispute are the same deposit call, the
 * caller just labels the intent). Withdrawing a dispute redeems shares from
 * that same counter-triple.
 *
 * HasCounterStake invariant: the MultiVault contract reverts a counter-triple
 * deposit with `MultiVault_HasCounterStake` if the caller already holds a
 * supporting ("for") position on the claim triple itself — you cannot argue
 * both sides at once. `executeContestationDeposit` pre-checks this and fails
 * fast with a clear message instead of surfacing the raw revert.
 *
 * Slippage: both the deposit and the redeem apply a 95% floor (5% tolerance)
 * against the previewed shares/assets, derived from `previewDeposit` /
 * `previewRedeem` immediately before the write.
 *
 * Persistence: this module only executes the on-chain leg. The caller is
 * responsible for persisting the resulting tx hash via
 * `record_challenge_onchain_tx` (or equivalent) once this resolves.
 */

import type { Address, Hex, PublicClient, WalletClient } from 'viem'
import {
  multiVaultDeposit,
  multiVaultRedeem,
  multiVaultGetShares,
  multiVaultGetGeneralConfig,
  multiVaultPreviewDeposit,
  multiVaultPreviewRedeem,
} from '@0xintuition/protocol'
import { MULTIVAULT_ADDRESS } from './config'
import { isRevert } from './tx-helpers'

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeConfig(walletClient: WalletClient, publicClient: PublicClient) {
  return {
    address: MULTIVAULT_ADDRESS,
    publicClient,
    walletClient,
  }
}

function requireAccount(walletClient: WalletClient, action: string): Address {
  const account = walletClient.account?.address
  if (!account) {
    throw new Error(
      `Wallet is not connected — no account available to sign the ${action}.`,
    )
  }
  return account
}

// ── Open / add to a dispute ─────────────────────────────────────────────────

export interface ContestationDepositParams {
  /** The "for" side triple — used for the HasCounterStake pre-check. */
  tripleTermId: Hex
  /** The counter-triple to deposit into (the dispute side). */
  counterTermId: Hex
  curveId: bigint
  /** tTRUST to stake, in wei. */
  amountWei: bigint
}

export interface ContestationDepositResult {
  txHash: Hex
  account: Address
  counterTermId: Hex
  curveId: bigint
  amountWei: bigint
  /** Best-effort shares-minted delta; null if it could not be determined. */
  sharesMinted: bigint | null
}

export async function executeContestationDeposit(
  walletClient: WalletClient,
  publicClient: PublicClient,
  params: ContestationDepositParams,
): Promise<ContestationDepositResult> {
  const { tripleTermId, counterTermId, curveId, amountWei } = params
  const account = requireAccount(walletClient, 'dispute deposit')
  const config = makeConfig(walletClient, publicClient)

  try {
    // Minimum deposit gate.
    const { minDeposit } = await multiVaultGetGeneralConfig(config)
    if (amountWei < minDeposit) {
      throw new Error('Stake amount is below the network minimum deposit')
    }

    // HasCounterStake invariant: a supporting position on the claim triple
    // blocks depositing into its counter-triple until it is redeemed.
    const forShares = await multiVaultGetShares(config, {
      args: [account, tripleTermId, curveId],
    })
    if (forShares > BigInt(0)) {
      throw new Error(
        'You hold a supporting position on this claim. Redeem it before you can dispute.',
      )
    }

    // Best-effort baseline for the post-write shares delta below.
    let sharesBefore: bigint | null = null
    try {
      sharesBefore = await multiVaultGetShares(config, {
        args: [account, counterTermId, curveId],
      })
    } catch {
      sharesBefore = null
    }

    // Slippage: floor minShares at 95% of the previewed shares.
    const [previewShares] = await multiVaultPreviewDeposit(config, {
      args: [counterTermId, curveId, amountWei],
    })
    const minShares = (previewShares * BigInt(95)) / BigInt(100)

    const txHash = await multiVaultDeposit(config, {
      args: [account, counterTermId, curveId, minShares],
      value: amountWei,
    })

    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
    })
    if (receipt.status === 'reverted') {
      throw new Error('Dispute transaction reverted on-chain.')
    }

    // Best-effort post-verify: shares-minted delta.
    let sharesMinted: bigint | null = null
    if (sharesBefore !== null) {
      try {
        const sharesAfter = await multiVaultGetShares(config, {
          args: [account, counterTermId, curveId],
        })
        sharesMinted = sharesAfter - sharesBefore
      } catch {
        sharesMinted = null
      }
    }

    return {
      txHash,
      account,
      counterTermId,
      curveId,
      amountWei,
      sharesMinted,
    }
  } catch (err) {
    if (isRevert(err, 'MultiVault_HasCounterStake')) {
      throw new Error(
        'You hold a supporting position on this claim. Redeem it before you can dispute.',
      )
    }
    if (isRevert(err, 'MultiVault_DepositBelowMinimumDeposit')) {
      throw new Error('Stake amount is below the network minimum deposit')
    }
    if (isRevert(err, 'MultiVault_InsufficientBalance')) {
      throw new Error('Insufficient wallet balance to cover this deposit.')
    }
    throw err
  }
}

// ── Withdraw a dispute ──────────────────────────────────────────────────────

export interface WithdrawContestationParams {
  counterTermId: Hex
  curveId: bigint
}

export interface WithdrawContestationResult {
  txHash: Hex
  account: Address
  sharesRedeemed: bigint
}

export async function executeWithdrawContestation(
  walletClient: WalletClient,
  publicClient: PublicClient,
  params: WithdrawContestationParams,
): Promise<WithdrawContestationResult> {
  const { counterTermId, curveId } = params
  const account = requireAccount(walletClient, 'dispute withdrawal')
  const config = makeConfig(walletClient, publicClient)

  try {
    const shares = await multiVaultGetShares(config, {
      args: [account, counterTermId, curveId],
    })
    if (shares === BigInt(0)) {
      throw new Error('No dispute position to withdraw.')
    }

    // Slippage: floor minAssets at 95% of the previewed assets.
    const [assetsAfterFees] = await multiVaultPreviewRedeem(config, {
      args: [counterTermId, curveId, shares],
    })
    const minAssets = (assetsAfterFees * BigInt(95)) / BigInt(100)

    const txHash = await multiVaultRedeem(config, {
      args: [account, counterTermId, curveId, shares, minAssets],
    })

    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
    })
    if (receipt.status === 'reverted') {
      throw new Error('Withdraw transaction reverted on-chain.')
    }

    return { txHash, account, sharesRedeemed: shares }
  } catch (err) {
    if (isRevert(err, 'MultiVault_InsufficientBalance')) {
      throw new Error('Insufficient balance to complete this withdrawal.')
    }
    throw err
  }
}
