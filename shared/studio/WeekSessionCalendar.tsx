import { Fragment, useMemo } from 'react'
import {
  WEEKDAYS,
  classTypeById,
  formatSessionAttending,
  formatTimetableTime,
  sessionIsFull,
  timetableTimes,
  type ClassOccurrence,
  type Weekday,
} from './fitnessStudio'

export interface WeekSessionCalendarProps {
  byDay: Record<Weekday, ClassOccurrence[]>
  selectedId?: string | null
  heldIds?: string[]
  onSelect?: (id: string) => void
  /** public = read-only on marketing site; member/admin = interactive booking or editing */
  mode?: 'public' | 'member' | 'admin'
  className?: string
}

function SessionBadge({
  occ,
  mode,
  selected,
  held,
  onSelect,
}: {
  occ: ClassOccurrence
  mode: 'public' | 'member' | 'admin'
  selected: boolean
  held: boolean
  onSelect?: (id: string) => void
}) {
  const type = classTypeById(occ.classTypeId)
  const full = sessionIsFull(occ)
  const attending = formatSessionAttending(occ)
  const className = `week-cal__badge${selected ? ' is-selected' : ''}${held ? ' is-held is-locked' : ''}${full ? ' is-full' : ''}`
  const title = `${type?.name ?? 'Class'} · ${formatTimetableTime(occ.time)}${held ? ' (weekly locked)' : ''}${full ? ' (full)' : ` · ${attending}`}`

  const body = (
    <>
      <span className="week-cal__name">{type?.name ?? 'Class'}</span>
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
  selectedId,
  heldIds = [],
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
    <div className={`week-cal ${className ?? ''}`} role="grid" aria-label="Weekly class timetable">
      <div className="week-cal__grid">
        <div className="week-cal__corner" aria-hidden="true" />
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
                  aria-label={occ ? `${day} ${formatTimetableTime(time)}` : undefined}
                >
                  {occ ? (
                    <SessionBadge
                      occ={occ}
                      mode={mode}
                      selected={selectedId === occ.id}
                      held={heldIds.includes(occ.id)}
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
  )
}
