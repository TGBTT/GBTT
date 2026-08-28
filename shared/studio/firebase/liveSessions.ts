/**
 * Live timetable data from Firestore.
 *
 * The client store in `fitnessStudio.ts` keeps its own seeded copy of the
 * timetable in localStorage, which is useful offline but is not the truth: the
 * roster subcollection and `bookedCount` are maintained server-side by the
 * bookSession / cancelBooking / markAttendance callables. Anything that shows a
 * count or a roll call must read from here so the admin console, the member
 * booking view and `calculateBillingPeriod` all agree.
 *
 * Attendance counts come from the session document rather than by counting
 * roster docs, so the calendar needs one listener for the whole week instead of
 * one per session. The roster itself is only fetched for the session an admin
 * has actually opened.
 */

import {
  collection,
  onSnapshot,
  query,
  where,
  type DocumentData,
} from 'firebase/firestore'
import { getFirestoreDb } from './init'
import type { ClassOccurrence, RosterEntry, RosterStatus } from '../fitnessStudio'

export type LiveStatus = 'unavailable' | 'loading' | 'ready' | 'error'

export interface LiveSessionsState {
  status: LiveStatus
  occurrences: ClassOccurrence[]
  error?: string
}

export interface LiveRosterState {
  status: LiveStatus
  roster: RosterEntry[]
  error?: string
}

const noop = () => {}

/** Monday of the week containing `now`, as the YYYY-MM-DD key sessions are stored under. */
export function currentWeekStart(now: Date = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dow = d.getDay()
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function mapSession(id: string, data: DocumentData): ClassOccurrence {
  return {
    id,
    classTypeId: String(data.classTypeId ?? ''),
    dayLabel: String(data.dayLabel ?? ''),
    time: String(data.time ?? ''),
    venueId: String(data.venueId ?? data.venue ?? ''),
    exerciseIds: Array.isArray(data.exerciseIds) ? data.exerciseIds.map(String) : [],
    exerciseDisplay: data.exerciseDisplay,
    bookedCount: Number(data.bookedCount ?? 0),
    cap: data.cap == null ? undefined : Number(data.cap),
    cancelled: data.cancelled === true,
    slotId: data.slotId == null ? undefined : String(data.slotId),
    roster: [],
    calendarEventId: String(data.calendarEventId ?? ''),
    instructorId: String(data.instructorId ?? ''),
  }
}

function mapRosterEntry(id: string, data: DocumentData): RosterEntry {
  const status = data.status
  return {
    memberId: String(data.memberId ?? id),
    displayName: String(data.displayName ?? ''),
    kind: data.kind === 'guest' ? 'guest' : 'member',
    showName: data.showName !== false,
    status:
      status === 'attended' || status === 'noShow' || status === 'booked'
        ? (status as RosterStatus)
        : 'booked',
    bookedBy: data.bookedBy === 'admin' ? 'admin' : 'self',
    attendedAt: typeof data.attendedAt === 'string' ? data.attendedAt : undefined,
  }
}

/** Subscribe to one week of sessions. Returns an unsubscribe function. */
export function subscribeLiveSessions(
  weekStart: string,
  onChange: (state: LiveSessionsState) => void,
): () => void {
  const db = getFirestoreDb()
  if (!db) {
    onChange({ status: 'unavailable', occurrences: [] })
    return noop
  }

  onChange({ status: 'loading', occurrences: [] })

  return onSnapshot(
    query(collection(db, 'sessions'), where('weekStart', '==', weekStart)),
    (snap) => {
      const occurrences = snap.docs
        .map((d) => mapSession(d.id, d.data()))
        .filter((o) => !o.cancelled)
      onChange({ status: 'ready', occurrences })
    },
    (err) => onChange({ status: 'error', occurrences: [], error: err.message }),
  )
}

/**
 * Subscribe to a member's recurring weekly locks.
 *
 * The lock documents are the membership record; the individual seats they hold
 * live in each session's roster. The calendar highlights slots from here so a
 * member sees their recurring booking even in a week whose sessions have not
 * been generated yet.
 */
export function subscribeWeeklyLocks(
  uid: string | null,
  onChange: (slotIds: string[]) => void,
): () => void {
  const db = getFirestoreDb()
  if (!db || !uid) {
    onChange([])
    return noop
  }

  return onSnapshot(
    collection(db, 'users', uid, 'weeklyLocks'),
    (snap) => onChange(snap.docs.map((d) => d.id)),
    () => onChange([]),
  )
}

/** Subscribe to a single session's roster — used by the admin roll call. */
export function subscribeSessionRoster(
  sessionId: string | null,
  onChange: (state: LiveRosterState) => void,
): () => void {
  const db = getFirestoreDb()
  if (!db || !sessionId) {
    onChange({ status: db ? 'loading' : 'unavailable', roster: [] })
    return noop
  }

  onChange({ status: 'loading', roster: [] })

  return onSnapshot(
    collection(db, 'sessions', sessionId, 'roster'),
    (snap) => {
      const roster = snap.docs
        .map((d) => mapRosterEntry(d.id, d.data()))
        .sort((a, b) => a.displayName.localeCompare(b.displayName))
      onChange({ status: 'ready', roster })
    },
    (err) => onChange({ status: 'error', roster: [], error: err.message }),
  )
}
