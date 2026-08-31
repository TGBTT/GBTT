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
  doc,
  onSnapshot,
  query,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  type DocumentData,
} from 'firebase/firestore'
import { getFirestoreDb } from './init'
import type {
  ClassOccurrence,
  ExerciseDisplay,
  RosterEntry,
  RosterStatus,
} from '../fitnessStudio'

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

/** Studio wall-clock timezone. Session times mean this zone, not the viewer's. */
const TIME_ZONE = 'Pacific/Auckland'

const DAY_INDEX: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4 }

function zoneOffsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
    .formatToParts(new Date(utcMs))
    .reduce<Record<string, string>>((acc, p) => ({ ...acc, [p.type]: p.value }), {})

  return (
    Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour) % 24,
      Number(parts.minute),
      Number(parts.second),
    ) - utcMs
  )
}

/**
 * Studio wall-clock time to a UTC instant. Resolved twice so a session near a
 * daylight-saving change lands on the right side of the transition — the
 * transfer window is measured from this, so an hour of drift is a real bug.
 */
function zonedToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute)
  let instant = guess - zoneOffsetMs(guess, TIME_ZONE)
  instant = guess - zoneOffsetMs(instant, TIME_ZONE)
  return new Date(instant)
}

/** Monday of the week containing `now`, as the YYYY-MM-DD key sessions are stored under. */
export function currentWeekStart(now: Date = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dow = d.getDay()
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * Move a week key by whole weeks.
 *
 * Built from the date parts rather than by adding 7×24 hours, because a week
 * spanning a daylight-saving change is not 168 hours long and the arithmetic
 * would land on the Sunday or Tuesday instead of the Monday.
 */
export function shiftWeekStart(weekStart: string, weeks: number): string {
  const [y, m, d] = weekStart.split('-').map(Number)
  const date = new Date(y, m - 1, d + weeks * 7)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Human label for a week key, e.g. "5 – 9 May". */
export function weekRangeLabel(weekStart: string): string {
  const [y, m, d] = weekStart.split('-').map(Number)
  const mon = new Date(y, m - 1, d)
  const fri = new Date(y, m - 1, d + 4)
  const month = (date: Date) => date.toLocaleDateString('en-NZ', { month: 'short' })
  return mon.getMonth() === fri.getMonth()
    ? `${mon.getDate()} – ${fri.getDate()} ${month(fri)}`
    : `${mon.getDate()} ${month(mon)} – ${fri.getDate()} ${month(fri)}`
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

export interface NewSessionInput {
  classTypeId: string
  className: string
  cap: number
  dayLabel: string
  time: string
  weekStart: string
  instructorId?: string
  venueId?: string
}

/**
 * Add a one-off session to a week.
 *
 * Rules permit staff to write session documents directly, so this does not
 * need a callable — but `startsAt` must be a real timestamp or cancelBooking
 * and unlockWeeklySlot will refuse to act on it, and `cap` must be set or
 * bookSession has nothing to enforce.
 */
/**
 * The slot key and start instant a session's day, time and class imply.
 *
 * Both are derived client-side, so any edit to day, time or class has to run
 * through here again: `slotId` is what weekly locks and the season generator
 * match on, and `startsAt` is what the transfer window is measured from.
 */
function sessionTiming(
  weekStart: string,
  dayLabel: string,
  time: string,
  classTypeId: string,
): { slotId: string; startsAt: Timestamp } | { error: string } {
  const dayOffset = DAY_INDEX[dayLabel]
  if (dayOffset === undefined) return { error: `Unsupported day "${dayLabel}".` }

  const [y, m, d] = weekStart.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  if (!y || !m || !d || Number.isNaN(hour) || Number.isNaN(minute)) {
    return { error: 'Could not read the week or time for this session.' }
  }

  const date = new Date(y, m - 1, d + dayOffset)
  return {
    slotId: `${dayLabel.toLowerCase()}-${time.replace(':', '')}-${classTypeId}`,
    startsAt: Timestamp.fromDate(
      zonedToUtc(date.getFullYear(), date.getMonth() + 1, date.getDate(), hour, minute),
    ),
  }
}

export async function createLiveSession(
  input: NewSessionInput,
): Promise<{ id: string | null; error: string | null }> {
  const db = getFirestoreDb()
  if (!db) return { id: null, error: 'Firebase not configured.' }

  const timing = sessionTiming(input.weekStart, input.dayLabel, input.time, input.classTypeId)
  if ('error' in timing) return { id: null, error: timing.error }

  const { slotId, startsAt } = timing
  const id = `${slotId}-${input.weekStart}`

  try {
    await setDoc(
      doc(db, 'sessions', id),
      {
        slotId,
        weekStart: input.weekStart,
        dayLabel: input.dayLabel,
        time: input.time,
        classTypeId: input.classTypeId,
        className: input.className,
        cap: input.cap,
        instructorId: input.instructorId ?? 'tom',
        venueId: input.venueId ?? 'rec-park-centre',
        venue: input.venueId ?? 'rec-park-centre',
        durationMinutes: 60,
        cancelled: false,
        bookedCount: 0,
        startsAt,
      },
      { merge: true },
    )
    return { id, error: null }
  } catch (e) {
    return { id: null, error: e instanceof Error ? e.message : 'Could not add this session.' }
  }
}

export interface SessionEdit {
  dayLabel?: string
  time?: string
  classTypeId?: string
  /** Sent alongside `classTypeId` so the stored display name stays in step. */
  className?: string
  /** Class-type capacity for the new class; the server enforces this on booking. */
  cap?: number
  instructorId?: string
  exerciseDisplay?: ExerciseDisplay
}

/**
 * Edit an existing session in place.
 *
 * Day, time and class are not independent fields: `slotId` is built from all
 * three and `startsAt` from the day and time in the studio's timezone, so both
 * are recomputed from the merged values rather than patched field by field.
 * Leaving them stale would point weekly locks at a slot that no longer exists
 * and measure the transfer window from the old start time.
 *
 * The document id also encodes the original slot and week. It is deliberately
 * left alone — renaming it would mean copying the roster subcollection — and
 * nothing reads it as data: the week query, locks and billing all use the
 * fields written here.
 */
export async function updateLiveSession(
  sessionId: string,
  current: Pick<ClassOccurrence, 'dayLabel' | 'time' | 'classTypeId'>,
  weekStart: string,
  edit: SessionEdit,
): Promise<string | null> {
  const db = getFirestoreDb()
  if (!db) return 'Firebase not configured.'

  const patch: Record<string, unknown> = {}
  if (edit.instructorId !== undefined) patch.instructorId = edit.instructorId
  if (edit.exerciseDisplay !== undefined) patch.exerciseDisplay = edit.exerciseDisplay
  if (edit.className !== undefined) patch.className = edit.className
  if (edit.cap !== undefined) patch.cap = edit.cap

  const retimed =
    edit.dayLabel !== undefined || edit.time !== undefined || edit.classTypeId !== undefined

  if (retimed) {
    const dayLabel = edit.dayLabel ?? current.dayLabel
    const time = edit.time ?? current.time
    const classTypeId = edit.classTypeId ?? current.classTypeId
    const timing = sessionTiming(weekStart, dayLabel, time, classTypeId)
    if ('error' in timing) return timing.error
    patch.dayLabel = dayLabel
    patch.time = time
    patch.classTypeId = classTypeId
    patch.slotId = timing.slotId
    patch.startsAt = timing.startsAt
  }

  if (!Object.keys(patch).length) return null

  try {
    await updateDoc(doc(db, 'sessions', sessionId), patch)
    return null
  } catch (e) {
    return e instanceof Error ? e.message : 'Could not save this change.'
  }
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
