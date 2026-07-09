import {
  Home,
  Coins,
  ChartArea,
  PlusCircle,
  UploadCloud,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
}

export interface NavZone {
  label: string
  items: NavItem[]
}

/**
 * The mode-aware rail: one shell serves both journeys (docs/redesign/04).
 * Explore = read the graph; Contribute = grow it. Profile lives in the
 * top-bar user menu, not the rail.
 */
export const NAV_ZONES: NavZone[] = [
  {
    label: 'Explore',
    items: [
      { href: '/dashboard', label: 'Home', icon: Home },
      { href: '/tokens', label: 'Tokens', icon: Coins },
      { href: '/data-room', label: 'Data Room', icon: ChartArea },
    ],
  },
  {
    label: 'Contribute',
    items: [
      { href: '/tokens/new', label: 'Add token', icon: PlusCircle },
      { href: '/export', label: 'Publish & Export', icon: UploadCloud },
    ],
  },
]

const ALL_HREFS = NAV_ZONES.flatMap((zone) =>
  zone.items.map((item) => item.href),
)

/**
 * Longest-prefix active matching so `/tokens/new` lights "Add token",
 * not "Tokens", while `/tokens/abc123` still lights "Tokens".
 */
export function isNavItemActive(pathname: string, href: string): boolean {
  const matches = (candidate: string) =>
    pathname === candidate || pathname.startsWith(candidate + '/')
  if (!matches(href)) return false
  const bestMatch = ALL_HREFS.filter(matches).sort(
    (a, b) => b.length - a.length,
  )[0]
  return bestMatch === href
}
