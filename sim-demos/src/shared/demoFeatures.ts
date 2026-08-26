export type DemoRole = 'booking' | 'estimate' | 'ops'

export interface DemoFeatureMeta {
  role: DemoRole
  features: string[]
}

export const DEMO_FEATURES: Record<string, DemoFeatureMeta> = {
  '/fitness/studioflow': {
    role: 'booking',
    features: [
      'Public fill bars',
      'Guest book',
      'Member login',
      'Weekly subscription',
      'Reshuffle slots',
      'Exercise preview',
      'Name privacy toggle',
      'Terms acknowledge',
      'Demo mode',
    ],
  },
  '/fitness/classboard': {
    role: 'ops',
    features: [
      'Simulated staff login',
      'Schedule editor',
      'Fill bars',
      'Payments',
      'Risk notes',
      'Legal copy',
      'Subscriber notify',
      'Reminders',
      'Substitute team',
      'Site content CMS',
      'Demo mode',
    ],
  },
}

export const ROLE_LABELS: Record<DemoRole, string> = {
  booking: 'Booking showcase',
  estimate: 'Estimate showcase',
  ops: 'Ops showcase',
}
