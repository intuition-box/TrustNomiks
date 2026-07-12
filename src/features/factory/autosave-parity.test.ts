import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Drift tripwire for the clone-not-adapter persistence layer (see the DRIFT
 * LEDGER in use-factory-form-state.ts): the Factory hooks hand-mirror the
 * screener's autosave choreography, so the load-bearing invariants are
 * asserted against BOTH sources. If a deliberate change lands on one side,
 * this test forces the other side (or the ledger) to be updated with it.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

const screenerState = read('src/components/token-form/use-token-form-state.ts')
const screenerSaves = read(
  'src/components/token-form/use-token-save-handlers.ts',
)
const factoryState = read('src/features/factory/use-factory-form-state.ts')
const factorySaves = read('src/features/factory/use-factory-save-handlers.ts')

describe('autosave parity (screener ⇄ factory twins)', () => {
  it('both debounce the autosave with the same 1800ms window', () => {
    expect(screenerSaves).toContain('}, 1800)')
    expect(factorySaves).toContain('}, 1800)')
  })

  it('both arm the auto-draft with the same 1200ms window', () => {
    expect(screenerSaves).toContain('}, 1200)')
    expect(factorySaves).toContain('}, 1200)')
  })

  it('both only schedule autosave on real user edits (type === change)', () => {
    expect(screenerSaves).toContain("info?.type !== 'change'")
    expect(factorySaves).toContain("info?.type !== 'change'")
  })

  it('both skip autosaving an empty vesting section', () => {
    const marker = 'allocationsRef.current.length === 0) return'
    expect(screenerSaves).toContain(marker)
    expect(factorySaves).toContain(marker)
  })

  it('both skip autosaving an emission section with no type picked', () => {
    const marker = "!step5Form.getValues('type')) return"
    expect(screenerSaves).toContain(marker)
    expect(factorySaves).toContain(marker)
  })

  it('both single-source createSaveQueue from the tokenomics lib', () => {
    // The screener imports via the form-helpers re-export shim; the factory
    // hook imports the lib directly. Either path resolves to
    // src/lib/tokenomics/math.ts — what matters is neither carries its own copy.
    expect(screenerState).toContain('createSaveQueue')
    expect(screenerState).not.toContain('function createSaveQueue')
    expect(factoryState).toContain('createSaveQueue')
    expect(factoryState).not.toContain('function createSaveQueue')
  })

  it('factory persists completeness only through the scoring contract', () => {
    // Every p_completeness the factory save handlers send must come from
    // computeFactoryScore (no hand-rolled Math.min sums like the screener's
    // interim sites).
    expect(factorySaves).toContain('computeFactoryScore')
    expect(factorySaves).not.toMatch(
      /Math\.min\(\s*100?[\s\S]{0,80}completeness/i,
    )
  })
})
