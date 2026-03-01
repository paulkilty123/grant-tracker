import React from 'react'

interface LogoProps {
  /** 'light' = for dark backgrounds (sidebar)
   *  'dark'  = for light backgrounds (nav, auth pages) */
  variant?: 'light' | 'dark'
  /** Overall size scale */
  size?: 'sm' | 'md' | 'lg'
  /** Kept for backwards compat — no longer used */
  showTagline?: boolean
}

export default function Logo({ variant = 'dark', size = 'md' }: LogoProps) {
  const textSize = size === 'sm' ? 'text-2xl' : size === 'lg' ? 'text-4xl' : 'text-3xl'

  // Dark variant: dark forest + sage (matches the PDF logo on light backgrounds)
  // Light variant: white + mint (for dark sidebar backgrounds)
  const grantColor   = variant === 'light' ? '#ffffff'   : '#2d5a3d'
  const trackerColor = variant === 'light' ? '#a8d5b5'   : '#7aaa6d'

  return (
    <span className={`font-display font-bold tracking-tight leading-none ${textSize}`}>
      <span style={{ color: grantColor }}>Grant</span><span style={{ color: trackerColor }}>Tracker</span>
    </span>
  )
}
