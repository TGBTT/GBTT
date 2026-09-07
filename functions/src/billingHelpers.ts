/**
 * Pure helpers for subscription-week billing.
 * Kept separate from index.ts so week math can be unit-tested without an emulator.
 */

export interface SeasonBreakLike {
  startDate: string
  endDate: string
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Monday of the week containing `dateKey` (YYYY-MM-DD). */
export function mondayKeyOf(dateKeyStr: string): string {
  const d = parseDateKey(dateKeyStr)
  const dow = d.getDay()
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow))
  return dateKey(d)
}

/**
 * Enrolment date as YYYY-MM-DD from membership.enrolledAt, or a Timestamp-like,
 * or an ISO string on createdAt / approvedAt.
 */
export function enrolmentDateKey(input: {
  enrolledAt?: unknown
  createdAt?: unknown
  approvedAt?: unknown
}): string | null {
  const enrolled = asDateKey(input.enrolledAt)
  if (enrolled) return enrolled
  const approved = asDateKey(input.approvedAt)
  if (approved) return approved
  return asDateKey(input.createdAt)
}

function asDateKey(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === 'string') {
    const day = value.slice(0, 10)
    return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null
  }
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    const d = (value as { toDate: () => Date }).toDate()
    if (d instanceof Date && !Number.isNaN(d.getTime())) return dateKey(d)
  }
  if (typeof value === 'object' && value !== null && '_seconds' in value) {
    const d = new Date(Number((value as { _seconds: number })._seconds) * 1000)
    if (!Number.isNaN(d.getTime())) return dateKey(d)
  }
  return null
}

function isClosed(day: string, breaks: SeasonBreakLike[]): boolean {
  return breaks.some((b) => day >= b.startDate && day <= b.endDate)
}

/**
 * Mondays that overlap [periodStart, periodEnd], on/after enrolmentWeekStart,
 * with at least one weekday not fully covered by closures (when breaks given).
 */
export function billableWeekStarts(opts: {
  periodStart: string
  periodEnd: string
  enrolmentDate: string | null
  breaks?: SeasonBreakLike[]
}): string[] {
  const { periodStart, periodEnd, enrolmentDate, breaks = [] } = opts
  if (!periodStart || !periodEnd || periodEnd < periodStart) return []

  const enrolmentWeek = enrolmentDate ? mondayKeyOf(enrolmentDate) : null
  const start = mondayOf(parseDateKey(periodStart))
  const end = parseDateKey(periodEnd)
  const out: string[] = []

  for (let week = new Date(start); week <= end; week.setDate(week.getDate() + 7)) {
    const weekStart = dateKey(week)
    if (enrolmentWeek && weekStart < enrolmentWeek) continue

    // Week must overlap the period (Monday through Sunday).
    const weekEnd = new Date(week)
    weekEnd.setDate(weekEnd.getDate() + 6)
    if (dateKey(weekEnd) < periodStart || weekStart > periodEnd) continue

    if (breaks.length && !weekHasOpenDay(week, periodStart, periodEnd, breaks)) continue

    out.push(weekStart)
  }

  return out
}

function mondayOf(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const dow = out.getDay()
  out.setDate(out.getDate() + (dow === 0 ? -6 : 1 - dow))
  return out
}

/** True if any Mon–Fri in the week falls in the period and is not closed. */
function weekHasOpenDay(
  weekMonday: Date,
  periodStart: string,
  periodEnd: string,
  breaks: SeasonBreakLike[],
): boolean {
  for (let offset = 0; offset < 5; offset += 1) {
    const date = new Date(
      weekMonday.getFullYear(),
      weekMonday.getMonth(),
      weekMonday.getDate() + offset,
    )
    const day = dateKey(date)
    if (day < periodStart || day > periodEnd) continue
    if (!isClosed(day, breaks)) return true
  }
  return false
}

/** Whether a roster seat should add an extra charge on top of subscription. */
export function isPaidDropInCharge(entry: {
  dropIn?: unknown
  complimentary?: unknown
  chargeRateCents?: unknown
}): boolean {
  if (entry.complimentary === true) return false
  if (entry.dropIn !== true) return false
  const rate = Number(entry.chargeRateCents ?? 0)
  return rate > 0
}
