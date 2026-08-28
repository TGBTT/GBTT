import type { AppImageId } from '../shared/appAssets'
import { APP_META, appCardSources } from '../shared/appAssets'

interface PictureProps {
  webpSrcSet: string
  jpgSrcSet: string
  fallback: string
  sizes: string
  width: number
  height: number
  alt: string
  className?: string
  loading?: 'lazy' | 'eager'
}

function ResponsivePicture({
  webpSrcSet,
  jpgSrcSet,
  fallback,
  sizes,
  width,
  height,
  alt,
  className,
  loading = 'lazy',
}: PictureProps) {
  return (
    <picture>
      <source type="image/webp" srcSet={webpSrcSet} sizes={sizes} />
      <source type="image/jpeg" srcSet={jpgSrcSet} sizes={sizes} />
      <img
        className={className}
        src={fallback}
        srcSet={jpgSrcSet}
        sizes={sizes}
        alt={alt}
        width={width}
        height={height}
        loading={loading}
        decoding="async"
      />
    </picture>
  )
}

interface CardProps {
  id: AppImageId
  alt?: string
  className?: string
}

export function AppCardImage({ id, alt, className }: CardProps) {
  const card = appCardSources(id)
  return (
    <ResponsivePicture
      {...card}
      alt={alt ?? APP_META[id].alt}
      className={className ?? 'hub-card-image'}
    />
  )
}
