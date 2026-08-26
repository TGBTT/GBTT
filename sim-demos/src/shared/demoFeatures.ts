export type DemoRole = 'booking' | 'estimate' | 'ops'

export interface DemoFeatureMeta {
  role: DemoRole
  features: string[]
}

/** Sales showroom metadata keyed by demo route path. */
export const DEMO_FEATURES: Record<string, DemoFeatureMeta> = {
  '/fitness/studioflow': {
    role: 'booking',
    features: [
      'Credit wallet',
      'Wizard steps',
      'Class caps',
      'Almost-full cue',
      'Waitlist join',
      'Prepaid plans',
      'Sync chips',
      'Peak day data',
      'Demo mode',
    ],
  },
  '/fitness/classboard': {
    role: 'ops',
    features: [
      'Fill bars',
      'Fill urgency',
      'Substitute instructor',
      'Attendee roster',
      'Class cap',
      'Exercise catalog',
      'Equipment checklist',
      'Sync chips',
      'Demo mode',
    ],
  },
}

export const ROLE_LABELS: Record<DemoRole, string> = {
  booking: 'Booking showcase',
  estimate: 'Estimate showcase',
  ops: 'Ops showcase',
}
