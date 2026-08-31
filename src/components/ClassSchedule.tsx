import { useEffect, useState } from 'react'
import { WeekSessionCalendar } from '@gbtt/shared/studio/WeekSessionCalendar'
import { ClassTypeAccordion } from '@gbtt/shared/studio/ClassTypeAccordion'
import {
  currentWeekStart,
  groupByWeekday,
  subscribeLiveSessions,
  type LiveSessionsState,
} from '@gbtt/shared/studio/firebase/liveSessions'
import {
  subscribeClassTypes,
  subscribeExercises,
  type LiveClassTypesState,
  type LiveExercisesState,
} from '@gbtt/shared/studio/firebase/liveClassTypes'
import { appHref } from '../data/siteConfig'

/**
 * The public Mon–Fri timetable.
 *
 * Reads the same Firestore collections the member app books against, so the
 * times and the spaces-left counts a visitor sees are the real ones. Rules
 * make `sessions` and `classTypes` publicly readable for exactly this — the
 * roster subcollection, which holds who is attending, is not.
 */
export function ClassSchedule() {
  const [sessions, setSessions] = useState<LiveSessionsState>({
    status: 'loading',
    occurrences: [],
  })
  const [catalog, setCatalog] = useState<LiveClassTypesState>({
    status: 'loading',
    classTypes: [],
  })

  const [exercises, setExercises] = useState<LiveExercisesState>({
    status: 'loading',
    exercises: [],
  })

  useEffect(() => subscribeLiveSessions(currentWeekStart(), setSessions), [])
  useEffect(() => subscribeClassTypes(setCatalog), [])
  useEffect(() => subscribeExercises(setExercises), [])

  const classNames = Object.fromEntries(catalog.classTypes.map((c) => [c.id, c.name]))

  const loading = sessions.status === 'loading' || sessions.status === 'unavailable'
  const empty = sessions.status === 'ready' && sessions.occurrences.length === 0

  return (
    <div className="class-schedule">
      <WeekSessionCalendar
        byDay={groupByWeekday(sessions.occurrences)}
        classNames={classNames}
        mode="public"
      />
      <p className="class-schedule__hint">
        {loading ? (
          'Loading this week’s timetable…'
        ) : sessions.status === 'error' ? (
          <>Could not load the timetable just now. Please try again shortly.</>
        ) : empty ? (
          <>
            No classes are scheduled for this week yet.{' '}
            <a href={appHref('fitness/studioflow/')}>Check the member app</a> for what is coming up.
          </>
        ) : (
          <>
            Counts update when members book. Full sessions are greyed out.{' '}
            <a href={appHref('fitness/studioflow/')}>Book in the member app</a>.
          </>
        )}
      </p>
      {catalog.classTypes.some((c) => c.active) ? (
        <div className="class-schedule__types">
          <h3 className="class-schedule__types-heading">Session types</h3>
          <p className="hint class-schedule__types-intro">
            Tap a class for purpose, warnings, what to bring, and typical exercises.
          </p>
          <ul className="class-type-accordion-list">
            {catalog.classTypes
              .filter((c) => c.active)
              .map((c) => (
                <li key={c.id}>
                  <ClassTypeAccordion
                    classType={c}
                    baseUrl={import.meta.env.BASE_URL}
                    exercises={exercises.exercises}
                  />
                </li>
              ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
