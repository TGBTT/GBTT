import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAppPresentation } from '../context/AppPresentation'
import { AppCardImage } from './AppHeroImage'
import { SiteNav } from './SiteNav'
import { ShowcaseChrome } from './ShowcaseShell'
import type { AppImageId } from '../shared/appAssets'

interface OutsideProps {
  backTo?: string
  backLabel?: string
  showBackLink?: boolean
  imageId?: AppImageId
  heroAlt?: string
  heroCompact?: boolean
  children?: ReactNode
}

function InAppHero({
  imageId,
  heroAlt,
  heroCompact,
}: {
  imageId: AppImageId
  heroAlt?: string
  heroCompact?: boolean
}) {
  return (
    <div
      className={`app-hero-photo app-hero-photo--in-app${heroCompact ? ' app-hero-photo--compact' : ''}`}
    >
      <AppCardImage id={imageId} alt={heroAlt} className="app-hero-photo__img" />
    </div>
  )
}

export function AppOutsideShell({
  backTo = '/',
  backLabel = '← GBTT apps',
  showBackLink = true,
  imageId,
  heroAlt,
  heroCompact,
  children,
}: OutsideProps) {
  const { showShowcaseChrome } = useAppPresentation()

  if (!showShowcaseChrome) {
    return (
      <>
        {showBackLink ? (
          <div className="app-outside-bar app-outside-bar--inline">
            <Link to={backTo} className="app-back">
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
        <SiteNav />
        {showBackLink ? (
          <div className="app-outside-bar">
            <Link to={backTo} className="app-back">
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
  imageId: AppImageId
  heroAlt?: string
  badge?: string
  backTo?: string
  backLabel?: string
}

export function AppChrome({
  theme,
  title,
  subtitle,
  imageId,
  heroAlt,
  badge,
  backTo = '/',
  backLabel = '← GBTT apps',
}: Props) {
  const { showShowcaseChrome } = useAppPresentation()

  if (!showShowcaseChrome) {
    return (
      <header className="app-app-bar">
        <Link to={backTo} className="app-back">
          {backLabel}
        </Link>
        <div className="app-app-bar__title">
          <span className="app-theme-tag">{theme}</span>
          <h1>{title}</h1>
        </div>
      </header>
    )
  }

  return (
    <>
      <AppOutsideShell backTo={backTo} backLabel={backLabel} imageId={imageId} heroAlt={heroAlt} />
      <header className="app-chrome app-chrome--in-app app-section app-section--chrome">
        <div>
          {badge ? <p className="app-badge">{badge}</p> : null}
          <h1>{title}</h1>
          {subtitle ? <p className="app-sub">{subtitle}</p> : null}
        </div>
        <span className="app-theme-tag">{theme}</span>
      </header>
    </>
  )
}
