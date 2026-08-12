// Canonical Shoots brand mark — the sprout. Two opposed leaf curves off a
// central stem, geometry taken verbatim from the landing page's inline mark
// (public/landing/index.html, `.brand-svg`) so the app and the landing page
// render the same logo rather than two drifting copies.
//
// Stroke-based, not fill-based: the sprout is drawn with 1.75-width round-capped
// strokes on a 24x24 viewBox. The retired mark was two filled pills on a 100x100
// viewBox in the old lime palette (#8ECB3C family), which is why this is a
// replacement rather than a recolour.
//
// The pill-lifting note that used to live here is gone with the pills. This
// viewBox has no float, so the mark's optical centre already lines up with a
// wordmark's line-height centre under `flex items-center`.
//
// Variant mapping (single stroke colour per surface, since the sprout is one
// continuous mark rather than two pills):
//   default — light surfaces (nav, bridge pages, authorize screen). Deep teal.
//   onInk   — dark surfaces (sidebar, footer). Cream, dropping onto the dark bg.
//   onGreen — green-tinted surfaces. Deep teal, same as default: the tint is
//             light enough that cream would lose contrast.
//
// Colours are `var(--token, #hex)` rather than bare tokens on purpose. This
// component renders on pages that do not load shoots-auth.css (privacy, terms,
// the bridge pages), where the custom properties are undefined and a bare
// var() would collapse to the SVG default of black.
type LogoMarkProps = {
  size?: number
  className?: string
  variant?: 'default' | 'onInk' | 'onGreen'
  /** Accessible name. Defaults to the brand. Not read from mcp-brand: that
   *  module reads non-public env at module load and this component is used
   *  inside client components (Sidebar, Logo). */
  label?: string
}

const strokes = {
  default: 'var(--deep, #1D3C3E)',
  onInk:   'var(--cream, #F5F1E8)',
  onGreen: 'var(--deep, #1D3C3E)',
}

const LogoMark = ({ size = 28, className, variant = 'default', label = 'Shoots' }: LogoMarkProps) => {
  const stroke = strokes[variant]
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      fill="none"
      stroke={stroke}
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={label}
    >
      {/* upper-left leaf */}
      <path d="M12 10a6 6 0 0 0 -6 -6h-3v2a6 6 0 0 0 6 6h3" />
      {/* lower-right leaf */}
      <path d="M12 14a6 6 0 0 1 6 -6h3v1a6 6 0 0 1 -6 6h-3" />
      {/* stem */}
      <path d="M12 20l0 -10" />
    </svg>
  )
}

export default LogoMark
