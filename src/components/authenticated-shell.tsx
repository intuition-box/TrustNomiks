'use client'

import { useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { Wallet } from 'lucide-react'
import { SidebarNav } from '@/components/sidebar-nav'
import { TopBar } from '@/components/top-bar'
import { CmdkPalette } from '@/components/patterns/cmdk-palette'
import { Button } from '@/components/ui/button'
import { RoleProvider, type Role } from '@/components/role-context'
import { cn } from '@/lib/utils'
import type { User } from '@supabase/supabase-js'

interface AuthenticatedShellProps {
  user: User
  role: Role
  children: React.ReactNode
}

const SIDEBAR_STORAGE_KEY = 'trustnomiks:sidebar-collapsed'

// useSyncExternalStore handles SSR→client transition without setState-in-effect:
// - SSR / hydration: getServerSnapshot → false (sidebar expanded)
// - After hydration: getSnapshot → reads localStorage
function subscribeToSidebar(callback: () => void) {
  window.addEventListener('storage', callback)
  return () => window.removeEventListener('storage', callback)
}

function getSidebarSnapshot() {
  return localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true'
}

function getServerSidebarSnapshot() {
  return false
}

export function AuthenticatedShell({
  user,
  role,
  children,
}: AuthenticatedShellProps) {
  const [paletteOpen, setPaletteOpen] = useState(false)
  const collapsed = useSyncExternalStore(
    subscribeToSidebar,
    getSidebarSnapshot,
    getServerSidebarSnapshot,
  )

  const toggleSidebar = () => {
    const next = !collapsed
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next))
    // Dispatch storage event to trigger useSyncExternalStore re-render
    // (native storage events only fire on other tabs)
    window.dispatchEvent(
      new StorageEvent('storage', { key: SIDEBAR_STORAGE_KEY }),
    )
  }

  return (
    <RoleProvider role={role}>
      <div className="min-h-screen bg-background">
        <aside
          className={cn(
            'fixed left-0 top-0 z-40 hidden h-screen border-r border-border bg-surface-1 transition-[width] duration-300 lg:block',
            collapsed ? 'w-20' : 'w-64',
          )}
        >
          <SidebarNav collapsed={collapsed} onToggle={toggleSidebar} />
        </aside>

        <div
          className={cn(
            'flex min-h-screen min-w-0 flex-col transition-[margin] duration-300',
            collapsed ? 'lg:ml-20' : 'lg:ml-64',
          )}
        >
          <TopBar user={user} onSearchOpen={() => setPaletteOpen(true)} />

          {role === 'viewer' && (
            <div
              role="status"
              className="flex flex-wrap items-center gap-3 border-b border-border bg-surface-2 px-4 py-2.5 sm:px-6 lg:px-8"
            >
              <Wallet
                className="h-4 w-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
              <p className="flex-1 text-sm text-muted-foreground">
                You are exploring in read-only mode. Link a wallet to
                contribute.
              </p>
              <Button variant="brand" size="sm" asChild>
                <Link href="/profile?linkWallet=1">Become a contributor</Link>
              </Button>
            </div>
          )}

          <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
        </div>

        <CmdkPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      </div>
    </RoleProvider>
  )
}
