import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  chronologicalSessions,
  currentWeekStart,
  pickCurrentSession,
  sessionWhen,
  sessionWhenLabel,
  shiftWeekStart,
  weekRangeLabel,
} from '@gbtt/shared/studio/firebase/liveSessions'
import type { LiveMember } from '@gbtt/shared/studio/firebase/liveMembers'
import { studioAddMemberToSession } from '@gbtt/shared/studio/studioAuth'
import { formatSessionAttending } from '../shared/fitnessStudio'
import { useLiveSessions, usePendingAttendance, useSessionRoster } from '../hooks/useLiveSessions'
import { RoleCallRoster } from './RoleCallRoster'
import { WorkingOverlay, useWorkingOverlay } from './WorkingOverlay'

type PendingPick = 'first' | 'last' | 'current' | null

interface RoleCallOverlayProps {
  members: Pick<LiveMember, 'uid' | 'name'>[]
  classNames: Record<string, string>
  onClose: () => void
}

/**
 * Full-screen roll call for the session happening now, with previous/next to
 * cover back-to-back classes or marking attendance later from memory.
 */
export function RoleCallOverlay({ members, classNames, onClose }: RoleCallOverlayProps) {
  const thisWeek = currentWeekStart()
  const [weekStart, setWeekStart] = useState(thisWeek)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pendingPick, setPendingPick] = useState<PendingPick>('current')
  const [addMemberId, setAddMemberId] = useState('')
  const [addComplimentary, setAddComplimentary] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const { run: runWithOverlay, overlayProps, busy: overlayBusy } = useWorkingOverlay()
  const emptyWeekSkips = useRef(0)

  const live = useLiveSessions(weekStart)
  const sorted = useMemo(
    () => chronologicalSessions(live.occurrences, weekStart),
    [live.occurrences, weekStart],
  )

  useEffect(() => {
    if (live.status === 'error' || live.status === 'unavailable') {
      setPendingPick(null)
      return
    }
    if (live.status !== 'ready') return
    if (!sorted.length && pendingPick) {
      if (emptyWeekSkips.current >= 8) {
        emptyWeekSkips.current = 0
        setSelectedId(null)
        setPendingPick(null)
        return
      }
      emptyWeekSkips.current += 1
      const direction = pendingPick === 'first' ? 1 : -1
      setPendingPick(pendingPick === 'first' ? 'first' : 'last')
      setWeekStart((current) => shiftWeekStart(current, direction))
      return
    }
    emptyWeekSkips.current = 0
    if (pendingPick === 'first') {
      setSelectedId(sorted[0]?.id ?? null)
      setPendingPick(null)
      return
    }
    if (pendingPick === 'last') {
      setSelectedId(sorted.at(-1)?.id ?? null)
      setPendingPick(null)
      return
    }
    if (pendingPick === 'current') {
      setSelectedId(pickCurrentSession(sorted, weekStart)?.id ?? null)
      setPendingPick(null)
      return
    }
    setSelectedId((current) =>
      current && sorted.some((s) => s.id === current)
        ? current
        : (pickCurrentSession(sorted, weekStart)?.id ?? null),
    )
  }, [live.status, pendingPick, sorted, weekStart])

  const selected = sorted.find((o) => o.id === selectedId)
  const liveRoster = useSessionRoster(live.status === 'ready' ? selectedId : null)
  const { roster, mark: markAttendance } = usePendingAttendance(selectedId, liveRoster.roster)
  const occ = selected ? { ...selected, roster } : undefined

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const goAdjacent = useCallback(
    (direction: -1 | 1) => {
      setActionError(null)
      setAddMemberId('')
      setAddComplimentary(false)
      emptyWeekSkips.current = 0
      const idx = selectedId ? sorted.findIndex((s) => s.id === selectedId) : -1
      const nextIdx = idx + direction
      if (idx >= 0 && nextIdx >= 0 && nextIdx < sorted.length) {
        setSelectedId(sorted[nextIdx].id)
        return
      }
      setPendingPick(direction === 1 ? 'first' : 'last')
      setWeekStart((current) => shiftWeekStart(current, direction))
    },
    [selectedId, sorted],
  )

  const jumpToNow = () => {
    setActionError(null)
    setAddMemberId('')
    setAddComplimentary(false)
    emptyWeekSkips.current = 0
    const nowWeek = currentWeekStart()
    if (weekStart === nowWeek && live.status === 'ready') {
      setSelectedId(pickCurrentSession(sorted, weekStart)?.id ?? null)
      setPendingPick(null)
      return
    }
    setPendingPick('current')
    setWeekStart(nowWeek)
  }

  const nowSessionId =
    weekStart === thisWeek ? pickCurrentSession(sorted, weekStart)?.id : undefined
  const showJumpToNow =
    weekStart !== thisWeek || (nowSessionId != null && selectedId !== nowSessionId)

  const when = occ ? sessionWhen(occ, weekStart) : null
  const className = occ ? (classNames[occ.classTypeId] ?? occ.classTypeId) : ''
  const loadingWeek = live.status === 'loading' || (pendingPick !== null && live.status === 'ready')

  return (
    <div
      className="role-call-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="role-call-overlay__card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="role-call-title"
      >
        <div className="role-call-overlay__top">
          <h2 id="role-call-title">Role call</h2>
          <button type="button" className="btn ghost" onClick={onClose}>
            Done
          </button>
        </div>

        <div className="role-call-overlay__nav">
          <button
            type="button"
            className="btn ghost role-call-overlay__step"
            onClick={() => goAdjacent(-1)}
            disabled={loadingWeek}
            aria-label="Previous session"
          >
            ‹ Previous
          </button>
          <button
            type="button"
            className="btn ghost role-call-overlay__step"
            onClick={() => goAdjacent(1)}
            disabled={loadingWeek}
            aria-label="Next session"
          >
            Next ›
          </button>
        </div>

        {live.status === 'error' ? (
          <p className="form-error">Could not load sessions: {live.error}</p>
        ) : live.status === 'unavailable' ? (
          <p className="hint">The timetable isn't connected in this environment.</p>
        ) : loadingWeek ? (
          <p className="hint">Loading sessions…</p>
        ) : occ ? (
          <div className="role-call-overlay__session">
            <p className="role-call-overlay__class">
              {className || 'Session'} · {occ.dayLabel} {occ.time}
            </p>
            <p className="hint">
              {when ? `${sessionWhenLabel(when)} · ` : null}
              {formatSessionAttending(occ)}
              {weekStart !== thisWeek ? ` · ${weekRangeLabel(weekStart)}` : null}
            </p>
          </div>
        ) : (
          <div className="role-call-overlay__session">
            <p className="role-call-overlay__class">No sessions this week</p>
            <p className="hint">{weekRangeLabel(weekStart)}. Step to an adjacent week.</p>
          </div>
        )}

        {showJumpToNow && !loadingWeek && live.status === 'ready' ? (
          <button type="button" className="link-button" onClick={jumpToNow}>
            Jump to current session
          </button>
        ) : null}

        {occ ? (
          <RoleCallRoster
            roster={occ.roster}
            rosterStatus={liveRoster.status}
            fromCache={liveRoster.fromCache}
            error={actionError}
            members={members}
            addMemberId={addMemberId}
            onAddMemberIdChange={setAddMemberId}
            complimentaryAdd={addComplimentary}
            onComplimentaryAddChange={setAddComplimentary}
            onMarkAttendance={(memberId, attended) => {
              setActionError(null)
              void markAttendance(memberId, attended ? 'attended' : 'booked').then((err) =>
                setActionError(err),
              )
            }}
            onAddMember={() => {
              void (async () => {
                setActionError(null)
                const memberId = addMemberId
                const complimentary = addComplimentary
                const err = await runWithOverlay(
                  () => studioAddMemberToSession(occ.id, memberId, { complimentary }),
                  {
                    working: complimentary
                      ? 'Adding makeup seat…'
                      : 'Adding client to session…',
                    success: complimentary ? 'Makeup seat added!' : 'Client added!',
                  },
                )
                setActionError(err)
                if (!err) {
                  setAddMemberId('')
                  setAddComplimentary(false)
                }
              })()
            }}
            addBusy={overlayBusy}
          />
        ) : null}

        <p className="hint role-call-overlay__hint">
          Previous and next step through the timetable for back-to-back classes or a roll taken later
          from memory.
        </p>
      </div>
      <WorkingOverlay {...overlayProps} />
    </div>
  )
}
