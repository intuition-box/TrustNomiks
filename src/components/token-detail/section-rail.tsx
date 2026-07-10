'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import type { NodeType } from '@/lib/knowledge-graph/graph-types'
import { DATA_CSS_VAR } from '@/lib/design/tokens'
import { NodeGlyph } from '@/components/patterns/node-glyph'

export interface SectionRailItem {
  id: string
  label: string
  accent: NodeType
}

interface SectionRailProps {
  items: SectionRailItem[]
  /** Called with the section id; the parent owns scrolling (it may need to
   *  expand a collapsed group first). */
  onNavigate: (id: string) => void
  /** Bump when the set of MOUNTED sections changes (e.g. enrich toggled) so
   *  the intersection observer re-binds. */
  watchKey?: string | number | boolean
  className?: string
}

/**
 * The dossier's sticky anchor rail: one chip per data section, glyph + label
 * in the section's taxonomy color when active. Turns the 5000px scroll into
 * a navigable document.
 */
export function SectionRail({
  items,
  onNavigate,
  watchKey,
  className,
}: SectionRailProps) {
  const [activeId, setActiveId] = useState<string | null>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting)
        if (visible.length > 0) {
          const top = visible.sort(
            (a, b) => a.boundingClientRect.top - b.boundingClientRect.top,
          )[0]
          setActiveId(top.target.id)
        }
      },
      { rootMargin: '-96px 0px -55% 0px', threshold: 0 },
    )
    items.forEach((it) => {
      const el = document.getElementById(it.id)
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [items, watchKey])

  return (
    <nav
      aria-label="Token sections"
      className={cn(
        'sticky top-14 z-20 -mx-1 overflow-x-auto rounded-b-lg border-b bg-background/85 px-1 py-2 backdrop-blur',
        className,
      )}
    >
      <ul className="flex items-center gap-1.5">
        {items.map((it) => {
          const active = it.id === activeId
          const cssVar = DATA_CSS_VAR[it.accent]
          return (
            <li key={it.id} className="shrink-0">
              <button
                type="button"
                onClick={() => onNavigate(it.id)}
                aria-current={active ? 'true' : undefined}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                  !active &&
                    'border-transparent text-muted-foreground hover:bg-surface-2 hover:text-foreground',
                )}
                style={
                  active
                    ? {
                        color: `hsl(var(${cssVar}))`,
                        backgroundColor: `color-mix(in oklab, hsl(var(${cssVar})) 12%, transparent)`,
                        borderColor: `color-mix(in oklab, hsl(var(${cssVar})) 30%, transparent)`,
                      }
                    : undefined
                }
              >
                <NodeGlyph type={it.accent} size={10} aria-hidden />
                {it.label}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
