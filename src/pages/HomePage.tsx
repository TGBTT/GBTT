import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { SITE, TRAINER, appHref } from '../data/siteConfig'
import { ClassSchedule } from '../components/ClassSchedule'
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
              Book a class
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

      <section className="section" id="trainer">
        <div className="section__inner trainer">
          <p className="eyebrow">Meet your trainer</p>
          <h2>{TRAINER.name}</h2>
          <p className="trainer__role">{TRAINER.role}</p>
          <div className="trainer__copy">
            {TRAINER.paragraphs.map((p) => (
              <p key={p.slice(0, 48)}>{p}</p>
            ))}
          </div>
          <div className="trainer__cta">
            <Link className="btn btn--primary" to="/contact">
              Contact Tom
            </Link>
            <a className="btn btn--ghost" href={SITE.facebook} target="_blank" rel="noreferrer">
              See classes on Facebook
            </a>
          </div>
        </div>
      </section>

      <section className="section section--band fitforlife" id="fitforlife" aria-labelledby="fitforlife-heading">
        <div className="section__inner fitforlife__inner">
          <h2 id="fitforlife-heading" className="fitforlife__mark">
            {SITE.hashtag}
          </h2>
        </div>
      </section>

      <section className="section section--tight" id="about">
        <div className="section__inner">
          <h2>Who can join</h2>
          <p>
            Classes cater to all fitness levels and abilities, with options for kids and teens. Turn up
            ready to move — Tom scales the session so everyone works hard at their own level. Results
            optional; the hashtag is peer pressure of the friendly kind.
          </p>
        </div>
      </section>

      <section className="section" id="classes">
        <div className="section__inner">
          <p className="eyebrow">Timetable</p>
          <h2>Classes</h2>
          <p className="lede">
            This week&apos;s sessions at Rec Park Centre — attending counts and max capacity stay in
            sync with member booking.
          </p>
          <ClassSchedule />
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
          <p className="eyebrow">Member app</p>
          <h2>Book a class</h2>
          <p className="lede">
            See live fill on the timetable above, then sign in to reserve your slot or drop in as a
            guest.
          </p>
          <div className="book-app-cta">
            <p>
              Weekly subscriptions, reshuffling your sessions, exercise previews, and optional name
              sharing with classmates — all in member booking.
            </p>
            <a className="btn btn--primary" href={appHref('fitness/studioflow/')}>
              Open member booking
            </a>
          </div>
        </div>
      </section>
    </>
  )
}
