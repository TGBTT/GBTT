/**
 * Members and payments.
 *
 * Everything money-related here comes from Firestore. The owed figure is a
 * `billingPeriods` document written by `calculateBillingPeriod`, and marking a
 * period paid goes through `markBillingPeriodPaid` so the sign-off is recorded
 * against an admin and survives outside the browser it was clicked in.
 */

import { useEffect, useState } from 'react'
import {
  outstandingCents,
  saveMemberDiscount,
  subscribeBillingPeriods,
  subscribeMembers,
  subscribePlanChangeRequests,
  type LiveBillingState,
  type LiveMembersState,
} from '@gbtt/shared/studio/firebase/liveMembers'
import {
  subscribeSeasons,
  type LiveSeasonsState,
} from '@gbtt/shared/studio/firebase/liveSeasons'
import {
  studioCalculateBillingPeriod,
  studioMarkBillingPeriodPaid,
  studioResolvePlanChange,
} from '@gbtt/shared/studio/studioAuth'

interface PlanChangeRequest {
  uid: string
  memberName: string
  requestedPlanName: string
}

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`

/** First day of the current month, the default rolling billing period. */
function currentMonthStart(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
}

export function MembersPayments({ role }: { role: string }) {
  const [members, setMembers] = useState<LiveMembersState>({ status: 'loading', members: [] })
  const [billing, setBilling] = useState<LiveBillingState>({ status: 'loading', byMember: {} })
  const [seasons, setSeasons] = useState<LiveSeasonsState>({ status: 'loading', seasons: [] })
  const [range, setRange] = useState('month')
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [busyUid, setBusyUid] = useState<string | null>(null)
  const [planRequests, setPlanRequests] = useState<PlanChangeRequest[]>([])

  useEffect(() => subscribeMembers(setMembers), [])
  useEffect(() => subscribeBillingPeriods(setBilling), [])
  useEffect(() => subscribeSeasons(setSeasons), [])
  useEffect(() => subscribePlanChangeRequests(setPlanRequests), [])

  const resolveRequest = async (uid: string, approve: boolean) => {
    setBusyUid(uid)
    setError(null)
    setNote(null)
    const err = await studioResolvePlanChange(uid, approve)
    setBusyUid(null)
    if (err) setError(err)
    else setNote(approve ? 'Plan change applied.' : 'Plan change declined.')
  }

  const recalculate = async (uid: string) => {
    setBusyUid(uid)
    setError(null)
    setNote(null)
    const res = await studioCalculateBillingPeriod(
      uid,
      range === 'month' ? { periodStart: currentMonthStart() } : { seasonId: range },
    )
    setBusyUid(null)
    if (res.error) {
      setError(res.error)
      return
    }
    setNote(
      `Recalculated ${res.periodId}: ${res.chargeableCount} session${res.chargeableCount === 1 ? '' : 's'} charged, ${money(res.totalCents)} owed.`,
    )
  }

  const togglePaid = async (uid: string, periodId: string, paid: boolean) => {
    setBusyUid(uid)
    setError(null)
    setNote(null)
    const err = await studioMarkBillingPeriodPaid(
      uid,
      periodId,
      paid,
      paid ? 'Payment cleared' : '',
    )
    setBusyUid(null)
    if (err) setError(err)
    else setNote(paid ? `Marked ${periodId} paid.` : `Reopened ${periodId} as owed.`)
  }

  const changeDiscount = async (uid: string, pct: number) => {
    setError(null)
    setError(await saveMemberDiscount(uid, pct))
  }

  return (
    <section className="yacht-panel app-enter app-section">
      <h2>Members &amp; payments</h2>
      <p className="hint">
        Owed comes from the last billing run for that period. Recalculate after roll call, then mark
        a period paid once the money has landed — there is no payment gateway, so this is the record
        of what has cleared.
      </p>

      {error ? <p className="form-error">{error}</p> : null}
      {note ? <p className="form-success">{note}</p> : null}

      {planRequests.length ? (
        <div className="plan-requests">
          <h3>
            Plan change request{planRequests.length === 1 ? '' : 's'} ({planRequests.length})
          </h3>
          <p className="hint">
            Approving switches the member onto the new plan from now. Their existing plan stays in
            force until you do.
          </p>
          <ul className="plan-request-list">
            {planRequests.map((r) => (
              <li key={r.uid}>
                <span>
                  <strong>{r.memberName}</strong> → {r.requestedPlanName}
                </span>
                <span className="btn-row">
                  <button
                    type="button"
                    className="btn primary"
                    disabled={busyUid === r.uid}
                    onClick={() => void resolveRequest(r.uid, true)}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="btn ghost"
                    disabled={busyUid === r.uid}
                    onClick={() => void resolveRequest(r.uid, false)}
                  >
                    Decline
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {members.status === 'error' ? (
        <p className="form-error">Could not load members: {members.error}</p>
      ) : null}
      {billing.status === 'error' ? (
        <p className="form-error">Could not load billing: {billing.error}</p>
      ) : null}

      <label className="field">
        Bill for
        <select value={range} onChange={(e) => setRange(e.target.value)}>
          <option value="month">This month ({currentMonthStart()})</option>
          {seasons.seasons.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.startDate} → {s.endDate})
            </option>
          ))}
        </select>
      </label>

      {members.status === 'loading' ? <p className="hint">Loading members…</p> : null}
      {members.status === 'ready' && !members.members.length ? (
        <p className="hint">No members yet. Accounts appear here once people register.</p>
      ) : null}

      <ul className="admin-member-list">
        {members.members.map((m) => {
          const periods = billing.byMember[m.uid] ?? []
          const owed = outstandingCents(periods)
          return (
            <li key={m.uid}>
              <strong>{m.name}</strong> · {m.email} · {m.planId}
              {m.status !== 'active' ? (
                <span className="week-nav-tag past"> {m.status}</span>
              ) : null}
              <p className="hint">
                Attended {m.totalAttended} · Outstanding <strong>{money(owed)}</strong>
                {m.discountPct ? ` (after ${m.discountPct}% discount)` : ''}
              </p>

              {periods.length ? (
                <ul className="billing-period-list">
                  {periods.map((p) => (
                    <li key={p.id}>
                      <label className="exercise-check">
                        <input
                          type="checkbox"
                          checked={p.status === 'paid'}
                          disabled={role !== 'admin' || busyUid === m.uid}
                          onChange={(e) => togglePaid(m.uid, p.id, e.target.checked)}
                        />
                        <span>
                          {p.seasonName ?? `${p.periodStart} → ${p.periodEnd}`} ·{' '}
                          <strong>{money(p.totalCents)}</strong> · {p.chargeableCount} charged
                          {p.status === 'paid' ? ' · paid' : ' · owed'}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="hint">
                  No billing run yet for this member. Recalculate to produce one.
                </p>
              )}

              {role === 'admin' ? (
                <div className="member-admin-row">
                  <label className="field">
                    Discount %
                    <input
                      type="number"
                      min={0}
                      max={100}
                      defaultValue={m.discountPct}
                      onBlur={(e) => changeDiscount(m.uid, Number(e.target.value))}
                    />
                  </label>
                  <button
                    type="button"
                    className="btn ghost"
                    disabled={busyUid === m.uid}
                    onClick={() => recalculate(m.uid)}
                  >
                    {busyUid === m.uid ? 'Working…' : 'Recalculate'}
                  </button>
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
