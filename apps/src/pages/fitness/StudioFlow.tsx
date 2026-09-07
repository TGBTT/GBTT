import { useEffect, useMemo, useState } from 'react'
import { ClassTypeDescription } from '@gbtt/shared/studio/ClassTypeDescription'
import { AppChrome } from '../../components/AppChrome'
import { WeekSessionCalendar } from '../../components/WeekSessionCalendar'
import { WorkingOverlay, useWorkingOverlay } from '../../components/WorkingOverlay'
import {
  useLiveSessions,
  useMyProfile,
  useMyWeekBookings,
  useWeekNavigation,
  useWeeklyLocks,
} from '../../hooks/useLiveSessions'
import { useLiveSettings } from '../../hooks/useLiveCatalog'
import { currentWeekStart } from '@gbtt/shared/studio/firebase/liveSessions'
import { WeekNavigator } from '../../components/WeekNavigator'
import { SeasonCost } from '../../components/SeasonCost'
import { StudioSignIn } from '../../components/StudioSignIn'
import {
  studioAcceptTerms,
  studioBookSession,
  studioEmailVerified,
  studioHasFirebaseUser,
  studioLockSessionWeek,
  studioLockWeeklySlot,
  studioRegisterMember,
  studioReleaseSessionWeek,
  studioRequestPlanChange,
  studioResendVerification,
  studioSaveMyLimitations,
  studioSetShowName,
  studioUnlockWeeklySlot,
  type DropInPrompt,
} from '@gbtt/shared/studio/studioAuth'
import {
  formatSessionAttending,
  getSessionUser,
  logout,
  sessionExercises,
  spotsLeft,
  subscribeStore,
  visibleRosterNames,
  type ClassOccurrence,
} from '../../shared/fitnessStudio'
import {
  useLiveClassTypes,
  useLiveExercises,
  useLiveSiteContent,
} from '../../hooks/useLiveCatalog'
import { useLivePricing } from '../../hooks/useLivePricing'

/**
 * Member booking — Mon–Fri calendar grid, login underneath, select / reshuffle sessions.
 */
export default function StudioFlow() {
  const [tick, setTick] = useState(0)
  const refresh = () => setTick((n) => n + 1)

  // Signing in or out from the site nav mutates the store without going
  // through this page, so re-read it whenever the store changes.
  useEffect(() => subscribeStore(refresh), [])

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [regName, setRegName] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regPlan, setRegPlan] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [verified, setVerified] = useState(true)
  const [verifyNote, setVerifyNote] = useState<string | null>(null)
  const [showRegister, setShowRegister] = useState(false)
  const [reshuffleFrom, setReshuffleFrom] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const user = getSessionUser()
  const member = user?.role === 'member' ? user : null
  const catalog = useLiveClassTypes()
  const exerciseState = useLiveExercises()
  const site = useLiveSiteContent().content
  // Rates come from the same documents the admin edits and billing charges, so
  // a member is never quoted a price the studio does not actually use.
  const pricing = useLivePricing()
  const classTypeById = (id: string) => catalog.classTypes.find((c) => c.id === id)
  const planById = (id: string) => pricing.plans.find((p) => p.id === id)
  const classNames = Object.fromEntries(catalog.classTypes.map((c) => [c.id, c.name]))

  // Plans arrive after first render. Default to the drop-in tier, which is the
  // one that needs no approval, so someone signing up is never left with no
  // plan selected and a button that will not submit.
  useEffect(() => {
    setRegPlan(
      (current) =>
        current || (pricing.plans.find((p) => p.classesPerWeek === 0) ?? pricing.plans[0])?.id || '',
    )
  }, [pricing.plans])
  // Firestore is authoritative for availability, so members are never shown an
  // invented spot count.
  const week = useWeekNavigation()
  const live = useLiveSessions(week.weekStart)
  const lockedSlotIds = useWeeklyLocks(member?.id ?? null)
  const sessionIds = useMemo(() => live.occurrences.map((o) => o.id), [live.occurrences])
  const { bookedIds: myBookedIds, includedIds: myIncludedIds } = useMyWeekBookings(
    member?.id ?? null,
    sessionIds,
  )
  const myProfile = useMyProfile(!!member).profile
  const byDay = live.byDay
  const selected = selectedId
    ? live.occurrences.find((o) => o.id === selectedId)
    : undefined
  const selectedType = selected ? classTypeById(selected.classTypeId) : undefined
  const { run: runWithOverlay, overlayProps, busy: overlayBusy } = useWorkingOverlay()
  const [busy, setBusy] = useState(false)
  const actionBusy = busy || overlayBusy
  const [dropIn, setDropIn] = useState<{ prompt: DropInPrompt; occ: ClassOccurrence } | null>(null)

  const formatMoney = (cents: number) => `$${(cents / 100).toFixed(2)}`

  /**
   * What a plan costs, phrased the way it is charged.
   *
   * Subscriptions are billed per class attended at the tier's rate rather than
   * as a flat monthly fee, so quoting a monthly total would be a number the
   * member never actually sees on an invoice.
   */
  const formatPlanRate = (plan: { ratePerClass: number; classesPerWeek: number }) =>
    plan.classesPerWeek > 0
      ? `$${plan.ratePerClass.toFixed(2)} a class · ${plan.classesPerWeek} a week`
      : `$${plan.ratePerClass.toFixed(2)} per drop-in`

  /** Readable label for a locked slot id, from any session generated by that slot. */
  const slotLabel = (slotId: string) => {
    const occ = live.occurrences.find((o) => o.slotId === slotId)
    if (!occ) return slotId
    return `${classTypeById(occ.classTypeId)?.name ?? occ.classTypeId} · ${occ.dayLabel} ${occ.time}`
  }

  // Bookings the member holds this week, split by whether a season lock is behind them.
  const { seasonLockedIds, weekOnlyHeldIds, heldIds } = useMemo(() => {
    const season = myBookedIds.filter((id) => {
      const occ = live.occurrences.find((o) => o.id === id)
      return occ?.slotId && lockedSlotIds.includes(occ.slotId)
    })
    const weekOnly = myBookedIds.filter((id) => !season.includes(id))
    return {
      seasonLockedIds: season,
      weekOnlyHeldIds: weekOnly,
      heldIds: myBookedIds,
    }
  }, [myBookedIds, live.occurrences, lockedSlotIds])

  const selectedIsBooked = selected ? heldIds.includes(selected.id) : false
  const selectedIsSeasonLocked =
    selectedIsBooked && selected?.slotId ? lockedSlotIds.includes(selected.slotId) : false
  const hasIncludedPlan = (member?.classesPerWeek ?? 0) > 0

  /*
   * Whether a slot is spent for this week is a property of this week, not of
   * whichever week the navigator is pointed at, so the current week is read
   * alongside the displayed one. Stepping forward to next week must not make a
   * slot look changeable when the server will still refuse.
   */
  const thisWeekStart = currentWeekStart()
  const thisWeek = useLiveSessions(thisWeekStart)
  const transferWindowHours = useLiveSettings().settings.transferWindowHours

  // The cutoff passes on its own with no write behind it, so nothing would
  // re-render the disabled state without a clock of some kind.
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [])

  /*
   * Mirrors slotCommitmentThisWeek in the Cloud Functions: once this week's
   * session for a slot is inside the transfer window, the member is assumed to
   * be attending it and the week's included session is spent. Cancelled
   * sessions never reach here — subscribeLiveSessions filters them out — which
   * matches the server skipping them too.
   *
   * The server is still the authority; this only keeps the member from being
   * offered an action that would be refused.
   */
  const committedSlotIds = useMemo(() => {
    const windowMs = transferWindowHours * 60 * 60 * 1000
    return new Set(
      thisWeek.occurrences
        .filter((o) => o.slotId && o.startsAt)
        .filter((o) => nowMs > new Date(o.startsAt as string).getTime() - windowMs)
        .map((o) => o.slotId as string),
    )
  }, [thisWeek.occurrences, transferWindowHours, nowMs])

  const slotIsCommitted = (slotId: string | undefined) =>
    !!slotId && committedSlotIds.has(slotId)

  const sessionIsCommitted = (occ: ClassOccurrence | undefined) => {
    if (!occ?.startsAt) return false
    const windowMs = transferWindowHours * 60 * 60 * 1000
    return nowMs > new Date(occ.startsAt).getTime() - windowMs
  }

  const selectedSlotCommitted = sessionIsCommitted(selected)
  const selectedCurrentWeekCommitted = slotIsCommitted(selected?.slotId)

  const COMMITTED_NOTE =
    'This class is inside the transfer window, so it counts as your included session for the week. You can change it from a later week.'

  // Sessions belong to a single week, so a selection left over from the
  // previous week would leave the detail panel offering actions on a class
  // that is no longer on the grid.
  useEffect(() => {
    setSelectedId(null)
    setReshuffleFrom(null)
    setDropIn(null)
  }, [week.weekStart])

  /*
   * A casual account cannot book until its email is confirmed, and the server
   * rejects the booking rather than the button being disabled, so without this
   * the member would only discover the problem by failing to book. Checked
   * against a reloaded user because `emailVerified` is cached from the last
   * token refresh and would otherwise stay stale after they click the link.
   */
  useEffect(() => {
    if (!member || !studioHasFirebaseUser()) {
      setVerified(true)
      return
    }
    let active = true
    studioEmailVerified().then((ok) => {
      if (active) setVerified(ok)
    })
    return () => {
      active = false
    }
  }, [member?.id, tick])

  const flash = (ok: string | null, err: string | null) => {
    setMessage(ok)
    setError(err)
    refresh()
  }

  const lockWeek = async (sessionId: string) => {
    const res = await runWithOverlay(() => studioLockSessionWeek(sessionId), {
      working: 'Locking in your session…',
      success: 'Session locked in!',
    })
    if (res.error) flash(null, res.error)
  }

  const lockSeason = async (slotId: string | undefined, seasonId?: string) => {
    if (!slotId) {
      flash(null, 'This session is not part of a recurring slot, so it cannot be locked every week.')
      return
    }
    const res = await runWithOverlay(() => studioLockWeeklySlot(slotId, seasonId), {
      working: 'Locking in your session…',
      success: 'Session locked in!',
    })
    if (res.error) {
      flash(null, res.error)
      return
    }
    if (res.skipped) {
      flash(
        `Locked every week this season — ${res.booked} session${res.booked === 1 ? '' : 's'} booked. This week's class is already inside the transfer window, so the lock starts next week.`,
        null,
      )
    } else if (res.full) {
      flash(
        `Locked every week this season — ${res.booked} session${res.booked === 1 ? '' : 's'} booked, ${res.full} already full.`,
        null,
      )
    }
  }

  const releaseWeek = async (sessionId: string) => {
    const res = await runWithOverlay(() => studioReleaseSessionWeek(sessionId), {
      working: 'Freeing up your session…',
      success: 'Session freed up!',
    })
    if (res.error) flash(null, res.error)
  }

  const unlockSeason = async (slotId: string | undefined) => {
    if (!slotId) {
      flash(null, 'This session is not part of a recurring slot.')
      return
    }
    const res = await runWithOverlay(() => studioUnlockWeeklySlot(slotId), {
      working: 'Updating your weekly lock…',
      success: 'Session freed up!',
    })
    if (res.committedThisWeek) {
      flash(null, COMMITTED_NOTE)
      return
    }
    if (res.error) {
      flash(null, res.error)
      return
    }
    if (res.kept) {
      flash(
        `Stopped locking every week — ${res.released} seat${res.released === 1 ? '' : 's'} released, ${res.kept} kept inside the transfer window.`,
        null,
      )
    }
  }

  /**
   * Booking a one-off always costs extra, so the first call deliberately comes
   * back asking for confirmation instead of booking. The member then either
   * pays for it or frees up allowance by releasing a slot they already hold.
   */
  const startDropIn = async (occ: ClassOccurrence) => {
    setBusy(true)
    const res = await studioBookSession(occ.id)
    setBusy(false)
    if (res.error) {
      flash(null, res.error)
      return
    }
    if (res.needsDropInConfirmation) {
      setDropIn({ prompt: res.needsDropInConfirmation, occ })
      return
    }
    flash('Drop-in booked.', null)
  }

  const confirmDropIn = async () => {
    if (!dropIn) return
    setBusy(true)
    const res = await studioBookSession(dropIn.occ.id, true)
    setBusy(false)
    setDropIn(null)
    flash(
      res.error ? null : `Drop-in booked — ${formatMoney(res.chargeCents)} added to your next invoice.`,
      res.error,
    )
  }

  /** Release a slot they already hold so this session is covered by the plan instead. */
  const swapToAllowance = async (slotIdToRelease: string) => {
    const target = dropIn?.occ.slotId
    if (!target) return
    setBusy(true)
    const released = await studioUnlockWeeklySlot(slotIdToRelease)
    const locked = released.error ? null : await studioLockWeeklySlot(target)
    setBusy(false)
    setDropIn(null)
    if (released.committedThisWeek) {
      flash(null, COMMITTED_NOTE)
      return
    }
    const err = released.error ?? locked?.error ?? null
    flash(err ? null : 'Swapped — this session now uses your included allowance.', err)
  }

  const moveWeekBooking = async (fromOccurrenceId: string, toOcc: ClassOccurrence) => {
    const released = await runWithOverlay(() => studioReleaseSessionWeek(fromOccurrenceId), {
      working: 'Freeing up your session…',
      success: 'Session freed up!',
    })
    if (released.error) {
      flash(null, released.error)
      setReshuffleFrom(null)
      return
    }
    const locked = await runWithOverlay(() => studioLockSessionWeek(toOcc.id), {
      working: 'Locking in your session…',
      success: 'Session locked in!',
    })
    setReshuffleFrom(null)
    flash(locked.error ? null : 'This week’s session changed.', locked.error)
  }

  const moveLock = async (fromOccurrenceId: string, toOcc: ClassOccurrence) => {
    const fromSlotId = live.occurrences.find((o) => o.id === fromOccurrenceId)?.slotId
    if (!fromSlotId || !toOcc.slotId) {
      flash(null, 'Both sessions must belong to a recurring slot to move a season lock.')
      return
    }
    const unlocked = await runWithOverlay(() => studioUnlockWeeklySlot(fromSlotId), {
      working: 'Updating your weekly lock…',
      success: 'Session freed up!',
    })
    if (unlocked.committedThisWeek) {
      flash(null, COMMITTED_NOTE)
      setReshuffleFrom(null)
      return
    }
    if (unlocked.error) {
      flash(null, unlocked.error)
      setReshuffleFrom(null)
      return
    }
    const locked = await runWithOverlay(
      () => studioLockWeeklySlot(toOcc.slotId!, toOcc.seasonId),
      {
        working: 'Locking in your session…',
        success: 'Session locked in!',
      },
    )
    setReshuffleFrom(null)
    flash(locked.error ? null : 'Season lock moved.', locked.error)
  }

  return (
    <div className="fitness-page theme-gbtt">
      <AppChrome
        theme="Member booking"
        title="Weekly timetable"
        subtitle={site.heroBlurb}
        imageId="studioflow"
      />

      <div className="app-sections">
      <section className="yacht-panel cal-panel app-enter app-section">
        <h2>Mon–Fri sessions</h2>
        <p className="hint">
          Lock a session for this week only, or every week of the season. Step through upcoming
          weeks to free a season-locked week and pick another.
        </p>
        <WeekNavigator
          label={week.label}
          isCurrentWeek={week.isCurrentWeek}
          isPast={week.isPast}
          onPrevious={week.previousWeek}
          onNext={week.nextWeek}
          onReset={week.resetWeek}
          disabled={actionBusy || live.status === 'loading'}
        />
        {live.status === 'loading' ? (
          <p className="hint">Loading sessions for {week.label}…</p>
        ) : null}
        {live.status === 'error' ? (
          <p className="form-error">Could not load the timetable: {live.error}</p>
        ) : null}
        {week.isPast ? (
          <p className="hint">
            {week.label} has already been and gone — shown for your records. Step forward to change
            an upcoming week.
          </p>
        ) : null}
        {live.status === 'ready' && live.occurrences.length === 0 ? (
          <p className="hint">No sessions on the timetable for {week.label} yet.</p>
        ) : (
          <WeekSessionCalendar
            byDay={byDay}
            classNames={classNames}
            selectedId={selectedId}
            heldIds={heldIds}
            seasonLockedIds={seasonLockedIds}
            weekOnlyHeldIds={weekOnlyHeldIds}
            onSelect={setSelectedId}
            mode="member"
          />
        )}

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
              {sessionExercises(
                selected,
                selectedType.exerciseIds,
                exerciseState.exercises,
              )
                .map((e) => e.name)
                .join(', ') || 'TBC'}
            </p>
            {member ? (
              <p>
                <strong>Classmates (opted-in):</strong>{' '}
                {visibleRosterNames(selected, member).join(', ') || 'None sharing names'}
              </p>
            ) : (
              <p className="hint">Log in below to book with a membership. Guests can still drop in.</p>
            )}

            {/* Guests book through a free casual account rather than a parallel
                guest path, so drop-ins get the same capacity check, roll call,
                calendar invite and billing record as anyone else. */}
            {!member ? (
              <p className="hint">
                Dropping in? Create a free <strong>Guest / casual</strong> account below — no weekly
                subscription, just pay per session.
              </p>
            ) : null}

            {member ? (
              <div className="btn-row">
                {selectedIsBooked ? (
                  <>
                    <button
                      type="button"
                      className="btn ghost"
                      disabled={actionBusy || selectedSlotCommitted}
                      onClick={() => void releaseWeek(selected.id)}
                    >
                      Free up this week
                    </button>
                    {selectedIsSeasonLocked ? (
                      <>
                        <button
                          type="button"
                          className="btn ghost"
                          disabled={actionBusy || selectedCurrentWeekCommitted}
                          onClick={() => {
                            setReshuffleFrom(selected.id)
                            flash(
                              'Pick another session on the calendar to change this week, or move the whole season lock.',
                              null,
                            )
                          }}
                        >
                          Change this week
                        </button>
                        <button
                          type="button"
                          className="btn ghost"
                          disabled={actionBusy || selectedCurrentWeekCommitted}
                          onClick={() => void unlockSeason(selected.slotId)}
                        >
                          Stop locking every week
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="btn ghost"
                        disabled={actionBusy || selectedSlotCommitted}
                        onClick={() => {
                          setReshuffleFrom(selected.id)
                          flash('Pick another session on the calendar for this week.', null)
                        }}
                      >
                        Change this week
                      </button>
                    )}
                  </>
                ) : reshuffleFrom ? (
                  <button
                    type="button"
                    className="btn primary"
                    disabled={
                      actionBusy ||
                      spotsLeft(selected) === 0 ||
                      sessionIsCommitted(
                        live.occurrences.find((o) => o.id === reshuffleFrom),
                      )
                    }
                    onClick={() => {
                      const from = live.occurrences.find((o) => o.id === reshuffleFrom)
                      const fromSeason =
                        from?.slotId && lockedSlotIds.includes(from.slotId)
                      if (fromSeason) void moveLock(reshuffleFrom, selected)
                      else void moveWeekBooking(reshuffleFrom, selected)
                    }}
                  >
                    Lock in here instead
                  </button>
                ) : hasIncludedPlan ? (
                  <>
                    <button
                      type="button"
                      className="btn primary"
                      disabled={actionBusy || spotsLeft(selected) === 0}
                      onClick={() => void lockWeek(selected.id)}
                    >
                      Lock in this session for this week
                    </button>
                    <button
                      type="button"
                      className="btn ghost"
                      disabled={actionBusy || spotsLeft(selected) === 0 || !selected.slotId}
                      onClick={() => void lockSeason(selected.slotId, selected.seasonId)}
                    >
                      Lock in this session every week of this season
                    </button>
                    <button
                      type="button"
                      className="btn ghost"
                      disabled={actionBusy || spotsLeft(selected) === 0}
                      onClick={() => startDropIn(selected)}
                    >
                      Book one-off drop-in
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="btn primary"
                    disabled={actionBusy || spotsLeft(selected) === 0}
                    onClick={() => startDropIn(selected)}
                  >
                    Book one-off drop-in
                  </button>
                )}
                {reshuffleFrom ? (
                  <button type="button" className="btn ghost" onClick={() => setReshuffleFrom(null)}>
                    Cancel change
                  </button>
                ) : null}
              </div>
            ) : null}

            {member && selectedIsBooked && selectedSlotCommitted ? (
              <p className="hint">{COMMITTED_NOTE}</p>
            ) : null}

            {dropIn && dropIn.occ.id === selected.id ? (
              <div className="drop-in-prompt" role="alertdialog" aria-label="Confirm drop-in">
                <h3>This is an extra session</h3>
                {dropIn.prompt.allowance > 0 ? (
                  <p>
                    Your plan includes {dropIn.prompt.allowance} session
                    {dropIn.prompt.allowance === 1 ? '' : 's'} a week and you already hold{' '}
                    {dropIn.prompt.locked}. Booking this one is <strong>in addition</strong> to
                    those, charged at {formatMoney(dropIn.prompt.chargeCents)}.
                  </p>
                ) : (
                  <p>
                    Your plan has no included weekly sessions, so this is a drop-in charged at{' '}
                    {formatMoney(dropIn.prompt.chargeCents)}.
                  </p>
                )}

                <div className="btn-row">
                  <button
                    type="button"
                    className="btn primary"
                    disabled={busy}
                    onClick={confirmDropIn}
                  >
                    Book as extra · {formatMoney(dropIn.prompt.chargeCents)}
                  </button>
                  <button type="button" className="btn ghost" onClick={() => setDropIn(null)}>
                    Cancel
                  </button>
                </div>

                {/* Rather than telling them to go and deselect something, let them
                    release a slot right here and have this session take its place. */}
                {dropIn.prompt.locked > 0 && dropIn.occ.slotId ? (
                  <div className="drop-in-swap">
                    <p className="hint">
                      Or keep it within your plan by releasing a slot you already hold — this
                      session takes its place:
                    </p>
                    <ul className="drop-in-slot-list">
                      {dropIn.prompt.lockedSlotIds.map((id) => (
                        <li key={id}>
                          <span>{slotLabel(id)}</span>
                          <button
                            type="button"
                            className="btn ghost"
                            disabled={busy || slotIsCommitted(id)}
                            onClick={() => swapToAllowance(id)}
                          >
                            Release &amp; use here
                          </button>
                          {slotIsCommitted(id) ? (
                            <span className="hint">Already used this week</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      {message ? (
        <p className="form-success status-banner app-section app-section--banner">{message}</p>
      ) : null}
      {error ? (
        <p className="form-error status-banner app-section app-section--banner">{error}</p>
      ) : null}

      <section className="yacht-panel app-enter app-section" id="login-book">
        <h2>{member ? 'Your membership' : 'Log in to book'}</h2>
        {!member ? (
          <>
            {!showRegister ? (
              /*
               * Same form as the admin console and /signin — staff who sign in
               * here are routed to the console rather than being told this is
               * the wrong page.
               */
              <StudioSignIn
                onSignedIn={(role) => {
                  if (role === 'member') {
                    flash('Signed in — select a session on the calendar.', null)
                  }
                }}
                extraActions={
                  <button type="button" className="btn ghost" onClick={() => setShowRegister(true)}>
                    Create an account
                  </button>
                }
                hint="Sign in with the password you set from your invitation email. Use “Forgot password” if you have not set one yet."
              />
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
                <label className="field">
                  Password
                  <input
                    type="password"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                </label>
                {/* The casual tier is offered here too: a drop-in needs an
                    account of their own, and theirs is the one that activates
                    off a verified email instead of waiting for approval. */}
                <div className="pkg-grid">
                  {pricing.plans.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={`pkg-card${regPlan === p.id ? ' selected' : ''}`}
                      onClick={() => setRegPlan(p.id)}
                    >
                      <strong>{p.name}</strong>
                      <span className="pkg-price">{formatPlanRate(p)}</span>
                      <p>{p.blurb}</p>
                    </button>
                  ))}
                </div>
                {pricing.status === 'ready' && pricing.plans.length === 0 ? (
                  <p className="hint">Plans are not published yet — please get in touch.</p>
                ) : null}
                <p className="hint">
                  {planById(regPlan)?.classesPerWeek
                    ? 'Subscriptions are activated by Tom once your first payment is arranged.'
                    : 'Casual accounts are ready as soon as you confirm your email — no wait for approval.'}
                </p>
                <div className="btn-row">
                  <button type="button" className="btn ghost" onClick={() => setShowRegister(false)}>
                    Back to login
                  </button>
                  <button
                    type="button"
                    className="btn primary"
                    disabled={busy || !regPlan}
                    onClick={async () => {
                      setBusy(true)
                      const err = await studioRegisterMember(
                        regName,
                        regEmail,
                        regPassword,
                        regPlan,
                      )
                      setBusy(false)
                      flash(
                        err
                          ? null
                          : 'Account created — check your inbox and confirm your email address.',
                        err,
                      )
                    }}
                  >
                    Create account
                  </button>
                </div>
              </>
            )}
          </>
        ) : (
          <>
            {!verified ? (
              <div className="verify-banner">
                <h3>Confirm your email address</h3>
                <p>
                  We sent a link to <strong>{member.email}</strong>. Confirming it is what lets you
                  book without waiting for Tom to approve the account.
                </p>
                {verifyNote ? <p className="form-success">{verifyNote}</p> : null}
                <div className="btn-row">
                  <button
                    type="button"
                    className="btn primary"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true)
                      const err = await studioResendVerification()
                      setBusy(false)
                      setVerifyNote(err ? null : 'Sent — check your inbox and spam folder.')
                      if (err) flash(null, err)
                    }}
                  >
                    Resend the link
                  </button>
                  <button
                    type="button"
                    className="btn ghost"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true)
                      const ok = await studioEmailVerified()
                      setBusy(false)
                      setVerified(ok)
                      if (!ok) setVerifyNote('Still not confirmed — open the link, then check again.')
                    }}
                  >
                    I have confirmed it
                  </button>
                </div>
              </div>
            ) : null}
            {/* Included seats for the week on the calendar, so locking a session
                for this week moves 0/3 to 1/3. Season-long recurring locks are
                listed separately under "Your season locks". */}
            <p>
              Signed in as <strong>{member.name}</strong> ·{' '}
              {planById(member.planId)?.name}
              {member.classesPerWeek > 0
                ? ` · ${myIncludedIds.length}/${member.classesPerWeek} weekly slots locked`
                : ` · ${myProfile?.creditsRemaining ?? 0} credits`}
            </p>
            {myProfile?.pendingPlanName ? (
              <p className="form-success">
                Plan change to <strong>{myProfile.pendingPlanName}</strong> sent to Tom — awaiting
                payment confirmation.
              </p>
            ) : null}
            <p className="hint">{site.paymentInstructions}</p>
            <label className="exercise-check">
              <input
                type="checkbox"
                checked={myProfile?.showNameToClassmates ?? true}
                disabled={busy || !myProfile}
                onChange={async (e) => {
                  setBusy(true)
                  const err = await studioSetShowName(e.target.checked)
                  setBusy(false)
                  if (err) flash(null, err)
                }}
              />
              Show my name to other subscribers in the same class
            </label>

            <label className="field">
              My health notes
              <textarea
                rows={3}
                key={myProfile ? 'health-notes' : 'health-notes-loading'}
                defaultValue={myProfile?.limitations ?? ''}
                disabled={busy || !myProfile}
                placeholder="Injuries, limitations, or anything staff should know before class"
                onBlur={async (e) => {
                  if (!myProfile || e.target.value === myProfile.limitations) return
                  setBusy(true)
                  const err = await studioSaveMyLimitations(e.target.value)
                  setBusy(false)
                  flash(err ? null : 'Health notes saved.', err)
                }}
              />
            </label>
            <p className="hint">
              Shared with studio staff for class safety. Staff keep a separate private note you cannot
              see.
            </p>

            {myProfile && !myProfile.termsAccepted ? (
              <div className="legal-box">
                <h3>Terms &amp; waiver</h3>
                <p>{site.termsText}</p>
                <p>{site.waiverText}</p>
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true)
                    const err = await studioAcceptTerms()
                    setBusy(false)
                    flash(err ? null : 'Terms accepted.', err)
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
              {pricing.plans
                .filter((p) => p.classesPerWeek > 0)
                .map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`pkg-card${member.planId === p.id ? ' selected' : ''}${myProfile?.pendingPlanId === p.id ? ' is-pending' : ''}`}
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true)
                      const err = await studioRequestPlanChange(p.id)
                      setBusy(false)
                      flash(
                        err
                          ? null
                          : `Request sent to Tom for ${p.name}. Your current plan stays active until he confirms payment.`,
                        err,
                      )
                    }}
                  >
                    <strong>{p.name}</strong>
                    <span className="pkg-price">{formatPlanRate(p)}</span>
                    <p>{p.blurb}</p>
                  </button>
                ))}
            </div>

            <h3>Your season locks</h3>
            {/* The locks themselves are the `weeklyLocks` documents, so they are
                listed from those rather than from any one week's sessions — a
                lock exists even in a week whose sessions are not generated yet. */}
            <ul className="held-list">
              {lockedSlotIds.length === 0 ? (
                <li>None yet — lock a session every week of the season from the calendar above.</li>
              ) : null}
              {lockedSlotIds.map((id) => (
                <li key={id}>{slotLabel(id)}</li>
              ))}
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
      </section>

      {member ? <SeasonCost lockRevision={lockedSlotIds.join(',')} /> : null}
      </div>
      <WorkingOverlay {...overlayProps} />
    </div>
  )
}
