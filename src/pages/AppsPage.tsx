import { SITE } from '../data/siteConfig'

const demos = [
  {
    title: 'Book & membership',
    path: 'fitness/studioflow/',
    role: 'Public + member',
    blurb:
      'See how full each class is, book as a guest, or log in for a weekly subscription. Hover/click a session for exercises. Opt in to show your name only to classmates — never on the public view.',
  },
  {
    title: 'Admin console',
    path: 'fitness/classboard/',
    role: 'Tom + substitutes',
    blurb:
      'Simulated staff login. Set schedule and caps, mark who has paid, record limitations/risk, edit terms and payment instructions, email subscribers (mock outbox), reminders, substitute trainers, and public site copy — no code deploy needed for content tweaks.',
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
          {SITE.shortName} booking and backend — simulated until Google Firebase and live Calendar are
          wired. Demo logins use password <code>demo</code>: <code>alex@demo</code> (member),{' '}
          <code>tom@gbtt</code> (admin), <code>cover@gbtt</code> (substitute).
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
