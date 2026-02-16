/**
 * Converts TrustNomiks token data to Intuition Triples format
 *
 * Triple format: { subject, predicate, object }
 * where object can be string | number | boolean | object
 */

export interface Triple {
  subject: string
  predicate: string
  object: string | number | boolean | object
}

interface TokenData {
  id: string
  name: string
  ticker: string
  chain?: string | null
  contract_address?: string | null
  tge_date?: string | null
  category?: string | null
  notes?: string | null
  status: string
  completeness_score: number
  created_at: string
  updated_at: string
}

interface SupplyMetrics {
  max_supply?: string | null
  initial_supply?: string | null
  tge_supply?: string | null
  circulating_supply?: string | null
  circulating_date?: string | null
  source_url?: string | null
  notes?: string | null
}

interface AllocationSegment {
  id: string
  segment_type: string
  label: string
  percentage: number
  token_amount?: string | null
  wallet_address?: string | null
}

interface VestingSchedule {
  id: string
  allocation_id: string
  cliff_months?: number | null
  duration_months?: number | null
  frequency?: string | null
  hatch_percentage?: number | null
  start_date?: string | null
  notes?: string | null
  allocation?: {
    label: string
    segment_type: string
  } | null
}

interface EmissionModel {
  type: string
  annual_inflation_rate?: string | number | null
  inflation_schedule?: Array<{ year: number; rate: number }> | null
  has_burn?: boolean | null
  burn_details?: string | null
  has_buyback?: boolean | null
  buyback_details?: string | null
  notes?: string | null
}

interface DataSource {
  id: string
  source_type: string
  document_name: string
  url: string
  version?: string | null
  verified_at?: string | null
}

interface RiskFlag {
  id: string
  flag_type: string
  severity: string
  is_flagged: boolean
  justification?: string | null
}

interface CompleteTokenData {
  token: TokenData
  supply?: SupplyMetrics
  allocations: AllocationSegment[]
  vesting: VestingSchedule[]
  emission?: EmissionModel
  sources: DataSource[]
  risk_flags: RiskFlag[]
}

/**
 * Main export function: converts complete token data to triples array
 */
export function convertTokenToTriples(data: CompleteTokenData): Triple[] {
  const triples: Triple[] = []
  const { token, supply, allocations, vesting, emission, sources, risk_flags } = data
  const ticker = token.ticker

  // ═══════════════════════════════════════════════════════════════════════
  // 1. TOKEN IDENTITY TRIPLES
  // ═══════════════════════════════════════════════════════════════════════

  triples.push({
    subject: ticker,
    predicate: 'has Name',
    object: token.name,
  })

  triples.push({
    subject: ticker,
    predicate: 'has Status',
    object: token.status,
  })

  triples.push({
    subject: ticker,
    predicate: 'has Completeness Score',
    object: token.completeness_score,
  })

  if (token.chain) {
    triples.push({
      subject: ticker,
      predicate: 'has Chain',
      object: token.chain,
    })
  }

  if (token.contract_address) {
    triples.push({
      subject: ticker,
      predicate: 'has Contract Address',
      object: token.contract_address,
    })
  }

  if (token.tge_date) {
    triples.push({
      subject: ticker,
      predicate: 'has TGE Date',
      object: token.tge_date,
    })
  }

  if (token.category) {
    triples.push({
      subject: ticker,
      predicate: 'has Category',
      object: token.category,
    })
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 2. SUPPLY METRICS TRIPLES
  // ═══════════════════════════════════════════════════════════════════════

  if (supply?.max_supply) {
    triples.push({
      subject: ticker,
      predicate: 'has Max Supply',
      object: supply.max_supply,
    })
  }

  if (supply?.initial_supply) {
    triples.push({
      subject: ticker,
      predicate: 'has Initial Supply',
      object: supply.initial_supply,
    })
  }

  if (supply?.tge_supply) {
    triples.push({
      subject: ticker,
      predicate: 'has TGE Supply',
      object: supply.tge_supply,
    })
  }

  if (supply?.circulating_supply) {
    triples.push({
      subject: ticker,
      predicate: 'has Circulating Supply',
      object: supply.circulating_supply,
    })

    if (supply.circulating_date) {
      triples.push({
        subject: ticker,
        predicate: 'has Circulating Supply Date',
        object: supply.circulating_date,
      })
    }
  }

  if (supply?.source_url) {
    triples.push({
      subject: ticker,
      predicate: 'has Supply Source URL',
      object: supply.source_url,
    })
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 3. ALLOCATION SEGMENTS TRIPLES
  // ═══════════════════════════════════════════════════════════════════════

  allocations.forEach((segment, index) => {
    // Use index suffix to avoid collisions when multiple allocations share the same segment_type
    const allocationId = `Allocation_${ticker}_${segment.segment_type}_${index + 1}`

    // Link token to allocation segment
    triples.push({
      subject: ticker,
      predicate: 'has Allocation Segment',
      object: allocationId,
    })

    // Allocation segment properties
    triples.push({
      subject: allocationId,
      predicate: 'segment Type',
      object: segment.segment_type,
    })

    triples.push({
      subject: allocationId,
      predicate: 'label',
      object: segment.label,
    })

    triples.push({
      subject: allocationId,
      predicate: 'percentage Of Max Supply',
      object: segment.percentage,
    })

    if (segment.token_amount) {
      triples.push({
        subject: allocationId,
        predicate: 'token Amount',
        object: segment.token_amount,
      })
    }

    if (segment.wallet_address) {
      triples.push({
        subject: allocationId,
        predicate: 'wallet Address',
        object: segment.wallet_address,
      })
    }
  })

  // ═══════════════════════════════════════════════════════════════════════
  // 4. VESTING SCHEDULES TRIPLES
  // ═══════════════════════════════════════════════════════════════════════

  vesting.forEach((schedule, vIndex) => {
    if (!schedule.allocation) return

    // Find matching allocation index for consistent ID referencing
    const allocIndex = allocations.findIndex((a) => a.id === schedule.allocation_id)
    const allocSuffix = allocIndex >= 0 ? allocIndex + 1 : vIndex + 1
    const allocationId = `Allocation_${ticker}_${schedule.allocation.segment_type}_${allocSuffix}`
    const vestingId = `Vesting_${ticker}_${schedule.allocation.segment_type}_${allocSuffix}`

    // Link allocation to vesting schedule
    triples.push({
      subject: allocationId,
      predicate: 'has Vesting Schedule',
      object: vestingId,
    })

    // Vesting schedule properties
    if (schedule.frequency) {
      triples.push({
        subject: vestingId,
        predicate: 'vesting Frequency',
        object: schedule.frequency,
      })
    }

    if (schedule.cliff_months !== null && schedule.cliff_months !== undefined) {
      triples.push({
        subject: vestingId,
        predicate: 'cliff Months',
        object: schedule.cliff_months,
      })
    }

    if (schedule.duration_months !== null && schedule.duration_months !== undefined) {
      triples.push({
        subject: vestingId,
        predicate: 'duration Months',
        object: schedule.duration_months,
      })
    }

    if (schedule.hatch_percentage !== null && schedule.hatch_percentage !== undefined) {
      triples.push({
        subject: vestingId,
        predicate: 'hatch Percentage',
        object: schedule.hatch_percentage,
      })
    }

    if (schedule.start_date) {
      triples.push({
        subject: vestingId,
        predicate: 'start Date',
        object: schedule.start_date,
      })
    }
  })

  // ═══════════════════════════════════════════════════════════════════════
  // 5. EMISSION MODEL TRIPLES
  // ═══════════════════════════════════════════════════════════════════════

  if (emission) {
    const emissionId = `EmissionModel_${ticker}`

    triples.push({
      subject: ticker,
      predicate: 'has Emission Model',
      object: emissionId,
    })

    triples.push({
      subject: emissionId,
      predicate: 'emission Type',
      object: emission.type,
    })

    if (emission.annual_inflation_rate) {
      triples.push({
        subject: emissionId,
        predicate: 'annual Inflation Rate',
        object: emission.annual_inflation_rate,
      })
    }

    if (emission.inflation_schedule && emission.inflation_schedule.length > 0) {
      triples.push({
        subject: emissionId,
        predicate: 'inflation Schedule',
        object: emission.inflation_schedule,
      })
    }

    if (emission.has_burn !== null && emission.has_burn !== undefined) {
      triples.push({
        subject: emissionId,
        predicate: 'has Burn Mechanism',
        object: emission.has_burn,
      })

      if (emission.has_burn && emission.burn_details) {
        triples.push({
          subject: emissionId,
          predicate: 'burn Details',
          object: emission.burn_details,
        })
      }
    }

    if (emission.has_buyback !== null && emission.has_buyback !== undefined) {
      triples.push({
        subject: emissionId,
        predicate: 'has Buyback Mechanism',
        object: emission.has_buyback,
      })

      if (emission.has_buyback && emission.buyback_details) {
        triples.push({
          subject: emissionId,
          predicate: 'buyback Details',
          object: emission.buyback_details,
        })
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 6. DATA SOURCES TRIPLES
  // ═══════════════════════════════════════════════════════════════════════

  sources.forEach((source, index) => {
    const sourceId = `DataSource_${ticker}_${source.source_type}_${index + 1}`

    triples.push({
      subject: ticker,
      predicate: 'has Data Source',
      object: sourceId,
    })

    triples.push({
      subject: sourceId,
      predicate: 'source Type',
      object: source.source_type,
    })

    triples.push({
      subject: sourceId,
      predicate: 'document Name',
      object: source.document_name,
    })

    triples.push({
      subject: sourceId,
      predicate: 'url',
      object: source.url,
    })

    if (source.version) {
      triples.push({
        subject: sourceId,
        predicate: 'version',
        object: source.version,
      })
    }

    if (source.verified_at) {
      triples.push({
        subject: sourceId,
        predicate: 'verified At',
        object: source.verified_at,
      })
    }
  })

  // ═══════════════════════════════════════════════════════════════════════
  // 7. RISK FLAGS TRIPLES
  // ═══════════════════════════════════════════════════════════════════════

  risk_flags.forEach((flag, fIndex) => {
    const flagId = `RiskFlag_${ticker}_${flag.flag_type}_${fIndex + 1}`

    triples.push({
      subject: ticker,
      predicate: 'has Risk Flag',
      object: flagId,
    })

    triples.push({
      subject: flagId,
      predicate: 'flag Type',
      object: flag.flag_type,
    })

    triples.push({
      subject: flagId,
      predicate: 'is Flagged',
      object: flag.is_flagged,
    })

    triples.push({
      subject: flagId,
      predicate: 'severity',
      object: flag.severity,
    })

    if (flag.justification) {
      triples.push({
        subject: flagId,
        predicate: 'justification',
        object: flag.justification,
      })
    }
  })

  return triples
}

/**
 * Converts multiple tokens to triples (for bulk export)
 */
export function convertMultipleTokensToTriples(tokensData: CompleteTokenData[]): Triple[] {
  return tokensData.flatMap((data) => convertTokenToTriples(data))
}

/**
 * Generates a downloadable JSON file from triples
 */
export function downloadTriplesAsJSON(triples: Triple[], filename: string = 'trustnomiks-export.json') {
  const json = JSON.stringify(triples, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  URL.revokeObjectURL(url)
}
