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

/** Sync roster changes to Google Calendar via Apps Script. */
export const onRosterWrite = onDocumentWritten(
  {
    document: 'sessions/{sessionId}/roster/{userId}',
    secrets: [webhookSecret],
  },
  async (event) => {
    const sessionId = event.params.sessionId
    const sessionSnap = await db.doc(`sessions/${sessionId}`).get()
    if (!sessionSnap.exists) {
      return
    }

    const session = sessionSnap.data() ?? {}
    const rosterSnap = await db.collection(`sessions/${sessionId}/roster`).get()
    const rosterCount = rosterSnap.size

    const result = await callAppsScript(
      {
        action: 'calendarUpsertSession',
        sessionId,
        session: {
          ...session,
          rosterCount,
        },
        source: 'onRosterWrite',
      },
      webhookSecret.value(),
      formEndpoint.value(),
    )

    if (!result.ok) {
      console.error('calendarUpsertSession failed', sessionId, result.error)
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
