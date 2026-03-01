'use client'

import { useSyncExternalStore } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { SidebarNav } from '@/components/sidebar-nav'
import { MobileNav } from '@/components/mobile-nav'
import type { User } from '@supabase/supabase-js'

interface AuthenticatedShellProps {
  user: User
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

export function AuthenticatedShell({ user, children }: AuthenticatedShellProps) {
  const collapsed = useSyncExternalStore(
    subscribeToSidebar,
    getSidebarSnapshot,
    getServerSidebarSnapshot
  )

  const toggleSidebar = () => {
    const next = !collapsed
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next))
    // Dispatch storage event to trigger useSyncExternalStore re-render
    // (native storage events only fire on other tabs)
    window.dispatchEvent(new StorageEvent('storage', { key: SIDEBAR_STORAGE_KEY }))
  }

  return (
    <div className="flex min-h-screen bg-background">
      <aside
        className={`fixed left-0 top-0 z-30 hidden h-screen border-r border-border bg-card transition-[width] duration-300 lg:block ${collapsed ? 'w-20' : 'w-64'}`}
      >
        <SidebarNav user={user} collapsed={collapsed} onToggle={toggleSidebar} />
      </aside>

      <div className="fixed left-0 right-0 top-0 z-30 flex h-14 items-center border-b border-border bg-card px-4 lg:hidden">
        <MobileNav user={user} />
        <Link href="/dashboard" className="ml-2 flex items-center">
          <Image
            src="/trustnomiks_logo_final.png"
            alt="TrustNomiks"
            width={0}
            height={0}
            sizes="140px"
            className="h-8 w-auto max-w-[130px] object-contain"
            priority
          />
        </Link>
      </div>

      <main
        className={`mt-14 min-w-0 flex-1 p-4 transition-[margin] duration-300 sm:p-6 lg:mt-0 lg:p-8 ${collapsed ? 'lg:ml-20' : 'lg:ml-64'}`}
      >
        {children}
      </main>
    </div>
  )
}
