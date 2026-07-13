import { describe, it, expect } from 'vitest'

import {
  factorySimulationScenarioSchema,
  type FactorySimulationScenarioInput,
} from './scenario'

const validScenario = (
  overrides: Partial<FactorySimulationScenarioInput> = {},
): FactorySimulationScenarioInput => ({
  seed: 42,
  initialPriceUsd: 0.02,
  marketDepthUsd: 200_000,
  pctSoldByType: { 'team-founders': 60 },
  pctSoldEmission: 50,
  macroWindows: [{ fromMonth: 0, toMonth: 48, condition: 'bear' }],
  crises: [],
  ...overrides,
})

describe('factorySimulationScenarioSchema', () => {
  it('accepts a full multi-window scenario', () => {
    const parsed = factorySimulationScenarioSchema.safeParse(
      validScenario({
        macroWindows: [
          { fromMonth: 0, toMonth: 6, condition: 'bear' },
          { fromMonth: 6, toMonth: 18, condition: 'bull' },
          // The last window may end past the design horizon: the engine
          // extends or ignores the tail.
          { fromMonth: 18, toMonth: 120, condition: 'bear' },
        ],
        liquidityEvents: [
          { month: 6, depthUsd: 100_000 },
          { month: 12, depthUsd: 0 },
        ],
        crises: [
          { month: 3, type: 'ftx' },
          { month: 24, type: 'covid' },
        ],
      }),
    )
    expect(parsed.success).toBe(true)
  })

  it('rejects windows that do not tile from month 0', () => {
    const gap = factorySimulationScenarioSchema.safeParse(
      validScenario({
        macroWindows: [
          { fromMonth: 0, toMonth: 3, condition: 'bull' },
          { fromMonth: 4, toMonth: 12, condition: 'bear' },
        ],
      }),
    )
    expect(gap.success).toBe(false)

    const overlap = factorySimulationScenarioSchema.safeParse(
      validScenario({
        macroWindows: [
          { fromMonth: 0, toMonth: 6, condition: 'bull' },
          { fromMonth: 5, toMonth: 12, condition: 'bear' },
        ],
      }),
    )
    expect(overlap.success).toBe(false)

    const lateStart = factorySimulationScenarioSchema.safeParse(
      validScenario({
        macroWindows: [{ fromMonth: 1, toMonth: 12, condition: 'bull' }],
      }),
    )
    expect(lateStart.success).toBe(false)

    const empty = factorySimulationScenarioSchema.safeParse(
      validScenario({ macroWindows: [] }),
    )
    expect(empty.success).toBe(false)
  })

  it('rejects duplicate or out-of-bounds liquidity events', () => {
    const duplicate = factorySimulationScenarioSchema.safeParse(
      validScenario({
        liquidityEvents: [
          { month: 6, depthUsd: 1 },
          { month: 6, depthUsd: 2 },
        ],
      }),
    )
    expect(duplicate.success).toBe(false)

    const negative = factorySimulationScenarioSchema.safeParse(
      validScenario({ liquidityEvents: [{ month: 6, depthUsd: -1 }] }),
    )
    expect(negative.success).toBe(false)

    const tooMany = factorySimulationScenarioSchema.safeParse(
      validScenario({
        liquidityEvents: Array.from({ length: 7 }, (_, i) => ({
          month: i,
          depthUsd: 1_000,
        })),
      }),
    )
    expect(tooMany.success).toBe(false)
  })

  it('bounds the scenario basics', () => {
    expect(
      factorySimulationScenarioSchema.safeParse(
        validScenario({ initialPriceUsd: 0 }),
      ).success,
    ).toBe(false)
    expect(
      factorySimulationScenarioSchema.safeParse(validScenario({ seed: 1.5 }))
        .success,
    ).toBe(false)
    expect(
      factorySimulationScenarioSchema.safeParse(
        validScenario({
          crises: [
            { month: 1, type: 'ftx' },
            { month: 2, type: 'ftx' },
            { month: 3, type: 'ftx' },
            { month: 4, type: 'ftx' },
          ],
        }),
      ).success,
    ).toBe(false)
    // Null depth is a valid baseline (impact disabled until an event).
    expect(
      factorySimulationScenarioSchema.safeParse(
        validScenario({ marketDepthUsd: null }),
      ).success,
    ).toBe(true)
  })
})
