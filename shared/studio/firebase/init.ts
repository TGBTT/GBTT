import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'
import { getFirebaseConfig, isFirebaseConfigured } from './config'

let cachedApp: FirebaseApp | null = null
let cachedAuth: Auth | null = null
let cachedDb: Firestore | null = null

export interface FirebaseServices {
  app: FirebaseApp
  auth: Auth
  db: Firestore
}

/** Initialize Firebase client SDK when env vars are present; otherwise return null. */
export function initFirebase(): FirebaseServices | null {
  if (!isFirebaseConfigured()) {
    return null
  }

  if (cachedApp && cachedAuth && cachedDb) {
    return { app: cachedApp, auth: cachedAuth, db: cachedDb }
  }

  const config = getFirebaseConfig()
  if (!config) {
    return null
  }

  cachedApp = getApps().length ? getApp() : initializeApp(config)
  cachedAuth = getAuth(cachedApp)
  cachedDb = getFirestore(cachedApp)

  return { app: cachedApp, auth: cachedAuth, db: cachedDb }
}

export function getFirebaseAuth(): Auth | null {
  return initFirebase()?.auth ?? null
}

export function getFirestoreDb(): Firestore | null {
  return initFirebase()?.db ?? null
}
