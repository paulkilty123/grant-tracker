// The audience rule, applied: if a charity, CIC or social enterprise cannot
// apply in its own right, the row goes. Same test that removed ten
// individuals-only rows earlier today, extended to institutions.
//
// I checked all 62 live rows whose eligibility mentions councils, housing
// associations, developers, NHS trusts or schools, rather than sweeping the
// category. Almost all of them name charities ALONGSIDE the institution — the
// Heritage Fund's "not-for-profit organisations including local authorities",
// the Armed Forces Covenant's charities and CICs and councils, Norfolk's list of
// seven structures — and our users are eligible for every one of those. Two are
// not:
//
//   LONDON SOCIAL AND AFFORDABLE HOMES PROGRAMME. Applicants are "local
//   authorities, registered providers (not-for-profit and for-profit),
//   unregistered bodies, and developers". Also between rounds: bidding opened in
//   February and closed in April 2026.
//
//   UNIVERSAL MUSIC UK SOUND FOUNDATION. Schools apply for resources, students
//   apply for instruments, teachers apply for courses. There is no route for a
//   charity or a CIC at all.
//
// Deliberately NOT withdrawn, and worth writing down because both look like
// candidates:
//
//   SERVICE PUPIL SUPPORT. Led by schools, colleges, councils and multi-academy
//   trusts — and a multi-academy trust IS a charity, so our audience can lead.
//   The parallel session set its amounts today.
//
//   SCREEN SCOTLAND. "Production companies and independent producers" reads as
//   commercial, but a production company can be a CIC. It is already in the
//   wrong-fund queue on separate evidence and should be settled there.
//
//   npx tsx --env-file=.env.local scripts/apply-audience-rule-2026-08-28.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
import { formatRejectReason } from '../src/lib/admin/reject-reasons'

const APPLY = process.argv.includes('--apply')

const ROWS = [
  { match: 'London Social and Affordable Homes Programme', code: 'out_of_scope',
    why: 'Applicants are "local authorities, registered providers (both not-for-profit and for-profit), unregistered bodies like place-based organisations and developers". A charity, CIC or social enterprise cannot bid in its own right. The programme is also between rounds: bidding opened February 2026 and closed in April.' },
  { match: 'Universal Music UK Sound Foundation', code: 'out_of_scope',
    why: 'Schools apply for musical resources, individual students for instruments, and school music teachers for short courses. There is no route for a charity, CIC or social enterprise anywhere in the scheme.' },
]

async function main() {
  const db = getAdminDb()
  if (!APPLY) console.log('DRY RUN — nothing written. Pass --apply.\n')

  for (const r of ROWS) {
    const { data } = await db.from('scraped_grants')
      .select('id, title, is_active').ilike('title', `%${r.match}%`)
      .eq('is_active', true).limit(2)
    const rows = (data as any[]) ?? []
    if (!rows.length) { console.log(`${r.match}: no live row`); continue }
    for (const row of rows) {
      if (!APPLY) { console.log(`[dry] withdraw ${row.title}`); continue }
      const res = await mergeGrantUpdate({
        id: row.id, db,
        fields: { is_active: false, pipeline_state: 'rejected', rejection_reason: formatRejectReason(r.code, r.why) },
        source: 'system:audience-rule-2026-08-28',
      })
      console.log(`withdrawn ${row.title}: applied [${res.applied.join(', ') || 'nothing'}]`)
    }
  }
}

main().catch(e => { console.error(e); process.exit(1) })
