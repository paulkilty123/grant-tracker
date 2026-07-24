// Canonical brand mark — "growth beside you". Two pills:
// short pill (left) + tall pill (right), rx=13, viewBox 100x100. Geometry
// from designer export (Downloads/grant_tracker_icons.html, 2026-06-06).
//
// Pills are shifted UP by 8 units from the rendered designer values so
// the bottom sits at y=80. The designer source has the pills floating
// inside a square viewBox; with flex items-center the SVG bounding-box
// centre aligns with the wordmark line-height centre, which leaves the
// pills' visual bottom sitting BELOW the wordmark baseline. Lifting the
// pills brings the pill bottom flush with the wordmark baseline at
// the live render sizes.
//
// Variant mapping:
//   default — light surfaces (landing nav, bridge-page top bar). Forest
//             short pill + green tall pill, transparent background.
//   onInk   — dark forest surfaces (footer). Cream short pill + green
//             tall pill — the "tile interior" dropping onto the dark bg.
//   onGreen — green-tinted surfaces. Inverse: forest short pill + cream
//             tall pill.
import { brand } from '@/config/brand'

type LogoMarkProps = {
  size?: number
  className?: string
  variant?: 'default' | 'onInk' | 'onGreen'
}

const palettes = {
  default: { short: 'var(--deep)', tall: 'var(--sage-deep)' },
  onInk:   { short: 'var(--surface-sunken)', tall: 'var(--sage-deep)' },
  onGreen: { short: 'var(--deep)', tall: 'var(--surface-sunken)' },
}

const LogoMark = ({ size = 28, className, variant = 'default' }: LogoMarkProps) => {
  const c = palettes[variant]
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={brand.name}
    >
      <rect x="20" y="38" width="26" height="42" rx="13" fill={c.short} />
      <rect x="56" y="10" width="26" height="70" rx="13" fill={c.tall} />
    </svg>
  )
}

export default LogoMark
