import {
  WEEKDAYS,
  classTypeById,
  spotsLeft,
  type ClassOccurrence,
  type Weekday,
} from '../shared/fitnessStudio'

export interface WeekSessionCalendarProps {
  byDay: Record<Weekday, ClassOccurrence[]>
  selectedId?: string | null
  heldIds?: string[]
  onSelect?: (id: string) => void
  /** Admin: highlight days that have sessions (always on when sessions exist). */
  mode?: 'member' | 'admin'
  className?: string
}

/** Mon–Fri grid with session name badges and times. */
export function WeekSessionCalendar({
  byDay,
  selectedId,
  heldIds = [],
  onSelect,
  mode = 'member',
  className,
}: WeekSessionCalendarProps) {
  return (
    <div className={`week-cal ${className ?? ''}`} role="grid" aria-label="Weekly class calendar">
      <div className="week-cal__head" role="row">
        {WEEKDAYS.map((d) => (
          <div key={d} className="week-cal__day-label" role="columnheader">
            {d}
          </div>
        ))}
      </div>
      <div className="week-cal__body" role="row">
        {WEEKDAYS.map((d) => {
          const sessions = byDay[d] ?? []
          const hasSessions = sessions.length > 0
          return (
            <div
              key={d}
              className={`week-cal__cell${hasSessions ? ' has-sessions' : ''}`}
              role="gridcell"
            >
              {sessions.length === 0 ? (
                <p className="week-cal__empty">—</p>
              ) : (
                sessions.map((o) => {
                  const type = classTypeById(o.classTypeId)
                  const left = spotsLeft(o)
                  const full = left === 0
                  const held = heldIds.includes(o.id)
                  const selected = selectedId === o.id
                  return (
                    <button
                      key={o.id}
                      type="button"
                      className={`week-cal__badge${selected ? ' is-selected' : ''}${held ? ' is-held' : ''}${full ? ' is-full' : ''}`}
                      onClick={() => onSelect?.(o.id)}
                      title={`${type?.name ?? 'Class'} ${o.time}${full ? ' (full)' : ` · ${left} left`}`}
                    >
                      <span className="week-cal__time">{o.time}</span>
                      <span className="week-cal__name">{type?.name ?? 'Class'}</span>
                      {mode === 'member' ? (
                        <span className="week-cal__fill">
                          {full ? 'Full' : `${o.bookedCount}/${type?.cap ?? '—'}`}
                        </span>
                      ) : (
                        <span className="week-cal__fill">
                          {o.bookedCount}/{type?.cap ?? '—'}
                        </span>
                      )}
                    </button>
                  )
                })
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
