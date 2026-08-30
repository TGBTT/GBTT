/**
 * Live timetable + roster for the admin console.
 *
 * When Firebase is configured these read Firestore, which is the only place
 * counts and attendance are authoritative. Without Firebase they report
 * `unavailable` and callers fall back to the local seed store, which keeps the
 * app usable offline in development without ever showing invented numbers in
 * production.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  currentWeekStart,
  shiftWeekStart,
  subscribeLiveSessions,
  subscribeSessionRoster,
  subscribeWeeklyLocks,
  weekRangeLabel,
  type LiveRosterState,
  type LiveSessionsState,
} from '@gbtt/shared/studio/firebase/liveSessions'
import { getFirebaseUser } from '@gbtt/shared/studio/studioAuth'
import { WEEKDAYS, type ClassOccurrence, type Weekday } from '../shared/fitnessStudio'

export function useLiveSessions(weekStart: string = currentWeekStart()) {
  const [state, setState] = useState<LiveSessionsState>({ status: 'loading', occurrences: [] })

  useEffect(() => subscribeLiveSessions(weekStart, setState), [weekStart])

  const byDay = useMemo(() => {
    const grouped = {} as Record<Weekday, ClassOccurrence[]>
    for (const day of WEEKDAYS) grouped[day] = []
    for (const occ of state.occurrences) {
      const day = WEEKDAYS.find((d) => d === occ.dayLabel)
      if (day) grouped[day].push(occ)
    }
    for (const day of WEEKDAYS) grouped[day].sort((a, b) => a.time.localeCompare(b.time))
    return grouped
  }, [state.occurrences])

  return { ...state, byDay, weekStart }
}

/**
 * The week the timetable is pointed at.
 *
 * Admins step back to finish roll call on a class that has already run, and
 * members step forward to move commitments around before the transfer window
 * closes, so navigation is deliberately unbounded in both directions. Whether
 * an action is actually allowed on a given week stays a server decision — the
 * booking and cancellation callables enforce the transfer window regardless of
 * which week is on screen.
 */
export function useWeekNavigation(initial: string = currentWeekStart()) {
  const [weekStart, setWeekStart] = useState(initial)

  const goToWeek = useCallback((weeks: number) => {
    setWeekStart((current) => shiftWeekStart(current, weeks))
  }, [])

  const thisWeek = currentWeekStart()

  return {
    weekStart,
    label: weekRangeLabel(weekStart),
    isCurrentWeek: weekStart === thisWeek,
    isPast: weekStart < thisWeek,
    previousWeek: useCallback(() => goToWeek(-1), [goToWeek]),
    nextWeek: useCallback(() => goToWeek(1), [goToWeek]),
    resetWeek: useCallback(() => setWeekStart(thisWeek), [thisWeek]),
  }
}

export function useSessionRoster(sessionId: string | null) {
  const [state, setState] = useState<LiveRosterState>({ status: 'loading', roster: [] })

  useEffect(() => subscribeSessionRoster(sessionId, setState), [sessionId])

  return state
}

/** Slot ids the signed-in member has locked recurringly. */
export function useWeeklyLocks(enabled: boolean) {
  const [slotIds, setSlotIds] = useState<string[]>([])
  const uid = enabled ? (getFirebaseUser()?.uid ?? null) : null

  useEffect(() => subscribeWeeklyLocks(uid, setSlotIds), [uid])

  return slotIds
}
