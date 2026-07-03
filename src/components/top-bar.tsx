'use client'

import Link from 'next/link'
import Image from 'next/image'
import { Search } from 'lucide-react'
import { MobileNav } from '@/components/mobile-nav'
import { UserMenu } from '@/components/user-menu'
import { WalletConnectButton } from '@/components/wallet-connect-button'
import type { User } from '@supabase/supabase-js'

interface TopBarProps {
  user: User
  onSearchOpen: () => void
}

/**
 * The shell's top bar: one home for search (⌘K) and one home for the wallet.
 * Screens below never render their own wallet button (docs/redesign/08 §2).
 */
export function TopBar({ user, onSearchOpen }: TopBarProps) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur sm:px-6">
      <div className="flex items-center lg:hidden">
        <MobileNav />
        <Link href="/dashboard" className="ml-1 flex items-center">
          <Image
            src="/trustnomiks_logo_final.png"
            alt="TrustNomiks"
            width={0}
            height={0}
            sizes="120px"
            className="h-7 w-auto max-w-[110px] object-contain"
            priority
          />
        </Link>
      </div>

      <button
        type="button"
        onClick={onSearchOpen}
        aria-label="Search tokens, screens and actions"
        className="hidden h-9 w-full max-w-xs items-center gap-2 rounded-md border bg-surface-1 px-3 text-sm text-muted-foreground transition-colors hover:bg-surface-2 sm:flex"
      >
        <Search className="h-4 w-4 shrink-0" aria-hidden />
        <span className="flex-1 text-left">Search the graph</span>
        <kbd className="pointer-events-none hidden rounded border bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-faint-foreground lg:inline-block">
          ⌘K
        </kbd>
      </button>
      <button
        type="button"
        onClick={onSearchOpen}
        aria-label="Search tokens, screens and actions"
        className="flex h-9 w-9 items-center justify-center rounded-md border bg-surface-1 text-muted-foreground transition-colors hover:bg-surface-2 sm:hidden"
      >
        <Search className="h-4 w-4" aria-hidden />
      </button>

      <div className="ml-auto flex items-center gap-2">
        <WalletConnectButton />
        <UserMenu user={user} />
      </div>
    </header>
  )
}
