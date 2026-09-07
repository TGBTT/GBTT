/**
 * Members and payments.
 *
 * Invoices come from `calculateBillingPeriod` (subscription weeks × rate).
 * Cash and bank deposits are recorded on the payment ledger; balance is
 * invoiced owed minus payments. Manual adjustments write an exception that
 * the next recalculate folds into the invoice.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  invoicedOwedCents,
  isArchivedMember,
  outstandingCents,
  paymentsTotalCents,
  saveBillingAdjustment,
  saveMemberDiscount,
  setMemberArchived,
  subscribeBillingPeriods,
  subscribeMembers,
  subscribePayments,
  subscribePlanChangeRequests,
  type LiveBillingPeriod,
  type LiveBillingState,
  type LiveMember,
  type LiveMembersState,
  type LivePayment,
  type LivePaymentsState,
  type PaymentMethod,
} from '@gbtt/shared/studio/firebase/liveMembers'
import {
  subscribeSeasons,
  type LiveSeasonsState,
} from '@gbtt/shared/studio/firebase/liveSeasons'
import {
  studioCalculateBillingPeriod,
  studioDeleteMemberPayment,
  studioRecordMemberPayment,
  studioResolvePlanChange,
} from '@gbtt/shared/studio/studioAuth'
import {
  AlphabetFilter,
  compareMembersByName,
  initialOf,
  matchesQuery,
} from './memberDirectory'
import { FieldControl, useFieldSaveFlash } from './FieldSaveFlash'

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

function todayKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function MemberCard({
  member,
  periods,
  payments,
  owed,
  role,
  busy,
  onRecalculate,
  onDiscount,
  onArchive,
  onRecordPayment,
  onDeletePayment,
  onAdjust,
}: {
  member: LiveMember
  periods: LiveBillingPeriod[]
  payments: LivePayment[]
  owed: number
  role: string
  busy: boolean
  onRecalculate: () => void
  onDiscount: (pct: number) => Promise<string | null>
  onArchive: () => void
  onRecordPayment: (input: {
    amountCents: number
    method: PaymentMethod
    paidOn: string
    note: string
  }) => Promise<string | null>
  onDeletePayment: (paymentId: string) => Promise<string | null>
  onAdjust: (dollars: number, note: string) => Promise<string | null>
}) {
  const archived = isArchivedMember(member)
  const { flash, isSaved } = useFieldSaveFlash()
  const invoiced = invoicedOwedCents(periods)
  const paid = paymentsTotalCents(payments)

  const [amount, setAmount] = useState('')
  const [paidOn, setPaidOn] = useState(todayKey)
  const [method, setMethod] = useState<PaymentMethod>('bank')
  const [payNote, setPayNote] = useState('')
  const [adjustDollars, setAdjustDollars] = useState('')
  const [adjustNote, setAdjustNote] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)

  return (
    <details className="member-card">
      <summary className="member-card__summary">
        <span className="member-card__name">{member.name}</span>
        <span className="member-card__meta hint">
          {member.planId}
          {member.status !== 'active' ? (
            <span className="week-nav-tag past"> {member.status}</span>
          ) : null}{' '}
          · {owed > 0 ? <strong>{money(owed)} owed</strong> : 'nothing owed'} ·{' '}
          {member.totalAttended} attended
        </span>
      </summary>

      <div className="member-card__panel">
        <p className="hint">
          {member.email}
          {member.discountPct ? ` · ${member.discountPct}% discount` : ''}
          {` · ${money(invoiced)} invoiced · ${money(paid)} paid`}
        </p>

        {periods.length ? (
          <ul className="billing-period-list">
            {periods.map((p) => (
              <li key={p.id}>
                <span>
                  {p.seasonName ?? `${p.periodStart} → ${p.periodEnd}`} ·{' '}
                  <strong>{money(p.totalCents)}</strong> · {p.chargeableCount} charged
                  {p.status === 'paid' ? ' · marked paid' : ' · open'}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="hint">No billing run yet for this member. Recalculate to produce one.</p>
        )}

        {payments.length ? (
          <ul className="payment-ledger-list">
            {payments.map((p) => (
              <li key={p.id}>
                <span>
                  {p.paidOn} · {p.method} · <strong>{money(p.amountCents)}</strong>
                  {p.note ? ` · ${p.note}` : ''}
                </span>
                {role === 'admin' ? (
                  <button
                    type="button"
                    className="link-button"
                    disabled={busy}
                    onClick={() => void onDeletePayment(p.id)}
                  >
                    Remove
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="hint">No payments recorded yet.</p>
        )}

        {localError ? <p className="form-error">{localError}</p> : null}

        {role === 'admin' ? (
          <>
            <div className="payment-entry-row">
              <label className="field">
                Amount $
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </label>
              <label className="field">
                Date
                <input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
              </label>
              <label className="field">
                Method
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value === 'cash' ? 'cash' : 'bank')}
                >
                  <option value="bank">Bank</option>
                  <option value="cash">Cash</option>
                </select>
              </label>
              <label className="field">
                Note
                <input value={payNote} onChange={(e) => setPayNote(e.target.value)} />
              </label>
              <button
                type="button"
                className="btn ghost"
                disabled={busy || !amount}
                onClick={async () => {
                  setLocalError(null)
                  const dollars = Number(amount)
                  if (!Number.isFinite(dollars) || dollars <= 0) {
                    setLocalError('Enter a payment amount greater than zero.')
                    return
                  }
                  const err = await onRecordPayment({
                    amountCents: Math.round(dollars * 100),
                    method,
                    paidOn,
                    note: payNote,
                  })
                  if (err) {
                    setLocalError(err)
                    return
                  }
                  setAmount('')
                  setPayNote('')
                }}
              >
                Record payment
              </button>
            </div>

            <div className="payment-entry-row">
              <label className="field">
                Adjust owed $
                <input
                  type="number"
                  step="0.01"
                  value={adjustDollars}
                  onChange={(e) => setAdjustDollars(e.target.value)}
                  placeholder="+ or −"
                />
              </label>
              <label className="field">
                Reason
                <input value={adjustNote} onChange={(e) => setAdjustNote(e.target.value)} />
              </label>
              <button
                type="button"
                className="btn ghost"
                disabled={busy || !adjustDollars}
                onClick={async () => {
                  setLocalError(null)
                  const dollars = Number(adjustDollars)
                  if (!Number.isFinite(dollars) || dollars === 0) {
                    setLocalError('Enter a non-zero adjustment.')
                    return
                  }
                  const err = await onAdjust(dollars, adjustNote)
                  if (err) {
                    setLocalError(err)
                    return
                  }
                  setAdjustDollars('')
                  setAdjustNote('')
                }}
              >
                Adjust &amp; recalculate
              </button>
            </div>

            <div className="member-admin-row">
              <label className="field">
                Discount %
                <FieldControl saved={isSaved('discount')}>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    defaultValue={member.discountPct}
                    onBlur={async (e) => {
                      const pct = Number(e.target.value)
                      if (pct === member.discountPct) return
                      const err = await onDiscount(pct)
                      if (!err) flash('discount')
                    }}
                  />
                </FieldControl>
              </label>
              <button type="button" className="btn ghost" disabled={busy} onClick={onRecalculate}>
                {busy ? 'Working…' : 'Recalculate'}
              </button>
              <button type="button" className="btn ghost" disabled={busy} onClick={onArchive}>
                {archived ? 'Restore to the roll' : 'Archive'}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </details>
  )
}

export function MembersPayments({ role }: { role: string }) {
  const [members, setMembers] = useState<LiveMembersState>({ status: 'loading', members: [] })
  const [billing, setBilling] = useState<LiveBillingState>({ status: 'loading', byMember: {} })
  const [payments, setPayments] = useState<LivePaymentsState>({ status: 'loading', byMember: {} })
  const [seasons, setSeasons] = useState<LiveSeasonsState>({ status: 'loading', seasons: [] })
  const [range, setRange] = useState('month')
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [busyUid, setBusyUid] = useState<string | null>(null)
  const [planRequests, setPlanRequests] = useState<PlanChangeRequest[]>([])
  const [query, setQuery] = useState('')
  const [letter, setLetter] = useState('')
  const [archiveQuery, setArchiveQuery] = useState('')

  useEffect(() => subscribeMembers(setMembers), [])
  useEffect(() => subscribeBillingPeriods(setBilling), [])
  useEffect(() => subscribePayments(setPayments), [])
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
      `Recalculated ${res.periodId}: ${res.chargeableCount} session${res.chargeableCount === 1 ? '' : 's'} charged, ${money(res.totalCents)} invoiced.`,
    )
  }

  const recordPayment = async (
    uid: string,
    input: { amountCents: number; method: PaymentMethod; paidOn: string; note: string },
  ) => {
    setBusyUid(uid)
    setError(null)
    setNote(null)
    const err = await studioRecordMemberPayment({ uid, ...input })
    setBusyUid(null)
    if (err) {
      setError(err)
      return err
    }
    setNote(`Recorded ${money(input.amountCents)} ${input.method} payment.`)
    return null
  }

  const deletePayment = async (uid: string, paymentId: string) => {
    setBusyUid(uid)
    setError(null)
    setNote(null)
    const err = await studioDeleteMemberPayment(uid, paymentId)
    setBusyUid(null)
    if (err) {
      setError(err)
      return err
    }
    setNote('Payment removed.')
    return null
  }

  const adjustOwed = async (uid: string, dollars: number, reason: string) => {
    setBusyUid(uid)
    setError(null)
    setNote(null)
    const err = await saveBillingAdjustment(uid, Math.round(dollars * 100), reason)
    if (err) {
      setBusyUid(null)
      setError(err)
      return err
    }
    const res = await studioCalculateBillingPeriod(
      uid,
      range === 'month' ? { periodStart: currentMonthStart() } : { seasonId: range },
    )
    setBusyUid(null)
    if (res.error) {
      setError(res.error)
      return res.error
    }
    setNote(`Adjustment saved and invoice recalculated (${money(res.totalCents)}).`)
    return null
  }

  /**
   * Archiving warns about an unpaid balance rather than refusing it: people
   * leave owing money, and hiding that from the person doing the archiving is
   * worse than letting them decide. The debt itself is untouched either way.
   */
  const toggleArchived = async (member: LiveMember, owed: number) => {
    const archived = isArchivedMember(member)

    if (!archived) {
      const owing =
        owed > 0
          ? `\n\n${member.name} still owes ${money(owed)}. Archiving does not clear that — the billing periods stay on the account.`
          : ''
      const confirmed = confirm(
        `Archive ${member.name}?${owing}\n\n` +
          `They come off the working roll and stop receiving studio email. Attendance and ` +
          `billing history is kept, and you can restore them at any time.`,
      )
      if (!confirmed) return
    }

    setBusyUid(member.uid)
    setError(null)
    setNote(null)
    const err = await setMemberArchived(member, !archived)
    setBusyUid(null)
    if (err) setError(err)
    else setNote(archived ? `${member.name} restored to the roll.` : `${member.name} archived.`)
  }

  const changeDiscount = async (uid: string, pct: number) => {
    setError(null)
    const err = await saveMemberDiscount(uid, pct)
    setError(err)
    return err
  }

  // Staff hold accounts on the same roll but are not billed for classes.
  const billableMembers = useMemo(
    () => members.members.filter((m) => m.role === 'member'),
    [members.members],
  )
  const onRoll = billableMembers.filter((m) => !isArchivedMember(m)).sort(compareMembersByName)
  const archivedMembers = billableMembers.filter(isArchivedMember).sort(compareMembersByName)

  const searched = onRoll.filter((m) => matchesQuery(m, query))
  const shown = letter ? searched.filter((m) => initialOf(m) === letter) : searched
  const archiveShown = archivedMembers.filter((m) => matchesQuery(m, archiveQuery))

  const owedFor = (uid: string) =>
    outstandingCents(billing.byMember[uid] ?? [], payments.byMember[uid] ?? [])

  const cardFor = (m: LiveMember) => (
    <li key={m.uid}>
      <MemberCard
        member={m}
        periods={billing.byMember[m.uid] ?? []}
        payments={payments.byMember[m.uid] ?? []}
        owed={owedFor(m.uid)}
        role={role}
        busy={busyUid === m.uid}
        onRecalculate={() => recalculate(m.uid)}
        onDiscount={(pct) => changeDiscount(m.uid, pct)}
        onArchive={() => void toggleArchived(m, owedFor(m.uid))}
        onRecordPayment={(input) => recordPayment(m.uid, input)}
        onDeletePayment={(paymentId) => deletePayment(m.uid, paymentId)}
        onAdjust={(dollars, reason) => adjustOwed(m.uid, dollars, reason)}
      />
    </li>
  )

  return (
    <section className="yacht-panel app-enter app-section">
      <h2>Members &amp; payments</h2>
      <p className="hint">
        Recalculate builds the invoice from their weekly subscription (sessions/week × rate) from
        enrolment, not from role-call. Record cash or bank deposits against the balance — there is
        no payment gateway.
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
      {payments.status === 'error' ? (
        <p className="form-error">Could not load payments: {payments.error}</p>
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
      {members.status === 'ready' && !billableMembers.length ? (
        <p className="hint">No members yet. Accounts appear here once people register.</p>
      ) : null}

      {onRoll.length ? (
        <>
          <label className="field member-search">
            Find a member
            <input
              type="search"
              value={query}
              placeholder="Name or email"
              // Typing and the A–Z are alternative ways to narrow, so a search
              // never fights a letter that has already ruled everyone out.
              onChange={(e) => {
                setQuery(e.target.value)
                setLetter('')
              }}
            />
          </label>

          <AlphabetFilter members={searched} active={letter} onChange={setLetter} />

          <p className="hint">
            {shown.length === onRoll.length
              ? `${onRoll.length} member${onRoll.length === 1 ? '' : 's'} on the roll · tap a name for billing and controls`
              : `${shown.length} of ${onRoll.length} member${onRoll.length === 1 ? '' : 's'}`}
          </p>

          {shown.length ? (
            <ul className="admin-member-list">{shown.map(cardFor)}</ul>
          ) : (
            <p className="hint">Nobody on the roll matches that. Check the archive below.</p>
          )}
        </>
      ) : null}

      {archivedMembers.length ? (
        <details className="archive-panel">
          <summary>
            <strong>Archive</strong> ({archivedMembers.length} member
            {archivedMembers.length === 1 ? '' : 's'})
          </summary>
          <p className="hint">
            Off the working roll and no longer emailed, with attendance and billing history intact.
            Restore anyone who comes back.
          </p>
          <label className="field member-search">
            Search the archive
            <input
              type="search"
              value={archiveQuery}
              placeholder="Name or email"
              onChange={(e) => setArchiveQuery(e.target.value)}
            />
          </label>
          {archiveShown.length ? (
            <ul className="admin-member-list">{archiveShown.map(cardFor)}</ul>
          ) : (
            <p className="hint">Nobody in the archive matches that.</p>
          )}
        </details>
      ) : null}
    </section>
  )
}
