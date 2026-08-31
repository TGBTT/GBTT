/**
 * Broadcasts that were actually sent.
 *
 * The admin console used to keep a local "outbox" that it appended to whenever
 * the send button was pressed, regardless of whether anything left the
 * building — and nothing ever did, because the send was never wired up. That
 * history read as proof of delivery while being nothing of the kind.
 *
 * These documents are written by the `sendBroadcast` callable only after Apps
 * Script confirms the send, so a row here means the mail went out. Rules make
 * the collection read-only to clients for the same reason.
 */

import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore'
import { getFirestoreDb } from './init'

export interface LiveOutboxMessage {
  id: string
  subject: string
  body: string
  recipientCount: number
  testMode: boolean
  sentAt: Date | null
}

/** Recent sends only: this is a confirmation aid, not an archive. */
const RECENT_LIMIT = 25

export function subscribeOutbox(
  onChange: (messages: LiveOutboxMessage[]) => void,
): () => void {
  const db = getFirestoreDb()
  if (!db) {
    onChange([])
    return () => {}
  }

  return onSnapshot(
    query(collection(db, 'outbox'), orderBy('sentAt', 'desc'), limit(RECENT_LIMIT)),
    (snap) =>
      onChange(
        snap.docs.map((d) => {
          const data = d.data()
          return {
            id: d.id,
            subject: String(data.subject ?? ''),
            body: String(data.body ?? ''),
            recipientCount: Number(data.recipientCount ?? 0),
            testMode: data.testMode === true,
            sentAt: data.sentAt?.toDate?.() ?? null,
          }
        }),
      ),
    () => onChange([]),
  )
}
