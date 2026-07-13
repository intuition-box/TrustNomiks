import type { ReactNode } from 'react'

/**
 * Renders its children only on paper — but keeps them mounted and *measurable*
 * on screen, which is the whole point.
 *
 * The obvious `hidden print:block` does not work here. recharts sizes itself
 * from its container: inside `display: none` it measures 0×0 and paints
 * nothing, and it only re-renders once a ResizeObserver fires. Under
 * `window.print()` the paint is already frozen by then, so the printed chart
 * comes out blank — while a headless `page.pdf()`, which re-renders more
 * leniently, shows it just fine. That gap is exactly how this ships broken.
 *
 * So the child sits in the layout at full width the whole time, clipped to zero
 * height and transparent. It has therefore already measured and painted long
 * before the print dialog opens; printing only reveals it.
 */
export function PrintOnly({ children }: { children: ReactNode }) {
  return (
    <div
      className="relative h-0 overflow-hidden print:h-auto print:overflow-visible"
      aria-hidden
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 opacity-0 print:static print:opacity-100">
        {children}
      </div>
    </div>
  )
}
