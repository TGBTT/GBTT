import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import { DemoPresentationProvider } from './context/DemoPresentation'
import { ShowcaseShell } from './components/ShowcaseShell'
import Hub from './pages/Hub'
import StudioFlow from './pages/fitness/StudioFlow'
import ClassBoard from './pages/fitness/ClassBoard'
import './styles/demos.css'
import './styles/gbtt-theme.css'

const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/'

function DemoRoute({ children }: { children: ReactNode }) {
  return <ShowcaseShell>{children}</ShowcaseShell>
}

export default function App() {
  return (
    <BrowserRouter basename={basename === '/' ? undefined : basename}>
      <DemoPresentationProvider>
        <Routes>
          <Route path="/" element={<Hub />} />
          <Route
            path="/fitness/studioflow"
            element={
              <DemoRoute>
                <StudioFlow />
              </DemoRoute>
            }
          />
          <Route
            path="/fitness/classboard"
            element={
              <DemoRoute>
                <ClassBoard />
              </DemoRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </DemoPresentationProvider>
    </BrowserRouter>
  )
}
