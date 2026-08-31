import { marketingHref } from './SiteNav'

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <p className="site-footer__brand">Golden Bay Team Training</p>
        <p>
          Run by Tom · <a href="tel:+642108928057">021 089 28057</a> ·{' '}
          <a href="mailto:Tom.GBTT@gmail.com">Tom.GBTT@gmail.com</a>
        </p>
        <p>
          <a
            href="https://www.facebook.com/people/Golden-Bay-Team-Training/100077092552576/"
            target="_blank"
            rel="noreferrer"
          >
            Facebook
          </a>
          {' · '}
          <a href={marketingHref('#fitforlife')}>#FITFORLIFE</a>
        </p>
      </div>
    </footer>
  )
}
