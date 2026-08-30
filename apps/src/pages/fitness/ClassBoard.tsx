import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ClassTypeDescription } from '@gbtt/shared/studio/ClassTypeDescription'
import {
  studioAddMemberToSession,
  studioMarkAttendance,
  studioRemoveSession,
  studioStaffLogin,
  studioStaffLoginWithGoogle,
} from '@gbtt/shared/studio/studioAuth'
import { createLiveSession } from '@gbtt/shared/studio/firebase/liveSessions'
import { savePricingPlan } from '@gbtt/shared/studio/firebase/livePricing'
import { useLivePricing } from '../../hooks/useLivePricing'
import { AppOutsideShell } from '../../components/AppChrome'
import { WeekSessionCalendar } from '../../components/WeekSessionCalendar'
import { useLiveSessions, useSessionRoster, useWeekNavigation } from '../../hooks/useLiveSessions'
import { WeekNavigator } from '../../components/WeekNavigator'
import { SeasonsPanel } from '../../components/SeasonsPanel'
import { MembersPayments } from '../../components/MembersPayments'
import { ClientAccounts } from '../../components/ClientAccounts'
import {
  WEEKDAYS,
  addExercise,
  addReminder,
  adminAddMemberToSession,
  archiveClassType,
  classTypeById,
  createClassType,
  deleteExercise,
  deleteOccurrence,
  formatSessionAttending,
  getClassTypes,
  getEquipmentChecked,
  getExercises,
  getOutbox,
  getPricingPlans,
  getReminders,
  getSessionRole,
  getSessionUser,
  getSiteContent,
  getTeam,
  getTransferWindowHours,
  getUsers,
  logout,
  occurrenceById,
  occurrencesByWeekday,
  renameExercise,
  resetStudioData,
  sendSubscriberEmail,
  sessionIsFull,
  setClassCap,
  setEquipmentChecked,
  setMemberRisk,
  setOccurrenceInstructor,
  setRosterStatus,
  setSessionExerciseDisplay,
  setTransferWindowHours,
  spotsLeft,
  syncLabels,
  toggleExercise,
  toggleReminder,
  updateClassType,
  updateOccurrenceFields,
  updatePricingPlan,
  updateSiteContent,
  updateTeamMember,
  upsertOccurrence,
  type ClassOccurrence,
  type ExerciseDisplay,
  type PlanId,
  type Weekday,
} from '../../shared/fitnessStudio'

type Tab =
  | 'schedule'
  | 'sessions'
  | 'seasons'
  | 'members'
  | 'clients'
  | 'risk'
  | 'legal'
  | 'notify'
  | 'reminders'
  | 'team'
  | 'site'

const EQUIPMENT_ITEMS = [
  { id: 'mats', label: 'Mats wiped down' },
  { id: 'weights', label: 'Weights re-racked' },
  { id: 'audio', label: 'Audio / mic tested' },
  { id: 'firstaid', label: 'First-aid kit checked' },
] as const

const ALL_TABS: { id: Tab; label: string; adminOnly?: boolean }[] = [
  { id: 'schedule', label: 'Schedule' },
  { id: 'sessions', label: 'Add & remove sessions', adminOnly: true },
  { id: 'seasons', label: 'Seasons & holidays', adminOnly: true },
  { id: 'members', label: 'Members & payments' },
  { id: 'clients', label: 'Add client accounts', adminOnly: true },
  { id: 'risk', label: 'Risk & notes' },
  { id: 'legal', label: 'Legal & payments copy', adminOnly: true },
  { id: 'notify', label: 'Notify', adminOnly: true },
  { id: 'reminders', label: 'Reminders' },
  { id: 'team', label: 'Team' },
  { id: 'site', label: 'Site content', adminOnly: true },
]

/**
 * Admin console —  login; a trainer gets restricted tabs.
 */
export default function ClassBoard() {
  const [tick, setTick] = useState(0)
  const refresh = () => setTick((n) => n + 1)

  const role = getSessionRole()
  const session = getSessionUser()
  const staff = role === 'admin' || role === 'trainer'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState<string | null>(null)
  const [signingIn, setSigningIn] = useState(false)
  const [tab, setTab] = useState<Tab>('schedule')
  const [selectedTypeId, setSelectedTypeId] = useState(getClassTypes()[0]?.id ?? 'sweat')
  const [selectedOccId, setSelectedOccId] = useState<string | null>(null)
  const [newExercise, setNewExercise] = useState('')
  const [mailSubject, setMailSubject] = useState('GBTT timetable update')
  const [mailBody, setMailBody] = useState('Hi team — here’s this week’s schedule.')
  const [remTitle, setRemTitle] = useState('')
  const [newOccDay, setNewOccDay] = useState<Weekday>('Mon')
  const [newOccTime, setNewOccTime] = useState('07:00')
  const [addMemberId, setAddMemberId] = useState('')
  const [newClassId, setNewClassId] = useState('')
  const [newClassName, setNewClassName] = useState('')
  const [renameExerciseId, setRenameExerciseId] = useState<string | null>(null)
  const [renameExerciseName, setRenameExerciseName] = useState('')

  const classes = getClassTypes()

  // Firestore is the source of truth for the timetable, its counts and the
  // roster. The seeded local store is only a development fallback; in
  // production an empty week renders as empty rather than as seed numbers.
  const week = useWeekNavigation()
  const live = useLiveSessions(week.weekStart)
  const liveRoster = useSessionRoster(live.status === 'ready' ? selectedOccId : null)
  const usingLive = live.status !== 'unavailable'
  const localByDay = useMemo(() => occurrencesByWeekday(), [tick, selectedOccId, tab])
  const byDay = usingLive ? live.byDay : localByDay
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionNote, setActionNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // A session belongs to one week, so a selection made before stepping weeks
  // would leave the detail panel and roll call showing a class that is no
  // longer on the grid.
  useEffect(() => {
    setSelectedOccId(null)
  }, [week.weekStart])

  const sessionList = useMemo(() => WEEKDAYS.flatMap((d) => byDay[d] ?? []), [byDay])

  const pricing = useLivePricing()
  const usingLivePricing = pricing.status !== 'unavailable'
  const [pricingError, setPricingError] = useState<string | null>(null)

  const savePlanRate = async (planId: string, ratePerClass: number) => {
    setPricingError(null)
    if (!usingLivePricing) {
      // The seed store types plan ids as a closed union; live plan ids are
      // whatever Firestore holds, so this narrows only on the fallback path.
      updatePricingPlan(planId as PlanId, { ratePerClass })
      refresh()
      return
    }
    setPricingError(await savePricingPlan(planId, { ratePerClass }))
  }

  const addSession = async () => {
    setActionError(null)
    setActionNote(null)
    const type = classTypeById(selectedTypeId)
    if (!type) {
      setActionError('Pick a class type first.')
      return
    }
    // Sessions are created into whichever week the navigator is showing, so
    // the week is named back to avoid silently adding to the wrong one.
    const label = usingLive
      ? `${type.name} on ${newOccDay} at ${newOccTime} (${week.label})`
      : `${type.name} on ${newOccDay} at ${newOccTime}`

    if (!usingLive) {
      setSelectedOccId(
        upsertOccurrence({
          classTypeId: selectedTypeId,
          dayLabel: newOccDay,
          time: newOccTime,
        }),
      )
      refresh()
      setActionNote(`Added ${label}.`)
      return
    }

    setBusy(true)
    const { id, error } = await createLiveSession({
      classTypeId: type.id,
      className: type.name,
      cap: type.cap,
      dayLabel: newOccDay,
      time: newOccTime,
      weekStart: live.weekStart,
    })
    setBusy(false)
    if (error) setActionError(error)
    else {
      setSelectedOccId(id)
      setActionNote(`Added ${label}.`)
    }
  }

  const removeSession = async (occ: ClassOccurrence) => {
    setActionError(null)
    setActionNote(null)
    const label = `${classTypeById(occ.classTypeId)?.name ?? occ.classTypeId} · ${occ.dayLabel} ${occ.time}`

    // Spell out which of the two outcomes this is before doing it, so an
    // archive is never mistaken for a delete or the other way round.
    const confirmed = confirm(
      occ.bookedCount > 0
        ? `${label} has ${occ.bookedCount} booked.\n\nIt will be archived: hidden from the timetable, but the roster is kept so attendance and billing records survive. Continue?`
        : `Delete ${label}?\n\nNobody has booked it, so it will be removed completely.`,
    )
    if (!confirmed) return

    if (!usingLive) {
      deleteOccurrence(occ.id)
      if (selectedOccId === occ.id) setSelectedOccId(null)
      refresh()
      setActionNote(`Removed ${label}.`)
      return
    }

    setBusy(true)
    const result = await studioRemoveSession(occ.id)
    setBusy(false)
    if (result.error) {
      setActionError(result.error)
      return
    }
    if (selectedOccId === occ.id) setSelectedOccId(null)
    setActionNote(
      result.mode === 'archived'
        ? `Archived ${label} — ${result.booked} booking${result.booked === 1 ? '' : 's'} kept` +
          (result.attended ? `, including ${result.attended} marked attended.` : '.')
        : `Deleted ${label}.`,
    )
  }
  const exercises = getExercises()
  const users = getUsers().filter((u) => u.role === 'member')
  const site = getSiteContent()
  const team = getTeam()
  const reminders = getReminders()
  const outbox = getOutbox()
  const equipment = getEquipmentChecked()
  const sync = useMemo(() => syncLabels(), [tab, selectedTypeId, tick])
  const selected = classTypeById(selectedTypeId)
  const baseSelectedOcc = selectedOccId
    ? usingLive
      ? live.occurrences.find((o) => o.id === selectedOccId)
      : occurrenceById(selectedOccId)
    : undefined
  // The calendar reads counts from the session document, but the roll call
  // needs the roster docs themselves, which are fetched only for the open session.
  const selectedOcc = baseSelectedOcc
    ? usingLive
      ? { ...baseSelectedOcc, roster: liveRoster.roster }
      : baseSelectedOcc
    : undefined
  const selectedOccType = selectedOcc ? classTypeById(selectedOcc.classTypeId) : undefined

  const tabs = ALL_TABS.filter((t) => !t.adminOnly || role === 'admin')

  if (!staff) {
    return (
      <div className="classboard-page theme-gbtt">
        <AppOutsideShell imageId="classboard" showBackLink={false} />
        <div className="app-sections">
        <header className="classboard-top app-section">
          <div>
            <p className="app-badge">Staff admin</p>
            <h1>Staff login</h1>
            <p className="app-sub">
              Trainers can run schedule and role-call without legal, notify, or site content tabs.
            </p>
          </div>
        </header>
        <section className="yacht-panel app-enter admin-login app-section">
          <label className="field">
            Email
            <input value={email} onChange={(e) => setEmail(e.target.value)} />
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
          {loginError ? <p className="form-error">{loginError}</p> : null}
          <div className="btn-row">
            <button
              type="button"
              className="btn primary"
              disabled={signingIn}
              onClick={() => {
                setSigningIn(true)
                setLoginError(null)
                studioStaffLogin(email, password)
                  .then(({ error }) => {
                    if (error) setLoginError(error)
                    else refresh()
                  })
                  .catch(() => setLoginError('Sign-in failed. Try again.'))
                  .finally(() => setSigningIn(false))
              }}
            >
              {signingIn ? 'Signing in…' : 'Sign in'}
            </button>
            <button
              type="button"
              className="btn google"
              disabled={signingIn}
              onClick={() => {
                setSigningIn(true)
                setLoginError(null)
                studioStaffLoginWithGoogle()
                  .then(({ error }) => {
                    if (error) setLoginError(error)
                    else refresh()
                  })
                  .catch(() => setLoginError('Google sign-in failed. Try again.'))
                  .finally(() => setSigningIn(false))
              }}
            >
              <span className="google-mark" aria-hidden="true">
                G
              </span>
              Continue with Google
            </button>
            <Link className="btn ghost" to="/fitness/studioflow">
              Member app →
            </Link>
          </div>
        </section>
        </div>
      </div>
    )
  }

  return (
    <div className="classboard-page theme-gbtt">
      <AppOutsideShell imageId="classboard" showBackLink={false} />
      <div className="app-sections">
      <header className="classboard-top app-section">
        <div>
          <p className="app-badge">Admin · {session?.name} ({role})</p>
          <h1>Backend management</h1>
          <p className="app-sub">
            Schedule, role-call, payments, risk notes, legal copy, subscriber email, reminders,
            trainers, and public site text.
          </p>
        </div>
        <div className="btn-row">
          <Link className="btn ghost" to="/fitness/studioflow">
            Member app
          </Link>
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              logout()
              refresh()
            }}
          >
            Log out
          </button>
          {role === 'admin' ? (
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                if (confirm('Reset all  data to seed?')) {
                  resetStudioData()
                  refresh()
                }
              }}
            >
              Reset demo data
            </button>
          ) : null}
        </div>
      </header>

      <div className="admin-tabs app-section" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`chip${tab === t.id ? ' selected' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'schedule' && (
        <div className="classboard-deck app-enter schedule-cal-layout app-section">
          <div className="schedule-cal-main">
            <h2>Week calendar</h2>
            <p className="hint">
              Same Mon–Fri grid as member booking. Select a session badge to edit time, day, class, or
              instructor{role === 'admin' ? ' — or add a new session below' : ''}.
            </p>
            {usingLive ? (
              <WeekNavigator
                label={week.label}
                isCurrentWeek={week.isCurrentWeek}
                isPast={week.isPast}
                onPrevious={week.previousWeek}
                onNext={week.nextWeek}
                onReset={week.resetWeek}
                disabled={live.status === 'loading'}
              />
            ) : null}
            {usingLive && live.status === 'loading' ? (
              <p className="hint">Loading sessions for {week.label}…</p>
            ) : null}
            {live.status === 'error' ? (
              <p className="form-error">
                Could not load the timetable: {live.error}
              </p>
            ) : null}
            {live.status === 'ready' && live.occurrences.length === 0 ? (
              <p className="hint">
                No sessions scheduled for {week.label}. Add one from the “Add &amp; remove sessions”
                tab and it will appear here for members straight away.
              </p>
            ) : (
              <WeekSessionCalendar
                byDay={byDay}
                selectedId={selectedOccId}
                onSelect={(id) => {
                  setSelectedOccId(id)
                  const o = usingLive
                    ? live.occurrences.find((x) => x.id === id)
                    : occurrenceById(id)
                  if (o) setSelectedTypeId(o.classTypeId)
                }}
                mode="admin"
              />
            )}
            {selectedOcc && selectedOccType ? (
              <div className="occ-detail cal-detail">
                <ClassTypeDescription
                  classType={selectedOccType}
                  baseUrl={import.meta.env.BASE_URL}
                  title={`Edit · ${selectedOccType.name} · ${selectedOcc.dayLabel} ${selectedOcc.time}`}
                />
                <p>
                  {formatSessionAttending(selectedOcc)}
                  {sessionIsFull(selectedOcc) ? ' · Full' : ` · ${spotsLeft(selectedOcc)} spots left`}
                </p>
                <p className="roster-line">
                  Roster:{' '}
                  {selectedOcc.roster.length
                    ? selectedOcc.roster
                        .map((r) => `${r.displayName}${r.kind === 'guest' ? ' *' : ''}`)
                        .join(', ')
                    : 'None yet'}
                </p>
                <div className="role-call-panel">
                  <h3>Role-call</h3>
                  {actionError ? <p className="form-error">{actionError}</p> : null}
                  {usingLive && liveRoster.status === 'loading' ? (
                    <p className="hint">Loading roster…</p>
                  ) : null}
                  {usingLive && liveRoster.status === 'ready' && !liveRoster.roster.length ? (
                    <p className="hint">Nobody booked into this session yet.</p>
                  ) : null}
                  <ul className="role-call-list">
                    {selectedOcc.roster.map((r) => (
                      <li key={`${r.memberId ?? r.displayName}`}>
                        <label className="exercise-check">
                          <input
                            type="checkbox"
                            checked={r.status === 'attended'}
                            onChange={(e) => {
                              if (!r.memberId) return
                              const next = e.target.checked ? 'attended' : 'booked'
                              setActionError(null)
                              if (usingLive) {
                                studioMarkAttendance(selectedOcc.id, r.memberId, next).then(
                                  (err) => setActionError(err),
                                )
                                return
                              }
                              setRosterStatus(selectedOcc.id, r.memberId, next)
                              refresh()
                            }}
                          />
                          {r.displayName}
                          {r.bookedBy === 'admin' ? ' (admin added)' : ''}
                        </label>
                      </li>
                    ))}
                  </ul>
                  <div className="add-exercise-row">
                    <select
                      value={addMemberId}
                      onChange={(e) => setAddMemberId(e.target.value)}
                      aria-label="Add member to session"
                    >
                      <option value="">Add client to session…</option>
                      {users
                        .filter((u) => !selectedOcc.roster.some((r) => r.memberId === u.id))
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      className="btn ghost"
                      disabled={!addMemberId}
                      onClick={() => {
                        setActionError(null)
                        if (usingLive) {
                          studioAddMemberToSession(selectedOcc.id, addMemberId).then((err) => {
                            setActionError(err)
                            if (!err) setAddMemberId('')
                          })
                          return
                        }
                        const err = adminAddMemberToSession(selectedOcc.id, addMemberId)
                        if (!err) {
                          setAddMemberId('')
                          refresh()
                        }
                      }}
                    >
                      Add
                    </button>
                  </div>
                </div>
                <label className="field">
                  Exercise preview for members
                  <select
                    value={selectedOcc.exerciseDisplay ?? 'defaults'}
                    onChange={(e) => {
                      setSessionExerciseDisplay(
                        selectedOcc.id,
                        e.target.value as ExerciseDisplay,
                      )
                      refresh()
                    }}
                  >
                    <option value="hidden">Hide planned exercises</option>
                    <option value="defaults">Show class defaults</option>
                    <option value="custom">Custom list (class defaults)</option>
                  </select>
                </label>
                <div className="admin-edit-grid">
                  <label className="field">
                    Day
                    <select
                      value={selectedOcc.dayLabel}
                      disabled={role !== 'admin'}
                      onChange={(e) => {
                        updateOccurrenceFields(selectedOcc.id, { dayLabel: e.target.value })
                        refresh()
                      }}
                    >
                      {WEEKDAYS.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    Time
                    <input
                      type="time"
                      value={selectedOcc.time}
                      disabled={role !== 'admin'}
                      onChange={(e) => {
                        updateOccurrenceFields(selectedOcc.id, { time: e.target.value })
                        refresh()
                      }}
                    />
                  </label>
                  <label className="field">
                    Class
                    <select
                      value={selectedOcc.classTypeId}
                      disabled={role !== 'admin'}
                      onChange={(e) => {
                        updateOccurrenceFields(selectedOcc.id, { classTypeId: e.target.value })
                        setSelectedTypeId(e.target.value)
                        refresh()
                      }}
                    >
                      {classes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    Instructor / cover
                    <select
                      value={selectedOcc.instructorId}
                      onChange={(e) => {
                        setOccurrenceInstructor(selectedOcc.id, e.target.value)
                        refresh()
                      }}
                    >
                      {team.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {role === 'admin' ? (
                  <p className="hint">
                    Sessions are added and removed from the{' '}
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => setTab('sessions')}
                    >
                      Add &amp; remove sessions
                    </button>{' '}
                    tab.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          {selected && (
            <aside className="classboard-side">
              <section>
                <h2>Class type defaults</h2>
                <div className="class-type-tabs">
                  {classes.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={`chip${selectedTypeId === c.id ? ' selected' : ''}`}
                      onClick={() => setSelectedTypeId(c.id)}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
                {selected ? (
                  <ClassTypeDescription
                    classType={selected}
                    baseUrl={import.meta.env.BASE_URL}
                    title={selected.name}
                    showLongDescription={role !== 'admin'}
                  />
                ) : null}
                {role === 'admin' ? (
                  <>
                    <label className="field">
                      Name
                      <input
                        value={selected.name}
                        onChange={(e) => {
                          updateClassType(selected.id, { name: e.target.value })
                          refresh()
                        }}
                      />
                    </label>
                    <label className="field">
                      Short blurb
                      <input
                        value={selected.blurb}
                        onChange={(e) => {
                          updateClassType(selected.id, { blurb: e.target.value })
                          refresh()
                        }}
                      />
                    </label>
                    <label className="field">
                      Public description
                      <textarea
                        rows={4}
                        value={selected.longDescription}
                        onChange={(e) => {
                          updateClassType(selected.id, { longDescription: e.target.value })
                          refresh()
                        }}
                      />
                    </label>
                    <label className="field">
                      Warnings
                      <textarea
                        rows={2}
                        value={selected.warnings}
                        disabled={role !== 'admin'}
                        onChange={(e) => {
                          updateClassType(selected.id, { warnings: e.target.value })
                          refresh()
                        }}
                      />
                    </label>
                    <label className="field">
                      Restrictions
                      <textarea
                        rows={2}
                        value={selected.restrictions}
                        disabled={role !== 'admin'}
                        onChange={(e) => {
                          updateClassType(selected.id, { restrictions: e.target.value })
                          refresh()
                        }}
                      />
                    </label>
                    <label className="field">
                      Recommendations
                      <textarea
                        rows={2}
                        value={selected.recommendations}
                        disabled={role !== 'admin'}
                        onChange={(e) => {
                          updateClassType(selected.id, { recommendations: e.target.value })
                          refresh()
                        }}
                      />
                    </label>
                    <label className="field">
                      What to bring
                      <textarea
                        rows={2}
                        value={selected.whatToBring}
                        disabled={role !== 'admin'}
                        onChange={(e) => {
                          updateClassType(selected.id, { whatToBring: e.target.value })
                          refresh()
                        }}
                      />
                    </label>
                  </>
                ) : null}
                <label className="field">
                  Max capacity
                  <input
                    type="number"
                    min={4}
                    max={27}
                    value={selected.cap}
                    disabled={role !== 'admin'}
                    onChange={(e) => {
                      setClassCap(selected.id, Number(e.target.value))
                      refresh()
                    }}
                  />
                </label>
              </section>
              <section>
                <h2>Default exercises</h2>
                <div className="exercise-checks">
                  {exercises.map((ex) => {
                    const on = selected.exerciseIds.includes(ex.id)
                    return (
                      <div key={ex.id} className="exercise-row">
                        <label className={`exercise-check${on ? ' on' : ''}`}>
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => {
                              toggleExercise(selected.id, ex.id)
                              refresh()
                            }}
                          />
                          {renameExerciseId === ex.id ? (
                            <input
                              value={renameExerciseName}
                              onChange={(e) => setRenameExerciseName(e.target.value)}
                            />
                          ) : (
                            ex.name
                          )}
                        </label>
                        {role === 'admin' ? (
                          <span className="btn-row">
                            {renameExerciseId === ex.id ? (
                              <button
                                type="button"
                                className="btn ghost"
                                onClick={() => {
                                  renameExercise(ex.id, renameExerciseName)
                                  setRenameExerciseId(null)
                                  refresh()
                                }}
                              >
                                Save
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="btn ghost"
                                onClick={() => {
                                  setRenameExerciseId(ex.id)
                                  setRenameExerciseName(ex.name)
                                }}
                              >
                                Rename
                              </button>
                            )}
                            <button
                              type="button"
                              className="btn ghost"
                              onClick={() => {
                                deleteExercise(ex.id)
                                refresh()
                              }}
                            >
                              Delete
                            </button>
                          </span>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
                {role === 'admin' ? (
                  <div className="add-exercise-row">
                    <input
                      value={newExercise}
                      onChange={(e) => setNewExercise(e.target.value)}
                      placeholder="New exercise"
                    />
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => {
                        const added = addExercise(newExercise)
                        if (added) {
                          toggleExercise(selected.id, added.id)
                          setNewExercise('')
                          refresh()
                        }
                      }}
                    >
                      + Add
                    </button>
                  </div>
                ) : null}
              </section>
              {role === 'admin' ? (
                <section>
                  <h2>Add class type</h2>
                  <div className="add-exercise-row">
                    <input
                      placeholder="id (e.g. pilates)"
                      value={newClassId}
                      onChange={(e) => setNewClassId(e.target.value)}
                    />
                    <input
                      placeholder="Display name"
                      value={newClassName}
                      onChange={(e) => setNewClassName(e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => {
                        createClassType({ id: newClassId, name: newClassName })
                        setNewClassId('')
                        setNewClassName('')
                        refresh()
                      }}
                    >
                      Add class
                    </button>
                  </div>
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => {
                      archiveClassType(selected.id)
                      refresh()
                    }}
                  >
                    Archive this class
                  </button>
                </section>
              ) : null}
              <section className="checklist-panel">
                <h2>Equipment checklist</h2>
                {EQUIPMENT_ITEMS.map((item) => (
                  <label
                    key={item.id}
                    className={`exercise-check${equipment.includes(item.id) ? ' on' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={equipment.includes(item.id)}
                      onChange={() => {
                        const next = equipment.includes(item.id)
                          ? equipment.filter((x) => x !== item.id)
                          : [...equipment, item.id]
                        setEquipmentChecked(next)
                        refresh()
                      }}
                    />
                    {item.label}
                  </label>
                ))}
              </section>
              <p className="sync-chip">{sync.calendar}</p>
              <p className="sync-chip">{sync.firebase}</p>
            </aside>
          )}
        </div>
      )}

      {tab === 'seasons' && role === 'admin' && <SeasonsPanel />}

      {tab === 'sessions' && role === 'admin' && (
        <section className="yacht-panel app-enter app-section">
          <h2>Add &amp; remove sessions</h2>
          {actionError ? <p className="form-error">{actionError}</p> : null}
          {actionNote ? <p className="form-success">{actionNote}</p> : null}

          {/* Shares the schedule tab's week, so stepping forward here builds
              out future weeks rather than only editing the current one. */}
          {usingLive ? (
            <WeekNavigator
              label={week.label}
              isCurrentWeek={week.isCurrentWeek}
              isPast={week.isPast}
              onPrevious={week.previousWeek}
              onNext={week.nextWeek}
              onReset={week.resetWeek}
              disabled={busy || live.status === 'loading'}
            />
          ) : null}

          <div className="add-occ-row">
            <h3>Add a session</h3>
            <p className="hint">
              {usingLive
                ? `Added to ${week.label}. Members can book it as soon as it appears.`
                : 'Members can book it as soon as it appears.'}
            </p>
            <label className="field">
              Class
              <select value={selectedTypeId} onChange={(e) => setSelectedTypeId(e.target.value)}>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Day
              <select value={newOccDay} onChange={(e) => setNewOccDay(e.target.value as Weekday)}>
                {WEEKDAYS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Time
              <input
                type="time"
                value={newOccTime}
                onChange={(e) => setNewOccTime(e.target.value)}
              />
            </label>
            <button type="button" className="btn primary" disabled={busy} onClick={addSession}>
              Add to calendar
            </button>
          </div>

          <div className="remove-occ-list">
            <h3>Remove a session</h3>
            <p className="hint">
              A session nobody has booked is deleted outright. Once anyone has booked or attended,
              it is archived instead — hidden from the timetable, with the roster kept so members
              keep their record of what they attended and were charged for.
            </p>
            {sessionList.length === 0 ? (
              <p className="hint">No sessions scheduled for {week.label}.</p>
            ) : (
              <ul className="admin-session-list">
                {sessionList.map((occ) => {
                  const type = classTypeById(occ.classTypeId)
                  return (
                    <li key={occ.id}>
                      <span>
                        <strong>{type?.name ?? occ.classTypeId}</strong> · {occ.dayLabel}{' '}
                        {occ.time} · {formatSessionAttending(occ)}
                      </span>
                      <button
                        type="button"
                        className="btn ghost"
                        disabled={busy}
                        onClick={() => removeSession(occ)}
                      >
                        {occ.bookedCount > 0 ? 'Archive' : 'Delete'}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </section>
      )}

      {tab === 'members' && <MembersPayments role={role} />}

      {tab === 'clients' && role === 'admin' && <ClientAccounts />}

      {tab === 'risk' && (
        <section className="yacht-panel app-enter app-section">
          <h2>Personal limitations &amp; risk</h2>
          {users.map((u) => (
            <article key={u.id} className="risk-card">
              <h3>{u.name}</h3>
              <label className="field">
                Limitations (member-reported)
                <textarea
                  rows={2}
                  value={u.limitations}
                  onChange={(e) => {
                    setMemberRisk(u.id, e.target.value, u.riskNotes)
                    refresh()
                  }}
                />
              </label>
              <label className="field">
                Observed risk notes (staff)
                <textarea
                  rows={2}
                  value={u.riskNotes}
                  onChange={(e) => {
                    setMemberRisk(u.id, u.limitations, e.target.value)
                    refresh()
                  }}
                />
              </label>
            </article>
          ))}
        </section>
      )}

      {tab === 'legal' && role === 'admin' && (
        <section className="yacht-panel app-enter app-section">
          <h2>Legal, pricing &amp; policies</h2>
          <label className="field">
            Transfer window (hours before class)
            <input
              type="number"
              min={0}
              value={getTransferWindowHours()}
              onChange={(e) => {
                setTransferWindowHours(Number(e.target.value))
                refresh()
              }}
            />
          </label>
          <h3>Session pricing</h3>
          <p className="hint">
            Per-class rate for each commitment level. The drop-in rate is what a one-off booking is
            charged, including extras booked by members already on a subscription.
          </p>
          {pricingError ? <p className="form-error">{pricingError}</p> : null}
          <ul className="admin-member-list">
            {/* The drop-in tier is listed here too: it used to be filtered out,
                which left the rate most often charged uneditable. */}
            {(usingLivePricing ? pricing.plans : getPricingPlans()).map((p) => (
              <li key={p.id}>
                <strong>{p.name}</strong>
                {p.classesPerWeek > 0 ? (
                  <span className="hint"> · {p.classesPerWeek}/week</span>
                ) : (
                  <span className="hint"> · drop-in</span>
                )}
                <label className="field">
                  Rate per class ($)
                  <input
                    type="number"
                    min={0}
                    step="0.50"
                    defaultValue={p.ratePerClass}
                    onBlur={(e) => savePlanRate(p.id, Number(e.target.value))}
                  />
                </label>
              </li>
            ))}
          </ul>
          <label className="field">
            Payment instructions
            <textarea
              rows={3}
              value={site.paymentInstructions}
              onChange={(e) => {
                updateSiteContent({ paymentInstructions: e.target.value })
                refresh()
              }}
            />
          </label>
          <label className="field">
            Terms
            <textarea
              rows={4}
              value={site.termsText}
              onChange={(e) => {
                updateSiteContent({ termsText: e.target.value })
                refresh()
              }}
            />
          </label>
          <label className="field">
            Waiver
            <textarea
              rows={4}
              value={site.waiverText}
              onChange={(e) => {
                updateSiteContent({ waiverText: e.target.value })
                refresh()
              }}
            />
          </label>
        </section>
      )}

      {tab === 'notify' && role === 'admin' && (
        <section className="yacht-panel app-enter app-section">
          <h2>Email all subscribers</h2>
          <p className="hint"> outbox — no real email is sent.</p>
          <label className="field">
            Subject
            <input value={mailSubject} onChange={(e) => setMailSubject(e.target.value)} />
          </label>
          <label className="field">
            Body
            <textarea rows={5} value={mailBody} onChange={(e) => setMailBody(e.target.value)} />
          </label>
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              sendSubscriberEmail(mailSubject, mailBody)
              refresh()
            }}
          >
            Send to subscribers (demo)
          </button>
          <h3>Outbox</h3>
          <ul>
            {outbox.length === 0 ? <li>Empty</li> : null}
            {outbox.map((m) => (
              <li key={m.id}>
                <strong>{m.subject}</strong> · {m.sentAt} · {m.recipientCount} recipients
                <p className="hint">{m.body}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tab === 'reminders' && (
        <section className="yacht-panel app-enter app-section">
          <h2>Marketing &amp; ops reminders</h2>
          <ul className="reminder-list">
            {reminders.map((r) => (
              <li key={r.id}>
                <label className={`exercise-check${r.done ? ' on' : ''}`}>
                  <input
                    type="checkbox"
                    checked={r.done}
                    onChange={() => {
                      toggleReminder(r.id)
                      refresh()
                    }}
                  />
                  <span>
                    [{r.kind}] {r.title} · due {r.dueLabel}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="add-exercise-row">
            <input
              value={remTitle}
              onChange={(e) => setRemTitle(e.target.value)}
              placeholder="New reminder"
            />
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                if (!remTitle.trim()) return
                addReminder(remTitle.trim(), 'Soon', 'ops')
                setRemTitle('')
                refresh()
              }}
            >
              Add
            </button>
          </div>
        </section>
      )}

      {tab === 'team' && (
        <section className="yacht-panel app-enter app-section">
          <h2>Team &amp; trainers</h2>
          <p className="hint">
            A trainer login keeps the board running when Tom is away.
          </p>
          <ul className="admin-member-list">
            {team.map((t) => (
              <li key={t.id}>
                <strong>{t.name}</strong> · {t.role}
                <label className="field">
                  Notes
                  <input
                    value={t.notes}
                    disabled={role !== 'admin'}
                    onChange={(e) => {
                      updateTeamMember(t.id, e.target.value)
                      refresh()
                    }}
                  />
                </label>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tab === 'site' && role === 'admin' && (
        <section className="yacht-panel app-enter app-section">
          <h2>Public-facing content</h2>
          <p className="hint">Edits appear in the member app without touching code.</p>
          <label className="field">
            Hero blurb
            <textarea
              rows={2}
              value={site.heroBlurb}
              onChange={(e) => {
                updateSiteContent({ heroBlurb: e.target.value })
                refresh()
              }}
            />
          </label>
          <label className="field">
            Schedule narrative
            <textarea
              rows={3}
              value={site.scheduleNarrative}
              onChange={(e) => {
                updateSiteContent({ scheduleNarrative: e.target.value })
                refresh()
              }}
            />
          </label>
          <label className="field">
            Contact display line
            <input
              value={site.contactDisplay}
              onChange={(e) => {
                updateSiteContent({ contactDisplay: e.target.value })
                refresh()
              }}
            />
          </label>
        </section>
      )}
      </div>
    </div>
  )
}
