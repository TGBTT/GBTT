/**
 * Week stepper above the timetable grid.
 *
 * Admins step back to finish roll call for a class that has already run;
 * members step forward to rearrange commitments before the transfer window
 * closes. Past weeks are flagged so it is obvious the grid is history rather
 * than something still bookable.
 */

interface WeekNavigatorProps {
  label: string
  isCurrentWeek: boolean
  isPast: boolean
  onPrevious: () => void
  onNext: () => void
  onReset: () => void
  disabled?: boolean
}

export function WeekNavigator({
  label,
  isCurrentWeek,
  isPast,
  onPrevious,
  onNext,
  onReset,
  disabled = false,
}: WeekNavigatorProps) {
  return (
    <div className="week-nav">
      <button
        type="button"
        className="btn ghost week-nav-step"
        onClick={onPrevious}
        disabled={disabled}
        aria-label="Previous week"
      >
        ‹ Previous
      </button>

      <div className="week-nav-label" aria-live="polite">
        <strong>{label}</strong>
        {isCurrentWeek ? (
          <span className="week-nav-tag">This week</span>
        ) : isPast ? (
          <span className="week-nav-tag past">Past week</span>
        ) : null}
      </div>

      <button
        type="button"
        className="btn ghost week-nav-step"
        onClick={onNext}
        disabled={disabled}
        aria-label="Next week"
      >
        Next ›
      </button>

      {!isCurrentWeek ? (
        <button type="button" className="link-button week-nav-today" onClick={onReset}>
          Back to this week
        </button>
      ) : null}
    </div>
  )
}
