'use client'

import { useState } from 'react'
import { AlertCircle, ArrowUpRight, Lock, Rocket } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { useFactoryForm } from './factory-form-context'

/**
 * Completion-screen card: promote a 100/100 design into a screener token.
 * Irreversible by design: the design becomes a read-only archive, and the
 * minted token lives its own life in the screener (a private draft the owner
 * keeps enriching there).
 */
export function PromoteDesignCard() {
  const {
    router,
    projectStatus,
    promotedTokenId,
    finalScore,
    handlePromote,
    loading,
  } = useFactoryForm()
  const [promoting, setPromoting] = useState(false)

  if (projectStatus === 'promoted') {
    return (
      <div className="flex items-center justify-between gap-4 rounded-lg border border-success/30 bg-surface-2 px-4 py-3">
        <p className="flex min-w-0 items-center gap-2 text-sm">
          <Lock className="h-4 w-4 shrink-0 text-success" aria-hidden />
          <span className="truncate">
            Promoted: this design is a read-only archive.
          </span>
        </p>
        {promotedTokenId && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/tokens/new?id=${promotedTokenId}`)}
          >
            Open token
            <ArrowUpRight className="h-4 w-4" aria-hidden />
          </Button>
        )}
      </div>
    )
  }

  const eligible = finalScore === 100

  const onConfirm = async () => {
    setPromoting(true)
    const tokenId = await handlePromote()
    setPromoting(false)
    if (tokenId) router.push(`/tokens/new?id=${tokenId}`)
  }

  return (
    <div className="space-y-2 rounded-lg border bg-surface-2 px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 space-y-0.5">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Rocket className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            Promote to the screener
          </p>
          <p className="text-xs text-muted-foreground">
            Mint a real token record from this design. The token continues in
            the screener; the design becomes a read-only archive.
          </p>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="brand"
              size="sm"
              disabled={!eligible || loading || promoting}
            >
              Promote
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Promote this design?</AlertDialogTitle>
              <AlertDialogDescription>
                This cannot be undone. A screener token draft is created from
                the design, and the design itself becomes read-only. The token
                then lives in the screener: completeness, review and any future
                publishing happen there.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={onConfirm} disabled={promoting}>
                Promote design
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      {!eligible && (
        <p className="flex items-center gap-1.5 text-xs text-warning">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Reach 100 / 100 to promote: every section must be complete.
        </p>
      )}
    </div>
  )
}
