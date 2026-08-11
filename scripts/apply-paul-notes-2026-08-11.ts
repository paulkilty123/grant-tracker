// Corrections from Paul's review, 2026-08-11. Each change carries a verbatim
// quote from the funder's own page (or application guidelines PDF), written
// through mergeGrantUpdate so the trust ladder and provenance apply.
//
//   npx tsx scripts/apply-paul-notes-2026-08-11.ts [--dry]
//
// Nothing here activates a row. Re-points, deadlines and closures only.
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const SOURCE = 'user_verified:paul-review-2026-08-11'
const DRY = process.argv.includes('--dry')

type Change = { id: string; title: string; snippet: string; fields: Record<string, unknown> }

const CHANGES: Change[] = [
  // ── Bromley: all three rows point at /our-approach/, which is a philosophy
  // page. The funds live behind /apply-for-funding/, which names both
  // programmes and holds the eligibility quiz that gates the application form.
  {
    id: '2eb1fe4f-b5cf-4c21-95b1-7dfdf4a9dab0',
    title: 'The Bromley Trust — Human Rights (re-point)',
    snippet: 'We can only accept applications for funding that fit within one of our two grant programmes: Human Rights Grants Programme, Prison Reform Grants Programme.',
    fields: { apply_url: 'https://www.thebromleytrust.org.uk/apply-for-funding/', url_status: 'unchecked' },
  },
  {
    id: '847d82eb-10e4-4ead-ae1f-016ec7324d3f',
    title: 'The Bromley Trust — Prison Reform (re-point)',
    snippet: 'We can only accept applications for funding that fit within one of our two grant programmes: Human Rights Grants Programme, Prison Reform Grants Programme.',
    fields: { apply_url: 'https://www.thebromleytrust.org.uk/apply-for-funding/', url_status: 'unchecked' },
  },
  {
    id: 'a9b3d0ce-0000-0000-0000-000000000000', // placeholder, replaced below
    title: 'The Bromley Trust — Grants (generic, re-point)',
    snippet: 'We can only accept applications for funding that fit within one of our two grant programmes: Human Rights Grants Programme, Prison Reform Grants Programme.',
    fields: { apply_url: 'https://www.thebromleytrust.org.uk/apply-for-funding/', url_status: 'unchecked' },
  },

  // ── Baring: the one open call is a themed call under Strengthening Civil
  // Society. Guidelines PDF gives the real numbers, which the generic
  // current-funding-opportunities page does not.
  {
    id: '2b0fb0f0-6bb6-4803-baf7-8a289b115976',
    title: 'Baring Foundation — Strengthening Civil Society (re-point + real terms)',
    snippet: 'we anticipate awarding 6-7 grants of £150,000 over three years. However, we will consider applications for grants of £50,000 over 18 months for projects which are in an exploratory phase. To be eligible to apply to this fund, applicants need to: have a demonstrable history of using legal tools to address discrimination and further social change; and have an income of under £2m a year.',
    fields: {
      apply_url: 'https://baringfoundation.org.uk/news-story/new-funding-available-using-legal-tools-to-hold-corporations-to-account/',
      amount_min: 50000,
      amount_max: 150000,
      max_org_income: 2000000,
      url_status: 'unchecked',
    },
  },

  // ── Somerset: re-point the staged Crisis row off the generic listing page.
  {
    id: '471c6f5f-3bab-4cd1-b472-a1807f991c10',
    title: 'Somerset Crisis and Resilience Alliance (re-point)',
    snippet: 'Somerset Crisis and Resilience Alliance. Grant size Around £40,000 to £80,000 per year. Apply by Friday 4 September 2026, by 5pm (expressions of interest only).',
    fields: {
      apply_url: 'https://www.somersetcf.org.uk/grants-funding/details/somerset-crisis-and-resilience-alliance/',
      amount_min: 40000,
      amount_max: 80000,
      url_status: 'unchecked',
    },
  },

  // ── Somerset: live in our catalogue, closed on the funder's page.
  {
    id: 'e2aeafe1-baac-457f-8b41-79e03614b9f8',
    title: 'Stronger Communities Fund (closed — hide)',
    snippet: 'Closed. Expected to re-open: Autumn 2026. Stronger Communities Fund. Grant size Up to £5,000. Who is it for? Community-led groups based in Somerset (excluding BANES and North Somerset) that meet our minimum standards.',
    fields: { is_active: false, next_open_date: 'Autumn 2026', next_open_date_parsed: '2026-09-01' },
  },

  // ── Somerset: open year-round with a stated next deadline we were missing.
  {
    id: '9cf129d2-9e1c-43d0-9627-032cf46ba18a',
    title: 'HPC Community Fund Small Grants (deadline)',
    snippet: 'HPC Community Fund Small Grants. Apply by Open year-round. Next deadline is Monday 24 August 2026, by 5pm. Decisions made every 2 months. Next decision late September 2026.',
    fields: { deadline: '2026-08-24' },
  },

  // ── Somerset: our reopen date disagrees with the funder's.
  {
    id: 'e2d6c91c-af57-4aa7-9ded-c4395da81f0e',
    title: 'Mendip Hills Fund (reopen date)',
    snippet: 'Closed. Expected to re-open: Early 2027. Mendip Hills Fund. Grant size Up to £2,000. Typical grant £1,000.',
    fields: { next_open_date: 'Early 2027', next_open_date_parsed: '2027-01-01' },
  },
]

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Resolve the generic Bromley row by title rather than hard-coding a guess.
  const { data: bromley } = await db
    .from('scraped_grants').select('id').eq('title', 'The Bromley Trust — Grants').maybeSingle()
  if (bromley?.id) CHANGES[2].id = bromley.id
  else { CHANGES.splice(2, 1); console.log('(generic Bromley row not found — skipped)') }

  for (const c of CHANGES) {
    console.log(`\n── ${c.title}`)
    if (DRY) { console.log(`   ${JSON.stringify(c.fields)} (dry)`); continue }
    const citations = Object.fromEntries(
      Object.keys(c.fields).map(k => [k, { snippet: c.snippet, confidence: 'high' as const }]),
    )
    const r = await mergeGrantUpdate({ id: c.id, fields: c.fields, source: SOURCE, db, citations })
    console.log(`   applied:  ${JSON.stringify(r.applied)}`)
    if (r.rejected?.length) console.log(`   REJECTED: ${JSON.stringify(r.rejected)}`)
  }
}
main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
