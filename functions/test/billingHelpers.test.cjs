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
  segmentForWeek,
  historyForBilling,
  subscriptionLineItemsForWeeks,
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

describe('segmentForWeek', () => {
  const history = [
    { effectiveFrom: '2026-08-03', planId: 'weekly1', classesPerWeek: 1, ratePerClassCents: 1500 },
    { effectiveFrom: '2026-09-07', planId: 'weekly2', classesPerWeek: 2, ratePerClassCents: 1300 },
  ]

  it('uses the old tier before the switch week', () => {
    assert.equal(segmentForWeek('2026-08-31', history)?.planId, 'weekly1')
  })

  it('uses the new tier from the switch week onward', () => {
    assert.equal(segmentForWeek('2026-09-07', history)?.classesPerWeek, 2)
    assert.equal(segmentForWeek('2026-09-14', history)?.ratePerClassCents, 1300)
  })
})

describe('historyForBilling with pending upgrade', () => {
  it('keeps the pre-upgrade snapshot when history is empty', () => {
    const hist = historyForBilling({
      stored: [],
      pendingUpgrade: {
        fromPlanId: 'weekly1',
        fromClassesPerWeek: 1,
        fromRatePerClassCents: 1500,
      },
      fallback: {
        effectiveFrom: '2026-08-03',
        planId: 'weekly2',
        classesPerWeek: 2,
        ratePerClassCents: 1300,
      },
    })
    assert.equal(hist.length, 1)
    assert.equal(hist[0].classesPerWeek, 1)
    assert.equal(hist[0].ratePerClassCents, 1500)
  })
})

describe('subscriptionLineItemsForWeeks mid-period 1→2', () => {
  it('bills earlier weeks at 1×$15 and later at 2×$13', () => {
    const history = [
      { effectiveFrom: '2026-08-31', planId: 'weekly1', classesPerWeek: 1, ratePerClassCents: 1500 },
      { effectiveFrom: '2026-09-14', planId: 'weekly2', classesPerWeek: 2, ratePerClassCents: 1300 },
    ]
    const weeks = ['2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21']
    const { lineItems, chargeableCount, tierSummaries } = subscriptionLineItemsForWeeks(
      weeks,
      history,
    )

    assert.equal(lineItems[0].amountCents, 1500)
    assert.equal(lineItems[1].amountCents, 1500)
    assert.equal(lineItems[2].amountCents, 2600)
    assert.equal(lineItems[3].amountCents, 2600)
    assert.equal(chargeableCount, 1 + 1 + 2 + 2)
    assert.equal(tierSummaries.length, 2)
    assert.equal(
      tierSummaries.reduce((sum, t) => sum + t.amountCents, 0),
      1500 + 1500 + 2600 + 2600,
    )
  })

  it('applies a downgrade from the change week Monday', () => {
    const history = [
      { effectiveFrom: '2026-08-31', planId: 'weekly2', classesPerWeek: 2, ratePerClassCents: 1300 },
      { effectiveFrom: '2026-09-07', planId: 'weekly1', classesPerWeek: 1, ratePerClassCents: 1500 },
    ]
    const { lineItems } = subscriptionLineItemsForWeeks(
      ['2026-08-31', '2026-09-07', '2026-09-14'],
      history,
    )
    assert.equal(lineItems[0].amountCents, 2600)
    assert.equal(lineItems[1].amountCents, 1500)
    assert.equal(lineItems[2].amountCents, 1500)
  })
})
