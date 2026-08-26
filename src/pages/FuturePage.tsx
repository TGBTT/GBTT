import { Link } from 'react-router-dom'
import { FUTURE_CAPABILITIES } from '../data/futureCapabilities'

export default function FuturePage() {
  return (
    <section className="section">
      <div className="section__inner">
        <p className="eyebrow">Roadmap lane</p>
        <h1>Future capabilities</h1>
        <p className="lede">
          Studio Flow and Class Board already cover booking and ops. This lane collects features from
          the demo catalog that stay relevant as GBTT grows — a second branded app shell can land
          here later without resurrecting unrelated industry demos.
        </p>
        <ul className="future-list">
          {FUTURE_CAPABILITIES.map((item) => (
            <li key={item.id}>
              <h2>{item.title}</h2>
              <p className="future-list__source">{item.source}</p>
              <p>{item.blurb}</p>
            </li>
          ))}
        </ul>
        <p>
          See live demos on the <Link to="/apps">Apps</Link> page. Full catalog:{' '}
          <code>sim-demos/DEMO-FEATURES.md</code> in the repo.
        </p>
      </div>
    </section>
  )
}
