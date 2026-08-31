import type { ReactNode } from 'react'
import { useAppPresentation } from '../context/AppPresentation'
import { AppCardImage } from './AppHeroImage'
import { InAppExitBar, InAppLogoutButton, marketingHomeHref } from './SiteNav'
import { ShowcaseChrome } from './ShowcaseShell'
import type { AppImageId } from '../shared/appAssets'

interface OutsideProps {
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
  imageId,
  heroAlt,
  heroCompact,
  children,
}: OutsideProps) {
  const { showShowcaseChrome } = useAppPresentation()

  if (!showShowcaseChrome) {
    return (
      <>
        <InAppExitBar />
        {imageId ? <InAppHero imageId={imageId} heroAlt={heroAlt} heroCompact={heroCompact} /> : null}
        {children}
      </>
    )
  }

  return (
    <>
      <ShowcaseChrome>
        <InAppExitBar />
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
}

export function AppChrome({
  theme,
  title,
  subtitle,
  imageId,
  heroAlt,
  badge,
}: Props) {
  const { showShowcaseChrome } = useAppPresentation()

  if (!showShowcaseChrome) {
    return (
      <header className="app-app-bar">
        <a href={marketingHomeHref()} className="app-back">
          ← GBTT apps
        </a>
        <div className="app-app-bar__title">
          <span className="app-theme-tag">{theme}</span>
          <h1>{title}</h1>
        </div>
        <InAppLogoutButton />
      </header>
    )
  }

  return (
    <>
      <AppOutsideShell imageId={imageId} heroAlt={heroAlt} />
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
