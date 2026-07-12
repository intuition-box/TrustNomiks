import { describe, it, expect } from 'vitest'

import {
  CONSTANT_BIAS_MU,
  CRISIS_CALIBRATION,
  CRISIS_DECAY_DAYS_PER_YEAR,
  CRISIS_EXP_MULT,
  DAYS_PER_YEAR,
  MACRO_CALIBRATION,
  SimulationInputError,
} from './calibration'
import {
  buildBaseDriftVol,
  crisisDriftVolAtDay,
  macroConditionAtDay,
  normalizeMacroWindows,
} from './models'

describe('normalizeMacroWindows', () => {
  it('converts months to a half-open day tiling', () => {
    const windows = normalizeMacroWindows(
      [
        { fromMonth: 6, toMonth: 12, condition: 'bear' },
        { fromMonth: 0, toMonth: 6, condition: 'bull' },
      ],
      360,
    )
    expect(windows).toEqual([
      { fromDay: 0, toDay: 180, condition: 'bull' },
      { fromDay: 180, toDay: 360, condition: 'bear' },
    ])
    expect(macroConditionAtDay(windows, 179)).toBe('bull')
    expect(macroConditionAtDay(windows, 180)).toBe('bear')
  })

  it('rejects gaps, overlaps and a late start; extends the tail', () => {
    expect(() =>
      normalizeMacroWindows(
        [
          { fromMonth: 0, toMonth: 3, condition: 'bull' },
          { fromMonth: 4, toMonth: 12, condition: 'bear' },
        ],
        360,
      ),
    ).toThrow(SimulationInputError)
    expect(() =>
      normalizeMacroWindows(
        [
          { fromMonth: 0, toMonth: 6, condition: 'bull' },
          { fromMonth: 5, toMonth: 12, condition: 'bear' },
        ],
        360,
      ),
    ).toThrow(SimulationInputError)
    expect(() =>
      normalizeMacroWindows(
        [{ fromMonth: 1, toMonth: 12, condition: 'bull' }],
        360,
      ),
    ).toThrow(SimulationInputError)
    expect(() => normalizeMacroWindows([], 360)).toThrow(SimulationInputError)

    const extended = normalizeMacroWindows(
      [{ fromMonth: 0, toMonth: 12, condition: 'bear' }],
      720,
    )
    expect(extended[0].toDay).toBe(720)
    expect(macroConditionAtDay(extended, 700)).toBe('bear')
  })
})

describe('crisisDriftVolAtDay', () => {
  it('applies the full shock multiplier at the start day', () => {
    const atStart = crisisDriftVolAtDay('covid', 'payment', 90, 90)
    expect(atStart.mu).toBeCloseTo(-23.57 * 2.3, 10) // -54.211
    expect(atStart.sigma).toBeCloseTo(2.87 * 2.3, 10) // 6.601
    expect(crisisDriftVolAtDay('covid', 'payment', 90, 89)).toEqual({
      mu: 0,
      sigma: 0,
    })
  })

  it('decays exponentially with the calibrated half-life', () => {
    const decay =
      (CRISIS_EXP_MULT * CRISIS_DECAY_DAYS_PER_YEAR) /
      CRISIS_CALIBRATION.covid.durationDays
    // Expected factor recomputed from the same closed form as the model.
    const atWindowEnd = crisisDriftVolAtDay('covid', 'payment', 0, 7)
    const expectedFactor =
      CRISIS_EXP_MULT * Math.exp((-decay * 7) / DAYS_PER_YEAR)
    expect(atWindowEnd.mu).toBeCloseTo(-23.57 * expectedFactor, 10)
    // ~90% of the shock is gone by the end of the crisis window.
    expect(expectedFactor / CRISIS_EXP_MULT).toBeLessThan(0.11)

    const halfLifeDays = (Math.LN2 / decay) * DAYS_PER_YEAR
    const atHalfLife = crisisDriftVolAtDay('covid', 'payment', 0, halfLifeDays)
    expect(atHalfLife.mu).toBeCloseTo((-23.57 * CRISIS_EXP_MULT) / 2, 8)
  })
})

describe('buildBaseDriftVol', () => {
  const bullWindows = normalizeMacroWindows(
    [{ fromMonth: 0, toMonth: 12, condition: 'bull' }],
    360,
  )

  it('sums bias, macro and crisis contributions arithmetically', () => {
    const base = buildBaseDriftVol({
      horizonDays: 360,
      category: 'financial',
      windows: bullWindows,
      crises: [{ month: 0, type: 'ftx' }],
    })
    const macro = MACRO_CALIBRATION.bull.financial
    const crisis = crisisDriftVolAtDay('ftx', 'financial', 0, 1)
    expect(base.mu[1]).toBeCloseTo(CONSTANT_BIAS_MU + macro.mu + crisis.mu, 10)
    expect(base.sigma[1]).toBeCloseTo(macro.sigma + crisis.sigma, 10)
  })

  it('keeps days before a crisis untouched', () => {
    const base = buildBaseDriftVol({
      horizonDays: 360,
      category: 'financial',
      windows: bullWindows,
      crises: [{ month: 2, type: 'covid' }],
    })
    const macro = MACRO_CALIBRATION.bull.financial
    expect(base.mu[59]).toBeCloseTo(CONSTANT_BIAS_MU + macro.mu, 10)
    // Day 60 is the crisis start: the full multiplier applies.
    expect(base.mu[60]).toBeCloseTo(
      CONSTANT_BIAS_MU + macro.mu + -20.88 * CRISIS_EXP_MULT,
      10,
    )
    expect(base.sigma[59]).toBeCloseTo(macro.sigma, 10)
  })
})
