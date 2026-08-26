/** Multi-venue / multi-area catalog — add rows as GBTT expands; map reads this only. */

export interface Area {
  id: string
  name: string
}

export interface Venue {
  id: string
  name: string
  areaId: string
  addressLines: string[]
  lat: number
  lng: number
  active: boolean
  notes?: string
}

export const AREAS: Area[] = [{ id: 'golden-bay', name: 'Golden Bay' }]

export const VENUES: Venue[] = [
  {
    id: 'rec-park-centre',
    name: 'Rec Park Centre',
    areaId: 'golden-bay',
    addressLines: ['2032 Takaka Valley Highway', 'Tākaka 7110', 'New Zealand'],
    /** Approx. Rec Park Centre, Tākaka — verified against public listings. */
    lat: -40.86996,
    lng: 172.81699,
    active: true,
    notes: 'Group workout classes with Tom',
  },
]

export function areaById(id: string): Area | undefined {
  return AREAS.find((a) => a.id === id)
}

export function activeVenues(areaId?: string): Venue[] {
  return VENUES.filter((v) => v.active && (!areaId || v.areaId === areaId))
}

export function directionsUrl(venue: Venue): string {
  const q = encodeURIComponent(`${venue.name}, ${venue.addressLines.join(', ')}`)
  return `https://www.google.com/maps/search/?api=1&query=${q}`
}

export function mapsQueryUrl(venue: Venue): string {
  return `https://www.google.com/maps/search/?api=1&query=${venue.lat},${venue.lng}`
}
