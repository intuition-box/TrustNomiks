'use client'

import { useMemo, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { Wallet } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Banner, type BannerKind } from '@/components/composite/banner'
import {
  dismissAnnouncement,
  getDismissedSnapshot,
  getServerDismissedSnapshot,
  parseDismissed,
  subscribeToDismissals,
} from '@/lib/insights/dismissals'
import type { Role } from '@/components/role-context'

interface Announcement {
  id: string
  kind: BannerKind
  title: string
  body: string | null
  href: string | null
  audience: 'all' | 'contributors' | 'viewers'
  priority: number
  dismissible: boolean
}

async function fetchAnnouncements(): Promise<Announcement[]> {
  const { data, error } = await createClient()
    .from('announcements')
    .select('id, kind, title, body, href, audience, priority, dismissible')
    .order('priority', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(10)
  if (error) throw error
  return data ?? []
}

/**
 * The shell's banner slot: the highest-priority active announcement for this
 * audience (minus what this browser already dismissed), plus the read-only
 * strip for viewers. RLS already filters to the active time window.
 */
export function ShellBanners({ role }: { role: Role }) {
  const { data: announcements } = useQuery({
    queryKey: ['announcements'],
    queryFn: fetchAnnouncements,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: true,
  })

  const dismissedRaw = useSyncExternalStore(
    subscribeToDismissals,
    getDismissedSnapshot,
    getServerDismissedSnapshot,
  )
  const dismissed = useMemo(() => parseDismissed(dismissedRaw), [dismissedRaw])

  const top = useMemo(() => {
    if (!announcements) return null
    const audience = role === 'viewer' ? 'viewers' : 'contributors'
    return (
      announcements.find(
        (a) =>
          (a.audience === 'all' || a.audience === audience) &&
          !dismissed.has(a.id),
      ) ?? null
    )
  }, [announcements, role, dismissed])

  return (
    <>
      {top && (
        <Banner
          kind={top.kind}
          title={top.title}
          body={top.body}
          href={top.href}
          onDismiss={
            top.dismissible ? () => dismissAnnouncement(top.id) : undefined
          }
        />
      )}
      {role === 'viewer' && (
        <Banner
          kind="info"
          icon={Wallet}
          title="You are exploring in read-only mode."
          body="Link a wallet to contribute."
          action={
            <Button variant="brand" size="sm" asChild>
              <Link href="/profile?linkWallet=1">Become a contributor</Link>
            </Button>
          }
        />
      )}
    </>
  )
}
