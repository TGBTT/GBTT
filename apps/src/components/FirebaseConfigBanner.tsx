import { isFirebaseConfigured } from '@gbtt/shared/studio/firebase/config'

export function FirebaseConfigBanner() {
  if (isFirebaseConfigured()) return null

  return (
    <div className="config-banner" role="status">
      <strong>Configuration required.</strong> Firebase environment variables are not set — member
      login and live data sync are unavailable until secrets are configured. See{' '}
      <code>docs/secrets-setup.md</code> in the repository.
    </div>
  )
}
