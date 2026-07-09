'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { useTokenFormState } from './use-token-form-state'
import { useTokenSaveHandlers } from './use-token-save-handlers'

type TokenFormContextValue = ReturnType<typeof useTokenFormState> & ReturnType<typeof useTokenSaveHandlers>

const TokenFormContext = createContext<TokenFormContextValue | null>(null)

/** Read the shared token-form state + save handlers. Must be used within a TokenFormProvider. */
export function useTokenForm(): TokenFormContextValue {
  const ctx = useContext(TokenFormContext)
  if (!ctx) {
    throw new Error('useTokenForm must be used within a TokenFormProvider')
  }
  return ctx
}

/**
 * Owns every RHF instance, the optimistic-lock timestamp, save handlers and
 * studio orchestration for the token structuring form (tokens/new). See
 * docs/refactor-plan-token-routes-20260620.md — Part A step 2 (the keystone).
 */
export function TokenFormProvider({ children }: { children: ReactNode }) {
  const state = useTokenFormState()
  const handlers = useTokenSaveHandlers(state)
  const value: TokenFormContextValue = { ...state, ...handlers }

  return <TokenFormContext.Provider value={value}>{children}</TokenFormContext.Provider>
}
