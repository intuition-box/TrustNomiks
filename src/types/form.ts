import { z } from 'zod'

// Step 1: Token Identity
export const tokenIdentitySchema = z.object({
  name: z.string().min(1, 'Project name is required'),
  ticker: z.string().min(1, 'Ticker is required').transform(val => val.toUpperCase()),
  chain: z.string().optional(),
  contract_address: z.string().optional(),
  tge_date: z.string().optional(),
  category: z.string().optional(),
  notes: z.string().optional(),
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
export const allocationSegmentSchema = z.object({
  id: z.string().optional(), // For tracking in UI
  segment_type: z.string().min(1, 'Segment type is required'),
  label: z.string().min(1, 'Label is required'),
  percentage: z.string().min(1, 'Percentage is required'),
  token_amount: z.string().optional(), // Calculated field
  wallet_address: z.string().optional(),
})

export const allocationsSchema = z.object({
  segments: z.array(allocationSegmentSchema).min(1, 'At least one allocation segment is required'),
})

export type AllocationSegment = z.infer<typeof allocationSegmentSchema>
export type AllocationsFormData = z.infer<typeof allocationsSchema>

// Segment type options
export const SEGMENT_TYPE_OPTIONS = [
  { value: 'team', label: 'Team' },
  { value: 'investors', label: 'Investors' },
  { value: 'treasury', label: 'Treasury' },
  { value: 'liquidity', label: 'Liquidity' },
  { value: 'community', label: 'Community' },
  { value: 'ecosystem', label: 'Ecosystem' },
  { value: 'rewards', label: 'Rewards' },
  { value: 'advisors', label: 'Advisors' },
  { value: 'public_sale', label: 'Public Sale' },
  { value: 'private_sale', label: 'Private Sale' },
  { value: 'other', label: 'Other' },
]

// Step 4: Vesting Schedules
export const vestingScheduleSchema = z.object({
  allocation_id: z.string().optional(),
  cliff_months: z.string().optional(),
  duration_months: z.string().optional(),
  frequency: z.string().optional(),
  hatch_percentage: z.string().optional(),
  start_date: z.string().optional(),
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
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'custom', label: 'Custom' },
]

// Segment types that typically have immediate vesting
export const IMMEDIATE_SEGMENT_TYPES = ['liquidity', 'community', 'public_sale']

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

// Category options
export const CATEGORY_OPTIONS = [
  { value: 'infrastructure', label: 'Infrastructure' },
  { value: 'defi', label: 'DeFi' },
  { value: 'gaming', label: 'Gaming' },
  { value: 'social', label: 'Social' },
  { value: 'ai', label: 'AI' },
  { value: 'depin', label: 'DePIN' },
  { value: 'l1', label: 'Layer 1' },
  { value: 'l2', label: 'Layer 2' },
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
