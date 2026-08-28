import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'

type AppPresentationContextValue = {
  standalone: boolean
  showShowcaseChrome: boolean
}

const AppPresentationContext = createContext<AppPresentationContextValue>({
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

export function AppPresentationProvider({ children }: { children: ReactNode }) {
  const [search] = useSearchParams()
  const standalone = useMemo(() => detectStandalone(search), [search])

  useEffect(() => {
    document.documentElement.classList.toggle('app-embed', standalone)
    return () => {
      document.documentElement.classList.remove('app-embed')
    }
  }, [standalone])

  const value = useMemo(
    () => ({ standalone, showShowcaseChrome: !standalone }),
    [standalone],
  )

  return <AppPresentationContext.Provider value={value}>{children}</AppPresentationContext.Provider>
}

export function useAppPresentation() {
  return useContext(AppPresentationContext)
}
