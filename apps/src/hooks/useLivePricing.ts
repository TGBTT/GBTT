import { useEffect, useState } from 'react'
import {
  subscribePricingPlans,
  type LivePricingState,
} from '@gbtt/shared/studio/firebase/livePricing'

/** Admin-managed session rates. Falls back to `unavailable` without Firebase. */
export function useLivePricing() {
  const [state, setState] = useState<LivePricingState>({ status: 'loading', plans: [] })

  useEffect(() => subscribePricingPlans(setState), [])

  return state
}
