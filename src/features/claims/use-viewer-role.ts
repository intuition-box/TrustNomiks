'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

interface ViewerRole {
  isOwner: boolean
  isModerator: boolean
  userId: string | null
}

const NONE: ViewerRole = { isOwner: false, isModerator: false, userId: null }

async function fetchViewerRole(createdBy: string): Promise<ViewerRole> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NONE

  const { data: modRows, error } = await supabase
    .from('user_roles')
    .select('id')
    .eq('user_id', user.id)
    .eq('role', 'moderator')
    .is('revoked_at', null)

  if (error) throw error

  return {
    isOwner: createdBy === user.id,
    isModerator: (modRows?.length ?? 0) > 0,
    userId: user.id,
  }
}

/**
 * The viewer's relationship to a token: owner (created it) and/or moderator
 * (an active, non-revoked `user_roles` row). Drives whether the Resolve Box
 * provenance band shows the accept/reject resolution panel.
 */
export function useViewerRole(token: { created_by: string }): ViewerRole {
  const { data } = useQuery({
    queryKey: ['viewer-role', token.created_by],
    queryFn: () => fetchViewerRole(token.created_by),
  })

  return data ?? NONE
}
