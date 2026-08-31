/**
 * Admin editor for seasons and holiday closures.
 *
 * A season is just a date range with closures carved out of it, which is what
 * lets the same screen describe an eight-week term, a short summer block or a
 * full year without any of those being special-cased. The season drives two
 * things at once: which sessions exist, and what a member is billed for.
 */

import { useEffect, useState } from 'react'
import {
  countTeachingDays,
  deleteSeason,
  saveSeason,
  subscribeSeasons,
  type LiveSeason,
  type LiveSeasonsState,
  type SeasonBillingMode,
} from '@gbtt/shared/studio/firebase/liveSeasons'
import { studioGenerateSeasonSessions } from '@gbtt/shared/studio/studioAuth'
import {
  SeasonCalendar,
  breakCovering,
  shiftDayKey,
} from '@gbtt/shared/studio/SeasonCalendar'

const BLANK: LiveSeason = {
  id: '',
  name: '',
  startDate: '',
  endDate: '',
  billingMode: 'arrears',
  breaks: [],
}

const BILLING_MODES: { id: SeasonBillingMode; label: string; blurb: string }[] = [
  {
    id: 'arrears',
    label: 'Rolling — bill for what was booked',
    blurb:
      'Totals the seats held once the season has run. Holidays need no adjustment: a closed week creates no sessions, so nothing is charged.',
  },
  {
    id: 'upfront',
    label: 'Upfront — quote the whole season',
    blurb:
      'Quotes and invoices the full season when a member enrols, counted from the sessions their locked slots will produce.',
  },
]

export function SeasonsPanel() {
  const [state, setState] = useState<LiveSeasonsState>({ status: 'loading', seasons: [] })
  const [draft, setDraft] = useState<LiveSeason>(BLANK)
  const [editingExisting, setEditingExisting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => subscribeSeasons(setState), [])

  const edit = (season: LiveSeason) => {
    setDraft({ ...season, breaks: season.breaks.map((b) => ({ ...b })) })
    setEditingExisting(true)
    setError(null)
    setNote(null)
  }

  const startNew = () => {
    setDraft(BLANK)
    setEditingExisting(false)
    setError(null)
    setNote(null)
  }

  const save = async () => {
    setBusy(true)
    const err = await saveSeason(draft)
    setBusy(false)
    setError(err)
    if (!err) {
      setNote(`Saved ${draft.name}.`)
      setEditingExisting(true)
    }
  }

  const generate = async (seasonId: string, dryRun: boolean) => {
    setBusy(true)
    setError(null)
    const res = await studioGenerateSeasonSessions(seasonId, dryRun)
    setBusy(false)
    if (res.error) {
      setError(res.error)
      return
    }
    setNote(
      dryRun
        ? `Dry run: ${res.created} session${res.created === 1 ? '' : 's'} across ${res.teachingDays} teaching days, ${res.archived} to archive. Nothing written.`
        : `${res.created} created, ${res.updated} updated, ${res.archived} archived across ${res.teachingDays} teaching days.`,
    )
  }

  const remove = async (season: LiveSeason) => {
    if (
      !confirm(
        `Delete the season "${season.name}"?\n\nSessions already generated from it are kept, along with their rosters and attendance. Archive those from the sessions tab if they should stop running.`,
      )
    ) {
      return
    }
    setBusy(true)
    const err = await deleteSeason(season.id)
    setBusy(false)
    setError(err)
    if (!err) {
      setNote(`Deleted ${season.name}.`)
      startNew()
    }
  }

  const setBreak = (index: number, patch: Partial<LiveSeason['breaks'][number]>) => {
    setDraft((d) => ({
      ...d,
      breaks: d.breaks.map((b, i) => (i === index ? { ...b, ...patch } : b)),
    }))
  }

  /**
   * Close or reopen one day from the calendar.
   *
   * Reopening a day inside a longer closure splits that closure around it
   * rather than deleting the whole thing — clicking one day of the school
   * holidays should not reopen the fortnight.
   */
  const toggleClosedDay = (key: string) => {
    setNote(null)
    const covering = breakCovering(draft.breaks, key)
    if (!covering) {
      setDraft((d) => ({
        ...d,
        breaks: [...d.breaks, { label: 'Closed', startDate: key, endDate: key }],
      }))
      return
    }

    setDraft((d) => ({
      ...d,
      breaks: d.breaks.flatMap((b) => {
        if (b !== covering) return [b]
        const before =
          b.startDate < key ? [{ ...b, endDate: shiftDayKey(key, -1) }] : []
        const after = b.endDate > key ? [{ ...b, startDate: shiftDayKey(key, 1) }] : []
        return [...before, ...after]
      }),
    }))
  }

  /** Close a run of days picked out on the calendar as one closure. */
  const closeRange = (startKey: string, endKey: string) => {
    setNote(null)
    setDraft((d) => ({
      ...d,
      breaks: [...d.breaks, { label: 'Closed', startDate: startKey, endDate: endKey }],
    }))
  }

  const teachingDays = countTeachingDays(draft)

  if (state.status === 'unavailable') {
    return (
      <section className="yacht-panel app-enter app-section">
        <h2>Seasons &amp; holidays</h2>
        <p className="hint">
          Seasons are stored in Firestore. Configure Firebase to define term dates and closures.
        </p>
      </section>
    )
  }

  return (
    <section className="yacht-panel app-enter app-section">
      <h2>Seasons &amp; holidays</h2>
      <p className="hint">
        A season sets the dates the studio runs and the holidays it closes for. It decides which
        sessions exist and what members are charged, so an eight-week term, a short summer block and
        a full year are all just different dates here.
      </p>

      {error ? <p className="form-error">{error}</p> : null}
      {note ? <p className="form-success">{note}</p> : null}
      {state.status === 'error' ? (
        <p className="form-error">Could not load seasons: {state.error}</p>
      ) : null}

      <div className="season-list">
        <h3>Seasons</h3>
        {state.status === 'loading' ? <p className="hint">Loading…</p> : null}
        {state.status === 'ready' && !state.seasons.length ? (
          <p className="hint">No seasons defined yet. Create the first one below.</p>
        ) : null}
        <ul className="admin-session-list">
          {state.seasons.map((s) => (
            <li key={s.id}>
              <span>
                <strong>{s.name}</strong> · {s.startDate} → {s.endDate}
                <br />
                <span className="hint">
                  {countTeachingDays(s)} teaching days ·{' '}
                  {s.billingMode === 'upfront' ? 'billed upfront' : 'billed in arrears'}
                  {s.breaks.length
                    ? ` · ${s.breaks.length} closure${s.breaks.length === 1 ? '' : 's'}`
                    : ''}
                </span>
              </span>
              <span className="btn-row">
                <button type="button" className="btn ghost" onClick={() => edit(s)}>
                  Edit
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={busy}
                  onClick={() => generate(s.id, true)}
                >
                  Preview
                </button>
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy}
                  onClick={() => generate(s.id, false)}
                >
                  Generate sessions
                </button>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="season-editor">
        <h3>{editingExisting ? `Edit ${draft.name || draft.id}` : 'New season'}</h3>

        <label className="field">
          Id
          <input
            value={draft.id}
            disabled={editingExisting}
            placeholder="2026-term-1"
            onChange={(e) => setDraft({ ...draft, id: e.target.value })}
          />
        </label>
        <label className="field">
          Name
          <input
            value={draft.name}
            placeholder="Term 1, 2026"
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </label>
        <label className="field">
          Starts
          <input
            type="date"
            value={draft.startDate}
            onChange={(e) => setDraft({ ...draft, startDate: e.target.value })}
          />
        </label>
        <label className="field">
          Ends
          <input
            type="date"
            value={draft.endDate}
            onChange={(e) => setDraft({ ...draft, endDate: e.target.value })}
          />
        </label>

        <fieldset className="season-mode">
          <legend>How this season is charged</legend>
          {BILLING_MODES.map((mode) => (
            <label key={mode.id} className="season-mode-option">
              <input
                type="radio"
                name="billingMode"
                checked={draft.billingMode === mode.id}
                onChange={() => setDraft({ ...draft, billingMode: mode.id })}
              />
              <span>
                <strong>{mode.label}</strong>
                <span className="hint">{mode.blurb}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <div className="season-breaks">
          <h4>Holiday closures</h4>
          <p className="hint">
            No sessions run on these dates. Both ends are included, and a closure covering part of a
            week only removes the days it covers. A closure overrules the recurring timetable: a
            class set to run every week still produces nothing on a closed day.
          </p>

          {/* Remounts when a different season is opened so the grid jumps to
              that season's first month rather than staying where it was. */}
          <SeasonCalendar
            key={`${draft.id}-${draft.startDate}`}
            startDate={draft.startDate}
            endDate={draft.endDate}
            breaks={draft.breaks}
            onToggleDay={toggleClosedDay}
            onCloseRange={closeRange}
          />
          <p className="hint">
            Closures picked here are named “Closed” — rename them below if it helps, and edit the
            exact dates there too. Nothing is written until you save the season.
          </p>
          {draft.breaks.map((b, i) => (
            <div key={i} className="season-break-row">
              <label className="field">
                Label
                <input
                  value={b.label}
                  placeholder="School holidays"
                  onChange={(e) => setBreak(i, { label: e.target.value })}
                />
              </label>
              <label className="field">
                From
                <input
                  type="date"
                  value={b.startDate}
                  onChange={(e) => setBreak(i, { startDate: e.target.value })}
                />
              </label>
              <label className="field">
                To
                <input
                  type="date"
                  value={b.endDate}
                  onChange={(e) => setBreak(i, { endDate: e.target.value })}
                />
              </label>
              <button
                type="button"
                className="link-button"
                onClick={() =>
                  setDraft({ ...draft, breaks: draft.breaks.filter((_, x) => x !== i) })
                }
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn ghost"
            onClick={() =>
              setDraft({
                ...draft,
                breaks: [...draft.breaks, { label: '', startDate: '', endDate: '' }],
              })
            }
          >
            Add a closure
          </button>
        </div>

        {draft.startDate && draft.endDate ? (
          <p className="hint season-summary">
            <strong>{teachingDays}</strong> teaching days after closures — roughly{' '}
            {Math.round((teachingDays / 5) * 10) / 10} weeks of the timetable.
          </p>
        ) : null}

        <div className="btn-row">
          <button type="button" className="btn primary" disabled={busy} onClick={save}>
            {editingExisting ? 'Save changes' : 'Create season'}
          </button>
          {editingExisting ? (
            <>
              <button type="button" className="btn ghost" onClick={startNew}>
                New season
              </button>
              <button
                type="button"
                className="btn ghost"
                disabled={busy}
                onClick={() => remove(draft)}
              >
                Delete
              </button>
            </>
          ) : null}
        </div>

        <p className="hint">
          After changing dates or closures, run <strong>Generate sessions</strong> for that season.
          New weekly classes already lay themselves across the term when they are added. Generate
          updates sessions in place and archives any that now fall inside a closure, so rosters and
          attendance are never lost.
        </p>
      </div>
    </section>
  )
}
