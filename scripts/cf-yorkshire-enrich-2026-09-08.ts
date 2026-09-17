/**
 * Deepen the six staged Yorkshire community foundation rows, 8 September 2026.
 *
 * Why. An audit against 60 live published community foundation rows found the
 * staged six carried 4 to 5 funder_brief keys against a median of 14, and were
 * missing what_they_fund, typical_award, funder_tips, strong_application and
 * geographic_focus entirely. The facts in them were right; the depth was not.
 *
 * Cost. Nothing. Every sentence below comes from page text already on disk from
 * this session's reads, so no model call and no Anthropic API spend.
 *
 * Trust. Source is `system:...` at trust 50, deliberately BELOW ai_enrich at 60,
 * so the normal nightly enrichment can still improve any of these later. Writing
 * these as admin: would freeze them and make Re-enrich fail silently.
 */
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
import * as fs from 'fs'

const env = fs.readFileSync('.env.local', 'utf8')
const envVar = (k: string) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))![1].trim()
const db = createClient(envVar('NEXT_PUBLIC_SUPABASE_URL'), envVar('SUPABASE_SERVICE_ROLE_KEY'))

const SOURCE = 'system:cf-yorkshire-enrich-2026-09-08'
const APPLY = process.argv.includes('--apply')

const LEEDS_PORTAL =
  'Leeds Community Foundation moved to a new grants portal, so you need to create an account the first time ' +
  'you apply even if you have applied before. The Foundation also asks applicants to re-read the guidance ' +
  'notes each round because they change. Their grants team can be reached on grants@leedscf.org.uk or ' +
  '0113 242 2426.'

const LEEDS_UNDERREPRESENTED =
  'The Foundation says it actively welcomes applications from, or benefitting, LGBTQIA+, racially ' +
  'minoritised, and d/Deaf or disabled people.'

type Enrichment = { brief: Record<string, string>; spend_types?: string[] }

const BY_TITLE: Record<string, Enrichment> = {
  'The Hannah Corne Green Futures Fund': {
    spend_types: ['revenue', 'capital'],
    brief: {
      how_to_apply:
        'Read the fund’s guidance and criteria, and the Application Planner, both linked from the fund page. Then start a new application through the Leeds Community Foundation grants portal. You have to create a portal account the first time you use it, even if you have applied to the Foundation before. Supporting documents can be attached to the application or emailed to grants@leedscf.org.uk.',
      open_status: 'Open. Closes at noon on 28 September 2026, with decisions in December 2026.',
      what_they_fund:
        'Practical, inclusive climate action rooted in local neighbourhoods. The page gives five kinds of ' +
        'example: projects that reduce barriers to spending time outdoors for vulnerable community members, ' +
        'such as guided nature walks, outdoor wellbeing activities or community walking and running groups; ' +
        'projects encouraging sustainable travel, such as bike repair sessions or cycle confidence work; ' +
        'local initiatives to increase access to green spaces and reduce carbon; repair, reduce, reuse and ' +
        'recycle initiatives; and feasibility studies exploring green energy for community buildings.',
      typical_award: 'Up to £2,000, for activity lasting up to a year. Decisions in December 2026.',
      geographic_focus: 'Leeds. The organisation and the activity both have to be based there.',
      funder_tips:
        'Two constraints do most of the filtering here. The amount you request must be at least 50% of the ' +
        'total cost of the activity, so this fund will not top up a large budget. And capital is only ' +
        'partly excluded: major building projects, extensions and substantial renovations are out, but small ' +
        'gardening tools or equipment for repair, reuse or insulation work are explicitly allowed. ' +
        LEEDS_PORTAL,
      strong_application:
        'The fund is named for a colleague and is explicit about its spirit, so applications that connect ' +
        'climate action to community wellbeing read better than purely technical carbon projects. ' +
        LEEDS_UNDERREPRESENTED,
    },
  },
  'Jimbo’s Fund': {
    spend_types: ['revenue'],
    brief: {
      how_to_apply:
        'Read the fund’s guidance and criteria, and the Application Planner, both linked from the fund page. Then start a new application through the Leeds Community Foundation grants portal. You have to create a portal account the first time you use it, even if you have applied to the Foundation before. Supporting documents can be attached to the application or emailed to grants@leedscf.org.uk.',
      open_status: 'Open. Closes at noon on 12 October 2026, with decisions in February 2027.',
      what_they_fund:
        'Support for people overcoming adversity in Leeds. The Foundation notes that many community ' +
        'organisations want help keeping community spaces open alongside targeted support for people facing ' +
        'food and fuel poverty and other effects of the rising cost of living. Past funded activity includes ' +
        'supporting asylum seekers with food and clothing, helping families access baby essentials such as ' +
        'cots and bedding, and street-level youth work for young people disengaged from mainstream services.',
      typical_award: 'Between £1,000 and £10,000, over a fixed twelve months. Decisions in February 2027.',
      geographic_focus:
        'Leeds, with projects supporting people in LS8, LS9, LS14 and LS15 explicitly prioritised.',
      funder_tips:
        'This is the least accessible of the Leeds funds for a young organisation: you must evidence a track ' +
        'record in Leeds and have been operating at least 2 years. The request must also be at least 50% of ' +
        'the total cost. Anyone holding a 3 year grant awarded in 2025 is barred from this round. Above ' +
        '£5,000 the unincorporated route closes and you must be incorporated or a registered charity. ' +
        LEEDS_PORTAL,
      strong_application:
        'The page asks applicants to outline how they are addressing the needs of the people they support, ' +
        'and singles out activities that local people and participants have been consulted on. Evidence of ' +
        'that consultation, and of a genuine connection to the communities in the city, is what the fund ' +
        'says it is looking for. ' + LEEDS_UNDERREPRESENTED,
    },
  },
  'The Leeds Fund Small Grants': {
    spend_types: ['revenue'],
    brief: {
      how_to_apply:
        'Read the fund’s guidance and criteria, and the Application Planner, both linked from the fund page. Then start a new application through the Leeds Community Foundation grants portal. You have to create a portal account the first time you use it, even if you have applied to the Foundation before. Supporting documents can be attached to the application or emailed to grants@leedscf.org.uk.',
      open_status: 'Open. Closes at noon on 20 October 2026, with decisions in February 2027.',
      what_they_fund:
        'A wide range of activity, part-funded or fully funded. The examples given are organisational ' +
        'development aimed at increasing capacity or developing strategies; one-off projects or expanding ' +
        'existing activity; work that makes the organisation stronger, such as training for staff and ' +
        'volunteers, time for policy or process development, employability programmes, consultations on ' +
        'areas like marketing, and testing new activity; and work on issues important to the community, ' +
        'such as health and wellbeing, new experiences, safer and friendlier communities and new skills.',
      typical_award: 'Up to £5,000, for activity lasting up to a year. Decisions in February 2027.',
      geographic_focus:
        'Leeds. The activity must be based there and the applicant based in, or with a demonstrable ' +
        'connection to, Leeds communities.',
      funder_tips:
        'The income band is the thing to check first. This fund is for organisations with an income over ' +
        '£75,000 and under £150,000, and the Foundation directs anything smaller to the Microgrants ' +
        'instead, so applying to the wrong one wastes a round. Unconstituted groups are also sent to the ' +
        'Microgrants. Only one application per organisation per round. ' + LEEDS_PORTAL,
      strong_application:
        'The Foundation states that priority goes to applications developing organisational resilience, and ' +
        'to organisations established in the last 5 years. It also plans to award at least 20% of the fund ' +
        'to applications supporting LGBTQIA+, racially minoritised, and d/Deaf or disabled communities, so ' +
        'work with those communities should be made explicit rather than left implied.',
    },
  },
  'The Leeds Fund Microgrants': {
    spend_types: ['revenue'],
    brief: {
      how_to_apply:
        'Read the fund’s guidance and criteria, and the Application Planner, both linked from the fund page. Then start a new application through the Leeds Community Foundation grants portal. You have to create a portal account the first time you use it, even if you have applied to the Foundation before. Supporting documents can be attached to the application or emailed to grants@leedscf.org.uk.',
      open_status: 'Open. Closes at noon on 20 October 2026, with decisions in February 2027.',
      what_they_fund:
        'The same breadth as the Small Grants: organisational development aimed at increasing capacity or ' +
        'developing strategies; one-off projects or expanding existing activity; work that makes the ' +
        'organisation stronger, such as training for staff and volunteers, time for policy or process ' +
        'development, employability programmes, consultations and testing new activity; and work on issues ' +
        'important to the community, such as health and wellbeing, new experiences, safer communities and ' +
        'new skills. The Foundation says applicants know best what their communities need.',
      typical_award:
        'Up to £2,500 for a formally constituted organisation, or up to £500 for an informal group without ' +
        'a constitution. Activity can last up to a year. Decisions in February 2027.',
      geographic_focus:
        'Leeds. The activity must be based there and the applicant based in, or with a demonstrable ' +
        'connection to, Leeds communities.',
      funder_tips:
        'This is the most open door in the Leeds range and the one to use if you are small or new. Income ' +
        'must be under £75,000, and anything larger belongs in the Small Grants. Groups with no ' +
        'constitution can still apply for up to £500 provided they have at least 3 members and income under ' +
        '£10,000. Only one application per organisation or group per round. ' + LEEDS_PORTAL,
      strong_application:
        'Priority goes to applications developing organisational resilience and to organisations established ' +
        'in the last 5 years, so a new group should say how long it has existed rather than hide it. At ' +
        'least 20% of the fund is planned for applications supporting LGBTQIA+, racially minoritised, and ' +
        'd/Deaf or disabled communities.',
    },
  },
  'Crisis and Resilience Fund (Kirklees), Round Two': {
    spend_types: ['revenue'],
    brief: {
      open_status: 'Open. Round two closes on 2 October 2026.',
      what_they_fund:
        'Activity that strengthens how local support fits together, in four categories the funder sets out: ' +
        'community coordination and partnership working, meaning collaboration between organisations and ' +
        'services; referral pathways and access to support, meaning how residents and frontline staff ' +
        'navigate and access help; community infrastructure and capability, meaning the capacity needed for ' +
        'effective coordination; and community insight, learning and co-production, meaning using lived ' +
        'experience to improve how local systems operate. Other activity that demonstrably strengthens the ' +
        'local support landscape is also accepted.',
      typical_award:
        'Between £2,000 and £10,000. All funds must be spent and monitoring returned by 20 March 2027.',
      geographic_focus: 'Kirklees only. The money comes from Kirklees Council.',
      funder_tips:
        'This is a coordination fund, not a delivery fund, and the funder states its aim as making the ' +
        'local support system work better together so residents can access help faster and without falling ' +
        'through gaps. Frame the bid around what improves between organisations rather than what you will ' +
        'deliver alone. Groups can apply into both 2026 rounds regardless of whether they won the first. ' +
        'Monitoring is enforced: late or incorrectly completed returns are noted on your account and shown ' +
        'to future panels.',
      strong_application:
        'One Community assesses accounts closely. It looks for evidence the organisation can manage the sum ' +
        'requested, noting that a group with a typical income of £2,000 applying for £10,000 has to show it ' +
        'can handle the grant, and asks about high unrestricted reserves and any deficit. Explaining ' +
        'reserves and capacity up front removes the most common assessment objection.',
    },
  },
  'Community Grants Programme (Kirklees), Round 11': {
    spend_types: ['revenue'],
    brief: {
      how_to_apply:
        'Download the info pack from the One Community grants page and apply through their application form. You apply once to the Community Grants Programme rather than to each named fund, and the panel decides which fund fits. Enquiries go to Beata@one-community.org.uk.',
      what_they_fund:
        'Any purpose. Ten Kirklees funds are pooled and considered by one panel: JL Brierley, Hazel ' +
        'Charlesworth, Judith and Neil Charlesworth, Kirklees Community Fund, Stephen Wood Fund, Kirklees ' +
        'General Fund, Kirklees Police Fund, One Kirklees Parish Fund, Accept Cards Fund and the ' +
        'Heckmondwike Funds. All of them will consider project costs, core costs, and increased costs such ' +
        'as utilities arising from the cost-of-living crisis.',
      typical_award: 'Up to £3,000. Round 11 runs 21 September to 6 November 2026, with three further rounds in 2027.',
      geographic_focus:
        'Kirklees. Some of the pooled funds are tied to smaller areas, the Heckmondwike Funds among them.',
      funder_tips:
        'The unusual feature is core costs. Most small grants programmes fund projects only, and this one ' +
        'states plainly that every fund in the pool will consider applications for any purpose including ' +
        'core costs and utilities. If you need unrestricted money, say so rather than dressing it as a ' +
        'project. You apply once, not to each named fund, and the panel decides which fund fits.',
      strong_application:
        'One Community assesses accounts closely and looks for evidence the organisation can manage the sum ' +
        'requested, asking about high unrestricted reserves and any deficit. It also checks the proposed ' +
        'activity falls within your governing document objectives, so quote them if the fit is not obvious. ' +
        'Applications are refused outright from charities with qualified accounts, under Charity Commission ' +
        'investigation, or carrying an active regulatory warning.',
    },
  },
}

;(async () => {
  const { data: rows, error } = await db.from('scraped_grants')
    .select('id,title,funder_brief,field_provenance,apply_url')
    .eq('source', 'system:cf-yorkshire-2026-09-08')
  if (error) throw new Error(error.message)
  if (rows!.length !== 6) throw new Error(`expected 6 staged rows, found ${rows!.length}`)

  const now = new Date().toISOString()
  for (const r of rows!) {
    const e = BY_TITLE[r.title]
    if (!e) throw new Error(`no enrichment written for "${r.title}"`)

    const fp = (r.field_provenance ?? {}) as Record<string, { pinned?: boolean }>
    if (fp.funder_brief?.pinned) throw new Error(`${r.title}: funder_brief is PINNED. Stop and report.`)

    // Merge on top of what is there. Nothing already written is dropped.
    const merged = { ...(r.funder_brief as Record<string, unknown>), ...e.brief, source: SOURCE, last_enriched: now }
    const before = Object.keys(r.funder_brief as object).filter(k => !k.startsWith('_') && k !== 'source').length
    const after = Object.keys(merged).filter(k => !k.startsWith('_') && k !== 'source').length

    const fields: Record<string, unknown> = {
      funder_brief: merged,
      // True statement, not a fabricated cron stamp: every one of these pages was
      // fetched in this session and returned real content.
      url_status: 'ok',
      url_last_checked: now,
    }
    if (e.spend_types) fields.spend_types = e.spend_types

    if (!APPLY) { console.log(`DRY  ${r.title}\n     brief keys ${before} -> ${after}, spend_types ${JSON.stringify(e.spend_types ?? null)}`); continue }

    const res = await mergeGrantUpdate({ id: r.id, fields, source: SOURCE as never, db })
    const rejected = res.rejected.filter(x => x.reason !== 'idempotent')
    console.log(`OK   ${r.title}  brief ${before} -> ${after} keys${rejected.length ? `  REJECTED: ${JSON.stringify(rejected)}` : ''}`)
  }
})()
