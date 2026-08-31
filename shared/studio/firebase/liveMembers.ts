/**
 * Members and what they owe, for the admin payments screen.
 *
 * The screen used to render from the browser's seed store, which meant the
 * owed figure was derived from a plan's prepaid total rather than from any
 * invoice, and ticking "paid" only changed that one browser. Both now come
 * from Firestore: `billingPeriods` is written solely by the billing callables,
 * so an amount shown here is one the server actually calculated.
 *
 * Rules allow staff to read `users` and admins to read `billingPeriods`.
 */

import {
  collection,
  collectionGroup,
  doc,
  onSnapshot,
  setDoc,
  type DocumentData,
} from 'firebase/firestore'
import { getFirestoreDb } from './init'

export type LiveStatus = 'unavailable' | 'loading' | 'ready' | 'error'

export interface LiveBillingPeriod {
  id: string
  uid: string
  periodStart: string
  periodEnd: string
  seasonName: string | null
  status: 'owed' | 'paid'
  totalCents: number
  chargeableCount: number
  attendedCount: number
  paymentNote: string
}

export interface LiveMember {
  uid: string
  name: string
  email: string
  status: string
  /**
   * The status held before archiving, so restoring is faithful rather than a
   * blanket activation. Empty for anyone who has never been archived.
   */
  statusBeforeArchive: string
  /** 'member', or 'trainer'/'admin' for a client Tom has elevated. */
  role: string
  limitations: string
  riskNotes: string
  planId: string
  classesPerWeek: number
  discountPct: number
  totalAttended: number
}

/** The signed-in member's own record, for the things they control themselves. */
export interface LiveProfile {
  uid: string
  name: string
  email: string
  planId: string
  classesPerWeek: number
  creditsRemaining: number
  showNameToClassmates: boolean
  termsAccepted: boolean
  /** The plan they have asked to move to, while Tom has yet to action it. */
  pendingPlanId: string | null
  pendingPlanName: string | null
}

export interface LiveProfileState {
  status: LiveStatus
  profile: LiveProfile | null
  error?: string
}

export interface LiveMembersState {
  status: LiveStatus
  members: LiveMember[]
  error?: string
}

export interface LiveBillingState {
  status: LiveStatus
  /** Billing periods keyed by member uid, newest first. */
  byMember: Record<string, LiveBillingPeriod[]>
  error?: string
}

function mapMember(uid: string, data: DocumentData): LiveMember {
  const profile = (data.profile ?? {}) as DocumentData
  const membership = (data.membership ?? {}) as DocumentData
  const billing = (data.billing ?? {}) as DocumentData
  const attendance = (data.attendanceSummary ?? {}) as DocumentData
  const clinical = (data.clinical ?? {}) as DocumentData

  return {
    uid,
    name: String(profile.name ?? uid),
    email: String(profile.email ?? ''),
    status: String(profile.status ?? 'pending'),
    statusBeforeArchive: String(profile.statusBeforeArchive ?? ''),
    role: String(profile.role ?? 'member'),
    limitations: String(clinical.limitations ?? ''),
    riskNotes: String(clinical.riskNotes ?? ''),
    planId: String(membership.planId ?? 'casual'),
    classesPerWeek: Number(membership.classesPerWeek ?? 0),
    discountPct: Number(billing.customDiscountPct ?? 0),
    totalAttended: Number(attendance.totalAttended ?? 0),
  }
}

function mapBillingPeriod(id: string, uid: string, data: DocumentData): LiveBillingPeriod {
  return {
    id,
    uid,
    periodStart: String(data.periodStart ?? ''),
    periodEnd: String(data.periodEnd ?? ''),
    seasonName: data.seasonName ? String(data.seasonName) : null,
    status: data.status === 'paid' ? 'paid' : 'owed',
    totalCents: Number(data.totalCents ?? 0),
    chargeableCount: Number(data.chargeableCount ?? 0),
    attendedCount: Number(data.attendedCount ?? 0),
    paymentNote: String(data.paymentNote ?? ''),
  }
}

/**
 * The signed-in member's own profile and any open plan change.
 *
 * Two listeners rather than one: the plan request lives outside the user
 * document precisely because members may not write their own `membership`, so
 * the pending plan has to be read from where the callable puts it.
 */
export function subscribeMyProfile(
  uid: string,
  onChange: (state: LiveProfileState) => void,
): () => void {
  const db = getFirestoreDb()
  if (!db || !uid) {
    onChange({ status: 'unavailable', profile: null })
    return () => {}
  }

  onChange({ status: 'loading', profile: null })

  let latest: DocumentData | null = null
  let pendingPlanId: string | null = null
  let pendingPlanName: string | null = null

  const emit = () => {
    if (!latest) return
    const profile = (latest.profile ?? {}) as DocumentData
    const membership = (latest.membership ?? {}) as DocumentData
    const preferences = (latest.preferences ?? {}) as DocumentData
    const compliance = (latest.compliance ?? {}) as DocumentData

    onChange({
      status: 'ready',
      profile: {
        uid,
        name: String(profile.name ?? ''),
        email: String(profile.email ?? ''),
        planId: String(membership.planId ?? 'casual'),
        classesPerWeek: Number(membership.classesPerWeek ?? 0),
        creditsRemaining: Number(membership.creditsRemaining ?? 0),
        showNameToClassmates: preferences.showNameToClassmates !== false,
        termsAccepted: Boolean(compliance.termsAcceptedAt),
        pendingPlanId,
        pendingPlanName,
      },
    })
  }

  const stopUser = onSnapshot(
    doc(db, 'users', uid),
    (snap) => {
      latest = snap.data() ?? {}
      emit()
    },
    (err) => onChange({ status: 'error', profile: null, error: err.message }),
  )

  const stopRequest = onSnapshot(
    doc(db, 'planChangeRequests', uid),
    (snap) => {
      const data = snap.data()
      pendingPlanId = data ? String(data.toPlanId ?? '') || null : null
      pendingPlanName = data ? String(data.requestedPlanName ?? '') || null : null
      emit()
    },
    // A missing request is the normal case and must not blank the profile.
    () => {
      pendingPlanId = null
      pendingPlanName = null
      emit()
    },
  )

  return () => {
    stopUser()
    stopRequest()
  }
}

/** Every open plan change request, for the admin members screen. */
export function subscribePlanChangeRequests(
  onChange: (requests: { uid: string; memberName: string; requestedPlanName: string }[]) => void,
): () => void {
  const db = getFirestoreDb()
  if (!db) return () => {}

  return onSnapshot(
    collection(db, 'planChangeRequests'),
    (snap) =>
      onChange(
        snap.docs.map((d) => ({
          uid: d.id,
          memberName: String(d.data().memberName ?? d.id),
          requestedPlanName: String(d.data().requestedPlanName ?? d.data().toPlanId ?? ''),
        })),
      ),
    () => onChange([]),
  )
}

/**
 * Every account. Staff only — rules deny this to members.
 *
 * Deliberately unfiltered by role: the team list is just the elevated end of
 * the same roll, so filtering here would mean a second listener over the same
 * documents. Callers narrow by `role`.
 */
export function subscribeMembers(onChange: (state: LiveMembersState) => void): () => void {
  const db = getFirestoreDb()
  if (!db) {
    onChange({ status: 'unavailable', members: [] })
    return () => {}
  }

  onChange({ status: 'loading', members: [] })

  return onSnapshot(
    collection(db, 'users'),
    (snap) => {
      const members = snap.docs
        .map((d) => mapMember(d.id, d.data()))
        .sort((a, b) => a.name.localeCompare(b.name))
      onChange({ status: 'ready', members })
    },
    (err) => onChange({ status: 'error', members: [], error: err.message }),
  )
}

/**
 * Every member's billing periods, in one collection-group listener.
 *
 * Subscribing per member would open a listener per row and reopen them all
 * whenever the member list changed; one group listener stays constant as the
 * roll grows. Rules restrict `billingPeriods` reads to the owner or an admin,
 * so this only resolves for an admin.
 */
export function subscribeBillingPeriods(onChange: (state: LiveBillingState) => void): () => void {
  const db = getFirestoreDb()
  if (!db) {
    onChange({ status: 'unavailable', byMember: {} })
    return () => {}
  }

  onChange({ status: 'loading', byMember: {} })

  return onSnapshot(
    collectionGroup(db, 'billingPeriods'),
    (snap) => {
      const byMember: Record<string, LiveBillingPeriod[]> = {}
      for (const d of snap.docs) {
        const uid = d.ref.parent.parent?.id
        if (!uid) continue
        byMember[uid] = [...(byMember[uid] ?? []), mapBillingPeriod(d.id, uid, d.data())]
      }
      for (const uid of Object.keys(byMember)) {
        byMember[uid].sort((a, b) => b.periodStart.localeCompare(a.periodStart))
      }
      onChange({ status: 'ready', byMember })
    },
    (err) => onChange({ status: 'error', byMember: {}, error: err.message }),
  )
}

/**
 * Save a member's limitations and risk notes.
 *
 * Admin-only by rules: `clinical` is one of the fields a member may not change
 * on their own document, so what a trainer reads at the door is what Tom wrote.
 */
export async function saveMemberClinical(
  uid: string,
  clinical: { limitations?: string; riskNotes?: string },
): Promise<string | null> {
  const db = getFirestoreDb()
  if (!db) return 'Firebase not configured.'
  try {
    await setDoc(doc(db, 'users', uid), { clinical }, { merge: true })
    return null
  } catch (e) {
    return e instanceof Error ? e.message : 'Could not save these notes.'
  }
}

/** Members who have stopped coming, kept off the working roll. */
export const ARCHIVED_STATUS = 'archived'

export function isArchivedMember(member: LiveMember): boolean {
  return member.status === ARCHIVED_STATUS
}

/**
 * Move a member into the archive, or bring one back.
 *
 * A status rather than a delete: the billing periods and attendance under an
 * account are the record of what someone was charged for and turned up to, and
 * someone leaving is no reason to lose it. `archived` also falls outside the
 * broadcast query, which targets `active` only, so an archived member stops
 * receiving studio email without anything else having to know about them.
 *
 * Signing in is deliberately left alone — that is what `suspended` is for.
 *
 * Written straight to Firestore because rules already restrict `users` updates
 * to admins.
 */
export async function setMemberArchived(
  member: LiveMember,
  archived: boolean,
): Promise<string | null> {
  const db = getFirestoreDb()
  if (!db) return 'Firebase not configured.'

  const profile = archived
    ? { status: ARCHIVED_STATUS, statusBeforeArchive: member.status }
    : { status: member.statusBeforeArchive || 'active', statusBeforeArchive: '' }

  try {
    await setDoc(doc(db, 'users', member.uid), { profile }, { merge: true })
    return null
  } catch (e) {
    return e instanceof Error
      ? e.message
      : `Could not ${archived ? 'archive' : 'restore'} this member.`
  }
}

/** Total still owed across a member's unpaid periods, in cents. */
export function outstandingCents(periods: LiveBillingPeriod[] = []): number {
  return periods.filter((p) => p.status === 'owed').reduce((sum, p) => sum + p.totalCents, 0)
}

/**
 * Set a member's standing discount.
 *
 * Written straight to Firestore rather than through a callable because rules
 * already restrict `users` updates to admins, and this is the field
 * `calculateBillingPeriod` reads, so an edit here reaches the next invoice.
 */
export async function saveMemberDiscount(uid: string, discountPct: number): Promise<string | null> {
  const db = getFirestoreDb()
  if (!db) return 'Firebase not configured.'
  if (!Number.isFinite(discountPct) || discountPct < 0 || discountPct > 100) {
    return 'Discount must be between 0 and 100.'
  }
  try {
    await setDoc(
      doc(db, 'users', uid),
      { billing: { customDiscountPct: Math.round(discountPct) } },
      { merge: true },
    )
    return null
  } catch (e) {
    return e instanceof Error ? e.message : 'Could not save this discount.'
  }
}
