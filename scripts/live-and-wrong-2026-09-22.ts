// Live and wrong, 22 Sept 2026: every page read by fetch, no model call.
// 15 changes; the other 17 rows carry only "the page does not state the
// amount", which is not wrong, just unproven.
//   npx tsx --env-file=.env.local scripts/live-and-wrong-2026-09-22.ts
import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
import { formatRejectReason } from '../src/lib/admin/reject-reasons'
const SRC = 'user_verified:live-and-wrong-2026-09-22'
const park = (note: string) => ({ is_active: false, pipeline_state: 'between_rounds_scheduled', deadline: null, next_open_date: note })
const reject = (code: string, note: string) => ({ is_active: false, pipeline_state: 'rejected', rejection_reason: formatRejectReason(code, note) })
const FIX: { id: string; why: string; fields: Record<string, unknown> }[] = [
  { id: '11eb3420-50d0-477d-889c-d950be2c3a06', why: 'City of London Stronger Communities: main grants up to £10,000 (£20,000 only in exceptional two-year cases); small £500 to £3,000', fields: { amount_min: 500, amount_max: 10000 } },
  { id: '171ceb65-7ddf-4a90-ac4c-57adf480279f', why: 'AWS credits: up to US$5,000 per fiscal year, one request a year', fields: { amount_min: null, amount_max: 4000, is_rolling: true } },
  { id: '1ab3dcfc-230d-44e6-9aa0-ead6a728fb77', why: 'Expert Impact renamed the Human Lending Library; free one-to-one mentoring, no cash', fields: { title: 'Expert Impact expert mentoring (formerly the Human Lending Library)', amount_min: null, amount_max: null, funding_type: 'in_kind' } },
  { id: '438535f9', why: 'Sovereign AI procurement is for UK startups and SMEs building AI; not a fund a charity or social enterprise applies to', fields: reject('out_of_scope', 'For UK-registered startups and SMEs building AI capabilities; government procurement contracts, not grants for civil society (sovereignai.gov.uk, read 22 Sept 2026)') },
  { id: '458979b8', why: 'Firstport Boost Fund is fully allocated for the year', fields: park('Fully allocated for 2026/27 (Sunderland and South Tyneside); business support runs until March 2027; next allocation not announced') },
  { id: '5cec571b-26c2-4a22-b200-f2f7c60cad75', why: 'Gannochy has no Scotland Youth Development programme; Rest of Scotland grants are open only to existing or recent grant holders', fields: reject('out_of_scope', 'No programme by this name; the Rest of Scotland round is restricted to existing or recent Gannochy grant holders, so there is nothing for a new applicant (gannochytrust.org.uk, read 22 Sept 2026)') },
  { id: '6f5fad07', why: 'Wigan Supporting Communities Fund: applications now closed', fields: park('Closed — next round TBC; the council says check the Deal for Communities pages') },
  { id: '985b3216-a7bb-43ca-b086-3e81c1e69126', why: 'EY Step into Business: 16 to 19 year olds apply as individuals', fields: reject('out_of_scope', 'Young people aged 16 to 19 apply as individuals for a workshop, coaching and a £2,000 start-up grant; not open to organisations (eyfoundation.com, read 22 Sept 2026)') },
  { id: 'a2f0d366', why: 'Doc Society features fund is open on a rolling basis until summer 2028', fields: { is_rolling: true } },
  { id: 'a9364402', why: 'Brighton Community Catalyst 2027 to 2029 is not open until autumn 2026', fields: park('Expected to open to applications in autumn 2026, dates not yet published') },
  { id: 'a96867a7', why: 'Inverurie YSF shows no open programme; the Covid recovery fund is historical', fields: park('No open programme on the site; contact IYSF for current funding') },
  { id: 'b7f40968', why: 'Zoom for Nonprofits is a discount, not a £225,000 grant', fields: { amount_min: null, amount_max: null, amount_undisclosed: true, funding_type: 'in_kind' } },
  { id: 'c1caaf02', why: 'Pilotlight is pro bono support, no cash', fields: { amount_min: null, amount_max: null, funding_type: 'in_kind' } },
  { id: 'f06351b9-42a7-460c-a9fa-3af50bffb9c2', why: 'Baily Thomas general grants close 31 Dec, 31 Mar and 31 Aug; small grants rolling', fields: { deadline_cycle: [{ day: 31, month: 12, label: 'General grants, for the March meeting' }, { day: 31, month: 3, label: 'General grants, for the June meeting' }, { day: 31, month: 8, label: 'General grants, for the November meeting' }] } },
  { id: 'f1fdcd6e-152a-403f-a1ac-f7838fbe9ebc', why: 'sportscotland facilities fund closes 1 April and 1 September each year', fields: { deadline_cycle: [{ day: 1, month: 4, label: 'Spring round closes 5pm' }, { day: 1, month: 9, label: 'Autumn round closes 5pm' }] } },
]
async function main() {
  const db = getAdminDb()
  for (const f of FIX) {
    if (f.id.length !== 36) continue   // applied on the first run, 22 Sept
    const { data: row } = await db.from('scraped_grants').select('id,title').eq('id', f.id).single()
    if (!row) { console.log('MISSING', f.id); continue }
    const r = await mergeGrantUpdate({ db, id: row.id, source: SRC, fields: f.fields })
    console.log(row.title.slice(0, 44).padEnd(44), '| applied', r.applied.join(','), r.rejected.length ? '| refused ' + r.rejected.map(x => x.field + ':' + x.reason).join(',') : '')
  }
}
main().catch(e => { console.error(e); process.exit(1) })
