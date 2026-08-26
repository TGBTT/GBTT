import {
  WEEKDAYS,
  classTypeById,
  formatSessionAttending,
  sessionIsFull,
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
  const className = `week-cal__badge${selected ? ' is-selected' : ''}${held ? ' is-held' : ''}${full ? ' is-full' : ''}`
  const title = `${type?.name ?? 'Class'} ${occ.time}${full ? ' (full)' : ` · ${attending}`}`

  const body = (
    <>
      <span className="week-cal__time">{occ.time}</span>
      <span className="week-cal__name">{type?.name ?? 'Class'}</span>
      <span className="week-cal__fill">{full && mode === 'public' ? 'Full' : attending}</span>
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

/** Mon–Fri grid with session name badges, times, and attending counts. */
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
                sessions.map((o) => (
                  <SessionBadge
                    key={o.id}
                    occ={o}
                    mode={mode}
                    selected={selectedId === o.id}
                    held={heldIds.includes(o.id)}
                    onSelect={onSelect}
                  />
                ))
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
