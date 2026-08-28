import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ClassTypeDescription } from '@gbtt/shared/studio/ClassTypeDescription'
import { AppOutsideShell } from '../../components/AppChrome'
import { WeekSessionCalendar } from '../../components/WeekSessionCalendar'
import {
  WEEKDAYS,
  addExercise,
  addReminder,
  adminAddMemberToSession,
  archiveClassType,
  calculateMemberOwed,
  classTypeById,
  confirmSubscriptionChange,
  createClassType,
  deleteExercise,
  deleteOccurrence,
  formatSessionAttending,
  getClassTypes,
  getEquipmentChecked,
  getExercises,
  getMemberAttendance,
  getOutbox,
  getPricingPlans,
  getReminders,
  getSessionRole,
  getSessionUser,
  getSiteContent,
  getTeam,
  getTransferWindowHours,
  getUsers,
  login,
  logout,
  occurrenceById,
  occurrencesByWeekday,
  planById,
  renameExercise,
  resetStudioData,
  sendSubscriberEmail,
  sessionIsFull,
  setClassCap,
  setEquipmentChecked,
  setMemberDiscount,
  setMemberPaid,
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
  type ExerciseDisplay,
  type Weekday,
} from '../../shared/fitnessStudio'

type Tab =
  | 'schedule'
  | 'members'
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
  { id: 'members', label: 'Members & payments' },
  { id: 'risk', label: 'Risk & notes' },
  { id: 'legal', label: 'Legal & payments copy', adminOnly: true },
  { id: 'notify', label: 'Notify', adminOnly: true },
  { id: 'reminders', label: 'Reminders' },
  { id: 'team', label: 'Team' },
  { id: 'site', label: 'Site content', adminOnly: true },
]

/**
 * Admin console —  login; substitute gets restricted tabs.
 */
export default function ClassBoard() {
  const [tick, setTick] = useState(0)
  const refresh = () => setTick((n) => n + 1)

  const role = getSessionRole()
  const session = getSessionUser()
  const staff = role === 'admin' || role === 'substitute'

  const [email, setEmail] = useState('tom@gbtt')
  const [password, setPassword] = useState('demo')
  const [loginError, setLoginError] = useState<string | null>(null)
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
  const byDay = useMemo(() => occurrencesByWeekday(), [tick, selectedOccId, tab])
  const exercises = getExercises()
  const users = getUsers().filter((u) => u.role === 'member')
  const site = getSiteContent()
  const team = getTeam()
  const reminders = getReminders()
  const outbox = getOutbox()
  const equipment = getEquipmentChecked()
  const sync = useMemo(() => syncLabels(), [tab, selectedTypeId, tick])
  const selected = classTypeById(selectedTypeId)
  const selectedOcc = selectedOccId ? occurrenceById(selectedOccId) : undefined
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
              Substitutes can run schedule and role-call without legal, notify, or site content tabs.
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
            />
          </label>
          {loginError ? <p className="form-error">{loginError}</p> : null}
          <div className="btn-row">
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                const err = login(email, password)
                if (err) setLoginError(err)
                else {
                  setLoginError(null)
                  refresh()
                }
              }}
            >
              Sign in
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
            substitutes, and public site text.
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
            <WeekSessionCalendar
              byDay={byDay}
              selectedId={selectedOccId}
              onSelect={(id) => {
                setSelectedOccId(id)
                const o = occurrenceById(id)
                if (o) setSelectedTypeId(o.classTypeId)
              }}
              mode="admin"
            />
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
                  <ul className="role-call-list">
                    {selectedOcc.roster.map((r) => (
                      <li key={`${r.memberId ?? r.displayName}`}>
                        <label className="exercise-check">
                          <input
                            type="checkbox"
                            checked={r.status === 'attended'}
                            onChange={(e) => {
                              if (r.memberId) {
                                setRosterStatus(
                                  selectedOcc.id,
                                  r.memberId,
                                  e.target.checked ? 'attended' : 'booked',
                                )
                                refresh()
                              }
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
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => {
                      if (confirm('Remove this session from the week?')) {
                        deleteOccurrence(selectedOcc.id)
                        setSelectedOccId(null)
                        refresh()
                      }
                    }}
                  >
                    Delete session
                  </button>
                ) : null}
              </div>
            ) : null}
            {role === 'admin' ? (
              <div className="add-occ-row">
                <h3>Add session</h3>
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
                  <select
                    value={newOccDay}
                    onChange={(e) => setNewOccDay(e.target.value as Weekday)}
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
                    value={newOccTime}
                    onChange={(e) => setNewOccTime(e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => {
                    const id = upsertOccurrence({
                      classTypeId: selectedTypeId,
                      dayLabel: newOccDay,
                      time: newOccTime,
                    })
                    setSelectedOccId(id)
                    refresh()
                  }}
                >
                  Add to calendar
                </button>
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

      {tab === 'members' && (
        <section className="yacht-panel app-enter app-section">
          <h2>Members &amp; payments</h2>
          <ul className="admin-member-list">
            {users.map((u) => (
              <li key={u.id}>
                <strong>{u.name}</strong> · {u.email} · {planById(u.planId)?.name ?? u.planId}
                <br />
                <label className="exercise-check">
                  <input
                    type="checkbox"
                    checked={u.paid}
                    disabled={role !== 'admin'}
                    onChange={(e) => {
                      setMemberPaid(u.id, e.target.checked, e.target.checked ? 'Marked paid' : 'Unpaid')
                      refresh()
                    }}
                  />
                  Paid
                </label>
                <span className="hint"> {u.paymentNote}</span>
                <p className="hint">
                  Attended: {getMemberAttendance(u.id).length} · Owed: $
                  {calculateMemberOwed(u.id).total} (incl.{' '}
                  {u.discountPercent ?? 0}% discount)
                </p>
                {role === 'admin' ? (
                  <label className="field">
                    Discount %
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={u.discountPercent ?? 0}
                      onChange={(e) => {
                        setMemberDiscount(u.id, Number(e.target.value))
                        refresh()
                      }}
                    />
                  </label>
                ) : null}
                <p className="hint">
                  Held: {u.heldOccurrenceIds.length}
                  {u.classesPerWeek ? ` / ${u.classesPerWeek} per week` : ` · credits ${u.creditsLeft}`}
                </p>
                {u.pendingPlanId && role === 'admin' ? (
                  <div className="btn-row">
                    <p className="form-success">
                      Pending change → {planById(u.pendingPlanId)?.name}
                    </p>
                    <button
                      type="button"
                      className="btn primary"
                      onClick={() => {
                        confirmSubscriptionChange(u.id, true)
                        refresh()
                      }}
                    >
                      Confirm payment &amp; apply
                    </button>
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => {
                        confirmSubscriptionChange(u.id, false)
                        refresh()
                      }}
                    >
                      Decline
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      )}

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
          <h3>Plan pricing</h3>
          <ul className="admin-member-list">
            {getPricingPlans()
              .filter((p) => p.classesPerWeek > 0)
              .map((p) => (
                <li key={p.id}>
                  <strong>{p.name}</strong>
                  <label className="field">
                    Rate per class ($)
                    <input
                      type="number"
                      value={p.ratePerClass}
                      onChange={(e) => {
                        updatePricingPlan(p.id, { ratePerClass: Number(e.target.value) })
                        refresh()
                      }}
                    />
                  </label>
                  <label className="field">
                    Prepaid total ($)
                    <input
                      type="number"
                      value={p.prepaidTotal}
                      onChange={(e) => {
                        updatePricingPlan(p.id, { prepaidTotal: Number(e.target.value) })
                        refresh()
                      }}
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
          <h2>Team &amp; substitutes</h2>
          <p className="hint">
            Cover logins (substitute account) keep the board running when Tom is away.
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
