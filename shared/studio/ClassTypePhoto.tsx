import type { ClassType } from '@gbtt/shared/studio/fitnessStudio'
import { classImageSources } from '@gbtt/shared/studio/fitnessStudio'

export function ClassTypePhoto({
  classType,
  baseUrl,
  variant = 'card',
}: {
  classType: ClassType
  baseUrl: string
  variant?: 'card' | 'thumb'
}) {
  const src = classImageSources(classType.id, baseUrl, variant)
  const pictureClass = variant === 'thumb' ? 'class-type-thumb' : 'class-type-card__photo'
  const width = variant === 'thumb' ? 88 : 800
  const height = variant === 'thumb' ? 55 : 450

  return (
    <picture className={pictureClass}>
      <source type="image/webp" srcSet={src.webpSrcSet} sizes={src.sizes} />
      <img
        src={src.fallback}
        srcSet={src.jpgSrcSet}
        sizes={src.sizes}
        alt={`${classType.name} group session`}
        loading="lazy"
        width={width}
        height={height}
      />
    </picture>
  )
}
