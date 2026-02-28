'use client'

import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import type { User } from '@supabase/supabase-js'

interface UserMenuProps {
  user: User
  collapsed?: boolean
}

export function UserMenu({ user, collapsed = false }: UserMenuProps) {
  const router = useRouter()
  const supabase = createClient()

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut()
      router.push('/login')
      router.refresh()
    } catch (error) {
      console.error('Logout error:', error)
      toast.error('Failed to log out')
    }
  }

  const initials = user.email ? user.email.substring(0, 2).toUpperCase() : 'U'

  return (
    <DropdownMenu>
      {/* asChild + suppressHydrationWarning: prevents Radix useId() mismatch between SSR and client */}
      <DropdownMenuTrigger asChild>
        <button
          suppressHydrationWarning
          type="button"
          className={cn(
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-lg',
            collapsed ? 'w-auto' : 'w-full'
          )}
        >
        <div
          className={cn(
            'rounded-lg p-2 hover:bg-accent transition-colors',
            collapsed ? 'flex items-center justify-center' : 'flex items-center gap-3'
          )}
        >
          <Avatar className="h-8 w-8">
            <AvatarFallback className="text-sm">{initials}</AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="flex min-w-0 flex-1 flex-col items-start text-sm">
              <span className="w-full truncate font-medium" title={user.email || ''}>
                {user.email}
              </span>
            </div>
          )}
        </div>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={collapsed ? 'start' : 'end'} className="w-56">
        <DropdownMenuLabel>My Account</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout} className="cursor-pointer">
          <LogOut className="mr-2 h-4 w-4" />
          Log Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
