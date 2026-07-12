/**
 * Factory's studio sections: the screener's tokenomics core (same order),
 * without the attestation sections (Sources, Risk) that only make sense for
 * real, deployed tokens.
 */
export type FactorySectionKey =
  'identity' | 'supply' | 'allocation' | 'vesting' | 'emission'

export const FACTORY_SECTION_ORDER: FactorySectionKey[] = [
  'identity',
  'supply',
  'allocation',
  'vesting',
  'emission',
]

export const FACTORY_SECTION_LABELS: Record<FactorySectionKey, string> = {
  identity: 'Identity',
  supply: 'Supply',
  allocation: 'Allocation',
  vesting: 'Vesting',
  emission: 'Emission',
}
