'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageHeader } from '@/components/composite/page-header'
import { StatTile } from '@/components/composite/stat-tile'
import { EmptyState } from '@/components/composite/empty-state'
import { ErrorState } from '@/components/composite/error-state'
import { GraphLoader } from '@/components/patterns/graph-loader'
import { LiveGraph, type LiveGraphData } from '@/components/brand/live-graph'
import { cn } from '@/lib/utils'
import { CheckCircle2, Coins, Hexagon, Loader2, Percent } from 'lucide-react'
import { toast } from 'sonner'
import type { User } from '@supabase/supabase-js'
import { AccountActivityCard } from '@/components/intuition/account-activity-card'

type ProfileToken = {
  id: string
  name: string
  ticker: string
  completeness: number
  created_by: string
}

interface ProfileRow {
  user_id: string
  display_name: string | null
  role: string | null
  organization: string | null
}

// Contribution tiers: same thresholds as before, re-cut in the product's own
// vocabulary. The glyph is a filling node (non-color cue = fill level).
const TIERS = [
  { label: 'Observer', min: 0, max: 2 },
  { label: 'Contributor', min: 3, max: 9 },
  { label: 'Curator', min: 10, max: 24 },
  { label: 'Cartographer', min: 25, max: 49 },
  { label: 'Architect', min: 50, max: Infinity },
]

function getTierIndex(count: number) {
  const idx = TIERS.findIndex((t) => count >= t.min && count <= t.max)
  return idx >= 0 ? idx : 0
}

/** A node filling up: ○ → ◔ → ◑ → ◕ → ● in the primary color. */
function TierGlyph({
  level,
  size = 14,
  className,
}: {
  level: number
  size?: number
  className?: string
}) {
  const fraction = level / (TIERS.length - 1)
  const r = size * 0.36
  const c = size / 2
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden
      className={cn('shrink-0 text-primary', className)}
    >
      <circle
        cx={c}
        cy={c}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={size * 0.12}
      />
      {fraction > 0 && (
        <path d={pieSlice(c, c, r * 0.82, fraction)} fill="currentColor" />
      )}
    </svg>
  )
}

function pieSlice(cx: number, cy: number, r: number, fraction: number): string {
  if (fraction >= 1) {
    return `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${r * 2} 0 a ${r} ${r} 0 1 0 ${-r * 2} 0`
  }
  const angle = fraction * Math.PI * 2 - Math.PI / 2
  const x = cx + r * Math.cos(angle)
  const y = cy + r * Math.sin(angle)
  const largeArc = fraction > 0.5 ? 1 : 0
  return `M ${cx} ${cy} L ${cx} ${cy - r} A ${r} ${r} 0 ${largeArc} 1 ${x} ${y} Z`
}

export default function ProfilePage() {
  const [tokens, setTokens] = useState<ProfileToken[]>([])
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [profiles, setProfiles] = useState<Map<string, ProfileRow>>(new Map())
  const [loading, setLoading] = useState(true)
  const [fetchFailed, setFetchFailed] = useState(false)

  // Identity form
  const [displayName, setDisplayName] = useState('')
  const [role, setRole] = useState('')
  const [organization, setOrganization] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileDirty, setProfileDirty] = useState(false)

  const supabase = createClient()

  const fetchData = async () => {
    setLoading(true)
    setFetchFailed(false)
    try {
      const [tokensResult, userResult, profilesResult] = await Promise.all([
        supabase
          .from('tokens')
          .select('id, name, ticker, completeness, created_by')
          .order('created_at', { ascending: false }),
        supabase.auth.getUser(),
        // Leaderboard names; RLS may narrow this to the own row, we degrade gracefully.
        supabase
          .from('profiles')
          .select('user_id, display_name, role, organization'),
      ])
      if (tokensResult.error) throw tokensResult.error
      setTokens(tokensResult.data || [])
      setCurrentUser(userResult.data.user)

      const map = new Map<string, ProfileRow>()
      for (const row of profilesResult.data ?? []) map.set(row.user_id, row)
      setProfiles(map)

      const own = userResult.data.user
        ? map.get(userResult.data.user.id)
        : undefined
      setDisplayName(own?.display_name ?? '')
      setRole(own?.role ?? '')
      setOrganization(own?.organization ?? '')
    } catch (error) {
      console.error('Error fetching profile data:', error)
      setFetchFailed(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const saveProfile = async () => {
    if (!currentUser) return
    setSavingProfile(true)
    try {
      const { error } = await supabase.from('profiles').upsert(
        {
          user_id: currentUser.id,
          display_name:
            displayName.trim() ||
            currentUser.email?.split('@')[0] ||
            'Contributor',
          role: role.trim() || null,
          organization: organization.trim() || null,
        },
        { onConflict: 'user_id' },
      )
      if (error) throw error
      setProfileDirty(false)
      toast.success('Profile saved')
    } catch (error) {
      console.error('Error saving profile:', error)
      toast.error('Profile could not be saved. Retry in a moment.')
    } finally {
      setSavingProfile(false)
    }
  }

  // — User contribution
  const userTokens = useMemo(
    () =>
      currentUser ? tokens.filter((t) => t.created_by === currentUser.id) : [],
    [tokens, currentUser],
  )
  const userAvgCompleteness =
    userTokens.length > 0
      ? Math.round(
          userTokens.reduce((sum, t) => sum + (t.completeness || 0), 0) /
            userTokens.length,
        )
      : 0
  const sharePercent =
    tokens.length > 0
      ? Math.round((userTokens.length / tokens.length) * 100)
      : 0
  const tierIndex = getTierIndex(userTokens.length)
  const tier = TIERS[tierIndex]
  const nextTier = tierIndex < TIERS.length - 1 ? TIERS[tierIndex + 1] : null

  // — Constellation: the user's own tokens as a local graph
  const constellation: LiveGraphData = useMemo(() => {
    const label = displayName || currentUser?.email?.split('@')[0] || 'You'
    const nodes: LiveGraphData['nodes'] = [
      { id: 'hub', type: 'wallet', label, size: 8 },
    ]
    const links: LiveGraphData['links'] = []
    userTokens.slice(0, 24).forEach((t) => {
      nodes.push({
        id: t.id,
        type: 'token',
        label: t.ticker,
        size: 4 + (t.completeness || 0) / 40,
      })
      links.push({ source: 'hub', target: t.id })
    })
    return { nodes, links }
  }, [userTokens, displayName, currentUser])

  // — Leaderboard
  const leaderboard = useMemo(() => {
    const map = new Map<string, { count: number; totalCompleteness: number }>()
    for (const t of tokens) {
      if (!t.created_by) continue
      const entry = map.get(t.created_by) ?? { count: 0, totalCompleteness: 0 }
      entry.count++
      entry.totalCompleteness += t.completeness || 0
      map.set(t.created_by, entry)
    }
    return Array.from(map.entries())
      .map(([userId, data]) => ({
        userId,
        count: data.count,
        avgCompleteness: Math.round(data.totalCompleteness / data.count),
        isCurrentUser: userId === currentUser?.id,
      }))
      .sort(
        (a, b) => b.count - a.count || b.avgCompleteness - a.avgCompleteness,
      )
  }, [tokens, currentUser])
  const maxCount = leaderboard[0]?.count ?? 1

  const contributorName = (
    userId: string,
    index: number,
    isCurrentUser: boolean,
  ) => {
    const profile = profiles.get(userId)
    if (profile?.display_name) return profile.display_name
    if (isCurrentUser) return currentUser?.email ?? 'You'
    return `Contributor #${index + 1}`
  }

  if (loading) {
    return (
      <GraphLoader
        className="mx-auto mt-24"
        label="Loading your constellation…"
      />
    )
  }

  if (fetchFailed) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Profile"
          description="Your identity and your constellation in the graph."
        />
        <ErrorState
          title="Your profile did not load"
          message="The contribution data could not be fetched. Your data is safe."
          onRetry={fetchData}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Profile"
        description="Your identity and your constellation in the graph."
      />

      {/* Stats rail */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          label="Tokens added"
          value={userTokens.length}
          hint={`${tier.label}, tier ${tierIndex + 1} of ${TIERS.length}`}
          icon={Coins}
          accentVar="--data-token"
        />
        <StatTile
          label="Share of the registry"
          value={`${sharePercent}%`}
          hint={`${tokens.length} tokens in total`}
          icon={Percent}
          accentVar="--data-hub"
          progress={sharePercent}
        />
        <StatTile
          label="Avg completeness"
          value={`${userAvgCompleteness}%`}
          hint="across your tokens"
          icon={Hexagon}
          accentVar="--primary"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Identity, finally editable */}
        <section className="space-y-4 rounded-xl border bg-surface-1 p-5">
          <div>
            <h2 className="text-sm font-semibold">Identity</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              How you appear to other contributors.
            </p>
          </div>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="display_name">Display name</Label>
              <Input
                id="display_name"
                value={displayName}
                placeholder="e.g. Ada"
                onChange={(e) => {
                  setDisplayName(e.target.value)
                  setProfileDirty(true)
                }}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="role">Role</Label>
                <Input
                  id="role"
                  value={role}
                  placeholder="e.g. analyst"
                  onChange={(e) => {
                    setRole(e.target.value)
                    setProfileDirty(true)
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="organization">Organization</Label>
                <Input
                  id="organization"
                  value={organization}
                  placeholder="e.g. Orijins"
                  onChange={(e) => {
                    setOrganization(e.target.value)
                    setProfileDirty(true)
                  }}
                />
              </div>
            </div>
            <p className="text-xs text-faint-foreground">
              Signed in as {currentUser?.email}
            </p>
            <Button
              size="sm"
              onClick={saveProfile}
              disabled={!profileDirty || savingProfile}
            >
              {savingProfile ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <CheckCircle2 className="h-4 w-4" aria-hidden />
              )}
              Save profile
            </Button>
          </div>

          {/* Tier ladder, in the product's own glyphs */}
          <div className="space-y-2 border-t pt-4">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-faint-foreground">
              Contribution tier
            </p>
            <ul className="space-y-1">
              {TIERS.map((t, i) => (
                <li
                  key={t.label}
                  className={cn(
                    'flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm',
                    i === tierIndex
                      ? 'bg-surface-2 font-medium text-foreground'
                      : i < tierIndex
                        ? 'text-muted-foreground'
                        : 'text-faint-foreground',
                  )}
                  aria-current={i === tierIndex ? 'true' : undefined}
                >
                  <TierGlyph
                    level={i}
                    className={cn(i > tierIndex && 'opacity-40')}
                  />
                  <span className="flex-1">{t.label}</span>
                  <span className="tabular text-xs">
                    {t.max === Infinity ? `${t.min}+` : `${t.min}-${t.max}`}{' '}
                    tokens
                  </span>
                </li>
              ))}
            </ul>
            {nextTier && userTokens.length > 0 && (
              <p className="tabular text-xs text-muted-foreground">
                {nextTier.min - userTokens.length} more token
                {nextTier.min - userTokens.length === 1 ? '' : 's'} to reach{' '}
                {nextTier.label}.
              </p>
            )}
          </div>
        </section>

        {/* Your constellation */}
        <section className="flex flex-col overflow-hidden rounded-xl border bg-surface-1">
          <div className="border-b px-5 py-4">
            <h2 className="text-sm font-semibold">Your constellation</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Every token you structured, orbiting you. Node size follows
              completeness.
            </p>
          </div>
          {userTokens.length === 0 ? (
            <EmptyState
              className="m-4 flex-1 border-0"
              title="No tokens yet"
              description="Structure your first token and it appears here, orbiting your node."
              actions={
                <Button
                  variant="brand"
                  size="sm"
                  onClick={() => (window.location.href = '/tokens/new')}
                >
                  Add your first token
                </Button>
              }
            />
          ) : (
            <div className="min-h-[300px] flex-1">
              <LiveGraph mode="local" data={constellation} />
            </div>
          )}
        </section>
      </div>

      {/* Leaderboard */}
      <section className="overflow-hidden rounded-xl border bg-surface-1">
        <div className="border-b px-5 py-4">
          <h2 className="text-sm font-semibold">Leaderboard</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Contributors ranked by structured tokens, then completeness.
          </p>
        </div>
        {leaderboard.length === 0 ? (
          <EmptyState
            className="m-4 border-0"
            title="No contributions yet"
            description="The first structured token starts the ranking."
          />
        ) : (
          <ul className="divide-y">
            {leaderboard.map((entry, index) => {
              const barWidth = Math.round((entry.count / maxCount) * 100)
              return (
                <li
                  key={entry.userId}
                  className={cn(
                    'flex items-center gap-3 px-5 py-3',
                    entry.isCurrentUser && 'bg-primary/5',
                  )}
                >
                  <span
                    className={cn(
                      'tabular w-8 shrink-0 text-center font-mono text-xs',
                      index < 3
                        ? 'font-semibold text-foreground'
                        : 'text-muted-foreground',
                    )}
                  >
                    #{index + 1}
                  </span>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-sm font-medium">
                        {contributorName(
                          entry.userId,
                          index,
                          entry.isCurrentUser,
                        )}
                      </p>
                      {entry.isCurrentUser && (
                        <span className="shrink-0 rounded-full border border-primary/30 bg-primary/10 px-1.5 py-px text-[10px] font-semibold text-primary">
                          you
                        </span>
                      )}
                    </div>
                    <div className="h-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all duration-500',
                          entry.isCurrentUser
                            ? 'bg-primary'
                            : 'bg-muted-foreground/30',
                        )}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="tabular text-sm font-semibold">
                      {entry.count}{' '}
                      <span className="text-xs font-normal text-muted-foreground">
                        token{entry.count === 1 ? '' : 's'}
                      </span>
                    </p>
                    <p className="tabular text-[10px] text-muted-foreground">
                      {entry.avgCompleteness}% avg
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* On-chain activity (has its own wallet boundary) */}
      <AccountActivityCard limit={10} createdLimit={5} />
    </div>
  )
}
