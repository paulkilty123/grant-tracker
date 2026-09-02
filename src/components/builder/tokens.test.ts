import { describe, it, expect } from 'vitest'
import { T, DEEP } from './tokens'

// Band D, 2026-09-02. textTertiary was #8A8986 at 3.50:1 on white, used 121
// times across 11 files; greenMid was #639922 at 3.44:1 and was the link and
// heading colour. These pin the replacements to the 4.5:1 text floor on every
// ground the builder pages paint.

function lum(hex: string): number {
  const c = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map(i => parseInt(c.slice(i, i + 2), 16) / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function contrast(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

const GROUNDS = { white: T.white, cream: T.cream, pageBg: T.pageBg, softGreen: T.softGreen, editorBg: T.editorBg }

describe('builder text tokens clear 4.5:1 on every ground they sit on', () => {
  for (const [name, ground] of Object.entries(GROUNDS)) {
    it(`textTertiary on ${name}`, () => expect(contrast(T.textTertiary, ground)).toBeGreaterThanOrEqual(4.5))
    it(`textSecondary on ${name}`, () => expect(contrast(T.textSecondary, ground)).toBeGreaterThanOrEqual(4.5))
    it(`sage on ${name}`, () => expect(contrast(T.sage, ground)).toBeGreaterThanOrEqual(4.5))
    it(`deep on ${name}`, () => expect(contrast(DEEP, ground)).toBeGreaterThanOrEqual(4.5))
  }
  it('the three text levels stay distinct', () => {
    expect(contrast(T.textPrimary, T.white)).toBeGreaterThan(contrast(T.textSecondary, T.white))
    expect(contrast(T.textSecondary, T.white)).toBeGreaterThan(contrast(T.textTertiary, T.white))
  })
  it('the done chip and the danger chip read as text', () => {
    expect(contrast(T.done, T.doneBg)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(T.coralText, T.coralBg)).toBeGreaterThanOrEqual(4.5)
  })
  it('the retired colours are gone from the file', () => {
    const values = Object.values(T)
    expect(values).not.toContain('#8A8986')
    expect(values).not.toContain('#639922')
    expect(values).not.toContain('#8ECB3C')
  })
})
