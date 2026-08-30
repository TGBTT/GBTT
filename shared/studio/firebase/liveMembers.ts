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
  query,
  setDoc,
  where,
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
  planId: string
  classesPerWeek: number
  discountPct: number
  totalAttended: number
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

  return {
    uid,
    name: String(profile.name ?? uid),
    email: String(profile.email ?? ''),
    status: String(profile.status ?? 'pending'),
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

/** Every member profile. Staff only — rules deny this to members. */
export function subscribeMembers(onChange: (state: LiveMembersState) => void): () => void {
  const db = getFirestoreDb()
  if (!db) {
    onChange({ status: 'unavailable', members: [] })
    return () => {}
  }

  onChange({ status: 'loading', members: [] })

  return onSnapshot(
    query(collection(db, 'users'), where('profile.role', '==', 'member')),
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
