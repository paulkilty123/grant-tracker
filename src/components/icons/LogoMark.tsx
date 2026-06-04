// Canonical Grant Tracker brand mark — "Pulse Bare". Paths from designer
// export (web-package/pulse-bare/pulse-bare.svg). Pulse-line silhouette
// with green accent dot; reads as "live signal" alongside the wordmark.
type LogoMarkProps = {
  size?: number
  className?: string
  variant?: 'default' | 'onInk' | 'onGreen'
}

const palettes = {
  default: { stroke: '#171717', accent: '#7BC043' },
  onInk:   { stroke: '#FFFFFF', accent: '#7BC043' },
  onGreen: { stroke: '#FFFFFF', accent: '#7BC043' },
}

const LogoMark = ({ size = 28, className, variant = 'default' }: LogoMarkProps) => {
  const c = palettes[variant]
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 36 L16 36 L23 46 L33 12 L40 33 L56 33"
        stroke={c.stroke}
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx="56" cy="33" r="5.5" fill={c.accent} />
    </svg>
  )
}

export default LogoMark
