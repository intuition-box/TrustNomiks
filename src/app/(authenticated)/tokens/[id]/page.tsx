'use client'

import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { GraphLoader } from '@/components/patterns/graph-loader'
import { useTokenDetail } from '@/components/token-detail/use-token-detail'
import { DetailView } from '@/components/token-detail/DetailView'

export default function TokenDetailPage() {
  const router = useRouter()
  const params = useParams()
  const {
    token,
    setToken,
    loading,
    graphData,
    vestingResult,
    vestingSegmentInfos,
    maxSupplyNum,
  } = useTokenDetail(params.id)

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <GraphLoader label="Loading token…" />
      </div>
    )
  }

  if (!token) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Token Not Found</h1>
          <p className="text-muted-foreground mt-2">
            The requested token does not exist.
          </p>
          <Button onClick={() => router.push('/dashboard')} className="mt-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Button>
        </div>
      </div>
    )
  }

  return (
    <DetailView
      token={token}
      setToken={setToken}
      graphData={graphData}
      vestingResult={vestingResult}
      vestingSegmentInfos={vestingSegmentInfos}
      maxSupplyNum={maxSupplyNum}
    />
  )
}
