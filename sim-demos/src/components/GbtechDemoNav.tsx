import { Link, useLocation } from 'react-router-dom'
import { useDemoPresentation } from '../context/DemoPresentation'

function marketingHref(path: string): string {
  const base = import.meta.env.BASE_URL
  // /GBTT/sim/ → /GBTT/  or /sim/ → /
  const root = base.replace(/\/?sim\/?$/, '/') || '/'
  const clean = path.startsWith('/') ? path.slice(1) : path
  return `${root}${clean}`
}

const MARKETING = [
  { href: '', label: 'Home' },
  { href: 'classes/', label: 'Classes' },
  { href: 'locations/', label: 'Locations' },
  { href: 'apps/', label: 'Apps' },
  { href: 'contact/', label: 'Contact' },
  { href: 'future/', label: 'Future' },
] as const

/** Sticky GBTT chrome — marketing pages + in-sim apps. */
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
            Book
          </Link>
          <Link
            to="/fitness/classboard"
            className={pathname.includes('classboard') ? 'is-active' : undefined}
          >
            Admin
          </Link>
        </div>
      </div>
    </nav>
  )
}

/** @deprecated alias */
export const GbtechDemoNav = SiteDemoNav
