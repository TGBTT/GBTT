import { useDemoPresentation } from '../context/DemoPresentation'

export type PackageTier = 'essential' | 'advanced'
export type PitchKind = 'package' | 'customOps'

interface PitchBarProps {
  pitchKind?: PitchKind
  packageTier?: PackageTier
  compareTo: string
  compareLabel: string
  engineNote?: string
}

/** Pitch strip removed from showcase chrome — kept for typed props / quote CTA sibling. */
export function DemoPitchBar(_props: PitchBarProps) {
  return null
}

interface QuoteCtaProps {
  styleName: string
  pitchKind?: PitchKind
}

/** End-of-demo note — simulated only for GBTT. */
export function DemoQuoteCta({ styleName }: QuoteCtaProps) {
  const { showShowcaseChrome } = useDemoPresentation()
  const href = `${import.meta.env.BASE_URL}../apps/`

  if (!showShowcaseChrome) {
    return (
      <p className="demo-quote-minimal">
        <a href={href}>Simulated {styleName} demo · back to GBTT apps →</a>
      </p>
    )
  }

  return (
    <div className="demo-quote-cta">
      <p>
        <strong>{styleName}</strong> is a simulated demo for Golden Bay Team Training — no live booking
        or payment.
      </p>
      <a className="btn primary" href={href}>
        Back to GBTT apps →
      </a>
    </div>
  )
}
