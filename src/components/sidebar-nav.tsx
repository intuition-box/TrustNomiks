'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { Lock, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { NAV_ZONES, isNavItemActive } from '@/lib/navigation'
import { useRole } from '@/hooks/use-role'
import { cn } from '@/lib/utils'

interface SidebarNavProps {
  collapsed: boolean
  onToggle: () => void
}

/**
 * The two-zone rail (docs/redesign/04): EXPLORE reads the graph, CONTRIBUTE
 * grows it. The rail stays slate-quiet so the taxonomy can glow in the work
 * area; the active item is a hairline accent, not a filled pill.
 */
export function SidebarNav({ collapsed, onToggle }: SidebarNavProps) {
  const pathname = usePathname()
  const { isViewer } = useRole()

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-full flex-col">
        <div
          className={cn(
            'flex items-center p-3',
            collapsed ? 'justify-center' : 'justify-between',
          )}
        >
          {!collapsed && (
            <Link href="/dashboard" className="flex items-center px-2">
              <Image
                src="/trustnomiks_logo_final.png"
                alt="TrustNomiks"
                width={0}
                height={0}
                sizes="160px"
                className="h-10 w-auto max-w-[160px] object-contain"
                priority
              />
            </Link>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggle}
            aria-label="Toggle sidebar width"
          >
            {collapsed ? (
              <PanelLeftOpen className="h-5 w-5" />
            ) : (
              <PanelLeftClose className="h-5 w-5" />
            )}
          </Button>
        </div>

        <Separator />

        <nav
          className={cn('flex-1 space-y-5 py-4', collapsed ? 'px-2' : 'px-3')}
          aria-label="Main"
        >
          {NAV_ZONES.map((zone, zoneIndex) => (
            <div key={zone.label}>
              {collapsed ? (
                zoneIndex > 0 && <Separator className="mx-auto mb-3 w-6" />
              ) : (
                <p className="mb-1.5 px-3 text-[11px] font-medium uppercase tracking-[0.14em] text-faint-foreground">
                  {zone.label}
                </p>
              )}
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
                            className={cn(
                              'relative flex cursor-not-allowed rounded-md px-3 py-2 text-sm text-muted-foreground opacity-60',
                              collapsed
                                ? 'justify-center'
                                : 'items-center gap-3',
                            )}
                          >
                            <Icon className="h-5 w-5 shrink-0" aria-hidden />
                            {!collapsed && (
                              <span className="flex-1">{item.label}</span>
                            )}
                            <Lock
                              className={cn(
                                'shrink-0',
                                collapsed ? 'h-3 w-3' : 'h-3.5 w-3.5',
                              )}
                              aria-hidden
                            />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="right">
                          Link a wallet to contribute
                        </TooltipContent>
                      </Tooltip>
                    )
                  }

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      aria-current={isActive ? 'page' : undefined}
                      className={cn(
                        'relative flex rounded-md px-3 py-2 text-sm transition-colors',
                        collapsed ? 'justify-center' : 'items-center gap-3',
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
                          'h-5 w-5 shrink-0',
                          isActive && 'text-primary',
                        )}
                        aria-hidden
                      />
                      {!collapsed && item.label}
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>
      </div>
    </TooltipProvider>
  )
}
