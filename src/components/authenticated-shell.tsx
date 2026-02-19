'use client'

import { useState } from 'react'
import { SidebarNav } from '@/components/sidebar-nav'
import { MobileNav } from '@/components/mobile-nav'
import type { User } from '@supabase/supabase-js'

interface AuthenticatedShellProps {
  user: User
  children: React.ReactNode
}

const SIDEBAR_STORAGE_KEY = 'trustnomiks:sidebar-collapsed'

export function AuthenticatedShell({ user, children }: AuthenticatedShellProps) {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') {
      return false
    }
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true'
  })

  const toggleSidebar = () => {
    setCollapsed((previous) => {
      const nextValue = !previous
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(nextValue))
      return nextValue
    })
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
        <h1 className="ml-3 text-lg font-bold text-primary">TrustNomiks</h1>
      </div>

      <main
        className={`mt-14 min-w-0 flex-1 p-4 transition-[margin] duration-300 sm:p-6 lg:mt-0 lg:p-8 ${collapsed ? 'lg:ml-20' : 'lg:ml-64'}`}
      >
        {children}
      </main>
    </div>
  )
}
