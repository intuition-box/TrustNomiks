'use client'

import { NotReadySection } from '@/features/studio/section-chrome'
import type { FactorySectionKey } from '../sections'
import { useFactoryForm } from '../factory-form-context'

/** Factory binding of the shared "not ready yet" gate: navigation comes from
 *  the design form context (twin of the screener's NotReadySection wrapper). */
export function FactoryNotReadySection({
  message,
  action,
}: {
  message: string
  action?: { label: string; section: FactorySectionKey }
}) {
  const { goSection } = useFactoryForm()
  return <NotReadySection message={message} action={action} onGo={goSection} />
}
