'use client'

import { useEffect } from 'react'
import { toast } from 'sonner'

const TIER_WATERMARK_KEY = 'trustnomiks:tier-watermark'
const SESSION_MOMENT_KEY = 'trustnomiks:moment-shown'

/**
 * The tier-up moment: one celebratory toast when the contribution tier rises
 * above this browser's watermark. At most one moment per session; the first
 * ever visit just records the watermark silently (no fake celebration).
 */
export function useTierMoment(
  tierIndex: number,
  tierLabel: string,
  ready: boolean,
) {
  useEffect(() => {
    if (!ready) return
    const raw = localStorage.getItem(TIER_WATERMARK_KEY)
    if (raw === null) {
      localStorage.setItem(TIER_WATERMARK_KEY, String(tierIndex))
      return
    }
    const prev = Number.parseInt(raw, 10)
    if (Number.isNaN(prev)) {
      localStorage.setItem(TIER_WATERMARK_KEY, String(tierIndex))
      return
    }
    if (tierIndex > prev && !sessionStorage.getItem(SESSION_MOMENT_KEY)) {
      toast.success(`Tier up: you are now ${tierLabel}`, {
        description: 'The ladder keeps climbing. See where you stand.',
      })
      sessionStorage.setItem(SESSION_MOMENT_KEY, '1')
    }
    if (tierIndex !== prev) {
      localStorage.setItem(TIER_WATERMARK_KEY, String(tierIndex))
    }
  }, [tierIndex, tierLabel, ready])
}
