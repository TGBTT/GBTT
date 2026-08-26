export const SITE = {
  name: 'Golden Bay Team Training',
  shortName: 'GBTT',
  tagline: 'Group workouts for every body at Rec Park Centre.',
  description:
    'Golden Bay Team Training — Sweat, Strong, Circuits, Mobility, Womens Fit, Youth Fit, Kids Fit, Sculpt & Strength, and Les Mills BodyBalance at Rec Park Centre, Tākaka. #builtbytom',
  runBy: 'Tom',
  email: 'Tom.GBTT@gmail.com',
  phone: '021 089 28057',
  phoneHref: 'tel:+642108928057',
  facebook:
    'https://www.facebook.com/people/Golden-Bay-Team-Training/100077092552576/',
  origin: 'https://agent5479.github.io/GBTT',
  hashtag: '#builtbytom',
} as const

/** About Tom — edit here when he supplies a longer bio or photo credit. */
export const TRAINER = {
  name: 'Tom',
  role: 'Coach & founder',
  paragraphs: [
    'Tom runs Golden Bay Team Training out of Rec Park Centre in Tākaka — group sessions with grit, humour, and room for every body in the room.',
    'He scales each workout on the fly so beginners, kids, teens, and seasoned athletes can train together without anyone getting left behind or bored.',
    'Expect clear coaching, honest effort, and a community that shows up for each other week after week.',
  ],
} as const

export const CLASS_OFFERINGS = [
  {
    id: 'sweat',
    name: 'Sweat',
    blurb: 'High-intensity cardio and powerful movements — high or low impact.',
  },
  {
    id: 'strong',
    name: 'Strong',
    blurb: 'Resistance equipment to build strength, posture, and technique.',
  },
  {
    id: 'circuits',
    name: 'Circuits',
    blurb: 'Strength, cardio, and mobility in one full-body session.',
  },
  {
    id: 'womens-fit',
    name: 'Womens Fit',
    blurb: 'Cardio and strength for all ages — child friendly.',
  },
  {
    id: 'mobility',
    name: 'Mobility',
    blurb: 'Low impact, controlled range-of-motion and core work.',
  },
  {
    id: 'bodybalance',
    name: 'Les Mills BodyBalance',
    blurb: 'Yoga-inspired flow set to music for a full-body workout.',
  },
  {
    id: 'sculpt-strength',
    name: 'Sculpt & Strength',
    blurb: 'High-intensity, low-impact pilates and strength fusion.',
  },
  {
    id: 'youth-fit',
    name: 'Youth Fit',
    blurb: 'Strength, boxing, and cardio for ages 11+.',
  },
  {
    id: 'kids-fit',
    name: 'Kids Fit',
    blurb: 'Playful training for ages 5–10.',
  },
] as const

/** Primary nav — homepage section bookmarks + contact page. */
export const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/#trainer', label: 'Trainer' },
  { to: '/#classes', label: 'Classes' },
  { to: '/#location', label: 'Location' },
  { to: '/#apps', label: 'Book' },
  { to: '/contact', label: 'Contact' },
] as const

export function simAppHref(path: string): string {
  const base = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`
  return `${base}sim/${path}`
}

/** Staff-only trainer admin — linked from the discreet navbar badge. */
export function adminAppHref(): string {
  return simAppHref('fitness/classboard/')
}
