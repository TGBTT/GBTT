import fs from 'node:fs'

const text = fs.readFileSync('osrm-routes.json', 'utf8').replace(/^\uFEFF/, '')
const raw = JSON.parse(text)

const header = `import type { LatLng } from './sailingRoutes'

export interface RoadRoute {
  distanceKm: number
  path: LatLng[]
}

/** Pre-baked OSRM driving geometries for Golden Bay demo place pairs (simulated demos). */
export const ROAD_ROUTES: Record<string, RoadRoute> = {
`

const entries = Object.entries(raw)
  .map(([k, v]) => {
    const path = JSON.stringify(v.path)
    return `  ${JSON.stringify(k)}: { distanceKm: ${v.distanceKm}, path: ${path} },`
  })
  .join('\n')

const footer = `
}

function pairKey(a: string, b: string): string {
  return [a, b].sort().join('|')
}

/** Road-following path from A→B (reversed if stored opposite). Falls back to straight line. */
export function roadPathBetween(
  fromId: string,
  toId: string,
  from: LatLng,
  to: LatLng
): LatLng[] {
  if (fromId === toId) return [from]
  const entry = ROAD_ROUTES[pairKey(fromId, toId)]
  if (!entry?.path?.length) return [from, to]
  const first = entry.path[0]
  const last = entry.path[entry.path.length - 1]
  const startDist =
    Math.hypot(first[0] - from[0], first[1] - from[1]) + Math.hypot(last[0] - to[0], last[1] - to[1])
  const revDist =
    Math.hypot(last[0] - from[0], last[1] - from[1]) + Math.hypot(first[0] - to[0], first[1] - to[1])
  return revDist < startDist ? [...entry.path].reverse() : entry.path
}

/** Road distance km if known, else undefined. */
export function roadDistanceKm(fromId: string, toId: string): number | undefined {
  if (fromId === toId) return 0
  return ROAD_ROUTES[pairKey(fromId, toId)]?.distanceKm
}
`

fs.writeFileSync('src/shared/taxiRoutes.ts', header + entries + footer)
console.log('Wrote taxiRoutes.ts with', entries.length ? Object.keys(raw).length : 0, 'routes')
