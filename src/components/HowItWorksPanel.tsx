import Link from 'next/link'
import { HelpCircle, Plus } from 'lucide-react'
import { UI, BODY, T } from '@/components/builder/tokens'

/**
 * The four-step "How it works" panel, shared by Projects and Applications.
 *
 * Shared rather than copied because it already existed twice, identically, in
 * two files — and the moment one of them was restyled they would have become
 * two patterns for one idea.
 *
 * THE CIRCLES ARE 44px WITH A 19px BOLD NUMERAL, and that is a contrast
 * requirement rather than a styling preference. At 13px the numeral counts as
 * normal text and needs 4.5:1, which none of these four hues can give: --deep
 * tops out at 3.70 on terracotta and 4.37 on teal. At 19px bold it qualifies
 * as WCAG large text, the floor drops to 3:1, and --deep clears all four
 * (3.70 / 4.37 / 7.71 / 6.41).
 *
 * Do NOT reach for the homepage's own numeral colour: it uses cream on
 * terracotta and teal, which measures 2.85 and 2.41 — under even the
 * large-text floor.
 */
export const HOW_HUES = ['#D67558', '#4EAAB4', '#EBCE78', '#9BCA9D'] as const

export interface HowStep { title: string; body: string }

export function HowItWorksPanel({
  steps,
  cta,
}: {
  steps: readonly HowStep[]
  /** Optional primary action below the steps. */
  cta?: { href: string; label: string }
}) {
  return (
    <div style={{ background: T.white, border: '1px solid rgba(29,60,62,0.10)', borderRadius: 16, padding: '20px 22px 22px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 18 }}>
        <HelpCircle size={18} color="#1D3C3E" />
        <span style={{ fontFamily: UI, fontWeight: 600, fontSize: 16, color: '#1D3C3E', letterSpacing: '-0.012em' }}>How it works</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 26 }}>
        {steps.map((s, i) => (
          <div key={s.title} style={{ flex: '1 1 190px', minWidth: 175 }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 13 }}>
              <span style={{
                fontFamily: UI, fontWeight: 700, fontSize: 19, color: '#1D3C3E',
                background: HOW_HUES[i % HOW_HUES.length], letterSpacing: '-0.01em',
                width: 44, height: 44, borderRadius: 999, display: 'inline-flex',
                alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                {String(i + 1).padStart(2, '0')}
              </span>
              {i < steps.length - 1 && (
                <span style={{ flex: 1, height: 1.5, background: 'rgba(29,60,62,0.14)', marginLeft: 10, borderRadius: 2 }} />
              )}
            </div>
            <p style={{ fontFamily: UI, fontWeight: 600, fontSize: 14.5, color: '#1D3C3E', margin: '0 0 6px', letterSpacing: '-0.01em' }}>{s.title}</p>
            <p style={{ fontFamily: BODY, fontSize: 13.2, color: '#5F5E5A', margin: 0, lineHeight: 1.55 }}>{s.body}</p>
          </div>
        ))}
      </div>
      {cta && (
        <Link href={cta.href} style={{
          fontFamily: UI, fontWeight: 600, fontSize: 13.5, color: '#F6F1E7', background: '#1D3C3E',
          padding: '11px 20px', borderRadius: 999, textDecoration: 'none', display: 'inline-flex',
          alignItems: 'center', gap: 6, marginTop: 20,
        }}>
          <Plus size={14} /> {cta.label}
        </Link>
      )}
    </div>
  )
}

/**
 * The disclosure control that opens a panel like this one, or the principles
 * list. A deep label over a ghost rule, so it reads as a control rather than
 * as a coloured link — green is reserved for status.
 */
export function DisclosureControl({
  open, onClick, icon, children,
}: {
  open: boolean
  onClick: () => void
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      aria-expanded={open}
      style={{
        fontFamily: UI, fontWeight: 600, fontSize: 13.2, color: '#1D3C3E',
        background: 'transparent', border: 'none', cursor: 'pointer', padding: '0 0 2px',
        display: 'inline-flex', alignItems: 'center', gap: 8,
        borderBottom: '1.5px solid rgba(29,60,62,0.24)',
      }}
    >
      {icon}
      {children}
      <span style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms ease', display: 'inline-flex' }}>⌄</span>
    </button>
  )
}
