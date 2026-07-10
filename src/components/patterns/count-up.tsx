'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Animated 0 → target count (ease-out cubic). Instant under
 * prefers-reduced-motion. Extracted from the landing's north-star counter so
 * every numeric "arrival" ticks the same way.
 */
export function useCountUp(target: number, duration = 1200): number {
  const [value, setValue] = useState(0)
  const raf = useRef<number>(0)
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const dur = reduce ? 0 : duration
    const start = performance.now()
    const tick = (now: number) => {
      const t = dur === 0 ? 1 : Math.min(1, (now - start) / dur)
      const eased = 1 - Math.pow(1 - t, 3)
      setValue(Math.round(target * eased))
      if (t < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [target, duration])
  return value
}

interface CountUpProps {
  value: number
  duration?: number
  className?: string
}

/** `<CountUp value={18} />` — the tabular class stays the caller's job. */
export function CountUp({ value, duration = 1200, className }: CountUpProps) {
  const display = useCountUp(value, duration)
  return <span className={className}>{display}</span>
}
