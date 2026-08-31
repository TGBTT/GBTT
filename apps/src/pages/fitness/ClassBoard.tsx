import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ClassTypeDescription } from '@gbtt/shared/studio/ClassTypeDescription'
import {
  studioAddMemberToSession,
  studioMarkAttendance,
  studioLogout,
  studioRemoveSession,
  studioSetMemberRole,
} from '@gbtt/shared/studio/studioAuth'
import {
  saveMemberClinical,
  subscribeMembers,
  type LiveMembersState,
} from '@gbtt/shared/studio/firebase/liveMembers'
import {
  addReminder,
  removeReminder,
  setReminderDone,
  subscribeReminders,
  type LiveRemindersState,
  type ReminderKind,
} from '@gbtt/shared/studio/firebase/liveReminders'
import { StudioSignIn } from '../../components/StudioSignIn'
import {
  createLiveSession,
  createSessionSeries,
  deactivateTimetableSlot,
  saveTimetableSlot,
  subscribeTimetableSlots,
  updateLiveSession,
  type LiveTimetableSlot,
  type SessionEdit,
} from '@gbtt/shared/studio/firebase/liveSessions'
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
  archiveClassType,
  classTypeById,
  createClassType,
  deleteExercise,
  formatSessionAttending,
  getClassTypes,
  getEquipmentChecked,
  getExercises,
  getOutbox,
  getSessionRole,
  getSessionUser,
  getSiteContent,
  getTransferWindowHours,
  logout,
  renameExercise,
  sendSubscriberEmail,
  sessionIsFull,
  setClassCap,
  setEquipmentChecked,
  setTransferWindowHours,
  spotsLeft,
  subscribeStore,
  syncLabels,
  toggleExercise,
  updateClassType,
  updateSiteContent,
  type ClassOccurrence,
  type ExerciseDisplay,
  type Weekday,
} from '../../shared/fitnessStudio'

/** How far forward a newly added class should run. */
type Recurrence = 'once' | 'weeks' | 'ongoing'

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

/*
 * Inline rather than an icon font or sprite: three glyphs used in one list is
 * not worth a dependency or a network request, and inlining lets them inherit
 * currentColor so the danger variant needs no separate asset.
 *
 * Each is decorative — the button carries the accessible name — so they are
 * hidden from assistive tech.
 */
const iconProps = {
  viewBox: '0 0 16 16',
  width: 14,
  height: 14,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
}

const PencilIcon = () => (
  <svg {...iconProps}>
    <path d="M11.2 2.3a1.1 1.1 0 0 1 1.6 0l0.9 0.9a1.1 1.1 0 0 1 0 1.6L6.3 11.2l-2.6 0.7 0.7-2.6z" />
  </svg>
)

const CrossIcon = () => (
  <svg {...iconProps}>
    <path d="M4 4l8 8M12 4l-8 8" />
  </svg>
)

const TickIcon = () => (
  <svg {...iconProps}>
    <path d="M3.5 8.5l3 3 6-7" />
  </svg>
)

const ALL_TABS: { id: Tab; label: string; adminOnly?: boolean }[] = [
  { id: 'schedule', label: 'Schedule' },
  { id: 'sessions', label: 'Add & remove sessions' },
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

  // Signing out from the site nav mutates the store without going through this
  // page, so re-read it whenever the store changes.
  useEffect(() => subscribeStore(refresh), [])

  const role = getSessionRole()
  const session = getSessionUser()
  const staff = role === 'admin' || role === 'trainer'

  const [tab, setTab] = useState<Tab>('schedule')
  const [selectedTypeId, setSelectedTypeId] = useState(getClassTypes()[0]?.id ?? 'sweat')
  const [selectedOccId, setSelectedOccId] = useState<string | null>(null)
  const [newExercise, setNewExercise] = useState('')
  const [mailSubject, setMailSubject] = useState('GBTT timetable update')
  const [mailBody, setMailBody] = useState('Hi team — here’s this week’s schedule.')
  const [remTitle, setRemTitle] = useState('')
  const [remDue, setRemDue] = useState('')
  const [elevateUid, setElevateUid] = useState('')
  const [recurrence, setRecurrence] = useState<Recurrence>('once')
  const [repeatWeeks, setRepeatWeeks] = useState(10)
  const [recurringSlots, setRecurringSlots] = useState<LiveTimetableSlot[]>([])
  useEffect(() => subscribeTimetableSlots(setRecurringSlots), [])
  const [remKind, setRemKind] = useState<ReminderKind>('ops')
  const [newOccDay, setNewOccDay] = useState<Weekday>('Mon')
  const [newOccTime, setNewOccTime] = useState('07:00')
  const [addMemberId, setAddMemberId] = useState('')
  const [newClassId, setNewClassId] = useState('')
  const [newClassName, setNewClassName] = useState('')
  const [renameExerciseId, setRenameExerciseId] = useState<string | null>(null)
  const [renameExerciseName, setRenameExerciseName] = useState('')

  /** Ignores a blank name rather than letting an unnamed exercise through. */
  const commitRename = (exerciseId: string) => {
    const name = renameExerciseName.trim()
    if (!name) return
    renameExercise(exerciseId, name)
    setRenameExerciseId(null)
    refresh()
  }

  const classes = getClassTypes()

  // Firestore is the source of truth for the timetable, its counts and the
  // roster. An unconfigured build shows an empty week rather than seed numbers.
  const week = useWeekNavigation()
  const live = useLiveSessions(week.weekStart)
  const liveRoster = useSessionRoster(live.status === 'ready' ? selectedOccId : null)
  const [liveMembers, setLiveMembers] = useState<LiveMembersState>({
    status: 'loading',
    members: [],
  })
  const [reminders, setReminders] = useState<LiveRemindersState>({
    status: 'loading',
    reminders: [],
  })
  useEffect(() => subscribeMembers(setLiveMembers), [])
  useEffect(() => subscribeReminders(setReminders), [])
  const byDay = live.byDay
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
  const [pricingError, setPricingError] = useState<string | null>(null)

  const savePlanRate = async (planId: string, ratePerClass: number) => {
    setPricingError(null)
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
    const what = `${type.name} on ${newOccDay} at ${newOccTime}`
    const input = {
      classTypeId: type.id,
      className: type.name,
      cap: type.cap,
      dayLabel: newOccDay,
      time: newOccTime,
      weekStart: live.weekStart,
    }

    setBusy(true)

    if (recurrence === 'ongoing') {
      /*
       * An ongoing class is a standing slot, not a pile of sessions. The slot is
       * what season generation reads, so it is written first; this week's
       * session is created alongside it so the class shows on the board
       * immediately rather than only after the next generate.
       */
      const slot = await saveTimetableSlot(input)
      const { id, error } = slot.error
        ? { id: null, error: slot.error }
        : await createLiveSession(input)
      setBusy(false)
      if (error) {
        setActionError(error)
        return
      }
      setSelectedOccId(id)
      setActionNote(
        `${what} now runs every week. It is on ${week.label} already — run Generate sessions in Seasons to lay it across the rest of the term, which also skips holiday closures.`,
      )
      return
    }

    const weeks = recurrence === 'once' ? 1 : repeatWeeks
    const { created, error } = await createSessionSeries(input, weeks)
    setBusy(false)
    if (error) {
      setActionError(error)
      return
    }
    setActionNote(
      created === 1
        ? `Added ${what} to ${week.label}.`
        : `Added ${what} for ${created} weeks from ${week.label}.`,
    )
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
  // Everyone on the roll, split by the role claim: clients to bill and screen
  // for risk, and the elevated few who can run the board in Tom's absence.
  const users = liveMembers.members.filter((u) => u.role === 'member')
  const team = liveMembers.members.filter((u) => u.role === 'trainer' || u.role === 'admin')
  const site = getSiteContent()
  const outbox = getOutbox()
  const equipment = getEquipmentChecked()
  const sync = useMemo(() => syncLabels(), [tab, selectedTypeId, tick])
  const selected = classTypeById(selectedTypeId)
  const baseSelectedOcc = selectedOccId
    ? live.occurrences.find((o) => o.id === selectedOccId)
    : undefined
  // The calendar reads counts from the session document, but the roll call
  // needs the roster docs themselves, which are fetched only for the open session.
  const selectedOcc = baseSelectedOcc
    ? { ...baseSelectedOcc, roster: liveRoster.roster }
    : undefined
  const selectedOccType = selectedOcc ? classTypeById(selectedOcc.classTypeId) : undefined

  /**
   * Write a session edit straight to Firestore.
   *
   * These controls used to call the seed-store mutators, which silently did
   * nothing for a live session id — the select simply snapped back on the next
   * render. Errors are surfaced instead.
   */
  const saveSessionEdit = async (occ: ClassOccurrence, edit: SessionEdit) => {
    setActionError(null)
    setBusy(true)
    const err = await updateLiveSession(
      occ.id,
      { dayLabel: occ.dayLabel, time: occ.time, classTypeId: occ.classTypeId },
      live.weekStart,
      edit,
    )
    setBusy(false)
    if (err) setActionError(err)
  }

  const tabs = ALL_TABS.filter((t) => !t.adminOnly || role === 'admin')

  if (!staff) {
    /*
     * Hiding the shell is not the protection — Firestore rules reject a token
     * without a staff claim regardless — but a client who followed a link here
     * has done nothing wrong, so they are sent to the app they can actually
     * use rather than shown a failure.
     */
    const isMember = role === 'member'
    return (
      <div className="classboard-page theme-gbtt">
        <AppOutsideShell imageId="classboard" showBackLink={false} />
        <div className="app-sections">
        <header className="classboard-top app-section">
          <div>
            <p className="app-badge">Staff admin</p>
            <h1>{isMember ? 'This is the staff console' : 'Sign in'}</h1>
            <p className="app-sub">
              {isMember
                ? 'Your account is a client account, so there is nothing for you in here — booking lives in the member app.'
                : 'Trainers can run schedule and role-call without legal, notify, or site content tabs.'}
            </p>
          </div>
        </header>
        <section className="yacht-panel app-enter admin-login app-section">
          {isMember ? (
            <div className="btn-row">
              <Link className="btn primary" to="/fitness/studioflow">
                Go to booking →
              </Link>
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  void studioLogout().then(refresh)
                }}
              >
                Sign in as someone else
              </button>
            </div>
          ) : (
            <StudioSignIn
              onSignedIn={refresh}
              extraActions={
                <Link className="btn ghost" to="/fitness/studioflow">
                  Member app →
                </Link>
              }
            />
          )}
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
              instructor{staff ? ' — or add a new session below' : ''}.
            </p>
            <WeekNavigator
              label={week.label}
              isCurrentWeek={week.isCurrentWeek}
              isPast={week.isPast}
              onPrevious={week.previousWeek}
              onNext={week.nextWeek}
              onReset={week.resetWeek}
              disabled={live.status === 'loading'}
            />
            {live.status === 'loading' ? (
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
                  const o = live.occurrences.find((x) => x.id === id)
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
                  {liveRoster.status === 'loading' ? (
                    <p className="hint">Loading roster…</p>
                  ) : null}
                  {liveRoster.status === 'ready' && !liveRoster.roster.length ? (
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
                              studioMarkAttendance(selectedOcc.id, r.memberId, next).then((err) =>
                                setActionError(err),
                              )
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
                        .filter((u) => !selectedOcc.roster.some((r) => r.memberId === u.uid))
                        .map((u) => (
                          <option key={u.uid} value={u.uid}>
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
                        studioAddMemberToSession(selectedOcc.id, addMemberId).then((err) => {
                          setActionError(err)
                          if (!err) setAddMemberId('')
                        })
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
                    disabled={busy}
                    onChange={(e) => {
                      void saveSessionEdit(selectedOcc, {
                        exerciseDisplay: e.target.value as ExerciseDisplay,
                      })
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
                      disabled={role !== 'admin' || busy}
                      onChange={(e) => {
                        void saveSessionEdit(selectedOcc, { dayLabel: e.target.value })
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
                      disabled={role !== 'admin' || busy}
                      onChange={(e) => {
                        if (!e.target.value) return
                        void saveSessionEdit(selectedOcc, { time: e.target.value })
                      }}
                    />
                  </label>
                  <label className="field">
                    Class
                    <select
                      value={selectedOcc.classTypeId}
                      disabled={role !== 'admin' || busy}
                      onChange={(e) => {
                        const nextType = classTypeById(e.target.value)
                        setSelectedTypeId(e.target.value)
                        void saveSessionEdit(selectedOcc, {
                          classTypeId: e.target.value,
                          className: nextType?.name,
                          cap: nextType?.cap,
                        })
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
                      disabled={busy}
                      onChange={(e) => {
                        void saveSessionEdit(selectedOcc, { instructorId: e.target.value })
                      }}
                    >
                      {/* An unassigned session is a real state while the team
                          list is still being built up. */}
                      <option value="">Unassigned</option>
                      {team.map((i) => (
                        <option key={i.uid} value={i.uid}>
                          {i.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {staff ? (
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
                              aria-label={`Rename ${ex.name}`}
                              autoFocus
                              onChange={(e) => setRenameExerciseName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') commitRename(ex.id)
                                if (e.key === 'Escape') setRenameExerciseId(null)
                              }}
                            />
                          ) : (
                            ex.name
                          )}
                        </label>
                        {role === 'admin' ? (
                          <span className="icon-btn-row">
                            {renameExerciseId === ex.id ? (
                              <>
                                <button
                                  type="button"
                                  className="icon-btn"
                                  title="Save name"
                                  aria-label={`Save name for ${ex.name}`}
                                  onClick={() => commitRename(ex.id)}
                                >
                                  <TickIcon />
                                </button>
                                <button
                                  type="button"
                                  className="icon-btn"
                                  title="Cancel"
                                  aria-label={`Cancel renaming ${ex.name}`}
                                  onClick={() => setRenameExerciseId(null)}
                                >
                                  <CrossIcon />
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  className="icon-btn"
                                  title="Rename"
                                  aria-label={`Rename ${ex.name}`}
                                  onClick={() => {
                                    setRenameExerciseId(ex.id)
                                    setRenameExerciseName(ex.name)
                                  }}
                                >
                                  <PencilIcon />
                                </button>
                                <button
                                  type="button"
                                  className="icon-btn danger"
                                  title="Delete"
                                  aria-label={`Delete ${ex.name}`}
                                  onClick={() => {
                                    // Named in the prompt: the icons sit in a
                                    // list of near-identical rows, so "are you
                                    // sure?" alone would not tell an admin
                                    // which one they are about to lose.
                                    const ok = window.confirm(
                                      `Delete "${ex.name}"? It will be removed from every class type that uses it.`,
                                    )
                                    if (!ok) return
                                    deleteExercise(ex.id)
                                    refresh()
                                  }}
                                >
                                  <CrossIcon />
                                </button>
                              </>
                            )}
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

      {tab === 'sessions' && staff && (
        <section className="yacht-panel app-enter app-section">
          <h2>Add &amp; remove sessions</h2>
          {actionError ? <p className="form-error">{actionError}</p> : null}
          {actionNote ? <p className="form-success">{actionNote}</p> : null}

          {/* Shares the schedule tab's week, so stepping forward here builds
              out future weeks rather than only editing the current one. */}
          <WeekNavigator
            label={week.label}
            isCurrentWeek={week.isCurrentWeek}
            isPast={week.isPast}
            onPrevious={week.previousWeek}
            onNext={week.nextWeek}
            onReset={week.resetWeek}
            disabled={busy || live.status === 'loading'}
          />

          <div className="add-occ-row">
            <h3>Add a session</h3>
            <p className="hint">
              Starts from {week.label}. Members can book it as soon as it appears.
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
            <label className="field">
              Repeats
              <select
                value={recurrence}
                onChange={(e) => setRecurrence(e.target.value as Recurrence)}
              >
                <option value="once">This week only</option>
                <option value="weeks">For a set number of weeks</option>
                <option value="ongoing">Every week, ongoing</option>
              </select>
            </label>
            {recurrence === 'weeks' ? (
              <label className="field">
                Number of weeks
                <input
                  type="number"
                  min={1}
                  max={52}
                  value={repeatWeeks}
                  onChange={(e) => setRepeatWeeks(Number(e.target.value))}
                />
              </label>
            ) : null}
            <p className="hint">
              {recurrence === 'ongoing'
                ? 'Adds it to the recurring weekly timetable. Sessions are laid across the term by Generate sessions in Seasons, which skips holiday closures.'
                : recurrence === 'weeks'
                  ? `Creates ${repeatWeeks} session${repeatWeeks === 1 ? '' : 's'}, one a week from ${week.label}. Holiday closures are not applied to a fixed run — use "ongoing" if the class should follow the term calendar.`
                  : 'A one-off. Nothing is added to the recurring timetable.'}
            </p>
            <button type="button" className="btn primary" disabled={busy} onClick={addSession}>
              {recurrence === 'ongoing' ? 'Add weekly class' : 'Add to calendar'}
            </button>
          </div>

          <div className="remove-occ-list">
            <h3>Recurring weekly classes</h3>
            <p className="hint">
              The standing timetable that Generate sessions works from. Stopping one leaves every
              session already created alone — remove those individually if they should not run.
            </p>
            {!recurringSlots.length ? (
              <p className="hint">Nothing recurring yet.</p>
            ) : (
              <ul className="admin-session-list">
                {recurringSlots.map((slot) => (
                  <li key={slot.id}>
                    <span>
                      <strong>{classTypeById(slot.classTypeId)?.name ?? slot.classTypeId}</strong> ·{' '}
                      {slot.dayLabel} {slot.time} · every week
                    </span>
                    <button
                      type="button"
                      className="btn ghost"
                      disabled={busy}
                      onClick={async () => {
                        if (!confirm(`Stop ${slot.dayLabel} ${slot.time} running every week?`)) {
                          return
                        }
                        setActionError(await deactivateTimetableSlot(slot.id))
                      }}
                    >
                      Stop recurring
                    </button>
                  </li>
                ))}
              </ul>
            )}
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
          {liveMembers.status === 'loading' ? <p className="hint">Loading clients…</p> : null}
          {liveMembers.status === 'error' ? (
            <p className="form-error">Could not load clients: {liveMembers.error}</p>
          ) : null}
          {liveMembers.status === 'ready' && !users.length ? (
            <p className="hint">No clients yet. Notes appear here once accounts exist.</p>
          ) : null}
          {users.map((u) => (
            <article key={u.uid} className="risk-card">
              <h3>{u.name}</h3>
              <label className="field">
                Limitations (member-reported)
                <textarea
                  rows={2}
                  defaultValue={u.limitations}
                  onBlur={(e) => {
                    if (e.target.value === u.limitations) return
                    void saveMemberClinical(u.uid, { limitations: e.target.value })
                  }}
                />
              </label>
              <label className="field">
                Observed risk notes (staff)
                <textarea
                  rows={2}
                  defaultValue={u.riskNotes}
                  onBlur={(e) => {
                    if (e.target.value === u.riskNotes) return
                    void saveMemberClinical(u.uid, { riskNotes: e.target.value })
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
            {pricing.plans.map((p) => (
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
            Send to subscribers
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
          {reminders.status === 'loading' ? <p className="hint">Loading reminders…</p> : null}
          {reminders.status === 'error' ? (
            <p className="form-error">Could not load reminders: {reminders.error}</p>
          ) : null}
          {reminders.status === 'ready' && !reminders.reminders.length ? (
            <p className="hint">Nothing on the list. Add the first reminder below.</p>
          ) : null}
          <ul className="reminder-list">
            {reminders.reminders.map((r) => (
              <li key={r.id} className="reminder-row">
                <label className={`exercise-check${r.done ? ' on' : ''}`}>
                  <input
                    type="checkbox"
                    checked={r.done}
                    onChange={() => void setReminderDone(r.id, !r.done)}
                  />
                  <span>
                    [{r.kind}] {r.title} · due {r.dueLabel}
                  </span>
                </label>
                <button
                  type="button"
                  className="icon-btn danger"
                  aria-label={`Remove reminder: ${r.title}`}
                  title="Remove"
                  onClick={() => {
                    if (!confirm(`Remove reminder "${r.title}"?`)) return
                    void removeReminder(r.id)
                  }}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          <div className="add-exercise-row">
            <input
              value={remTitle}
              onChange={(e) => setRemTitle(e.target.value)}
              placeholder="New reminder"
            />
            <input
              value={remDue}
              onChange={(e) => setRemDue(e.target.value)}
              placeholder="Due (e.g. Fri)"
            />
            <select value={remKind} onChange={(e) => setRemKind(e.target.value as ReminderKind)}>
              <option value="ops">ops</option>
              <option value="marketing">marketing</option>
            </select>
            <button
              type="button"
              className="btn ghost"
              onClick={async () => {
                if (!remTitle.trim()) return
                const err = await addReminder(remTitle, remDue, remKind)
                if (err) {
                  setActionError(err)
                  return
                }
                setRemTitle('')
                setRemDue('')
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
            A trainer login keeps the board running when Tom is away. Trainers are client accounts
            that have been elevated — there is no separate trainer account to create. A role change
            takes effect when they next sign out and back in.
          </p>
          {liveMembers.status === 'error' ? (
            <p className="form-error">Could not load accounts: {liveMembers.error}</p>
          ) : null}
          <ul className="admin-member-list">
            {team.map((t) => (
              <li key={t.uid}>
                <strong>{t.name}</strong> · {t.role}
                {role === 'admin' && t.role === 'trainer' ? (
                  <button
                    type="button"
                    className="btn ghost"
                    disabled={busy}
                    onClick={async () => {
                      if (!confirm(`Return ${t.name} to a standard client account?`)) return
                      setActionError(await studioSetMemberRole(t.uid, 'member'))
                    }}
                  >
                    Remove trainer access
                  </button>
                ) : null}
              </li>
            ))}
          </ul>

          {role === 'admin' ? (
            <>
              <h3>Elevate a client</h3>
              {!users.length ? (
                <p className="hint">No client accounts to elevate yet.</p>
              ) : (
                <div className="add-exercise-row">
                  <select
                    value={elevateUid}
                    onChange={(e) => setElevateUid(e.target.value)}
                    aria-label="Client to make a trainer"
                  >
                    <option value="">Choose a client…</option>
                    {users.map((u) => (
                      <option key={u.uid} value={u.uid}>
                        {u.name} ({u.email})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn ghost"
                    disabled={!elevateUid || busy}
                    onClick={async () => {
                      const err = await studioSetMemberRole(elevateUid, 'trainer')
                      setActionError(err)
                      if (!err) setElevateUid('')
                    }}
                  >
                    Make trainer
                  </button>
                </div>
              )}
            </>
          ) : null}
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
