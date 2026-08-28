/** App image asset helpers — responsive cards from primaries. */

export type AppImageId = 'studioflow' | 'classboard'

const CARD_WIDTHS = [480, 800, 1200] as const

export function appAssetBase(id: AppImageId): string {
  return `${import.meta.env.BASE_URL}images/apps/${id}`
}

function srcset(base: string, kind: string, widths: readonly number[], ext: 'jpg' | 'webp') {
  return widths.map((w) => `${base}/${kind}-${w}.${ext} ${w}w`).join(', ')
}

export function appCardSources(id: AppImageId, base = appAssetBase(id)) {
  return {
    webpSrcSet: srcset(base, 'card', CARD_WIDTHS, 'webp'),
    jpgSrcSet: srcset(base, 'card', CARD_WIDTHS, 'jpg'),
    fallback: `${base}/card-800.jpg`,
    sizes: '(max-width: 640px) 100vw, (max-width: 1100px) 50vw, 360px',
    width: 800,
    height: 533,
  }
}

export const APP_META: Record<AppImageId, { title: string; alt: string }> = {
  studioflow: { title: 'Member booking', alt: 'Small group fitness class in a bright gym' },
  classboard: { title: 'Trainer admin', alt: 'Instructor reviewing a class timetable on a board' },
}
