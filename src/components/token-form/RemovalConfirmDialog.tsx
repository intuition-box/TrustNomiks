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
import { useTokenForm } from './token-form-context'

/** Confirms destructive removal of an allocation segment, data source, or risk flag row. */
export function RemovalConfirmDialog() {
  const {
    pendingRemoval,
    setPendingRemoval,
    segmentGuideRowIndex,
    setSegmentGuideRowIndex,
    closeSegmentGuide,
    remove,
    removeRisk,
    removeSource,
  } = useTokenForm()

  return (
    <AlertDialog open={!!pendingRemoval} onOpenChange={(open) => { if (!open) setPendingRemoval(null) }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {pendingRemoval?.type === 'allocation'
              ? 'Remove allocation segment?'
              : pendingRemoval?.type === 'risk'
              ? 'Remove risk flag?'
              : 'Remove data source?'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {pendingRemoval?.type === 'allocation'
              ? 'This will remove the allocation segment and any vesting schedule tied to it. This cannot be undone after saving.'
              : pendingRemoval?.type === 'risk'
              ? 'This will remove the risk flag. This cannot be undone after saving.'
              : 'This will remove the data source and any claim attributions linked to it. This cannot be undone after saving.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (!pendingRemoval) return
              if (pendingRemoval.type === 'allocation') {
                const index = pendingRemoval.index
                if (segmentGuideRowIndex === index) {
                  closeSegmentGuide()
                } else if (segmentGuideRowIndex !== null && segmentGuideRowIndex > index) {
                  setSegmentGuideRowIndex(segmentGuideRowIndex - 1)
                }
                remove(index)
              } else if (pendingRemoval.type === 'risk') {
                removeRisk(pendingRemoval.index)
              } else {
                removeSource(pendingRemoval.index)
              }
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
