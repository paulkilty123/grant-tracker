// ─────────────────────────────────────────────────────────────────────────────
// Grant crawler — fetches live, open grant opportunities from UK sources
// and stores them in the scraped_grants Supabase table.
//
// Sources:
//   1.  GOV.UK Find a Grant             (www.find-government-grants.service.gov.uk)
//   2.  National Lottery Community Fund  (www.tnlcommunityfund.org.uk)
//   3.  UKRI live opportunity calls      (www.ukri.org/opportunity/)
//   4.  GLA / City Hall London           (www.london.gov.uk/programmes-strategies/search-funding)
//   5.  Arts Council England             (www.artscouncil.org.uk/our-open-funds)
//   6.  Sport England                    (www.sportengland.org/funding-and-campaigns/our-funding)
//   7.  National Lottery Heritage Fund   (www.heritagefund.org.uk/funding)
//   8.  Forever Manchester               (forevermanchester.com/funding)
//   9.  Two Ridings Community Foundation (tworidingscf.org.uk/apply-for-funding)
//  10.  Community Foundation Wales       (communityfoundationwales.org.uk/grants)
//  11.  Quartet Community Foundation     (quartetcf.org.uk/apply-for-funding/apply-for-a-grant)
//  12.  Community Foundation NI          (communityfoundationni.org/achieving-impact/available-grants)
//  13.  Heart of England CF              (heartofenglandcf.co.uk/grants)
//  14.  Foundation Scotland              (foundationscotland.org.uk/apply-for-funding/funding-available)
//  15.  London Community Foundation      (londoncf.org.uk — grants sitemap)
//  16.  Sussex Community Foundation      (sussexcommunityfoundation.org/grants/how-to-apply)
//  17.  Community Foundation for Surrey  (cfsurrey.org.uk/apply)
//  18.  Hants & IoW Community Foundation (hiwcf.org.uk/grants-for-groups)
//  19.  Oxfordshire Community Foundation (oxfordshire.org/ocfgrants)
//  20.  Asda Foundation                  (asdafoundation.org/our-grants)
//  21.  Aviva Foundation                 (avivafoundation.org.uk)
//  22.  Nationwide Foundation            (nationwidefoundation.org.uk/our-programmes)
//  23.  Community Foundation Tyne & Wear (communityfoundation.org.uk/apply)
//  24.  Norfolk Community Foundation     (norfolkfoundation.com/funding-support/grants/groups)
//  25.  Suffolk Community Foundation     (suffolkcf.org.uk/current-grants)
//  26.  Community Foundation Merseyside  (cfmerseyside.org.uk/our-grants)
//  27.  BBC Children in Need             (bbcchildreninneed.co.uk/grants — hardcoded rolling)
//  28.  Gloucestershire Community Foundation (gloucestershirecf.org.uk/grants)
//  29.  Heart of Bucks Community Foundation  (heartofbucks.org/apply-for-a-grant)
//  30.  LLR Community Foundation             (llrcommunityfoundation.org.uk/our-grants/apply-for-a-grant)
//  31.  MK Community Foundation              (mkcommunityfoundation.co.uk/apply-for-a-grant — hardcoded tiers)
//  32.  Community Foundation for Lancashire  (lancsfoundation.org.uk/our-grants?grant-category=open)
//  33.  Cambridgeshire Community Foundation  (cambscf.org.uk/funds)
//  34.  Hertfordshire Community Foundation   (hertscf.org.uk/grant-making)
// ─────────────────────────────────────────────────────────────────────────────

import { createClient }  from '@supabase/supabase-js'
import { parse as parseHTML } from 'node-html-parser'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export interface ScrapedGrant {
  external_id:          string
  source:               string
  title:                string
  funder:               string | null
  funder_type:          string | null
  description:          string | null
  amount_min:           number | null
  amount_max:           number | null
  deadline:             string | null   // ISO date string or null
  is_rolling:           boolean
  is_local:             boolean
  sectors:              string[]
  eligibility_criteria: string[]
  apply_url:            string | null
  raw_data:             Record<string, unknown>
}

export interface CrawlResult {
  source:    string
  fetched:   number
  upserted:  number
  error?:    string
}

// ── Shared HTTP helper ────────────────────────────────────────────────────────
async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'GrantTracker/1.0', 'Accept': 'text/html,*/*' },
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`${url} returned ${res.status}`)
  return res.text()
}

// ── Source toggle ─────────────────────────────────────────────────────────────
// Set DISABLED_SOURCES env var to a comma-separated list of source IDs to skip.
// e.g. DISABLED_SOURCES=lincolnshire_cf,kent_cf
const DISABLED_SOURCES = new Set(
  (process.env.DISABLED_SOURCES ?? '').split(',').map(s => s.trim()).filter(Boolean)
)
function guarded(source: string, fn: () => Promise<CrawlResult>): Promise<CrawlResult> {
  if (DISABLED_SOURCES.has(source)) {
    return Promise.resolve({ source, fetched: 0, upserted: 0, error: 'disabled' })
  }
  return fn()
}

// ── Source 1: GOV.UK Find a Grant ─────────────────────────────────────────────
// Scrapes all pages of find-government-grants.service.gov.uk, extracting the
// embedded Next.js __NEXT_DATA__ JSON from each page.
async function crawlGovUK(): Promise<CrawlResult> {
  const SOURCE = 'gov_uk'
  const BASE   = 'https://www.find-government-grants.service.gov.uk/grants'

  try {
    const html1     = await fetchHtml(`${BASE}?page=1`)
    const data1     = extractNextData(html1)
    const pp1       = data1.props.pageProps as Record<string, unknown>
    const page1Grants = (pp1.searchResult as Record<string, unknown>[]) ?? []
    const total     = Number(pp1.totalGrants ?? 0)
    const perPage   = page1Grants.length || 10
    const pages     = Math.ceil(total / perPage)

    const rest = await Promise.allSettled(
      Array.from({ length: pages - 1 }, (_, i) =>
        fetchHtml(`${BASE}?page=${i + 2}`)
          .then(html => {
            const d = extractNextData(html)
            return (d.props.pageProps as Record<string, unknown>).searchResult as Record<string, unknown>[]
          })
      )
    )

    const all: Record<string, unknown>[] = [
      ...page1Grants,
      ...rest.flatMap(r => r.status === 'fulfilled' ? r.value : []),
    ]

    return await upsertGrants(SOURCE, all.map(normaliseFindAGrant))
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

function extractNextData(html: string): { props: { pageProps: Record<string, unknown> } } {
  const match = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
    ?? html.match(/<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/)
  if (!match?.[1]) throw new Error('No Next.js page data found')
  return JSON.parse(match[1])
}

function normaliseFindAGrant(g: Record<string, unknown>): ScrapedGrant {
  const label       = String(g.label ?? g.id ?? Math.random())
  const locations   = Array.isArray(g.grantLocation)    ? g.grantLocation    as string[] : []
  const applicants  = Array.isArray(g.grantApplicantType) ? g.grantApplicantType as string[] : []

  return {
    external_id:          `gov_uk_${label}`,
    source:               'gov_uk',
    title:                String(g.grantName ?? 'Untitled Grant'),
    funder:               String(g.grantFunder ?? 'UK Government'),
    funder_type:          'government',
    description:          String(g.grantShortDescription ?? g.grantDescription ?? ''),
    amount_min:           typeof g.grantMinimumAward === 'number' ? g.grantMinimumAward : null,
    amount_max:           typeof g.grantMaximumAward === 'number' ? g.grantMaximumAward : null,
    deadline:             parseDeadline(g.grantApplicationCloseDate),
    is_rolling:           false,
    is_local:             locations.length > 0 && !locations.includes('All of United Kingdom'),
    sectors:              [],
    eligibility_criteria: applicants,
    apply_url:            `https://www.find-government-grants.service.gov.uk/grants/${label}`,
    raw_data:             g,
  }
}

// ── Source 2: National Lottery Community Fund ─────────────────────────────────
// Scrapes the TNLCF funding programmes listing page.
// Each card has a programme title, description, location, amount range, and status.
// Only "Open" programmes are included.
async function crawlTNLCF(): Promise<CrawlResult> {
  const SOURCE = 'tnlcf'
  const URL    = 'https://www.tnlcommunityfund.org.uk/funding/funding-programmes'

  try {
    const html  = await fetchHtml(URL)
    const root  = parseHTML(html)
    const cards = root.querySelectorAll('.card.mb-4')
    const grants: ScrapedGrant[] = []

    for (const card of cards) {
      const title   = card.querySelector('h2, h3, h4, .card-title')?.text?.trim()
      const desc    = card.querySelector('.card-body p, p')?.text?.trim() ?? ''
      const href    = card.querySelector('a')?.getAttribute('href') ?? ''
      if (!title || !href) continue

      const fullUrl = href.startsWith('http') ? href : `https://www.tnlcommunityfund.org.uk${href}`
      const cardText = card.text ?? ''

      // Extract metadata from inline text labels
      const location  = cardText.match(/Project location:\s*([^\n]+)/)?.[1]?.trim() ?? null
      const amountStr = cardText.match(/Amount:\s*([^\n]+)/)?.[1]?.trim() ?? ''
      const status    = cardText.match(/Programme status:\s*([^\n]+)/)?.[1]?.trim() ?? ''

      // Skip programmes that aren't currently open
      if (status && !/open|accepting/i.test(status)) continue

      const { min, max } = parseAmountRange(amountStr)

      grants.push({
        external_id:          `tnlcf_${href.split('/').pop() ?? Math.random()}`,
        source:               SOURCE,
        title,
        funder:               'National Lottery Community Fund',
        funder_type:          'lottery',
        description:          desc,
        amount_min:           min,
        amount_max:           max,
        deadline:             null,   // TNLCF programmes are rolling
        is_rolling:           true,
        is_local:             !!location && !/uk.wide|uk wide|all/i.test(location),
        sectors:              [],
        eligibility_criteria: location ? [`Open to: ${location}`] : [],
        apply_url:            fullUrl,
        raw_data:             { title, location, amountStr, status } as Record<string, unknown>,
      })
    }

    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 3: UKRI live opportunity calls ─────────────────────────────────────
// Scrapes ukri.org/opportunity/ — live open funding calls from UKRI councils.
// WordPress custom post type, paginated at /opportunity/page/N/.
async function crawlUKRI(): Promise<CrawlResult> {
  const SOURCE = 'ukri'
  const BASE   = 'https://www.ukri.org/opportunity'

  try {
    const html1  = await fetchHtml(`${BASE}/`)
    const root1  = parseHTML(html1)

    // Find total page count — extract number from href (e.g. /opportunity/page/12/)
    // because the link text is "Page\n12" with a hidden span, making parseInt unreliable
    const pageNums = root1
      .querySelectorAll('.page-numbers a')
      .map(a => { const m = (a.getAttribute('href') ?? '').match(/\/page\/(\d+)\//); return m ? parseInt(m[1]) : NaN })
      .filter(n => !isNaN(n))
    const lastPage = Math.max(...pageNums, 1)

    // Fetch remaining pages in parallel
    const rest = await Promise.allSettled(
      Array.from({ length: lastPage - 1 }, (_, i) =>
        fetchHtml(`${BASE}/page/${i + 2}/`).then(h => parseHTML(h))
      )
    )

    const allRoots = [root1, ...rest.flatMap(r => r.status === 'fulfilled' ? [r.value] : [])]
    const grants: ScrapedGrant[] = []

    for (const root of allRoots) {
      for (const card of root.querySelectorAll('div.opportunity')) {
        const titleEl = card.querySelector('.entry-header a, h2 a, h3 a')
        const title   = titleEl?.text?.trim()
        const url     = titleEl?.getAttribute('href') ?? ''
        if (!title) continue

        const desc = card.querySelector('.entry-content')?.text?.trim() ?? ''

        // Parse DL key→value metadata
        const dts  = card.querySelectorAll('dt')
        const dds  = card.querySelectorAll('dd')
        const meta: Record<string, string> = {}
        dts.forEach((dt, i) => {
          const key = dt.text.trim().replace(/:$/, '')
          meta[key] = dds[i]?.text?.trim() ?? ''
        })

        const status    = meta['Opportunity status'] ?? ''
        // Skip past/closed opportunities
        if (/closed/i.test(status)) continue

        const funder    = meta['Funders'] ?? 'UKRI'
        const maxAward  = parsePoundAmount(meta['Maximum award'] ?? '')
        const totalFund = parsePoundAmount(meta['Total fund'] ?? '')
        const closing   = parseUKRIDate(meta['Closing date'] ?? '')

        grants.push({
          external_id:          `ukri_${slugify(url)}`,
          source:               SOURCE,
          title,
          funder,
          funder_type:          'government',
          description:          desc,
          amount_min:           null,
          amount_max:           maxAward ?? totalFund,
          deadline:             closing,
          is_rolling:           false,
          is_local:             false,
          sectors:              [],
          eligibility_criteria: status ? [`Status: ${status}`] : [],
          apply_url:            url || null,
          raw_data:             meta as Record<string, unknown>,
        })
      }
    }

    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 4: GLA / City Hall London ──────────────────────────────────────────
// Scrapes london.gov.uk/programmes-strategies/search-funding
// Cards are <li><div class="resource_teaser card">; metadata in .resource_details
// with <h4> labels and .field__item values.
async function crawlGLA(): Promise<CrawlResult> {
  const SOURCE = 'gla'
  const URL    = 'https://www.london.gov.uk/programmes-strategies/search-funding'

  try {
    const html  = await fetchHtml(URL)
    const root  = parseHTML(html)
    // Each grant card has class resource_teaser (among others)
    const cards = root.querySelectorAll('.resource_teaser')
    const grants: ScrapedGrant[] = []

    for (const card of cards) {
      // Title lives in h3 > .field--name-title .field__item  (data-search-highlight attr)
      const title = card.querySelector('.field--name-title .field__item')?.text?.trim()
                 ?? card.querySelector('h3 .field__item')?.text?.trim()
      if (!title) continue

      // Build metadata map: h4 label → .field__item value(s) from .resource_details
      const meta: Record<string, string[]> = {}
      for (const field of card.querySelectorAll('.resource_details .field')) {
        const label  = field.querySelector('h4')?.text?.trim().replace(/:$/, '') ?? ''
        if (!label) continue
        const values = field.querySelectorAll('.field__item').map(el => el.text.trim()).filter(Boolean)
        if (values.length) meta[label] = values
      }

      const summary   = meta['Summary']?.[0]                    ?? ''
      const amountRaw = meta['How much you can apply for']?.[0]  ?? ''
      const who       = meta['Who can apply']                    ?? []
      const theme     = meta['Theme']?.[0]                       ?? ''
      const closing   = meta['Closing date']?.[0]                ?? ''

      // Detail URL: the <a> link inside the card
      const href = card.querySelector('a')?.getAttribute('href') ?? ''
      const url  = href.startsWith('http') ? href : `https://www.london.gov.uk${href}`
      const slug = href.split('/').filter(Boolean).pop() ?? slugify(title)

      const { min, max } = parseAmountRange(amountRaw)

      grants.push({
        external_id:          `gla_${slug}`,
        source:               SOURCE,
        title,
        funder:               'Greater London Authority',
        funder_type:          'government',
        description:          summary,
        amount_min:           min,
        amount_max:           max,
        deadline:             parseUKRIDate(closing),
        is_rolling:           !closing,
        is_local:             true,
        sectors:              theme ? [theme] : [],
        eligibility_criteria: who,
        apply_url:            url || null,
        raw_data:             { title, amountRaw, who, closing, theme } as Record<string, unknown>,
      })
    }

    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 5: Arts Council England open funds ─────────────────────────────────
// Scrapes artscouncil.org.uk/our-open-funds
// Open funds are in the first .page-section that contains h2 "Our open funds".
// Each fund is a div.card__body with h3.card-heading > a (title/link) and a <p> (desc).
async function crawlArtsCouncil(): Promise<CrawlResult> {
  const SOURCE = 'arts_council'
  const BASE   = 'https://www.artscouncil.org.uk'
  const URL    = `${BASE}/our-open-funds`

  try {
    const html = await fetchHtml(URL)
    const root = parseHTML(html)

    // Find the section labelled "Our open funds" (not "Recently closed funds")
    let openSection = null
    for (const section of root.querySelectorAll('.page-section')) {
      const h2 = section.querySelector('h2')?.text?.trim() ?? ''
      if (/our open funds/i.test(h2)) { openSection = section; break }
    }
    // Fallback: scan all card__body if sections not found
    const searchRoot = openSection ?? root

    const grants: ScrapedGrant[] = []

    for (const card of searchRoot.querySelectorAll('.card__body')) {
      const linkEl = card.querySelector('.card-heading a')
      const title  = linkEl?.text?.trim()
      if (!title) continue

      const href = linkEl?.getAttribute('href') ?? ''
      const url  = href.startsWith('http') ? href : `${BASE}${href}`
      const slug = href.split('/').filter(Boolean).pop() ?? slugify(title)

      // Description: <p> inside the card body
      const desc = card.querySelector('p')?.text?.trim() ?? ''

      grants.push({
        external_id:          `ace_${slug}`,
        source:               SOURCE,
        title,
        funder:               'Arts Council England',
        funder_type:          'lottery',
        description:          desc,
        amount_min:           null,
        amount_max:           null,
        deadline:             null,
        is_rolling:           true,
        is_local:             false,
        sectors:              ['arts', 'culture', 'heritage'],
        eligibility_criteria: [],
        apply_url:            url || null,
        raw_data:             { title, href, desc } as Record<string, unknown>,
      })
    }

    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 8: Forever Manchester (Greater Manchester) ─────────────────────────
// Scrapes forevermanchester.com/funding/
// Open funds are in .text-side wrappers under the "Funds open for applications"
// section. Closed/not-open funds use different container classes and are excluded.
async function crawlForeverManchester(): Promise<CrawlResult> {
  const SOURCE = 'forever_manchester'
  const BASE   = 'https://forevermanchester.com'
  const URL    = `${BASE}/funding/`

  try {
    const html  = await fetchHtml(URL)
    const root  = parseHTML(html)
    const grants: ScrapedGrant[] = []

    for (const block of root.querySelectorAll('.text-side')) {
      const title = block.querySelector('h3')?.text?.trim()
      if (!title) continue

      const descRaw = block.querySelector('p')?.text?.trim() ?? ''
      const href    = block.querySelector('a')?.getAttribute('href') ?? ''
      const url     = href.startsWith('http') ? href : `${BASE}${href}`
      const slug    = href.split('/').filter(Boolean).pop() ?? slugify(title)

      // Deadline is embedded in description: "Closes: March 5, 2026 12 Noon"
      const deadlineMatch = descRaw.match(/closes?:?\s*([A-Za-z]+\s+\d+,?\s+\d{4})/i)
      const deadline = deadlineMatch ? parseDeadline(deadlineMatch[1]) : null

      grants.push({
        external_id:          `forever_manchester_${slug}`,
        source:               SOURCE,
        title,
        funder:               'Forever Manchester',
        funder_type:          'community_foundation',
        description:          descRaw,
        amount_min:           null,
        amount_max:           null,
        deadline,
        is_rolling:           !deadline,
        is_local:             true,
        sectors:              ['community', 'social welfare'],
        eligibility_criteria: ['Greater Manchester based organisations'],
        apply_url:            url || null,
        raw_data:             { title, descRaw, href } as Record<string, unknown>,
      })
    }

    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 9: Two Ridings Community Foundation (Yorkshire) ────────────────────
// Scrapes tworidingscf.org.uk/apply-for-funding/
// Open funds are inside div.funds-open, each in a .box.fund-box card.
// Title: h3.no-margin, description: .padding div, link: a.read-more
async function crawlTwoRidingsCF(): Promise<CrawlResult> {
  const SOURCE = 'two_ridings_cf'
  const BASE   = 'https://tworidingscf.org.uk'
  const URL    = `${BASE}/apply-for-funding/`

  try {
    const html       = await fetchHtml(URL)
    const root       = parseHTML(html)
    const openSection = root.querySelector('.funds-open')
    if (!openSection) return { source: SOURCE, fetched: 0, upserted: 0, error: 'No .funds-open section found' }

    const grants: ScrapedGrant[] = []

    for (const box of openSection.querySelectorAll('.box.fund-box')) {
      const title = box.querySelector('h3')?.text?.trim()
      if (!title) continue

      const desc = box.querySelector('.padding')?.text?.trim() ?? ''
      const href = box.querySelector('a.read-more')?.getAttribute('href') ?? ''
      const url  = href.startsWith('http') ? href : `${BASE}${href}`
      const slug = href.split('/').filter(Boolean).pop() ?? slugify(title)

      grants.push({
        external_id:          `two_ridings_cf_${slug}`,
        source:               SOURCE,
        title,
        funder:               'Two Ridings Community Foundation',
        funder_type:          'community_foundation',
        description:          desc,
        amount_min:           null,
        amount_max:           null,
        deadline:             null,
        is_rolling:           true,
        is_local:             true,
        sectors:              ['community', 'social welfare', 'environment'],
        eligibility_criteria: ['North & East Yorkshire based organisations'],
        apply_url:            url || null,
        raw_data:             { title, desc, href } as Record<string, unknown>,
      })
    }

    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 10: Community Foundation Wales ─────────────────────────────────────
// Uses the WordPress grant sitemap (grant-sitemap.xml) as the data source —
// the HTML grants page is JS-rendered so the sitemap is more reliable.
// Derives grant title from the URL slug (slug-to-title-case conversion).
async function crawlCFWales(): Promise<CrawlResult> {
  const SOURCE  = 'cf_wales'
  const BASE    = 'https://communityfoundationwales.org.uk'
  const SITEMAP = `${BASE}/grant-sitemap.xml`

  try {
    const xml    = await fetchHtml(SITEMAP)
    const grants: ScrapedGrant[] = []

    // Extract all <loc> URLs from the sitemap XML using exec loop (matchAll compat)
    const locRe = /<loc>([^<]+)<\/loc>/g
    let match: RegExpExecArray | null
    while ((match = locRe.exec(xml)) !== null) {
      const url = match[1].trim()
      // Skip the archive index page itself
      if (!url.includes('/grants/') || url.endsWith('/grants/')) continue

      const slug  = url.split('/').filter(Boolean).pop() ?? ''
      // Convert slug to title case: "ashley-family-foundation" → "Ashley Family Foundation"
      const title = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

      grants.push({
        external_id:          `cf_wales_${slug}`,
        source:               SOURCE,
        title,
        funder:               'Community Foundation Wales',
        funder_type:          'community_foundation',
        description:          '',
        amount_min:           null,
        amount_max:           null,
        deadline:             null,
        is_rolling:           true,
        is_local:             true,
        sectors:              ['community', 'social welfare'],
        eligibility_criteria: ['Wales based organisations'],
        apply_url:            url,
        raw_data:             { slug, url } as Record<string, unknown>,
      })
    }

    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 6: Sport England ───────────────────────────────────────────────────
// Scrapes sportengland.org/funding-and-campaigns/our-funding
// Active funds are in .txt-img-cont sections with an h2 title and p description.
// Historic/closed sections are excluded by title matching.
async function crawlSportEngland(): Promise<CrawlResult> {
  const SOURCE = 'sport_england'
  const BASE   = 'https://www.sportengland.org'
  const URL    = `${BASE}/funding-and-campaigns/our-funding`

  // Sections to skip — not active grant programmes
  const SKIP = /historic|impact|priorities|charter|work in places|latest news/i

  try {
    const html  = await fetchHtml(URL)
    const root  = parseHTML(html)
    const grants: ScrapedGrant[] = []

    for (const section of root.querySelectorAll('.txt-img-cont')) {
      const title = section.querySelector('h2')?.text?.trim()
      if (!title || SKIP.test(title)) continue

      const desc = section.querySelector('p')?.text?.trim() ?? ''
      const href = section.querySelector('a')?.getAttribute('href') ?? ''
      const url  = href.startsWith('http') ? href : `${BASE}${href}`
      const slug = href.split('/').filter(Boolean).pop() ?? slugify(title)

      const { min, max } = parseAmountRange(desc)

      grants.push({
        external_id:          `sport_england_${slug}`,
        source:               SOURCE,
        title,
        funder:               'Sport England',
        funder_type:          'lottery',
        description:          desc,
        amount_min:           min,
        amount_max:           max,
        deadline:             null,
        is_rolling:           true,
        is_local:             false,
        sectors:              ['sport', 'physical activity', 'health'],
        eligibility_criteria: [],
        apply_url:            url || null,
        raw_data:             { title, desc, href } as Record<string, unknown>,
      })
    }

    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 7: National Lottery Heritage Fund ──────────────────────────────────
// Scrapes heritagefund.org.uk/funding
// Programme cards use .search-result__title (title + link) and
// .search-result__content (description). Amount range is embedded in the title.
async function crawlHeritageFund(): Promise<CrawlResult> {
  const SOURCE = 'heritage_fund'
  const BASE   = 'https://www.heritagefund.org.uk'
  const URL    = `${BASE}/funding`

  try {
    const html  = await fetchHtml(URL)
    const root  = parseHTML(html)
    const grants: ScrapedGrant[] = []

    for (const titleEl of root.querySelectorAll('.search-result__title')) {
      const linkEl = titleEl.querySelector('a')
      const title  = linkEl?.text?.trim()
      if (!title) continue

      const href = linkEl?.getAttribute('href') ?? ''
      const url  = href.startsWith('http') ? href : `${BASE}${href}`
      const slug = href.split('/').filter(Boolean).pop() ?? slugify(title)

      // Description is in the sibling .search-result__content
      const parent = titleEl.parentNode
      const desc   = parent?.querySelector('.search-result__content')?.text?.trim() ?? ''

      // Parse amount range from title — e.g. "£10,000 to £250,000"
      const { min, max } = parseAmountRange(title)

      grants.push({
        external_id:          `heritage_fund_${slug}`,
        source:               SOURCE,
        title,
        funder:               'National Lottery Heritage Fund',
        funder_type:          'lottery',
        description:          desc,
        amount_min:           min,
        amount_max:           max,
        deadline:             null,
        is_rolling:           true,
        is_local:             false,
        sectors:              ['heritage', 'culture', 'community', 'environment'],
        eligibility_criteria: [],
        apply_url:            url || null,
        raw_data:             { title, href, desc } as Record<string, unknown>,
      })
    }

    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 11: Quartet Community Foundation (Bristol & South West) ────────────
// The grants listing page is JS-rendered (FacetWP/AJAX), so uses the Yoast SEO
// custom_grant-sitemap.xml as the data source — same pattern as CF Wales / London CF.
// Derives grant title from the URL slug.
async function crawlQuartetCF(): Promise<CrawlResult> {
  const SOURCE  = 'quartet_cf'
  const BASE    = 'https://quartetcf.org.uk'
  const SITEMAP = `${BASE}/custom_grant-sitemap.xml`

  try {
    const xml    = await fetchHtml(SITEMAP)
    const grants: ScrapedGrant[] = []

    const locRe = /<loc>([^<]+)<\/loc>/g
    let match: RegExpExecArray | null
    while ((match = locRe.exec(xml)) !== null) {
      const url = match[1].trim()
      if (!url.includes('/grants/') || url.endsWith('/grants/') || url.endsWith('/grants')) continue

      const slug  = url.split('/').filter(Boolean).pop() ?? ''
      const title = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

      grants.push({
        external_id:          `quartet_cf_${slug}`,
        source:               SOURCE,
        title,
        funder:               'Quartet Community Foundation',
        funder_type:          'community_foundation',
        description:          '',
        amount_min:           null,
        amount_max:           null,
        deadline:             null,
        is_rolling:           true,
        is_local:             true,
        sectors:              ['community', 'social welfare'],
        eligibility_criteria: ['West of England (Bristol, Bath & NE Somerset, N Somerset, S Gloucestershire)'],
        apply_url:            url,
        raw_data:             { slug, url } as Record<string, unknown>,
      })
    }

    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 12: Community Foundation for Northern Ireland ──────────────────────
// Scrapes communityfoundationni.org/achieving-impact/available-grants/
// Each grant row uses Bootstrap class "row d-md-flex justify-content-md-end".
// Left col has closing date and grant size; right col has title, description, link.
async function crawlCFNI(): Promise<CrawlResult> {
  const SOURCE = 'cf_ni'
  const BASE   = 'https://communityfoundationni.org'
  const URL    = `${BASE}/achieving-impact/available-grants/`

  try {
    const html  = await fetchHtml(URL)
    const root  = parseHTML(html)
    const grants: ScrapedGrant[] = []

    for (const row of root.querySelectorAll('.row.d-md-flex')) {
      const title = row.querySelector('h2')?.text?.trim()
      if (!title) continue

      const rowText = row.text ?? ''

      // Right col: description and link
      const rightCol = row.querySelector('.col-lg-7')
      const desc     = rightCol?.querySelector('p')?.text?.trim() ?? ''
      const href     = rightCol?.querySelector('a')?.getAttribute('href') ?? ''
      const url      = href.startsWith('http') ? href : `${BASE}${href}`
      const slug     = href.split('/').filter(Boolean).pop() ?? slugify(title)

      // Parse closing date from left-column text: "Closing Date: Mar 5, 2026 13:00"
      const closingMatch = rowText.match(/Closing Date:\s*([A-Za-z]+ \d+,?\s*\d{4})/)
      const deadline     = closingMatch ? parseDeadline(closingMatch[1]) : null

      // Parse grant size: "Grants up to £1,750" / "up to £10,000"
      const sizeMatch = rowText.match(/£([\d,]+)/)
      const amount    = sizeMatch ? parsePoundAmount(`£${sizeMatch[1]}`) : null

      grants.push({
        external_id:          `cf_ni_${slug}`,
        source:               SOURCE,
        title,
        funder:               'Community Foundation for Northern Ireland',
        funder_type:          'community_foundation',
        description:          desc,
        amount_min:           null,
        amount_max:           amount,
        deadline,
        is_rolling:           !deadline,
        is_local:             true,
        sectors:              ['community', 'social welfare'],
        eligibility_criteria: ['Northern Ireland based organisations'],
        apply_url:            url || null,
        raw_data:             { title, desc, href, deadline } as Record<string, unknown>,
      })
    }

    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 13: Heart of England Community Foundation (West Midlands) ──────────
// Scrapes heartofenglandcf.co.uk/grants/
// Uses Divi builder — each grant row is a .et_pb_row div containing an h2 title.
// Max grant and deadline are extracted by regex from the row text.
async function crawlHeartOfEnglandCF(): Promise<CrawlResult> {
  const SOURCE = 'heart_of_england_cf'
  const BASE   = 'https://www.heartofenglandcf.co.uk'
  const URL    = `${BASE}/grants/`

  try {
    const html  = await fetchHtml(URL)
    const root  = parseHTML(html)
    const grants: ScrapedGrant[] = []

    for (const row of root.querySelectorAll('.et_pb_row')) {
      const title = row.querySelector('h2')?.text?.trim()
      if (!title) continue

      const rowText = row.text ?? ''

      // Max grant: "Maximum Grant: £2,000"
      const maxMatch = rowText.match(/Maximum Grant:\s*(£[\d,]+)/)
      const amount   = maxMatch ? parsePoundAmount(maxMatch[1]) : null

      // Deadline: "Deadline: Rolling Programme" or a date
      const deadlineRaw = rowText.match(/Deadline:\s*([^\n]+)/)?.[1]?.trim() ?? ''
      const isRolling   = /rolling/i.test(deadlineRaw)
      const deadline    = isRolling ? null : parseDeadline(deadlineRaw)

      // Supporting (sector): "Supporting: Disadvantage or social exclusion"
      const supporting = rowText.match(/Supporting:\s*([^\n]+)/)?.[1]?.trim() ?? ''

      const slug = slugify(title)

      grants.push({
        external_id:          `heart_of_england_cf_${slug}`,
        source:               SOURCE,
        title,
        funder:               'Heart of England Community Foundation',
        funder_type:          'community_foundation',
        description:          supporting,
        amount_min:           null,
        amount_max:           amount,
        deadline,
        is_rolling:           isRolling,
        is_local:             true,
        sectors:              supporting ? [supporting.toLowerCase()] : ['community'],
        eligibility_criteria: ['West Midlands based organisations'],
        apply_url:            URL,
        raw_data:             { title, deadlineRaw, maxMatch: maxMatch?.[1], supporting } as Record<string, unknown>,
      })
    }

    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 14: Foundation Scotland ────────────────────────────────────────────
// Scrapes foundationscotland.org.uk/apply-for-funding/funding-available/
// Grant cards use class ".card-inner"; title and link are in the h3 > a element.
// Grant size and area are extracted by regex from the card text.
async function crawlFoundationScotland(): Promise<CrawlResult> {
  const SOURCE = 'foundation_scotland'
  const BASE   = 'https://foundationscotland.org.uk'
  const URL    = `${BASE}/apply-for-funding/funding-available/`

  try {
    const html  = await fetchHtml(URL)
    const root  = parseHTML(html)
    const grants: ScrapedGrant[] = []

    for (const card of root.querySelectorAll('.card-inner')) {
      const linkEl = card.querySelector('h3 a') ?? card.querySelector('a')
      const title  = linkEl?.text?.trim()
      if (!title) continue

      const href = linkEl?.getAttribute('href') ?? ''
      const url  = href.startsWith('http') ? href : `${BASE}${href}`
      const slug = href.split('/').filter(Boolean).pop() ?? slugify(title)

      const cardText = card.text ?? ''

      // "Grant size: Up to £10,000"
      const sizeRaw  = cardText.match(/Grant size:\s*([^\n]+)/)?.[1]?.trim() ?? ''
      const { min, max } = parseAmountRange(sizeRaw)

      // "Area: Highland" / "Area: All of Scotland"
      const area      = cardText.match(/Area:\s*([^\n]+)/)?.[1]?.trim() ?? ''
      const isNational = /all of scotland|scotland.wide|national/i.test(area)

      // Description: first <p> in the card
      const desc = card.querySelector('p')?.text?.trim() ?? ''

      grants.push({
        external_id:          `foundation_scotland_${slug}`,
        source:               SOURCE,
        title,
        funder:               'Foundation Scotland',
        funder_type:          'community_foundation',
        description:          desc,
        amount_min:           min,
        amount_max:           max,
        deadline:             null,
        is_rolling:           true,
        is_local:             !isNational,
        sectors:              ['community', 'social welfare', 'environment'],
        eligibility_criteria: area ? [`Area: ${area}`] : ['Scotland based organisations'],
        apply_url:            url || null,
        raw_data:             { title, sizeRaw, area, desc } as Record<string, unknown>,
      })
    }

    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 15: London Community Foundation ────────────────────────────────────
// The available-grants page is JS-rendered, so uses the grants section sitemap
// (sitemaps-1-section-grants-1-sitemap.xml) as the data source.
// Derives grant title from the URL slug (same pattern as CF Wales).
async function crawlLondonCF(): Promise<CrawlResult> {
  const SOURCE  = 'london_cf'
  const BASE    = 'https://londoncf.org.uk'
  const SITEMAP = `${BASE}/sitemaps-1-section-grants-1-sitemap.xml`

  try {
    const xml    = await fetchHtml(SITEMAP)
    const grants: ScrapedGrant[] = []

    const locRe = /<loc>([^<]+)<\/loc>/g
    let match: RegExpExecArray | null
    while ((match = locRe.exec(xml)) !== null) {
      const url = match[1].trim()
      if (!url.includes('/grants/') || url.endsWith('/grants/') || url.endsWith('/grants')) continue

      const slug  = url.split('/').filter(Boolean).pop() ?? ''
      const title = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

      grants.push({
        external_id:          `london_cf_${slug}`,
        source:               SOURCE,
        title,
        funder:               'London Community Foundation',
        funder_type:          'community_foundation',
        description:          '',
        amount_min:           null,
        amount_max:           null,
        deadline:             null,
        is_rolling:           true,
        is_local:             true,
        sectors:              ['community', 'social welfare'],
        eligibility_criteria: ['London based organisations'],
        apply_url:            url,
        raw_data:             { slug, url } as Record<string, unknown>,
      })
    }

    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 16: Sussex Community Foundation ────────────────────────────────────
// Scrapes two pages:
//   - /grants/how-to-apply/additional-grants/ — named fund sections (h2 headings)
//   - /grants/how-to-apply/main-grants/       — one entry for the main programme
// Funds don't have individual page URLs; apply_url points to the listing page.
async function crawlSussexCF(): Promise<CrawlResult> {
  const SOURCE = 'sussex_cf'
  const BASE   = 'https://sussexcommunityfoundation.org'

  // h2 headings that are navigation/boilerplate (not fund names)
  const SKIP_H2 = /^(apply|get in touch|subscribe|how it|check|guidance|geographical|our fund|our stor)/i

  try {
    const grants: ScrapedGrant[] = []

    // ── Additional named funds ──
    const addHtml = await fetchHtml(`${BASE}/grants/how-to-apply/additional-grants/`)
    const addRoot = parseHTML(addHtml)
    const ADDURL  = `${BASE}/grants/how-to-apply/additional-grants/`

    for (const h2 of addRoot.querySelectorAll('h2')) {
      const title = h2.text?.trim().replace(/\.$/, '')
      if (!title || title.length < 5 || SKIP_H2.test(title)) continue
      const slug = slugify(title)
      grants.push({
        external_id:          `sussex_cf_${slug}`,
        source:               SOURCE,
        title,
        funder:               'Sussex Community Foundation',
        funder_type:          'community_foundation',
        description:          '',
        amount_min:           null,
        amount_max:           null,
        deadline:             null,
        is_rolling:           true,
        is_local:             true,
        sectors:              ['community', 'social welfare'],
        eligibility_criteria: ['Sussex based organisations'],
        apply_url:            ADDURL,
        raw_data:             { title, page: 'additional-grants' } as Record<string, unknown>,
      })
    }

    // ── Main grants programme — one composite entry ──
    const mainUrl = `${BASE}/grants/how-to-apply/main-grants/`
    grants.push({
      external_id:          'sussex_cf_main-grants-programme',
      source:               SOURCE,
      title:                'Main Grants Programme',
      funder:               'Sussex Community Foundation',
      funder_type:          'community_foundation',
      description:          'Supports grassroots and community organisations across Sussex with four priorities: Tackling Poverty, Improving Health, Reaching Potential, Acting on Climate.',
      amount_min:           null,
      amount_max:           null,
      deadline:             null,
      is_rolling:           true,
      is_local:             true,
      sectors:              ['community', 'social welfare', 'health', 'environment'],
      eligibility_criteria: ['Sussex based organisations'],
      apply_url:            mainUrl,
      raw_data:             { page: 'main-grants' } as Record<string, unknown>,
    })

    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 17: Community Foundation for Surrey ────────────────────────────────
// Scrapes cfsurrey.org.uk/apply — programme names are in h2 headings on the page.
// Filters to actual grant programme headings (Main Grants Programme, Other Grant
// Programmes) and adds an entry for the Crisis Funding programme (currently open).
async function crawlSurreyCF(): Promise<CrawlResult> {
  const SOURCE   = 'surrey_cf'
  const BASE     = 'https://www.cfsurrey.org.uk'
  const APPLYURL = `${BASE}/apply`

  // Known Surrey grant programmes — scraped from the /apply page
  // (page uses a deadline table rather than individual fund pages)
  const PROGRAMMES = [
    {
      id:    'main-grants-programme',
      title: 'Main Grants Programme',
      desc:  'Surrey\'s main grants round for community organisations. EOIs open to charitable organisations, community groups and other VCSE sector bodies.',
      sectors: ['community', 'social welfare'],
    },
    {
      id:    'strategic-transformation-fund',
      title: 'Strategic Transformation Fund',
      desc:  'Larger grants supporting significant organisational development or transformation for Surrey-based charities.',
      sectors: ['community', 'social welfare'],
    },
    {
      id:    'crisis-funding',
      title: 'Grants for Crisis Funding',
      desc:  'Responsive crisis grants for charities and groups supporting people in acute need in Surrey. Currently open.',
      sectors: ['community', 'social welfare', 'health'],
    },
    {
      id:    'grants-for-individuals',
      title: 'Grants for Individuals',
      desc:  'Grants to support individuals in financial hardship in Surrey. Currently open.',
      sectors: ['social welfare'],
    },
  ]

  try {
    // Confirm page is live before returning hardcoded grants
    await fetchHtml(APPLYURL)

    const grants: ScrapedGrant[] = PROGRAMMES.map(p => ({
      external_id:          `surrey_cf_${p.id}`,
      source:               SOURCE,
      title:                p.title,
      funder:               'Community Foundation for Surrey',
      funder_type:          'community_foundation',
      description:          p.desc,
      amount_min:           null,
      amount_max:           null,
      deadline:             null,
      is_rolling:           true,
      is_local:             true,
      sectors:              p.sectors,
      eligibility_criteria: ['Surrey based organisations or individuals'],
      apply_url:            APPLYURL,
      raw_data:             { id: p.id } as Record<string, unknown>,
    }))

    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 18: Hampshire & Isle of Wight Community Foundation ─────────────────
// Scrapes hiwcf.org.uk/grants-for-groups/ — Elementor SSR page.
// Each grant is an h3 heading: "MONTH\nTitle – OPEN|CLOSED".
// Only OPEN grants are included. Walks up the DOM tree to find the parent
// container holding "Grant size:" text and the "Find out more" link.
async function crawlHIWCF(): Promise<CrawlResult> {
  const SOURCE = 'hiwcf'
  const BASE   = 'https://hiwcf.org.uk'
  const URL    = `${BASE}/grants-for-groups/`

  try {
    const html  = await fetchHtml(URL)
    // Decode common HTML entities so our text matching works
    const clean = html.replace(/&#8211;/g, '–').replace(/&nbsp;/g, ' ')
    const root  = parseHTML(clean)
    const grants: ScrapedGrant[] = []
    const seen  = new Set<string>()

    for (const h3 of root.querySelectorAll('h3')) {
      const rawText = (h3.text ?? '').replace(/\s+/g, ' ').trim()
      // Only process OPEN grants
      if (!rawText.includes('OPEN')) continue

      // Title is the part between the month prefix and the status marker
      const titleMatch = rawText.match(/(?:[A-Z]{3,}\s+)?(.+?)\s*[–-]\s*OPEN\s*$/i)
      const title = titleMatch?.[1]?.trim()
      if (!title || seen.has(title)) continue
      seen.add(title)

      // Walk up the parent chain to find the container with Grant size and link
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let node: any = h3.parentNode
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let container: any = null
      for (let i = 0; i < 10; i++) {
        if (!node) break
        if ((node.text ?? '').includes('Grant size:') && node.querySelector('a')) {
          container = node
          break
        }
        node = node.parentNode
      }

      const containerText = (container?.text ?? '').replace(/&#8211;/g, '–')
      const sizeMatch     = containerText.match(/Grant size:\s*([\d£,–\s-]+?)(?=Location:|Find out|$)/i)
      const sizeRaw       = sizeMatch?.[1]?.trim().replace(/–/g, '-') ?? ''
      const { min, max }  = parseAmountRange(sizeRaw)

      const linkEl = container?.querySelector('a')
      const href   = linkEl?.getAttribute('href') ?? ''
      const url    = href.startsWith('http') ? href : href ? `${BASE}${href}` : URL
      const slug   = href.split('/').filter(Boolean).pop() ?? slugify(title)

      grants.push({
        external_id:          `hiwcf_${slug}`,
        source:               SOURCE,
        title,
        funder:               'Hampshire & Isle of Wight Community Foundation',
        funder_type:          'community_foundation',
        description:          '',
        amount_min:           min,
        amount_max:           max,
        deadline:             null,
        is_rolling:           true,
        is_local:             true,
        sectors:              ['community', 'social welfare'],
        eligibility_criteria: ['Hampshire & Isle of Wight based organisations'],
        apply_url:            url,
        raw_data:             { title, sizeRaw, href } as Record<string, unknown>,
      })
    }

    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 19: Oxfordshire Community Foundation ───────────────────────────────
// Scrapes oxfordshire.org/ocfgrants/ — WordPress SSR page.
// Individual grant pages live at /ocf_grants/<slug>/ and are linked with
// "Find out more" anchors. Title is taken from the nearest preceding h2/h3.
async function crawlOxfordshireCF(): Promise<CrawlResult> {
  const SOURCE = 'oxfordshire_cf'
  const BASE   = 'https://oxfordshire.org'
  const URL    = `${BASE}/ocfgrants/`

  try {
    const html  = await fetchHtml(URL)
    const root  = parseHTML(html)
    const grants: ScrapedGrant[] = []
    const seen  = new Set<string>()

    for (const a of root.querySelectorAll('a')) {
      const href = a.getAttribute('href') ?? ''
      if (!href.includes('/ocf_grants/') || href.endsWith('/ocf_grants/')) continue
      if (seen.has(href)) continue
      seen.add(href)

      const slug = href.split('/').filter(Boolean).pop() ?? ''
      const url  = href.startsWith('http') ? href : `${BASE}${href}`

      // Walk up the parent chain to find a heading (h2/h3) for the title
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let node: any = a.parentNode
      let title = ''
      for (let i = 0; i < 8; i++) {
        if (!node) break
        const heading = node.querySelector('h2') ?? node.querySelector('h3')
        if (heading?.text?.trim()) {
          title = heading.text.trim()
          break
        }
        node = node.parentNode
      }
      // Fall back to slug-derived title
      if (!title) title = slug.replace(/-\d+$/, '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

      grants.push({
        external_id:          `oxfordshire_cf_${slug}`,
        source:               SOURCE,
        title,
        funder:               'Oxfordshire Community Foundation',
        funder_type:          'community_foundation',
        description:          '',
        amount_min:           null,
        amount_max:           null,
        deadline:             null,
        is_rolling:           true,
        is_local:             true,
        sectors:              ['community', 'social welfare'],
        eligibility_criteria: ['Oxfordshire based organisations'],
        apply_url:            url,
        raw_data:             { slug, href } as Record<string, unknown>,
      })
    }

    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 20: Asda Foundation ────────────────────────────────────────────────
// Community grant programmes from asdafoundation.org.
// Both the listing page and individual grant pages are JS-rendered, so
// grant entries are hardcoded from browser inspection. Only community-facing
// programmes are included (colleague-only programmes are excluded).
async function crawlAsdaFoundation(): Promise<CrawlResult> {
  const SOURCE  = 'asda_foundation'
  const BASE    = 'https://asdafoundation.org'
  const LISTURL = `${BASE}/our-grants/`

  const GRANTS = [
    {
      id:    'local-community-spaces-fund',
      title: 'Local Community Spaces Fund',
      desc:  'Supports grassroots community groups throughout the UK to repair, renovate and develop community spaces — providing a safe place for people to meet and be together. Grants of £10,000–£20,000.',
      min:   10000,
      max:   20000,
    },
    {
      id:    'foodbank-fundamentals-fund',
      title: 'Foodbank Fundamentals Fund',
      desc:  'Supports foodbanks and similar food-poverty organisations with grants for essential equipment and operational infrastructure. Grants up to £750.',
      min:   null,
      max:   750,
    },
    {
      id:    'young-futures-fund',
      title: 'Young Futures Fund',
      desc:  'Supports grassroots groups focused on improving mental health and wellbeing for teenagers aged 13–18 in local communities. Grants of £500–£1,000.',
      min:   500,
      max:   1000,
    },
  ]

  try {
    // Confirm the grants listing page is live before returning hardcoded entries
    await fetchHtml(LISTURL)

    const grants: ScrapedGrant[] = GRANTS.map(g => ({
      external_id:          `asda_foundation_${g.id}`,
      source:               SOURCE,
      title:                g.title,
      funder:               'Asda Foundation',
      funder_type:          'corporate_foundation',
      description:          g.desc,
      amount_min:           g.min,
      amount_max:           g.max,
      deadline:             null,
      is_rolling:           true,
      is_local:             false,
      sectors:              ['community', 'social welfare'],
      eligibility_criteria: ['UK registered charities and community groups'],
      apply_url:            `${BASE}/our-grants/${g.id}/`,
      raw_data:             { id: g.id } as Record<string, unknown>,
    }))

    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 21: Aviva Foundation ───────────────────────────────────────────────
// Two grant funds from avivafoundation.org.uk — Financial Futures Fund and
// Communities Fund. The homepage is SSR but fund details are JS-rendered;
// entries are hardcoded from browser inspection.
async function crawlAvivaFoundation(): Promise<CrawlResult> {
  const SOURCE      = 'aviva_foundation'
  const BASE        = 'https://www.avivafoundation.org.uk'
  const HOMEPAGEURL = `${BASE}/`

  const FUNDS = [
    {
      id:      'financial-futures-fund',
      title:   'Financial Futures Fund',
      desc:    'Funds long-term solutions that improve financial resilience across the UK — building financial confidence and capability, improving access to fair and inclusive financial services, and tackling systemic barriers. Distributes £3 million in grants annually.',
      sectors: ['financial inclusion', 'social welfare'],
    },
    {
      id:      'communities-fund',
      title:   'Communities Fund',
      desc:    'Supports communities when it matters most — focused on building community resilience, providing emergency support, and strengthening local support networks across the UK.',
      sectors: ['community', 'social welfare'],
    },
  ]

  try {
    // Confirm homepage is live before returning hardcoded entries
    await fetchHtml(HOMEPAGEURL)

    const grants: ScrapedGrant[] = FUNDS.map(f => ({
      external_id:          `aviva_foundation_${f.id}`,
      source:               SOURCE,
      title:                f.title,
      funder:               'Aviva Foundation',
      funder_type:          'corporate_foundation',
      description:          f.desc,
      amount_min:           null,
      amount_max:           null,
      deadline:             null,
      is_rolling:           true,
      is_local:             false,
      sectors:              f.sectors,
      eligibility_criteria: ['UK registered charities and community organisations'],
      apply_url:            `${BASE}/${f.id}/`,
      raw_data:             { id: f.id } as Record<string, unknown>,
    }))

    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 22: Nationwide Foundation ─────────────────────────────────────────
// Three housing-focused grant programmes from nationwidefoundation.org.uk.
// The /our-programmes/ listing page is JS-rendered; programme URLs and titles
// are hardcoded from browser inspection of the live page.
async function crawlNationwideFoundation(): Promise<CrawlResult> {
  const SOURCE  = 'nationwide_foundation'
  const BASE    = 'https://nationwidefoundation.org.uk'
  const LISTURL = `${BASE}/our-programmes/`

  const PROGRAMMES = [
    {
      id:    'nurturing-ideas-for-change-to-the-housing-system',
      title: 'Nurturing Ideas to Change the Housing System',
      desc:  'Funds innovative ideas and approaches that could transform the housing system for people in housing need in the UK, including research, pilot projects, and advocacy for systemic change.',
      sectors: ['housing', 'social welfare'],
    },
    {
      id:    'backing-community-led-housing',
      title: 'Backing Community-Led Housing',
      desc:  'Supports community-led housing projects that provide genuinely affordable homes and empower communities to shape their own local housing and neighbourhoods.',
      sectors: ['housing', 'community'],
    },
    {
      id:    'transforming-the-private-rented-sector',
      title: 'Transforming the Private Rented Sector',
      desc:  'Funds work to improve conditions, security and rights for tenants in the private rented sector, including policy advocacy, tenant support and sector-wide reform efforts.',
      sectors: ['housing', 'social welfare'],
    },
  ]

  try {
    // Confirm programmes page is reachable before returning hardcoded entries
    await fetchHtml(LISTURL)

    const grants: ScrapedGrant[] = PROGRAMMES.map(p => ({
      external_id:          `nationwide_foundation_${p.id}`,
      source:               SOURCE,
      title:                p.title,
      funder:               'Nationwide Foundation',
      funder_type:          'corporate_foundation',
      description:          p.desc,
      amount_min:           null,
      amount_max:           null,
      deadline:             null,
      is_rolling:           true,
      is_local:             false,
      sectors:              p.sectors,
      eligibility_criteria: ['UK registered charities and organisations working on housing issues'],
      apply_url:            `${BASE}/our-programmes/${p.id}/`,
      raw_data:             { id: p.id } as Record<string, unknown>,
    }))

    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 23: Community Foundation Tyne & Wear and Northumberland ────────────
// Scrapes communityfoundation.org.uk/apply/ — SSR listing of open grant funds.
// Each card has a /grants/slug/ link. We fetch individual pages for full details
// (max amount, locations, description). Runs 17 parallel page fetches.
async function crawlTyneWearCF(): Promise<CrawlResult> {
  const SOURCE  = 'tyne_wear_cf'
  const BASE    = 'https://www.communityfoundation.org.uk'
  const LISTURL = `${BASE}/apply/`

  try {
    // Step 1: Get all open grant URLs from the listing page
    const listHtml = await fetchHtml(LISTURL)
    const listRoot = parseHTML(listHtml)

    const entries = listRoot
      .querySelectorAll('a[href*="/grants/"]')
      .map(a => {
        const href = a.getAttribute('href') ?? ''
        const url  = href.startsWith('http') ? href : `${BASE}${href}`
        const slug = href.split('/').filter(Boolean).pop() ?? ''
        return { url, slug }
      })
      .filter(e => e.slug)

    if (entries.length === 0) return { source: SOURCE, fetched: 0, upserted: 0 }

    // Step 2: Fetch all individual grant pages in parallel
    const pages = await Promise.allSettled(
      entries.map(async ({ url, slug }) => {
        const html = await fetchHtml(url)
        const root = parseHTML(html)
        const main = root.querySelector('main') ?? root

        const title = main.querySelector('h1')?.text?.trim() ?? slug

        // "Max Grant Size: £3000" — present on most pages
        const mainText  = main.text
        const maxMatch  = mainText.match(/Max Grant Size:\s*(£[\d,]+)/i)
        const amountMax = maxMatch ? parsePoundAmount(maxMatch[1]) : parseAmountRange(mainText.slice(0, 600)).max

        // "Location(s): Gateshead, Newcastle, ..."
        const locMatch = mainText.match(/Location\(s\):\s*([^\n]+)/i)
        const location = locMatch ? locMatch[1].replace(/\s+/g, ' ').trim() : null

        // Rolling vs deadline
        const isRolling = /rolling/i.test(mainText.slice(0, 400))
        let deadline: string | null = null
        if (!isRolling) {
          const dlMatch = mainText.match(/deadline[^:]*:\s*(\d{1,2}\s+\w+\s+\d{4})/i)
          if (dlMatch) deadline = parseDeadline(dlMatch[1])
        }

        // Description — first paragraph after "About ..." heading, or first substantive paragraph
        const aboutH  = [...main.querySelectorAll('h2, h3')].find(h => /about/i.test(h.text))
        const descEl  = aboutH?.nextElementSibling ?? main.querySelectorAll('p')[3]
        const desc    = descEl?.text?.trim() ?? ''

        // Rough sector inference from title + description
        const combined = (title + ' ' + desc).toLowerCase()
        const sectors: string[] = ['community']
        if (/health|wellbeing|mental health/.test(combined)) sectors.push('health')
        if (/young people|children|youth/.test(combined))    sectors.push('young people')
        if (/arts|culture|creative/.test(combined))          sectors.push('arts')
        if (/environment|green|sustainab/.test(combined))    sectors.push('environment')
        if (/sport|physical|active/.test(combined))          sectors.push('sport')
        if (/education|learn|school/.test(combined))         sectors.push('education')
        if (/hardship|poverty|disadvantage/.test(combined))  sectors.push('social welfare')
        if (/housing|home/.test(combined))                   sectors.push('housing')
        if (/enterprise|business|start.?up/.test(combined))  sectors.push('enterprise')

        return {
          external_id:          `tyne_wear_cf_${slug}`,
          source:               SOURCE,
          title,
          funder:               'Community Foundation Tyne & Wear and Northumberland',
          funder_type:          'community_foundation',
          description:          desc,
          amount_min:           null,
          amount_max:           amountMax,
          deadline,
          is_rolling:           isRolling,
          is_local:             true,
          sectors,
          eligibility_criteria: location ? [`Located in: ${location}`] : [],
          apply_url:            url,
          raw_data:             { slug, location } as Record<string, unknown>,
        } as ScrapedGrant
      })
    )

    const grants = pages
      .filter(p => p.status === 'fulfilled')
      .map(p => (p as PromiseFulfilledResult<ScrapedGrant>).value)
      .filter(g => g.title)

    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 24: Norfolk Community Foundation ───────────────────────────────────
// Scrapes norfolkfoundation.com/funding-support/grants/groups/ — SSR listing.
// All metadata (max grant, area, deadline) is embedded in the listing page cards.
async function crawlNorfolkCF(): Promise<CrawlResult> {
  const SOURCE  = 'norfolk_cf'
  const BASE    = 'https://www.norfolkfoundation.com'
  const LISTURL = `${BASE}/funding-support/grants/groups/`
  const SKIP    = /fund filter|quick links|interested|talk to|cookie/i

  try {
    const html = await fetchHtml(LISTURL)
    const root = parseHTML(html)
    const grants: ScrapedGrant[] = []

    for (const h3 of root.querySelectorAll('h3').filter(h => !SKIP.test(h.text))) {
      const title = h3.text.trim()
      if (!title) continue

      // Link for this fund
      const linkEl = h3.querySelector('a') ?? h3.nextElementSibling?.querySelector('a')
      const href   = linkEl?.getAttribute('href') ?? ''
      const url    = href.startsWith('http') ? href : href ? `${BASE}${href}` : LISTURL
      const slug   = href.split('/').filter(Boolean).pop() ?? slugify(title)

      // Aggregate sibling text until the next H3
      let blockText = ''
      let sib = h3.nextElementSibling
      while (sib && sib.tagName !== 'H3') {
        blockText += ' ' + sib.text
        sib = sib.nextElementSibling
      }

      // "Maximum Grant £5,000" or "Maximum Grant Over £5,000"
      const maxMatch  = blockText.match(/Maximum Grant\s*(£[\d,]+|Over\s+£[\d,]+)/i)
      const amountMax = maxMatch ? parsePoundAmount(maxMatch[1].replace(/Over\s+/i, '')) : null

      // "Area [districts...]"
      const areaMatch = blockText.match(/Area\s+([A-Za-z][^\n]{2,80?})(?=Deadline|Maximum|Find out|\s{3,})/i)
      const area      = areaMatch ? areaMatch[1].replace(/\s+/g, ' ').trim() : 'Norfolk'

      // "Deadline 12 March 2026"
      const dlMatch  = blockText.match(/Deadline\s+(\d{1,2}\s+\w+\s+\d{4})/i)
      const deadline = dlMatch ? parseDeadline(dlMatch[1]) : null

      // Brief description: text following the deadline/area structured block
      const descMatch = blockText.match(/(?:\d{4}|Area\s+[^\n]+)\s{2,}([\s\S]{30,}?)(?:\s{3,}|Find out|$)/i)
      const desc      = (descMatch?.[1] ?? '').replace(/\s+/g, ' ').trim().slice(0, 400)

      const combined = (title + ' ' + desc).toLowerCase()
      const sectors: string[] = ['community']
      if (/health|wellbeing|mental/.test(combined))       sectors.push('health')
      if (/young people|children|youth|club/.test(combined)) sectors.push('young people')
      if (/education|skill|learn|school|stem/.test(combined)) sectors.push('education')
      if (/sport|physical|active/.test(combined))         sectors.push('sport')
      if (/arts|culture|creative/.test(combined))         sectors.push('arts')
      if (/environment|green/.test(combined))             sectors.push('environment')
      if (/hardship|poverty|disadvantage/.test(combined)) sectors.push('social welfare')

      grants.push({
        external_id:          `norfolk_cf_${slug}`,
        source:               SOURCE,
        title,
        funder:               'Norfolk Community Foundation',
        funder_type:          'community_foundation',
        description:          desc,
        amount_min:           null,
        amount_max:           amountMax,
        deadline,
        is_rolling:           !dlMatch,
        is_local:             true,
        sectors,
        eligibility_criteria: [`Located in: ${area}`],
        apply_url:            url || LISTURL,
        raw_data:             { slug, area } as Record<string, unknown>,
      })
    }

    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 25: Suffolk Community Foundation ───────────────────────────────────
// Scrapes suffolkcf.org.uk/current-grants/ — SSR listing of named funds.
// Each fund appears as an H2 heading followed by open/closed status text and
// description. We filter to "Now open" or "Open all year round" only.
async function crawlSuffolkCF(): Promise<CrawlResult> {
  const SOURCE  = 'suffolk_cf'
  const BASE    = 'https://www.suffolkcf.org.uk'
  const LISTURL = `${BASE}/current-grants/`
  // Status text that means the fund is accepting applications right now
  const OPEN_RE  = /now open|open all year round/i
  // Status text that means NOT open (skip these)
  const SKIP_RE  = /now closed|opens:/i

  try {
    const html = await fetchHtml(LISTURL)
    const root = parseHTML(html)
    const grants: ScrapedGrant[] = []

    const h2s = root.querySelectorAll('h2').filter(h =>
      !h.text.match(/general application|subscribe|newsletter|grants opening soon/i)
    )

    for (const h2 of h2s) {
      const title = h2.text.trim()
      if (!title) continue

      // Collect sibling content until next H2
      let blockText = ''
      let sib = h2.nextElementSibling
      while (sib && sib.tagName !== 'H2') {
        blockText += ' ' + sib.text
        sib = sib.nextElementSibling
      }

      // Only include funds currently open
      if (!OPEN_RE.test(blockText) || SKIP_RE.test(blockText)) continue

      // "Maximum grant: £5,000" or "Maximum grant: No maximum"
      const maxMatch  = blockText.match(/Maximum grant:\s*(£[\d,]+|No maximum)/i)
      const amountMax = maxMatch && !/no maximum/i.test(maxMatch[1])
        ? parsePoundAmount(maxMatch[1]) : null

      const isRolling = /open all year round/i.test(blockText)

      // First proper sentence as description
      const descMatch = blockText.match(/Grants? (?:to|of|for|up)[^.]{10,200}\./)
      const desc = descMatch ? descMatch[0].trim()
        : blockText.replace(/Now open.*?£[\d,]+/i, '').trim().slice(0, 300)

      const slug = slugify(title).toLowerCase().replace(/__+/g, '_').slice(0, 60)

      const combined = (title + ' ' + desc).toLowerCase()
      const sectors: string[] = ['community']
      if (/health|wellbeing|medical|mental|cancer|carer/.test(combined)) sectors.push('health')
      if (/young people|children|youth/.test(combined))                  sectors.push('young people')
      if (/sport|tennis|physical|active/.test(combined))                 sectors.push('sport')
      if (/education|skill|learn/.test(combined))                        sectors.push('education')
      if (/arts|culture/.test(combined))                                 sectors.push('arts')
      if (/enterprise|business/.test(combined))                          sectors.push('enterprise')
      if (/hardship|poverty|disab|disadvantage/.test(combined))          sectors.push('social welfare')
      if (/older people|elderly/.test(combined))                         sectors.push('social welfare')

      grants.push({
        external_id:          `suffolk_cf_${slug}`,
        source:               SOURCE,
        title,
        funder:               'Suffolk Community Foundation',
        funder_type:          'community_foundation',
        description:          desc.replace(/\s+/g, ' ').trim(),
        amount_min:           null,
        amount_max:           amountMax,
        deadline:             null,
        is_rolling:           isRolling,
        is_local:             true,
        sectors,
        eligibility_criteria: ['Suffolk based organisations or individuals'],
        apply_url:            LISTURL,
        raw_data:             { slug } as Record<string, unknown>,
      })
    }

    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 26: Community Foundation Merseyside & Lancashire ───────────────────
async function crawlMerseysideCF(): Promise<CrawlResult> {
  const SOURCE  = 'merseyside_cf'
  const BASE    = 'https://cfmerseyside.org.uk'
  const LISTURL = `${BASE}/our-grants`

  try {
    const html  = await fetchHtml(LISTURL)
    const root  = parseHTML(html)
    const grants: ScrapedGrant[] = []

    // Each open grant is an <a href="/grants/slug"> wrapping the full card content.
    // Closed / coming-soon grants use different background colours and lack "Apply Now".
    const links = root.querySelectorAll('a').filter(a => {
      const href = a.getAttribute('href') ?? ''
      return href.includes('/grants/') && /apply\s+now/i.test(a.text)
    })

    for (const link of links) {
      const href  = link.getAttribute('href') ?? ''
      const slug  = href.split('/grants/')[1]?.replace(/\/$/, '') ?? ''
      if (!slug) continue

      // Skip individual-only grants
      if (/individual/i.test(slug)) continue

      const title = link.querySelector('h2')?.text?.trim()
      if (!title || /individual/i.test(title)) continue

      const cardText = link.text.replace(/\s+/g, ' ')

      // Grant Size: e.g. "£5,000" or "£500-£2,000" or "Up to £2,000"
      const sizeRaw = cardText.match(/Grant Size:\s*((?:Up to\s+)?£[\d,]+(?:\s*[-–]\s*£[\d,]+)?)/i)?.[1] ?? ''
      const { min: amountMin, max: amountMax } = parseAmountRange(sizeRaw || cardText.slice(0, 400))

      // Location
      const location = cardText.match(/Location:\s*([A-Za-z][^£\n]{2,60?})(?:\s*Deadline|\s*Decision|\s*Apply)/i)?.[1]?.trim()
        ?? 'Merseyside / Lancashire'

      // Deadline — "30th March 2026" style
      const dlRaw   = cardText.match(/Deadline:\s*(\d{1,2}(?:st|nd|rd|th)?\s+\w+\s+\d{4})/i)?.[1] ?? ''
      const deadline = dlRaw ? parseUKRIDate(dlRaw) : null

      // Description — text before "Grant Size:"
      const descMatch = cardText.replace(title, '').match(/^\s*(.{30,400?}?)(?:Grant Size:|Location:|Deadline:|Apply Now)/i)
      const description = descMatch ? descMatch[1].trim().slice(0, 500) : null

      const sectors: string[] = []
      const lc = `${title} ${description ?? ''}`.toLowerCase()
      if (/young people|children|youth|educat/i.test(lc))        sectors.push('children & young people')
      if (/health|wellbeing|mental/i.test(lc))                   sectors.push('health & wellbeing')
      if (/sport|active|fitness/i.test(lc))                      sectors.push('sport')
      if (/arts|culture|music|creative/i.test(lc))               sectors.push('arts & culture')
      if (/environment|climate|green|sustain/i.test(lc))         sectors.push('environment')
      if (/poverty|homeless|food|fuel|financ/i.test(lc))         sectors.push('social welfare')
      if (sectors.length === 0)                                   sectors.push('community')

      grants.push({
        external_id:          `merseyside_cf_${slug}`,
        source:               SOURCE,
        title,
        funder:               'Community Foundation for Merseyside',
        funder_type:          'community_foundation',
        description,
        amount_min:           amountMin,
        amount_max:           amountMax,
        deadline,
        is_rolling:           !deadline,
        is_local:             true,
        sectors,
        eligibility_criteria: ['Charitable or voluntary organisations in Merseyside or Lancashire'],
        apply_url:            `${BASE}${href}`,
        raw_data:             { slug } as Record<string, unknown>,
      })
    }

    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 27: BBC Children in Need (hardcoded rolling fund) ──────────────────
async function crawlBBCChildrenInNeed(): Promise<CrawlResult> {
  const SOURCE = 'bbc_cin'
  const URL    = 'https://www.bbcchildreninneed.co.uk/grants/main-grants/'

  const grants: ScrapedGrant[] = [
    {
      external_id:          'bbc_cin_main_grants',
      source:               SOURCE,
      title:                'BBC Children in Need Main Grants',
      funder:               'BBC Children in Need',
      funder_type:          'charity',
      description:          'Grants of £10,000–£40,000 per year for up to 3 years for organisations working with disadvantaged children and young people (under 18) in the UK. Covers projects tackling poverty, disability, mental health and other challenges. Requires a pre-application discussion with a grants officer.',
      amount_min:           10000,
      amount_max:           40000,
      deadline:             null,
      is_rolling:           true,
      is_local:             false,
      sectors:              ['children & young people', 'social welfare', 'health & wellbeing'],
      eligibility_criteria: ['UK-registered charity or constituted group', 'Working with under-18s facing disadvantage'],
      apply_url:            URL,
      raw_data:             {} as Record<string, unknown>,
    },
    {
      external_id:          'bbc_cin_small_grants',
      source:               SOURCE,
      title:                'BBC Children in Need Small Grants',
      funder:               'BBC Children in Need',
      funder_type:          'charity',
      description:          'Grants of £1,000–£10,000 for organisations delivering direct work with children and young people (under 18) facing disadvantage in the UK. Rolling programme with no fixed deadlines.',
      amount_min:           1000,
      amount_max:           10000,
      deadline:             null,
      is_rolling:           true,
      is_local:             false,
      sectors:              ['children & young people', 'social welfare'],
      eligibility_criteria: ['UK-registered charity or constituted group', 'Working with under-18s facing disadvantage'],
      apply_url:            'https://www.bbcchildreninneed.co.uk/grants/small-grants/',
      raw_data:             {} as Record<string, unknown>,
    },
  ]

  return await upsertGrants(SOURCE, grants)
}

// ── Source 28: Gloucestershire Community Foundation ───────────────────────────
async function crawlGloucestershireCF(): Promise<CrawlResult> {
  const SOURCE  = 'gloucestershire_cf'
  const BASE    = 'https://gloucestershirecf.org.uk'
  const LISTURL = `${BASE}/grants/`
  try {
    const html = await fetchHtml(LISTURL)
    const root = parseHTML(html)
    const grants: ScrapedGrant[] = []

    const cards = root.querySelectorAll('.grants-grid__card')
    for (const card of cards) {
      const anchor = card.querySelector('a[href*="/grant/"]')
      if (!anchor) continue
      const href  = anchor.getAttribute('href') ?? ''
      const slug  = href.split('/grant/')[1]?.replace(/\/$/, '') ?? ''
      if (!slug) continue

      const title = card.querySelector('h3')?.text?.trim() ?? anchor.text.trim()
      if (!title) continue

      const description = card.querySelector('.grid-card__text p')?.text?.trim() ?? null

      // .grant-grid__data holds three .grant-data divs: deadline / amount / status
      const dataItems = card.querySelectorAll('.grant-data')
      const deadlineRaw = dataItems[0]?.querySelector('span')?.text?.trim() ?? ''
      const amountRaw   = dataItems[1]?.querySelector('span')?.text?.trim() ?? ''
      const statusRaw   = dataItems[2]?.querySelector('span')?.text?.trim().toLowerCase() ?? ''

      // Skip paused grants
      if (statusRaw === 'paused') continue

      // Parse amount
      const isUpTo = /up\s*to/i.test(amountRaw)
      const { min: amtMin, max: amtMax } = parseAmountRange(amountRaw)
      const amount_min = isUpTo ? null : amtMin
      const amount_max = amtMax

      // Parse deadline — look for "Nth Month YYYY" or "NTH MONTH YYYY"
      const isRolling = /rolling/i.test(deadlineRaw)
      const dlMatch   = deadlineRaw.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})/i)
      const deadline  = dlMatch
        ? parseUKRIDate(`${dlMatch[1]} ${dlMatch[2]} ${dlMatch[3]}`)
        : null

      // Sector inference
      const t = title.toLowerCase()
      const sectors: string[] = ['community development']
      if (/cancer|health|wellbeing|mental/i.test(t)) sectors.push('health & wellbeing')
      if (/youth|young|child|neurodiver/i.test(t)) sectors.push('children & young people')
      if (/poverty|disadvan|vulnerab/i.test(t)) sectors.push('social welfare')
      if (/enterprise|business|swef/i.test(t)) sectors.push('enterprise & employment')
      if (/disability|neurodiver/i.test(t)) sectors.push('disability')
      if (/freemason|older|elder/i.test(t)) sectors.push('older people')

      const applyUrl = `${BASE}${href.startsWith('/') ? href : '/' + href}`

      grants.push({
        external_id:          `gloucestershire_cf_${slug}`,
        source:               SOURCE,
        title,
        funder:               'Gloucestershire Community Foundation',
        funder_type:          'community_foundation',
        description,
        amount_min,
        amount_max,
        deadline,
        is_rolling:           isRolling,
        is_local:             true,
        sectors,
        eligibility_criteria: ['Registered charity or constituted group', 'Operating in Gloucestershire'],
        apply_url:            applyUrl,
        raw_data:             { status: statusRaw, deadlineRaw, amountRaw } as Record<string, unknown>,
      })
    }

    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 29: Heart of Bucks Community Foundation ────────────────────────────
async function crawlHeartOfBucksCF(): Promise<CrawlResult> {
  const SOURCE  = 'heart_of_bucks_cf'
  const BASE    = 'https://heartofbucks.org'
  const LISTURL = `${BASE}/apply-for-a-grant/`
  try {
    const html = await fetchHtml(LISTURL)
    const root = parseHTML(html)
    const grants: ScrapedGrant[] = []

    // Page uses WPBakery .vc_row layout: each row = one fund
    // Columns (as .mk-text-block or .wpb_text_column): [title+desc, status, amount, deadline]
    const rows = root.querySelectorAll('.vc_row')
    for (const row of rows) {
      const blocks = row.querySelectorAll('.mk-text-block, .wpb_text_column')
      if (blocks.length < 2) continue

      // Status is in the second block
      const statusText = blocks[1]?.text?.trim() ?? ''
      if (!/^open$/i.test(statusText.split('\n')[0].trim())) continue

      // Title = first <p> in first block; description = second <p>
      const firstBlockPs = blocks[0].querySelectorAll('p')
      const title = firstBlockPs[0]?.text?.trim() ?? ''
      if (!title || title.toUpperCase() === title) continue   // skip header row
      const description = firstBlockPs[1]?.text?.trim() ?? null

      // Amount in third block
      const amountRaw = blocks[2]?.text?.trim() ?? ''
      const isUpTo    = /up\s*to/i.test(amountRaw)
      const { min: amtMin, max: amtMax } = parseAmountRange(amountRaw)
      const amount_min = isUpTo ? null : amtMin
      const amount_max = amtMax

      // Deadline in fourth block
      const deadlineRaw = blocks[3]?.text?.trim() ?? ''
      const isRolling   = /rolling|no closing/i.test(deadlineRaw)
      const dlMatch     = deadlineRaw.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)(?:\s+(\d{4}))?/i)
      const yearStr     = dlMatch?.[3] ?? new Date().getFullYear().toString()
      const deadline    = dlMatch && !isRolling
        ? parseUKRIDate(`${dlMatch[1]} ${dlMatch[2]} ${yearStr}`)
        : null

      // Apply link: prefer heartofbucks.org links; fall back to any link
      const allLinks = row.querySelectorAll('a[href]')
      let applyUrl = LISTURL
      for (const a of allLinks) {
        const href = a.getAttribute('href') ?? ''
        if (href.startsWith('http')) { applyUrl = href; break }
      }

      // Slug from apply URL
      const slug = applyUrl.replace(/https?:\/\/[^/]+/, '').replace(/\/$/, '').replace(/\//g, '_').replace(/^_/, '') || title.toLowerCase().replace(/\s+/g, '_')

      // Sector inference
      const t = title.toLowerCase()
      const sectors: string[] = ['community development']
      if (/health|wellbeing|mental/i.test(t)) sectors.push('health & wellbeing')
      if (/youth|young|child|bursari/i.test(t)) sectors.push('children & young people')
      if (/skill|train|qualif/i.test(t)) sectors.push('education & training')
      if (/access|disab|sensory/i.test(t)) sectors.push('disability')

      grants.push({
        external_id:          `heart_of_bucks_cf_${slug}`,
        source:               SOURCE,
        title,
        funder:               'Heart of Bucks Community Foundation',
        funder_type:          'community_foundation',
        description,
        amount_min,
        amount_max,
        deadline,
        is_rolling:           isRolling,
        is_local:             true,
        sectors,
        eligibility_criteria: ['Registered charity or constituted community group', 'Operating in Buckinghamshire'],
        apply_url:            applyUrl,
        raw_data:             { statusText, amountRaw, deadlineRaw } as Record<string, unknown>,
      })
    }

    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 30: LLR Community Foundation ───────────────────────────────────────
async function crawlLLRCF(): Promise<CrawlResult> {
  const SOURCE  = 'llr_cf'
  const BASE    = 'https://llrcommunityfoundation.org.uk'
  const LISTURL = `${BASE}/our-grants/apply-for-a-grant/`
  try {
    const html   = await fetchHtml(LISTURL)
    const root   = parseHTML(html)
    const grants: ScrapedGrant[] = []

    // WordPress post structure: h2/h3 headings with "– OPEN" suffix link to individual pages
    const headings = root.querySelectorAll('h2, h3')
    for (const heading of headings) {
      const headingText = heading.text.trim()
      // Only include open grants; skip closed
      if (!/open/i.test(headingText)) continue
      if (/closed/i.test(headingText)) continue

      // Title = heading text stripped of status suffix
      const title = headingText.replace(/\s*[–—-]\s*(open|closed|paused).*/i, '').trim()
      if (!title) continue

      // Apply URL from the heading's anchor or adjacent link
      const anchor = heading.querySelector('a[href]')
      const href   = anchor?.getAttribute('href') ?? ''
      const applyUrl = href.startsWith('http') ? href : href ? `${BASE}${href}` : LISTURL

      // Slug from URL path
      const slug = applyUrl.replace(/https?:\/\/[^/]+/, '').replace(/\/$/, '').replace(/\//g, '_').replace(/^_/, '') || title.toLowerCase().replace(/[^a-z0-9]+/g, '_')

      // Try to get description and amount from the individual grant page
      let description: string | null = null
      let amount_min: number | null  = null
      let amount_max: number | null  = null
      let deadline:   string | null  = null
      let isRolling   = false

      if (applyUrl !== LISTURL) {
        try {
          const grantHtml = await fetchHtml(applyUrl)
          const grantRoot = parseHTML(grantHtml)
          // First paragraph after main heading
          const paras = grantRoot.querySelectorAll('.entry-content p, .post-content p, article p')
          description = paras[0]?.text?.trim() ?? null

          // Look for amount patterns in page text
          const pageText = grantRoot.text
          const amtMatch = pageText.match(/(?:up to\s*)?(£[\d,]+)(?:\s*[–-]\s*(£[\d,]+))?/i)
          if (amtMatch) {
            const isUpTo = /up\s*to/i.test(pageText.slice(Math.max(0, pageText.indexOf(amtMatch[0]) - 20), pageText.indexOf(amtMatch[0])))
            const { min: mn, max: mx } = parseAmountRange(amtMatch[0])
            amount_min = isUpTo ? null : mn
            amount_max = mx
          }

          // Deadline
          const dlMatch = pageText.match(/deadline[:\s]+([^\n.]+)/i)
          if (dlMatch) {
            const dlText = dlMatch[1].trim()
            isRolling = /rolling|ongoing|no fixed/i.test(dlText)
            const dm = dlText.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})/i)
            if (dm && !isRolling) deadline = parseUKRIDate(`${dm[1]} ${dm[2]} ${dm[3]}`)
          }
        } catch {
          // Individual page failed — continue with what we have
        }
      }

      // Sector inference
      const t = title.toLowerCase()
      const sectors: string[] = ['community development']
      if (/water|environment|green/i.test(t)) sectors.push('environment')
      if (/enterprise|business|employment|economic/i.test(t)) sectors.push('enterprise & employment')
      if (/literary|read|book|art|cultur/i.test(t)) sectors.push('arts & culture')
      if (/health|wellbeing/i.test(t)) sectors.push('health & wellbeing')

      grants.push({
        external_id:          `llr_cf_${slug}`,
        source:               SOURCE,
        title,
        funder:               'LLR Community Foundation',
        funder_type:          'community_foundation',
        description,
        amount_min,
        amount_max,
        deadline,
        is_rolling:           isRolling,
        is_local:             true,
        sectors,
        eligibility_criteria: ['Registered charity or constituted group', 'Operating in Leicester, Leicestershire or Rutland'],
        apply_url:            applyUrl,
        raw_data:             { headingText } as Record<string, unknown>,
      })
    }

    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 31: MK Community Foundation ────────────────────────────────────────
async function crawlMKCF(): Promise<CrawlResult> {
  const SOURCE = 'mk_cf'
  // MK CF uses a tiered programme model; these are their standing open grant rounds
  const grants: ScrapedGrant[] = [
    {
      external_id:          'mk_cf_seed_grants',
      source:               SOURCE,
      title:                'Seed Grants',
      funder:               'MK Community Foundation',
      funder_type:          'community_foundation',
      description:          'For early-stage ideas and new community groups. Grants of up to £750 to help you get started.',
      amount_min:           null,
      amount_max:           750,
      deadline:             null,
      is_rolling:           true,
      is_local:             true,
      sectors:              ['community development'],
      eligibility_criteria: ['Charity or constituted community group in Milton Keynes', 'New or emerging organisations'],
      apply_url:            'https://www.mkcommunityfoundation.co.uk/apply-for-a-grant/seed-grants/',
      raw_data:             {} as Record<string, unknown>,
    },
    {
      external_id:          'mk_cf_sapling_grants',
      source:               SOURCE,
      title:                'Sapling Grants',
      funder:               'MK Community Foundation',
      funder_type:          'community_foundation',
      description:          'For growing organisations delivering community benefit in Milton Keynes.',
      amount_min:           null,
      amount_max:           5000,
      deadline:             null,
      is_rolling:           true,
      is_local:             true,
      sectors:              ['community development'],
      eligibility_criteria: ['Registered charity or constituted group', 'Operating in Milton Keynes'],
      apply_url:            'https://www.mkcommunityfoundation.co.uk/apply-for-a-grant/sapling-grants/',
      raw_data:             {} as Record<string, unknown>,
    },
    {
      external_id:          'mk_cf_oak_grants',
      source:               SOURCE,
      title:                'Oak Grants',
      funder:               'MK Community Foundation',
      funder_type:          'community_foundation',
      description:          'For established organisations with a track record of delivery in Milton Keynes.',
      amount_min:           null,
      amount_max:           15000,
      deadline:             null,
      is_rolling:           true,
      is_local:             true,
      sectors:              ['community development'],
      eligibility_criteria: ['Registered charity', 'Operating in Milton Keynes', 'Proven track record'],
      apply_url:            'https://www.mkcommunityfoundation.co.uk/apply-for-a-grant/oak-grants/',
      raw_data:             {} as Record<string, unknown>,
    },
    {
      external_id:          'mk_cf_strategic_partnerships',
      source:               SOURCE,
      title:                'Strategic Partnership Grants',
      funder:               'MK Community Foundation',
      funder_type:          'community_foundation',
      description:          'Multi-year funding for anchor organisations making a significant strategic impact across Milton Keynes.',
      amount_min:           null,
      amount_max:           null,
      deadline:             null,
      is_rolling:           false,
      is_local:             true,
      sectors:              ['community development'],
      eligibility_criteria: ['Registered charity', 'Operating strategically across Milton Keynes'],
      apply_url:            'https://www.mkcommunityfoundation.co.uk/apply-for-a-grant/strategic-partnerships/',
      raw_data:             {} as Record<string, unknown>,
    },
  ]
  return await upsertGrants(SOURCE, grants)
}

// ── Source 34: Hertfordshire Community Foundation ─────────────────────────────
async function crawlHertsCF(): Promise<CrawlResult> {
  const SOURCE  = 'herts_cf'
  const BASE    = 'https://www.hertscf.org.uk'
  const LISTURL = `${BASE}/grant-making`
  try {
    const html = await fetchHtml(LISTURL)
    const root = parseHTML(html)
    const grants: ScrapedGrant[] = []

    // Each grant is a .card div; inside: h4 (title), <b> elements (amount + deadline), a.readmore (link)
    const cards = root.querySelectorAll('.card')
    for (const card of cards) {
      const title = card.querySelector('h4, h3, h2')?.text?.trim() ?? ''
      if (!title) continue

      const applyHref = card.querySelector('a.readmore, a[href]')?.getAttribute('href') ?? ''
      const applyUrl  = applyHref.startsWith('http') ? applyHref : `${BASE}${applyHref}`

      // <b> elements: first contains amount, remaining contain deadline info
      // Some cards concatenate amount+deadline in a single <b> — handle both
      const boldTexts = card.querySelectorAll('b').map(b => b.text.trim()).filter(t => t)
      const allBoldText = boldTexts.join(' ')

      // Extract amount — "Grants of up to £X" or "Grants of £X–£Y"
      const amountMatch = allBoldText.match(/Grants\s+(?:of\s+)?(?:up\s+to\s+)?(£[\d,]+(?:\s*[–-]\s*£[\d,]+)?)/i)
      const amountRaw   = amountMatch ? amountMatch[0] : ''
      const isUpTo      = /up\s*to/i.test(amountRaw)
      const { min: amtMin, max: amtMax } = parseAmountRange(amountRaw)
      const amount_min  = isUpTo ? null : amtMin
      const amount_max  = amtMax

      // Extract deadline — look for date patterns or "rolling"
      const deadlineText = boldTexts.filter(b => /deadline|closing/i.test(b)).join(' ')
      const isRolling    = /rolling|no deadline|ongoing/i.test(deadlineText) || !deadlineText
      const dlMatch      = deadlineText.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})/i)
      const deadline     = dlMatch && !isRolling
        ? parseUKRIDate(`${dlMatch[1]} ${dlMatch[2]} ${dlMatch[3]}`)
        : null

      // Description from card paragraph text (excluding bold content)
      const cardText  = card.text.replace(/\s+/g, ' ').trim()
      const afterBold = cardText.replace(title, '').replace(/Grants of[^A-Z]*/i, '').replace(/Application deadline[^A-Z]*/gi, '').trim()
      const description = afterBold.replace(/READ MORE\s*$/, '').trim() || null

      // Slug from URL
      const slug = applyUrl.replace(/https?:\/\/[^/]+\//, '').replace(/\/$/, '').replace(/\//g, '_') || title.toLowerCase().replace(/[^a-z0-9]+/g, '_')

      // Sector inference
      const t = title.toLowerCase()
      const sectors: string[] = ['community development']
      if (/household|food|fuel|water|poverty|need|depriv/i.test(t)) sectors.push('social welfare')
      if (/transport|travel/i.test(t)) sectors.push('community development')
      if (/music|art|cultur/i.test(t)) sectors.push('arts & culture')
      if (/health|wellbeing/i.test(t)) sectors.push('health & wellbeing')

      grants.push({
        external_id:          `herts_cf_${slug}`,
        source:               SOURCE,
        title,
        funder:               'Hertfordshire Community Foundation',
        funder_type:          'community_foundation',
        description:          description && description.length > 10 ? description : null,
        amount_min,
        amount_max,
        deadline,
        is_rolling:           isRolling,
        is_local:             true,
        sectors,
        eligibility_criteria: ['Registered charity or constituted group', 'Operating in Hertfordshire'],
        apply_url:            applyUrl,
        raw_data:             { amountRaw, deadlineText } as Record<string, unknown>,
      })
    }

    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 32: Community Foundation for Lancashire ────────────────────────────
async function crawlLancsCF(): Promise<CrawlResult> {
  const SOURCE  = 'lancs_cf'
  const BASE    = 'https://lancsfoundation.org.uk'
  const LISTURL = `${BASE}/our-grants?grant-category=open`
  try {
    const html = await fetchHtml(LISTURL)
    const root = parseHTML(html)
    const grants: ScrapedGrant[] = []

    // Each open grant is a .js-grants-single div containing a single <a> card
    // Inside: h2 (title), p (description), spans with "Grant Size:", "Location:", "Deadline:"
    const cards = root.querySelectorAll('.js-grants-single')
    for (const card of cards) {
      const title = card.querySelector('h2')?.text?.trim() ?? ''
      if (!title) continue

      const description = card.querySelector('p')?.text?.trim() ?? null
      const applyHref   = card.querySelector('a[href]')?.getAttribute('href') ?? ''
      const applyUrl    = applyHref.startsWith('http') ? applyHref : `${BASE}${applyHref}`

      // Parse metadata from card text — spans contain "Grant Size: X", "Location: Y", "Deadline: Z"
      const cardText    = card.text.replace(/\s+/g, ' ')
      const amountRaw   = cardText.match(/Grant Size:\s*([^L\n]+?)(?:\s+Location:|$)/i)?.[1]?.trim() ?? ''
      const deadlineRaw = cardText.match(/Deadline:\s*([^\n]+?)(?:\s+Apply|$)/i)?.[1]?.trim() ?? ''

      const isUpTo    = /up\s*to/i.test(amountRaw)
      const { min: amtMin, max: amtMax } = parseAmountRange(amountRaw)
      const amount_min = isUpTo ? null : amtMin
      const amount_max = amtMax

      // Deadline: "Monday 2nd March 2026" or "Winter 2026" or missing
      const isRolling = !deadlineRaw || /rolling|ongoing|tbc/i.test(deadlineRaw)
      const dlMatch   = deadlineRaw.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})/i)
      const deadline  = dlMatch && !isRolling
        ? parseUKRIDate(`${dlMatch[1]} ${dlMatch[2]} ${dlMatch[3]}`)
        : null

      // Slug from URL
      const slug = applyUrl.replace(/https?:\/\/[^/]+\/grants\//, '').replace(/\/$/, '') || title.toLowerCase().replace(/[^a-z0-9]+/g, '_')

      // Sector inference
      const t = (title + ' ' + (description ?? '')).toLowerCase()
      const sectors: string[] = ['community development']
      if (/young|youth|child|famil/i.test(t)) sectors.push('children & young people')
      if (/enterprise|business|start.?up/i.test(t)) sectors.push('enterprise & employment')
      if (/environment|energy|wind farm|decarb/i.test(t)) sectors.push('environment')
      if (/women|gender/i.test(t)) sectors.push('equality & diversity')
      if (/music|art|sport|leisure/i.test(t)) sectors.push('arts & culture')

      grants.push({
        external_id:          `lancs_cf_${slug}`,
        source:               SOURCE,
        title,
        funder:               'Community Foundation for Lancashire',
        funder_type:          'community_foundation',
        description,
        amount_min,
        amount_max,
        deadline,
        is_rolling:           isRolling,
        is_local:             true,
        sectors,
        eligibility_criteria: ['Voluntary or community group in Lancashire'],
        apply_url:            applyUrl,
        raw_data:             { amountRaw, deadlineRaw } as Record<string, unknown>,
      })
    }

    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 33: Cambridgeshire Community Foundation ────────────────────────────
async function crawlCambsCF(): Promise<CrawlResult> {
  const SOURCE  = 'cambs_cf'
  const BASE    = 'https://www.cambscf.org.uk'
  const LISTURL = `${BASE}/funds/`
  try {
    const html = await fetchHtml(LISTURL)
    const root = parseHTML(html)
    const grants: ScrapedGrant[] = []

    // Each fund is a <li class="rounded-lg ..."> card
    // Structure: h3 (title) + div > [h4 (amount), em (deadlines), p (desc), a (link)]
    const cards = root.querySelectorAll('li.rounded-lg, li[class*="rounded-lg"]')
    for (const card of cards) {
      const title = card.querySelector('h3')?.text?.trim() ?? ''
      if (!title) continue

      const amountRaw   = card.querySelector('h4')?.text?.trim() ?? ''
      const deadlineRaw = card.querySelector('em')?.text?.trim() ?? ''
      const description = card.querySelector('p')?.text?.trim() ?? null
      const applyHref   = card.querySelector('a[href]')?.getAttribute('href') ?? ''
      const applyUrl    = applyHref.startsWith('http') ? applyHref : `${BASE}${applyHref}`

      // Skip permanently or currently closed funds
      if (/closed/i.test(deadlineRaw)) continue

      // Clean deadline string: "Application deadlines: 1 May, 1 August" → "1 May, 1 August"
      const cleanDeadline = deadlineRaw.replace(/^Application deadlines?:\s*/i, '').trim()
      const isRolling     = /rolling|ongoing/i.test(cleanDeadline)

      // Extract first concrete date
      const dlMatch = cleanDeadline.match(/(\d{1,2})\s+([A-Za-z]+)/)
      const deadline = dlMatch && !isRolling
        ? parseUKRIDate(`${dlMatch[1]} ${dlMatch[2]} ${new Date().getFullYear()}`)
        : null

      // Parse amount — h4 may say "£50,000" or "Up to £15,000" or "No maximum..."
      const isUpTo    = /up\s*to|no max/i.test(amountRaw)
      const { min: amtMin, max: amtMax } = parseAmountRange(amountRaw)
      const amount_min = isUpTo ? null : amtMin
      const amount_max = amtMax

      // Slug from apply URL
      const slug = applyUrl.replace(/https?:\/\/[^/]+/, '').replace(/\/$/, '').replace(/\//g, '_').replace(/^_/, '') || title.toLowerCase().replace(/[^a-z0-9]+/g, '_')

      // Sector inference
      const t = (title + ' ' + (description ?? '')).toLowerCase()
      const sectors: string[] = ['community development']
      if (/environment|nature|decarb|solar|heat pump/i.test(t)) sectors.push('environment')
      if (/dementia|health|wellbeing|cancer/i.test(t)) sectors.push('health & wellbeing')
      if (/young|youth|18.30|start.?up|enterprise|business/i.test(t)) sectors.push('enterprise & employment')
      if (/poverty|need|hardship|distress|vulnerable/i.test(t)) sectors.push('social welfare')
      if (/education|stem|school|training/i.test(t)) sectors.push('education & training')

      grants.push({
        external_id:          `cambs_cf_${slug}`,
        source:               SOURCE,
        title,
        funder:               'Cambridgeshire Community Foundation',
        funder_type:          'community_foundation',
        description,
        amount_min,
        amount_max,
        deadline,
        is_rolling:           isRolling,
        is_local:             true,
        sectors,
        eligibility_criteria: ['Registered charity or constituted group', 'Operating in Cambridgeshire'],
        apply_url:            applyUrl,
        raw_data:             { amountRaw, deadlineRaw: cleanDeadline } as Record<string, unknown>,
      })
    }

    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 35: Wiltshire & Swindon Community Foundation ───────────────────────
async function crawlWiltshireCF(): Promise<CrawlResult> {
  const SOURCE  = 'wiltshire_cf'
  const BASE    = 'https://www.wscf.org.uk'
  const LISTURL = `${BASE}/grants-and-support/groups/`
  try {
    const html = await fetchHtml(LISTURL)
    const root = parseHTML(html)
    const grants: ScrapedGrant[] = []

    // Each grant is a .grant div; inside: h3.grant__title (title),
    // paragraphs (first p = amount info), p.grant__deadline (deadline / status),
    // a.grant__button (apply link).  Skip if deadline text says "closed".
    const cards = root.querySelectorAll('.grant')
    for (const card of cards) {
      const title = card.querySelector('h3.grant__title, h3')?.text?.trim() ?? ''
      if (!title) continue

      const deadlineEl  = card.querySelector('p.grant__deadline, .grant__deadline')
      const deadlineRaw = deadlineEl?.text?.trim() ?? ''
      if (/closed/i.test(deadlineRaw)) continue

      const isRolling = /rolling|no closing|ongoing/i.test(deadlineRaw)
      const dlMatch   = deadlineRaw.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)(?:\s+(\d{4}))?/i)
      const yearStr   = dlMatch?.[3] ?? new Date().getFullYear().toString()
      const deadline  = dlMatch && !isRolling
        ? parseUKRIDate(`${dlMatch[1]} ${dlMatch[2]} ${yearStr}`)
        : null

      // Amount — first <p> that is NOT the deadline paragraph
      const allPs    = card.querySelectorAll('p')
      const amountEl = allPs.find(p => p !== deadlineEl)
      const amountRaw = amountEl?.text?.trim() ?? ''
      const isUpTo    = /up\s*to/i.test(amountRaw)
      const { min: amtMin, max: amtMax } = parseAmountRange(amountRaw)
      const amount_min = isUpTo ? null : amtMin
      const amount_max = amtMax

      const anchor   = card.querySelector('a.grant__button, a[href]')
      const applyUrl = anchor ? (anchor.getAttribute('href')?.startsWith('http') ? anchor.getAttribute('href')! : `${BASE}${anchor.getAttribute('href')}`) : LISTURL

      const slug = applyUrl.replace(/https?:\/\/[^/]+/, '').replace(/\/$/, '').replace(/[^a-z0-9]/gi, '_').replace(/^_/, '') || title.toLowerCase().replace(/[^a-z0-9]+/g, '_')

      grants.push({
        external_id:          `wiltshire_cf_${slug}`,
        source:               SOURCE,
        title,
        funder:               'Wiltshire & Swindon Community Foundation',
        funder_type:          'community_foundation',
        description:          null,
        amount_min,
        amount_max,
        deadline,
        is_rolling:           isRolling,
        is_local:             true,
        sectors:              ['community development'],
        eligibility_criteria: ['Registered charity or constituted group', 'Operating in Wiltshire or Swindon'],
        apply_url:            applyUrl,
        raw_data:             { amountRaw, deadlineRaw } as Record<string, unknown>,
      })
    }

    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 36: Community Foundation for Calderdale ────────────────────────────
async function crawlCalderdaleCF(): Promise<CrawlResult> {
  const SOURCE  = 'calderdale_cf'
  const BASE    = 'https://cffc.co.uk'
  const LISTURL = `${BASE}/current-grants/`
  try {
    const html = await fetchHtml(LISTURL)
    const root = parseHTML(html)
    const grants: ScrapedGrant[] = []

    // Elementor grid: each grant is article.elementor-post
    // Inside: h3.elementor-post__title > a (title + link).
    // Individual pages have description / amount.
    const articles = root.querySelectorAll('article.elementor-post, article[class*="elementor-post"]')

    const pagePromises = articles.map(async (article) => {
      const anchor   = article.querySelector('h3 a, .elementor-post__title a')
      const title    = anchor?.text?.trim() ?? article.querySelector('h3')?.text?.trim() ?? ''
      if (!title) return null

      const href     = anchor?.getAttribute('href') ?? ''
      const applyUrl = href.startsWith('http') ? href : `${BASE}${href}`

      // Fetch individual grant page for amount / description / deadline
      let description: string | null = null
      let amount_min:  number | null = null
      let amount_max:  number | null = null
      let deadline:    string | null = null
      let isRolling                  = false

      try {
        const pageHtml = await fetchHtml(applyUrl)
        const pg       = parseHTML(pageHtml)

        // Description: first substantial <p> in .elementor-widget-text-editor
        const bodyPs = pg.querySelectorAll('.elementor-widget-text-editor p, .entry-content p, article p')
        description  = bodyPs.find(p => p.text.trim().length > 40)?.text?.trim() ?? null

        // Amount: look for £ sign anywhere in headings or paragraphs
        const allText = pg.text
        const amtM    = allText.match(/£[\d,]+(?:\s*[-–]\s*£[\d,]+)?/)
        if (amtM) {
          const isUpTo  = /up\s*to/i.test(allText.slice(Math.max(0, allText.indexOf(amtM[0]) - 20), allText.indexOf(amtM[0])))
          const { min, max } = parseAmountRange(amtM[0])
          amount_min  = isUpTo ? null : min
          amount_max  = max
        }

        // Deadline: look for date patterns
        const dlM = allText.match(/(?:deadline|closes?|closing)[:\s]+(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)(?:\s+(\d{4}))?/i)
          ?? allText.match(/(\d{1,2})(?:st|nd|rd|th)\s+([A-Za-z]+)\s+(\d{4})/i)
        if (dlM) {
          const dayIdx = dlM.index! + dlM[0].indexOf(dlM[1])
          const dayStr = dlM[1], monStr = dlM[2], yrStr = dlM[3] ?? new Date().getFullYear().toString()
          isRolling = false
          deadline  = parseUKRIDate(`${dayStr} ${monStr} ${yrStr}`)
        }
        if (/rolling|no closing|open.*throughout/i.test(allText)) isRolling = true
      } catch {
        // silently skip page fetch errors
      }

      const slug = applyUrl.replace(/https?:\/\/[^/]+/, '').replace(/\/$/, '').replace(/[^a-z0-9]/gi, '_').replace(/^_/, '') || title.toLowerCase().replace(/[^a-z0-9]+/g, '_')

      return {
        external_id:          `calderdale_cf_${slug}`,
        source:               SOURCE,
        title,
        funder:               'Community Foundation for Calderdale',
        funder_type:          'community_foundation',
        description,
        amount_min,
        amount_max,
        deadline,
        is_rolling:           isRolling,
        is_local:             true,
        sectors:              ['community development'],
        eligibility_criteria: ['Registered charity or constituted group', 'Operating in Calderdale'],
        apply_url:            applyUrl,
        raw_data:             {} as Record<string, unknown>,
      } as ScrapedGrant
    })

    const settled = await Promise.allSettled(pagePromises)
    for (const r of settled) {
      if (r.status === 'fulfilled' && r.value) grants.push(r.value)
    }

    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 37: Somerset Community Foundation ─────────────────────────────────
async function crawlSomersetCF(): Promise<CrawlResult> {
  const SOURCE  = 'somerset_cf'
  const BASE    = 'https://www.somersetcf.org.uk'
  const LISTURL = `${BASE}/grants-and-funding/grants-and-funding-for-groups/`
  try {
    const html  = await fetchHtml(LISTURL)
    const root  = parseHTML(html)
    const grants: ScrapedGrant[] = []

    for (const card of root.querySelectorAll('a.grant-post-list-item-inner')) {
      // Closed grants contain a .grant-post-list-item-header child
      if (card.querySelector('.grant-post-list-item-header')) continue

      const href  = card.getAttribute('href') ?? ''
      const url   = href.startsWith('http') ? href : `${BASE}${href}`
      const title = card.querySelector('.grant-post-list-item-content-title h4')?.text.trim() ?? ''
      if (!title) continue

      let amountRaw = '', deadlineRaw = '', desc = ''
      for (const p of card.querySelectorAll('.grant-post-list-item-content-details p')) {
        const label = p.querySelector('strong')?.text.trim() ?? ''
        const value = p.querySelector('span')?.text.trim()   ?? ''
        if (label === 'Grant size')         amountRaw   = value
        if (label === 'Apply by')           deadlineRaw = value
        if (label === 'Who is it for?')     desc        = value
        if (label === 'What is it for?' && !desc) desc  = value
      }

      const { max: maxAmount } = parseAmountRange(amountRaw)
      const deadline = parseUKRIDate(deadlineRaw)

      grants.push({
        external_id:          slugify(url),
        title,
        funder:               'Somerset Community Foundation',
        funder_type:          'community_foundation',
        description:          desc,
        amount_min:           null,
        amount_max:           maxAmount,
        deadline,
        is_rolling:           false,
        is_local:             true,
        sectors:              [],
        eligibility_criteria: [],
        apply_url:            url,
        source:               SOURCE,
        raw_data:             { amountRaw, deadlineRaw },
      })
    }

    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 38: Community Foundation for Nottinghamshire (ForeverNotts) ────────
async function crawlForeverNotts(): Promise<CrawlResult> {
  const SOURCE  = 'forever_notts'
  const BASE    = 'https://www.forevernotts.com'
  const LISTURL = `${BASE}/grants/apply-for-grants/`
  try {
    const html  = await fetchHtml(LISTURL)
    const root  = parseHTML(html)
    const grants: ScrapedGrant[] = []

    for (const item of root.querySelectorAll('.grant-item')) {
      const fundDiv = item.querySelector('.grant-fund')
      if (!fundDiv) continue

      const anchor = fundDiv.querySelector('a[href*="/grant/"]')
      const href   = anchor?.getAttribute('href') ?? ''
      const url    = href.startsWith('http') ? href : `${BASE}${href}`
      const title  = anchor?.querySelector('h3')?.text.trim() ?? anchor?.text.trim() ?? ''
      if (!title) continue

      const desc = fundDiv.querySelector('p')?.text.trim() ?? ''

      // Metadata <p>s are direct children of .grant-item, outside .grant-fund
      const allPs  = item.querySelectorAll('p')
      const fundPs = new Set(fundDiv.querySelectorAll('p'))
      const metaPs = allPs.filter(p => !fundPs.has(p)).map(p => p.text.trim())
      // metaPs: [0]=type [1]=status [2]=amount [3]=opening [4]=deadline

      const status = (metaPs[1] ?? '').toLowerCase()
      if (status.includes('invitation only')) continue

      const amountRaw   = metaPs[2] ?? ''
      const deadlineRaw = metaPs[4] ?? ''
      const { max: maxAmount } = parseAmountRange(amountRaw)
      const deadline    = parseUKRIDate(deadlineRaw) ?? parseDeadline(deadlineRaw)

      grants.push({
        external_id:          slugify(url),
        title,
        funder:               'Community Foundation for Nottinghamshire',
        funder_type:          'community_foundation',
        description:          desc,
        amount_min:           null,
        amount_max:           maxAmount,
        deadline,
        is_rolling:           false,
        is_local:             true,
        sectors:              [],
        eligibility_criteria: [],
        apply_url:            url,
        source:               SOURCE,
        raw_data:             { amountRaw, deadlineRaw, status: metaPs[1] },
      })
    }

    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 39: Cheshire Community Foundation (hardcoded tiers) ────────────────
async function crawlCheshireCF(): Promise<CrawlResult> {
  const SOURCE = 'cheshire_cf'
  const APPLY  = 'https://www.cheshirecommunityfoundation.org.uk/grants/open-grants-programmes/'
  try {
    const deadline = '2026-03-11'
    const tiers = [
      { key: 'micro', title: 'Micro Grant',  max: 1000,  desc: 'Grants up to £1,000 for small community groups and voluntary organisations in Cheshire.' },
      { key: 'small', title: 'Small Grant',  max: 2500,  desc: 'Grants up to £2,500 for community groups and voluntary organisations in Cheshire.' },
      { key: 'main',  title: 'Main Grant',   max: 15000, desc: 'Grants up to £15,000 for community groups and voluntary organisations in Cheshire.' },
    ]
    const grants: ScrapedGrant[] = tiers.map(t => ({
      external_id:          `cheshire_cf_${t.key}`,
      title:                `Cheshire CF ${t.title}`,
      funder:               'Cheshire Community Foundation',
      funder_type:          'community_foundation',
      description:          t.desc,
      amount_min:           null,
      amount_max:           t.max,
      deadline,
      is_rolling:           false,
      is_local:             true,
      sectors:              [],
      eligibility_criteria: [],
      apply_url:            APPLY,
      source:               SOURCE,
      raw_data:             {},
    }))
    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 40: Shropshire Community Foundation ────────────────────────────────
async function crawlShropshireCF(): Promise<CrawlResult> {
  const SOURCE  = 'shropshire_cf'
  const BASE    = 'https://www.shropshirecommunityfoundation.org.uk'
  const LISTURL = `${BASE}/open-grants/`
  try {
    const html  = await fetchHtml(LISTURL)
    const root  = parseHTML(html)
    const grants: ScrapedGrant[] = []

    for (const box of root.querySelectorAll('.vacancy_box__inner')) {
      const title = box.querySelector('h4.post-excerpt-title')?.text.trim() ?? ''
      if (!title) continue

      const anchor = box.querySelector('.wp-block-button a') ?? box.querySelector('a.btn')
      const href   = anchor?.getAttribute('href') ?? ''
      const url    = href.startsWith('http') ? href : `${BASE}${href}`
      const desc   = box.querySelector('.content p')?.text.trim() ?? ''

      // Right column text: "Grant Size £7,500 Location ... Deadline 23rd March 2026"
      const rightText = box.querySelector('.right-content')?.text.trim() ?? ''
      const amountMatch   = rightText.match(/Grant Size\s+([\s\S]+?)\s+Location/)
      const deadlineMatch = rightText.match(/Deadline\s+([\s\S]+?)$/)
      const amountRaw   = amountMatch?.[1]?.trim()   ?? ''
      const deadlineRaw = deadlineMatch?.[1]?.trim() ?? ''

      const isRolling = /open permanently|rolling|open ended/i.test(deadlineRaw) || !deadlineRaw
      const deadline  = isRolling ? null : parseUKRIDate(deadlineRaw)
      const { max: maxAmount } = parseAmountRange(amountRaw)

      grants.push({
        external_id:          slugify(url || `shropshire_cf_${title}`),
        title,
        funder:               'Shropshire Community Foundation',
        funder_type:          'community_foundation',
        description:          desc,
        amount_min:           null,
        amount_max:           maxAmount,
        deadline,
        is_rolling:           isRolling,
        is_local:             true,
        sectors:              [],
        eligibility_criteria: [],
        apply_url:            url || LISTURL,
        source:               SOURCE,
        raw_data:             { amountRaw, deadlineRaw },
      })
    }

    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 41: Kent Community Foundation (hardcoded tiers) ────────────────────
async function crawlKentCF(): Promise<CrawlResult> {
  const SOURCE = 'kent_cf'
  const APPLY  = 'https://kentcf.org.uk/funding'
  try {
    const tiers = [
      { key: 'micro',   title: 'Kent CF Micro Grant',   max: 2000,  desc: 'Grants up to £2,000 for organisations with an annual income under £75,000 in Kent and Medway.' },
      { key: 'general', title: 'Kent CF General Grant',  max: 6000,  desc: 'Grants up to £6,000 for organisations with an annual income under £3m in Kent and Medway.' },
    ]
    const grants: ScrapedGrant[] = tiers.map(t => ({
      external_id:          `kent_cf_${t.key}`,
      title:                t.title,
      funder:               'Kent Community Foundation',
      funder_type:          'community_foundation',
      description:          t.desc,
      amount_min:           null,
      amount_max:           t.max,
      deadline:             null,
      is_rolling:           true,
      is_local:             true,
      sectors:              [],
      eligibility_criteria: [],
      apply_url:            APPLY,
      source:               SOURCE,
      raw_data:             {},
    }))
    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 42: Lincolnshire Community Foundation ──────────────────────────────
async function crawlLincolnshireCF(): Promise<CrawlResult> {
  const SOURCE  = 'lincolnshire_cf'
  const BASE    = 'https://lincolnshirecf.co.uk'
  const LISTURL = `${BASE}/available-grants2/`
  try {
    const html     = await fetchHtml(LISTURL)
    const root     = parseHTML(html)
    const grants: ScrapedGrant[] = []

    const ctaWidgets  = root.querySelectorAll('.elementor-widget-call-to-action')
    const iconWidgets = root.querySelectorAll('.elementor-widget-icon-list')

    ctaWidgets.forEach((cta, i) => {
      const title  = cta.querySelector('.elementor-cta__title')?.text.trim() ?? ''
      if (!title) return

      const anchor = cta.querySelector('a')
      const href   = anchor?.getAttribute('href') ?? ''
      const url    = href.startsWith('http') ? href : `${BASE}${href}`

      const il     = iconWidgets[i]
      const meta   = il
        ? il.querySelectorAll('.elementor-icon-list-text').map(el => el.text.trim())
        : []

      // Skip closed grants
      if (meta.some(m => /^closed$/i.test(m))) return

      const amountRaw   = meta[0] ?? ''
      const deadlineRaw = meta[2] ?? ''
      const isRolling   = !deadlineRaw || /annual|january|june|september|march|october|april|rolling/i.test(deadlineRaw) && !/\d{4}/.test(deadlineRaw)
      const deadline    = isRolling ? null : parseUKRIDate(deadlineRaw) ?? parseDeadline(deadlineRaw)
      const { max: maxAmount, min: minAmount } = parseAmountRange(amountRaw)

      grants.push({
        external_id:          slugify(url || `lincolnshire_cf_${title}`),
        title,
        funder:               'Lincolnshire Community Foundation',
        funder_type:          'community_foundation',
        description:          '',
        amount_min:           minAmount,
        amount_max:           maxAmount,
        deadline,
        is_rolling:           isRolling,
        is_local:             true,
        sectors:              [],
        eligibility_criteria: [],
        apply_url:            url || LISTURL,
        source:               SOURCE,
        raw_data:             { amountRaw, deadlineRaw },
      })
    })

    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 43 — Paul Hamlyn Foundation ────────────────────────────────────────
// Scrapes the "Open for applications" section of phf.org.uk/funding/
// Fund items: h3 title + sibling divs with "Amount:" meta block
async function crawlPaulHamlynFoundation(): Promise<CrawlResult> {
  const SOURCE  = 'paul_hamlyn_foundation'
  const BASE    = 'https://www.phf.org.uk'
  const LISTURL = `${BASE}/funding/`
  try {
    const html = await fetchHtml(LISTURL)

    // Slice HTML to only the "Open for applications" section
    const openIdx   = html.indexOf('Open for applications')
    const closedIdx = html.indexOf('Not currently accepting applications')
    const openHtml  = (openIdx >= 0 && closedIdx > openIdx)
      ? html.slice(openIdx, closedIdx)
      : html

    const root   = parseHTML(openHtml)
    const grants: ScrapedGrant[] = []

    for (const h3 of root.querySelectorAll('h3')) {
      const title = h3.textContent.trim()
      if (!title) continue
      if (/india/i.test(title)) continue    // India Fund — not UK

      const fundDiv = h3.parentNode
      if (!fundDiv) continue

      // Meta div is the sibling div containing "Amount:"
      const allDivs  = [...fundDiv.querySelectorAll('div')]
      const metaDiv  = allDivs.find(d => /Amount:/i.test(d.textContent))
      const metaText = metaDiv?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
      const descDiv  = allDivs.find(d => d !== metaDiv && d.textContent.trim().length > 30)
      const desc     = descDiv?.textContent?.replace(/\s+/g, ' ').trim()
                    ?? `Paul Hamlyn Foundation — ${title}`

      // "Amount: Up to £60,000 per year (3 to 4 years); up to £50,000 per year (5 years)Duration:..."
      const amountMatch = metaText.match(/Amount:\s*([^D]+?)(?:Duration|$)/i)
      const amountRaw   = amountMatch?.[1]?.trim() ?? ''
      const { min: amount_min, max: amount_max } = parseAmountRange(amountRaw)
      const is_rolling  = /rolling/i.test(metaText)

      grants.push({
        external_id:          `phf_${title.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
        source:               SOURCE,
        title,
        funder:               'Paul Hamlyn Foundation',
        funder_type:          'foundation',
        description:          desc,
        amount_min,
        amount_max,
        deadline:             null,
        is_rolling,
        is_local:             false,
        sectors:              [],
        eligibility_criteria: [],
        apply_url:            LISTURL,
        raw_data:             { metaRaw: metaText },
      })
    }

    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 44 — Esmée Fairbairn Foundation ────────────────────────────────────
// Continuous rolling programme across three strategic priorities.
// No individual programme listing with deadlines; hardcoded as single entry.
async function crawlEsmeeFairbairn(): Promise<CrawlResult> {
  const SOURCE = 'esmee_fairbairn'
  const APPLY  = 'https://esmeefairbairn.org.uk/apply-for-a-grant/'
  const grants: ScrapedGrant[] = [
    {
      external_id:          'esmee_fairbairn_main',
      source:               SOURCE,
      title:                'Esmée Fairbairn Foundation Grant Programme',
      funder:               'Esmée Fairbairn Foundation',
      funder_type:          'foundation',
      description:          'Grants for charitable organisations working in natural world recovery, social justice (A Fairer Future), and creative/confident communities. Supports core costs, project costs, and unrestricted funding. Rolling applications — no deadlines.',
      amount_min:           30000,
      amount_max:           null,
      deadline:             null,
      is_rolling:           true,
      is_local:             false,
      sectors:              ['environment', 'social justice', 'arts', 'communities'],
      eligibility_criteria: ['Constituted charitable organisations with annual turnover over £100,000', 'Minimum grant £30,000', 'Majority of grants are for 3–5 years'],
      apply_url:            APPLY,
      raw_data:             { note: 'Rolling applications, no deadline. Min £30k, no maximum. ~200 grants/year across 13 priorities.' },
    },
  ]
  return await upsertGrants(SOURCE, grants)
}

// ── Source 45 — Henry Smith Foundation ────────────────────────────────────────
// Scrapes the grants listing page then fetches each detail page in parallel.
// Skips any grant whose detail page indicates applications are closed.
async function crawlHenrySmithFoundation(): Promise<CrawlResult> {
  const SOURCE  = 'henry_smith'
  const BASE    = 'https://henrysmith.foundation'
  const LISTURL = `${BASE}/grants/`
  try {
    const html = await fetchHtml(LISTURL)
    const root = parseHTML(html)

    // Collect unique grant detail URLs (a.card href matching /grants/<slug>/)
    const seen  = new Set<string>()
    const cards = root.querySelectorAll('a').filter(a => {
      const href = a.getAttribute('href') ?? ''
      if (!/\/grants\/[^/]+\/$/.test(href)) return false
      if (seen.has(href)) return false
      seen.add(href)
      return true
    })

    if (cards.length === 0) return { source: SOURCE, fetched: 0, upserted: 0 }

    // Fetch all detail pages in parallel
    const details = await Promise.allSettled(
      cards.map(async a => {
        const relHref    = a.getAttribute('href')!
        const href       = relHref.startsWith('http') ? relHref : `${BASE}${relHref}`
        const slug       = relHref.replace(/.*\/grants\//, '').replace(/\/$/, '')
        const listTitle  = a.querySelector('h5')?.textContent?.trim() ?? slug
        const detailHtml = await fetchHtml(href)
        return { slug, href, listTitle, detailHtml }
      })
    )

    const grants: ScrapedGrant[] = []
    for (const r of details) {
      if (r.status !== 'fulfilled') continue
      const { slug, href, listTitle, detailHtml } = r.value

      // Skip closed grants — detail page contains "no longer apply" or similar
      if (/no longer apply|applications are now closed|deadline.*has.*closed/i.test(detailHtml)) continue

      const dRoot = parseHTML(detailHtml)

      // Amount from "Grant amount: ..." in Funding guidelines block
      const bodyText   = dRoot.querySelector('article')?.textContent ?? detailHtml
      const amountM    = bodyText.match(/Grant amount[:\s]+([^\n]+)/i)
      const amountRaw  = amountM?.[1]?.trim() ?? ''
      const { min: amount_min, max: amount_max } = parseAmountRange(amountRaw)

      // Deadline
      const dlM       = bodyText.match(/Application deadline[:\s]+([^\n]+)/i)
      const dlRaw     = dlM?.[1]?.trim() ?? ''
      const deadline  = parseUKRIDate(dlRaw) ?? parseDeadline(dlRaw)
      const is_rolling = !deadline

      // Description from first real <p> in article
      const desc = dRoot.querySelector('article p')?.textContent?.trim()
                ?? `Henry Smith Foundation — ${listTitle}`

      grants.push({
        external_id:          `henry_smith_${slug}`,
        source:               SOURCE,
        title:                listTitle || slug,
        funder:               'Henry Smith Foundation',
        funder_type:          'foundation',
        description:          desc,
        amount_min,
        amount_max,
        deadline,
        is_rolling,
        is_local:             false,
        sectors:              [],
        eligibility_criteria: [],
        apply_url:            href,
        raw_data:             { amountRaw, deadlineRaw: dlRaw },
      })
    }

    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Amount parsers ────────────────────────────────────────────────────────────
function parsePoundAmount(str: string): number | null {
  if (!str) return null
  const cleaned = str.replace(/[£,\s]/g, '').match(/[\d.]+/)
  if (!cleaned) return null
  const n = parseFloat(cleaned[0])
  return isNaN(n) ? null : n
}

function parseAmountRange(str: string): { min: number | null; max: number | null } {
  if (!str) return { min: null, max: null }
  const nums = Array.from(str.matchAll(/£[\d,]+/g)).map(m => parsePoundAmount(m[0]))
  return { min: nums[0] ?? null, max: nums[1] ?? nums[0] ?? null }
}

// ── Date parsers ──────────────────────────────────────────────────────────────
function parseDeadline(raw: unknown): string | null {
  if (!raw) return null
  const d = new Date(String(raw))
  if (isNaN(d.getTime()) || d < new Date()) return null
  return d.toISOString().split('T')[0]
}

// Parses "14 May 2026 4:00pm UK time" → "2026-05-14"
function parseUKRIDate(str: string): string | null {
  if (!str) return null
  const match = str.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/)
  if (!match) return null
  const d = new Date(`${match[2]} ${match[1]} ${match[3]}`)
  if (isNaN(d.getTime()) || d < new Date()) return null
  return d.toISOString().split('T')[0]
}

// ── Misc helpers ──────────────────────────────────────────────────────────────
function slugify(url: string): string {
  return url.replace(/^https?:\/\/[^/]+/, '').replace(/[^a-z0-9]/gi, '_').substring(0, 80)
}

function toMsg(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error'
}

// Keep exported in case other code uses them
export function normaliseSectors(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(s => String(s).toLowerCase().trim()).filter(Boolean)
  if (typeof raw === 'string') return raw.split(',').map(s => s.toLowerCase().trim()).filter(Boolean)
  return []
}
export function normaliseList(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(s => String(s).trim()).filter(Boolean)
  if (typeof raw === 'string') return raw.split('\n').map(s => s.trim()).filter(Boolean)
  return []
}

// ── DB upsert ─────────────────────────────────────────────────────────────────
async function upsertGrants(source: string, grants: ScrapedGrant[]): Promise<CrawlResult> {
  if (grants.length === 0) return { source, fetched: 0, upserted: 0 }
  const supabase = adminClient()

  const rows = grants.map(g => ({
    ...g,
    last_seen_at: new Date().toISOString(),
    is_active:    true,
  }))

  const { error } = await supabase
    .from('scraped_grants')
    .upsert(rows, { onConflict: 'external_id' })

  if (error) return { source, fetched: grants.length, upserted: 0, error: error.message }
  return { source, fetched: grants.length, upserted: grants.length }
}

// ── Source 46 — Garfield Weston Foundation ────────────────────────────────────
// Rolling UK-wide grant maker (~£100m/year). No structured listing page —
// hardcoded as a single rolling entry covering all programme areas.
async function crawlGarfieldWeston(): Promise<CrawlResult> {
  const SOURCE = 'garfield_weston'
  try {
    const grants: ScrapedGrant[] = [{
      external_id:          `${SOURCE}_main`,
      source:               SOURCE,
      title:                'Garfield Weston Foundation — General Grants',
      funder:               'Garfield Weston Foundation',
      funder_type:          'trust_foundation',
      description:          'Family-founded grant-maker giving around £100 million a year to UK charities. ' +
                            'Funds a wide range of sectors including welfare, youth, community, environment, ' +
                            'education, health, arts, heritage and faith. Applications accepted year-round with ' +
                            'decisions at quarterly trustee meetings.',
      amount_min:           1000,
      amount_max:           100000,
      deadline:             null,
      is_rolling:           true,
      is_local:             false,
      sectors:              ['welfare', 'youth', 'community', 'environment', 'education', 'health', 'arts', 'heritage'],
      eligibility_criteria: [
        'Registered UK charity or exempt/excepted body',
        'Working in one of the foundation\'s core sectors',
        'Previous grantees must wait at least one year before reapplying',
        'Applications accepted from charities of any size',
      ],
      apply_url:            'https://garfieldweston.org/for-grant-applicants/how-to-apply/',
      raw_data:             { note: 'Hardcoded rolling entry — no structured listing page' },
    }]
    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 47 — Clothworkers Foundation ───────────────────────────────────────
// Open Grants Programme: capital costs for small/medium charities supporting
// marginalised communities. Two tiers: small grants up to £15k, large £15k+.
// Rolling applications accepted year-round, reviewed at quarterly board meetings.
async function crawlClothworkersFoundation(): Promise<CrawlResult> {
  const SOURCE = 'clothworkers_foundation'
  try {
    const grants: ScrapedGrant[] = [
      {
        external_id:          `${SOURCE}_small_grants`,
        source:               SOURCE,
        title:                'Clothworkers Foundation — Small Capital Grants (up to £15,000)',
        funder:               'The Clothworkers Foundation',
        funder_type:          'trust_foundation',
        description:          'Capital grants up to £15,000 for small- and medium-sized charities and social ' +
                              'enterprises supporting disadvantaged and marginalised communities. Funds ' +
                              'equipment, vehicles, digital infrastructure and small building works. ' +
                              'Rolling programme — applications reviewed quarterly.',
        amount_min:           1000,
        amount_max:           15000,
        deadline:             null,
        is_rolling:           true,
        is_local:             false,
        sectors:              ['community', 'welfare', 'disadvantaged communities'],
        eligibility_criteria: [
          'Registered charity or social enterprise',
          'Annual income generally under £5 million',
          'Capital costs only (equipment, vehicles, buildings, digital)',
          'Must work with disadvantaged or marginalised communities',
          'Must embed lived experience across organisational work',
        ],
        apply_url:            'https://www.clothworkersfoundation.org.uk/open-funding',
        raw_data:             { tier: 'small', note: 'Hardcoded rolling entry' },
      },
      {
        external_id:          `${SOURCE}_large_grants`,
        source:               SOURCE,
        title:                'Clothworkers Foundation — Large Capital Grants (over £15,000)',
        funder:               'The Clothworkers Foundation',
        funder_type:          'trust_foundation',
        description:          'Capital grants over £15,000 — typically for building purchase, construction or ' +
                              'major refurbishment projects for charities serving marginalised communities. ' +
                              'In 2024, 186 building projects were funded. Rolling programme reviewed quarterly.',
        amount_min:           15001,
        amount_max:           250000,
        deadline:             null,
        is_rolling:           true,
        is_local:             false,
        sectors:              ['community', 'welfare', 'disadvantaged communities'],
        eligibility_criteria: [
          'Registered charity or social enterprise',
          'Capital costs only — buildings, major refurbishment, large equipment',
          'Must work with disadvantaged or marginalised communities',
          'Demonstrates lived experience embedded in governance and delivery',
          'Can evidence significant organisational impact from the capital project',
        ],
        apply_url:            'https://www.clothworkersfoundation.org.uk/open-funding',
        raw_data:             { tier: 'large', note: 'Hardcoded rolling entry' },
      },
    ]
    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 48 — Joseph Rowntree Charitable Trust ──────────────────────────────
// Quaker-led trust with 5 programmes: peace & security, power & accountability,
// rights & justice, sustainable future, and Northern Ireland. Very focused —
// best for organisations working on structural change and advocacy.
async function crawlJRCT(): Promise<CrawlResult> {
  const SOURCE = 'jrct'
  try {
    const grants: ScrapedGrant[] = [
      {
        external_id:          `${SOURCE}_power_accountability`,
        source:               SOURCE,
        title:                'JRCT — Power & Accountability Programme',
        funder:               'Joseph Rowntree Charitable Trust',
        funder_type:          'trust_foundation',
        description:          'Supports work that shifts power in UK democracy — including accountable business, ' +
                              'fair elections, and combating corruption and undue political influence. ' +
                              'Open to organisations working on systemic democratic change.',
        amount_min:           10000,
        amount_max:           200000,
        deadline:             null,
        is_rolling:           true,
        is_local:             false,
        sectors:              ['democracy', 'accountability', 'governance', 'civic society'],
        eligibility_criteria: [
          'Registered UK charity or equivalent legal structure',
          'Systemic or structural change focus (not direct service delivery)',
          'Work must fit within JRCT\'s Power & Accountability programme themes',
        ],
        apply_url:            'https://www.jrct.org.uk/grant-programmes/power-and-accountability',
        raw_data:             { programme: 'power_accountability', note: 'Hardcoded rolling entry' },
      },
      {
        external_id:          `${SOURCE}_rights_justice`,
        source:               SOURCE,
        title:                'JRCT — Rights & Justice Programme',
        funder:               'Joseph Rowntree Charitable Trust',
        funder_type:          'trust_foundation',
        description:          'Funds organisations challenging injustice and advancing human rights in the UK, ' +
                              'including refugee rights, racial justice, protest rights, and access to justice. ' +
                              'Prioritises grassroots and BAME-led organisations.',
        amount_min:           10000,
        amount_max:           200000,
        deadline:             null,
        is_rolling:           true,
        is_local:             false,
        sectors:              ['human rights', 'racial justice', 'refugee support', 'legal rights'],
        eligibility_criteria: [
          'Registered UK charity or community interest company',
          'Rights-based or justice-focused work',
          'BAME-led organisations particularly encouraged',
          'Focus on structural change, not one-off casework',
        ],
        apply_url:            'https://www.jrct.org.uk/grant-programmes/rights-and-justice',
        raw_data:             { programme: 'rights_justice', note: 'Hardcoded rolling entry' },
      },
      {
        external_id:          `${SOURCE}_sustainable_future`,
        source:               SOURCE,
        title:                'JRCT — Sustainable Future Programme',
        funder:               'Joseph Rowntree Charitable Trust',
        funder_type:          'trust_foundation',
        description:          'Supports work on a just transition to a sustainable economy, including climate ' +
                              'justice, energy democracy, and systemic alternatives to extractive capitalism. ' +
                              'Quaker values underpin all funding decisions.',
        amount_min:           10000,
        amount_max:           200000,
        deadline:             null,
        is_rolling:           true,
        is_local:             false,
        sectors:              ['environment', 'climate justice', 'sustainability', 'energy'],
        eligibility_criteria: [
          'Registered UK charity or equivalent',
          'Systemic change focus aligned with just transition',
          'Intersectional approach linking climate and social justice',
        ],
        apply_url:            'https://www.jrct.org.uk/grant-programmes/sustainable-future',
        raw_data:             { programme: 'sustainable_future', note: 'Hardcoded rolling entry' },
      },
    ]
    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 49 — Power to Change ───────────────────────────────────────────────
// Independent trust supporting community businesses in England. Gives grants and
// investment to community-owned enterprises — pubs, shops, energy schemes, spaces.
// Key programmes include The Resilience Fund and Community Business Fund.
async function crawlPowerToChange(): Promise<CrawlResult> {
  const SOURCE = 'power_to_change'
  try {
    const grants: ScrapedGrant[] = [
      {
        external_id:          `${SOURCE}_community_business_fund`,
        source:               SOURCE,
        title:                'Power to Change — Community Business Fund',
        funder:               'Power to Change',
        funder_type:          'trust_foundation',
        description:          'Grants of £50,000–£300,000 to help established community businesses grow and ' +
                              'become financially resilient. Supports community pubs, shops, spaces, energy ' +
                              'schemes, transport and other locally-owned enterprises across England.',
        amount_min:           50000,
        amount_max:           300000,
        deadline:             null,
        is_rolling:           true,
        is_local:             false,
        sectors:              ['community', 'enterprise', 'social enterprise', 'community assets'],
        eligibility_criteria: [
          'Must be a community business — community-owned and trading',
          'Based in England',
          'Must have traded for at least one year',
          'Community has meaningful ownership or governance stake',
          'Generates at least some income from trading (not grants-only)',
        ],
        apply_url:            'https://www.powertochange.org.uk/get-support/programmes/',
        raw_data:             { programme: 'community_business_fund', note: 'Hardcoded rolling entry' },
      },
      {
        external_id:          `${SOURCE}_resilience_fund`,
        source:               SOURCE,
        title:                'Power to Change — The Resilience Fund',
        funder:               'Power to Change',
        funder_type:          'trust_foundation',
        description:          'Smaller grants (up to £50,000) to help community businesses in England strengthen ' +
                              'their resilience — through business planning, diversifying income, improving ' +
                              'governance, or responding to challenges.',
        amount_min:           5000,
        amount_max:           50000,
        deadline:             null,
        is_rolling:           true,
        is_local:             false,
        sectors:              ['community', 'enterprise', 'social enterprise'],
        eligibility_criteria: [
          'Must be a community business based in England',
          'Open to earlier-stage or less financially stable community businesses',
          'Community ownership or governance must be meaningful',
        ],
        apply_url:            'https://www.powertochange.org.uk/get-support/programmes/',
        raw_data:             { programme: 'resilience_fund', note: 'Hardcoded rolling entry' },
      },
    ]
    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 50 — People's Health Trust ─────────────────────────────────────────
// Funded by health lottery proceeds. Focuses on health inequalities caused by
// social and economic conditions. Two main programmes: Active Communities (small
// grants up to £20k) and Health Equals (larger 3-year funding).
async function crawlPeoplesHealthTrust(): Promise<CrawlResult> {
  const SOURCE = 'peoples_health_trust'
  try {
    const grants: ScrapedGrant[] = [
      {
        external_id:          `${SOURCE}_active_communities`,
        source:               SOURCE,
        title:                "People's Health Trust — Active Communities",
        funder:               "People's Health Trust",
        funder_type:          'lottery',
        description:          'Grants up to £20,000 over one to two years for small, community-led groups ' +
                              'tackling the conditions that cause poor health — isolation, debt, poor housing, ' +
                              'lack of green space. Only available in specific areas of England, Scotland and Wales.',
        amount_min:           1000,
        amount_max:           20000,
        deadline:             null,
        is_rolling:           false,
        is_local:             true,
        sectors:              ['health', 'community', 'wellbeing', 'poverty'],
        eligibility_criteria: [
          'Community-led group (must be led by people with lived experience)',
          'Annual income under £350,000',
          'Working in a designated deprived area covered by the programme',
          'Activities address root causes of health inequalities',
          'Check website for currently open local areas',
        ],
        apply_url:            'https://www.peopleshealthtrust.org.uk/active-communities',
        raw_data:             { programme: 'active_communities', note: 'Hardcoded entry — check open areas on website' },
      },
      {
        external_id:          `${SOURCE}_health_equals`,
        source:               SOURCE,
        title:                "People's Health Trust — Health Equals",
        funder:               "People's Health Trust",
        funder_type:          'lottery',
        description:          'Larger 3-year grants for established organisations working to change the conditions ' +
                              'that drive health inequalities. Focused on housing, employment, early years and ' +
                              'social connection. Open UK-wide when running.',
        amount_min:           100000,
        amount_max:           500000,
        deadline:             null,
        is_rolling:           false,
        is_local:             false,
        sectors:              ['health', 'housing', 'employment', 'early years', 'poverty'],
        eligibility_criteria: [
          'Registered UK charity or social enterprise',
          'Minimum 3 years\' track record',
          'Evidence of impact on social determinants of health',
          'Programme opens periodically — check website for current status',
        ],
        apply_url:            'https://www.peopleshealthtrust.org.uk/health-equals',
        raw_data:             { programme: 'health_equals', note: 'Hardcoded rolling entry' },
      },
    ]
    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 51 — National Churches Trust ───────────────────────────────────────
// UK charity helping to maintain, repair and support church buildings so they
// can serve their communities. Grants for urgent structural repairs, community
// use improvements, and heritage projects.
async function crawlNationalChurchesTrust(): Promise<CrawlResult> {
  const SOURCE = 'national_churches_trust'
  try {
    const grants: ScrapedGrant[] = [
      {
        external_id:          `${SOURCE}_cornerstone`,
        source:               SOURCE,
        title:                'National Churches Trust — Cornerstone Grants',
        funder:               'National Churches Trust',
        funder_type:          'trust_foundation',
        description:          'Grants of £10,000–£50,000 for urgent structural repair of church buildings across ' +
                              'the UK. Focused on preventing further deterioration of the building fabric — ' +
                              'roofs, walls, towers and drainage.',
        amount_min:           10000,
        amount_max:           50000,
        deadline:             null,
        is_rolling:           true,
        is_local:             false,
        sectors:              ['heritage', 'community', 'faith'],
        eligibility_criteria: [
          'Church building open to the public for worship',
          'UK-wide (all denominations)',
          'Repair or maintenance work only (not new build)',
          'Evidence of regular use by the local community',
          'Listed building or significant heritage status preferred',
        ],
        apply_url:            'https://www.nationalchurchestrust.org/grants',
        raw_data:             { programme: 'cornerstone', note: 'Hardcoded rolling entry' },
      },
      {
        external_id:          `${SOURCE}_community_mission`,
        source:               SOURCE,
        title:                'National Churches Trust — Community Mission Grants',
        funder:               'National Churches Trust',
        funder_type:          'trust_foundation',
        description:          'Grants of up to £20,000 to help church buildings become better community assets — ' +
                              'toilet facilities, accessibility improvements, kitchens and flexible community ' +
                              'spaces that increase use by the local community.',
        amount_min:           1000,
        amount_max:           20000,
        deadline:             null,
        is_rolling:           true,
        is_local:             false,
        sectors:              ['heritage', 'community', 'faith', 'accessibility'],
        eligibility_criteria: [
          'Active church building open for community use',
          'UK-wide, all Christian denominations',
          'Project must increase or improve community use of the building',
          'Evidence of local need and community support',
        ],
        apply_url:            'https://www.nationalchurchestrust.org/grants',
        raw_data:             { programme: 'community_mission', note: 'Hardcoded rolling entry' },
      },
    ]
    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 52 — Tudor Trust ────────────────────────────────────────────────────
// Well-established independent foundation giving around £20 million/year to UK
// charities. Wide remit: community, welfare, arts, health, environment. Particularly
// interested in smaller organisations working with marginalised communities.
// No specific deadlines — applications reviewed on a rolling basis.
async function crawlTudorTrust(): Promise<CrawlResult> {
  const SOURCE = 'tudor_trust'
  try {
    const grants: ScrapedGrant[] = [{
      external_id:          `${SOURCE}_main`,
      source:               SOURCE,
      title:                'Tudor Trust — General Grants Programme',
      funder:               'Tudor Trust',
      funder_type:          'trust_foundation',
      description:          'Independent foundation giving around £20 million per year to UK charities. ' +
                            'Wide remit covering welfare, community, arts, health and environment. ' +
                            'Particularly interested in smaller charities (under £1.5m income) working ' +
                            'directly with people who are marginalised or facing disadvantage. ' +
                            'Applications reviewed on a rolling basis throughout the year.',
      amount_min:           1000,
      amount_max:           150000,
      deadline:             null,
      is_rolling:           true,
      is_local:             false,
      sectors:              ['community', 'welfare', 'arts', 'health', 'environment', 'disadvantaged communities'],
      eligibility_criteria: [
        'Registered UK charity',
        'Annual income preferably under £1.5 million',
        'Working with people facing disadvantage or marginalisation',
        'Must demonstrate direct, positive change for beneficiaries',
        'Cannot fund individuals, statutory bodies or overseas projects',
      ],
      apply_url:            'https://tudortrust.org.uk/what-we-fund/apply',
      raw_data:             { note: 'Hardcoded rolling entry — no structured listing page' },
    }]
    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 53 — Ufi VocTech Trust ─────────────────────────────────────────────
// Independent UK charity investing in technology that helps adults improve their
// vocational skills. Funds R&D and growth of digital tools for workplace and
// vocational learning. Periodic themed funding rounds.
async function crawlUfiVocTech(): Promise<CrawlResult> {
  const SOURCE = 'ufi_voctech'
  try {
    const grants: ScrapedGrant[] = [{
      external_id:          `${SOURCE}_voctech_fund`,
      source:               SOURCE,
      title:                'Ufi VocTech Trust — VocTech Impact Fund',
      funder:               'Ufi VocTech Trust',
      funder_type:          'trust_foundation',
      description:          'Grants and investment for organisations developing or scaling technology that ' +
                            'helps adults improve their vocational and technical skills. Covers digital tools ' +
                            'for workplace learning, apprenticeships, skills bootcamps and adult education. ' +
                            'Periodic funding rounds — check website for current calls.',
      amount_min:           50000,
      amount_max:           500000,
      deadline:             null,
      is_rolling:           false,
      is_local:             false,
      sectors:              ['education', 'technology', 'employment', 'skills', 'digital'],
      eligibility_criteria: [
        'UK-based organisation (charity, social enterprise, or commercial)',
        'Project must use technology to improve adult vocational learning',
        'Can be R&D (earlier stage) or scaling proven tools',
        'Must demonstrate potential for significant reach and impact',
        'Commercial organisations eligible but must show social benefit',
      ],
      apply_url:            'https://ufi.co.uk/funding/',
      raw_data:             { note: 'Hardcoded entry — check website for open funding rounds' },
    }]
    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Batch definitions ─────────────────────────────────────────────────────────
// Sources are grouped into 3 batches so each cron invocation handles ~15 sources.
// Batch 1: core nationals + first CFs
// Batch 2: corporate funders + mid CFs
// Batch 3: Session-4b CFs + foundations

type BatchNum = 1 | 2 | 3

const BATCH_1_SOURCES = [
  'gov_uk', 'tnlcf', 'ukri', 'gla', 'arts_council',
  'sport_england', 'heritage_fund', 'forever_manchester', 'two_ridings_cf', 'cf_wales',
  'quartet_cf', 'cf_ni', 'heart_of_england_cf', 'foundation_scotland', 'london_cf',
] as const

const BATCH_2_SOURCES = [
  'sussex_cf', 'surrey_cf', 'hiwcf', 'oxfordshire_cf',
  'asda_foundation', 'aviva_foundation', 'nationwide_foundation',
  'tyne_wear_cf', 'norfolk_cf', 'suffolk_cf',
  'merseyside_cf', 'bbc_cin', 'gloucestershire_cf',
  'heart_of_bucks_cf', 'llr_cf',
] as const

const BATCH_3_SOURCES = [
  'mk_cf', 'lancs_cf', 'cambs_cf', 'herts_cf',
  'wiltshire_cf', 'calderdale_cf',
  'somerset_cf', 'forever_notts', 'cheshire_cf',
  'shropshire_cf', 'kent_cf', 'lincolnshire_cf',
  'paul_hamlyn_foundation', 'esmee_fairbairn', 'henry_smith',
  'garfield_weston', 'clothworkers_foundation',
  'jrct', 'power_to_change', 'peoples_health_trust',
  'national_churches_trust', 'tudor_trust', 'ufi_voctech',
] as const

// ── Main export ───────────────────────────────────────────────────────────────
// Pass batch=1|2|3 to run only that subset (used by split cron jobs).
// Omit batch (or pass undefined) to run all sources.
export async function crawlAllSources(batch?: BatchNum): Promise<CrawlResult[]> {
  // Determine which sources to include
  let include: ReadonlySet<string> | null = null
  if (batch === 1) include = new Set(BATCH_1_SOURCES)
  if (batch === 2) include = new Set(BATCH_2_SOURCES)
  if (batch === 3) include = new Set(BATCH_3_SOURCES)

  function run(source: string, fn: () => Promise<CrawlResult>): Promise<CrawlResult> {
    if (include && !include.has(source)) {
      return Promise.resolve({ source, fetched: 0, upserted: 0, error: 'skipped' })
    }
    return guarded(source, fn)
  }

  const [
    govUK, tnlcf, ukri, gla, ace,
    sportEngland, heritageFund, foreverMcr, twoRidings, cfWales,
    quartetCF, cfNI, heartOfEngland, foundationScotland, londonCF,
    sussexCF, surreyCF, hiwcf, oxfordshireCF,
    asdaFoundation, avivaFoundation, nationwideFoundation,
    tyneWearCF, norfolkCF, suffolkCF,
    merseysideCF, bbcCiN, gloucestershireCF,
    heartOfBucksCF, llrCF, mkCF,
    lancsCF, cambsCF, hertsCF,
    wiltshireCF, calderdaleCF,
    somersetCF, foreverNotts, cheshireCF,
    shropshireCF, kentCF, lincolnshireCF,
    paulHamlynFoundation, esmeeFairbairn, henrySmith,
    garfieldWeston, clothworkersFoundation,
    jrct, powerToChange, peoplesHealthTrust,
    nationalChurchesTrust, tudorTrust, ufiVocTech,
  ] = await Promise.allSettled([
    run('gov_uk',                  crawlGovUK),
    run('tnlcf',                   crawlTNLCF),
    run('ukri',                    crawlUKRI),
    run('gla',                     crawlGLA),
    run('arts_council',            crawlArtsCouncil),
    run('sport_england',           crawlSportEngland),
    run('heritage_fund',           crawlHeritageFund),
    run('forever_manchester',      crawlForeverManchester),
    run('two_ridings_cf',          crawlTwoRidingsCF),
    run('cf_wales',                crawlCFWales),
    run('quartet_cf',              crawlQuartetCF),
    run('cf_ni',                   crawlCFNI),
    run('heart_of_england_cf',     crawlHeartOfEnglandCF),
    run('foundation_scotland',     crawlFoundationScotland),
    run('london_cf',               crawlLondonCF),
    run('sussex_cf',               crawlSussexCF),
    run('surrey_cf',               crawlSurreyCF),
    run('hiwcf',                   crawlHIWCF),
    run('oxfordshire_cf',          crawlOxfordshireCF),
    run('asda_foundation',         crawlAsdaFoundation),
    run('aviva_foundation',        crawlAvivaFoundation),
    run('nationwide_foundation',   crawlNationwideFoundation),
    run('tyne_wear_cf',            crawlTyneWearCF),
    run('norfolk_cf',              crawlNorfolkCF),
    run('suffolk_cf',              crawlSuffolkCF),
    run('merseyside_cf',           crawlMerseysideCF),
    run('bbc_cin',                 crawlBBCChildrenInNeed),
    run('gloucestershire_cf',      crawlGloucestershireCF),
    run('heart_of_bucks_cf',       crawlHeartOfBucksCF),
    run('llr_cf',                  crawlLLRCF),
    run('mk_cf',                   crawlMKCF),
    run('lancs_cf',                crawlLancsCF),
    run('cambs_cf',                crawlCambsCF),
    run('herts_cf',                crawlHertsCF),
    run('wiltshire_cf',            crawlWiltshireCF),
    run('calderdale_cf',           crawlCalderdaleCF),
    run('somerset_cf',             crawlSomersetCF),
    run('forever_notts',           crawlForeverNotts),
    run('cheshire_cf',             crawlCheshireCF),
    run('shropshire_cf',           crawlShropshireCF),
    run('kent_cf',                 crawlKentCF),
    run('lincolnshire_cf',         crawlLincolnshireCF),
    run('paul_hamlyn_foundation',  crawlPaulHamlynFoundation),
    run('esmee_fairbairn',         crawlEsmeeFairbairn),
    run('henry_smith',             crawlHenrySmithFoundation),
    run('garfield_weston',         crawlGarfieldWeston),
    run('clothworkers_foundation', crawlClothworkersFoundation),
    run('jrct',                    crawlJRCT),
    run('power_to_change',         crawlPowerToChange),
    run('peoples_health_trust',    crawlPeoplesHealthTrust),
    run('national_churches_trust', crawlNationalChurchesTrust),
    run('tudor_trust',             crawlTudorTrust),
    run('ufi_voctech',             crawlUfiVocTech),
  ])

  const fallback = (source: string) => ({ source, fetched: 0, upserted: 0, error: 'Promise rejected' })

  const results = [
    govUK.status                  === 'fulfilled' ? govUK.value                  : fallback('gov_uk'),
    tnlcf.status                  === 'fulfilled' ? tnlcf.value                  : fallback('tnlcf'),
    ukri.status                   === 'fulfilled' ? ukri.value                   : fallback('ukri'),
    gla.status                    === 'fulfilled' ? gla.value                    : fallback('gla'),
    ace.status                    === 'fulfilled' ? ace.value                    : fallback('arts_council'),
    sportEngland.status           === 'fulfilled' ? sportEngland.value           : fallback('sport_england'),
    heritageFund.status           === 'fulfilled' ? heritageFund.value           : fallback('heritage_fund'),
    foreverMcr.status             === 'fulfilled' ? foreverMcr.value             : fallback('forever_manchester'),
    twoRidings.status             === 'fulfilled' ? twoRidings.value             : fallback('two_ridings_cf'),
    cfWales.status                === 'fulfilled' ? cfWales.value                : fallback('cf_wales'),
    quartetCF.status              === 'fulfilled' ? quartetCF.value              : fallback('quartet_cf'),
    cfNI.status                   === 'fulfilled' ? cfNI.value                   : fallback('cf_ni'),
    heartOfEngland.status         === 'fulfilled' ? heartOfEngland.value         : fallback('heart_of_england_cf'),
    foundationScotland.status     === 'fulfilled' ? foundationScotland.value     : fallback('foundation_scotland'),
    londonCF.status               === 'fulfilled' ? londonCF.value               : fallback('london_cf'),
    sussexCF.status               === 'fulfilled' ? sussexCF.value               : fallback('sussex_cf'),
    surreyCF.status               === 'fulfilled' ? surreyCF.value               : fallback('surrey_cf'),
    hiwcf.status                  === 'fulfilled' ? hiwcf.value                  : fallback('hiwcf'),
    oxfordshireCF.status          === 'fulfilled' ? oxfordshireCF.value          : fallback('oxfordshire_cf'),
    asdaFoundation.status         === 'fulfilled' ? asdaFoundation.value         : fallback('asda_foundation'),
    avivaFoundation.status        === 'fulfilled' ? avivaFoundation.value        : fallback('aviva_foundation'),
    nationwideFoundation.status   === 'fulfilled' ? nationwideFoundation.value   : fallback('nationwide_foundation'),
    tyneWearCF.status             === 'fulfilled' ? tyneWearCF.value             : fallback('tyne_wear_cf'),
    norfolkCF.status              === 'fulfilled' ? norfolkCF.value              : fallback('norfolk_cf'),
    suffolkCF.status              === 'fulfilled' ? suffolkCF.value              : fallback('suffolk_cf'),
    merseysideCF.status           === 'fulfilled' ? merseysideCF.value           : fallback('merseyside_cf'),
    bbcCiN.status                 === 'fulfilled' ? bbcCiN.value                 : fallback('bbc_cin'),
    gloucestershireCF.status      === 'fulfilled' ? gloucestershireCF.value      : fallback('gloucestershire_cf'),
    heartOfBucksCF.status         === 'fulfilled' ? heartOfBucksCF.value         : fallback('heart_of_bucks_cf'),
    llrCF.status                  === 'fulfilled' ? llrCF.value                  : fallback('llr_cf'),
    mkCF.status                   === 'fulfilled' ? mkCF.value                   : fallback('mk_cf'),
    lancsCF.status                === 'fulfilled' ? lancsCF.value                : fallback('lancs_cf'),
    cambsCF.status                === 'fulfilled' ? cambsCF.value                : fallback('cambs_cf'),
    hertsCF.status                === 'fulfilled' ? hertsCF.value                : fallback('herts_cf'),
    wiltshireCF.status            === 'fulfilled' ? wiltshireCF.value            : fallback('wiltshire_cf'),
    calderdaleCF.status           === 'fulfilled' ? calderdaleCF.value           : fallback('calderdale_cf'),
    somersetCF.status             === 'fulfilled' ? somersetCF.value             : fallback('somerset_cf'),
    foreverNotts.status           === 'fulfilled' ? foreverNotts.value           : fallback('forever_notts'),
    cheshireCF.status             === 'fulfilled' ? cheshireCF.value             : fallback('cheshire_cf'),
    shropshireCF.status           === 'fulfilled' ? shropshireCF.value           : fallback('shropshire_cf'),
    kentCF.status                 === 'fulfilled' ? kentCF.value                 : fallback('kent_cf'),
    lincolnshireCF.status         === 'fulfilled' ? lincolnshireCF.value         : fallback('lincolnshire_cf'),
    paulHamlynFoundation.status   === 'fulfilled' ? paulHamlynFoundation.value   : fallback('paul_hamlyn_foundation'),
    esmeeFairbairn.status         === 'fulfilled' ? esmeeFairbairn.value         : fallback('esmee_fairbairn'),
    henrySmith.status             === 'fulfilled' ? henrySmith.value             : fallback('henry_smith'),
    garfieldWeston.status         === 'fulfilled' ? garfieldWeston.value         : fallback('garfield_weston'),
    clothworkersFoundation.status === 'fulfilled' ? clothworkersFoundation.value : fallback('clothworkers_foundation'),
    jrct.status                   === 'fulfilled' ? jrct.value                   : fallback('jrct'),
    powerToChange.status          === 'fulfilled' ? powerToChange.value          : fallback('power_to_change'),
    peoplesHealthTrust.status     === 'fulfilled' ? peoplesHealthTrust.value     : fallback('peoples_health_trust'),
    nationalChurchesTrust.status  === 'fulfilled' ? nationalChurchesTrust.value  : fallback('national_churches_trust'),
    tudorTrust.status             === 'fulfilled' ? tudorTrust.value             : fallback('tudor_trust'),
    ufiVocTech.status             === 'fulfilled' ? ufiVocTech.value             : fallback('ufi_voctech'),
  ]

  // ── Persist run to crawl_logs (best-effort, don't fail if table missing) ─
  try {
    const loggable = results.filter(r => r.error !== 'skipped')
    if (loggable.length > 0) {
      await adminClient()
        .from('crawl_logs')
        .insert(loggable.map(r => ({
          source:   r.source,
          batch:    batch ?? null,
          fetched:  r.fetched,
          upserted: r.upserted,
          error:    r.error ?? null,
        })))
    }
  } catch { /* crawl_logs table may not exist yet — ignore */ }

  return results
}
