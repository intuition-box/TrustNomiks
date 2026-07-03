'use client'

import { useEffect } from 'react'
import { ErrorState } from '@/components/composite/error-state'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Application error:', error)
  }, [error])

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <ErrorState
        variant="page"
        digest={error.digest}
        onRetry={reset}
        className="w-full max-w-lg border-none bg-transparent"
      />
    </div>
  )
}
