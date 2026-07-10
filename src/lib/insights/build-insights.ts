import {
  CLUSTER_LABELS,
  CLUSTER_MAX,
  type ClusterScores,
} from '@/lib/utils/completeness'
import { TARGET_TOKENS } from './constants'

/** Minimal structural shape needed from a registry token (Token satisfies it). */
export interface RegistryPulseToken {
  name: string
  ticker: string
  status: 'draft' | 'in_review' | 'validated'
  created_at: string
  cluster_scores: ClusterScores | null
}

export interface WeakestCluster {
  key: keyof ClusterScores
  label: string
  /** tokens whose cluster is not yet complete */
  missing: number
}

export interface RegistryPulse {
  total: number
  target: number
  goalPct: number
  validated: number
  /** tokens created in the trailing 7 days */
  additions7d: number
  /** most recent addition, for the sparse state when additions7d is 0 */
  lastAdded: { name: string; ticker: string; createdAt: string } | null
  /** lowest completion-rate cluster across the registry (null when empty or all complete) */
  weakest: WeakestCluster | null
}

const CLUSTER_KEYS = Object.keys(CLUSTER_MAX) as Array<keyof ClusterScores>

/**
 * Pure aggregation over the registry list (no fetching): the numbers behind
 * the screener's pulse band. Same weakest-cluster semantics as the dashboard's
 * "next best action" (completion rate per cluster, lowest wins).
 */
export function buildRegistryPulse(
  tokens: readonly RegistryPulseToken[],
  now: Date,
): RegistryPulse {
  const total = tokens.length
  const validated = tokens.filter((t) => t.status === 'validated').length

  const weekAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000
  const additions7d = tokens.filter(
    (t) => new Date(t.created_at).getTime() >= weekAgo,
  ).length

  let lastAdded: RegistryPulse['lastAdded'] = null
  for (const t of tokens) {
    if (!lastAdded || t.created_at > lastAdded.createdAt) {
      lastAdded = { name: t.name, ticker: t.ticker, createdAt: t.created_at }
    }
  }

  let weakest: WeakestCluster | null = null
  if (total > 0) {
    let worstRate = 1
    for (const key of CLUSTER_KEYS) {
      const complete = tokens.filter(
        (t) => (t.cluster_scores?.[key] ?? 0) >= CLUSTER_MAX[key],
      ).length
      const rate = complete / total
      if (rate < 1 && rate < worstRate) {
        worstRate = rate
        weakest = { key, label: CLUSTER_LABELS[key], missing: total - complete }
      }
    }
  }

  return {
    total,
    target: TARGET_TOKENS,
    goalPct: Math.round((total / TARGET_TOKENS) * 100),
    validated,
    additions7d,
    lastAdded,
    weakest,
  }
}

/* ── Activity feed ────────────────────────────────────────────────────────── */

export interface ActivityEvent {
  id: string
  event_type: string
  token_id: string | null
  created_at: string
}

export interface ActivityItem {
  id: string
  /** drives the feed glyph: dispute (risk), resolution (consensus), onchain, registry */
  kind: 'dispute' | 'resolution' | 'onchain' | 'registry'
  message: string
  tokenId: string | null
  /** ISO timestamp; null for undated registry milestones (never a fake time) */
  at: string | null
}

/** Lifecycle events surfaced in the feed, with anonymized-by-role copy
 *  (never a user name). Types outside this map never reach the UI. */
const EVENT_COPY: Record<
  string,
  { kind: ActivityItem['kind']; text: (token: string) => string }
> = {
  opened: {
    kind: 'dispute',
    text: (t) => `A challenge was opened on ${t}`,
  },
  withdrawn: {
    kind: 'resolution',
    text: (t) => `A challenge on ${t} was withdrawn`,
  },
  owner_accepted: {
    kind: 'resolution',
    text: (t) => `The owner accepted an update on ${t}`,
  },
  owner_rejected: {
    kind: 'resolution',
    text: (t) => `The owner rejected a challenge on ${t}`,
  },
  moderator_accepted: {
    kind: 'resolution',
    text: (t) => `A moderator accepted an update on ${t}`,
  },
  moderator_rejected: {
    kind: 'resolution',
    text: (t) => `A moderator rejected a challenge on ${t}`,
  },
  moderator_corrected: {
    kind: 'resolution',
    text: (t) => `A moderator corrected a claim on ${t}`,
  },
  auto_adopted: {
    kind: 'resolution',
    text: (t) => `An update on ${t} was adopted by consensus`,
  },
  expired: {
    kind: 'resolution',
    text: (t) => `A challenge on ${t} expired unresolved`,
  },
  onchain_linked: {
    kind: 'onchain',
    text: (t) => `A challenge on ${t} was anchored on-chain`,
  },
  published_despite_challenge: {
    kind: 'onchain',
    text: (t) => `${t} was published with an open challenge`,
  },
}

/** Whitelisted event types (single source for the fetch filter). */
export const FEED_EVENT_TYPES = Object.keys(EVENT_COPY)

/**
 * Feed items from the challenge-events ledger, joined in memory with token
 * names. Anti-ghost-town: under 5 real events, registry milestones fuse into
 * the feed instead of exhibiting the void; the milestone with no honest
 * timestamp carries none.
 */
export function buildActivityItems(
  events: readonly ActivityEvent[],
  tokenNamesById: ReadonlyMap<string, { name: string; ticker: string }>,
  pulse: RegistryPulse,
  limit = 8,
): ActivityItem[] {
  const items: ActivityItem[] = []
  for (const e of events) {
    const copy = EVENT_COPY[e.event_type]
    if (!copy) continue
    const token = e.token_id ? tokenNamesById.get(e.token_id) : undefined
    items.push({
      id: e.id,
      kind: copy.kind,
      message: copy.text(token?.name ?? 'a token'),
      tokenId: e.token_id,
      at: e.created_at,
    })
  }
  items.sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))

  if (items.length < 5) {
    if (pulse.lastAdded) {
      items.push({
        id: 'registry-last-added',
        kind: 'registry',
        message: `${pulse.lastAdded.name} (${pulse.lastAdded.ticker}) joined the registry`,
        tokenId: null,
        at: pulse.lastAdded.createdAt,
      })
    }
    if (pulse.total > 0) {
      items.push({
        id: 'registry-milestone',
        kind: 'registry',
        message: `The registry stands at ${pulse.total} structured tokens, ${pulse.validated} validated`,
        tokenId: null,
        at: null,
      })
    }
    items.sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))
  }

  return items.slice(0, limit)
}
