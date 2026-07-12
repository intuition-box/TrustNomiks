'use client'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useFactoryForm } from './factory-form-context'

/** Confirms destructive removal of an allocation segment or funding round
 *  row (Factory has no sources and no risk flags). */
export function FactoryRemovalConfirmDialog() {
  const {
    pendingRemoval,
    setPendingRemoval,
    segmentGuideRowIndex,
    setSegmentGuideRowIndex,
    closeSegmentGuide,
    remove,
    removeRound,
  } = useFactoryForm()

  return (
    <AlertDialog
      open={!!pendingRemoval}
      onOpenChange={(open) => {
        if (!open) setPendingRemoval(null)
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {pendingRemoval?.type === 'funding'
              ? 'Remove funding round?'
              : 'Remove allocation segment?'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {pendingRemoval?.type === 'funding'
              ? 'This will remove the funding round. This cannot be undone after saving.'
              : 'This will remove the allocation segment and any vesting schedule tied to it. This cannot be undone after saving.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (!pendingRemoval) return
              const index = pendingRemoval.index
              if (pendingRemoval.type === 'funding') {
                removeRound(index)
                setPendingRemoval(null)
                return
              }
              if (segmentGuideRowIndex === index) {
                closeSegmentGuide()
              } else if (
                segmentGuideRowIndex !== null &&
                segmentGuideRowIndex > index
              ) {
                setSegmentGuideRowIndex(segmentGuideRowIndex - 1)
              }
              remove(index)
              setPendingRemoval(null)
            }}
          >
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
