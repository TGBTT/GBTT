import { useCallback, useEffect, useState } from 'react'
import { WeekSessionCalendar } from '@gbtt/shared/studio/WeekSessionCalendar'
import { ClassTypeAccordion } from '@gbtt/shared/studio/ClassTypeAccordion'
import {
  getClassTypes,
  occurrencesByWeekday,
  reloadStore,
  subscribeStore,
} from '@gbtt/shared/studio/fitnessStudio'
import { simAppHref } from '../data/siteConfig'

/** Live Mon–Fri timetable — same localStorage store as member + trainer apps. */
export function ClassSchedule() {
  const [, tick] = useState(0)
  const refresh = useCallback(() => tick((n) => n + 1), [])

  useEffect(() => {
    reloadStore()
    refresh()
    return subscribeStore(refresh)
  }, [refresh])

  const byDay = occurrencesByWeekday()
  const classTypes = getClassTypes()

  return (
    <div className="class-schedule">
      <WeekSessionCalendar byDay={byDay} mode="public" />
      <p className="class-schedule__hint">
        Counts update when members book. Full sessions are greyed out.{' '}
        <a href={simAppHref('fitness/studioflow/')}>Book in the member app</a>.
      </p>
      <div className="class-schedule__types">
        <h3 className="class-schedule__types-heading">Session types</h3>
        <p className="hint class-schedule__types-intro">
          Tap a class for purpose, warnings, what to bring, and typical exercises.
        </p>
        <ul className="class-type-accordion-list">
          {classTypes.map((c) => (
            <li key={c.id}>
              <ClassTypeAccordion classType={c} baseUrl={import.meta.env.BASE_URL} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
