'use client'

import { useEffect, useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { formatEther, parseEther } from 'viem'

import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'

interface StakeSliderProps {
  valueWei: bigint
  onChange: (wei: bigint) => void
  /** network minimum deposit (floor) */
  minWei?: bigint
  /** wallet balance ceiling (optional) */
  maxWei?: bigint
  disabled?: boolean
  className?: string
}

/**
 * The one place `.glass` is used: a stake amount control combining a
 * shadcn Slider with a plain-tTRUST numeric Input. Wei (bigint) is the
 * source of truth; the Input is converted via formatEther/parseEther.
 *
 * Scale decision: the Slider works in JS numbers, so it can't move in raw
 * wei (18 decimals) without risking precision loss. It's driven in
 * "milli-tTRUST" units instead: 1 unit = 0.001 tTRUST = 1e15 wei. That
 * keeps every slider step exact for realistic stake sizes (0.001..N
 * tTRUST) and only converts to/from wei at the boundary.
 */
const WEI_PER_MILLI_TTRUST = BigInt(10) ** BigInt(15)
const DEFAULT_CEILING_WEI = parseEther('1')

export function StakeSlider({
  valueWei,
  onChange,
  minWei,
  maxWei,
  disabled,
  className,
}: StakeSliderProps) {
  const ceilingWei = maxWei ?? DEFAULT_CEILING_WEI
  const sliderMax = weiToMilli(ceilingWei)
  const sliderValue = clamp(weiToMilli(valueWei), 0, sliderMax)

  const [text, setText] = useState(() => formatEther(valueWei))

  // Reflect external changes to valueWei (e.g. the slider, or a parent
  // resetting the amount) without clobbering what the user is mid-typing.
  useEffect(() => {
    if (parseTTrust(text) !== valueWei) {
      setText(formatEther(valueWei))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueWei])

  const belowMin = minWei !== undefined && valueWei < minWei

  function handleSliderChange(values: number[]) {
    onChange(milliToWei(values[0] ?? 0))
  }

  function handleInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const next = event.target.value
    setText(next)
    onChange(parseTTrust(next))
  }

  return (
    <div className={cn('glass space-y-3 rounded-xl p-4', className)}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          Stake amount
        </span>
        <span className="tabular text-sm font-semibold text-foreground">
          {formatEther(valueWei)} tTRUST
        </span>
      </div>

      <Slider
        value={[sliderValue]}
        min={0}
        max={sliderMax}
        step={1}
        disabled={disabled}
        onValueChange={handleSliderChange}
        aria-label="Stake amount"
      />

      <div className="flex items-center gap-2">
        <Input
          type="text"
          inputMode="decimal"
          value={text}
          onChange={handleInputChange}
          disabled={disabled}
          aria-label="Stake amount in tTRUST"
          className="tabular"
        />
        <span className="text-sm text-muted-foreground">tTRUST</span>
      </div>

      {belowMin && (
        <p className="flex items-center gap-1 text-xs text-warning">
          <TriangleAlert className="h-3 w-3 shrink-0" aria-hidden />
          Below the network minimum
        </p>
      )}
    </div>
  )
}

/** Parses a tTRUST amount string defensively; empty/invalid/negative input is 0. */
function parseTTrust(raw: string): bigint {
  const trimmed = raw.trim()
  if (!trimmed) return BigInt(0)
  try {
    const parsed = parseEther(trimmed)
    return parsed < BigInt(0) ? BigInt(0) : parsed
  } catch {
    return BigInt(0)
  }
}

function weiToMilli(wei: bigint): number {
  const milli = wei / WEI_PER_MILLI_TTRUST
  if (milli < BigInt(0)) return 0
  return milli > BigInt(Number.MAX_SAFE_INTEGER)
    ? Number.MAX_SAFE_INTEGER
    : Number(milli)
}

function milliToWei(milli: number): bigint {
  const safe = Number.isFinite(milli) ? Math.max(0, Math.round(milli)) : 0
  return BigInt(safe) * WEI_PER_MILLI_TTRUST
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
