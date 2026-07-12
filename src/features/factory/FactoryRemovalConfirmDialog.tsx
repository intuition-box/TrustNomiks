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

/** Confirms destructive removal of an allocation segment row (the only
 *  removable row family in Factory: no sources, no risk flags). */
export function FactoryRemovalConfirmDialog() {
  const {
    pendingRemoval,
    setPendingRemoval,
    segmentGuideRowIndex,
    setSegmentGuideRowIndex,
    closeSegmentGuide,
    remove,
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
          <AlertDialogTitle>Remove allocation segment?</AlertDialogTitle>
          <AlertDialogDescription>
            This will remove the allocation segment and any vesting schedule
            tied to it. This cannot be undone after saving.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (!pendingRemoval) return
              const index = pendingRemoval.index
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
