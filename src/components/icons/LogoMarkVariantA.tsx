// Logo test variant A — "Pulse Track". Rounded-square container with pulse
// line and green dot. Paths from designer export (web-package/pulse-track).
type Props = { size?: number; className?: string; variant?: 'default' | 'onInk' | 'onGreen' }

const palettes = {
  default: { container: '#171717', stroke: '#FFFFFF', accent: '#7BC043' },
  onInk:   { container: '#FFFFFF', stroke: '#171717', accent: '#7BC043' },
  onGreen: { container: '#FFFFFF', stroke: '#171717', accent: '#7BC043' },
}

const LogoMarkVariantA = ({ size = 28, className, variant = 'default' }: Props) => {
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
      <rect x="4" y="4" width="56" height="56" rx="14" fill={c.container} />
      <path
        d="M10 38 L20 38 L26 46 L34 18 L40 32 L48 32"
        stroke={c.stroke}
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx="48" cy="32" r="5" fill={c.accent} />
    </svg>
  )
}

export default LogoMarkVariantA
