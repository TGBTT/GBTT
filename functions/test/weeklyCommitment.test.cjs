/**
 * Tests for the weekly-allowance timing rules.
 *
 * These encode the exploit the commitment rule exists to prevent: releasing a
 * weekly slot after that week's class has effectively happened, then locking a
 * different slot, which would be two included classes on one week's allowance.
 *
 *   cd functions && npm test
 *
 * Runs against the compiled output, so `npm test` builds first. No emulator is
 * needed — the rules here are pure date arithmetic, which is the point of
 * keeping them out of index.ts.
 */

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

const {
  commitmentFromSessions,
  isPastTransferCutoff,
  weekStartKeyInZone,
} = require('../lib/weeklyCommitment')

const NZ = 'Pacific/Auckland'
const HOURS = 60 * 60 * 1000

/** A Wednesday 07:00 NZST class: 2026-08-26T07:00+12:00. */
const WED_CLASS = new Date('2026-08-25T19:00:00Z')

describe('weekStartKeyInZone', () => {
  it('names the Monday of the week containing the instant', () => {
    assert.equal(weekStartKeyInZone(WED_CLASS, NZ), '2026-08-24')
  })

  it('is already on the new week early on a NZ Monday, when UTC is still Sunday', () => {
    // 2026-08-31T09:00 NZST is 2026-08-30T21:00Z — Sunday in UTC. Reading the
    // key in UTC would name the previous week and leave a member unable to
    // change a slot for an extra day.
    const nzMondayMorning = new Date('2026-08-30T21:00:00Z')
    assert.equal(weekStartKeyInZone(nzMondayMorning, NZ), '2026-08-31')
  })

  it('is still on the old week late on a NZ Sunday', () => {
    const nzSundayEvening = new Date('2026-08-30T09:00:00Z')
    assert.equal(weekStartKeyInZone(nzSundayEvening, NZ), '2026-08-24')
  })

  it('holds across the daylight-saving change', () => {
    // NZDT begins on Sunday 27 September 2026. The Monday after is the 28th.
    const afterChange = new Date('2026-09-28T20:00:00Z') // Tue 29th 09:00 NZDT
    assert.equal(weekStartKeyInZone(afterChange, NZ), '2026-09-28')
  })
})

describe('isPastTransferCutoff', () => {
  it('is false well before the window opens', () => {
    const now = new Date(WED_CLASS.getTime() - 48 * HOURS)
    assert.equal(isPastTransferCutoff(WED_CLASS, 24, now), false)
  })

  it('is true once inside the window', () => {
    const now = new Date(WED_CLASS.getTime() - 23 * HOURS)
    assert.equal(isPastTransferCutoff(WED_CLASS, 24, now), true)
  })

  it('is true after the class has run', () => {
    const now = new Date(WED_CLASS.getTime() + HOURS)
    assert.equal(isPastTransferCutoff(WED_CLASS, 24, now), true)
  })

  it('honours a window the admin has changed', () => {
    const now = new Date(WED_CLASS.getTime() - 30 * HOURS)
    assert.equal(isPastTransferCutoff(WED_CLASS, 24, now), false)
    assert.equal(isPastTransferCutoff(WED_CLASS, 48, now), true)
  })

  it('with a zero-hour window, only the class starting closes it', () => {
    assert.equal(
      isPastTransferCutoff(WED_CLASS, 0, new Date(WED_CLASS.getTime() - 60 * 1000)),
      false,
    )
    assert.equal(
      isPastTransferCutoff(WED_CLASS, 0, new Date(WED_CLASS.getTime() + 60 * 1000)),
      true,
    )
  })
})

describe('commitmentFromSessions', () => {
  const session = (over) => ({ id: 'sess-wed', startsAt: WED_CLASS, ...over })

  it('does not commit the week while the class is still outside the window', () => {
    const now = new Date(WED_CLASS.getTime() - 48 * HOURS)
    const result = commitmentFromSessions([session()], 24, now)
    assert.equal(result.committed, false)
    assert.equal(result.sessionId, undefined)
  })

  it('commits the week once the class is inside the window', () => {
    const now = new Date(WED_CLASS.getTime() - 2 * HOURS)
    const result = commitmentFromSessions([session()], 24, now)
    assert.equal(result.committed, true)
    assert.equal(result.sessionId, 'sess-wed')
    assert.deepEqual(result.startsAt, WED_CLASS)
  })

  it('commits the week after the class has run', () => {
    const now = new Date(WED_CLASS.getTime() + 3 * HOURS)
    assert.equal(commitmentFromSessions([session()], 24, now).committed, true)
  })

  it('does not commit the week for a cancelled class', () => {
    // The studio pulled it, so it was never attended and the member keeps the
    // week even though the time has passed.
    const now = new Date(WED_CLASS.getTime() + 3 * HOURS)
    const result = commitmentFromSessions([session({ cancelled: true })], 24, now)
    assert.equal(result.committed, false)
  })

  it('skips a session with no startsAt rather than committing on a guess', () => {
    const now = new Date(WED_CLASS.getTime() + 3 * HOURS)
    const result = commitmentFromSessions([session({ startsAt: null })], 24, now)
    assert.equal(result.committed, false)
  })

  it('commits on any qualifying session when a slot has several that week', () => {
    const now = new Date(WED_CLASS.getTime() + 3 * HOURS)
    const later = new Date(WED_CLASS.getTime() + 200 * HOURS)
    const result = commitmentFromSessions(
      [
        { id: 'sess-cancelled', startsAt: WED_CLASS, cancelled: true },
        { id: 'sess-later', startsAt: later },
        { id: 'sess-wed', startsAt: WED_CLASS },
      ],
      24,
      now,
    )
    assert.equal(result.committed, true)
    assert.equal(result.sessionId, 'sess-wed')
  })

  it('commits nothing when the slot has no sessions this week', () => {
    assert.equal(commitmentFromSessions([], 24, new Date()).committed, false)
  })
})

describe('the exploit this prevents', () => {
  /*
   * The scenario the rule exists for: a member on one included class a week
   * holds Wednesday, attends it, then tries to release Wednesday and lock
   * Friday to attend twice on one week's allowance. Only the week rolling over
   * should let them change the slot.
   */
  const windowHours = 24
  const afterWedClass = new Date(WED_CLASS.getTime() + 3 * HOURS)

  it('refuses the release for the rest of that week', () => {
    assert.equal(commitmentFromSessions([{ id: 'w', startsAt: WED_CLASS }], windowHours, afterWedClass).committed, true)

    // Still refused on the Saturday, three days later.
    const saturday = new Date(WED_CLASS.getTime() + 72 * HOURS)
    assert.equal(commitmentFromSessions([{ id: 'w', startsAt: WED_CLASS }], windowHours, saturday).committed, true)
  })

  it('frees the slot once the week rolls over, because next week has its own session', () => {
    // The following Monday in NZ is a new week key, so the query behind this
    // returns next week's session rather than the one already attended.
    const nextMonday = new Date('2026-08-30T21:00:00Z')
    assert.equal(weekStartKeyInZone(afterWedClass, NZ), '2026-08-24')
    assert.equal(weekStartKeyInZone(nextMonday, NZ), '2026-08-31')

    const nextWedClass = new Date(WED_CLASS.getTime() + 7 * 24 * HOURS)
    assert.equal(
      commitmentFromSessions([{ id: 'w2', startsAt: nextWedClass }], windowHours, nextMonday)
        .committed,
      false,
    )
  })
})
