/** Member activation email — Google Apps Script web app (same endpoint as contact form). */

export const FORM_ENDPOINT =
  (import.meta.env.VITE_FORM_ENDPOINT as string | undefined)?.trim() ||
  'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec'

export const DEMO_ACTIVATION_KEY =
  (import.meta.env.VITE_ACTIVATION_KEY as string | undefined)?.trim() || 'GBTT-DEMO-ACTIVATE'

export function formEndpointConfigured(): boolean {
  return Boolean(FORM_ENDPOINT) && !FORM_ENDPOINT.includes('YOUR_DEPLOYMENT_ID')
}

export function activationKeyValid(key: string): boolean {
  return key.trim().toUpperCase() === DEMO_ACTIVATION_KEY.toUpperCase()
}

export async function requestActivationEmail(
  name: string,
  email: string,
  planId: string,
): Promise<{ ok: boolean; error?: string; simulated?: boolean }> {
  const trimmedName = name.trim()
  const trimmedEmail = email.trim().toLowerCase()
  if (!trimmedName || !trimmedEmail) {
    return { ok: false, error: 'Name and email required.' }
  }

  if (!formEndpointConfigured()) {
    return { ok: true, simulated: true }
  }

  try {
    const res = await fetch(FORM_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'activation',
        name: trimmedName,
        email: trimmedEmail,
        planId,
        source: 'member-booking',
      }),
    })
    const data = (await res.json()) as { ok?: boolean; error?: string }
    if (!data.ok) return { ok: false, error: data.error ?? 'Could not send activation email.' }
    return { ok: true }
  } catch {
    return { ok: false, error: 'Network error sending activation email.' }
  }
}
