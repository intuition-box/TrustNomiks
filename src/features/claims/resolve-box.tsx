'use client'

import { useEffect, useState } from 'react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { listFields } from '@/lib/claims/field-registry'
import { FieldPicker } from '@/features/claims/field-picker'
import { ResolveBoxSentence } from '@/features/claims/resolve-box-sentence'
import { UpdateForm } from '@/features/claims/update-form'
import { DisputeForm } from '@/features/claims/dispute-form'
import { ResolveBoxProvenance } from '@/features/claims/resolve-box-provenance'
import type { ChallengeAnchor } from '@/features/claims/challenge-target'

interface ResolveBoxProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  anchor: ChallengeAnchor
  token: { id: string; status: string; updated_at: string; created_by: string }
}

/**
 * The Resolve Box drawer (milestone J2a): band (1) the claim sentence, band
 * (2) update/dispute forms, band (4) provenance + resolution. There is no
 * on-chain stake/consensus band yet (J2b); opening a challenge only records
 * it in the database.
 */
export function ResolveBox({
  open,
  onOpenChange,
  anchor,
  token,
}: ResolveBoxProps) {
  const fields = listFields(anchor.claimType)
  const [fieldKey, setFieldKey] = useState(
    () => anchor.fieldKey ?? fields[0]?.key ?? '',
  )
  const [mode, setMode] = useState<'update' | 'dispute'>('update')

  // A different anchor/field opened: reset local selection state.
  useEffect(() => {
    setFieldKey(anchor.fieldKey ?? fields[0]?.key ?? '')
    setMode('update')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor.claimType, anchor.claimId, anchor.fieldKey])

  const handleSuccess = () => onOpenChange(false)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Resolve claim</SheetTitle>
          <SheetDescription>
            Propose a correction or flag this claim as disputed.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-5">
          {anchor.anchorMode === 'row' && (
            <FieldPicker
              claimType={anchor.claimType}
              value={fieldKey}
              onChange={setFieldKey}
            />
          )}

          {fieldKey && (
            <>
              <ResolveBoxSentence anchor={anchor} fieldKey={fieldKey} />

              <div className="space-y-3">
                <div className="inline-flex gap-1 rounded-lg border bg-surface-2 p-1">
                  <Button
                    type="button"
                    size="sm"
                    variant={mode === 'update' ? 'default' : 'ghost'}
                    aria-pressed={mode === 'update'}
                    onClick={() => setMode('update')}
                  >
                    Update
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={mode === 'dispute' ? 'default' : 'ghost'}
                    aria-pressed={mode === 'dispute'}
                    onClick={() => setMode('dispute')}
                  >
                    Dispute
                  </Button>
                </div>

                {mode === 'update' ? (
                  <UpdateForm
                    tokenId={token.id}
                    anchor={anchor}
                    fieldKey={fieldKey}
                    onSuccess={handleSuccess}
                  />
                ) : (
                  <DisputeForm
                    tokenId={token.id}
                    anchor={anchor}
                    fieldKey={fieldKey}
                    onSuccess={handleSuccess}
                  />
                )}

                <p className="text-xs text-muted-foreground">
                  On-chain staking for this challenge arrives in a future
                  update.
                </p>
              </div>

              <ResolveBoxProvenance
                tokenId={token.id}
                anchor={anchor}
                fieldKey={fieldKey}
                token={token}
              />
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
