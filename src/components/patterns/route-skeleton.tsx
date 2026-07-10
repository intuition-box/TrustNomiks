import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { GraphLoader } from '@/components/patterns/graph-loader'

type RouteSkeletonVariant =
  | 'dashboard'
  | 'screener'
  | 'detail'
  | 'studio'
  | 'workspace'
  | 'profile'
  | 'export'

interface RouteSkeletonProps {
  /** Which page geometry to mirror while the route segment loads. */
  variant: RouteSkeletonVariant
}

/**
 * Route-level loading state: mirrors the real geometry of each page so the
 * resolve causes no layout shift, and keeps the Observatory language on
 * navigation (surface-tinted blocks + the signature GraphLoader where the
 * page's main visual sits). Pulse freezes under prefers-reduced-motion via
 * the global animation kill-switch.
 */
export function RouteSkeleton({ variant }: RouteSkeletonProps) {
  return (
    <div role="status" aria-label="Loading page" className="space-y-6">
      {BODY[variant]}
    </div>
  )
}

/* ── Shared fragments ─────────────────────────────────────────────────────── */

function PageHeader({ wide = false }: { wide?: boolean }) {
  return (
    <div className="space-y-2">
      <Skeleton className={wide ? 'h-8 w-72' : 'h-8 w-48'} />
      <Skeleton className="h-4 w-96 max-w-full" />
    </div>
  )
}

function StatBand({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border bg-surface-1 p-4">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="mt-3 h-7 w-16" />
          <Skeleton className="mt-2 h-3 w-20" />
        </div>
      ))}
    </div>
  )
}

function GraphWell({ height = 320 }: { height?: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-xl border bg-surface-1"
      style={{ height }}
    >
      <GraphLoader size={88} />
    </div>
  )
}

function ListRows({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <Card key={i}>
          <CardContent className="flex items-center gap-4 py-4">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-48 max-w-full" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-6 w-20" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function SectionCards({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i}>
          <CardHeader className="flex flex-row items-center gap-2">
            <Skeleton className="h-4 w-4 rounded-full" />
            <Skeleton className="h-5 w-36" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

/* ── Per-page geometry ────────────────────────────────────────────────────── */

const BODY: Record<RouteSkeletonVariant, React.ReactNode> = {
  dashboard: (
    <>
      <PageHeader wide />
      <StatBand />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <GraphWell height={400} />
        </div>
        <div className="min-w-0 space-y-4">
          <div className="rounded-xl border bg-surface-1 p-4 space-y-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
          <div className="rounded-xl border bg-surface-1 p-4 space-y-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
      </div>
    </>
  ),

  screener: (
    <>
      <div className="flex items-center justify-between gap-4">
        <PageHeader />
        <Skeleton className="h-10 w-32 shrink-0" />
      </div>
      <StatBand />
      <ListRows rows={6} />
    </>
  ),

  detail: (
    <>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-12 w-12 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <Skeleton className="h-9 w-28 shrink-0" />
      </div>
      <SectionCards count={4} />
      <GraphWell height={280} />
    </>
  ),

  studio: (
    <>
      <PageHeader />
      <div className="flex items-start gap-6">
        <div className="hidden w-60 shrink-0 space-y-2 lg:block">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2 px-2 py-1.5">
              <Skeleton className="h-3.5 w-3.5 rounded-full" />
              <Skeleton className="h-3.5 w-28" />
            </div>
          ))}
        </div>
        <Card className="min-w-0 flex-1">
          <CardHeader>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-72 max-w-full" />
          </CardHeader>
          <CardContent className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </CardContent>
        </Card>
        <div className="hidden w-72 shrink-0 xl:block">
          <GraphWell height={300} />
        </div>
      </div>
    </>
  ),

  workspace: (
    <>
      <PageHeader wide />
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-9 w-28" />
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <GraphWell height={420} />
        </div>
        <div className="min-w-0 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-xl border bg-surface-1 p-3">
              <div className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-28" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  ),

  profile: (
    <>
      <div className="flex items-center gap-4">
        <Skeleton className="h-16 w-16 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-40" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
        <GraphWell height={260} />
      </div>
    </>
  ),

  export: (
    <>
      <PageHeader wide />
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-3">
              <Skeleton className="h-5 w-5 rounded" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-6 w-6 rounded-full" />
            </div>
          ))}
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    </>
  ),
}
