import { z } from 'zod'

const toTitleCaseFromSlug = (value: string) =>
  value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())

export const CATEGORY_OPTIONS = [
  {
    value: 'open-digital-economy',
    label: 'Open Digital Economy',
    description: `Ecosystems, protocols, or platforms that enable extraction or engagement of value by following simple rules. Users can accumulate value through progression (micro-tasking, questing, etc.), skill improvement (skills, PvP, etc.), or the time factor (crafting, leveling, presence, etc.). This value can then be exchanged, sold, or invested, just like in a real economy.`,
  },
  {
    value: 'payment',
    label: 'Payment',
    description: `Protocols focused on monetary interaction and transactions. They can take the form of payment infrastructures, toolkits for marketplaces, or incentive models offering rewards such as subsidies or cash back.`,
  },
  {
    value: 'two-sided-market',
    label: 'Two-sided Market',
    description: `Two-sided markets, involving suppliers and demanders. Often marketplaces establishing a direct relationship between the two parties, antagonistic but interdependent. In some cases, two markets (primary and secondary) are established, with the entity itself managing the primary market, while the secondary market is entirely atomic (without authorizations).`,
  },
  {
    value: 'infrastructure',
    label: 'Infrastructure',
    description: `"Chain-agnostic" protocols that provide services to multiple databases and blockchain networks in general. They can facilitate the transfer of assets and data, or directly host them in the form of a blockchain network.`,
  },
  {
    value: 'financial',
    label: 'Financial',
    description: `Projects offering investment solutions, structured products, synthetic assets, stock markets or aggregate returns. Includes DeFi, CeFi and TradFi projects.`,
  },
] as const

export type CategoryType = (typeof CATEGORY_OPTIONS)[number]['value']

export const SECTOR_OPTIONS = [
  {
    value: 'asset-management',
    label: 'Asset Management',
    category: 'financial',
    description: `A passive investment solution that offers returns linked to the performance of a asset or market. It can be managed (by an entity or verified traders) or in self-managed mode (by the owner or their personal managers). Includes AI-driven investment applications such as Numeraire (NMR).`,
  },
  { value: 'cex', label: 'CEX', category: 'financial', description: `Centralized stock exchange for trading.` },
  { value: 'dex', label: 'DEX', category: 'financial', description: `Decentralized protocol (Dapp) enabling exchanges and the provision of liquidity in return for payment.` },
  { value: 'lending', label: 'Lending', category: 'financial', description: `(Pseudo-)decentralized protocol (Dapp) for borrowing and lending.` },
  {
    value: 'yield-strategy',
    label: 'Yield Strategy',
    category: 'financial',
    description: `A protocol or platform offering aggregated yield solutions that rely on a third-party protocol or platform. Includes for example "Yield Aggregators", "Liquid Staking" projects and "Bonding" mechanisms.`,
  },
  {
    value: 'gambling-prediction',
    label: 'Gambling/Prediction',
    category: 'financial',
    description: `Gambling platform or prediction market enabling speculation on various future events such as political or sporting events. These protocols usually have a smart-contract infrastructure, giving life to autonomous prediction markets.`,
  },
  { value: 'derivative-market', label: 'Derivative Market', category: 'financial', description: `Protocol for trading options, derivatives or synthetic assets.` },
  { value: 'funding', label: 'Funding', category: 'financial', description: `Crowdfunding platform, particularly launchpads and fundraising protocols that facilitate ICOs, IDOs, or IFOs.` },
  {
    value: 'oracle-data',
    label: 'Oracle/Data',
    category: 'infrastructure',
    description: `Solution that simplifies the analysis, production and transfer of information between different networks. Can be applied to web 2 architectures (off-chain databases) to connect them to blockchains, can be a data indexer, etc.`,
  },
  {
    value: 'artificial-intelligence',
    label: 'Artificial Intelligence',
    category: 'infrastructure',
    description: `Protocol for deploying and verifying machine learning models, to make predictions, train LLMs, solve captchas or any other AI-related use. These protocols can reward participants for creating, verifying and applying predictive, generative or analytical models. Also includes infrastructures facilitating the connection between IoT and AI.`,
  },
  {
    value: 'baas',
    label: 'BaaS',
    category: 'infrastructure',
    description: `Private or authenticated P2P Blockchain network offering a framework for deploying smart contracts (Dapps), creating assets (tokens) or managing/authenticating data, all within a specific business context.`,
  },
  {
    value: 'l1',
    label: 'L1',
    category: 'infrastructure',
    description: `Public or authenticated P2P Blockchain network enabling flexible deployment of smart contracts (Dapps), asset creation (tokens) or data management/authentication.`,
  },
  {
    value: 'l2',
    label: 'L2',
    category: 'infrastructure',
    description: `Solution built on top of an L1 layer, able to offer the same functionality as an L1 layer or a BaaS solution.`,
  },
  {
    value: 'l0',
    label: 'L0',
    category: 'infrastructure',
    description: `Blockchain networks that enable the easy deployment of Layer 1 blockchains while ensuring interoperability.`,
  },
  {
    value: 'bridge',
    label: 'Bridge',
    category: 'infrastructure',
    description: `Solution facilitating the transfer of value from one network to another, in the form of an independent, agnostic network or a communication protocol.`,
  },
  {
    value: 'depin',
    label: 'DePin',
    category: 'infrastructure',
    description: `A protocol allowing data processing, storage, or heavy computations such as rendering or machine learning. Providers offer computing power (CPU or GPU) to meet the needs of consumers, whether intermittent or continuous.`,
  },
  {
    value: 'advertising',
    label: 'Advertising',
    category: 'open-digital-economy',
    description: `Platforms where users can earn money from the value generated by their presence or through simple interactions, such as visibility models with a cost per click. The number of users thus influences their own earning potential through the increased monetization prices of visibility.`,
  },
  {
    value: 'content-creation',
    label: 'Content Creation',
    category: 'open-digital-economy',
    description: `Social networks, social platforms or other platforms with a business model centered on creators and their audience. These platforms stimulate growth by fostering the presence and interaction of communities around multiple creators. They can enable the tokenization of audience and content, offering creators and fans new ways to interact, support and engage. Includes platforms that enable creators to directly monetize their content and audience through tokens and other incentive mechanisms.`,
  },
  {
    value: 'gaming-ecosystem',
    label: 'Gaming Ecosystem',
    category: 'open-digital-economy',
    description: `Ecosystems that group together a set of sub-ecosystems focused on gaming or immersive environments and experiences. They include web3 game launchers.`,
  },
  {
    value: 'game',
    label: 'Game',
    category: 'open-digital-economy',
    description: `Web3 games that incorporate assets or items with an on-chain presence and incentive mechanisms for the players involved.`,
  },
  {
    value: 'fan-token',
    label: 'Fan Token',
    category: 'open-digital-economy',
    description: `Platforms offering a variety of mechanisms and opportunities to strengthen the bond between creators and fans.`,
  },
  {
    value: 'metaverse',
    label: 'Metaverse',
    category: 'open-digital-economy',
    description: `Virtual universe where users can interact with a digital environment and other users. Usually in 3D, it merges elements of social networks and online games, offering the possibility of creating showcase experiences. Metaverses are based on real-time economies that focus notably on visibility, the creation and exchange of digital elements, and micro-transactions.`,
  },
  {
    value: 'payment-platform',
    label: 'Payment Platform',
    category: 'payment',
    description: `Payment/transaction networks offering a variety of payment protocols (privacy coin, corporate banking, etc.) as well as various services and solutions to facilitate exchanges and monetary transactions (fiat-on-ramp, multi-currency, etc.).`,
  },
  {
    value: 'rewards',
    label: 'Rewards',
    category: 'payment',
    description: `Economic system based on monetary rewards, using tokens to reward users according to the completion of tasks, without directly influencing their realization: cash back, block validation, in-game/in-app rewards, etc. Applications are numerous, and include crypto-currency wallet solutions (TrustWallet, Coin98, etc.) that incentivize adoption via tokenized rewards, or neo-banks offering cash back via their token.`,
  },
  {
    value: 'memes-token',
    label: 'Memes Token',
    category: 'payment',
    description: `Experimental tokens with no particular fundamentals. They generally aim to gather a community around a popular reference, such as Shiba or the Pepe icon.`,
  },
  {
    value: 'collectible-nft',
    label: 'Collectible/NFT',
    category: 'two-sided-market',
    description: `Protocol enabling the exchange of NFT (Non-Fungible Tokens) and SFT (Semi-Fungible Tokens), with creators on one side and users on the other. Can include a primary market (when the project itself publishes items or when creators create collections primary mints), but must offer a secondary market to users.`,
  },
  {
    value: 'identity-reputation',
    label: 'Identity/Reputation',
    category: 'two-sided-market',
    description: `Protocol for on-chain reputation, or that facilitates the authentication and tracking of actors, either on demand or continuously. It can, for example, provide a "cross-identity" service across different networks.`,
  },
  {
    value: 'other',
    label: 'Other',
    category: 'two-sided-market',
    description: `Any project not included in the other sectors of the "Two-Sided Market" category, including a wide variety of projects (job search, P2P analysis, etc.).`,
  },
] as const

export type SectorType = (typeof SECTOR_OPTIONS)[number]['value']

const LEGACY_CATEGORY_MAP: Record<string, CategoryType> = {
  defi: 'financial',
  gaming: 'open-digital-economy',
  social: 'two-sided-market',
  ai: 'infrastructure',
  depin: 'infrastructure',
  l1: 'infrastructure',
  l2: 'infrastructure',
  other: 'two-sided-market',
}

export const normalizeCategory = (value: string | null | undefined): CategoryType | null => {
  const normalized = value?.trim().toLowerCase()
  if (!normalized) return null

  const match = CATEGORY_OPTIONS.find((option) => option.value === normalized)
  if (match) return match.value

  return LEGACY_CATEGORY_MAP[normalized] || null
}

export const toSupportedCategory = (value: string | null | undefined): CategoryType | null =>
  normalizeCategory(value)

export const normalizeSector = (value: string | null | undefined): SectorType | null => {
  const normalized = value?.trim().toLowerCase()
  if (!normalized) return null

  const normalizedSlug = normalized.replace(/_/g, '-')
  const match = SECTOR_OPTIONS.find((option) => option.value === normalizedSlug)
  return match?.value || null
}

export const toSupportedSector = (value: string | null | undefined): SectorType | null =>
  normalizeSector(value)

export const getCategoryOption = (value: string | null | undefined) => {
  const normalized = normalizeCategory(value)
  if (!normalized) return null

  return CATEGORY_OPTIONS.find((option) => option.value === normalized) || null
}

export const getSectorOption = (value: string | null | undefined) => {
  const normalized = normalizeSector(value)
  if (!normalized) return null

  return SECTOR_OPTIONS.find((option) => option.value === normalized) || null
}

export const getSectorOptionsByCategory = (
  category: string | null | undefined
) => {
  const normalizedCategory = normalizeCategory(category)
  if (!normalizedCategory) return []

  return SECTOR_OPTIONS.filter((option) => option.category === normalizedCategory)
}

export const isSectorCompatibleWithCategory = (
  category: string | null | undefined,
  sector: string | null | undefined
) => {
  const normalizedCategory = normalizeCategory(category)
  const sectorOption = getSectorOption(sector)
  if (!normalizedCategory || !sectorOption) return false

  return sectorOption.category === normalizedCategory
}

export const formatCategoryLabel = (value: string | null | undefined): string => {
  const option = getCategoryOption(value)
  if (option) return option.label

  if (!value) return ''
  return toTitleCaseFromSlug(value)
}

export const formatSectorLabel = (value: string | null | undefined): string => {
  const option = getSectorOption(value)
  if (option) return option.label

  if (!value) return ''
  return toTitleCaseFromSlug(value)
}

export const getCategoryDescription = (value: string | null | undefined): string => {
  const option = getCategoryOption(value)
  return option?.description || ''
}

export const getSectorDescription = (value: string | null | undefined): string => {
  const option = getSectorOption(value)
  return option?.description || ''
}

// Step 1: Token Identity
export const tokenIdentitySchema = z.object({
  name: z.string().min(1, 'Project name is required'),
  ticker: z.string().min(1, 'Ticker is required').transform(val => val.toUpperCase()),
  chain: z.string().optional(),
  contract_address: z.string().optional(),
  tge_date: z.string().optional(),
  category: z.string().optional(),
  sector: z.string().optional(),
  notes: z.string().optional(),
}).superRefine((data, ctx) => {
  const category = normalizeCategory(data.category)
  const sector = normalizeSector(data.sector)

  if (data.category && !category) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Invalid category selected',
      path: ['category'],
    })
  }

  if (data.sector && !sector) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Invalid sector selected',
      path: ['sector'],
    })
  }

  if (category && !sector) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Sector is required when category is selected',
      path: ['sector'],
    })
  }

  if (sector && !category) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Category is required when sector is selected',
      path: ['category'],
    })
  }

  if (category && sector && !isSectorCompatibleWithCategory(category, sector)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Selected sector does not belong to this category',
      path: ['sector'],
    })
  }
})

export type TokenIdentityFormData = z.infer<typeof tokenIdentitySchema>

// Step 2: Supply Metrics
export const supplyMetricsSchema = z.object({
  max_supply: z.string().optional(),
  initial_supply: z.string().optional(),
  tge_supply: z.string().optional(),
  circulating_supply: z.string().optional(),
  circulating_date: z.string().optional(),
  source_url: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  notes: z.string().optional(),
})

export type SupplyMetricsFormData = z.infer<typeof supplyMetricsSchema>

// Step 3: Allocations
export const SEGMENT_TYPES = [
  'funding-private',
  'funding-public',
  'team-founders',
  'treasury',
  'marketing',
  'airdrop',
  'rewards',
  'liquidity',
] as const

export type SegmentType = (typeof SEGMENT_TYPES)[number]

const LEGACY_SEGMENT_TYPE_MAP: Record<string, SegmentType> = {
  team: 'team-founders',
  advisors: 'team-founders',
  investors: 'funding-private',
  private_sale: 'funding-private',
  'private-sale': 'funding-private',
  public_sale: 'funding-public',
  'public-sale': 'funding-public',
  community: 'airdrop',
  ecosystem: 'rewards',
  other: 'marketing',
}

export const normalizeSegmentType = (value: string | null | undefined): SegmentType | null => {
  const normalized = value?.trim().toLowerCase()
  if (!normalized) return null
  if ((SEGMENT_TYPES as readonly string[]).includes(normalized)) {
    return normalized as SegmentType
  }

  return LEGACY_SEGMENT_TYPE_MAP[normalized] || null
}

export const toSupportedSegmentType = (
  value: string | null | undefined,
  fallback: SegmentType = 'marketing'
): SegmentType => normalizeSegmentType(value) ?? fallback

export const allocationSegmentSchema = z.object({
  id: z.string().optional(), // For tracking in UI
  segment_type: z.string().min(1, 'Segment type is required'),
  label: z.string().min(1, 'Label is required'),
  percentage: z.string().min(1, 'Percentage is required'),
  token_amount: z.string().optional(), // Calculated field
  wallet_address: z.string().optional(),
}).passthrough()

export const allocationsSchema = z.object({
  segments: z.array(allocationSegmentSchema).min(1, 'At least one allocation segment is required'),
})

export type AllocationSegment = z.infer<typeof allocationSegmentSchema>
export type AllocationsFormData = z.infer<typeof allocationsSchema>

// Segment type options
export const SEGMENT_TYPE_OPTIONS = [
  {
    value: 'funding-private',
    label: 'Funding Private',
    description:
      'Tokens available for fundraising, intended private investors (seed phase, accelerator, private sale, series A...).',
  },
  {
    value: 'funding-public',
    label: 'Funding Public',
    description:
      'Tokens available for fundraising, intended public investors (Initial Coin Offering, Initial Farming Offering, IEO, IDO...).',
  },
  {
    value: 'team-founders',
    label: 'Team/Founders',
    description:
      "Tokens reserved for the project's team, including founders, advisors, employees, and developers. This allocation can serve as an incentive for future employees or as a retroactive reward.",
  },
  {
    value: 'treasury',
    label: 'Treasury',
    description:
      "Project's reserves, which can take various forms, both liquid and illiquid: the holdings of a DAO, funds dedicated to development and maintenance, emergency funds, or simply unallocated reserves.",
  },
  {
    value: 'marketing',
    label: 'Marketing',
    description:
      'Allocations related to the communication and visibility of the project. Their objective is to generate indirect growth of the protocol, through means such as social metrics or strategic partnerships.',
  },
  {
    value: 'airdrop',
    label: 'Airdrop',
    description:
      'Tokens that will reward "early contributors" or "early users", typically retroactive rewards distributed through a "snapshot". Includes tokens used for user base acquisition from other platforms (for example, "vampire attacks").',
  },
  {
    value: 'rewards',
    label: 'Rewards',
    description:
      'Rewards aimed at stimulating the direct growth of a protocol, game, or application. Also includes incentive mechanisms related to the system\'s functional objectives: the security of a protocol, the depth of a market, the collateral of an asset or product, etc. (generally "liquidity mining", "staking rewards", "game rewards")',
  },
  {
    value: 'liquidity',
    label: 'Liquidity',
    description:
      'Allocations intended to increase market depth during the launch phases of a token at the time of TGE (Token Generation Event). This amount can be used as pairing liquidity for a DEX or as a reserve for a CEX.',
  },
] as const

export const getSegmentTypeOption = (value: string | null | undefined) => {
  const normalized = normalizeSegmentType(value)
  if (!normalized) return null

  return SEGMENT_TYPE_OPTIONS.find((option) => option.value === normalized) || null
}

export const formatSegmentTypeLabel = (value: string | null | undefined): string => {
  const option = getSegmentTypeOption(value)
  if (option) return option.label

  if (!value) return ''
  return toTitleCaseFromSlug(value)
}

export const getSegmentTypeDescription = (value: string | null | undefined): string => {
  const option = getSegmentTypeOption(value)
  return option?.description || ''
}

// Step 4: Vesting Schedules
export const VESTING_FREQUENCIES = [
  'immediate',
  'daily',
  'monthly',
  'yearly',
  'custom',
] as const

export type VestingFrequency = (typeof VESTING_FREQUENCIES)[number]

export const normalizeVestingFrequency = (
  frequency: string | null | undefined
): VestingFrequency => {
  if (frequency === 'quarterly') return 'yearly'
  if (!frequency) return 'monthly'

  return (VESTING_FREQUENCIES as readonly string[]).includes(frequency)
    ? (frequency as VestingFrequency)
    : 'monthly'
}

export const vestingScheduleSchema = z.object({
  allocation_id: z.string().optional(),
  cliff_months: z.string().optional(),
  duration_months: z.string().optional(),
  frequency: z.enum(VESTING_FREQUENCIES).optional(),
  hatch_percentage: z.string().optional(),
  cliff_unlock_percentage: z.string().optional(),
  notes: z.string().optional(),
})

export const vestingSchedulesSchema = z.object({
  schedules: z.record(z.string(), vestingScheduleSchema),
})

export type VestingSchedule = z.infer<typeof vestingScheduleSchema>
export type VestingSchedulesFormData = z.infer<typeof vestingSchedulesSchema>

// Vesting frequency options
export const VESTING_FREQUENCY_OPTIONS = [
  { value: 'immediate', label: 'Immediate (100% at TGE)' },
  { value: 'daily', label: 'Daily' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'custom', label: 'Custom' },
]

// Segment types that typically have immediate vesting
export const IMMEDIATE_SEGMENT_TYPES: SegmentType[] = ['liquidity', 'airdrop', 'funding-public']

// Step 5: Emission Model
export const emissionModelSchema = z.object({
  type: z.string().min(1, 'Emission type is required'),
  annual_inflation_rate: z.string().optional(),
  inflation_schedule: z.array(z.object({
    year: z.string().min(1, 'Year is required'),
    rate: z.string().min(1, 'Rate is required'),
  })).optional(),
  has_burn: z.boolean().optional(),
  burn_details: z.string().optional(),
  has_buyback: z.boolean().optional(),
  buyback_details: z.string().optional(),
  notes: z.string().optional(),
})

export type EmissionModelFormData = z.infer<typeof emissionModelSchema>

// Emission type options
export const EMISSION_TYPE_OPTIONS = [
  { value: 'fixed_cap', label: 'Fixed Cap (No inflation)' },
  { value: 'inflationary', label: 'Inflationary' },
  { value: 'deflationary', label: 'Deflationary' },
  { value: 'burn_mint', label: 'Burn & Mint Equilibrium' },
  { value: 'rebase', label: 'Rebase Mechanism' },
  { value: 'other', label: 'Other' },
]

// Step 6: Data Sources
export const dataSourceSchema = z.object({
  id: z.string().optional(),
  source_type: z.string().min(1, 'Source type is required'),
  document_name: z.string().min(1, 'Document name is required'),
  url: z.string().url('Must be a valid URL').min(1, 'URL is required'),
  version: z.string().optional(),
  verified_at: z.string().optional(),
})

export const dataSourcesSchema = z.object({
  sources: z.array(dataSourceSchema).min(0),
})

export type DataSource = z.infer<typeof dataSourceSchema>
export type DataSourcesFormData = z.infer<typeof dataSourcesSchema>

// Source type options
export const SOURCE_TYPE_OPTIONS = [
  { value: 'whitepaper', label: 'Whitepaper' },
  { value: 'docs', label: 'Documentation' },
  { value: 'on_chain', label: 'On-Chain Data' },
  { value: 'dao_proposal', label: 'DAO Proposal' },
  { value: 'announcement', label: 'Official Announcement' },
  { value: 'api', label: 'API/Data Feed' },
  { value: 'other', label: 'Other' },
]

// Blockchain options
export const BLOCKCHAIN_OPTIONS = [
  { value: 'ethereum', label: 'Ethereum' },
  { value: 'solana', label: 'Solana' },
  { value: 'arbitrum', label: 'Arbitrum' },
  { value: 'optimism', label: 'Optimism' },
  { value: 'base', label: 'Base' },
  { value: 'polygon', label: 'Polygon' },
  { value: 'bnb-chain', label: 'BNB Chain' },
  { value: 'avalanche', label: 'Avalanche' },
  { value: 'starknet', label: 'Starknet' },
  { value: 'other', label: 'Other' },
]

// Form steps
export const FORM_STEPS = [
  { id: 1, name: 'Identity', description: 'Basic token information' },
  { id: 2, name: 'Supply', description: 'Token supply metrics' },
  { id: 3, name: 'Allocations', description: 'Distribution breakdown' },
  { id: 4, name: 'Vesting', description: 'Unlock schedules' },
  { id: 5, name: 'Emission', description: 'Inflation & economics' },
  { id: 6, name: 'Sources', description: 'Data references' },
]
