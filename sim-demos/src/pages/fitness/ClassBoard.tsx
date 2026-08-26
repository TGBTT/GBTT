import { useState } from 'react'
import { Link } from 'react-router-dom'
import { DemoOutsideShell } from '../../components/DemoChrome'
import { DemoModeBar } from '../../components/DemoModeBar'
import { DemoPitchBar, DemoQuoteCta } from '../../components/DemoPitch'
import {
  addExercise,
  classTypeById,
  getClassTypes,
  getExercises,
  getOccurrences,
  setClassCap,
  spotsLeft,
  syncLabels,
  toggleExercise,
} from '../../shared/fitnessStudio'

const INSTRUCTORS = [
  { id: 'jess', name: 'Jess (lead)' },
  { id: 'tom', name: 'Tom' },
  { id: 'priya', name: 'Priya' },
  { id: 'cover', name: 'Cover pool' },
] as const

const EQUIPMENT_ITEMS = [
  { id: 'mats', label: 'Mats wiped down' },
  { id: 'weights', label: 'Weights re-racked' },
  { id: 'audio', label: 'Audio / mic tested' },
  { id: 'firstaid', label: 'First-aid kit checked' },
] as const

/**
 * Class Board — instructor ops: schedule, cap, roster, exercise catalog.
 */
export default function ClassBoard() {
  const [, setTick] = useState(0)
  const refresh = () => setTick((n) => n + 1)

  const classes = getClassTypes()
  const occurrences = getOccurrences()
  const exercises = getExercises()
  const [selectedTypeId, setSelectedTypeId] = useState(classes[0]?.id ?? 'strength')
  const [newExercise, setNewExercise] = useState('')
  const [locked, setLocked] = useState(false)
  const [substitutes, setSubstitutes] = useState<Record<string, string>>({})
  const [equipment, setEquipment] = useState<string[]>([])

  const toggleEquipment = (id: string) => {
    setEquipment((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const selected = classTypeById(selectedTypeId)
  const typeOccs = occurrences.filter((o) => o.classTypeId === selectedTypeId)
  const sync = syncLabels()

  if (locked && selected) {
    return (
      <div className="classboard-page theme-classboard">
        <div className="adventure-launch-ok demo-enter-success">
          <p className="demo-badge">Simulated · not a live calendar</p>
          <h1>Board saved</h1>
          <p>
            {selected.name} · cap {selected.cap} · {selected.exerciseIds.length} exercises
          </p>
          <p className="sync-chip">{sync.calendar}</p>
          <p className="sync-chip">{sync.firebase}</p>
          <DemoQuoteCta styleName="Class Board" />
          <button type="button" className="btn ghost" onClick={() => setLocked(false)}>
            Keep editing
          </button>
          <Link to="/" className="adventure-hub-link">
            ← All demos
          </Link>
        </div>
        <DemoPitchBar
          packageTier="advanced"
          compareTo="/fitness/studioflow"
          compareLabel="Studio Flow"
          engineNote="Instructor wall timetable vs member pack wallet — same packs, caps, and calendar check."
        />
      </div>
    )
  }

  return (
    <div className="classboard-page theme-classboard">
      <DemoOutsideShell imageId="classboard" />
      <DemoPitchBar
        packageTier="advanced"
        compareTo="/fitness/studioflow"
        compareLabel="Studio Flow"
        engineNote="Instructor wall timetable vs member pack wallet — same packs, caps, and calendar check."
      />
      <DemoModeBar
        clientTo="/fitness/studioflow"
        clientLabel="Client view"
        opsTo="/fitness/classboard"
        opsLabel="Admin view"
      />
      <header className="classboard-top">
        <div>
          <p className="demo-badge">Class Board · wall timetable</p>
          <h1>Wall timetable</h1>
          <p className="demo-sub">
            Fill bars are the job — see how full each class is, then set the cap and roster. Not a member wallet.
          </p>
        </div>
        <span className="demo-theme-tag">Class board</span>
      </header>

      <div className="classboard-deck demo-enter">
        <aside className="classboard-schedule">
          <h2>Fill bars</h2>
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
            const urgencyLabel =
              fillLevel === 'fill-full'
                ? 'Full'
                : fillLevel === 'fill-critical'
                  ? 'Almost full'
                  : fillLevel === 'fill-warn'
                    ? 'Filling up'
                    : 'Spots open'
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
                <p className={`fill-urgency ${fillLevel}`}>{urgencyLabel}</p>
                <p className="hint">{left === 0 ? 'Full — no more bookings' : `${left} spots left`}</p>
                <label className="field">
                  Substitute
                  <select
                    value={substitutes[o.id] ?? ''}
                    aria-label={`Substitute for ${o.time} ${o.dayLabel}`}
                    onChange={(e) =>
                      setSubstitutes((prev) => ({ ...prev, [o.id]: e.target.value }))
                    }
                  >
                    <option value="">Regular instructor</option>
                    {INSTRUCTORS.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="roster-line">
                  Attendees: {o.roster.length ? o.roster.join(', ') : 'None yet'}
                  {o.bookedCount > o.roster.length ? ` + ${o.bookedCount - o.roster.length} more` : ''}
                </p>
                <p className="sync-chip">Calendar event {o.calendarEventId}</p>
              </article>
            )
          })}
        </aside>

        {selected && (
          <aside className="classboard-side">
            <section>
              <h2>Class cap</h2>
              <p className="hint">Up to 27. Smaller rooms sit lower. Booking checks this number on the calendar.</p>
              <label className="field">
                Max people
                <input
                  type="number"
                  min={4}
                  max={27}
                  value={selected.cap}
                  onChange={(e) => {
                    setClassCap(selected.id, Number(e.target.value))
                    refresh()
                  }}
                />
              </label>
            </section>

            <section>
              <h2>Exercises this class</h2>
              <p className="hint">Tick the work for this template. Add a new movement to the studio list.</p>
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
              <div className="add-exercise-row">
                <input
                  value={newExercise}
                  onChange={(e) => setNewExercise(e.target.value)}
                  placeholder="e.g. Farmer carry"
                  aria-label="New exercise name"
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
            </section>

            <section className="checklist-panel">
              <h2>Equipment checklist</h2>
              <p className="hint">Tick before the first class of the day.</p>
              {EQUIPMENT_ITEMS.map((item) => (
                <label key={item.id} className={`exercise-check${equipment.includes(item.id) ? ' on' : ''}`}>
                  <input
                    type="checkbox"
                    checked={equipment.includes(item.id)}
                    onChange={() => toggleEquipment(item.id)}
                  />
                  {item.label}
                </label>
              ))}
            </section>

            <p className="sync-chip">{sync.firebase}</p>
            <button type="button" className="btn primary launch-btn" onClick={() => setLocked(true)}>
              Save board (demo)
            </button>
          </aside>
        )}
      </div>
    </div>
  )
}
