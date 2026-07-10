'use client'

import { Children } from 'react'
import { cn } from '@/lib/utils'

interface StaggerRevealProps {
  children: React.ReactNode
  /** class for each wrapper (it becomes the grid/flex item) */
  itemClassName?: string
}

/**
 * Reveals children in sequence on the ingest stagger (the count-up keyframe:
 * fade + 6px rise). Each child is wrapped, so inside a grid the wrapper is
 * the item. Frozen by the global prefers-reduced-motion kill-switch.
 */
export function StaggerReveal({ children, itemClassName }: StaggerRevealProps) {
  return (
    <>
      {Children.map(children, (child, i) =>
        child == null ? null : (
          <div
            className={cn(itemClassName)}
            style={{
              animation: 'count-up var(--dur-slower) var(--ease-out) both',
              animationDelay: `calc(${i} * var(--stagger-ingest))`,
            }}
          >
            {child}
          </div>
        ),
      )}
    </>
  )
}
