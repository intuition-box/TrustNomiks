'use client'

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/composite/page-header'
import { EmptyState } from '@/components/composite/empty-state'
import { ErrorState } from '@/components/composite/error-state'
import { UserMark } from '@/components/composite/user-mark'
import { TokenFace } from '@/components/composite/token-face'
import { GraphLoader } from '@/components/patterns/graph-loader'
import { cn } from '@/lib/utils'
import { CheckCircle2, Eye, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { AccountActivityCard } from '@/components/intuition/account-activity-card'
import { WalletLinksCard } from '@/features/wallet-linking/wallet-links-card'
import { useRole } from '@/hooks/use-role'
import { useContributionData } from '@/hooks/use-contribution-data'

export default function ProfilePage() {
  return (
    <Suspense
      fallback={
        <GraphLoader
          className="mx-auto mt-24"
          label="Loading your constellation…"
        />
      }
    >
      <ProfileContent />
    </Suspense>
  )
}

function ProfileContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const linkWalletParam = searchParams.get('linkWallet') === '1'
  const [highlightWalletCard, setHighlightWalletCard] = useState(false)
  const { tokens, currentUser, profiles, loading, fetchFailed, refetch } =
    useContributionData()

  // Identity form
  const [displayName, setDisplayName] = useState('')
  const [organization, setOrganization] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileDirty, setProfileDirty] = useState(false)
  const seededIdentity = useRef(false)

  const supabase = createClient()
  const { isViewer, isContributor } = useRole()

  // Seed the identity form from the shared hook's profiles map, once, the
  // first time data lands, so it never clobbers in-progress edits on refetch.
  useEffect(() => {
    if (loading || seededIdentity.current) return
    const own = currentUser ? profiles.get(currentUser.id) : undefined
    setDisplayName(own?.display_name ?? '')
    setOrganization(own?.organization ?? '')
    seededIdentity.current = true
  }, [loading, currentUser, profiles])

  // The "become a contributor" CTAs land here with ?linkWallet=1: once the
  // page has loaded, scroll the wallet-linking card into view and highlight
  // it briefly so the viewer isn't left guessing where to go.
  useEffect(() => {
    if (loading || !linkWalletParam) return
    setHighlightWalletCard(true)
    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches
    document.getElementById('wallet-links-card')?.scrollIntoView({
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
      block: 'center',
    })
    const timer = window.setTimeout(() => setHighlightWalletCard(false), 4000)
    return () => window.clearTimeout(timer)
  }, [loading, linkWalletParam])

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
          onRetry={refetch}
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

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Identity, finally editable */}
        <section className="space-y-4 rounded-xl border bg-surface-1 p-5">
          <div className="flex items-center gap-3">
            {currentUser && <UserMark seed={currentUser.id} size={40} />}
            <div>
              <h2 className="text-sm font-semibold">Identity</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                How you appear to other contributors. The mark is your
                constellation, unique to your account.
              </p>
            </div>
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
                <Label>Role</Label>
                <div>
                  <Badge
                    variant="outline"
                    className="gap-1.5 py-1 text-xs font-medium"
                  >
                    {isContributor ? (
                      <>
                        <CheckCircle2 className="h-3 w-3" aria-hidden />
                        Contributor
                      </>
                    ) : (
                      <>
                        <Eye className="h-3 w-3" aria-hidden />
                        Viewer
                      </>
                    )}
                  </Badge>
                </div>
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
        </section>

        {/* Your tokens: the contribution, face first */}
        <section className="flex flex-col overflow-hidden rounded-xl border bg-surface-1">
          <div className="flex items-center justify-between gap-2 border-b px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold">Your tokens</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Everything you structured in the graph.
              </p>
            </div>
            {userTokens.length > 0 && (
              <span className="tabular shrink-0 text-xs text-muted-foreground">
                {userTokens.length} token{userTokens.length === 1 ? '' : 's'}
              </span>
            )}
          </div>
          {userTokens.length === 0 ? (
            isViewer ? (
              <EmptyState
                className="m-4 flex-1 border-0"
                title="No tokens yet"
                description="Link a wallet to start contributing tokens. Each one you structure appears here."
                actions={
                  <Button variant="brand" size="sm" asChild>
                    <Link href="/profile?linkWallet=1">Link a wallet</Link>
                  </Button>
                }
              />
            ) : (
              <EmptyState
                className="m-4 flex-1 border-0"
                title="No tokens yet"
                description="Structure your first token and it appears here."
                actions={
                  <Button
                    variant="brand"
                    size="sm"
                    onClick={() => router.push('/tokens/new')}
                  >
                    Add your first token
                  </Button>
                }
              />
            )
          ) : (
            <ul className="max-h-[320px] flex-1 divide-y overflow-y-auto">
              {userTokens.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/tokens/${t.id}`}
                    className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-surface-2"
                  >
                    <TokenFace
                      name={t.name}
                      ticker={t.ticker}
                      imageUrl={t.coingecko_image}
                      size={24}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {t.name}{' '}
                      <span className="font-mono text-xs font-normal text-muted-foreground">
                        {t.ticker}
                      </span>
                    </span>
                    <span className="hidden w-24 shrink-0 items-center gap-2 sm:flex">
                      <span className="h-1 flex-1 overflow-hidden rounded-full bg-surface-2">
                        <span
                          className="block h-full rounded-full bg-gradient-brand"
                          style={{ width: `${t.completeness ?? 0}%` }}
                        />
                      </span>
                      <span className="tabular text-xs text-muted-foreground">
                        {t.completeness ?? 0}%
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* On-chain activity (has its own wallet boundary) */}
      <AccountActivityCard limit={10} createdLimit={5} />

      {/* Linked wallets (milestone J1d) */}
      <div
        id="wallet-links-card"
        onClick={() => setHighlightWalletCard(false)}
        className={cn(
          'scroll-mt-20 rounded-xl transition-shadow duration-300',
          highlightWalletCard &&
            'ring-2 ring-primary ring-offset-2 ring-offset-background',
        )}
      >
        <WalletLinksCard />
      </div>
    </div>
  )
}
