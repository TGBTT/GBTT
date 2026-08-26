import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { DemoChrome } from '../../components/DemoChrome'
import {
  DEMO_CREDENTIALS,
  FITNESS_PLANS,
  acceptTerms,
  bookAsGuest,
  bookAsMember,
  classTypeById,
  dropMemberBooking,
  formatPrepaid,
  getClassTypes,
  getOccurrences,
  getSessionUser,
  getSiteContent,
  login,
  logout,
  registerMember,
  reshuffleBooking,
  sessionExercises,
  setMemberPlan,
  setShowNameToClassmates,
  spotsLeft,
  syncLabels,
  visibleRosterNames,
  type PlanId,
} from '../../shared/fitnessStudio'

type Panel = 'browse' | 'login' | 'register' | 'account'

/**
 * Book & membership — public fill view, guest book, member login / weekly reshuffle.
 */
export default function StudioFlow() {
  const [, setTick] = useState(0)
  const refresh = () => setTick((n) => n + 1)

  const [panel, setPanel] = useState<Panel>('browse')
  const [focusId, setFocusId] = useState<string | null>(null)
  const [guestName, setGuestName] = useState('')
  const [guestEmail, setGuestEmail] = useState('')
  const [authEmail, setAuthEmail] = useState('alex@demo')
  const [authPassword, setAuthPassword] = useState('demo')
  const [regName, setRegName] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regPlan, setRegPlan] = useState<PlanId>('weekly2')
  const [reshuffleFrom, setReshuffleFrom] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const user = getSessionUser()
  const site = getSiteContent()
  const occurrences = getOccurrences()
  const classTypes = getClassTypes()
  const sync = useMemo(() => syncLabels(), [user?.heldOccurrenceIds?.length, focusId])

  const flash = (ok: string | null, err: string | null) => {
    setMessage(ok)
    setError(err)
    refresh()
  }

  return (
    <div className="fitness-page theme-gbtt">
      <DemoChrome
        theme="Book & membership"
        title="Classes at Rec Park"
        subtitle={site.heroBlurb}
        imageId="studioflow"
        badge="Simulated · localStorage stand-in for Firebase"
        backTo="/"
        backLabel="← Demos hub"
      />

      <div className="sim-toolbar">
        <p className="sim-toolbar__status">
          {user
            ? `Signed in as ${user.name} (${user.role})`
            : 'Public view — fill bars only; names hidden'}
        </p>
        <div className="sim-toolbar__actions">
          {!user ? (
            <>
              <button type="button" className="btn ghost" onClick={() => setPanel('login')}>
                Log in
              </button>
              <button type="button" className="btn primary" onClick={() => setPanel('register')}>
                Subscribe
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn ghost" onClick={() => setPanel('account')}>
                My account
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  logout()
                  setPanel('browse')
                  flash('Signed out.', null)
                }}
              >
                Log out
              </button>
            </>
          )}
          <Link className="btn ghost" to="/fitness/classboard">
            Admin →
          </Link>
        </div>
      </div>

      {message ? <p className="form-success sim-banner">{message}</p> : null}
      {error ? <p className="form-error sim-banner">{error}</p> : null}

      {panel === 'login' && (
        <section className="yacht-panel demo-enter">
          <h2>Member / staff login</h2>
          <p className="hint">
            Demo passwords are all <code>demo</code> —{' '}
            {DEMO_CREDENTIALS.map((c) => c.email).join(' · ')}
          </p>
          <label className="field">
            Email
            <input value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} />
          </label>
          <label className="field">
            Password
            <input
              type="password"
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
            />
          </label>
          <div className="btn-row">
            <button type="button" className="btn ghost" onClick={() => setPanel('browse')}>
              Cancel
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                const err = login(authEmail, authPassword)
                if (err) flash(null, err)
                else {
                  setPanel('browse')
                  flash('Signed in.', null)
                }
              }}
            >
              Sign in
            </button>
          </div>
        </section>
      )}

      {panel === 'register' && (
        <section className="yacht-panel demo-enter">
          <h2>Register a subscription</h2>
          <p className="hint">Subscriptions are based on how many classes you can attend per week.</p>
          <label className="field">
            Name
            <input value={regName} onChange={(e) => setRegName(e.target.value)} />
          </label>
          <label className="field">
            Email
            <input value={regEmail} onChange={(e) => setRegEmail(e.target.value)} />
          </label>
          <div className="pkg-grid">
            {FITNESS_PLANS.filter((p) => p.classesPerWeek > 0 || p.id.startsWith('pack')).map((p) => (
              <button
                key={p.id}
                type="button"
                className={`pkg-card${regPlan === p.id ? ' selected' : ''}`}
                onClick={() => setRegPlan(p.id)}
              >
                <strong>{p.name}</strong>
                <span className="pkg-price">{formatPrepaid(p)}</span>
                <p>{p.blurb}</p>
              </button>
            ))}
          </div>
          <div className="btn-row">
            <button type="button" className="btn ghost" onClick={() => setPanel('browse')}>
              Cancel
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                const err = registerMember(regName, regEmail, regPlan)
                if (err) flash(null, err)
                else {
                  setPanel('account')
                  flash('Registered (password: demo). Accept terms below.', null)
                }
              }}
            >
              Create membership
            </button>
          </div>
        </section>
      )}

      {panel === 'account' && user?.role === 'member' && (
        <section className="yacht-panel demo-enter">
          <h2>My account</h2>
          <p>
            Plan: <strong>{FITNESS_PLANS.find((p) => p.id === user.planId)?.name}</strong>
            {user.classesPerWeek > 0
              ? ` · ${user.heldOccurrenceIds.length}/${user.classesPerWeek} slots this week`
              : ` · ${user.creditsLeft} credits left`}
          </p>
          <p className="hint">{site.paymentInstructions}</p>
          <p>
            Paid status (admin-managed):{' '}
            <strong>{user.paid ? 'Paid' : 'Unpaid'}</strong>
            {user.paymentNote ? ` — ${user.paymentNote}` : ''}
          </p>
          <label className="exercise-check">
            <input
              type="checkbox"
              checked={user.showNameToClassmates}
              onChange={(e) => {
                setShowNameToClassmates(e.target.checked)
                refresh()
              }}
            />
            Show my name to other subscribers in the same class (never on public view)
          </label>
          {!user.termsAccepted ? (
            <div className="legal-box">
              <h3>Terms &amp; waiver</h3>
              <p>{site.termsText}</p>
              <p>{site.waiverText}</p>
              <button
                type="button"
                className="btn primary"
                onClick={() => {
                  acceptTerms()
                  flash('Terms accepted (simulated).', null)
                }}
              >
                I agree
              </button>
            </div>
          ) : (
            <p className="hint">Terms accepted.</p>
          )}
          <h3>Change weekly plan</h3>
          <div className="pkg-grid">
            {FITNESS_PLANS.filter((p) => p.classesPerWeek > 0).map((p) => (
              <button
                key={p.id}
                type="button"
                className={`pkg-card${user.planId === p.id ? ' selected' : ''}`}
                onClick={() => {
                  const err = setMemberPlan(p.id)
                  flash(err ? null : `Switched to ${p.name}.`, err)
                }}
              >
                <strong>{p.name}</strong>
                <p>{p.blurb}</p>
              </button>
            ))}
          </div>
          <h3>My held classes</h3>
          <ul className="held-list">
            {user.heldOccurrenceIds.length === 0 ? <li>None yet — book below.</li> : null}
            {user.heldOccurrenceIds.map((id) => {
              const o = occurrences.find((x) => x.id === id)
              const t = o ? classTypeById(o.classTypeId) : null
              if (!o || !t) return null
              return (
                <li key={id}>
                  {t.name} · {o.dayLabel} {o.time}{' '}
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => {
                      setReshuffleFrom(id)
                      flash('Pick another class below to reshuffle into.', null)
                    }}
                  >
                    Reshuffle
                  </button>{' '}
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => {
                      const err = dropMemberBooking(id)
                      flash(err ? null : 'Dropped.', err)
                    }}
                  >
                    Drop
                  </button>
                </li>
              )
            })}
          </ul>
          <button type="button" className="btn ghost" onClick={() => setPanel('browse')}>
            Back to timetable
          </button>
        </section>
      )}

      <section className="yacht-panel demo-enter">
        <h2>Timetable</h2>
        <p className="hint">{site.scheduleNarrative}</p>
        <div className="class-type-blurb-row">
          {classTypes.map((c) => (
            <article key={c.id} className="class-type-blurb">
              <h3>{c.name}</h3>
              <p>{c.longDescription}</p>
            </article>
          ))}
        </div>
        <div className="class-occ-list">
          {occurrences.map((o) => {
            const type = classTypeById(o.classTypeId)
            if (!type) return null
            const left = spotsLeft(o)
            const full = left === 0
            const fill = Math.min(100, Math.round((o.bookedCount / type.cap) * 100))
            const focused = focusId === o.id
            const exercises = sessionExercises(o)
            const classmates = visibleRosterNames(o, user)
            const held = user?.heldOccurrenceIds.includes(o.id)
            return (
              <div
                key={o.id}
                className={`class-occ-wrap${focused ? ' selected' : ''}${full ? ' is-full' : ''}`}
                onMouseEnter={() => setFocusId(o.id)}
                onFocus={() => setFocusId(o.id)}
              >
                <button
                  type="button"
                  className={`class-occ-card${focused ? ' selected' : ''}${full ? ' is-full' : ''}`}
                  onClick={() => setFocusId(o.id === focusId ? null : o.id)}
                >
                  <strong>
                    {type.name} · {o.time}
                  </strong>
                  <span>{o.dayLabel}</span>
                  <span className="spots-line">
                    {full
                      ? 'Full'
                      : left <= Math.max(2, Math.ceil(type.cap * 0.15))
                        ? `Almost full · ${left} of ${type.cap} left`
                        : `${left} of ${type.cap} spots left`}
                  </span>
                  <div className={`fill-bar ${full ? 'fill-full' : fill >= 85 ? 'fill-critical' : 'fill-ok'}`}>
                    <span style={{ width: `${fill}%` }} />
                  </div>
                  {held ? <span className="held-chip">You&apos;re booked</span> : null}
                </button>
                {focused ? (
                  <div className="occ-detail">
                    <p>
                      <strong>Exercises:</strong>{' '}
                      {exercises.length ? exercises.map((e) => e.name).join(', ') : 'TBC'}
                    </p>
                    {user && classmates.length > 0 ? (
                      <p>
                        <strong>Classmates (opted-in names):</strong> {classmates.join(', ')}
                      </p>
                    ) : (
                      <p className="hint">Public view never shows attendee names.</p>
                    )}
                    <div className="btn-row">
                      {!user && !full ? (
                        <>
                          <input
                            placeholder="Guest name"
                            value={guestName}
                            onChange={(e) => setGuestName(e.target.value)}
                            aria-label="Guest name"
                          />
                          <input
                            placeholder="Guest email"
                            value={guestEmail}
                            onChange={(e) => setGuestEmail(e.target.value)}
                            aria-label="Guest email"
                          />
                          <button
                            type="button"
                            className="btn primary"
                            onClick={() => {
                              const err = bookAsGuest(o.id, guestName, guestEmail)
                              flash(err ? null : 'Guest booked (simulated).', err)
                            }}
                          >
                            Book as guest
                          </button>
                        </>
                      ) : null}
                      {user?.role === 'member' && !held && !full ? (
                        reshuffleFrom ? (
                          <button
                            type="button"
                            className="btn primary"
                            onClick={() => {
                              const err = reshuffleBooking(reshuffleFrom, o.id)
                              setReshuffleFrom(null)
                              flash(err ? null : 'Reshuffled.', err)
                            }}
                          >
                            Move booking here
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn primary"
                            onClick={() => {
                              const err = bookAsMember(o.id)
                              flash(err ? null : 'Booked.', err)
                            }}
                          >
                            Book with membership
                          </button>
                        )
                      ) : null}
                      {held ? (
                        <button
                          type="button"
                          className="btn ghost"
                          onClick={() => {
                            const err = dropMemberBooking(o.id)
                            flash(err ? null : 'Dropped.', err)
                          }}
                        >
                          Drop this class
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
        <p className="sync-chip">{sync.calendar}</p>
        <p className="sync-chip">{sync.firebase}</p>
        <p className="hint">{site.contactDisplay}</p>
      </section>
    </div>
  )
}
