import React from 'react'

interface LogoProps {
  /** 'light' = white text/icon (for dark backgrounds like sidebar)
   *  'dark'  = forest text/icon (for light backgrounds like auth pages, landing nav) */
  variant?: 'light' | 'dark'
  /** Overall size scale */
  size?: 'sm' | 'md' | 'lg'
  /** Show the tagline below the name */
  showTagline?: boolean
}

export default function Logo({ variant = 'dark', size = 'md', showTagline = false }: LogoProps) {
  const iconSize  = size === 'sm' ? 32 : size === 'lg' ? 48 : 40
  const textSize  = size === 'sm' ? 'text-base' : size === 'lg' ? 'text-2xl' : 'text-lg'
  const gSize     = size === 'sm' ? 11 : size === 'lg' ? 17 : 14

  const iconColor  = variant === 'light' ? '#a8d5b5' : '#2d5a3d'   // mint vs forest
  const glassColor = variant === 'light' ? 'rgba(168,213,181,0.18)' : 'rgba(45,90,61,0.10)'
  const textColor  = variant === 'light' ? 'text-white' : 'text-forest'
  const grantColor = variant === 'light' ? '#e8f4ec' : '#2d5a3d'
  const restColor  = variant === 'light' ? 'rgba(255,255,255,0.75)' : 'rgba(45,90,61,0.55)'

  return (
    <div className="inline-flex items-center gap-2.5">
      {/* Magnifying glass icon with G */}
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* Circle of magnifying glass */}
        <circle cx="17" cy="17" r="12" fill={glassColor} stroke={iconColor} strokeWidth="2.5" />

        {/* Handle */}
        <line
          x1="25.5" y1="25.5"
          x2="36"   y2="36"
          stroke={iconColor}
          strokeWidth="3"
          strokeLinecap="round"
        />

        {/* G letter centred in the circle */}
        <text
          x="17"
          y="17"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={gSize}
          fontWeight="800"
          fontFamily="'Plus Jakarta Sans', sans-serif"
          fill={iconColor}
          letterSpacing="-0.5"
        >
          G
        </text>
      </svg>

      {/* Wordmark: G is styled as part of icon, so we write RANT TRACKER */}
      <div className="leading-none">
        <div className={`font-display font-bold ${textSize} ${textColor} tracking-tight leading-none flex items-baseline`}>
          <span style={{ color: variant === 'light' ? '#a8d5b5' : '#2d5a3d' }}>G</span>
          <span style={{ color: restColor }}>RANT</span>
          <span className="mx-1.5" style={{ color: restColor, fontWeight: 300, fontSize: '0.7em' }}>·</span>
          <span style={{ color: grantColor }}>TRACKER</span>
        </div>
        {showTagline && (
          <p className={`text-[10px] font-light tracking-wider mt-0.5 ${variant === 'light' ? 'text-mint/70' : 'text-mid'}`}>
            Community Funding Hub
          </p>
        )}
      </div>
    </div>
  )
}
