'use client'

import { useRoleContext, type Role } from '@/components/role-context'

export interface UseRoleResult {
  role: Role
  isContributor: boolean
  isViewer: boolean
}

/**
 * The current user's derived role: `contributor` (>= 1 active wallet link)
 * or `viewer` (none), computed server-side in (authenticated)/layout.tsx and
 * provided via `RoleProvider`. Throws if used outside that provider.
 */
export function useRole(): UseRoleResult {
  const role = useRoleContext()
  return {
    role,
    isContributor: role === 'contributor',
    isViewer: role === 'viewer',
  }
}
