'use client'

import { ButtonHTMLAttributes, forwardRef, useState } from 'react'

/* ─────────────────────────────────────────────
   Tokens — mirrors the :root block in the
   onboarding HTML reference spec exactly.
───────────────────────────────────────────── */
const LIME       = '#8ECB3C'
const GREEN_MID  = '#639922'
const GREEN_DEEP = '#173404'

const VARIANT_STYLES = {
  primary: {
    background: LIME,
    color: GREEN_DEEP,
    border: 'none',
    borderRadius: 10,
    fontWeight: 500,
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
  md: { fontSize: 14, padding: '11px 20px' },
  lg: { fontSize: 15, padding: '14px 24px' },
} as const

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANT_STYLES
  size?: keyof typeof SIZE_STYLES
}

/**
 * Button — the single canonical button primitive.
 *
 * primary   lime #8ECB3C / deep-forest #173404  — the one CTA per screen
 *           hover: green-mid #639922 / #fff
 * secondary white / rgba(0,0,0,0.14) border      — supporting actions
 * ghost     transparent / #5F5E5A                — back, cancel, text links
 *
 * Deep forest (#173404) fill is retired as a standalone button bg.
 * Never use ad-hoc lime-400 / lime-500 Tailwind utilities — they won't match.
 */
const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'secondary', size = 'md', style, disabled, onMouseEnter, onMouseLeave, children, ...props }, ref) => {
    const [hovered, setHovered] = useState(false)

    const variantStyle = VARIANT_STYLES[variant]
    const sizeStyle    = SIZE_STYLES[size]

    // Primary hover: lime → green-mid, deep-forest text → white (matches HTML spec)
    const hoverOverride = hovered && !disabled && variant === 'primary'
      ? { background: GREEN_MID, color: '#fff' }
      : {}

    return (
      <button
        ref={ref}
        disabled={disabled}
        onMouseEnter={e => { setHovered(true); onMouseEnter?.(e) }}
        onMouseLeave={e => { setHovered(false); onMouseLeave?.(e) }}
        style={{
          ...variantStyle,
          ...sizeStyle,
          ...hoverOverride,
          fontFamily: 'var(--font-space-grotesk)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          lineHeight: 1,
          transition: 'background 120ms ease, color 120ms ease',
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
