import { useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { NAV, SITE, adminAppHref } from '../data/siteConfig'

function navIsActive(to: string, pathname: string, hash: string): boolean {
  if (to === '/') return pathname === '/' && !hash
  if (to.startsWith('/#')) {
    const section = to.slice(2)
    return pathname === '/' && hash === `#${section}`
  }
  return pathname === to || pathname.startsWith(`${to}/`)
}

export function SiteLayout() {
  const [open, setOpen] = useState(false)
  const { pathname, hash } = useLocation()

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
              {NAV.map((item) => {
                const active = navIsActive(item.to, pathname, hash)
                if (item.to.startsWith('/#')) {
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={active ? 'is-active' : undefined}
                      onClick={() => setOpen(false)}
                    >
                      {item.label}
                    </Link>
                  )
                }
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={active ? 'is-active' : undefined}
                    onClick={() => setOpen(false)}
                  >
                    {item.label}
                  </Link>
                )
              })}
            </nav>
            <a className="admin-nav-badge" href={adminAppHref()} title="Staff login">
              Admin
            </a>
          </div>
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
            {' · '}
            <Link to="/#fitforlife">{SITE.hashtag}</Link>
          </p>
        </div>
      </footer>
    </div>
  )
}
