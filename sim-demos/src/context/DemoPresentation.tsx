import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'

type DemoPresentationContextValue = {
  standalone: boolean
  showShowcaseChrome: boolean
}

const DemoPresentationContext = createContext<DemoPresentationContextValue>({
  standalone: false,
  showShowcaseChrome: true,
})

function detectStandalone(search: URLSearchParams): boolean {
  if (search.get('standalone') === '1' || search.get('embed') === '1') return true
  try {
    return window.self !== window.top
  } catch {
    return true
  }
}

export function DemoPresentationProvider({ children }: { children: ReactNode }) {
  const [search] = useSearchParams()
  const standalone = useMemo(() => detectStandalone(search), [search])

  useEffect(() => {
    document.documentElement.classList.toggle('demo-standalone', standalone)
    return () => {
      document.documentElement.classList.remove('demo-standalone')
    }
  }, [standalone])

  const value = useMemo(
    () => ({ standalone, showShowcaseChrome: !standalone }),
    [standalone],
  )

  return <DemoPresentationContext.Provider value={value}>{children}</DemoPresentationContext.Provider>
}

export function useDemoPresentation() {
  return useContext(DemoPresentationContext)
}
