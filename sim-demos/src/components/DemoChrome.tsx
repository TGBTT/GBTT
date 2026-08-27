import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useDemoPresentation } from '../context/DemoPresentation'
import { DemoCardImage } from './DemoHeroImage'
import { GbtechDemoNav } from './GbtechDemoNav'
import { ShowcaseChrome } from './ShowcaseShell'
import type { DemoImageId } from '../shared/demoAssets'

interface OutsideProps {
  backTo?: string
  backLabel?: string
  showBackLink?: boolean
  /** Hero renders inside the tablet bezel (not in outside chrome). */
  imageId?: DemoImageId
  heroAlt?: string
  /** Compact hero crop (ops boards). */
  heroCompact?: boolean
  children?: ReactNode
}

function InAppHero({
  imageId,
  heroAlt,
  heroCompact,
}: {
  imageId: DemoImageId
  heroAlt?: string
  heroCompact?: boolean
}) {
  return (
    <div
      className={`demo-hero-photo demo-hero-photo--in-app${heroCompact ? ' demo-hero-photo--compact' : ''}`}
    >
      <DemoCardImage id={imageId} alt={heroAlt} className="demo-hero-photo__img" />
    </div>
  )
}

/** Sticky nav + back link outside the tablet; optional hero stays inside the bezel. */
export function DemoOutsideShell({
  backTo = '/',
  backLabel = '← All demos',
  showBackLink = true,
  imageId,
  heroAlt,
  heroCompact,
  children,
}: OutsideProps) {
  const { showShowcaseChrome } = useDemoPresentation()

  if (!showShowcaseChrome) {
    return (
      <>
        {showBackLink ? (
          <div className="demo-outside-bar demo-outside-bar--inline">
            <Link to={backTo} className="demo-back">
              {backLabel}
            </Link>
          </div>
        ) : null}
        {imageId ? <InAppHero imageId={imageId} heroAlt={heroAlt} heroCompact={heroCompact} /> : null}
        {children}
      </>
    )
  }

  return (
    <>
      <ShowcaseChrome>
        <GbtechDemoNav />
        {showBackLink ? (
          <div className="demo-outside-bar">
            <Link to={backTo} className="demo-back">
              {backLabel}
            </Link>
          </div>
        ) : null}
      </ShowcaseChrome>
      {imageId ? <InAppHero imageId={imageId} heroAlt={heroAlt} heroCompact={heroCompact} /> : null}
      {children}
    </>
  )
}

interface Props {
  theme: string
  title: string
  subtitle?: string
  imageId: DemoImageId
  heroAlt?: string
  badge?: string
  backTo?: string
  backLabel?: string
}

export function DemoChrome({
  theme,
  title,
  subtitle,
  imageId,
  heroAlt,
  badge = 'Simulated demo · no real booking',
  backTo = '/',
  backLabel = '← All demos',
}: Props) {
  const { showShowcaseChrome } = useDemoPresentation()

  if (!showShowcaseChrome) {
    return (
      <header className="demo-app-bar">
        <Link to={backTo} className="demo-back">
          {backLabel}
        </Link>
        <div className="demo-app-bar__title">
          <span className="demo-theme-tag">{theme}</span>
          <h1>{title}</h1>
        </div>
      </header>
    )
  }

  return (
    <>
      <DemoOutsideShell backTo={backTo} backLabel={backLabel} imageId={imageId} heroAlt={heroAlt} />
      <header className="demo-chrome demo-chrome--in-app app-section app-section--chrome">
        <div>
          <p className="demo-badge">{badge}</p>
          <h1>{title}</h1>
          {subtitle ? <p className="demo-sub">{subtitle}</p> : null}
        </div>
        <span className="demo-theme-tag">{theme}</span>
      </header>
    </>
  )
}
