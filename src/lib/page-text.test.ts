import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { htmlToText } from './page-text'

const fixture = (name: string) =>
  readFileSync(join(__dirname, '__fixtures__', name), 'utf8')

/** The strip every reader in this repo used before page-text.ts existed. */
function plainStrip(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

describe('htmlToText — copy held in attributes', () => {
  const html = fixture('bernardsunley-how-to-apply.html')

  // The probe has to be false first, or it proves nothing: assert the OLD
  // reader really did miss these before asserting the new one finds them.
  it('the plain strip misses the whole page', () => {
    const before = plainStrip(html)
    expect(before.length).toBeLessThan(1000)
    expect(before).not.toContain('rolling programme')
  })

  const text = htmlToText(html)

  it.each([
    ['the rolling programme',   'rolling programme with no deadlines'],
    ['the trustee meetings',    'three Trustees’ meetings a year in March, July and November'],
    ['the eligibility gate',    'eligibility check which has 12 questions'],
    ['part funding only',       'We do not fully fund projects'],
    ['the reapply rule',        'apply again 12 months after your original application'],
    ['an exclusion',            'Mainstream schools, colleges or universities'],
  ])('recovers %s', (_label, phrase) => {
    expect(text).toContain(phrase)
  })
})

describe('htmlToText — figures survive the prose filter', () => {
  const text = htmlToText(fixture('bernardsunley-our-grant-giving.html'))

  // These are three and four words long. An earlier filter required 20+
  // characters and lost every one of them.
  it.each([
    ['£25,000 and above'],
    ['Up to £20,000'],
    ['£5,000 and under'],
    ['Project costs between £10,000 and £5 million'],
    ['annual income of under £10 million'],
  ])('keeps %s', (phrase) => {
    expect(text).toContain(phrase)
  })
})

describe('htmlToText — framework noise stays out', () => {
  // A Wix page carries thousands of runtime module names in its hydration
  // payload. Recovering them inflates the character count, which is why the
  // first version of this module looked like it worked on this very page:
  // +2,547 characters, not one of them from the funder.
  const html = fixture('johnjames-wix-home.html')
  const text = htmlToText(html)

  it.each([
    'thunderbolt', 'componentsRegistry', 'siteMembersWixCodeSdk',
    'scrollRestoration', 'windowMessageRegistrar', 'dsgnsys',
  ])('does not leak %s', (token) => {
    expect(text).not.toContain(token)
  })

  it('recovers a bounded amount, not a second copy of the framework', () => {
    // Not zero: this page's CMS payload does hold a real sentence about who the
    // foundation funds. The property that matters is that recovery stays small
    // and stays prose. Before the filter was tightened this same page gained
    // 2,547 characters of module names and the row looked repaired.
    const recovered = text.slice(text.indexOf('--- Text held in the page markup'))
    expect(recovered.length).toBeLessThan(1200)
    expect(recovered).toContain('supports charitable organisations working for the benefit of the people of Bristol')
  })
})

describe('htmlToText — pages that already read cleanly', () => {
  it('leaves ordinary markup alone', () => {
    const html = `<html><body><h1>Our fund</h1>
      <p>Grants of up to £5,000 for community groups in Leeds.</p>
      <p>Applications close on 30 September.</p></body></html>`
    expect(htmlToText(html)).toBe(plainStrip(html))
  })

  it('does not duplicate copy that is both visible and in the payload', () => {
    // Long enough to clear the 120-character attribute threshold, or the
    // payload is never harvested and this asserts nothing.
    const shared = 'Grants of up to £5,000 for constituted community groups working '
      + 'in the Leeds district, for projects lasting no more than twelve months.'
    expect(shared.length).toBeGreaterThan(120)
    const html = `<div data-card='{"body":"${shared}"}'><p>${shared}</p></div>`
    const text = htmlToText(html)
    expect(text.split(shared).length - 1).toBe(1)
  })
})

describe('htmlToText — translated UI boilerplate', () => {
  // The EU research portal ships 24 languages of chrome in its page data.
  // Each string is grammatical and three words long, so only a language gate
  // keeps it out.
  it('keeps the English and drops the rest', () => {
    const html = `<div data-x='{"a":"Applications close on 30 September each year.",`
      + `"b":"Esta página no está disponible en español",`
      + `"c":"Cette page n’est pas disponible en français.",`
      + `"d":"Din il-paġna mhix disponibbli bil-Malti"}'></div>`
    const text = htmlToText(html)
    expect(text).toContain('Applications close on 30 September')
    expect(text).not.toContain('española')
    expect(text).not.toContain('disponible en français')
    expect(text).not.toContain('bil-Malti')
  })
})

describe('htmlToText — recovery budget', () => {
  const hidden = (n: number) => Array.from({ length: n }, (_, i) =>
    `Recovered sentence number ${i} about the fund and how to apply for it.`)

  it('lets a page that reads as empty be filled from its markup', () => {
    const html = `<p>Contact us</p><div data-x='${JSON.stringify({ v: hidden(40) })}'></div>`
    const text = htmlToText(html)
    expect(text.length).toBeGreaterThan(2000)
  })

  it('holds recovery to a quarter of a page that already reads fine', () => {
    const visible = 'The fund supports community projects. '.repeat(60)  // ~2,200 chars
    const html = `<p>${visible}</p><div data-x='${JSON.stringify({ v: hidden(80) })}'></div>`
    const text = htmlToText(html)
    const recovered = text.length - text.indexOf('--- Text held in the page markup')
    expect(recovered).toBeLessThan(visible.length * 0.35)
  })
})
