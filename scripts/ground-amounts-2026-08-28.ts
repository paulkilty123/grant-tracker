// Nine of the eighteen `amount_ungrounded` rows, cleared against the funder's
// own page.
//
// The guard compares the figures in OUR write-up against the quote and
// description WE hold. It never looks at the page, which the comment in
// review-reasons.ts says plainly. So a figure the funder prints in black and
// white can sit flagged for months because our stored snippet happened not to
// contain it.
//
// This checks each flagged figure against the page the row links to, in every
// form a funder might print it — 30000, 30,000, 30k. Where every figure is
// there, the write-up is grounded in something better than our own snippet and
// the marker goes, with the page recorded as what grounded it.
//
// The other nine keep the flag. Their figures are genuinely absent from the
// page: Gannochy's £5m, St Giles' £53,737, Community Action Fund's £60,000. Some
// will be true and sourced elsewhere and some will be invented, and telling
// those apart means reading the prose, which is a judgement per row rather than
// a rule.
//
//   npx tsx --env-file=.env.local scripts/ground-amounts-2026-08-28.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
import { type ReviewRow } from '../src/lib/admin/review-reasons'
import { gateDecision } from '../src/lib/admin/publish-gate'

const APPLY = process.argv.includes('--apply')
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const COLS = ['id','external_id','title','funder','apply_url','funding_index_url','is_active','pipeline_state','url_status','url_quality_score','amount_min','amount_max','deadline','is_rolling','next_open_date','deadline_cycle','eligible_structures','impact_sectors','target_beneficiaries','niche_tags','funding_type','funder_type','location_tag','is_local','grant_sources','funder_brief','field_provenance','raw_data','needs_intervention_reason','field_evidence','last_seen_at','first_seen_at','source'].join(', ')

const clean = (h: string) => h.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ')
  .replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&#163;/g,'£').replace(/\s+/g,' ')

async function read(url: string): Promise<string> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': UA } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const h = await res.text()
    if (h.length < 500) throw new Error('short')
    return clean(h)
  } catch {
    const base = process.env.READER_PROXY_URL!
    const res = await fetch(`${base.replace(/\/$/, '')}/${url}`, { signal: AbortSignal.timeout(40000),
      headers: { Accept: 'text/plain', ...(process.env.READER_PROXY_KEY ? { Authorization: `Bearer ${process.env.READER_PROXY_KEY}` } : {}) } })
    if (!res.ok) throw new Error(`proxy ${res.status}`)
    return (await res.text()).replace(/\s+/g, ' ')
  }
}

/** Every way a funder might print the same number. */
function forms(n: number): string[] {
  const out = [String(n), n.toLocaleString('en-GB')]
  if (n >= 1000 && n % 1000 === 0) out.push(`${n / 1000}k`, `${n / 1000},000`)
  if (n >= 1e6 && n % 1e6 === 0) out.push(`${n / 1e6}m`, `${n / 1e6} million`)
  return out
}

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
  const targets = rows.filter(r =>
    gateDecision(r as ReviewRow).blocking.some(b => b.code === 'amount_ungrounded'))

  console.log(`${targets.length} flagged${APPLY ? '' : ' (DRY RUN)'}\n`)
  let grounded = 0, left = 0

  for (const r of targets) {
    const brief = { ...((r.funder_brief ?? {}) as Record<string, unknown>) }
    const figs = (brief._ungrounded_amounts as unknown[] ?? []).filter((x): x is number => typeof x === 'number')
    if (!figs.length) continue
    let text = ''
    try { text = (await read(r.apply_url)).toLowerCase() } catch (e) {
      console.log(`unreadable ${String(r.title).slice(0, 44)}: ${(e as Error).message.slice(0, 40)}`)
      left++
      continue
    }
    const missing = figs.filter(f => !forms(f).some(s => text.includes(s.toLowerCase())))
    if (missing.length) {
      console.log(`left       ${String(r.title).slice(0, 44).padEnd(46)} missing ${missing.map(f => '£' + f.toLocaleString('en-GB')).join(', ')}`)
      left++
      continue
    }

    delete brief._ungrounded_amounts
    if (!APPLY) { console.log(`[dry] ground ${String(r.title).slice(0, 44)}`); grounded++; continue }
    const res = await mergeGrantUpdate({
      id: r.id, db,
      fields: { funder_brief: brief },
      source: 'user_verified:grounded-amounts-2026-08-28',
      citations: { funder_brief: {
        snippet: `Every figure the guard flagged appears on ${r.apply_url}, checked 2026-08-28: `
               + figs.map(f => '£' + f.toLocaleString('en-GB')).join(', ')
               + '. The guard compares our write-up against our own stored quote and never reads the page.',
        confidence: 'high',
      } },
    })
    console.log(`grounded   ${String(r.title).slice(0, 44).padEnd(46)} applied [${res.applied.join(', ') || 'nothing'}]`)
    grounded++
  }

  console.log(`\ngrounded ${grounded}   left flagged ${left}`)
}

main().catch(e => { console.error(e); process.exit(1) })
