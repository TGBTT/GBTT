import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'
import { getFunctions, type Functions } from 'firebase/functions'
import { getFirebaseConfig, isFirebaseConfigured } from './config'

/** Must match setGlobalOptions({ region }) in functions/src/index.ts. */
export const FUNCTIONS_REGION = 'australia-southeast1'

let cachedApp: FirebaseApp | null = null
let cachedAuth: Auth | null = null
let cachedDb: Firestore | null = null
let cachedFunctions: Functions | null = null

export interface FirebaseServices {
  app: FirebaseApp
  auth: Auth
  db: Firestore
  functions: Functions
}

/** Initialize Firebase client SDK when env vars are present; otherwise return null. */
export function initFirebase(): FirebaseServices | null {
  if (!isFirebaseConfigured()) {
    return null
  }

  if (cachedApp && cachedAuth && cachedDb && cachedFunctions) {
    return { app: cachedApp, auth: cachedAuth, db: cachedDb, functions: cachedFunctions }
  }

  const config = getFirebaseConfig()
  if (!config) {
    return null
  }

  cachedApp = getApps().length ? getApp() : initializeApp(config)
  cachedAuth = getAuth(cachedApp)
  cachedDb = getFirestore(cachedApp)
  cachedFunctions = getFunctions(cachedApp, FUNCTIONS_REGION)

  return { app: cachedApp, auth: cachedAuth, db: cachedDb, functions: cachedFunctions }
}

export function getFirebaseAuth(): Auth | null {
  return initFirebase()?.auth ?? null
}

export function getFirestoreDb(): Firestore | null {
  return initFirebase()?.db ?? null
}

export function getFirebaseFunctions(): Functions | null {
  return initFirebase()?.functions ?? null
}
