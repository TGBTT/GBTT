import { Link } from 'react-router-dom'
import { SITE } from '../data/siteConfig'
import { activeVenues } from '../data/locations'

function simHref(path: string): string {
  const base = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`
  return `${base}sim/${path}`
}

export default function HomePage() {
  const venue = activeVenues()[0]

  return (
    <>
      <section className="hero">
        <div className="hero__atmosphere" aria-hidden="true" />
        <div className="hero__content">
          <img
            className="hero__logo"
            src={`${import.meta.env.BASE_URL}brand/gbtt-logo.png`}
            alt="Golden Bay Team Training"
            width={220}
            height={220}
          />
          <h1 className="hero__title visually-hidden">{SITE.name}</h1>
          <p className="hero__lead">{SITE.tagline}</p>
          <div className="hero__cta">
            <a className="btn btn--primary" href={simHref('fitness/studioflow/')}>
              Open booking demo
            </a>
            <a className="btn btn--ghost" href={simHref('fitness/classboard/')}>
              Open admin demo
            </a>
            <Link className="btn btn--ghost" to="/contact">
              Contact Tom
            </Link>
          </div>
        </div>
      </section>

      <section className="section section--tight">
        <div className="section__inner">
          <h2>Who can join</h2>
          <p>
            Classes cater to all fitness levels and abilities, with options for kids and teens. Turn up
            ready to move — Tom scales the session so everyone works hard at their own level.
          </p>
        </div>
      </section>

      <section className="section section--band">
        <div className="section__inner split">
          <div>
            <h2>Where we train</h2>
            <p>
              {venue
                ? `${venue.name}, ${venue.addressLines.slice(0, 2).join(', ')}.`
                : 'Rec Park Centre, Tākaka.'}{' '}
              More venues can be added as GBTT grows.
            </p>
            <Link className="text-link" to="/locations">
              View map and directions →
            </Link>
          </div>
          <div>
            <h2>Try the apps</h2>
            <p>
              Simulated booking and admin console — localStorage until Firebase is ready. Sticky nav
              keeps you linked to this site.
            </p>
            <Link className="text-link" to="/apps">
              Apps showcase →
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
