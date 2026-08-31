import { Link } from 'react-router-dom'
import { AppCardImage } from '../components/AppHeroImage'
import { SiteFooter } from '../components/SiteFooter'
import { SiteNav } from '../components/SiteNav'

export default function Hub() {
  return (
    <div className="hub-page theme-gbtt">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <SiteNav />
      <main id="main" className="hub-main">
        <section className="section">
          <div className="section__inner">
            <p className="eyebrow">Member app</p>
            <h1>Book a class</h1>
            <p className="lede">
              Sign in to reserve your slot, manage your weekly membership, or open trainer admin.
              Live fill stays in sync with the homepage timetable.
            </p>
            <div className="hub-grid">
              <Link to="/fitness/studioflow" className="hub-card">
                <AppCardImage id="studioflow" />
                <div className="hub-card-body">
                  <p className="hub-card-kind">For members &amp; guests</p>
                  <h2>Member booking</h2>
                  <p>
                    Weekly timetable, subscriptions, reshuffle, planned exercises, and name privacy.
                  </p>
                  <span className="hub-card-go">Open member booking →</span>
                </div>
              </Link>
              <Link to="/fitness/classboard" className="hub-card">
                <AppCardImage id="classboard" />
                <div className="hub-card-body">
                  <p className="hub-card-kind">For Tom &amp; trainers</p>
                  <h2>Trainer admin</h2>
                  <p>
                    Schedule, roll-call, payments, risk, legal, notify, reminders, and site content.
                  </p>
                  <span className="hub-card-go">Open trainer admin →</span>
                </div>
              </Link>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
