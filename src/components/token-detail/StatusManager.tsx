'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Edit, Trash2, Download } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import {
  convertTokenToTriples,
  downloadTriplesAsJSON,
} from '@/lib/utils/triples-export'
import { STATUS_RANK } from './detail-helpers'
import type { TokenData } from './types'

interface StatusManagerProps {
  token: TokenData
  setToken: (token: TokenData) => void
}

/**
 * The token detail page's action row: status change (with downgrade
 * confirmation), edit routing, triples export, and delete. See
 * docs/refactor-plan-token-routes-20260620.md — Part B step 3.
 */
export function StatusManager({ token, setToken }: StatusManagerProps) {
  const [pendingStatus, setPendingStatus] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const handleStatusSelect = (newStatus: string) => {
    const currentRank = STATUS_RANK[token.status] ?? 0
    const newRank = STATUS_RANK[newStatus] ?? 0
    if (newRank < currentRank) {
      setPendingStatus(newStatus)
    } else {
      handleStatusChange(newStatus)
    }
  }

  const handleStatusChange = async (newStatus: string) => {
    try {
      const { error } = await supabase
        .from('tokens')
        .update({ status: newStatus })
        .eq('id', token.id)

      if (error) throw error

      setToken({ ...token, status: newStatus })
      toast.success('Status updated successfully')
    } catch (error: unknown) {
      console.error('Error updating status:', error)
      toast.error('Failed to update status')
    }
  }

  const handleDelete = async () => {
    try {
      const { error } = await supabase
        .from('tokens')
        .delete()
        .eq('id', token.id)

      if (error) throw error

      toast.success('Token deleted successfully')
      router.push('/dashboard')
    } catch (error: unknown) {
      console.error('Error deleting token:', error)
      toast.error('Failed to delete token')
    }
  }

  const handleExport = () => {
    try {
      // Prepare data in the format expected by convertTokenToTriples
      const completeTokenData = {
        token: {
          id: token.id,
          name: token.name,
          ticker: token.ticker,
          chain: token.chain || undefined,
          contract_address: token.contract_address || undefined,
          tge_date: token.tge_date || undefined,
          category: token.category || undefined,
          sector: token.sector || undefined,
          notes: token.notes || undefined,
          status: token.status,
          completeness: token.completeness,
          created_at: token.created_at,
          updated_at: token.created_at,
        },
        supply: token.supply_metrics || undefined,
        allocations: token.allocation_segments,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- DB row shape from joined query
        vesting: token.vesting_schedules.map((v: any) => ({
          id: v.id,
          allocation_id: v.allocation_id,
          cliff_months: v.cliff_months,
          duration_months: v.duration_months,
          frequency: v.frequency,
          tge_percentage: v.tge_percentage,
          cliff_unlock_percentage: v.cliff_unlock_percentage,
          notes: v.notes,
          allocation: {
            label: v.allocation.label,
            segment_type:
              token.allocation_segments.find((a) => a.id === v.allocation_id)
                ?.segment_type || '',
          },
        })),
        emission: token.emission_models || undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- complex triples-export type
        sources: token.data_sources as any,
        risk_flags: token.risk_flags,
      }

      // Convert to triples
      const triples = convertTokenToTriples(completeTokenData)

      // Download as JSON
      const timestamp = new Date().toISOString().split('T')[0]
      const filename = `${token.ticker}-triples-${timestamp}.json`
      downloadTriplesAsJSON(triples, filename)

      toast.success(`Exported ${triples.length} triples for ${token.ticker}`)
    } catch (error) {
      console.error('Export failed:', error)
      toast.error('Failed to export triples')
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Select onValueChange={handleStatusSelect} value={token.status}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Change status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="in_review">In Review</SelectItem>
            <SelectItem value="validated">Validated</SelectItem>
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          onClick={() => router.push(`/tokens/new?id=${token.id}`)}
        >
          <Edit className="mr-2 h-4 w-4" />
          Edit
        </Button>

        <Button variant="outline" onClick={handleExport}>
          <Download className="mr-2 h-4 w-4" />
          Export
        </Button>

        {/* Delete (existing AlertDialog flow) */}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="icon" aria-label="Delete token">
              <Trash2 className="h-4 w-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete the
                token
                <span className="font-semibold">
                  {' '}
                  {token.name} ({token.ticker})
                </span>{' '}
                and all its associated data.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-destructive text-destructive-foreground"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Downgrade confirmation (existing pendingStatus flow) */}
      <AlertDialog
        open={!!pendingStatus}
        onOpenChange={(open) => {
          if (!open) setPendingStatus(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Downgrade token status?</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to change the status of {token?.name} (
              {token?.ticker}) from &quot;{token?.status?.replace('_', ' ')}
              &quot; to &quot;{pendingStatus?.replace('_', ' ')}&quot;. This may
              require re-validation later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingStatus) {
                  handleStatusChange(pendingStatus)
                  setPendingStatus(null)
                }
              }}
            >
              Confirm Downgrade
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
