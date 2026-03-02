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

  // Light variant: white Grant + mint Tracker (on dark/forest backgrounds)
  // Dark variant: forest Grant + charcoal Tracker (on light backgrounds)
  const grantColor   = variant === 'light' ? '#ffffff' : '#1f5c52'
  const trackerColor = variant === 'light' ? '#b8deda' : '#1a2e2b'

  return (
    <span className={`font-serif tracking-tight leading-none ${textSize}`}>
      <span style={{ color: grantColor }}>Grant</span>
      <span style={{ color: trackerColor }}>Tracker</span>
    </span>
  )
}
