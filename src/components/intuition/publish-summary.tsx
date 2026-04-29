'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatEther } from 'viem'
import type { PublishPlanSerialized } from '@/types/intuition'

interface PublishSummaryProps {
  plan: PublishPlanSerialized
}

export function PublishSummary({ plan }: PublishSummaryProps) {
  const { summary, estimatedCost, batchInfo } = plan
  const totalCostEth = formatEther(BigInt(estimatedCost.totalCost))
  const hasWork =
    summary.atomsToCreate > 0 ||
    summary.triplesToCreate > 0 ||
    summary.provenanceToCreate > 0

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Publish Plan</CardTitle>
        <CardDescription>
          {hasWork
            ? `${batchInfo.estimatedWalletSignatures} wallet signature${batchInfo.estimatedWalletSignatures > 1 ? 's' : ''} needed (${summary.atomsToCreate + summary.triplesToCreate + summary.provenanceToCreate} items batched)`
            : 'Everything is already published on-chain'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          {/* Atoms */}
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">Atoms</p>
            <div className="flex flex-wrap items-center gap-2">
              {summary.atomsToCreate > 0 && (
                <Badge variant="default">{summary.atomsToCreate} to create</Badge>
              )}
              {summary.atomsExisting > 0 && (
                <Badge variant="secondary">{summary.atomsExisting} existing</Badge>
              )}
              {summary.atomsToCreate === 0 && summary.atomsExisting === 0 && (
                <Badge variant="outline">None</Badge>
              )}
            </div>
          </div>

          {/* Triples */}
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">Triples</p>
            <div className="flex flex-wrap items-center gap-2">
              {summary.triplesToCreate > 0 && (
                <Badge variant="default">{summary.triplesToCreate} to create</Badge>
              )}
              {summary.triplesExisting > 0 && (
                <Badge variant="secondary">{summary.triplesExisting} existing</Badge>
              )}
              {summary.triplesToCreate === 0 && summary.triplesExisting === 0 && (
                <Badge variant="outline">None</Badge>
              )}
            </div>
          </div>

          {/* Provenance */}
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">Provenance</p>
            <div className="flex flex-wrap items-center gap-2">
              {summary.provenanceToCreate > 0 && (
                <Badge variant="default">{summary.provenanceToCreate} to create</Badge>
              )}
              {summary.provenanceExisting > 0 && (
                <Badge variant="secondary">{summary.provenanceExisting} existing</Badge>
              )}
              {summary.provenanceToCreate === 0 && summary.provenanceExisting === 0 && (
                <Badge variant="outline">None</Badge>
              )}
            </div>
          </div>
        </div>

        {/* Cost estimate + batch info */}
        {hasWork && (
          <div className="rounded-lg border p-3 space-y-2">
            <div className="flex items-baseline justify-between">
              <p className="text-sm font-medium">Estimated cost</p>
              <p className="text-2xl font-bold">{totalCostEth} TRUST</p>
            </div>
            <p className="text-xs text-muted-foreground">
              {summary.atomsToCreate} atoms ({formatEther(BigInt(estimatedCost.totalAtomsCost))} TRUST)
              {' + '}
              {summary.triplesToCreate + summary.provenanceToCreate} triples ({formatEther(BigInt(estimatedCost.totalTriplesCost) + BigInt(estimatedCost.totalProvenanceCost))} TRUST)
            </p>
            {BigInt(estimatedCost.extraDepositPerUnit) > BigInt(0) && (
              <p className="text-xs text-muted-foreground">
                Includes {formatEther(BigInt(estimatedCost.extraDepositPerUnit))} TRUST seed deposit per item
                ({formatEther(BigInt(estimatedCost.atomCostPerUnit))} creation + {formatEther(BigInt(estimatedCost.extraDepositPerUnit))} seed per atom · {formatEther(BigInt(estimatedCost.tripleCostPerUnit))} creation + {formatEther(BigInt(estimatedCost.extraDepositPerUnit))} seed per triple)
              </p>
            )}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground border-t pt-2 mt-2">
              <span>
                Wallet signatures: <strong className="text-foreground">{batchInfo.estimatedWalletSignatures}</strong>
              </span>
              {batchInfo.atomChunks > 0 && (
                <span>Atoms: {batchInfo.atomChunks} chunk{batchInfo.atomChunks > 1 ? 's' : ''} of {batchInfo.atomChunkSize}</span>
              )}
              {batchInfo.tripleChunks > 0 && (
                <span>Triples: {batchInfo.tripleChunks} chunk{batchInfo.tripleChunks > 1 ? 's' : ''} of {batchInfo.tripleChunkSize}</span>
              )}
              {batchInfo.provenanceChunks > 0 && (
                <span>Provenance: {batchInfo.provenanceChunks} chunk{batchInfo.provenanceChunks > 1 ? 's' : ''} of {batchInfo.provenanceChunkSize}</span>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
