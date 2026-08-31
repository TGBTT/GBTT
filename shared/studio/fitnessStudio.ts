/** GBTT studio store — local persistence until Firestore is live; API mirrors production schema. */

export type PlanId = 'casual' | 'pack10' | 'pack20' | 'weekly1' | 'weekly2' | 'weekly3'
export type SimRole = 'public' | 'member' | 'admin' | 'trainer'
export type ExerciseDisplay = 'hidden' | 'defaults' | 'custom'
export type RosterStatus = 'booked' | 'attended' | 'noShow'
export type AttendeeKind = 'member' | 'guest'

export interface FitnessPlan {
  id: PlanId
  name: string
  blurb: string
  ratePerClass: number
  /** Weekly allowance when subscription-based; 0 for prepaid packs tracked as credits. */
  classesPerWeek: number
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
  /** Public purpose / fuller explanation shown when expanded. */
  longDescription: string
  warnings: string
  restrictions: string
  recommendations: string
  whatToBring: string
  /** Max capacity — max attendees per session (set in trainer admin). */
  cap: number
  exerciseIds: string[]
  /** Soft-delete — hidden from booking when false. */
  active?: boolean
}

export interface RosterEntry {
  memberId?: string
  displayName: string
  kind: AttendeeKind
  showName: boolean
  status?: RosterStatus
  bookedBy?: 'self' | 'admin'
  attendedAt?: string
}

export interface ClassOccurrence {
  id: string
  classTypeId: string
  dayLabel: string
  time: string
  venueId: string
  /** Session-specific exercises when exerciseDisplay is custom. */
  exerciseIds: string[]
  exerciseDisplay?: ExerciseDisplay
  /** Attendees booked for this session (members + guests). */
  bookedCount: number
  /** Session-level capacity override; falls back to the class type cap. */
  cap?: number
  cancelled?: boolean
  /** Recurring timetable slot this session belongs to; the key weekly locks use. */
  slotId?: string
  roster: RosterEntry[]
  calendarEventId: string
  instructorId: string
}

export interface SimUser {
  id: string
  email: string
  password: string
  name: string
  role: 'member' | 'admin' | 'trainer'
  planId: PlanId
  creditsLeft: number
  classesPerWeek: number
  /** Recurring weekly template slots (Mon–Fri timetable ids) — locks every week. */
  weeklyLockedOccurrenceIds: string[]
  /** Mirrors weekly locks for subscription members; kept for pack/casual one-offs. */
  heldOccurrenceIds: string[]
  /** Email activation completed (Apps Script key). */
  activated: boolean
  showNameToClassmates: boolean
  paid: boolean
  paymentNote: string
  limitations: string
  riskNotes: string
  termsAccepted: boolean
  /** Optional per-client discount percent (0–100). */
  discountPercent?: number
  customDiscountNote?: string
  /** Attendance history count (denormalized). */
  sessionsAttended?: number
  /** Subscription change awaiting Tom’s payment confirmation. */
  pendingPlanId?: PlanId | null
}

export interface ReminderItem {
  id: string
  title: string
  dueLabel: string
  done: boolean
  kind: 'marketing' | 'ops'
}

export interface OutboxMessage {
  id: string
  subject: string
  body: string
  sentAt: string
  recipientCount: number
}

export interface SiteContent {
  heroBlurb: string
  scheduleNarrative: string
  contactDisplay: string
  paymentInstructions: string
  termsText: string
  waiverText: string
}

export interface TeamMember {
  id: string
  name: string
  role: 'lead' | 'trainer'
  notes: string
}

// Bumped for the substitute -> trainer rename: a store persisted under the old
// key holds seed users whose role no longer exists.
export const STORAGE_KEY = 'gbtt-sim-v5'
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const
export type Weekday = (typeof WEEKDAYS)[number]

export const FITNESS_PLANS: FitnessPlan[] = [
  {
    id: 'casual',
    name: 'Guest / casual',
    blurb: 'Single drop-in — no weekly subscription.',
    ratePerClass: 17,
    classesPerWeek: 0,
    credits: 1,
    prepaidTotal: 17,
  },
  {
    id: 'weekly1',
    name: '1 class / week',
    blurb: 'One reserved slot each week — reshuffle which class within your allowance.',
    ratePerClass: 15,
    classesPerWeek: 1,
    credits: 0,
    prepaidTotal: 60,
  },
  {
    id: 'weekly2',
    name: '2 classes / week',
    blurb: 'Two slots per week — swap classes as your week changes.',
    ratePerClass: 13,
    classesPerWeek: 2,
    credits: 0,
    prepaidTotal: 104,
  },
  {
    id: 'weekly3',
    name: '3 classes / week',
    blurb: 'Three slots per week — full GBTT membership rhythm.',
    ratePerClass: 10,
    classesPerWeek: 3,
    credits: 0,
    prepaidTotal: 120,
  },
  {
    id: 'pack10',
    name: '10-class pack',
    blurb: 'Prepaid credits — burn one per booking.',
    ratePerClass: 15,
    classesPerWeek: 0,
    credits: 10,
    prepaidTotal: 150,
  },
  {
    id: 'pack20',
    name: '20-class pack',
    blurb: 'Larger prepaid pack.',
    ratePerClass: 12.5,
    classesPerWeek: 0,
    credits: 20,
    prepaidTotal: 250,
  },
]

const DEFAULT_EXERCISES: Exercise[] = [
  { id: 'squat', name: 'Squat' },
  { id: 'deadlift', name: 'Deadlift' },
  { id: 'press', name: 'Overhead press' },
  { id: 'row', name: 'Bent-over row' },
  { id: 'burpee', name: 'Burpee' },
  { id: 'kbswing', name: 'Kettlebell swing' },
  { id: 'boxjump', name: 'Box step-up' },
  { id: 'medball', name: 'Medicine ball slam' },
  { id: 'hipopener', name: 'Hip opener' },
  { id: 'tspine', name: 'Thoracic mobility' },
  { id: 'plank', name: 'Plank' },
  { id: 'flow', name: 'Sun salutation flow' },
  { id: 'lunge', name: 'Walking lunge' },
  { id: 'pushup', name: 'Push-up' },
  { id: 'balance', name: 'Single-leg balance' },
  { id: 'boxing', name: 'Boxing pads' },
  { id: 'trx', name: 'TRX row' },
  { id: 'band', name: 'Band pull-apart' },
  { id: 'pilates', name: 'Pilates hundred' },
  { id: 'game', name: 'Obstacle game' },
]

const DEFAULT_CLASSES: ClassType[] = [
  {
    id: 'sweat',
    name: 'Sweat',
    blurb: 'High-intensity cardio and powerful movements — high or low impact.',
    longDescription:
      'A high intensity class that combines cardio and powerful movements that can be high or low impact.',
    warnings: 'High heart rate and impact options — stop if dizzy, faint, or in pain.',
    restrictions: 'Ages 14+ recommended unless cleared with Tom. Impact moves can be regressed.',
    recommendations: 'Eat lightly 1–2 hours before class and hydrate well through the day.',
    whatToBring: 'Towel, water bottle, and comfortable trainers.',
    cap: 20,
    exerciseIds: ['burpee', 'kbswing', 'boxjump', 'medball'],
  },
  {
    id: 'strong',
    name: 'Strong',
    blurb: 'Resistance equipment to build strength, posture, and technique.',
    longDescription:
      'Use resistance equipment and challenge your muscles to gain strength, improve posture and exercise technique! Those with a little or a lot of strength can come to this class.',
    warnings: 'Lift within your limits — ask for a spot or lighter load when unsure.',
    restrictions: 'Suitable for beginners with coaching; inform Tom of back or shoulder issues.',
    recommendations: 'Stable shoes and a warm-up walk or mobility beforehand helps.',
    whatToBring: 'Water bottle and towel; gloves optional.',
    cap: 20,
    exerciseIds: ['squat', 'deadlift', 'press', 'row'],
  },
  {
    id: 'circuits',
    name: 'Circuits',
    blurb: 'Strength, cardio, and mobility in one full-body session.',
    longDescription:
      'This is an all round session using strength, cardio and mobility to hit the whole body. A great fit if you only have time for 1 session per week.',
    warnings: 'Multiple stations — pace yourself and flag fatigue early.',
    restrictions: 'All levels welcome; every station has easier options.',
    recommendations: 'Ideal if you only train once per week and want full-body work.',
    whatToBring: 'Towel, water, and trainers.',
    cap: 18,
    exerciseIds: ['lunge', 'pushup', 'kbswing', 'trx'],
  },
  {
    id: 'womens-fit',
    name: 'Womens Fit',
    blurb: 'Cardio and strength for all ages — child friendly.',
    longDescription:
      'One for the ladies of all ages and you can bring your kids! Cardio and strength work with options to regress or progress your efforts based on how you are feeling. If you bring kids there are toys for them to play with.',
    warnings: 'Children must stay in the designated play area — you remain responsible for them.',
    restrictions: 'Open to women and girls of all ages; kids welcome with toys provided.',
    recommendations: 'Come as you are — options to push or ease off every round.',
    whatToBring: 'Water bottle; snacks/toys for kids if helpful.',
    cap: 16,
    exerciseIds: ['band', 'kbswing', 'lunge', 'plank'],
  },
  {
    id: 'mobility',
    name: 'Mobility',
    blurb: 'Low impact, controlled range-of-motion and core work.',
    longDescription:
      'Low impact, slow movement focused on full control and range of motion. A combination of core, isolation and mobility movements to help minimise injury and increase your mobility.',
    warnings: 'Move slowly — forcing range causes injury. Breathe through tight spots.',
    restrictions: 'Great for recovery days and injury prevention; no jumping.',
    recommendations: 'Wear layers you can move in; ideal after desk work or heavy training days.',
    whatToBring: 'Water bottle; yoga mat optional (mats available).',
    cap: 14,
    exerciseIds: ['hipopener', 'tspine', 'plank', 'balance'],
  },
  {
    id: 'bodybalance',
    name: 'Les Mills BodyBalance',
    blurb: 'Yoga-inspired flow set to music for a full-body workout.',
    longDescription:
      'Yoga inspired flow set to music for a fullbody workout.',
    warnings: 'Balance work — use a wall or mat edge if needed. Pregnancy: tell the instructor.',
    restrictions: 'Les Mills format; barefoot or grippy socks recommended.',
    recommendations: 'Arrive a few minutes early to set up your mat space.',
    whatToBring: 'Water bottle; comfortable stretch clothing.',
    cap: 18,
    exerciseIds: ['flow', 'plank', 'hipopener', 'balance'],
  },
  {
    id: 'sculpt-strength',
    name: 'Sculpt & Strength',
    blurb: 'High-intensity, low-impact pilates and strength fusion.',
    longDescription:
      'High intensity but low impact pilates/strength work in this fusion class designed for that juicy burn!',
    warnings: 'Core-heavy — stop if sharp lower-back pain. Low impact but high effort.',
    restrictions: 'Not ideal in late pregnancy without clearance.',
    recommendations: 'Great complement to running or heavy lifting programmes.',
    whatToBring: 'Water bottle and towel.',
    cap: 16,
    exerciseIds: ['pilates', 'plank', 'band', 'press'],
  },
  {
    id: 'youth-fit',
    name: 'Youth Fit',
    blurb: 'Strength, boxing, and cardio for ages 11+ — good vibes only.',
    longDescription:
      'A fun intro to training. A combination of strength, boxing and cardio. Competition free and supportive. Everything is optional! Good vibes only!',
    warnings: 'Parent/guardian must sign waiver for under-18s. No contact sparring.',
    restrictions: 'Ages 11+ only. Everything is optional — no pressure to compete.',
    recommendations: 'School sports kit or comfortable gym clothes.',
    whatToBring: 'Water bottle; indoor trainers.',
    cap: 14,
    exerciseIds: ['boxing', 'pushup', 'kbswing', 'burpee'],
  },
  {
    id: 'kids-fit',
    name: 'Kids Fit',
    blurb: 'Playful training for ages 5–10 — games, skills, and teamwork.',
    longDescription:
      'Playful movement and intro to training for ages 5–10. Games, bodyweight skills, and team activities — everything is optional and fun-first.',
    warnings: 'Parent/guardian must remain on site or as arranged with Tom.',
    restrictions: 'Ages 5–10 only. Fun-first — kids can opt out of any activity.',
    recommendations: 'Encourage trainers they can get dirty in.',
    whatToBring: 'Water bottle; parent contact details on file.',
    cap: 12,
    exerciseIds: ['game', 'balance', 'lunge', 'pushup'],
  },
]

function seedRoster(names: string[]): RosterEntry[] {
  return names.map((displayName, i) => ({
    displayName,
    kind: 'member' as const,
    showName: i % 2 === 0,
    memberId: `seed-${displayName.toLowerCase().replace(/[^a-z]/g, '')}`,
  }))
}

const DEFAULT_OCCURRENCES: ClassOccurrence[] = [
  {
    id: 'occ-mon-sweat',
    classTypeId: 'sweat',
    dayLabel: 'Mon',
    time: '06:00',
    venueId: 'rec-park-centre',
    exerciseIds: [],
    bookedCount: 14,
    roster: seedRoster(['Aroha K.', 'Ben T.']),
    calendarEventId: 'cal-mon-sweat',
    instructorId: 'tom',
  },
  {
    id: 'occ-mon-youth',
    classTypeId: 'youth-fit',
    dayLabel: 'Mon',
    time: '15:30',
    venueId: 'rec-park-centre',
    exerciseIds: [],
    bookedCount: 8,
    roster: seedRoster(['Cara M.']),
    calendarEventId: 'cal-mon-youth',
    instructorId: 'tom',
  },
  {
    id: 'occ-mon-strong',
    classTypeId: 'strong',
    dayLabel: 'Mon',
    time: '17:15',
    venueId: 'rec-park-centre',
    exerciseIds: [],
    bookedCount: 16,
    roster: seedRoster(['Dan P.', 'Eli R.']),
    calendarEventId: 'cal-mon-strong',
    instructorId: 'tom',
  },
  {
    id: 'occ-mon-circuits',
    classTypeId: 'circuits',
    dayLabel: 'Mon',
    time: '18:45',
    venueId: 'rec-park-centre',
    exerciseIds: [],
    bookedCount: 12,
    roster: seedRoster(['Fran S.']),
    calendarEventId: 'cal-mon-circuits',
    instructorId: 'tom',
  },
  {
    id: 'occ-tue-strong',
    classTypeId: 'strong',
    dayLabel: 'Tue',
    time: '06:00',
    venueId: 'rec-park-centre',
    exerciseIds: [],
    bookedCount: 11,
    roster: seedRoster(['Gus W.']),
    calendarEventId: 'cal-tue-strong',
    instructorId: 'tom',
  },
  {
    id: 'occ-tue-womens',
    classTypeId: 'womens-fit',
    dayLabel: 'Tue',
    time: '09:30',
    venueId: 'rec-park-centre',
    exerciseIds: [],
    bookedCount: 10,
    roster: seedRoster(['Hana L.', 'Ivy N.']),
    calendarEventId: 'cal-tue-womens',
    instructorId: 'tom',
  },
  {
    id: 'occ-wed-mobility',
    classTypeId: 'mobility',
    dayLabel: 'Wed',
    time: '06:00',
    venueId: 'rec-park-centre',
    exerciseIds: [],
    bookedCount: 9,
    roster: seedRoster(['Jo B.']),
    calendarEventId: 'cal-wed-mobility',
    instructorId: 'priya',
  },
  {
    id: 'occ-wed-kids',
    classTypeId: 'kids-fit',
    dayLabel: 'Wed',
    time: '15:30',
    venueId: 'rec-park-centre',
    exerciseIds: [],
    bookedCount: 7,
    roster: seedRoster(['Kai H.']),
    calendarEventId: 'cal-wed-kids',
    instructorId: 'tom',
  },
  {
    id: 'occ-wed-strong',
    classTypeId: 'strong',
    dayLabel: 'Wed',
    time: '17:15',
    venueId: 'rec-park-centre',
    exerciseIds: [],
    bookedCount: 15,
    roster: seedRoster(['Lea C.', 'Owen D.']),
    calendarEventId: 'cal-wed-strong',
    instructorId: 'tom',
  },
  {
    id: 'occ-thu-sweat',
    classTypeId: 'sweat',
    dayLabel: 'Thu',
    time: '06:00',
    venueId: 'rec-park-centre',
    exerciseIds: [],
    bookedCount: 13,
    roster: seedRoster(['Pip S.']),
    calendarEventId: 'cal-thu-sweat',
    instructorId: 'tom',
  },
  {
    id: 'occ-thu-bodybalance',
    classTypeId: 'bodybalance',
    dayLabel: 'Thu',
    time: '09:30',
    venueId: 'rec-park-centre',
    exerciseIds: [],
    bookedCount: 12,
    roster: seedRoster(['Quinn A.', 'Rae T.']),
    calendarEventId: 'cal-thu-bodybalance',
    instructorId: 'jess',
  },
  {
    id: 'occ-thu-sculpt',
    classTypeId: 'sculpt-strength',
    dayLabel: 'Thu',
    time: '17:15',
    venueId: 'rec-park-centre',
    exerciseIds: [],
    bookedCount: 11,
    roster: seedRoster(['Sam V.']),
    calendarEventId: 'cal-thu-sculpt',
    instructorId: 'tom',
  },
  {
    id: 'occ-fri-strong',
    classTypeId: 'strong',
    dayLabel: 'Fri',
    time: '06:00',
    venueId: 'rec-park-centre',
    exerciseIds: [],
    bookedCount: 10,
    roster: seedRoster(['Tia W.']),
    calendarEventId: 'cal-fri-strong',
    instructorId: 'tom',
  },
]

const DEFAULT_USERS: SimUser[] = []

const DEFAULT_SITE: SiteContent = {
  heroBlurb: 'Fit for Life — group workouts for every body at Rec Park Centre, Tākaka.',
  scheduleNarrative:
    'Weekly timetable below shows live fill — book in the member app when a spot is open.',
  contactDisplay: 'Tom · Tom.GBTT@gmail.com · 021 089 28057',
  paymentInstructions:
    'Pay by bank transfer to the GBTT account Tom provides, or cash at Rec Park before class. Mark paid in admin once cleared.',
  termsText:
    'GBTT weekly memberships lock recurring Mon–Fri slots on the timetable. Move sessions within your allowance before the transfer cutoff. Sessions not transferred in time and not attended are non-refundable as they hold your place.',
  waiverText:
    'I understand group fitness involves physical effort and accept responsibility for my own limits. I agree that Tom may edit my membership details and session bookings in line with studio policy.',
}

/*
 * The team and the reminder list are read from Firestore, and the only users
 * in this store are the ones a real Firebase sign-in binds into it. Seeding any
 * of the three put invented trainers, a fictional client and demo to-dos in
 * front of Tom, so all three start empty.
 */
const DEFAULT_TEAM: TeamMember[] = []

const DEFAULT_REMINDERS: ReminderItem[] = []

interface StoreState {
  exercises: Exercise[]
  classes: ClassType[]
  occurrences: ClassOccurrence[]
  users: SimUser[]
  sessionUserId: string | null
  site: SiteContent
  team: TeamMember[]
  reminders: ReminderItem[]
  outbox: OutboxMessage[]
  equipmentChecked: string[]
  lastCalendarWrite: string
  lastFirebaseWrite: string
  transferWindowHours: number
  pricingPlans: FitnessPlan[]
}

function seedState(): StoreState {
  return {
    exercises: DEFAULT_EXERCISES.map((e) => ({ ...e })),
    classes: DEFAULT_CLASSES.map((c) => ({ ...c, exerciseIds: [...c.exerciseIds] })),
    occurrences: DEFAULT_OCCURRENCES.map((o) => ({
      ...o,
      exerciseIds: [...o.exerciseIds],
      roster: o.roster.map((r) => ({ ...r })),
    })),
    users: DEFAULT_USERS.map((u) => ({
      ...u,
      weeklyLockedOccurrenceIds: [...u.weeklyLockedOccurrenceIds],
      heldOccurrenceIds: [...u.heldOccurrenceIds],
    })),
    sessionUserId: null,
    site: { ...DEFAULT_SITE },
    team: DEFAULT_TEAM.map((t) => ({ ...t })),
    reminders: DEFAULT_REMINDERS.map((r) => ({ ...r })),
    outbox: [],
    equipmentChecked: [],
    lastCalendarWrite: '',
    lastFirebaseWrite: '',
    transferWindowHours: 24,
    pricingPlans: FITNESS_PLANS.map((p) => ({ ...p })),
  }
}

function migrateUser(u: SimUser): SimUser {
  const weeklyLockedOccurrenceIds = u.weeklyLockedOccurrenceIds ?? [...(u.heldOccurrenceIds ?? [])]
  return {
    ...u,
    activated: u.activated ?? true,
    weeklyLockedOccurrenceIds,
    heldOccurrenceIds: weeklyLockedOccurrenceIds,
  }
}

/** Apply recurring weekly locks to timetable rosters (idempotent). */
function syncMemberWeeklyLocks(
  u: SimUser,
  occurrences: ClassOccurrence[] = store.occurrences,
  classes: ClassType[] = store.classes,
): void {
  if (u.role !== 'member') return
  u.heldOccurrenceIds = [...u.weeklyLockedOccurrenceIds]

  for (const occ of occurrences) {
    const onRoster = occ.roster.some((r) => r.memberId === u.id)
    const shouldBeOn = u.weeklyLockedOccurrenceIds.includes(occ.id)
    if (onRoster && !shouldBeOn) {
      occ.roster = occ.roster.filter((r) => r.memberId !== u.id)
      occ.bookedCount = Math.max(0, occ.bookedCount - 1)
    }
  }

  for (const occId of u.weeklyLockedOccurrenceIds) {
    const occ = occurrences.find((o) => o.id === occId)
    if (!occ) continue
    if (occ.roster.some((r) => r.memberId === u.id)) continue
    const cap = classes.find((c) => c.id === occ.classTypeId)?.cap ?? occ.bookedCount
    if (occ.bookedCount >= cap) continue
    occ.roster = [
      ...occ.roster,
      {
        memberId: u.id,
        displayName: u.name,
        kind: 'member',
        showName: u.showNameToClassmates,
      },
    ]
    occ.bookedCount += 1
  }
}

function migrateClass(cls: ClassType): ClassType {
  const def = DEFAULT_CLASSES.find((d) => d.id === cls.id)
  if (!def) return { ...cls, active: cls.active ?? true }
  return {
    ...cls,
    active: cls.active ?? true,
    blurb: cls.blurb ?? def.blurb,
    longDescription: cls.longDescription ?? def.longDescription,
    warnings: cls.warnings ?? def.warnings,
    restrictions: cls.restrictions ?? def.restrictions,
    recommendations: cls.recommendations ?? def.recommendations,
    whatToBring: cls.whatToBring ?? def.whatToBring,
    cap: cls.cap ?? def.cap,
    exerciseIds: cls.exerciseIds?.length ? cls.exerciseIds : [...def.exerciseIds],
  }
}

function normalizeStore(parsed: StoreState): StoreState {
  parsed.classes = parsed.classes.map(migrateClass)
  parsed.users = parsed.users.map(migrateUser)
  parsed.site = { ...DEFAULT_SITE, ...(parsed.site ?? {}) }
  parsed.team = parsed.team?.length ? parsed.team : DEFAULT_TEAM.map((t) => ({ ...t }))
  parsed.reminders = parsed.reminders ?? DEFAULT_REMINDERS.map((r) => ({ ...r }))
  parsed.outbox = parsed.outbox ?? []
  parsed.equipmentChecked = parsed.equipmentChecked ?? []
  parsed.transferWindowHours = parsed.transferWindowHours ?? 24
  parsed.pricingPlans = parsed.pricingPlans?.length
    ? parsed.pricingPlans
    : FITNESS_PLANS.map((p) => ({ ...p }))
  for (const occ of parsed.occurrences) {
    occ.exerciseDisplay = occ.exerciseDisplay ?? 'defaults'
    for (const r of occ.roster) {
      r.status = r.status ?? 'booked'
    }
  }
  for (const u of parsed.users) {
    syncMemberWeeklyLocks(u, parsed.occurrences, parsed.classes)
  }
  return parsed
}

function loadState(): StoreState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return seedState()
    const parsed = JSON.parse(raw) as StoreState
    if (!parsed?.classes?.length || !parsed?.users?.length) return seedState()
    return normalizeStore(parsed)
  } catch {
    return seedState()
  }
}

let store: StoreState = typeof localStorage !== 'undefined' ? loadState() : seedState()

/*
 * Same-tab listeners. The `storage` event only fires in *other* tabs, so a
 * component that is not the one calling the mutation (the site nav, for
 * instance) would never hear about a sign-in or sign-out without this.
 */
const listeners = new Set<() => void>()

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    /* ignore quota */
  }
  store.lastFirebaseWrite = `localStorage · ${new Date().toISOString().slice(11, 19)}`
  for (const listener of listeners) listener()
}

export function reloadStore(): void {
  if (typeof localStorage === 'undefined') return
  store = loadState()
}

/**
 * Subscribe to store changes, whether they came from this tab (a mutation
 * calling `persist`) or another one (the `storage` event).
 */
export function subscribeStore(onChange: () => void): () => void {
  listeners.add(onChange)
  if (typeof window === 'undefined') return () => listeners.delete(onChange)
  const handler = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY || e.key === null) {
      reloadStore()
      onChange()
    }
  }
  window.addEventListener('storage', handler)
  return () => {
    listeners.delete(onChange)
    window.removeEventListener('storage', handler)
  }
}

export function planById(id: PlanId): FitnessPlan | undefined {
  return FITNESS_PLANS.find((p) => p.id === id)
}

export function formatPrepaid(plan: FitnessPlan): string {
  if (plan.classesPerWeek > 0) return `$${plan.prepaidTotal.toFixed(0)} / month equiv.`
  if (plan.credits === 1) return `$${plan.prepaidTotal.toFixed(2)} now`
  return `$${plan.prepaidTotal.toFixed(2)} prepaid`
}

export function getExercises(): Exercise[] {
  return store.exercises
}

export function getClassTypes(): ClassType[] {
  return store.classes.filter((c) => c.active !== false)
}

/** Default exercises linked to a class type (trainer admin checklist). */
export function exercisesForClassType(classType: ClassType): Exercise[] {
  return classType.exerciseIds
    .map((id) => store.exercises.find((e) => e.id === id))
    .filter(Boolean) as Exercise[]
}

export function getOccurrences(): ClassOccurrence[] {
  return store.occurrences
}

export function getSiteContent(): SiteContent {
  return store.site
}

export function getOutbox(): OutboxMessage[] {
  return store.outbox
}

export function getEquipmentChecked(): string[] {
  return store.equipmentChecked
}

export function getSessionUser(): SimUser | null {
  if (!store.sessionUserId) return null
  return store.users.find((u) => u.id === store.sessionUserId) ?? null
}

export function getSessionRole(): SimRole {
  const u = getSessionUser()
  if (!u) return 'public'
  return u.role
}

export function classTypeById(id: string): ClassType | undefined {
  return store.classes.find((c) => c.id === id)
}

export function occurrenceById(id: string): ClassOccurrence | undefined {
  return store.occurrences.find((o) => o.id === id)
}

export function userById(id: string): SimUser | undefined {
  return store.users.find((u) => u.id === id)
}

export function spotsLeft(occ: ClassOccurrence): number {
  const maxCapacity = capacityFor(occ)
  return Math.max(0, maxCapacity - occ.bookedCount)
}

/**
 * Live sessions carry their own cap, which is what the server enforces in
 * bookSession, so it wins over the class-type default here too.
 */
export function capacityFor(occ: ClassOccurrence): number {
  return occ.cap ?? classTypeById(occ.classTypeId)?.cap ?? occ.bookedCount
}

export function sessionIsFull(occ: ClassOccurrence): boolean {
  return spotsLeft(occ) <= 0
}

/** Shared label: "12/16 attending" */
export function formatSessionAttending(occ: ClassOccurrence): string {
  return `${occ.bookedCount}/${capacityFor(occ)} attending`
}

/** Build a URL under the Vite base (same pattern as hero logo assets). */
export function publicAssetUrl(baseUrl: string, path: string): string {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  return `${base}${path.replace(/^\//, '')}`
}

/** Responsive card image paths under /images/classes/{id}/ */
export function classImageSources(
  classTypeId: string,
  baseUrl: string,
  variant: 'card' | 'thumb' = 'card',
) {
  const dir = publicAssetUrl(baseUrl, `images/classes/${classTypeId}`)
  if (variant === 'thumb') {
    return {
      webpSrcSet: `${dir}/card-480.webp 480w`,
      jpgSrcSet: `${dir}/card-480.jpg 480w`,
      fallback: `${dir}/card-480.jpg`,
      primary: `${dir}/primary.jpg`,
      sizes: '116px',
    }
  }
  return {
    webpSrcSet: [480, 800, 1200].map((w) => `${dir}/card-${w}.webp ${w}w`).join(', '),
    jpgSrcSet: [480, 800, 1200].map((w) => `${dir}/card-${w}.jpg ${w}w`).join(', '),
    fallback: `${dir}/card-800.jpg`,
    primary: `${dir}/primary.jpg`,
    sizes: '(max-width: 640px) 100vw, (max-width: 960px) 50vw, 420px',
  }
}

export function sessionExercises(occ: ClassOccurrence): Exercise[] {
  const display = occ.exerciseDisplay ?? 'defaults'
  if (display === 'hidden') return []
  const ids =
    display === 'custom' && occ.exerciseIds.length > 0
      ? occ.exerciseIds
      : classTypeById(occ.classTypeId)?.exerciseIds ?? []
  return ids
    .map((id) => store.exercises.find((e) => e.id === id))
    .filter(Boolean) as Exercise[]
}

export function visibleRosterNames(occ: ClassOccurrence, viewer: SimUser | null): string[] {
  if (!viewer || viewer.role === 'admin' || viewer.role === 'trainer') {
    return occ.roster.map((r) => r.displayName)
  }
  const shares = occ.roster.some((r) => r.memberId === viewer.id)
  if (!shares) return []
  return occ.roster.filter((r) => r.showName).map((r) => r.displayName)
}

export function logout(): void {
  store.sessionUserId = null
  persist()
}

/**
 * Bind a Firebase-authenticated staff member to the local UI session.
 *
 * The admin screens still read this store, so signing in through Firebase
 * alone would leave them blank. This only drives what renders — authorisation
 * still comes from the `role` custom claim, which Firestore rules check on
 * every request. Remove once the admin screens read Firestore directly.
 */
export function bindStaffSession(
  email: string,
  name: string,
  role: 'admin' | 'trainer',
): void {
  const lower = email.trim().toLowerCase()
  let user = store.users.find((u) => u.email.toLowerCase() === lower)
  if (!user) {
    user = {
      id: `staff-${lower}`,
      email: lower,
      password: '',
      name: name || lower,
      role,
      planId: 'casual',
      creditsLeft: 0,
      classesPerWeek: 0,
      weeklyLockedOccurrenceIds: [],
      heldOccurrenceIds: [],
      activated: true,
      showNameToClassmates: false,
      paid: true,
      paymentNote: '',
      limitations: '',
      riskNotes: '',
      termsAccepted: true,
    }
    store.users.push(user)
  }
  user.role = role
  store.sessionUserId = user.id
  persist()
}

/**
 * Bind a Firebase-authenticated member to the local UI session.
 *
 * Same reason as `bindStaffSession`: the member screens still read this store,
 * so a Firebase sign-in alone would render them logged out. Bookings and
 * billing already come from Firestore — this only decides what the page shows.
 * Remove once the member screens read Firestore directly.
 */
export function bindMemberSession(input: {
  uid: string
  email: string
  name: string
  planId: string
  classesPerWeek: number
}): void {
  const lower = input.email.trim().toLowerCase()
  let user = store.users.find((u) => u.id === input.uid || u.email.toLowerCase() === lower)
  if (!user) {
    user = {
      id: input.uid,
      email: lower,
      password: '',
      name: input.name || lower,
      role: 'member',
      planId: (input.planId as PlanId) ?? 'casual',
      creditsLeft: 0,
      classesPerWeek: input.classesPerWeek,
      weeklyLockedOccurrenceIds: [],
      heldOccurrenceIds: [],
      activated: true,
      showNameToClassmates: true,
      paid: false,
      paymentNote: '',
      limitations: '',
      riskNotes: '',
      // Accepted during registration, which is where the terms are presented.
      termsAccepted: true,
    }
    store.users.push(user)
  }
  user.name = input.name || user.name
  user.planId = (input.planId as PlanId) ?? user.planId
  user.classesPerWeek = input.classesPerWeek
  user.role = 'member'
  store.sessionUserId = user.id
  persist()
}

export function formatTimetableTime(time: string): string {
  const [hStr, mStr = '00'] = time.split(':')
  let h = parseInt(hStr, 10)
  const ampm = h >= 12 ? 'pm' : 'am'
  if (h === 0) h = 12
  else if (h > 12) h -= 12
  return `${h}.${mStr}${ampm}`
}

function timeSortKey(time: string): number {
  const [h, m = '0'] = time.split(':')
  return parseInt(h, 10) * 60 + parseInt(m, 10)
}

/** Unique session times across the week, ascending. */
export function timetableTimes(byDay: Record<Weekday, ClassOccurrence[]>): string[] {
  const times = new Set<string>()
  for (const day of WEEKDAYS) {
    for (const occ of byDay[day] ?? []) times.add(occ.time)
  }
  return [...times].sort((a, b) => timeSortKey(a) - timeSortKey(b))
}

export function occurrencesByWeekday(): Record<Weekday, ClassOccurrence[]> {
  const map = Object.fromEntries(WEEKDAYS.map((d) => [d, [] as ClassOccurrence[]])) as Record<
    Weekday,
    ClassOccurrence[]
  >
  for (const o of store.occurrences) {
    const day = o.dayLabel as Weekday
    if (map[day]) map[day].push(o)
  }
  for (const d of WEEKDAYS) {
    map[d].sort((a, b) => a.time.localeCompare(b.time))
  }
  return map
}

export function deleteOccurrence(id: string): void {
  store.occurrences = store.occurrences.filter((o) => o.id !== id)
  for (const u of store.users) {
    u.heldOccurrenceIds = u.heldOccurrenceIds.filter((x) => x !== id)
    u.weeklyLockedOccurrenceIds = u.weeklyLockedOccurrenceIds.filter((x) => x !== id)
  }
  persist()
}

export function updateOccurrenceFields(
  id: string,
  patch: Partial<Pick<ClassOccurrence, 'dayLabel' | 'time' | 'classTypeId' | 'instructorId'>>,
): void {
  const occ = occurrenceById(id)
  if (!occ) return
  Object.assign(occ, patch)
  persist()
}

export function bookAsGuest(
  occurrenceId: string,
  name: string,
  email: string,
): string | null {
  const occ = occurrenceById(occurrenceId)
  if (!occ) return 'Missing class.'
  if (spotsLeft(occ) <= 0) return 'This class is full.'
  if (!name.trim()) return 'Name required.'
  occ.bookedCount += 1
  occ.roster = [
    ...occ.roster,
    {
      displayName: `${name.trim()} (guest)`,
      kind: 'guest',
      showName: false,
      memberId: undefined,
    },
  ]
  store.lastCalendarWrite = occ.calendarEventId
  persist()
  void email
  return null
}

export function bookAsMember(occurrenceId: string): string | null {
  const u = getSessionUser()
  if (!u || u.role !== 'member') return 'Log in as a member first.'
  const occ = occurrenceById(occurrenceId)
  const plan = planById(u.planId)
  if (!occ || !plan) return 'Missing class or plan.'
  if (u.weeklyLockedOccurrenceIds.includes(occurrenceId)) {
    return 'This weekly slot is already locked.'
  }
  if (spotsLeft(occ) <= 0) return 'This class is full.'

  if (plan.classesPerWeek > 0) {
    if (u.weeklyLockedOccurrenceIds.length >= u.classesPerWeek) {
      return `Weekly lock limit (${u.classesPerWeek}). Move or unlock a slot first.`
    }
  } else if (plan.credits > 0) {
    if (u.creditsLeft <= 0) return 'No credits left — pick a pack or weekly plan.'
    u.creditsLeft -= 1
  }

  occ.bookedCount += 1
  occ.roster = [
    ...occ.roster,
    {
      memberId: u.id,
      displayName: u.name,
      kind: 'member',
      showName: u.showNameToClassmates,
    },
  ]
  if (plan.classesPerWeek > 0) {
    u.weeklyLockedOccurrenceIds = [...u.weeklyLockedOccurrenceIds, occurrenceId]
    u.heldOccurrenceIds = [...u.weeklyLockedOccurrenceIds]
  } else {
    u.heldOccurrenceIds = [...u.heldOccurrenceIds, occurrenceId]
  }
  store.lastCalendarWrite = occ.calendarEventId
  persist()
  return null
}

export function dropMemberBooking(occurrenceId: string): string | null {
  const u = getSessionUser()
  if (!u || u.role !== 'member') return 'Log in as a member first.'
  const occ = occurrenceById(occurrenceId)
  if (!occ) return 'Missing class.'
  if (!u.weeklyLockedOccurrenceIds.includes(occurrenceId) && !u.heldOccurrenceIds.includes(occurrenceId)) {
    return 'You are not locked on this session.'
  }
  u.weeklyLockedOccurrenceIds = u.weeklyLockedOccurrenceIds.filter((id) => id !== occurrenceId)
  u.heldOccurrenceIds = u.heldOccurrenceIds.filter((id) => id !== occurrenceId)
  occ.roster = occ.roster.filter((r) => r.memberId !== u.id)
  occ.bookedCount = Math.max(0, occ.bookedCount - 1)
  const plan = planById(u.planId)
  if (plan && plan.credits > 0) u.creditsLeft += 1
  persist()
  return null
}

export function reshuffleBooking(fromId: string, toId: string): string | null {
  const u = getSessionUser()
  if (!u || u.role !== 'member') return 'Log in as a member first.'
  if (!u.weeklyLockedOccurrenceIds.includes(fromId)) {
    return 'Only weekly locked slots can be moved this way.'
  }
  const fromOcc = occurrenceById(fromId)
  const toOcc = occurrenceById(toId)
  if (!fromOcc || !toOcc) return 'Missing class.'
  if (u.weeklyLockedOccurrenceIds.includes(toId)) return 'That slot is already locked.'
  if (spotsLeft(toOcc) <= 0) return 'This class is full.'

  fromOcc.roster = fromOcc.roster.filter((r) => r.memberId !== u.id)
  fromOcc.bookedCount = Math.max(0, fromOcc.bookedCount - 1)

  toOcc.bookedCount += 1
  toOcc.roster = [
    ...toOcc.roster,
    {
      memberId: u.id,
      displayName: u.name,
      kind: 'member',
      showName: u.showNameToClassmates,
    },
  ]

  u.weeklyLockedOccurrenceIds = u.weeklyLockedOccurrenceIds.map((id) =>
    id === fromId ? toId : id,
  )
  u.heldOccurrenceIds = [...u.weeklyLockedOccurrenceIds]
  store.lastCalendarWrite = toOcc.calendarEventId
  persist()
  return null
}

export function toggleExercise(classTypeId: string, exerciseId: string): void {
  const cls = classTypeById(classTypeId)
  if (!cls) return
  cls.exerciseIds = cls.exerciseIds.includes(exerciseId)
    ? cls.exerciseIds.filter((id) => id !== exerciseId)
    : [...cls.exerciseIds, exerciseId]
  persist()
}

export function addExercise(name: string): Exercise | null {
  const trimmed = name.trim()
  if (!trimmed) return null
  const id = `ex-${trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${store.exercises.length + 1}`
  const item = { id, name: trimmed }
  store.exercises = [...store.exercises, item]
  persist()
  return item
}

export function setClassCap(classTypeId: string, cap: number): void {
  const cls = classTypeById(classTypeId)
  if (!cls) return
  cls.cap = Math.min(27, Math.max(4, Math.round(cap)))
  persist()
}

export function updateClassType(
  id: string,
  patch: Partial<
    Pick<
      ClassType,
      | 'name'
      | 'blurb'
      | 'longDescription'
      | 'warnings'
      | 'restrictions'
      | 'recommendations'
      | 'whatToBring'
      | 'cap'
    >
  >,
): void {
  const cls = classTypeById(id)
  if (!cls) return
  Object.assign(cls, patch)
  persist()
}

export function upsertOccurrence(input: Partial<ClassOccurrence> & { id?: string }): string {
  if (input.id && occurrenceById(input.id)) {
    const occ = occurrenceById(input.id)!
    Object.assign(occ, input)
    persist()
    return occ.id
  }
  const id = input.id ?? `occ-${Date.now()}`
  const occ: ClassOccurrence = {
    id,
    classTypeId: input.classTypeId ?? 'sweat',
    dayLabel: input.dayLabel ?? 'Mon',
    time: input.time ?? '09:00',
    venueId: input.venueId ?? 'rec-park-centre',
    exerciseIds: input.exerciseIds ?? [],
    bookedCount: input.bookedCount ?? 0,
    roster: input.roster ?? [],
    calendarEventId: input.calendarEventId ?? `cal-${id}`,
    instructorId: input.instructorId ?? 'tom',
  }
  store.occurrences = [...store.occurrences, occ]
  persist()
  return id
}

export function setOccurrenceInstructor(occurrenceId: string, instructorId: string): void {
  const occ = occurrenceById(occurrenceId)
  if (!occ) return
  occ.instructorId = instructorId
  persist()
}

export function setMemberPaid(userId: string, paid: boolean, note?: string): void {
  const u = userById(userId)
  if (!u) return
  u.paid = paid
  if (note !== undefined) u.paymentNote = note
  persist()
}

export function updateSiteContent(patch: Partial<SiteContent>): void {
  store.site = { ...store.site, ...patch }
  persist()
}

export function sendSubscriberEmail(subject: string, body: string): void {
  const recipients = store.users.filter((u) => u.role === 'member')
  store.outbox = [
    {
      id: `mail-${Date.now()}`,
      subject,
      body,
      sentAt: new Date().toLocaleString('en-NZ'),
      recipientCount: recipients.length,
    },
    ...store.outbox,
  ]
  persist()
}

export function setEquipmentChecked(ids: string[]): void {
  store.equipmentChecked = [...ids]
  persist()
}

export function syncLabels(): { calendar: string; firebase: string } {
  return {
    calendar: store.lastCalendarWrite
      ? `Google Calendar · last sync ${store.lastCalendarWrite}`
      : 'Google Calendar · waiting for first write',
    firebase: store.lastFirebaseWrite
      ? `Firestore · ${store.lastFirebaseWrite}`
      : 'Firestore · configure Firebase secrets to enable live sync',
  }
}

export function getTransferWindowHours(): number {
  return store.transferWindowHours
}

export function setTransferWindowHours(hours: number): void {
  store.transferWindowHours = Math.max(0, Math.round(hours))
  persist()
}

export function getPricingPlans(): FitnessPlan[] {
  return store.pricingPlans
}

export function updatePricingPlan(id: PlanId, patch: Partial<FitnessPlan>): void {
  const plan = store.pricingPlans.find((p) => p.id === id)
  if (!plan) return
  Object.assign(plan, patch)
  persist()
}

export function setMemberDiscount(userId: string, percent: number, note?: string): void {
  const u = userById(userId)
  if (!u) return
  u.discountPercent = Math.min(100, Math.max(0, percent))
  if (note !== undefined) u.customDiscountNote = note
  persist()
}

export function calculateMemberOwed(userId: string): { subtotal: number; discount: number; total: number } {
  const u = userById(userId)
  if (!u) return { subtotal: 0, discount: 0, total: 0 }
  const plan = planById(u.planId)
  const subtotal = plan?.prepaidTotal ?? plan?.ratePerClass ?? 0
  const discount = Math.round((subtotal * (u.discountPercent ?? 0)) / 100)
  return { subtotal, discount, total: Math.max(0, subtotal - discount) }
}

export function getMemberAttendance(userId: string): ClassOccurrence[] {
  return store.occurrences.filter((o) =>
    o.roster.some((r) => r.memberId === userId && r.status === 'attended'),
  )
}

export function renameExercise(id: string, name: string): string | null {
  const trimmed = name.trim()
  if (!trimmed) return 'Name required.'
  const ex = store.exercises.find((e) => e.id === id)
  if (!ex) return 'Exercise not found.'
  ex.name = trimmed
  persist()
  return null
}

export function deleteExercise(id: string): string | null {
  const used = store.classes.some((c) => c.exerciseIds.includes(id))
  const usedSession = store.occurrences.some((o) => o.exerciseIds.includes(id))
  if (used || usedSession) return 'Remove this exercise from all classes and sessions first.'
  store.exercises = store.exercises.filter((e) => e.id !== id)
  persist()
  return null
}

export function createClassType(input: {
  id: string
  name: string
  cap?: number
}): string | null {
  const id = input.id.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-')
  if (!id || !input.name.trim()) return 'Id and name required.'
  if (store.classes.some((c) => c.id === id)) return 'Class id already exists.'
  store.classes = [
    ...store.classes,
    {
      id,
      name: input.name.trim(),
      blurb: '',
      longDescription: '',
      warnings: '',
      restrictions: '',
      recommendations: '',
      whatToBring: '',
      cap: input.cap ?? 16,
      exerciseIds: [],
      active: true,
    },
  ]
  persist()
  return null
}

export function archiveClassType(id: string): string | null {
  const cls = store.classes.find((c) => c.id === id)
  if (!cls) return 'Class not found.'
  cls.active = false
  persist()
  return null
}

export function setSessionExerciseDisplay(
  occurrenceId: string,
  display: ExerciseDisplay,
): void {
  const occ = occurrenceById(occurrenceId)
  if (!occ) return
  occ.exerciseDisplay = display
  persist()
}

export function setRosterStatus(
  occurrenceId: string,
  memberId: string,
  status: RosterStatus,
): string | null {
  const occ = occurrenceById(occurrenceId)
  if (!occ) return 'Session not found.'
  const entry = occ.roster.find((r) => r.memberId === memberId)
  if (!entry) return 'Member not on roster.'
  entry.status = status
  if (status === 'attended') {
    entry.attendedAt = new Date().toISOString()
    const u = userById(memberId)
    if (u) u.sessionsAttended = (u.sessionsAttended ?? 0) + 1
  }
  persist()
  return null
}

export function adminAddMemberToSession(occurrenceId: string, userId: string): string | null {
  const occ = occurrenceById(occurrenceId)
  const u = userById(userId)
  if (!occ || !u || u.role !== 'member') return 'Invalid session or member.'
  if (spotsLeft(occ) <= 0) return 'This class is full.'
  if (occ.roster.some((r) => r.memberId === userId)) return 'Already on roster.'
  occ.roster = [
    ...occ.roster,
    {
      memberId: userId,
      displayName: u.name,
      kind: 'member',
      showName: u.showNameToClassmates,
      status: 'booked',
      bookedBy: 'admin',
    },
  ]
  occ.bookedCount += 1
  persist()
  return null
}

