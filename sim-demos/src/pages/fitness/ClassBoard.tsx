import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { DemoOutsideShell } from '../../components/DemoChrome'
import { WeekSessionCalendar } from '../../components/WeekSessionCalendar'
import {
  DEMO_CREDENTIALS,
  WEEKDAYS,
  addExercise,
  addReminder,
  classTypeById,
  confirmSubscriptionChange,
  deleteOccurrence,
  formatSessionAttending,
  getClassTypes,
  getEquipmentChecked,
  getExercises,
  getOutbox,
  getReminders,
  getSessionRole,
  getSessionUser,
  getSiteContent,
  getTeam,
  getUsers,
  login,
  logout,
  occurrenceById,
  occurrencesByWeekday,
  planById,
  resetSimStore,
  sendSubscriberEmail,
  sessionIsFull,
  setClassCap,
  setEquipmentChecked,
  setMemberPaid,
  setMemberRisk,
  setOccurrenceInstructor,
  spotsLeft,
  syncLabels,
  toggleExercise,
  toggleReminder,
  updateClassType,
  updateOccurrenceFields,
  updateSiteContent,
  updateTeamMember,
  upsertOccurrence,
  type Weekday,
} from '../../shared/fitnessStudio'
import { ADMIN_ROADMAP } from '../../shared/capabilityRoadmap'

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
 * Admin console — simulated login; substitute gets restricted tabs.
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
        <DemoOutsideShell imageId="classboard" backLabel="← Demos hub" />
        <header className="classboard-top">
          <div>
            <p className="demo-badge">Admin console · simulated</p>
            <h1>Staff login</h1>
            <p className="demo-sub">
              Firebase is not live yet — this login is localStorage only. Substitutes can run schedule
              and risk without legal / notify / site content.
            </p>
          </div>
        </header>
        <section className="yacht-panel demo-enter admin-login">
          <p className="hint">
            {DEMO_CREDENTIALS.map((c) => `${c.label}: ${c.email} / ${c.password}`).join(' · ')}
          </p>
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
    )
  }

  return (
    <div className="classboard-page theme-gbtt">
      <DemoOutsideShell imageId="classboard" backLabel="← Demos hub" />
      <header className="classboard-top">
        <div>
          <p className="demo-badge">Admin · {session?.name} ({role})</p>
          <h1>Backend management</h1>
          <p className="demo-sub">
            Schedule, payments, risk notes, legal copy, subscriber email, reminders, substitutes, and
            public site text — all simulated until Firebase lands.
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
                if (confirm('Reset all simulated data to seed?')) {
                  resetSimStore()
                  refresh()
                }
              }}
            >
              Reset demo data
            </button>
          ) : null}
        </div>
      </header>

      <div className="admin-tabs" role="tablist">
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
        <div className="classboard-deck demo-enter schedule-cal-layout">
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
                <h3>
                  Edit · {selectedOccType.name} · {selectedOcc.dayLabel} {selectedOcc.time}
                </h3>
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
                  </>
                ) : (
                  <p>{selected.longDescription}</p>
                )}
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
                      <label key={ex.id} className={`exercise-check${on ? ' on' : ''}`}>
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => {
                            toggleExercise(selected.id, ex.id)
                            refresh()
                          }}
                        />
                        {ex.name}
                      </label>
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
        <section className="yacht-panel demo-enter">
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
        <section className="yacht-panel demo-enter">
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
        <section className="yacht-panel demo-enter">
          <h2>Legal &amp; payment instructions</h2>
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
        <section className="yacht-panel demo-enter">
          <h2>Email all subscribers</h2>
          <p className="hint">Simulated outbox — no real email is sent.</p>
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
        <section className="yacht-panel demo-enter">
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
        <section className="yacht-panel demo-enter">
          <h2>Team &amp; substitutes</h2>
          <p className="hint">
            Cover logins ({DEMO_CREDENTIALS[2].email}) keep the board running when Tom is away.
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
        <section className="yacht-panel demo-enter">
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

      <section className="yacht-panel roadmap-panel">
        <h2>Coming next in trainer admin</h2>
        <p className="hint">Capability roadmap items that belong on the ops side.</p>
        <ul className="roadmap-list">
          {ADMIN_ROADMAP.map((item) => (
            <li key={item.id}>
              <strong>{item.title}</strong>
              <p>{item.blurb}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
