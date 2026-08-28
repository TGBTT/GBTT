import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { useAppPresentation } from '../context/AppPresentation'
import { TabletFrame } from './TabletFrame'

const ChromeHostContext = createContext<HTMLElement | null>(null)

/** Desk stage + chrome host above the tablet; simulation stays inside the bezel. */
export function ShowcaseShell({ children }: { children: ReactNode }) {
  const { showShowcaseChrome } = useAppPresentation()
  const [host, setHost] = useState<HTMLElement | null>(null)
  const hostRef = useCallback((node: HTMLDivElement | null) => {
    setHost(node)
  }, [])

  if (!showShowcaseChrome) {
    return <>{children}</>
  }

  return (
    <ChromeHostContext.Provider value={host}>
      <div className="showcase-shell">
        <div className="showcase-chrome" ref={hostRef} />
        {host ? <TabletFrame>{children}</TabletFrame> : null}
      </div>
    </ChromeHostContext.Provider>
  )
}

/** Renders marketing / nav chrome above the tablet when showcase mode is on. */
export function ShowcaseChrome({ children }: { children: ReactNode }) {
  const host = useContext(ChromeHostContext)
  const { showShowcaseChrome } = useAppPresentation()

  if (!showShowcaseChrome || !host) {
    return <>{children}</>
  }

  return createPortal(children, host)
}
