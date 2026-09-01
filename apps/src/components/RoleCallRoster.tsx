import type { LiveMember } from '@gbtt/shared/studio/firebase/liveMembers'
import type { LiveStatus } from '@gbtt/shared/studio/firebase/liveSessions'
import type { RosterEntry } from '@gbtt/shared/studio/fitnessStudio'

interface RoleCallRosterProps {
  heading?: string
  roster: RosterEntry[]
  rosterStatus: LiveStatus
  fromCache?: boolean
  error: string | null
  members: Pick<LiveMember, 'uid' | 'name'>[]
  addMemberId: string
  onAddMemberIdChange: (id: string) => void
  onMarkAttendance: (memberId: string, attended: boolean) => void
  onAddMember: () => void
  addBusy?: boolean
}

/** Tick list + walk-in add, shared by the calendar detail and the Role call overlay. */
export function RoleCallRoster({
  heading,
  roster,
  rosterStatus,
  fromCache,
  error,
  members,
  addMemberId,
  onAddMemberIdChange,
  onMarkAttendance,
  onAddMember,
  addBusy = false,
}: RoleCallRosterProps) {
  return (
    <div className="role-call-panel">
      {heading ? <h3>{heading}</h3> : null}
      {error ? <p className="form-error">{error}</p> : null}
      {rosterStatus === 'loading' ? <p className="hint">Loading roster…</p> : null}
      {fromCache ? (
        <p className="hint">Showing the last roster while we check for changes…</p>
      ) : null}
      {rosterStatus === 'ready' && !roster.length ? (
        <p className="hint">Nobody booked into this session yet.</p>
      ) : null}
      <ul className="role-call-list">
        {roster.map((r) => (
          <li key={`${r.memberId ?? r.displayName}`}>
            <label className={`exercise-check${r.status === 'attended' ? ' on' : ''}`}>
              <input
                type="checkbox"
                checked={r.status === 'attended'}
                onChange={(e) => {
                  if (!r.memberId) return
                  onMarkAttendance(r.memberId, e.target.checked)
                }}
              />
              <span>
                {r.displayName}
                {r.kind === 'guest' ? ' *' : ''}
                {r.bookedBy === 'admin' ? ' (admin added)' : ''}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="add-exercise-row">
        <select
          value={addMemberId}
          onChange={(e) => onAddMemberIdChange(e.target.value)}
          aria-label="Add member to session"
        >
          <option value="">Add client to session…</option>
          {members
            .filter((u) => !roster.some((r) => r.memberId === u.uid))
            .map((u) => (
              <option key={u.uid} value={u.uid}>
                {u.name}
              </option>
            ))}
        </select>
        <button
          type="button"
          className="btn ghost"
          disabled={!addMemberId || addBusy}
          onClick={onAddMember}
        >
          Add
        </button>
      </div>
    </div>
  )
}
