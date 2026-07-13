'use client'

import { cn } from '@/lib/utils'
import { SectionHeader } from '@/features/studio/section-chrome'
import { useFactoryForm } from '../factory-form-context'
import { ProjectionPanel } from '../projection-panel'
import { FactoryNotReadySection } from './factory-not-ready'

/** Section 7: Simulation studio (key 'projections') — deterministic
 *  supply/sell-pressure curves that follow the live form, plus the
 *  Monte-Carlo scenario builder that runs against the saved design. A
 *  derived view (factory-only, optional, unscored): not a form; only
 *  scenario snapshots persist, in their own table. */
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
        label="Simulation studio"
        desc="· Stress-test and compare scenarios"
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
