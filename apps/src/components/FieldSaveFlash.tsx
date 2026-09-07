/**
 * Brief green check when an admin field saves on blur (no Save button).
 *
 * Call `flash(key)` after a successful server write; wrap the input in
 * `FieldControl` so the mark sits at the bottom-right of the control.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

const FLASH_MS = 2200

export function useFieldSaveFlash(durationMs = FLASH_MS) {
  const [savedKeys, setSavedKeys] = useState(() => new Set<string>())
  const timers = useRef(new Map<string, number>())

  useEffect(
    () => () => {
      for (const id of timers.current.values()) window.clearTimeout(id)
    },
    [],
  )

  const flash = useCallback(
    (key: string) => {
      setSavedKeys((prev) => {
        if (prev.has(key)) return prev
        const next = new Set(prev)
        next.add(key)
        return next
      })
      const existing = timers.current.get(key)
      if (existing) window.clearTimeout(existing)
      const id = window.setTimeout(() => {
        timers.current.delete(key)
        setSavedKeys((prev) => {
          if (!prev.has(key)) return prev
          const next = new Set(prev)
          next.delete(key)
          return next
        })
      }, durationMs)
      timers.current.set(key, id)
    },
    [durationMs],
  )

  const isSaved = useCallback((key: string) => savedKeys.has(key), [savedKeys])

  return { flash, isSaved }
}

export function FieldControl({
  saved,
  children,
}: {
  saved: boolean
  children: ReactNode
}) {
  return (
    <span className={`field-control${saved ? ' field-control--saved' : ''}`}>
      {children}
      {saved ? (
        <span className="field-saved-check" aria-label="Saved" role="status">
          ✓
        </span>
      ) : null}
    </span>
  )
}
