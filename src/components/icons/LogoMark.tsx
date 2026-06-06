// Canonical Grant Tracker brand mark — "growth beside you". Two pills:
// short pill (left) + tall pill (right), rx=13, viewBox 100x100. Geometry
// from designer export (Downloads/grant_tracker_icons.html, 2026-06-06).
//
// Pills are shifted down by 4 units from the rendered designer values so
// the bottom sits at y=92 — matching the designer's intent per the spec
// comment in the source HTML, and producing a flush bottom alignment
// with the GrantTracker wordmark baseline when used in a flex items-
// center row.
//
// Variant mapping:
//   default — light surfaces (landing nav, bridge-page top bar). Forest
//             short pill + green tall pill, transparent background.
//   onInk   — dark forest surfaces (footer). Cream short pill + green
//             tall pill — the "tile interior" dropping onto the dark bg.
//   onGreen — green-tinted surfaces. Inverse: forest short pill + cream
//             tall pill.
type LogoMarkProps = {
  size?: number
  className?: string
  variant?: 'default' | 'onInk' | 'onGreen'
}

const palettes = {
  default: { short: '#173404', tall: '#7CC242' },
  onInk:   { short: '#F5F1E8', tall: '#7CC242' },
  onGreen: { short: '#173404', tall: '#F5F1E8' },
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
      aria-label="Grant Tracker"
    >
      <rect x="20" y="50" width="26" height="42" rx="13" fill={c.short} />
      <rect x="56" y="22" width="26" height="70" rx="13" fill={c.tall} />
    </svg>
  )
}

export default LogoMark
