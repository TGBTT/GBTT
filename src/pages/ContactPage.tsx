import { ContactForm } from '../components/ContactForm'
import { VenueMap } from '../components/VenueMap'
import { activeVenues, directionsUrl } from '../data/locations'
import { SITE } from '../data/siteConfig'

export default function ContactPage() {
  const venue = activeVenues()[0]

  return (
    <section className="section">
      <div className="section__inner contact-layout">
        <div>
          <p className="eyebrow">Get in touch</p>
          <h1>Contact Tom</h1>
          <p className="lede">
            Ask about joining a class, packs, or kids and teens options. Prefer social? Message on
            Facebook.
          </p>
          <ul className="contact-direct">
            <li>
              <span>Email</span>
              <a href={`mailto:${SITE.email}`}>{SITE.email}</a>
            </li>
            <li>
              <span>Phone</span>
              <a href={SITE.phoneHref}>{SITE.phone}</a>
            </li>
            <li>
              <span>Facebook</span>
              <a href={SITE.facebook} target="_blank" rel="noreferrer">
                Golden Bay Team Training
              </a>
            </li>
            {venue ? (
              <li>
                <span>Train at</span>
                <a href={directionsUrl(venue)} target="_blank" rel="noreferrer">
                  {venue.name}, {venue.addressLines[1]}
                </a>
              </li>
            ) : null}
          </ul>
          <ContactForm />
        </div>
        <div className="contact-layout__map">
          <VenueMap zoom={14} className="venue-map venue-map--compact" />
        </div>
      </div>
    </section>
  )
}
