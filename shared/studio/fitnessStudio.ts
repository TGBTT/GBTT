/**
 * The signed-in UI session, plus the pure helpers that format a timetable.
 *
 * This file used to be the whole application: a seeded `localStorage` store of
 * invented members, classes, bookings and site copy that every screen read
 * from. All of that data now lives in Firestore, and what remains here is the
 * one thing Firestore cannot supply — which account this browser is currently
 * showing, so that a page can render before an auth callback resolves and so
 * the site nav knows whether to offer "Sign in" or "Sign out".
 *
 * Authorisation is never decided here. The `role` below only chooses what to
 * draw; every request is checked against the Firebase custom claim by
 * Firestore rules and by the callable functions.
 */

export type StudioRole = 'public' | 'member' | 'admin' | 'trainer'
export type ExerciseDisplay = 'hidden' | 'defaults' | 'custom'
export type RosterStatus = 'booked' | 'attended' | 'noShow'
export type AttendeeKind = 'member' | 'guest'

export interface RosterEntry {
  memberId?: string
  displayName: string
  kind: AttendeeKind
  showName: boolean
  status?: RosterStatus
  bookedBy?: 'self' | 'admin'
  attendedAt?: string
}

export interface ClassOccurrence {
  id: string
  classTypeId: string
  dayLabel: string
  time: string
  venueId: string
  /** Session-specific exercises when exerciseDisplay is custom. */
  exerciseIds: string[]
  exerciseDisplay?: ExerciseDisplay
  /** Attendees booked for this session (members + guests). */
  bookedCount: number
  /** Session-level capacity; the server enforces this same number. */
  cap?: number
  cancelled?: boolean
  /** Recurring timetable slot this session belongs to; the key weekly locks use. */
  slotId?: string
  /** Season this session was generated for. */
  seasonId?: string
  /**
   * Absolute start instant, ISO. What the transfer window is measured from, so
   * the UI can show a deadline instead of offering an action the server will
   * refuse. Absent on older sessions written without one.
   */
  startsAt?: string
  roster: RosterEntry[]
  calendarEventId: string
  instructorId: string
}

/**
 * The account this browser is showing.
 *
 * Deliberately small. Anything richer — billing, clinical notes, plan history,
 * terms acceptance — is read live from Firestore by the screen that needs it,
 * so there is no second copy to drift out of date.
 */
export interface StudioSessionUser {
  id: string
  email: string
  name: string
  role: 'member' | 'admin' | 'trainer'
  planId: string
  classesPerWeek: number
}

/*
 * Bumped when the seed store was removed: anything stored under the old key is
 * a snapshot of the retired store, whose shape no longer applies. Sessions
 * signed in before the change simply sign in again once.
 */
export const STORAGE_KEY = 'gbtt-session-v1'
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const
export type Weekday = (typeof WEEKDAYS)[number]

interface SessionState {
  user: StudioSessionUser | null
}

function loadState(): SessionState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { user: null }
    const parsed = JSON.parse(raw) as SessionState
    return parsed?.user ? parsed : { user: null }
  } catch {
    return { user: null }
  }
}

let state: SessionState =
  typeof localStorage !== 'undefined' ? loadState() : { user: null }

/*
 * Same-tab listeners. The `storage` event only fires in *other* tabs, so a
 * component that is not the one calling the mutation (the site nav, for
 * instance) would never hear about a sign-in or sign-out without this.
 */
const listeners = new Set<() => void>()

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* ignore quota */
  }
  for (const listener of listeners) listener()
}

export function reloadStore(): void {
  if (typeof localStorage === 'undefined') return
  state = loadState()
}

/**
 * Subscribe to session changes, whether they came from this tab (a sign-in
 * calling `persist`) or another one (the `storage` event).
 */
export function subscribeStore(onChange: () => void): () => void {
  listeners.add(onChange)
  if (typeof window === 'undefined') return () => listeners.delete(onChange)
  const handler = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY || e.key === null) {
      reloadStore()
      onChange()
    }
  }
  window.addEventListener('storage', handler)
  return () => {
    listeners.delete(onChange)
    window.removeEventListener('storage', handler)
  }
}

export function getSessionUser(): StudioSessionUser | null {
  return state.user
}

export function getSessionRole(): StudioRole {
  return state.user?.role ?? 'public'
}

export function logout(): void {
  state = { user: null }
  persist()
}

/**
 * Bind a Firebase-authenticated staff member to the UI session.
 *
 * Signing in through Firebase alone would leave the console rendering as
 * logged out, because the screens ask this module who is present. What they
 * may then do is still decided by the `role` custom claim on the server.
 */
export function bindStaffSession(
  email: string,
  name: string,
  role: 'admin' | 'trainer',
): void {
  const lower = email.trim().toLowerCase()
  state = {
    user: {
      id: `staff-${lower}`,
      email: lower,
      name: name || lower,
      role,
      planId: '',
      classesPerWeek: 0,
    },
  }
  persist()
}

/** Bind a Firebase-authenticated member to the UI session. */
export function bindMemberSession(input: {
  uid: string
  email: string
  name: string
  planId: string
  classesPerWeek: number
}): void {
  const lower = input.email.trim().toLowerCase()
  state = {
    user: {
      id: input.uid,
      email: lower,
      name: input.name || lower,
      role: 'member',
      planId: input.planId,
      classesPerWeek: input.classesPerWeek,
    },
  }
  persist()
}

/*
 * ---- Display helpers ----
 *
 * Pure functions over data the caller has already fetched. They hold no state,
 * so the marketing site and both apps can share them.
 */

/**
 * Spaces left in a session.
 *
 * `cap` comes from the session document, which is the number the server
 * enforces in `bookSession`. A session without one is treated as exactly full
 * rather than as unlimited: over-promising a space is worse than under-.
 */
export function spotsLeft(occ: ClassOccurrence): number {
  return Math.max(0, capacityFor(occ) - occ.bookedCount)
}

export function capacityFor(occ: ClassOccurrence): number {
  return occ.cap ?? occ.bookedCount
}

export function sessionIsFull(occ: ClassOccurrence): boolean {
  return spotsLeft(occ) <= 0
}

/** Shared label: "12/16 attending" */
export function formatSessionAttending(occ: ClassOccurrence): string {
  return `${occ.bookedCount}/${capacityFor(occ)} attending`
}

/** Build a URL under the Vite base (same pattern as hero logo assets). */
export function publicAssetUrl(baseUrl: string, path: string): string {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  return `${base}${path.replace(/^\//, '')}`
}

/** Responsive card image paths under /images/classes/{id}/ */
export function classImageSources(
  classTypeId: string,
  baseUrl: string,
  variant: 'card' | 'thumb' = 'card',
) {
  const dir = publicAssetUrl(baseUrl, `images/classes/${classTypeId}`)
  if (variant === 'thumb') {
    return {
      webpSrcSet: `${dir}/card-480.webp 480w`,
      jpgSrcSet: `${dir}/card-480.jpg 480w`,
      fallback: `${dir}/card-480.jpg`,
      primary: `${dir}/primary.jpg`,
      sizes: '116px',
    }
  }
  return {
    webpSrcSet: [480, 800, 1200].map((w) => `${dir}/card-${w}.webp ${w}w`).join(', '),
    jpgSrcSet: [480, 800, 1200].map((w) => `${dir}/card-${w}.jpg ${w}w`).join(', '),
    fallback: `${dir}/card-800.jpg`,
    primary: `${dir}/primary.jpg`,
    sizes: '(max-width: 640px) 100vw, (max-width: 960px) 50vw, 420px',
  }
}

/**
 * Which exercises to show for one session.
 *
 * A session may override the class-type default list, or hide it entirely
 * when the trainer would rather not commit in advance.
 */
export function sessionExercises(
  occ: ClassOccurrence,
  classTypeExerciseIds: string[],
  exercises: { id: string; name: string }[],
): { id: string; name: string }[] {
  const display = occ.exerciseDisplay ?? 'defaults'
  if (display === 'hidden') return []
  const ids =
    display === 'custom' && occ.exerciseIds.length > 0 ? occ.exerciseIds : classTypeExerciseIds
  return ids
    .map((id) => exercises.find((e) => e.id === id))
    .filter((e): e is { id: string; name: string } => Boolean(e))
}

/**
 * Classmate names a viewer is allowed to see.
 *
 * Staff see the roll. A member sees only those who opted in, and only if they
 * are in the class themselves.
 */
export function visibleRosterNames(
  occ: ClassOccurrence,
  viewer: StudioSessionUser | null,
): string[] {
  if (!viewer || viewer.role === 'admin' || viewer.role === 'trainer') {
    return occ.roster.map((r) => r.displayName)
  }
  const shares = occ.roster.some((r) => r.memberId === viewer.id)
  if (!shares) return []
  return occ.roster.filter((r) => r.showName).map((r) => r.displayName)
}

export function formatTimetableTime(time: string): string {
  const [hStr, mStr = '00'] = time.split(':')
  let h = parseInt(hStr, 10)
  const ampm = h >= 12 ? 'pm' : 'am'
  if (h === 0) h = 12
  else if (h > 12) h -= 12
  return `${h}.${mStr}${ampm}`
}

function timeSortKey(time: string): number {
  const [h, m = '0'] = time.split(':')
  return parseInt(h, 10) * 60 + parseInt(m, 10)
}

/** Unique session times across the week, ascending. */
export function timetableTimes(byDay: Record<Weekday, ClassOccurrence[]>): string[] {
  const times = new Set<string>()
  for (const day of WEEKDAYS) {
    for (const occ of byDay[day] ?? []) times.add(occ.time)
  }
  return [...times].sort((a, b) => timeSortKey(a) - timeSortKey(b))
}
