/**
 * Marketing and ops reminders, shared across Tom's devices.
 *
 * These used to live in `localStorage`, which meant a reminder added on the
 * phone at the gym was invisible on the laptop that evening, and clearing site
 * data lost the lot. They are staff working notes rather than member data, so
 * rules allow any staff account to read and write them.
 *
 * An empty list is a normal state: there is no seed content here, so a new
 * install starts blank and fills up with real reminders.
 */

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type DocumentData,
} from 'firebase/firestore'
import { getFirestoreDb } from './init'

export type LiveStatus = 'unavailable' | 'loading' | 'ready' | 'error'
export type ReminderKind = 'marketing' | 'ops'

export interface LiveReminder {
  id: string
  title: string
  dueLabel: string
  kind: ReminderKind
  done: boolean
}

export interface LiveRemindersState {
  status: LiveStatus
  reminders: LiveReminder[]
  error?: string
}

function mapReminder(id: string, data: DocumentData): LiveReminder {
  return {
    id,
    title: String(data.title ?? ''),
    dueLabel: String(data.dueLabel ?? ''),
    kind: data.kind === 'marketing' ? 'marketing' : 'ops',
    done: data.done === true,
  }
}

export function subscribeReminders(
  onChange: (state: LiveRemindersState) => void,
): () => void {
  const db = getFirestoreDb()
  if (!db) {
    onChange({ status: 'unavailable', reminders: [] })
    return () => {}
  }

  onChange({ status: 'loading', reminders: [] })

  return onSnapshot(
    query(collection(db, 'reminders'), orderBy('createdAt', 'desc')),
    (snap) =>
      onChange({
        status: 'ready',
        reminders: snap.docs.map((d) => mapReminder(d.id, d.data())),
      }),
    (err) => onChange({ status: 'error', reminders: [], error: err.message }),
  )
}

export async function addReminder(
  title: string,
  dueLabel: string,
  kind: ReminderKind,
): Promise<string | null> {
  const db = getFirestoreDb()
  if (!db) return 'Firebase not configured.'
  if (!title.trim()) return 'Give the reminder a title.'
  try {
    await addDoc(collection(db, 'reminders'), {
      title: title.trim(),
      dueLabel: dueLabel.trim() || 'Soon',
      kind,
      done: false,
      createdAt: serverTimestamp(),
    })
    return null
  } catch (e) {
    return e instanceof Error ? e.message : 'Could not add that reminder.'
  }
}

export async function setReminderDone(id: string, done: boolean): Promise<string | null> {
  const db = getFirestoreDb()
  if (!db) return 'Firebase not configured.'
  try {
    await updateDoc(doc(db, 'reminders', id), { done })
    return null
  } catch (e) {
    return e instanceof Error ? e.message : 'Could not update that reminder.'
  }
}

/** Removes a reminder outright. Ticking one off only hides it; this deletes it. */
export async function removeReminder(id: string): Promise<string | null> {
  const db = getFirestoreDb()
  if (!db) return 'Firebase not configured.'
  try {
    await deleteDoc(doc(db, 'reminders', id))
    return null
  } catch (e) {
    return e instanceof Error ? e.message : 'Could not remove that reminder.'
  }
}
