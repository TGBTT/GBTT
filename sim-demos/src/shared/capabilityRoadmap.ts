/** Roadmap items shown inside each simulated app (Firebase still deferred). */

export const MEMBER_ROADMAP = [
  {
    id: 'recurring',
    title: 'Recurring weekly lock-in',
    blurb: 'Keep the same weekday slot each week until you reshuffle — weekly subscriptions are the seed.',
  },
  {
    id: 'waiver',
    title: 'Stronger waiver gate',
    blurb: 'First-login briefing for kids/teens and new members beyond the current terms checkbox.',
  },
  {
    id: 'private-clients',
    title: 'Live Firebase profile',
    blurb: 'Packs, families, and name-privacy flags once Tom’s data tree is agreed.',
  },
] as const

export const ADMIN_ROADMAP = [
  {
    id: 'week-nav',
    title: 'Week calendar navigation',
    blurb: 'Prev/next week across venues when a second room or area comes online.',
  },
  {
    id: 'kpi',
    title: 'KPI fill strip',
    blurb: 'At-a-glance utilisation — schedule fill bars are the starting point.',
  },
  {
    id: 'colour-prefs',
    title: 'Calendar colour preferences',
    blurb: 'High-contrast / colourblind-safe board colours for shared screens.',
  },
  {
    id: 'photo',
    title: 'Photo attach on notes',
    blurb: 'Session or equipment photos on a class record.',
  },
  {
    id: 'multi-venue',
    title: 'Multi-venue schedule',
    blurb: 'Key occurrences off venueId as the locations catalog grows.',
  },
  {
    id: 'firebase',
    title: 'Firebase records',
    blurb: 'Replace localStorage with Auth + client/group trees.',
  },
] as const
