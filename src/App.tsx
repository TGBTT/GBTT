import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { SiteLayout } from './components/SiteLayout'
import { ScrollToTop } from './components/ScrollToTop'
import HomePage from './pages/HomePage'
import ClassesPage from './pages/ClassesPage'
import LocationsPage from './pages/LocationsPage'
import AppsPage from './pages/AppsPage'
import ContactPage from './pages/ContactPage'
import FuturePage from './pages/FuturePage'

const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || undefined

export default function App() {
  return (
    <BrowserRouter basename={basename}>
      <ScrollToTop />
      <Routes>
        <Route element={<SiteLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/classes" element={<ClassesPage />} />
          <Route path="/locations" element={<LocationsPage />} />
          <Route path="/apps" element={<AppsPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/future" element={<FuturePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
