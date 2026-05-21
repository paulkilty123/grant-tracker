type LogoMarkProps = {
  size?: number
  className?: string
  variant?: 'default' | 'onInk' | 'onGreen'
}

const palettes = {
  default: { dark: '#1A1A18', muted: '#D1D1CE', accent: '#8ECB3C' },
  onInk: { dark: '#FFFFFF', muted: '#3A3A38', accent: '#8ECB3C' },
  onGreen: { dark: '#173404', muted: '#B7E07A', accent: '#FFFFFF' },
}

const LogoMark = ({ size = 28, className, variant = 'default' }: LogoMarkProps) => {
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
      <circle cx="7" cy="7" r="4.2" fill={c.dark} />
      <circle cx="17" cy="7" r="4.2" fill={c.muted} />
      <circle cx="7" cy="17" r="4.2" fill={c.muted} />
      <circle cx="17" cy="17" r="4.2" fill={c.accent} />
    </svg>
  )
}

export default LogoMark
