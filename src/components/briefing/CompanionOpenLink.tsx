'use client'

// Opens the Companion drawer from anywhere on a companion-surface page (the
// plan page's "Adjust your goal" — spec §5: the edit goal link opens the same
// conversation). CompanionDrawer listens for the event; server components stay
// server-rendered and mount this tiny client button instead.

import React from 'react'

export const COMPANION_OPEN_EVENT = 'gt:companion-open'

export default function CompanionOpenLink({ children, className, style }: {
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <button
      type="button"
      className={className}
      style={style}
      onClick={() => window.dispatchEvent(new Event(COMPANION_OPEN_EVENT))}
    >
      {children}
    </button>
  )
}
