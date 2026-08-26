/** Simulated GBTT studio — localStorage-backed stand-in for Firebase + Calendar. */

export type PlanId = 'casual' | 'pack10' | 'pack20' | 'weekly1' | 'weekly2' | 'weekly3'
export type SimRole = 'public' | 'member' | 'admin' | 'substitute'
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
  longDescription: string
  /** Max capacity — max attendees per session (set in trainer admin). */
  cap: number
  exerciseIds: string[]
}

export interface RosterEntry {
  memberId?: string
  displayName: string
  kind: AttendeeKind
  showName: boolean
}

export interface ClassOccurrence {
  id: string
  classTypeId: string
  dayLabel: string
  time: string
  venueId: string
  /** Session-specific exercises; falls back to class type defaults when empty. */
  exerciseIds: string[]
  /** Attendees booked for this session (members + guests). */
  bookedCount: number
  roster: RosterEntry[]
  calendarEventId: string
  instructorId: string
}

export interface SimUser {
  id: string
  email: string
  password: string
  name: string
  role: 'member' | 'admin' | 'substitute'
  planId: PlanId
  creditsLeft: number
  classesPerWeek: number
  /** Occurrence ids held this week (subscription reshuffle). */
  heldOccurrenceIds: string[]
  showNameToClassmates: boolean
  paid: boolean
  paymentNote: string
  limitations: string
  riskNotes: string
  termsAccepted: boolean
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
  role: 'lead' | 'substitute'
  notes: string
}

export const FITNESS_VENUE = 'Rec Park Centre, Golden Bay'
export const STORAGE_KEY = 'gbtt-sim-v2'
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
    blurb: 'Cardio and high-intensity.',
    longDescription:
      'Sweat raises heart rate with intervals, bikes, and bodyweight finishers. Scaled for all levels — kids and teens welcome with Tom’s guidance.',
    cap: 16,
    exerciseIds: ['burpee', 'kbswing', 'boxjump', 'bike'],
  },
  {
    id: 'strong',
    name: 'Strong',
    blurb: 'Functional strength and resistance.',
    longDescription:
      'Strong focuses on compound lifts and accessory work for posture, power, and everyday capacity at Rec Park Centre.',
    cap: 20,
    exerciseIds: ['squat', 'deadlift', 'press', 'row'],
  },
  {
    id: 'mobility',
    name: 'Mobility',
    blurb: 'Recovery and range.',
    longDescription:
      'Mobility restores range and soft tissue quality so harder sessions feel better the next day.',
    cap: 12,
    exerciseIds: ['hipopener', 'tspine', 'plank'],
  },
  {
    id: 'circuits',
    name: 'Circuits',
    blurb: 'Station-based mix.',
    longDescription:
      'Circuits rotate strength and cardio stations so the room stays moving — efficient full-body work.',
    cap: 18,
    exerciseIds: ['lunge', 'pushup', 'kbswing', 'bike'],
  },
  {
    id: 'bodybalance',
    name: 'Les Mills BodyBalance',
    blurb: 'Yoga, tai chi, pilates-inspired flow.',
    longDescription:
      'BodyBalance blends yoga, tai chi, and pilates for balance, flexibility, and calm focus.',
    cap: 20,
    exerciseIds: ['flow', 'plank', 'hipopener', 'balance'],
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
    id: 'occ-mon-strong',
    classTypeId: 'strong',
    dayLabel: 'Mon',
    time: '06:30',
    venueId: 'rec-park-centre',
    exerciseIds: [],
    bookedCount: 12,
    roster: seedRoster(['Aroha K.', 'Ben T.']),
    calendarEventId: 'cal-mon-strong',
    instructorId: 'tom',
  },
  {
    id: 'occ-mon-sweat',
    classTypeId: 'sweat',
    dayLabel: 'Mon',
    time: '17:30',
    venueId: 'rec-park-centre',
    exerciseIds: [],
    bookedCount: 10,
    roster: seedRoster(['Cara M.']),
    calendarEventId: 'cal-mon-sweat',
    instructorId: 'tom',
  },
  {
    id: 'occ-tue-circuits',
    classTypeId: 'circuits',
    dayLabel: 'Tue',
    time: '06:30',
    venueId: 'rec-park-centre',
    exerciseIds: [],
    bookedCount: 9,
    roster: seedRoster(['Dan P.']),
    calendarEventId: 'cal-tue-circuits',
    instructorId: 'tom',
  },
  {
    id: 'occ-tue-mobility',
    classTypeId: 'mobility',
    dayLabel: 'Tue',
    time: '17:30',
    venueId: 'rec-park-centre',
    exerciseIds: [],
    bookedCount: 7,
    roster: seedRoster(['Eli R.', 'Jo B.']),
    calendarEventId: 'cal-tue-mobility',
    instructorId: 'priya',
  },
  {
    id: 'occ-wed-strong',
    classTypeId: 'strong',
    dayLabel: 'Wed',
    time: '06:30',
    venueId: 'rec-park-centre',
    exerciseIds: [],
    bookedCount: 11,
    roster: seedRoster(['Fran S.']),
    calendarEventId: 'cal-wed-strong',
    instructorId: 'tom',
  },
  {
    id: 'occ-wed-bodybalance',
    classTypeId: 'bodybalance',
    dayLabel: 'Wed',
    time: '18:45',
    venueId: 'rec-park-centre',
    exerciseIds: [],
    bookedCount: 13,
    roster: seedRoster(['Gus W.', 'Hana L.']),
    calendarEventId: 'cal-wed-bodybalance',
    instructorId: 'jess',
  },
  {
    id: 'occ-thu-sweat',
    classTypeId: 'sweat',
    dayLabel: 'Thu',
    time: '12:10',
    venueId: 'rec-park-centre',
    exerciseIds: [],
    bookedCount: 16,
    roster: seedRoster(['Ivy N.', 'Kai H.']),
    calendarEventId: 'cal-thu-sweat',
    instructorId: 'tom',
  },
  {
    id: 'occ-thu-strong',
    classTypeId: 'strong',
    dayLabel: 'Thu',
    time: '17:30',
    venueId: 'rec-park-centre',
    exerciseIds: [],
    bookedCount: 8,
    roster: seedRoster(['Lea C.']),
    calendarEventId: 'cal-thu-strong',
    instructorId: 'tom',
  },
  {
    id: 'occ-fri-circuits',
    classTypeId: 'circuits',
    dayLabel: 'Fri',
    time: '06:30',
    venueId: 'rec-park-centre',
    exerciseIds: [],
    bookedCount: 11,
    roster: seedRoster(['Owen D.', 'Pip S.']),
    calendarEventId: 'cal-fri-circuits',
    instructorId: 'tom',
  },
  {
    id: 'occ-fri-mobility',
    classTypeId: 'mobility',
    dayLabel: 'Fri',
    time: '17:00',
    venueId: 'rec-park-centre',
    exerciseIds: [],
    bookedCount: 6,
    roster: seedRoster(['Quinn A.']),
    calendarEventId: 'cal-fri-mobility',
    instructorId: 'cover',
  },
]

const DEFAULT_USERS: SimUser[] = [
  {
    id: 'u-alex',
    email: 'alex@demo',
    password: 'demo',
    name: 'Alex Demo',
    role: 'member',
    planId: 'weekly2',
    creditsLeft: 0,
    classesPerWeek: 2,
    heldOccurrenceIds: ['occ-mon-strong', 'occ-wed-bodybalance'],
    showNameToClassmates: true,
    paid: true,
    paymentNote: '',
    limitations: 'Sensitive left knee — avoid deep lunges if sore.',
    riskNotes: '',
    termsAccepted: true,
    pendingPlanId: null,
  },
  {
    id: 'u-tom',
    email: 'tom@gbtt',
    password: 'demo',
    name: 'Tom',
    role: 'admin',
    planId: 'casual',
    creditsLeft: 0,
    classesPerWeek: 0,
    heldOccurrenceIds: [],
    showNameToClassmates: false,
    paid: true,
    paymentNote: '',
    limitations: '',
    riskNotes: '',
    termsAccepted: true,
  },
  {
    id: 'u-cover',
    email: 'cover@gbtt',
    password: 'demo',
    name: 'Cover Trainer',
    role: 'substitute',
    planId: 'casual',
    creditsLeft: 0,
    classesPerWeek: 0,
    heldOccurrenceIds: [],
    showNameToClassmates: false,
    paid: true,
    paymentNote: '',
    limitations: '',
    riskNotes: '',
    termsAccepted: true,
  },
]

const DEFAULT_SITE: SiteContent = {
  heroBlurb: 'Group workouts for every body at Rec Park Centre, Tākaka.',
  scheduleNarrative:
    'Weekly timetable below shows live fill — book in the member app when a spot is open.',
  contactDisplay: 'Tom · Tom.GBTT@gmail.com · 021 089 28057',
  paymentInstructions:
    'Pay by bank transfer to the GBTT account Tom provides, or cash at Rec Park before class. Mark paid in admin once cleared.',
  termsText:
    'GBTT memberships are weekly-slot based. Reshuffles must stay within your classes-per-week allowance. Guests pay casual rate. Simulated demo — not a binding contract.',
  waiverText:
    'I understand group fitness involves physical effort and accept responsibility for my own limits. Inform Tom of injuries before class.',
}

const DEFAULT_TEAM: TeamMember[] = [
  { id: 'tom', name: 'Tom', role: 'lead', notes: 'Primary coach' },
  { id: 'jess', name: 'Jess', role: 'substitute', notes: 'BodyBalance cover' },
  { id: 'priya', name: 'Priya', role: 'substitute', notes: 'Mobility / evenings' },
  { id: 'cover', name: 'Cover pool', role: 'substitute', notes: 'Weekend float' },
]

const DEFAULT_REMINDERS: ReminderItem[] = [
  {
    id: 'rem-1',
    title: 'Post Saturday Sweat teaser on Facebook',
    dueLabel: 'Fri',
    done: false,
    kind: 'marketing',
  },
  {
    id: 'rem-2',
    title: 'Reorder mats / check first-aid kit',
    dueLabel: 'Mon',
    done: false,
    kind: 'ops',
  },
]

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
    users: DEFAULT_USERS.map((u) => ({ ...u, heldOccurrenceIds: [...u.heldOccurrenceIds] })),
    sessionUserId: null,
    site: { ...DEFAULT_SITE },
    team: DEFAULT_TEAM.map((t) => ({ ...t })),
    reminders: DEFAULT_REMINDERS.map((r) => ({ ...r })),
    outbox: [],
    equipmentChecked: [],
    lastCalendarWrite: '',
    lastFirebaseWrite: '',
  }
}

function loadState(): StoreState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return seedState()
    const parsed = JSON.parse(raw) as StoreState
    if (!parsed?.classes?.length || !parsed?.users?.length) return seedState()
    return parsed
  } catch {
    return seedState()
  }
}

let store: StoreState = typeof localStorage !== 'undefined' ? loadState() : seedState()

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    /* ignore quota */
  }
  store.lastFirebaseWrite = `localStorage · ${new Date().toISOString().slice(11, 19)}`
}

export function resetSimStore(): void {
  store = seedState()
  persist()
}

export function reloadStore(): void {
  if (typeof localStorage === 'undefined') return
  store = loadState()
}

/** Cross-tab sync when trainer admin or member app updates localStorage. */
export function subscribeStore(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined
  const handler = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY || e.key === null) {
      reloadStore()
      onChange()
    }
  }
  window.addEventListener('storage', handler)
  return () => window.removeEventListener('storage', handler)
}

export function getStoreSnapshot(): StoreState {
  return store
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
  return store.classes
}

export function getOccurrences(): ClassOccurrence[] {
  return store.occurrences
}

export function getUsers(): SimUser[] {
  return store.users
}

export function getSiteContent(): SiteContent {
  return store.site
}

export function getTeam(): TeamMember[] {
  return store.team
}

export function getReminders(): ReminderItem[] {
  return store.reminders
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

/** @deprecated use getSessionUser — kept for older call sites */
export function getMember(): { name: string; planId: PlanId; creditsLeft: number } {
  const u = getSessionUser() ?? store.users.find((x) => x.role === 'member')!
  return { name: u.name, planId: u.planId, creditsLeft: u.creditsLeft }
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
  const maxCapacity = classTypeById(occ.classTypeId)?.cap ?? occ.bookedCount
  return Math.max(0, maxCapacity - occ.bookedCount)
}

export function maxCapacityFor(classTypeId: string): number {
  return classTypeById(classTypeId)?.cap ?? 0
}

export function sessionIsFull(occ: ClassOccurrence): boolean {
  return spotsLeft(occ) <= 0
}

/** Shared label: "12/16 attending" */
export function formatSessionAttending(occ: ClassOccurrence): string {
  const maxCapacity = maxCapacityFor(occ.classTypeId)
  return `${occ.bookedCount}/${maxCapacity} attending`
}

export function sessionExercises(occ: ClassOccurrence): Exercise[] {
  const ids =
    occ.exerciseIds.length > 0
      ? occ.exerciseIds
      : classTypeById(occ.classTypeId)?.exerciseIds ?? []
  return ids
    .map((id) => store.exercises.find((e) => e.id === id))
    .filter(Boolean) as Exercise[]
}

export function visibleRosterNames(occ: ClassOccurrence, viewer: SimUser | null): string[] {
  if (!viewer || viewer.role === 'admin' || viewer.role === 'substitute') {
    return occ.roster.map((r) => r.displayName)
  }
  const shares = occ.roster.some((r) => r.memberId === viewer.id)
  if (!shares) return []
  return occ.roster.filter((r) => r.showName).map((r) => r.displayName)
}

export function login(email: string, password: string): string | null {
  const user = store.users.find(
    (u) => u.email.toLowerCase() === email.trim().toLowerCase() && u.password === password,
  )
  if (!user) return 'Unknown email or password (try demo credentials).'
  store.sessionUserId = user.id
  persist()
  return null
}

export function logout(): void {
  store.sessionUserId = null
  persist()
}

export function registerMember(name: string, email: string, planId: PlanId): string | null {
  const trimmedEmail = email.trim().toLowerCase()
  if (!name.trim() || !trimmedEmail) return 'Name and email required.'
  if (store.users.some((u) => u.email.toLowerCase() === trimmedEmail)) {
    return 'That email is already registered — log in instead.'
  }
  const plan = planById(planId)
  if (!plan) return 'Pick a plan.'
  const id = `u-${Date.now()}`
  const user: SimUser = {
    id,
    email: trimmedEmail,
    password: 'demo',
    name: name.trim(),
    role: 'member',
    planId,
    creditsLeft: plan.credits,
    classesPerWeek: plan.classesPerWeek,
    heldOccurrenceIds: [],
    showNameToClassmates: false,
    paid: false,
    paymentNote: 'Awaiting first payment',
    limitations: '',
    riskNotes: '',
    termsAccepted: false,
  }
  store.users = [...store.users, user]
  store.sessionUserId = id
  persist()
  return null
}

export function setShowNameToClassmates(value: boolean): void {
  const u = getSessionUser()
  if (!u || u.role !== 'member') return
  u.showNameToClassmates = value
  for (const occ of store.occurrences) {
    for (const r of occ.roster) {
      if (r.memberId === u.id) r.showName = value
    }
  }
  persist()
}

export function acceptTerms(): void {
  const u = getSessionUser()
  if (!u) return
  u.termsAccepted = true
  persist()
}

export function setMemberPlan(planId: PlanId): string | null {
  const u = getSessionUser()
  if (!u || u.role !== 'member') return 'Log in as a member first.'
  const plan = planById(planId)
  if (!plan) return 'Unknown plan.'
  u.planId = planId
  u.classesPerWeek = plan.classesPerWeek
  u.pendingPlanId = null
  if (plan.credits > 0) u.creditsLeft = plan.credits
  if (plan.classesPerWeek > 0 && u.heldOccurrenceIds.length > plan.classesPerWeek) {
    u.heldOccurrenceIds = u.heldOccurrenceIds.slice(0, plan.classesPerWeek)
  }
  persist()
  return null
}

/** Request a subscription change — notifies Tom; does not apply until admin confirms. */
export function requestSubscriptionChange(planId: PlanId): string | null {
  const u = getSessionUser()
  if (!u || u.role !== 'member') return 'Log in as a member first.'
  const plan = planById(planId)
  if (!plan) return 'Unknown plan.'
  if (planId === u.planId && !u.pendingPlanId) return 'You are already on that plan.'
  u.pendingPlanId = planId
  const from = planById(u.planId)?.name ?? u.planId
  store.outbox = [
    {
      id: `mail-${Date.now()}`,
      subject: `Subscription change request — ${u.name}`,
      body: `${u.name} (${u.email}) requested a change from ${from} to ${plan.name}. Confirm payment logging in Trainer admin → Members.`,
      sentAt: new Date().toLocaleString('en-NZ'),
      recipientCount: 1,
    },
    ...store.outbox,
  ]
  store.reminders = [
    {
      id: `rem-pay-${Date.now()}`,
      title: `Confirm payment: ${u.name} → ${plan.name}`,
      dueLabel: 'Today',
      done: false,
      kind: 'ops',
    },
    ...store.reminders,
  ]
  persist()
  return null
}

export function confirmSubscriptionChange(userId: string, approve: boolean): string | null {
  const u = userById(userId)
  if (!u?.pendingPlanId) return 'No pending change.'
  if (!approve) {
    u.pendingPlanId = null
    persist()
    return null
  }
  const plan = planById(u.pendingPlanId)
  if (!plan) return 'Unknown pending plan.'
  u.planId = plan.id
  u.classesPerWeek = plan.classesPerWeek
  if (plan.credits > 0) u.creditsLeft = plan.credits
  if (plan.classesPerWeek > 0 && u.heldOccurrenceIds.length > plan.classesPerWeek) {
    u.heldOccurrenceIds = u.heldOccurrenceIds.slice(0, plan.classesPerWeek)
  }
  u.pendingPlanId = null
  u.paid = true
  u.paymentNote = `Plan confirmed · ${plan.name}`
  persist()
  return null
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
  if (u.heldOccurrenceIds.includes(occurrenceId)) return 'Already booked on this class.'
  if (spotsLeft(occ) <= 0) return 'This class is full.'

  if (plan.classesPerWeek > 0) {
    if (u.heldOccurrenceIds.length >= u.classesPerWeek) {
      return `Weekly allowance full (${u.classesPerWeek}/week). Reshuffle or drop a class first.`
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
  u.heldOccurrenceIds = [...u.heldOccurrenceIds, occurrenceId]
  store.lastCalendarWrite = occ.calendarEventId
  persist()
  return null
}

export function dropMemberBooking(occurrenceId: string): string | null {
  const u = getSessionUser()
  if (!u || u.role !== 'member') return 'Log in as a member first.'
  const occ = occurrenceById(occurrenceId)
  if (!occ) return 'Missing class.'
  if (!u.heldOccurrenceIds.includes(occurrenceId)) return 'You are not on this class.'
  u.heldOccurrenceIds = u.heldOccurrenceIds.filter((id) => id !== occurrenceId)
  occ.roster = occ.roster.filter((r) => r.memberId !== u.id)
  occ.bookedCount = Math.max(0, occ.bookedCount - 1)
  const plan = planById(u.planId)
  if (plan && plan.credits > 0) u.creditsLeft += 1
  persist()
  return null
}

export function reshuffleBooking(fromId: string, toId: string): string | null {
  const drop = dropMemberBooking(fromId)
  if (drop) return drop
  return bookAsMember(toId)
}

/** Legacy wizard helper */
export function bookOccurrence(
  occurrenceId: string,
  planId: PlanId,
  attendeeName = 'You (demo)',
): string | null {
  const u = getSessionUser()
  if (u?.role === 'member') {
    if (u.planId !== planId) setMemberPlan(planId)
    return bookAsMember(occurrenceId)
  }
  return bookAsGuest(occurrenceId, attendeeName, 'guest@demo')
}

export function toggleExercise(classTypeId: string, exerciseId: string): void {
  const cls = classTypeById(classTypeId)
  if (!cls) return
  cls.exerciseIds = cls.exerciseIds.includes(exerciseId)
    ? cls.exerciseIds.filter((id) => id !== exerciseId)
    : [...cls.exerciseIds, exerciseId]
  persist()
}

export function setOccurrenceExercises(occurrenceId: string, exerciseIds: string[]): void {
  const occ = occurrenceById(occurrenceId)
  if (!occ) return
  occ.exerciseIds = [...exerciseIds]
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
  patch: Partial<Pick<ClassType, 'name' | 'blurb' | 'longDescription' | 'cap'>>,
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

export function setMemberRisk(userId: string, limitations: string, riskNotes: string): void {
  const u = userById(userId)
  if (!u) return
  u.limitations = limitations
  u.riskNotes = riskNotes
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

export function toggleReminder(id: string): void {
  const r = store.reminders.find((x) => x.id === id)
  if (!r) return
  r.done = !r.done
  persist()
}

export function addReminder(title: string, dueLabel: string, kind: 'marketing' | 'ops'): void {
  store.reminders = [
    ...store.reminders,
    { id: `rem-${Date.now()}`, title, dueLabel, done: false, kind },
  ]
  persist()
}

export function updateTeamMember(id: string, notes: string): void {
  const t = store.team.find((x) => x.id === id)
  if (!t) return
  t.notes = notes
  persist()
}

export function setEquipmentChecked(ids: string[]): void {
  store.equipmentChecked = [...ids]
  persist()
}

export function syncLabels(): { calendar: string; firebase: string } {
  return {
    calendar: store.lastCalendarWrite
      ? `Google Calendar (simulated) · would write event ${store.lastCalendarWrite}`
      : 'Google Calendar (simulated) · waiting for a write',
    firebase: store.lastFirebaseWrite
      ? `Firebase (simulated) · ${store.lastFirebaseWrite}`
      : 'Firebase (simulated) · localStorage stand-in — schema TBD',
  }
}

export const DEMO_CREDENTIALS = [
  { label: 'Member', email: 'alex@demo', password: 'demo' },
  { label: 'Admin (Tom)', email: 'tom@gbtt', password: 'demo' },
  { label: 'Substitute', email: 'cover@gbtt', password: 'demo' },
] as const
