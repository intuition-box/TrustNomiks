export interface Token {
  id: string
  name: string
  ticker: string
  chain: string | null
  contract_address: string | null
  tge_date: string | null
  category: string | null
  sector: string | null
  status: TokenStatus
  completeness: number
  cluster_scores: { identity: number; supply: number; allocation: number; vesting: number } | null
  notes: string | null
  created_at: string
  updated_at: string
  created_by: string
}

export type TokenStatus = 'draft' | 'in_review' | 'validated'

export interface TokenStats {
  total: number
  validated: number
  in_review: number
  draft: number
}

export interface TokenFilters {
  search: string
  status: TokenStatus | 'all'
}

export type SortField = 'name' | 'chain' | 'completeness' | 'status' | 'created_at'
export type SortDirection = 'asc' | 'desc'
