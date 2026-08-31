import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import { AppPresentationProvider } from './context/AppPresentation'
import { ShowcaseShell } from './components/ShowcaseShell'
import { FirebaseConfigBanner } from './components/FirebaseConfigBanner'
import Hub from './pages/Hub'
import StudioFlow from './pages/fitness/StudioFlow'
import ClassBoard from './pages/fitness/ClassBoard'
import SignIn from './pages/fitness/SignIn'
import './styles/app.css'
import './styles/gbtt-theme.css'

const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/'

function AppRoute({ children }: { children: ReactNode }) {
  return <ShowcaseShell>{children}</ShowcaseShell>
}

export default function App() {
  return (
    <BrowserRouter basename={basename === '/' ? undefined : basename}>
      <AppPresentationProvider>
        <FirebaseConfigBanner />
        <Routes>
          <Route path="/" element={<Hub />} />
          <Route
            path="/signin"
            element={
              <AppRoute>
                <SignIn />
              </AppRoute>
            }
          />
          <Route
            path="/fitness/studioflow"
            element={
              <AppRoute>
                <StudioFlow />
              </AppRoute>
            }
          />
          <Route
            path="/fitness/classboard"
            element={
              <AppRoute>
                <ClassBoard />
              </AppRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppPresentationProvider>
    </BrowserRouter>
  )
}
