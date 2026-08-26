import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { SiteLayout } from './components/SiteLayout'
import { ScrollToTop } from './components/ScrollToTop'
import HomePage from './pages/HomePage'
import ContactPage from './pages/ContactPage'

const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || undefined

/** Old paths → homepage section bookmarks. */
function HashRedirect({ hash }: { hash: string }) {
  const id = hash.replace(/^#/, '')
  return <Navigate to={{ pathname: '/', hash: id }} replace />
}

export default function App() {
  return (
    <BrowserRouter basename={basename}>
      <ScrollToTop />
      <Routes>
        <Route element={<SiteLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/classes" element={<HashRedirect hash="#classes" />} />
          <Route path="/locations" element={<HashRedirect hash="#location" />} />
          <Route path="/apps" element={<HashRedirect hash="#apps" />} />
          <Route path="/future" element={<HashRedirect hash="#apps" />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
