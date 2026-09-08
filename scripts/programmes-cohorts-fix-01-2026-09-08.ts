// Two rulings from grant-tracker-be applied to the four Firstport rows staged
// in batch 1, plus the audience wording note that came with them.
//
// Ruling one, is_local. The cohorts brief said nation-tagged rows get false.
// The catalogue disagrees: its 54 Scotland rows and the existing Firstport row
// all use true, and a nation restriction is a geographic restriction. So the
// three Scotland rows flip to true. (Boost was already true, being a
// two-borough fund.) Worth recording that this matters less than it looks:
// matching.ts treats is_local as a legacy boolean, inconsistent on roughly 16%
// of the catalogue, and prefers location_tag. The point is not widening that
// inconsistency.
//
// Ruling two, funding_type. Three of the four are grants, not programmes, and
// their own pages settle it: Build It "offers up to £40,000 in grant funding",
// the Community Enterprise Fund gives "grants of up to £5,000", the Boost Fund
// says grants throughout. None bundles learning into the award — Build It's
// support is an external referral to Just Enterprise, which is not the fund
// giving it. The Social Innovation Challenge stays a programme, because a
// competition with a £30,000 prize plus tailored support for the winner and
// £10,000 for two finalists genuinely is that shape.
//
// This cuts the batch's programme gain from four rows to one, deliberately. A
// fundraiser looking for a £40,000 grant needs to find Build It in the Grants
// tab; typing grants as programmes to move the programme count would put four
// rows where nobody searching for them will look, and the count would then be
// measuring our tagging rather than the catalogue.
//
// Changing funding_type forces the subtypes too, because the vocabularies are
// per type in src/lib/funding-subtypes.ts: `includes_grant` and
// `support_programme` are programme-only and would be invalid on a grant row.
// The three become `restricted`, which is what they are — Build It funds
// salaries, the other two fund start-up and development costs, none is
// unrestricted core funding. `small_grant` is deliberately NOT added: there is
// no threshold on the page or in the lib to cite for it, so it is left for the
// classifier rather than invented here.
//
// Audience wording: the Boost Fund and the Challenge both name individuals
// alongside organisations, which is in scope since the rule excludes
// individuals-ONLY. Both who_can_apply fields now say so in the first sentence,
// so neither reads as an individuals-only fund and gets skipped.
//
// funding_subtypes is not a TRACKED_FIELD, so it is a direct update; everything
// else goes through mergeGrantUpdate at the same source, equal trust to the
// write that created these rows.
//
//   npx tsx --env-file=.env.local scripts/programmes-cohorts-fix-01-2026-09-08.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const APPLY = process.argv.includes('--apply')
const SRC = 'system:programmes-cohorts-2026-09-08'

const BOOST_WHO = 'Both organisations and individuals can apply. Early-stage social enterprises in Sunderland and South Tyneside that have been trading for five years or less and have a turnover of less than £250,000, and individuals setting up a new social enterprise in those areas. The application must deliver most of its social or environmental benefit within one or both of Sunderland and South Tyneside.'
const SIC_WHO = 'Both organisations and individuals can apply: social enterprises, unincorporated groups, community associations, or individuals with an idea for a new social enterprise project. The idea must address one of four themes: eradicating child poverty, growing the economy, tackling the climate emergency, or ensuring high quality and sustainable public services.'

type Fix = {
  id: string
  re: RegExp
  fields: Record<string, unknown>
  subtypes: string[]
  who_can_apply?: string
  why: string
}

const FIXES: Fix[] = [
  {
    id: '93b5e40d-069b-497e-bd9c-faddba20aa92', re: /Firstport Build It/,
    fields: { funding_type: 'grant', is_local: true },
    subtypes: ['restricted'],
    why: 'grant (salary costs), Scotland so is_local true',
  },
  {
    id: '1af5a790-2329-4eaa-9ebf-457436baacd7', re: /Firstport Community Enterprise Fund/,
    fields: { funding_type: 'grant', is_local: true },
    subtypes: ['restricted'],
    why: 'grant (start-up costs), Scotland so is_local true',
  },
  {
    id: '458979b8-caf9-43b5-9b9f-44246610e9e9', re: /Firstport Social Enterprise Boost Fund/,
    fields: { funding_type: 'grant' },
    subtypes: ['restricted'],
    who_can_apply: BOOST_WHO,
    why: 'grant (start-up and development costs); is_local already true; audience wording',
  },
  {
    id: '2cade3f4-1c09-4e7e-b4dd-bcf1e5841226', re: /Firstport Social Innovation Challenge/,
    fields: { is_local: true },
    subtypes: ['award', 'includes_grant'],
    who_can_apply: SIC_WHO,
    why: 'stays a programme (competition with prize and support); Scotland so is_local true; audience wording',
  },
]

async function main() {
  const db = getAdminDb()
  console.log(`cohorts batch 1 fixes — ${APPLY ? 'APPLY' : 'DRY RUN'}\n`)

  for (const f of FIXES) {
    const { data: before } = await db.from('scraped_grants')
      .select('id, title, funding_type, funding_subtypes, is_local, is_active, pipeline_state, funder_brief')
      .eq('id', f.id).single()
    if (!before) throw new Error(`${f.id}: no row`)
    if (!f.re.test(String(before.title))) throw new Error(`${f.id}: title "${before.title}" does not match ${f.re}`)
    // These are staged rows and this job must never touch a live one.
    if (before.is_active !== false || before.pipeline_state !== 'tagged_awaiting_review') {
      throw new Error(`${before.title}: expected a hidden staged row, found is_active=${before.is_active} state=${before.pipeline_state}`)
    }

    console.log(`  ${String(before.title)}`)
    console.log(`      ${before.funding_type}/${JSON.stringify(before.funding_subtypes)} is_local=${before.is_local}`)
    console.log(`   -> ${f.fields.funding_type ?? before.funding_type}/${JSON.stringify(f.subtypes)} is_local=${f.fields.is_local ?? before.is_local}   (${f.why})`)
    if (!APPLY) continue

    const fields: Record<string, unknown> = { ...f.fields }
    if (f.who_can_apply) {
      const brief = { ...((before.funder_brief as Record<string, unknown> | null) ?? {}) }
      brief.who_can_apply = f.who_can_apply
      fields.funder_brief = brief
    }
    const res = await mergeGrantUpdate({ id: f.id, fields, source: SRC, db })
    const refused = res.rejected.filter(x => x.reason !== 'idempotent')
    console.log(`      applied [${res.applied.join(', ') || 'nothing'}]${refused.length ? `  REFUSED ${JSON.stringify(refused)}` : ''}`)
    if (refused.length) throw new Error(`${before.title}: refused — ${JSON.stringify(refused)}`)

    // funding_subtypes is not tracked, so it is set directly.
    const { error } = await db.from('scraped_grants').update({ funding_subtypes: f.subtypes }).eq('id', f.id)
    if (error) throw new Error(`${before.title}: subtypes update failed — ${error.message}`)
    console.log(`      subtypes -> ${JSON.stringify(f.subtypes)}`)
  }

  const { data: after } = await db.from('scraped_grants')
    .select('id, title, funding_type, funding_subtypes, is_local, is_active, pipeline_state')
    .eq('source', SRC).order('title')
  console.log('\n  after:')
  for (const r of (after ?? []) as Record<string, unknown>[]) {
    console.log(`    ${r.is_active ? 'LIVE!!' : 'hidden'} ${String(r.pipeline_state).padEnd(24)} ${String(r.funding_type).padEnd(10)} ${JSON.stringify(r.funding_subtypes).padEnd(30)} is_local=${String(r.is_local).padEnd(5)} ${r.title}`)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
