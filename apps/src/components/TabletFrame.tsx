import type { ReactNode } from 'react'

/** Booking and admin sit on the page like the rest of the site — no device chrome. */
export function TabletFrame({ children }: { children: ReactNode }) {
  return <>{children}</>
}
