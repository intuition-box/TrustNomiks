/**
 * Wire shape of a stress-test scenario: what the client sends to the
 * simulate route and what a saved snapshot stores. The design itself never
 * travels; the route reloads it under RLS. The engine re-validates on its
 * own terms (normalizeMacroWindows, normalizeDepthEvents throw
 * SimulationInputError): this schema exists to reject malformed payloads
 * at the boundary with friendly messages.
 */
import { z } from 'zod'

/** Scenario months are bounded by the projection ceiling (120 = 10 years). */
export const SCENARIO_MAX_MONTH = 120
export const MAX_MACRO_WINDOWS = 12
export const MAX_LIQUIDITY_EVENTS = 6
export const MAX_CRISES = 3
/** A design keeps at most this many saved scenarios (DB trigger backstop). */
export const MAX_SAVED_SCENARIOS = 5

export const factorySimulationScenarioSchema = z.object({
  seed: z.number().int(),
  /** Optional; the engine clamps to its own [min, max] with a default. */
  nPaths: z.number().int().optional(),
  initialPriceUsd: z.number().positive().finite(),
  marketDepthUsd: z.number().finite().nullable(),
  pctSoldByType: z.record(z.string(), z.number()),
  pctSoldEmission: z.number(),
  macroWindows: z
    .array(
      z.object({
        fromMonth: z.number().int().min(0).max(SCENARIO_MAX_MONTH),
        toMonth: z
          .number()
          .int()
          .min(1)
          .max(SCENARIO_MAX_MONTH + 1),
        condition: z.enum(['bull', 'bear']),
      }),
    )
    .min(1)
    .max(MAX_MACRO_WINDOWS)
    .superRefine((windows, ctx) => {
      // Windows must tile from month 0 without gaps or overlaps. The LAST
      // toMonth is free: the engine extends or ignores the tail, so a saved
      // scenario survives horizon changes in either direction.
      const sorted = [...windows].sort((a, b) => a.fromMonth - b.fromMonth)
      let cursor = 0
      for (const window of sorted) {
        if (window.toMonth <= window.fromMonth || window.fromMonth !== cursor) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Macro windows must tile the horizon from month 0',
          })
          return
        }
        cursor = window.toMonth
      }
    }),
  liquidityEvents: z
    .array(
      z.object({
        month: z.number().int().min(0).max(SCENARIO_MAX_MONTH),
        /** 0 is valid: it models the market drying up from that month. */
        depthUsd: z.number().finite().nonnegative(),
      }),
    )
    .max(MAX_LIQUIDITY_EVENTS)
    .superRefine((events, ctx) => {
      const months = events.map((event) => event.month).sort((a, b) => a - b)
      for (let i = 1; i < months.length; i++) {
        if (months[i] === months[i - 1]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Duplicate liquidity event at month ${months[i]}`,
          })
          return
        }
      }
    })
    .optional(),
  crises: z
    .array(
      z.object({
        month: z.number().int().min(0).max(SCENARIO_MAX_MONTH),
        type: z.enum(['covid', 'ftx', 'terra']),
      }),
    )
    .max(MAX_CRISES),
})

export type FactorySimulationScenarioInput = z.infer<
  typeof factorySimulationScenarioSchema
>
