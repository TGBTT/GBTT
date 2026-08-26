import { Link } from 'react-router-dom'
import { DemoCardImage } from '../components/DemoHeroImage'
import { GbtechDemoNav } from '../components/GbtechDemoNav'
import type { DemoImageId } from '../shared/demoAssets'
import { DEMO_FEATURES, ROLE_LABELS } from '../shared/demoFeatures'

const DEMOS: {
  to: string
  title: string
  kind: string
  blurb: string
  card: string
  ink?: boolean
  imageId: DemoImageId
}[] = [
  {
    to: '/fitness/studioflow',
    title: 'Member pack wallet',
    kind: 'Studio Flow · member',
    blurb: 'Prepaid credits burn when you book — spots left vs class cap at Rec Park Centre.',
    card: 'hub-card-studioflow',
    imageId: 'studioflow',
  },
  {
    to: '/fitness/classboard',
    title: 'Wall timetable',
    kind: 'Class Board · instructor',
    blurb: 'Fill bars, caps, exercise ticks — run the room from the board.',
    card: 'hub-card-classboard',
    ink: true,
    imageId: 'classboard',
  },
]

export default function Hub() {
  return (
    <div className="hub-page">
      <GbtechDemoNav />
      <header className="hub-hero">
        <p className="hub-kicker">Golden Bay Team Training</p>
        <h1>Fitness demos</h1>
        <p className="hub-lead">
          Interactive showcases for member booking and the instructor board. Simulated Calendar and
          Firebase only — not live bookings.
        </p>
        <p className="hub-lead">
          <a href="../apps/">← Back to GBTT website</a>
        </p>
      </header>
      <section className="hub-group">
        <h2>Fitness studio</h2>
        <div className="hub-grid">
          {DEMOS.map((d) => {
            const meta = DEMO_FEATURES[d.to]
            return (
              <Link
                key={d.to}
                to={d.to}
                className={`hub-card ${d.card}${d.ink ? ' hub-card--ink' : ''}`}
              >
                <DemoCardImage id={d.imageId} alt="" />
                <div className="hub-card-body">
                  <p className="hub-card-kind">{d.kind}</p>
                  <h3>{d.title}</h3>
                  <p>{d.blurb}</p>
                  {meta ? (
                    <p className="hub-card-role">{ROLE_LABELS[meta.role]}</p>
                  ) : null}
                </div>
              </Link>
            )
          })}
        </div>
      </section>
    </div>
  )
}
