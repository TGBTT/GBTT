/**
 * Members and payments.
 *
 * Everything money-related here comes from Firestore. The owed figure is a
 * `billingPeriods` document written by `calculateBillingPeriod`, and marking a
 * period paid goes through `markBillingPeriodPaid` so the sign-off is recorded
 * against an admin and survives outside the browser it was clicked in. The
 * seed store is still rendered when Firebase is unconfigured, so development
 * works offline, but it is never used to show a real balance.
 */

import { useEffect, useState } from 'react'
import {
  outstandingCents,
  saveMemberDiscount,
  subscribeBillingPeriods,
  subscribeMembers,
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
} from '@gbtt/shared/studio/studioAuth'
import {
  calculateMemberOwed,
  confirmSubscriptionChange,
  getMemberAttendance,
  getUsers,
  planById,
  setMemberDiscount,
  setMemberPaid,
} from '../shared/fitnessStudio'

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
  // Seed-store writes are not reactive, so the fallback path re-renders by hand.
  const [, forceRender] = useState(0)

  useEffect(() => subscribeMembers(setMembers), [])
  useEffect(() => subscribeBillingPeriods(setBilling), [])
  useEffect(() => subscribeSeasons(setSeasons), [])

  const usingLive = members.status !== 'unavailable'
  // Read straight through rather than memoising: the seed store is a plain
  // object, so `tick` is the only thing that would invalidate a memo anyway.
  const seedUsers = usingLive ? [] : getUsers().filter((u) => u.role === 'member')

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

  if (!usingLive) {
    return (
      <section className="yacht-panel app-enter app-section">
        <h2>Members &amp; payments</h2>
        <p className="hint">
          Firebase is not configured, so these are seed records for development only — the balances
          below are not real invoices.
        </p>
        <ul className="admin-member-list">
          {seedUsers.map((u) => (
            <li key={u.id}>
              <strong>{u.name}</strong> · {u.email} · {planById(u.planId)?.name ?? u.planId}
              <br />
              <label className="exercise-check">
                <input
                  type="checkbox"
                  checked={u.paid}
                  disabled={role !== 'admin'}
                  onChange={(e) => {
                    setMemberPaid(u.id, e.target.checked, e.target.checked ? 'Marked paid' : 'Unpaid')
                    forceRender((n) => n + 1)
                  }}
                />
                Paid
              </label>
              <p className="hint">
                Attended: {getMemberAttendance(u.id).length} · Owed: ${calculateMemberOwed(u.id).total}
              </p>
              {role === 'admin' ? (
                <label className="field">
                  Discount %
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={u.discountPercent ?? 0}
                    onChange={(e) => {
                      setMemberDiscount(u.id, Number(e.target.value))
                      forceRender((n) => n + 1)
                    }}
                  />
                </label>
              ) : null}
              {u.pendingPlanId && role === 'admin' ? (
                <div className="btn-row">
                  <p className="form-success">Pending change → {planById(u.pendingPlanId)?.name}</p>
                  <button
                    type="button"
                    className="btn primary"
                    onClick={() => {
                      confirmSubscriptionChange(u.id, true)
                      forceRender((n) => n + 1)
                    }}
                  >
                    Confirm payment &amp; apply
                  </button>
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => {
                      confirmSubscriptionChange(u.id, false)
                      forceRender((n) => n + 1)
                    }}
                  >
                    Decline
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    )
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
