/**
 * Factory's studio sections: the screener's tokenomics core (same order),
 * without the attestation sections (Sources, Risk) that only make sense for
 * real, deployed tokens, plus the factory-only Funding and Projections
 * sections (optional, unscored). Projections is a derived view of the
 * design, not a form: it has no save path and no persistence of its own.
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
  projections: 'Projections',
}
