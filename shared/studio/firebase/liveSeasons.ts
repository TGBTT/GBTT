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

import { collection, deleteDoc, doc, getDocs, onSnapshot, setDoc } from 'firebase/firestore'
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

const SEASON_DAY_INDEX: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4 }

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function mondayOf(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const dow = out.getDay()
  out.setDate(out.getDate() + (dow === 0 ? -6 : 1 - dow))
  return out
}

export interface SeasonTeachingDay {
  weekStart: string
  day: string
  dayLabel: string
}

/**
 * Every weekday a season can hold a session, closures removed.
 *
 * Mirrors the server `seasonDays` walk: sessions are filed under the Monday of
 * their week, while closures are checked against the session's own date, so a
 * break covering only part of a week cancels only the days it covers.
 */
export function seasonTeachingDays(season: LiveSeason): SeasonTeachingDay[] {
  if (!season.startDate || !season.endDate || season.endDate < season.startDate) return []

  const [sy, sm, sd] = season.startDate.split('-').map(Number)
  const [ey, em, ed] = season.endDate.split('-').map(Number)
  if (!sy || !sm || !sd || !ey || !em || !ed) return []

  const start = new Date(sy, sm - 1, sd)
  const end = new Date(ey, em - 1, ed)
  const out: SeasonTeachingDay[] = []

  for (let week = mondayOf(start); week <= end; week.setDate(week.getDate() + 7)) {
    const weekStart = dayKey(week)
    for (const [label, offset] of Object.entries(SEASON_DAY_INDEX)) {
      const date = new Date(week.getFullYear(), week.getMonth(), week.getDate() + offset)
      const day = dayKey(date)
      if (day < season.startDate || day > season.endDate) continue
      if (season.breaks.some((b) => b.startDate && day >= b.startDate && day <= b.endDate)) continue
      out.push({ weekStart, day, dayLabel: label })
    }
  }
  return out
}

/** Number of weekdays a season runs, closures removed. Mirrors the server count. */
export function countTeachingDays(season: LiveSeason): number {
  return seasonTeachingDays(season).length
}

/** One-shot read of every season. Used when laying a new recurring class across the term. */
export async function listSeasons(): Promise<LiveSeason[]> {
  const db = getFirestoreDb()
  if (!db) return []

  try {
    const snap = await getDocs(collection(db, 'seasons'))
    return snap.docs
      .map((d) => mapSeason(d.id, d.data()))
      .sort((a, b) => a.startDate.localeCompare(b.startDate))
  } catch {
    return []
  }
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
