/** Client Firebase config from Vite env (GitHub Secrets at build time). */

export interface FirebaseClientConfig {
  apiKey: string
  authDomain: string
  projectId: string
  appId: string
}

function envTrim(key: string): string | undefined {
  const raw = import.meta.env[key] as string | undefined
  return raw?.trim() || undefined
}

export function getFirebaseConfig(): FirebaseClientConfig | null {
  const apiKey = envTrim('VITE_FIREBASE_API_KEY')
  const authDomain = envTrim('VITE_FIREBASE_AUTH_DOMAIN')
  const projectId = envTrim('VITE_FIREBASE_PROJECT_ID')
  const appId = envTrim('VITE_FIREBASE_APP_ID')

  if (!apiKey || !authDomain || !projectId || !appId) {
    return null
  }

  return { apiKey, authDomain, projectId, appId }
}

export function isFirebaseConfigured(): boolean {
  return getFirebaseConfig() !== null
}
