/**
 * Studio settings the server acts on.
 *
 * `meta/settings` is where the Cloud Functions already read the transfer
 * window from, in `transferWindowHours()`. The admin control used to edit a
 * separate number in `localStorage`, so changing it appeared to work and had
 * no effect on when cancellations actually close. Writing here is what makes
 * that control real.
 *
 * Rules: staff read, admin write.
 */

import { doc, onSnapshot, setDoc } from 'firebase/firestore'
import { getFirestoreDb } from './init'

export type LiveStatus = 'unavailable' | 'loading' | 'ready' | 'error'

/** Mirrors DEFAULT_TRANSFER_WINDOW_HOURS in the Cloud Functions. */
export const DEFAULT_TRANSFER_WINDOW_HOURS = 24

export interface LiveSettings {
  transferWindowHours: number
  equipmentChecked: string[]
}

export interface LiveSettingsState {
  status: LiveStatus
  settings: LiveSettings
  error?: string
}

const DEFAULT_SETTINGS: LiveSettings = {
  transferWindowHours: DEFAULT_TRANSFER_WINDOW_HOURS,
  equipmentChecked: [],
}

export function subscribeSettings(
  onChange: (state: LiveSettingsState) => void,
): () => void {
  const db = getFirestoreDb()
  if (!db) {
    onChange({ status: 'unavailable', settings: DEFAULT_SETTINGS })
    return () => {}
  }

  onChange({ status: 'loading', settings: DEFAULT_SETTINGS })

  return onSnapshot(
    doc(db, 'meta', 'settings'),
    (snap) => {
      const data = snap.data() ?? {}
      const hours = Number(data.transferWindowHours)
      onChange({
        status: 'ready',
        settings: {
          // Match the server's own fallback, so the number on screen is the
          // number that will be enforced.
          transferWindowHours:
            Number.isFinite(hours) && hours >= 0 ? hours : DEFAULT_TRANSFER_WINDOW_HOURS,
          equipmentChecked: Array.isArray(data.equipmentChecked)
            ? data.equipmentChecked.map(String)
            : [],
        },
      })
    },
    (err) => onChange({ status: 'error', settings: DEFAULT_SETTINGS, error: err.message }),
  )
}

export async function saveSettings(patch: Partial<LiveSettings>): Promise<string | null> {
  const db = getFirestoreDb()
  if (!db) return 'Firebase not configured.'
  if (
    patch.transferWindowHours != null &&
    (!Number.isFinite(patch.transferWindowHours) || patch.transferWindowHours < 0)
  ) {
    return 'Transfer window must be zero hours or more.'
  }
  try {
    await setDoc(doc(db, 'meta', 'settings'), patch, { merge: true })
    return null
  } catch (e) {
    return e instanceof Error ? e.message : 'Could not save these settings.'
  }
}
