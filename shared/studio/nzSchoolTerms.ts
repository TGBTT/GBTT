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

export interface NzTermProposal {
  /** A season draft, ready to be edited and saved as-is. */
  season: LiveSeason
  /** Set where the date is the school's choice rather than fixed nationally. */
  note?: string
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
  return (NZ_SCHOOL_TERMS[year] ?? []).map((term) => ({
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
    note: term.flexible
      ? term.flexible.field === 'start'
        ? `Schools choose their own start between ${readableDate(term.flexible.earliest ?? term.startDate)} and ${readableDate(term.flexible.latest ?? term.startDate)}. This draft takes the later date — move it back if Golden Bay schools return earlier.`
        : `Schools finish on or before ${readableDate(term.flexible.latest ?? term.endDate)}. This draft takes the last possible day — bring it forward if the studio stops sooner.`
      : undefined,
  }))
}
