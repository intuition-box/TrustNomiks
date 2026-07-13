'use client'

import { useEffect, useState } from 'react'
import { Copy, Link2, Link2Off, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type { FactoryShareLink } from '@/types/factory'
import { useFactoryForm } from './factory-form-context'

/**
 * Share controls for a design: one live public link at a time. Creating
 * mints an unguessable slug; revoking kills the URL for good (re-creating
 * mints a NEW slug). The lightpaper shows the design's substance including
 * its notes and saved stress tests.
 */
export function ShareDesignCard({ projectId }: { projectId: string }) {
  const { supabase } = useFactoryForm()
  const [link, setLink] = useState<FactoryShareLink | null>(null)
  // Derived loading state, no synchronous setState in the effect.
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const loading = loadedFor !== projectId

  useEffect(() => {
    let cancelled = false
    supabase
      .from('factory_share_links')
      .select('*')
      .eq('project_id', projectId)
      .is('revoked_at', null)
      .maybeSingle()
      .then(({ data, error }: { data: unknown; error: unknown }) => {
        if (cancelled) return
        if (error) {
          console.error('Share link fetch failed:', error)
        } else {
          setLink((data as FactoryShareLink | null) ?? null)
        }
        setLoadedFor(projectId)
      })
    return () => {
      cancelled = true
    }
  }, [projectId, supabase])

  const shareUrl = (slug: string) => `${window.location.origin}/share/${slug}`

  const createLink = async () => {
    setBusy(true)
    try {
      const { data, error } = await supabase
        .from('factory_share_links')
        .insert({ project_id: projectId })
        .select()
        .single()
      if (error) {
        toast.error(error.message)
        return
      }
      const created = data as FactoryShareLink
      setLink(created)
      await navigator.clipboard
        .writeText(shareUrl(created.slug))
        .catch(() => {})
      toast.success('Share link created and copied')
    } finally {
      setBusy(false)
    }
  }

  const copyLink = async () => {
    if (!link) return
    await navigator.clipboard.writeText(shareUrl(link.slug))
    toast.success('Link copied')
  }

  const revokeLink = async () => {
    if (!link) return
    setBusy(true)
    try {
      const { error } = await supabase
        .from('factory_share_links')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', link.id)
      if (error) {
        toast.error(error.message)
        return
      }
      setLink(null)
      toast.success('Link revoked: the lightpaper is no longer reachable')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3 rounded-lg bg-surface-2 px-4 py-3 text-left">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <Link2 className="h-4 w-4 text-primary" aria-hidden />
          Public lightpaper
        </span>
        {link && <span className="text-xs text-success">Live</span>}
      </div>
      <p className="text-xs text-muted-foreground">
        Anyone with the link sees a read-only lightpaper of this design:
        allocation, vesting, emission, funding and saved stress tests, including
        your notes. Revoking kills the URL for good.
      </p>
      {loading ? (
        <p className="text-xs text-muted-foreground">Checking share status</p>
      ) : link ? (
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded bg-surface-1 px-2 py-1.5 font-mono text-xs">
            /share/{link.slug}
          </code>
          <Button type="button" variant="outline" size="sm" onClick={copyLink}>
            <Copy className="h-3.5 w-3.5" aria-hidden />
            Copy
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={revokeLink}
          >
            <Link2Off className="h-3.5 w-3.5" aria-hidden />
            Revoke
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={createLink}
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Link2 className="h-3.5 w-3.5" aria-hidden />
          )}
          Create share link
        </Button>
      )}
    </div>
  )
}
