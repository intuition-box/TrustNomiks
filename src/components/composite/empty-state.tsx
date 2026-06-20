'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  title: string
  description?: React.ReactNode
  /** primary + secondary actions */
  actions?: React.ReactNode
  /** small caption tying this empty surface to an onboarding step */
  onboardingHint?: React.ReactNode
  className?: string
}

/**
 * Graph-seeded empty state: a faint breathing hub-and-spokes sketch + copy + action.
 * Every empty surface is owned and on-brand — never a dead skeleton. Each can advance
 * one onboarding checklist item via `onboardingHint`.
 */
export function EmptyState({ title, description, actions, onboardingHint, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed bg-surface-1 px-6 py-12 text-center',
        className,
      )}
    >
      <HubSketch />
      <div className="space-y-1.5">
        <h3 className="text-base font-semibold">{title}</h3>
        {description && <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center justify-center gap-2">{actions}</div>}
      {onboardingHint && (
        <p className="text-xs text-faint-foreground">↳ {onboardingHint}</p>
      )}
    </div>
  )
}

function HubSketch() {
  const nodes = [
    { x: 30, y: 14, c: '--data-token' },
    { x: 66, y: 22, c: '--data-allocation' },
    { x: 14, y: 40, c: '--data-source' },
    { x: 72, y: 50, c: '--data-vesting' },
    { x: 40, y: 60, c: '--data-chain' },
  ]
  return (
    <svg width={88} height={74} viewBox="0 0 88 74" aria-hidden className="opacity-70 animate-[graph-breathe_6s_ease-in-out_infinite]">
      {nodes.map((n, i) => (
        <line key={`l${i}`} x1={44} y1={36} x2={n.x} y2={n.y} stroke="hsl(var(--graph-edge))" strokeWidth={1} />
      ))}
      {nodes.map((n, i) => (
        <circle key={`n${i}`} cx={n.x} cy={n.y} r={3.2} fill={`hsl(var(${n.c}))`} opacity={0.85} />
      ))}
      <circle cx={44} cy={36} r={6} fill="none" stroke="hsl(var(--data-hub))" strokeWidth={2.4} />
      <circle cx={44} cy={36} r={2} fill="hsl(var(--data-hub))" />
    </svg>
  )
}
