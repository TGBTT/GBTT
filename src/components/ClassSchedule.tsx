import { useCallback, useEffect, useState } from 'react'
import { WeekSessionCalendar } from '@gbtt/shared/studio/WeekSessionCalendar'
import { ClassTypeDescription } from '@gbtt/shared/studio/ClassTypeDescription'
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
      <ul className="class-type-grid">
        {classTypes.map((c) => (
          <li key={c.id} className="class-type-card">
            <ClassTypeDescription classType={c} baseUrl={import.meta.env.BASE_URL} title={c.name} />
            <p className="hint class-type-card__cap">Max capacity {c.cap} per session</p>
          </li>
        ))}
      </ul>
    </div>
  )
}
