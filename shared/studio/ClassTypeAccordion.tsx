import type {
  LiveClassType,
  LiveExercise,
} from '@gbtt/shared/studio/firebase/liveClassTypes'
import { ClassTypePhoto } from '@gbtt/shared/studio/ClassTypePhoto'

function DetailBlock({ label, text }: { label: string; text: string }) {
  if (!text.trim()) return null
  return (
    <div className="class-type-accordion__block">
      <h4>{label}</h4>
      <p>{text}</p>
    </div>
  )
}

/** Collapsible class card — thumb + summary, expands to full admin-managed detail. */
export function ClassTypeAccordion({
  classType,
  baseUrl,
  exercises = [],
}: {
  classType: LiveClassType
  baseUrl: string
  /** The full exercise catalogue; this filters it to the class's own list. */
  exercises?: LiveExercise[]
}) {
  const listed = classType.exerciseIds
    .map((id) => exercises.find((e) => e.id === id))
    .filter((e): e is LiveExercise => Boolean(e))

  return (
    <details className="class-type-accordion">
      <summary className="class-type-accordion__summary">
        <span className="class-type-accordion__head">
          <span className="class-type-accordion__title">{classType.name}</span>
          <span className="class-type-accordion__blurb">{classType.blurb}</span>
          <span className="class-type-accordion__meta hint">
            Max {classType.cap} · Tap for full details
          </span>
        </span>
        <ClassTypePhoto classType={classType} baseUrl={baseUrl} variant="thumb" />
        <span className="class-type-accordion__chevron" aria-hidden="true" />
      </summary>
      <div className="class-type-accordion__panel">
        <DetailBlock label="Purpose" text={classType.longDescription} />
        <DetailBlock label="Warnings" text={classType.warnings} />
        <DetailBlock label="Restrictions" text={classType.restrictions} />
        <DetailBlock label="Recommendations" text={classType.recommendations} />
        <DetailBlock label="What to bring" text={classType.whatToBring} />
        {listed.length > 0 ? (
          <div className="class-type-accordion__block">
            <h4>Typical exercises</h4>
            <ul className="class-type-accordion__exercises">
              {listed.map((ex) => (
                <li key={ex.id}>{ex.name}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </details>
  )
}
