'use client'

import { useState } from 'react'
import {
  BookMarked,
  Clock,
  Cpu,
  FolderOpen,
  Pencil,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ENGINE_VERSION, MAX_SAVED_SCENARIOS } from '@/lib/tokenomics'
import type { FactorySimulationSnapshot } from '@/types/factory'
import { useFactoryForm } from './factory-form-context'
import { SIMULATION_KPI_ROWS } from './simulation-kpi-table'

const COMPARE_KEYS = [
  'finalPrice',
  'cagr',
  'maxDrawdown',
  'pctTimeBelowInitial',
] as const

const formatRunDate = (iso: string): string =>
  new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

interface ScenarioLibraryProps {
  snapshots: FactorySimulationSnapshot[]
  loading: boolean
  /** Snapshot currently shown in the studio, if any. */
  activeId: string | null
  onLoad: (snapshot: FactorySimulationSnapshot) => void
  onRename: (id: string, name: string) => Promise<string | null>
  onRemove: (id: string) => Promise<string | null>
}

/**
 * Saved scenarios: load one back into the composer, rename, delete, and
 * compare their medians side by side. Two chips flag drift: the design
 * changed since a run, or the run used an older engine.
 */
export function ScenarioLibrary({
  snapshots,
  loading,
  activeId,
  onLoad,
  onRename,
  onRemove,
}: ScenarioLibraryProps) {
  const { initialUpdatedAt } = useFactoryForm()
  const [renaming, setRenaming] = useState<{
    id: string
    value: string
    error: string | null
  } | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const confirmRename = async () => {
    if (!renaming) return
    const error = await onRename(renaming.id, renaming.value)
    if (error) {
      setRenaming({ ...renaming, error })
      return
    }
    setRenaming(null)
  }

  const confirmDelete = async () => {
    if (!deletingId) return
    const error = await onRemove(deletingId)
    if (error) toast.error(error)
    setDeletingId(null)
  }

  const deleting = deletingId
    ? (snapshots.find((snapshot) => snapshot.id === deletingId) ?? null)
    : null

  return (
    <div className="space-y-4 rounded-xl border bg-surface-1 px-5 py-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <BookMarked className="h-4 w-4 text-primary" aria-hidden />
          Scenario library
        </h3>
        <span className="tabular text-xs text-muted-foreground">
          {snapshots.length} of {MAX_SAVED_SCENARIOS} saved
        </span>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">Loading saved scenarios</p>
      ) : snapshots.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Run a stress test and save it to start comparing hypotheses (up to{' '}
          {MAX_SAVED_SCENARIOS} per design).
        </p>
      ) : (
        <div>
          {snapshots.map((snapshot) => {
            const stale =
              initialUpdatedAt !== null &&
              snapshot.design_updated_at !== initialUpdatedAt
            const oldEngine = snapshot.engine_version !== ENGINE_VERSION
            const isActive = snapshot.id === activeId
            return (
              <div
                key={snapshot.id}
                className="flex flex-wrap items-center gap-2 border-b py-2.5 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {snapshot.name}
                  </p>
                  <p className="tabular text-xs text-muted-foreground">
                    run {formatRunDate(snapshot.created_at)}
                  </p>
                </div>
                {stale && (
                  <Badge variant="outline" className="gap-1">
                    <Clock
                      className="h-3 w-3"
                      style={{ color: 'hsl(var(--warning))' }}
                      aria-hidden
                    />
                    Design changed since this run
                  </Badge>
                )}
                {oldEngine && (
                  <Badge variant="outline" className="gap-1">
                    <Cpu className="h-3 w-3" aria-hidden />
                    engine v{snapshot.engine_version}
                  </Badge>
                )}
                <div className="flex items-center gap-1">
                  {/* Stays actionable on the displayed row: after a reload,
                      re-loading is how its assumptions (price, depth, sell
                      shares) get pushed back into the panel's knobs. */}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onLoad(snapshot)}
                  >
                    <FolderOpen className="h-3.5 w-3.5" aria-hidden />
                    {isActive ? 'Reload' : 'Load'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Rename scenario ${snapshot.name}`}
                    onClick={() =>
                      setRenaming({
                        id: snapshot.id,
                        value: snapshot.name,
                        error: null,
                      })
                    }
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Delete scenario ${snapshot.name}`}
                    onClick={() => setDeletingId(snapshot.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {snapshots.length >= 2 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Compare scenarios</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="py-1.5 pr-3 text-left font-medium">
                    Median of
                  </th>
                  {snapshots.map((snapshot) => (
                    <th
                      key={snapshot.id}
                      className="max-w-32 truncate py-1.5 px-3 text-right font-medium"
                    >
                      {snapshot.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SIMULATION_KPI_ROWS.filter((row) =>
                  (COMPARE_KEYS as readonly string[]).includes(row.key),
                ).map((row) => (
                  <tr key={row.key} className="border-b last:border-b-0">
                    <td className="py-1.5 pr-3">{row.label}</td>
                    {snapshots.map((snapshot) => (
                      <td
                        key={snapshot.id}
                        className="tabular py-1.5 px-3 text-right"
                      >
                        {row.format(snapshot.result.kpis[row.key].p50)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Dialog
        open={renaming !== null}
        onOpenChange={(open) => {
          if (!open) setRenaming(null)
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename scenario</DialogTitle>
          </DialogHeader>
          <Input
            aria-label="New scenario name"
            value={renaming?.value ?? ''}
            maxLength={80}
            onChange={(e) =>
              setRenaming(
                renaming
                  ? { ...renaming, value: e.target.value, error: null }
                  : null,
              )
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter') void confirmRename()
            }}
          />
          {renaming?.error && (
            <p className="text-xs" style={{ color: 'hsl(var(--warning))' }}>
              {renaming.error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRenaming(null)}
            >
              Cancel
            </Button>
            <Button type="button" onClick={() => void confirmRename()}>
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deletingId !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingId(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this scenario?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting
                ? `"${deleting.name}" and its saved results will be removed. Runs are reproducible from the same seed and assumptions.`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDelete()}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
