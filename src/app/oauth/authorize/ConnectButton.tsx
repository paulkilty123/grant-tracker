'use client'

import { ButtonHTMLAttributes, forwardRef, useState } from 'react'

/**
 * The deep-filled primary, scoped to the OAuth connect flow.
 *
 * WHY THIS EXISTS RATHER THAN ui/Button.tsx: a deep-filled primary does not
 * exist anywhere in the codebase. ui/Button's `primary` is lime-filled
 * (#8ECB3C) on main, and still lime-filled on shoots/design-tokens with --deep
 * used only as its TEXT colour. Its own docstring records deep fill as retired.
 * So this creates the variant rather than duplicating one.
 *
 * When the Shoots migration lands and adds a proper deep-filled primary to
 * ui/Button, this file should be deleted and its call sites repointed. It is
 * intentionally small to keep that cheap.
 *
 * Every colour resolves through var() against the .shoots-auth scope in
 * shoots-auth.css. No raw hex, and no rgba beyond the canonical border tokens
 * that file already declares.
 */

type Variant = 'primary' | 'secondary'

const BASE = {
  borderRadius: 10,
  fontWeight: 500,
  fontSize: 14,
  padding: '11px 20px',
  fontFamily: 'var(--font-space-grotesk)',
  cursor: 'pointer',
  transition: 'background 120ms ease, border-color 120ms ease',
} as const

const VARIANTS: Record<Variant, React.CSSProperties> = {
  // Deep fill, cream text. The one action per screen.
  primary: {
    background: 'var(--deep)',
    color: 'var(--text-on-dark)',
    border: '1px solid var(--deep)',
  },
  // Ghost. Hairline border rather than a shadow, per the Shoots surface rules.
  secondary: {
    background: 'transparent',
    color: 'var(--text-body)',
    border: '1px solid var(--border-mid)',
  },
}

const HOVER: Record<Variant, React.CSSProperties> = {
  primary:   { background: 'var(--deep-hover)', border: '1px solid var(--deep-hover)' },
  secondary: { background: 'var(--surface-sunken)', border: '1px solid var(--border-strong)' },
}

interface ConnectButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  fullWidth?: boolean
}

const ConnectButton = forwardRef<HTMLButtonElement, ConnectButtonProps>(
  ({ variant = 'secondary', fullWidth, style, disabled, onMouseEnter, onMouseLeave, children, ...props }, ref) => {
    const [hovered, setHovered] = useState(false)
    const active = hovered && !disabled

    return (
      <button
        ref={ref}
        disabled={disabled}
        onMouseEnter={(e) => { setHovered(true); onMouseEnter?.(e) }}
        onMouseLeave={(e) => { setHovered(false); onMouseLeave?.(e) }}
        style={{
          ...BASE,
          ...VARIANTS[variant],
          ...(active ? HOVER[variant] : {}),
          ...(fullWidth ? { width: '100%' } : {}),
          ...(disabled ? { opacity: 0.55, cursor: 'not-allowed' } : {}),
          ...style,
        }}
        {...props}
      >
        {children}
      </button>
    )
  },
)
ConnectButton.displayName = 'ConnectButton'

export default ConnectButton
