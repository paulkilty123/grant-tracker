import React from 'react'
import LogoMark from '@/components/icons/LogoMark'

interface LogoProps {
  /** 'light' = for dark backgrounds (sidebar, auth dark panel)
   *  'dark'  = for light backgrounds (nav, footer, auth mobile) */
  variant?: 'light' | 'dark'
  /** Overall size scale */
  size?: 'sm' | 'md' | 'lg'
}

export default function Logo({ variant = 'dark', size = 'md' }: LogoProps) {
  const textSize = size === 'sm' ? 'text-[18px]' : size === 'lg' ? 'text-[26px]' : 'text-[22px]'
  const iconSize = size === 'sm' ? 22 : size === 'lg' ? 32 : 28
  const color = variant === 'light' ? 'text-[#F5F1E8]' : 'text-[#2C2C2A]'
  const markVariant = variant === 'light' ? 'onInk' : 'default'

  return (
    <span className={`inline-flex items-center gap-1.5 ${color}`}>
      <LogoMark size={iconSize} variant={markVariant} />
      <span
        className={`font-bold tracking-tight leading-none ${textSize}`}
        style={{ fontFamily: 'var(--font-space-grotesk), Space Grotesk, sans-serif' }}
      >
        GrantTracker
      </span>
    </span>
  )
}
