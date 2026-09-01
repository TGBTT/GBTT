/**
 * Unit tests for season lock fan-out and weekly allowance helpers.
 *
 *   cd functions && npm test
 */

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

const {
  skipWeekKey,
  shouldFanBookSession,
  weeklyAllowanceRemaining,
} = require('../lib/sessionLockHelpers')

describe('skipWeekKey', () => {
  it('combines uid, slot and week', () => {
    assert.equal(skipWeekKey('u1', 'mon-0700-strong', '2026-08-24'), 'u1|mon-0700-strong|2026-08-24')
  })
})

describe('shouldFanBookSession', () => {
  const skipped = new Set(['u1|mon-0700-strong|2026-08-31'])

  it('books when season matches and week is not skipped', () => {
    assert.equal(
      shouldFanBookSession({
        lockSeasonId: 'term-3',
        sessionSeasonId: 'term-3',
        skippedWeeks: skipped,
        uid: 'u1',
        slotId: 'mon-0700-strong',
        weekStart: '2026-08-24',
      }),
      true,
    )
  })

  it('skips when the week was freed by the member', () => {
    assert.equal(
      shouldFanBookSession({
        lockSeasonId: 'term-3',
        sessionSeasonId: 'term-3',
        skippedWeeks: skipped,
        uid: 'u1',
        slotId: 'mon-0700-strong',
        weekStart: '2026-08-31',
      }),
      false,
    )
  })

  it('does not book into another season when the lock is season-scoped', () => {
    assert.equal(
      shouldFanBookSession({
        lockSeasonId: 'term-3',
        sessionSeasonId: 'term-4',
        skippedWeeks: new Set(),
        uid: 'u1',
        slotId: 'mon-0700-strong',
        weekStart: '2026-08-24',
      }),
      false,
    )
  })

  it('books across seasons when the lock has no seasonId (legacy)', () => {
    assert.equal(
      shouldFanBookSession({
        lockSeasonId: null,
        sessionSeasonId: 'term-4',
        skippedWeeks: new Set(),
        uid: 'u1',
        slotId: 'mon-0700-strong',
        weekStart: '2026-08-24',
      }),
      true,
    )
  })
})

describe('weeklyAllowanceRemaining', () => {
  it('refuses when allowance is exhausted', () => {
    assert.equal(weeklyAllowanceRemaining(2, 2), false)
  })

  it('allows when a seat remains', () => {
    assert.equal(weeklyAllowanceRemaining(2, 1), true)
  })

  it('refuses casual plans with zero allowance', () => {
    assert.equal(weeklyAllowanceRemaining(0, 0), false)
  })
})
