import { useState, type FormEvent } from 'react'
import { FORM_ENDPOINT, formEndpointConfigured } from '../data/formConfig'
import { SITE } from '../data/siteConfig'

type Status = 'idle' | 'sending' | 'sent' | 'error'

export function ContactForm() {
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  const configured = formEndpointConfigured()

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const data = new FormData(form)
    if (String(data.get('company') || '').trim()) {
      setStatus('sent')
      return
    }

    const payload = {
      action: 'enquiry',
      name: String(data.get('name') || '').trim(),
      email: String(data.get('email') || '').trim(),
      phone: String(data.get('phone') || '').trim(),
      message: String(data.get('message') || '').trim(),
      source: 'gbtt-website',
    }

    if (!payload.name || !payload.email || !payload.message) {
      setError('Please fill in name, email, and message.')
      setStatus('error')
      return
    }

    if (!configured) {
      const subject = encodeURIComponent(`GBTT enquiry from ${payload.name}`)
      const body = encodeURIComponent(
        `${payload.message}\n\n—\n${payload.name}\n${payload.email}\n${payload.phone}`,
      )
      window.location.href = `mailto:${SITE.email}?subject=${subject}&body=${body}`
      return
    }

    setStatus('sending')
    setError(null)
    try {
      const res = await fetch(FORM_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setStatus('sent')
      form.reset()
    } catch {
      setError('Could not send right now — email or call Tom instead.')
      setStatus('error')
    }
  }

  return (
    <form className="enquiry-form" onSubmit={onSubmit} noValidate>
      <p className="form-note">
        {configured
          ? 'Sent to Tom via the GBTT enquiry sheet.'
          : 'Form endpoint not connected yet — submit opens your email to Tom.'}
      </p>
      <label>
        Name
        <input name="name" type="text" autoComplete="name" required />
      </label>
      <label>
        Email
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <label>
        Phone
        <input name="phone" type="tel" autoComplete="tel" />
      </label>
      <label>
        Message
        <textarea name="message" rows={5} required />
      </label>
      <label className="hp" aria-hidden="true">
        Company
        <input name="company" type="text" tabIndex={-1} autoComplete="off" />
      </label>
      <button type="submit" className="btn btn--primary" disabled={status === 'sending'}>
        {status === 'sending' ? 'Sending…' : configured ? 'Send enquiry' : 'Email Tom'}
      </button>
      {status === 'sent' ? <p className="form-success">Thanks — Tom will be in touch.</p> : null}
      {status === 'error' && error ? <p className="form-error">{error}</p> : null}
    </form>
  )
}
