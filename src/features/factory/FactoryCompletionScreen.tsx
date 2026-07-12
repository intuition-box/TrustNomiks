'use client'

import { ArrowRight, Plus, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useFactoryForm } from './factory-form-context'
import { ProjectionPanel } from './projection-panel'

/** Post-save "Design saved" screen, shown once the final section (Emission)
 *  is saved via Finish. A design is private, so there is no publish moment. */
export function FactoryCompletionScreen() {
  const { router, projectId, finalScore, step1Form } = useFactoryForm()

  return (
    <div className="mx-auto max-w-3xl space-y-8 pb-16 pt-8">
      <div className="overflow-hidden rounded-xl border bg-surface-1">
        <div className="space-y-4 px-8 py-10 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
            <CheckCircle2 className="h-8 w-8 text-success" aria-hidden />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {step1Form.getValues('name') || 'Design'} is structured
          </h1>
          <p className="text-sm text-muted-foreground">
            Your tokenomics design is saved, private to you, and ready to keep
            iterating on.
          </p>
        </div>

        <div className="space-y-4 px-8 pb-8">
          <div className="grid gap-3">
            <div className="flex items-center justify-between rounded-lg bg-surface-2 px-4 py-3">
              <span className="text-sm font-medium">Design</span>
              <span className="font-semibold">
                {step1Form.getValues('name')}{' '}
                <span className="font-mono text-primary">
                  {step1Form.getValues('ticker')}
                </span>
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-surface-2 px-4 py-3">
              <span className="text-sm font-medium">Completeness</span>
              <span className="tabular text-base font-semibold">
                {finalScore !== null ? `${finalScore} / 100` : 'Calculating…'}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-3 pt-2 sm:flex-row">
            {projectId && (
              <Button
                variant="brand"
                className="flex-1"
                size="lg"
                onClick={() => router.push(`/factory/new?id=${projectId}`)}
              >
                Keep editing
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Button>
            )}
            <Button
              variant="outline"
              className="flex-1"
              size="lg"
              onClick={() => router.push('/factory')}
            >
              Back to Factory
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              size="lg"
              onClick={() => router.push('/factory/new')}
            >
              <Plus className="h-4 w-4" aria-hidden />
              New design
            </Button>
          </div>
        </div>
      </div>

      <ProjectionPanel />
    </div>
  )
}
