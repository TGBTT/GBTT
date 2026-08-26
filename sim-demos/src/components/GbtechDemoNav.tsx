import { Link } from 'react-router-dom'
import { useDemoPresentation } from '../context/DemoPresentation'

/** Sticky chrome while browsing GBTT fitness demos. */
export function GbtechDemoNav() {
  const { showShowcaseChrome } = useDemoPresentation()
  if (!showShowcaseChrome) return null

  return (
    <nav className="gbtech-demo-nav" aria-label="GBTT demo navigation">
      <div className="gbtech-demo-nav__inner">
        <a className="gbtech-demo-nav__brand" href={`${import.meta.env.BASE_URL}../`}>
          <strong>GBTT</strong>
          <span> · Fitness demos</span>
        </a>
        <div className="gbtech-demo-nav__links">
          <Link to="/">All demos</Link>
          <a href={`${import.meta.env.BASE_URL}../apps/`}>Website apps</a>
          <a href={`${import.meta.env.BASE_URL}../contact/`}>Contact Tom</a>
        </div>
      </div>
    </nav>
  )
}
