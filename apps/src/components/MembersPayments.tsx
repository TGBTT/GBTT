/**
 * Members and payments.
 *
 * Everything money-related here comes from Firestore. The owed figure is a
 * `billingPeriods` document written by `calculateBillingPeriod`, and marking a
 * period paid goes through `markBillingPeriodPaid` so the sign-off is recorded
 * against an admin and survives outside the browser it was clicked in.
 *
 * The roll is collapsed to a line per member and filtered rather than listed in
 * full: every member carries their billing periods and admin controls, so an
 * open list of everyone is a wall of detail to scroll past to reach one person.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  isArchivedMember,
  outstandingCents,
  saveMemberDiscount,
  setMemberArchived,
  subscribeBillingPeriods,
  subscribeMembers,
  subscribePlanChangeRequests,
  type LiveBillingPeriod,
  type LiveBillingState,
  type LiveMember,
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

/** The letter a member files under. Anything not A–Z files under '#'. */
function initialOf(member: LiveMember): string {
  const first = member.name.trim().charAt(0).toUpperCase()
  return first >= 'A' && first <= 'Z' ? first : '#'
}

/** Name or email, so a half-remembered address finds someone too. */
function matchesQuery(member: LiveMember, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return member.name.toLowerCase().includes(q) || member.email.toLowerCase().includes(q)
}

/**
 * The initials present in a list, in alphabetical order.
 *
 * Built from what is actually there rather than a fixed A–Z: a letter nobody
 * files under is a button that can only ever empty the list.
 */
function initialsOf(members: LiveMember[]): string[] {
  return [...new Set(members.map(initialOf))].sort()
}

/** A–Z narrowing for an already alphabetical list. */
function AlphabetFilter({
  members,
  active,
  onChange,
}: {
  members: LiveMember[]
  active: string
  onChange: (letter: string) => void
}) {
  const letters = initialsOf(members)
  if (letters.length < 2) return null

  return (
    <div className="alpha-filter" role="group" aria-label="Filter by first letter">
      <button
        type="button"
        className={`chip${active ? '' : ' selected'}`}
        onClick={() => onChange('')}
      >
        All
      </button>
      {letters.map((letter) => (
        <button
          key={letter}
          type="button"
          className={`chip${active === letter ? ' selected' : ''}`}
          aria-pressed={active === letter}
          // Tapping the active letter again clears it, so narrowing never
          // becomes a dead end that needs the All button to escape.
          onClick={() => onChange(active === letter ? '' : letter)}
        >
          {letter}
        </button>
      ))}
    </div>
  )
}

function MemberCard({
  member,
  periods,
  owed,
  role,
  busy,
  onRecalculate,
  onTogglePaid,
  onDiscount,
  onArchive,
}: {
  member: LiveMember
  periods: LiveBillingPeriod[]
  owed: number
  role: string
  busy: boolean
  onRecalculate: () => void
  onTogglePaid: (periodId: string, paid: boolean) => void
  onDiscount: (pct: number) => void
  onArchive: () => void
}) {
  const archived = isArchivedMember(member)

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
        </p>

        {periods.length ? (
          <ul className="billing-period-list">
            {periods.map((p) => (
              <li key={p.id}>
                <label className="exercise-check">
                  <input
                    type="checkbox"
                    checked={p.status === 'paid'}
                    disabled={role !== 'admin' || busy}
                    onChange={(e) => onTogglePaid(p.id, e.target.checked)}
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
          <p className="hint">No billing run yet for this member. Recalculate to produce one.</p>
        )}

        {role === 'admin' ? (
          <div className="member-admin-row">
            <label className="field">
              Discount %
              <input
                type="number"
                min={0}
                max={100}
                defaultValue={member.discountPct}
                onBlur={(e) => onDiscount(Number(e.target.value))}
              />
            </label>
            <button type="button" className="btn ghost" disabled={busy} onClick={onRecalculate}>
              {busy ? 'Working…' : 'Recalculate'}
            </button>
            <button type="button" className="btn ghost" disabled={busy} onClick={onArchive}>
              {archived ? 'Restore to the roll' : 'Archive'}
            </button>
          </div>
        ) : null}
      </div>
    </details>
  )
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
  const [query, setQuery] = useState('')
  const [letter, setLetter] = useState('')
  const [archiveQuery, setArchiveQuery] = useState('')

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
    setError(await saveMemberDiscount(uid, pct))
  }

  // Staff hold accounts on the same roll but are not billed for classes.
  const billableMembers = useMemo(
    () => members.members.filter((m) => m.role === 'member'),
    [members.members],
  )
  const onRoll = billableMembers.filter((m) => !isArchivedMember(m))
  const archivedMembers = billableMembers.filter(isArchivedMember)

  const searched = onRoll.filter((m) => matchesQuery(m, query))
  const shown = letter ? searched.filter((m) => initialOf(m) === letter) : searched
  const archiveShown = archivedMembers.filter((m) => matchesQuery(m, archiveQuery))

  const owedFor = (uid: string) => outstandingCents(billing.byMember[uid] ?? [])

  const cardFor = (m: LiveMember) => (
    <li key={m.uid}>
      <MemberCard
        member={m}
        periods={billing.byMember[m.uid] ?? []}
        owed={owedFor(m.uid)}
        role={role}
        busy={busyUid === m.uid}
        onRecalculate={() => recalculate(m.uid)}
        onTogglePaid={(periodId, paid) => togglePaid(m.uid, periodId, paid)}
        onDiscount={(pct) => changeDiscount(m.uid, pct)}
        onArchive={() => void toggleArchived(m, owedFor(m.uid))}
      />
    </li>
  )

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
