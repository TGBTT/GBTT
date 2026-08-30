/**
 * Admin-managed session pricing.
 *
 * `pricingPlans/*` is the source of truth for what a class costs: the drop-in
 * charge recorded on every one-off booking reads `pricingPlans/casual`, and
 * each subscription tier carries its own per-class rate. The local seed store
 * has its own copy for offline development, but rates edited there never reach
 * a booking, so the admin console writes here.
 *
 * Rules allow any signed-in user to read pricing and only an admin to write it.
 */

import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore'
import { getFirestoreDb } from './init'

export interface LivePricingPlan {
  id: string
  name: string
  /** Per-class rate for this tier, in dollars. */
  ratePerClass: number
  /** Sessions included each week; 0 marks the casual drop-in tier. */
  classesPerWeek: number
  blurb?: string
}

export interface LivePricingState {
  status: 'unavailable' | 'loading' | 'ready' | 'error'
  plans: LivePricingPlan[]
  error?: string
}

export function subscribePricingPlans(
  onChange: (state: LivePricingState) => void,
): () => void {
  const db = getFirestoreDb()
  if (!db) {
    onChange({ status: 'unavailable', plans: [] })
    return () => {}
  }

  onChange({ status: 'loading', plans: [] })

  return onSnapshot(
    collection(db, 'pricingPlans'),
    (snap) => {
      const plans = snap.docs
        .map((d) => ({
          id: d.id,
          name: String(d.data().name ?? d.id),
          ratePerClass: Number(d.data().ratePerClass ?? 0),
          classesPerWeek: Number(d.data().classesPerWeek ?? 0),
          blurb: d.data().blurb ? String(d.data().blurb) : undefined,
        }))
        // Cheapest commitment first: drop-in, then 1, 2, 3 a week.
        .sort((a, b) => a.classesPerWeek - b.classesPerWeek)
      onChange({ status: 'ready', plans })
    },
    (err) => onChange({ status: 'error', plans: [], error: err.message }),
  )
}

export async function savePricingPlan(
  planId: string,
  patch: Partial<Omit<LivePricingPlan, 'id'>>,
): Promise<string | null> {
  const db = getFirestoreDb()
  if (!db) return 'Firebase not configured.'
  if (patch.ratePerClass != null && (!Number.isFinite(patch.ratePerClass) || patch.ratePerClass < 0)) {
    return 'Rate must be zero or more.'
  }
  try {
    await setDoc(doc(db, 'pricingPlans', planId), patch, { merge: true })
    return null
  } catch (e) {
    return e instanceof Error ? e.message : 'Could not save this rate.'
  }
}
