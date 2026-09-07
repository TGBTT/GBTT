/**
 * Admin screen for loading the existing client list.
 *
 * Tom's clients live in a spreadsheet, so this screen is built around the two
 * ways that list actually arrives: pasted in bulk, or typed a row at a time.
 * Every row is validated in the browser first — a bad address that reaches
 * `createMemberAccount` costs an Auth user and an invite email to undo.
 *
 * Submitting is per-row rather than a batch: one rejected address must not
 * discard the fifteen good ones behind it, so failures stay on screen with
 * their reason and succeeded rows drop away.
 *
 * Below the create form, existing clients can have their weekly session
 * allowance raised so frequent attendees can lock more than their plan tier.
 */

import { useEffect, useMemo, useState } from 'react'
import { studioCreateMemberAccount, studioResendInvite } from '@gbtt/shared/studio/studioAuth'
import {
  isArchivedMember,
  saveMemberClassesPerWeek,
  subscribeMembers,
  type LiveMember,
  type LiveMembersState,
} from '@gbtt/shared/studio/firebase/liveMembers'
import { useLivePricing } from '../hooks/useLivePricing'
import {
  AlphabetFilter,
  compareMembersByName,
  initialOf,
  matchesQuery,
} from './memberDirectory'
import { FieldControl, useFieldSaveFlash } from './FieldSaveFlash'

/** A created account, tracked so a failed invite email can be retried on its own. */
interface Invited {
  name: string
  email: string
  emailSent: boolean
  inviteError: string | null
  resending?: boolean
}

interface Row {
  key: string
  name: string
  email: string
  phone: string
  planId: string
  /** Set once a submit attempt for this row failed. */
  failure?: string
}

let rowSeq = 0
function blankRow(planId: string): Row {
  rowSeq += 1
  return { key: `row-${rowSeq}`, name: '', email: '', phone: '', planId }
}

/**
 * Deliberately loose: the authority on whether an address exists is the invite
 * email arriving, and a stricter pattern only rejects real addresses.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

const HEADER_WORDS = ['name', 'email', 'e-mail', 'phone', 'mobile', 'plan']

/**
 * Split a pasted block into rows.
 *
 * Copying from a spreadsheet gives tabs; saving the same sheet as CSV gives
 * commas. Both are accepted rather than asking Tom which he has. A header row
 * is detected and dropped so pasting the sheet including its titles works.
 */
function parsePasted(text: string, defaultPlan: string): Row[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (!lines.length) return []

  const first = lines[0].toLowerCase()
  const looksLikeHeader = HEADER_WORDS.filter((w) => first.includes(w)).length >= 2
  const body = looksLikeHeader ? lines.slice(1) : lines

  return body.map((line) => {
    const cells = (line.includes('\t') ? line.split('\t') : line.split(',')).map((c) =>
      c.trim().replace(/^"(.*)"$/, '$1'),
    )
    return {
      ...blankRow(defaultPlan),
      name: cells[0] ?? '',
      email: (cells[1] ?? '').toLowerCase(),
      phone: cells[2] ?? '',
      planId: cells[3]?.trim() ? cells[3].trim() : defaultPlan,
    }
  })
}

/** Per-row problems, keyed by row. Empty when the batch is ready to submit. */
function validate(rows: Row[]): Record<string, string> {
  const seen = new Map<string, number>()
  rows.forEach((r) => {
    const email = r.email.trim().toLowerCase()
    if (email) seen.set(email, (seen.get(email) ?? 0) + 1)
  })

  const problems: Record<string, string> = {}
  rows.forEach((r) => {
    const email = r.email.trim().toLowerCase()
    if (!r.name.trim() && !email && !r.phone.trim()) return
    if (!r.name.trim()) problems[r.key] = 'Name is required.'
    else if (!email) problems[r.key] = 'Email is required — the invite is sent to it.'
    else if (!EMAIL_RE.test(email)) problems[r.key] = 'That does not look like an email address.'
    else if ((seen.get(email) ?? 0) > 1) problems[r.key] = 'This email appears twice in this batch.'
  })
  return problems
}

function isBlank(r: Row): boolean {
  return !r.name.trim() && !r.email.trim() && !r.phone.trim()
}

function ExistingClientRow({ member }: { member: LiveMember }) {
  const { flash, isSaved } = useFieldSaveFlash()
  const [error, setError] = useState<string | null>(null)

  return (
    <li className="client-allowance-row">
      <div className="client-allowance-row__meta">
        <strong>{member.name}</strong>
        <span className="hint">
          {member.planId} · {member.email}
          {member.status !== 'active' ? ` · ${member.status}` : ''}
        </span>
      </div>
      <label className="field">
        Included sessions / week
        <FieldControl saved={isSaved('allowance')}>
          <input
            type="number"
            min={0}
            max={14}
            defaultValue={member.classesPerWeek}
            key={`${member.uid}-${member.classesPerWeek}`}
            onBlur={async (e) => {
              const n = Number(e.target.value)
              if (n === member.classesPerWeek) return
              setError(null)
              const err = await saveMemberClassesPerWeek(member.uid, n)
              if (err) {
                setError(err)
                e.target.value = String(member.classesPerWeek)
                return
              }
              flash('allowance')
            }}
          />
        </FieldControl>
      </label>
      {error ? <p className="form-error">{error}</p> : null}
    </li>
  )
}

export function ClientAccounts() {
  const pricing = useLivePricing()
  const plans = pricing.plans
  const defaultPlan = plans.find((p) => p.classesPerWeek === 1)?.id ?? plans[0]?.id ?? 'weekly1'

  const [rows, setRows] = useState<Row[]>([blankRow('weekly1')])
  const [paste, setPaste] = useState('')
  const [pasteNote, setPasteNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState<Invited[]>([])
  const [error, setError] = useState<string | null>(null)

  const [members, setMembers] = useState<LiveMembersState>({ status: 'loading', members: [] })
  const [query, setQuery] = useState('')
  const [letter, setLetter] = useState('')

  useEffect(() => subscribeMembers(setMembers), [])

  // Plans load asynchronously, so the first row is created before the default
  // plan id is known. Adopt it once, without disturbing a row already edited.
  useEffect(() => {
    setRows((current) =>
      current.map((r) => (isBlank(r) && r.planId === 'weekly1' ? { ...r, planId: defaultPlan } : r)),
    )
  }, [defaultPlan])

  const problems = validate(rows)

  const existing = useMemo(() => {
    const list = members.members
      .filter((m) => m.role === 'member' && !isArchivedMember(m))
      .sort(compareMembersByName)
    return list.filter((m) => matchesQuery(m, query)).filter((m) => !letter || initialOf(m) === letter)
  }, [members.members, query, letter])

  const allExisting = useMemo(
    () =>
      members.members
        .filter((m) => m.role === 'member' && !isArchivedMember(m))
        .sort(compareMembersByName),
    [members.members],
  )

  /*
   * The account exists either way — only the email failed. Resending is
   * therefore a mail retry, not an account retry, and it issues a fresh
   * set-password link because the original one may have expired.
   */
  const resend = async (email: string) => {
    setCreated((list) =>
      list.map((c) => (c.email === email ? { ...c, resending: true, inviteError: null } : c)),
    )
    const err = await studioResendInvite(email)
    setCreated((list) =>
      list.map((c) =>
        c.email === email
          ? { ...c, resending: false, emailSent: !err, inviteError: err }
          : c,
      ),
    )
  }
  const fillable = rows.filter((r) => !isBlank(r))
  const canSubmit = fillable.length > 0 && Object.keys(problems).length === 0 && !busy

  const patch = (key: string, change: Partial<Row>) => {
    setRows((current) =>
      current.map((r) => (r.key === key ? { ...r, ...change, failure: undefined } : r)),
    )
  }

  const applyPaste = () => {
    const parsed = parsePasted(paste, defaultPlan)
    if (!parsed.length) {
      setPasteNote('Nothing to read in that paste.')
      return
    }
    // Replace rather than append: the paste is the list, and appending would
    // silently duplicate it if Tom pastes twice.
    setRows(parsed)
    setPaste('')
    setCreated([])
    setPasteNote(
      `Read ${parsed.length} row${parsed.length === 1 ? '' : 's'} — check them below before submitting.`,
    )
  }

  const submit = async () => {
    setBusy(true)
    setError(null)
    setPasteNote(null)
    const succeeded: Invited[] = []
    const remaining: Row[] = []

    for (const row of rows) {
      if (isBlank(row)) continue
      const result = await studioCreateMemberAccount({
        name: row.name,
        email: row.email,
        phone: row.phone,
        planId: row.planId,
        classesPerWeek: plans.find((p) => p.id === row.planId)?.classesPerWeek ?? 1,
      })
      if (result.error) {
        remaining.push({ ...row, failure: result.error })
      } else {
        succeeded.push({
          name: row.name,
          email: row.email.trim().toLowerCase(),
          emailSent: result.inviteEmailSent,
          inviteError: result.inviteError,
        })
      }
    }

    setBusy(false)
    setCreated(succeeded)
    // Failed rows stay put so they can be corrected and resubmitted; a fresh
    // blank row keeps the screen usable when everything went through.
    setRows(remaining.length ? remaining : [blankRow(defaultPlan)])
    if (remaining.length) {
      setError(
        `${remaining.length} row${remaining.length === 1 ? '' : 's'} could not be created — the reason is shown against each. Fix and submit again.`,
      )
    }
  }

  return (
    <>
      <section className="yacht-panel app-enter app-section">
        <h2>Add client accounts</h2>
        <p className="hint">
          Creates each client an account and emails them an invitation to set their own password —
          nobody here is given a password to pass on. Name, email and phone come from your client
          list; the plan can be changed later.
        </p>

        {pricing.status === 'unavailable' ? (
          <p className="form-error">
            Firebase is not configured, so accounts cannot be created from this build.
          </p>
        ) : null}
        {pricing.status === 'error' ? (
          <p className="form-error">Could not load plans: {pricing.error}</p>
        ) : null}

        <details className="client-paste">
          <summary>Paste from a spreadsheet</summary>
          <p className="hint">
            One client per line as <code>name, email, phone</code> — commas or tabs, and a header row
            is ignored. This replaces the rows below so you can check them first.
          </p>
          <label className="field">
            Pasted rows
            <textarea
              rows={6}
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              placeholder={'Name, Email, Phone\nAlex Reed, alex@example.com, 021 555 0101'}
            />
          </label>
          <div className="btn-row">
            <button type="button" className="btn ghost" disabled={!paste.trim()} onClick={applyPaste}>
              Read rows
            </button>
          </div>
        </details>

        {pasteNote ? <p className="form-success">{pasteNote}</p> : null}
        {error ? <p className="form-error">{error}</p> : null}

        {created.length ? (
          <div className="form-success">
            <p>
              Created {created.length} account{created.length === 1 ? '' : 's'}:
            </p>
            <ul>
              {created.map((c) => (
                <li key={c.email}>
                  {c.name} ({c.email}){' '}
                  {c.emailSent ? (
                    <span>— invite emailed</span>
                  ) : (
                    <>
                      <span className="form-error">
                        — the invite email did not send
                        {c.inviteError ? `: ${c.inviteError}` : ''}
                      </span>{' '}
                      <button
                        type="button"
                        className="link-button"
                        disabled={c.resending}
                        onClick={() => void resend(c.email)}
                      >
                        {c.resending ? 'Resending…' : 'Resend invite'}
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <ul className="client-row-list">
          {rows.map((row, index) => (
            <li key={row.key}>
              <div className="client-row-grid">
                <label className="field">
                  Name
                  <input
                    value={row.name}
                    onChange={(e) => patch(row.key, { name: e.target.value })}
                    autoComplete="off"
                  />
                </label>
                <label className="field">
                  Email
                  <input
                    value={row.email}
                    onChange={(e) => patch(row.key, { email: e.target.value })}
                    autoComplete="off"
                    inputMode="email"
                  />
                </label>
                <label className="field">
                  Phone
                  <input
                    value={row.phone}
                    onChange={(e) => patch(row.key, { phone: e.target.value })}
                    autoComplete="off"
                    inputMode="tel"
                  />
                </label>
                <label className="field">
                  Plan
                  <select
                    value={row.planId}
                    onChange={(e) => patch(row.key, { planId: e.target.value })}
                  >
                    {plans.length ? (
                      plans.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))
                    ) : (
                      <option value={row.planId}>{row.planId}</option>
                    )}
                  </select>
                </label>
                <button
                  type="button"
                  className="btn ghost client-row-remove"
                  disabled={busy || (rows.length === 1 && isBlank(row))}
                  onClick={() =>
                    setRows((current) =>
                      current.length === 1
                        ? [blankRow(defaultPlan)]
                        : current.filter((r) => r.key !== row.key),
                    )
                  }
                  aria-label={`Remove row ${index + 1}`}
                >
                  Remove
                </button>
              </div>
              {problems[row.key] ? <p className="form-error">{problems[row.key]}</p> : null}
              {row.failure ? <p className="form-error">Not created: {row.failure}</p> : null}
            </li>
          ))}
        </ul>

        <div className="btn-row">
          <button
            type="button"
            className="btn ghost"
            disabled={busy}
            onClick={() => setRows((current) => [...current, blankRow(defaultPlan)])}
          >
            Add another
          </button>
          <button type="button" className="btn primary" disabled={!canSubmit} onClick={submit}>
            {busy
              ? 'Creating accounts…'
              : `Create ${fillable.length || 0} account${fillable.length === 1 ? '' : 's'} & email invitations`}
          </button>
        </div>
      </section>

      <section className="yacht-panel app-enter app-section">
        <h2>Existing clients</h2>
        <p className="hint">
          Raise included sessions per week when someone comes more often than their plan tier. This
          is what they can lock in — billing uses the same figure.
        </p>

        {members.status === 'loading' ? <p className="hint">Loading clients…</p> : null}
        {members.status === 'error' ? (
          <p className="form-error">Could not load clients: {members.error}</p>
        ) : null}

        {members.status === 'ready' ? (
          <>
            <label className="field">
              Find a client
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Name or email"
                autoComplete="off"
              />
            </label>
            <AlphabetFilter members={allExisting} active={letter} onChange={setLetter} />
            {!allExisting.length ? (
              <p className="hint">No clients on the roll yet.</p>
            ) : !existing.length ? (
              <p className="hint">No clients match that filter.</p>
            ) : (
              <ul className="client-allowance-list">
                {existing.map((m) => (
                  <ExistingClientRow key={m.uid} member={m} />
                ))}
              </ul>
            )}
          </>
        ) : null}
      </section>
    </>
  )
}
