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
  subscribeMyWeekBookings,
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
import { getFirebaseUser, studioMarkAttendance } from '@gbtt/shared/studio/studioAuth'
import type { RosterEntry, RosterStatus } from '@gbtt/shared/studio/fitnessStudio'
import { readCachedRoster, writeCachedRoster } from './rosterCache'
export function useLiveSessions(weekStart: string = currentWeekStart()) {
  const [state, setState] = useState<LiveSessionsState>({ status: 'loading', occurrences: [] })
  // The requested week can change a frame before the subscription does; never
  // show the previous week's sessions as if they belonged to the new one.
  const [dataWeek, setDataWeek] = useState<string | null>(null)

  useEffect(
    () =>
      subscribeLiveSessions(weekStart, (next) => {
        setDataWeek(weekStart)
        setState(next)
      }),
    [weekStart],
  )

  const ready = dataWeek === weekStart
  const occurrences = ready ? state.occurrences : []
  const byDay = useMemo(() => groupByWeekday(occurrences), [occurrences])

  return {
    ...state,
    status: ready ? state.status : 'loading',
    occurrences,
    error: ready ? state.error : undefined,
    byDay,
    weekStart,
  }
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

function cachedRosterState(sessionId: string | null): LiveRosterState {
  const cached = sessionId ? readCachedRoster(sessionId) : null
  if (!cached) return { status: 'loading', roster: [] }
  return { status: 'ready', roster: cached, fromCache: true }
}

/**
 * A session's roster, seeded from the last list we saw for it.
 *
 * The listener still runs and its first snapshot replaces whatever the cache
 * offered, so the cached names are only a head start on the paint — never a
 * substitute for checking with the server.
 */
export function useSessionRoster(sessionId: string | null) {
  const [state, setState] = useState<LiveRosterState>(() => cachedRosterState(sessionId))

  useEffect(() => {
    setState(cachedRosterState(sessionId))

    return subscribeSessionRoster(sessionId, (next) => {
      // The subscription announces 'loading' before it attaches. Holding on to
      // the cached list through that keeps the names on screen.
      if (next.status === 'loading') {
        setState((current) =>
          current.fromCache && current.roster.length ? current : { ...next, fromCache: false },
        )
        return
      }
      if (next.status === 'ready' && sessionId) writeCachedRoster(sessionId, next.roster)
      setState({ ...next, fromCache: false })
    })
  }, [sessionId])

  return state
}

/**
 * Roll call ticks applied locally while the server catches up.
 *
 * `markAttendance` is a callable, so the round-trip through Firestore and back
 * out of the roster listener took long enough that the checkbox felt broken.
 * These pending marks are what the UI renders until the snapshot agrees, and
 * they are dropped if the call fails so the box never lies about what was
 * recorded.
 */
export function usePendingAttendance(sessionId: string | null, roster: RosterEntry[]) {
  const [pending, setPending] = useState<Record<string, RosterStatus>>({})

  useEffect(() => setPending({}), [sessionId])

  // Once the server reports the status we asked for, the local mark is redundant.
  useEffect(() => {
    setPending((current) => {
      const keys = Object.keys(current)
      if (!keys.length) return current
      const settled = keys.filter(
        (memberId) => roster.find((r) => r.memberId === memberId)?.status === current[memberId],
      )
      if (!settled.length) return current
      const next = { ...current }
      for (const memberId of settled) delete next[memberId]
      return next
    })
  }, [roster])

  const mark = useCallback(
    async (memberId: string, status: RosterStatus): Promise<string | null> => {
      if (!sessionId) return null
      setPending((current) => ({ ...current, [memberId]: status }))
      const error = await studioMarkAttendance(sessionId, memberId, status)
      if (error) {
        setPending((current) => {
          const next = { ...current }
          delete next[memberId]
          return next
        })
      }
      return error
    },
    [sessionId],
  )

  const merged = useMemo(
    () =>
      Object.keys(pending).length
        ? roster.map((r) =>
            r.memberId && pending[r.memberId] ? { ...r, status: pending[r.memberId] } : r,
          )
        : roster,
    [roster, pending],
  )

  return { roster: merged, mark }
}

/** Slot ids the signed-in member has locked recurringly. */
export function useWeeklyLocks(enabled: boolean) {
  const [slotIds, setSlotIds] = useState<string[]>([])
  const uid = enabled ? (getFirebaseUser()?.uid ?? null) : null

  useEffect(() => subscribeWeeklyLocks(uid, setSlotIds), [uid])

  return slotIds
}

/** Session ids the signed-in member is booked into for the displayed week. */
export function useMyWeekBookings(uid: string | null, sessionIds: string[]) {
  const [bookedIds, setBookedIds] = useState<string[]>([])
  const key = sessionIds.join(',')

  useEffect(() => subscribeMyWeekBookings(uid, sessionIds, setBookedIds), [uid, key])

  return bookedIds
}

/** The signed-in member's own record: preferences, terms, and any pending plan. */
export function useMyProfile(enabled: boolean) {
  const [state, setState] = useState<LiveProfileState>({ status: 'loading', profile: null })
  const uid = enabled ? (getFirebaseUser()?.uid ?? '') : ''

  useEffect(() => subscribeMyProfile(uid, setState), [uid])

  return state
}
