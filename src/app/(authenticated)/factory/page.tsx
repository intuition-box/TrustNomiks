'use client'

import Link from 'next/link'
import { CheckCircle2, Clock, PlusCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/composite/empty-state'
import { ErrorState } from '@/components/composite/error-state'
import { PageHeader } from '@/components/composite/page-header'
import { RoleGate } from '@/components/composite/role-gate'
import { GraphLoader } from '@/components/patterns/graph-loader'
import { useFactoryProjects } from '@/features/factory/use-factory-projects'
import type { FactoryProject } from '@/types/factory'

function formatDate(dateString: string | null): string {
  if (!dateString) return 'Not set'
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  })
}

/** Color is never alone: each lifecycle state pairs its tone with a glyph. */
function StatusPill({ status }: { status: FactoryProject['status'] }) {
  if (status === 'promoted') {
    return (
      <Badge variant="secondary" className="gap-1 text-success">
        <CheckCircle2 className="h-3 w-3" aria-hidden />
        Promoted
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="gap-1 text-muted-foreground">
      <Clock className="h-3 w-3" aria-hidden />
      Draft
    </Badge>
  )
}

export default function FactoryHubPage() {
  return (
    <RoleGate
      className="mx-auto mt-16 max-w-xl"
      title="Link a wallet to design in Factory"
      reason="Factory designs are private to their creator and autosave as you go. Link a wallet you have proven ownership of to start designing."
    >
      <FactoryHubInner />
    </RoleGate>
  )
}

function FactoryHubInner() {
  const { data: projects, isLoading, isError, refetch } = useFactoryProjects()

  return (
    <div className="mx-auto max-w-4xl space-y-8 pb-16">
      <PageHeader
        title="Factory"
        description="Design a token economy from scratch: supply, allocation, vesting and emission, informed by the validated registry."
        actions={
          <Button variant="brand" asChild>
            <Link href="/factory/new">
              <PlusCircle className="mr-1.5 h-4 w-4" aria-hidden />
              New design
            </Link>
          </Button>
        }
      />

      {isLoading ? (
        <GraphLoader className="mx-auto mt-16" label="Loading your designs…" />
      ) : isError ? (
        <ErrorState
          title="Your designs could not be loaded"
          onRetry={() => refetch()}
        />
      ) : !projects || projects.length === 0 ? (
        <EmptyState
          title="No designs yet"
          description="A design is a private tokenomics blueprint: only you can see it. Start one and shape supply, allocation, vesting and emission section by section."
          actions={
            <Button variant="brand" size="sm" asChild>
              <Link href="/factory/new">
                <PlusCircle className="mr-1.5 h-4 w-4" aria-hidden />
                Start your first design
              </Link>
            </Button>
          }
        />
      ) : (
        <ul className="space-y-2">
          {projects.map((p) => (
            <li key={p.id}>
              <Link
                href={`/factory/new?id=${p.id}`}
                className="flex items-center justify-between gap-4 rounded-xl border bg-surface-1 px-4 py-3 transition-colors hover:bg-surface-2"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="truncate font-medium">{p.name}</span>
                  <Badge variant="secondary" className="font-mono">
                    {p.ticker}
                  </Badge>
                </div>
                <div className="flex shrink-0 items-center gap-4">
                  <span className="tabular text-sm text-muted-foreground">
                    {p.completeness}%
                  </span>
                  <StatusPill status={p.status} />
                  <span className="hidden text-xs text-faint-foreground sm:inline">
                    {formatDate(p.updated_at)}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
