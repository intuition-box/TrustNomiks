'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { useFactoryFormState } from './use-factory-form-state'
import { useFactorySaveHandlers } from './use-factory-save-handlers'

type FactoryFormContextValue = ReturnType<typeof useFactoryFormState> &
  ReturnType<typeof useFactorySaveHandlers>

const FactoryFormContext = createContext<FactoryFormContextValue | null>(null)

/** Read the shared design-form state + save handlers. Must be used within a FactoryFormProvider. */
export function useFactoryForm(): FactoryFormContextValue {
  const ctx = useContext(FactoryFormContext)
  if (!ctx) {
    throw new Error('useFactoryForm must be used within a FactoryFormProvider')
  }
  return ctx
}

/**
 * Owns every RHF instance, the optimistic-lock timestamp, save handlers and
 * studio orchestration for the Factory builder (factory/new). Twin of
 * TokenFormProvider — see the DRIFT LEDGER in use-factory-form-state.ts.
 */
export function FactoryFormProvider({ children }: { children: ReactNode }) {
  const state = useFactoryFormState()
  const handlers = useFactorySaveHandlers(state)
  const value: FactoryFormContextValue = { ...state, ...handlers }

  return (
    <FactoryFormContext.Provider value={value}>
      {children}
    </FactoryFormContext.Provider>
  )
}
