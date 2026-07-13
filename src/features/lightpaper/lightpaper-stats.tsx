'use client'

import { Banknote, CalendarClock, Coins } from 'lucide-react'
import { StatTile } from '@/components/composite/stat-tile'
import { formatUsd } from '@/lib/tokenomics'
import { formatCompactNumber } from '@/lib/utils/vesting-timeline'

interface LightpaperStatsProps {
  ticker: string
  maxSupply: number
  finalCirculating: number
  finalCirculatingPctOfMax: number | null
  horizonMonths: number
  totalRaisedUsd: number
  roundsCount: number
}

/**
 * Headline facts of a shared design. Client island: StatTile takes icon
 * COMPONENTS, which cannot cross the server/client boundary as props.
 */
export function LightpaperStats({
  ticker,
  maxSupply,
  finalCirculating,
  finalCirculatingPctOfMax,
  horizonMonths,
  totalRaisedUsd,
  roundsCount,
}: LightpaperStatsProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <StatTile
        label="Max supply"
        icon={Coins}
        value={
          <span className="tabular">{formatCompactNumber(maxSupply)}</span>
        }
        hint={`${ticker} hard cap`}
      />
      <StatTile
        label="Circulating at horizon"
        icon={CalendarClock}
        value={
          <span className="tabular">
            {finalCirculatingPctOfMax !== null
              ? `${finalCirculatingPctOfMax.toFixed(0)}%`
              : formatCompactNumber(finalCirculating)}
          </span>
        }
        hint={`of max supply after ${horizonMonths} months`}
      />
      <StatTile
        label="Raised"
        icon={Banknote}
        accentVar="--data-wallet"
        value={
          totalRaisedUsd > 0 ? (
            <span className="tabular">${formatUsd(totalRaisedUsd)}</span>
          ) : (
            'Not disclosed'
          )
        }
        hint={
          roundsCount > 0
            ? `across ${roundsCount} round${roundsCount > 1 ? 's' : ''}`
            : 'no funding rounds shared'
        }
      />
    </div>
  )
}
