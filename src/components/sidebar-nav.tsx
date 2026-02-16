'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Coins, Download, Settings } from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { UserMenu } from '@/components/user-menu'
import { cn } from '@/lib/utils'
import type { User } from '@supabase/supabase-js'

interface SidebarNavProps {
  user: User
}

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: Home },
  { href: '/tokens', label: 'Tokens', icon: Coins },
  { href: '/export', label: 'Export', icon: Download },
  { href: '/settings', label: 'Settings', icon: Settings },
]

export function SidebarNav({ user }: SidebarNavProps) {
  const pathname = usePathname()

  return (
    <div className="flex h-full flex-col">
      {/* Logo/Title */}
      <div className="p-6">
        <h1 className="text-2xl font-bold text-primary">TrustNomiks</h1>
      </div>

      <Separator />

      {/* Navigation links */}
      <nav className="flex-1 space-y-1 p-4">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <Separator />

      {/* User menu */}
      <div className="p-4">
        <UserMenu user={user} />
      </div>
    </div>
  )
}
