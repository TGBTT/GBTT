/**
 * Unit tests for subscription-week billing helpers.
 *
 *   cd functions && npm test
 */

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

const {
  mondayKeyOf,
  enrolmentDateKey,
  billableWeekStarts,
  isPaidDropInCharge,
} = require('../lib/billingHelpers')

describe('mondayKeyOf', () => {
  it('returns Monday for a Wednesday', () => {
    assert.equal(mondayKeyOf('2026-09-09'), '2026-09-07')
  })

  it('returns the same day for a Monday', () => {
    assert.equal(mondayKeyOf('2026-09-07'), '2026-09-07')
  })

  it('rolls Sunday back to the prior Monday', () => {
    assert.equal(mondayKeyOf('2026-09-13'), '2026-09-07')
  })
})

describe('enrolmentDateKey', () => {
  it('prefers enrolledAt string', () => {
    assert.equal(
      enrolmentDateKey({
        enrolledAt: '2026-08-15',
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
      '2026-08-15',
    )
  })

  it('falls back to createdAt ISO', () => {
    assert.equal(enrolmentDateKey({ createdAt: '2026-08-20T12:00:00.000Z' }), '2026-08-20')
  })
})

describe('billableWeekStarts', () => {
  it('lists Mondays in a short range', () => {
    assert.deepEqual(
      billableWeekStarts({
        periodStart: '2026-09-01',
        periodEnd: '2026-09-20',
        enrolmentDate: null,
      }),
      ['2026-08-31', '2026-09-07', '2026-09-14'],
    )
  })

  it('skips weeks before enrolment', () => {
    assert.deepEqual(
      billableWeekStarts({
        periodStart: '2026-09-01',
        periodEnd: '2026-09-20',
        enrolmentDate: '2026-09-10',
      }),
      ['2026-09-07', '2026-09-14'],
    )
  })

  it('skips a week fully covered by a closure', () => {
    assert.deepEqual(
      billableWeekStarts({
        periodStart: '2026-09-01',
        periodEnd: '2026-09-20',
        enrolmentDate: null,
        breaks: [{ startDate: '2026-09-07', endDate: '2026-09-13' }],
      }),
      ['2026-08-31', '2026-09-14'],
    )
  })
})

describe('isPaidDropInCharge', () => {
  it('charges a normal drop-in with a rate', () => {
    assert.equal(isPaidDropInCharge({ dropIn: true, chargeRateCents: 2500 }), true)
  })

  it('ignores complimentary seats', () => {
    assert.equal(
      isPaidDropInCharge({ dropIn: true, complimentary: true, chargeRateCents: 0 }),
      false,
    )
  })

  it('ignores included subscription seats', () => {
    assert.equal(isPaidDropInCharge({ dropIn: false, chargeRateCents: 0 }), false)
  })
})
