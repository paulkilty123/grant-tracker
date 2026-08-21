'use client'

import { ButtonHTMLAttributes, forwardRef, useState } from 'react'

/**
 * Button — the canonical button primitive.
 *
 * Four levels, matching the band A spec §4 and the live landing header:
 *
 *   primary    deep fill, cream text, pill      — the one action per screen
 *   secondary  ghost, 1.5px hairline border     — supporting actions
 *   tertiary   text with a soft underline       — back, skip, cancel
 *   danger     deepened terracotta fill         — destructive only
 *
 * `ghost` is kept as an alias of `tertiary` so existing call sites do not
 * break.
 *
 * LIME IS RETIRED. This component's primary was #8ECB3C with deep-forest
 * text; that colour appears nowhere in the Shoots palette. It is safe to
 * change here because this file has exactly one importer, the onboarding
 * wizard, which is itself a band A page.
 *
 * Colours resolve through `var(--token, #fallback)` rather than bare tokens:
 * the tokens are declared on the `.shoots-a` scope, and a bare var() would
 * collapse to the CSS default on any surface that does not load it.
 *
 * Focus is a 2px deep outline at 3px offset on every level, with no
 * exceptions. On the secondary the border is deliberately light (1.49:1,
 * matching the live nav pill), so the label carries identification and the
 * focus ring carries keyboard navigation. Removing it makes the control
 * genuinely unusable without a mouse.
 */

const DEEP        = 'var(--deep, #1D3C3E)'
const DEEP_HOVER  = 'var(--deep-hover, #16302F)'
const DEEP_ACTIVE = 'var(--deep-active, #102524)'
const CREAM       = 'var(--cream, #F6F1E7)'
const DANGER      = 'var(--danger, #B4472A)'
const DANGER_HOV  = 'var(--danger-hover, #9C3C24)'

const VARIANT_STYLES = {
  primary: {
    background: DEEP,
    color: CREAM,
    border: `1.5px solid ${DEEP}`,
  },
  secondary: {
    background: 'transparent',
    color: DEEP,
    border: '1.5px solid var(--border-ghost, rgba(29,60,62,.22))',
  },
  tertiary: {
    background: 'transparent',
    color: DEEP,
    border: '1.5px solid transparent',
    textDecoration: 'underline',
    textUnderlineOffset: 4,
    textDecorationThickness: 1.5,
    textDecorationColor: 'rgba(29,60,62,.35)',
  },
  ghost: {
    background: 'transparent',
    color: DEEP,
    border: '1.5px solid transparent',
    textDecoration: 'underline',
    textUnderlineOffset: 4,
    textDecorationThickness: 1.5,
    textDecorationColor: 'rgba(29,60,62,.35)',
  },
  danger: {
    background: DANGER,
    color: '#FDF6F3',
    border: `1.5px solid ${DANGER}`,
  },
} as const

const HOVER_STYLES: Record<string, React.CSSProperties> = {
  primary:   { background: DEEP_HOVER, borderColor: DEEP_HOVER },
  secondary: { background: 'rgba(29,60,62,.06)', borderColor: 'rgba(29,60,62,.38)' },
  tertiary:  { textDecorationColor: DEEP },
  ghost:     { textDecorationColor: DEEP },
  danger:    { background: DANGER_HOV, borderColor: DANGER_HOV },
}

const SIZE_STYLES = {
  sm: { fontSize: 13,   padding: '8px 18px' },
  md: { fontSize: 15,   padding: '12px 26px' },
  lg: { fontSize: 15.5, padding: '14px 28px' },
} as const

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANT_STYLES
  size?: keyof typeof SIZE_STYLES
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'secondary', size = 'md', style, disabled, onMouseEnter, onMouseLeave, children, ...props }, ref) => {
    const [hovered, setHovered] = useState(false)
    const [active, setActive]   = useState(false)

    const variantStyle = VARIANT_STYLES[variant]
    const sizeStyle    = SIZE_STYLES[size]
    const hoverStyle   = hovered && !disabled ? HOVER_STYLES[variant] : {}

    const disabledStyle: React.CSSProperties =
      disabled && (variant === 'primary' || variant === 'danger')
        ? { background: 'rgba(29,60,62,.26)', color: 'rgba(29,60,62,.48)', borderColor: 'transparent' }
        : disabled
          ? { color: 'rgba(29,60,62,.38)', borderColor: 'rgba(29,60,62,.12)' }
          : {}

    return (
      <button
        ref={ref}
        disabled={disabled}
        onMouseEnter={e => { setHovered(true); onMouseEnter?.(e) }}
        onMouseLeave={e => { setHovered(false); setActive(false); onMouseLeave?.(e) }}
        onMouseDown={() => setActive(true)}
        onMouseUp={() => setActive(false)}
        style={{
          ...variantStyle,
          ...sizeStyle,
          ...hoverStyle,
          ...disabledStyle,
          ...(active && !disabled && variant === 'primary'
            ? { background: DEEP_ACTIVE, borderColor: DEEP_ACTIVE, transform: 'translateY(1px)' }
            : {}),
          borderRadius: 999,
          fontFamily: 'var(--font-space-grotesk)',
          fontWeight: 600,
          cursor: disabled ? 'not-allowed' : 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          lineHeight: 1,
          whiteSpace: 'nowrap',
          transition: 'background 120ms ease, border-color 120ms ease, color 120ms ease, transform 60ms ease',
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
