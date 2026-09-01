/**
 * Admin editor for seasons and holiday closures.
 *
 * A season is just a date range with closures carved out of it, which is what
 * lets the same screen describe an eight-week term, a short summer block or a
 * full year without any of those being special-cased. The season drives two
 * things at once: which sessions exist, and what a member is billed for.
 */

import { useEffect, useMemo, useState } from 'react'
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
import { DateField } from '@gbtt/shared/studio/DateField'
import {
  NZ_TERM_SOURCE,
  isEstimatedTermYear,
  nzSchoolTermSeasons,
  nzTermYearOptions,
  type NzTermProposal,
} from '@gbtt/shared/studio/nzSchoolTerms'

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

  // Published years first, then a few estimated ones. The default is the
  // earliest still ahead of us, which is the year most likely being set up.
  const termYears = useMemo(() => nzTermYearOptions(), [])
  const [termYear, setTermYear] = useState(() => termYears[0]?.year ?? new Date().getFullYear())
  const [termMode, setTermMode] = useState<SeasonBillingMode>('arrears')
  const [proposal, setProposal] = useState<NzTermProposal[] | null>(null)
  const [excluded, setExcluded] = useState<string[]>([])

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
    if (dryRun) {
      setNote(
        `Dry run: ${res.created} session${res.created === 1 ? '' : 's'} across ${res.teachingDays} teaching days, ${res.archived} to archive. Nothing written.`,
      )
      return
    }

    // The seat and invite counts matter as much as the session count: they are
    // what tells Tom the members on a weekly slot actually got the new weeks.
    setNote(
      `${res.created} created, ${res.updated} updated, ${res.archived} archived across ${res.teachingDays} teaching days.` +
        (res.seatsFilled
          ? ` ${res.seatsFilled} seat${res.seatsFilled === 1 ? '' : 's'} filled for ${res.membersUpdated} member${res.membersUpdated === 1 ? '' : 's'} on a weekly slot, and their calendar invites were re-sent.`
          : ' No weekly slots needed seats.') +
        (res.calendarFailed
          ? ` ${res.calendarFailed} session${res.calendarFailed === 1 ? '' : 's'} did not reach the shared calendar — run this again to retry.`
          : ''),
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
   * Draw up the four school terms for a year, without saving anything.
   *
   * Nothing is written until the drafts are confirmed, so Tom can see what the
   * year would look like — including which public holidays land mid-term — and
   * change it before any of it becomes real.
   */
  const previewSchoolTerms = () => {
    setError(null)
    setNote(null)
    const next = nzSchoolTermSeasons(termYear, termMode)
    // Summer arrives unticked: whether the studio trades through it is Tom's
    // call, and the school calendar cannot answer it.
    setExcluded(next.filter((p) => p.optional).map((p) => p.season.id))
    setProposal(next)
  }

  const editProposal = (id: string, patch: Partial<LiveSeason>) => {
    setProposal((current) =>
      (current ?? []).map((p) =>
        p.season.id === id ? { ...p, season: { ...p.season, ...patch } } : p,
      ),
    )
  }

  /**
   * Save the terms that were kept.
   *
   * Saved one at a time rather than in a batch so a term with a problem — a
   * date that ended up before its start, say — names itself instead of taking
   * the other three down with it.
   */
  const createSchoolTerms = async () => {
    const wanted = (proposal ?? []).filter((p) => !excluded.includes(p.season.id))
    if (!wanted.length) {
      setError('Every term is unticked, so there is nothing to create.')
      return
    }

    setBusy(true)
    setError(null)
    const failures: string[] = []
    for (const { season } of wanted) {
      const err = await saveSeason(season)
      if (err) failures.push(`${season.name}: ${err}`)
    }
    setBusy(false)

    if (failures.length) {
      setError(failures.join(' · '))
      return
    }

    setProposal(null)
    setNote(
      `Created ${wanted.length} season${wanted.length === 1 ? '' : 's'} for ${termYear}. Nothing is scheduled yet — press Generate sessions on each one when the timetable for it is right.`,
    )
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

      <div className="season-terms">
        <h3>Start from the New Zealand school terms</h3>
        <p className="hint">
          The studio year follows the school year, so a whole year can be drawn up from the
          published term dates and then edited. Public holidays that fall mid-term come through as
          closures; the shorter school holidays between terms need none, since they sit outside
          every term. The long summer gap is offered as a fifth season, unticked — sessions are
          only generated inside a season, so leaving it off is how the studio closes for summer.
          Nothing is saved until you confirm.
        </p>

        <div className="season-terms__controls">
          <label className="field">
            Year
            <select
              value={termYear}
              disabled={busy}
              onChange={(e) => {
                setTermYear(Number(e.target.value))
                setProposal(null)
              }}
            >
              {termYears.map((y) => (
                <option key={y.year} value={y.year}>
                  {y.year}
                  {y.estimated ? ' (estimated)' : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Charge each term
            <select
              value={termMode}
              disabled={busy}
              onChange={(e) => {
                const mode = e.target.value as SeasonBillingMode
                setTermMode(mode)
                setProposal((current) =>
                  (current ?? []).map((p) => ({ ...p, season: { ...p.season, billingMode: mode } })),
                )
              }}
            >
              {BILLING_MODES.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn ghost" disabled={busy} onClick={previewSchoolTerms}>
            {proposal ? 'Start again' : `Draw up ${termYear}`}
          </button>
        </div>

        {proposal && isEstimatedTermYear(termYear) ? (
          <p className="hint season-terms__estimate">
            <strong>{termYear} has not been gazetted yet.</strong> These dates are worked out from
            the shape of the last published year, so treat the term boundaries as a starting point
            and check them against education.govt.nz before generating sessions. The public
            holidays are exact — Easter, Anzac, Labour Day and the rest follow fixed rules, and
            Matariki is legislated years ahead.
          </p>
        ) : null}

        {proposal ? (
          <>
            <ul className="season-terms__list">
              {proposal.map(({ season, note: termNote }) => {
                const already = state.seasons.some((s) => s.id === season.id)
                const keep = !excluded.includes(season.id)
                return (
                  <li key={season.id} className={`season-term${keep ? '' : ' is-excluded'}`}>
                    <label className="exercise-check">
                      <input
                        type="checkbox"
                        checked={keep}
                        disabled={busy}
                        onChange={(e) =>
                          setExcluded((current) =>
                            e.target.checked
                              ? current.filter((id) => id !== season.id)
                              : [...current, season.id],
                          )
                        }
                      />
                      <strong>{season.name}</strong>
                    </label>

                    <div className="season-term__dates">
                      <label className="field">
                        Starts
                        <DateField
                          value={season.startDate}
                          disabled={busy || !keep}
                          ariaLabel={`${season.name} starts`}
                          onChange={(startDate) => editProposal(season.id, { startDate })}
                        />
                      </label>
                      <label className="field">
                        Ends
                        <DateField
                          value={season.endDate}
                          disabled={busy || !keep}
                          ariaLabel={`${season.name} ends`}
                          onChange={(endDate) => editProposal(season.id, { endDate })}
                        />
                      </label>
                    </div>

                    <p className="hint">
                      {countTeachingDays(season)} teaching days
                      {season.breaks.length
                        ? ` · closed for ${season.breaks.map((b) => b.label).join(', ')}`
                        : ' · no public holidays mid-term'}
                    </p>
                    {termNote ? <p className="hint">{termNote}</p> : null}
                    {already ? (
                      <p className="hint">
                        A season with this id already exists — confirming will overwrite its dates
                        and closures.
                      </p>
                    ) : null}
                  </li>
                )
              })}
            </ul>

            <div className="btn-row">
              <button
                type="button"
                className="btn primary"
                disabled={busy}
                onClick={createSchoolTerms}
              >
                Create these seasons
              </button>
              <button
                type="button"
                className="btn ghost"
                disabled={busy}
                onClick={() => setProposal(null)}
              >
                Discard
              </button>
            </div>
            <p className="hint">
              Each term can be opened below afterwards to add closures of your own — a week away, a
              hall booking — on the calendar. Source: {NZ_TERM_SOURCE}
            </p>
          </>
        ) : null}
      </div>

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
        <div className="field">
          <span>Starts</span>
          <DateField
            ariaLabel="Season start date"
            value={draft.startDate}
            max={draft.endDate || undefined}
            onChange={(startDate) => setDraft({ ...draft, startDate })}
          />
        </div>
        <div className="field">
          <span>Ends</span>
          <DateField
            ariaLabel="Season end date"
            value={draft.endDate}
            min={draft.startDate || undefined}
            onChange={(endDate) => setDraft({ ...draft, endDate })}
          />
        </div>

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
              <div className="field">
                <span>From</span>
                <DateField
                  ariaLabel="Closure start date"
                  value={b.startDate}
                  min={draft.startDate || undefined}
                  max={b.endDate || draft.endDate || undefined}
                  onChange={(startDate) => setBreak(i, { startDate })}
                />
              </div>
              <div className="field">
                <span>To</span>
                <DateField
                  ariaLabel="Closure end date"
                  value={b.endDate}
                  min={b.startDate || draft.startDate || undefined}
                  max={draft.endDate || undefined}
                  onChange={(endDate) => setBreak(i, { endDate })}
                />
              </div>
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
