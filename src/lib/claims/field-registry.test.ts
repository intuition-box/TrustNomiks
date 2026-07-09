import { describe, it, expect } from 'vitest'
import type { ClaimType } from '@/types/form'
import { hasCanonicalPredicate } from '@/lib/intuition/canonical-registry'
import {
  CHALLENGEABLE_CLAIM_TYPES,
  FIELD_ANCHOR_MODE,
  FIELD_REGISTRY,
  getFieldDef,
  getFieldPredicate,
  isChallengeableField,
  listFields,
} from './field-registry'

describe('FIELD_REGISTRY round-trip', () => {
  for (const claimType of CHALLENGEABLE_CLAIM_TYPES) {
    for (const field of FIELD_REGISTRY[claimType]) {
      it(`getFieldDef(${claimType}, ${field.key}) returns the same def`, () => {
        expect(getFieldDef(claimType, field.key)).toEqual(field)
      })

      it(`isChallengeableField(${claimType}, ${field.key}) is true`, () => {
        expect(isChallengeableField(claimType, field.key)).toBe(true)
      })
    }
  }
})

describe('FIELD_REGISTRY has no duplicate field keys within a claim type', () => {
  for (const claimType of CHALLENGEABLE_CLAIM_TYPES) {
    it(`${claimType} has unique field keys`, () => {
      const keys = FIELD_REGISTRY[claimType].map((field) => field.key)
      expect(new Set(keys).size).toBe(keys.length)
    })
  }
})

describe('isChallengeableField out-of-scope handling', () => {
  it('is false for an unknown key on an in-scope claim type', () => {
    expect(isChallengeableField('token_identity', 'not_a_real_field')).toBe(
      false,
    )
  })

  it('is false for an out-of-scope claim type', () => {
    // 'data_source' is excluded from the MVP (row ids regenerate on save);
    // cast through ClaimType to exercise the runtime guard.
    const outOfScope = 'data_source' as ClaimType
    expect(isChallengeableField(outOfScope, 'name')).toBe(false)
  })

  it('listFields returns an empty array for an out-of-scope claim type', () => {
    const outOfScope = 'risk_flags' as ClaimType
    expect(listFields(outOfScope)).toEqual([])
  })
})

describe('FIELD_ANCHOR_MODE', () => {
  it('covers exactly the CHALLENGEABLE_CLAIM_TYPES', () => {
    const keys = Object.keys(FIELD_ANCHOR_MODE)
    expect(keys.length).toBe(CHALLENGEABLE_CLAIM_TYPES.length)
    for (const claimType of CHALLENGEABLE_CLAIM_TYPES) {
      expect(keys).toContain(claimType)
    }
  })
})

describe('predicate consistency with the canonical registry', () => {
  for (const claimType of CHALLENGEABLE_CLAIM_TYPES) {
    for (const field of FIELD_REGISTRY[claimType]) {
      if (!field.predicate) continue

      it(`${claimType}.${field.key} predicate "${field.predicate}" is canonical`, () => {
        expect(hasCanonicalPredicate(field.predicate as string)).toBe(true)
      })

      it(`getFieldPredicate(${claimType}, ${field.key}) returns the predicate`, () => {
        expect(getFieldPredicate(claimType, field.key)).toBe(field.predicate)
      })
    }
  }

  it('getFieldPredicate returns undefined for a field without a predicate', () => {
    expect(getFieldPredicate('emission_model', 'type')).toBeUndefined()
  })

  it('getFieldPredicate returns undefined for an unknown field', () => {
    expect(
      getFieldPredicate('token_identity', 'not_a_real_field'),
    ).toBeUndefined()
  })
})
