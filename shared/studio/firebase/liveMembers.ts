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
  lineItems: LiveBillingLineItem[]
  tierSummaries: LiveTierSummary[]
}

export interface LiveBillingLineItem {
  sessionId: string
  label: string
  amountCents: number
  planId: string
}

export interface LiveTierSummary {
  planId: string
  classesPerWeek: number
  ratePerClassCents: number
  weeks: number
  sessions: number
  amountCents: number
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
  /** Member-owned health notes; staff risk notes are never exposed here. */
  limitations: string
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

export type PaymentMethod = 'cash' | 'bank'

export interface LivePayment {
  id: string
  uid: string
  amountCents: number
  method: PaymentMethod
  paidOn: string
  note: string
}

export interface LivePaymentsState {
  status: LiveStatus
  /** Payments keyed by member uid, newest paidOn first. */
  byMember: Record<string, LivePayment[]>
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
  const rawItems = Array.isArray(data.lineItems) ? data.lineItems : []
  const rawTiers = Array.isArray(data.tierSummaries) ? data.tierSummaries : []
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
    lineItems: rawItems.map((item: DocumentData) => ({
      sessionId: String(item.sessionId ?? ''),
      label: String(item.label ?? ''),
      amountCents: Number(item.amountCents ?? 0),
      planId: String(item.planId ?? ''),
    })),
    tierSummaries: rawTiers.map((tier: DocumentData) => ({
      planId: String(tier.planId ?? ''),
      classesPerWeek: Number(tier.classesPerWeek ?? 0),
      ratePerClassCents: Number(tier.ratePerClassCents ?? 0),
      weeks: Number(tier.weeks ?? 0),
      sessions: Number(tier.sessions ?? 0),
      amountCents: Number(tier.amountCents ?? 0),
    })),
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
    const clinical = (latest.clinical ?? {}) as DocumentData

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
        limitations: String(clinical.limitations ?? ''),
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

/** Invoice total still marked owed across billing periods, in cents. */
export function invoicedOwedCents(periods: LiveBillingPeriod[] = []): number {
  return periods.filter((p) => p.status === 'owed').reduce((sum, p) => sum + p.totalCents, 0)
}

/** Sum of recorded payments, in cents. */
export function paymentsTotalCents(payments: LivePayment[] = []): number {
  return payments.reduce((sum, p) => sum + p.amountCents, 0)
}

/**
 * Balance after invoices and the payment ledger.
 *
 * Periods already marked paid (legacy checkbox) are excluded from the invoice
 * side; cash/bank entries reduce what remains on owed periods.
 */
export function outstandingCents(
  periods: LiveBillingPeriod[] = [],
  payments: LivePayment[] = [],
): number {
  return Math.max(0, invoicedOwedCents(periods) - paymentsTotalCents(payments))
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

/**
 * Set how many included sessions a member may lock per week.
 *
 * Prefer `studioUpdateMemberAllowance` from studioAuth (records billing history).
 * This helper forwards there when the functions SDK is available via a lazy
 * import to avoid a circular module graph.
 */
export async function saveMemberClassesPerWeek(
  uid: string,
  classesPerWeek: number,
): Promise<string | null> {
  if (!Number.isFinite(classesPerWeek) || classesPerWeek < 0 || classesPerWeek > 14) {
    return 'Sessions per week must be between 0 and 14.'
  }
  const { studioUpdateMemberAllowance } = await import('../studioAuth')
  return studioUpdateMemberAllowance(uid, Math.round(classesPerWeek))
}

/**
 * Manual billing adjustment in cents (positive increases owed, negative reduces).
 * Applied on the next `calculateBillingPeriod` run via `exceptions`.
 */
export async function saveBillingAdjustment(
  uid: string,
  adjustmentCents: number,
  note = '',
): Promise<string | null> {
  const db = getFirestoreDb()
  if (!db) return 'Firebase not configured.'
  if (!Number.isFinite(adjustmentCents)) {
    return 'Adjustment must be a number of cents.'
  }
  try {
    const id = `adj-${Date.now()}`
    await setDoc(doc(db, 'users', uid, 'exceptions', id), {
      billingAdjustmentCents: Math.round(adjustmentCents),
      note: note.trim(),
      createdAt: new Date().toISOString(),
    })
    return null
  } catch (e) {
    return e instanceof Error ? e.message : 'Could not save this adjustment.'
  }
}

function mapPayment(id: string, uid: string, data: DocumentData): LivePayment {
  const method = data.method === 'bank' ? 'bank' : 'cash'
  return {
    id,
    uid,
    amountCents: Number(data.amountCents ?? 0),
    method,
    paidOn: String(data.paidOn ?? ''),
    note: String(data.note ?? ''),
  }
}

/** Every member's payment ledger entries, one collection-group listener. */
export function subscribePayments(onChange: (state: LivePaymentsState) => void): () => void {
  const db = getFirestoreDb()
  if (!db) {
    onChange({ status: 'unavailable', byMember: {} })
    return () => {}
  }

  onChange({ status: 'loading', byMember: {} })

  return onSnapshot(
    collectionGroup(db, 'payments'),
    (snap) => {
      const byMember: Record<string, LivePayment[]> = {}
      for (const d of snap.docs) {
        const uid = d.ref.parent.parent?.id
        if (!uid) continue
        byMember[uid] = [...(byMember[uid] ?? []), mapPayment(d.id, uid, d.data())]
      }
      for (const uid of Object.keys(byMember)) {
        byMember[uid].sort((a, b) => b.paidOn.localeCompare(a.paidOn) || b.id.localeCompare(a.id))
      }
      onChange({ status: 'ready', byMember })
    },
    (err) => onChange({ status: 'error', byMember: {}, error: err.message }),
  )
}
