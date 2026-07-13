import { notFound } from 'next/navigation'
import { ChartsLab } from './charts-lab'

/**
 * TEMPORARY (dither-kit pilot) — side-by-side of the recharts donut and its
 * dither-kit twin, so we can judge the dithered canvas in dark, in light, and
 * on paper before adopting it anywhere real. Static sample data.
 *
 * Dev-only: 404s in production, and src/proxy.ts only opens /labs outside
 * production. Delete this route, the proxy exception, and
 * allocation-donut-chart-dither.tsx together once the call is made.
 */
export default function ChartsLabPage() {
  if (process.env.NODE_ENV === 'production') notFound()
  return <ChartsLab />
}
