'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { NodeGlyph } from '@/components/patterns/node-glyph'
import { StatusPill } from '@/components/composite/data-badge'
import { NAV_ZONES } from '@/lib/navigation'
import { createClient } from '@/lib/supabase/client'
import type { TokenStatus } from '@/types/token'

interface PaletteToken {
  id: string
  name: string
  ticker: string
  status: TokenStatus
}

interface CmdkPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * The ⌘K palette (docs/redesign/04): tokens, screens and actions in one ranked
 * box. Results carry the taxonomy glyph so the palette speaks the same visual
 * language as the graph.
 */
export function CmdkPalette({ open, onOpenChange }: CmdkPaletteProps) {
  const router = useRouter()
  const [tokens, setTokens] = useState<PaletteToken[] | null>(null)

  // Global shortcut: ⌘K / Ctrl+K toggles, from anywhere in the app.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        onOpenChange(!open)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onOpenChange])

  // Load the token index once per palette session (18 today, capped for safety).
  useEffect(() => {
    if (!open || tokens !== null) return
    const supabase = createClient()
    supabase
      .from('tokens')
      .select('id, name, ticker, status')
      .order('updated_at', { ascending: false })
      .limit(200)
      .then(({ data, error }) => {
        if (error) {
          console.error('Palette token fetch failed:', error)
          setTokens([])
          return
        }
        setTokens((data ?? []) as PaletteToken[])
      })
  }, [open, tokens])

  const go = (href: string) => {
    onOpenChange(false)
    router.push(href)
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search tokens, screens, actions…" />
      <CommandList>
        <CommandEmpty>No results. Try a token name or ticker.</CommandEmpty>
        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => go('/tokens/new')}>
            <NodeGlyph type="token" size={12} aria-hidden />
            <span>Add a token</span>
          </CommandItem>
          <CommandItem onSelect={() => go('/export')}>
            <NodeGlyph type="export_run" size={12} aria-hidden />
            <span>Publish or export tokens</span>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Go to">
          {NAV_ZONES.flatMap((zone) => zone.items).map((item) => (
            <CommandItem key={item.href} onSelect={() => go(item.href)}>
              <item.icon
                className="h-4 w-4 text-muted-foreground"
                aria-hidden
              />
              <span>{item.label}</span>
            </CommandItem>
          ))}
          <CommandItem onSelect={() => go('/profile')}>
            <NodeGlyph type="wallet" size={12} aria-hidden />
            <span>Profile</span>
          </CommandItem>
        </CommandGroup>
        {tokens && tokens.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Tokens">
              {tokens.map((token) => (
                <CommandItem
                  key={token.id}
                  value={`${token.name} ${token.ticker}`}
                  onSelect={() => go(`/tokens/${token.id}`)}
                >
                  <NodeGlyph type="token" size={12} aria-hidden />
                  <span className="min-w-0 truncate">{token.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {token.ticker}
                  </span>
                  <StatusPill status={token.status} className="ml-auto" />
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  )
}
