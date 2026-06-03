// Logo test variant B — open ring with checkmark and green dot at the
// ring break. Carries the "verified / completed" semantic that pairs well
// with the audit-grade pitch.
type Props = { size?: number; className?: string; variant?: 'default' | 'onInk' | 'onGreen' }

const palettes = {
  default: { stroke: '#1A1A18', accent: '#8ECB3C' },
  onInk:   { stroke: '#FFFFFF', accent: '#8ECB3C' },
  onGreen: { stroke: '#173404', accent: '#FFFFFF' },
}

const LogoMarkVariantB = ({ size = 28, className, variant = 'default' }: Props) => {
  const c = palettes[variant]
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
    >
      {/* Open ring — arc covering roughly 320° of the circle, gap at lower-right */}
      <path
        d="M 19.3 16.4 A 9 9 0 1 1 16.6 19.4"
        fill="none"
        stroke={c.stroke}
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      {/* Checkmark inside the ring */}
      <path
        d="M 7 12 L 10.5 15.6 L 17 8.6"
        fill="none"
        stroke={c.stroke}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Accent dot at the ring break */}
      <circle cx="19.4" cy="17.8" r="2.4" fill={c.accent} />
    </svg>
  )
}

export default LogoMarkVariantB
