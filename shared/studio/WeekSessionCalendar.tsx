import { Fragment, useMemo } from 'react'
import {
  WEEKDAYS,
  formatSessionAttending,
  formatTimetableTime,
  sessionIsFull,
  timetableTimes,
  type ClassOccurrence,
  type Weekday,
} from './fitnessStudio'

export interface WeekSessionCalendarProps {
  byDay: Record<Weekday, ClassOccurrence[]>
  /**
   * Class names, keyed by class type id.
   *
   * Passed in rather than looked up: the catalogue is a Firestore
   * subscription, and this component is shared with the marketing site, which
   * should not be opening its own listener per badge.
   */
  classNames?: Record<string, string>
  selectedId?: string | null
  heldIds?: string[]
  /** Held via a recurring season lock on the slot. */
  seasonLockedIds?: string[]
  /** Held for this week only (included allowance, no recurring lock). */
  weekOnlyHeldIds?: string[]
  onSelect?: (id: string) => void
  /** public = read-only on marketing site; member/admin = interactive booking or editing */
  mode?: 'public' | 'member' | 'admin'
  className?: string
}

function SessionBadge({
  occ,
  name,
  mode,
  selected,
  held,
  seasonLocked,
  weekOnly,
  onSelect,
}: {
  occ: ClassOccurrence
  name: string
  mode: 'public' | 'member' | 'admin'
  selected: boolean
  held: boolean
  seasonLocked: boolean
  weekOnly: boolean
  onSelect?: (id: string) => void
}) {
  const full = sessionIsFull(occ)
  const attending = formatSessionAttending(occ)
  const heldNote = seasonLocked
    ? ' (every week this season)'
    : weekOnly
      ? ' (this week)'
      : held
        ? ' (held)'
        : ''
  const className = `week-cal__badge${selected ? ' is-selected' : ''}${held ? ' is-held' : ''}${seasonLocked ? ' is-locked' : ''}${weekOnly ? ' is-week-only' : ''}${full ? ' is-full' : ''}`
  const title = `${name} · ${formatTimetableTime(occ.time)}${heldNote}${full ? ' (full)' : ` · ${attending}`}`

  const body = (
    <>
      <span className="week-cal__name">{name}</span>
      {mode !== 'public' ? <span className="week-cal__fill">{attending}</span> : null}
      {mode === 'public' && full ? <span className="week-cal__fill">Full</span> : null}
    </>
  )

  if (mode === 'public') {
    return (
      <div className={className} title={title} aria-label={title}>
        {body}
      </div>
    )
  }

  return (
    <button
      type="button"
      className={className}
      onClick={() => onSelect?.(occ.id)}
      title={title}
      disabled={mode === 'member' && full && !held}
    >
      {body}
    </button>
  )
}

/** Mon–Fri timetable — days across the top, ascending times down the left. */
export function WeekSessionCalendar({
  byDay,
  classNames = {},
  selectedId,
  heldIds = [],
  seasonLockedIds = [],
  weekOnlyHeldIds = [],
  onSelect,
  mode = 'member',
  className,
}: WeekSessionCalendarProps) {
  const times = useMemo(() => timetableTimes(byDay), [byDay])
  const lookup = useMemo(() => {
    const map = new Map<string, ClassOccurrence>()
    for (const day of WEEKDAYS) {
      for (const occ of byDay[day] ?? []) map.set(`${day}|${occ.time}`, occ)
    }
    return map
  }, [byDay])

  return (
    <div className={`week-cal ${className ?? ''}`}>
      <div className="week-cal__scroll" tabIndex={0} aria-label="Weekly class timetable — swipe sideways on small screens">
        <div className="week-cal__matrix" role="grid">
          <div className="week-cal__corner" role="columnheader" aria-hidden="true" />
          {WEEKDAYS.map((d) => (
            <div key={d} className="week-cal__day-label" role="columnheader">
              {d}
            </div>
          ))}

          {times.map((time) => (
            <Fragment key={time}>
              <div className="week-cal__time-label" role="rowheader">
                {formatTimetableTime(time)}
              </div>
              {WEEKDAYS.map((day) => {
                const occ = lookup.get(`${day}|${time}`)
                return (
                  <div
                    key={`${day}-${time}`}
                    className={`week-cal__cell${occ ? ' has-session' : ''}`}
                    role="gridcell"
                  >
                    {occ ? (
                      <SessionBadge
                        occ={occ}
                        name={classNames[occ.classTypeId] ?? 'Class'}
                        mode={mode}
                        selected={selectedId === occ.id}
                        held={heldIds.includes(occ.id)}
                        seasonLocked={seasonLockedIds.includes(occ.id)}
                        weekOnly={weekOnlyHeldIds.includes(occ.id)}
                        onSelect={onSelect}
                      />
                    ) : null}
                  </div>
                )
              })}
            </Fragment>
          ))}
        </div>
      </div>
      <p className="week-cal__scroll-hint">Swipe sideways for the full Mon–Fri grid</p>
    </div>
  )
}
