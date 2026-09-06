/** Client Firebase config from Vite env (GitHub Secrets at build time). */

export interface FirebaseClientConfig {
  apiKey: string
  authDomain: string
  projectId: string
  appId: string
}

function envTrim(key: string): string | undefined {
  const raw = import.meta.env[key] as string | undefined
  const value = raw?.trim()
  // GitHub Actions `gh secret set --body -` without a piped value stores a
  // literal dash, which is truthy and would initialise Auth against a bogus key.
  if (!value || value === '-') return undefined
  return value
}

/** GitHub Actions sometimes stores a literal "-" when a secret was created empty. */
function isPlaceholder(value: string | undefined): boolean {
  if (!value) return true
  const v = value.trim()
  if (!v) return true
  if (v === '-' || v === 'undefined' || v === 'null') return true
  if (/^YOUR_/i.test(v)) return true
  return false
}

/**
 * A dash or other placeholder still counts as "set" for Vite, so the app would
 * initialise Firebase against `australia-southeast1--.cloudfunctions.net` and
 * the browser reports a certificate error on every callable.
 */
function isUsableConfig(
  apiKey: string,
  authDomain: string,
  projectId: string,
  appId: string,
): boolean {
  if ([apiKey, authDomain, projectId, appId].some(isPlaceholder)) return false
  // Project ids are a single DNS label. A dotted value (custom domain, Pages
  // host) produces a hostname the cloudfunctions.net wildcard cert does not cover.
  if (!/^[a-z0-9][a-z0-9-]{4,29}$/.test(projectId)) return false
  if (!authDomain.includes('.')) return false
  if (apiKey.length < 16) return false
  if (!appId.includes(':')) return false
  return true
}

export function getFirebaseConfig(): FirebaseClientConfig | null {
  const apiKey = envTrim('VITE_FIREBASE_API_KEY')
  const authDomain = envTrim('VITE_FIREBASE_AUTH_DOMAIN')
  const projectId = envTrim('VITE_FIREBASE_PROJECT_ID')
  const appId = envTrim('VITE_FIREBASE_APP_ID')

  if (!apiKey || !authDomain || !projectId || !appId) {
    return null
  }
  if (!isUsableConfig(apiKey, authDomain, projectId, appId)) {
    return null
  }

  return { apiKey, authDomain, projectId, appId }
}

export function isFirebaseConfigured(): boolean {
  return getFirebaseConfig() !== null
}
