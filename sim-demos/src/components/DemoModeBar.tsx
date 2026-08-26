interface Props {
  clientTo: string
  clientLabel: string
  opsTo: string
  opsLabel: string
  /** Optional peak-season data toggle (Studio Flow showcase). */
  peakOn?: boolean
  onPeakToggle?: (on: boolean) => void
}

/** Demo mode strip removed from showcase chrome — peak toggle still wired in Studio Flow state. */
export function DemoModeBar(_props: Props) {
  return null
}
