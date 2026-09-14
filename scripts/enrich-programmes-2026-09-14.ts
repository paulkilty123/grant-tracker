// Programme-specific brief fields for every live programme row.
//
// The funder brief asks grant-shaped questions, so an accelerator comes back as
// "a free place, no cash award" and nothing else. This reads each programme's
// page once and asks the seven questions that matter for a programme, then ADDS
// the answers to funder_brief as new keys. It never overwrites an existing key
// and it does not go through the merger's trust ladder: nothing a human wrote
// is touched, only keys that did not exist are added, and the run is stamped
// under funder_brief._programme_enriched.
//
// Paul's yes, 14 September 2026: 23 live programme rows, one page read each,
// on the local key. Fresh read, because no stored evidence answers these.
//
//   npx tsx --env-file=.env.local scripts/enrich-programmes-2026-09-14.ts [--apply] [--only <id>]
import Anthropic from '@anthropic-ai/sdk'
import { getAdminDb } from '../src/lib/admin/admin-db'
import { htmlToText } from '../src/lib/page-text'
import { excerptWithMeta } from '../src/lib/page-excerpt'

const APPLY = process.argv.includes('--apply')
const ONLY = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null
const MODEL = 'claude-haiku-4-5-20251001'
const RUN = 'ai_enrich:programme:v1:2026-09-14'

export const PROGRAMME_KEYS = [
  'programme_offer',       // what you get: content, mentoring, workspace, network
  'time_commitment',       // hours a week, live or self paced, how many weeks
  'cost',                  // free, fee, equity, or not stated
  'stage_fit',             // idea, pre-revenue, trading, scaling
  'cohort_and_selection',  // places available and how they choose
  'delivered_by',          // who runs it and any partner behind the brand
  'alumni_outcomes',       // what past cohorts got, named alumni, follow-on
  'strong_application',    // added 14 Sept evening: the public page's tile needs it and the grant enricher rarely fills it for programmes
] as const

async function fetchText(url: string): Promise<string> {
  const direct = async () => {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(12000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-GB,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate',
      },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return htmlToText(await res.text())
  }
  const proxy = async () => {
    const base = process.env.READER_PROXY_URL
    if (!base) throw new Error('no reader proxy')
    const res = await fetch(`${base.replace(/\/$/, '')}/${url}`, {
      signal: AbortSignal.timeout(30000),
      headers: { Accept: 'text/plain', ...(process.env.READER_PROXY_KEY ? { Authorization: `Bearer ${process.env.READER_PROXY_KEY}` } : {}) },
    })
    if (!res.ok) throw new Error(`proxy HTTP ${res.status}`)
    return (await res.text()).replace(/\s{2,}/g, ' ').trim()
  }
  try {
    const t = await direct()
    if (t.trim().length >= 400) return t
    throw new Error(`thin page (${t.trim().length} chars)`)
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e)
    try { return await proxy() } catch (e2) { throw new Error(`${why}; ${e2 instanceof Error ? e2.message : String(e2)}`) }
  }
}

function prompt(title: string, funder: string, url: string, page: string): string {
  return `You are reading a UK support programme's own web page for a fundraiser. Answer ONLY from the page text. If the page does not say, use null. Never invent. British English, plain words, no dashes, two or three sentences per field at most.

Programme: ${title}
Run by: ${funder}
Page: ${url}

Return JSON with exactly these keys, each a string or null:
- programme_offer: what a participant actually gets. Content, sessions, mentoring, a named advisor, workspace, introductions, network, tools. Specific, not the marketing line.
- time_commitment: how long it runs and how much time a week, and whether sessions are live or self paced.
- cost: whether it is free, what it costs, or whether the programme takes equity or a share of anything. If the page says free, say "Free." If it is silent, null.
- stage_fit: the stage of organisation it is for: idea, pre-revenue, trading, established, scaling. Quote any income, age or team-size thresholds.
- cohort_and_selection: how many places, how they choose, and any interview or pitch stage.
- delivered_by: who runs it day to day and any partner or funder behind it, if named.
- alumni_outcomes: what past participants got or went on to, any named alumni, follow-on funding or awards mentioned.
- strong_application: what the page says a strong application looks like: the qualities, evidence or attitude they say they select for. Only what the page states.
Also return "_citations": an object with the same keys, each the exact short sentence from the page that supports the answer, or null.

PAGE TEXT:
${page}`
}

async function main() {
  const db = getAdminDb()
  const anthropic = new Anthropic()
  let q = db.from('scraped_grants').select('id, title, funder, apply_url, funder_brief').eq('funding_type', 'programme').eq('is_active', true).eq('pipeline_state', 'published').order('title')
  if (ONLY) q = q.eq('id', ONLY)
  const { data: rows, error } = await q
  if (error) throw error
  console.log(`${rows?.length ?? 0} live programme rows${APPLY ? ', APPLYING' : ', dry run'}`)

  let inTok = 0, outTok = 0, filled = 0, skipped = 0, failed = 0
  for (const r of rows ?? []) {
    const brief = (r.funder_brief ?? {}) as Record<string, unknown>
    const missing = PROGRAMME_KEYS.filter(k => typeof brief[k] !== 'string' || !(brief[k] as string).trim())
    if (missing.length === 0) { console.log(`= ${r.title}: already complete`); skipped++; continue }
    if (!r.apply_url) { console.log(`! ${r.title}: no url`); failed++; continue }

    let page: string
    try { page = excerptWithMeta(await fetchText(r.apply_url)).text }
    catch (e) { console.log(`! ${r.title}: fetch failed: ${e instanceof Error ? e.message : e}`); failed++; continue }

    let answers: Record<string, unknown>
    try {
      const msg = await anthropic.messages.create({ model: MODEL, max_tokens: 2048, messages: [{ role: 'user', content: prompt(r.title, r.funder ?? '', r.apply_url, page) }] })
      inTok += msg.usage.input_tokens; outTok += msg.usage.output_tokens
      const text = msg.content[0].type === 'text' ? msg.content[0].text : ''
      const m = text.match(/\{[\s\S]*\}/)
      if (!m) throw new Error(`no JSON (stop ${msg.stop_reason})`)
      answers = JSON.parse(m[0])
    } catch (e) { console.log(`! ${r.title}: model: ${e instanceof Error ? e.message : e}`); failed++; continue }

    const add: Record<string, unknown> = {}
    const cits = (answers._citations && typeof answers._citations === 'object' ? answers._citations : {}) as Record<string, unknown>
    const newCits: Record<string, unknown> = {}
    for (const k of missing) {
      const v = answers[k]
      if (typeof v === 'string' && v.trim() && v.trim().toLowerCase() !== 'null' && !/^the page does not/i.test(v.trim())) {
        add[k] = v.trim()
        if (typeof cits[k] === 'string' && (cits[k] as string).trim()) newCits[k] = { snippet: (cits[k] as string).trim(), source_url: r.apply_url, by: RUN }
      }
    }
    const got = Object.keys(add)
    console.log(`+ ${r.title}: ${got.length}/${missing.length} (${got.join(', ') || 'nothing the page states'})`)
    for (const k of got) console.log(`    ${k}: ${String(add[k]).slice(0, 110)}`)
    if (got.length) filled++
    if (APPLY && got.length) {
      const existingCits = (brief._citations && typeof brief._citations === 'object' ? brief._citations : {}) as Record<string, unknown>
      const merged = { ...brief, ...add, _citations: { ...existingCits, ...newCits }, _programme_enriched: { by: RUN, at: new Date().toISOString(), keys: got } }
      const { error: uErr } = await db.from('scraped_grants').update({ funder_brief: merged }).eq('id', r.id)
      if (uErr) { console.log(`   WRITE FAILED ${uErr.message}`); failed++ }
    }
  }
  console.log(`\nfilled ${filled}, already complete ${skipped}, failed ${failed}; tokens in ${inTok} out ${outTok}`)
}
main().catch(e => { console.error(e); process.exit(1) })
