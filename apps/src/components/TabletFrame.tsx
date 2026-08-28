import type { ReactNode } from 'react'
import { useAppPresentation } from '../context/AppPresentation'

/** Desktop showcase: wrap demos in a tablet bezel. Mobile and embed stay full-bleed. */
export function TabletFrame({ children }: { children: ReactNode }) {
  const { showShowcaseChrome } = useAppPresentation()

  if (!showShowcaseChrome) {
    return <>{children}</>
  }

  return (
    <div className="tablet-stage">
      <div className="tablet-device">
        <div className="tablet-bezel">
          <div className="tablet-sensor" aria-hidden="true" />
          <div className="tablet-screen">{children}</div>
          <div className="tablet-home" aria-hidden="true" />
        </div>
      </div>
    </div>
  )
}
