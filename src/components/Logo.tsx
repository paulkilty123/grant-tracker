import React from 'react'
import RadioWaveIcon from '@/components/icons/RadioWaveIcon'

interface LogoProps {
  /** 'light' = for dark backgrounds (sidebar, auth dark panel)
   *  'dark'  = for light backgrounds (nav, footer, auth mobile) */
  variant?: 'light' | 'dark'
  /** Overall size scale */
  size?: 'sm' | 'md' | 'lg'
}

export default function Logo({ variant = 'dark', size = 'md' }: LogoProps) {
  const textSize = size === 'sm' ? 'text-[24px]' : size === 'lg' ? 'text-[34px]' : 'text-[28px]'
  const iconSize = size === 'sm' ? 'w-8 h-8' : size === 'lg' ? 'w-11 h-11' : 'w-9 h-9'
  const color = variant === 'light' ? 'text-white' : 'text-charcoal'

  return (
    <span className={`inline-flex items-center gap-1.5 ${color}`}>
      <RadioWaveIcon className={iconSize} />
      <span className={`font-serif font-normal tracking-tight leading-none ${textSize}`}>
        GrantTracker
      </span>
    </span>
  )
}
