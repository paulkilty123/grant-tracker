// City programmes, batch 1 — six staged, six reported.
// See docs/handoffs/programmes-cities-2026-09-08.md.
//
// The shape that pays in this job is the city's own infrastructure body: the
// CVS or Third Sector Interface that runs a free advice and training offer,
// restricted to organisations in that city, with an open route in. Five of the
// six cities carried no non-grant row at all, and this batch puts one in each
// of the six. It is deliberately one row per city rather than six from London.
//
// Each was read today with node's fetch (direct, no reader proxy) and each
// carries a verbatim eligibility sentence naming the city. All six came back
// clean from the SQL dedup over host, title words and funder against the whole
// table: none of these providers is in the catalogue in any state.
//
// Two judgement calls worth flagging for review:
//
//   Hackney CVS says on its own resources page that it has "a short term gap
//   in staffing" and cannot currently offer the full range of personalised
//   support, while still taking appointments for funding application help. It
//   is staged with that sentence in the description rather than hidden,
//   because the route in is open today, but it is the row most likely to
//   deserve a second look.
//
//   Community Works and Voscur both put SOME of their offer behind membership
//   or a fee. Both state a free tier for local organisations, which is what is
//   cited; the paid tier is named in exclusions so nobody arrives expecting
//   everything free.
//
// Reported, not staged: Brighton Resource Centre and GMCVO (both unreadable —
// bot wall or dead host, on fetch and browser alike), Plus X Innovation and
// Scale Up Brighton & Hove (no open route), Brighton & Hove Growth Hub (no
// programme page within two hops), and Bristol & Bath Regional Capital, where
// the domain guessed for it turns out to belong to the British Birds Rarities
// Committee.
//
//   npx tsx --env-file=.env.local scripts/programmes-cities-batch-01-2026-09-08.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { stampNewGrant } from '../src/lib/grant-merge'

const APPLY = process.argv.includes('--apply')
const SRC = 'system:programmes-cities-2026-09-08'

type Cit = Record<string, { snippet: string; confidence: 'high' | 'med' | 'low'; source_url?: string }>

const brief = (url: string, o: Record<string, string>, c: Cit) => ({
  source: 'live_fetch', last_enriched: '2026-09-08', ...o,
  _citations: Object.fromEntries(Object.entries(c).map(([k, v]) => [k, { ...v, source_url: v.source_url ?? url }])),
})

const CW = 'https://www.communityworks.org.uk/help-guidance/our-offer/'
const VOSCUR = 'https://voscur.org/1-2-1-support/'
const GCVS = 'https://gcvs.org.uk/support/funded-support/'
const EVOC = 'https://www.evoc.org.uk/need-help/'
const MACC = 'https://manchestercommunitycentral.org/support-groups'
const HCVS = 'https://hcvs.org.uk/resources/'

const NEW_ROWS: Record<string, unknown>[] = [
  {
    title: 'Community Works Advice and Training for Brighton and Hove',
    funder: 'Community Works',
    funder_type: 'capacity_builder',
    funding_type: 'in_kind',
    funding_subtypes: ['mentoring', 'training'],
    apply_url: CW,
    location_tag: 'Brighton and Hove', is_local: true,
    is_rolling: true,
    impact_sectors: ['community', 'social_economy'],
    target_beneficiaries: ['social_impact_orgs'],
    description: 'One to one advice and training for voluntary and community organisations across Brighton and Hove and Adur and Worthing. Advice covers choosing a legal structure, applying for funding, managing finances, policies and procedures, insurance and risk, and showing your impact. Training courses and workshops run through the year and many are free, with some charged. Support with recruiting and working with volunteers is offered alongside a volunteer coordinators forum.',
    eligibility_criteria: ['Voluntary or community organisation', 'Based in Brighton and Hove or Adur and Worthing', 'Some services are members only'],
    funder_brief: brief(CW, {
      who_can_apply: 'Voluntary and community organisations across Adur and Worthing and Brighton and Hove. Community Works is a membership organisation, and some services are open only to members, though its advice line and many training courses are open more widely.',
      what_they_fund: 'One to one advice on running a community group or voluntary organisation, covering legal structure, funding applications, finances, policies and procedures, insurance and risk, and impact. Training courses and workshops, many of them free. Help finding volunteers, plus a volunteer coordinators forum.',
      how_to_apply: 'Contact the team by email at info@communityworks.org.uk or by phone on 01273 234023. Training is booked through the events listing.',
      exclusions: 'Not everything is free or open to all. Members get exclusive access to some services, including training courses, conferences, newsletters and email groups, and some training is charged for.',
      open_status: 'open', location_tag: 'Brighton and Hove', geographic_focus: 'Brighton and Hove, and Adur and Worthing.',
    }, {
      who_can_apply: { snippet: 'Advice, support, learning and networking opportunities to voluntary and community organisations across Adur & Worthing and Brighton & Hove', confidence: 'high' },
      what_they_fund: { snippet: 'Got a question? Get one-to-one advice about running your community group or voluntary organisation.', confidence: 'high' },
      how_to_apply: { snippet: 'We are happy to help, so get in touch with us by email info@communityworks.org.uk or by phone 01273 234023', confidence: 'high' },
      exclusions: { snippet: 'Our members benefit from exclusive access to some of our services, including training courses, conferences, newsletters and email groups.', confidence: 'high' },
    }),
  },
  {
    title: 'Voscur One to One Support for Bristol VCSE Organisations',
    funder: 'Voscur',
    funder_type: 'capacity_builder',
    funding_type: 'in_kind',
    funding_subtypes: ['mentoring', 'training'],
    apply_url: VOSCUR,
    location_tag: 'Bristol', is_local: true,
    is_rolling: true,
    impact_sectors: ['community', 'social_economy'],
    target_beneficiaries: ['social_impact_orgs'],
    description: 'One to one advice, training and consultancy for voluntary, community and social enterprise organisations in and around Bristol, from the city\'s local support and development agency. A local VCSE organisation that is also a Voscur member gets at least 30 minutes of free support and advice, and further free support is available depending on the size and type of organisation and the area it serves. Free support is aimed first at organisations from communities experiencing the greatest disadvantage. Voscur also runs the VCSE Academy training courses and a social enterprise support service.',
    eligibility_criteria: ['Voluntary, community or social enterprise organisation', 'Based in or around Bristol', 'Free tier depends on size, type and area served'],
    funder_brief: brief(VOSCUR, {
      who_can_apply: 'Local voluntary, community and social enterprise organisations and groups in and around Bristol. A local VCSE organisation that is also a Voscur member receives at least 30 minutes of free support and advice, with further free advice, support, training and consultancy depending on the size and type of the organisation and the area it serves.',
      what_they_fund: 'Advice on funding, volunteer management, training, governance and other topics, delivered through one to one advice sessions, more bespoke consultancy, social enterprise support, and the VCSE Academy course programme.',
      how_to_apply: 'Get in touch through the form on the one to one support page, saying what you need support with, or call 0117 909 9949.',
      exclusions: 'Not all of it is free. Some services are free depending on the size and type of the organisation, other options are paid for, and Voscur members get a discount.',
      open_status: 'open', location_tag: 'Bristol', geographic_focus: 'Bristol and the surrounding area.',
    }, {
      who_can_apply: { snippet: 'If you are a local VCSE sector organisation or group, as well as a Voscur member, you will be able to receive at least 30 minutes of free support and advice.', confidence: 'high' },
      what_they_fund: { snippet: 'There are a variety of support options available, from one-to-one advice sessions to more bespoke consultancy work.', confidence: 'high' },
      how_to_apply: { snippet: 'Tell us what you need support with and we will get back to you as soon as possible. Alternatively you can reach us on: 0117 909 9949', confidence: 'high' },
      exclusions: { snippet: 'Some of our services are free of charge (depending on the size and type of your organisation) and other paid-for options are available.', confidence: 'high' },
    }),
  },
  {
    title: 'GCVS Funded Support for Glasgow Voluntary Organisations',
    funder: 'Glasgow Council for the Voluntary Sector (GCVS)',
    funder_type: 'capacity_builder',
    funding_type: 'in_kind',
    funding_subtypes: ['mentoring', 'training'],
    apply_url: GCVS,
    location_tag: 'Glasgow', is_local: true,
    is_rolling: true,
    impact_sectors: ['community', 'social_economy'],
    target_beneficiaries: ['social_impact_orgs'],
    description: 'Free and reduced cost advice, guidance and training for third sector organisations based in or operating in the Glasgow City local authority area, funded by Glasgow City Council. Organisations register once through a short form to get access. Registered organisations also get 30 per cent off the GCVS HR and health and safety subscription service. GCVS states the funded support is limited, so it is worth registering early rather than at the point of need.',
    eligibility_criteria: ['Third or voluntary sector organisation', 'Based in or operating in the Glasgow City local authority area', 'Registration required'],
    funder_brief: brief(GCVS, {
      who_can_apply: 'Third and voluntary sector organisations based in or operating in the Glasgow City local authority area. GCVS states the funded support is limited. Organisations across Glasgow City and the wider region can separately apply for GCVS membership, which carries its own benefits.',
      what_they_fund: 'Free and reduced cost advice, guidance and training, funded by Glasgow City Council, plus a 30 per cent discount on the HR and health and safety subscription service once registered.',
      how_to_apply: 'Register through the short form on the funded support page, then use the account dashboard to access the support.',
      exclusions: 'Restricted to the Glasgow City local authority area and explicitly limited in volume. Other GCVS services, including payroll and HR subscriptions, are paid for.',
      open_status: 'open', location_tag: 'Glasgow', geographic_focus: 'Glasgow City local authority area.',
    }, {
      who_can_apply: { snippet: 'This support is for third/voluntary sector organisations operating in the Glasgow City local authority area and provides access to advice and training.', confidence: 'high' },
      what_they_fund: { snippet: 'GCVS are currently supported by Glasgow City Council to provide free and reduced-cost advice, guidance and training.', confidence: 'high' },
      how_to_apply: { snippet: "Click 'Register for Funded Support' to register and complete a short form.", confidence: 'high' },
      exclusions: { snippet: "Our 'funded support for Glasgow' is restricted to organisations based in or operating in the Glasgow City local authority area, and is limited.", confidence: 'high' },
    }),
  },
  {
    title: 'EVOC Free Advice and Governance Training for Edinburgh Organisations',
    funder: 'Edinburgh Voluntary Organisations Council (EVOC)',
    funder_type: 'capacity_builder',
    funding_type: 'in_kind',
    funding_subtypes: ['mentoring', 'training'],
    apply_url: EVOC,
    location_tag: 'Edinburgh', is_local: true,
    is_rolling: true,
    impact_sectors: ['community', 'social_economy'],
    target_beneficiaries: ['social_impact_orgs'],
    description: 'Free advice for community groups and organisations based in Edinburgh on setting up, running and funding an organisation, including help with governing documents and policies. Groups that are not yet constituted can also get help. Governance training is funded for Edinburgh based organisations, with a small charge for those outside the city. Requests go through an Ask for Help form and the team aims to reply within 10 working days.',
    eligibility_criteria: ['Community group or organisation based in Edinburgh', 'Groups not yet formally constituted are also helped', 'Organisations outside Edinburgh are referred to their own Third Sector Interface'],
    funder_brief: brief(EVOC, {
      who_can_apply: 'Community groups and organisations based in Edinburgh, including groups that are not yet a formal organisation. Organisations outside the city are pointed to the Third Sector Interface for their own area.',
      what_they_fund: 'Free advice on setting up, running and funding an organisation, covering the process of becoming a charity, governing documents and other policies. Funded governance training for Edinburgh based organisations, and a wider training course programme.',
      how_to_apply: 'Use the Ask for Help button on the page and fill in the form. EVOC aims to reply within 10 working days.',
      exclusions: 'The free advice and the funded governance training are for Edinburgh. Organisations outside the city pay a small charge for training and are referred elsewhere for advice.',
      open_status: 'open', location_tag: 'Edinburgh', geographic_focus: 'City of Edinburgh.',
    }, {
      who_can_apply: { snippet: 'we can provide free advice to community groups and organisations based in Edinburgh. Don’t worry if you’re not an organisation yet, we can still help.', confidence: 'high' },
      what_they_fund: { snippet: 'Whether it is setting up, running or funding your organisation, we can provide free advice to community groups and organisations based in Edinburgh.', confidence: 'high' },
      how_to_apply: { snippet: "For help or support, click the ‘Ask for Help’ button below and fill in the form. One of our friendly team will aim to get back to you within 10 working days.", confidence: 'high' },
      exclusions: { snippet: 'We deliver funded governance training for those based in Edinburgh with a small charge for those out with the city.', confidence: 'high' },
    }),
  },
  {
    title: 'Macc Capacity Building Support for Manchester VCSE Organisations',
    funder: 'Macc (Manchester Community Central)',
    funder_type: 'capacity_builder',
    funding_type: 'in_kind',
    funding_subtypes: ['mentoring', 'training'],
    apply_url: MACC,
    location_tag: 'Manchester', is_local: true,
    is_rolling: true,
    impact_sectors: ['community', 'social_economy'],
    target_beneficiaries: ['social_impact_orgs'],
    description: 'Group development support for voluntary, community and social enterprise organisations that benefit Manchester residents, delivered by Macc through Manchester Community Central. Support comes as bespoke one to one help plus training, alongside a co-ordinated calendar of other training across the city. A weekly online drop in runs every Friday from 11am to 12pm, bookable as a 15 minute slot, and there is an information line on 0333 321 3021.',
    eligibility_criteria: ['Voluntary, community or social enterprise organisation', 'Work benefits Manchester residents'],
    funder_brief: brief(MACC, {
      who_can_apply: 'Local voluntary, community and social enterprise organisations whose work benefits Manchester residents.',
      what_they_fund: 'Group development support to build capacity and sustainability, delivered as bespoke one to one support and training, plus a co-ordinated calendar of relevant training from across the city, factsheets, policy templates and governance resources.',
      how_to_apply: 'Book a 15 minute slot at the weekly online drop in, held every Friday from 11am to 12pm, or call the information line on 0333 321 3021.',
      exclusions: 'The page states no exclusions. The one condition it sets is that the organisation benefits Manchester residents.',
      open_status: 'open', location_tag: 'Manchester', geographic_focus: 'City of Manchester.',
    }, {
      who_can_apply: { snippet: 'The Capacity Building Team provides group development support to build the capacity and sustainability of local voluntary, community and social enterprise organisations which benefit Manchester residents.', confidence: 'high' },
      what_they_fund: { snippet: 'This is available through bespoke, one-to-one support and our training and we co-ordinate a training calendar of other, relevant training opportunities from across the city.', confidence: 'high' },
      how_to_apply: { snippet: 'Weekly online drop-in sessions – Every Friday at 11am-12pm, we are holding a weekly online drop-in VCSE groups in Manchester. Book a 15 minute online meeting for a chat with our friendly team.', confidence: 'high' },
      exclusions: { snippet: 'organisations which benefit Manchester residents', confidence: 'med' },
    }),
  },
  {
    title: 'Hackney CVS Organisational Development Support',
    funder: 'Hackney CVS',
    funder_type: 'capacity_builder',
    funding_type: 'in_kind',
    funding_subtypes: ['mentoring', 'office_space'],
    apply_url: HCVS,
    location_tag: 'London', is_local: true,
    is_rolling: true,
    impact_sectors: ['community', 'social_economy'],
    target_beneficiaries: ['social_impact_orgs'],
    description: 'Organisational development support for voluntary and community sector organisations in Hackney and the City of London, alongside resources on governance, communications, impact and technology, and hot desks, meeting rooms and office space to hire. Note the caveat on the page: Hackney CVS says it has a short term gap in staffing and cannot currently offer its full range of personalised support, though it is still taking appointments to help strengthen a funding application.',
    eligibility_criteria: ['Voluntary or community sector organisation', 'Based in Hackney or the City of London'],
    funder_brief: brief(HCVS, {
      who_can_apply: 'Voluntary and community sector organisations in Hackney and the City of London.',
      what_they_fund: 'Organisational development support, plus resource sets on governance, communications and marketing, impact and evaluation, and IT. Hot desks, meeting rooms and office space are available to hire.',
      how_to_apply: 'Book an appointment through the support pages. At the time of reading, appointments were being taken specifically for help strengthening a funding application.',
      exclusions: 'The full personalised support offer is paused. Hackney CVS states a short term gap in staffing and says its full service will return, without giving a date. Room and desk hire is a paid service.',
      open_status: 'open', location_tag: 'London', geographic_focus: 'London boroughs of Hackney and the City of London.',
    }, {
      who_can_apply: { snippet: 'We support voluntary and community sector (VCS) organisations in Hackney and the City of London to amplify their voices, connect and collaborate, and access the resources they need to thrive.', confidence: 'high', source_url: 'https://hcvs.org.uk/' },
      what_they_fund: { snippet: 'As part of our work for a better resourced voluntary and community sector, we offer organisational development support.', confidence: 'high' },
      how_to_apply: { snippet: 'If you need help to strengthen a funding application, please book an appointment here.', confidence: 'high' },
      exclusions: { snippet: 'We have a short term gap in staffing and are currently unable to offer the full range of personalised support.', confidence: 'high' },
    }),
  },
]

/**
 * Clashes the SQL dedup already surfaced and a human already judged NOT to be
 * the same thing. The in-script guard below matches on host, which over-flags
 * by design: a host is shared by everything a provider publishes, including
 * other organisations' documents hosted on it.
 *
 * Each entry has to name the row and say why it is different, so that clearing
 * a clash is a recorded decision rather than a silenced check.
 */
const CLEARED: Record<string, { id: string; why: string }> = {
  'Community Works Advice and Training for Brighton and Hove': {
    id: '2ae2a048-a10f-4777-9b13-86c24c7ddbc2',
    why: 'Host match only. That row is Brighton & Hove City Council\'s VCFS grant scheme, archived, and its apply_url is a prospectus PDF that happens to be hosted on communityworks.org.uk. A council grant scheme is not Community Works\' own advice and training service.',
  },
}

async function main() {
  const db = getAdminDb()
  console.log(`programmes-cities batch 1 — ${APPLY ? 'APPLY' : 'DRY RUN'} — ${NEW_ROWS.length} rows to stage`)
  console.log(`  source: ${SRC} (trust 50, so a Re-enrich in review can still overwrite)\n`)

  for (const row of NEW_ROWS) {
    const title = String(row.title)
    const host = new URL(String(row.apply_url)).host
    // Belt and braces on top of the SQL dedup already run: refuse to insert if
    // anything in the table shares this host or the head of this title.
    const { data: byHost } = await db.from('scraped_grants').select('id, title, pipeline_state').ilike('apply_url', `%${host}%`)
    const { data: byTitle } = await db.from('scraped_grants').select('id, title, pipeline_state').ilike('title', `${title.slice(0, 20)}%`)
    const cleared = CLEARED[title]
    const clash = [...(byHost ?? []), ...(byTitle ?? [])].filter(c => c.id !== cleared?.id)
    if (cleared) console.log(`  cleared clash on ${cleared.id}: ${cleared.why}`)
    if (clash.length) {
      console.log(`  SKIP ${title}\n       already in the table: ${clash.map(c => `${c.id} ${c.title} (${c.pipeline_state})`).join(' | ')}`)
      continue
    }
    console.log(`  ${String(row.location_tag).padEnd(18)} ${title}`)
    console.log(`       ${row.apply_url}`)
    if (!APPLY) continue
    const stamped = { ...stampNewGrant({ ...row, source: SRC, is_active: false }, SRC), pipeline_state: 'tagged_awaiting_review' as const }
    const { data, error } = await db.from('scraped_grants').insert(stamped).select('id').single()
    if (error) console.log(`       FAILED: ${error.message}`)
    else console.log(`       staged ${data.id}`)
  }

  // The count this job is allowed to have moved: rows staged under this source.
  const { count } = await db.from('scraped_grants').select('id', { count: 'exact', head: true })
    .eq('pipeline_state', 'tagged_awaiting_review').eq('source', SRC)
  console.log(`\n  rows staged under ${SRC}: ${count}`)
}
main().catch(e => { console.error(e); process.exit(1) })
