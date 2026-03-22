'use client'

import { useState, useEffect, useRef, startTransition } from 'react'
import { Search, X, Loader2, ExternalLink } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useCoinGeckoSearch } from '@/hooks/use-coingecko-search'
import type { CoinGeckoSearchResult } from '@/types/coingecko'

interface CoinGeckoSearchProps {
  value: string | null
  onSelect: (coin: { id: string; name: string; symbol: string; thumb: string } | null) => void
  chain?: string
  contractAddress?: string
  disabled?: boolean
}

export function CoinGeckoSearch({
  value,
  onSelect,
  chain,
  contractAddress,
  disabled,
}: CoinGeckoSearchProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [resolvedOnce, setResolvedOnce] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const { results, isLoading, error } = useCoinGeckoSearch(query)

  // Auto-resolve by contract address when chain + contractAddress are available
  useEffect(() => {
    if (value || resolvedOnce || !chain || !contractAddress || chain === 'other') return

    let cancelled = false
    startTransition(() => setResolving(true))

    fetch(`/api/coingecko/resolve?chain=${encodeURIComponent(chain)}&contract_address=${encodeURIComponent(contractAddress)}`)
      .then(async (res) => {
        if (!res.ok || cancelled) return
        const data = await res.json()
        if (!cancelled && data.id) {
          onSelect({ id: data.id, name: data.name, symbol: data.symbol, thumb: data.thumb })
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) {
          startTransition(() => {
            setResolving(false)
            setResolvedOnce(true)
          })
        }
      })

    return () => { cancelled = true }
  }, [chain, contractAddress, value, resolvedOnce, onSelect])

  // Open dropdown when there are results
  useEffect(() => {
    startTransition(() => {
      if (results.length > 0 && query.length >= 2) {
        setOpen(true)
      } else if (query.length < 2) {
        setOpen(false)
      }
    })
  }, [results, query])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2">
        <div className="flex items-center gap-1.5 text-sm flex-1">
          <span className="font-medium">CoinGecko:</span>
          <a
            href={`https://www.coingecko.com/en/coins/${value}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline inline-flex items-center gap-1"
          >
            {value}
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        {!disabled && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => onSelect(null)}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    )
  }

  if (resolving) {
    return (
      <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Resolving token on CoinGecko...
      </div>
    )
  }

  const showDropdown = open && (results.length > 0 || error || (query.length >= 2 && !isLoading))

  return (
    <div ref={wrapperRef} className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
      <Input
        placeholder="Search CoinGecko (optional)..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => {
          if (results.length > 0 && query.length >= 2) setOpen(true)
        }}
        disabled={disabled}
        className="pl-9 pr-9"
      />
      {isLoading && (
        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground z-10" />
      )}

      {showDropdown && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-md border border-border bg-zinc-900 shadow-2xl overflow-hidden">
          {error ? (
            <div className="p-3 text-sm text-destructive">{error}</div>
          ) : results.length === 0 && query.length >= 2 && !isLoading ? (
            <div className="p-3 text-sm text-muted-foreground">No results found</div>
          ) : (
            <ul className="max-h-64 overflow-y-auto">
              {results.map((coin) => (
                <CoinOption
                  key={coin.id}
                  coin={coin}
                  onSelect={() => {
                    onSelect({
                      id: coin.id,
                      name: coin.name,
                      symbol: coin.symbol,
                      thumb: coin.thumb,
                    })
                    setQuery('')
                    setOpen(false)
                  }}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function CoinOption({
  coin,
  onSelect,
}: {
  coin: CoinGeckoSearchResult
  onSelect: () => void
}) {
  return (
    <li>
      <button
        type="button"
        className={cn(
          'flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm',
          'hover:bg-zinc-800 transition-colors'
        )}
        onClick={onSelect}
      >
        <img
          src={coin.thumb}
          alt=""
          className="h-6 w-6 rounded-full"
          onError={(e) => {
            ;(e.target as HTMLImageElement).style.display = 'none'
          }}
        />
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{coin.name}</div>
          <div className="text-xs text-muted-foreground uppercase">{coin.symbol}</div>
        </div>
        {coin.market_cap_rank && (
          <span className="text-xs text-muted-foreground shrink-0">
            #{coin.market_cap_rank}
          </span>
        )}
      </button>
    </li>
  )
}
