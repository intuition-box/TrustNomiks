'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ExternalLink } from 'lucide-react'

interface PublishedClaimsViewProps {
  tokenId: string
}

interface PublishRun {
  id: string
  wallet_address: string
  status: string
  atoms_created: number
  triples_created: number
  started_at: string
  completed_at: string | null
}

export function PublishedClaimsView({ tokenId }: PublishedClaimsViewProps) {
  const supabase = createClient()
  const [runs, setRuns] = useState<PublishRun[]>([])
  const [atomCount, setAtomCount] = useState(0)
  const [tripleCount, setTripleCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)

      // Two separate queries in parallel:
      // 1. Last 5 runs for UI display (limited)
      // 2. ALL runs' counters for exact totals (no limit)
      const [recentRunsResult, allCountsResult] = await Promise.all([
        supabase
          .from('intuition_publish_runs')
          .select('id, wallet_address, status, atoms_created, triples_created, started_at, completed_at')
          .eq('token_id', tokenId)
          .order('started_at', { ascending: false })
          .limit(5),
        supabase
          .from('intuition_publish_runs')
          .select('atoms_created, triples_created')
          .eq('token_id', tokenId),
      ])

      const recentRuns = recentRunsResult.data ?? []
      const allCounts = allCountsResult.data ?? []

      // Sum across ALL runs — not just the 5 displayed
      let totalAtoms = 0
      let totalTriples = 0
      for (const row of allCounts) {
        totalAtoms += row.atoms_created
        totalTriples += row.triples_created
      }

      setRuns(recentRuns)
      setAtomCount(totalAtoms)
      setTripleCount(totalTriples)
      setLoading(false)
    }

    fetchData()
  }, [tokenId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <Card>
        <CardContent className="py-6">
          <p className="text-sm text-muted-foreground text-center">Loading publish history...</p>
        </CardContent>
      </Card>
    )
  }

  if (runs.length === 0) {
    return null // Don't render anything if never published
  }

  const latestRun = runs[0]

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          On-Chain Status
          <Badge
            variant={latestRun.status === 'completed' ? 'default' : latestRun.status === 'partial' ? 'secondary' : 'destructive'}
          >
            {latestRun.status}
          </Badge>
        </CardTitle>
        <CardDescription>
          {atomCount} atoms, {tripleCount} triples confirmed on Intuition testnet
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Latest run info */}
        <div className="text-sm space-y-1">
          <p>
            <span className="text-muted-foreground">Last publish:</span>{' '}
            {new Date(latestRun.started_at).toLocaleDateString()}
          </p>
          <p>
            <span className="text-muted-foreground">Wallet:</span>{' '}
            <code className="text-xs">{latestRun.wallet_address.slice(0, 6)}...{latestRun.wallet_address.slice(-4)}</code>
          </p>
          <p>
            <span className="text-muted-foreground">Created:</span>{' '}
            {latestRun.atoms_created} atoms, {latestRun.triples_created} triples
          </p>
        </div>

        {/* Link to Intuition explorer */}
        <a
          href={`https://testnet.hub.intuition.systems/`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          View on Intuition Explorer
          <ExternalLink className="h-3 w-3" />
        </a>
      </CardContent>
    </Card>
  )
}
