/**
 * The class catalogue: what each class is, who it suits, and how many fit.
 *
 * This is member-facing copy as well as admin configuration — the warnings and
 * restrictions are what someone reads before deciding a class is safe for
 * them — so it cannot live in one browser's `localStorage`. `cap` matters more
 * still: it is the default capacity a new session is created with, and the
 * server enforces the session's own `cap` on every booking.
 *
 * Rules give `classTypes` public read and admin write, so the marketing site
 * can render the catalogue without a signed-in user.
 *
 * Exercises are a separate collection referenced by id rather than embedded,
 * because the same movement appears in several classes and renaming it in one
 * place should not leave the others stale.
 */

import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
  type DocumentData,
} from 'firebase/firestore'
import { getFirestoreDb } from './init'

export type LiveStatus = 'unavailable' | 'loading' | 'ready' | 'error'

export interface LiveExercise {
  id: string
  name: string
}

export interface LiveClassType {
  id: string
  name: string
  blurb: string
  longDescription: string
  warnings: string
  restrictions: string
  recommendations: string
  whatToBring: string
  cap: number
  exerciseIds: string[]
  /** Soft-deleted classes stay readable so historic sessions still resolve. */
  active: boolean
}

export interface LiveClassTypesState {
  status: LiveStatus
  classTypes: LiveClassType[]
  error?: string
}

export interface LiveExercisesState {
  status: LiveStatus
  exercises: LiveExercise[]
  error?: string
}

/**
 * Seeded documents carry only id, name and cap, so every other field has to
 * tolerate being absent rather than rendering "undefined" at a member.
 */
function mapClassType(id: string, data: DocumentData): LiveClassType {
  return {
    id,
    name: String(data.name ?? id),
    blurb: String(data.blurb ?? ''),
    longDescription: String(data.longDescription ?? ''),
    warnings: String(data.warnings ?? ''),
    restrictions: String(data.restrictions ?? ''),
    recommendations: String(data.recommendations ?? ''),
    whatToBring: String(data.whatToBring ?? ''),
    cap: Number(data.cap ?? 0),
    exerciseIds: Array.isArray(data.exerciseIds) ? data.exerciseIds.map(String) : [],
    active: data.active !== false,
  }
}

export function subscribeClassTypes(
  onChange: (state: LiveClassTypesState) => void,
): () => void {
  const db = getFirestoreDb()
  if (!db) {
    onChange({ status: 'unavailable', classTypes: [] })
    return () => {}
  }

  onChange({ status: 'loading', classTypes: [] })

  return onSnapshot(
    collection(db, 'classTypes'),
    (snap) => {
      const classTypes = snap.docs
        .map((d) => mapClassType(d.id, d.data()))
        .sort((a, b) => a.name.localeCompare(b.name))
      onChange({ status: 'ready', classTypes })
    },
    (err) => onChange({ status: 'error', classTypes: [], error: err.message }),
  )
}

export function subscribeExercises(
  onChange: (state: LiveExercisesState) => void,
): () => void {
  const db = getFirestoreDb()
  if (!db) {
    onChange({ status: 'unavailable', exercises: [] })
    return () => {}
  }

  onChange({ status: 'loading', exercises: [] })

  return onSnapshot(
    collection(db, 'exercises'),
    (snap) => {
      const exercises = snap.docs
        .map((d) => ({ id: d.id, name: String(d.data().name ?? d.id) }))
        .sort((a, b) => a.name.localeCompare(b.name))
      onChange({ status: 'ready', exercises })
    },
    (err) => onChange({ status: 'error', exercises: [], error: err.message }),
  )
}

/** Slug an admin-typed name into a stable document id. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export async function saveClassType(
  classTypeId: string,
  patch: Partial<Omit<LiveClassType, 'id'>>,
): Promise<string | null> {
  const db = getFirestoreDb()
  if (!db) return 'Firebase not configured.'
  if (patch.cap != null && (!Number.isFinite(patch.cap) || patch.cap < 1)) {
    return 'Capacity must be at least one.'
  }
  try {
    await setDoc(doc(db, 'classTypes', classTypeId), patch, { merge: true })
    return null
  } catch (e) {
    return e instanceof Error ? e.message : 'Could not save this class.'
  }
}

export async function createClassType(input: {
  name: string
  cap: number
  blurb?: string
}): Promise<{ error: string | null; id: string }> {
  const db = getFirestoreDb()
  if (!db) return { error: 'Firebase not configured.', id: '' }

  const name = input.name.trim()
  if (!name) return { error: 'Give the class a name.', id: '' }

  const id = slugify(name)
  if (!id) return { error: 'That name has no letters or numbers to make an id from.', id: '' }
  if (!Number.isFinite(input.cap) || input.cap < 1) {
    return { error: 'Capacity must be at least one.', id: '' }
  }

  try {
    // Merged rather than overwritten: reusing the name of an archived class
    // should bring it back, not silently blank its description.
    await setDoc(
      doc(db, 'classTypes', id),
      { name, cap: Math.round(input.cap), blurb: input.blurb ?? '', active: true },
      { merge: true },
    )
    return { error: null, id }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not create this class.', id: '' }
  }
}

/**
 * Archive rather than delete: sessions already run under this class still name
 * it, and attendance history has to keep resolving.
 */
export async function archiveClassType(classTypeId: string): Promise<string | null> {
  return saveClassType(classTypeId, { active: false })
}

export async function restoreClassType(classTypeId: string): Promise<string | null> {
  return saveClassType(classTypeId, { active: true })
}

export async function addExercise(name: string): Promise<{ error: string | null; id: string }> {
  const db = getFirestoreDb()
  if (!db) return { error: 'Firebase not configured.', id: '' }

  const clean = name.trim()
  if (!clean) return { error: 'Give the exercise a name.', id: '' }

  const id = slugify(clean)
  if (!id) return { error: 'That name has no letters or numbers to make an id from.', id: '' }

  try {
    await setDoc(doc(db, 'exercises', id), { name: clean }, { merge: true })
    return { error: null, id }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not add this exercise.', id: '' }
  }
}

export async function renameExercise(
  exerciseId: string,
  name: string,
): Promise<string | null> {
  const db = getFirestoreDb()
  if (!db) return 'Firebase not configured.'
  const clean = name.trim()
  if (!clean) return 'Give the exercise a name.'
  try {
    // The id stays put so the class types referencing it keep resolving.
    await setDoc(doc(db, 'exercises', exerciseId), { name: clean }, { merge: true })
    return null
  } catch (e) {
    return e instanceof Error ? e.message : 'Could not rename this exercise.'
  }
}

/**
 * Removes the exercise and every reference to it.
 *
 * Deleting the document alone would leave dangling ids in `exerciseIds`, which
 * render as gaps in the class detail, so the references go in the same pass.
 */
export async function deleteExercise(
  exerciseId: string,
  classTypes: LiveClassType[],
): Promise<string | null> {
  const db = getFirestoreDb()
  if (!db) return 'Firebase not configured.'
  try {
    await Promise.all(
      classTypes
        .filter((c) => c.exerciseIds.includes(exerciseId))
        .map((c) =>
          setDoc(
            doc(db, 'classTypes', c.id),
            { exerciseIds: c.exerciseIds.filter((id) => id !== exerciseId) },
            { merge: true },
          ),
        ),
    )
    await deleteDoc(doc(db, 'exercises', exerciseId))
    return null
  } catch (e) {
    return e instanceof Error ? e.message : 'Could not delete this exercise.'
  }
}

/** Add or remove one exercise from a class type. */
export async function toggleExercise(
  classType: LiveClassType,
  exerciseId: string,
): Promise<string | null> {
  const next = classType.exerciseIds.includes(exerciseId)
    ? classType.exerciseIds.filter((id) => id !== exerciseId)
    : [...classType.exerciseIds, exerciseId]
  return saveClassType(classType.id, { exerciseIds: next })
}
