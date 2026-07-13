'use client'

import { cn } from '@/lib/utils'
import { SectionHeader } from '@/features/studio/section-chrome'
import { useFactoryForm } from '../factory-form-context'
import { ProjectionPanel } from '../projection-panel'
import { FactoryNotReadySection } from './factory-not-ready'

/** Section 7: Projections — deterministic supply/sell-pressure curves and
 *  the Monte-Carlo stress test. A derived view of the design (factory-only,
 *  optional, unscored): nothing here is a form and nothing is persisted. */
export function ProjectionsStep() {
  const { projectId, activeSection, allocations } = useFactoryForm()

  return (
    <div
      id="section-projections"
      className={cn(
        'overflow-hidden rounded-xl border bg-surface-1',
        activeSection !== 'projections' && 'hidden',
      )}
      style={{ borderLeft: '3px solid hsl(var(--data-risk))' }}
    >
      <SectionHeader
        accentVar="--data-risk"
        label="Projections"
        desc="· Stress-test the design"
        liveScore={allocations.length > 0 ? 1 : 0}
        maxScore={0}
        saved={false}
      />
      {!projectId ? (
        <FactoryNotReadySection
          message="Give the design a name and ticker first. The draft creates itself as you type."
          action={{ label: 'Go to Identity', section: 'identity' }}
        />
      ) : (
        <div className="px-6 py-6">
          <ProjectionPanel />
        </div>
      )}
    </div>
  )
}
