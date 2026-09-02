// Why the JJ Charitable Trust timeline never reaches the model, 2026-09-02.
//
// The portal page states three cut-off dates under "Timeline". The brief says
// the source states no application windows. This reproduces the read the
// enrich route makes — htmlToText, then excerptWithMeta — on a saved copy of
// the page, and reports whether the timeline survives the excerpt and what
// the relevance scorer gave its window. No network, no model.
//
//   npx tsx scripts/probe-jj-excerpt-2026-09-02.ts <path-to-saved-html>

import { readFileSync } from 'node:fs'
import { htmlToText } from '../src/lib/page-text'
import { excerptWithMeta, RELEVANCE, PAGE_CAP } from '../src/lib/page-excerpt'

const path = process.argv[2]
if (!path) throw new Error('pass the saved html path')
const html = readFileSync(path, 'utf8')
const text = htmlToText(html)
const ex = excerptWithMeta(text)

const NEEDLE = 'Spring grant round'
const at = text.indexOf(NEEDLE)
console.log(`stripped length ${text.length}, cap ${PAGE_CAP}, capped ${ex.capped}`)
console.log(`"${NEEDLE}" at ${at} in stripped text; in excerpt: ${ex.text.includes(NEEDLE)}`)
if (at >= 0) {
  const HEAD = 3000, WINDOW = 1500
  const rel = at - HEAD
  const wStart = Math.floor(rel / WINDOW) * WINDOW
  const chunk = text.slice(HEAD + wStart, HEAD + wStart + WINDOW)
  const hits = chunk.match(RELEVANCE) ?? []
  console.log(`timeline window starts at ${HEAD + wStart}, relevance score ${hits.length}: ${JSON.stringify(hits)}`)
  console.log('window text:', JSON.stringify(chunk.slice(0, 600)))
}
