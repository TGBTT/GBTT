import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  studioRequestPasswordReset,
  studioSignIn,
  type StudioRole,
} from '@gbtt/shared/studio/studioAuth'
import { homePathForRole } from './studioRoutes'

interface StudioSignInProps {
  /** Heading above the fields; omit to render the form on its own. */
  heading?: string
  /** Copy under the heading. */
  intro?: ReactNode
  /** Buttons rendered beside "Sign in" (registration, cross-links). */
  extraActions?: ReactNode
  /** Hint under the form. */
  hint?: ReactNode
  /** Called after a successful sign-in, before routing. */
  onSignedIn?: (role: StudioRole) => void
  /**
   * Skip the redirect when the caller is already the right place for that
   * role — the member app signing a member in, for instance.
   */
  redirectOnSuccess?: boolean
}

/*
 * Seed credentials are only useful against the local development store, and
 * they are compiled into the bundle, so they are never prefilled in a build.
 */
const SEED_EMAIL = import.meta.env.DEV ? 'alex@demo' : ''
const SEED_PASSWORD = import.meta.env.DEV ? 'demo' : ''

/**
 * The single sign-in form. Nobody says up front whether they are staff or a
 * client: the role comes from the token's custom claim and decides where they
 * land.
 */
export function StudioSignIn({
  heading,
  intro,
  extraActions,
  hint,
  onSignedIn,
  redirectOnSuccess = true,
}: StudioSignInProps) {
  const navigate = useNavigate()
  const [email, setEmail] = useState(SEED_EMAIL)
  const [password, setPassword] = useState(SEED_PASSWORD)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [offerReset, setOfferReset] = useState(false)

  /*
   * Sending the reset is deliberately unconditional on the address existing.
   * Firebase reports "no such user" and echoing that back would turn this form
   * into a way to test which emails hold accounts.
   */
  const sendReset = async () => {
    if (!email.trim()) {
      setError('Enter your email address first, then choose reset.')
      return
    }
    setBusy(true)
    setError(null)
    const err = await studioRequestPasswordReset(email)
    setBusy(false)
    if (err) {
      setError(err)
      return
    }
    setOfferReset(false)
    setNotice(`If an account exists for ${email.trim()}, a reset link is on its way. Check spam too.`)
  }

  const submit = async () => {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const { error: err, role } = await studioSignIn(email, password)
      if (err || !role) {
        setError(err ?? 'Sign-in failed. Try again.')
        setOfferReset(true)
        return
      }
      onSignedIn?.(role)
      if (redirectOnSuccess) navigate(homePathForRole(role))
    } catch {
      setError('Sign-in failed. Try again.')
      setOfferReset(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="studio-signin"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      {heading ? <h2>{heading}</h2> : null}
      {intro ? <p className="app-sub">{intro}</p> : null}
      <label className="field">
        Email
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
        />
      </label>
      <label className="field">
        Password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
      </label>
      {error ? (
        <p className="form-error">
          {error}
          {offerReset ? (
            <>
              {' '}
              <button type="button" className="link-button" onClick={() => void sendReset()}>
                Email me a reset link
              </button>
            </>
          ) : null}
        </p>
      ) : null}
      {notice ? <p className="form-notice">{notice}</p> : null}
      <div className="btn-row">
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        {extraActions}
      </div>
      <p className="hint">
        <button type="button" className="link-button" onClick={() => void sendReset()} disabled={busy}>
          Forgot your password?
        </button>
      </p>
      {hint ? <p className="hint">{hint}</p> : null}
    </form>
  )
}
