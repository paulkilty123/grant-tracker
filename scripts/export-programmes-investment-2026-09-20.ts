// Export for Favour Odey's programme and investment mapping project (w/c
// 22 Sept 2026, brief in Claude outputs/favour-mapping-brief.docx), so she
// starts from what the catalogue already holds. Three tabs: the rows, the
// distinct providers, and the taxonomy the schema can hold today with how
// populated each field actually is. Read only.
//
//   npx tsx --env-file=.env.local scripts/export-programmes-investment-2026-09-20.ts
import * as XLSX from 'xlsx'
import { getAdminDb } from '../src/lib/admin/admin-db'
import { SUBTYPE_LABELS } from '../src/lib/funding-subtypes'
import { VALID_FUNDING_TYPES, VALID_STRUCTURES } from '../src/lib/classify'

const OUT = 'Claude outputs/programmes-investment-existing.xlsx'
const QUEUE = ['captured', 'enriched', 'tagged', 'tagged_awaiting_review']
const STRUCTURE_LABEL: Record<string, string> = {
  registered_charity: 'Registered charity', cio: 'CIO', scio: 'SCIO', cic_guarantee: 'CIC (by guarantee)', cic_shares: 'CIC (by shares)',
  ltd_guarantee: 'Ltd by guarantee', ltd_shares: 'Ltd by shares', llp: 'LLP', cooperative: 'Co-op / community benefit society',
  unincorporated: 'Unincorporated association', not_registered: 'Unregistered group', sole_trader: 'Sole trader', individual: 'Individual',
}
const money = (n: number | null) => n === null || n === undefined ? '' : `£${n.toLocaleString('en-GB')}`

async function main() {
  const db = getAdminDb()
  const rows: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('scraped_grants').select('*').in('funding_type', ['programme', 'investment']).range(from, from + 999)
    if (error) throw error
    rows.push(...(data ?? [])); if (!data || data.length < 1000) break
  }
  const keep = rows.filter(r => r.is_active === true || QUEUE.includes(r.pipeline_state) || r.pipeline_state === 'between_rounds_scheduled')
  const status = (r: any) => r.is_active ? 'live' : QUEUE.includes(r.pipeline_state) ? 'review' : r.pipeline_state === 'between_rounds_scheduled' ? 'staged (between rounds)' : r.pipeline_state
  const { data: funders } = await db.from('funders').select('name, website, geographic_scope, funder_type, notes')
  const funderByName = new Map<string, any>()
  for (const f of funders ?? []) funderByName.set(String(f.name).toLowerCase().trim(), f)

  // ── Tab 1: rows ────────────────────────────────────────────────────────────
  const tab1 = keep
    .sort((a, b) => (a.funding_type + a.funder + a.title).localeCompare(b.funding_type + b.funder + b.title))
    .map(r => {
      const fb = r.funder_brief ?? {}
      const subs: string[] = Array.from(new Set([...(r.funding_subtypes ?? []), ...(r.funding_subtype ? [r.funding_subtype] : [])]))
      const amountRange = r.amount_undisclosed ? 'undisclosed'
        : r.amount_min && r.amount_max ? `${money(r.amount_min)} to ${money(r.amount_max)}`
        : r.amount_max ? `up to ${money(r.amount_max)}` : r.amount_min ? `from ${money(r.amount_min)}` : ''
      const timing = r.deadline ? r.deadline : r.is_rolling ? 'rolling' : r.next_open_date ? `reopens: ${r.next_open_date}` : ''
      return {
        'Title': r.title,
        'Provider / funder': r.funder ?? '',
        'Funding type': r.funding_type,
        'Sub-type(s)': subs.map(s => (SUBTYPE_LABELS as any)[s] ?? s).join('; '),
        'Investment instrument (si_instrument_type)': r.si_instrument_type ?? '',
        'Amount range': amountRange,
        'Programme funding (prog_funding_amount)': money(r.prog_funding_amount),
        'Region (location_tag)': r.location_tag ?? '',
        'Local only': r.is_local ? 'yes' : '',
        'Sectors (impact_sectors)': (r.impact_sectors ?? []).join('; '),
        'Eligible structures': (r.eligible_structures ?? []).map((s: string) => STRUCTURE_LABEL[s] ?? s).join('; '),
        'Who it is for (beneficiaries)': (r.target_beneficiaries ?? []).join('; '),
        'Deadline or rolling': timing,
        'Application cycle (prog_application_cycle)': r.prog_application_cycle ?? '',
        'Location mode (prog_location_mode)': r.prog_location_mode ?? '',
        'City (prog_location_city)': r.prog_location_city ?? '',
        'Next cohort start': r.prog_next_cohort_start ?? '',
        'Status': status(r),
        'Pipeline state': r.pipeline_state,
        'Source URL': r.apply_url ?? '',
        'Typical award (brief)': String(fb.typical_award ?? '').slice(0, 300),
        'Who can apply (brief)': String(fb.who_can_apply ?? '').slice(0, 300),
        'Shoots id': r.id,
      }
    })

  // ── Tab 2: providers ───────────────────────────────────────────────────────
  const byProvider = new Map<string, any[]>()
  for (const r of keep) { const k = String(r.funder ?? '(no funder)').trim(); if (!byProvider.has(k)) byProvider.set(k, []); byProvider.get(k)!.push(r) }
  const tab2 = Array.from(byProvider.entries()).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])).map(([name, rs]) => {
    const f = funderByName.get(name.toLowerCase())
    const site = f?.website ?? (() => { try { return new URL(rs.find((r: any) => r.apply_url)?.apply_url).origin } catch { return '' } })()
    return {
      'Provider': name,
      'Website': site,
      'HQ location': '',
      'Geographic scope (funders table)': f?.geographic_scope ?? '',
      'Funder type': f?.funder_type ?? rs[0]?.funder_type ?? '',
      'Rows on Shoots': rs.length,
      'Live': rs.filter((r: any) => r.is_active).length,
      'Programme rows': rs.filter((r: any) => r.funding_type === 'programme').length,
      'Investment rows': rs.filter((r: any) => r.funding_type === 'investment').length,
      'Offerings held': rs.map((r: any) => r.title).join(' | '),
    }
  })

  // ── Tab 3: taxonomy and how populated ──────────────────────────────────────
  const n = keep.length
  const pop = (f: (r: any) => boolean) => { const c = keep.filter(f).length; return `${c} of ${n} (${Math.round(100 * c / n)}%)` }
  const nonEmpty = (v: any) => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0)
  const distinct = (get: (r: any) => any[]) => { const m = new Map<string, number>(); for (const r of keep) for (const v of get(r)) m.set(v, (m.get(v) ?? 0) + 1); return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).map(([k, c]) => `${k} (${c})`).join(', ') }
  const tab3: Record<string, string>[] = [
    { Field: 'funding_type', 'What the schema holds': `text; app accepts ${Array.from(VALID_FUNDING_TYPES).join(', ')}. Older rows also carry accelerator, blended_finance, social_investment, corporate_programme, support_programme (legacy, not shown).`, 'Populated on these rows': pop(r => nonEmpty(r.funding_type)), 'Values in use on these rows': distinct(r => [r.funding_type]), 'Note for Favour': 'The four app types are the display categories. programme = the applicant receives a cohort, support or place; investment = repayable or equity. Type by what the applicant receives.' },
    { Field: 'funding_subtypes (array) and funding_subtype (legacy single)', 'What the schema holds': `text[]; app vocabulary: ${Object.entries(SUBTYPE_LABELS).map(([k, v]) => `${k} (${v})`).join(', ')}`, 'Populated on these rows': pop(r => nonEmpty(r.funding_subtypes) || nonEmpty(r.funding_subtype)), 'Values in use on these rows': distinct(r => Array.from(new Set([...(r.funding_subtypes ?? []), ...(r.funding_subtype ? [r.funding_subtype] : [])]))), 'Note for Favour': 'This is the closest thing to your "type" column today (accelerator, incubator, fellowship, loan, equity, blended, revenue_share). Mixed in with grant subtypes (restricted, capital) and in-kind ones; no separate list per funding type.' },
    { Field: 'si_instrument_type', 'What the schema holds': 'text; check constraint: loan, blended, recoverable_grant, equity, revenue_share', 'Populated on these rows': pop(r => nonEmpty(r.si_instrument_type)), 'Values in use on these rows': distinct(r => r.si_instrument_type ? [r.si_instrument_type] : []), 'Note for Favour': 'Built for investment rows, almost never filled. The instrument mostly lives in funding_subtypes instead.' },
    { Field: 'si_min_investment, si_max_investment', 'What the schema holds': 'integer, pounds', 'Populated on these rows': pop(r => nonEmpty(r.si_min_investment) || nonEmpty(r.si_max_investment)), 'Values in use on these rows': '', 'Note for Favour': 'Ticket size for investment rows was meant to live here; in practice it is in amount_min / amount_max.' },
    { Field: 'amount_min, amount_max, amount_undisclosed', 'What the schema holds': 'integer pounds, boolean', 'Populated on these rows': pop(r => nonEmpty(r.amount_min) || nonEmpty(r.amount_max) || r.amount_undisclosed), 'Values in use on these rows': '', 'Note for Favour': 'The field the matcher and the card read for ticket size / programme value, for every funding type.' },
    { Field: 'prog_funding_amount', 'What the schema holds': 'integer pounds', 'Populated on these rows': pop(r => nonEmpty(r.prog_funding_amount)), 'Values in use on these rows': '', 'Note for Favour': 'Cash attached to a programme place (stipend or grant). Almost never filled.' },
    { Field: 'org_stage', 'What the schema holds': 'text, no constraint, no vocabulary defined', 'Populated on these rows': pop(r => nonEmpty(r.org_stage)), 'Values in use on these rows': distinct(r => r.org_stage ? [r.org_stage] : []), 'Note for Favour': 'Your "stage" column (idea, early, growing, established) has a column waiting for it but nothing has ever been written to it, and no vocabulary exists. Propose one.' },
    { Field: 'prog_application_cycle', 'What the schema holds': 'text; check constraint: annual, twice_yearly, rolling, ad_hoc', 'Populated on these rows': pop(r => nonEmpty(r.prog_application_cycle)), 'Values in use on these rows': distinct(r => r.prog_application_cycle ? [r.prog_application_cycle] : []), 'Note for Favour': 'Your "how often it opens" column. Vocabulary exists, rarely filled; timing lives in deadline / is_rolling / next_open_date instead.' },
    { Field: 'deadline, is_rolling, next_open_date, deadline_cycle', 'What the schema holds': 'date, boolean, free text plus parsed date, jsonb of recurring cut-offs', 'Populated on these rows': `deadline ${pop(r => nonEmpty(r.deadline))}; rolling ${pop(r => r.is_rolling === true)}; next_open_date ${pop(r => nonEmpty(r.next_open_date))}`, 'Values in use on these rows': '', 'Note for Favour': 'Where timing actually lives today. A closed cohort is a hidden row with next_open_date set.' },
    { Field: 'prog_location_mode, prog_location_city, prog_cohort_size, prog_next_cohort_start', 'What the schema holds': 'mode: in_person, remote, hybrid (constraint); city text; size integer; start date', 'Populated on these rows': `mode ${pop(r => nonEmpty(r.prog_location_mode))}; city ${pop(r => nonEmpty(r.prog_location_city))}; size ${pop(r => nonEmpty(r.prog_cohort_size))}; start ${pop(r => nonEmpty(r.prog_next_cohort_start))}`, 'Values in use on these rows': distinct(r => r.prog_location_mode ? [r.prog_location_mode] : []), 'Note for Favour': 'Programme-shape fields. Mostly empty.' },
    { Field: 'location_tag, is_local', 'What the schema holds': 'free text region name; boolean', 'Populated on these rows': pop(r => nonEmpty(r.location_tag)), 'Values in use on these rows': distinct(r => r.location_tag ? [r.location_tag] : []), 'Note for Favour': 'Your "regions covered". Free text, so spellings vary; the public hubs bucket these into UK, England, London, Scotland, Wales, NI, International.' },
    { Field: 'impact_sectors', 'What the schema holds': 'text[]; app vocabulary of 22 sectors (see src/lib/classify.ts)', 'Populated on these rows': pop(r => nonEmpty(r.impact_sectors)), 'Values in use on these rows': distinct(r => r.impact_sectors ?? []), 'Note for Favour': 'Well populated. First tag is treated as the primary sector.' },
    { Field: 'eligible_structures', 'What the schema holds': `text[]; vocabulary: ${Array.from(VALID_STRUCTURES).join(', ')}`, 'Populated on these rows': pop(r => nonEmpty(r.eligible_structures)), 'Values in use on these rows': distinct(r => r.eligible_structures ?? []), 'Note for Favour': 'Who can apply, by legal form. The matcher caps a row that does not list the applicant\'s structure. For programmes open to any business, ltd_shares must be included.' },
    { Field: 'target_beneficiaries, diversity_tags', 'What the schema holds': 'text[] each; beneficiaries has an app vocabulary; diversity_tags has none', 'Populated on these rows': `beneficiaries ${pop(r => nonEmpty(r.target_beneficiaries))}; diversity_tags ${pop(r => nonEmpty(r.diversity_tags))}`, 'Values in use on these rows': distinct(r => r.target_beneficiaries ?? []), 'Note for Favour': 'Your "underrepresented-founder rule" has no home today: diversity_tags exists but is empty everywhere and undefined. Black-led and women-led programmes are currently tagged via beneficiaries (ethnic_minorities, women_girls), which conflates who runs the business with who it serves. Worth a proposal.' },
    { Field: 'cost to the applicant (fee, equity taken)', 'What the schema holds': 'no field', 'Populated on these rows': 'n/a', 'Values in use on these rows': '', 'Note for Favour': 'Nothing in the schema records whether a programme charges a fee or takes equity. It is sometimes in the brief prose (exclusions or how_to_apply). Worth a proposal.' },
    { Field: 'applicant_type', 'What the schema holds': 'individual, organisation, both (constraint)', 'Populated on these rows': pop(r => nonEmpty(r.applicant_type)), 'Values in use on these rows': distinct(r => r.applicant_type ? [r.applicant_type] : []), 'Note for Favour': 'Filled everywhere, almost always organisation.' },
    { Field: 'funder_type', 'What the schema holds': 'free text on the row and on the funders table', 'Populated on these rows': pop(r => nonEmpty(r.funder_type)), 'Values in use on these rows': distinct(r => r.funder_type ? [r.funder_type] : []), 'Note for Favour': 'Provider category. Mixed vocabulary (trust_foundation, corporate, loan, capacity_builder, government...).' },
    { Field: 'funders table (providers)', 'What the schema holds': 'name, short_name, website, funder_type, geographic_scope, sector_tags, typical_min, typical_max, is_rolling, notes, default_funding_type', 'Populated on these rows': `${tab2.filter(p => p['Website']).length} of ${tab2.length} providers have a website on file`, 'Values in use on these rows': '', 'Note for Favour': 'No HQ location column exists. Your provider level (HQ, regions, one line on who they are for) mostly has nowhere to go yet; geographic_scope and notes are the nearest.' },
    { Field: 'pipeline_state', 'What the schema holds': 'enum: captured, tagged, published, archived, enriched, tagged_awaiting_review, rejected, between_rounds_scheduled', 'Populated on these rows': pop(r => nonEmpty(r.pipeline_state)), 'Values in use on these rows': distinct(r => [r.pipeline_state]), 'Note for Favour': 'Status on tab 1 is derived from this plus is_active.' },
  ]

  const wb = XLSX.utils.book_new()
  const ws1 = XLSX.utils.json_to_sheet(tab1); ws1['!cols'] = Object.keys(tab1[0] ?? {}).map(k => ({ wch: /Title|Provider|Source|brief|Offerings/.test(k) ? 48 : 22 }))
  const ws2 = XLSX.utils.json_to_sheet(tab2); ws2['!cols'] = [{ wch: 40 }, { wch: 40 }, { wch: 16 }, { wch: 22 }, { wch: 18 }, { wch: 10 }, { wch: 6 }, { wch: 10 }, { wch: 10 }, { wch: 90 }]
  const ws3 = XLSX.utils.json_to_sheet(tab3); ws3['!cols'] = [{ wch: 34 }, { wch: 70 }, { wch: 30 }, { wch: 70 }, { wch: 80 }]
  XLSX.utils.book_append_sheet(wb, ws1, 'Rows')
  XLSX.utils.book_append_sheet(wb, ws2, 'Providers')
  XLSX.utils.book_append_sheet(wb, ws3, 'Schema taxonomy')
  XLSX.writeFile(wb, OUT)
  console.log(`wrote ${OUT}: rows ${tab1.length} (live ${keep.filter(r => r.is_active).length}, programme ${keep.filter(r => r.funding_type === 'programme').length}, investment ${keep.filter(r => r.funding_type === 'investment').length}), providers ${tab2.length}, taxonomy fields ${tab3.length}`)
}
main().catch(e => { console.error(e.message); process.exit(1) })
