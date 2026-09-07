/**
 * Security rules tests for firestore.rules.
 *
 * These encode the exploits the rules exist to prevent, so a future rule edit
 * that reopens one fails here rather than in production.
 *
 *   cd firestore-tests && npm install && npm test
 *
 * Requires Java (the Firestore emulator runs on the JVM).
 */

import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore'

const MEMBER = 'member-uid'
const OTHER = 'other-uid'
const ADMIN = 'admin-uid'
const PENDING = 'pending-uid'

let testEnv

const activeMember = {
  profile: { name: 'Alex', email: 'alex@example.com', role: 'member', status: 'active' },
  membership: { planId: 'weekly2', classesPerWeek: 2 },
  billing: { balanceCents: 12000, customDiscountPct: 0 },
  clinical: { riskNotes: 'none' },
  preferences: { showNameToClassmates: true },
}

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'gbtt-rules-test',
    firestore: {
      rules: readFileSync('../firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  })

  // Seed with rules disabled.
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'users', MEMBER), activeMember)
    await setDoc(doc(db, 'users', PENDING), {
      profile: { name: 'Pat', email: 'pat@example.com', role: 'member', status: 'pending' },
      preferences: { showNameToClassmates: true },
    })
    await setDoc(doc(db, 'sessions', 'sess-1'), {
      classTypeId: 'sweat',
      weekStart: '2026-08-24',
      cap: 12,
      bookedCount: 0,
    })
    await setDoc(doc(db, 'sessions/sess-1/roster', OTHER), {
      memberId: OTHER,
      displayName: 'Someone',
      status: 'booked',
    })
    await setDoc(doc(db, 'seasons', 'term-1'), {
      name: 'Term 1',
      startDate: '2026-02-02',
      endDate: '2026-04-10',
      billingMode: 'arrears',
      breaks: [{ label: 'School holidays', startDate: '2026-03-09', endDate: '2026-03-20' }],
    })
    await setDoc(doc(db, 'pricingPlans', 'casual'), {
      name: 'Guest / casual',
      ratePerClass: 17,
      classesPerWeek: 0,
    })
    await setDoc(doc(db, 'reminders', 'rem-1'), {
      title: 'Reorder mats',
      dueLabel: 'Mon',
      kind: 'ops',
      done: false,
    })
    await setDoc(doc(db, 'planChangeRequests', MEMBER), {
      uid: MEMBER,
      memberName: 'Member',
      toPlanId: 'weekly2',
      requestedPlanName: '2 / week',
      status: 'pending',
    })
    await setDoc(doc(db, `users/${MEMBER}/billingPeriods`, '2026-08-01'), {
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      status: 'owed',
      totalCents: 5200,
      chargeableCount: 4,
    })
    await setDoc(doc(db, `users/${OTHER}/billingPeriods`, '2026-08-01'), {
      periodStart: '2026-08-01',
      status: 'owed',
      totalCents: 3400,
    })
  })
})

after(async () => {
  await testEnv?.cleanup()
})

function memberDb() {
  return testEnv.authenticatedContext(MEMBER, { role: 'member' }).firestore()
}
function adminDb() {
  return testEnv.authenticatedContext(ADMIN, { role: 'admin' }).firestore()
}
function anonDb() {
  return testEnv.unauthenticatedContext().firestore()
}
/** A client the admin has elevated to run the schedule in his absence. */
function trainerDb() {
  return testEnv.authenticatedContext('trainer-uid', { role: 'trainer' }).firestore()
}
/** The pre-rename spelling of the same tier, still honoured by the rules. */
function legacySubstituteDb() {
  return testEnv.authenticatedContext('legacy-uid', { role: 'substitute' }).firestore()
}

describe('billing cannot be self-edited', () => {
  it('member cannot set their own discount to 100%', async () => {
    await assertFails(
      updateDoc(doc(memberDb(), 'users', MEMBER), { 'billing.customDiscountPct': 100 }),
    )
  })

  it('member cannot zero their own balance', async () => {
    await assertFails(updateDoc(doc(memberDb(), 'users', MEMBER), { 'billing.balanceCents': 0 }))
  })

  it('member cannot downgrade their own plan rate', async () => {
    await assertFails(updateDoc(doc(memberDb(), 'users', MEMBER), { 'membership.planId': 'casual' }))
  })
})

describe('privilege escalation is blocked', () => {
  it('member cannot make themselves admin', async () => {
    await assertFails(updateDoc(doc(memberDb(), 'users', MEMBER), { 'profile.role': 'admin' }))
  })

  it('pending member cannot self-approve to active', async () => {
    const db = testEnv.authenticatedContext(PENDING, { role: 'member' }).firestore()
    await assertFails(updateDoc(doc(db, 'users', PENDING), { 'profile.status': 'active' }))
  })

  it('pending member can still fix their own name while waiting', async () => {
    const db = testEnv.authenticatedContext(PENDING, { role: 'member' }).firestore()
    await assertSucceeds(updateDoc(doc(db, 'users', PENDING), { 'profile.name': 'Patricia' }))
  })

  it('member cannot edit staff risk notes on their own clinical record', async () => {
    await assertFails(updateDoc(doc(memberDb(), 'users', MEMBER), { 'clinical.riskNotes': 'x' }))
  })
})

describe('members retain the edits they should have', () => {
  it('member can update their display name', async () => {
    await assertSucceeds(updateDoc(doc(memberDb(), 'users', MEMBER), { 'profile.name': 'Alexandra' }))
  })

  it('member can change their privacy preference', async () => {
    await assertSucceeds(
      updateDoc(doc(memberDb(), 'users', MEMBER), { 'preferences.showNameToClassmates': false }),
    )
  })

  it('member can edit their own health limitations', async () => {
    await assertSucceeds(
      updateDoc(doc(memberDb(), 'users', MEMBER), { 'clinical.limitations': 'knee: avoid deep lunges' }),
    )
  })
})

describe('booking cannot bypass the server', () => {
  it('member cannot insert their own roster entry', async () => {
    await assertFails(
      setDoc(doc(memberDb(), 'sessions/sess-1/roster', MEMBER), {
        memberId: MEMBER,
        status: 'booked',
      }),
    )
  })

  it('member cannot mark themselves attended', async () => {
    await assertFails(
      setDoc(doc(memberDb(), 'sessions/sess-1/roster', MEMBER), { status: 'attended' }),
    )
  })

  it('member cannot delete another members booking', async () => {
    await assertFails(deleteDoc(doc(memberDb(), 'sessions/sess-1/roster', OTHER)))
  })

  it('member cannot inflate session capacity', async () => {
    await assertFails(updateDoc(doc(memberDb(), 'sessions', 'sess-1'), { cap: 999 }))
  })

  // Deleting a session leaves its roster subcollection orphaned but still
  // matching the collection-group query billing runs on, so removal must go
  // through the removeSession callable, which archives instead when a roster
  // exists. Even an admin is blocked from doing it directly.
  it('admin cannot delete a session directly and orphan its roster', async () => {
    await assertFails(deleteDoc(doc(adminDb(), 'sessions', 'sess-1')))
  })

  it('member certainly cannot delete a session', async () => {
    await assertFails(deleteDoc(doc(memberDb(), 'sessions', 'sess-1')))
  })

  it('admin can still archive a session by cancelling it', async () => {
    await assertSucceeds(updateDoc(doc(adminDb(), 'sessions', 'sess-1'), { cancelled: true }))
  })

  it('admin can still write roster for role-call', async () => {
    await assertSucceeds(
      setDoc(doc(adminDb(), 'sessions/sess-1/roster', MEMBER), {
        memberId: MEMBER,
        status: 'attended',
      }),
    )
  })
})

/*
 * A weekly slot is committed for the week once its class is inside the transfer
 * window, so releasing it would hand out a second included class. That rule is
 * enforced by the unlockWeeklySlot callable, which only holds if the member
 * cannot reach the two documents it decides from: the lock itself, and the
 * window it is measured against.
 */
describe('weekly slot commitment cannot be bypassed', () => {
  it('member cannot delete their own weekly lock to free the allowance', async () => {
    await assertFails(deleteDoc(doc(memberDb(), `users/${MEMBER}/weeklyLocks`, 'slot-wed-0700')))
  })

  it('member cannot forge a weekly lock', async () => {
    await assertFails(
      setDoc(doc(memberDb(), `users/${MEMBER}/weeklyLocks`, 'slot-fri-0700'), {
        slotId: 'slot-fri-0700',
      }),
    )
  })

  it('member cannot write a skipped week to bypass season fan-out', async () => {
    await assertFails(
      setDoc(doc(memberDb(), `users/${MEMBER}/weeklyLocks/slot-wed-0700/skippedWeeks`, '2026-08-24'), {
        skippedAt: new Date(),
      }),
    )
  })

  it('member can read their own skipped weeks', async () => {
    await assertSucceeds(
      getDoc(doc(memberDb(), `users/${MEMBER}/weeklyLocks/slot-wed-0700/skippedWeeks`, '2026-08-24')),
    )
  })

  it('member can read the transfer window they are held to', async () => {
    await assertSucceeds(getDoc(doc(memberDb(), 'meta', 'settings')))
  })

  it('member cannot widen the transfer window to escape a commitment', async () => {
    await assertFails(
      setDoc(doc(memberDb(), 'meta', 'settings'), { transferWindowHours: 0 }, { merge: true }),
    )
  })

  it('member cannot move a session start time to escape a commitment', async () => {
    await assertFails(
      updateDoc(doc(memberDb(), 'sessions', 'sess-1'), { startsAt: new Date('2099-01-01') }),
    )
  })

  it('member cannot cancel a session to keep the week', async () => {
    await assertFails(updateDoc(doc(memberDb(), 'sessions', 'sess-1'), { cancelled: true }))
  })
})

describe('self-registration is gated', () => {
  it('new signup must be pending', async () => {
    const uid = 'fresh-uid'
    const db = testEnv.authenticatedContext(uid).firestore()
    await assertFails(
      setDoc(doc(db, 'users', uid), {
        profile: { name: 'New', email: 'n@e.com', role: 'member', status: 'active' },
      }),
    )
    await assertSucceeds(
      setDoc(doc(db, 'users', uid), {
        profile: { name: 'New', email: 'n@e.com', role: 'member', status: 'pending' },
      }),
    )
  })

  it('signup cannot self-assign admin', async () => {
    const uid = 'sneaky-uid'
    const db = testEnv.authenticatedContext(uid).firestore()
    await assertFails(
      setDoc(doc(db, 'users', uid), {
        profile: { name: 'S', email: 's@e.com', role: 'admin', status: 'pending' },
      }),
    )
  })

  it('signup cannot supply its own billing', async () => {
    const uid = 'billing-uid'
    const db = testEnv.authenticatedContext(uid).firestore()
    await assertFails(
      setDoc(doc(db, 'users', uid), {
        profile: { name: 'B', email: 'b@e.com', role: 'member', status: 'pending' },
        billing: { balanceCents: 0, customDiscountPct: 100 },
      }),
    )
  })
})

describe('the trainer role is staff, but not admin', () => {
  it('trainer can write roster for role-call', async () => {
    await assertSucceeds(
      setDoc(doc(trainerDb(), 'sessions/sess-1/roster', MEMBER), {
        memberId: MEMBER,
        status: 'attended',
      }),
    )
  })

  it('trainer can read a member profile to run a class', async () => {
    await assertSucceeds(getDoc(doc(trainerDb(), 'users', MEMBER)))
  })

  it('trainer cannot edit site content', async () => {
    await assertFails(setDoc(doc(trainerDb(), 'siteContent', 'home'), { hero: 'changed' }))
  })

  it('trainer cannot change what a member is billed', async () => {
    await assertFails(
      updateDoc(doc(trainerDb(), 'users', MEMBER), { 'billing.customDiscountPct': 50 }),
    )
  })

  it('trainer cannot define a season', async () => {
    await assertFails(
      setDoc(doc(trainerDb(), 'seasons', 'trainer-term'), {
        name: 'Trainer term',
        startDate: '2026-01-01',
        endDate: '2026-02-01',
      }),
    )
  })

  // Any token minted before the rename still says `substitute`. Dropping this
  // fallback would lock an existing trainer out mid-session.
  it('a legacy substitute claim is still treated as a trainer', async () => {
    await assertSucceeds(
      setDoc(doc(legacySubstituteDb(), 'sessions/sess-1/roster', MEMBER), {
        memberId: MEMBER,
        status: 'booked',
      }),
    )
    await assertFails(
      setDoc(doc(legacySubstituteDb(), 'siteContent', 'home'), { hero: 'changed' }),
    )
  })

  it('a member is not staff by another name', async () => {
    await assertFails(getDoc(doc(memberDb(), 'users', OTHER)))
    await assertFails(setDoc(doc(memberDb(), 'timetableSlots', 'forged'), { day: 'Mon' }))
  })
})

describe('contact details on a profile', () => {
  // createMemberAccount writes profile.phone from the admin's client list, and
  // a wrong number is the member's to fix: nothing server-side reads it for
  // money or access, so it needs no admin round trip.
  it('member can correct their own phone number', async () => {
    await assertSucceeds(
      updateDoc(doc(memberDb(), 'users', MEMBER), { 'profile.phone': '021 555 0101' }),
    )
  })

  it('admin can set a member phone number', async () => {
    await assertSucceeds(
      updateDoc(doc(adminDb(), 'users', MEMBER), { 'profile.phone': '021 555 0102' }),
    )
  })

  it('a phone edit still cannot smuggle in a role change', async () => {
    await assertFails(
      updateDoc(doc(memberDb(), 'users', MEMBER), {
        'profile.phone': '021 555 0103',
        'profile.role': 'trainer',
      }),
    )
  })

  it('member cannot edit another members phone number', async () => {
    await assertFails(
      updateDoc(doc(memberDb(), 'users', PENDING), { 'profile.phone': '021 555 0104' }),
    )
  })
})

describe('cross-member and anonymous access', () => {
  it('member cannot read another members profile', async () => {
    await assertFails(getDoc(doc(memberDb(), 'users', OTHER)))
  })

  it('anonymous cannot read any member profile', async () => {
    await assertFails(getDoc(doc(anonDb(), 'users', MEMBER)))
  })

  it('anonymous cannot read the transfer window', async () => {
    await assertFails(getDoc(doc(anonDb(), 'meta', 'settings')))
  })

  it('anonymous cannot read bank details in meta', async () => {
    await assertFails(getDoc(doc(anonDb(), 'meta', 'bank')))
  })

  it('anonymous can still read the public timetable', async () => {
    await assertSucceeds(getDoc(doc(anonDb(), 'sessions', 'sess-1')))
  })

  it('anonymous cannot write site content', async () => {
    await assertFails(setDoc(doc(anonDb(), 'siteContent', 'home'), { hero: 'hacked' }))
  })
})

describe('admin payment workflow', () => {
  // The payments screen writes the discount straight to Firestore rather than
  // through a callable, so rules are the only thing standing between a member
  // and their own discount field.
  it('admin can set a member discount', async () => {
    await assertSucceeds(
      setDoc(
        doc(adminDb(), 'users', MEMBER),
        { billing: { customDiscountPct: 10 } },
        { merge: true },
      ),
    )
  })

  it('member cannot set their own discount through the same path', async () => {
    await assertFails(
      setDoc(
        doc(memberDb(), 'users', MEMBER),
        { billing: { customDiscountPct: 100 } },
        { merge: true },
      ),
    )
  })

  it('admin can read a member billing period to display what is owed', async () => {
    await assertSucceeds(getDoc(doc(adminDb(), `users/${MEMBER}/billingPeriods`, '2026-08-01')))
  })

  it('a member cannot read another members billing period', async () => {
    await assertFails(getDoc(doc(memberDb(), `users/${OTHER}/billingPeriods`, '2026-08-01')))
  })

  // Marking a period paid has to go through markBillingPeriodPaid so the
  // sign-off is attributed and audited; even an admin cannot set it directly.
  it('admin cannot mark a period paid by writing the document', async () => {
    await assertFails(
      setDoc(
        doc(adminDb(), `users/${MEMBER}/billingPeriods`, '2026-08-01'),
        { status: 'paid' },
        { merge: true },
      ),
    )
  })
})

describe('seasons and pricing are admin-set', () => {
  // Seasons decide both which sessions exist and what a member is billed, so a
  // member who could edit one could extend a term or delete a closure and
  // change what everybody is charged.
  it('member cannot create a season', async () => {
    await assertFails(
      setDoc(doc(memberDb(), 'seasons', 'forged'), {
        name: 'Free term',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
      }),
    )
  })

  it('member cannot shift an existing season', async () => {
    await assertFails(updateDoc(doc(memberDb(), 'seasons', 'term-1'), { endDate: '2026-12-31' }))
  })

  it('member cannot remove a holiday closure', async () => {
    await assertFails(updateDoc(doc(memberDb(), 'seasons', 'term-1'), { breaks: [] }))
  })

  it('member can read seasons to see term dates', async () => {
    await assertSucceeds(getDoc(doc(memberDb(), 'seasons', 'term-1')))
  })

  it('anonymous cannot read seasons', async () => {
    await assertFails(getDoc(doc(anonDb(), 'seasons', 'term-1')))
  })

  it('admin can define a season', async () => {
    await assertSucceeds(
      setDoc(doc(adminDb(), 'seasons', 'term-2'), {
        name: 'Term 2',
        startDate: '2026-05-04',
        endDate: '2026-07-03',
        billingMode: 'arrears',
        breaks: [],
      }),
    )
  })

  it('member cannot rewrite the price list', async () => {
    await assertFails(updateDoc(doc(memberDb(), 'pricingPlans', 'casual'), { ratePerClass: 0 }))
  })

  it('admin can set the drop-in rate', async () => {
    await assertSucceeds(
      setDoc(doc(adminDb(), 'pricingPlans', 'casual'), { ratePerClass: 17 }, { merge: true }),
    )
  })
})

describe('staff reminders', () => {
  it('member cannot read staff reminders', async () => {
    await assertFails(getDoc(doc(memberDb(), 'reminders', 'rem-1')))
  })

  it('member cannot add a reminder', async () => {
    await assertFails(
      setDoc(doc(memberDb(), 'reminders', 'forged'), { title: 'x', kind: 'ops', done: false }),
    )
  })

  it('trainer can add a reminder', async () => {
    await assertSucceeds(
      setDoc(doc(trainerDb(), 'reminders', 'rem-trainer'), {
        title: 'Restock mats',
        kind: 'ops',
        done: false,
      }),
    )
  })

  it('trainer can delete a reminder', async () => {
    await assertSucceeds(deleteDoc(doc(trainerDb(), 'reminders', 'rem-1')))
  })
})

describe('plan change requests', () => {
  // The request names a plan, and the plan carries a price. Letting a member
  // write the document directly would let them request a plan at a rate that
  // is not the one on the price list.
  it('member cannot raise a plan change request directly', async () => {
    await assertFails(
      setDoc(doc(memberDb(), 'planChangeRequests', MEMBER), {
        uid: MEMBER,
        toPlanId: 'weekly3',
        requestedPlanName: 'Free',
      }),
    )
  })

  it('member cannot approve their own request by editing it', async () => {
    await assertFails(
      updateDoc(doc(memberDb(), 'planChangeRequests', MEMBER), { status: 'approved' }),
    )
  })

  it('member can read their own open request', async () => {
    await assertSucceeds(getDoc(doc(memberDb(), 'planChangeRequests', MEMBER)))
  })

  it('member cannot read another member request', async () => {
    await assertFails(getDoc(doc(memberDb(), 'planChangeRequests', OTHER)))
  })

  it('staff can read plan change requests', async () => {
    await assertSucceeds(getDoc(doc(trainerDb(), 'planChangeRequests', MEMBER)))
  })

  // Even an admin goes through the callable, so that applying a change and
  // clearing the request stay one server-side step.
  it('admin cannot write a plan change request directly', async () => {
    await assertFails(
      setDoc(doc(adminDb(), 'planChangeRequests', OTHER), { uid: OTHER, toPlanId: 'weekly1' }),
    )
  })
})

describe('server-only collections', () => {
  it('member cannot write their own billing period', async () => {
    await assertFails(
      setDoc(doc(memberDb(), `users/${MEMBER}/billingPeriods`, '2026-08-01'), { totalCents: 0 }),
    )
  })

  it('admin cannot forge a billing period either', async () => {
    await assertFails(
      setDoc(doc(adminDb(), `users/${MEMBER}/billingPeriods`, '2026-08-01'), { totalCents: 0 }),
    )
  })

  it('member cannot mint a guest pass', async () => {
    await assertFails(setDoc(doc(memberDb(), 'guestPasses', 'FREE1234'), { restricted: false }))
  })

  it('member cannot write the audit log', async () => {
    await assertFails(setDoc(doc(memberDb(), 'audit', 'evt1'), { type: 'forged' }))
  })
})

describe('admin retains control', () => {
  it('admin can adjust member billing', async () => {
    await assertSucceeds(
      updateDoc(doc(adminDb(), 'users', MEMBER), { 'billing.customDiscountPct': 10 }),
    )
  })

  it('admin can approve a member', async () => {
    await assertSucceeds(updateDoc(doc(adminDb(), 'users', MEMBER), { 'profile.status': 'active' }))
  })
})

describe('class catalogue', () => {
  // The marketing timetable renders for visitors who never sign in, so the
  // catalogue it names classes from has to be readable anonymously.
  it('anyone can read class types', async () => {
    await assertSucceeds(getDoc(doc(anonDb(), 'classTypes', 'sweat')))
  })

  it('anyone can read exercises', async () => {
    await assertSucceeds(getDoc(doc(anonDb(), 'exercises', 'squat')))
  })

  it('admin can write an exercise', async () => {
    await assertSucceeds(setDoc(doc(adminDb(), 'exercises', 'squat'), { name: 'Squat' }))
  })

  // Capacity and the warnings members read before booking are admin copy, so a
  // trainer covering the schedule may not rewrite them.
  it('trainer cannot write a class type', async () => {
    await assertFails(setDoc(doc(trainerDb(), 'classTypes', 'sweat'), { cap: 99 }))
  })

  it('member cannot write an exercise', async () => {
    await assertFails(setDoc(doc(memberDb(), 'exercises', 'squat'), { name: 'Forged' }))
  })
})

describe('broadcast outbox', () => {
  // Written by the sendBroadcast callable after Apps Script confirms delivery,
  // so a row here always means mail actually went out.
  it('admin can read the outbox', async () => {
    await assertSucceeds(getDoc(doc(adminDb(), 'outbox', 'msg1')))
  })

  it('admin cannot forge a sent record', async () => {
    await assertFails(setDoc(doc(adminDb(), 'outbox', 'msg1'), { subject: 'Never sent' }))
  })

  it('member cannot read the outbox', async () => {
    await assertFails(getDoc(doc(memberDb(), 'outbox', 'msg1')))
  })
})

it('sanity: seeded state is intact', () => {
  assert.equal(activeMember.profile.role, 'member')
})
