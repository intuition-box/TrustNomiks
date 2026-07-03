'use client'

import { useEffect } from 'react'
import { ErrorState } from '@/components/composite/error-state'

export default function AuthenticatedError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Route error:', error)
  }, [error])

  return (
    <ErrorState
      variant="page"
      digest={error.digest}
      onRetry={reset}
      homeHref="/dashboard"
      className="border-none bg-transparent"
    />
  )
}
