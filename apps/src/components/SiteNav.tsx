import { useEffect, useReducer, useState } from 'react'
import { Link } from 'react-router-dom'
import { studioLogout } from '@gbtt/shared/studio/studioAuth'
import { useAppPresentation } from '../context/AppPresentation'
import { getSessionRole, getSessionUser, subscribeStore } from '../shared/fitnessStudio'
import { SIGN_IN_PATH, homePathForRole } from './studioRoutes'

export function marketingHref(path: string): string {
  const base = import.meta.env.BASE_URL
  const root = base.replace(/\/?app\/?$/, '/') || '/'
  const clean = path.startsWith('/') ? path.slice(1) : path
  return `${root}${clean}`
}

/** Public GBTT site — `/` when apps are served under `/app/`. */
export function marketingHomeHref(): string {
  return marketingHref('')
}

async function leaveToMarketingSite(): Promise<void> {
  try {
    await studioLogout()
  } finally {
    window.location.assign(marketingHomeHref())
  }
}

export function InAppLogoutButton({ className = 'admin-nav-signout' }: { className?: string }) {
  return (
    <button type="button" className={className} onClick={() => void leaveToMarketingSite()}>
      Log out
    </button>
  )
}

/** Sticky bar used inside member/admin apps instead of the marketing nav. */
export function InAppExitBar() {
  return (
    <header className="site-header site-header--in-app">
      <div className="site-header__inner">
        <a className="app-back" href={marketingHomeHref()}>
          ← GBTT
        </a>
        <InAppLogoutButton />
      </div>
    </header>
  )
}

const NAV = [
  { href: '', label: 'Home' },
  { href: '#trainer', label: 'Trainer' },
  { href: '#classes', label: 'Classes' },
  { href: '#location', label: 'Location' },
  { href: '#apps', label: 'Book' },
  { href: 'contact/', label: 'Contact' },
] as const

export function SiteNav() {
  const { showShowcaseChrome } = useAppPresentation()
  const [open, setOpen] = useState(false)
  // The store is mutated by the sign-in form and by the pages, not by the nav,
  // so it has to be told when the session changes or it would stay stale.
  const [, bumpSession] = useReducer((n: number) => n + 1, 0)
  useEffect(() => subscribeStore(bumpSession), [])

  const session = getSessionUser()
  const role = getSessionRole()

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
          {session && role !== 'public' ? (
            <div className="admin-nav-session">
              <Link
                className="admin-nav-badge"
                to={homePathForRole(role)}
                title={`Signed in as ${session.email}`}
                onClick={() => setOpen(false)}
              >
                {session.name || session.email}
              </Link>
              <button
                type="button"
                className="admin-nav-signout"
                onClick={() => {
                  setOpen(false)
                  void studioLogout()
                }}
              >
                Sign out
              </button>
            </div>
          ) : (
            <Link
              className="admin-nav-badge"
              to={SIGN_IN_PATH}
              title="Sign in"
              onClick={() => setOpen(false)}
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}
