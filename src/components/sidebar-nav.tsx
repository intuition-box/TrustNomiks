'use client'

import Link from 'next/link'
import Image from 'next/image'
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
      <div className={cn('flex items-center p-4', collapsed ? 'justify-center' : 'justify-between pl-0 pr-2 py-3')}>
        {!collapsed && (
          <Link href="/dashboard" className="relative flex items-center rounded-xl px-2 py-1 overflow-hidden">
            {/* Smoke blob A — left, slow drift */}
            <div
              className="absolute left-0 top-1/2 -translate-y-1/2 w-16 h-10 rounded-full bg-white/[0.13] blur-xl"
              style={{ animation: 'smoke-a 4.2s ease-in-out infinite' }}
            />
            {/* Smoke blob B — center-right, faster */}
            <div
              className="absolute right-2 top-0 w-12 h-8 rounded-full bg-white/[0.10] blur-2xl"
              style={{ animation: 'smoke-b 3.1s ease-in-out infinite 0.8s' }}
            />
            {/* Smoke blob C — bottom-left, medium */}
            <div
              className="absolute left-6 bottom-0 w-10 h-6 rounded-full bg-white/[0.08] blur-xl"
              style={{ animation: 'smoke-c 5s ease-in-out infinite 1.6s' }}
            />
            {/* Smoke blob D — top-right, small wisp */}
            <div
              className="absolute right-4 top-1/2 -translate-y-1/2 w-8 h-5 rounded-full bg-white/[0.07] blur-lg"
              style={{ animation: 'smoke-a 3.7s ease-in-out infinite 2.3s' }}
            />
            <Image
              src="/trustnomiks_logo_final.png"
              alt="TrustNomiks"
              width={0}
              height={0}
              sizes="160px"
              className="relative h-[55px] w-auto max-w-[205px] object-contain"
              priority
            />
          </Link>
        )}
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
