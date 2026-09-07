/**
 * Personal limitations and staff risk notes.
 *
 * The roll is collapsed to a line per member and filtered rather than listed in
 * full: every record carries two text areas, so an open list of everyone is a
 * wall of fields to scroll past to reach one person.
 */

import { useMemo, useState } from 'react'
import {
  isArchivedMember,
  saveMemberClinical,
  type LiveMember,
  type LiveStatus,
} from '@gbtt/shared/studio/firebase/liveMembers'
import {
  AlphabetFilter,
  compareMembersByName,
  initialOf,
  matchesQuery,
} from './memberDirectory'

function notePreview(member: LiveMember): string {
  const bits: string[] = []
  if (member.limitations.trim()) bits.push('limitations')
  if (member.riskNotes.trim()) bits.push('staff notes')
  if (isArchivedMember(member)) bits.push('archived')
  return bits.length ? bits.join(' · ') : 'nothing on file'
}

function RiskCard({ member }: { member: LiveMember }) {
  return (
    <details className="member-card risk-card">
      <summary className="member-card__summary">
        <span className="member-card__name">{member.name}</span>
        <span className="member-card__meta hint">{notePreview(member)}</span>
      </summary>
      <div className="member-card__panel">
        <p className="hint">{member.email}</p>
        <label className="field">
          Limitations (member-reported)
          <textarea
            rows={2}
            defaultValue={member.limitations}
            onBlur={(e) => {
              if (e.target.value === member.limitations) return
              void saveMemberClinical(member.uid, { limitations: e.target.value })
            }}
          />
        </label>
        <label className="field">
          Observed risk notes (staff)
          <textarea
            rows={2}
            defaultValue={member.riskNotes}
            onBlur={(e) => {
              if (e.target.value === member.riskNotes) return
              void saveMemberClinical(member.uid, { riskNotes: e.target.value })
            }}
          />
        </label>
      </div>
    </details>
  )
}

export function RiskNotes({
  members,
  status,
  error,
}: {
  members: LiveMember[]
  status: LiveStatus
  error?: string
}) {
  const [query, setQuery] = useState('')
  const [letter, setLetter] = useState('')

  const alphabetical = useMemo(
    () => [...members].sort(compareMembersByName),
    [members],
  )
  const searched = alphabetical.filter((m) => matchesQuery(m, query))
  const shown = letter ? searched.filter((m) => initialOf(m) === letter) : searched

  return (
    <section className="yacht-panel app-enter app-section">
      <h2>Personal limitations &amp; risk</h2>
      <p className="hint">
        Search or jump by letter, then tap a name to read or edit notes. Everyone stays collapsed so
        the list stays scannable.
      </p>

      {status === 'loading' ? <p className="hint">Loading clients…</p> : null}
      {status === 'error' ? <p className="form-error">Could not load clients: {error}</p> : null}
      {status === 'ready' && !members.length ? (
        <p className="hint">No clients yet. Notes appear here once accounts exist.</p>
      ) : null}

      {members.length ? (
        <>
          <label className="field member-search">
            Find a member
            <input
              type="search"
              value={query}
              placeholder="Name or email"
              onChange={(e) => {
                setQuery(e.target.value)
                setLetter('')
              }}
            />
          </label>

          <AlphabetFilter members={searched} active={letter} onChange={setLetter} />

          <p className="hint">
            {shown.length === members.length
              ? `${members.length} client${members.length === 1 ? '' : 's'} · tap a name for notes`
              : `${shown.length} of ${members.length} client${members.length === 1 ? '' : 's'}`}
          </p>

          {shown.length ? (
            <ul className="admin-member-list">
              {shown.map((member) => (
                <li key={member.uid}>
                  <RiskCard member={member} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="hint">Nobody matches that search.</p>
          )}
        </>
      ) : null}
    </section>
  )
}
