// Builder UI tokens, shared across the Applications and Projects surfaces so
// every screen reads from one place.
//
// Band D, 2026-09-02: this file used to be a seventh palette. It carried the
// three retired colours (lime, mid green, the old grey) and the biggest single
// accessibility failure in the app: textTertiary at 3.50:1 on white, used 121
// times across 11 files. Two replacements fixed it without collapsing the
// three-level text hierarchy:
//   textTertiary #8A8986 -> #6C6B67  (5.33 white, 4.73 cream, 5.10 pageBg)
//   greenMid     #639922 -> gone; sage (#3B6D11, 6.21) in its place
// lime went with primaryBtn(): deep on lime passed (7.03) but lime is not in
// the palette, and the admin surfaces that justified keeping it never used it.

export const T = {
  greenDeep:     '#173404',
  sage:          '#3B6D11',
  pageBg:        '#FAFAF7',
  cream:         '#F5F1E8',
  paleGreen:     '#F1F7E4',
  paleGreen2:    '#EAF3DE',
  white:         '#FFFFFF',
  textPrimary:   '#2C2C2A',
  textSecondary: '#5F5E5A',
  textTertiary:  '#6C6B67',
  border:        'rgba(23, 52, 4, 0.08)',
  borderStrong:  'rgba(23, 52, 4, 0.16)',
  // The two places green survives: the tick that means done, and the chip
  // that means eligible or in progress. 5.58:1 as text on doneBg.
  done:          '#1B6B3D',
  doneBg:        '#E4F1EA',
  // Question-number badge ground (deep text on it, 13:1).
  mint:          '#EDF6F1',
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

/**
 * Deep fill, the one filled button. Was `primaryBtn()` (lime) beside this
 * until 2026-09-02; that had six call sites, all in Applications, and the
 * admin surfaces its comment said shared it never referenced it.
 */
export function deepBtn(disabled = false): React.CSSProperties {
  return {
    fontFamily: UI, fontWeight: 600, fontSize: 13.5, color: '#F6F1E7',
    background: '#1D3C3E', border: 'none', padding: '11px 20px', borderRadius: 999,
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
  }
}

/**
 * Outline, the same shape as deepBtn for the same action where only one row
 * may be filled (the project match list). Also the underlined-link colour:
 * links and headings are both deep, so the underline carries the affordance.
 */
export const DEEP = '#1D3C3E'
export function outlineBtn(): React.CSSProperties {
  return {
    fontFamily: UI, fontWeight: 600, fontSize: 13.5, color: DEEP,
    background: T.white, border: `1.5px solid ${DEEP}`, padding: '9.5px 18.5px', borderRadius: 999,
    cursor: 'pointer',
  }
}

/** Inline link: deep, underlined. */
export function linkStyle(): React.CSSProperties {
  return { color: DEEP, fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 2, cursor: 'pointer' }
}

/** Ghost/text — lowest-priority supporting actions. */
export function ghostBtn(): React.CSSProperties {
  return {
    fontFamily: UI, fontWeight: 500, fontSize: 13.5, color: T.textSecondary,
    background: 'transparent', border: 'none', padding: '10px 12px', cursor: 'pointer',
  }
}
