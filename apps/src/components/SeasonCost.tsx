/**
 * What the coming season will cost this member.
 *
 * The figure is counted from the sessions their locked slots actually produce,
 * so a holiday closure shows up here as a smaller number rather than as an
 * unexplained adjustment on a later invoice. Charging is per seat held, which
 * is why the count is of sessions rather than of classes attended.
 */

import { useEffect, useState } from 'react'
import {
  subscribeSeasons,
  type LiveSeasonsState,
} from '@gbtt/shared/studio/firebase/liveSeasons'
import {
  studioProjectSeasonInvoice,
  type SeasonProjection,
} from '@gbtt/shared/studio/studioAuth'

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`

export function SeasonCost({ lockRevision = '' }: { lockRevision?: string }) {
  const [seasons, setSeasons] = useState<LiveSeasonsState>({ status: 'loading', seasons: [] })
  const [seasonId, setSeasonId] = useState('')
  const [projection, setProjection] = useState<SeasonProjection | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => subscribeSeasons(setSeasons), [])

  // Default to the season covering today, falling back to the next one to
  // start, so the panel opens on whichever term the member is about to pay for.
  useEffect(() => {
    if (seasonId || seasons.status !== 'ready' || !seasons.seasons.length) return
    const today = new Date().toISOString().slice(0, 10)
    const current = seasons.seasons.find((s) => s.startDate <= today && s.endDate >= today)
    const upcoming = seasons.seasons.find((s) => s.startDate > today)
    setSeasonId((current ?? upcoming ?? seasons.seasons[0]).id)
  }, [seasons, seasonId])

  useEffect(() => {
    if (!seasonId) return
    let active = true
    setBusy(true)
    studioProjectSeasonInvoice(seasonId).then((res) => {
      if (!active) return
      setProjection(res)
      setBusy(false)
    })
    return () => {
      active = false
    }
  }, [seasonId, lockRevision])

  if (seasons.status === 'unavailable' || (seasons.status === 'ready' && !seasons.seasons.length)) {
    return null
  }

  return (
    <section className="yacht-panel app-enter app-section">
      <h2>Season cost</h2>

      <label className="field">
        Season
        <select value={seasonId} onChange={(e) => setSeasonId(e.target.value)}>
          {seasons.seasons.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.startDate} → {s.endDate})
            </option>
          ))}
        </select>
      </label>

      {busy ? <p className="hint">Working out your total…</p> : null}
      {projection?.error ? <p className="form-error">{projection.error}</p> : null}

      {projection && !projection.error && !busy ? (
        projection.sessionCount === 0 ? (
          <p className="hint">
            You have no recurring slots locked for this season yet, so there is nothing to total up.
            Lock a slot on the calendar above and the cost will appear here.
          </p>
        ) : (
          <>
            <p className="season-cost-total">
              <strong>{money(projection.totalCents)}</strong> for {projection.sessionCount} session
              {projection.sessionCount === 1 ? '' : 's'} at ${projection.ratePerClass} each
              {projection.planName ? ` on ${projection.planName}` : ''}.
            </p>
            <p className="hint">
              {projection.billingMode === 'upfront'
                ? 'This season is paid up front, so this is the amount invoiced when you enrol.'
                : 'This season is billed at the end, for the seats you actually hold. Holiday closures are already excluded.'}
            </p>
          </>
        )
      ) : null}
    </section>
  )
}
