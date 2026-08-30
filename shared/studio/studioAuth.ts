import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendEmailVerification,
  sendPasswordResetEmail,
  type User,
} from 'firebase/auth'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { getFirebaseAuth, getFirebaseFunctions, getFirestoreDb } from './firebase/init'
import { isFirebaseConfigured } from './firebase/config'
import {
  bindMemberSession,
  bindStaffSession,
  login as localLogin,
  logout as localLogout,
} from './fitnessStudio'

export type StudioRole = 'member' | 'admin' | 'substitute'
export type StudioStatus = 'pending' | 'active' | 'suspended'

export async function studioLogin(email: string, password: string): Promise<string | null> {
  if (!isFirebaseConfigured()) {
    return localLogin(email, password)
  }
  const auth = getFirebaseAuth()
  const db = getFirestoreDb()
  if (!auth || !db) return 'Firebase not configured.'
  try {
    const cred = await signInWithEmailAndPassword(auth, email.trim(), password)
    const profile = await getDoc(doc(db, 'users', cred.user.uid))
    if (!profile.exists()) return 'No profile found for this account.'

    const data = profile.data() ?? {}
    const planId = String(data.membership?.planId ?? data.requested?.planId ?? 'casual')
    const planSnap = await getDoc(doc(db, 'pricingPlans', planId))
    const classesPerWeek = Number(planSnap.data()?.classesPerWeek ?? 0)

    /*
     * A casual account stays `pending` until its first booking activates it off
     * a verified email, so refusing pending sign-ins outright would lock every
     * drop-in out of the account they just created. They are let in and shown
     * the verification prompt instead. Subscriptions still wait for approval,
     * since those carry an allowance an admin has to grant.
     */
    if (data.profile?.status === 'pending' && classesPerWeek > 0) {
      return 'Your account is awaiting approval by the studio — you will be emailed once it is active.'
    }

    bindMemberSession({
      uid: cred.user.uid,
      email: cred.user.email ?? email,
      name: String(data.profile?.name ?? ''),
      planId,
      classesPerWeek,
    })
    return null
  } catch {
    return 'Sign-in failed. Check email and password.'
  }
}

/**
 * Read the role from the signed-in user's ID token.
 *
 * The role lives in a custom claim set by the Admin SDK, not in a Firestore
 * field, so it cannot be forged from the browser: the token is signed by
 * Google and verified by Firestore rules on every request.
 */
export async function studioRole(): Promise<StudioRole | null> {
  const user = getFirebaseAuth()?.currentUser
  if (!user) return null
  const token = await user.getIdTokenResult()
  const role = token.claims.role
  return role === 'admin' || role === 'substitute' || role === 'member' ? role : null
}

/**
 * Staff sign-in for the trainer admin. Falls back to the local seed store in
 * development only; a production build refuses seed staff logins because those
 * passwords ship inside the public bundle.
 */
export async function studioStaffLogin(
  email: string,
  password: string,
): Promise<{ error: string | null; role: StudioRole | null }> {
  if (!isFirebaseConfigured()) {
    if (import.meta.env.PROD) {
      return {
        error: 'Staff sign-in is unavailable until Firebase is configured.',
        role: null,
      }
    }
    return { error: localLogin(email, password), role: null }
  }

  const auth = getFirebaseAuth()
  if (!auth) return { error: 'Firebase not configured.', role: null }

  try {
    await signInWithEmailAndPassword(auth, email.trim(), password)
  } catch {
    return { error: 'Sign-in failed. Check email and password.', role: null }
  }

  const role = await studioRole()
  if (role !== 'admin' && role !== 'substitute') {
    // Signed in, but not staff. Drop the session so the app never renders the
    // admin shell for an account Firestore would reject anyway.
    await signOut(auth)
    return { error: 'This account does not have staff access.', role: null }
  }

  const current = auth.currentUser
  bindStaffSession(current?.email ?? email, current?.displayName ?? '', role)

  return { error: null, role }
}

export async function studioLogout(): Promise<void> {
  if (!isFirebaseConfigured()) {
    localLogout()
    return
  }
  const auth = getFirebaseAuth()
  if (auth) await signOut(auth)
  localLogout()
}

export async function studioRequestPasswordReset(email: string): Promise<string | null> {
  const auth = getFirebaseAuth()
  if (!auth) return 'Firebase not configured.'
  try {
    await sendPasswordResetEmail(auth, email.trim())
    return null
  } catch {
    return 'Could not send reset email.'
  }
}

/**
 * Self-registration creates a `pending` profile only. Booking stays locked
 * until an admin approves, and the requested plan is recorded as a preference
 * rather than a membership: security rules reject client-written `membership`
 * and `billing`, since those drive what the member is charged.
 */
export async function studioRegisterMember(
  name: string,
  email: string,
  password: string,
  planId: string,
): Promise<string | null> {
  const auth = getFirebaseAuth()
  const db = getFirestoreDb()
  if (!auth || !db) return 'Firebase not configured — contact Tom to create your account.'
  try {
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password)
    await setDoc(doc(db, 'users', cred.user.uid), {
      profile: {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        role: 'member',
        status: 'pending',
      },
      requested: { planId },
      preferences: { showNameToClassmates: true },
      compliance: { termsAcceptedAt: new Date().toISOString(), termsVersion: 1 },
    })

    // Casual drop-in accounts activate off this link rather than admin
    // approval, so the email has to go out as part of registering.
    await sendEmailVerification(cred.user)

    const planSnap = await getDoc(doc(db, 'pricingPlans', planId))
    bindMemberSession({
      uid: cred.user.uid,
      email: cred.user.email ?? email,
      name: name.trim(),
      planId,
      classesPerWeek: Number(planSnap.data()?.classesPerWeek ?? 0),
    })
    return null
  } catch (e) {
    return e instanceof Error ? e.message : 'Registration failed.'
  }
}

/** Re-send the verification link a casual account needs before it can book. */
export async function studioResendVerification(): Promise<string | null> {
  const user = getFirebaseAuth()?.currentUser
  if (!user) return 'Sign in first.'
  if (user.emailVerified) return null
  try {
    await sendEmailVerification(user)
    return null
  } catch {
    return 'Could not send the verification email. Try again shortly.'
  }
}

/**
 * Whether the signed-in account has confirmed its email address.
 *
 * Reloads first: `emailVerified` is cached on the client from the last token
 * refresh, so someone who clicks the link in another tab would otherwise still
 * look unverified here and keep being told to check their inbox.
 */
export async function studioEmailVerified(): Promise<boolean> {
  const user = getFirebaseAuth()?.currentUser
  if (!user) return false
  try {
    await user.reload()
  } catch {
    return user.emailVerified
  }
  return user.emailVerified
}

/** Whether a Firebase account is signed in at all (vs a local seed session). */
export function studioHasFirebaseUser(): boolean {
  return Boolean(getFirebaseAuth()?.currentUser)
}

export interface DropInPrompt {
  /** What this extra session will cost, in cents. */
  chargeCents: number
  /** Sessions included in the member's plan each week (0 for casual and packs). */
  allowance: number
  /** Recurring slots they currently hold against that allowance. */
  locked: number
  lockedSlotIds: string[]
}

export interface BookSessionResult {
  error: string | null
  /** Set when the server wants the member to confirm the extra charge first. */
  needsDropInConfirmation: DropInPrompt | null
  chargeCents: number
}

/**
 * Book a single session. Anything booked this way is a paid extra on top of
 * the recurring slots a subscription includes.
 *
 * The first call intentionally comes back asking for confirmation rather than
 * booking, so a member is never charged for an extra without seeing the price.
 * Call again with `acknowledge` once they have agreed.
 */
export async function studioBookSession(
  sessionId: string,
  acknowledge = false,
): Promise<BookSessionResult> {
  const functions = getFirebaseFunctions()
  if (!functions) {
    return { error: 'Firebase not configured.', needsDropInConfirmation: null, chargeCents: 0 }
  }
  try {
    const res = await httpsCallable(functions, 'bookSession')({
      sessionId,
      acknowledgeDropIn: acknowledge,
    })
    const data = (res.data ?? {}) as { chargeCents?: number }
    return {
      error: null,
      needsDropInConfirmation: null,
      chargeCents: Number(data.chargeCents ?? 0),
    }
  } catch (e) {
    const details = (e as { details?: Partial<DropInPrompt> & { reason?: string } })?.details
    if (details?.reason === 'drop-in-confirmation-required') {
      return {
        error: null,
        chargeCents: Number(details.chargeCents ?? 0),
        needsDropInConfirmation: {
          chargeCents: Number(details.chargeCents ?? 0),
          allowance: Number(details.allowance ?? 0),
          locked: Number(details.locked ?? 0),
          lockedSlotIds: details.lockedSlotIds ?? [],
        },
      }
    }
    return {
      error: e instanceof Error ? e.message : 'Could not book this session.',
      needsDropInConfirmation: null,
      chargeCents: 0,
    }
  }
}

export async function studioCancelBooking(sessionId: string): Promise<string | null> {
  const functions = getFirebaseFunctions()
  if (!functions) return 'Firebase not configured.'
  try {
    await httpsCallable(functions, 'cancelBooking')({ sessionId })
    return null
  } catch (e) {
    return e instanceof Error ? e.message : 'Could not cancel this booking.'
  }
}

/**
 * Roll call. Runs server-side so the mark lands in the roster document that
 * calculateBillingPeriod invoices from — a local-only tick would never be billed.
 */
export async function studioMarkAttendance(
  sessionId: string,
  memberId: string,
  status: 'booked' | 'attended' | 'noShow',
): Promise<string | null> {
  const functions = getFirebaseFunctions()
  if (!functions) return 'Firebase not configured.'
  try {
    await httpsCallable(functions, 'markAttendance')({ sessionId, memberId, status })
    return null
  } catch (e) {
    return e instanceof Error ? e.message : 'Could not update attendance.'
  }
}

/** Staff add a client to a session (phone bookings, walk-ins). */
export async function studioAddMemberToSession(
  sessionId: string,
  memberId: string,
): Promise<string | null> {
  const functions = getFirebaseFunctions()
  if (!functions) return 'Firebase not configured.'
  try {
    await httpsCallable(functions, 'addMemberToSession')({ sessionId, memberId })
    return null
  } catch (e) {
    return e instanceof Error ? e.message : 'Could not add this member.'
  }
}

/**
 * Lock a recurring weekly slot. The server fans the lock out into real roster
 * entries for every upcoming week, so capacity and billing see it.
 */
export async function studioLockWeeklySlot(
  slotId: string,
): Promise<{ error: string | null; booked: number; full: number }> {
  const functions = getFirebaseFunctions()
  if (!functions) return { error: 'Firebase not configured.', booked: 0, full: 0 }
  try {
    const res = await httpsCallable(functions, 'lockWeeklySlot')({ slotId })
    const data = (res.data ?? {}) as { booked?: number; full?: number }
    return { error: null, booked: Number(data.booked ?? 0), full: Number(data.full ?? 0) }
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : 'Could not lock this slot.',
      booked: 0,
      full: 0,
    }
  }
}

/** Release a weekly lock; seats inside the transfer window are kept. */
export async function studioUnlockWeeklySlot(
  slotId: string,
): Promise<{ error: string | null; released: number; kept: number }> {
  const functions = getFirebaseFunctions()
  if (!functions) return { error: 'Firebase not configured.', released: 0, kept: 0 }
  try {
    const res = await httpsCallable(functions, 'unlockWeeklySlot')({ slotId })
    const data = (res.data ?? {}) as { released?: number; kept?: number }
    return { error: null, released: Number(data.released ?? 0), kept: Number(data.kept ?? 0) }
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : 'Could not unlock this slot.',
      released: 0,
      kept: 0,
    }
  }
}

export interface RemoveSessionResult {
  error: string | null
  /** `deleted` when nothing was attached; `archived` when a roster was preserved. */
  mode: 'deleted' | 'archived' | null
  booked: number
  attended: number
}

export interface GenerateSeasonResult {
  error: string | null
  created: number
  updated: number
  archived: number
  teachingDays: number
}

/**
 * Build out every session a season implies from the recurring timetable slots.
 *
 * Safe to re-run after shifting dates or adding a closure: sessions are keyed
 * by slot and week so they update in place, and any that now fall inside a
 * closure are archived rather than deleted so their rosters survive.
 */
export async function studioGenerateSeasonSessions(
  seasonId: string,
  dryRun = false,
): Promise<GenerateSeasonResult> {
  const functions = getFirebaseFunctions()
  const empty = { created: 0, updated: 0, archived: 0, teachingDays: 0 }
  if (!functions) return { error: 'Firebase not configured.', ...empty }
  try {
    const res = await httpsCallable(functions, 'generateSeasonSessions')({ seasonId, dryRun })
    const d = (res.data ?? {}) as Record<string, number>
    return {
      error: null,
      created: Number(d.created ?? d.planned ?? 0),
      updated: Number(d.updated ?? 0),
      archived: Number(d.archived ?? d.toArchive ?? 0),
      teachingDays: Number(d.teachingDays ?? 0),
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not generate sessions.', ...empty }
  }
}

export interface BillingRunResult {
  error: string | null
  periodId: string
  totalCents: number
  chargeableCount: number
  attendedCount: number
}

/**
 * Recalculate what a member owes for a season or a calendar month.
 *
 * Pass a `seasonId` for a term, or a `periodStart` (YYYY-MM-DD) to bill a
 * rolling month. The result is written to `users/{uid}/billingPeriods`, which
 * clients can only read — this callable is the only way the figure is set.
 */
export async function studioCalculateBillingPeriod(
  uid: string,
  range: { seasonId?: string; periodStart?: string },
): Promise<BillingRunResult> {
  const functions = getFirebaseFunctions()
  const empty = { periodId: '', totalCents: 0, chargeableCount: 0, attendedCount: 0 }
  if (!functions) return { error: 'Firebase not configured.', ...empty }
  try {
    const res = await httpsCallable(functions, 'calculateBillingPeriod')({ uid, ...range })
    const d = (res.data ?? {}) as Record<string, unknown>
    return {
      error: null,
      periodId: String(d.periodId ?? ''),
      totalCents: Number(d.totalCents ?? 0),
      chargeableCount: Number(d.chargeableCount ?? 0),
      attendedCount: Number(d.attendedCount ?? 0),
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not calculate this period.', ...empty }
  }
}

/**
 * Record that a billing period has been settled.
 *
 * There is no payment gateway — Tom reconciles against the bank and signs off
 * here — so this is the step that marks money as received, and it writes an
 * audit entry naming who cleared it.
 */
export async function studioMarkBillingPeriodPaid(
  uid: string,
  periodId: string,
  paid: boolean,
  note = '',
): Promise<string | null> {
  const functions = getFirebaseFunctions()
  if (!functions) return 'Firebase not configured.'
  try {
    await httpsCallable(functions, 'markBillingPeriodPaid')({ uid, periodId, paid, note })
    return null
  } catch (e) {
    return e instanceof Error ? e.message : 'Could not update this payment.'
  }
}

export interface SeasonProjection {
  error: string | null
  seasonName: string
  planName: string
  sessionCount: number
  ratePerClass: number
  totalCents: number
  billingMode: 'arrears' | 'upfront'
}

/** What a season will cost, from the sessions the member's locked slots produce. */
export async function studioProjectSeasonInvoice(
  seasonId: string,
  uid?: string,
): Promise<SeasonProjection> {
  const functions = getFirebaseFunctions()
  const empty = {
    seasonName: '',
    planName: '',
    sessionCount: 0,
    ratePerClass: 0,
    totalCents: 0,
    billingMode: 'arrears' as const,
  }
  if (!functions) return { error: 'Firebase not configured.', ...empty }
  try {
    const res = await httpsCallable(functions, 'projectSeasonInvoice')({ seasonId, uid })
    const d = (res.data ?? {}) as Record<string, unknown>
    return {
      error: null,
      seasonName: String(d.seasonName ?? ''),
      planName: String(d.planName ?? ''),
      sessionCount: Number(d.sessionCount ?? 0),
      ratePerClass: Number(d.ratePerClass ?? 0),
      totalCents: Number(d.totalCents ?? 0),
      billingMode: d.billingMode === 'upfront' ? 'upfront' : 'arrears',
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not project this season.', ...empty }
  }
}

/**
 * Remove a session. The server deletes it only when no one is attached and
 * archives it otherwise, so attendance history is never destroyed.
 */
export async function studioRemoveSession(
  sessionId: string,
  reason = '',
): Promise<RemoveSessionResult> {
  const functions = getFirebaseFunctions()
  if (!functions) {
    return { error: 'Firebase not configured.', mode: null, booked: 0, attended: 0 }
  }
  try {
    const res = await httpsCallable(functions, 'removeSession')({ sessionId, reason })
    const data = (res.data ?? {}) as {
      mode?: 'deleted' | 'archived'
      booked?: number
      attended?: number
    }
    return {
      error: null,
      mode: data.mode ?? null,
      booked: Number(data.booked ?? 0),
      attended: Number(data.attended ?? 0),
    }
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : 'Could not remove this session.',
      mode: null,
      booked: 0,
      attended: 0,
    }
  }
}

export async function studioApproveMember(uid: string): Promise<string | null> {
  const functions = getFirebaseFunctions()
  if (!functions) return 'Firebase not configured.'
  try {
    await httpsCallable(functions, 'approveMember')({ uid })
    return null
  } catch (e) {
    return e instanceof Error ? e.message : 'Could not approve this member.'
  }
}

export function getFirebaseUser(): User | null {
  return getFirebaseAuth()?.currentUser ?? null
}
