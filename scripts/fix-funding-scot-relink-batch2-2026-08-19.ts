// The last four funding.scot rows. Only three needed changing, and one of them
// was wrong in a way the link fix would not have caught.
//
// Bellahouston Bequest Fund has its own site with a downloadable application
// form, so the directory listing was never the right link. Its 31 August
// deadline is CORRECT — `deadline_cycle` already models the quarterly trustee
// meetings and derived it properly. Only the URL and the apply route change.
//
// A Sinclair Henderson Trust has no website: applications go by post or email to
// Thorntons Law LLP in Dundee, so funding.scot is the only public record and the
// link stays. What is wrong is the date. `deadline_cycle` carries an ANNUAL
// 31 May entry labelled "for June 2026 meeting", which derived a deadline of
// 31 May 2027 — but the trustees "meet once every even year i.e. 2024, 2026,
// 2028". There is no 2027 meeting. A charity working to that date would post an
// application into a year with no one reading it. The cycle cannot express
// "even years only", so it is cleared and the real next cut-off is set outright.
//
// Argyll & Bute Council's brief said "Apply via the online grants portal at
// funding.scot", which is why the directory link looked deliberate. It is not —
// the council runs the fund on its own site. The row is correctly inactive: the
// 2026/27 round opened 11 May and closed 5 July 2026, which matches our stored
// deadline. The page states no date for the next round, so none is invented.
//
// Hugh & Mary Miller Bequest is unchanged. No website, apply any time by email or
// post c/o Shepherd & Wedderburn LLP, and its rolling no-deadline row is already
// right. The directory link is the only public record there is.
//
//   npx tsx --env-file=.env.local scripts/fix-funding-scot-relink-batch2-2026-08-19.ts --dry
//   npx tsx --env-file=.env.local scripts/fix-funding-scot-relink-batch2-2026-08-19.ts
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const DRY = process.argv.includes('--dry')
const SOURCE = 'user_verified:funding-scot-relink-2026-08-19'

const BELLAHOUSTON = 'dff42471-e15e-4c23-930e-0adfe6f44aec'
const SINCLAIR = '1d6af16c-0060-45b4-8f1e-051888785890'
const ARGYLL = '321ed3d9-0619-4a5b-9a39-cae978857a03'

type Edit = {
  id: string
  title: string
  snippet: string
  fields: Record<string, unknown>
  brief?: Record<string, unknown>
}

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const EDITS: Edit[] = [
    {
      id: BELLAHOUSTON,
      title: 'Bellahouston Bequest Fund — the funder has its own site and form',
      snippet:
        'bellahoustonbequestfund.org.uk: "Contained in this website you will find some information on the history of the Bellahouston Bequest Fund and a downloadable Grant Application Form." The application page says "Please submit Grant Application Forms by email" and "Applications received will normally be considered by the trustees at the next quarterly meeting", and links Application Guidelines and an Updated Application Form (November 2025).',
      fields: { apply_url: 'https://bellahoustonbequestfund.org.uk/grant-application/' },
      brief: {
        how_to_apply:
          'Download the grant application form and guidelines from bellahoustonbequestfund.org.uk and submit the completed form by email. '
          + 'Applications are considered by the trustees at the next quarterly meeting, so the deadline shown is the cut-off for the coming meeting rather than a single annual closing date. '
          + 'Queries go to Mitchells Roberton Solicitors, whose details are on the fund\'s contacts page.',
      },
    },
    {
      id: SINCLAIR,
      title: 'A Sinclair Henderson Trust — trustees meet in even years only, so 2027 is not a deadline',
      snippet:
        'funding.scot: "Trustees meet once every even year i.e. 2024, 2026, 2028. Applications should be received by the previous month." Apply to Thorntons at the address provided: Thorntons Law LLP, Whitehall House, 33 Yeaman Shore, Dundee DD1 4BJ, email and phone 01382 229111. Registered charities, with a preference for the Dundee and Tayside areas of Scotland.',
      fields: {
        deadline: '2028-05-31',
        deadline_cycle: null,
      },
      brief: {
        how_to_apply:
          'Apply by post or email to Thorntons Law LLP, Whitehall House, 33 Yeaman Shore, Dundee DD1 4BJ (phone 01382 229111). The trust has no website of its own. '
          + 'The trustees meet only once every even-numbered year (2024, 2026, 2028) and applications must arrive in the month before the meeting, so the next cut-off is May 2028. '
          + 'The June 2026 round has passed. The trust tends to fund the same core charities each cycle, so a first approach is unlikely to succeed quickly.',
      },
    },
    {
      id: ARGYLL,
      title: 'Argyll & Bute Council — the council runs this on its own site, not on funding.scot',
      snippet:
        'argyll-bute.gov.uk/my-community/communities-and-partnerships/supporting-communities-fund: "The Supporting Communities Fund 2026 / 27 is now CLOSED. Thank You for your interest." The round was "open from Monday 11th May 2026". "Maximum award available is £1,500". Open to charities and constituted groups including community councils and parent councils, with annual income below £150,000, for projects within Argyll and Bute. "The Supporting Communities Fund cannot make awards for Capital Projects."',
      fields: {
        apply_url: 'https://www.argyll-bute.gov.uk/my-community/communities-and-partnerships/supporting-communities-fund',
        funding_index_url: 'https://www.argyll-bute.gov.uk/my-community/communities-and-partnerships/supporting-communities-fund',
      },
      brief: {
        how_to_apply:
          'Apply on the council\'s own site at argyll-bute.gov.uk under My Community, Communities and Partnerships, Supporting Communities Fund. '
          + 'This is not administered through funding.scot despite the directory listing. The 2026/27 round opened on 11 May 2026 and closed on 5 July 2026; '
          + 'the council has not published dates for the next round, and past rounds have opened in the spring. Maximum award £1,500, and capital projects are excluded.',
      },
    },
  ]

  let applied = 0
  let refused = 0
  for (const e of EDITS) {
    console.log(`\n── ${e.title}`)
    const fields = { ...e.fields }
    if (e.brief) {
      const { data } = await db.from('scraped_grants').select('funder_brief').eq('id', e.id).limit(1)
      if (!data?.length) { console.log('   NOT FOUND'); continue }
      fields.funder_brief = { ...((data[0].funder_brief ?? {}) as Record<string, unknown>), ...e.brief }
    }
    if (DRY) { console.log(`   ${Object.keys(fields).join(', ')} (dry)`); continue }
    const citations = Object.fromEntries(
      Object.keys(fields).map(k => [k, { snippet: e.snippet, confidence: 'high' as const }]),
    )
    const r = await mergeGrantUpdate({ id: e.id, fields, source: SOURCE, db, citations })
    console.log(`   applied:  ${JSON.stringify(r.applied)}`)
    applied += r.applied.length
    if (r.rejected?.length) { console.log(`   REFUSED:  ${JSON.stringify(r.rejected)}`); refused += r.rejected.length }
  }
  if (!DRY) console.log(`\nfields applied: ${applied}   fields refused: ${refused}`)
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
