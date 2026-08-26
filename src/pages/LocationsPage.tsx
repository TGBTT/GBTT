import { useMemo, useState } from 'react'
import { AREAS, activeVenues, areaById, directionsUrl } from '../data/locations'
import { VenueMap } from '../components/VenueMap'

export default function LocationsPage() {
  const showAreaFilter = AREAS.length > 1
  const [areaId, setAreaId] = useState<string | undefined>(
    showAreaFilter ? AREAS[0]?.id : undefined,
  )
  const venues = useMemo(() => activeVenues(areaId), [areaId])
  const [selectedId, setSelectedId] = useState<string | undefined>(venues[0]?.id)
  const selected = venues.find((v) => v.id === selectedId) ?? venues[0]

  return (
    <section className="section">
      <div className="section__inner">
        <p className="eyebrow">Venues</p>
        <h1>Locations</h1>
        <p className="lede">
          Training starts at Rec Park Centre in Tākaka. The map and catalog are ready for additional
          venues or areas as the business grows.
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
                  const next = activeVenues(a.id)[0]
                  setSelectedId(next?.id)
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
                    <h2>{v.name}</h2>
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
  )
}
