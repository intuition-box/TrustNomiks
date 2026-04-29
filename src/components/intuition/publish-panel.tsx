'use client'

import { useState, useCallback, useRef } from 'react'
import { useAccount, usePublicClient, useWalletClient } from 'wagmi'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Globe, Loader2, AlertCircle, CheckCircle2, RotateCcw, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { PublishSummary } from './publish-summary'
import { PublishedClaimsView } from './published-claims-view'
import { executePublishPlan } from '@/lib/intuition/publish-executor'
import { INTUITION_CHAIN_ID } from '@/lib/intuition/config'
import type { PublishPlanSerialized } from '@/types/intuition'
import type { PublishPlan, PublishEvent, RunStatus } from '@/lib/intuition/types'
import type { Hex } from 'viem'

interface PublishPanelProps {
  tokenId: string
  tokenStatus: string
}

type PanelState = 'idle' | 'loading_plan' | 'plan_ready' | 'publishing' | 'complete' | 'error'

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

const PHASE_LABELS: Record<string, string> = {
  atoms: 'Atoms',
  triples: 'Triples',
  provenance: 'Provenance',
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
    atomsCreated: 0, atomsFailed: 0, atomsSkipped: 0,
    triplesCreated: 0, triplesFailed: 0, triplesSkipped: 0,
    provenanceCreated: 0, provenanceFailed: 0,
  })
  const [aborted, setAborted] = useState(false)
  const runIdRef = useRef<string | null>(null)

  const isEligible = tokenStatus === 'validated'
  const isDryRunEligible = tokenStatus === 'in_review' || tokenStatus === 'validated'
  const isWrongChain = isConnected && chainId !== INTUITION_CHAIN_ID

  // ── Fetch publish plan (dry-run) ────────────────────────────────────────

  const fetchPlan = useCallback(async () => {
    setState('loading_plan')
    setError(null)
    setPlan(null)

    try {
      const res = await fetch(`/api/intuition/publish-plan?tokenId=${tokenId}`)
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
  }, [tokenId])

  // ── Persist chunk to Supabase ─────────────────────────────────────────

  const persistChunk = useCallback(async (
    event: PublishEvent,
    currentChainId: number,
    currentCounters: {
      atomsCreated: number; atomsSkipped: number; atomsFailed: number;
      triplesCreated: number; triplesSkipped: number; triplesFailed: number;
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
        console.error('Chunk persistence failed:', res.status, body.error ?? '')
        toast.warning(`Chunk tracking failed (HTTP ${res.status}) — on-chain data is safe, tracking may be incomplete`)
        return false
      }
      return true
    } catch (err) {
      console.error('Failed to persist chunk:', err)
      toast.warning('Chunk tracking failed (network error) — on-chain data is safe, tracking may be incomplete')
      return false
    }
  }, [])

  // ── Execute publish ─────────────────────────────────────────────────────

  const executePublish = useCallback(async () => {
    if (!walletClient || !publicClient || !plan || !address) {
      const missing = {
        walletClient: !walletClient,
        publicClient: !publicClient,
        plan: !plan,
        address: !address,
      }
      console.warn('[publish] aborted — missing prerequisites:', missing)
      toast.error(
        `Cannot publish — missing: ${Object.entries(missing).filter(([, v]) => v).map(([k]) => k).join(', ')}`,
      )
      return
    }

    setState('publishing')
    setError(null)
    setAborted(false)
    setProgress(null)
    setCounters({
      atomsCreated: 0, atomsFailed: 0, atomsSkipped: plan.atoms.existing.length,
      triplesCreated: 0, triplesFailed: 0, triplesSkipped: plan.triples.existing.length,
      provenanceCreated: 0, provenanceFailed: 0,
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
    let atomsCreated = 0, atomsFailed = 0
    let triplesCreated = 0, triplesFailed = 0
    let provenanceCreated = 0, provenanceFailed = 0
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

      // 2. Execute with batching
      for await (const event of executePublishPlan(fullPlan, walletClient, publicClient)) {
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
            atomsCreated, atomsFailed, atomsSkipped: plan.atoms.existing.length,
            triplesCreated, triplesFailed, triplesSkipped: plan.triples.existing.length,
            provenanceCreated, provenanceFailed,
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
      const finalStatus: RunStatus =
        wasAborted ? (atomsCreated > 0 ? 'partial' : 'failed')
        : (atomsFailed === 0 && triplesFailed === 0 && provenanceFailed === 0)
          ? 'completed'
          : (atomsCreated > 0 || triplesCreated > 0)
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
        const message = 'Run finalization failed — on-chain data is safe but run status may be outdated'
        setError(message)
        setState('error')
        toast.warning(message)
        return
      }

      setState('complete')

      if (hadTrackingIssues) {
        const message = 'On-chain publish completed, but some tracking writes failed. Review Supabase before rerunning.'
        setError(message)
        toast.warning(message)
        return
      }

      if (wasAborted) {
        toast.error('Publication aborted — atom batch failed')
      } else if (finalStatus === 'completed') {
        toast.success(`Published ${atomsCreated} atoms, ${triplesCreated} triples, ${provenanceCreated} provenance`)
      } else {
        toast.warning(`Partial publish: ${atomsCreated} atoms, ${triplesCreated} triples (some failures)`)
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
              status: (atomsCreated > 0 || triplesCreated > 0) ? 'partial' : 'failed',
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
            console.error('Error-path finalize failed:', errFinalizeRes.status, body.error ?? '')
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

        const done = counters.atomsCreated + counters.atomsFailed
          + counters.triplesCreated + counters.triplesFailed
          + counters.provenanceCreated + counters.provenanceFailed
        return Math.round((done / grandTotal) * 100)
      })()
    : 0

  return (
    <div className="space-y-4">
      <PublishedClaimsView tokenId={tokenId} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Globe className="h-5 w-5" />
            Publish to Intuition
            <Badge variant="outline" className="text-xs">testnet</Badge>
          </CardTitle>
          <CardDescription>
            Publish this token&apos;s knowledge graph on-chain to the Intuition Protocol testnet.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Connection warnings */}
          {!isConnected && (
            <div className="flex items-center gap-2 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800 dark:border-yellow-900 dark:bg-yellow-950 dark:text-yellow-200">
              <AlertCircle className="h-4 w-4 shrink-0" />
              Connect your wallet to publish on-chain.
            </div>
          )}

          {isWrongChain && (
            <div className="flex items-center gap-2 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800 dark:border-yellow-900 dark:bg-yellow-950 dark:text-yellow-200">
              <AlertCircle className="h-4 w-4 shrink-0" />
              Switch to Intuition Testnet (chain {INTUITION_CHAIN_ID}) to publish.
            </div>
          )}

          {!isEligible && tokenStatus === 'in_review' && (
            <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200">
              <AlertCircle className="h-4 w-4 shrink-0" />
              Token is in review. You can preview the plan but publishing requires &quot;validated&quot; status.
            </div>
          )}

          {/* Error display */}
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Plan display */}
          {plan && state !== 'idle' && <PublishSummary plan={plan} />}

          {/* Batch progress display */}
          {state === 'publishing' && progress && (
            <div className="space-y-3 rounded-lg border p-4">
              {/* Phase indicator */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  {(['atoms', 'triples', 'provenance'] as const).map((phase) => (
                    <Badge
                      key={phase}
                      variant={progress.phase === phase ? 'default' : 'outline'}
                      className={
                        progress.phase === phase
                          ? ''
                          : (['atoms', 'triples', 'provenance'].indexOf(phase) <
                              ['atoms', 'triples', 'provenance'].indexOf(progress.phase))
                            ? 'border-green-300 text-green-700 dark:border-green-800 dark:text-green-400'
                            : ''
                      }
                    >
                      {PHASE_LABELS[phase]}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Chunk progress */}
              <div className="flex items-center gap-2 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="font-medium">{PHASE_LABELS[progress.phase]}</span>
                <span className="text-muted-foreground">
                  — Chunk {progress.currentChunk + (progress.chunkStatus === 'processing' ? 1 : 0)}/{progress.totalChunks}
                  {progress.chunkStatus === 'processing' && ' — Waiting for wallet...'}
                </span>
              </div>

              {/* Phase progress bar */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{progress.itemsProcessed}/{progress.totalItems} items</span>
                  <span>{totalProgress}% overall</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${totalProgress}%` }}
                  />
                </div>
              </div>

              {/* Live counters */}
              <div className="flex gap-4 text-xs text-muted-foreground">
                {counters.atomsCreated > 0 && <span>{counters.atomsCreated} atoms created</span>}
                {counters.triplesCreated > 0 && <span>{counters.triplesCreated} triples created</span>}
                {counters.provenanceCreated > 0 && <span>{counters.provenanceCreated} provenance created</span>}
                {(counters.atomsFailed + counters.triplesFailed + counters.provenanceFailed) > 0 && (
                  <span className="text-red-500">
                    {counters.atomsFailed + counters.triplesFailed + counters.provenanceFailed} failed
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Completion */}
          {state === 'complete' && !aborted && (
            <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Publication complete — {counters.atomsCreated} atoms, {counters.triplesCreated} triples, {counters.provenanceCreated} provenance.
            </div>
          )}

          {state === 'complete' && aborted && (
            <div className="flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-orange-800 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-200">
              <XCircle className="h-4 w-4 shrink-0" />
              Publication aborted after atom failure — {counters.atomsCreated} atoms were created before abort. Re-run to continue.
            </div>
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
                  Analyzing...
                </>
              ) : plan ? (
                <>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Refresh Plan
                </>
              ) : (
                'Prepare Publish'
              )}
            </Button>

            {/* Publish */}
            {plan && (
              <Button
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
                    Publishing...
                  </>
                ) : (
                  <>
                    <Globe className="mr-2 h-4 w-4" />
                    Publish On-Chain
                  </>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
