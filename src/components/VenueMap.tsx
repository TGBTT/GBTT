import { useEffect, useId, useMemo, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { activeVenues, type Venue } from '../data/locations'

interface Props {
  areaId?: string
  selectedId?: string
  onSelect?: (id: string) => void
  className?: string
  zoom?: number
}

export function VenueMap({ areaId, selectedId, onSelect, className, zoom = 14 }: Props) {
  const uid = useId().replace(/:/g, '')
  const mapRef = useRef<L.Map | null>(null)
  const selectRef = useRef(onSelect)
  selectRef.current = onSelect

  const venues = useMemo(() => activeVenues(areaId), [areaId])
  const key = venues.map((v) => `${v.id}:${v.id === selectedId ? 1 : 0}`).join('|')

  useEffect(() => {
    const el = document.getElementById(`gbtt-map-${uid}`)
    if (!el || !venues.length) return

    if (mapRef.current) {
      mapRef.current.remove()
      mapRef.current = null
    }

    const map = L.map(el, { scrollWheelZoom: false, attributionControl: true })
    mapRef.current = map

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      maxZoom: 19,
    }).addTo(map)

    venues.forEach((v) => {
      const selected = v.id === selectedId || (!selectedId && venues.length === 1)
      const marker = L.circleMarker([v.lat, v.lng], {
        radius: selected ? 11 : 8,
        color: '#111',
        fillColor: selected ? '#111' : '#fff',
        fillOpacity: selected ? 1 : 0.95,
        weight: 3,
      }).addTo(map)
      marker.bindTooltip(v.name, { permanent: false })
      marker.on('click', () => selectRef.current?.(v.id))
    })

    if (venues.length > 1) {
      map.fitBounds(
        L.latLngBounds(venues.map((v) => [v.lat, v.lng] as [number, number])),
        { padding: [40, 40] },
      )
    } else {
      map.setView([venues[0].lat, venues[0].lng], zoom)
    }

    const onResize = () => map.invalidateSize()
    window.addEventListener('resize', onResize)
    requestAnimationFrame(() => map.invalidateSize())

    return () => {
      window.removeEventListener('resize', onResize)
      map.remove()
      mapRef.current = null
    }
  }, [uid, key, zoom, venues, selectedId])

  if (!venues.length) {
    return <p className="map-empty">No active venues yet.</p>
  }

  return (
    <div className={className ?? 'venue-map'} role="region" aria-label="Training locations map">
      <div id={`gbtt-map-${uid}`} className="venue-map__canvas" />
    </div>
  )
}

export function venueSummary(venue: Venue): string {
  return venue.addressLines.join(', ')
}
