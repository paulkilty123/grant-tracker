// Logo test variant B — "Check Loop". Open ring with checkmark and green dot
// at the ring break. Paths from designer export (web-package/check-loop).
type Props = { size?: number; className?: string; variant?: 'default' | 'onInk' | 'onGreen' }

const palettes = {
  default: { stroke: '#171717', accent: '#7BC043' },
  onInk:   { stroke: '#FFFFFF', accent: '#7BC043' },
  onGreen: { stroke: '#FFFFFF', accent: '#7BC043' },
}

const LogoMarkVariantB = ({ size = 28, className, variant = 'default' }: Props) => {
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
        d="M48 18 L28 42 L18 32 M48 18 A22 22 0 1 0 54 32"
        stroke={c.stroke}
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx="54" cy="32" r="4" fill={c.accent} />
    </svg>
  )
}

export default LogoMarkVariantB
