'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Logo } from '@/components/brand/logo'
import { usePathname } from 'next/navigation'
import { Lock, Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { Separator } from '@/components/ui/separator'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { NAV_ZONES, isNavItemActive } from '@/lib/navigation'
import { useRole } from '@/hooks/use-role'
import { cn } from '@/lib/utils'

/**
 * Mobile navigation sheet: the same two zones as the desktop rail.
 * Account actions (profile, theme, sign out) live in the top-bar user menu.
 */
export function MobileNav() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const { isViewer } = useRole()

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="-ml-2">
          <Menu className="h-5 w-5" />
          <span className="sr-only">Toggle navigation menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0">
        <TooltipProvider delayDuration={200}>
          <div className="flex h-full flex-col">
            <div className="px-4 py-5">
              <Link
                href="/dashboard"
                onClick={() => setOpen(false)}
                aria-label="TrustNomiks home"
              >
                <Logo size={26} />
              </Link>
            </div>

            <Separator />

            <nav className="flex-1 space-y-5 p-4" aria-label="Main">
              {NAV_ZONES.map((zone) => (
                <div key={zone.label}>
                  <p className="mb-1.5 px-3 text-[11px] font-medium uppercase tracking-[0.14em] text-faint-foreground">
                    {zone.label}
                  </p>
                  <div className="space-y-0.5">
                    {zone.items.map((item) => {
                      const Icon = item.icon
                      const isActive = isNavItemActive(pathname, item.href)
                      const isLocked = zone.requiresContributor && isViewer

                      if (isLocked) {
                        return (
                          <Tooltip key={item.href}>
                            <TooltipTrigger asChild>
                              <span
                                role="link"
                                aria-disabled="true"
                                tabIndex={0}
                                className="relative flex cursor-not-allowed items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground opacity-60"
                              >
                                <Icon className="h-5 w-5" aria-hidden />
                                <span className="flex-1">{item.label}</span>
                                <Lock
                                  className="h-3.5 w-3.5 shrink-0"
                                  aria-hidden
                                />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="bottom">
                              Link a wallet to contribute
                            </TooltipContent>
                          </Tooltip>
                        )
                      }

                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setOpen(false)}
                          aria-current={isActive ? 'page' : undefined}
                          className={cn(
                            'relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                            isActive
                              ? 'bg-surface-2 font-medium text-foreground'
                              : 'text-muted-foreground hover:bg-surface-2/60 hover:text-foreground',
                          )}
                        >
                          {isActive && (
                            <span
                              aria-hidden
                              className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary"
                            />
                          )}
                          <Icon
                            className={cn(
                              'h-5 w-5',
                              isActive && 'text-primary',
                            )}
                            aria-hidden
                          />
                          {item.label}
                        </Link>
                      )
                    })}
                  </div>
                </div>
              ))}
            </nav>
          </div>
        </TooltipProvider>
      </SheetContent>
    </Sheet>
  )
}
