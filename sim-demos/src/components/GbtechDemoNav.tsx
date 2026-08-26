import { Link, useLocation } from 'react-router-dom'
import { useDemoPresentation } from '../context/DemoPresentation'

function marketingHref(path: string): string {
  const base = import.meta.env.BASE_URL
  const root = base.replace(/\/?sim\/?$/, '/') || '/'
  const clean = path.startsWith('/') ? path.slice(1) : path
  return `${root}${clean}`
}

/** Same bookmarks as the main GBTT site header. */
const MARKETING = [
  { href: '', label: 'Home' },
  { href: '#trainer', label: 'Trainer' },
  { href: '#classes', label: 'Classes' },
  { href: '#location', label: 'Location' },
  { href: '#apps', label: 'Apps' },
  { href: 'contact/', label: 'Contact' },
] as const

export function SiteDemoNav() {
  const { showShowcaseChrome } = useDemoPresentation()
  const { pathname } = useLocation()
  if (!showShowcaseChrome) return null

  return (
    <nav className="site-demo-nav" aria-label="GBTT site">
      <div className="site-demo-nav__inner">
        <a className="site-demo-nav__brand" href={marketingHref('')}>
          <img src={`${import.meta.env.BASE_URL}brand/gbtt-logo.png`} alt="" width={36} height={36} />
          <span>
            <strong>GBTT</strong>
            <span className="site-demo-nav__tag"> · Simulated apps</span>
          </span>
        </a>
        <div className="site-demo-nav__links">
          {MARKETING.map((item) => (
            <a key={item.href || 'home'} href={marketingHref(item.href)}>
              {item.label}
            </a>
          ))}
          <Link
            to="/fitness/studioflow"
            className={pathname.includes('studioflow') ? 'is-active' : undefined}
          >
            Member booking
          </Link>
          <Link
            to="/fitness/classboard"
            className={pathname.includes('classboard') ? 'is-active' : undefined}
          >
            Trainer admin
          </Link>
        </div>
      </div>
    </nav>
  )
}

export const GbtechDemoNav = SiteDemoNav
