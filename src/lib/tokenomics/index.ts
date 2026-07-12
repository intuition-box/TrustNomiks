/**
 * Shared tokenomics domain library: pure schemas, taxonomies, math, and
 * scoring used by both the screener studio and Factory.
 *
 * This barrel must stay server-safe: never re-export the 'use client'
 * recharts wrappers (src/components/charts) from here — import charts
 * directly from their component paths.
 */
export * from './schemas'
export * from './vesting'
export * from './math'
export * from './cluster-scores'
export * from './schedules'
