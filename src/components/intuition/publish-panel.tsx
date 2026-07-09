'use client'

import { useState, useCallback, useRef } from 'react'
import { useAccount, usePublicClient, useWalletClient } from 'wagmi'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Loader2,
  AlertCircle,
  CheckCircle2,
  RotateCcw,
  XCircle,
} from 'lucide-react'
import { NodeGlyph } from '@/components/patterns/node-glyph'
import { RoleGate } from '@/components/composite/role-gate'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { PublishSummary } from './publish-summary'
import { PublishedClaimsView } from './published-claims-view'
import { executePublishPlan } from '@/lib/intuition/publish-executor'
import { INTUITION_CHAIN_ID } from '@/lib/intuition/config'
import type { PublishPlanSerialized } from '@/types/intuition'
import type {
  PublishPlan,
  PublishEvent,
  PublishRunResult,
  RunStatus,
} from '@/lib/intuition/types'

interface PublishPanelProps {
  tokenId: string
  tokenStatus: string
}

type PanelState =
  'idle' | 'loading_plan' | 'plan_ready' | 'publishing' | 'complete' | 'error'

interface BatchProgress {
  phase: 'atoms' | 'triples' | 'provenance'
  currentChunk: number
  totalChunks: number
  itemsProcessed: number
  totalItems: number
  chunkStatus: 'pending' | 'processing' | 'done'
}

interface Counters {
  atomsCreated: number
  atomsFailed: number
  atomsSkipped: number
  triplesCreated: number
  triplesFailed: number
  triplesSkipped: number
  provenanceCreated: number
  provenanceFailed: number
}

interface ExistingSnapshotMappings {
  atomMappings: PublishRunResult['atomMappings']
  claimMappings: PublishRunResult['claimMappings']
  provenanceMappings: PublishRunResult['provenanceMappings']
}

const PHASE_LABELS: Record<string, string> = {
  atoms: 'Atoms',
  triples: 'Triples',
  provenance: 'Provenance',
}

/** Semantic notice styles: same tone = same tokens, both themes for free. */
const NOTICE_CLASS: Record<
  'warning' | 'info' | 'destructive' | 'success',
  string
> = {
  warning: 'border-warning/30 bg-warning/10 text-warning',
  info: 'border-info/30 bg-info/10 text-info',
  destructive: 'border-destructive/30 bg-destructive/10 text-destructive',
  success: 'border-success/30 bg-success/10 text-success',
}

function Notice({
  tone,
  icon: Icon,
  children,
}: {
  tone: keyof typeof NOTICE_CLASS
  icon: typeof AlertCircle
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg border p-3 text-sm',
        NOTICE_CLASS[tone],
      )}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </div>
  )
}

export function PublishPanel({ tokenId, tokenStatus }: PublishPanelProps) {
  const { address, isConnected, chainId } = useAccount()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()

  const [state, setState] = useState<PanelState>('idle')
  const [plan, setPlan] = useState<PublishPlanSerialized | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<BatchProgress | null>(null)
  const [counters, setCounters] = useState<Counters>({
    atomsCreated: 0,
    atomsFailed: 0,
    atomsSkipped: 0,
    triplesCreated: 0,
    triplesFailed: 0,
    triplesSkipped: 0,
    provenanceCreated: 0,
    provenanceFailed: 0,
  })
  const [aborted, setAborted] = useState(false)
  const runIdRef = useRef<string | null>(null)

  const isEligible = tokenStatus === 'validated'
  const isDryRunEligible =
    tokenStatus === 'in_review' || tokenStatus === 'validated'
  const isWrongChain = isConnected && chainId !== INTUITION_CHAIN_ID

  // ── Fetch publish plan (dry-run) ────────────────────────────────────────

  const fetchPlan = useCallback(async () => {
    setState('loading_plan')
    setError(null)
    setPlan(null)

    try {
      const walletParam = address
        ? `&wallet=${encodeURIComponent(address)}`
        : ''
      const res = await fetch(
        `/api/intuition/publish-plan?tokenId=${tokenId}${walletParam}`,
      )
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to fetch publish plan')
      }
      const { plan } = await res.json()
      setPlan(plan)
      setState('plan_ready')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate plan')
      setState('error')
    }
  }, [tokenId, address])

  // ── Persist chunk to Supabase ─────────────────────────────────────────

  const persistChunk = useCallback(
    async (
      event: PublishEvent,
      currentChainId: number,
      currentCounters: {
        atomsCreated: number
        atomsSkipped: number
        atomsFailed: number
        triplesCreated: number
        triplesSkipped: number
        triplesFailed: number
      },
    ) => {
      if (!runIdRef.current) return true
      if (!event.chunkMappings) return true

      try {
        const res = await fetch('/api/intuition/publish-runs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'chunk',
            runId: runIdRef.current,
            chainId: currentChainId,
            atomMappings: event.chunkMappings.atomMappings,
            claimMappings: event.chunkMappings.claimMappings,
            provenanceMappings: event.chunkMappings.provenanceMappings,
            txHash: event.txHash,
            counters: currentCounters,
          }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          console.error(
            'Chunk persistence failed:',
            res.status,
            body.error ?? '',
          )
          toast.warning(
            `Chunk tracking failed (HTTP ${res.status}). On-chain data is safe; tracking may be incomplete.`,
          )
          return false
        }
        return true
      } catch (err) {
        console.error('Failed to persist chunk:', err)
        toast.warning(
          'Chunk tracking failed (network error). On-chain data is safe; tracking may be incomplete.',
        )
        return false
      }
    },
    [],
  )

  // ── Execute publish ─────────────────────────────────────────────────────

  const executePublish = useCallback(async () => {
    if (!walletClient || !publicClient || !plan || !address) {
      const missing = {
        walletClient: !walletClient,
        publicClient: !publicClient,
        plan: !plan,
        address: !address,
      }
      console.warn('[publish] aborted, missing prerequisites:', missing)
      toast.error(
        `Cannot publish yet. Missing: ${Object.entries(missing)
          .filter(([, v]) => v)
          .map(([k]) => k)
          .join(', ')}`,
      )
      return
    }

    setState('publishing')
    setError(null)
    setAborted(false)
    setProgress(null)
    setCounters({
      atomsCreated: 0,
      atomsFailed: 0,
      atomsSkipped: plan.atoms.existing.length,
      triplesCreated: 0,
      triplesFailed: 0,
      triplesSkipped: plan.triples.existing.length,
      provenanceCreated: 0,
      provenanceFailed: 0,
    })

    // Reconstruct PublishPlan with bigint costs
    const fullPlan: PublishPlan = {
      ...plan,
      estimatedCost: {
        atomCostPerUnit: BigInt(plan.estimatedCost.atomCostPerUnit),
        tripleCostPerUnit: BigInt(plan.estimatedCost.tripleCostPerUnit),
        extraDepositPerUnit: BigInt(plan.estimatedCost.extraDepositPerUnit),
        totalAtomsCost: BigInt(plan.estimatedCost.totalAtomsCost),
        totalTriplesCost: BigInt(plan.estimatedCost.totalTriplesCost),
        totalProvenanceCost: BigInt(plan.estimatedCost.totalProvenanceCost),
        totalCost: BigInt(plan.estimatedCost.totalCost),
      },
    }

    const txHashes: string[] = []
    const errors: Array<{ id: string; error: string }> = []
    let atomsCreated = 0,
      atomsFailed = 0
    let triplesCreated = 0,
      triplesFailed = 0
    let provenanceCreated = 0,
      provenanceFailed = 0
    let wasAborted = false
    let hadTrackingIssues = false

    try {
      // 1. Init run in Supabase
      const initRes = await fetch('/api/intuition/publish-runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'init',
          tokenId,
          walletAddress: address,
          chainId: INTUITION_CHAIN_ID,
        }),
      })
      if (!initRes.ok) {
        throw new Error('Failed to initialize publish run')
      }
      const { runId } = await initRes.json()
      runIdRef.current = runId

      const existingSnapshot = buildExistingSnapshotMappings(fullPlan)
      if (
        existingSnapshot.atomMappings.length > 0 ||
        existingSnapshot.claimMappings.length > 0 ||
        existingSnapshot.provenanceMappings.length > 0
      ) {
        const snapshotPersisted = await persistChunk(
          {
            type: 'chunk_success',
            chunkMappings: existingSnapshot,
          },
          INTUITION_CHAIN_ID,
          {
            atomsCreated: 0,
            atomsSkipped: plan.atoms.existing.length,
            atomsFailed: 0,
            triplesCreated: 0,
            triplesSkipped: plan.triples.existing.length,
            triplesFailed: 0,
          },
        )
        if (!snapshotPersisted) {
          hadTrackingIssues = true
        }
      }

      // 2. Execute with batching
      for await (const event of executePublishPlan(
        fullPlan,
        walletClient,
        publicClient,
      )) {
        // Update progress display
        if (event.progress) {
          setProgress({
            phase: event.phase ?? 'atoms',
            currentChunk: event.progress.currentChunk,
            totalChunks: event.progress.totalChunks,
            itemsProcessed: event.progress.itemsProcessed,
            totalItems: event.progress.totalItems,
            chunkStatus: event.type === 'chunk_pending' ? 'processing' : 'done',
          })
        }

        // Collect txHashes
        if (event.txHash) {
          txHashes.push(event.txHash)
        }

        // Count results per chunk
        if (event.chunkMappings) {
          const am = event.chunkMappings.atomMappings ?? []
          const cm = event.chunkMappings.claimMappings ?? []
          const pm = event.chunkMappings.provenanceMappings ?? []

          atomsCreated += am.filter((m) => m.status === 'confirmed').length
          atomsFailed += am.filter((m) => m.status === 'failed').length
          triplesCreated += cm.filter((m) => m.status === 'confirmed').length
          triplesFailed += cm.filter((m) => m.status === 'failed').length
          provenanceCreated += pm.filter((m) => m.status === 'confirmed').length
          provenanceFailed += pm.filter((m) => m.status === 'failed').length

          // Update counters in real-time
          setCounters({
            atomsCreated,
            atomsFailed,
            atomsSkipped: plan.atoms.existing.length,
            triplesCreated,
            triplesFailed,
            triplesSkipped: plan.triples.existing.length,
            provenanceCreated,
            provenanceFailed,
          })

          // Collect errors
          for (const m of am) {
            if (m.status === 'failed' && m.errorMessage) {
              errors.push({ id: m.atomId, error: m.errorMessage })
            }
          }
          for (const m of cm) {
            if (m.status === 'failed' && m.errorMessage) {
              errors.push({ id: m.tripleId, error: m.errorMessage })
            }
          }

          // Persist chunk immediately with accumulated counters
          const chunkPersisted = await persistChunk(event, INTUITION_CHAIN_ID, {
            atomsCreated,
            atomsSkipped: plan.atoms.existing.length,
            atomsFailed,
            triplesCreated: triplesCreated + provenanceCreated,
            triplesSkipped: plan.triples.existing.length,
            triplesFailed: triplesFailed + provenanceFailed,
          })
          if (!chunkPersisted) {
            hadTrackingIssues = true
          }
        }

        if (event.type === 'abort') {
          wasAborted = true
          setAborted(true)
        }
      }

      // 3. Finalize run
      const finalStatus: RunStatus = wasAborted
        ? atomsCreated > 0
          ? 'partial'
          : 'failed'
        : atomsFailed === 0 && triplesFailed === 0 && provenanceFailed === 0
          ? 'completed'
          : atomsCreated > 0 || triplesCreated > 0
            ? 'partial'
            : 'failed'

      const finalizeRes = await fetch('/api/intuition/publish-runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'finalize',
          runId,
          status: finalStatus,
          counters: {
            atomsCreated,
            atomsSkipped: plan.atoms.existing.length,
            atomsFailed,
            triplesCreated: triplesCreated + provenanceCreated,
            triplesSkipped: plan.triples.existing.length,
            triplesFailed: triplesFailed + provenanceFailed,
          },
          txHashes,
          errors,
        }),
      })
      if (!finalizeRes.ok) {
        const body = await finalizeRes.json().catch(() => ({}))
        console.error('Finalize failed:', finalizeRes.status, body.error ?? '')
        const message =
          'Run finalization failed. On-chain data is safe but the run status may be outdated.'
        setError(message)
        setState('error')
        toast.warning(message)
        return
      }

      setState('complete')

      if (hadTrackingIssues) {
        const message =
          'On-chain publish completed, but some tracking writes failed. Review Supabase before rerunning.'
        setError(message)
        toast.warning(message)
        return
      }

      if (wasAborted) {
        toast.error('Publication aborted: an atom batch failed')
      } else if (finalStatus === 'completed') {
        toast.success(
          `Published ${atomsCreated} atoms, ${triplesCreated} triples, ${provenanceCreated} provenance`,
        )
      } else {
        toast.warning(
          `Partial publish: ${atomsCreated} atoms, ${triplesCreated} triples (some failures)`,
        )
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Publish failed')
      setState('error')
      toast.error('Publish failed')

      // Try to finalize as failed — best-effort but log failures
      if (runIdRef.current) {
        try {
          const errFinalizeRes = await fetch('/api/intuition/publish-runs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'finalize',
              runId: runIdRef.current,
              status:
                atomsCreated > 0 || triplesCreated > 0 ? 'partial' : 'failed',
              counters: {
                atomsCreated,
                atomsSkipped: plan.atoms.existing.length,
                atomsFailed,
                triplesCreated: triplesCreated + provenanceCreated,
                triplesSkipped: plan.triples.existing.length,
                triplesFailed: triplesFailed + provenanceFailed,
              },
              txHashes,
              errors,
            }),
          })
          if (!errFinalizeRes.ok) {
            const body = await errFinalizeRes.json().catch(() => ({}))
            console.error(
              'Error-path finalize failed:',
              errFinalizeRes.status,
              body.error ?? '',
            )
          }
        } catch {
          console.error('Error-path finalize network failure')
        }
      }
    }
  }, [walletClient, publicClient, plan, address, tokenId, persistChunk])

  // ── Render ──────────────────────────────────────────────────────────────

  if (!isDryRunEligible) return null

  const totalProgress = progress
    ? (() => {
        // Compute overall progress across all 3 phases
        const atomsTotal = plan?.summary.atomsToCreate ?? 0
        const triplesTotal = plan?.summary.triplesToCreate ?? 0
        const provTotal = plan?.summary.provenanceToCreate ?? 0
        const grandTotal = atomsTotal + triplesTotal + provTotal
        if (grandTotal === 0) return 0

        const done =
          counters.atomsCreated +
          counters.atomsFailed +
          counters.triplesCreated +
          counters.triplesFailed +
          counters.provenanceCreated +
          counters.provenanceFailed
        return Math.round((done / grandTotal) * 100)
      })()
    : 0

  return (
    <div className="space-y-4">
      <PublishedClaimsView tokenId={tokenId} />

      <RoleGate
        title="Link a wallet to publish"
        reason="Publishing writes atoms and triples on-chain from your wallet. Link a wallet you have proven ownership of to continue."
      >
        <section className="glass space-y-4 rounded-xl border p-5">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <NodeGlyph type="graph_root" size={16} aria-hidden />
              Publish to Intuition
              <Badge variant="outline" className="text-xs">
                testnet
              </Badge>
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Put this token&apos;s claims on-chain. The graph lights up as each
              batch confirms.
            </p>
          </div>
          <div className="space-y-4">
            {/* Connection warnings */}
            {!isConnected && (
              <Notice tone="warning" icon={AlertCircle}>
                Connect your wallet (top bar) to publish on-chain. Preparing the
                plan works without it.
              </Notice>
            )}

            {isWrongChain && (
              <Notice tone="warning" icon={AlertCircle}>
                Switch to Intuition Testnet (chain {INTUITION_CHAIN_ID}) to
                publish.
              </Notice>
            )}

            {!isEligible && tokenStatus === 'in_review' && (
              <Notice tone="info" icon={AlertCircle}>
                This token is in review. Preview the plan now; publishing opens
                once it is validated.
              </Notice>
            )}

            {/* Error display */}
            {error && (
              <Notice tone="destructive" icon={AlertCircle}>
                {error}
              </Notice>
            )}

            {/* Plan display */}
            {plan && state !== 'idle' && <PublishSummary plan={plan} />}

            {/* Batch progress display */}
            {state === 'publishing' && progress && (
              <div
                className="space-y-3 rounded-lg border bg-surface-2/60 p-4"
                aria-live="polite"
              >
                {/* Phase indicator */}
                <div className="flex items-center gap-1.5">
                  {(['atoms', 'triples', 'provenance'] as const).map(
                    (phase) => {
                      const isDone =
                        ['atoms', 'triples', 'provenance'].indexOf(phase) <
                        ['atoms', 'triples', 'provenance'].indexOf(
                          progress.phase,
                        )
                      return (
                        <Badge
                          key={phase}
                          variant={
                            progress.phase === phase ? 'default' : 'outline'
                          }
                          className={cn(
                            isDone && 'border-success/40 text-success',
                          )}
                        >
                          {isDone && (
                            <CheckCircle2
                              className="mr-1 h-3 w-3"
                              aria-hidden
                            />
                          )}
                          {PHASE_LABELS[phase]}
                        </Badge>
                      )
                    },
                  )}
                </div>

                {/* Chunk progress */}
                <div className="flex items-center gap-2 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  <span className="font-medium">
                    {PHASE_LABELS[progress.phase]}
                  </span>
                  <span className="tabular text-muted-foreground">
                    chunk{' '}
                    {progress.currentChunk +
                      (progress.chunkStatus === 'processing' ? 1 : 0)}
                    /{progress.totalChunks}
                    {progress.chunkStatus === 'processing' &&
                      ', waiting for your wallet signature…'}
                  </span>
                </div>

                {/* Phase progress bar */}
                <div className="space-y-1">
                  <div className="tabular flex justify-between text-xs text-muted-foreground">
                    <span>
                      {progress.itemsProcessed}/{progress.totalItems} items
                    </span>
                    <span>{totalProgress}% overall</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${totalProgress}%`,
                        background: 'var(--gradient-brand)',
                      }}
                    />
                  </div>
                </div>

                {/* Live counters */}
                <div className="tabular flex gap-4 text-xs text-muted-foreground">
                  {counters.atomsCreated > 0 && (
                    <span>{counters.atomsCreated} atoms created</span>
                  )}
                  {counters.triplesCreated > 0 && (
                    <span>{counters.triplesCreated} triples created</span>
                  )}
                  {counters.provenanceCreated > 0 && (
                    <span>{counters.provenanceCreated} provenance created</span>
                  )}
                  {counters.atomsFailed +
                    counters.triplesFailed +
                    counters.provenanceFailed >
                    0 && (
                    <span className="text-destructive">
                      {counters.atomsFailed +
                        counters.triplesFailed +
                        counters.provenanceFailed}{' '}
                      failed
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Completion */}
            {state === 'complete' && !aborted && (
              <Notice tone="success" icon={CheckCircle2}>
                <span className="tabular">
                  Publication complete: {counters.atomsCreated} atoms,{' '}
                  {counters.triplesCreated} triples,{' '}
                  {counters.provenanceCreated} provenance.
                </span>
              </Notice>
            )}

            {state === 'complete' && aborted && (
              <Notice tone="warning" icon={XCircle}>
                <span className="tabular">
                  Publication stopped after an atom failure.{' '}
                  {counters.atomsCreated} atoms made it on-chain; run again to
                  continue.
                </span>
              </Notice>
            )}

            <Separator />

            {/* Actions */}
            <div className="flex gap-2">
              {/* Prepare / Refresh plan */}
              <Button
                variant="outline"
                onClick={fetchPlan}
                disabled={state === 'loading_plan' || state === 'publishing'}
              >
                {state === 'loading_plan' ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Analyzing…
                  </>
                ) : plan ? (
                  <>
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Refresh plan
                  </>
                ) : (
                  'Prepare publish'
                )}
              </Button>

              {/* Publish */}
              {plan && (
                <Button
                  variant="brand"
                  onClick={executePublish}
                  disabled={
                    !isConnected ||
                    !isEligible ||
                    isWrongChain ||
                    state === 'publishing' ||
                    (plan.summary.atomsToCreate === 0 &&
                      plan.summary.triplesToCreate === 0 &&
                      plan.summary.provenanceToCreate === 0)
                  }
                >
                  {state === 'publishing' ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Publishing…
                    </>
                  ) : (
                    'Publish on-chain'
                  )}
                </Button>
              )}
            </div>
          </div>
        </section>
      </RoleGate>
    </div>
  )
}

function buildExistingSnapshotMappings(
  plan: PublishPlan,
): ExistingSnapshotMappings {
  const atomMappings: PublishRunResult['atomMappings'] =
    plan.atoms.existing.map((atom) => ({
      atomId: atom.atomId,
      atomType: atom.atomType,
      normalizedData: atom.normalizedData,
      termId: atom.computedTermId,
      txHash: '',
      status: 'confirmed',
      errorMessage: 'Already existed on-chain before this run',
    }))

  const claimMappings: PublishRunResult['claimMappings'] =
    plan.triples.existing.map((triple) => ({
      tripleId: triple.tripleId,
      claimGroup: triple.claimGroup,
      originRowId: triple.originRowId,
      subjectTermId: triple.subjectTermId,
      predicateTermId: triple.predicateTermId,
      objectTermId: triple.objectTermId,
      tripleTermId: triple.computedTripleTermId,
      txHash: '',
      status: 'confirmed',
      errorMessage: 'Already existed on-chain before this run',
    }))

  const provenanceMappings: PublishRunResult['provenanceMappings'] =
    plan.provenance.existing.map((prov) => ({
      tripleId: prov.claimTripleId,
      sourceAtomId: prov.sourceAtomId,
      provenanceTripleTermId: prov.computedTripleTermId,
      txHash: '',
      status: 'confirmed',
      errorMessage: 'Already existed on-chain before this run',
    }))

  return { atomMappings, claimMappings, provenanceMappings }
}
