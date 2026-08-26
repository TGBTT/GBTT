export const SITE = {
  name: 'Golden Bay Team Training',
  shortName: 'GBTT',
  tagline: 'Group workouts for every body at Rec Park Centre.',
  description:
    'Golden Bay Team Training — group fitness classes with Tom at Rec Park Centre, Tākaka. Sweat, Strong, Mobility, Circuits, and Les Mills BodyBalance for all fitness levels, kids and teens welcome.',
  runBy: 'Tom',
  email: 'Tom.GBTT@gmail.com',
  phone: '021 089 28057',
  phoneHref: 'tel:+642108928057',
  facebook:
    'https://www.facebook.com/people/Golden-Bay-Team-Training/100077092552576/',
  origin: 'https://agent5479.github.io/GBTT',
} as const

export const CLASS_OFFERINGS = [
  {
    id: 'sweat',
    name: 'Sweat',
    blurb: 'Cardio and high-intensity sessions that raise the heart rate and build conditioning.',
  },
  {
    id: 'strong',
    name: 'Strong',
    blurb: 'Functional strength and resistance work for power, posture, and everyday capacity.',
  },
  {
    id: 'mobility',
    name: 'Mobility',
    blurb: 'Range, recovery, and movement quality so you stay loose between harder sessions.',
  },
  {
    id: 'circuits',
    name: 'Circuits',
    blurb: 'Station-based training that mixes strength and cardio in one efficient class.',
  },
  {
    id: 'bodybalance',
    name: 'Les Mills BodyBalance',
    blurb: 'Yoga, tai chi, and pilates-inspired flows for balance, flexibility, and calm focus.',
  },
] as const

/** Primary nav — homepage section bookmarks + contact page. */
export const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/#classes', label: 'Classes' },
  { to: '/#location', label: 'Location' },
  { to: '/#apps', label: 'Apps' },
  { to: '/contact', label: 'Contact' },
] as const

export function simAppHref(path: string): string {
  const base = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`
  return `${base}sim/${path}`
}
