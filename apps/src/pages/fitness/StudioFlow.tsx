import { useMemo, useState } from 'react'
import { ClassTypeDescription } from '@gbtt/shared/studio/ClassTypeDescription'
import { AppChrome } from '../../components/AppChrome'
import { WeekSessionCalendar } from '../../components/WeekSessionCalendar'
import {
  DEMO_ACTIVATION_KEY,
  formEndpointConfigured,
  requestActivationEmail,
} from '@gbtt/shared/studio/accountApi'
import {
  FITNESS_PLANS,
  acceptTerms,
  bookAsGuest,
  bookAsMember,
  classTypeById,
  dropMemberBooking,
  formatSessionAttending,
  formatPrepaid,
  getOccurrences,
  getSessionUser,
  getSiteContent,
  login,
  logout,
  occurrenceById,
  occurrencesByWeekday,
  planById,
  registerMember,
  requestSubscriptionChange,
  reshuffleBooking,
  sessionExercises,
  setShowNameToClassmates,
  spotsLeft,
  syncLabels,
  visibleRosterNames,
  type PlanId,
} from '../../shared/fitnessStudio'

/**
 * Member booking — Mon–Fri calendar grid, login underneath, select / reshuffle sessions.
 */
export default function StudioFlow() {
  const [tick, setTick] = useState(0)
  const refresh = () => setTick((n) => n + 1)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [authEmail, setAuthEmail] = useState('alex@demo')
  const [authPassword, setAuthPassword] = useState('demo')
  const [regName, setRegName] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regPlan, setRegPlan] = useState<PlanId>('weekly2')
  const [regActivationKey, setRegActivationKey] = useState('')
  const [activationEmailSent, setActivationEmailSent] = useState(false)
  const [showRegister, setShowRegister] = useState(false)
  const [guestName, setGuestName] = useState('')
  const [guestEmail, setGuestEmail] = useState('')
  const [reshuffleFrom, setReshuffleFrom] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const user = getSessionUser()
  const member = user?.role === 'member' ? user : null
  const site = getSiteContent()
  const byDay = useMemo(() => occurrencesByWeekday(), [tick])
  const sync = useMemo(() => syncLabels(), [tick])
  const selected = selectedId ? occurrenceById(selectedId) : undefined
  const selectedType = selected ? classTypeById(selected.classTypeId) : undefined

  const flash = (ok: string | null, err: string | null) => {
    setMessage(ok)
    setError(err)
    refresh()
  }

  return (
    <div className="fitness-page theme-gbtt">
      <AppChrome
        theme="Member booking"
        title="Weekly timetable"
        subtitle={site.heroBlurb}
        imageId="studioflow"
        backTo="/"
        backLabel="← GBTT apps"
      />

      <div className="app-sections">
      <section className="yacht-panel cal-panel app-enter app-section">
        <h2>Mon–Fri sessions</h2>
        <p className="hint">
          Weekly memberships lock recurring slots on this timetable — the same day and time every
          week. Move or unlock within your plan allowance.
        </p>
        <WeekSessionCalendar
          byDay={byDay}
          selectedId={selectedId}
          heldIds={member?.weeklyLockedOccurrenceIds ?? []}
          onSelect={setSelectedId}
          mode="member"
        />

        {selected && selectedType ? (
          <div className="occ-detail cal-detail">
            <ClassTypeDescription
              classType={selectedType}
              baseUrl={import.meta.env.BASE_URL}
              title={`${selectedType.name} · ${selected.dayLabel} ${selected.time}`}
            />
            <p>
              {formatSessionAttending(selected)}
              {spotsLeft(selected) === 0 ? ' · Full' : ` · ${spotsLeft(selected)} spots left`}
            </p>
            <p>
              <strong>Planned exercises:</strong>{' '}
              {sessionExercises(selected).map((e) => e.name).join(', ') || 'TBC'}
            </p>
            {member ? (
              <p>
                <strong>Classmates (opted-in):</strong>{' '}
                {visibleRosterNames(selected, member).join(', ') || 'None sharing names'}
              </p>
            ) : (
              <p className="hint">Log in below to book with a membership. Guests can still drop in.</p>
            )}

            {!member && spotsLeft(selected) > 0 ? (
              <div className="btn-row guest-book-row">
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
                    const err = bookAsGuest(selected.id, guestName, guestEmail)
                    flash(err ? null : 'Guest booked (simulated).', err)
                  }}
                >
                  Book as guest
                </button>
              </div>
            ) : null}

            {member ? (
              <div className="btn-row">
                {member.weeklyLockedOccurrenceIds.includes(selected.id) ? (
                  <>
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => {
                        setReshuffleFrom(selected.id)
                        flash('Pick another session on the calendar to move this weekly lock.', null)
                      }}
                    >
                      Move weekly lock
                    </button>
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => {
                        const err = dropMemberBooking(selected.id)
                        flash(err ? null : 'Weekly slot unlocked.', err)
                      }}
                    >
                      Unlock slot
                    </button>
                  </>
                ) : reshuffleFrom ? (
                  <button
                    type="button"
                    className="btn primary"
                    onClick={() => {
                      const err = reshuffleBooking(reshuffleFrom, selected.id)
                      setReshuffleFrom(null)
                      flash(err ? null : 'Weekly lock moved.', err)
                    }}
                  >
                    Move lock here
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn primary"
                    disabled={spotsLeft(selected) === 0}
                    onClick={() => {
                      const err = bookAsMember(selected.id)
                      flash(err ? null : 'Weekly slot locked — repeats every week.', err)
                    }}
                  >
                    Lock weekly slot
                  </button>
                )}
                {reshuffleFrom ? (
                  <button type="button" className="btn ghost" onClick={() => setReshuffleFrom(null)}>
                    Cancel move
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      {message ? <p className="form-success sim-banner app-section app-section--banner">{message}</p> : null}
      {error ? <p className="form-error sim-banner app-section app-section--banner">{error}</p> : null}

      <section className="yacht-panel app-enter app-section" id="login-book">
        <h2>{member ? 'Your membership' : 'Log in to book'}</h2>
        {!member ? (
          <>
            {!showRegister ? (
              <>
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
                  <button
                    type="button"
                    className="btn primary"
                    onClick={() => {
                      const err = login(authEmail, authPassword)
                      flash(err ? null : 'Signed in — select a session on the calendar.', err)
                    }}
                  >
                    Log in to book
                  </button>
                  <button type="button" className="btn ghost" onClick={() => setShowRegister(true)}>
                    New subscription
                  </button>
                </div>
              </>
            ) : (
              <>
                <label className="field">
                  Name
                  <input value={regName} onChange={(e) => setRegName(e.target.value)} />
                </label>
                <label className="field">
                  Email
                  <input value={regEmail} onChange={(e) => setRegEmail(e.target.value)} />
                </label>
                <div className="pkg-grid">
                  {FITNESS_PLANS.filter((p) => p.classesPerWeek > 0).map((p) => (
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
                <label className="field">
                  Activation key
                  <input
                    value={regActivationKey}
                    onChange={(e) => setRegActivationKey(e.target.value)}
                    placeholder="From your confirmation email"
                    autoComplete="one-time-code"
                  />
                </label>
                {activationEmailSent ? (
                  <p className="form-success">
                    {formEndpointConfigured()
                      ? 'Confirmation email sent — enter the activation key above.'
                      : `Demo mode: use activation key ${DEMO_ACTIVATION_KEY}`}
                  </p>
                ) : null}
                <div className="btn-row">
                  <button type="button" className="btn ghost" onClick={() => setShowRegister(false)}>
                    Back to login
                  </button>
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={async () => {
                      const result = await requestActivationEmail(regName, regEmail, regPlan)
                      if (result.ok) {
                        setActivationEmailSent(true)
                        flash(
                          result.simulated
                            ? `Demo: no email sent — use key ${DEMO_ACTIVATION_KEY}`
                            : 'Activation email sent.',
                          null,
                        )
                      } else {
                        flash(null, result.error ?? 'Could not send email.')
                      }
                    }}
                  >
                    Send activation email
                  </button>
                  <button
                    type="button"
                    className="btn primary"
                    onClick={() => {
                      const err = registerMember(regName, regEmail, regPlan, regActivationKey)
                      flash(
                        err
                          ? null
                          : 'Account created (password: demo). Accept terms, then lock your weekly slots.',
                        err,
                      )
                    }}
                  >
                    Activate &amp; create membership
                  </button>
                </div>
              </>
            )}
          </>
        ) : (
          <>
            <p>
              Signed in as <strong>{member.name}</strong> ·{' '}
              {planById(member.planId)?.name}
              {member.classesPerWeek > 0
                ? ` · ${member.weeklyLockedOccurrenceIds.length}/${member.classesPerWeek} weekly slots locked`
                : ` · ${member.creditsLeft} credits`}
            </p>
            {member.pendingPlanId ? (
              <p className="form-success">
                Plan change to <strong>{planById(member.pendingPlanId)?.name}</strong> sent to Tom —
                awaiting payment confirmation.
              </p>
            ) : null}
            <p className="hint">{site.paymentInstructions}</p>
            <label className="exercise-check">
              <input
                type="checkbox"
                checked={member.showNameToClassmates}
                onChange={(e) => {
                  setShowNameToClassmates(e.target.checked)
                  refresh()
                }}
              />
              Show my name to other subscribers in the same class
            </label>
            {!member.termsAccepted ? (
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
            ) : null}

            <h3>Change subscription</h3>
            <p className="hint">
              Changing your plan notifies Tom so he can confirm payment logging before it takes
              effect.
            </p>
            <div className="pkg-grid">
              {FITNESS_PLANS.filter((p) => p.classesPerWeek > 0).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`pkg-card${member.planId === p.id ? ' selected' : ''}${member.pendingPlanId === p.id ? ' is-pending' : ''}`}
                  onClick={() => {
                    const err = requestSubscriptionChange(p.id)
                    flash(
                      err
                        ? null
                        : `Request sent to Tom for ${p.name}. Your current plan stays active until he confirms payment.`,
                      err,
                    )
                  }}
                >
                  <strong>{p.name}</strong>
                  <p>{p.blurb}</p>
                </button>
              ))}
            </div>

            <h3>Your weekly locked slots</h3>
            <ul className="held-list">
              {member.weeklyLockedOccurrenceIds.length === 0 ? (
                <li>None yet — lock a slot on the calendar (repeats every week).</li>
              ) : null}
              {member.weeklyLockedOccurrenceIds.map((id) => {
                const o = getOccurrences().find((x) => x.id === id)
                const t = o ? classTypeById(o.classTypeId) : null
                if (!o || !t) return null
                return (
                  <li key={id}>
                    {t.name} · {o.dayLabel} {o.time}
                  </li>
                )
              })}
            </ul>

            <div className="btn-row">
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  logout()
                  flash('Signed out.', null)
                }}
              >
                Log out
              </button>
            </div>
          </>
        )}
        <p className="sync-chip">{sync.calendar}</p>
        <p className="sync-chip">{sync.firebase}</p>
      </section>
      </div>
    </div>
  )
}
