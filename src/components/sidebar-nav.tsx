'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Coins, Download, Settings, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { UserMenu } from '@/components/user-menu'
import { cn } from '@/lib/utils'
import type { User } from '@supabase/supabase-js'

interface SidebarNavProps {
  user: User
  collapsed: boolean
  onToggle: () => void
}

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: Home },
  { href: '/tokens', label: 'Tokens', icon: Coins },
  { href: '/export', label: 'Export', icon: Download },
  { href: '/settings', label: 'Settings', icon: Settings },
]

export function SidebarNav({ user, collapsed, onToggle }: SidebarNavProps) {
  const pathname = usePathname()

  return (
    <div className="flex h-full flex-col">
      <div className={cn('flex items-center p-4', collapsed ? 'justify-center' : 'justify-between p-6')}>
        {!collapsed && <h1 className="text-2xl font-bold text-primary">TrustNomiks</h1>}
        <Button variant="ghost" size="icon" onClick={onToggle} aria-label="Toggle sidebar width">
          {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
        </Button>
      </div>

      <Separator />

      <nav className={cn('flex-1 space-y-1', collapsed ? 'p-2' : 'p-4')}>
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')

          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                'flex rounded-lg px-3 py-2 text-sm transition-colors',
                collapsed ? 'justify-center' : 'items-center gap-3',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {!collapsed && item.label}
            </Link>
          )
        })}
      </nav>

      <Separator />

      <div className={cn(collapsed ? 'p-2' : 'p-4')}>
        <UserMenu user={user} collapsed={collapsed} />
      </div>
    </div>
  )
}
