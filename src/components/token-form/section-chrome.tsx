'use client'

import type { StudioSectionKey } from '@/features/studio/studio-spine'
import { NotReadySection as SharedNotReadySection } from '@/features/studio/section-chrome'
import { useTokenForm } from './token-form-context'

// SectionHeader moved to the shared studio chrome; re-exported so the steps'
// imports stay untouched.
export { SectionHeader } from '@/features/studio/section-chrome'

/** Screener binding of the shared gate: navigation comes from the token form
 *  context, so the steps keep their two-prop call sites unchanged. */
export function NotReadySection({
  message,
  action,
}: {
  message: string
  action?: { label: string; section: StudioSectionKey }
}) {
  const { goSection } = useTokenForm()
  return (
    <SharedNotReadySection message={message} action={action} onGo={goSection} />
  )
}
