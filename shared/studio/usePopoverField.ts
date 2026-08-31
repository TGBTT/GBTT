/**
 * Shared open/close wiring for the date and time popovers.
 *
 * Both fields are a trigger button with a panel anchored under it, and both
 * have to dismiss on an outside click or Escape, and flip above the trigger
 * when there is no room below. Keeping that in one place stops the two
 * components drifting apart.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

export interface PopoverField {
  open: boolean
  setOpen: (open: boolean) => void
  /** Wrap the trigger and panel; the panel positions against this. */
  wrapRef: React.RefObject<HTMLDivElement | null>
  /** Add to the panel so its height can be measured before flipping. */
  panelRef: React.RefObject<HTMLDivElement | null>
  /** `is-above` when the panel had to flip up to stay on screen. */
  panelClass: string
  close: () => void
}

export function usePopoverField(): PopoverField {
  const [open, setOpen] = useState(false)
  const [above, setAbove] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)

  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (!open) return

    const onPointerDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        // Focus goes back to the trigger, otherwise Escape drops the user at
        // the top of the document.
        wrapRef.current?.querySelector('button')?.focus()
      }
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  useEffect(() => {
    if (!open) {
      setAbove(false)
      return
    }
    const trigger = wrapRef.current?.getBoundingClientRect()
    const height = panelRef.current?.offsetHeight ?? 0
    if (!trigger) return
    setAbove(trigger.bottom + height > window.innerHeight && trigger.top > height)
  }, [open])

  return {
    open,
    setOpen,
    wrapRef,
    panelRef,
    panelClass: `field-pop__panel${above ? ' is-above' : ''}`,
    close,
  }
}
