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
import { currentWeekStart, listSessionsForSlot } from './firebase/liveSessions'
import { bindMemberSession, bindStaffSession, logout as localLogout } from './fitnessStudio'

export type StudioRole = 'member' | 'admin' | 'trainer'
export type StudioStatus = 'pending' | 'active' | 'suspended'

/**
 * Apply the member checks a sign-in has to pass: read the `users/{uid}`
 * profile, refuse a subscription still waiting on approval, and bind the local
 * UI session. Nothing here grants anything — Firestore rules and the callables
 * check the token — it decides what the member app renders.
 */
async function completeMemberSignIn(
  user: User,
  fallbackEmail: string,
  /** Whether to drop the Auth session when no profile document exists. */
  signOutWhenUninvited: boolean,
): Promise<string | null> {
  const auth = getFirebaseAuth()
  const db = getFirestoreDb()
  if (!db) return 'Firebase not configured.'

  const profile = await getDoc(doc(db, 'users', user.uid))
  if (!profile.exists()) {
    if (signOutWhenUninvited && auth) await signOut(auth)
    return 'No studio account is linked to this sign-in. Ask the studio to send you an invitation.'
  }

  const data = profile.data() ?? {}
  const planId = String(data.membership?.planId ?? data.requested?.planId ?? 'casual')
  const planSnap = await getDoc(doc(db, 'pricingPlans', planId))
  const classesPerWeek = Number(planSnap.data()?.classesPerWeek ?? 0)

  if (data.profile?.status === 'suspended') {
    if (auth) await signOut(auth)
    return 'This account is suspended. Contact the studio.'
  }

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
    uid: user.uid,
    email: user.email ?? fallbackEmail,
    name: String(data.profile?.name ?? ''),
    planId,
    classesPerWeek,
  })
  return null
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
  // `substitute` was the old name for `trainer`; a token minted before the
  // rename still carries it. Remove once no legacy claims exist.
  if (role === 'substitute') return 'trainer'
  return role === 'admin' || role === 'trainer' || role === 'member' ? role : null
}

/**
 * Apply the staff checks after a successful sign-in.
 *
 * Hiding the admin shell is not the protection — Firestore rules and the
 * callables reject a token without the claim regardless — but rendering it for
 * an account that cannot use it is only confusing, so the session is dropped.
 */
async function completeStaffSignIn(
  fallbackEmail: string,
): Promise<{ error: string | null; role: StudioRole | null }> {
  const auth = getFirebaseAuth()
  const db = getFirestoreDb()
  if (!auth || !db) return { error: 'Firebase not configured.', role: null }

  const role = await studioRole()
  if (role !== 'admin' && role !== 'trainer') {
    await signOut(auth)
    return { error: 'This account does not have staff access.', role: null }
  }

  const current = auth.currentUser
  const profile = current ? await getDoc(doc(db, 'users', current.uid)) : null
  if (!profile?.exists()) {
    await signOut(auth)
    return {
      error: 'No studio profile exists for this account. Ask the studio to set it up.',
      role: null,
    }
  }
  if (profile.data()?.profile?.status === 'suspended') {
    await signOut(auth)
    return { error: 'This staff account is suspended.', role: null }
  }

  bindStaffSession(current?.email ?? fallbackEmail, current?.displayName ?? '', role)

  return { error: null, role }
}

/**
 * Combined sign-in for the one shared form: authenticate once, read the role
 * from the custom claim, then run whichever completion path that role needs.
 *
 * The resolved role comes back so the caller can route — staff to the admin
 * console, members to the member app — without the person having to say up
 * front which kind of account they hold.
 */
export async function studioSignIn(
  email: string,
  password: string,
): Promise<{ error: string | null; role: StudioRole | null }> {
  if (!isFirebaseConfigured()) {
    return { error: 'Sign-in is unavailable until Firebase is configured.', role: null }
  }

  const auth = getFirebaseAuth()
  if (!auth) return { error: 'Firebase not configured.', role: null }

  let user: User
  try {
    const cred = await signInWithEmailAndPassword(auth, email.trim(), password)
    user = cred.user
  } catch {
    return { error: 'Sign-in failed. Check email and password.', role: null }
  }

  try {
    const role = await studioRole()
    if (role === 'admin' || role === 'trainer') return await completeStaffSignIn(email)
    // Anything without a staff claim is treated as a member, which keeps the
    // existing behaviour for accounts minted before the claim was set.
    const error = await completeMemberSignIn(user, email, false)
    return { error, role: error ? null : 'member' }
  } catch {
    return { error: 'Sign-in failed. Try again.', role: null }
  }
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

/**
 * Where Firebase sends people once they have set a new password or confirmed
 * their address. Without it they land on Firebase's bare confirmation screen
 * with no way back into the app.
 *
 * Built from the running origin so a preview build returns to itself rather
 * than bouncing people to production. The domain has to be listed under
 * Authentication → Settings → Authorized domains.
 */
function signInContinueUrl(): { url: string; handleCodeInApp: false } {
  const base = import.meta.env.VITE_APP_BASE ?? '/app/'
  return { url: new URL(`${base}signin/`, window.location.origin).toString(), handleCodeInApp: false }
}

export async function studioRequestPasswordReset(email: string): Promise<string | null> {
  const auth = getFirebaseAuth()
  if (!auth) return 'Firebase not configured.'
  try {
    await sendPasswordResetEmail(auth, email.trim(), signInContinueUrl())
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
    await sendEmailVerification(cred.user, signInContinueUrl())

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
    await sendEmailVerification(user, signInContinueUrl())
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
  seasonId?: string,
): Promise<{ error: string | null; booked: number; full: number; skipped: number }> {
  const functions = getFirebaseFunctions()
  if (!functions) return { error: 'Firebase not configured.', booked: 0, full: 0, skipped: 0 }
  try {
    const payload: { slotId: string; seasonId?: string } = { slotId }
    if (seasonId) payload.seasonId = seasonId
    const res = await httpsCallable(functions, 'lockWeeklySlot')(payload)
    const data = (res.data ?? {}) as { booked?: number; full?: number; skipped?: number }
    return {
      error: null,
      booked: Number(data.booked ?? 0),
      full: Number(data.full ?? 0),
      // Sessions already past their transfer cutoff, which the lock cannot claim.
      skipped: Number(data.skipped ?? 0),
    }
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : 'Could not lock this slot.',
      booked: 0,
      full: 0,
      skipped: 0,
    }
  }
}

/** Lock one included session for the displayed week only. */
export async function studioLockSessionWeek(
  sessionId: string,
): Promise<{ error: string | null; weekStart: string | null }> {
  const functions = getFirebaseFunctions()
  if (!functions) return { error: 'Firebase not configured.', weekStart: null }
  try {
    const res = await httpsCallable(functions, 'lockSessionWeek')({ sessionId })
    const data = (res.data ?? {}) as { weekStart?: string }
    return { error: null, weekStart: String(data.weekStart ?? '') || null }
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : 'Could not lock this session.',
      weekStart: null,
    }
  }
}

/** Release one week's seat; records a skip when a season lock is behind it. */
export async function studioReleaseSessionWeek(
  sessionId: string,
): Promise<{ error: string | null; hadSeasonLock: boolean }> {
  const functions = getFirebaseFunctions()
  if (!functions) return { error: 'Firebase not configured.', hadSeasonLock: false }
  try {
    const res = await httpsCallable(functions, 'releaseSessionWeek')({ sessionId })
    const data = (res.data ?? {}) as { hadSeasonLock?: boolean }
    return { error: null, hadSeasonLock: data.hadSeasonLock === true }
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : 'Could not free this session.',
      hadSeasonLock: false,
    }
  }
}

export interface UnlockSlotResult {
  error: string | null
  released: number
  kept: number
  /**
   * True when the slot is spent for this week: its class is inside the
   * transfer window, so the member counts as attending it and nothing was
   * released. Distinguished from a plain error so the UI can explain that the
   * slot can be changed once the week rolls over.
   */
  committedThisWeek: boolean
}

/** Release a weekly lock; seats inside the transfer window are kept. */
export async function studioUnlockWeeklySlot(slotId: string): Promise<UnlockSlotResult> {
  const functions = getFirebaseFunctions()
  if (!functions) {
    return { error: 'Firebase not configured.', released: 0, kept: 0, committedThisWeek: false }
  }
  try {
    const res = await httpsCallable(functions, 'unlockWeeklySlot')({ slotId })
    const data = (res.data ?? {}) as { released?: number; kept?: number }
    return {
      error: null,
      released: Number(data.released ?? 0),
      kept: Number(data.kept ?? 0),
      committedThisWeek: false,
    }
  } catch (e) {
    const details = (e as { details?: { reason?: string } })?.details
    return {
      error: e instanceof Error ? e.message : 'Could not unlock this slot.',
      released: 0,
      kept: 0,
      committedThisWeek: details?.reason === 'slot-committed-this-week',
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
  /** Seats given to members holding a weekly slot in the new sessions. */
  seatsFilled: number
  /** Members whose recurring calendar invite was re-issued as a result. */
  membersUpdated: number
  /** New sessions the shared calendar would not take; they need a retry. */
  calendarFailed: number
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
  const empty = {
    created: 0,
    updated: 0,
    archived: 0,
    teachingDays: 0,
    seatsFilled: 0,
    membersUpdated: 0,
    calendarFailed: 0,
  }
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
      seatsFilled: Number(d.seatsFilled ?? 0),
      membersUpdated: Number(d.membersUpdated ?? 0),
      calendarFailed: Number(d.calendarFailed ?? 0),
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

export interface CalendarSubscribeLinks {
  error: string | null
  /** One-click add for people already in Google Calendar. */
  htmlLink: string
  /** The ICS address to paste into Apple Calendar, Outlook or anything else. */
  icsUrl: string
  publicUrl: string
}

/**
 * Where to subscribe to the shared class timetable.
 *
 * Returned from the server rather than built here: the calendar id is Tom's,
 * not something the client should carry, and the server caches the lookup so
 * every app load does not cost an Apps Script call.
 */
export async function studioCalendarSubscribeLinks(): Promise<CalendarSubscribeLinks> {
  const functions = getFirebaseFunctions()
  const empty = { htmlLink: '', icsUrl: '', publicUrl: '' }
  if (!functions) return { error: 'Firebase not configured.', ...empty }
  try {
    const res = await httpsCallable(functions, 'getCalendarSubscribeUrl')({})
    const d = (res.data ?? {}) as Record<string, unknown>
    const htmlLink = String(d.htmlLink ?? '')
    const icsUrl = String(d.icsUrl ?? '')
    const publicUrl = String(d.publicUrl ?? '')
    const serverError =
      typeof d.error === 'string' && d.error.trim() ? d.error.trim() : null
    // Soft failures return ok:false with empty links instead of throwing. Treat
    // those as errors so the UI leaves “Loading…” for the ask-Tom path.
    if (d.ok === false || !icsUrl) {
      return {
        error: serverError ?? 'The shared class calendar is not available yet.',
        htmlLink,
        icsUrl,
        publicUrl,
      }
    }
    return { error: null, htmlLink, icsUrl, publicUrl }
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : 'Could not load the calendar link.',
      ...empty,
    }
  }
}

export interface RemoveSlotSessionsResult {
  error: string | null
  deleted: number
  archived: number
}

/**
 * Remove the live sessions filed under a standing slot from a week onwards.
 *
 * Only the current week and later are touched: a week that has already run
 * carries attendance and billing history, and undoing a class laid too far
 * across the calendar must not erase what people already attended. Each
 * session still goes through `removeSession`, so a week with a roster is
 * archived rather than deleted.
 */
export async function studioRemoveSlotSessions(
  slotId: string,
  reason = 'Removed with recurring class',
  fromWeekStart: string = currentWeekStart(),
): Promise<RemoveSlotSessionsResult> {
  let sessions: { id: string }[]
  try {
    sessions = await listSessionsForSlot(slotId, fromWeekStart)
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : 'Could not list sessions for this class.',
      deleted: 0,
      archived: 0,
    }
  }

  let deleted = 0
  let archived = 0
  for (const session of sessions) {
    const result = await studioRemoveSession(session.id, reason)
    if (result.error) {
      return {
        error:
          deleted + archived
            ? `Removed ${deleted + archived}, then stopped: ${result.error}`
            : result.error,
        deleted,
        archived,
      }
    }
    if (result.mode === 'archived') archived += 1
    else deleted += 1
  }
  return { error: null, deleted, archived }
}

export interface CreateMemberInput {
  name: string
  email: string
  phone?: string
  planId?: string
  classesPerWeek?: number
}

export interface CreateMemberResult {
  error: string | null
  uid: string
  /** Whether the Apps Script invite email went out. */
  inviteEmailSent: boolean
  /** Why the invite email failed, when it did. */
  inviteError: string | null
}

/**
 * Admin creates a client account.
 *
 * The server does the work that cannot be trusted to a browser: the Auth user,
 * the `member` claim, the active profile, and the password-reset link the
 * invite email carries. There is no password here — the client sets their own
 * from that link.
 */
export async function studioCreateMemberAccount(
  input: CreateMemberInput,
): Promise<CreateMemberResult> {
  const functions = getFirebaseFunctions()
  if (!functions) {
    return { error: 'Firebase not configured.', uid: '', inviteEmailSent: false, inviteError: null }
  }
  try {
    const res = await httpsCallable(functions, 'createMemberAccount')({
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
      phone: (input.phone ?? '').trim(),
      planId: input.planId ?? 'weekly1',
      classesPerWeek: input.classesPerWeek ?? 1,
    })
    const d = (res.data ?? {}) as {
      uid?: string
      inviteEmailSent?: boolean
      inviteError?: string | null
    }
    return {
      error: null,
      uid: String(d.uid ?? ''),
      inviteEmailSent: Boolean(d.inviteEmailSent),
      inviteError: d.inviteError ?? null,
    }
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : 'Could not create this account.',
      uid: '',
      inviteEmailSent: false,
      inviteError: null,
    }
  }
}

/**
 * Member asks Tom to move them to another plan.
 *
 * Returns the error, or null. The plan does not change here — the current one
 * runs until Tom confirms, which is what the caller should tell the member.
 */
export async function studioRequestPlanChange(
  planId: string,
  notes = '',
): Promise<string | null> {
  const functions = getFirebaseFunctions()
  if (!functions) return 'Firebase not configured.'
  try {
    await httpsCallable(functions, 'requestPlanChange')({ planId, notes })
    return null
  } catch (e) {
    return e instanceof Error ? e.message : 'Could not send that request.'
  }
}

/**
 * Admin promotes a client to trainer, or returns them to member.
 *
 * The new claim only reaches them when their ID token next refreshes, so tell
 * them to sign out and back in before expecting the admin console to open.
 */
export async function studioSetMemberRole(
  uid: string,
  role: 'member' | 'trainer',
): Promise<string | null> {
  const functions = getFirebaseFunctions()
  if (!functions) return 'Firebase not configured.'
  try {
    await httpsCallable(functions, 'setMemberRole')({ uid, role })
    return null
  } catch (e) {
    return e instanceof Error ? e.message : 'Could not change this role.'
  }
}

/** Admin approves or declines a member's open plan change. */
export async function studioResolvePlanChange(
  uid: string,
  approve: boolean,
): Promise<string | null> {
  const functions = getFirebaseFunctions()
  if (!functions) return 'Firebase not configured.'
  try {
    await httpsCallable(functions, 'resolvePlanChange')({ uid, approve })
    return null
  } catch (e) {
    return e instanceof Error ? e.message : 'Could not update this request.'
  }
}

/**
 * Records that the member accepted the terms and waiver.
 *
 * This is a direct write rather than a callable: `compliance` is one of the
 * few areas rules leave in the member's own hands, and the acceptance is only
 * meaningful as a record of what they themselves clicked.
 */
export async function studioAcceptTerms(): Promise<string | null> {
  const user = getFirebaseAuth()?.currentUser
  const db = getFirestoreDb()
  if (!user || !db) return 'Sign in first.'
  try {
    await setDoc(
      doc(db, 'users', user.uid),
      { compliance: { termsAcceptedAt: new Date().toISOString() } },
      { merge: true },
    )
    return null
  } catch (e) {
    return e instanceof Error ? e.message : 'Could not record your acceptance.'
  }
}

/** Member's choice about showing their name to classmates. */
export async function studioSetShowName(value: boolean): Promise<string | null> {
  const user = getFirebaseAuth()?.currentUser
  const db = getFirestoreDb()
  if (!user || !db) return 'Sign in first.'
  try {
    await setDoc(
      doc(db, 'users', user.uid),
      { preferences: { showNameToClassmates: value } },
      { merge: true },
    )
    return null
  } catch (e) {
    return e instanceof Error ? e.message : 'Could not save that preference.'
  }
}

/**
 * Member-owned health notes for class safety.
 *
 * Only `limitations` is written — merge keeps staff `riskNotes` intact, and
 * rules freeze that field for anyone who is not an admin.
 */
export async function studioSaveMyLimitations(limitations: string): Promise<string | null> {
  const user = getFirebaseAuth()?.currentUser
  const db = getFirestoreDb()
  if (!user || !db) return 'Sign in first.'
  try {
    await setDoc(doc(db, 'users', user.uid), { clinical: { limitations } }, { merge: true })
    return null
  } catch (e) {
    return e instanceof Error ? e.message : 'Could not save your health notes.'
  }
}

/**
 * Email every active member.
 *
 * `testMode` sends only to Tom's own inbox, which is the safe way to check a
 * message reads correctly before it reaches the whole roll.
 */
export async function studioSendBroadcast(
  subject: string,
  body: string,
  testMode: boolean,
): Promise<{ error: string | null; recipientCount: number }> {
  const functions = getFirebaseFunctions()
  if (!functions) return { error: 'Firebase not configured.', recipientCount: 0 }
  try {
    const res = await httpsCallable(functions, 'sendBroadcast')({ subject, body, testMode })
    const data = (res.data ?? {}) as { recipientCount?: number }
    return { error: null, recipientCount: Number(data.recipientCount ?? 0) }
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : 'Could not send this broadcast.',
      recipientCount: 0,
    }
  }
}

/** Admin re-sends the set-password invite to a client who never received it. */
export async function studioResendInvite(email: string): Promise<string | null> {
  const functions = getFirebaseFunctions()
  if (!functions) return 'Firebase not configured.'
  try {
    await httpsCallable(functions, 'resendInvite')({ email: email.trim().toLowerCase() })
    return null
  } catch (e) {
    return e instanceof Error ? e.message : 'Could not resend the invite.'
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
