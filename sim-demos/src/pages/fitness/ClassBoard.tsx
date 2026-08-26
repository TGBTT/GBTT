import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { DemoOutsideShell } from '../../components/DemoChrome'
import {
  DEMO_CREDENTIALS,
  addExercise,
  addReminder,
  classTypeById,
  getClassTypes,
  getEquipmentChecked,
  getExercises,
  getOccurrences,
  getOutbox,
  getReminders,
  getSessionRole,
  getSessionUser,
  getSiteContent,
  getTeam,
  getUsers,
  login,
  logout,
  resetSimStore,
  sendSubscriberEmail,
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
  updateSiteContent,
  updateTeamMember,
  upsertOccurrence,
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
 * Admin console — simulated login; substitute gets restricted tabs.
 */
export default function ClassBoard() {
  const [, setTick] = useState(0)
  const refresh = () => setTick((n) => n + 1)

  const role = getSessionRole()
  const session = getSessionUser()
  const staff = role === 'admin' || role === 'substitute'

  const [email, setEmail] = useState('tom@gbtt')
  const [password, setPassword] = useState('demo')
  const [loginError, setLoginError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('schedule')
  const [selectedTypeId, setSelectedTypeId] = useState(getClassTypes()[0]?.id ?? 'sweat')
  const [newExercise, setNewExercise] = useState('')
  const [mailSubject, setMailSubject] = useState('GBTT timetable update')
  const [mailBody, setMailBody] = useState('Hi team — here’s this week’s schedule.')
  const [remTitle, setRemTitle] = useState('')
  const [newOccDay, setNewOccDay] = useState('Mon')
  const [newOccTime, setNewOccTime] = useState('07:00')

  const classes = getClassTypes()
  const occurrences = getOccurrences()
  const exercises = getExercises()
  const users = getUsers().filter((u) => u.role === 'member')
  const site = getSiteContent()
  const team = getTeam()
  const reminders = getReminders()
  const outbox = getOutbox()
  const equipment = getEquipmentChecked()
  const sync = useMemo(() => syncLabels(), [tab, selectedTypeId])
  const selected = classTypeById(selectedTypeId)
  const typeOccs = occurrences.filter((o) => o.classTypeId === selectedTypeId)

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

      {tab === 'schedule' && selected && (
        <div className="classboard-deck demo-enter">
          <aside className="classboard-schedule">
            <h2>Fill &amp; schedule</h2>
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
            {typeOccs.map((o) => {
              const type = classTypeById(o.classTypeId)
              if (!type) return null
              const left = spotsLeft(o)
              const fill = Math.min(100, Math.round((o.bookedCount / type.cap) * 100))
              const fillLevel =
                left === 0 || fill >= 100
                  ? 'fill-full'
                  : fill >= 85
                    ? 'fill-critical'
                    : fill >= 60
                      ? 'fill-warn'
                      : 'fill-ok'
              return (
                <article key={o.id} className="class-fill-card">
                  <header>
                    <strong>
                      {o.time} · {o.dayLabel}
                    </strong>
                    <span>
                      {o.bookedCount}/{type.cap}
                    </span>
                  </header>
                  <div className={`fill-bar ${fillLevel}`} aria-hidden="true">
                    <span style={{ width: `${fill}%` }} />
                  </div>
                  <label className="field">
                    Instructor / cover
                    <select
                      value={o.instructorId}
                      onChange={(e) => {
                        setOccurrenceInstructor(o.id, e.target.value)
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
                  <p className="roster-line">
                    Roster:{' '}
                    {o.roster.length
                      ? o.roster.map((r) => `${r.displayName}${r.kind === 'guest' ? ' *' : ''}`).join(', ')
                      : 'None yet'}
                  </p>
                </article>
              )
            })}
            {role === 'admin' ? (
              <div className="add-occ-row">
                <h3>Add occurrence</h3>
                <input value={newOccDay} onChange={(e) => setNewOccDay(e.target.value)} aria-label="Day" />
                <input value={newOccTime} onChange={(e) => setNewOccTime(e.target.value)} aria-label="Time" />
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => {
                    upsertOccurrence({
                      classTypeId: selectedTypeId,
                      dayLabel: newOccDay,
                      time: newOccTime,
                    })
                    refresh()
                  }}
                >
                  Add to schedule
                </button>
              </div>
            ) : null}
          </aside>
          <aside className="classboard-side">
            <section>
              <h2>Class type</h2>
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
                Cap
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
                        disabled={role !== 'admin' && role !== 'substitute'}
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
                <label key={item.id} className={`exercise-check${equipment.includes(item.id) ? ' on' : ''}`}>
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
        </div>
      )}

      {tab === 'members' && (
        <section className="yacht-panel demo-enter">
          <h2>Members &amp; payments</h2>
          <ul className="admin-member-list">
            {users.map((u) => (
              <li key={u.id}>
                <strong>{u.name}</strong> · {u.email} · {u.planId}
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
    </div>
  )
}
