'use client'

import { useEffect, useRef } from 'react'

/** WAAPI needs a literal easing string; this mirrors --ease-out (globals.css). */
const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)'

interface RevealProps {
  children: React.ReactNode
  /** Position among animated siblings; drives the stagger delay. */
  index?: number
  /** 'load' plays at mount (hero intro); 'scroll' waits for first intersection. */
  on?: 'load' | 'scroll'
  className?: string
}

/**
 * One-shot entrance reveal (fade + rise) for expressive surfaces (landing).
 * - on="load": staggered intro at mount (700ms, 16px rise, 90ms per sibling).
 * - on="scroll": plays on first intersection (650ms, 22px rise, 100ms per
 *   sibling, threshold .12); elements already in the viewport at load are
 *   skipped so nothing visible ever blinks.
 * Content stays visible (no animation) under prefers-reduced-motion. Sits next
 * to StaggerReveal, which handles the in-task ingest stagger.
 */
export function Reveal({
  children,
  index = 0,
  on = 'scroll',
  className,
}: RevealProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const rise = on === 'load' ? 16 : 22
    const keyframes = [
      { opacity: 0, transform: `translateY(${rise}px)` },
      { opacity: 1, transform: 'translateY(0px)' },
    ]

    if (on === 'load') {
      const anim = el.animate(keyframes, {
        duration: 700,
        easing: EASE,
        delay: index * 90,
        fill: 'backwards',
      })
      return () => anim.cancel()
    }

    // Already visible at load → leave it alone.
    if (el.getBoundingClientRect().top < window.innerHeight * 0.85) return

    const anim = el.animate(keyframes, {
      duration: 650,
      easing: EASE,
      delay: index * 100,
      fill: 'both',
    })
    anim.pause()
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          anim.play()
          io.disconnect()
        }
      },
      { threshold: 0.12 },
    )
    io.observe(el)
    return () => {
      io.disconnect()
      anim.cancel()
    }
  }, [index, on])

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  )
}
