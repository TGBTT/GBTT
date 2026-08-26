/** Apps Script web-app URL — leave placeholder until Tom’s Google project is deployed. */
export const FORM_ENDPOINT =
  (import.meta.env.VITE_FORM_ENDPOINT as string | undefined)?.trim() ||
  'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec'

export function formEndpointConfigured(): boolean {
  return Boolean(FORM_ENDPOINT) && !FORM_ENDPOINT.includes('YOUR_DEPLOYMENT_ID')
}
