import { Link } from 'react-router-dom'
import { CLASS_OFFERINGS, SITE } from '../data/siteConfig'

export default function ClassesPage() {
  return (
    <section className="section">
      <div className="section__inner">
        <p className="eyebrow">Offerings</p>
        <h1>Classes</h1>
        <p className="lede">
          Group sessions at Rec Park Centre with Tom. Timetable changes with demand — check{' '}
          <a href={SITE.facebook} target="_blank" rel="noreferrer">
            Facebook
          </a>{' '}
          or <Link to="/contact">contact Tom</Link> for the current week.
        </p>
        <ul className="offering-list">
          {CLASS_OFFERINGS.map((c) => (
            <li key={c.id}>
              <h2>{c.name}</h2>
              <p>{c.blurb}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
