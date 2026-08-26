/** Demo image asset helpers — responsive cards + square tiles cut from primaries. */

export type DemoImageId = 'studioflow' | 'classboard'

const CARD_WIDTHS = [480, 800, 1200] as const
const TILE_WIDTHS = [360, 720] as const
export const DEMO_TILE_COUNT = 4

export function demoAssetBase(id: DemoImageId): string {
  return `${import.meta.env.BASE_URL}images/demos/${id}`
}

function srcset(base: string, kind: string, widths: readonly number[], ext: 'jpg' | 'webp') {
  return widths.map((w) => `${base}/${kind}-${w}.${ext} ${w}w`).join(', ')
}

export function demoCardSources(id: DemoImageId, base = demoAssetBase(id)) {
  return {
    webpSrcSet: srcset(base, 'card', CARD_WIDTHS, 'webp'),
    jpgSrcSet: srcset(base, 'card', CARD_WIDTHS, 'jpg'),
    fallback: `${base}/card-800.jpg`,
    sizes: '(max-width: 640px) 100vw, (max-width: 1100px) 50vw, 360px',
    width: 800,
    height: 533,
  }
}

export function demoTileSources(id: DemoImageId, index: number, base = demoAssetBase(id)) {
  const kind = `tile-${index}`
  return {
    webpSrcSet: srcset(base, kind, TILE_WIDTHS, 'webp'),
    jpgSrcSet: srcset(base, kind, TILE_WIDTHS, 'jpg'),
    fallback: `${base}/${kind}-720.jpg`,
    sizes: '(max-width: 640px) 45vw, (max-width: 1100px) 22vw, 250px',
    width: 720,
    height: 720,
  }
}

export function demoTileList(id: DemoImageId, base = demoAssetBase(id)) {
  return Array.from({ length: DEMO_TILE_COUNT }, (_, i) => demoTileSources(id, i, base))
}

export function shuffleTiles<T>(items: readonly T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export const DEMO_META: Record<DemoImageId, { title: string; alt: string }> = {
  studioflow: { title: 'Studio Flow', alt: 'Small group fitness class in a bright gym' },
  classboard: { title: 'Class Board', alt: 'Instructor reviewing a class timetable on a board' },
}
