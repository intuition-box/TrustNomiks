'use client'

import { RoleGate } from '@/components/composite/role-gate'
import { FactoryFormProvider } from '@/features/factory/factory-form-context'
import { FactoryDesigner } from '@/features/factory/factory-designer'

export default function NewDesignPage() {
  return (
    <RoleGate
      className="mx-auto mt-16 max-w-xl"
      title="Link a wallet to design in Factory"
      reason="A design creates its draft right away and autosaves as you go. Link a wallet you have proven ownership of to start."
    >
      <FactoryFormProvider>
        <FactoryDesigner />
      </FactoryFormProvider>
    </RoleGate>
  )
}
