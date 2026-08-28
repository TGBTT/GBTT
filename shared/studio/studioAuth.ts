import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  type User,
} from 'firebase/auth'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { getFirebaseAuth, getFirestoreDb } from './firebase/init'
import { isFirebaseConfigured } from './firebase/config'
import { login as localLogin, logout as localLogout } from './fitnessStudio'

export type StudioRole = 'member' | 'admin' | 'substitute'

export async function studioLogin(email: string, password: string): Promise<string | null> {
  if (!isFirebaseConfigured()) {
    return localLogin(email, password)
  }
  const auth = getFirebaseAuth()
  const db = getFirestoreDb()
  if (!auth || !db) return 'Firebase not configured.'
  try {
    const cred = await signInWithEmailAndPassword(auth, email.trim(), password)
    const profile = await getDoc(doc(db, 'users', cred.user.uid))
    if (!profile.exists()) return 'No profile found for this account.'
    return null
  } catch {
    return 'Sign-in failed. Check email and password.'
  }
}

export async function studioLogout(): Promise<void> {
  if (!isFirebaseConfigured()) {
    localLogout()
    return
  }
  const auth = getFirebaseAuth()
  if (auth) await signOut(auth)
  localLogout()
}

export async function studioRequestPasswordReset(email: string): Promise<string | null> {
  const auth = getFirebaseAuth()
  if (!auth) return 'Firebase not configured.'
  try {
    await sendPasswordResetEmail(auth, email.trim())
    return null
  } catch {
    return 'Could not send reset email.'
  }
}

export async function studioRegisterMember(
  name: string,
  email: string,
  password: string,
  planId: string,
): Promise<string | null> {
  const auth = getFirebaseAuth()
  const db = getFirestoreDb()
  if (!auth || !db) return 'Firebase not configured — contact Tom to create your account.'
  try {
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password)
    await setDoc(doc(db, 'users', cred.user.uid), {
      profile: { name: name.trim(), email: email.trim().toLowerCase(), role: 'member', status: 'active' },
      membership: { planId, classesPerWeek: 2, weeklySlotIds: [], creditsRemaining: 0 },
      compliance: { termsAcceptedAt: null, termsVersion: 1 },
    })
    return null
  } catch (e) {
    return e instanceof Error ? e.message : 'Registration failed.'
  }
}

export function getFirebaseUser(): User | null {
  return getFirebaseAuth()?.currentUser ?? null
}
