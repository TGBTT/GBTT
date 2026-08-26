/** Simulated fitness studio — prepaid packs, class caps, exercises, calendar/Firebase labels. */

export type PlanId = 'casual' | 'pack10' | 'pack20' | 'threeWeek'

export interface FitnessPlan {
  id: PlanId
  name: string
  blurb: string
  ratePerClass: number
  credits: number
  prepaidTotal: number
}

export interface Exercise {
  id: string
  name: string
}

export interface ClassType {
  id: string
  name: string
  blurb: string
  cap: number
  exerciseIds: string[]
}

export interface ClassOccurrence {
  id: string
  classTypeId: string
  dayLabel: string
  time: string
  bookedCount: number
  roster: string[]
  calendarEventId: string
}

export const FITNESS_VENUE = 'Rec Park Centre, Golden Bay'

export const FITNESS_PLANS: FitnessPlan[] = [
  {
    id: 'casual',
    name: 'Casual',
    blurb: 'Drop in — pay in advance for one class.',
    ratePerClass: 17,
    credits: 1,
    prepaidTotal: 17,
  },
  {
    id: 'pack10',
    name: '10-class pack',
    blurb: '$15 a class when you book 10 in advance.',
    ratePerClass: 15,
    credits: 10,
    prepaidTotal: 150,
  },
  {
    id: 'pack20',
    name: '20-class pack',
    blurb: '$12.50 a class when you book 20 in advance.',
    ratePerClass: 12.5,
    credits: 20,
    prepaidTotal: 250,
  },
  {
    id: 'threeWeek',
    name: '3 classes a week',
    blurb: '$10 a class — prepaid week of three sessions ($30). Monthly view $120 / 12 classes.',
    ratePerClass: 10,
    credits: 3,
    prepaidTotal: 30,
  },
]

const DEFAULT_EXERCISES: Exercise[] = [
  { id: 'squat', name: 'Squat' },
  { id: 'deadlift', name: 'Deadlift' },
  { id: 'press', name: 'Overhead press' },
  { id: 'row', name: 'Bent-over row' },
  { id: 'burpee', name: 'Burpee' },
  { id: 'kbswing', name: 'Kettlebell swing' },
  { id: 'boxjump', name: 'Box jump' },
  { id: 'bike', name: 'Assault bike' },
  { id: 'hipopener', name: 'Hip opener' },
  { id: 'tspine', name: 'Thoracic mobility' },
  { id: 'plank', name: 'Plank' },
  { id: 'flow', name: 'Sun flow' },
  { id: 'lunge', name: 'Walking lunge' },
  { id: 'pushup', name: 'Push-up' },
  { id: 'balance', name: 'Single-leg balance' },
]

const DEFAULT_CLASSES: ClassType[] = [
  {
    id: 'sweat',
    name: 'Sweat',
    blurb: `Cardio and high-intensity at ${FITNESS_VENUE} — cap 16.`,
    cap: 16,
    exerciseIds: ['burpee', 'kbswing', 'boxjump', 'bike'],
  },
  {
    id: 'strong',
    name: 'Strong',
    blurb: `Functional strength and resistance at ${FITNESS_VENUE} — cap 20.`,
    cap: 20,
    exerciseIds: ['squat', 'deadlift', 'press', 'row'],
  },
  {
    id: 'mobility',
    name: 'Mobility',
    blurb: 'Recovery and range — cap 12.',
    cap: 12,
    exerciseIds: ['hipopener', 'tspine', 'plank'],
  },
  {
    id: 'circuits',
    name: 'Circuits',
    blurb: 'Station-based strength + cardio mix — cap 18.',
    cap: 18,
    exerciseIds: ['lunge', 'pushup', 'kbswing', 'bike'],
  },
  {
    id: 'bodybalance',
    name: 'Les Mills BodyBalance',
    blurb: 'Yoga, tai chi, and pilates-inspired flow — cap 20.',
    cap: 20,
    exerciseIds: ['flow', 'plank', 'hipopener', 'balance'],
  },
]

const DEFAULT_OCCURRENCES: ClassOccurrence[] = [
  {
    id: 'occ-strong-am',
    classTypeId: 'strong',
    dayLabel: 'Thu',
    time: '06:30',
    bookedCount: 14,
    roster: ['Aroha K.', 'Ben T.', 'Cara M.', 'Dan P.', 'Eli R.'],
    calendarEventId: 'cal-strong-0630',
  },
  {
    id: 'occ-sweat-noon',
    classTypeId: 'sweat',
    dayLabel: 'Thu',
    time: '12:10',
    bookedCount: 16,
    roster: ['Fran S.', 'Gus W.', 'Hana L.', 'Ivy N.'],
    calendarEventId: 'cal-sweat-1210',
  },
  {
    id: 'occ-mob-pm',
    classTypeId: 'mobility',
    dayLabel: 'Thu',
    time: '17:30',
    bookedCount: 8,
    roster: ['Jo B.', 'Kai H.'],
    calendarEventId: 'cal-mob-1730',
  },
  {
    id: 'occ-balance-eve',
    classTypeId: 'bodybalance',
    dayLabel: 'Thu',
    time: '18:45',
    bookedCount: 14,
    roster: ['Lea C.', 'Mo T.', 'Nia V.'],
    calendarEventId: 'cal-bodybalance-1845',
  },
  {
    id: 'occ-circuits-fri',
    classTypeId: 'circuits',
    dayLabel: 'Fri',
    time: '06:30',
    bookedCount: 11,
    roster: ['Owen D.', 'Pip S.'],
    calendarEventId: 'cal-circuits-fri-0630',
  },
  {
    id: 'occ-sweat-sat',
    classTypeId: 'sweat',
    dayLabel: 'Sat',
    time: '09:00',
    bookedCount: 9,
    roster: ['Quinn A.', 'Rae J.'],
    calendarEventId: 'cal-sweat-sat-0900',
  },
]

export interface DemoMember {
  name: string
  planId: PlanId
  creditsLeft: number
}

/** In-memory store — simulates Firebase + Calendar for this SPA session. */
const store = {
  exercises: [...DEFAULT_EXERCISES],
  classes: DEFAULT_CLASSES.map((c) => ({ ...c, exerciseIds: [...c.exerciseIds] })),
  occurrences: DEFAULT_OCCURRENCES.map((o) => ({ ...o, roster: [...o.roster] })),
  member: { name: 'Alex (demo member)', planId: 'pack10' as PlanId, creditsLeft: 7 },
  lastCalendarWrite: '',
  lastFirebaseWrite: '',
}

export function planById(id: PlanId): FitnessPlan | undefined {
  return FITNESS_PLANS.find((p) => p.id === id)
}

export function formatPrepaid(plan: FitnessPlan): string {
  if (plan.id === 'threeWeek') return `$${plan.prepaidTotal.toFixed(2)} this week`
  if (plan.credits === 1) return `$${plan.prepaidTotal.toFixed(2)} now`
  return `$${plan.prepaidTotal.toFixed(2)} prepaid`
}

export function getExercises(): Exercise[] {
  return store.exercises
}

export function getClassTypes(): ClassType[] {
  return store.classes
}

export function getOccurrences(): ClassOccurrence[] {
  return store.occurrences
}

export function getMember(): DemoMember {
  return store.member
}

export function classTypeById(id: string): ClassType | undefined {
  return store.classes.find((c) => c.id === id)
}

export function occurrenceById(id: string): ClassOccurrence | undefined {
  return store.occurrences.find((o) => o.id === id)
}

export function spotsLeft(occ: ClassOccurrence): number {
  const cap = classTypeById(occ.classTypeId)?.cap ?? occ.bookedCount
  return Math.max(0, cap - occ.bookedCount)
}

export function toggleExercise(classTypeId: string, exerciseId: string): void {
  const cls = classTypeById(classTypeId)
  if (!cls) return
  cls.exerciseIds = cls.exerciseIds.includes(exerciseId)
    ? cls.exerciseIds.filter((id) => id !== exerciseId)
    : [...cls.exerciseIds, exerciseId]
}

export function addExercise(name: string): Exercise | null {
  const trimmed = name.trim()
  if (!trimmed) return null
  const id = `ex-${trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${store.exercises.length + 1}`
  const item = { id, name: trimmed }
  store.exercises = [...store.exercises, item]
  return item
}

export function setClassCap(classTypeId: string, cap: number): void {
  const cls = classTypeById(classTypeId)
  if (!cls) return
  cls.cap = Math.min(27, Math.max(4, Math.round(cap)))
}

export function bookOccurrence(occurrenceId: string, planId: PlanId, attendeeName = 'You (demo)'): string | null {
  const occ = occurrenceById(occurrenceId)
  const plan = planById(planId)
  if (!occ || !plan) return 'Missing class or plan.'
  if (spotsLeft(occ) <= 0) return 'This class is full — calendar cap reached.'
  occ.bookedCount += 1
  occ.roster = [...occ.roster, attendeeName]
  store.member = {
    name: store.member.name,
    planId,
    creditsLeft: plan.credits - 1,
  }
  store.lastCalendarWrite = occ.calendarEventId
  store.lastFirebaseWrite = `${plan.id}:${store.member.creditsLeft} credits`
  return null
}

export function syncLabels(): { calendar: string; firebase: string } {
  return {
    calendar: store.lastCalendarWrite
      ? `Google Calendar (simulated) · would write event ${store.lastCalendarWrite}`
      : 'Google Calendar (simulated) · waiting for a booking',
    firebase: store.lastFirebaseWrite
      ? `Firebase (simulated) · would update ${store.lastFirebaseWrite}`
      : 'Firebase (simulated) · member packs idle — schema TBD',
  }
}
