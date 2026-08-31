/**
 * Last-seen roster per session, kept in localStorage.
 *
 * Roll call happens on a phone at the gym door, where the first paint used to
 * be "Loading roster…" every time a session was opened. Remembering the list
 * lets the names appear at once while the Firestore listener confirms them.
 * The cache is a convenience only — the snapshot always wins.
 */
import type { RosterEntry } from '@gbtt/shared/studio/fitnessStudio'

const PREFIX = 'gbtt.roster.'
const MAX_AGE_MS = 2 * 24 * 60 * 60 * 1000

interface CachedRoster {
  savedAt: number
  roster: RosterEntry[]
}

function storage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function readCachedRoster(sessionId: string): RosterEntry[] | null {
  const store = storage()
  if (!store) return null
  try {
    const raw = store.getItem(PREFIX + sessionId)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedRoster
    if (!Array.isArray(parsed?.roster)) return null
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) {
      store.removeItem(PREFIX + sessionId)
      return null
    }
    return parsed.roster
  } catch {
    return null
  }
}

export function writeCachedRoster(sessionId: string, roster: RosterEntry[]): void {
  const store = storage()
  if (!store) return
  pruneStaleRosters(store)
  try {
    store.setItem(PREFIX + sessionId, JSON.stringify({ savedAt: Date.now(), roster }))
  } catch {
    // A full or unavailable store just means no head start next time.
  }
}

/** Sessions are opened once and never again, so old entries would accumulate. */
function pruneStaleRosters(store: Storage): void {
  try {
    const stale: string[] = []
    for (let i = 0; i < store.length; i += 1) {
      const key = store.key(i)
      if (!key?.startsWith(PREFIX)) continue
      const raw = store.getItem(key)
      if (!raw) continue
      let savedAt = 0
      try {
        savedAt = (JSON.parse(raw) as CachedRoster).savedAt ?? 0
      } catch {
        savedAt = 0
      }
      if (Date.now() - savedAt > MAX_AGE_MS) stale.push(key)
    }
    for (const key of stale) store.removeItem(key)
  } catch {
    // Nothing to do; pruning is opportunistic.
  }
}
