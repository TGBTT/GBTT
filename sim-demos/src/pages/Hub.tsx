import { Link } from 'react-router-dom'
import { DemoCardImage } from '../components/DemoHeroImage'
import { SiteDemoNav } from '../components/GbtechDemoNav'
import { DEMO_CREDENTIALS } from '../shared/fitnessStudio'

export default function Hub() {
  return (
    <div className="hub-page theme-gbtt">
      <SiteDemoNav />
      <header className="hub-hero">
        <p className="hub-kicker">Golden Bay Team Training</p>
        <h1>Member &amp; trainer apps</h1>
        <p className="hub-lead">
          Only the fitness demos remain — member booking and trainer admin. Sticky nav matches the
          main GBTT site (Classes, Location, Apps bookmarks).
        </p>
        <p className="hub-lead hint">
          Logins: {DEMO_CREDENTIALS.map((c) => `${c.label} ${c.email}/${c.password}`).join(' · ')}
        </p>
        <p className="hub-lead">
          <a href="../#apps">← Back to GBTT homepage apps</a>
        </p>
      </header>
      <section className="hub-group">
        <div className="hub-grid">
          <Link to="/fitness/studioflow" className="hub-card hub-card-studioflow">
            <DemoCardImage id="studioflow" alt="" />
            <div className="hub-card-body">
              <p className="hub-card-kind">For members &amp; guests</p>
              <h3>Member booking</h3>
              <p>Fill bars, guest book, weekly subscriptions, reshuffle, exercise previews.</p>
            </div>
          </Link>
          <Link to="/fitness/classboard" className="hub-card hub-card-classboard">
            <DemoCardImage id="classboard" alt="" />
            <div className="hub-card-body">
              <p className="hub-card-kind">For Tom &amp; substitutes</p>
              <h3>Trainer admin</h3>
              <p>Schedule, payments, risk, legal, notify, reminders, site content.</p>
            </div>
          </Link>
        </div>
      </section>
    </div>
  )
}
