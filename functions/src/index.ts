import { randomBytes } from 'node:crypto'
import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import {
  FieldValue,
  getFirestore,
  Timestamp,
  type QueryDocumentSnapshot,
} from 'firebase-admin/firestore'
import { defineSecret, defineString } from 'firebase-functions/params'
import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { setGlobalOptions } from 'firebase-functions/v2/options'
import {
  commitmentFromSessions,
  isPastTransferCutoff,
  weekStartKeyInZone,
  zoneOffsetMs,
  type TimedSession,
} from './weeklyCommitment'

initializeApp()

const db = getFirestore()
const auth = getAuth()

const formEndpoint = defineString('FORM_ENDPOINT', {
  description: 'Apps Script web app URL (same as VITE_FORM_ENDPOINT)',
  default: '',
})
const webhookSecret = defineSecret('FUNCTIONS_WEBHOOK_SECRET')

const signInUrl = defineString('SIGN_IN_URL', {
  description: 'Where Firebase sends people after they set or reset their password',
  default: 'https://gbtt.co.nz/app/signin/',
})

/**
 * Sends the person to the sign-in page once Firebase has taken their new
 * password, instead of leaving them on Firebase's bare confirmation screen with
 * nowhere to go.
 *
 * `handleCodeInApp: false` keeps Firebase's own handler doing the actual reset —
 * this only adds the continue link at the end of it. The domain must be listed
 * under Authentication → Settings → Authorized domains or Firebase rejects it.
 */
function passwordActionSettings() {
  return { url: signInUrl.value(), handleCodeInApp: false }
}

setGlobalOptions({ region: 'australia-southeast1' })

type AppsScriptResult = { ok: boolean; error?: string; data?: unknown }

/** POST signed payload to Tom's Apps Script web app (VITE_FORM_ENDPOINT pattern). */
async function callAppsScript(
  payload: Record<string, unknown>,
  secret: string,
  endpoint: string,
): Promise<AppsScriptResult> {
  const url = endpoint.trim()
  if (!url || url.includes('YOUR_DEPLOYMENT_ID')) {
    return { ok: false, error: 'FORM_ENDPOINT is not configured' }
  }
  if (!secret.trim()) {
    return { ok: false, error: 'FUNCTIONS_WEBHOOK_SECRET is not configured' }
  }

  const body = JSON.stringify({ ...payload, webhookSecret: secret.trim() })

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body,
  })

  const text = await res.text()
  try {
    const data = JSON.parse(text) as { ok?: boolean; error?: string }
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error ?? `Apps Script HTTP ${res.status}` }
    }
    return { ok: true, data }
  } catch {
    return { ok: false, error: `Invalid Apps Script response: ${text.slice(0, 200)}` }
  }
}

function requireAuth(request: { auth?: { uid: string; token: Record<string, unknown> } }) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.')
  }
  return request.auth
}

function requireAdmin(request: { auth?: { uid: string; token: Record<string, unknown> } }) {
  const authCtx = requireAuth(request)
  if (authCtx.token.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Admin role required.')
  }
  return authCtx
}

function requireStaff(request: { auth?: { uid: string; token: Record<string, unknown> } }) {
  const authCtx = requireAuth(request)
  const role = authCtx.token.role
  // `trainer` is canonical; `substitute` was its previous name and is still
  // honoured so pre-rename tokens keep working. Remove once no legacy claims
  // exist.
  if (role !== 'admin' && role !== 'trainer' && role !== 'substitute') {
    throw new HttpsError('permission-denied', 'Staff role required.')
  }
  return authCtx
}

function guestPassCode(): string {
  return randomBytes(4).toString('hex').toUpperCase()
}

/* —————————————————————— Seasons ——————————————————————
 *
 * A season is an admin-defined stretch of the calendar — a school term, a
 * short summer block, or a full year — with closure periods carved out of it.
 * It does two jobs: it decides which sessions exist, and it decides what a
 * member is billed for.
 *
 * The two billing modes exist because the studio has not settled on one:
 *
 *   arrears  Invoice at the end for the seats actually held. Holidays need no
 *            special handling, because a week with no sessions produces no
 *            seats and so no charge.
 *   upfront  Quote and invoice the whole season when the member enrols, from
 *            a count of the sessions their slots will produce.
 *
 * Both read the same session data, so a season can be switched between them
 * without redefining anything.
 */

const TIME_ZONE = 'Pacific/Auckland'

const SEASON_DAY_INDEX: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4 }

interface SeasonBreak {
  label: string
  startDate: string
  endDate: string
}

interface Season {
  id: string
  name: string
  startDate: string
  endDate: string
  billingMode: 'arrears' | 'upfront'
  breaks: SeasonBreak[]
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/**
 * Studio wall-clock time to a UTC instant, resolved twice so a session near a
 * daylight-saving change lands on the right side of the transition. The
 * transfer window is measured from this, so an hour of drift is a real bug.
 */
function zonedToUtc(year: number, month: number, day: number, hour: number, minute: number): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute)
  let instant = guess - zoneOffsetMs(guess, TIME_ZONE)
  instant = guess - zoneOffsetMs(instant, TIME_ZONE)
  return new Date(instant)
}

/** Monday of the week containing `d`. */
function mondayOf(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const dow = out.getDay()
  out.setDate(out.getDate() + (dow === 0 ? -6 : 1 - dow))
  return out
}

function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  if (!y || !m || !d) {
    throw new HttpsError('invalid-argument', `Expected a YYYY-MM-DD date, got "${key}".`)
  }
  return new Date(y, m - 1, d)
}

async function loadSeason(seasonId: string): Promise<Season> {
  const snap = await db.doc(`seasons/${seasonId}`).get()
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Season not found.')
  }
  const data = snap.data() ?? {}
  const startDate = String(data.startDate ?? '')
  const endDate = String(data.endDate ?? '')
  if (!startDate || !endDate) {
    throw new HttpsError('failed-precondition', 'This season has no start and end date set.')
  }
  if (endDate < startDate) {
    throw new HttpsError('failed-precondition', 'Season end date falls before its start date.')
  }

  const breaks = Array.isArray(data.breaks)
    ? (data.breaks as Record<string, unknown>[]).map((b) => ({
        label: String(b.label ?? 'Closed'),
        startDate: String(b.startDate ?? ''),
        endDate: String(b.endDate ?? ''),
      }))
    : []

  return {
    id: snap.id,
    name: String(data.name ?? snap.id),
    startDate,
    endDate,
    billingMode: data.billingMode === 'upfront' ? 'upfront' : 'arrears',
    breaks: breaks.filter((b) => b.startDate && b.endDate),
  }
}

/** Whether a date falls inside any closure period. Both ends are inclusive. */
function isClosed(day: string, breaks: SeasonBreak[]): boolean {
  return breaks.some((b) => day >= b.startDate && day <= b.endDate)
}

/**
 * Every date a season's sessions could fall on, closure periods removed.
 *
 * Returned as `{ weekStart, day, dayLabel }` because sessions are filed under
 * the Monday of their week — the key the timetable subscribes to — while the
 * closure check has to be made against the session's own date, not its week.
 * A break covering only part of a week must cancel only the days it covers.
 */
function seasonDays(season: Season): { weekStart: string; day: string; dayLabel: string }[] {
  const out: { weekStart: string; day: string; dayLabel: string }[] = []
  const start = parseDateKey(season.startDate)
  const end = parseDateKey(season.endDate)

  for (let week = mondayOf(start); week <= end; week.setDate(week.getDate() + 7)) {
    const weekStart = dateKey(week)
    for (const [label, offset] of Object.entries(SEASON_DAY_INDEX)) {
      const date = new Date(week.getFullYear(), week.getMonth(), week.getDate() + offset)
      const day = dateKey(date)
      if (day < season.startDate || day > season.endDate) continue
      if (isClosed(day, season.breaks)) continue
      out.push({ weekStart, day, dayLabel: label })
    }
  }

  return out
}

function periodEndFromStart(periodStart: string): string {
  const start = new Date(`${periodStart}T00:00:00.000Z`)
  const end = new Date(start)
  end.setUTCMonth(end.getUTCMonth() + 1)
  end.setUTCDate(end.getUTCDate() - 1)
  return end.toISOString().slice(0, 10)
}

interface BillingLineItem {
  sessionId: string
  label: string
  amountCents: number
}

/**
 * Sends the set-password invite via Apps Script.
 *
 * A failure here is reported, never thrown: the Auth user and profile are
 * already written by the time we get here, so throwing would leave the admin
 * with an account they think failed to create. The caller surfaces the reason.
 */
async function sendInviteEmail(invite: {
  email: string
  name: string
  phone: string
  planId: string
  resetLink: string
}): Promise<AppsScriptResult> {
  const result = await callAppsScript(
    { action: 'sendInvite', ...invite, source: 'cloud-function' },
    webhookSecret.value(),
    formEndpoint.value(),
  )
  if (!result.ok) {
    console.error(`sendInvite failed for ${invite.email}: ${result.error}`)
  }
  return result
}

/** Admin creates a member Auth user + Firestore profile; sends invite / password reset. */
export const createMemberAccount = onCall(
  { secrets: [webhookSecret] },
  async (request) => {
    requireAdmin(request)

    const email = String(request.data?.email ?? '')
      .trim()
      .toLowerCase()
    const name = String(request.data?.name ?? '').trim()
    const phone = String(request.data?.phone ?? '').trim()
    const planId = String(request.data?.planId ?? 'weekly1').trim()
    const classesPerWeek = Number(request.data?.classesPerWeek ?? 1)

    if (!email || !name) {
      throw new HttpsError('invalid-argument', 'Name and email are required.')
    }

    // The phone number is kept on the Firestore profile rather than on the Auth
    // record: Auth requires E.164 and would reject the local formats Tom's
    // client list is written in, and nothing signs in by phone.
    const userRecord = await auth.createUser({ email, displayName: name })
    await auth.setCustomUserClaims(userRecord.uid, { role: 'member' })

    await db.doc(`users/${userRecord.uid}`).set({
      profile: {
        name,
        email,
        phone,
        role: 'member',
        status: 'active',
      },
      membership: {
        planId,
        classesPerWeek,
        weeklySlotIds: [],
        creditsRemaining: 0,
      },
      preferences: { showNameToClassmates: true },
      compliance: {},
      billing: { balanceCents: 0 },
      clinical: { riskNotes: '', limitations: '' },
      attendanceSummary: { totalAttended: 0 },
      createdAt: FieldValue.serverTimestamp(),
      createdBy: request.auth!.uid,
    })

    const resetLink = await auth.generatePasswordResetLink(email, passwordActionSettings())
    const scriptResult = await sendInviteEmail({ email, name, phone, planId, resetLink })

    await db.collection('audit').add({
      type: 'createMemberAccount',
      targetUid: userRecord.uid,
      actorUid: request.auth!.uid,
      at: FieldValue.serverTimestamp(),
      appsScriptOk: scriptResult.ok,
      appsScriptError: scriptResult.error ?? null,
    })

    return {
      ok: true,
      uid: userRecord.uid,
      resetLink,
      inviteEmailSent: scriptResult.ok,
      inviteError: scriptResult.error ?? null,
    }
  },
)

/** Re-issues a set-password link and re-sends the invite email to an existing member. */
export const resendInvite = onCall({ secrets: [webhookSecret] }, async (request) => {
  requireAdmin(request)

  const email = String(request.data?.email ?? '')
    .trim()
    .toLowerCase()
  if (!email) {
    throw new HttpsError('invalid-argument', 'Email is required.')
  }

  let userRecord
  try {
    userRecord = await auth.getUserByEmail(email)
  } catch {
    throw new HttpsError('not-found', `No account exists for ${email}.`)
  }

  const snap = await db.doc(`users/${userRecord.uid}`).get()
  const profile = (snap.data()?.profile ?? {}) as { name?: string; phone?: string }
  const membership = (snap.data()?.membership ?? {}) as { planId?: string }

  const resetLink = await auth.generatePasswordResetLink(email, passwordActionSettings())
  const scriptResult = await sendInviteEmail({
    email,
    name: profile.name || userRecord.displayName || email,
    phone: profile.phone ?? '',
    planId: membership.planId ?? '',
    resetLink,
  })

  await db.collection('audit').add({
    type: 'resendInvite',
    targetUid: userRecord.uid,
    actorUid: request.auth!.uid,
    at: FieldValue.serverTimestamp(),
    appsScriptOk: scriptResult.ok,
    appsScriptError: scriptResult.error ?? null,
  })

  if (!scriptResult.ok) {
    throw new HttpsError('internal', scriptResult.error ?? 'Invite email failed to send.')
  }

  return { ok: true, uid: userRecord.uid, resetLink }
})

/** Admin triggers Firebase password reset email for a member. */
export const adminResetPassword = onCall(async (request) => {
  requireAdmin(request)

  const email = String(request.data?.email ?? '')
    .trim()
    .toLowerCase()
  if (!email) {
    throw new HttpsError('invalid-argument', 'Email is required.')
  }

  const resetLink = await auth.generatePasswordResetLink(email, passwordActionSettings())

  await db.collection('audit').add({
    type: 'adminResetPassword',
    email,
    actorUid: request.auth!.uid,
    at: FieldValue.serverTimestamp(),
  })

  return { ok: true, resetLink }
})

/**
 * Email the member a calendar invite when they book, and a cancellation when
 * they leave.
 *
 * This deliberately does NOT push attendance counts to the shared calendar.
 * Counts change all day and the website already shows them live from
 * Firestore, so syncing them here would burn Apps Script quota and, on any
 * event carrying guests, email everyone repeatedly. The shared class calendar
 * is updated by onSessionWrite instead, only when the schedule itself moves.
 */
export const onRosterWrite = onDocumentWritten(
  {
    document: 'sessions/{sessionId}/roster/{userId}',
    secrets: [webhookSecret],
  },
  async (event) => {
    const sessionId = event.params.sessionId
    const userId = event.params.userId

    const existedBefore = event.data?.before.exists ?? false
    const existsAfter = event.data?.after.exists ?? false

    // Status edits (booked -> attended during role-call) must not re-send.
    if (existedBefore === existsAfter) {
      return
    }

    /*
     * Locking a weekly slot writes one roster entry per remaining week of the
     * season, and releasing it deletes them all. Mailing per document turned a
     * single member action into a dozen near-identical emails, so those
     * entries are marked and the caller sends one recurring invite instead.
     */
    const entry = (existsAfter ? event.data?.after : event.data?.before)?.data() ?? {}
    if (entry.inviteSuppressed === true) {
      return
    }

    const sessionSnap = await db.doc(`sessions/${sessionId}`).get()
    if (!sessionSnap.exists) {
      return
    }
    const session = sessionSnap.data() ?? {}

    const userSnap = await db.doc(`users/${userId}`).get()
    const profile = (userSnap.data()?.profile as Record<string, unknown>) ?? {}
    const memberEmail = String(profile.email ?? '')
    if (!memberEmail) {
      return
    }

    let className = String(session.className ?? '')
    const classTypeId = String(session.classTypeId ?? '')
    if (!className && classTypeId) {
      const classSnap = await db.doc(`classTypes/${classTypeId}`).get()
      className = String(classSnap.data()?.name ?? classTypeId)
    }

    const result = await callAppsScript(
      {
        action: existsAfter ? 'sendBookingInvite' : 'sendBookingCancellation',
        memberEmail,
        memberName: String(profile.name ?? ''),
        sessionId,
        weekStart: String(session.weekStart ?? ''),
        dayLabel: String(session.dayLabel ?? ''),
        time: String(session.time ?? ''),
        className,
        venue: String(session.venue ?? ''),
        durationMinutes: Number(session.durationMinutes ?? 60),
        source: 'onRosterWrite',
      },
      webhookSecret.value(),
      formEndpoint.value(),
    )

    if (!result.ok) {
      console.error('booking calendar email failed', sessionId, userId, result.error)
    }
  },
)

/** Schedule fields that justify rewriting the shared calendar event. */
const SCHEDULE_FIELDS = [
  'weekStart',
  'dayLabel',
  'time',
  'classTypeId',
  'className',
  'instructorId',
  'venue',
  'durationMinutes',
  'cancelled',
] as const

/**
 * Take a session's event off the shared calendar.
 *
 * Matched on the stored `calendarEventId` first, falling back to a search for
 * `sessionId` within the week: sessions written before the id was kept have
 * nothing else to match on, and the fallback is what stops those being
 * stranded on subscribers' calendars.
 */
async function deleteSharedCalendarEvent(
  sessionId: string,
  fields: Record<string, unknown>,
  source: string,
  // Present when the session document survives the deletion — a cancelled
  // session, as opposed to one that was deleted outright.
  ref?: FirebaseFirestore.DocumentReference,
): Promise<void> {
  const result = await callAppsScript(
    {
      action: 'calendarDeleteSession',
      sessionId,
      calendarEventId: String(fields.calendarEventId ?? ''),
      weekStart: String(fields.weekStart ?? ''),
      source,
    },
    webhookSecret.value(),
    formEndpoint.value(),
  )

  if (!result.ok) {
    console.error('calendarDeleteSession failed', sessionId, result.error)
    return
  }

  /*
   * Forget the id along with the event. Keeping it would point a later
   * un-cancelling of this session at an event that no longer exists; the
   * upsert would fall back to scanning the week for it, find nothing, and
   * create a second event while still holding the dead id.
   */
  if (ref && fields.calendarEventId) {
    await ref.set({ calendarEventId: FieldValue.delete() }, { merge: true })
  }
}

/**
 * Keep the shared class calendar in step with the timetable.
 *
 * Guarded on the schedule fields so the bookedCount churn written by every
 * booking does not trigger a calendar write — that churn is exactly what made
 * the previous roster-driven sync too noisy.
 */
export const onSessionWrite = onDocumentWritten(
  { document: 'sessions/{sessionId}', secrets: [webhookSecret] },
  async (event) => {
    const before = event.data?.before.data()
    const after = event.data?.after.data()
    const sessionId = event.params.sessionId

    /*
     * A class that has stopped running has to come off the shared calendar, or
     * everyone subscribed to it keeps an entry for a session nobody can
     * attend. Both ways of removing one arrive here: `removeSession` deletes
     * the document when nobody had booked, and flags it `cancelled` when a
     * roster had to be kept for attendance and billing.
     */
    if (!after) {
      if (before) await deleteSharedCalendarEvent(sessionId, before, 'onSessionWrite:deleted')
      return
    }

    if (after.cancelled === true) {
      // Only on the transition, so re-saving an already-cancelled session does
      // not spend a call trying to delete an event that is already gone.
      if (before?.cancelled !== true) {
        await deleteSharedCalendarEvent(
          sessionId,
          after,
          'onSessionWrite:cancelled',
          event.data?.after.ref,
        )
      }
      return
    }

    /*
     * Generating a season writes hundreds of sessions at once, and one Apps
     * Script call each would run them straight into the concurrent-execution
     * limit. Those writes carry a marker; the generator makes a single batched
     * call for the lot and clears it. Clearing it lands here again, but by then
     * no schedule field has changed, so the check below returns without a call.
     */
    if (after.calendarBatch === true) {
      return
    }

    if (before) {
      const changed = SCHEDULE_FIELDS.some(
        (field) => JSON.stringify(before[field]) !== JSON.stringify(after[field]),
      )
      if (!changed) {
        return
      }
    }

    const result = await callAppsScript(
      {
        action: 'calendarUpsertSession',
        sessionId,
        calendarEventId: String(after.calendarEventId ?? ''),
        weekStart: String(after.weekStart ?? ''),
        dayLabel: String(after.dayLabel ?? ''),
        time: String(after.time ?? ''),
        className: String(after.className ?? after.classTypeId ?? ''),
        venue: String(after.venue ?? ''),
        durationMinutes: Number(after.durationMinutes ?? 60),
        source: 'onSessionWrite',
      },
      webhookSecret.value(),
      formEndpoint.value(),
    )

    if (!result.ok) {
      console.error('calendarUpsertSession failed', sessionId, result.error)
      return
    }

    /*
     * Keep the event id so a later move or removal targets that event exactly
     * rather than searching the week for it. `calendarEventId` is not a
     * schedule field, so writing it back does not re-trigger this sync.
     */
    const eventId = String(
      (result.data as { calendarEventId?: string } | undefined)?.calendarEventId ?? '',
    )
    if (eventId && eventId !== String(after.calendarEventId ?? '')) {
      await event.data?.after.ref.set({ calendarEventId: eventId }, { merge: true })
    }
  },
)

/**
 * A day. The subscribe links only change when the calendar itself is replaced,
 * and every member app load would otherwise spend an Apps Script call on them.
 */
const CALENDAR_LINKS_CACHE_MS = 24 * 60 * 60 * 1000

interface CalendarSubscribeLinks {
  calendarId: string
  publicUrl: string
  icsUrl: string
  htmlLink: string
}

function readCalendarLinks(data: Record<string, unknown> | undefined): CalendarSubscribeLinks {
  return {
    calendarId: String(data?.calendarId ?? ''),
    publicUrl: String(data?.publicUrl ?? ''),
    icsUrl: String(data?.icsUrl ?? ''),
    htmlLink: String(data?.htmlLink ?? ''),
  }
}

/**
 * Where to subscribe to the shared class timetable.
 *
 * Open to any signed-in account rather than staff: adding the timetable to a
 * personal diary is exactly what a member wants it for. The links are Google's
 * public calendar URLs, so they only resolve once the calendar itself has been
 * shared publicly in Google Calendar's settings.
 *
 * A stale cache is served in preference to an error, because a link that was
 * right yesterday is still more use than a failure message.
 */
export const getCalendarSubscribeUrl = onCall({ secrets: [webhookSecret] }, async (request) => {
  requireAuth(request)

  const cacheRef = db.doc('meta/calendarSubscribe')
  const cached = (await cacheRef.get()).data()
  const cachedLinks = readCalendarLinks(cached)
  const fetchedAt = cached?.fetchedAt instanceof Timestamp ? cached.fetchedAt.toMillis() : 0

  if (cachedLinks.icsUrl && Date.now() - fetchedAt < CALENDAR_LINKS_CACHE_MS) {
    return { ok: true, ...cachedLinks }
  }

  const result = await callAppsScript(
    { action: 'calendarGetSubscribeUrl', source: 'getCalendarSubscribeUrl' },
    webhookSecret.value(),
    formEndpoint.value(),
  )

  if (!result.ok) {
    if (cachedLinks.icsUrl) return { ok: true, ...cachedLinks }
    throw new HttpsError(
      'unavailable',
      result.error ?? 'The shared calendar is not configured yet.',
    )
  }

  const links = readCalendarLinks(result.data as Record<string, unknown> | undefined)
  if (!links.icsUrl) {
    throw new HttpsError('unavailable', 'The shared calendar returned no subscribe address.')
  }

  await cacheRef.set({ ...links, fetchedAt: FieldValue.serverTimestamp() }, { merge: true })

  return { ok: true, ...links }
})

/** Admin callable — compute owed amount for a billing period from attended roster entries. */
export const calculateBillingPeriod = onCall(async (request) => {
  requireAdmin(request)

  const uid = String(request.data?.uid ?? '').trim()
  const seasonId = String(request.data?.seasonId ?? '').trim()
  const requestedStart = String(request.data?.periodStart ?? '').trim()

  if (!uid) {
    throw new HttpsError('invalid-argument', 'uid is required.')
  }
  if (!seasonId && !requestedStart) {
    throw new HttpsError('invalid-argument', 'Pass either a seasonId or a periodStart (YYYY-MM-DD).')
  }

  /*
   * A season and a calendar month are the same thing here: a date range to
   * total seats over. Seasons are the configurable form — a term, a short
   * summer block or a full year — and a month remains available so billing
   * can run on a rolling cycle before any season is defined.
   */
  const season = seasonId ? await loadSeason(seasonId) : null
  const periodStart = season ? season.startDate : requestedStart

  const userSnap = await db.doc(`users/${uid}`).get()
  if (!userSnap.exists) {
    throw new HttpsError('not-found', 'Member not found.')
  }

  const user = userSnap.data() ?? {}
  const membership = (user.membership as Record<string, unknown>) ?? {}
  const billing = (user.billing as Record<string, unknown>) ?? {}
  const planId = String(membership.planId ?? 'casual')

  const planSnap = await db.doc(`pricingPlans/${planId}`).get()
  const plan = planSnap.data() ?? {}
  // The tier's per-class rate is the whole price signal; the seat count comes
  // from the roster rather than the plan allowance.
  const ratePerClass = Number(plan.ratePerClass ?? 0)

  const periodEnd = season ? season.endDate : periodEndFromStart(periodStart)
  const startTs = Timestamp.fromDate(new Date(`${periodStart}T00:00:00.000Z`))
  const endTs = Timestamp.fromDate(new Date(`${periodEnd}T23:59:59.999Z`))

  /*
   * Every seat held in the period is charged, not just the ones attended.
   *
   * A booked seat holds a place that nobody else could take, so the terms
   * members accept on join make it non-refundable once the transfer window has
   * closed — a no-show is still billed. Members who want out cancel or transfer
   * before the window, which removes the roster entry entirely and so removes
   * the charge with it.
   *
   * There is deliberately no separate subscription line. The tier a member is
   * on sets their per-class rate — the more classes a week, the lower the rate —
   * and that rate is already applied to each seat below. Adding a plan fee on
   * top billed those same classes twice. The rates themselves live in
   * `pricingPlans`, set from Pricing in the admin console.
   */
  const rosterQuery = await db.collectionGroup('roster').where('memberId', '==', uid).get()

  const chargeable = rosterQuery.docs.filter((d) => {
    const status = String(d.data()?.status ?? 'booked')
    return status === 'booked' || status === 'attended' || status === 'noShow'
  })

  /*
   * Fetch the sessions in bulk rather than one per roster entry. A member with
   * a full year of bookings has a few hundred entries, and reading each one
   * inside the loop meant that many sequential round trips — enough to push the
   * callable towards its timeout on exactly the members whose invoices matter
   * most. `getAll` is chunked because it takes a bounded number of refs.
   */
  const sessionIds = [
    ...new Set(chargeable.map((d) => d.ref.parent.parent?.id).filter((id): id is string => !!id)),
  ]

  const sessions = new Map<string, Record<string, unknown>>()
  const CHUNK = 300
  for (let i = 0; i < sessionIds.length; i += CHUNK) {
    const refs = sessionIds.slice(i, i + CHUNK).map((id) => db.doc(`sessions/${id}`))
    const snaps = await db.getAll(...refs)
    for (const snap of snaps) {
      if (snap.exists) sessions.set(snap.id, snap.data() ?? {})
    }
  }

  const lineItems: BillingLineItem[] = []
  let attendedCount = 0
  let chargeableCount = 0

  for (const rosterDoc of chargeable) {
    const entry = rosterDoc.data() ?? {}
    const status = String(entry.status ?? 'booked')

    const sessionId = rosterDoc.ref.parent.parent?.id
    if (!sessionId) {
      continue
    }

    const session = sessions.get(sessionId) ?? {}
    const weekStart = String(session.weekStart ?? '')
    if (!weekStart) {
      continue
    }

    // An archived session still bills: the seat was held and the class ran or
    // the member failed to release it in time.
    const sessionDate = new Date(`${weekStart}T00:00:00.000Z`)
    if (sessionDate < startTs.toDate() || sessionDate > endTs.toDate()) {
      continue
    }

    if (status === 'attended') {
      attendedCount += 1
    }
    chargeableCount += 1

    // Drop-ins carry the rate they were quoted at booking time, so a later
    // change to the price list cannot alter an extra already agreed to.
    const amountCents =
      entry.chargeRateCents != null
        ? Number(entry.chargeRateCents)
        : Math.round(ratePerClass * 100)

    const suffix = entry.dropIn ? ' · drop-in' : status === 'noShow' ? ' · no-show' : ''
    lineItems.push({
      sessionId,
      label: `${weekStart} · ${String(session.slotId ?? sessionId)}${suffix}`,
      amountCents,
    })
  }

  const subtotalCents = lineItems.reduce((sum, item) => sum + item.amountCents, 0)

  const customDiscountPct = Number(billing.customDiscountPct ?? 0)
  const discountId = billing.discountId as string | undefined
  let discountCents = 0

  if (discountId) {
    const discountSnap = await db.doc(`pricingDiscounts/${discountId}`).get()
    const discount = discountSnap.data() ?? {}
    const discountType = String(discount.type ?? 'percent')
    const discountValue = Number(discount.value ?? 0)
    if (discountType === 'percent') {
      discountCents = Math.round(subtotalCents * (discountValue / 100))
    } else {
      discountCents = Math.round(discountValue * 100)
    }
  } else if (customDiscountPct > 0) {
    discountCents = Math.round(subtotalCents * (customDiscountPct / 100))
  }

  const exceptionsSnap = await db.collection(`users/${uid}/exceptions`).get()
  let adjustmentCents = 0
  for (const ex of exceptionsSnap.docs) {
    adjustmentCents += Number(ex.data().billingAdjustmentCents ?? 0)
  }

  const totalCents = Math.max(0, subtotalCents - discountCents + adjustmentCents)
  // Keyed by season where there is one so re-running replaces that season's
  // invoice rather than filing a second one under its start date.
  const periodId = season ? season.id : periodStart

  await db.doc(`users/${uid}/billingPeriods/${periodId}`).set({
    periodStart,
    periodEnd,
    seasonId: season?.id ?? null,
    seasonName: season?.name ?? null,
    billingMode: season?.billingMode ?? 'arrears',
    planId,
    lineItems,
    attendedCount,
    chargeableCount,
    subtotalCents,
    discountCents,
    adjustmentCents,
    totalCents,
    status: 'owed',
    calculatedAt: FieldValue.serverTimestamp(),
    calculatedBy: request.auth!.uid,
  })

  return {
    ok: true,
    periodId,
    periodStart,
    periodEnd,
    lineItems,
    attendedCount,
    chargeableCount,
    subtotalCents,
    discountCents,
    adjustmentCents,
    totalCents,
  }
})

/**
 * How many sessions go to Apps Script in one call.
 *
 * Small enough that a chunk finishes well inside the Apps Script execution
 * limit, large enough that a full year is tens of calls rather than hundreds.
 */
const CALENDAR_BATCH_SIZE = 25

/**
 * Put freshly generated sessions on the shared calendar in batches.
 *
 * These sessions were written carrying `calendarBatch`, which holds the
 * per-document trigger off them. The marker is cleared either way: a session
 * left marked would never sync again, and a missing calendar entry is better
 * repaired by the next edit than never.
 */
async function batchSyncSessionsToCalendar(
  sessions: { id: string; data: Record<string, unknown> }[],
): Promise<{ synced: number; failed: number }> {
  let synced = 0
  let failed = 0

  for (let i = 0; i < sessions.length; i += CALENDAR_BATCH_SIZE) {
    const chunk = sessions.slice(i, i + CALENDAR_BATCH_SIZE)
    const result = await callAppsScript(
      {
        action: 'calendarUpsertSessions',
        sessions: chunk.map((s) => ({
          sessionId: s.id,
          weekStart: String(s.data.weekStart ?? ''),
          dayLabel: String(s.data.dayLabel ?? ''),
          time: String(s.data.time ?? ''),
          className: String(s.data.className ?? s.data.classTypeId ?? ''),
          venue: String(s.data.venue ?? ''),
          durationMinutes: Number(s.data.durationMinutes ?? 60),
        })),
        source: 'generateSeasonSessions',
      },
      webhookSecret.value(),
      formEndpoint.value(),
    )

    const results = Array.isArray((result.data as { results?: unknown })?.results)
      ? ((result.data as { results: { sessionId?: string; calendarEventId?: string }[] }).results)
      : []
    const eventIds = new Map(
      results
        .filter((r) => r.sessionId && r.calendarEventId)
        .map((r) => [String(r.sessionId), String(r.calendarEventId)]),
    )

    if (!result.ok) {
      console.error('calendarUpsertSessions failed', result.error)
    }

    const writer = db.batch()
    for (const s of chunk) {
      const eventId = eventIds.get(s.id)
      if (eventId) synced += 1
      else failed += 1
      writer.set(
        db.doc(`sessions/${s.id}`),
        {
          calendarBatch: FieldValue.delete(),
          ...(eventId ? { calendarEventId: eventId } : {}),
        },
        { merge: true },
      )
    }
    await writer.commit()
  }

  return { synced, failed }
}

/**
 * Give members who hold a weekly slot their seats in newly generated sessions.
 *
 * A lock is sold as "the same day and time every week", but the fan-out that
 * turns it into roster entries can only cover the weeks that exist when the
 * member locks it. Generating a season creates later weeks, and without this
 * the member holds a lock the roll call, capacity and billing cannot see, and
 * their calendar stops at whatever the season looked like on the day they
 * enrolled.
 *
 * Booking is idempotent — an existing entry reports `already-booked` — so this
 * runs on every generate, not only the first.
 */
async function fanWeeklyLocksIntoSessions(
  sessions: { id: string; data: Record<string, unknown> }[],
): Promise<{ seats: number; full: string[]; members: number }> {
  const currentWeek = currentWeekStartKey()
  const upcoming = sessions.filter((s) => String(s.data.weekStart ?? '') >= currentWeek)
  if (!upcoming.length) return { seats: 0, full: [], members: 0 }

  const locksSnap = await db.collectionGroup('weeklyLocks').get()
  if (locksSnap.empty) return { seats: 0, full: [], members: 0 }

  const holders = new Map<string, string[]>()
  for (const lock of locksSnap.docs) {
    const uid = lock.ref.parent.parent?.id
    if (!uid) continue
    const slotId = String(lock.data()?.slotId ?? lock.id)
    holders.set(slotId, [...(holders.get(slotId) ?? []), uid])
  }

  const uids = [...new Set([...holders.values()].flat())]
  const userSnaps = await db.getAll(...uids.map((uid) => db.doc(`users/${uid}`)))
  const members = new Map(
    userSnaps
      .filter((snap) => {
        const profile = (snap.data()?.profile as Record<string, unknown>) ?? {}
        // An archived member keeps their history but stops being enrolled.
        return snap.exists && String(profile.status ?? '') === 'active'
      })
      .map((snap) => [snap.id, snap.data() ?? {}]),
  )

  let seats = 0
  const full = new Set<string>()
  const touched = new Set<string>()

  for (const session of upcoming) {
    const slotId = String(session.data.slotId ?? '')
    for (const uid of holders.get(slotId) ?? []) {
      const user = members.get(uid)
      if (!user) continue

      const result = await bookMemberIntoSession(
        session.id,
        uid,
        (user.profile as Record<string, unknown>) ?? {},
        (user.preferences as Record<string, unknown>) ?? {},
        'self',
        // Included: this seat is what the weekly allowance already pays for.
        { dropIn: false, chargeRateCents: 0 },
        true,
      )

      if (result === 'booked') {
        seats += 1
        touched.add(`${uid}|${slotId}`)
      } else if (result === 'full') {
        full.add(session.id)
      }
    }
  }

  // One re-issued invite per member per slot, covering every week they now
  // hold, rather than one email per seat taken.
  for (const pair of touched) {
    const [uid, slotId] = pair.split('|')
    const profile = (members.get(uid)?.profile as Record<string, unknown>) ?? {}
    await refreshSlotSeries(uid, slotId, profile)
  }

  return { seats, full: [...full], members: touched.size }
}

/**
 * Create every session a season implies, from the recurring timetable slots.
 *
 * Idempotent: session ids are derived from the slot and the week, so re-running
 * after shifting a date or adding a closure updates in place rather than
 * duplicating. `bookedCount` is never written on an existing session — it is
 * derived from the roster by the booking callables, and overwriting it here
 * would silently free or lose seats that members are holding.
 *
 * Sessions that fall inside a closure are archived rather than deleted, for
 * the same reason `removeSession` archives: a booked seat carries attendance
 * and billing history that must survive the class being called off.
 */
// A year-long season is hundreds of session writes, a batched calendar sync and
// a seat for every member holding a slot, so the default minute is not enough.
// The secret is for the calendar and invite calls generation now makes.
const GENERATE_OPTIONS = { secrets: [webhookSecret], timeoutSeconds: 540 }

export const generateSeasonSessions = onCall(GENERATE_OPTIONS, async (request) => {
  const authCtx = requireAdmin(request)

  const seasonId = String(request.data?.seasonId ?? '').trim()
  const dryRun = request.data?.dryRun === true
  if (!seasonId) {
    throw new HttpsError('invalid-argument', 'seasonId is required.')
  }

  const season = await loadSeason(seasonId)

  const slotsSnap = await db.collection('timetableSlots').get()
  const slots = slotsSnap.docs
    .map((d) => ({ id: d.id, fields: d.data() as Record<string, unknown> }))
    .filter((s) => s.fields.active !== false)

  if (!slots.length) {
    throw new HttpsError(
      'failed-precondition',
      'No active timetable slots to generate from. Seed the timetable first.',
    )
  }

  const classTypesSnap = await db.collection('classTypes').get()
  const classTypes = new Map(classTypesSnap.docs.map((d) => [d.id, d.data()]))

  const days = seasonDays(season)
  const planned: { id: string; data: Record<string, unknown> }[] = []

  for (const { weekStart, day, dayLabel } of days) {
    for (const slot of slots) {
      if (String(slot.fields.dayLabel ?? '') !== dayLabel) continue

      const time = String(slot.fields.time ?? '')
      const [hour, minute] = time.split(':').map(Number)
      if (Number.isNaN(hour) || Number.isNaN(minute)) continue

      const classTypeId = String(slot.fields.classTypeId ?? '')
      const classType = classTypes.get(classTypeId) ?? {}
      const date = parseDateKey(day)

      planned.push({
        id: `${slot.id}-${weekStart}`,
        data: {
          slotId: slot.id,
          seasonId: season.id,
          weekStart,
          dayLabel,
          time,
          classTypeId,
          className: String(classType.name ?? classTypeId),
          cap: Number(classType.cap ?? 20),
          instructorId: String(slot.fields.instructorId ?? 'tom'),
          venueId: String(slot.fields.venueId ?? 'rec-park-centre'),
          venue: String(slot.fields.venueId ?? 'rec-park-centre'),
          durationMinutes: 60,
          cancelled: false,
          startsAt: Timestamp.fromDate(
            zonedToUtc(date.getFullYear(), date.getMonth() + 1, date.getDate(), hour, minute),
          ),
        },
      })
    }
  }

  // Anything already filed under this season but no longer planned is now
  // inside a closure or outside the shifted dates, so it should stop running.
  const existingSnap = await db.collection('sessions').where('seasonId', '==', season.id).get()
  const plannedIds = new Set(planned.map((p) => p.id))
  const toArchive = existingSnap.docs.filter(
    (d) => !plannedIds.has(d.id) && d.data().cancelled !== true,
  )

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      seasonId: season.id,
      planned: planned.length,
      toArchive: toArchive.length,
      teachingDays: days.length,
    }
  }

  let updated = 0
  const createdSessions: { id: string; data: Record<string, unknown> }[] = []

  for (const session of planned) {
    const ref = db.doc(`sessions/${session.id}`)
    const existing = await ref.get()
    if (existing.exists) {
      await ref.set(session.data, { merge: true })
      updated += 1
    } else {
      // `calendarBatch` holds off the per-session calendar trigger; the batched
      // call below does the work and clears it.
      await ref.set({ ...session.data, bookedCount: 0, calendarBatch: true })
      createdSessions.push(session)
    }
  }

  const created = createdSessions.length
  const calendar = await batchSyncSessionsToCalendar(createdSessions)

  for (const doc of toArchive) {
    await doc.ref.set(
      {
        cancelled: true,
        cancelledAt: FieldValue.serverTimestamp(),
        cancelledBy: authCtx.uid,
        cancelReason: 'Outside season dates or inside a closure period',
      },
      { merge: true },
    )
  }

  /*
   * Run after archiving, so a member is never given a seat in a week that this
   * same call is about to close, and the re-issued invites are built from what
   * survives rather than from what was planned.
   */
  const enrolment = await fanWeeklyLocksIntoSessions(planned)

  await db.collection('audit').add({
    type: 'generateSeasonSessions',
    seasonId: season.id,
    created,
    updated,
    archived: toArchive.length,
    seatsFilled: enrolment.seats,
    calendarFailed: calendar.failed,
    by: authCtx.uid,
    at: FieldValue.serverTimestamp(),
  })

  return {
    ok: true,
    seasonId: season.id,
    created,
    updated,
    archived: toArchive.length,
    teachingDays: days.length,
    calendarSynced: calendar.synced,
    calendarFailed: calendar.failed,
    seatsFilled: enrolment.seats,
    membersUpdated: enrolment.members,
    fullSessions: enrolment.full,
  }
})

/**
 * What a season will cost a member, before it runs.
 *
 * Counts the sessions their locked slots actually produce across the season —
 * closures already removed, because a closed week generates no session — and
 * multiplies by their tier rate. This is the number quoted at enrolment on an
 * upfront season, and it is also what makes a holiday break visible as a lower
 * total rather than as an unexplained discount later.
 */
export const projectSeasonInvoice = onCall(async (request) => {
  const authCtx = requireAuth(request)

  const seasonId = String(request.data?.seasonId ?? '').trim()
  const requestedUid = String(request.data?.uid ?? '').trim()
  if (!seasonId) {
    throw new HttpsError('invalid-argument', 'seasonId is required.')
  }

  // Members may only project their own season; staff may project anyone's.
  const uid = requestedUid && requestedUid !== authCtx.uid ? requestedUid : authCtx.uid
  if (uid !== authCtx.uid) {
    requireStaff(request)
  }

  const season = await loadSeason(seasonId)

  const userSnap = await db.doc(`users/${uid}`).get()
  if (!userSnap.exists) {
    throw new HttpsError('not-found', 'Member not found.')
  }
  const membership = (userSnap.data()?.membership as Record<string, unknown>) ?? {}
  const planId = String(membership.planId ?? 'casual')

  const planSnap = await db.doc(`pricingPlans/${planId}`).get()
  const ratePerClass = Number(planSnap.data()?.ratePerClass ?? 0)
  const planName = String(planSnap.data()?.name ?? planId)

  const locksSnap = await db.collection(`users/${uid}/weeklyLocks`).get()
  const lockedSlotIds = locksSnap.docs.map((d) => d.id)

  if (!lockedSlotIds.length) {
    return {
      ok: true,
      seasonId: season.id,
      seasonName: season.name,
      billingMode: season.billingMode,
      planName,
      lockedSlotIds,
      sessionCount: 0,
      ratePerClass,
      totalCents: 0,
      note: 'No recurring slots locked yet, so there is nothing to project.',
    }
  }

  // Count from the sessions that actually exist for the season rather than
  // from the season length, so a closure or a cancelled class is reflected.
  const sessionsSnap = await db.collection('sessions').where('seasonId', '==', season.id).get()
  const sessionCount = sessionsSnap.docs.filter((d) => {
    const data = d.data()
    return data.cancelled !== true && lockedSlotIds.includes(String(data.slotId ?? ''))
  }).length

  const totalCents = Math.round(ratePerClass * 100) * sessionCount

  return {
    ok: true,
    seasonId: season.id,
    seasonName: season.name,
    billingMode: season.billingMode,
    planName,
    lockedSlotIds,
    sessionCount,
    ratePerClass,
    totalCents,
  }
})

/**
 * Admin sign-off that a billing period has been settled.
 *
 * There is no payment gateway: Tom reconciles against the bank himself and
 * records the outcome here. Rules forbid client writes to `billingPeriods`, so
 * this callable is the only way the status moves, which keeps an auditable
 * trail of who cleared what and when.
 */
export const markBillingPeriodPaid = onCall(async (request) => {
  requireAdmin(request)

  const uid = String(request.data?.uid ?? '').trim()
  const periodId = String(request.data?.periodId ?? '').trim()
  const paid = request.data?.paid !== false
  const note = String(request.data?.note ?? '').trim()

  if (!uid || !periodId) {
    throw new HttpsError('invalid-argument', 'uid and periodId are required.')
  }

  const ref = db.doc(`users/${uid}/billingPeriods/${periodId}`)
  const snap = await ref.get()
  if (!snap.exists) {
    throw new HttpsError('not-found', 'No billing period to mark. Calculate it first.')
  }

  await ref.set(
    {
      status: paid ? 'paid' : 'owed',
      paymentNote: note,
      // Cleared rather than overwritten, so an unmarked period does not keep a
      // stale settlement date hanging off it.
      paidAt: paid ? FieldValue.serverTimestamp() : FieldValue.delete(),
      paidBy: paid ? request.auth!.uid : FieldValue.delete(),
    },
    { merge: true },
  )

  await db.collection('audit').add({
    type: 'markBillingPeriodPaid',
    uid,
    periodId,
    paid,
    note,
    by: request.auth!.uid,
    at: FieldValue.serverTimestamp(),
  })

  return { ok: true, uid, periodId, status: paid ? 'paid' : 'owed' }
})

/** Admin creates a complimentary guest pass and emails the code via Apps Script. */
/**
 * Emails every active member.
 *
 * The recipient list is built here rather than sent from the browser: the
 * admin console has no business holding the whole membership's addresses, and
 * a client-supplied list would make this an open bulk mailer for anyone who
 * could reach the callable.
 *
 * The outbox row is written only after Apps Script confirms the send, so the
 * history cannot claim a delivery that did not happen.
 */
export const sendBroadcast = onCall({ secrets: [webhookSecret] }, async (request) => {
  requireAdmin(request)

  const subject = String(request.data?.subject ?? '').trim()
  const body = String(request.data?.body ?? '').trim()
  const testMode = Boolean(request.data?.testMode)

  if (!subject || !body) {
    throw new HttpsError('invalid-argument', 'Subject and body are required.')
  }

  const snap = await db.collection('users').where('profile.status', '==', 'active').get()
  const recipients = snap.docs
    .map((d) => String((d.data()?.profile ?? {}).email ?? '').trim())
    .filter((email) => email.includes('@'))

  if (!testMode && !recipients.length) {
    throw new HttpsError('failed-precondition', 'No active members with an email address.')
  }

  const scriptResult = await callAppsScript(
    { action: 'sendSubscriberBroadcast', subject, body, recipients, testMode },
    webhookSecret.value(),
    formEndpoint.value(),
  )

  if (!scriptResult.ok) {
    console.error(`sendSubscriberBroadcast failed: ${scriptResult.error}`)
    throw new HttpsError('internal', scriptResult.error ?? 'The broadcast failed to send.')
  }

  const recipientCount = Number(
    (scriptResult.data as { recipientCount?: number } | undefined)?.recipientCount ??
      recipients.length,
  )

  await db.collection('outbox').add({
    subject,
    body,
    recipientCount,
    testMode,
    sentAt: FieldValue.serverTimestamp(),
    actorUid: request.auth!.uid,
  })

  return { ok: true, recipientCount, testMode }
})

export const createGuestPass = onCall({ secrets: [webhookSecret] }, async (request) => {
  requireAdmin(request)

  const sessionId = String(request.data?.sessionId ?? '').trim()
  const guestName = String(request.data?.guestName ?? '').trim()
  const guestEmail = String(request.data?.guestEmail ?? '')
    .trim()
    .toLowerCase()
  const expiresAt = String(request.data?.expiresAt ?? '').trim()

  if (!sessionId || !guestName) {
    throw new HttpsError('invalid-argument', 'sessionId and guestName are required.')
  }

  const code = guestPassCode()
  const expiresTs = expiresAt
    ? Timestamp.fromDate(new Date(expiresAt))
    : Timestamp.fromDate(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000))

  await db.doc(`guestPasses/${code}`).set({
    sessionId,
    guestName,
    guestEmail: guestEmail || null,
    grantedBy: request.auth!.uid,
    expiresAt: expiresTs,
    usedAt: null,
    restricted: true,
    createdAt: FieldValue.serverTimestamp(),
  })

  /*
   * Apps Script names the class in the email, so it needs a label rather than
   * an id. Falling back to the id keeps the pass sending for a session that has
   * since been removed, which is better than swallowing the invitation.
   */
  const passSession = (await db.doc(`sessions/${sessionId}`).get()).data() ?? {}
  const sessionLabel =
    [passSession.className, passSession.dayLabel, passSession.time].filter(Boolean).join(' · ') ||
    sessionId

  const scriptResult = await callAppsScript(
    {
      action: 'sendGuestPass',
      passCode: code,
      code,
      guestName,
      guestEmail,
      sessionId,
      sessionLabel,
      expiresAt: expiresTs.toDate().toISOString(),
      source: 'cloud-function',
    },
    webhookSecret.value(),
    formEndpoint.value(),
  )

  await db.collection('audit').add({
    type: 'createGuestPass',
    code,
    sessionId,
    guestName,
    actorUid: request.auth!.uid,
    at: FieldValue.serverTimestamp(),
    appsScriptOk: scriptResult.ok,
  })

  return {
    ok: true,
    code,
    emailSent: scriptResult.ok,
    emailError: scriptResult.error,
  }
})

const DEFAULT_TRANSFER_WINDOW_HOURS = 24

async function transferWindowHours(): Promise<number> {
  const snap = await db.doc('meta/settings').get()
  const raw = Number(snap.data()?.transferWindowHours)
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_TRANSFER_WINDOW_HOURS
}

/**
 * Sessions must carry an absolute `startsAt`. Deriving it from weekStart plus a
 * local time string would need NZ daylight-saving handling, and getting that
 * wrong would silently mis-apply the transfer window, so this fails closed.
 */
function sessionStartsAt(session: FirebaseFirestore.DocumentData): Date {
  const startsAt = session.startsAt
  if (startsAt instanceof Timestamp) {
    return startsAt.toDate()
  }
  throw new HttpsError(
    'failed-precondition',
    'Session is missing a startsAt timestamp; contact the studio to book or cancel this class.',
  )
}

/**
 * A weekly allowance buys one session per week, not one seat that can be moved
 * around after the fact. So once this week's session for a slot passes the
 * transfer-window cutoff the member is assumed to be attending it and the week
 * is spent: releasing the slot then locking another would hand out a second
 * included class in the same week.
 *
 * Commitment is derived on demand rather than recorded, so there is no ledger
 * to keep in sync and a corrected `startsAt` or a cancelled class takes effect
 * immediately.
 *
 * The timing rules themselves are in `weeklyCommitment`; this reads the week's
 * sessions and hands them over.
 */
async function slotCommitmentThisWeek(
  slotId: string,
  windowHours: number,
  now: Date = new Date(),
) {
  const weekStart = currentWeekStartKey(now)

  const snap = await db
    .collection('sessions')
    .where('slotId', '==', slotId)
    .where('weekStart', '==', weekStart)
    .get()

  const sessions: TimedSession[] = snap.docs.map((doc) => {
    const data = doc.data() ?? {}
    return {
      id: doc.id,
      cancelled: data.cancelled === true,
      startsAt: data.startsAt instanceof Timestamp ? data.startsAt.toDate() : null,
    }
  })

  return { weekStart, ...commitmentFromSessions(sessions, windowHours, now) }
}

async function requireActiveMember(uid: string) {
  const snap = await db.doc(`users/${uid}`).get()
  if (!snap.exists) {
    throw new HttpsError('not-found', 'No member profile found for this account.')
  }

  const data = snap.data() ?? {}
  const profile = (data.profile as Record<string, unknown>) ?? {}
  const status = String(profile.status ?? '')

  if (status === 'active') {
    return snap
  }

  /*
   * Casual drop-ins self-activate on a verified email rather than waiting for
   * Tom, since making someone wait for manual approval to pay for a single
   * class defeats the point of a drop-in. A verified address is the check that
   * the account is a real person who can be invoiced and contacted.
   *
   * Subscriptions still require admin approval: those carry a recurring
   * commitment and an allowance, so they are not self-serve.
   */
  if (status === 'pending') {
    const requested = (data.requested as Record<string, unknown>) ?? {}
    const membership = (data.membership as Record<string, unknown>) ?? {}
    const planId = String(membership.planId ?? requested.planId ?? 'casual')

    const planSnap = await db.doc(`pricingPlans/${planId}`).get()
    const classesPerWeek = Number(planSnap.data()?.classesPerWeek ?? 0)

    if (classesPerWeek === 0) {
      const userRecord = await auth.getUser(uid)
      if (!userRecord.emailVerified) {
        throw new HttpsError(
          'failed-precondition',
          'Confirm your email address to book a casual session — check your inbox for the verification link.',
        )
      }

      await auth.setCustomUserClaims(uid, {
        ...(userRecord.customClaims ?? {}),
        role: 'member',
      })
      await snap.ref.set(
        {
          profile: { status: 'active' },
          membership: { planId, classesPerWeek: 0 },
          activatedAt: FieldValue.serverTimestamp(),
          activatedVia: 'email-verification',
        },
        { merge: true },
      )
      return await snap.ref.get()
    }

    throw new HttpsError(
      'permission-denied',
      'Your subscription is awaiting approval by the studio.',
    )
  }

  throw new HttpsError('permission-denied', `Account status "${status}" cannot book classes.`)
}

/**
 * Drop-in price. Extras are charged at the casual rate whatever plan the member
 * is on.
 *
 * Refuses rather than falling back to a figure written here. Pricing is set in
 * one place — the Pricing section of the admin console — and a hardcoded
 * default is a second, invisible one: if the casual plan were ever missing, it
 * would quietly bill everybody a price nobody had chosen. Being told the price
 * is not set is recoverable in a minute; a month of wrong invoices is not.
 */
async function dropInRateCents(): Promise<number> {
  const snap = await db.doc('pricingPlans/casual').get()
  const rate = Number(snap.data()?.ratePerClass)
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new HttpsError(
      'failed-precondition',
      'The drop-in rate has not been set. Add it under Pricing in the admin console before taking casual bookings.',
    )
  }
  return Math.round(rate * 100)
}

/**
 * Member books a single session as a paid drop-in.
 *
 * A subscription's included sessions are the recurring slots held through
 * lockWeeklySlot, so anything booked one-off here is by definition on top of
 * the allowance and chargeable. That one rule covers every plan level: an
 * allowance of zero (casual, prepaid packs) simply means every booking arrives
 * through this path, with no special case.
 *
 * `acknowledgeDropIn` is required so a member cannot be charged for an extra
 * without the client having shown them what it costs. Refusing without it is
 * what drives the confirmation dialog in the member app.
 *
 * Capacity is read inside the transaction so two people racing for the last
 * seat cannot both win.
 */
export const bookSession = onCall(async (request) => {
  const authCtx = requireAuth(request)
  const sessionId = String(request.data?.sessionId ?? '').trim()
  if (!sessionId) {
    throw new HttpsError('invalid-argument', 'sessionId is required.')
  }

  const userSnap = await requireActiveMember(authCtx.uid)
  const userData = userSnap.data() ?? {}
  const profile = (userData.profile as Record<string, unknown>) ?? {}
  const preferences = (userData.preferences as Record<string, unknown>) ?? {}
  const membership = (userData.membership as Record<string, unknown>) ?? {}
  const allowance = Number(membership.classesPerWeek ?? 0)

  const chargeCents = await dropInRateCents()

  if (request.data?.acknowledgeDropIn !== true) {
    const locksSnap = await db.collection(`users/${authCtx.uid}/weeklyLocks`).get()
    throw new HttpsError(
      'failed-precondition',
      'This session is a paid drop-in on top of your included sessions.',
      {
        reason: 'drop-in-confirmation-required',
        chargeCents,
        allowance,
        locked: locksSnap.size,
        lockedSlotIds: locksSnap.docs.map((d) => d.id),
      },
    )
  }

  const sessionRef = db.doc(`sessions/${sessionId}`)
  const rosterRef = sessionRef.collection('roster')
  const entryRef = rosterRef.doc(authCtx.uid)

  const result = await db.runTransaction(async (tx) => {
    const sessionSnap = await tx.get(sessionRef)
    if (!sessionSnap.exists) {
      throw new HttpsError('not-found', 'Session not found.')
    }
    const session = sessionSnap.data() ?? {}

    const existing = await tx.get(entryRef)
    if (existing.exists) {
      throw new HttpsError('already-exists', 'You are already booked into this session.')
    }

    let cap = Number(session.cap ?? 0)
    if (!cap) {
      const classTypeId = String(session.classTypeId ?? '')
      if (classTypeId) {
        const classSnap = await tx.get(db.doc(`classTypes/${classTypeId}`))
        cap = Number(classSnap.data()?.cap ?? 0)
      }
    }
    if (!cap) {
      throw new HttpsError('failed-precondition', 'Session has no capacity configured.')
    }

    const rosterSnap = await tx.get(rosterRef)
    if (rosterSnap.size >= cap) {
      throw new HttpsError('resource-exhausted', 'This session is full.')
    }

    tx.set(entryRef, {
      memberId: authCtx.uid,
      displayName: String(profile.name ?? ''),
      kind: 'member',
      showName: preferences.showNameToClassmates !== false,
      status: 'booked',
      bookedBy: 'self',
      // Recorded per entry, not derived at invoice time, so a later plan change
      // cannot retroactively alter what an already-booked extra costs.
      dropIn: true,
      chargeRateCents: chargeCents,
      bookedAt: FieldValue.serverTimestamp(),
    })
    tx.update(sessionRef, { bookedCount: rosterSnap.size + 1 })

    return { spotsLeft: cap - (rosterSnap.size + 1), chargeCents }
  })

  return { ok: true, sessionId, ...result }
})

/**
 * Member cancels their own booking, but only outside the transfer window.
 * Inside it the seat is non-refundable, matching the terms members accept on
 * join, and only an admin can grant an exception.
 */
export const cancelBooking = onCall(async (request) => {
  const authCtx = requireAuth(request)
  const sessionId = String(request.data?.sessionId ?? '').trim()
  if (!sessionId) {
    throw new HttpsError('invalid-argument', 'sessionId is required.')
  }

  await requireActiveMember(authCtx.uid)

  const sessionRef = db.doc(`sessions/${sessionId}`)
  const sessionSnap = await sessionRef.get()
  if (!sessionSnap.exists) {
    throw new HttpsError('not-found', 'Session not found.')
  }

  const startsAt = sessionStartsAt(sessionSnap.data() ?? {})
  const windowHours = await transferWindowHours()

  if (isPastTransferCutoff(startsAt, windowHours, new Date())) {
    throw new HttpsError(
      'failed-precondition',
      `Cancellations close ${windowHours} hours before the class. Contact the studio to request an exception.`,
    )
  }

  const entryRef = sessionRef.collection('roster').doc(authCtx.uid)

  await db.runTransaction(async (tx) => {
    const entry = await tx.get(entryRef)
    if (!entry.exists) {
      throw new HttpsError('not-found', 'You are not booked into this session.')
    }
    const rosterSnap = await tx.get(sessionRef.collection('roster'))
    tx.delete(entryRef)
    tx.update(sessionRef, { bookedCount: Math.max(0, rosterSnap.size - 1) })
  })

  return { ok: true, sessionId }
})

/**
 * Roll call. Staff mark a roster entry attended or not.
 *
 * This has to be a callable rather than a client write because
 * `calculateBillingPeriod` invoices from roster entries where
 * `status == 'attended'`: if the roll call only lived in the browser, every
 * billing run would find nothing and charge nobody. The denormalized
 * `attendanceSummary.totalAttended` on the member is adjusted in the same
 * transaction so it cannot drift from the roster it summarizes.
 */
export const markAttendance = onCall(async (request) => {
  const authCtx = requireStaff(request)

  const sessionId = String(request.data?.sessionId ?? '').trim()
  const memberId = String(request.data?.memberId ?? '').trim()
  const status = String(request.data?.status ?? '').trim()

  if (!sessionId || !memberId) {
    throw new HttpsError('invalid-argument', 'sessionId and memberId are required.')
  }
  if (status !== 'booked' && status !== 'attended' && status !== 'noShow') {
    throw new HttpsError('invalid-argument', 'status must be booked, attended or noShow.')
  }

  const entryRef = db.doc(`sessions/${sessionId}/roster/${memberId}`)
  const userRef = db.doc(`users/${memberId}`)

  await db.runTransaction(async (tx) => {
    const entry = await tx.get(entryRef)
    if (!entry.exists) {
      throw new HttpsError('not-found', 'That member is not on this roster.')
    }

    const previous = String(entry.data()?.status ?? 'booked')
    if (previous === status) {
      return
    }

    tx.update(entryRef, {
      status,
      attendedAt: status === 'attended' ? FieldValue.serverTimestamp() : FieldValue.delete(),
      markedBy: authCtx.uid,
      markedAt: FieldValue.serverTimestamp(),
    })

    const delta = (status === 'attended' ? 1 : 0) - (previous === 'attended' ? 1 : 0)
    if (delta !== 0) {
      const userSnap = await tx.get(userRef)
      if (userSnap.exists) {
        tx.set(
          userRef,
          { attendanceSummary: { totalAttended: FieldValue.increment(delta) } },
          { merge: true },
        )
      }
    }
  })

  return { ok: true, sessionId, memberId, status }
})

type SeatResult = 'booked' | 'already-booked' | 'full' | 'no-capacity' | 'missing'

/**
 * Take one seat in one session, transactionally.
 *
 * Weekly locks book a member into many sessions at once, and a single full
 * week should not abort the whole lock, so this reports the outcome instead of
 * throwing. Callers that want a hard failure translate the result themselves.
 */
async function bookMemberIntoSession(
  sessionId: string,
  memberId: string,
  profile: Record<string, unknown>,
  preferences: Record<string, unknown>,
  bookedBy: 'self' | 'admin',
  // A seat is "included" only when it comes from a recurring weekly lock, which
  // is what the subscription allowance actually buys. Everything else is an
  // extra, so admin-added seats are chargeable too and Tom waives them with a
  // billing exception rather than by them being silently free.
  charge: { dropIn: boolean; chargeRateCents: number },
  // Set by the weekly-lock fan-out, which covers all its seats with a single
  // recurring invite of its own. See onRosterWrite.
  suppressInvite = false,
): Promise<SeatResult> {
  const sessionRef = db.doc(`sessions/${sessionId}`)
  const rosterRef = sessionRef.collection('roster')
  const entryRef = rosterRef.doc(memberId)

  return db.runTransaction<SeatResult>(async (tx) => {
    const sessionSnap = await tx.get(sessionRef)
    if (!sessionSnap.exists) return 'missing'
    const session = sessionSnap.data() ?? {}

    if ((await tx.get(entryRef)).exists) return 'already-booked'

    let cap = Number(session.cap ?? 0)
    if (!cap) {
      const classTypeId = String(session.classTypeId ?? '')
      if (classTypeId) {
        cap = Number((await tx.get(db.doc(`classTypes/${classTypeId}`))).data()?.cap ?? 0)
      }
    }
    if (!cap) return 'no-capacity'

    const rosterSnap = await tx.get(rosterRef)
    if (rosterSnap.size >= cap) return 'full'

    tx.set(entryRef, {
      memberId,
      displayName: String(profile.name ?? ''),
      kind: 'member',
      showName: preferences.showNameToClassmates !== false,
      status: 'booked',
      bookedBy,
      dropIn: charge.dropIn,
      chargeRateCents: charge.dropIn ? charge.chargeRateCents : 0,
      bookedAt: FieldValue.serverTimestamp(),
      inviteSuppressed: suppressInvite,
    })
    tx.update(sessionRef, { bookedCount: rosterSnap.size + 1 })
    return 'booked'
  })
}

/** Monday of the current week, matching the `weekStart` key sessions are filed under. */
/**
 * Monday of the studio's current week, as the `weekStart` key sessions carry.
 *
 * Resolved in `TIME_ZONE` rather than the function instance's clock, which is
 * UTC in production: on a Monday morning in NZ, UTC is still on Sunday, so a
 * UTC-derived key would name the previous week. That key decides which session
 * commits a member's allowance and when the rollover frees them to change
 * slots, so naming the wrong week either strands them for an extra day or
 * hands them a second included class.
 */
function currentWeekStartKey(now: Date = new Date()): string {
  return weekStartKeyInZone(now, TIME_ZONE)
}

/**
 * Staff add a member to a session directly (phone bookings, walk-ins).
 * Shares bookSession's capacity check so the admin path cannot overfill a
 * class that the member-facing path would have refused.
 */
export const addMemberToSession = onCall(async (request) => {
  requireStaff(request)

  const sessionId = String(request.data?.sessionId ?? '').trim()
  const memberId = String(request.data?.memberId ?? '').trim()
  if (!sessionId || !memberId) {
    throw new HttpsError('invalid-argument', 'sessionId and memberId are required.')
  }

  const userSnap = await db.doc(`users/${memberId}`).get()
  if (!userSnap.exists) {
    throw new HttpsError('not-found', 'Member not found.')
  }
  const data = userSnap.data() ?? {}

  const result = await bookMemberIntoSession(
    sessionId,
    memberId,
    (data.profile as Record<string, unknown>) ?? {},
    (data.preferences as Record<string, unknown>) ?? {},
    'admin',
    { dropIn: true, chargeRateCents: await dropInRateCents() },
  )

  if (result === 'missing') throw new HttpsError('not-found', 'Session not found.')
  if (result === 'already-booked') {
    throw new HttpsError('already-exists', 'That member is already on this roster.')
  }
  if (result === 'no-capacity') {
    throw new HttpsError('failed-precondition', 'Session has no capacity configured.')
  }
  if (result === 'full') throw new HttpsError('resource-exhausted', 'This session is full.')

  return { ok: true, sessionId, memberId }
})

/**
 * Cover a whole weekly slot with one calendar email.
 *
 * The roster trigger is deliberately silent for these seats, so this is the
 * only notice the member gets for locking or releasing a slot: a single
 * repeating event for their own class, keyed on the slot so the release
 * cancels exactly what the lock created.
 */
/**
 * The next SEQUENCE for a member's recurring invite for one slot.
 *
 * Calendars ignore an update whose sequence is not higher than the copy they
 * already hold, so this has to keep climbing for the life of the address —
 * including across a release and a re-lock, which is why it is not kept on the
 * lock document that unlocking deletes.
 */
async function nextSeriesSequence(uid: string, slotId: string): Promise<number> {
  const ref = db.doc(`users/${uid}/calendarSeries/${slotId}`)
  return db.runTransaction(async (tx) => {
    const next = Number((await tx.get(ref)).data()?.sequence ?? 0) + 1
    tx.set(
      ref,
      { slotId, sequence: next, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    )
    return next
  })
}

/**
 * The upcoming classes a member actually holds a seat on for one slot.
 *
 * This is the set their calendar should show, and it is deliberately read back
 * from the sessions rather than counted as "every week from here": closures
 * and cancellations have already been taken out of the timetable, so a date
 * missing here is a date the studio is not running.
 */
async function memberSlotOccurrences(
  uid: string,
  slotId: string,
): Promise<{ startsAt: Date; session: Record<string, unknown> }[]> {
  const sessionsSnap = await db
    .collection('sessions')
    .where('slotId', '==', slotId)
    .where('weekStart', '>=', currentWeekStartKey())
    .get()

  const live = sessionsSnap.docs.filter((d) => d.data()?.cancelled !== true)
  if (!live.length) return []

  // One read for the whole series rather than one per week.
  const entries = await db.getAll(...live.map((d) => d.ref.collection('roster').doc(uid)))

  const held: { startsAt: Date; session: Record<string, unknown> }[] = []
  live.forEach((doc, i) => {
    if (!entries[i]?.exists) return
    try {
      held.push({ startsAt: sessionStartsAt(doc.data() ?? {}), session: doc.data() ?? {} })
    } catch {
      // A session with an unreadable start cannot go on a calendar; the rest still can.
    }
  })

  return held.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
}

/**
 * Cover a whole weekly slot with one calendar email.
 *
 * The roster trigger is deliberately silent for these seats, so this is the
 * only notice the member gets for locking or releasing a slot: a single
 * repeating event for their own class, keyed on the slot so a later update or
 * release lands on exactly what the lock created.
 *
 * The event carries the exact dates held rather than a weekly rule. Re-sending
 * it with a fresh sequence is therefore how a member's diary is brought up to
 * date after the timetable grows or a closure removes a week.
 */
async function sendSlotCalendarEmail(
  action: 'sendSlotInvite' | 'sendSlotCancellation',
  opts: {
    slotId: string
    uid: string
    profile: Record<string, unknown>
    session: Record<string, unknown>
    occurrences: Date[]
  },
): Promise<void> {
  const memberEmail = String(opts.profile.email ?? '')
  if (!memberEmail) return

  const session = opts.session
  let className = String(session.className ?? '')
  const classTypeId = String(session.classTypeId ?? '')
  if (!className && classTypeId) {
    className = String((await db.doc(`classTypes/${classTypeId}`).get()).data()?.name ?? classTypeId)
  }

  const result = await callAppsScript(
    {
      action,
      memberEmail,
      memberName: String(opts.profile.name ?? ''),
      slotId: opts.slotId,
      sequence: await nextSeriesSequence(opts.uid, opts.slotId),
      occurrences: opts.occurrences.map((d) => d.toISOString()),
      weeklyCount: opts.occurrences.length,
      weekStart: String(session.weekStart ?? ''),
      dayLabel: String(session.dayLabel ?? ''),
      time: String(session.time ?? ''),
      className,
      venue: String(session.venue ?? ''),
      durationMinutes: Number(session.durationMinutes ?? 60),
      source: action,
    },
    webhookSecret.value(),
    formEndpoint.value(),
  )

  if (!result.ok) {
    console.error('slot calendar email failed', action, opts.slotId, result.error)
  }
}

/**
 * Re-issue a member's recurring invite for a slot from whatever they now hold.
 *
 * Used wherever the set of weeks behind a lock changes without the member
 * doing anything — chiefly generating a season, which is what extends their
 * seats into weeks that did not exist when they locked the slot.
 */
async function refreshSlotSeries(
  uid: string,
  slotId: string,
  profile: Record<string, unknown>,
): Promise<void> {
  const held = await memberSlotOccurrences(uid, slotId)
  if (!held.length) return

  await sendSlotCalendarEmail('sendSlotInvite', {
    slotId,
    uid,
    profile,
    session: held[0].session,
    occurrences: held.map((h) => h.startsAt),
  })
}

/**
 * Lock a recurring weekly slot: book the member into every upcoming session
 * filed under that timetable slot.
 *
 * Weekly memberships are sold as "the same day and time every week", so the
 * lock has to fan out into real roster entries — otherwise capacity, the roll
 * call and billing would all be blind to it. A week that is already full is
 * reported back rather than failing the whole lock, since the remaining weeks
 * are still worth holding.
 */
export const lockWeeklySlot = onCall({ secrets: [webhookSecret] }, async (request) => {
  const authCtx = requireAuth(request)
  const slotId = String(request.data?.slotId ?? '').trim()
  if (!slotId) {
    throw new HttpsError('invalid-argument', 'slotId is required.')
  }

  const userSnap = await requireActiveMember(authCtx.uid)
  const data = userSnap.data() ?? {}
  const profile = (data.profile as Record<string, unknown>) ?? {}
  const preferences = (data.preferences as Record<string, unknown>) ?? {}
  const membership = (data.membership as Record<string, unknown>) ?? {}

  const locksRef = db.collection(`users/${authCtx.uid}/weeklyLocks`)
  const locks = await locksRef.get()
  const allowance = Number(membership.classesPerWeek ?? 0)
  const alreadyLocked = locks.docs.some((d) => d.id === slotId)

  if (allowance > 0 && !alreadyLocked && locks.size >= allowance) {
    throw new HttpsError(
      'resource-exhausted',
      `Your plan includes ${allowance} weekly slot${allowance === 1 ? '' : 's'}. Unlock one before locking another.`,
    )
  }

  const sessionsSnap = await db
    .collection('sessions')
    .where('slotId', '==', slotId)
    .where('weekStart', '>=', currentWeekStartKey())
    .get()

  if (sessionsSnap.empty) {
    throw new HttpsError('not-found', 'No upcoming sessions are scheduled for that slot.')
  }

  const windowHours = await transferWindowHours()
  const now = new Date()

  const booked: string[] = []
  const full: string[] = []
  const skipped: string[] = []
  for (const doc of sessionsSnap.docs) {
    /*
     * A session already past its transfer cutoff is not claimable: the seat
     * could no longer be released, so taking it would spend a week the member
     * had not agreed to spend, and on a slot they had not held when the class
     * became final. They book it as a drop-in if they want it.
     */
    let startsAt: Date | null = null
    try {
      startsAt = sessionStartsAt(doc.data() ?? {})
    } catch {
      startsAt = null
    }
    if (startsAt && isPastTransferCutoff(startsAt, windowHours, now)) {
      skipped.push(doc.id)
      continue
    }

    const result = await bookMemberIntoSession(
      doc.id,
      authCtx.uid,
      profile,
      preferences,
      'self',
      // Included: this seat is what the weekly allowance pays for.
      { dropIn: false, chargeRateCents: 0 },
      true,
    )
    if (result === 'booked') {
      booked.push(doc.id)
    } else if (result === 'full') {
      full.push(doc.id)
    }
  }

  await locksRef.doc(slotId).set(
    { slotId, lockedAt: FieldValue.serverTimestamp(), classesPerWeek: allowance },
    { merge: true },
  )

  // Sent from the seats the member now holds rather than from the ones this
  // call happened to take, so a re-lock repairs a series instead of shortening it.
  if (booked.length) {
    await refreshSlotSeries(authCtx.uid, slotId, profile)
  }

  return {
    ok: true,
    slotId,
    booked: booked.length,
    full: full.length,
    fullSessions: full,
    skipped: skipped.length,
  }
})

/**
 * Release a weekly lock and give back the seats.
 *
 * Sessions already inside the transfer window are kept rather than released:
 * the terms members accept on join make those non-refundable because the seat
 * is still holding their place, and only an admin can grant an exception.
 *
 * If this week's session for the slot is itself inside that window, the whole
 * release is refused rather than partially applied. Releasing the lock while
 * its seat is still held would free the weekly allowance for another slot, so
 * the member would attend twice on one included session. The slot can be
 * changed once the week rolls over.
 */
export const unlockWeeklySlot = onCall({ secrets: [webhookSecret] }, async (request) => {
  const authCtx = requireAuth(request)
  const slotId = String(request.data?.slotId ?? '').trim()
  if (!slotId) {
    throw new HttpsError('invalid-argument', 'slotId is required.')
  }

  const userSnap = await requireActiveMember(authCtx.uid)
  const profile = (userSnap.data()?.profile as Record<string, unknown>) ?? {}

  const windowHours = await transferWindowHours()
  const now = new Date()

  const commitment = await slotCommitmentThisWeek(slotId, windowHours, now)
  if (commitment.committed) {
    throw new HttpsError(
      'failed-precondition',
      `This week's class is already locked in, so your included session for this week counts as attended. You can change this slot from next week.`,
      {
        reason: 'slot-committed-this-week',
        slotId,
        weekStart: commitment.weekStart,
        startsAt: commitment.startsAt?.toISOString(),
      },
    )
  }

  const sessionsSnap = await db
    .collection('sessions')
    .where('slotId', '==', slotId)
    .where('weekStart', '>=', currentWeekStartKey())
    .get()

  let released = 0
  let kept = 0
  let firstReleased: QueryDocumentSnapshot | null = null

  for (const doc of sessionsSnap.docs) {
    let startsAt: Date
    try {
      startsAt = sessionStartsAt(doc.data() ?? {})
    } catch {
      continue
    }
    if (isPastTransferCutoff(startsAt, windowHours, now)) {
      kept += 1
      continue
    }

    const sessionRef = doc.ref
    const entryRef = sessionRef.collection('roster').doc(authCtx.uid)
    const removed = await db.runTransaction(async (tx) => {
      const entry = await tx.get(entryRef)
      if (!entry.exists) return false
      const rosterSnap = await tx.get(sessionRef.collection('roster'))
      tx.delete(entryRef)
      tx.update(sessionRef, { bookedCount: Math.max(0, rosterSnap.size - 1) })
      return true
    })
    if (removed) {
      released += 1
      if (!firstReleased) firstReleased = doc
    }
  }

  /*
   * The lock is what the allowance check counts, so it only goes once every
   * seat it was holding is back. A kept seat with no lock behind it is the
   * exploit: the allowance would read as free while the member is still on a
   * roster.
   */
  if (kept === 0) {
    await db.doc(`users/${authCtx.uid}/weeklyLocks/${slotId}`).delete()
  }

  /*
   * A release that had to keep some seats is not a cancellation. Sending one
   * would clear the whole series from the member's diary, including the weeks
   * inside the transfer window that they are still expected at — and still
   * being charged for. Those weeks are re-sent as the series instead.
   */
  if (kept > 0) {
    await refreshSlotSeries(authCtx.uid, slotId, profile)
  } else if (firstReleased) {
    await sendSlotCalendarEmail('sendSlotCancellation', {
      slotId,
      uid: authCtx.uid,
      profile,
      session: firstReleased.data() ?? {},
      occurrences: [],
    })
  }

  return { ok: true, slotId, released, kept, lockReleased: kept === 0 }
})

/**
 * Remove a session from the timetable without losing attendance history.
 *
 * Deleting a Firestore document does not delete its subcollections, so hard
 * deleting a session that has a roster would leave those entries orphaned —
 * still matching the `roster` collection-group query calculateBillingPeriod
 * uses, but no longer reachable from any session. That is the worst outcome:
 * invisible records that still bill.
 *
 * So a session is only truly deleted when nothing is attached to it. As soon
 * as anyone has booked or attended, it is archived instead: hidden from the
 * timetable via `cancelled`, with the roster left intact so a member's record
 * of what they attended, and what they were charged for, survives.
 *
 * Rules forbid client deletes of sessions so this invariant cannot be bypassed.
 */
export const removeSession = onCall(async (request) => {
  // Trainers cover the timetable when Tom is away, which is precisely when a
  // session needs cancelling, so this is staff rather than admin. Removal is
  // still not destructive: a session with anyone on the roster is archived,
  // never deleted, so a trainer cannot lose attendance or billing history.
  const authCtx = requireStaff(request)

  const sessionId = String(request.data?.sessionId ?? '').trim()
  const reason = String(request.data?.reason ?? '').trim()
  if (!sessionId) {
    throw new HttpsError('invalid-argument', 'sessionId is required.')
  }

  const sessionRef = db.doc(`sessions/${sessionId}`)
  const snap = await sessionRef.get()
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Session not found.')
  }

  const rosterSnap = await sessionRef.collection('roster').get()

  if (rosterSnap.empty) {
    await sessionRef.delete()
    await db.collection('audit').add({
      type: 'removeSession',
      mode: 'deleted',
      sessionId,
      actorUid: authCtx.uid,
      at: FieldValue.serverTimestamp(),
    })
    return { ok: true, mode: 'deleted', booked: 0, attended: 0 }
  }

  const attended = rosterSnap.docs.filter((d) => d.data()?.status === 'attended').length

  await sessionRef.set(
    {
      cancelled: true,
      cancelledAt: FieldValue.serverTimestamp(),
      cancelledBy: authCtx.uid,
      cancelReason: reason || null,
    },
    { merge: true },
  )

  await db.collection('audit').add({
    type: 'removeSession',
    mode: 'archived',
    sessionId,
    booked: rosterSnap.size,
    attended,
    reason: reason || null,
    actorUid: authCtx.uid,
    at: FieldValue.serverTimestamp(),
  })

  return { ok: true, mode: 'archived', booked: rosterSnap.size, attended }
})

/** Admin approves a pending self-registration, unlocking booking. */
export const approveMember = onCall(async (request) => {
  requireAdmin(request)

  const uid = String(request.data?.uid ?? '').trim()
  if (!uid) {
    throw new HttpsError('invalid-argument', 'uid is required.')
  }

  const userRef = db.doc(`users/${uid}`)
  const snap = await userRef.get()
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Member not found.')
  }

  const userRecord = await auth.getUser(uid)
  await auth.setCustomUserClaims(uid, { ...(userRecord.customClaims ?? {}), role: 'member' })

  await userRef.set(
    {
      profile: { status: 'active' },
      approvedAt: FieldValue.serverTimestamp(),
      approvedBy: request.auth!.uid,
    },
    { merge: true },
  )

  await db.collection('audit').add({
    type: 'approveMember',
    uid,
    actorUid: request.auth!.uid,
    at: FieldValue.serverTimestamp(),
  })

  return { ok: true, uid }
})

/**
 * Admin promotes a client to trainer, or returns them to member.
 *
 * The custom claim is the thing rules actually check, and only the Admin SDK
 * can set it, so this cannot be a client write. The Firestore role is written
 * in the same call to stop the two drifting apart — a profile that says
 * "trainer" while the token says "member" would show staff screens that every
 * read behind them then denies.
 */
export const setMemberRole = onCall(async (request) => {
  requireAdmin(request)

  const uid = String(request.data?.uid ?? '').trim()
  const role = String(request.data?.role ?? '').trim()
  if (!uid) {
    throw new HttpsError('invalid-argument', 'uid is required.')
  }
  if (role !== 'member' && role !== 'trainer') {
    throw new HttpsError('invalid-argument', 'Role must be member or trainer.')
  }
  if (uid === request.auth!.uid) {
    throw new HttpsError('failed-precondition', 'You cannot change your own role.')
  }

  const userRef = db.doc(`users/${uid}`)
  if (!(await userRef.get()).exists) {
    throw new HttpsError('not-found', 'Member not found.')
  }

  const userRecord = await auth.getUser(uid)
  await auth.setCustomUserClaims(uid, { ...(userRecord.customClaims ?? {}), role })
  await userRef.set({ profile: { role } }, { merge: true })

  await db.collection('audit').add({
    type: 'setMemberRole',
    uid,
    role,
    actorUid: request.auth!.uid,
    at: FieldValue.serverTimestamp(),
  })

  // The claim rides on the ID token, so it only takes effect on the next
  // refresh. The caller should tell them to sign out and back in.
  return { ok: true, uid, role }
})

/**
 * A member asks to move plan. This cannot be a client write: `membership` is
 * priced, so Firestore rules keep members out of it. The request is recorded
 * for Tom to action and the member's current plan keeps running until he does.
 */
export const requestPlanChange = onCall({ secrets: [webhookSecret] }, async (request) => {
  const { uid } = requireAuth(request)

  const planId = String(request.data?.planId ?? '').trim()
  const notes = String(request.data?.notes ?? '').trim()
  if (!planId) {
    throw new HttpsError('invalid-argument', 'planId is required.')
  }

  const planSnap = await db.doc(`pricingPlans/${planId}`).get()
  if (!planSnap.exists) {
    throw new HttpsError('not-found', 'Unknown plan.')
  }

  const userRef = db.doc(`users/${uid}`)
  const userSnap = await userRef.get()
  if (!userSnap.exists) {
    throw new HttpsError('not-found', 'Member profile not found.')
  }

  const profile = (userSnap.data()?.profile ?? {}) as { name?: string; email?: string }
  const membership = (userSnap.data()?.membership ?? {}) as { planId?: string }

  if (membership.planId === planId) {
    throw new HttpsError('failed-precondition', 'You are already on that plan.')
  }

  const currentPlanName = membership.planId
    ? ((await db.doc(`pricingPlans/${membership.planId}`).get()).data()?.name ??
      membership.planId)
    : '—'
  const requestedPlanName = String(planSnap.data()?.name ?? planId)

  // One open request per member: a second click should revise the ask, not
  // queue a duplicate for Tom to reconcile.
  const requestRef = db.doc(`planChangeRequests/${uid}`)
  await requestRef.set({
    uid,
    memberName: profile.name ?? '',
    memberEmail: profile.email ?? '',
    fromPlanId: membership.planId ?? '',
    toPlanId: planId,
    requestedPlanName,
    notes,
    status: 'pending',
    requestedAt: FieldValue.serverTimestamp(),
  })

  const scriptResult = await callAppsScript(
    {
      action: 'sendPlanChangeNotice',
      memberName: profile.name ?? '',
      memberEmail: profile.email ?? '',
      currentPlan: currentPlanName,
      requestedPlan: requestedPlanName,
      notes,
    },
    webhookSecret.value(),
    formEndpoint.value(),
  )
  if (!scriptResult.ok) {
    // The request is already recorded, so Tom will see it in the admin console
    // even when the notification email fails. Log, do not fail the member.
    console.error(`sendPlanChangeNotice failed for ${uid}: ${scriptResult.error}`)
  }

  return { ok: true, notified: scriptResult.ok, requestedPlanName }
})

/** Admin resolves an open plan change: applies the new plan, or declines it. */
export const resolvePlanChange = onCall(async (request) => {
  requireAdmin(request)

  const uid = String(request.data?.uid ?? '').trim()
  const approve = Boolean(request.data?.approve)
  if (!uid) {
    throw new HttpsError('invalid-argument', 'uid is required.')
  }

  const requestRef = db.doc(`planChangeRequests/${uid}`)
  const snap = await requestRef.get()
  if (!snap.exists) {
    throw new HttpsError('not-found', 'No open plan change for this member.')
  }

  const toPlanId = String(snap.data()?.toPlanId ?? '')

  if (approve) {
    const planSnap = await db.doc(`pricingPlans/${toPlanId}`).get()
    await db.doc(`users/${uid}`).set(
      {
        membership: {
          planId: toPlanId,
          classesPerWeek: Number(planSnap.data()?.classesPerWeek ?? 0),
        },
      },
      { merge: true },
    )
  }

  await requestRef.delete()

  await db.collection('audit').add({
    type: 'resolvePlanChange',
    uid,
    toPlanId,
    approved: approve,
    actorUid: request.auth!.uid,
    at: FieldValue.serverTimestamp(),
  })

  return { ok: true, uid, approved: approve }
})
