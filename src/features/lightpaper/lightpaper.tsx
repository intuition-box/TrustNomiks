import { Logo } from '@/components/brand/logo'
import type { FactorySharedDesign } from '@/types/factory'

/**
 * The public, read-only lightpaper of a shared Factory design: the design's
 * substance rendered in the app's design language, no controls, no session.
 * Server component; interactive islands (charts) mount inside sections.
 */
export function Lightpaper({ design }: { design: FactorySharedDesign }) {
  const { project } = design
  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-4xl items-center justify-between px-6 py-6">
        <Logo />
        <span className="text-xs text-muted-foreground">
          Shared tokenomics design
        </span>
      </header>

      <main className="mx-auto w-full max-w-4xl space-y-12 px-6 pb-20">
        <section className="space-y-3 pt-6">
          <div className="flex flex-wrap items-baseline gap-3">
            <h1 className="text-4xl font-semibold tracking-tight">
              {project.name}
            </h1>
            <span className="tabular text-xl text-muted-foreground">
              {project.ticker}
            </span>
          </div>
          {(project.category || project.sector) && (
            <p className="text-sm text-muted-foreground">
              {[project.category, project.sector].filter(Boolean).join(' · ')}
            </p>
          )}
          {project.notes && (
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {project.notes}
            </p>
          )}
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-3 px-6 py-6 text-xs text-muted-foreground">
          <Logo />
          <span>
            Designed with TrustNomiks Factory. Projections are hypothetical
            stress outcomes, not predictions.
          </span>
        </div>
      </footer>
    </div>
  )
}
