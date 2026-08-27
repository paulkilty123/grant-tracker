// Triage the "the page does not describe this fund" queue, without spending a
// penny on the model.
//
// The engine's verdict is an LLM judgement and it is right often enough to be
// worth keeping and wrong often enough that mass-withdrawing on it would be
// vandalism. So this asks the cheapest useful question first: IS THE FUND'S OWN
// NAME ON THE PAGE IT LINKS TO? A page carrying "Rural Skills & Conservation" in
// so many words is a page the model should have matched, and one that carries no
// trace of it needs a human.
//
// Distinctive tokens are the row's title minus the funder's name minus the words
// that carry no identity — the same rule describesADiscreteFund() uses, so the
// triage and the check agree about what "names a fund" means.
//
// READ ONLY. Fetches funder pages (direct, then the reader proxy) and writes a
// report. Deciding what to do with each row is the next step, not this one.
//
//   npx tsx --env-file=.env.local scripts/triage-wrong-fund-2026-08-27.ts

import { getAdminDb } from '../src/lib/admin/admin-db'
import { deriveReviewReasons, type ReviewRow } from '../src/lib/admin/review-reasons'
import { gateDecision } from '../src/lib/admin/publish-gate'

const COLS = [
  'id','external_id','title','funder','apply_url','funding_index_url','is_active','pipeline_state',
  'url_status','url_quality_score','amount_min','amount_max','deadline','is_rolling','next_open_date',
  'deadline_cycle','eligible_structures','impact_sectors','target_beneficiaries','niche_tags','funding_type',
  'funder_type','location_tag','is_local','grant_sources','funder_brief','field_provenance','raw_data',
  'needs_intervention_reason','field_evidence','last_seen_at','first_seen_at','source',
].join(', ')

const GENERIC = new Set([
  'grant','grants','fund','funds','funding','programme','programmes','program','scheme','schemes',
  'award','awards','application','applications','apply','trust','trusts','foundation','charity',
  'the','a','an','and','for','of','to','in','uk',
])

const tokens = (v: unknown) =>
  String(v ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean)

function distinctive(title: unknown, funder: unknown): string[] {
  const f = new Set(tokens(funder))
  return Array.from(new Set(tokens(title).filter(t => !f.has(t) && !GENERIC.has(t) && t.length > 2)))
}

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

async function readPage(url: string): Promise<{ text: string; via: string }> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': UA, Accept: 'text/html,*/*' } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const html = await res.text()
    if (html.length > 500) return { text: strip(html), via: 'direct' }
    throw new Error(`only ${html.length} chars`)
  } catch (err) {
    const base = process.env.READER_PROXY_URL
    if (!base) throw err
    const res = await fetch(`${base.replace(/\/$/, '')}/${url}`, {
      signal: AbortSignal.timeout(40000),
      headers: { Accept: 'text/plain', ...(process.env.READER_PROXY_KEY ? { Authorization: `Bearer ${process.env.READER_PROXY_KEY}` } : {}) },
    })
    if (!res.ok) throw new Error(`direct failed; proxy HTTP ${res.status}`)
    return { text: (await res.text()).toLowerCase(), via: 'proxy' }
  }
}

const strip = (html: string) =>
  html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ').toLowerCase()

async function main() {
  const db = getAdminDb()
  const rows: any[] = []
  for (let from = 0; from < 5000; from += 500) {
    const { data, error } = await db.from('scraped_grants').select(COLS)
      .eq('is_active', true).not('pipeline_state', 'in', '("rejected","archived")').order('id').range(from, from + 499)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
    if ((data ?? []).length < 500) break
  }

  const targets = rows.filter(r => {
    const g = gateDecision(r as ReviewRow)
    return g.outcome === 'attention' && g.blocking.some(b => b.code === 'page_describes_different_fund')
  })
  console.log(`live rows ${rows.length}; flagged "page does not describe this fund": ${targets.length}\n`)

  const out: any[] = []
  let done = 0
  const queue = [...targets]
  const workers = Array.from({ length: 6 }, async () => {
    while (queue.length) {
      const r = queue.shift()!
      const want = distinctive(r.title, r.funder)
      let hit = 0, via = '', err = ''
      try {
        const { text, via: v } = await readPage(r.apply_url)
        via = v
        hit = want.filter(t => text.includes(t)).length
      } catch (e) { err = (e as Error).message.slice(0, 60) }
      out.push({ id: r.id, title: r.title, funder: r.funder, url: r.apply_url, want, hit, via, err })
      done++
      if (done % 10 === 0) console.log(`  … ${done}/${targets.length}`)
    }
  })
  await Promise.all(workers)

  const ratio = (o: any) => (o.want.length ? o.hit / o.want.length : 0)
  const full    = out.filter(o => !o.err && o.want.length && ratio(o) === 1)
  const partial = out.filter(o => !o.err && o.want.length && ratio(o) > 0 && ratio(o) < 1)
  const none    = out.filter(o => !o.err && (o.want.length === 0 || ratio(o) === 0))
  const failed  = out.filter(o => o.err)

  console.log(`\nEVERY distinctive word of the title is on the page: ${full.length}`)
  console.log(`SOME of them:                                        ${partial.length}`)
  console.log(`NONE of them:                                        ${none.length}`)
  console.log(`page could not be read at all:                       ${failed.length}`)

  const show = (label: string, list: any[]) => {
    console.log(`\n── ${label} ──`)
    for (const o of list.sort((a, b) => String(a.funder).localeCompare(String(b.funder))))
      console.log(`  ${String(o.hit)}/${String(o.want.length)} ${String(o.title).slice(0, 46).padEnd(48)} ${String(o.funder).slice(0, 24).padEnd(26)} ${o.err || o.via}\n      ${o.url}`)
  }
  show('THE FUND IS NAMED ON THE PAGE — the check looks wrong', full)
  show('PARTIAL — needs a human read', partial)
  show('NOT ON THE PAGE — the check looks right', none)
  show('UNREADABLE', failed)
}

main().catch(e => { console.error(e); process.exit(1) })
