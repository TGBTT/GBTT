import { useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { NAV, SITE } from '../data/siteConfig'

export function SiteLayout() {
  const [open, setOpen] = useState(false)

  return (
    <div className="site">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <div className="site-header__inner">
          <Link to="/" className="brand-mark" onClick={() => setOpen(false)}>
            <img src={`${import.meta.env.BASE_URL}brand/gbtt-logo.png`} alt="" width={48} height={48} />
            <span className="brand-mark__text">
              <span className="brand-mark__name">{SITE.shortName}</span>
              <span className="brand-mark__sub">{SITE.name}</span>
            </span>
          </Link>
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
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) => (isActive ? 'is-active' : undefined)}
                onClick={() => setOpen(false)}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main id="main">
        <Outlet />
      </main>
      <footer className="site-footer">
        <div className="site-footer__inner">
          <p className="site-footer__brand">{SITE.name}</p>
          <p>
            Run by {SITE.runBy} ·{' '}
            <a href={SITE.phoneHref}>{SITE.phone}</a> ·{' '}
            <a href={`mailto:${SITE.email}`}>{SITE.email}</a>
          </p>
          <p>
            <a href={SITE.facebook} target="_blank" rel="noreferrer">
              Facebook
            </a>
          </p>
        </div>
      </footer>
    </div>
  )
}
