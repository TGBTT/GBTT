import { Link } from 'react-router-dom'
import { DemoCardImage } from '../components/DemoHeroImage'
import { SiteDemoNav } from '../components/GbtechDemoNav'
import type { DemoImageId } from '../shared/demoAssets'
import { DEMO_FEATURES, ROLE_LABELS } from '../shared/demoFeatures'
import { DEMO_CREDENTIALS } from '../shared/fitnessStudio'

const DEMOS: {
  to: string
  title: string
  kind: string
  blurb: string
  card: string
  imageId: DemoImageId
}[] = [
  {
    to: '/fitness/studioflow',
    title: 'Book & membership',
    kind: 'Public + member',
    blurb:
      'Fill bars, guest book, weekly subscriptions, reshuffle, exercise previews, classmate name privacy.',
    card: 'hub-card-studioflow',
    imageId: 'studioflow',
  },
  {
    to: '/fitness/classboard',
    title: 'Admin console',
    kind: 'Tom + substitutes',
    blurb:
      'Simulated staff login — schedule, payments, risk notes, legal copy, notify, reminders, site content.',
    card: 'hub-card-classboard',
    imageId: 'classboard',
  },
]

export default function Hub() {
  return (
    <div className="hub-page theme-gbtt">
      <SiteDemoNav />
      <header className="hub-hero">
        <p className="hub-kicker">Golden Bay Team Training</p>
        <h1>Simulated apps</h1>
        <p className="hub-lead">
          Firebase is not live yet — these apps use localStorage as a stand-in. Sticky nav returns you
          to the main GBTT site.
        </p>
        <p className="hub-lead hint">
          Logins: {DEMO_CREDENTIALS.map((c) => `${c.label} ${c.email}/${c.password}`).join(' · ')}
        </p>
        <p className="hub-lead">
          <a href="../apps/">← Back to GBTT Apps</a>
        </p>
      </header>
      <section className="hub-group">
        <h2>Fitness</h2>
        <div className="hub-grid">
          {DEMOS.map((d) => {
            const meta = DEMO_FEATURES[d.to]
            return (
              <Link key={d.to} to={d.to} className={`hub-card ${d.card}`}>
                <DemoCardImage id={d.imageId} alt="" />
                <div className="hub-card-body">
                  <p className="hub-card-kind">{d.kind}</p>
                  <h3>{d.title}</h3>
                  <p>{d.blurb}</p>
                  {meta ? <p className="hub-card-role">{ROLE_LABELS[meta.role]}</p> : null}
                </div>
              </Link>
            )
          })}
        </div>
      </section>
    </div>
  )
}
