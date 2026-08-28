import { Link } from 'react-router-dom'
import { AppCardImage } from '../components/AppHeroImage'
import { SiteNav } from '../components/SiteNav'

export default function Hub() {
  return (
    <div className="hub-page theme-gbtt">
      <SiteNav />
      <header className="hub-hero">
        <p className="hub-kicker">Golden Bay Team Training</p>
        <h1>Member &amp; trainer apps</h1>
        <p className="hub-lead">
          Fit for Life — book classes, manage your weekly membership, and run the studio from one
          place. Sticky nav matches the main GBTT site.
        </p>
        <p className="hub-lead">
          <a href="../#apps">← Back to GBTT homepage</a>
        </p>
      </header>
      <section className="hub-group">
        <div className="hub-grid">
          <Link to="/fitness/studioflow" className="hub-card hub-card-studioflow">
            <AppCardImage id="studioflow" alt="" />
            <div className="hub-card-body">
              <p className="hub-card-kind">For members &amp; guests</p>
              <h3>Member booking</h3>
              <p>Weekly timetable, subscriptions, reshuffle, planned exercises, name privacy.</p>
            </div>
          </Link>
          <Link to="/fitness/classboard" className="hub-card hub-card-classboard">
            <AppCardImage id="classboard" alt="" />
            <div className="hub-card-body">
              <p className="hub-card-kind">For Tom &amp; substitutes</p>
              <h3>Trainer admin</h3>
              <p>Schedule, role-call, payments, risk, legal, notify, reminders, site content.</p>
            </div>
          </Link>
        </div>
      </section>
    </div>
  )
}
