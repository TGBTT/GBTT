#!/usr/bin/env node
/**
 * Populate Firestore with the class catalog, the recurring timetable slots and
 * concrete weekly sessions.
 *
 * The app reads availability from `sessions`, so until this runs the timetable
 * is legitimately empty. Each session is filed under the `slotId` of the
 * recurring slot it came from, which is what lockWeeklySlot fans a weekly
 * membership out across.
 *
 * `startsAt` is written as a real timestamp because cancelBooking and
 * unlockWeeklySlot refuse to act without one — the transfer window is measured
 * from it. Times are studio wall-clock times in Pacific/Auckland and are
 * converted here rather than relying on the timezone of whoever runs this.
 *
 * Safe to re-run: documents are keyed deterministically and merged, and an
 * existing session's bookedCount and roster are never overwritten.
 *
 * Usage (from the repo root):
 *   node functions/scripts/seed-timetable.mjs --key ./sa.json --weeks 8 --dry-run
 *   node functions/scripts/seed-timetable.mjs --key ./sa.json --weeks 8
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'

const TIME_ZONE = 'Pacific/Auckland'
const VENUE_ID = 'rec-park-centre'
const DURATION_MINUTES = 60

const CLASS_TYPES = [
  { id: 'sweat', name: 'Sweat', cap: 20 },
  { id: 'strong', name: 'Strong', cap: 20 },
  { id: 'circuits', name: 'Circuits', cap: 18 },
  { id: 'womens-fit', name: 'Womens Fit', cap: 16 },
  { id: 'mobility', name: 'Mobility', cap: 14 },
  { id: 'bodybalance', name: 'Les Mills BodyBalance', cap: 18 },
  { id: 'sculpt-strength', name: 'Sculpt & Strength', cap: 16 },
  { id: 'youth-fit', name: 'Youth Fit', cap: 14 },
  { id: 'kids-fit', name: 'Kids Fit', cap: 12 },
]

/**
 * Starting price list. `ratePerClass` is the per-class rate for that level of
 * commitment, and it is the whole price signal — there is no separate plan fee
 * on top. `casual` is the drop-in rate charged for one-off bookings, including
 * extras taken by members already on a subscription.
 *
 * Admin edits these in the console; these values only seed the first run.
 */
const PRICING_PLANS = [
  { id: 'casual', name: 'Guest / casual', ratePerClass: 17, classesPerWeek: 0 },
  { id: 'weekly1', name: 'One a week', ratePerClass: 15, classesPerWeek: 1 },
  { id: 'weekly2', name: 'Two a week', ratePerClass: 13, classesPerWeek: 2 },
  { id: 'weekly3', name: 'Three a week', ratePerClass: 11, classesPerWeek: 3 },
]

/** The recurring Mon–Fri timetable. */
const SLOTS = [
  { day: 'Mon', time: '06:00', classTypeId: 'sweat', instructorId: 'tom' },
  { day: 'Mon', time: '15:30', classTypeId: 'youth-fit', instructorId: 'tom' },
  { day: 'Mon', time: '17:15', classTypeId: 'strong', instructorId: 'tom' },
  { day: 'Mon', time: '18:45', classTypeId: 'circuits', instructorId: 'tom' },
  { day: 'Tue', time: '06:00', classTypeId: 'strong', instructorId: 'tom' },
  { day: 'Tue', time: '09:30', classTypeId: 'womens-fit', instructorId: 'tom' },
  { day: 'Wed', time: '06:00', classTypeId: 'mobility', instructorId: 'tom' },
  { day: 'Wed', time: '15:30', classTypeId: 'kids-fit', instructorId: 'tom' },
  { day: 'Wed', time: '17:15', classTypeId: 'strong', instructorId: 'tom' },
  { day: 'Thu', time: '06:00', classTypeId: 'sweat', instructorId: 'tom' },
  { day: 'Thu', time: '09:30', classTypeId: 'bodybalance', instructorId: 'tom' },
  { day: 'Thu', time: '17:15', classTypeId: 'sculpt-strength', instructorId: 'tom' },
  { day: 'Fri', time: '06:00', classTypeId: 'strong', instructorId: 'tom' },
]

const DAY_INDEX = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4 }

function parseArgs(argv) {
  const args = { weeks: 8, dryRun: false, skipSlots: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    switch (arg) {
      case '--key':
        args.key = argv[++i]
        break
      case '--weeks':
        args.weeks = Number(argv[++i])
        break
      case '--dry-run':
        args.dryRun = true
        break
      case '--skip-slots':
        args.skipSlots = true
        break
      case '--help':
      case '-h':
        args.help = true
        break
      default:
        throw new Error(`Unknown argument: ${arg}`)
    }
  }
  return args
}

/** Offset of `timeZone` from UTC, in ms, at the given instant. */
function zoneOffsetMs(utcMs, timeZone) {
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
    .reduce((acc, p) => ({ ...acc, [p.type]: p.value }), {})

  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  )
  return asUtc - utcMs
}

/**
 * Convert a studio wall-clock time to a UTC instant. Resolved twice so a
 * session that falls near a daylight-saving change lands on the correct side
 * of the transition rather than an hour out.
 */
function zonedToUtc(year, month, day, hour, minute, timeZone) {
  const guess = Date.UTC(year, month - 1, day, hour, minute)
  let instant = guess - zoneOffsetMs(guess, timeZone)
  instant = guess - zoneOffsetMs(instant, timeZone)
  return new Date(instant)
}

function pad(n) {
  return String(n).padStart(2, '0')
}

function dateKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Monday of the current week, in the runner's local calendar. */
function currentMonday(now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  d.setDate(d.getDate() + (d.getDay() === 0 ? -6 : 1 - d.getDay()))
  return d
}

function slotId(slot) {
  return `${slot.day.toLowerCase()}-${slot.time.replace(':', '')}-${slot.classTypeId}`
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(`
Seed the class catalog, timetable slots and weekly sessions.

  --key <path>   Service account JSON. Falls back to GOOGLE_APPLICATION_CREDENTIALS.
  --weeks <n>    Weeks of sessions to generate from this Monday (default: 8).
                 Use 0 to seed prices, classes and slots only, leaving the
                 timetable empty for a season to generate.
  --skip-slots   Do not write the recurring timetable template. Use when the
                 admin will build the week themselves. Implies no sessions.
  --dry-run      Print what would be written and exit.
`)
    return
  }

  // `--weeks 0` seeds only the configuration the app cannot run without: the
  // price list, the class catalog and the recurring slot template. No sessions
  // are created, so the timetable starts genuinely empty and the first classes
  // come from an admin defining a season and generating it.
  if (!Number.isInteger(args.weeks) || args.weeks < 0) {
    throw new Error('--weeks must be zero or a positive whole number.')
  }

  // Sessions are generated from the slot template, so keeping the slots out
  // while still asking for weeks of sessions would be contradictory.
  if (args.skipSlots) {
    args.weeks = 0
  }

  const capById = new Map(CLASS_TYPES.map((c) => [c.id, c.cap]))
  const nameById = new Map(CLASS_TYPES.map((c) => [c.id, c.name]))

  const monday = currentMonday()
  const planned = []

  for (let week = 0; week < args.weeks; week += 1) {
    const weekMonday = new Date(monday)
    weekMonday.setDate(weekMonday.getDate() + week * 7)
    const weekStart = dateKey(weekMonday)

    for (const slot of SLOTS) {
      const sessionDate = new Date(weekMonday)
      sessionDate.setDate(sessionDate.getDate() + DAY_INDEX[slot.day])
      const [hour, minute] = slot.time.split(':').map(Number)

      planned.push({
        id: `${slotId(slot)}-${weekStart}`,
        data: {
          slotId: slotId(slot),
          weekStart,
          dayLabel: slot.day,
          time: slot.time,
          classTypeId: slot.classTypeId,
          className: nameById.get(slot.classTypeId),
          cap: capById.get(slot.classTypeId),
          instructorId: slot.instructorId,
          venueId: VENUE_ID,
          venue: VENUE_ID,
          durationMinutes: DURATION_MINUTES,
          cancelled: false,
          startsAt: Timestamp.fromDate(
            zonedToUtc(
              sessionDate.getFullYear(),
              sessionDate.getMonth() + 1,
              sessionDate.getDate(),
              hour,
              minute,
              TIME_ZONE,
            ),
          ),
        },
      })
    }
  }

  console.log(`Class types : ${CLASS_TYPES.length}`)
  console.log(`Slots       : ${args.skipSlots ? '0 (skipped)' : SLOTS.length}`)
  console.log(`Sessions    : ${planned.length} (${args.weeks} weeks from ${dateKey(monday)})`)

  if (args.dryRun) {
    const sample = planned[0]
    if (sample) {
      console.log(`\nSample session ${sample.id}:`)
      console.log(
        JSON.stringify(
          { ...sample.data, startsAt: sample.data.startsAt.toDate().toISOString() },
          null,
          2,
        ),
      )
    } else {
      console.log('\nNo sessions planned — configuration only.')
    }
    console.log('\nDry run — nothing written.')
    return
  }

  // Credentials are only needed for a real write, so --dry-run stays usable
  // without a service-account key.
  let credential
  let projectId
  if (args.key) {
    const raw = JSON.parse(readFileSync(resolve(args.key), 'utf8'))
    projectId = raw.project_id
    credential = cert(raw)
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    credential = applicationDefault()
  } else {
    throw new Error(
      'No credentials. Pass --key <service-account.json> or set GOOGLE_APPLICATION_CREDENTIALS.',
    )
  }

  initializeApp({ credential, projectId })
  const db = getFirestore()

  for (const classType of CLASS_TYPES) {
    await db.doc(`classTypes/${classType.id}`).set(classType, { merge: true })
  }
  console.log('Wrote class catalog.')

  for (const plan of PRICING_PLANS) {
    // Merged, so re-running never resets a rate the admin has since changed.
    await db.doc(`pricingPlans/${plan.id}`).set(plan, { merge: true })
  }
  console.log('Wrote pricing plans.')

  for (const slot of args.skipSlots ? [] : SLOTS) {
    await db.doc(`timetableSlots/${slotId(slot)}`).set(
      {
        slotId: slotId(slot),
        dayLabel: slot.day,
        time: slot.time,
        classTypeId: slot.classTypeId,
        instructorId: slot.instructorId,
        venueId: VENUE_ID,
        active: true,
      },
      { merge: true },
    )
  }
  console.log(args.skipSlots ? 'Skipped timetable slots.' : 'Wrote timetable slots.')

  let created = 0
  let updated = 0
  for (const session of planned) {
    const ref = db.doc(`sessions/${session.id}`)
    const existing = await ref.get()
    if (existing.exists) {
      // Never touch bookedCount: it is derived from the roster by the booking
      // callables, and clobbering it here would silently free or lose seats.
      const { ...scheduleOnly } = session.data
      await ref.set(scheduleOnly, { merge: true })
      updated += 1
    } else {
      await ref.set({ ...session.data, bookedCount: 0 })
      created += 1
    }
  }

  console.log(`Sessions created: ${created}, updated: ${updated}`)
  console.log('\nDone. The timetable should now render in the app.')
}

main().catch((err) => {
  console.error(`\nFailed: ${err.message}`)
  process.exit(1)
})
