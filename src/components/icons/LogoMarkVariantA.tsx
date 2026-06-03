// Logo test variant A — rounded-square container with white pulse line and
// green dot. Larger silhouette suited to app-icon / Connectors-Directory tile.
type Props = { size?: number; className?: string; variant?: 'default' | 'onInk' | 'onGreen' }

const palettes = {
  default: { container: '#1A1A18', stroke: '#FFFFFF', accent: '#8ECB3C' },
  onInk:   { container: '#FFFFFF', stroke: '#1A1A18', accent: '#8ECB3C' },
  onGreen: { container: '#173404', stroke: '#FFFFFF', accent: '#FFFFFF' },
}

const LogoMarkVariantA = ({ size = 28, className, variant = 'default' }: Props) => {
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
      <rect x="0.5" y="0.5" width="23" height="23" rx="5" ry="5" fill={c.container} />
      <path
        d="M 4 13.5 L 7.5 13.5 L 9.2 16.5 L 11.5 5 L 13.6 13.5 L 16 13.5"
        fill="none"
        stroke={c.stroke}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="17.6" cy="13.5" r="1.8" fill={c.accent} />
    </svg>
  )
}

export default LogoMarkVariantA
