/**
 * Month calendar for picking holiday closures.
 *
 * Closures are what overrule the recurring timetable: a class marked as
 * running every week still produces no session on a closed day. Typing two
 * dates into a pair of inputs gives no sense of which weeks that actually
 * removes, so the same dates are shown as a month grid where a day can be
 * clicked closed or open, and a run of days dragged out as a range.
 */

import { useMemo, useState } from 'react'
import type { SeasonBreak } from './firebase/liveSeasons'

const pad = (n: number) => String(n).padStart(2, '0')

/** `YYYY-MM-DD` in local time; the same key format seasons are stored with. */
export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function parseDayKey(key: string): Date | null {
  const [y, m, d] = key.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

/** Move a day key by whole days, rolling over month and year ends. */
export function shiftDayKey(key: string, days: number): string {
  const date = parseDayKey(key)
  if (!date) return key
  date.setDate(date.getDate() + days)
  return dayKey(date)
}

export function breakCovering(breaks: SeasonBreak[], key: string): SeasonBreak | undefined {
  return breaks.find((b) => b.startDate && b.endDate && key >= b.startDate && key <= b.endDate)
}

const MONTH_LABEL = new Intl.DateTimeFormat('en-NZ', { month: 'long', year: 'numeric' })
const DAY_HEADS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

interface SeasonCalendarProps {
  /** Season span; days outside it are shown greyed, since nothing runs there. */
  startDate: string
  endDate: string
  breaks: SeasonBreak[]
  /** Toggle a single day closed or open. */
  onToggleDay: (key: string) => void
  /** Close a whole run of days, both ends included. */
  onCloseRange: (startKey: string, endKey: string) => void
}

export function SeasonCalendar({
  startDate,
  endDate,
  breaks,
  onToggleDay,
  onCloseRange,
}: SeasonCalendarProps) {
  // The season start is the month worth opening on, but an unsaved season has
  // no dates yet, so this month is the fallback.
  const [monthAnchor, setMonthAnchor] = useState(
    () => parseDayKey(startDate) ?? new Date(),
  )
  const [mode, setMode] = useState<'day' | 'range'>('day')
  const [pendingStart, setPendingStart] = useState<string | null>(null)

  const year = monthAnchor.getFullYear()
  const month = monthAnchor.getMonth()

  /*
   * Six weeks of cells always, so the grid does not change height as months
   * are stepped through. The leading days come from the previous month:
   * getDay() is Sunday-based and this grid starts on Monday.
   */
  const cells = useMemo(() => {
    const first = new Date(year, month, 1)
    const lead = (first.getDay() + 6) % 7
    return Array.from({ length: 42 }, (_, i) => {
      const date = new Date(year, month, 1 - lead + i)
      return { key: dayKey(date), date, inMonth: date.getMonth() === month }
    })
  }, [year, month])

  const stepMonth = (delta: number) => {
    setMonthAnchor(new Date(year, month + delta, 1))
  }

  const click = (key: string) => {
    if (mode === 'day') {
      onToggleDay(key)
      return
    }
    if (!pendingStart) {
      setPendingStart(key)
      return
    }
    // Dragging backwards is the same intent as dragging forwards.
    const [from, to] = pendingStart <= key ? [pendingStart, key] : [key, pendingStart]
    setPendingStart(null)
    onCloseRange(from, to)
  }

  return (
    <div className="season-cal">
      <div className="season-cal__bar">
        <button type="button" className="btn ghost" onClick={() => stepMonth(-1)}>
          ‹ Previous
        </button>
        <strong className="season-cal__month">{MONTH_LABEL.format(new Date(year, month, 1))}</strong>
        <button type="button" className="btn ghost" onClick={() => stepMonth(1)}>
          Next ›
        </button>
      </div>

      <div className="season-cal__modes" role="group" aria-label="What a click does">
        <button
          type="button"
          className={`chip${mode === 'day' ? ' selected' : ''}`}
          onClick={() => {
            setMode('day')
            setPendingStart(null)
          }}
        >
          Single day
        </button>
        <button
          type="button"
          className={`chip${mode === 'range' ? ' selected' : ''}`}
          onClick={() => setMode('range')}
        >
          Date range
        </button>
        {mode === 'range' ? (
          <span className="hint">
            {pendingStart
              ? `From ${pendingStart} — click the last day.`
              : 'Click the first day of the closure.'}
          </span>
        ) : (
          <span className="hint">Click a day to close it, click it again to reopen it.</span>
        )}
      </div>

      <div className="season-cal__grid">
        {DAY_HEADS.map((d) => (
          <div key={d} className="season-cal__head">
            {d}
          </div>
        ))}
        {cells.map((cell) => {
          const closure = breakCovering(breaks, cell.key)
          const weekend = cell.date.getDay() === 0 || cell.date.getDay() === 6
          const outside = Boolean(
            (startDate && cell.key < startDate) || (endDate && cell.key > endDate),
          )
          const classes = [
            'season-cal__day',
            cell.inMonth ? '' : 'is-other-month',
            closure ? 'is-closed' : '',
            weekend ? 'is-weekend' : '',
            outside ? 'is-outside' : '',
            pendingStart === cell.key ? 'is-pending' : '',
          ]
            .filter(Boolean)
            .join(' ')

          return (
            <button
              key={cell.key}
              type="button"
              className={classes}
              aria-pressed={Boolean(closure)}
              title={
                closure
                  ? `${closure.label || 'Closed'} · ${closure.startDate} → ${closure.endDate}`
                  : outside
                    ? 'Outside the season dates'
                    : weekend
                      ? 'No classes at the weekend'
                      : 'Open'
              }
              onClick={() => click(cell.key)}
            >
              <span className="season-cal__date">{cell.date.getDate()}</span>
              {closure ? (
                <span className="season-cal__tag">{closure.label || 'Closed'}</span>
              ) : null}
            </button>
          )
        })}
      </div>

      <ul className="season-cal__legend">
        <li>
          <span className="season-cal__swatch is-closed" /> Closed — no sessions
        </li>
        <li>
          <span className="season-cal__swatch is-weekend" /> Weekend — never runs
        </li>
        <li>
          <span className="season-cal__swatch is-outside" /> Outside the season
        </li>
      </ul>
    </div>
  )
}
