import type { ClassType } from '@gbtt/shared/studio/fitnessStudio'
import { classImageSources } from '@gbtt/shared/studio/fitnessStudio'

export function ClassTypePhoto({ classType, baseUrl }: { classType: ClassType; baseUrl: string }) {
  const src = classImageSources(classType.id, baseUrl)
  return (
    <picture className="class-type-card__photo">
      <source type="image/webp" srcSet={src.webpSrcSet} sizes={src.sizes} />
      <img
        src={src.fallback}
        srcSet={src.jpgSrcSet}
        sizes={src.sizes}
        alt={`${classType.name} group session`}
        loading="lazy"
        width={800}
        height={450}
      />
    </picture>
  )
}
