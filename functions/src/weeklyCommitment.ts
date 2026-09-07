/**
 * Timing rules behind the weekly allowance.
 *
 * A weekly membership buys one session per week, not a seat that can be moved
 * around after the class has effectively happened. Deciding when a week is
 * spent is pure date arithmetic over a timezone and a settings value, and it is
 * the part most likely to be quietly wrong — an hour of drift or a week key off
 * by a day either strands a member for an extra day or hands them a second
 * included class.
 *
 * So it lives here, separate from the Firestore reads in `index.ts`, where it
 * can be tested without an emulator. `index.ts` supplies the documents; this
 * module only does the arithmetic.
 */

/** Offset of `timeZone` from UTC, in ms, at the given instant. */
export function zoneOffsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
    .formatToParts(new Date(utcMs))
    .reduce<Record<string, string>>((acc, p) => ({ ...acc, [p.type]: p.value }), {})

  return (
    Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour) % 24,
      Number(parts.minute),
      Number(parts.second),
    ) - utcMs
  )
}

/**
 * Monday of the week containing `now`, in `timeZone`, as a YYYY-MM-DD key.
 *
 * Resolved in the studio's zone rather than the runtime's, which is UTC in
 * production: on a Monday morning in NZ, UTC is still on Sunday, so a
 * UTC-derived key would name the previous week. That key is what decides which
 * session commits a member's allowance and when the rollover frees them to
 * change slots.
 */
export function weekStartKeyInZone(now: Date, timeZone: string): string {
  // Shifted into the zone, then read back in UTC, so the calendar arithmetic is
  // not re-interpreted by whatever local zone the runtime happens to have.
  const zoned = new Date(now.getTime() + zoneOffsetMs(now.getTime(), timeZone))
  const dow = zoned.getUTCDay()
  zoned.setUTCDate(zoned.getUTCDate() + (dow === 0 ? -6 : 1 - dow))

  const pad = (n: number) => String(n).padStart(2, '0')
  return `${zoned.getUTCFullYear()}-${pad(zoned.getUTCMonth() + 1)}-${pad(zoned.getUTCDate())}`
}

/** Calendar date (YYYY-MM-DD) in a named time zone. */
export function dateKeyInZone(now: Date, timeZone: string): string {
  const zoned = new Date(now.getTime() + zoneOffsetMs(now.getTime(), timeZone))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${zoned.getUTCFullYear()}-${pad(zoned.getUTCMonth() + 1)}-${pad(zoned.getUTCDate())}`
}

/**
 * Whether a class is close enough to have passed the point of no return.
 *
 * The same cutoff governs cancellations and commitment, so there is one
 * definition of "too late" rather than two that could drift apart.
 */
export function isPastTransferCutoff(startsAt: Date, windowHours: number, now: Date): boolean {
  return now.getTime() > startsAt.getTime() - windowHours * 60 * 60 * 1000
}

/** A session as this module needs to see it, whatever it looks like in Firestore. */
export interface TimedSession {
  id: string
  startsAt: Date | null
  cancelled?: boolean
}

export interface SlotCommitment {
  committed: boolean
  sessionId?: string
  startsAt?: Date
}

/**
 * Whether this week's sessions for a slot have spent the member's week.
 *
 * A cancelled session commits nothing — a class the studio pulled was never
 * attended, so the member keeps the week. A session with no `startsAt` cannot
 * be timed either way and is skipped rather than failing the whole call, since
 * refusing every release because one old document is malformed would be worse
 * than the exploit.
 */
export function commitmentFromSessions(
  sessions: TimedSession[],
  windowHours: number,
  now: Date,
): SlotCommitment {
  for (const session of sessions) {
    if (session.cancelled === true) continue
    if (!session.startsAt) continue
    if (isPastTransferCutoff(session.startsAt, windowHours, now)) {
      return { committed: true, sessionId: session.id, startsAt: session.startsAt }
    }
  }

  return { committed: false }
}
