/**
 * New Zealand school terms, as a starting point for the studio's seasons.
 *
 * The studio's year follows the school year: four terms with the school
 * holidays between them, because that is when the members with children can
 * come and when the youth and kids classes have anyone to teach. Typing four
 * date ranges and a dozen public holidays into the season editor by hand is
 * both tedious and easy to get wrong by a day, so the published dates are kept
 * here and offered as editable drafts.
 *
 * These are transcribed from the Ministry of Education, which sets them by
 * Gazette notice a couple of years ahead. They are deliberately a fixed table
 * rather than a live fetch: there is no API, the page is prose, and a term
 * calendar that silently changed under an already-generated season would move
 * classes members have booked. When a new year is published, add it here.
 *
 * Terms 2 and 3 are fixed nationally. Each school picks its own Term 1 start
 * and Term 4 finish within a range, so those carry the range as a note and the
 * draft has to be checked against what Golden Bay schools actually do.
 */

import type { LiveSeason, SeasonBillingMode } from './firebase/liveSeasons'

export const NZ_TERM_SOURCE =
  'Ministry of Education — school terms and holidays dates (education.govt.nz), as published for 2026–2028.'

export interface NzTermHoliday {
  label: string
  /** `YYYY-MM-DD`. Only dates falling inside the term are listed. */
  date: string
}

export interface NzTerm {
  term: 1 | 2 | 3 | 4
  startDate: string
  endDate: string
  /**
   * The range a school may choose from, where the date is not fixed nationally.
   * Present on Term 1 (start) and Term 4 (end).
   */
  flexible?: { field: 'start' | 'end'; earliest?: string; latest?: string }
  /** Public holidays inside the term — days the studio cannot run a class. */
  holidays: NzTermHoliday[]
}

/**
 * Term 1 defaults to the latest permitted start and Term 4 to the latest
 * permitted finish. Starting late creates fewer sessions than the studio might
 * run, which Tom fixes by moving one date; starting early creates classes in a
 * week the schools are still on holiday, which he would have to notice first.
 */
const NZ_SCHOOL_TERMS: Record<number, NzTerm[]> = {
  2026: [
    {
      term: 1,
      startDate: '2026-02-09',
      endDate: '2026-04-02',
      flexible: { field: 'start', earliest: '2026-01-26', latest: '2026-02-09' },
      holidays: [{ label: 'Waitangi Day', date: '2026-02-06' }],
    },
    {
      term: 2,
      startDate: '2026-04-20',
      endDate: '2026-07-03',
      holidays: [
        { label: 'Anzac Day (observed)', date: '2026-04-27' },
        { label: "King's Birthday", date: '2026-06-01' },
      ],
    },
    { term: 3, startDate: '2026-07-20', endDate: '2026-09-25', holidays: [] },
    {
      term: 4,
      startDate: '2026-10-12',
      endDate: '2026-12-18',
      flexible: { field: 'end', latest: '2026-12-18' },
      holidays: [{ label: 'Labour Day', date: '2026-10-26' }],
    },
  ],
  2027: [
    {
      term: 1,
      startDate: '2027-02-03',
      endDate: '2027-04-09',
      flexible: { field: 'start', earliest: '2027-01-28', latest: '2027-02-03' },
      holidays: [
        { label: 'Waitangi Day (observed)', date: '2027-02-08' },
        { label: 'Good Friday', date: '2027-03-26' },
        { label: 'Easter Monday', date: '2027-03-29' },
        { label: 'Easter Tuesday', date: '2027-03-30' },
      ],
    },
    {
      term: 2,
      startDate: '2027-04-27',
      endDate: '2027-07-02',
      holidays: [
        { label: "King's Birthday", date: '2027-06-07' },
        { label: 'Matariki', date: '2027-06-25' },
      ],
    },
    { term: 3, startDate: '2027-07-19', endDate: '2027-09-24', holidays: [] },
    {
      term: 4,
      startDate: '2027-10-11',
      endDate: '2027-12-17',
      flexible: { field: 'end', latest: '2027-12-17' },
      holidays: [{ label: 'Labour Day', date: '2027-10-25' }],
    },
  ],
  2028: [
    {
      term: 1,
      startDate: '2028-02-08',
      endDate: '2028-04-13',
      flexible: { field: 'start', earliest: '2028-01-31', latest: '2028-02-08' },
      holidays: [{ label: 'Waitangi Day (observed)', date: '2028-02-07' }],
    },
    {
      term: 2,
      startDate: '2028-05-01',
      endDate: '2028-07-07',
      holidays: [{ label: "King's Birthday", date: '2028-06-05' }],
    },
    { term: 3, startDate: '2028-07-24', endDate: '2028-09-29', holidays: [] },
    {
      term: 4,
      startDate: '2028-10-16',
      endDate: '2028-12-15',
      flexible: { field: 'end', latest: '2028-12-15' },
      holidays: [{ label: 'Labour Day', date: '2028-10-23' }],
    },
  ],
}

/** Years the published term dates cover, oldest first. */
export const NZ_TERM_YEARS: number[] = Object.keys(NZ_SCHOOL_TERMS)
  .map(Number)
  .sort((a, b) => a - b)

const LAST_PUBLISHED_YEAR = NZ_TERM_YEARS[NZ_TERM_YEARS.length - 1]

/**
 * How far past the published dates an estimate is offered.
 *
 * The Ministry gazettes term dates about two years out, so this only has to
 * cover the gap between one notice and the next. Offering a decade of guesses
 * would suggest a confidence that does not exist.
 */
const ESTIMATE_YEARS_AHEAD = 4

/**
 * Matariki, from Schedule 1 of Te Kāhui o Matariki Public Holiday Act 2022.
 *
 * The only public holiday that cannot be worked out from a rule — it follows
 * the maramataka, so Parliament legislated the dates instead. They run to 2052,
 * comfortably past anything this file needs to estimate.
 */
const MATARIKI: Record<number, string> = {
  2026: '2026-07-10',
  2027: '2027-06-25',
  2028: '2028-07-14',
  2029: '2029-07-06',
  2030: '2030-06-21',
  2031: '2031-07-11',
  2032: '2032-07-02',
  2033: '2033-06-24',
  2034: '2034-07-07',
  2035: '2035-06-29',
  2036: '2036-07-18',
  2037: '2037-07-10',
  2038: '2038-06-25',
  2039: '2039-07-15',
  2040: '2040-07-06',
}

export interface NzTermProposal {
  /** A season draft, ready to be edited and saved as-is. */
  season: LiveSeason
  /** Set where the date is the school's choice rather than fixed nationally. */
  note?: string
  /** Left unticked by default: a season the studio may not run at all. */
  optional?: boolean
  /** Worked out from the pattern rather than read off a published notice. */
  estimated?: boolean
}

/* —————————————————— Working out a year that is not published yet ——————————————————
 *
 * Everything below exists for the years between one Gazette notice and the
 * next. It produces a draft to correct, not an answer to trust: the estimate is
 * labelled as one everywhere it surfaces, and the public holidays it places are
 * the part most worth keeping, since those are exactly the mid-term days that
 * are easy to miss and cost a class nobody attends.
 */

const pad = (n: number) => String(n).padStart(2, '0')
const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const dateOf = (key: string) => {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** A weekend holiday is observed on the following Monday. */
function mondayised(date: Date): Date {
  const day = date.getDay()
  if (day !== 0 && day !== 6) return date
  const moved = new Date(date)
  moved.setDate(moved.getDate() + (day === 6 ? 2 : 1))
  return moved
}

function nthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): Date {
  const first = new Date(year, month, 1)
  const offset = (weekday - first.getDay() + 7) % 7
  return new Date(year, month, 1 + offset + (n - 1) * 7)
}

/** Anonymous Gregorian computus. Easter is the anchor Term 1 ends against. */
function easterSunday(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month - 1, day)
}

function shiftDays(date: Date, days: number): Date {
  const moved = new Date(date)
  moved.setDate(moved.getDate() + days)
  return moved
}

/**
 * Every holiday a class could fall on, for a year with no published notice.
 *
 * Easter Tuesday is in here because schools treat it as a holiday even though
 * it is not a public one, and the studio's youth and kids classes follow the
 * schools.
 */
function inferredHolidays(year: number): NzTermHoliday[] {
  const easter = easterSunday(year)
  const holidays: NzTermHoliday[] = [
    { label: 'Waitangi Day', date: keyOf(mondayised(new Date(year, 1, 6))) },
    { label: 'Good Friday', date: keyOf(shiftDays(easter, -2)) },
    { label: 'Easter Monday', date: keyOf(shiftDays(easter, 1)) },
    { label: 'Easter Tuesday', date: keyOf(shiftDays(easter, 2)) },
    { label: 'Anzac Day', date: keyOf(mondayised(new Date(year, 3, 25))) },
    { label: "King's Birthday", date: keyOf(nthWeekdayOfMonth(year, 5, 1, 1)) },
    { label: 'Labour Day', date: keyOf(nthWeekdayOfMonth(year, 9, 1, 4)) },
    // Tākaka observes Nelson Anniversary: the Monday nearest 1 February.
    { label: 'Nelson Anniversary', date: keyOf(nelsonAnniversary(year)) },
  ]

  const matariki = MATARIKI[year]
  if (matariki) holidays.push({ label: 'Matariki', date: matariki })

  return holidays
}

function nelsonAnniversary(year: number): Date {
  const first = new Date(year, 1, 1)
  const day = first.getDay()
  // Monday nearest 1 February: back to Monday when the 1st is Tue–Thu,
  // forward to the next one otherwise.
  const back = (day + 6) % 7
  return back <= 3 ? shiftDays(first, -back) : shiftDays(first, 7 - back)
}

/**
 * The same calendar position in another year: same month, same weekday.
 *
 * Term boundaries are always a Monday or a Friday in a particular week, so
 * carrying the weekday across matters more than carrying the date. Shifting by
 * whole weeks instead would drift a day and a bit every year.
 */
function alignedToYear(sourceKey: string, targetYear: number): string {
  const source = dateOf(sourceKey)
  const naive = new Date(targetYear, source.getMonth(), source.getDate())
  const drift = (naive.getDay() - source.getDay() + 7) % 7
  return keyOf(shiftDays(naive, drift > 3 ? 7 - drift : -drift))
}

/** The four terms of an unpublished year, shaped like the last published one. */
function inferredTerms(year: number): NzTerm[] {
  const holidays = inferredHolidays(year)

  /** A term opening on a day the studio is closed reads as a mistake. */
  const firstOpenDay = (key: string) => {
    let candidate = key
    for (let guard = 0; guard < 10; guard += 1) {
      const day = dateOf(candidate).getDay()
      const blocked = day === 0 || day === 6 || holidays.some((h) => h.date === candidate)
      if (!blocked) return candidate
      candidate = keyOf(shiftDays(dateOf(candidate), 1))
    }
    return candidate
  }

  return NZ_SCHOOL_TERMS[LAST_PUBLISHED_YEAR].map((term) => {
    const startDate = firstOpenDay(alignedToYear(term.startDate, year))
    const endDate = alignedToYear(term.endDate, year)
    return {
      term: term.term,
      startDate,
      endDate,
      // The bounds move with the year too, or the note would quote the dates of
      // whichever year this pattern was copied from.
      flexible: term.flexible && {
        field: term.flexible.field,
        earliest: term.flexible.earliest
          ? alignedToYear(term.flexible.earliest, year)
          : undefined,
        latest: term.flexible.latest ? alignedToYear(term.flexible.latest, year) : undefined,
      },
      holidays: holidays.filter((h) => h.date >= startDate && h.date <= endDate),
    }
  })
}

function termsFor(year: number): NzTerm[] {
  return NZ_SCHOOL_TERMS[year] ?? (year > LAST_PUBLISHED_YEAR ? inferredTerms(year) : [])
}

/**
 * Years the year picker offers: those published, then a few estimated.
 *
 * Past years are dropped once they are behind us — a season for a year that has
 * already run is not something anyone is setting up.
 */
export function nzTermYearOptions(today: Date = new Date()): {
  year: number
  estimated: boolean
}[] {
  const from = today.getFullYear()
  const years: { year: number; estimated: boolean }[] = NZ_TERM_YEARS.filter(
    (y) => y >= from,
  ).map((year) => ({ year, estimated: false }))

  for (let i = 1; i <= ESTIMATE_YEARS_AHEAD; i += 1) {
    const year = LAST_PUBLISHED_YEAR + i
    if (year >= from) years.push({ year, estimated: true })
  }

  return years
}

export function isEstimatedTermYear(year: number): boolean {
  return !NZ_SCHOOL_TERMS[year]
}

const NZ_DATE = new Intl.DateTimeFormat('en-NZ', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})

function readableDate(key: string): string {
  const [y, m, d] = key.split('-').map(Number)
  if (!y || !m || !d) return key
  return NZ_DATE.format(new Date(y, m - 1, d))
}

/**
 * The four terms of a school year as season drafts.
 *
 * Public holidays inside a term become one-day closures, which is what stops a
 * class that runs every week from being generated onto Labour Day. The school
 * holidays between terms need no closure of their own: they fall outside every
 * season, so no session is created there in the first place.
 *
 * Ids are keyed by year, so running this for two years leaves eight distinct
 * seasons rather than overwriting last year's.
 */
export function nzSchoolTermSeasons(
  year: number,
  billingMode: SeasonBillingMode = 'arrears',
): NzTermProposal[] {
  const terms = termsFor(year)
  if (!terms.length) return []

  const estimated = isEstimatedTermYear(year)

  const proposals: NzTermProposal[] = terms.map((term) => ({
    season: {
      id: `${year}-term-${term.term}`,
      name: `Term ${term.term}, ${year}`,
      startDate: term.startDate,
      endDate: term.endDate,
      billingMode,
      breaks: term.holidays.map((h) => ({
        label: h.label,
        startDate: h.date,
        endDate: h.date,
      })),
    },
    estimated,
    note: term.flexible
      ? term.flexible.field === 'start'
        ? `Schools choose their own start between ${readableDate(term.flexible.earliest ?? term.startDate)} and ${readableDate(term.flexible.latest ?? term.startDate)}. This draft takes the later date — move it back if Golden Bay schools return earlier.`
        : `Schools finish on or before ${readableDate(term.flexible.latest ?? term.endDate)}. This draft takes the last possible day — bring it forward if the studio stops sooner.`
      : undefined,
  }))

  const summer = summerSeason(year, billingMode)
  if (summer) proposals.push(summer)

  return proposals
}

/**
 * The gap between Term 4 and the next Term 1.
 *
 * Seven-odd weeks that belong to no term, and so — since sessions are only
 * generated inside a season — produce nothing at all unless a season covers
 * them. Whether the studio trades through summer is Tom's call and not one the
 * school calendar can answer, so this is offered unticked rather than assumed
 * either way.
 *
 * It closes for Christmas and New Year as one block rather than as individual
 * public holidays: a studio shuts for the stretch, not for the two statutory
 * days inside it, and the exact Mondayisation of Boxing Day is beside the point
 * when the doors are shut either side of it.
 */
function summerSeason(
  year: number,
  billingMode: SeasonBillingMode,
): NzTermProposal | undefined {
  const terms = termsFor(year)
  const nextTerms = termsFor(year + 1)
  const term4 = terms[terms.length - 1]
  const nextTerm1 = nextTerms[0]
  if (!term4 || !nextTerm1) return undefined

  // From the Monday after Term 4 finishes to the Sunday before school returns.
  const startDate = keyOf(shiftDays(dateOf(term4.endDate), 8 - dateOf(term4.endDate).getDay()))
  const endDate = keyOf(shiftDays(dateOf(nextTerm1.startDate), -1))
  if (endDate <= startDate) return undefined

  const breaks = [
    {
      label: 'Christmas & New Year',
      startDate: `${year}-12-24`,
      endDate: `${year + 1}-01-05`,
    },
  ]

  const anniversary = keyOf(nelsonAnniversary(year + 1))
  if (anniversary >= startDate && anniversary <= endDate) {
    breaks.push({ label: 'Nelson Anniversary', startDate: anniversary, endDate: anniversary })
  }

  const waitangi = keyOf(mondayised(new Date(year + 1, 1, 6)))
  if (waitangi >= startDate && waitangi <= endDate) {
    breaks.push({ label: 'Waitangi Day', startDate: waitangi, endDate: waitangi })
  }

  return {
    season: {
      id: `${year}-summer`,
      name: `Summer ${year}–${String((year + 1) % 100).padStart(2, '0')}`,
      startDate,
      endDate,
      billingMode,
      breaks,
    },
    optional: true,
    estimated: isEstimatedTermYear(year) || isEstimatedTermYear(year + 1),
    note: 'The school holidays, which no term covers. Tick it only if the studio runs a summer timetable — left off, no sessions are generated between the terms.',
  }
}
