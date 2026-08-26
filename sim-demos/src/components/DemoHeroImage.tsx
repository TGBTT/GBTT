import { useState } from 'react'
import type { DemoImageId } from '../shared/demoAssets'
import { DEMO_META, demoCardSources, demoTileList, shuffleTiles } from '../shared/demoAssets'

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

interface TilesProps {
  id: DemoImageId
  alt?: string
}

interface CardProps {
  id: DemoImageId
  alt?: string
  className?: string
}

/** @deprecated Tile mosaic crops often look empty — prefer DemoCardImage. */
export function DemoImageTiles({ id, alt }: TilesProps) {
  const [tiles] = useState(() => shuffleTiles(demoTileList(id)))
  const label = alt ?? DEMO_META[id].alt
  return (
    <div className="demo-image-tiles" role="img" aria-label={label}>
      {tiles.map((tile, i) => (
        <ResponsivePicture
          key={tile.fallback}
          {...tile}
          alt=""
          className="demo-image-tile"
          loading={i === 0 ? 'eager' : 'lazy'}
        />
      ))}
    </div>
  )
}

/** Full-bleed landscape hero from the industry primary (no weird square crops). */
export function DemoCardImage({ id, alt, className }: CardProps) {
  const card = demoCardSources(id)
  return (
    <ResponsivePicture
      {...card}
      alt={alt ?? DEMO_META[id].alt}
      className={className ?? 'hub-card-image'}
    />
  )
}

/** @deprecated Prefer DemoCardImage. */
export function DemoHeroImage(props: CardProps) {
  return <DemoCardImage {...props} className={props.className ?? 'demo-hero-photo__img'} />
}
