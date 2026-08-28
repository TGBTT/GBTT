import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  type User,
} from 'firebase/auth'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { getFirebaseAuth, getFirebaseFunctions, getFirestoreDb } from './firebase/init'
import { isFirebaseConfigured } from './firebase/config'
import { login as localLogin, logout as localLogout } from './fitnessStudio'

export type StudioRole = 'member' | 'admin' | 'substitute'
export type StudioStatus = 'pending' | 'active' | 'suspended'

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
    if (profile.data()?.profile?.status === 'pending') {
      return 'Your account is awaiting approval by the studio — you will be emailed once it is active.'
    }
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

/**
 * Self-registration creates a `pending` profile only. Booking stays locked
 * until an admin approves, and the requested plan is recorded as a preference
 * rather than a membership: security rules reject client-written `membership`
 * and `billing`, since those drive what the member is charged.
 */
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
      profile: {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        role: 'member',
        status: 'pending',
      },
      requested: { planId },
      preferences: { showNameToClassmates: true },
      compliance: { termsAcceptedAt: new Date().toISOString(), termsVersion: 1 },
    })
    return null
  } catch (e) {
    return e instanceof Error ? e.message : 'Registration failed.'
  }
}

/** Booking runs server-side so capacity and the transfer window are enforced. */
export async function studioBookSession(sessionId: string): Promise<string | null> {
  const functions = getFirebaseFunctions()
  if (!functions) return 'Firebase not configured.'
  try {
    await httpsCallable(functions, 'bookSession')({ sessionId })
    return null
  } catch (e) {
    return e instanceof Error ? e.message : 'Could not book this session.'
  }
}

export async function studioCancelBooking(sessionId: string): Promise<string | null> {
  const functions = getFirebaseFunctions()
  if (!functions) return 'Firebase not configured.'
  try {
    await httpsCallable(functions, 'cancelBooking')({ sessionId })
    return null
  } catch (e) {
    return e instanceof Error ? e.message : 'Could not cancel this booking.'
  }
}

export async function studioApproveMember(uid: string): Promise<string | null> {
  const functions = getFirebaseFunctions()
  if (!functions) return 'Firebase not configured.'
  try {
    await httpsCallable(functions, 'approveMember')({ uid })
    return null
  } catch (e) {
    return e instanceof Error ? e.message : 'Could not approve this member.'
  }
}

export function getFirebaseUser(): User | null {
  return getFirebaseAuth()?.currentUser ?? null
}
