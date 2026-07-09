'use client'

import { createContext, useContext, type ReactNode } from 'react'

export type Role = 'viewer' | 'contributor'

const RoleContext = createContext<Role | null>(null)

/**
 * Raw role context accessor. Prefer `useRole` (src/hooks/use-role.ts), which
 * adds the `isContributor`/`isViewer` convenience booleans.
 */
export function useRoleContext(): Role {
  const ctx = useContext(RoleContext)
  if (ctx === null) {
    throw new Error('useRoleContext must be used within a RoleProvider')
  }
  return ctx
}

/**
 * Makes the server-computed role available to descendants without prop
 * drilling. Role is derived in (authenticated)/layout.tsx from whether the
 * user has >= 1 active `wallet_links` row (contributor) or none (viewer).
 * Additive only: nothing consumes this yet, CTA gating lands in Phase 5.
 */
export function RoleProvider({
  role,
  children,
}: {
  role: Role
  children: ReactNode
}) {
  return <RoleContext.Provider value={role}>{children}</RoleContext.Provider>
}
