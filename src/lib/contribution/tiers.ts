/**
 * Contribution tier ladder for the gamification/progression surfaces
 * (/progress). Same thresholds as the original profile-page implementation,
 * kept as pure, testable data + a lookup so the page stays thin.
 */
export interface ContributionTier {
  label: string
  min: number
  max: number
}

export const CONTRIBUTION_TIERS: ContributionTier[] = [
  { label: 'Observer', min: 0, max: 2 },
  { label: 'Contributor', min: 3, max: 9 },
  { label: 'Curator', min: 10, max: 24 },
  { label: 'Cartographer', min: 25, max: 49 },
  { label: 'Architect', min: 50, max: Infinity },
]

/** Index into CONTRIBUTION_TIERS for a given structured-token count. */
export function getTierIndex(count: number): number {
  const idx = CONTRIBUTION_TIERS.findIndex(
    (t) => count >= t.min && count <= t.max,
  )
  return idx >= 0 ? idx : 0
}
