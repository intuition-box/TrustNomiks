'use client'

import { useRouter } from 'next/navigation'
import { ArrowRight, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NodeGlyph } from '@/components/patterns/node-glyph'

export const COMPARE_MAX = 4

export interface CompareTrayToken {
  id: string
  name: string
  ticker: string
}

interface CompareTrayProps {
  tokens: CompareTrayToken[]
  onRemove: (id: string) => void
  onClear: () => void
}

/**
 * The bottom dock collecting 2-4 tokens for side-by-side comparison
 * (docs/redesign/08 §5). Glass surface: it is an interactive control.
 */
export function CompareTray({ tokens, onRemove, onClear }: CompareTrayProps) {
  const router = useRouter()

  if (tokens.length === 0) return null

  return (
    <div
      role="region"
      aria-label="Compare tray"
      aria-live="polite"
      className="glass fixed bottom-4 left-1/2 z-40 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-wrap items-center gap-2 rounded-xl border px-3 py-2 shadow-lg"
    >
      {tokens.map((token) => (
        <span
          key={token.id}
          className="inline-flex items-center gap-1.5 rounded-md border bg-surface-2 py-1 pl-2 pr-1 text-sm"
        >
          <NodeGlyph type="token" size={10} aria-hidden />
          <span className="font-mono text-xs">{token.ticker}</span>
          <button
            type="button"
            onClick={() => onRemove(token.id)}
            aria-label={`Remove ${token.name} from comparison`}
            className="rounded-sm p-0.5 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </span>
      ))}
      <div className="ml-1 flex items-center gap-2">
        <button
          type="button"
          onClick={onClear}
          className="text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Clear
        </button>
        <Button
          size="sm"
          variant="brand"
          disabled={tokens.length < 2}
          title={tokens.length < 2 ? 'Pick at least 2 tokens to compare' : undefined}
          onClick={() => router.push(`/token-house?compare=${tokens.map((t) => t.id).join(',')}`)}
        >
          Compare {tokens.length >= 2 ? tokens.length : ''}
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </div>
  )
}
