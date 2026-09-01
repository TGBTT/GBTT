import { useEffect, useState } from 'react'

export type WorkingOverlayPhase = 'working' | 'success'

export interface WorkingOverlayLabels {
  working: string
  success: string
}

export interface WorkingOverlayProps {
  open: boolean
  phase: WorkingOverlayPhase
  message: string
  onDone?: () => void
}

const SUCCESS_MS = 1500

/** Full-screen spinner / success feedback while a server action runs. */
export function WorkingOverlay({ open, phase, message, onDone }: WorkingOverlayProps) {
  useEffect(() => {
    if (!open || phase !== 'success' || !onDone) return
    const id = window.setTimeout(onDone, SUCCESS_MS)
    return () => window.clearTimeout(id)
  }, [open, phase, onDone])

  if (!open) return null

  return (
    <div className="working-overlay" role="status" aria-live="polite" aria-busy={phase === 'working'}>
      <div className="working-overlay__card">
        {phase === 'working' ? <div className="working-overlay__spinner" aria-hidden /> : null}
        <p className="working-overlay__message">{message}</p>
      </div>
    </div>
  )
}

type OverlayState =
  | { open: false; phase: WorkingOverlayPhase; message: string }
  | { open: true; phase: WorkingOverlayPhase; message: string }

const CLOSED: OverlayState = { open: false, phase: 'working', message: '' }

/** Studio callables return `{ error: string | null }` rather than throwing. */
function resultError(result: unknown): string | null {
  if (!result || typeof result !== 'object' || !('error' in result)) return null
  const err = (result as { error?: unknown }).error
  return typeof err === 'string' && err ? err : null
}

/**
 * Standardises working → success → dismiss timing for server callables.
 * On error the overlay closes immediately and the action's return value is passed through.
 */
export function useWorkingOverlay() {
  const [state, setState] = useState<OverlayState>(CLOSED)

  const dismiss = () => setState(CLOSED)

  const run = async <T,>(
    action: () => Promise<T>,
    labels: WorkingOverlayLabels,
    failed?: (result: T) => boolean,
  ): Promise<T> => {
    setState({ open: true, phase: 'working', message: labels.working })
    try {
      const result = await action()
      const isFailed = failed ? failed(result) : !!resultError(result)
      if (isFailed) {
        setState(CLOSED)
        return result
      }
      setState({ open: true, phase: 'success', message: labels.success })
      return result
    } catch (e) {
      setState(CLOSED)
      throw e
    }
  }

  const overlayProps: WorkingOverlayProps = {
    open: state.open,
    phase: state.phase,
    message: state.message,
    onDone: state.phase === 'success' ? dismiss : undefined,
  }

  return { run, overlayProps, dismiss, busy: state.open && state.phase === 'working' }
}
