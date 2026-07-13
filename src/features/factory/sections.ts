/**
 * Factory's studio sections: the screener's tokenomics core (same order),
 * without the attestation sections (Sources, Risk) that only make sense for
 * real, deployed tokens, plus the factory-only Funding and Simulation
 * studio sections (optional, unscored). The studio (key 'projections') is
 * a derived view of the design, not a form: it has no save path; only its
 * scenario snapshots persist, in their own table.
 */
export type FactorySectionKey =
  | 'identity'
  | 'supply'
  | 'allocation'
  | 'vesting'
  | 'emission'
  | 'funding'
  | 'projections'

/** The sections backed by a react-hook-form instance and a save RPC. */
export type FactoryFormSectionKey = Exclude<FactorySectionKey, 'projections'>

export const FACTORY_SECTION_ORDER: FactorySectionKey[] = [
  'identity',
  'supply',
  'allocation',
  'vesting',
  'emission',
  'funding',
  'projections',
]

export const FACTORY_SECTION_LABELS: Record<FactorySectionKey, string> = {
  identity: 'Identity',
  supply: 'Supply',
  allocation: 'Allocation',
  vesting: 'Vesting',
  emission: 'Emission',
  funding: 'Funding',
  projections: 'Simulation studio',
}
