import type { ClassType } from '@gbtt/shared/studio/fitnessStudio'
import { ClassTypePhoto } from '@gbtt/shared/studio/ClassTypePhoto'

export function ClassTypeDescription({
  classType,
  baseUrl,
  title,
  showBlurb = true,
  showLongDescription = true,
}: {
  classType: ClassType
  baseUrl: string
  title?: string
  showBlurb?: boolean
  showLongDescription?: boolean
}) {
  return (
    <div className="class-type-desc">
      <ClassTypePhoto classType={classType} baseUrl={baseUrl} variant="thumb" />
      <div className="class-type-desc__body">
        {title ? <h3>{title}</h3> : null}
        {showBlurb ? <p className="class-type-desc__blurb">{classType.blurb}</p> : null}
        {showLongDescription ? (
          <p className="class-type-desc__text">{classType.longDescription}</p>
        ) : null}
      </div>
    </div>
  )
}
