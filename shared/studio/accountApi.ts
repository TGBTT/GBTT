/** Google Apps Script web app endpoint, shared with the contact form. */

export const FORM_ENDPOINT =
  (import.meta.env.VITE_FORM_ENDPOINT as string | undefined)?.trim() ||
  'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec'

export function formEndpointConfigured(): boolean {
  return Boolean(FORM_ENDPOINT) && !FORM_ENDPOINT.includes('YOUR_DEPLOYMENT_ID')
}

/*
 * Account activation used to happen here, via an emailed key checked by
 * `activationKeyValid`. That key came from `VITE_ACTIVATION_KEY`, which Vite
 * inlines into the published bundle, so it was readable by anyone who opened
 * the site and could be used to self-activate an account.
 *
 * Firebase email verification replaces it: the link goes to an address only
 * the account holder can read, and the server checks the verified flag on the
 * Auth record rather than trusting anything the browser sends.
 */
