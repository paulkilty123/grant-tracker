import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The landing page's FAQPage structured data must say exactly what the page
 * says.
 *
 * Structured data is the one part of a page nobody looks at. Google reads it,
 * an answer engine quotes it, and a human never sees it, so an answer edited on
 * screen and left stale in the JSON-LD is invisible until it is being cited
 * back at a stranger. Worse than having no markup at all, because it is wrong
 * with authority.
 *
 * The landing page is static HTML in public/ with no build step, so nothing can
 * generate the block at deploy time. This test is the substitute: change an
 * answer and it fails until the JSON-LD is regenerated to match.
 *
 * It deliberately parses the file rather than importing a shared constant.
 * A constant would prove the two halves came from one source; only reading the
 * shipped bytes proves what is actually on the page.
 */

const HTML = readFileSync(
  join(process.cwd(), 'public', 'landing', 'index.html'),
  'utf8',
)

/** Strip tags and decode the few entities this page uses. */
function plain(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&rsquo;/g, '’')
    .replace(/&lsquo;/g, '‘')
    .replace(/&pound;/g, '£')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .trim()
}

/** The questions a visitor can actually see, excluding anything staged in a
 *  comment. Slicing at the staged block is the point: copy inside an HTML
 *  comment is not on the page and must not reach the structured data. */
function visibleFaqs(): { q: string; a: string }[] {
  const start = HTML.indexOf('<div class="faq-list"')
  expect(start).toBeGreaterThan(-1)
  const commentStart = HTML.indexOf('<!-- ═', start)
  const end = commentStart === -1 ? HTML.indexOf('</section>', start) : commentStart
  const block = HTML.slice(start, end)

  const out: { q: string; a: string }[] = []
  const re = /<summary>(.*?)<\/summary>\s*\n\s*<p>([\s\S]*?)<\/p>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(block)) !== null) out.push({ q: plain(m[1]), a: plain(m[2]) })
  return out
}

function jsonLd(): { mainEntity: { name: string; acceptedAnswer: { text: string } }[] } {
  const m = HTML.match(
    /<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/,
  )
  expect(m).not.toBeNull()
  return JSON.parse(m![1])
}

describe('landing FAQ structured data', () => {
  it('has FAQPage markup at all', () => {
    const ld = jsonLd() as unknown as { '@type': string }
    expect(ld['@type']).toBe('FAQPage')
  })

  it('covers every visible question, in order, with nothing extra', () => {
    const visible = visibleFaqs()
    expect(visible.length).toBe(11)
    expect(jsonLd().mainEntity.map(e => e.name)).toEqual(visible.map(v => v.q))
  })

  it('quotes each answer exactly as the page shows it', () => {
    const visible = visibleFaqs()
    jsonLd().mainEntity.forEach((entry, i) => {
      expect(entry.acceptedAnswer.text).toBe(visible[i].a)
    })
  })

  it('leaves the staged launch-day answers out of both', () => {
    // They quote prices that are not announced. They live in a comment, so they
    // are on neither the page nor in the markup, and this fails if either
    // changes.
    const visible = visibleFaqs().map(v => v.a).join(' ')
    const marked  = jsonLd().mainEntity.map(e => e.acceptedAnswer.text).join(' ')
    for (const leak of ['£15', '£25', '£45', 'seven-day free trial']) {
      expect(visible).not.toContain(leak)
      expect(marked).not.toContain(leak)
    }
  })

  it('does not carry the copy this change replaced', () => {
    expect(HTML).not.toContain('Shoots itself have')
    expect(HTML).not.toContain('grants, foundation grants')
  })
})
