// Builder UI tokens — the Grant Tracker design system palette + fonts,
// shared across builder surfaces so every screen reads from one place.

export const T = {
  lime:          '#8ECB3C',
  greenDeep:     '#173404',
  greenMid:      '#639922',
  sage:          '#3B6D11',
  pageBg:        '#FAFAF7',
  cream:         '#F5F1E8',
  paleGreen:     '#F1F7E4',
  paleGreen2:    '#EAF3DE',
  white:         '#FFFFFF',
  textPrimary:   '#2C2C2A',
  textSecondary: '#5F5E5A',
  textTertiary:  '#8A8986',
  border:        'rgba(23, 52, 4, 0.08)',
  borderStrong:  'rgba(23, 52, 4, 0.16)',
  greenBg:       '#E8F2D8',
  greenText:     '#3F6018',
  coral:         '#D85A30',
  coralBg:       '#FAECE7',
  coralText:     '#993C1D',
  amber:         '#BA7517',   // mid amber (spec palette) — score ring 5-7 band
  amberBg:       '#FAEEDA',
  amberText:     '#854F0B',
  editorBg:      '#FDFDFB',   // answer editor surface
  softGreen:     '#FBFDF7',   // guide/rail tinted background
}

export const UI   = 'var(--font-space-grotesk)'
export const BODY = 'var(--font-dm-sans)'

export function inputStyle(): React.CSSProperties {
  return {
    fontFamily: BODY, fontSize: 14, color: T.textPrimary,
    width: '100%', padding: '9px 12px', borderRadius: 8,
    border: `1px solid ${T.borderStrong}`, background: T.white, outline: 'none',
  }
}

/** Primary CTA — lime fill (genuinely primary actions only). */
export function primaryBtn(disabled = false): React.CSSProperties {
  return {
    fontFamily: UI, fontWeight: 600, fontSize: 14, color: T.greenDeep,
    background: T.lime, border: 'none', padding: '10px 20px', borderRadius: 8,
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
  }
}

/**
 * Deep fill — the band C primary.
 *
 * Separate from primaryBtn() rather than replacing it: that one is lime and is
 * shared with the applications pages and two admin surfaces, where the colour
 * cleanup has not been done. Swapping it here would recolour all of them at
 * once, including admin, whose rebuild is deliberately parked.
 */
export function deepBtn(disabled = false): React.CSSProperties {
  return {
    fontFamily: UI, fontWeight: 600, fontSize: 13.5, color: '#F6F1E7',
    background: '#1D3C3E', border: 'none', padding: '11px 20px', borderRadius: 999,
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
  }
}

/** Forest fill — utility / navigation (Continue, Done). */
export function forestBtn(disabled = false): React.CSSProperties {
  return {
    fontFamily: UI, fontWeight: 600, fontSize: 14, color: '#F1F7E4',
    background: T.greenDeep, border: 'none', padding: '10px 20px', borderRadius: 8,
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
  }
}

/** Ghost/text — lowest-priority supporting actions. */
export function ghostBtn(): React.CSSProperties {
  return {
    fontFamily: UI, fontWeight: 500, fontSize: 13.5, color: T.textSecondary,
    background: 'transparent', border: 'none', padding: '10px 12px', cursor: 'pointer',
  }
}
