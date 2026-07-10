import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export const alt = 'TrustNomiks: The Tokenomics Intelligence Graph'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Decorative constellation: taxonomy-colored atoms around the hub.
// Literal hexes on purpose: ImageResponse renders outside the CSS token scope.
const ATOMS: Array<{ x: number; y: number; r: number; c: string }> = [
  { x: 150, y: 120, r: 7, c: '#8b5cf6' }, // token violet
  { x: 320, y: 70, r: 5, c: '#f59e0b' }, // allocation amber
  { x: 90, y: 320, r: 6, c: '#10b981' }, // vesting emerald
  { x: 230, y: 480, r: 5, c: '#3b82f6' }, // source blue
  { x: 1040, y: 130, r: 6, c: '#8b5cf6' },
  { x: 1120, y: 330, r: 5, c: '#f59e0b' },
  { x: 950, y: 520, r: 7, c: '#0ea5e9' }, // chain sky
  { x: 1080, y: 500, r: 4, c: '#ef4444' }, // emission red
  { x: 420, y: 550, r: 5, c: '#10b981' },
  { x: 780, y: 80, r: 5, c: '#3b82f6' },
]

const EDGES: Array<[number, number]> = [
  [0, 1],
  [0, 2],
  [2, 3],
  [4, 5],
  [5, 6],
  [6, 7],
  [3, 8],
  [1, 9],
]

export default async function Image() {
  const [geist, geistSemiBold] = await Promise.all([
    readFile(join(process.cwd(), 'src/assets/fonts/Geist-Regular.ttf')),
    readFile(join(process.cwd(), 'src/assets/fonts/Geist-SemiBold.ttf')),
  ])

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#09090b',
        fontFamily: 'Geist',
        position: 'relative',
      }}
    >
      <svg
        width="1200"
        height="630"
        viewBox="0 0 1200 630"
        style={{ position: 'absolute', top: 0, left: 0 }}
      >
        {EDGES.map(([a, b], i) => (
          <line
            key={`e${i}`}
            x1={ATOMS[a].x}
            y1={ATOMS[a].y}
            x2={ATOMS[b].x}
            y2={ATOMS[b].y}
            stroke="#2e2e3a"
            strokeWidth="1.5"
          />
        ))}
        {ATOMS.map((n, i) => (
          <circle
            key={`n${i}`}
            cx={n.x}
            cy={n.y}
            r={n.r}
            fill={n.c}
            opacity="0.85"
          />
        ))}
      </svg>

      <div style={{ display: 'flex', alignItems: 'center', gap: 30 }}>
        <svg width="110" height="110" viewBox="0 0 32 32">
          <defs>
            <linearGradient
              id="g"
              x1="0"
              y1="32"
              x2="32"
              y2="0"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0" stopColor="#6366f1" />
              <stop offset="1" stopColor="#8b5cf6" />
            </linearGradient>
          </defs>
          <circle
            cx="10"
            cy="23.5"
            r="4.4"
            fill="none"
            stroke="url(#g)"
            strokeWidth="3.4"
          />
          <path
            d="M10 19.1 C10 13.4 14.6 10.4 20.4 10.4"
            fill="none"
            stroke="url(#g)"
            strokeWidth="3.4"
            strokeLinecap="round"
          />
          <circle
            cx="24"
            cy="10.4"
            r="3.6"
            fill="none"
            stroke="url(#g)"
            strokeWidth="3.2"
          />
        </svg>
        <div style={{ display: 'flex', fontSize: 92, fontWeight: 600 }}>
          <span style={{ color: '#818cf8' }}>Trust</span>
          <span style={{ color: '#a78bfa' }}>Nomiks</span>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          marginTop: 26,
          fontSize: 32,
          fontWeight: 400,
          color: '#94a3b8',
        }}
      >
        The Tokenomics Intelligence Graph
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          marginTop: 46,
          fontSize: 22,
          color: '#64748b',
        }}
      >
        <span style={{ color: '#8b5cf6' }}>● Tokens</span>
        <span style={{ color: '#f59e0b' }}>● Allocations</span>
        <span style={{ color: '#10b981' }}>● Vesting</span>
        <span style={{ color: '#ef4444' }}>● Emission</span>
        <span style={{ color: '#3b82f6' }}>● Sources</span>
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: 'Geist', data: geist, style: 'normal', weight: 400 },
        { name: 'Geist', data: geistSemiBold, style: 'normal', weight: 600 },
      ],
    },
  )
}
