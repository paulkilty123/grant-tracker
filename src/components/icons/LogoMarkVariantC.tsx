// Logo test variant C — pulse line with green dot, no container. Smallest
// visual footprint, reads as "live signal" alongside the wordmark.
type Props = { size?: number; className?: string; variant?: 'default' | 'onInk' | 'onGreen' }

const palettes = {
  default: { stroke: '#1A1A18', accent: '#8ECB3C' },
  onInk:   { stroke: '#FFFFFF', accent: '#8ECB3C' },
  onGreen: { stroke: '#173404', accent: '#FFFFFF' },
}

const LogoMarkVariantC = ({ size = 28, className, variant = 'default' }: Props) => {
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
      <path
        d="M 3 14 L 7.5 14 L 9.4 17.3 L 12 5.5 L 14.4 14 L 17.4 14"
        fill="none"
        stroke={c.stroke}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="19" cy="14" r="2.2" fill={c.accent} />
    </svg>
  )
}

export default LogoMarkVariantC
