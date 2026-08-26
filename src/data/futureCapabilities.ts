/** Capabilities folded into the live demos (member vs admin). */

export const MEMBER_ROADMAP = [
  {
    id: 'recurring',
    title: 'Recurring weekly lock-in',
    blurb: 'Keep the same weekday slot each week until you reshuffle — already sketched by weekly subscriptions.',
  },
  {
    id: 'waiver',
    title: 'Waiver / briefing gate',
    blurb: 'Stronger first-login acknowledgment for kids/teens and new members (terms toggle is the seed).',
  },
  {
    id: 'private-clients',
    title: 'Private profile in Firebase',
    blurb: 'Live member packs, families, and name-privacy flags once the data tree is agreed with Tom.',
  },
] as const

export const ADMIN_ROADMAP = [
  {
    id: 'week-nav',
    title: 'Week calendar navigation',
    blurb: 'Prev/next week across venues when GBTT adds a second room or area.',
  },
  {
    id: 'kpi',
    title: 'KPI fill strip',
    blurb: 'At-a-glance utilisation across all classes — fill bars on the schedule tab are the start.',
  },
  {
    id: 'colour-prefs',
    title: 'Calendar colour preferences',
    blurb: 'High-contrast / colourblind-safe board colours for shared screens.',
  },
  {
    id: 'photo',
    title: 'Photo attach on class notes',
    blurb: 'Attach equipment or session photos to a class record (demo stub first).',
  },
  {
    id: 'multi-venue',
    title: 'Multi-venue schedule',
    blurb: 'Key occurrences off venueId from the locations catalog as the business grows.',
  },
  {
    id: 'private-clients',
    title: 'Firebase client / group records',
    blurb: 'Replace localStorage with Auth + structured trees for individuals, families, and packs.',
  },
] as const
