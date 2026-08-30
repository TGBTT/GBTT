/**
 * Seasons: the admin-defined stretches of calendar the studio runs in.
 *
 * A season carries its own dates and closure periods, so a term, a short
 * summer block and a full year are the same shape with different numbers.
 * That is deliberate — the studio has not settled on a season length, and
 * changing one is meant to be editing dates rather than changing code.
 *
 * Rules let any signed-in member read seasons and only an admin write them.
 */

import { collection, deleteDoc, doc, onSnapshot, setDoc } from 'firebase/firestore'
import { getFirestoreDb } from './init'

export interface SeasonBreak {
  label: string
  startDate: string
  endDate: string
}

/**
 * How a season is charged.
 *
 * `arrears` totals the seats actually held once the season has run, so a
 * closure needs no special handling — no sessions means no seats means no
 * charge. `upfront` quotes the whole season at enrolment from the sessions the
 * member's slots will produce.
 */
export type SeasonBillingMode = 'arrears' | 'upfront'

export interface LiveSeason {
  id: string
  name: string
  startDate: string
  endDate: string
  billingMode: SeasonBillingMode
  breaks: SeasonBreak[]
}

export interface LiveSeasonsState {
  status: 'unavailable' | 'loading' | 'ready' | 'error'
  seasons: LiveSeason[]
  error?: string
}

function mapSeason(id: string, data: Record<string, unknown>): LiveSeason {
  const breaks = Array.isArray(data.breaks) ? (data.breaks as Record<string, unknown>[]) : []
  return {
    id,
    name: String(data.name ?? id),
    startDate: String(data.startDate ?? ''),
    endDate: String(data.endDate ?? ''),
    billingMode: data.billingMode === 'upfront' ? 'upfront' : 'arrears',
    breaks: breaks.map((b) => ({
      label: String(b.label ?? 'Closed'),
      startDate: String(b.startDate ?? ''),
      endDate: String(b.endDate ?? ''),
    })),
  }
}

export function subscribeSeasons(onChange: (state: LiveSeasonsState) => void): () => void {
  const db = getFirestoreDb()
  if (!db) {
    onChange({ status: 'unavailable', seasons: [] })
    return () => {}
  }

  onChange({ status: 'loading', seasons: [] })

  return onSnapshot(
    collection(db, 'seasons'),
    (snap) => {
      const seasons = snap.docs
        .map((d) => mapSeason(d.id, d.data()))
        .sort((a, b) => a.startDate.localeCompare(b.startDate))
      onChange({ status: 'ready', seasons })
    },
    (err) => onChange({ status: 'error', seasons: [], error: err.message }),
  )
}

/** Number of weekdays a season runs, closures removed. Mirrors the server count. */
export function countTeachingDays(season: LiveSeason): number {
  if (!season.startDate || !season.endDate || season.endDate < season.startDate) return 0

  const [sy, sm, sd] = season.startDate.split('-').map(Number)
  const [ey, em, ed] = season.endDate.split('-').map(Number)
  const cursor = new Date(sy, sm - 1, sd)
  const end = new Date(ey, em - 1, ed)
  const pad = (n: number) => String(n).padStart(2, '0')

  let count = 0
  while (cursor <= end) {
    const day = cursor.getDay()
    const key = `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}-${pad(cursor.getDate())}`
    const closed = season.breaks.some((b) => b.startDate && key >= b.startDate && key <= b.endDate)
    if (day >= 1 && day <= 5 && !closed) count += 1
    cursor.setDate(cursor.getDate() + 1)
  }
  return count
}

export async function saveSeason(season: LiveSeason): Promise<string | null> {
  const db = getFirestoreDb()
  if (!db) return 'Firebase not configured.'

  const id = season.id.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-')
  if (!id) return 'Give the season an id, e.g. "2026-term-1".'
  if (!season.name.trim()) return 'Give the season a name.'
  if (!season.startDate || !season.endDate) return 'Set both a start and an end date.'
  if (season.endDate < season.startDate) return 'The end date falls before the start date.'

  for (const b of season.breaks) {
    if (!b.startDate || !b.endDate) return 'Every closure needs a start and an end date.'
    if (b.endDate < b.startDate) return `Closure "${b.label}" ends before it starts.`
  }

  try {
    await setDoc(
      doc(db, 'seasons', id),
      {
        name: season.name.trim(),
        startDate: season.startDate,
        endDate: season.endDate,
        billingMode: season.billingMode,
        breaks: season.breaks,
      },
      { merge: true },
    )
    return null
  } catch (e) {
    return e instanceof Error ? e.message : 'Could not save this season.'
  }
}

/**
 * Delete a season definition.
 *
 * Sessions already generated from it are left alone: they carry rosters,
 * attendance and billing history, and removing the definition should not erase
 * what happened. Archive them from the sessions tab if they should stop running.
 */
export async function deleteSeason(seasonId: string): Promise<string | null> {
  const db = getFirestoreDb()
  if (!db) return 'Firebase not configured.'
  try {
    await deleteDoc(doc(db, 'seasons', seasonId))
    return null
  } catch (e) {
    return e instanceof Error ? e.message : 'Could not delete this season.'
  }
}
