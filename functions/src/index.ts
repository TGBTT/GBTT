import { randomBytes } from 'node:crypto'
import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore'
import { defineSecret, defineString } from 'firebase-functions/params'
import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { setGlobalOptions } from 'firebase-functions/v2/options'

initializeApp()

const db = getFirestore()
const auth = getAuth()

const formEndpoint = defineString('FORM_ENDPOINT', {
  description: 'Apps Script web app URL (same as VITE_FORM_ENDPOINT)',
  default: '',
})
const webhookSecret = defineSecret('FUNCTIONS_WEBHOOK_SECRET')

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
  if (role !== 'admin' && role !== 'substitute') {
    throw new HttpsError('permission-denied', 'Staff role required.')
  }
  return authCtx
}

function guestPassCode(): string {
  return randomBytes(4).toString('hex').toUpperCase()
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

/** Admin creates a member Auth user + Firestore profile; sends invite / password reset. */
export const createMemberAccount = onCall(
  { secrets: [webhookSecret] },
  async (request) => {
    requireAdmin(request)

    const email = String(request.data?.email ?? '')
      .trim()
      .toLowerCase()
    const name = String(request.data?.name ?? '').trim()
    const planId = String(request.data?.planId ?? 'weekly1').trim()
    const classesPerWeek = Number(request.data?.classesPerWeek ?? 1)

    if (!email || !name) {
      throw new HttpsError('invalid-argument', 'Name and email are required.')
    }

    const userRecord = await auth.createUser({ email, displayName: name })
    await auth.setCustomUserClaims(userRecord.uid, { role: 'member' })

    await db.doc(`users/${userRecord.uid}`).set({
      profile: {
        name,
        email,
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

    const resetLink = await auth.generatePasswordResetLink(email)

    const scriptResult = await callAppsScript(
      {
        action: 'sendInvite',
        email,
        name,
        planId,
        resetLink,
        source: 'cloud-function',
      },
      webhookSecret.value(),
      formEndpoint.value(),
    )

    await db.collection('audit').add({
      type: 'createMemberAccount',
      targetUid: userRecord.uid,
      actorUid: request.auth!.uid,
      at: FieldValue.serverTimestamp(),
      appsScriptOk: scriptResult.ok,
    })

    return {
      ok: true,
      uid: userRecord.uid,
      resetLink,
      inviteEmailSent: scriptResult.ok,
      inviteError: scriptResult.error,
    }
  },
)

/** Admin triggers Firebase password reset email for a member. */
export const adminResetPassword = onCall(async (request) => {
  requireAdmin(request)

  const email = String(request.data?.email ?? '')
    .trim()
    .toLowerCase()
  if (!email) {
    throw new HttpsError('invalid-argument', 'Email is required.')
  }

  const resetLink = await auth.generatePasswordResetLink(email)

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
      const classSnap = await db.doc(`catalog/classTypes/${classTypeId}`).get()
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
    if (!after) {
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
        sessionId: event.params.sessionId,
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
      console.error('calendarUpsertSession failed', event.params.sessionId, result.error)
    }
  },
)

/** Admin callable — compute owed amount for a billing period from attended roster entries. */
export const calculateBillingPeriod = onCall(async (request) => {
  requireAdmin(request)

  const uid = String(request.data?.uid ?? '').trim()
  const periodStart = String(request.data?.periodStart ?? '').trim()

  if (!uid || !periodStart) {
    throw new HttpsError('invalid-argument', 'uid and periodStart (YYYY-MM-DD) are required.')
  }

  const userSnap = await db.doc(`users/${uid}`).get()
  if (!userSnap.exists) {
    throw new HttpsError('not-found', 'Member not found.')
  }

  const user = userSnap.data() ?? {}
  const membership = (user.membership as Record<string, unknown>) ?? {}
  const billing = (user.billing as Record<string, unknown>) ?? {}
  const planId = String(membership.planId ?? 'casual')

  const planSnap = await db.doc(`pricing/plans/${planId}`).get()
  const plan = planSnap.data() ?? {}
  const ratePerClass = Number(plan.ratePerClass ?? 0)
  const classesPerWeek = Number(plan.classesPerWeek ?? 0)
  const planName = String(plan.name ?? planId)

  const periodEnd = periodEndFromStart(periodStart)
  const startTs = Timestamp.fromDate(new Date(`${periodStart}T00:00:00.000Z`))
  const endTs = Timestamp.fromDate(new Date(`${periodEnd}T23:59:59.999Z`))

  const rosterQuery = await db
    .collectionGroup('roster')
    .where('status', '==', 'attended')
    .get()

  const lineItems: BillingLineItem[] = []
  let attendedCount = 0

  for (const rosterDoc of rosterQuery.docs) {
    const rosterUserId = rosterDoc.ref.id
    if (rosterUserId !== uid) {
      continue
    }

    const sessionId = rosterDoc.ref.parent.parent?.id
    if (!sessionId) {
      continue
    }

    const sessionSnap = await db.doc(`sessions/${sessionId}`).get()
    const session = sessionSnap.data() ?? {}
    const weekStart = String(session.weekStart ?? '')
    if (!weekStart) {
      continue
    }

    const sessionDate = new Date(`${weekStart}T00:00:00.000Z`)
    if (sessionDate < startTs.toDate() || sessionDate > endTs.toDate()) {
      continue
    }

    attendedCount += 1
    const amountCents = Math.round(ratePerClass * 100)
    lineItems.push({
      sessionId,
      label: `${weekStart} · ${String(session.slotId ?? sessionId)}`,
      amountCents,
    })
  }

  let subtotalCents = lineItems.reduce((sum, item) => sum + item.amountCents, 0)

  if (classesPerWeek > 0) {
    const weeksInPeriod = 4
    const subscriptionBaseCents = Math.round(ratePerClass * classesPerWeek * weeksInPeriod * 100)
    subtotalCents += subscriptionBaseCents
    lineItems.unshift({
      sessionId: 'subscription',
      label: `${planName} subscription (${classesPerWeek}/week × ${weeksInPeriod} weeks)`,
      amountCents: subscriptionBaseCents,
    })
  }

  const customDiscountPct = Number(billing.customDiscountPct ?? 0)
  const discountId = billing.discountId as string | undefined
  let discountCents = 0

  if (discountId) {
    const discountSnap = await db.doc(`pricing/discounts/${discountId}`).get()
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
  const periodId = `${periodStart}`

  await db.doc(`users/${uid}/billingPeriods/${periodId}`).set({
    periodStart,
    periodEnd,
    planId,
    lineItems,
    attendedCount,
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
    subtotalCents,
    discountCents,
    adjustmentCents,
    totalCents,
  }
})

/** Admin creates a complimentary guest pass and emails the code via Apps Script. */
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

  const scriptResult = await callAppsScript(
    {
      action: 'sendGuestPass',
      code,
      guestName,
      guestEmail,
      sessionId,
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

async function requireActiveMember(uid: string) {
  const snap = await db.doc(`users/${uid}`).get()
  if (!snap.exists) {
    throw new HttpsError('not-found', 'No member profile found for this account.')
  }
  const profile = (snap.data()?.profile as Record<string, unknown>) ?? {}
  const status = String(profile.status ?? '')
  if (status !== 'active') {
    throw new HttpsError(
      'permission-denied',
      status === 'pending'
        ? 'Your account is awaiting approval by the studio.'
        : `Account status "${status}" cannot book classes.`,
    )
  }
  return snap
}

/**
 * Member books a session. Rules block direct roster writes, so capacity and
 * membership status can only be enforced here. The count is read inside the
 * transaction so two people racing for the last seat cannot both win.
 */
export const bookSession = onCall(async (request) => {
  const authCtx = requireAuth(request)
  const sessionId = String(request.data?.sessionId ?? '').trim()
  if (!sessionId) {
    throw new HttpsError('invalid-argument', 'sessionId is required.')
  }

  const userSnap = await requireActiveMember(authCtx.uid)
  const profile = (userSnap.data()?.profile as Record<string, unknown>) ?? {}
  const preferences = (userSnap.data()?.preferences as Record<string, unknown>) ?? {}

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
        const classSnap = await tx.get(db.doc(`catalog/classTypes/${classTypeId}`))
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
      bookedAt: FieldValue.serverTimestamp(),
    })
    tx.update(sessionRef, { bookedCount: rosterSnap.size + 1 })

    return { spotsLeft: cap - (rosterSnap.size + 1) }
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
  const cutoff = new Date(startsAt.getTime() - windowHours * 60 * 60 * 1000)

  if (new Date() > cutoff) {
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
        cap = Number((await tx.get(db.doc(`catalog/classTypes/${classTypeId}`))).data()?.cap ?? 0)
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
      bookedAt: FieldValue.serverTimestamp(),
    })
    tx.update(sessionRef, { bookedCount: rosterSnap.size + 1 })
    return 'booked'
  })
}

/** Monday of the current week, matching the `weekStart` key sessions are filed under. */
function currentWeekStartKey(now: Date = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  d.setDate(d.getDate() + (d.getDay() === 0 ? -6 : 1 - d.getDay()))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
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
 * Lock a recurring weekly slot: book the member into every upcoming session
 * filed under that timetable slot.
 *
 * Weekly memberships are sold as "the same day and time every week", so the
 * lock has to fan out into real roster entries — otherwise capacity, the roll
 * call and billing would all be blind to it. A week that is already full is
 * reported back rather than failing the whole lock, since the remaining weeks
 * are still worth holding.
 */
export const lockWeeklySlot = onCall(async (request) => {
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

  const booked: string[] = []
  const full: string[] = []
  for (const doc of sessionsSnap.docs) {
    const result = await bookMemberIntoSession(
      doc.id,
      authCtx.uid,
      profile,
      preferences,
      'self',
    )
    if (result === 'booked') booked.push(doc.id)
    else if (result === 'full') full.push(doc.id)
  }

  await locksRef.doc(slotId).set(
    { slotId, lockedAt: FieldValue.serverTimestamp(), classesPerWeek: allowance },
    { merge: true },
  )

  return { ok: true, slotId, booked: booked.length, full: full.length, fullSessions: full }
})

/**
 * Release a weekly lock and give back the seats.
 *
 * Sessions already inside the transfer window are kept rather than released:
 * the terms members accept on join make those non-refundable because the seat
 * is still holding their place, and only an admin can grant an exception.
 */
export const unlockWeeklySlot = onCall(async (request) => {
  const authCtx = requireAuth(request)
  const slotId = String(request.data?.slotId ?? '').trim()
  if (!slotId) {
    throw new HttpsError('invalid-argument', 'slotId is required.')
  }

  await requireActiveMember(authCtx.uid)

  const windowHours = await transferWindowHours()
  const now = new Date()

  const sessionsSnap = await db
    .collection('sessions')
    .where('slotId', '==', slotId)
    .where('weekStart', '>=', currentWeekStartKey())
    .get()

  let released = 0
  let kept = 0

  for (const doc of sessionsSnap.docs) {
    let startsAt: Date
    try {
      startsAt = sessionStartsAt(doc.data() ?? {})
    } catch {
      continue
    }
    if (now > new Date(startsAt.getTime() - windowHours * 60 * 60 * 1000)) {
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
    if (removed) released += 1
  }

  await db.doc(`users/${authCtx.uid}/weeklyLocks/${slotId}`).delete()

  return { ok: true, slotId, released, kept }
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
  const authCtx = requireAdmin(request)

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
