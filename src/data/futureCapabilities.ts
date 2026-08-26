/** Fitness-relevant + transferable capabilities for a later branded app shell. */
export const FUTURE_CAPABILITIES = [
  {
    id: 'recurring',
    title: 'Recurring class booking',
    source: 'DEMO-FEATURES · booking flows',
    blurb: 'Members lock a weekly slot so packs and attendance stay predictable.',
  },
  {
    id: 'week-nav',
    title: 'Week calendar nav',
    source: 'DEMO-FEATURES · ops boards',
    blurb: 'Jump prev/next week across venues when GBTT grows beyond one room.',
  },
  {
    id: 'kpi',
    title: 'KPI / fill strip',
    source: 'Class Board + ops catalogs',
    blurb: 'At-a-glance caps, almost-full cues, and utilisation for Tom’s board.',
  },
  {
    id: 'colour-prefs',
    title: 'Calendar colour preferences',
    source: 'DEMO-FEATURES · ops',
    blurb: 'High-contrast and colourblind-safe calendars for shared screens.',
  },
  {
    id: 'waiver',
    title: 'Waiver / briefing gate',
    source: 'DEMO-FEATURES · safety',
    blurb: 'Require acknowledgment before first booking — useful for kids/teens and new members.',
  },
  {
    id: 'photo',
    title: 'Photo attach stub',
    source: 'DEMO-FEATURES · field tools',
    blurb: 'Attach a session or equipment note to a class record (demo path first).',
  },
  {
    id: 'multi-venue',
    title: 'Multi-venue schedule',
    source: 'Locations catalog',
    blurb: 'Key classes and packs off venueId when a second area or facility comes online.',
  },
  {
    id: 'private-clients',
    title: 'Private client + group records',
    source: 'Firebase (deferred)',
    blurb: 'Structured trees for individuals, families, and packs — schema TBD with Tom.',
  },
] as const
