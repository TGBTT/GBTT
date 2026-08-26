import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useDemoPresentation } from '../context/DemoPresentation'

function marketingHref(path: string): string {
  const base = import.meta.env.BASE_URL
  const root = base.replace(/\/?sim\/?$/, '/') || '/'
  const clean = path.startsWith('/') ? path.slice(1) : path
  return `${root}${clean}`
}

/** Mirrors marketing `NAV` in src/data/siteConfig.ts — keep in sync. */
const NAV = [
  { href: '', label: 'Home' },
  { href: '#trainer', label: 'Trainer' },
  { href: '#classes', label: 'Classes' },
  { href: '#location', label: 'Location' },
  { href: '#apps', label: 'Book' },
  { href: 'contact/', label: 'Contact' },
] as const

/** Same header markup and labels as the main GBTT site. */
export function SiteDemoNav() {
  const { showShowcaseChrome } = useDemoPresentation()
  const [open, setOpen] = useState(false)
  if (!showShowcaseChrome) return null

  const logoSrc = `${import.meta.env.BASE_URL}brand/gbtt-logo.png`

  return (
    <header className="site-header">
      <div className="site-header__inner">
        <a className="brand-mark" href={marketingHref('')} onClick={() => setOpen(false)}>
          <img src={logoSrc} alt="" width={48} height={48} />
          <span className="brand-mark__text">
            <span className="brand-mark__name">GBTT</span>
            <span className="brand-mark__sub">Golden Bay Team Training</span>
          </span>
        </a>
        <div className="site-header__end">
          <button
            type="button"
            className="nav-toggle"
            aria-expanded={open}
            aria-controls="site-nav"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? 'Close' : 'Menu'}
          </button>
          <nav id="site-nav" className={`site-nav${open ? ' is-open' : ''}`} aria-label="Primary">
            {NAV.map((item) => (
              <a
                key={item.href || 'home'}
                href={marketingHref(item.href)}
                onClick={() => setOpen(false)}
              >
                {item.label}
              </a>
            ))}
          </nav>
          <Link
            className="admin-nav-badge"
            to="/fitness/classboard"
            title="Staff login"
            onClick={() => setOpen(false)}
          >
            Admin
          </Link>
        </div>
      </div>
    </header>
  )
}

export const GbtechDemoNav = SiteDemoNav
