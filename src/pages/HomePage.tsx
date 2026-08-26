import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CLASS_OFFERINGS, SITE, simAppHref } from '../data/siteConfig'
import { AREAS, activeVenues, areaById, directionsUrl } from '../data/locations'
import { VenueMap } from '../components/VenueMap'

export default function HomePage() {
  const showAreaFilter = AREAS.length > 1
  const [areaId, setAreaId] = useState<string | undefined>(
    showAreaFilter ? AREAS[0]?.id : undefined,
  )
  const venues = useMemo(() => activeVenues(areaId), [areaId])
  const [selectedId, setSelectedId] = useState<string | undefined>(venues[0]?.id)
  const selected = venues.find((v) => v.id === selectedId) ?? venues[0]

  useEffect(() => {
    if (window.location.hash) {
      const id = window.location.hash.slice(1)
      requestAnimationFrame(() => {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    }
  }, [])

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
            <a className="btn btn--primary" href="#apps">
              Open the apps
            </a>
            <Link className="btn btn--ghost" to="/contact">
              Contact Tom
            </Link>
            <a className="btn btn--ghost" href={SITE.facebook} target="_blank" rel="noreferrer">
              Facebook
            </a>
          </div>
        </div>
      </section>

      <section className="section section--tight" id="about">
        <div className="section__inner">
          <h2>Who can join</h2>
          <p>
            Classes cater to all fitness levels and abilities, with options for kids and teens. Turn up
            ready to move — Tom scales the session so everyone works hard at their own level.
          </p>
        </div>
      </section>

      <section className="section" id="classes">
        <div className="section__inner">
          <p className="eyebrow">Offerings</p>
          <h2>Classes</h2>
          <p className="lede">
            Timetable changes with demand — check{' '}
            <a href={SITE.facebook} target="_blank" rel="noreferrer">
              Facebook
            </a>{' '}
            or <Link to="/contact">contact Tom</Link> for the current week. Live fill and booking live
            in the member app.
          </p>
          <ul className="offering-list">
            {CLASS_OFFERINGS.map((c) => (
              <li key={c.id}>
                <h3>{c.name}</h3>
                <p>{c.blurb}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section section--band" id="location">
        <div className="section__inner">
          <p className="eyebrow">Venue</p>
          <h2>Location</h2>
          <p className="lede lede--on-band">
            Training starts at Rec Park Centre in Tākaka. The map is ready for more venues as GBTT
            grows.
          </p>
          {showAreaFilter ? (
            <div className="chip-rail" role="group" aria-label="Areas">
              {AREAS.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className={`chip${areaId === a.id ? ' is-active' : ''}`}
                  onClick={() => {
                    setAreaId(a.id)
                    setSelectedId(activeVenues(a.id)[0]?.id)
                  }}
                >
                  {a.name}
                </button>
              ))}
            </div>
          ) : null}
          <div className="locations-layout">
            <VenueMap
              areaId={areaId}
              selectedId={selected?.id}
              onSelect={setSelectedId}
              className="venue-map locations-layout__map"
            />
            <ul className="venue-list">
              {venues.map((v) => {
                const area = areaById(v.areaId)
                const active = v.id === selected?.id
                return (
                  <li key={v.id}>
                    <button
                      type="button"
                      className={`venue-card${active ? ' is-active' : ''}`}
                      onClick={() => setSelectedId(v.id)}
                    >
                      <h3>{v.name}</h3>
                      {area ? <p className="venue-card__area">{area.name}</p> : null}
                      {v.addressLines.map((line) => (
                        <p key={line}>{line}</p>
                      ))}
                      {v.notes ? <p className="venue-card__notes">{v.notes}</p> : null}
                    </button>
                    <a className="text-link" href={directionsUrl(v)} target="_blank" rel="noreferrer">
                      Directions →
                    </a>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      </section>

      <section className="section" id="apps">
        <div className="section__inner">
          <p className="eyebrow">Simulated apps</p>
          <h2>Member &amp; trainer apps</h2>
          <p className="lede">
            Firebase is not live yet — these demos use localStorage. Password for all demo logins:{' '}
            <code>demo</code>.
          </p>
          <ul className="demo-showcase home-apps">
            <li>
              <p className="demo-showcase__role">For members &amp; guests</p>
              <h3>Member booking</h3>
              <p>
                See how full each class is, book as a guest, or sign in for a weekly subscription.
                Reshuffle your slots, preview exercises, and choose whether classmates see your name.
              </p>
              <p className="hint">Try <code>alex@demo</code> / <code>demo</code></p>
              <a className="btn btn--primary" href={simAppHref('fitness/studioflow/')}>
                Open member booking
              </a>
            </li>
            <li>
              <p className="demo-showcase__role">For Tom &amp; substitutes</p>
              <h3>Trainer admin</h3>
              <p>
                Staff login for schedule, fill, payments, risk notes, legal copy, subscriber email,
                reminders, cover trainers, and public site text — so day-to-day changes do not need
                code.
              </p>
              <p className="hint">
                Try <code>tom@gbtt</code> or <code>cover@gbtt</code> / <code>demo</code>
              </p>
              <a className="btn btn--primary" href={simAppHref('fitness/classboard/')}>
                Open trainer admin
              </a>
            </li>
          </ul>
        </div>
      </section>
    </>
  )
}
