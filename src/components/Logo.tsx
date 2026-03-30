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
  const textSize = size === 'sm' ? 'text-[18px]' : size === 'lg' ? 'text-[26px]' : 'text-[22px]'
  const iconSize = size === 'sm' ? 'w-6 h-6' : size === 'lg' ? 'w-9 h-9' : 'w-7 h-7'
  const color = variant === 'light' ? 'text-white' : 'text-[#3A3A4A]'

  return (
    <span className={`inline-flex items-center gap-1.5 ${color}`}>
      <RadioWaveIcon className={iconSize} />
      <span className={`font-serif font-normal tracking-tight leading-none ${textSize}`}>
        GrantTracker
      </span>
    </span>
  )
}
