/**
 * Live timetable + roster.
 *
 * Firestore is the only place counts and attendance are authoritative, so
 * these read it directly. Without Firebase configured they report
 * `unavailable` and the UI shows an empty week, which is honest — the previous
 * fallback to a local seed store showed invented numbers instead.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  currentWeekStart,
  groupByWeekday,
  shiftWeekStart,
  subscribeLiveSessions,
  subscribeSessionRoster,
  subscribeWeeklyLocks,
  weekRangeLabel,
  type LiveRosterState,
  type LiveSessionsState,
} from '@gbtt/shared/studio/firebase/liveSessions'
import {
  subscribeMyProfile,
  type LiveProfileState,
} from '@gbtt/shared/studio/firebase/liveMembers'
import { getFirebaseUser } from '@gbtt/shared/studio/studioAuth'
export function useLiveSessions(weekStart: string = currentWeekStart()) {
  const [state, setState] = useState<LiveSessionsState>({ status: 'loading', occurrences: [] })

  useEffect(() => subscribeLiveSessions(weekStart, setState), [weekStart])

  const byDay = useMemo(() => groupByWeekday(state.occurrences), [state.occurrences])

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

/** The signed-in member's own record: preferences, terms, and any pending plan. */
export function useMyProfile(enabled: boolean) {
  const [state, setState] = useState<LiveProfileState>({ status: 'loading', profile: null })
  const uid = enabled ? (getFirebaseUser()?.uid ?? '') : ''

  useEffect(() => subscribeMyProfile(uid, setState), [uid])

  return state
}
