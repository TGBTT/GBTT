/**
 * Date field that opens a month grid instead of asking for typed digits.
 *
 * Seasons and closures are picked by people who think in weeks — "the Monday
 * after the holidays" — so a grid they can point at is closer to the intent
 * than a `YYYY-MM-DD` string. The value stays that string either way, which is
 * what seasons are stored with.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { dayKey, parseDayKey, shiftDayKey } from './SeasonCalendar'
import { usePopoverField } from './usePopoverField'

const MONTH_LABEL = new Intl.DateTimeFormat('en-NZ', { month: 'long', year: 'numeric' })
const VALUE_LABEL = new Intl.DateTimeFormat('en-NZ', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})
const DAY_HEADS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

interface DateFieldProps {
  /** `YYYY-MM-DD`, or empty when nothing has been picked yet. */
  value: string
  onChange: (key: string) => void
  /** Inclusive bounds; days outside them cannot be picked. */
  min?: string
  max?: string
  disabled?: boolean
  placeholder?: string
  /** Names the field for screen readers when the visible label is separate. */
  ariaLabel?: string
}

export function DateField({
  value,
  onChange,
  min,
  max,
  disabled,
  placeholder = 'Pick a date',
  ariaLabel,
}: DateFieldProps) {
  const pop = usePopoverField()
  const { open, setOpen, close } = pop

  // The month on show, and the day arrow keys are sitting on. Both start from
  // the current value so opening the panel lands where the user left off.
  const [monthAnchor, setMonthAnchor] = useState(() => parseDayKey(value) ?? new Date())
  const [focusKey, setFocusKey] = useState(() => value || dayKey(new Date()))
  const gridRef = useRef<HTMLDivElement | null>(null)
  const movedByKeyboard = useRef(false)

  useEffect(() => {
    if (!open) return
    const start = parseDayKey(value) ?? new Date()
    setMonthAnchor(start)
    setFocusKey(dayKey(start))
  }, [open, value])

  // Only pull focus after an arrow key, so opening with the mouse does not
  // yank focus off the trigger.
  useEffect(() => {
    if (!open || !movedByKeyboard.current) return
    movedByKeyboard.current = false
    gridRef.current?.querySelector<HTMLButtonElement>('[data-focused="true"]')?.focus()
  }, [focusKey, open])

  const year = monthAnchor.getFullYear()
  const month = monthAnchor.getMonth()

  // Six fixed weeks so the panel does not resize as months are stepped
  // through. getDay() is Sunday-based and this grid starts on Monday.
  const cells = useMemo(() => {
    const first = new Date(year, month, 1)
    const lead = (first.getDay() + 6) % 7
    return Array.from({ length: 42 }, (_, i) => {
      const date = new Date(year, month, 1 - lead + i)
      return { key: dayKey(date), date, inMonth: date.getMonth() === month }
    })
  }, [year, month])

  const outOfRange = (key: string) => Boolean((min && key < min) || (max && key > max))

  const pick = (key: string) => {
    if (outOfRange(key)) return
    onChange(key)
    close()
  }

  const moveFocus = (next: string) => {
    movedByKeyboard.current = true
    setFocusKey(next)
    const date = parseDayKey(next)
    if (date && (date.getMonth() !== month || date.getFullYear() !== year)) {
      setMonthAnchor(new Date(date.getFullYear(), date.getMonth(), 1))
    }
  }

  const onGridKeyDown = (e: React.KeyboardEvent) => {
    const step: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    }
    if (e.key in step) {
      e.preventDefault()
      moveFocus(shiftDayKey(focusKey, step[e.key]))
      return
    }
    if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault()
      const date = parseDayKey(focusKey)
      if (!date) return
      const delta = e.key === 'PageUp' ? -1 : 1
      moveFocus(dayKey(new Date(date.getFullYear(), date.getMonth() + delta, date.getDate())))
      return
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      pick(focusKey)
    }
  }

  const selected = parseDayKey(value)
  const todayKey = dayKey(new Date())

  return (
    <div className="field-pop" ref={pop.wrapRef}>
      <button
        type="button"
        className={`field-pop__trigger${value ? '' : ' is-empty'}`}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen(!open)}
      >
        <span>{selected ? VALUE_LABEL.format(selected) : placeholder}</span>
        <span aria-hidden="true" className="field-pop__icon">
          ▾
        </span>
      </button>

      {open ? (
        <div className={pop.panelClass} ref={pop.panelRef} role="dialog" aria-label="Choose a date">
          <div className="field-pop__bar">
            <button
              type="button"
              className="field-pop__step"
              aria-label="Previous month"
              onClick={() => setMonthAnchor(new Date(year, month - 1, 1))}
            >
              ‹
            </button>
            <strong className="field-pop__month">
              {MONTH_LABEL.format(new Date(year, month, 1))}
            </strong>
            <button
              type="button"
              className="field-pop__step"
              aria-label="Next month"
              onClick={() => setMonthAnchor(new Date(year, month + 1, 1))}
            >
              ›
            </button>
          </div>

          <div className="field-pop__grid" ref={gridRef} role="grid" onKeyDown={onGridKeyDown}>
            {DAY_HEADS.map((d) => (
              <div key={d} className="field-pop__head" role="columnheader">
                {d}
              </div>
            ))}
            {cells.map((cell) => {
              const isSelected = value === cell.key
              const blocked = outOfRange(cell.key)
              const classes = [
                'field-pop__day',
                cell.inMonth ? '' : 'is-other-month',
                isSelected ? 'is-selected' : '',
                cell.key === todayKey ? 'is-today' : '',
              ]
                .filter(Boolean)
                .join(' ')
              return (
                <button
                  key={cell.key}
                  type="button"
                  role="gridcell"
                  className={classes}
                  disabled={blocked}
                  aria-selected={isSelected}
                  data-focused={cell.key === focusKey}
                  tabIndex={cell.key === focusKey ? 0 : -1}
                  onClick={() => pick(cell.key)}
                >
                  {cell.date.getDate()}
                </button>
              )
            })}
          </div>

          <div className="field-pop__actions">
            <button type="button" className="link-button" onClick={() => pick(todayKey)}>
              Today
            </button>
            <button
              type="button"
              className="link-button"
              onClick={() => {
                onChange('')
                close()
              }}
            >
              Clear
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
