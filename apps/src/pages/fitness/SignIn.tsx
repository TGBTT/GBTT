import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AppOutsideShell } from '../../components/AppChrome'
import { StudioSignIn } from '../../components/StudioSignIn'
import { MEMBER_PATH, homePathForRole } from '../../components/studioRoutes'
import { getSessionRole, subscribeStore } from '../../shared/fitnessStudio'

/**
 * The one sign-in screen. Staff and clients use the same form; the role on the
 * token decides whether they land in the admin console or the member app.
 */
export default function SignIn() {
  const navigate = useNavigate()
  const [role, setRole] = useState(getSessionRole())

  useEffect(() => subscribeStore(() => setRole(getSessionRole())), [])

  // Someone already signed in has no business on this page.
  useEffect(() => {
    if (role !== 'public') navigate(homePathForRole(role), { replace: true })
  }, [role, navigate])

  return (
    <div className="classboard-page theme-gbtt">
      <AppOutsideShell imageId="classboard" />
      <div className="app-sections">
        <header className="classboard-top app-section">
          <div>
            <p className="app-badge">GBTT sign-in</p>
            <h1>Sign in</h1>
            <p className="app-sub">
              One sign-in for everyone. Clients go to booking, Tom and the trainers go to the admin
              console.
            </p>
          </div>
        </header>
        <section className="yacht-panel app-enter admin-login app-section">
          <StudioSignIn
            extraActions={
              <Link className="btn ghost" to={`${MEMBER_PATH}#login-book`}>
                Create an account
              </Link>
            }
            hint="Use the password you set from your invitation email, or create an account if you are new."
          />
        </section>
      </div>
    </div>
  )
}
