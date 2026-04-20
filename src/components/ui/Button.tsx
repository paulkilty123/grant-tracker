import { ButtonHTMLAttributes, forwardRef } from 'react'

const VARIANT_STYLES = {
  primary: {
    background: '#8ECB3C',
    color: '#173404',
    border: 'none',
    borderRadius: 10,
    fontWeight: 600,
  },
  secondary: {
    background: '#fff',
    color: '#2C2C2A',
    border: '0.5px solid rgba(0,0,0,0.14)',
    borderRadius: 10,
    fontWeight: 500,
  },
  ghost: {
    background: 'transparent',
    color: '#5F5E5A',
    border: 'none',
    borderRadius: 10,
    fontWeight: 500,
  },
} as const

const SIZE_STYLES = {
  sm: { fontSize: 12, padding: '7px 14px' },
  md: { fontSize: 13, padding: '9px 18px' },
} as const

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANT_STYLES
  size?: keyof typeof SIZE_STYLES
}

/**
 * Button — enforces the three-tier button system.
 *
 * primary   lime fill  #8ECB3C / #173404  — single most important action per region
 * secondary white outline #fff / rgba(0,0,0,0.14) — supporting page-level actions
 * ghost     text only  #5F5E5A / transparent  — cancel, discard, text links
 *
 * Deep forest (#173404) fill is retired as a button colour.
 */
const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'secondary', size = 'md', style, disabled, children, ...props }, ref) => {
    const variantStyle = VARIANT_STYLES[variant]
    const sizeStyle    = SIZE_STYLES[size]

    return (
      <button
        ref={ref}
        disabled={disabled}
        style={{
          ...variantStyle,
          ...sizeStyle,
          fontFamily: 'var(--font-space-grotesk)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          lineHeight: 1,
          opacity: disabled ? 0.5 : 1,
          transition: 'background 0.12s, opacity 0.12s',
          ...style,
        }}
        {...props}
      >
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'
export default Button
