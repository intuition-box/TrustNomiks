'use client'

/**
 * Banner dismissals, persisted per browser in localStorage and exposed
 * through the useSyncExternalStore contract (same pattern as the shell's
 * sidebar state): SSR sees "nothing dismissed", the client re-reads after
 * hydration, and a custom event keeps same-tab subscribers in sync.
 */

const STORAGE_KEY = 'trustnomiks:dismissed-announcements'
const CHANGE_EVENT = 'trustnomiks:dismissals-changed'

export function subscribeToDismissals(callback: () => void) {
  window.addEventListener('storage', callback)
  window.addEventListener(CHANGE_EVENT, callback)
  return () => {
    window.removeEventListener('storage', callback)
    window.removeEventListener(CHANGE_EVENT, callback)
  }
}

/** Raw snapshot (stable string) — parse with useMemo on the consumer side. */
export function getDismissedSnapshot(): string {
  return localStorage.getItem(STORAGE_KEY) ?? '[]'
}

export function getServerDismissedSnapshot(): string {
  return '[]'
}

export function parseDismissed(snapshot: string): Set<string> {
  try {
    const arr = JSON.parse(snapshot)
    return new Set(
      Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [],
    )
  } catch {
    return new Set()
  }
}

export function dismissAnnouncement(id: string) {
  const current = parseDismissed(getDismissedSnapshot())
  current.add(id)
  // Cap the list so it cannot grow unbounded over the years
  const list = [...current].slice(-100)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  window.dispatchEvent(new Event(CHANGE_EVENT))
}
