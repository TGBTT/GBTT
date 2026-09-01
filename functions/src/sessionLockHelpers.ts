/**
 * Pure helpers for season-scoped locks and per-week skips.
 * Kept separate from index.ts so fan-out rules can be unit-tested without an emulator.
 */

export function skipWeekKey(uid: string, slotId: string, weekStart: string): string {
  return `${uid}|${slotId}|${weekStart}`
}

/** Whether fan-out should book a member into this session for their lock. */
export function shouldFanBookSession(opts: {
  lockSeasonId: string | null
  sessionSeasonId: string
  skippedWeeks: Set<string>
  uid: string
  slotId: string
  weekStart: string
}): boolean {
  const { lockSeasonId, sessionSeasonId, skippedWeeks, uid, slotId, weekStart } = opts
  if (lockSeasonId && sessionSeasonId !== lockSeasonId) return false
  if (skippedWeeks.has(skipWeekKey(uid, slotId, weekStart))) return false
  return true
}

/** Whether a member may take another included seat this week. */
export function weeklyAllowanceRemaining(
  classesPerWeek: number,
  includedHeld: number,
): boolean {
  if (classesPerWeek <= 0) return false
  return includedHeld < classesPerWeek
}
