import { useCallback, useEffect, useState } from 'react'
import { WeekSessionCalendar } from '@gbtt/shared/studio/WeekSessionCalendar'
import { ClassTypePhoto } from '@gbtt/shared/studio/ClassTypePhoto'
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
            <ClassTypePhoto classType={c} baseUrl={import.meta.env.BASE_URL} />
            <div className="class-type-card__body">
              <h3>{c.name}</h3>
              <p className="class-type-card__blurb">{c.blurb}</p>
              <p className="class-type-card__desc">{c.longDescription}</p>
              <p className="hint">Max capacity {c.cap} per session</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
