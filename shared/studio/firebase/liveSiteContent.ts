/**
 * Marketing copy and the legal text members accept.
 *
 * The terms and waiver are the reason this cannot stay in `localStorage`.
 * Acceptance is now recorded server-side against the member, so the text they
 * accepted has to live somewhere durable and shared rather than in whichever
 * browser Tom last edited it from.
 *
 * One document, `siteContent/current`, rather than a document per field: these
 * are edited together on one screen and read together on render, so splitting
 * them would only add reads. Rules give it public read and admin write.
 */

import { doc, onSnapshot, setDoc } from 'firebase/firestore'
import { getFirestoreDb } from './init'

export type LiveStatus = 'unavailable' | 'loading' | 'ready' | 'error'

export interface LiveSiteContent {
  heroBlurb: string
  scheduleNarrative: string
  contactDisplay: string
  paymentInstructions: string
  termsText: string
  waiverText: string
}

export interface LiveSiteContentState {
  status: LiveStatus
  content: LiveSiteContent
  error?: string
}

/**
 * Empty strings rather than invented copy: a blank hero is an obvious prompt
 * to write one, whereas placeholder text reads as real and ships as real.
 */
export const EMPTY_SITE_CONTENT: LiveSiteContent = {
  heroBlurb: '',
  scheduleNarrative: '',
  contactDisplay: '',
  paymentInstructions: '',
  termsText: '',
  waiverText: '',
}

export function subscribeSiteContent(
  onChange: (state: LiveSiteContentState) => void,
): () => void {
  const db = getFirestoreDb()
  if (!db) {
    onChange({ status: 'unavailable', content: EMPTY_SITE_CONTENT })
    return () => {}
  }

  onChange({ status: 'loading', content: EMPTY_SITE_CONTENT })

  return onSnapshot(
    doc(db, 'siteContent', 'current'),
    (snap) => {
      const data = snap.data() ?? {}
      onChange({
        status: 'ready',
        content: {
          heroBlurb: String(data.heroBlurb ?? ''),
          scheduleNarrative: String(data.scheduleNarrative ?? ''),
          contactDisplay: String(data.contactDisplay ?? ''),
          paymentInstructions: String(data.paymentInstructions ?? ''),
          termsText: String(data.termsText ?? ''),
          waiverText: String(data.waiverText ?? ''),
        },
      })
    },
    (err) => onChange({ status: 'error', content: EMPTY_SITE_CONTENT, error: err.message }),
  )
}

export async function saveSiteContent(
  patch: Partial<LiveSiteContent>,
): Promise<string | null> {
  const db = getFirestoreDb()
  if (!db) return 'Firebase not configured.'
  try {
    await setDoc(doc(db, 'siteContent', 'current'), patch, { merge: true })
    return null
  } catch (e) {
    return e instanceof Error ? e.message : 'Could not save this copy.'
  }
}
