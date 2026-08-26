import { SITE } from '../data/siteConfig'

const demos = [
  {
    title: 'Studio Flow',
    path: 'fitness/studioflow/',
    role: 'Member booking',
    blurb:
      'Prepaid pack wallet, class caps, almost-full cues, and waitlist — simulated Google Calendar and Firebase writes.',
  },
  {
    title: 'Class Board',
    path: 'fitness/classboard/',
    role: 'Instructor ops',
    blurb:
      'Wall timetable with fill bars, substitute instructor, attendee roster, exercise catalog, and equipment checklist.',
  },
] as const

function simHref(path: string): string {
  const base = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`
  return `${base}sim/${path}`
}

export default function AppsPage() {
  return (
    <section className="section">
      <div className="section__inner">
        <p className="eyebrow">Interactive showcase</p>
        <h1>Apps</h1>
        <p className="lede">
          These fitness demos are the tools that introduced {SITE.shortName} to a digital workflow —
          member booking and the instructor board. Everything here is simulated until Firebase and
          live Calendar are wired for Tom’s data model.
        </p>
        <ul className="demo-showcase">
          {demos.map((d) => (
            <li key={d.path}>
              <p className="demo-showcase__role">{d.role}</p>
              <h2>{d.title}</h2>
              <p>{d.blurb}</p>
              <a className="btn btn--primary" href={simHref(d.path)}>
                Open {d.title}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
