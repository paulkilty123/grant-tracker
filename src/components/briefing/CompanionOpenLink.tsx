'use client'

// Opens the Companion drawer from anywhere on a companion-surface page, with an
// optional prefilled prompt. Used by the plan page's "Adjust your goal", the
// briefing's ask-bar suggestion chips, and the next-move action buttons (drawer
// mode). CompanionDrawer listens for the event; server components stay
// server-rendered and mount this tiny client button or call openCompanion().

import React from 'react'

export const COMPANION_OPEN_EVENT = 'gt:companion-open'

/** Open the drawer, optionally prefilling the input with a prompt (the user
 *  reviews and sends — never auto-sent). */
export function openCompanion(prompt?: string) {
  window.dispatchEvent(new CustomEvent(COMPANION_OPEN_EVENT, { detail: { prompt: prompt ?? null } }))
}

export default function CompanionOpenLink({ children, className, style, prompt }: {
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
  prompt?: string
}) {
  return (
    <button type="button" className={className} style={style} onClick={() => openCompanion(prompt)}>
      {children}
    </button>
  )
}
