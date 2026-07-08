// Shared design grammar for the Companion surfaces (briefing + plan redesign).
// One hero number per page; 11px uppercase section labels; 12.5-13px body;
// formula captions live behind an info affordance, not as permanent furniture;
// at most two lime accents per page (the single top card + the ask bar), which
// the pages enforce structurally (only one card gets accent=primary).
// House copy: sentence case, no em dashes, British English.

import React from 'react'

export const grotesk = { fontFamily: 'var(--font-space-grotesk), Space Grotesk, sans-serif' }
export const gbp = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`
export const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return null
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export const COLOR = {
  ink: '#2C2C2A', mid: '#5F5E5A', faint: '#8A8986',
  hair: '#E9E6DD', lime: '#8ECB3C', forest: '#173404', sage: '#3B6D11',
  secured: '#639922', weighted: '#C0DD97', cream: '#F5F1E8', pale: '#F1F7E4',
  amberBg: '#FAEEDA', amberInk: '#854F0B',
}

/** The page's single hero number: 28-30px, medium weight. */
export function HeroNumber({ children }: { children: React.ReactNode }) {
  return <div className="mt-1" style={{ ...grotesk, fontSize: 29, fontWeight: 500, lineHeight: 1.05, color: COLOR.ink }}>{children}</div>
}

/** 11px uppercase section label with letter-spacing. */
export function SectionLabel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`text-[11px] uppercase ${className}`} style={{ letterSpacing: '0.08em', color: COLOR.faint }}>
      {children}
    </div>
  )
}

/** Provenance on demand: a small info affordance carrying a caption (e.g. the
 *  weighted-pipeline formula), so the formula is off the page surface. */
export function InfoDot({ caption }: { caption: string }) {
  return (
    <span
      title={caption}
      aria-label={caption}
      role="img"
      className="inline-flex items-center justify-center align-middle cursor-help select-none"
      style={{ width: 14, height: 14, borderRadius: 999, border: `1px solid ${COLOR.faint}`, color: COLOR.faint, fontSize: 9, lineHeight: 1 }}
    >
      i
    </span>
  )
}

/** Amber pill for states that need user action (amounts not set, awaiting
 *  confirm). Warnings are NOT amber — they are quiet tertiary text. */
export function AmberPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block text-[11px] px-2 py-0.5" style={{ background: COLOR.amberBg, color: COLOR.amberInk, borderRadius: 999 }}>
      {children}
    </span>
  )
}
