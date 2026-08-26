import { Link } from 'react-router-dom'
import { SITE } from '../data/siteConfig'
import { activeVenues } from '../data/locations'

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
            <Link className="btn btn--primary" to="/contact">
              Contact Tom
            </Link>
            <a className="btn btn--ghost" href={SITE.facebook} target="_blank" rel="noreferrer">
              Facebook
            </a>
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
            <h2>Class styles</h2>
            <p>Sweat, Strong, Mobility, Circuits, and Les Mills BodyBalance.</p>
            <Link className="text-link" to="/classes">
              See offerings →
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
