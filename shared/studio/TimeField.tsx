/**
 * Time field with scrolling hour, minute and am/pm columns.
 *
 * Session times are only ever picked from a small set of sensible values, so
 * the wheel is quicker than typing and rules out the malformed entries a text
 * field allows. The value handed back stays 24-hour `HH:MM`, which is what
 * sessions are stored with.
 */

import { useEffect, useMemo, useRef } from 'react'
import { usePopoverField } from './usePopoverField'

const MINUTE_STEP = 5
const HOURS = Array.from({ length: 12 }, (_, i) => i + 1)
const MERIDIEMS = ['am', 'pm'] as const

type Meridiem = (typeof MERIDIEMS)[number]

interface Parts {
  hour12: number
  minute: number
  meridiem: Meridiem
}

const pad = (n: number) => String(n).padStart(2, '0')

function parseTime(value: string): Parts {
  const [h, m] = value.split(':').map(Number)
  const hour24 = Number.isFinite(h) ? h : 9
  const minute = Number.isFinite(m) ? m : 0
  return {
    hour12: hour24 % 12 === 0 ? 12 : hour24 % 12,
    minute,
    meridiem: hour24 >= 12 ? 'pm' : 'am',
  }
}

function toValue({ hour12, minute, meridiem }: Parts): string {
  const base = hour12 % 12
  const hour24 = meridiem === 'pm' ? base + 12 : base
  return `${pad(hour24)}:${pad(minute)}`
}

function formatTime(value: string): string {
  const { hour12, minute, meridiem } = parseTime(value)
  return `${hour12}:${pad(minute)} ${meridiem}`
}

interface ColumnProps<T> {
  label: string
  options: T[]
  value: T
  render: (option: T) => string
  onSelect: (option: T) => void
  open: boolean
}

/**
 * One scrolling column. Selection commits on click and when a flick settles,
 * so the wheel behaves the way it looks like it should.
 */
function Column<T extends string | number>({
  label,
  options,
  value,
  render,
  onSelect,
  open,
}: ColumnProps<T>) {
  const listRef = useRef<HTMLDivElement | null>(null)
  const settle = useRef<number | undefined>(undefined)

  const centre = (behavior: ScrollBehavior) => {
    const list = listRef.current
    const active = list?.querySelector<HTMLElement>('[data-active="true"]')
    if (!list || !active) return
    list.scrollTo({ top: active.offsetTop - (list.clientHeight - active.offsetHeight) / 2, behavior })
  }

  // Jump straight to the current value when the panel opens, then glide for
  // later changes so a click on a neighbouring option recentres visibly.
  const opened = useRef(false)
  useEffect(() => {
    if (!open) {
      opened.current = false
      return
    }
    centre(opened.current ? 'smooth' : 'auto')
    opened.current = true
  }, [open, value])

  const onScroll = () => {
    window.clearTimeout(settle.current)
    settle.current = window.setTimeout(() => {
      const list = listRef.current
      if (!list) return
      const middle = list.scrollTop + list.clientHeight / 2
      const items = Array.from(list.querySelectorAll<HTMLElement>('[data-option]'))
      let best = -1
      let bestDistance = Infinity
      items.forEach((el, i) => {
        const distance = Math.abs(el.offsetTop + el.offsetHeight / 2 - middle)
        if (distance < bestDistance) {
          bestDistance = distance
          best = i
        }
      })
      const settled = options[best]
      if (settled !== undefined && settled !== value) onSelect(settled)
    }, 120)
  }

  useEffect(() => () => window.clearTimeout(settle.current), [])

  return (
    <div className="time-pop__column">
      <span className="time-pop__column-label">{label}</span>
      <div
        className="time-pop__list"
        ref={listRef}
        role="listbox"
        aria-label={label}
        tabIndex={0}
        onScroll={onScroll}
        onKeyDown={(e) => {
          const delta = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0
          if (!delta) return
          e.preventDefault()
          const next = options[options.indexOf(value) + delta]
          if (next !== undefined) onSelect(next)
        }}
      >
        {options.map((option) => (
          <button
            key={String(option)}
            type="button"
            data-option
            data-active={option === value}
            role="option"
            aria-selected={option === value}
            className={`time-pop__option${option === value ? ' is-active' : ''}`}
            onClick={() => onSelect(option)}
          >
            {render(option)}
          </button>
        ))}
      </div>
    </div>
  )
}

interface TimeFieldProps {
  /** 24-hour `HH:MM`. */
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  ariaLabel?: string
}

export function TimeField({ value, onChange, disabled, ariaLabel }: TimeFieldProps) {
  const pop = usePopoverField()
  const parts = parseTime(value)

  // An existing time off the five-minute grid still needs a row to sit on,
  // otherwise opening the panel would silently shift it.
  const minutes = useMemo(() => {
    const steps = Array.from({ length: 60 / MINUTE_STEP }, (_, i) => i * MINUTE_STEP)
    return steps.includes(parts.minute)
      ? steps
      : [...steps, parts.minute].sort((a, b) => a - b)
  }, [parts.minute])

  const update = (next: Partial<Parts>) => {
    onChange(toValue({ ...parts, ...next }))
  }

  return (
    <div className="field-pop" ref={pop.wrapRef}>
      <button
        type="button"
        className={`field-pop__trigger${value ? '' : ' is-empty'}`}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={pop.open}
        aria-label={ariaLabel}
        onClick={() => pop.setOpen(!pop.open)}
      >
        <span>{value ? formatTime(value) : 'Pick a time'}</span>
        <span aria-hidden="true" className="field-pop__icon">
          ▾
        </span>
      </button>

      {pop.open ? (
        <div
          className={`${pop.panelClass} time-pop`}
          ref={pop.panelRef}
          role="dialog"
          aria-label="Choose a time"
        >
          <div className="time-pop__columns">
            <span aria-hidden="true" className="time-pop__marker" />
            <Column
              label="Hour"
              options={HOURS}
              value={parts.hour12}
              render={(h) => String(h)}
              onSelect={(hour12) => update({ hour12 })}
              open={pop.open}
            />
            <Column
              label="Minute"
              options={minutes}
              value={parts.minute}
              render={(m) => pad(m)}
              onSelect={(minute) => update({ minute })}
              open={pop.open}
            />
            <Column
              label="am/pm"
              options={MERIDIEMS as unknown as Meridiem[]}
              value={parts.meridiem}
              render={(m) => m}
              onSelect={(meridiem) => update({ meridiem })}
              open={pop.open}
            />
          </div>
          <div className="field-pop__actions">
            <button type="button" className="link-button" onClick={pop.close}>
              Done
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
