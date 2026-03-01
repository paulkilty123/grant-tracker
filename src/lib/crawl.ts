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

// ── Description fetcher ───────────────────────────────────────────────────────
// Visits an individual grant/fund detail page and extracts the first meaningful
// paragraph(s) using common WordPress / Elementor content selectors.
// Returns '' on any error so callers can safely fall back.
async function fetchDetailDescription(url: string): Promise<string> {
  try {
    const html = await fetchHtml(url)
    const root = parseHTML(html)
    const SELECTORS = [
      '.entry-content',
      '.post-content',
      '.elementor-widget-text-editor',
      'article .content',
      '.grant-description',
      'main',
    ]
    for (const sel of SELECTORS) {
      const el = root.querySelector(sel)
      if (!el) continue
      const paras = el.querySelectorAll('p')
        .map(p => p.text.trim())
        .filter(t => t.length > 40)
      if (paras.length > 0) return paras.slice(0, 2).join(' ').slice(0, 600)
      const text = el.text.replace(/\s+/g, ' ').trim()
      if (text.length > 40) return text.slice(0, 600)
    }
    return ''
  } catch {
    return ''
  }
}

// Enriches a list of ScrapedGrants by fetching descriptions from their apply_url.
// Runs in batches of `concurrency` to avoid hammering sites.
// Grants that already have a non-empty description are left untouched.
async function withDescriptions(grants: ScrapedGrant[], concurrency = 3): Promise<ScrapedGrant[]> {
  const out: ScrapedGrant[] = []
  for (let i = 0; i < grants.length; i += concurrency) {
    const batch = grants.slice(i, i + concurrency)
    const settled = await Promise.allSettled(
      batch.map(async (g) => {
        if (g.description) return g                    // already has one
        if (!g.apply_url)  return g                    // nowhere to fetch from
        const desc = await fetchDetailDescription(g.apply_url)
        return { ...g, description: desc }
      })
    )
    for (let j = 0; j < settled.length; j++) {
      const r = settled[j]
      out.push(r.status === 'fulfilled' ? r.value : batch[j])
    }
  }
  return out
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

    const enriched = await withDescriptions(grants)
    return await upsertGrants(SOURCE, enriched)
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

    const enriched = await withDescriptions(grants)
    return await upsertGrants(SOURCE, enriched)
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

    const enriched = await withDescriptions(grants)
    return await upsertGrants(SOURCE, enriched)
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

    // Build a map of h2 → following sibling paragraphs for descriptions
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allNodes = Array.from((addRoot.querySelector('body') ?? addRoot).childNodes as any)
    for (const h2 of addRoot.querySelectorAll('h2')) {
      const title = h2.text?.trim().replace(/\.$/, '')
      if (!title || title.length < 5 || SKIP_H2.test(title)) continue
      const slug = slugify(title)

      // Collect text from sibling nodes that follow this h2 until the next h2
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parent: any = h2.parentNode ?? addRoot
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const siblings = Array.from((parent.childNodes ?? []) as any[])
      const h2Idx = siblings.indexOf(h2 as unknown)
      const descParts: string[] = []
      for (let k = h2Idx + 1; k < siblings.length && descParts.length < 3; k++) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sib = siblings[k] as any
        if (sib.tagName === 'H2') break
        const text = (sib.text ?? '').replace(/\s+/g, ' ').trim()
        if (text.length > 30) descParts.push(text)
      }
      const description = descParts.join(' ').slice(0, 600)

      grants.push({
        external_id:          `sussex_cf_${slug}`,
        source:               SOURCE,
        title,
        funder:               'Sussex Community Foundation',
        funder_type:          'community_foundation',
        description,
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
    void allNodes // referenced to avoid unused-var lint warning

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

    const enriched = await withDescriptions(grants)
    return await upsertGrants(SOURCE, enriched)
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

    const enriched = await withDescriptions(grants)
    return await upsertGrants(SOURCE, enriched)
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
      apply_url:            'https://www.bbcchildreninneed.co.uk/grants/',
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
      apply_url:            'https://www.bbcchildreninneed.co.uk/grants/',
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

    // Only fetch detail pages for grants with a real individual URL (not the listing page)
    const toEnrich = grants.map(g => g.apply_url !== LISTURL ? g : { ...g, description: 'See Lincolnshire Community Foundation website for eligibility criteria and how to apply.' })
    const enriched = await withDescriptions(toEnrich)
    return await upsertGrants(SOURCE, enriched)
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
// Compare date strings (YYYY-MM-DD) not datetimes — avoids incorrectly
// discarding today's deadline when the cron runs early in the morning.
function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

function parseDeadline(raw: unknown): string | null {
  if (!raw) return null
  const d = new Date(String(raw))
  if (isNaN(d.getTime())) return null
  const iso = d.toISOString().split('T')[0]
  // Discard only dates strictly before today (yesterday or earlier)
  if (iso < todayISO()) return null
  return iso
}

// Parses "14 May 2026 4:00pm UK time" → "2026-05-14"
function parseUKRIDate(str: string): string | null {
  if (!str) return null
  const match = str.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/)
  if (!match) return null
  const d = new Date(`${match[2]} ${match[1]} ${match[3]}`)
  if (isNaN(d.getTime())) return null
  const iso = d.toISOString().split('T')[0]
  if (iso < todayISO()) return null
  return iso
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

// ── Data validation ───────────────────────────────────────────────────────────
/**
 * Sanitise a single scraped grant before it goes to the DB:
 *   - skip if title is blank or too short (< 5 chars)
 *   - null out negative amounts
 *   - swap amount_min / amount_max if inverted
 *   - cap implausibly large amounts (> £50m is almost certainly a parse error)
 */
function sanitiseGrant(g: ScrapedGrant): ScrapedGrant | null {
  if (!g.title || g.title.trim().length < 5) return null

  let minAmt = g.amount_min
  let maxAmt = g.amount_max

  // Null out negative values
  if (minAmt !== null && minAmt < 0) minAmt = null
  if (maxAmt !== null && maxAmt < 0) maxAmt = null

  // Swap if inverted
  if (minAmt !== null && maxAmt !== null && minAmt > maxAmt) {
    [minAmt, maxAmt] = [maxAmt, minAmt]
  }

  // Cap implausible amounts (> £50m is almost certainly a parse error)
  const MAX_PLAUSIBLE = 50_000_000
  if (minAmt !== null && minAmt > MAX_PLAUSIBLE) minAmt = null
  if (maxAmt !== null && maxAmt > MAX_PLAUSIBLE) maxAmt = null

  return { ...g, amount_min: minAmt, amount_max: maxAmt }
}

// ── DB upsert ─────────────────────────────────────────────────────────────────
async function upsertGrants(source: string, grants: ScrapedGrant[]): Promise<CrawlResult> {
  if (grants.length === 0) return { source, fetched: 0, upserted: 0 }
  const supabase = adminClient()

  // Sanitise and drop invalid rows before upserting
  const valid = grants.map(sanitiseGrant).filter((g): g is ScrapedGrant => g !== null)
  if (valid.length === 0) return { source, fetched: grants.length, upserted: 0, error: 'All rows failed validation' }

  const rows = valid.map(g => ({
    ...g,
    last_seen_at: new Date().toISOString(),
    is_active:    true,
  }))

  const { error } = await supabase
    .from('scraped_grants')
    .upsert(rows, { onConflict: 'external_id' })

  if (error) return { source, fetched: grants.length, upserted: 0, error: error.message }
  return { source, fetched: grants.length, upserted: valid.length }
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
        apply_url:            'https://www.jrct.org.uk/funding-priorities',
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
        apply_url:            'https://www.jrct.org.uk/funding-priorities',
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
        apply_url:            'https://www.jrct.org.uk/funding-priorities',
        raw_data:             { programme: 'sustainable_future', note: 'Hardcoded rolling entry' },
      },
    ]
    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 50 — People's Health Trust ─────────────────────────────────────────
// Funded by health lottery proceeds. Focuses on health inequalities caused by
// social and economic conditions. Now operates via the Health Justice Fund —
// six thematic priority areas covering housing, discrimination, mental health,
// employment and more. Individual themes open for applications periodically.
async function crawlPeoplesHealthTrust(): Promise<CrawlResult> {
  const SOURCE = 'peoples_health_trust'
  try {
    const grants: ScrapedGrant[] = [
      {
        external_id:          `${SOURCE}_health_justice_fund`,
        source:               SOURCE,
        title:                "People's Health Trust — Health Justice Fund",
        funder:               "People's Health Trust",
        funder_type:          'lottery',
        description:          'The Health Justice Fund supports communities experiencing health inequalities to ' +
                              'improve health for the long term. Six thematic priority areas: Advice for Health, ' +
                              'Discrimination & Health, Good Work & Young People, Homes for Health, Nature for Health, ' +
                              'and Partnerships for Health. Each theme opens for applications periodically — ' +
                              'check the website for currently live rounds.',
        amount_min:           10000,
        amount_max:           150000,
        deadline:             null,
        is_rolling:           false,
        is_local:             false,
        sectors:              ['health', 'housing', 'employment', 'discrimination', 'mental health', 'poverty'],
        eligibility_criteria: [
          'UK charity, community interest company or similar',
          'Community-led or co-produced approach required',
          'Must address root causes of health inequalities (not just symptoms)',
          'Evidence of working with communities experiencing disadvantage',
          'Check website for currently open priority themes',
        ],
        apply_url:            'https://www.peopleshealthtrust.org.uk/funding/health-justice-fund',
        raw_data:             { programme: 'health_justice_fund', note: 'Hardcoded entry — site rebuilt 2024/25, check open themes' },
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
        apply_url:            'https://www.nationalchurchestrust.org/get-support/grants',
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
        apply_url:            'https://www.nationalchurchestrust.org/get-support/grants',
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
      apply_url:            'https://ufi.co.uk/grant-funding/',
      raw_data:             { note: 'Hardcoded entry — check website for open funding rounds' },
    }]
    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 54 — Devon Community Foundation ────────────────────────────────────
// devoncf.com — supports charities and community groups across Devon.
// Tries grants listing HTML; falls back to a hardcoded rolling entry.
async function crawlDevonCF(): Promise<CrawlResult> {
  const SOURCE = 'devon_cf'
  const BASE   = 'https://www.devoncf.com'
  try {
    const html  = await fetchHtml(`${BASE}/grants/`)
    const root  = parseHTML(html)
    const grants: ScrapedGrant[] = []

    for (const card of root.querySelectorAll('article, .grant, .fund, .funding-item')) {
      const titleEl = card.querySelector('h2 a, h3 a, h2, h3')
      const title   = titleEl?.text?.trim()
      if (!title || title.length < 5) continue

      const href  = card.querySelector('a')?.getAttribute('href') ?? ''
      const url   = href.startsWith('http') ? href : `${BASE}${href}`
      const slug  = slugify(href || title)
      const desc  = card.querySelector('p, .excerpt')?.text?.trim() ?? ''
      const { min, max } = parseAmountRange(desc + ' ' + title)

      grants.push({
        external_id:          `devon_cf_${slug}`,
        source:               SOURCE,
        title,
        funder:               'Devon Community Foundation',
        funder_type:          'community_foundation',
        description:          desc || 'Grant from Devon Community Foundation.',
        amount_min:           min,
        amount_max:           max,
        deadline:             null,
        is_rolling:           true,
        is_local:             true,
        sectors:              ['community', 'social welfare'],
        eligibility_criteria: ['Groups and charities based in Devon'],
        apply_url:            url || null,
        raw_data:             { title, href } as Record<string, unknown>,
      })
    }

    if (grants.length > 0) return await upsertGrants(SOURCE, grants)

    return await upsertGrants(SOURCE, [{
      external_id:          `${SOURCE}_open_grants`,
      source:               SOURCE,
      title:                'Devon Community Foundation — Open Grants',
      funder:               'Devon Community Foundation',
      funder_type:          'community_foundation',
      description:          'Devon Community Foundation supports charities, community groups and social enterprises across Devon. Multiple grant programmes available throughout the year.',
      amount_min:           250,
      amount_max:           20000,
      deadline:             null,
      is_rolling:           true,
      is_local:             true,
      sectors:              ['community', 'social welfare', 'health', 'arts', 'environment'],
      eligibility_criteria: ['Registered charity or community group in Devon'],
      apply_url:            `${BASE}/apply-for-a-grant/`,
      raw_data:             { note: 'Hardcoded fallback' } as Record<string, unknown>,
    }])
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 55 — Leeds Community Foundation ────────────────────────────────────
// leedscf.org.uk — funds charities and community groups in Leeds & West Yorkshire.
async function crawlLeedsCF(): Promise<CrawlResult> {
  const SOURCE = 'leeds_cf'
  const BASE   = 'https://www.leedscf.org.uk'
  try {
    const html  = await fetchHtml(`${BASE}/apply-for-a-grant/`)
    const root  = parseHTML(html)
    const grants: ScrapedGrant[] = []

    for (const card of root.querySelectorAll('article, .grant, .fund, .funding-card, section.fund')) {
      const titleEl = card.querySelector('h2 a, h3 a, h2, h3')
      const title   = titleEl?.text?.trim()
      if (!title || title.length < 5) continue

      const href = card.querySelector('a')?.getAttribute('href') ?? ''
      const url  = href.startsWith('http') ? href : `${BASE}${href}`
      const slug = slugify(href || title)
      const desc = card.querySelector('p, .excerpt')?.text?.trim() ?? ''
      const { min, max } = parseAmountRange(desc + ' ' + title)

      grants.push({
        external_id:          `leeds_cf_${slug}`,
        source:               SOURCE,
        title,
        funder:               'Leeds Community Foundation',
        funder_type:          'community_foundation',
        description:          desc || 'Grant from Leeds Community Foundation.',
        amount_min:           min,
        amount_max:           max,
        deadline:             null,
        is_rolling:           true,
        is_local:             true,
        sectors:              ['community', 'social welfare', 'health'],
        eligibility_criteria: ['Charities and community groups in Leeds / West Yorkshire'],
        apply_url:            url || null,
        raw_data:             { title, href } as Record<string, unknown>,
      })
    }

    if (grants.length > 0) return await upsertGrants(SOURCE, grants)

    return await upsertGrants(SOURCE, [{
      external_id:          `${SOURCE}_open_grants`,
      source:               SOURCE,
      title:                'Leeds Community Foundation — Open Grants',
      funder:               'Leeds Community Foundation',
      funder_type:          'community_foundation',
      description:          'Leeds Community Foundation makes grants to charities and community organisations across Leeds and West Yorkshire. Programmes cover community, health, arts, sport and economic development.',
      amount_min:           500,
      amount_max:           25000,
      deadline:             null,
      is_rolling:           true,
      is_local:             true,
      sectors:              ['community', 'social welfare', 'health', 'arts', 'sport'],
      eligibility_criteria: ['Registered charity or community group in Leeds / West Yorkshire'],
      apply_url:            `${BASE}/apply-for-a-grant/`,
      raw_data:             { note: 'Hardcoded fallback' } as Record<string, unknown>,
    }])
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 56 — Essex Community Foundation ────────────────────────────────────
// essexcf.org.uk — one of the largest CFs in the country, serving Essex and East London.
async function crawlEssexCF(): Promise<CrawlResult> {
  const SOURCE  = 'essex_cf'
  const BASE    = 'https://www.essexcf.org.uk'
  const SITEMAP = `${BASE}/custom_fund-sitemap.xml`
  try {
    const xml    = await fetchHtml(SITEMAP)
    const grants: ScrapedGrant[] = []
    const locRe  = /<loc>([^<]+)<\/loc>/g
    let match: RegExpExecArray | null

    while ((match = locRe.exec(xml)) !== null) {
      const url = match[1].trim()
      if (!url.includes('/fund') || url === `${BASE}/funds/`) continue

      const slug  = url.split('/').filter(Boolean).pop() ?? ''
      const title = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

      grants.push({
        external_id:          `essex_cf_${slug}`,
        source:               SOURCE,
        title:                `Essex CF — ${title}`,
        funder:               'Essex Community Foundation',
        funder_type:          'community_foundation',
        description:          'Grant programme from Essex Community Foundation. Visit the link for full eligibility criteria and application details.',
        amount_min:           null,
        amount_max:           null,
        deadline:             null,
        is_rolling:           true,
        is_local:             true,
        sectors:              ['community', 'social welfare'],
        eligibility_criteria: ['Charities and voluntary groups in Essex'],
        apply_url:            url,
        raw_data:             { url } as Record<string, unknown>,
      })
    }

    if (grants.length > 0) return await upsertGrants(SOURCE, grants)

    return await upsertGrants(SOURCE, [{
      external_id:          `${SOURCE}_open_grants`,
      source:               SOURCE,
      title:                'Essex Community Foundation — Grants',
      funder:               'Essex Community Foundation',
      funder_type:          'community_foundation',
      description:          'One of the largest community foundations in the UK, Essex CF funds organisations across Essex and East London. Multiple programmes active throughout the year.',
      amount_min:           500,
      amount_max:           50000,
      deadline:             null,
      is_rolling:           true,
      is_local:             true,
      sectors:              ['community', 'social welfare', 'health', 'arts', 'environment'],
      eligibility_criteria: ['Registered charity or VCSE organisation in Essex'],
      apply_url:            `${BASE}/for-applicants/`,
      raw_data:             { note: 'Hardcoded fallback' } as Record<string, unknown>,
    }])
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 57 — Bedfordshire & Luton Community Foundation ─────────────────────
// blcf.org.uk — serves Bedfordshire and Luton.
async function crawlBedfordshireCF(): Promise<CrawlResult> {
  const SOURCE = 'bedfordshire_cf'
  const BASE   = 'https://www.blcf.org.uk'
  try {
    const html  = await fetchHtml(`${BASE}/grants/`)
    const root  = parseHTML(html)
    const grants: ScrapedGrant[] = []

    for (const card of root.querySelectorAll('article, .grant, .fund, .grant-item')) {
      const titleEl = card.querySelector('h2 a, h3 a, h2, h3')
      const title   = titleEl?.text?.trim()
      if (!title || title.length < 5) continue

      const href = card.querySelector('a')?.getAttribute('href') ?? ''
      const url  = href.startsWith('http') ? href : `${BASE}${href}`
      const slug = slugify(href || title)
      const desc = card.querySelector('p')?.text?.trim() ?? ''
      const { min, max } = parseAmountRange(desc + ' ' + title)

      grants.push({
        external_id:          `bedfordshire_cf_${slug}`,
        source:               SOURCE,
        title,
        funder:               'Bedfordshire & Luton Community Foundation',
        funder_type:          'community_foundation',
        description:          desc || 'Grant from Bedfordshire & Luton Community Foundation.',
        amount_min:           min,
        amount_max:           max,
        deadline:             null,
        is_rolling:           true,
        is_local:             true,
        sectors:              ['community', 'social welfare'],
        eligibility_criteria: ['Groups and charities in Bedfordshire or Luton'],
        apply_url:            url || null,
        raw_data:             { title, href } as Record<string, unknown>,
      })
    }

    if (grants.length > 0) return await upsertGrants(SOURCE, grants)

    return await upsertGrants(SOURCE, [{
      external_id:          `${SOURCE}_open_grants`,
      source:               SOURCE,
      title:                'Bedfordshire & Luton Community Foundation — Open Grants',
      funder:               'Bedfordshire & Luton Community Foundation',
      funder_type:          'community_foundation',
      description:          'The Bedfordshire & Luton Community Foundation distributes grants to charities, voluntary organisations and community groups across Bedfordshire and Luton.',
      amount_min:           300,
      amount_max:           10000,
      deadline:             null,
      is_rolling:           true,
      is_local:             true,
      sectors:              ['community', 'social welfare', 'health', 'education'],
      eligibility_criteria: ['Voluntary or community organisation in Bedfordshire or Luton'],
      apply_url:            `${BASE}/apply/`,
      raw_data:             { note: 'Hardcoded fallback' } as Record<string, unknown>,
    }])
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 58 — County Durham Community Foundation ────────────────────────────
// cdcf.org.uk — the main community foundation for County Durham.
async function crawlDurhamCF(): Promise<CrawlResult> {
  const SOURCE = 'durham_cf'
  const BASE   = 'https://www.cdcf.org.uk'
  try {
    const html  = await fetchHtml(`${BASE}/funds/`)
    const root  = parseHTML(html)
    const grants: ScrapedGrant[] = []

    for (const card of root.querySelectorAll('article, .fund, .grant, .funding-item')) {
      const titleEl = card.querySelector('h2 a, h3 a, h2, h3')
      const title   = titleEl?.text?.trim()
      if (!title || title.length < 5) continue

      const href = card.querySelector('a')?.getAttribute('href') ?? ''
      const url  = href.startsWith('http') ? href : `${BASE}${href}`
      const slug = slugify(href || title)
      const desc = card.querySelector('p')?.text?.trim() ?? ''
      const { min, max } = parseAmountRange(desc + ' ' + title)

      grants.push({
        external_id:          `durham_cf_${slug}`,
        source:               SOURCE,
        title,
        funder:               'County Durham Community Foundation',
        funder_type:          'community_foundation',
        description:          desc || 'Grant from County Durham Community Foundation.',
        amount_min:           min,
        amount_max:           max,
        deadline:             null,
        is_rolling:           true,
        is_local:             true,
        sectors:              ['community', 'social welfare'],
        eligibility_criteria: ['Organisations based in County Durham'],
        apply_url:            url || null,
        raw_data:             { title, href } as Record<string, unknown>,
      })
    }

    if (grants.length > 0) return await upsertGrants(SOURCE, grants)

    return await upsertGrants(SOURCE, [{
      external_id:          `${SOURCE}_open_grants`,
      source:               SOURCE,
      title:                'County Durham Community Foundation — Open Grants',
      funder:               'County Durham Community Foundation',
      funder_type:          'community_foundation',
      description:          'County Durham Community Foundation manages a range of funds supporting charitable and community activity across County Durham.',
      amount_min:           500,
      amount_max:           15000,
      deadline:             null,
      is_rolling:           true,
      is_local:             true,
      sectors:              ['community', 'social welfare', 'health', 'arts'],
      eligibility_criteria: ['Registered charity or voluntary group in County Durham'],
      apply_url:            `${BASE}/apply-for-funding/`,
      raw_data:             { note: 'Hardcoded fallback' } as Record<string, unknown>,
    }])
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 59 — Cumbria Community Foundation ──────────────────────────────────
// cumbria.community — serves Cumbria (now Cumberland and Westmorland).
async function crawlCumbriaCF(): Promise<CrawlResult> {
  const SOURCE = 'cumbria_cf'
  const BASE   = 'https://www.cumbria.community'
  try {
    const html  = await fetchHtml(`${BASE}/apply-for-a-grant/`)
    const root  = parseHTML(html)
    const grants: ScrapedGrant[] = []

    for (const card of root.querySelectorAll('article, .grant, .fund, .grant-item')) {
      const titleEl = card.querySelector('h2 a, h3 a, h2, h3')
      const title   = titleEl?.text?.trim()
      if (!title || title.length < 5) continue

      const href = card.querySelector('a')?.getAttribute('href') ?? ''
      const url  = href.startsWith('http') ? href : `${BASE}${href}`
      const slug = slugify(href || title)
      const desc = card.querySelector('p')?.text?.trim() ?? ''
      const { min, max } = parseAmountRange(desc + ' ' + title)

      grants.push({
        external_id:          `cumbria_cf_${slug}`,
        source:               SOURCE,
        title,
        funder:               'Cumbria Community Foundation',
        funder_type:          'community_foundation',
        description:          desc || 'Grant from Cumbria Community Foundation.',
        amount_min:           min,
        amount_max:           max,
        deadline:             null,
        is_rolling:           true,
        is_local:             true,
        sectors:              ['community', 'social welfare', 'rural'],
        eligibility_criteria: ['Organisations based in Cumbria'],
        apply_url:            url || null,
        raw_data:             { title, href } as Record<string, unknown>,
      })
    }

    if (grants.length > 0) return await upsertGrants(SOURCE, grants)

    return await upsertGrants(SOURCE, [{
      external_id:          `${SOURCE}_open_grants`,
      source:               SOURCE,
      title:                'Cumbria Community Foundation — Open Grants',
      funder:               'Cumbria Community Foundation',
      funder_type:          'community_foundation',
      description:          'Cumbria Community Foundation distributes grants to voluntary and community organisations across Cumbria, including rural and coastal communities.',
      amount_min:           500,
      amount_max:           20000,
      deadline:             null,
      is_rolling:           true,
      is_local:             true,
      sectors:              ['community', 'social welfare', 'rural', 'arts', 'environment'],
      eligibility_criteria: ['Voluntary or community group in Cumbria / Cumberland / Westmorland'],
      apply_url:            `${BASE}/apply-for-a-grant/`,
      raw_data:             { note: 'Hardcoded fallback' } as Record<string, unknown>,
    }])
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 60 — Derbyshire Community Foundation ───────────────────────────────
// derbyshirecf.org.uk — serves Derbyshire and Derby.
async function crawlDerbyshireCF(): Promise<CrawlResult> {
  const SOURCE = 'derbyshire_cf'
  const BASE   = 'https://www.derbyshirecf.org.uk'
  try {
    const html  = await fetchHtml(`${BASE}/grants/`)
    const root  = parseHTML(html)
    const grants: ScrapedGrant[] = []

    for (const card of root.querySelectorAll('article, .grant, .fund, .grant-item, .wp-block-group')) {
      const titleEl = card.querySelector('h2 a, h3 a, h2, h3')
      const title   = titleEl?.text?.trim()
      if (!title || title.length < 5) continue

      const href = card.querySelector('a')?.getAttribute('href') ?? ''
      const url  = href.startsWith('http') ? href : `${BASE}${href}`
      const slug = slugify(href || title)
      const desc = card.querySelector('p')?.text?.trim() ?? ''
      const { min, max } = parseAmountRange(desc + ' ' + title)

      grants.push({
        external_id:          `derbyshire_cf_${slug}`,
        source:               SOURCE,
        title,
        funder:               'Derbyshire Community Foundation',
        funder_type:          'community_foundation',
        description:          desc || 'Grant from Derbyshire Community Foundation.',
        amount_min:           min,
        amount_max:           max,
        deadline:             null,
        is_rolling:           true,
        is_local:             true,
        sectors:              ['community', 'social welfare'],
        eligibility_criteria: ['Groups and charities in Derbyshire or Derby'],
        apply_url:            url || null,
        raw_data:             { title, href } as Record<string, unknown>,
      })
    }

    if (grants.length > 0) return await upsertGrants(SOURCE, grants)

    return await upsertGrants(SOURCE, [{
      external_id:          `${SOURCE}_open_grants`,
      source:               SOURCE,
      title:                'Derbyshire Community Foundation — Open Grants',
      funder:               'Derbyshire Community Foundation',
      funder_type:          'community_foundation',
      description:          'Derbyshire Community Foundation supports voluntary and community organisations in Derbyshire and Derby with a range of grant programmes.',
      amount_min:           300,
      amount_max:           15000,
      deadline:             null,
      is_rolling:           true,
      is_local:             true,
      sectors:              ['community', 'social welfare', 'health', 'arts'],
      eligibility_criteria: ['Voluntary or community group in Derbyshire or Derby City'],
      apply_url:            `${BASE}/apply-for-a-grant/`,
      raw_data:             { note: 'Hardcoded fallback' } as Record<string, unknown>,
    }])
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 61 — Staffordshire Community Foundation ────────────────────────────
// staffscf.org.uk — serves Staffordshire and Stoke-on-Trent.
async function crawlStaffsCF(): Promise<CrawlResult> {
  const SOURCE = 'staffs_cf'
  const BASE   = 'https://www.staffscf.org.uk'
  try {
    const html  = await fetchHtml(`${BASE}/grants/`)
    const root  = parseHTML(html)
    const grants: ScrapedGrant[] = []

    for (const card of root.querySelectorAll('article, .grant, .fund, .grant-item')) {
      const titleEl = card.querySelector('h2 a, h3 a, h2, h3')
      const title   = titleEl?.text?.trim()
      if (!title || title.length < 5) continue

      const href = card.querySelector('a')?.getAttribute('href') ?? ''
      const url  = href.startsWith('http') ? href : `${BASE}${href}`
      const slug = slugify(href || title)
      const desc = card.querySelector('p')?.text?.trim() ?? ''
      const { min, max } = parseAmountRange(desc + ' ' + title)

      grants.push({
        external_id:          `staffs_cf_${slug}`,
        source:               SOURCE,
        title,
        funder:               'Staffordshire Community Foundation',
        funder_type:          'community_foundation',
        description:          desc || 'Grant from Staffordshire Community Foundation.',
        amount_min:           min,
        amount_max:           max,
        deadline:             null,
        is_rolling:           true,
        is_local:             true,
        sectors:              ['community', 'social welfare'],
        eligibility_criteria: ['Groups and charities in Staffordshire or Stoke-on-Trent'],
        apply_url:            url || null,
        raw_data:             { title, href } as Record<string, unknown>,
      })
    }

    if (grants.length > 0) return await upsertGrants(SOURCE, grants)

    return await upsertGrants(SOURCE, [{
      external_id:          `${SOURCE}_open_grants`,
      source:               SOURCE,
      title:                'Staffordshire Community Foundation — Open Grants',
      funder:               'Staffordshire Community Foundation',
      funder_type:          'community_foundation',
      description:          'Staffordshire Community Foundation connects donors with local causes, distributing grants to charities and voluntary organisations across Staffordshire and Stoke-on-Trent.',
      amount_min:           500,
      amount_max:           15000,
      deadline:             null,
      is_rolling:           true,
      is_local:             true,
      sectors:              ['community', 'social welfare', 'health', 'arts'],
      eligibility_criteria: ['Voluntary or community group in Staffordshire or Stoke-on-Trent'],
      apply_url:            `${BASE}/apply/`,
      raw_data:             { note: 'Hardcoded fallback' } as Record<string, unknown>,
    }])
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 62 — Berkshire Community Foundation ────────────────────────────────
// berkshirecf.org.uk — serves Berkshire and surrounding areas.
async function crawlBerkshireCF(): Promise<CrawlResult> {
  const SOURCE  = 'berkshire_cf'
  const BASE    = 'https://www.berkshirecf.org.uk'
  const SITEMAP = `${BASE}/custom_grant-sitemap.xml`
  try {
    const xml    = await fetchHtml(SITEMAP)
    const grants: ScrapedGrant[] = []
    const locRe  = /<loc>([^<]+)<\/loc>/g
    let match: RegExpExecArray | null

    while ((match = locRe.exec(xml)) !== null) {
      const url = match[1].trim()
      if (!url.includes('/grant') || url === `${BASE}/grants/`) continue
      const slug  = url.split('/').filter(Boolean).pop() ?? ''
      const title = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
      grants.push({
        external_id:          `berkshire_cf_${slug}`,
        source:               SOURCE,
        title:                `Berkshire CF — ${title}`,
        funder:               'Berkshire Community Foundation',
        funder_type:          'community_foundation',
        description:          'Grant programme from Berkshire Community Foundation.',
        amount_min:           null,
        amount_max:           null,
        deadline:             null,
        is_rolling:           true,
        is_local:             true,
        sectors:              ['community', 'social welfare'],
        eligibility_criteria: ['Charities and groups in Berkshire'],
        apply_url:            url,
        raw_data:             { url } as Record<string, unknown>,
      })
    }

    if (grants.length > 0) return await upsertGrants(SOURCE, grants)

    return await upsertGrants(SOURCE, [{
      external_id:          `${SOURCE}_open_grants`,
      source:               SOURCE,
      title:                'Berkshire Community Foundation — Open Grants',
      funder:               'Berkshire Community Foundation',
      funder_type:          'community_foundation',
      description:          'Berkshire Community Foundation awards grants to voluntary and community organisations across Berkshire, including Reading, Slough, Windsor and surrounding areas.',
      amount_min:           500,
      amount_max:           20000,
      deadline:             null,
      is_rolling:           true,
      is_local:             true,
      sectors:              ['community', 'social welfare', 'health', 'arts'],
      eligibility_criteria: ['Registered charity or VCSE in Berkshire'],
      apply_url:            `${BASE}/apply-for-funding/`,
      raw_data:             { note: 'Hardcoded fallback' } as Record<string, unknown>,
    }])
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 63 — Lloyds Bank Foundation ────────────────────────────────────────
// lloydsbankfoundation.org.uk — £30m/year to small and medium charities in England & Wales.
// Focus: transforming lives of disadvantaged people. No structured listing — hardcoded.
async function crawlLloydsBankFoundation(): Promise<CrawlResult> {
  const SOURCE = 'lloyds_bank_foundation'
  try {
    const grants: ScrapedGrant[] = [
      {
        external_id:          `${SOURCE}_enable`,
        source:               SOURCE,
        title:                'Lloyds Bank Foundation — Enable Programme',
        funder:               'Lloyds Bank Foundation',
        funder_type:          'corporate_foundation',
        description:          'Funding for small and medium-sized charities (income £25k–£500k) in England and Wales working with people facing complex social issues. Multi-year grants (typically 2–3 years) of up to £75,000 per year, plus development support.',
        amount_min:           25000,
        amount_max:           75000,
        deadline:             null,
        is_rolling:           false,
        is_local:             false,
        sectors:              ['social welfare', 'disadvantaged communities', 'mental health', 'homelessness', 'criminal justice'],
        eligibility_criteria: [
          'Registered charity in England or Wales',
          'Annual income between £25,000 and £500,000',
          'Working with people facing multiple complex disadvantages',
          'Minimum 2 years of published accounts',
          'Must not be primarily a grant-making body',
        ],
        apply_url:            'https://www.lloydsbankfoundation.org.uk/our-programmes/',
        raw_data:             { programme: 'enable' } as Record<string, unknown>,
      },
      {
        external_id:          `${SOURCE}_invest`,
        source:               SOURCE,
        title:                'Lloyds Bank Foundation — Invest Programme',
        funder:               'Lloyds Bank Foundation',
        funder_type:          'corporate_foundation',
        description:          'For charities with income of £500,000–£1 million in England and Wales, working with people facing complex disadvantages. Three-year grants of up to £100,000 per year plus intensive development support.',
        amount_min:           50000,
        amount_max:           100000,
        deadline:             null,
        is_rolling:           false,
        is_local:             false,
        sectors:              ['social welfare', 'disadvantaged communities', 'mental health', 'homelessness', 'employment'],
        eligibility_criteria: [
          'Registered charity in England or Wales',
          'Annual income between £500,000 and £1 million',
          'Working with people facing multiple complex disadvantages',
          'Minimum 3 years of published accounts',
        ],
        apply_url:            'https://www.lloydsbankfoundation.org.uk/our-programmes/',
        raw_data:             { programme: 'invest' } as Record<string, unknown>,
      },
    ]
    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 64 — Power to Change ───────────────────────────────────────────────
// powertochange.org.uk — supports community businesses across England.
// Site is JS-rendered; hardcoded rolling entry with key programmes.
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
        description:          'Grants and support for community businesses in England — organisations owned and run by local people to benefit their community. Offers grants for growth, resilience and new ventures. Multiple funding strands active throughout the year.',
        amount_min:           5000,
        amount_max:           300000,
        deadline:             null,
        is_rolling:           true,
        is_local:             false,
        sectors:              ['community business', 'social enterprise', 'community', 'economic development'],
        eligibility_criteria: [
          'Community business based in England',
          'Owned or controlled by local community',
          'Serves the local community and reinvests surpluses locally',
          'Must demonstrate community accountability',
        ],
        apply_url:            'https://www.powertochange.org.uk/get-support/programmes/',
        raw_data:             { note: 'Hardcoded rolling entry' } as Record<string, unknown>,
      },
    ]
    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 65 — The King's Trust ──────────────────────────────────────────────
// kings-trust.org.uk — (formerly Prince's Trust) supports young people 11–30 in the UK.
// Hardcoded rolling entry covering core grant programmes.
async function crawlKingsTrust(): Promise<CrawlResult> {
  const SOURCE = 'kings_trust'
  try {
    const grants: ScrapedGrant[] = [
      {
        external_id:          `${SOURCE}_enterprise`,
        source:               SOURCE,
        title:                "The King's Trust — Enterprise Programme",
        funder:               "The King's Trust",
        funder_type:          'trust_foundation',
        description:          "Grants and low-interest loans of up to £5,000 for young people aged 18–30 who want to start or grow a business. Includes mentoring and ongoing support. Available throughout the UK.",
        amount_min:           500,
        amount_max:           5000,
        deadline:             null,
        is_rolling:           true,
        is_local:             false,
        sectors:              ['enterprise', 'employment', 'youth'],
        eligibility_criteria: [
          'Aged 18–30',
          'UK resident',
          'Unemployed or working fewer than 16 hours per week',
          'Unable to get conventional bank funding',
        ],
        apply_url:            'https://www.kings-trust.org.uk/how-we-can-help/enterprise-programme',
        raw_data:             { programme: 'enterprise' } as Record<string, unknown>,
      },
      {
        external_id:          `${SOURCE}_achieve`,
        source:               SOURCE,
        title:                "The King's Trust — Achieve Programme",
        funder:               "The King's Trust",
        funder_type:          'trust_foundation',
        description:          "Grants and development grants for young people aged 11–30 to gain skills, qualifications and confidence. Covers training, education and personal development costs including travel, equipment and course fees.",
        amount_min:           50,
        amount_max:           500,
        deadline:             null,
        is_rolling:           true,
        is_local:             false,
        sectors:              ['youth', 'education', 'employment', 'skills'],
        eligibility_criteria: [
          'Aged 11–30',
          'UK resident',
          'Facing disadvantage or barriers to opportunity',
        ],
        apply_url:            'https://www.kings-trust.org.uk/how-we-can-help/grants',
        raw_data:             { programme: 'achieve' } as Record<string, unknown>,
      },
    ]
    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 66 — Barrow Cadbury Trust ──────────────────────────────────────────
// barrowcadbury.org.uk — independent foundation focusing on justice and inclusion.
// Hardcoded: site is primarily narrative, listing not structured.
async function crawlBarrowCadbury(): Promise<CrawlResult> {
  const SOURCE = 'barrow_cadbury'
  try {
    const grants: ScrapedGrant[] = [
      {
        external_id:          `${SOURCE}_justice`,
        source:               SOURCE,
        title:                'Barrow Cadbury Trust — Criminal Justice Programme',
        funder:               'Barrow Cadbury Trust',
        funder_type:          'trust_foundation',
        description:          'Funds organisations challenging inequality in the criminal justice system, reducing deaths in custody, improving treatment of remand prisoners, and supporting rehabilitation. Focus on systemic change and influencing policy.',
        amount_min:           20000,
        amount_max:           100000,
        deadline:             null,
        is_rolling:           true,
        is_local:             false,
        sectors:              ['criminal justice', 'social welfare', 'policy & advocacy', 'human rights'],
        eligibility_criteria: [
          'UK-based charity or voluntary organisation',
          'Work must be in England and Wales',
          'Focus on systemic change or policy influence',
          'Must have at least one year of accounts',
        ],
        apply_url:            'https://barrowcadbury.org.uk/what-we-fund/criminal-justice/',
        raw_data:             { programme: 'criminal_justice' } as Record<string, unknown>,
      },
      {
        external_id:          `${SOURCE}_migration`,
        source:               SOURCE,
        title:                'Barrow Cadbury Trust — Migration & Borders Programme',
        funder:               'Barrow Cadbury Trust',
        funder_type:          'trust_foundation',
        description:          'Supports organisations working on fair treatment of migrants, asylum seekers and refugees in the UK. Funds campaigning, advocacy and direct support for people affected by hostile environment policies.',
        amount_min:           15000,
        amount_max:           80000,
        deadline:             null,
        is_rolling:           true,
        is_local:             false,
        sectors:              ['migration', 'refugees', 'human rights', 'policy & advocacy'],
        eligibility_criteria: [
          'UK-registered charity or voluntary organisation',
          'Work related to migration, borders or asylum in the UK',
          'Focus on policy change or community empowerment',
        ],
        apply_url:            'https://barrowcadbury.org.uk/what-we-fund/migration-borders/',
        raw_data:             { programme: 'migration' } as Record<string, unknown>,
      },
    ]
    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 67 — Joseph Rowntree Foundation ────────────────────────────────────
// jrf.org.uk — one of the UK's largest independent social change organisations.
// Primarily a research funder but also runs grant programmes to tackle poverty.
async function crawlJRF(): Promise<CrawlResult> {
  const SOURCE = 'jrf'
  try {
    const grants: ScrapedGrant[] = [
      {
        external_id:          `${SOURCE}_uk_poverty`,
        source:               SOURCE,
        title:                'Joseph Rowntree Foundation — Poverty Solutions Fund',
        funder:               'Joseph Rowntree Foundation',
        funder_type:          'trust_foundation',
        description:          'JRF funds research, projects and systemic change initiatives aimed at solving poverty in the UK. Programmes support organisations developing, testing and scaling new approaches to tackling poverty. Check website for current open calls.',
        amount_min:           50000,
        amount_max:           500000,
        deadline:             null,
        is_rolling:           false,
        is_local:             false,
        sectors:              ['poverty reduction', 'social welfare', 'housing', 'employment', 'policy & advocacy'],
        eligibility_criteria: [
          'UK-based organisation (charity, social enterprise, or research body)',
          'Work must address poverty in the UK',
          'Must demonstrate evidence-based approach',
          'Ability to share learning publicly',
        ],
        apply_url:            'https://www.jrf.org.uk/work-with-us',
        raw_data:             { note: 'Hardcoded entry — check website for open calls' } as Record<string, unknown>,
      },
    ]
    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 68 — Access — The Foundation for Social Investment ─────────────────
// access-gi.org.uk — blended finance and grants for social enterprises and charities.
async function crawlAccessFoundation(): Promise<CrawlResult> {
  const SOURCE = 'access_foundation'
  const BASE   = 'https://www.access-gi.org.uk'
  try {
    const html  = await fetchHtml(`${BASE}/programmes/`)
    const root  = parseHTML(html)
    const grants: ScrapedGrant[] = []

    for (const card of root.querySelectorAll('article, .programme, .card, .grant-item')) {
      const titleEl = card.querySelector('h2 a, h3 a, h2, h3')
      const title   = titleEl?.text?.trim()
      if (!title || title.length < 5) continue

      const href = card.querySelector('a')?.getAttribute('href') ?? ''
      const url  = href.startsWith('http') ? href : `${BASE}${href}`
      const slug = slugify(href || title)
      const desc = card.querySelector('p')?.text?.trim() ?? ''

      grants.push({
        external_id:          `access_foundation_${slug}`,
        source:               SOURCE,
        title,
        funder:               'Access — The Foundation for Social Investment',
        funder_type:          'trust_foundation',
        description:          desc || 'Programme from Access — The Foundation for Social Investment.',
        amount_min:           null,
        amount_max:           null,
        deadline:             null,
        is_rolling:           true,
        is_local:             false,
        sectors:              ['social enterprise', 'social investment', 'community business'],
        eligibility_criteria: ['Social enterprises and charities with potential for investment readiness'],
        apply_url:            url || null,
        raw_data:             { title, href } as Record<string, unknown>,
      })
    }

    if (grants.length > 0) return await upsertGrants(SOURCE, grants)

    return await upsertGrants(SOURCE, [
      {
        external_id:          `${SOURCE}_growth`,
        source:               SOURCE,
        title:                'Access Foundation — Growth Fund',
        funder:               'Access — The Foundation for Social Investment',
        funder_type:          'trust_foundation',
        description:          'Blended finance combining grants and social investment loans to help charities and social enterprises grow. Particularly targets organisations that are investment ready but need a grant element to make a deal viable.',
        amount_min:           50000,
        amount_max:           500000,
        deadline:             null,
        is_rolling:           true,
        is_local:             false,
        sectors:              ['social enterprise', 'social investment', 'community', 'health', 'employment'],
        eligibility_criteria: [
          'Charity or social enterprise based in England',
          'Minimum 3 years of trading',
          'Ability to service investment (loan element)',
          'Must demonstrate social impact',
        ],
        apply_url:            `${BASE}/programmes/`,
        raw_data:             { note: 'Hardcoded fallback' } as Record<string, unknown>,
      },
    ])
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 69 — Comic Relief ──────────────────────────────────────────────────
// comicrelief.com — funds organisations tackling poverty and social injustice in the UK and overseas.
// Opens periodic themed rounds. Hardcoded core programmes.
async function crawlComicRelief(): Promise<CrawlResult> {
  const SOURCE = 'comic_relief'
  try {
    const grants: ScrapedGrant[] = [
      {
        external_id:          `${SOURCE}_active_communities`,
        source:               SOURCE,
        title:                'Comic Relief — Active Communities Fund',
        funder:               'Comic Relief',
        funder_type:          'trust_foundation',
        description:          'Comic Relief funds grassroots organisations in the UK tackling poverty and social injustice. Active Communities Fund supports community-led organisations improving lives in the UK. Check website for current open rounds.',
        amount_min:           10000,
        amount_max:           100000,
        deadline:             null,
        is_rolling:           false,
        is_local:             false,
        sectors:              ['poverty reduction', 'community', 'social welfare', 'youth', 'mental health'],
        eligibility_criteria: [
          'UK registered charity or social enterprise',
          'Community-led organisation based in the UK',
          'Working with people facing poverty or disadvantage',
          'Annual income under £1 million for small grants strand',
        ],
        apply_url:            'https://www.comicrelief.com/your-impact/our-grants',
        raw_data:             { programme: 'active_communities' } as Record<string, unknown>,
      },
      {
        external_id:          `${SOURCE}_mental_health`,
        source:               SOURCE,
        title:                'Comic Relief — Mental Health Fund (UK)',
        funder:               'Comic Relief',
        funder_type:          'trust_foundation',
        description:          "Comic Relief's mental health funding supports organisations delivering evidence-based mental health support and systemic change. Periodic themed rounds targeting specific populations or issues.",
        amount_min:           10000,
        amount_max:           200000,
        deadline:             null,
        is_rolling:           false,
        is_local:             false,
        sectors:              ['mental health', 'social welfare', 'community', 'youth'],
        eligibility_criteria: [
          'Registered UK charity or voluntary organisation',
          'Delivers or enables mental health support',
          'Must demonstrate evidence-based approach',
        ],
        apply_url:            'https://www.comicrelief.com/your-impact/our-grants',
        raw_data:             { programme: 'mental_health' } as Record<string, unknown>,
      },
    ]
    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 70 — Community Ownership Fund ──────────────────────────────────────
// Government fund helping communities take over assets at risk of closure.
// Administered via MHCLG. Hardcoded as fund opens in rounds.
async function crawlCommunityOwnershipFund(): Promise<CrawlResult> {
  const SOURCE = 'community_ownership_fund'
  try {
    const grants: ScrapedGrant[] = [{
      external_id:          `${SOURCE}_round`,
      source:               SOURCE,
      title:                'Community Ownership Fund',
      funder:               'Ministry of Housing, Communities & Local Government',
      funder_type:          'government',
      description:          'Government fund helping communities across the UK take ownership of assets and amenities at risk of being lost — pubs, sports clubs, theatres, post offices, parks and other valued spaces. Grants of up to £250,000 (up to £1m for sports clubs) available. Check for open funding rounds.',
      amount_min:           20000,
      amount_max:           250000,
      deadline:             null,
      is_rolling:           false,
      is_local:             false,
      sectors:              ['community', 'social enterprise', 'heritage', 'sport', 'arts'],
      eligibility_criteria: [
        'Community-owned organisation (e.g. co-operative, community benefit society, development trust)',
        'UK-wide (England, Scotland, Wales, Northern Ireland)',
        'Asset must be at risk of closure or loss from community use',
        'Must provide matched funding (at least equal to the grant amount)',
        'Community must demonstrate broad support',
      ],
      apply_url:            'https://www.gov.uk/guidance/community-ownership-fund',
      raw_data:             { note: 'Hardcoded rolling entry — check for open rounds' } as Record<string, unknown>,
    }]
    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 71 — Creative Scotland ─────────────────────────────────────────────
// creativescotland.com — Scotland's main arts and creative industries funder.
async function crawlCreativeScotland(): Promise<CrawlResult> {
  const SOURCE = 'creative_scotland'
  const BASE   = 'https://www.creativescotland.com'
  try {
    const html  = await fetchHtml(`${BASE}/funding/`)
    const root  = parseHTML(html)
    const grants: ScrapedGrant[] = []

    for (const card of root.querySelectorAll('article, .fund, .funding-option, .card')) {
      const titleEl = card.querySelector('h2 a, h3 a, h2, h3')
      const title   = titleEl?.text?.trim()
      if (!title || title.length < 5) continue

      const href = card.querySelector('a')?.getAttribute('href') ?? ''
      const url  = href.startsWith('http') ? href : `${BASE}${href}`
      const slug = slugify(href || title)
      const desc = card.querySelector('p, .excerpt, .summary')?.text?.trim() ?? ''
      const { min, max } = parseAmountRange(desc + ' ' + title)

      grants.push({
        external_id:          `creative_scotland_${slug}`,
        source:               SOURCE,
        title,
        funder:               'Creative Scotland',
        funder_type:          'government',
        description:          desc || 'Funding opportunity from Creative Scotland.',
        amount_min:           min,
        amount_max:           max,
        deadline:             null,
        is_rolling:           true,
        is_local:             true,
        sectors:              ['arts', 'culture', 'creative industries', 'heritage'],
        eligibility_criteria: ['Individuals, organisations and businesses based in Scotland'],
        apply_url:            url || null,
        raw_data:             { title, href } as Record<string, unknown>,
      })
    }

    if (grants.length > 0) return await upsertGrants(SOURCE, grants)

    return await upsertGrants(SOURCE, [
      {
        external_id:          `${SOURCE}_open_fund`,
        source:               SOURCE,
        title:                'Creative Scotland — Open Fund for Individuals',
        funder:               'Creative Scotland',
        funder_type:          'government',
        description:          'Supports creative practitioners and artists based in Scotland to develop their creative practice, reach new audiences and develop their career. Grants of £1,000–£50,000.',
        amount_min:           1000,
        amount_max:           50000,
        deadline:             null,
        is_rolling:           true,
        is_local:             true,
        sectors:              ['arts', 'culture', 'creative industries'],
        eligibility_criteria: [
          'Individual artist or creative practitioner based in Scotland',
          'Scottish citizen or resident with right to work/remain',
          'Project must take place in Scotland or benefit Scottish arts',
        ],
        apply_url:            `${BASE}/funding/apply-for-funding/`,
        raw_data:             { programme: 'open_fund_individuals' } as Record<string, unknown>,
      },
      {
        external_id:          `${SOURCE}_open_fund_orgs`,
        source:               SOURCE,
        title:                'Creative Scotland — Open Fund for Organisations',
        funder:               'Creative Scotland',
        funder_type:          'government',
        description:          'Supports creative organisations, companies and collectives in Scotland. Funds projects, activities, productions and initiatives that develop creativity and reach audiences. Grants of £1,000–£150,000.',
        amount_min:           1000,
        amount_max:           150000,
        deadline:             null,
        is_rolling:           true,
        is_local:             true,
        sectors:              ['arts', 'culture', 'creative industries', 'heritage'],
        eligibility_criteria: [
          'Organisation based in Scotland',
          'Creative or arts focus',
          'Project must take place in Scotland or benefit Scottish arts scene',
        ],
        apply_url:            `${BASE}/funding/apply-for-funding/`,
        raw_data:             { programme: 'open_fund_organisations' } as Record<string, unknown>,
      },
    ])
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// BATCH 5 SOURCES (06:20) — more CFs + regional arts/sport bodies
// ══════════════════════════════════════════════════════════════════════════════

// ── Source 72 — South Yorkshire Community Foundation ──────────────────────────
async function crawlSouthYorkshireCF(): Promise<CrawlResult> {
  const SOURCE = 'south_yorkshire_cf'
  const BASE   = 'https://www.sycf.org.uk'
  try {
    const html  = await fetchHtml(`${BASE}/grants/`)
    const root  = parseHTML(html)
    const grants: ScrapedGrant[] = []
    for (const card of root.querySelectorAll('article, .grant, .fund, .grant-item')) {
      const titleEl = card.querySelector('h2 a, h3 a, h2, h3')
      const title   = titleEl?.text?.trim()
      if (!title || title.length < 5) continue
      const href = card.querySelector('a')?.getAttribute('href') ?? ''
      const url  = href.startsWith('http') ? href : `${BASE}${href}`
      const desc = card.querySelector('p')?.text?.trim() ?? ''
      const { min, max } = parseAmountRange(desc + ' ' + title)
      grants.push({ external_id: `south_yorkshire_cf_${slugify(href || title)}`, source: SOURCE, title, funder: 'South Yorkshire Community Foundation', funder_type: 'community_foundation', description: desc || 'Grant from South Yorkshire Community Foundation.', amount_min: min, amount_max: max, deadline: null, is_rolling: true, is_local: true, sectors: ['community', 'social welfare'], eligibility_criteria: ['Organisations in South Yorkshire'], apply_url: url || null, raw_data: { title, href } as Record<string, unknown> })
    }
    if (grants.length > 0) return await upsertGrants(SOURCE, grants)
    return await upsertGrants(SOURCE, [{ external_id: `${SOURCE}_open`, source: SOURCE, title: 'South Yorkshire Community Foundation — Open Grants', funder: 'South Yorkshire Community Foundation', funder_type: 'community_foundation', description: 'South Yorkshire Community Foundation supports voluntary and community organisations across Sheffield, Rotherham, Barnsley and Doncaster with a range of grant programmes.', amount_min: 500, amount_max: 20000, deadline: null, is_rolling: true, is_local: true, sectors: ['community', 'social welfare', 'arts', 'health'], eligibility_criteria: ['Voluntary or community group in South Yorkshire'], apply_url: `${BASE}/grants/`, raw_data: { note: 'Hardcoded fallback' } as Record<string, unknown> }])
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ── Source 73 — Cornwall Community Foundation ─────────────────────────────────
async function crawlCornwallCF(): Promise<CrawlResult> {
  const SOURCE = 'cornwall_cf'
  const BASE   = 'https://www.cornwallcommunityfoundation.com'
  try {
    const html  = await fetchHtml(`${BASE}/grants/`)
    const root  = parseHTML(html)
    const grants: ScrapedGrant[] = []
    for (const card of root.querySelectorAll('article, .grant, .fund')) {
      const titleEl = card.querySelector('h2 a, h3 a, h2, h3')
      const title   = titleEl?.text?.trim()
      if (!title || title.length < 5) continue
      const href = card.querySelector('a')?.getAttribute('href') ?? ''
      const url  = href.startsWith('http') ? href : `${BASE}${href}`
      const desc = card.querySelector('p')?.text?.trim() ?? ''
      const { min, max } = parseAmountRange(desc + ' ' + title)
      grants.push({ external_id: `cornwall_cf_${slugify(href || title)}`, source: SOURCE, title, funder: 'Cornwall Community Foundation', funder_type: 'community_foundation', description: desc || 'Grant from Cornwall Community Foundation.', amount_min: min, amount_max: max, deadline: null, is_rolling: true, is_local: true, sectors: ['community', 'social welfare', 'rural'], eligibility_criteria: ['Groups and charities in Cornwall'], apply_url: url || null, raw_data: { title, href } as Record<string, unknown> })
    }
    if (grants.length > 0) return await upsertGrants(SOURCE, grants)
    return await upsertGrants(SOURCE, [{ external_id: `${SOURCE}_open`, source: SOURCE, title: 'Cornwall Community Foundation — Open Grants', funder: 'Cornwall Community Foundation', funder_type: 'community_foundation', description: 'Cornwall Community Foundation distributes grants to voluntary and community organisations across Cornwall and the Isles of Scilly, including rural and coastal communities.', amount_min: 300, amount_max: 15000, deadline: null, is_rolling: true, is_local: true, sectors: ['community', 'social welfare', 'rural', 'environment', 'arts'], eligibility_criteria: ['Voluntary or community group in Cornwall or Isles of Scilly'], apply_url: `${BASE}/apply/`, raw_data: { note: 'Hardcoded fallback' } as Record<string, unknown> }])
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ── Source 74 — East End Community Foundation ─────────────────────────────────
// Serves East London (Hackney, Newham, Tower Hamlets, Waltham Forest, etc.)
async function crawlEastEndCF(): Promise<CrawlResult> {
  const SOURCE = 'east_end_cf'
  const BASE   = 'https://www.eastendcf.org'
  try {
    const html  = await fetchHtml(`${BASE}/grants/`)
    const root  = parseHTML(html)
    const grants: ScrapedGrant[] = []
    for (const card of root.querySelectorAll('article, .grant, .fund, .grant-item')) {
      const titleEl = card.querySelector('h2 a, h3 a, h2, h3')
      const title   = titleEl?.text?.trim()
      if (!title || title.length < 5) continue
      const href = card.querySelector('a')?.getAttribute('href') ?? ''
      const url  = href.startsWith('http') ? href : `${BASE}${href}`
      const desc = card.querySelector('p')?.text?.trim() ?? ''
      const { min, max } = parseAmountRange(desc + ' ' + title)
      grants.push({ external_id: `east_end_cf_${slugify(href || title)}`, source: SOURCE, title, funder: 'East End Community Foundation', funder_type: 'community_foundation', description: desc || 'Grant from East End Community Foundation.', amount_min: min, amount_max: max, deadline: null, is_rolling: true, is_local: true, sectors: ['community', 'social welfare', 'diversity'], eligibility_criteria: ['Organisations in East London'], apply_url: url || null, raw_data: { title, href } as Record<string, unknown> })
    }
    if (grants.length > 0) return await upsertGrants(SOURCE, grants)
    return await upsertGrants(SOURCE, [{ external_id: `${SOURCE}_open`, source: SOURCE, title: 'East End Community Foundation — Open Grants', funder: 'East End Community Foundation', funder_type: 'community_foundation', description: 'East End Community Foundation funds charities and voluntary organisations in Hackney, Newham, Tower Hamlets, Waltham Forest and surrounding East London boroughs.', amount_min: 500, amount_max: 20000, deadline: null, is_rolling: true, is_local: true, sectors: ['community', 'social welfare', 'diversity', 'youth', 'health'], eligibility_criteria: ['Registered charity or voluntary group in East London'], apply_url: `${BASE}/apply-for-a-grant/`, raw_data: { note: 'Hardcoded fallback' } as Record<string, unknown> }])
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ── Source 75 — Northamptonshire Community Foundation ────────────────────────
async function crawlNorthantsCF(): Promise<CrawlResult> {
  const SOURCE = 'northants_cf'
  const BASE   = 'https://www.ncf.uk.com'
  try {
    const html  = await fetchHtml(`${BASE}/funding/`)
    const root  = parseHTML(html)
    const grants: ScrapedGrant[] = []
    for (const card of root.querySelectorAll('article, .grant, .fund, .funding-item')) {
      const titleEl = card.querySelector('h2 a, h3 a, h2, h3')
      const title   = titleEl?.text?.trim()
      if (!title || title.length < 5) continue
      const href = card.querySelector('a')?.getAttribute('href') ?? ''
      const url  = href.startsWith('http') ? href : `${BASE}${href}`
      const desc = card.querySelector('p')?.text?.trim() ?? ''
      const { min, max } = parseAmountRange(desc + ' ' + title)
      grants.push({ external_id: `northants_cf_${slugify(href || title)}`, source: SOURCE, title, funder: 'Northamptonshire Community Foundation', funder_type: 'community_foundation', description: desc || 'Grant from Northamptonshire Community Foundation.', amount_min: min, amount_max: max, deadline: null, is_rolling: true, is_local: true, sectors: ['community', 'social welfare'], eligibility_criteria: ['Groups in Northamptonshire'], apply_url: url || null, raw_data: { title, href } as Record<string, unknown> })
    }
    if (grants.length > 0) return await upsertGrants(SOURCE, grants)
    return await upsertGrants(SOURCE, [{ external_id: `${SOURCE}_open`, source: SOURCE, title: 'Northamptonshire Community Foundation — Open Grants', funder: 'Northamptonshire Community Foundation', funder_type: 'community_foundation', description: 'Northamptonshire Community Foundation manages funds for local and national donors, distributing grants to voluntary and community organisations across Northamptonshire.', amount_min: 300, amount_max: 15000, deadline: null, is_rolling: true, is_local: true, sectors: ['community', 'social welfare', 'health', 'arts'], eligibility_criteria: ['Voluntary or community group in Northamptonshire'], apply_url: `${BASE}/apply/`, raw_data: { note: 'Hardcoded fallback' } as Record<string, unknown> }])
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ── Source 76 — Birmingham & Black Country Community Foundation ───────────────
async function crawlBirminghamCF(): Promise<CrawlResult> {
  const SOURCE = 'birmingham_cf'
  const BASE   = 'https://www.bbbcf.org.uk'
  try {
    const html  = await fetchHtml(`${BASE}/grants/`)
    const root  = parseHTML(html)
    const grants: ScrapedGrant[] = []
    for (const card of root.querySelectorAll('article, .grant, .fund, .grant-item')) {
      const titleEl = card.querySelector('h2 a, h3 a, h2, h3')
      const title   = titleEl?.text?.trim()
      if (!title || title.length < 5) continue
      const href = card.querySelector('a')?.getAttribute('href') ?? ''
      const url  = href.startsWith('http') ? href : `${BASE}${href}`
      const desc = card.querySelector('p')?.text?.trim() ?? ''
      const { min, max } = parseAmountRange(desc + ' ' + title)
      grants.push({ external_id: `birmingham_cf_${slugify(href || title)}`, source: SOURCE, title, funder: 'Birmingham & Black Country Community Foundation', funder_type: 'community_foundation', description: desc || 'Grant from Birmingham & Black Country Community Foundation.', amount_min: min, amount_max: max, deadline: null, is_rolling: true, is_local: true, sectors: ['community', 'social welfare', 'diversity'], eligibility_criteria: ['Organisations in Birmingham or Black Country'], apply_url: url || null, raw_data: { title, href } as Record<string, unknown> })
    }
    if (grants.length > 0) return await upsertGrants(SOURCE, grants)
    return await upsertGrants(SOURCE, [{ external_id: `${SOURCE}_open`, source: SOURCE, title: 'Birmingham & Black Country Community Foundation — Open Grants', funder: 'Birmingham & Black Country Community Foundation', funder_type: 'community_foundation', description: 'Birmingham & Black Country Community Foundation supports charitable organisations working across Birmingham, Sandwell, Dudley, Wolverhampton and Walsall.', amount_min: 500, amount_max: 25000, deadline: null, is_rolling: true, is_local: true, sectors: ['community', 'social welfare', 'diversity', 'youth', 'health'], eligibility_criteria: ['Registered charity or voluntary group in Birmingham or Black Country'], apply_url: `${BASE}/apply/`, raw_data: { note: 'Hardcoded fallback' } as Record<string, unknown> }])
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ── Source 77 — Dorset Community Foundation ───────────────────────────────────
async function crawlDorsetCF(): Promise<CrawlResult> {
  const SOURCE = 'dorset_cf'
  const BASE   = 'https://www.dorsetcf.org.uk'
  try {
    const html  = await fetchHtml(`${BASE}/grants/`)
    const root  = parseHTML(html)
    const grants: ScrapedGrant[] = []
    for (const card of root.querySelectorAll('article, .grant, .fund')) {
      const titleEl = card.querySelector('h2 a, h3 a, h2, h3')
      const title   = titleEl?.text?.trim()
      if (!title || title.length < 5) continue
      const href = card.querySelector('a')?.getAttribute('href') ?? ''
      const url  = href.startsWith('http') ? href : `${BASE}${href}`
      const desc = card.querySelector('p')?.text?.trim() ?? ''
      const { min, max } = parseAmountRange(desc + ' ' + title)
      grants.push({ external_id: `dorset_cf_${slugify(href || title)}`, source: SOURCE, title, funder: 'Dorset Community Foundation', funder_type: 'community_foundation', description: desc || 'Grant from Dorset Community Foundation.', amount_min: min, amount_max: max, deadline: null, is_rolling: true, is_local: true, sectors: ['community', 'social welfare', 'rural'], eligibility_criteria: ['Organisations in Dorset'], apply_url: url || null, raw_data: { title, href } as Record<string, unknown> })
    }
    if (grants.length > 0) return await upsertGrants(SOURCE, grants)
    return await upsertGrants(SOURCE, [{ external_id: `${SOURCE}_open`, source: SOURCE, title: 'Dorset Community Foundation — Open Grants', funder: 'Dorset Community Foundation', funder_type: 'community_foundation', description: 'Dorset Community Foundation funds voluntary and community organisations across Dorset, including both urban centres and rural communities.', amount_min: 300, amount_max: 10000, deadline: null, is_rolling: true, is_local: true, sectors: ['community', 'social welfare', 'rural', 'arts'], eligibility_criteria: ['Voluntary or community group based in Dorset'], apply_url: `${BASE}/apply-for-a-grant/`, raw_data: { note: 'Hardcoded fallback' } as Record<string, unknown> }])
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ── Source 78 — Sport Wales ────────────────────────────────────────────────────
// sport.wales — national body funding sport and physical activity in Wales.
async function crawlSportWales(): Promise<CrawlResult> {
  const SOURCE = 'sport_wales'
  const BASE   = 'https://www.sport.wales'
  try {
    const html  = await fetchHtml(`${BASE}/funding/`)
    const root  = parseHTML(html)
    const grants: ScrapedGrant[] = []
    for (const card of root.querySelectorAll('article, .fund, .grant, .card')) {
      const titleEl = card.querySelector('h2 a, h3 a, h2, h3')
      const title   = titleEl?.text?.trim()
      if (!title || title.length < 5) continue
      const href = card.querySelector('a')?.getAttribute('href') ?? ''
      const url  = href.startsWith('http') ? href : `${BASE}${href}`
      const desc = card.querySelector('p')?.text?.trim() ?? ''
      const { min, max } = parseAmountRange(desc + ' ' + title)
      grants.push({ external_id: `sport_wales_${slugify(href || title)}`, source: SOURCE, title, funder: 'Sport Wales', funder_type: 'government', description: desc || 'Funding from Sport Wales.', amount_min: min, amount_max: max, deadline: null, is_rolling: true, is_local: true, sectors: ['sport', 'physical activity', 'health'], eligibility_criteria: ['Sports clubs and organisations based in Wales'], apply_url: url || null, raw_data: { title, href } as Record<string, unknown> })
    }
    if (grants.length > 0) return await upsertGrants(SOURCE, grants)
    return await upsertGrants(SOURCE, [
      { external_id: `${SOURCE}_small_grants`, source: SOURCE, title: 'Sport Wales — Small Grants', funder: 'Sport Wales', funder_type: 'government', description: 'Sport Wales funds sports clubs and organisations in Wales to increase participation, develop talent and improve infrastructure. Small grants support grassroots activity.', amount_min: 300, amount_max: 5000, deadline: null, is_rolling: true, is_local: true, sectors: ['sport', 'physical activity', 'health', 'youth'], eligibility_criteria: ['Sports clubs and community organisations in Wales', 'Must increase participation or improve facilities'], apply_url: `${BASE}/funding/`, raw_data: { note: 'Hardcoded fallback' } as Record<string, unknown> },
      { external_id: `${SOURCE}_facilities`, source: SOURCE, title: 'Sport Wales — Facilities Investment Programme', funder: 'Sport Wales', funder_type: 'government', description: 'Capital investment programme supporting the development of community sports facilities across Wales. Grants for new builds, refurbishment and equipment.', amount_min: 10000, amount_max: 150000, deadline: null, is_rolling: false, is_local: true, sectors: ['sport', 'physical activity', 'facilities', 'community'], eligibility_criteria: ['Sports clubs, local authorities, education bodies in Wales', 'Facility must be for community use'], apply_url: `${BASE}/funding/facilities/`, raw_data: { note: 'Hardcoded fallback' } as Record<string, unknown> },
    ])
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ── Source 79 — Arts Council of Wales ─────────────────────────────────────────
// arts.wales — principal arts development agency for Wales.
async function crawlArtsCouncilWales(): Promise<CrawlResult> {
  const SOURCE = 'arts_council_wales'
  const BASE   = 'https://arts.wales'
  try {
    const html  = await fetchHtml(`${BASE}/funding/`)
    const root  = parseHTML(html)
    const grants: ScrapedGrant[] = []
    for (const card of root.querySelectorAll('article, .fund, .grant, .card, .funding-item')) {
      const titleEl = card.querySelector('h2 a, h3 a, h2, h3')
      const title   = titleEl?.text?.trim()
      if (!title || title.length < 5) continue
      const href = card.querySelector('a')?.getAttribute('href') ?? ''
      const url  = href.startsWith('http') ? href : `${BASE}${href}`
      const desc = card.querySelector('p')?.text?.trim() ?? ''
      const { min, max } = parseAmountRange(desc + ' ' + title)
      grants.push({ external_id: `arts_council_wales_${slugify(href || title)}`, source: SOURCE, title, funder: 'Arts Council of Wales', funder_type: 'government', description: desc || 'Funding from Arts Council of Wales.', amount_min: min, amount_max: max, deadline: null, is_rolling: true, is_local: true, sectors: ['arts', 'culture', 'creative industries'], eligibility_criteria: ['Artists and arts organisations based in Wales'], apply_url: url || null, raw_data: { title, href } as Record<string, unknown> })
    }
    if (grants.length > 0) return await upsertGrants(SOURCE, grants)
    return await upsertGrants(SOURCE, [
      { external_id: `${SOURCE}_individuals`, source: SOURCE, title: 'Arts Council of Wales — Grants for Individuals', funder: 'Arts Council of Wales', funder_type: 'government', description: 'Arts Council of Wales funds individual artists, creative practitioners and arts organisations across Wales to develop their practice and reach new audiences. Grants of £300–£30,000.', amount_min: 300, amount_max: 30000, deadline: null, is_rolling: true, is_local: true, sectors: ['arts', 'culture', 'creative industries', 'heritage'], eligibility_criteria: ['Individual artists based in Wales', 'Project must take place in or benefit Wales'], apply_url: `${BASE}/funding/individuals/`, raw_data: {} as Record<string, unknown> },
      { external_id: `${SOURCE}_organisations`, source: SOURCE, title: 'Arts Council of Wales — Grants for Organisations', funder: 'Arts Council of Wales', funder_type: 'government', description: 'Project grants for arts organisations, companies and collectives in Wales. Funds productions, events, residencies and community arts activities. Grants of £1,000–£150,000.', amount_min: 1000, amount_max: 150000, deadline: null, is_rolling: true, is_local: true, sectors: ['arts', 'culture', 'heritage', 'creative industries'], eligibility_criteria: ['Arts organisation based in Wales', 'Must benefit audiences or participants in Wales'], apply_url: `${BASE}/funding/organisations/`, raw_data: {} as Record<string, unknown> },
    ])
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ── Source 80 — Wolfson Foundation ────────────────────────────────────────────
// wolfson.org.uk — independent UK funder of excellence in the arts, humanities, health and science.
async function crawlWolfsonFoundation(): Promise<CrawlResult> {
  const SOURCE = 'wolfson_foundation'
  try {
    return await upsertGrants(SOURCE, [
      { external_id: `${SOURCE}_capital`, source: SOURCE, title: 'Wolfson Foundation — Capital Grants', funder: 'Wolfson Foundation', funder_type: 'trust_foundation', description: 'The Wolfson Foundation funds capital projects in science and medicine, humanities, arts and heritage, and education, health and welfare. Particularly interested in museums, galleries, libraries, universities and schools. Grants typically £20,000–£500,000.', amount_min: 20000, amount_max: 500000, deadline: null, is_rolling: true, is_local: false, sectors: ['arts', 'heritage', 'education', 'health', 'science', 'museums', 'libraries'], eligibility_criteria: ['Registered UK charity or exempt charity (universities, schools, NHS trusts)', 'Capital projects only (buildings, equipment, renovations)', 'Must demonstrate excellence and broad public benefit', 'Cannot fund running costs or individuals'], apply_url: 'https://www.wolfson.org.uk/funding/', raw_data: {} as Record<string, unknown> },
    ])
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ── Source 81 — The Pilgrim Trust ─────────────────────────────────────────────
// thepilgrimtrust.org.uk — arts & heritage conservation + social welfare.
async function crawlPilgrimTrust(): Promise<CrawlResult> {
  const SOURCE = 'pilgrim_trust'
  try {
    return await upsertGrants(SOURCE, [
      { external_id: `${SOURCE}_preservation`, source: SOURCE, title: 'Pilgrim Trust — Preservation & Scholarship', funder: 'The Pilgrim Trust', funder_type: 'trust_foundation', description: 'Funds the preservation of the UK\'s cultural heritage including archives, manuscripts, historic buildings, and conservation of art objects. Also supports scholarly research and academic conferences.', amount_min: 5000, amount_max: 100000, deadline: null, is_rolling: true, is_local: false, sectors: ['heritage', 'arts', 'archives', 'conservation', 'education'], eligibility_criteria: ['UK registered charity or heritage body', 'Project must preserve UK cultural heritage', 'Academic/research projects via UK institutions'], apply_url: 'https://thepilgrimtrust.org.uk/grants/', raw_data: {} as Record<string, unknown> },
      { external_id: `${SOURCE}_social_welfare`, source: SOURCE, title: 'Pilgrim Trust — Social Welfare', funder: 'The Pilgrim Trust', funder_type: 'trust_foundation', description: 'Social welfare grants for registered charities working with older people, people with disabilities, ex-offenders, homelessness, substance misuse, and mental health in the UK.', amount_min: 5000, amount_max: 50000, deadline: null, is_rolling: true, is_local: false, sectors: ['social welfare', 'mental health', 'homelessness', 'disability', 'older people', 'criminal justice'], eligibility_criteria: ['Registered UK charity', 'Working with socially excluded or vulnerable people', 'Grants for defined projects, not general running costs'], apply_url: 'https://thepilgrimtrust.org.uk/grants/', raw_data: {} as Record<string, unknown> },
    ])
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ── Source 82 — Rosa — UK Fund for Women & Girls ──────────────────────────────
// rosauk.org — the only UK fund dedicated to women and girls.
async function crawlRosaUK(): Promise<CrawlResult> {
  const SOURCE = 'rosa_uk'
  try {
    return await upsertGrants(SOURCE, [
      { external_id: `${SOURCE}_grow_develop`, source: SOURCE, title: "Rosa — Grow & Develop Fund", funder: "Rosa UK Fund for Women & Girls", funder_type: 'trust_foundation', description: "Grants for small women's organisations to grow their capacity and deliver more impact. Funds core costs, staffing, organisational development and service delivery for groups working with women and girls.", amount_min: 10000, amount_max: 50000, deadline: null, is_rolling: false, is_local: false, sectors: ["women", "gender equality", "social welfare", "community"], eligibility_criteria: ["Organisation primarily focused on women and/or girls", "UK registered charity or community group", "Annual income under £500,000", "At least 50% of beneficiaries are women or girls"], apply_url: 'https://rosauk.org/funds/', raw_data: {} as Record<string, unknown> },
      { external_id: `${SOURCE}_voices`, source: SOURCE, title: "Rosa — Voices Fund", funder: "Rosa UK Fund for Women & Girls", funder_type: 'trust_foundation', description: "Supports women's organisations to influence policy and public debate, develop advocacy campaigns, and strengthen the voice of women and girls in public life.", amount_min: 5000, amount_max: 30000, deadline: null, is_rolling: false, is_local: false, sectors: ["women", "gender equality", "advocacy", "policy"], eligibility_criteria: ["Women's organisation or group campaigning on women's issues", "UK-based", "Work must aim to influence policy or public discourse"], apply_url: 'https://rosauk.org/funds/', raw_data: {} as Record<string, unknown> },
    ])
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ── Source 83 — Co-op Foundation ─────────────────────────────────────────────
// co-op.co.uk/campaigns/co-op-foundation — builds communities where young people thrive.
async function crawlCoOpFoundation(): Promise<CrawlResult> {
  const SOURCE = 'coop_foundation'
  try {
    return await upsertGrants(SOURCE, [
      { external_id: `${SOURCE}_bright_futures`, source: SOURCE, title: 'Co-op Foundation — Bright Futures', funder: 'Co-op Foundation', funder_type: 'corporate_foundation', description: "Co-op Foundation's Bright Futures programme funds co-operative projects led by young people or organisations supporting young people's wellbeing, social action and co-operative development.", amount_min: 1000, amount_max: 30000, deadline: null, is_rolling: false, is_local: false, sectors: ['youth', 'community', 'social action', 'co-operatives', 'wellbeing'], eligibility_criteria: ['UK-based charity or community group', 'Project must involve and benefit young people', 'Co-operative or community ownership element preferred'], apply_url: 'https://www.co-op.co.uk/campaigns/co-op-foundation', raw_data: {} as Record<string, unknown> },
    ])
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ══════════════════════════════════════════════════════════════════════════════
// BATCH 6 SOURCES (06:25) — major national funders + corporate/landfill
// ══════════════════════════════════════════════════════════════════════════════

// ── Source 84 — Wellcome Trust ────────────────────────────────────────────────
// wellcome.org — one of the world's largest funders of biomedical research + health.
async function crawlWellcomeTrust(): Promise<CrawlResult> {
  const SOURCE = 'wellcome_trust'
  try {
    return await upsertGrants(SOURCE, [
      { external_id: `${SOURCE}_research`, source: SOURCE, title: 'Wellcome Trust — Biomedical Research Grants', funder: 'Wellcome Trust', funder_type: 'trust_foundation', description: "Wellcome funds research to improve human and animal health. Programmes cover basic science, clinical medicine, public health and social science related to health. UK and international. Various schemes from early-career fellowships to large programme grants.", amount_min: 50000, amount_max: 3000000, deadline: null, is_rolling: true, is_local: false, sectors: ['health', 'medical research', 'science', 'public health', 'mental health'], eligibility_criteria: ['Universities, research institutes and NHS trusts worldwide', 'Must be for research with clear potential to benefit human health', 'Early-career through to senior researcher schemes available'], apply_url: 'https://wellcome.org/grant-funding', raw_data: {} as Record<string, unknown> },
      { external_id: `${SOURCE}_society_culture`, source: SOURCE, title: 'Wellcome Trust — Society & Culture Programme', funder: 'Wellcome Trust', funder_type: 'trust_foundation', description: "Wellcome's humanities and social science programme funds research, public engagement, museums and arts projects exploring the relationship between science, medicine, culture and society. Includes Wellcome Collection grant schemes.", amount_min: 10000, amount_max: 500000, deadline: null, is_rolling: true, is_local: false, sectors: ['health', 'arts', 'culture', 'humanities', 'public engagement', 'museums'], eligibility_criteria: ['UK-based or international organisations', 'Work must explore health, medicine or science from a humanities/arts perspective', 'Public engagement and creative projects welcome'], apply_url: 'https://wellcome.org/grant-funding/public-engagement', raw_data: {} as Record<string, unknown> },
    ])
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ── Source 85 — Nesta ─────────────────────────────────────────────────────────
// nesta.org.uk — innovation foundation, challenge prizes and programme grants.
async function crawlNesta(): Promise<CrawlResult> {
  const SOURCE = 'nesta'
  try {
    return await upsertGrants(SOURCE, [
      { external_id: `${SOURCE}_challenge_prizes`, source: SOURCE, title: 'Nesta — Challenge Prizes & Innovation Funds', funder: 'Nesta', funder_type: 'trust_foundation', description: "Nesta runs innovation challenges and programmes that fund organisations developing new solutions to social problems. Topics vary but typically cover health, education, economic inclusion, net zero and democracy. Challenge prizes of £50k–£1m+. Check website for current open challenges.", amount_min: 25000, amount_max: 1000000, deadline: null, is_rolling: false, is_local: false, sectors: ['innovation', 'technology', 'health', 'education', 'environment', 'social impact'], eligibility_criteria: ['Charities, social enterprises and for-profit companies eligible', 'UK-based organisations preferred but international competitions exist', 'Must propose evidence-based or innovative approaches to target problem'], apply_url: 'https://www.nesta.org.uk/funding/', raw_data: {} as Record<string, unknown> },
    ])
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ── Source 86 — Dulverton Trust ───────────────────────────────────────────────
// dulverton.org — independent grant-maker for conservation, peace/disarmament, and welfare.
async function crawlDulvertonTrust(): Promise<CrawlResult> {
  const SOURCE = 'dulverton_trust'
  try {
    return await upsertGrants(SOURCE, [
      { external_id: `${SOURCE}_main`, source: SOURCE, title: 'Dulverton Trust — General Grants', funder: 'Dulverton Trust', funder_type: 'trust_foundation', description: "Independent grant-making trust with four main areas: Conservation & Environment (rural, nature, landscape); Peace & Disarmament (conflict prevention, peacebuilding); Education (youth development, leadership); and General Welfare (homelessness, addiction, older people). Grants typically £5,000–£50,000.", amount_min: 5000, amount_max: 50000, deadline: null, is_rolling: true, is_local: false, sectors: ['environment', 'conservation', 'peace', 'education', 'social welfare', 'youth', 'homelessness'], eligibility_criteria: ['UK registered charity', 'Cannot fund individuals, statutory bodies, churches or religious activity', 'Previous grantees must wait 2 years before reapplying', 'Annual income under £5m preferred'], apply_url: 'https://www.dulverton.org/grants/', raw_data: {} as Record<string, unknown> },
    ])
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ── Source 87 — Blagrave Trust ────────────────────────────────────────────────
// blagravetrust.org — supports young people aged 10–25 in SE England.
async function crawlBlagraveTrust(): Promise<CrawlResult> {
  const SOURCE = 'blagrave_trust'
  try {
    return await upsertGrants(SOURCE, [
      { external_id: `${SOURCE}_main`, source: SOURCE, title: 'Blagrave Trust — Youth Empowerment Grants', funder: 'Blagrave Trust', funder_type: 'trust_foundation', description: "Blagrave Trust funds organisations that enable young people aged 10–25 in South East England to take control of their lives and make lasting change. Focuses on organisations led by or co-designed with young people. Multi-year grants of £10,000–£50,000 per year.", amount_min: 10000, amount_max: 50000, deadline: null, is_rolling: false, is_local: true, sectors: ['youth', 'empowerment', 'social welfare', 'community'], eligibility_criteria: ['Charities or CICs working with young people aged 10–25', 'Based in or primarily serving South East England', 'Young people must be meaningfully involved in design and delivery', 'Annual income under £2m'], apply_url: 'https://www.blagravetrust.org/apply/', raw_data: {} as Record<string, unknown> },
    ])
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ── Source 88 — Rank Foundation ───────────────────────────────────────────────
// rankfoundation.com — time to shine leadership development + community grants.
async function crawlRankFoundation(): Promise<CrawlResult> {
  const SOURCE = 'rank_foundation'
  try {
    return await upsertGrants(SOURCE, [
      { external_id: `${SOURCE}_time_to_shine`, source: SOURCE, title: 'Rank Foundation — Time to Shine Leadership Programme', funder: 'Rank Foundation', funder_type: 'trust_foundation', description: "Time to Shine develops emerging leaders from smaller charities and community organisations. Participants receive leadership training, mentoring, a project grant, and peer network access. Priority for those from disadvantaged backgrounds.", amount_min: 5000, amount_max: 15000, deadline: null, is_rolling: false, is_local: false, sectors: ['leadership', 'community', 'social welfare', 'youth', 'capacity building'], eligibility_criteria: ['Emerging leader from a small charity or community organisation (income under £2m)', 'UK-based', 'Applications typically open spring/summer — check website'], apply_url: 'https://www.rankfoundation.com/time-to-shine/', raw_data: {} as Record<string, unknown> },
      { external_id: `${SOURCE}_community`, source: SOURCE, title: 'Rank Foundation — Community Grants', funder: 'Rank Foundation', funder_type: 'trust_foundation', description: "Small grants for community organisations working to reduce disadvantage. Focus on employability, digital inclusion, and community resilience. Typically £3,000–£10,000.", amount_min: 3000, amount_max: 10000, deadline: null, is_rolling: true, is_local: false, sectors: ['community', 'social welfare', 'employment', 'digital inclusion'], eligibility_criteria: ['Small charity or community group (income under £500k)', 'UK-based', 'Focus on reducing disadvantage'], apply_url: 'https://www.rankfoundation.com/grants/', raw_data: {} as Record<string, unknown> },
    ])
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ── Source 89 — Cadent Foundation ────────────────────────────────────────────
// cadentgas.com/foundation — funds community energy, warm homes and social welfare.
async function crawlCadentFoundation(): Promise<CrawlResult> {
  const SOURCE = 'cadent_foundation'
  try {
    return await upsertGrants(SOURCE, [
      { external_id: `${SOURCE}_main`, source: SOURCE, title: 'Cadent Foundation — Community Grants', funder: 'Cadent Foundation', funder_type: 'corporate_foundation', description: "Cadent Foundation funds projects that tackle fuel poverty, keep communities warm and safe, and improve the lives of vulnerable people across Cadent's network areas (North West, West Midlands, East of England, North London). Grants of £1,000–£25,000.", amount_min: 1000, amount_max: 25000, deadline: null, is_rolling: true, is_local: true, sectors: ['fuel poverty', 'social welfare', 'community', 'energy', 'health'], eligibility_criteria: ['Registered charity or community group', 'Projects in Cadent\'s network area: NW England, West Midlands, East of England, North London', 'Focus on fuel poverty, vulnerable people or community resilience'], apply_url: 'https://cadentgas.com/foundation', raw_data: {} as Record<string, unknown> },
    ])
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ── Source 90 — Severn Trent Community Fund ───────────────────────────────────
// stcf.org.uk — water company fund for communities in the Severn Trent area.
async function crawlSevernTrentFund(): Promise<CrawlResult> {
  const SOURCE = 'severn_trent_fund'
  const BASE   = 'https://www.stcf.org.uk'
  try {
    const html  = await fetchHtml(`${BASE}/`)
    const root  = parseHTML(html)
    const grants: ScrapedGrant[] = []
    for (const card of root.querySelectorAll('article, .fund, .grant, .card')) {
      const titleEl = card.querySelector('h2 a, h3 a, h2, h3')
      const title   = titleEl?.text?.trim()
      if (!title || title.length < 5) continue
      const href = card.querySelector('a')?.getAttribute('href') ?? ''
      const url  = href.startsWith('http') ? href : `${BASE}${href}`
      const desc = card.querySelector('p')?.text?.trim() ?? ''
      const { min, max } = parseAmountRange(desc + ' ' + title)
      grants.push({ external_id: `severn_trent_fund_${slugify(href || title)}`, source: SOURCE, title, funder: 'Severn Trent Community Fund', funder_type: 'corporate_foundation', description: desc || 'Grant from Severn Trent Community Fund.', amount_min: min, amount_max: max, deadline: null, is_rolling: true, is_local: true, sectors: ['community', 'environment', 'water', 'social welfare'], eligibility_criteria: ['Organisations in the Severn Trent area (Midlands, parts of Wales)'], apply_url: url || null, raw_data: { title, href } as Record<string, unknown> })
    }
    if (grants.length > 0) return await upsertGrants(SOURCE, grants)
    return await upsertGrants(SOURCE, [
      { external_id: `${SOURCE}_community`, source: SOURCE, title: 'Severn Trent Community Fund — Community Projects', funder: 'Severn Trent Community Fund', funder_type: 'corporate_foundation', description: "Severn Trent's community fund supports projects that improve communities and the environment across the Midlands and parts of Wales. Topics include water efficiency, community spaces, biodiversity and social welfare.", amount_min: 500, amount_max: 50000, deadline: null, is_rolling: true, is_local: true, sectors: ['community', 'environment', 'water', 'biodiversity', 'social welfare'], eligibility_criteria: ['Charities, community groups and social enterprises', 'Located in the Severn Trent supply area (Midlands, Welsh borders)'], apply_url: `${BASE}/apply/`, raw_data: { note: 'Hardcoded fallback' } as Record<string, unknown> },
    ])
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ── Source 91 — Tesco Bags of Help ────────────────────────────────────────────
// tesco.com/bags-of-help — community grants funded by carrier bag charges.
async function crawlTescoBagsOfHelp(): Promise<CrawlResult> {
  const SOURCE = 'tesco_bags_of_help'
  try {
    return await upsertGrants(SOURCE, [
      { external_id: `${SOURCE}_main`, source: SOURCE, title: 'Tesco Bags of Help — Community Grants', funder: 'Tesco / Groundwork', funder_type: 'corporate_foundation', description: "Bags of Help funds local community projects across Great Britain. Projects are voted on by Tesco customers in store. Three projects per region receive grants of £4,000, £2,000 or £1,000. New rounds open regularly — check website.", amount_min: 1000, amount_max: 4000, deadline: null, is_rolling: false, is_local: true, sectors: ['community', 'social welfare', 'environment', 'sport', 'arts'], eligibility_criteria: ['UK registered charity, community group or voluntary organisation', 'Project must benefit the local community', 'Must have a Tesco store nearby to run customer vote', 'Cannot fund individuals or for-profit organisations'], apply_url: 'https://www.tesco.com/bags-of-help', raw_data: {} as Record<string, unknown> },
    ])
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ── Source 92 — Veolia Environmental Trust ────────────────────────────────────
// veolia.co.uk — landfill communities fund for environmental and community projects.
async function crawlVeoliaEnvTrust(): Promise<CrawlResult> {
  const SOURCE = 'veolia_environmental_trust'
  try {
    return await upsertGrants(SOURCE, [
      { external_id: `${SOURCE}_main`, source: SOURCE, title: 'Veolia Environmental Trust — Capital Grants', funder: 'Veolia Environmental Trust', funder_type: 'corporate_foundation', description: "Veolia Environmental Trust funds capital projects that protect or improve the natural or built environment, or provide community amenities, within 5 miles of a qualifying Veolia landfill site. Grants of £10,000–£75,000 for parks, nature reserves, community buildings and heritage sites.", amount_min: 10000, amount_max: 75000, deadline: null, is_rolling: false, is_local: true, sectors: ['environment', 'community', 'heritage', 'conservation', 'facilities'], eligibility_criteria: ['Registered charity, parish council or statutory body', 'Project site must be within 5 miles of a qualifying Veolia landfill', 'Capital projects only (not running costs)', 'Environmental or community benefit required'], apply_url: 'https://www.veolia.co.uk/veolia-environmental-trust', raw_data: {} as Record<string, unknown> },
    ])
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ── Source 93 — Biffa Award ───────────────────────────────────────────────────
// biffa-award.org.uk — landfill communities fund for nature and heritage projects.
async function crawlBiffaAward(): Promise<CrawlResult> {
  const SOURCE = 'biffa_award'
  const BASE   = 'https://www.biffa-award.org.uk'
  try {
    const html  = await fetchHtml(`${BASE}/scheme/`)
    const root  = parseHTML(html)
    const grants: ScrapedGrant[] = []
    for (const card of root.querySelectorAll('article, .scheme, .fund, .grant')) {
      const titleEl = card.querySelector('h2 a, h3 a, h2, h3')
      const title   = titleEl?.text?.trim()
      if (!title || title.length < 5) continue
      const href = card.querySelector('a')?.getAttribute('href') ?? ''
      const url  = href.startsWith('http') ? href : `${BASE}${href}`
      const desc = card.querySelector('p')?.text?.trim() ?? ''
      const { min, max } = parseAmountRange(desc + ' ' + title)
      grants.push({ external_id: `biffa_award_${slugify(href || title)}`, source: SOURCE, title, funder: 'Biffa Award', funder_type: 'corporate_foundation', description: desc || 'Capital grant from Biffa Award.', amount_min: min, amount_max: max, deadline: null, is_rolling: false, is_local: true, sectors: ['environment', 'heritage', 'community', 'conservation'], eligibility_criteria: ['Within 10 miles of a Biffa operational site', 'Registered charity or community group'], apply_url: url || null, raw_data: { title, href } as Record<string, unknown> })
    }
    if (grants.length > 0) return await upsertGrants(SOURCE, grants)
    return await upsertGrants(SOURCE, [
      { external_id: `${SOURCE}_communities`, source: SOURCE, title: 'Biffa Award — Thriving Communities', funder: 'Biffa Award', funder_type: 'corporate_foundation', description: "Capital grants for community buildings, sports facilities and village halls within 10 miles of a Biffa operational facility. Grants of £20,000–£75,000 for buildings that bring communities together.", amount_min: 20000, amount_max: 75000, deadline: null, is_rolling: false, is_local: true, sectors: ['community', 'sport', 'heritage', 'facilities'], eligibility_criteria: ['Within 10 miles of a Biffa landfill or waste facility', 'Registered charity, CIC or community group', 'Capital project for community building or facility'], apply_url: `${BASE}/scheme/thriving-communities/`, raw_data: { note: 'Hardcoded fallback' } as Record<string, unknown> },
      { external_id: `${SOURCE}_land_nature`, source: SOURCE, title: 'Biffa Award — Land of Beauty', funder: 'Biffa Award', funder_type: 'corporate_foundation', description: "Grants to improve biodiversity and access to nature in local greenspaces, nature reserves and parks within 10 miles of a Biffa site. Projects should enhance ecology, connect people with nature, or create new wildlife habitats.", amount_min: 10000, amount_max: 50000, deadline: null, is_rolling: false, is_local: true, sectors: ['environment', 'conservation', 'biodiversity', 'community'], eligibility_criteria: ['Within 10 miles of a Biffa landfill or waste facility', 'Registered charity or community land trust', 'Environmental or biodiversity project'], apply_url: `${BASE}/scheme/land-of-beauty/`, raw_data: { note: 'Hardcoded fallback' } as Record<string, unknown> },
    ])
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ── Source 94 — Santander Foundation ─────────────────────────────────────────
// santanderfoundation.org.uk — financial education and community investment.
async function crawlSantanderFoundation(): Promise<CrawlResult> {
  const SOURCE = 'santander_foundation'
  try {
    return await upsertGrants(SOURCE, [
      { external_id: `${SOURCE}_community`, source: SOURCE, title: 'Santander Foundation — Discovery Grants', funder: 'Santander Foundation', funder_type: 'corporate_foundation', description: "Santander Foundation funds financial education and economic empowerment programmes, and community projects supporting vulnerable people. Discovery grants for charities helping people improve their financial skills and resilience.", amount_min: 2000, amount_max: 20000, deadline: null, is_rolling: true, is_local: false, sectors: ['financial inclusion', 'education', 'social welfare', 'community', 'employment'], eligibility_criteria: ['UK registered charity', 'Focus on financial education, digital inclusion or supporting vulnerable people', 'Cannot fund individuals or statutory bodies'], apply_url: 'https://santanderfoundation.org.uk', raw_data: {} as Record<string, unknown> },
    ])
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ── Source 95 — Screwfix Foundation ──────────────────────────────────────────
// screwfixfoundation.com — repairs/builds facilities for people in need across the UK.
async function crawlScrewfixFoundation(): Promise<CrawlResult> {
  const SOURCE = 'screwfix_foundation'
  try {
    return await upsertGrants(SOURCE, [
      { external_id: `${SOURCE}_main`, source: SOURCE, title: 'Screwfix Foundation — Building & Repairs Fund', funder: 'Screwfix Foundation', funder_type: 'corporate_foundation', description: "Screwfix Foundation funds charities that fix, repair, maintain and improve properties and facilities for those in need across the UK. Grants of £5,000–£50,000 for building work, refurbishment and equipment. Applications open throughout the year.", amount_min: 5000, amount_max: 50000, deadline: null, is_rolling: true, is_local: false, sectors: ['social welfare', 'community', 'housing', 'disability', 'older people', 'facilities'], eligibility_criteria: ['UK registered charity', 'Project involves building work, renovation or repairs to a facility serving people in need', 'Must evidence need and impact', 'Funding is for capital works, not running costs'], apply_url: 'https://www.screwfixfoundation.com/apply-for-a-grant/', raw_data: {} as Record<string, unknown> },
    ])
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ══════════════════════════════════════════════════════════════════════════════
// BATCH 7 SOURCES (06:30) — innovation, remaining CFs, specialist foundations
// ══════════════════════════════════════════════════════════════════════════════

// ── Source 96 — Innovate UK ────────────────────────────────────────────────────
// innovateuk.ukri.org — UK's innovation agency, funding R&D and business innovation.
async function crawlInnovateUK(): Promise<CrawlResult> {
  const SOURCE = 'innovate_uk'
  try {
    return await upsertGrants(SOURCE, [
      { external_id: `${SOURCE}_smart`, source: SOURCE, title: 'Innovate UK — Smart Grants', funder: 'Innovate UK', funder_type: 'government', description: 'Innovate UK Smart Grants fund game-changing and disruptive R&D innovations from UK businesses. Open to companies of any size. Projects must be highly innovative, technically challenging, and have strong commercial potential. Grants of £25,000–£500,000 for projects of 6–36 months.', amount_min: 25000, amount_max: 500000, deadline: null, is_rolling: false, is_local: false, sectors: ['innovation', 'technology', 'research & development', 'business'], eligibility_criteria: ['UK-registered business (any size)', 'Project must be highly innovative and technically challenging', 'Must demonstrate commercial potential and route to market', 'Cannot fund purely academic research'], apply_url: 'https://www.ukri.org/councils/innovate-uk/funding-opportunities/', raw_data: {} as Record<string, unknown> },
      { external_id: `${SOURCE}_edge`, source: SOURCE, title: 'Innovate UK — Edge Growth Vouchers', funder: 'Innovate UK', funder_type: 'government', description: 'Innovate UK Edge provides grants and expert support for high-growth innovative UK businesses. Vouchers and grants help SMEs access specialist advice, develop technologies and scale internationally.', amount_min: 5000, amount_max: 50000, deadline: null, is_rolling: true, is_local: false, sectors: ['innovation', 'technology', 'business', 'scale-up', 'exports'], eligibility_criteria: ['UK SME with high growth potential', 'Demonstrable innovation in product, service or process', 'Turnover under £100m'], apply_url: 'https://www.ukri.org/councils/innovate-uk/', raw_data: {} as Record<string, unknown> },
      { external_id: `${SOURCE}_ktp`, source: SOURCE, title: 'Innovate UK — Knowledge Transfer Partnerships (KTP)', funder: 'Innovate UK', funder_type: 'government', description: 'KTPs fund partnerships between UK businesses and universities or research organisations to embed specialist knowledge and drive innovation. Grants cover associate salary and project costs. Suitable for SMEs and large companies.', amount_min: 30000, amount_max: 250000, deadline: null, is_rolling: true, is_local: false, sectors: ['innovation', 'technology', 'research & development', 'business', 'education'], eligibility_criteria: ['UK business in partnership with a UK knowledge base (university, research institute, college)', 'Project must transfer knowledge to deliver a specific strategic innovation', 'All business sizes eligible; SMEs get higher grant rates'], apply_url: 'https://www.ukri.org/councils/innovate-uk/guidance-for-applicants/knowledge-transfer-partnerships/', raw_data: {} as Record<string, unknown> },
    ])
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ── Source 97 — Humber & Wolds Community Foundation ──────────────────────────
async function crawlHumberCF(): Promise<CrawlResult> {
  const SOURCE = 'humber_cf'
  const BASE   = 'https://www.humbercf.org.uk'
  try {
    const html  = await fetchHtml(`${BASE}/funding/`)
    const root  = parseHTML(html)
    const grants: ScrapedGrant[] = []
    for (const card of root.querySelectorAll('article, .grant, .fund, .grant-item')) {
      const titleEl = card.querySelector('h2 a, h3 a, h2, h3')
      const title   = titleEl?.text?.trim()
      if (!title || title.length < 5) continue
      const href = card.querySelector('a')?.getAttribute('href') ?? ''
      const url  = href.startsWith('http') ? href : `${BASE}${href}`
      const desc = card.querySelector('p')?.text?.trim() ?? ''
      const { min, max } = parseAmountRange(desc + ' ' + title)
      grants.push({ external_id: `humber_cf_${slugify(href || title)}`, source: SOURCE, title, funder: 'Humber & Wolds Community Foundation', funder_type: 'community_foundation', description: desc || 'Grant from Humber & Wolds Community Foundation.', amount_min: min, amount_max: max, deadline: null, is_rolling: true, is_local: true, sectors: ['community', 'social welfare'], eligibility_criteria: ['Organisations in the Humber region or East Yorkshire Wolds'], apply_url: url || null, raw_data: { title, href } as Record<string, unknown> })
    }
    if (grants.length > 0) return await upsertGrants(SOURCE, grants)
    return await upsertGrants(SOURCE, [{ external_id: `${SOURCE}_open`, source: SOURCE, title: 'Humber & Wolds Community Foundation — Open Grants', funder: 'Humber & Wolds Community Foundation', funder_type: 'community_foundation', description: 'Humber & Wolds Community Foundation supports voluntary and community organisations across Hull, East Riding, North Lincolnshire and North East Lincolnshire.', amount_min: 500, amount_max: 15000, deadline: null, is_rolling: true, is_local: true, sectors: ['community', 'social welfare', 'arts', 'health'], eligibility_criteria: ['Voluntary or community group in the Humber region'], apply_url: `${BASE}/apply/`, raw_data: { note: 'Hardcoded fallback' } as Record<string, unknown> }])
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ── Source 98 — Worcestershire Community Foundation ───────────────────────────
async function crawlWorcestershireCF(): Promise<CrawlResult> {
  const SOURCE = 'worcestershire_cf'
  const BASE   = 'https://www.worcscf.org.uk'
  try {
    const html  = await fetchHtml(`${BASE}/grants/`)
    const root  = parseHTML(html)
    const grants: ScrapedGrant[] = []
    for (const card of root.querySelectorAll('article, .grant, .fund')) {
      const titleEl = card.querySelector('h2 a, h3 a, h2, h3')
      const title   = titleEl?.text?.trim()
      if (!title || title.length < 5) continue
      const href = card.querySelector('a')?.getAttribute('href') ?? ''
      const url  = href.startsWith('http') ? href : `${BASE}${href}`
      const desc = card.querySelector('p')?.text?.trim() ?? ''
      const { min, max } = parseAmountRange(desc + ' ' + title)
      grants.push({ external_id: `worcestershire_cf_${slugify(href || title)}`, source: SOURCE, title, funder: 'Worcestershire Community Foundation', funder_type: 'community_foundation', description: desc || 'Grant from Worcestershire Community Foundation.', amount_min: min, amount_max: max, deadline: null, is_rolling: true, is_local: true, sectors: ['community', 'social welfare'], eligibility_criteria: ['Groups in Worcestershire'], apply_url: url || null, raw_data: { title, href } as Record<string, unknown> })
    }
    if (grants.length > 0) return await upsertGrants(SOURCE, grants)
    return await upsertGrants(SOURCE, [{ external_id: `${SOURCE}_open`, source: SOURCE, title: 'Worcestershire Community Foundation — Open Grants', funder: 'Worcestershire Community Foundation', funder_type: 'community_foundation', description: 'Worcestershire Community Foundation distributes grants to voluntary and community organisations across Worcestershire, including rural and urban areas.', amount_min: 300, amount_max: 15000, deadline: null, is_rolling: true, is_local: true, sectors: ['community', 'social welfare', 'health', 'arts', 'rural'], eligibility_criteria: ['Voluntary or community group in Worcestershire'], apply_url: `${BASE}/apply/`, raw_data: { note: 'Hardcoded fallback' } as Record<string, unknown> }])
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ── Source 99 — sportscotland ─────────────────────────────────────────────────
// sportscotland.org.uk — national agency for sport in Scotland.
async function crawlSportScotland(): Promise<CrawlResult> {
  const SOURCE = 'sport_scotland'
  try {
    return await upsertGrants(SOURCE, [
      { external_id: `${SOURCE}_facilities`, source: SOURCE, title: 'sportscotland — Facilities Investment', funder: 'sportscotland', funder_type: 'government', description: 'sportscotland funds development of sport facilities across Scotland, from grassroots clubs to national performance venues. Capital grants for sports halls, pitches, changing facilities and equipment.', amount_min: 10000, amount_max: 500000, deadline: null, is_rolling: true, is_local: true, sectors: ['sport', 'physical activity', 'facilities', 'community'], eligibility_criteria: ['Sports clubs, local authorities and education bodies in Scotland', 'Facility must be for community or club use', 'Must demonstrate impact on participation or performance'], apply_url: 'https://sportscotland.org.uk/funding/', raw_data: {} as Record<string, unknown> },
      { external_id: `${SOURCE}_clubs`, source: SOURCE, title: 'sportscotland — Club and Community Sport Fund', funder: 'sportscotland', funder_type: 'government', description: 'Supports grassroots sports clubs and community organisations in Scotland to grow participation, improve governance and develop coaches and volunteers.', amount_min: 1000, amount_max: 50000, deadline: null, is_rolling: true, is_local: true, sectors: ['sport', 'physical activity', 'community', 'youth', 'volunteers'], eligibility_criteria: ['Sports clubs and community organisations in Scotland', 'Must be affiliated to a governing body or sport organisation'], apply_url: 'https://sportscotland.org.uk/funding/club-funding/', raw_data: {} as Record<string, unknown> },
    ])
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ── Source 100 — Foyle Foundation ────────────────────────────────────────────
// foylefoundation.org.uk — arts, learning and libraries, and small grants.
async function crawlFoyleFoundation(): Promise<CrawlResult> {
  const SOURCE = 'foyle_foundation'
  try {
    return await upsertGrants(SOURCE, [
      { external_id: `${SOURCE}_main_grants`, source: SOURCE, title: 'Foyle Foundation — Main Grants', funder: 'Foyle Foundation', funder_type: 'trust_foundation', description: 'Foyle Foundation funds arts and learning projects across the UK, with a particular interest in libraries and literacy. Main grants of £10,000–£50,000 for registered charities. Priority to arts organisations, libraries, heritage, education and literacy.', amount_min: 10000, amount_max: 50000, deadline: null, is_rolling: true, is_local: false, sectors: ['arts', 'education', 'libraries', 'literacy', 'heritage', 'culture'], eligibility_criteria: ['Registered UK charity', 'Annual income over £50,000', 'Work in arts, libraries, literacy, learning or heritage', 'Must not have received a Foyle grant in previous 2 years'], apply_url: 'https://www.foylefoundation.org.uk/how-to-apply/', raw_data: {} as Record<string, unknown> },
      { external_id: `${SOURCE}_small_grants`, source: SOURCE, title: 'Foyle Foundation — Small Grants', funder: 'Foyle Foundation', funder_type: 'trust_foundation', description: "Foyle Foundation's Small Grants scheme funds smaller charities across the UK for projects in arts, learning, environment and general charitable purposes. Grants of £1,000–£10,000.", amount_min: 1000, amount_max: 10000, deadline: null, is_rolling: true, is_local: false, sectors: ['arts', 'education', 'environment', 'community', 'social welfare'], eligibility_criteria: ['Registered UK charity with annual income under £150,000', 'Cannot fund individuals or statutory bodies'], apply_url: 'https://www.foylefoundation.org.uk/how-to-apply/', raw_data: {} as Record<string, unknown> },
    ])
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ── Source 101 — Ernest Cook Trust ───────────────────────────────────────────
// ernestcooktrust.org.uk — outdoor learning, conservation, and rural skills.
async function crawlErnestCookTrust(): Promise<CrawlResult> {
  const SOURCE = 'ernest_cook_trust'
  try {
    return await upsertGrants(SOURCE, [
      { external_id: `${SOURCE}_outdoor_learning`, source: SOURCE, title: 'Ernest Cook Trust — Outdoor Learning', funder: 'Ernest Cook Trust', funder_type: 'trust_foundation', description: "Ernest Cook Trust funds outdoor and environmental education projects that connect young people with nature. Supports residential outdoor learning, forest schools, farm visits and conservation skills for children and young people.", amount_min: 5000, amount_max: 50000, deadline: null, is_rolling: true, is_local: false, sectors: ['education', 'environment', 'youth', 'outdoor learning', 'conservation'], eligibility_criteria: ['UK registered charity or school', 'Programme must involve direct outdoor or environmental learning for young people', 'Residential or multi-day programmes preferred', 'Cannot fund building works or equipment only'], apply_url: 'https://www.ernestcooktrust.org.uk/grants/', raw_data: {} as Record<string, unknown> },
      { external_id: `${SOURCE}_rural_skills`, source: SOURCE, title: 'Ernest Cook Trust — Rural Skills & Conservation', funder: 'Ernest Cook Trust', funder_type: 'trust_foundation', description: 'Funds projects that teach traditional rural crafts, land management skills and conservation work. Includes dry stone walling, hedgelaying, woodland management and farm heritage skills.', amount_min: 2000, amount_max: 20000, deadline: null, is_rolling: true, is_local: false, sectors: ['conservation', 'rural', 'heritage', 'skills', 'environment', 'agriculture'], eligibility_criteria: ['UK registered charity or social enterprise', 'Focus on traditional rural or conservation skills', 'Must demonstrate training or educational component'], apply_url: 'https://www.ernestcooktrust.org.uk/grants/', raw_data: {} as Record<string, unknown> },
    ])
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ── Source 102 — Coalfields Regeneration Trust ───────────────────────────────
// coalfields-regen.org.uk — regeneration grants for former coalfield communities.
async function crawlCoalfieldsRegen(): Promise<CrawlResult> {
  const SOURCE = 'coalfields_regen'
  try {
    return await upsertGrants(SOURCE, [
      { external_id: `${SOURCE}_main`, source: SOURCE, title: 'Coalfields Regeneration Trust — Community Grants', funder: 'Coalfields Regeneration Trust', funder_type: 'trust_foundation', description: "Supports communities in former coalfield areas of England, Scotland and Wales to tackle poverty, improve health and wellbeing, and build community resilience. Grants for projects that create jobs, develop skills, improve facilities and support community enterprise in coalfield areas.", amount_min: 5000, amount_max: 50000, deadline: null, is_rolling: true, is_local: true, sectors: ['community', 'social welfare', 'employment', 'economic development', 'health'], eligibility_criteria: ['Organisation based in a former coalfield community', 'UK registered charity, community group or social enterprise', 'Project must benefit residents of coalfield areas', 'Check CRT website to confirm your area qualifies'], apply_url: 'https://www.coalfields-regen.org.uk/what-we-do/grants/', raw_data: {} as Record<string, unknown> },
    ])
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ── Source 103 — Local Trust / Big Local ─────────────────────────────────────
// localtrust.org.uk — Big Local and other community-led place-based funding.
async function crawlLocalTrust(): Promise<CrawlResult> {
  const SOURCE = 'local_trust'
  try {
    return await upsertGrants(SOURCE, [
      { external_id: `${SOURCE}_big_local`, source: SOURCE, title: 'Local Trust — Big Local', funder: 'Local Trust', funder_type: 'lottery', description: "Big Local brings together funding and support to help communities that don't often get investment. £1 million per area to spend over at least 10 years, decided entirely by local residents. Not currently open to new areas but associated programmes and learning resources are available.", amount_min: 10000, amount_max: 1000000, deadline: null, is_rolling: false, is_local: true, sectors: ['community', 'social welfare', 'economic development', 'place-based'], eligibility_criteria: ['Residents of a Big Local area', 'Must be in an area already selected for Big Local (check map)', 'Decisions made by local Big Local Partnership'], apply_url: 'https://localtrust.org.uk/big-local/', raw_data: {} as Record<string, unknown> },
      { external_id: `${SOURCE}_place_based_social_action`, source: SOURCE, title: 'Local Trust — Place-Based Social Action Fund', funder: 'Local Trust', funder_type: 'lottery', description: 'Funds organisations and partnerships that are building community power and place-based social action in under-invested communities across England. Focus on communities taking control of their own futures.', amount_min: 25000, amount_max: 150000, deadline: null, is_rolling: false, is_local: true, sectors: ['community', 'social welfare', 'place-based', 'community power', 'social action'], eligibility_criteria: ['Organisations working in under-invested communities in England', 'Must demonstrate community-led approach', 'Check Local Trust website for current open programmes'], apply_url: 'https://localtrust.org.uk/what-we-do/', raw_data: {} as Record<string, unknown> },
    ])
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ── Source 104 — Armed Forces Covenant Fund Trust ────────────────────────────
// covenantfund.org.uk — grants for the Armed Forces community.
async function crawlArmedForcesCovenant(): Promise<CrawlResult> {
  const SOURCE = 'armed_forces_covenant'
  const BASE   = 'https://www.covenantfund.org.uk'
  try {
    const html  = await fetchHtml(`${BASE}/programmes/`)
    const root  = parseHTML(html)
    const grants: ScrapedGrant[] = []
    for (const card of root.querySelectorAll('article, .programme, .grant, .card')) {
      const titleEl = card.querySelector('h2 a, h3 a, h2, h3')
      const title   = titleEl?.text?.trim()
      if (!title || title.length < 5) continue
      const href = card.querySelector('a')?.getAttribute('href') ?? ''
      const url  = href.startsWith('http') ? href : `${BASE}${href}`
      const desc = card.querySelector('p')?.text?.trim() ?? ''
      const { min, max } = parseAmountRange(desc + ' ' + title)
      grants.push({ external_id: `armed_forces_covenant_${slugify(href || title)}`, source: SOURCE, title, funder: 'Armed Forces Covenant Fund Trust', funder_type: 'government', description: desc || 'Grant from Armed Forces Covenant Fund Trust.', amount_min: min, amount_max: max, deadline: null, is_rolling: false, is_local: false, sectors: ['armed forces', 'veterans', 'social welfare', 'community'], eligibility_criteria: ['Organisations supporting the Armed Forces community'], apply_url: url || null, raw_data: { title, href } as Record<string, unknown> })
    }
    if (grants.length > 0) return await upsertGrants(SOURCE, grants)
    return await upsertGrants(SOURCE, [
      { external_id: `${SOURCE}_local_grants`, source: SOURCE, title: 'Armed Forces Covenant Fund Trust — Local Grants', funder: 'Armed Forces Covenant Fund Trust', funder_type: 'government', description: 'Funds projects that make a positive difference to Armed Forces personnel, veterans and their families across the UK. Local grants of up to £20,000 for community projects supporting the Armed Forces community.', amount_min: 500, amount_max: 20000, deadline: null, is_rolling: false, is_local: false, sectors: ['armed forces', 'veterans', 'social welfare', 'mental health', 'community'], eligibility_criteria: ['UK registered charity or voluntary organisation', 'Project must benefit serving personnel, veterans or their families', 'Cannot fund statutory services'], apply_url: `${BASE}/programmes/`, raw_data: { note: 'Hardcoded fallback' } as Record<string, unknown> },
      { external_id: `${SOURCE}_large_grants`, source: SOURCE, title: 'Armed Forces Covenant Fund Trust — Large Grants', funder: 'Armed Forces Covenant Fund Trust', funder_type: 'government', description: 'Larger grants of up to £500,000 for organisations developing significant new services or scaling existing provision for the Armed Forces community across the UK.', amount_min: 20000, amount_max: 500000, deadline: null, is_rolling: false, is_local: false, sectors: ['armed forces', 'veterans', 'mental health', 'housing', 'employment', 'community'], eligibility_criteria: ['Established UK charity or voluntary organisation', 'Proven track record of supporting the Armed Forces community', 'Must demonstrate reach and sustainable impact'], apply_url: `${BASE}/programmes/`, raw_data: { note: 'Hardcoded fallback' } as Record<string, unknown> },
    ])
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ── Source 105 — British Gas Energy Trust ────────────────────────────────────
// britishgasenergytrust.org.uk — tackles energy debt and fuel poverty.
async function crawlBritishGasEnergyTrust(): Promise<CrawlResult> {
  const SOURCE = 'british_gas_energy_trust'
  try {
    return await upsertGrants(SOURCE, [
      { external_id: `${SOURCE}_org_grants`, source: SOURCE, title: 'British Gas Energy Trust — Organisation Grants', funder: 'British Gas Energy Trust', funder_type: 'corporate_foundation', description: "Organisation grants fund charities and community groups that help vulnerable people deal with energy debt and fuel poverty across England, Wales and Scotland. Grants for advice services, outreach, case workers and warm homes projects.", amount_min: 10000, amount_max: 150000, deadline: null, is_rolling: false, is_local: false, sectors: ['fuel poverty', 'social welfare', 'energy', 'debt', 'community', 'health'], eligibility_criteria: ['UK registered charity or community group (England, Wales or Scotland)', 'Must support people in fuel poverty or energy debt', 'Organisation must not be an energy company or connected to one'], apply_url: 'https://www.britishgasenergytrust.org.uk/our-grants/organisation-grants/', raw_data: {} as Record<string, unknown> },
    ])
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ── Source 106 — People's Postcode Lottery Trust ─────────────────────────────
// postcodelottery.co.uk/good-causes — funds good causes from lottery proceeds.
async function crawlPostcodeLotteryTrust(): Promise<CrawlResult> {
  const SOURCE = 'postcode_lottery_trust'
  try {
    return await upsertGrants(SOURCE, [
      { external_id: `${SOURCE}_postcode_dream`, source: SOURCE, title: "People's Postcode Lottery — Postcode Dream Fund", funder: "People's Postcode Lottery Trust", funder_type: 'lottery', description: "People's Postcode Lottery raises money for good causes across Great Britain. The Postcode Dream Fund supports charities and community projects in areas where lottery players live. Periodic rounds — check website for open applications.", amount_min: 5000, amount_max: 500000, deadline: null, is_rolling: false, is_local: true, sectors: ['community', 'environment', 'social welfare', 'health', 'arts'], eligibility_criteria: ['UK registered charity', 'Project must benefit communities in areas where People\'s Postcode Lottery is played', 'Various sector-specific funds open throughout the year'], apply_url: 'https://www.postcodelottery.co.uk/good-causes/apply', raw_data: {} as Record<string, unknown> },
    ])
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ── Source 107 — Architectural Heritage Fund ──────────────────────────────────
// architecturalartsheritagefund.org.uk — unlocks historic buildings.
async function crawlArchitecturalHeritageFund(): Promise<CrawlResult> {
  const SOURCE = 'architectural_heritage_fund'
  try {
    return await upsertGrants(SOURCE, [
      { external_id: `${SOURCE}_project_viability`, source: SOURCE, title: 'Architectural Heritage Fund — Project Viability Grants', funder: 'Architectural Heritage Fund', funder_type: 'trust_foundation', description: 'Grants to help community organisations assess whether a threatened historic building can be saved and put to viable community use. Covers feasibility studies, options appraisals and business plans for historic building reuse.', amount_min: 5000, amount_max: 25000, deadline: null, is_rolling: true, is_local: false, sectors: ['heritage', 'community', 'conservation', 'social enterprise'], eligibility_criteria: ['Voluntary or community organisation', 'Historic building must be listed or locally listed and at risk or under-used', 'Organisation must have intention to bring building into community use'], apply_url: 'https://ahfund.org.uk/grants/', raw_data: {} as Record<string, unknown> },
      { external_id: `${SOURCE}_development`, source: SOURCE, title: 'Architectural Heritage Fund — Development Grants', funder: 'Architectural Heritage Fund', funder_type: 'trust_foundation', description: 'Larger capital grants for community organisations to repair, adapt and bring historic buildings back into sustainable community use. Usually follows a viability study. Grants of £25,000–£250,000.', amount_min: 25000, amount_max: 250000, deadline: null, is_rolling: true, is_local: false, sectors: ['heritage', 'community', 'conservation', 'social enterprise', 'facilities'], eligibility_criteria: ['Community organisation with viable plan for historic building', 'Building must be listed or of historic significance', 'Community benefit and financial sustainability required'], apply_url: 'https://ahfund.org.uk/grants/', raw_data: {} as Record<string, unknown> },
    ])
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ── Source 108 — Persimmon Building Futures ───────────────────────────────────
// persimmonhomes.com/persimmon-charitable-foundation — community grants from housebuilder.
async function crawlPersimmonFoundation(): Promise<CrawlResult> {
  const SOURCE = 'persimmon_foundation'
  try {
    return await upsertGrants(SOURCE, [
      { external_id: `${SOURCE}_building_futures`, source: SOURCE, title: 'Persimmon Charitable Foundation — Building Futures', funder: 'Persimmon Charitable Foundation', funder_type: 'corporate_foundation', description: "Persimmon's community fund awards grants to local charities and community groups near Persimmon developments. Grants of up to £2,000 per project for groups that need funding for new equipment, facilities and community activities.", amount_min: 500, amount_max: 2000, deadline: null, is_rolling: true, is_local: true, sectors: ['community', 'sport', 'arts', 'social welfare', 'youth'], eligibility_criteria: ['UK registered charity or community group', 'Project must be near a Persimmon development', 'Not-for-profit organisations only'], apply_url: 'https://www.persimmonhomes.com/persimmon-charitable-foundation', raw_data: {} as Record<string, unknown> },
    ])
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ══════════════════════════════════════════════════════════════════════════════
// BATCH 8 SOURCES (06:35) — corporate, government & specialist funders
// ══════════════════════════════════════════════════════════════════════════════

// ── Source 109 — Historic England ────────────────────────────────────────────
// historicengland.org.uk — national advisory body & funder for historic environment.
async function crawlHistoricEngland(): Promise<CrawlResult> {
  const SOURCE = 'historic_england'
  try {
    return await upsertGrants(SOURCE, [
      { external_id: `${SOURCE}_listed_places`, source: SOURCE, title: 'Historic England — Listed Places of Worship Grant Scheme', funder: 'Historic England', funder_type: 'government', description: 'Grants to help listed places of worship in England recover VAT costs on approved repair and maintenance work. Administered by the Listed Places of Worship Grant Scheme on behalf of DCMS.', amount_min: 500, amount_max: 100000, deadline: null, is_rolling: true, is_local: true, sectors: ['heritage', 'faith', 'conservation', 'community'], eligibility_criteria: ['Listed place of worship in England', 'Work must be approved repair and maintenance (not new construction)', 'Building must be actively used for worship'], apply_url: 'https://historicengland.org.uk/advice/planning/consents/grants/', raw_data: {} as Record<string, unknown> },
      { external_id: `${SOURCE}_heritage_at_risk`, source: SOURCE, title: 'Historic England — Heritage at Risk Grants', funder: 'Historic England', funder_type: 'government', description: 'Emergency and project grants for heritage assets on the Historic England Heritage at Risk Register. Helps bring endangered listed buildings, scheduled monuments and protected wreck sites back to good condition and viable use.', amount_min: 10000, amount_max: 500000, deadline: null, is_rolling: false, is_local: true, sectors: ['heritage', 'conservation', 'community', 'tourism'], eligibility_criteria: ['Asset must be on the Historic England Heritage at Risk Register', 'Applicant must have control of the asset or owner consent', 'England only'], apply_url: 'https://historicengland.org.uk/advice/heritage-at-risk/', raw_data: {} as Record<string, unknown> },
    ])
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ── Source 110 — John Lewis Partnership Foundation ───────────────────────────
// johnlewispartnership.co.uk/csr/our-commitments/communities/jlp-foundation
async function crawlJohnLewisFoundation(): Promise<CrawlResult> {
  const SOURCE = 'john_lewis_foundation'
  try {
    return await upsertGrants(SOURCE, [
      { external_id: `${SOURCE}_main`, source: SOURCE, title: 'John Lewis Partnership Foundation — Community Grants', funder: 'John Lewis Partnership Foundation', funder_type: 'corporate_foundation', description: "John Lewis Partnership Foundation funds charities and community groups that help build stronger, more resilient communities. Focus on skills and employment, financial wellbeing, and community connection. Typically funds projects near John Lewis or Waitrose sites.", amount_min: 5000, amount_max: 50000, deadline: null, is_rolling: false, is_local: true, sectors: ['employment', 'financial inclusion', 'community', 'social welfare', 'skills'], eligibility_criteria: ['UK registered charity or community group', 'Project near a John Lewis or Waitrose location preferred', 'Focus on employment, skills or financial wellbeing'], apply_url: 'https://www.johnlewispartnership.co.uk/csr/our-commitments/communities.html', raw_data: {} as Record<string, unknown> },
    ])
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ── Source 111 — Marks & Spencer Foundation ──────────────────────────────────
async function crawlMAndSFoundation(): Promise<CrawlResult> {
  const SOURCE = 'marks_spencer_foundation'
  try {
    return await upsertGrants(SOURCE, [
      { external_id: `${SOURCE}_main`, source: SOURCE, title: 'M&S Foundation — Community Grants', funder: 'Marks & Spencer Foundation', funder_type: 'corporate_foundation', description: "M&S Foundation funds charities that help people and communities across the UK. Priority areas include food poverty, mental health, and community resilience. Grants and in-kind support for projects making measurable impact.", amount_min: 5000, amount_max: 100000, deadline: null, is_rolling: false, is_local: false, sectors: ['food poverty', 'mental health', 'community', 'social welfare', 'health'], eligibility_criteria: ['UK registered charity', 'Work must align with M&S Foundation priority areas', 'Evidence-based approach required'], apply_url: 'https://corporate.marksandspencer.com/sustainability/our-people-and-communities', raw_data: {} as Record<string, unknown> },
    ])
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ── Source 112 — UK Shared Prosperity Fund ───────────────────────────────────
// gov.uk/guidance/uk-shared-prosperity-fund — government levelling-up fund.
async function crawlUKSPF(): Promise<CrawlResult> {
  const SOURCE = 'uk_spf'
  try {
    return await upsertGrants(SOURCE, [
      { external_id: `${SOURCE}_main`, source: SOURCE, title: 'UK Shared Prosperity Fund', funder: 'Department for Levelling Up, Housing & Communities', funder_type: 'government', description: "The UK Shared Prosperity Fund (UKSPF) is a central pillar of the UK government's levelling up agenda, replacing EU structural funds. £2.6bn for local areas to invest in people and places. Delivered through local Lead Authorities — contact your local council to find out what programmes are available in your area.", amount_min: 5000, amount_max: 500000, deadline: null, is_rolling: false, is_local: true, sectors: ['economic development', 'employment', 'skills', 'community', 'social welfare', 'business'], eligibility_criteria: ['Organisations in eligible UK local authority areas', 'Projects must align with local UKSPF investment plans', 'Contact your local Lead Authority for specific opportunities', 'Charities, community groups, businesses and public bodies eligible depending on strand'], apply_url: 'https://www.gov.uk/guidance/uk-shared-prosperity-fund', raw_data: {} as Record<string, unknown> },
    ])
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ── Source 113 — Farming in Protected Landscapes ─────────────────────────────
// gov.uk/guidance/funding-for-farmers-in-protected-landscapes
async function crawlFarmingProtectedLandscapes(): Promise<CrawlResult> {
  const SOURCE = 'farming_protected_landscapes'
  try {
    return await upsertGrants(SOURCE, [
      { external_id: `${SOURCE}_main`, source: SOURCE, title: 'Farming in Protected Landscapes (FiPL)', funder: 'Natural England / DEFRA', funder_type: 'government', description: 'FiPL provides grants to farmers and land managers in National Parks and Areas of Outstanding Natural Beauty (AONBs) across England to take actions that support nature recovery, climate mitigation, scenic beauty and engagement with the landscape. Grants of up to £50,000 per project.', amount_min: 2500, amount_max: 50000, deadline: null, is_rolling: true, is_local: true, sectors: ['environment', 'agriculture', 'conservation', 'rural', 'heritage', 'climate'], eligibility_criteria: ['Farmer or land manager within a National Park or AONB in England', 'Project must benefit nature, climate, scenic quality or wellbeing', 'Apply to your local National Park Authority or AONB'], apply_url: 'https://www.gov.uk/guidance/funding-for-farmers-in-protected-landscapes', raw_data: {} as Record<string, unknown> },
    ])
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ── Source 114 — Esmee Fairbairn Collections Fund ────────────────────────────
// esmee-fairbairn.org.uk/what-we-fund/collections — separate from main Esmee programme.
async function crawlEsmeeFairbairnCollections(): Promise<CrawlResult> {
  const SOURCE = 'esmee_fairbairn_collections'
  try {
    return await upsertGrants(SOURCE, [
      { external_id: `${SOURCE}_main`, source: SOURCE, title: 'Esmée Fairbairn Collections Fund', funder: 'Esmée Fairbairn Foundation', funder_type: 'trust_foundation', description: "Dedicated fund for UK museums, galleries and archives to develop and share their collections more widely. Supports digitisation, new interpretations, touring exhibitions, skills development and opening up previously inaccessible collections.", amount_min: 30000, amount_max: 250000, deadline: null, is_rolling: false, is_local: false, sectors: ['museums', 'heritage', 'arts', 'archives', 'culture', 'digital'], eligibility_criteria: ['UK museum, gallery or archive with a public collection', 'Project must develop or share the collection more widely', 'Not for individual projects within a programme already funded by Esmee Fairbairn main fund'], apply_url: 'https://www.esmeefairbairn.org.uk/what-we-fund/collections/', raw_data: {} as Record<string, unknown> },
    ])
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ── Source 115 — EDF Energy Community Fund ───────────────────────────────────
async function crawlEDFEnergyCommunityFund(): Promise<CrawlResult> {
  const SOURCE = 'edf_community_fund'
  try {
    return await upsertGrants(SOURCE, [
      { external_id: `${SOURCE}_main`, source: SOURCE, title: 'EDF Energy — Community Fund', funder: 'EDF Energy', funder_type: 'corporate_foundation', description: "EDF Energy's community funds support projects near its power stations and renewable energy sites. Grants for local environmental improvements, education, community facilities and social welfare projects.", amount_min: 1000, amount_max: 25000, deadline: null, is_rolling: true, is_local: true, sectors: ['community', 'environment', 'education', 'social welfare', 'energy'], eligibility_criteria: ['Registered charity or community group', 'Project must be near an EDF Energy site', 'Focus on community benefit, environment or education'], apply_url: 'https://www.edfenergy.com/energyfutures/community-fund', raw_data: {} as Record<string, unknown> },
    ])
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ── Source 116 — NHS Charities Together ──────────────────────────────────────
// nhscharitiestogether.co.uk — funds NHS charities supporting patient & staff wellbeing.
async function crawlNHSCharitiesTogether(): Promise<CrawlResult> {
  const SOURCE = 'nhs_charities_together'
  const BASE   = 'https://www.nhscharitiestogether.co.uk'
  try {
    const html  = await fetchHtml(`${BASE}/grants/`)
    const root  = parseHTML(html)
    const grants: ScrapedGrant[] = []
    for (const card of root.querySelectorAll('article, .grant, .fund, .card')) {
      const titleEl = card.querySelector('h2 a, h3 a, h2, h3')
      const title   = titleEl?.text?.trim()
      if (!title || title.length < 5) continue
      const href = card.querySelector('a')?.getAttribute('href') ?? ''
      const url  = href.startsWith('http') ? href : `${BASE}${href}`
      const desc = card.querySelector('p')?.text?.trim() ?? ''
      const { min, max } = parseAmountRange(desc + ' ' + title)
      grants.push({ external_id: `nhs_charities_together_${slugify(href || title)}`, source: SOURCE, title, funder: 'NHS Charities Together', funder_type: 'trust_foundation', description: desc || 'Grant from NHS Charities Together.', amount_min: min, amount_max: max, deadline: null, is_rolling: false, is_local: false, sectors: ['health', 'social welfare', 'mental health', 'community'], eligibility_criteria: ['NHS charity or organisation supporting NHS patients, staff or volunteers'], apply_url: url || null, raw_data: { title, href } as Record<string, unknown> })
    }
    if (grants.length > 0) return await upsertGrants(SOURCE, grants)
    return await upsertGrants(SOURCE, [
      { external_id: `${SOURCE}_community_grants`, source: SOURCE, title: 'NHS Charities Together — Community Grants', funder: 'NHS Charities Together', funder_type: 'trust_foundation', description: "NHS Charities Together funds projects that improve the wellbeing of NHS patients, staff and volunteers across the UK. Community grants support activities that complement NHS services and promote health and wellbeing in communities.", amount_min: 5000, amount_max: 100000, deadline: null, is_rolling: false, is_local: false, sectors: ['health', 'social welfare', 'mental health', 'wellbeing', 'community'], eligibility_criteria: ['NHS charity or charitable organisation working with NHS', 'Project must improve health, wellbeing or experience of NHS patients, staff or volunteers', 'Must demonstrate NHS partnership or endorsement'], apply_url: `${BASE}/grants/`, raw_data: { note: 'Hardcoded fallback' } as Record<string, unknown> },
    ])
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ── Source 117 — Groundwork UK ───────────────────────────────────────────────
// groundwork.org.uk — environment and community regeneration federation.
async function crawlGroundworkUK(): Promise<CrawlResult> {
  const SOURCE = 'groundwork_uk'
  try {
    return await upsertGrants(SOURCE, [
      { external_id: `${SOURCE}_green_recovery`, source: SOURCE, title: 'Groundwork UK — Green Recovery Challenge Fund', funder: 'Groundwork UK / DEFRA', funder_type: 'trust_foundation', description: "Groundwork UK administers environmental and community grants, including the Green Recovery Challenge Fund supporting nature recovery, green spaces and community environmental projects. Various themed rounds — check website for current open calls.", amount_min: 10000, amount_max: 500000, deadline: null, is_rolling: false, is_local: false, sectors: ['environment', 'community', 'green spaces', 'biodiversity', 'social welfare'], eligibility_criteria: ['UK registered charity or VCSE organisation', 'Projects delivering environmental and community benefits', 'Must demonstrate measurable environmental impact'], apply_url: 'https://www.groundwork.org.uk/what-we-do/funding/', raw_data: {} as Record<string, unknown> },
    ])
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ── Source 118 — Aldi UK Stores Foundation ───────────────────────────────────
async function crawlAldiFoundation(): Promise<CrawlResult> {
  const SOURCE = 'aldi_foundation'
  try {
    return await upsertGrants(SOURCE, [
      { external_id: `${SOURCE}_main`, source: SOURCE, title: "Aldi UK — Neighbourhood Grant", funder: 'Aldi UK', funder_type: 'corporate_foundation', description: "Aldi's Neighbourhood Grant programme supports local community projects near Aldi stores. Grants of up to £1,000 for community groups, charities and schools. Applications accepted year-round via local store managers.", amount_min: 100, amount_max: 1000, deadline: null, is_rolling: true, is_local: true, sectors: ['community', 'social welfare', 'youth', 'sport', 'arts'], eligibility_criteria: ['Not-for-profit community group, charity or school', 'Project must benefit the local community near an Aldi store', 'Apply through your local Aldi store manager'], apply_url: 'https://www.aldi.co.uk/about-aldi/corporate-responsibility', raw_data: {} as Record<string, unknown> },
    ])
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ── Source 119 — Waitrose Community Matters ──────────────────────────────────
async function crawlWaitroseCommunityMatters(): Promise<CrawlResult> {
  const SOURCE = 'waitrose_community_matters'
  try {
    return await upsertGrants(SOURCE, [
      { external_id: `${SOURCE}_main`, source: SOURCE, title: 'Waitrose Community Matters', funder: 'Waitrose / John Lewis Partnership', funder_type: 'corporate_foundation', description: "Waitrose Community Matters gives tokens to customers who vote for their chosen local charity. Every month, three local causes share £1,000 per Waitrose branch. Charities must be within the local community of a Waitrose store.", amount_min: 100, amount_max: 1000, deadline: null, is_rolling: true, is_local: true, sectors: ['community', 'social welfare', 'youth', 'health', 'arts'], eligibility_criteria: ['UK registered charity or community group', 'Must be local to a Waitrose store', 'Apply online then Waitrose customers vote'], apply_url: 'https://www.waitrose.com/ecom/content/community-matters', raw_data: {} as Record<string, unknown> },
    ])
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ── Source 120 — Teenage Cancer Trust ────────────────────────────────────────
async function crawlTeenageCancerTrust(): Promise<CrawlResult> {
  const SOURCE = 'teenage_cancer_trust'
  try {
    return await upsertGrants(SOURCE, [
      { external_id: `${SOURCE}_nursing`, source: SOURCE, title: 'Teenage Cancer Trust — Clinical Nurse Specialist Grants', funder: 'Teenage Cancer Trust', funder_type: 'trust_foundation', description: "Teenage Cancer Trust funds specialist nurses and dedicated units for young people aged 13–24 with cancer in NHS hospitals across the UK. Also supports research, patient support programmes and training for healthcare professionals.", amount_min: 50000, amount_max: 500000, deadline: null, is_rolling: false, is_local: false, sectors: ['health', 'cancer', 'youth', 'medical research', 'NHS'], eligibility_criteria: ['NHS hospitals and cancer centres', 'Must be developing or enhancing specialist teenage and young adult cancer services', 'UK hospitals only'], apply_url: 'https://www.teenagecancertrust.org/get-help/healthcare-professionals/grants/', raw_data: {} as Record<string, unknown> },
    ])
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ── Source 121 — Active Travel England ────────────────────────────────────────
// activetravelengland.gov.uk — walking, cycling and wheeling infrastructure.
async function crawlActiveTravelEngland(): Promise<CrawlResult> {
  const SOURCE = 'active_travel_england'
  try {
    return await upsertGrants(SOURCE, [
      { external_id: `${SOURCE}_capability`, source: SOURCE, title: 'Active Travel England — Capability & Ambition Fund', funder: 'Active Travel England', funder_type: 'government', description: 'Active Travel England funds local authorities and organisations to plan and deliver walking, cycling and wheeling infrastructure across England. Schemes range from new cycle paths and school streets to accessibility improvements and behaviour change programmes.', amount_min: 25000, amount_max: 2000000, deadline: null, is_rolling: false, is_local: true, sectors: ['transport', 'active travel', 'health', 'environment', 'community'], eligibility_criteria: ['Local authorities in England', 'Community and charity organisations in partnership with local authorities', 'Projects must improve conditions for walking, cycling or wheeling'], apply_url: 'https://www.activetravelengland.gov.uk/funding', raw_data: {} as Record<string, unknown> },
    ])
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ═══════════════════════════════════════════════════════════════════════════════
// BATCH 9 — Alternative funding routes (competitions, social loans, crowdfund
//            match funds). Targets grassroots founders and impact entrepreneurs
//            who access capital through routes formal platforms ignore.
// ═══════════════════════════════════════════════════════════════════════════════

// ── Source 121 — UnLtd ────────────────────────────────────────────────────────
async function crawlUnLtd(): Promise<CrawlResult> {
  const SOURCE = 'unltd'
  try {
    const html = await fetchHtml('https://unltd.org.uk/find-your-support/')
    const root = parseHTML(html)
    const grants: ScrapedGrant[] = []
    root.querySelectorAll('article, .support-card, .programme-card').forEach(card => {
      const title = card.querySelector('h2, h3, .card-title')?.text.trim()
      if (!title) return
      const desc  = card.querySelector('p, .card-body')?.text.trim() ?? ''
      const href  = card.querySelector('a')?.getAttribute('href') ?? ''
      const url   = href.startsWith('http') ? href : `https://unltd.org.uk${href}`
      const slug  = slugify(url)
      grants.push({
        external_id:          `unltd_${slug}`,
        source:               SOURCE,
        title:                `UnLtd — ${title}`,
        funder:               'UnLtd',
        funder_type:          'competition',
        description:          desc || 'UnLtd supports social entrepreneurs through awards, training and networks. Awards of up to £500 (Do It) and up to £15,000 (Build It) for social ventures at different stages.',
        amount_min:           500,
        amount_max:           15000,
        deadline:             null,
        is_rolling:           true,
        is_local:             false,
        sectors:              ['social enterprise', 'community', 'social innovation', 'entrepreneurship'],
        eligibility_criteria: ['Social entrepreneurs at any stage', 'Based in the UK', 'Social mission at the heart of the venture'],
        apply_url:            url,
        raw_data:             {} as Record<string, unknown>,
      })
    })
    if (grants.length === 0) return await upsertGrants(SOURCE, [{
      external_id: `${SOURCE}_awards`, source: SOURCE,
      title: 'UnLtd — Awards for Social Entrepreneurs',
      funder: 'UnLtd', funder_type: 'competition',
      description: 'UnLtd is the leading funder of social entrepreneurs in the UK. The Do It Award (up to £500) supports people taking their first steps, while the Build It Award (up to £15,000) helps those with proven ideas grow their impact. Awards come with practical support and access to a network of fellow social entrepreneurs.',
      amount_min: 500, amount_max: 15000, deadline: null, is_rolling: true, is_local: false,
      sectors: ['social enterprise', 'entrepreneurship', 'community', 'social innovation'],
      eligibility_criteria: ['Social entrepreneurs at any stage', 'Based in the UK', 'Venture must have a primary social mission'],
      apply_url: 'https://unltd.org.uk/find-your-support/', raw_data: {} as Record<string, unknown>,
    }])
    return await upsertGrants(SOURCE, grants.slice(0, 10))
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ── Source 122 — School for Social Entrepreneurs (SSE) ───────────────────────
async function crawlSSEFellowships(): Promise<CrawlResult> {
  const SOURCE = 'sse_fellowships'
  try {
    return await upsertGrants(SOURCE, [
      {
        external_id: `${SOURCE}_fellowship`, source: SOURCE,
        title: 'SSE Fellowship Programme — Learning & Bursary',
        funder: 'School for Social Entrepreneurs', funder_type: 'competition',
        description: 'The School for Social Entrepreneurs runs year-long fellowship programmes combining peer learning with bursaries of £2,500–£10,000. Programmes support social entrepreneurs to grow income, impact and resilience. SSE has programmes across England, Scotland, Wales and Ireland, with specialist tracks for health, housing, rural and other themes.',
        amount_min: 2500, amount_max: 10000, deadline: null, is_rolling: true, is_local: false,
        sectors: ['social enterprise', 'entrepreneurship', 'education', 'community', 'health'],
        eligibility_criteria: ['Social entrepreneurs running a social venture', 'Based in the UK or Ireland', 'Venture generating some income (not pre-idea stage)', 'Open to CICs, charities, social enterprises and community businesses'],
        apply_url: 'https://www.sse.org.uk/programmes/apply-for-a-programme', raw_data: {} as Record<string, unknown>,
      },
    ])
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ── Source 123 — Nesta Challenges ─────────────────────────────────────────────
async function crawlNestaChallenges(): Promise<CrawlResult> {
  const SOURCE = 'nesta_challenges'
  try {
    const html = await fetchHtml('https://www.nesta.org.uk/project/challenges/')
    const root = parseHTML(html)
    const grants: ScrapedGrant[] = []
    root.querySelectorAll('article, .challenge-card, .project-card').forEach(card => {
      const title = card.querySelector('h2, h3, .card-title')?.text.trim()
      if (!title) return
      const desc = card.querySelector('p, .card-body')?.text.trim() ?? ''
      const href = card.querySelector('a')?.getAttribute('href') ?? ''
      const url  = href.startsWith('http') ? href : `https://www.nesta.org.uk${href}`
      grants.push({
        external_id:          `nesta_challenge_${slugify(url)}`,
        source:               SOURCE,
        title:                `Nesta Challenge — ${title}`,
        funder:               'Nesta', funder_type: 'competition',
        description:          desc || 'Nesta innovation challenge with prize fund for the best solutions.',
        amount_min:           10000, amount_max: 1000000, deadline: null, is_rolling: false, is_local: false,
        sectors:              ['social innovation', 'technology', 'health', 'climate', 'education'],
        eligibility_criteria: ['Open to social enterprises, startups, charities and individuals', 'UK-based or with UK operations'],
        apply_url:            url, raw_data: {} as Record<string, unknown>,
      })
    })
    if (grants.length === 0) return await upsertGrants(SOURCE, [{
      external_id: `${SOURCE}_main`, source: SOURCE,
      title: 'Nesta Innovation Challenges — Prize Competitions',
      funder: 'Nesta', funder_type: 'competition',
      description: 'Nesta runs a portfolio of open innovation challenges and prize competitions tackling issues from healthy ageing to climate and education. Prizes typically range from £50,000 to £1 million. Challenges are open to startups, social enterprises, charities, researchers and individuals with proven solutions.',
      amount_min: 50000, amount_max: 1000000, deadline: null, is_rolling: false, is_local: false,
      sectors: ['social innovation', 'health', 'climate', 'education', 'technology'],
      eligibility_criteria: ['Open competition — individuals, startups, charities, social enterprises', 'UK operations required for most challenges'],
      apply_url: 'https://www.nesta.org.uk/project/challenges/', raw_data: {} as Record<string, unknown>,
    }])
    return await upsertGrants(SOURCE, grants.slice(0, 8))
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ── Source 124 — Nominet Tech for Good ───────────────────────────────────────
async function crawlNominetTechForGood(): Promise<CrawlResult> {
  const SOURCE = 'nominet_tech_for_good'
  try {
    return await upsertGrants(SOURCE, [{
      external_id: `${SOURCE}_main`, source: SOURCE,
      title: 'Nominet — Tech for Good Programme',
      funder: 'Nominet', funder_type: 'competition',
      description: 'Nominet funds digital social innovation through its Tech for Good programme, supporting projects that use technology to address social challenges. The programme includes awards, grants and investment for early-stage digital ventures with measurable social impact.',
      amount_min: 5000, amount_max: 100000, deadline: null, is_rolling: true, is_local: false,
      sectors: ['technology', 'digital', 'social innovation', 'community', 'education'],
      eligibility_criteria: ['UK-based organisations and social enterprises', 'Digital or technology-led approaches to social challenges', 'Early-stage to growth-stage ventures welcome'],
      apply_url: 'https://www.nominet.uk/tech-good/', raw_data: {} as Record<string, unknown>,
    }])
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ── Source 125 — Key Fund ─────────────────────────────────────────────────────
async function crawlKeyFund(): Promise<CrawlResult> {
  const SOURCE = 'key_fund'
  try {
    return await upsertGrants(SOURCE, [
      {
        external_id: `${SOURCE}_loan`, source: SOURCE,
        title: 'Key Fund — Social Investment Loans',
        funder: 'Key Fund', funder_type: 'loan',
        description: 'Key Fund is a specialist social investor providing unsecured loans of £2,000–£150,000 to social enterprises, community businesses and charities in the UK. Loans are typically at low or zero interest and are designed to be accessible to organisations that struggle to access mainstream finance. Key Fund specialises in supporting organisations in disadvantaged communities.',
        amount_min: 2000, amount_max: 150000, deadline: null, is_rolling: true, is_local: false,
        sectors: ['social enterprise', 'community', 'housing', 'employment', 'health'],
        eligibility_criteria: ['Social enterprises, CICs, charities and community interest companies', 'UK-based', 'Trading income or clear route to income required', 'Organisations in disadvantaged communities prioritised'],
        apply_url: 'https://thekeyfund.co.uk/our-funding/', raw_data: {} as Record<string, unknown>,
      },
    ])
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ── Source 126 — Fredericks Foundation ───────────────────────────────────────
async function crawlFredericksFoundation(): Promise<CrawlResult> {
  const SOURCE = 'fredericks_foundation'
  try {
    return await upsertGrants(SOURCE, [{
      external_id: `${SOURCE}_microloan`, source: SOURCE,
      title: 'Fredericks Foundation — Interest-Free Microloans',
      funder: 'Fredericks Foundation', funder_type: 'loan',
      description: 'Fredericks Foundation offers interest-free business loans of up to £25,000 to micro-enterprises and social enterprises that cannot access mainstream finance. Loans come with free mentoring and business support. Fredericks specialises in supporting entrepreneurs from disadvantaged backgrounds, including those with poor credit history.',
      amount_min: 500, amount_max: 25000, deadline: null, is_rolling: true, is_local: false,
      sectors: ['entrepreneurship', 'social enterprise', 'community', 'employment', 'micro-enterprise'],
      eligibility_criteria: ['Micro-enterprises and social enterprises', 'Based in England', 'Unable to access mainstream bank finance', 'Entrepreneurs from disadvantaged backgrounds prioritised'],
      apply_url: 'https://www.fredericksfoundation.org/apply', raw_data: {} as Record<string, unknown>,
    }])
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ── Source 127 — Social Investment Business (SIB) ────────────────────────────
async function crawlSocialInvestmentBusiness(): Promise<CrawlResult> {
  const SOURCE = 'social_investment_business'
  try {
    return await upsertGrants(SOURCE, [
      {
        external_id: `${SOURCE}_resilience`, source: SOURCE,
        title: 'Social Investment Business — Resilience & Recovery Loans',
        funder: 'Social Investment Business', funder_type: 'loan',
        description: 'The Social Investment Business provides repayable finance to charities and social enterprises across England. Loan products include emergency resilience loans, growth capital and working capital facilities. SIB prioritises organisations working with disadvantaged communities and underserved groups.',
        amount_min: 50000, amount_max: 1500000, deadline: null, is_rolling: true, is_local: false,
        sectors: ['social enterprise', 'charity', 'community', 'health', 'housing', 'employment'],
        eligibility_criteria: ['Registered charities and social enterprises in England', 'Minimum £250k annual income recommended', 'Clear social mission and evidence of impact'],
        apply_url: 'https://sibgroup.org.uk/finance/', raw_data: {} as Record<string, unknown>,
      },
    ])
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ── Source 128 — Big Issue Invest ─────────────────────────────────────────────
async function crawlBigIssueInvest(): Promise<CrawlResult> {
  const SOURCE = 'big_issue_invest'
  try {
    return await upsertGrants(SOURCE, [{
      external_id: `${SOURCE}_main`, source: SOURCE,
      title: 'Big Issue Invest — Social Investment',
      funder: 'Big Issue Invest', funder_type: 'loan',
      description: 'Big Issue Invest is the social investment arm of the Big Issue Group, providing loans and investment of £20,000–£1.5 million to social enterprises and charities. Funding supports organisations tackling poverty and disadvantage across the UK. Products include social loans, equity and hybrid instruments with patient, flexible terms.',
      amount_min: 20000, amount_max: 1500000, deadline: null, is_rolling: true, is_local: false,
      sectors: ['social enterprise', 'poverty', 'housing', 'employment', 'community', 'health'],
      eligibility_criteria: ['Social enterprises and charities tackling poverty', 'Based in the UK', 'Evidence of trading income or clear revenue model', 'Strong social impact metrics'],
      apply_url: 'https://www.bigissueinvest.com/apply/', raw_data: {} as Record<string, unknown>,
    }])
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ── Source 129 — Crowdfunder UK Match Funds ───────────────────────────────────
async function crawlCrowdfunderMatch(): Promise<CrawlResult> {
  const SOURCE = 'crowdfunder_match'
  try {
    const html = await fetchHtml('https://www.crowdfunder.co.uk/funds')
    const root = parseHTML(html)
    const grants: ScrapedGrant[] = []
    root.querySelectorAll('article, .fund-card, .match-fund').forEach(card => {
      const title = card.querySelector('h2, h3, .fund-title')?.text.trim()
      if (!title) return
      const desc  = card.querySelector('p, .fund-desc')?.text.trim() ?? ''
      const href  = card.querySelector('a')?.getAttribute('href') ?? ''
      const url   = href.startsWith('http') ? href : `https://www.crowdfunder.co.uk${href}`
      grants.push({
        external_id:          `crowdfunder_match_${slugify(url)}`,
        source:               SOURCE,
        title:                `Crowdfunder Match — ${title}`,
        funder:               'Crowdfunder UK', funder_type: 'crowdfund_match',
        description:          desc || 'Matched crowdfunding campaign — funders pledge to top up every pound raised publicly.',
        amount_min:           500, amount_max: 50000, deadline: null, is_rolling: true, is_local: true,
        sectors:              ['community', 'social enterprise', 'local'],
        eligibility_criteria: ['UK-based community groups, charities and social enterprises', 'Must run a public crowdfunding campaign on Crowdfunder.co.uk'],
        apply_url:            url, raw_data: {} as Record<string, unknown>,
      })
    })
    if (grants.length === 0) return await upsertGrants(SOURCE, [{
      external_id: `${SOURCE}_main`, source: SOURCE,
      title: 'Crowdfunder UK — Community Match Funds',
      funder: 'Crowdfunder UK', funder_type: 'crowdfund_match',
      description: 'Crowdfunder UK hosts a range of match funds where councils, NHS bodies, corporates and foundations pledge to top up every pound raised through a public crowdfunding campaign. Match funds are typically 50–100% top-ups, capped per project. Ideal for community groups, charities and social enterprises that want to amplify fundraising while proving public appetite for their idea.',
      amount_min: 500, amount_max: 50000, deadline: null, is_rolling: true, is_local: false,
      sectors: ['community', 'social enterprise', 'arts', 'sport', 'environment', 'health'],
      eligibility_criteria: ['UK-based community groups, charities, social enterprises and CICs', 'Must run a public crowdfunding campaign on Crowdfunder.co.uk', 'Specific match funds have additional criteria — check individual fund pages'],
      apply_url: 'https://www.crowdfunder.co.uk/funds', raw_data: {} as Record<string, unknown>,
    }])
    return await upsertGrants(SOURCE, grants.slice(0, 10))
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ── Source 130 — Spacehive ────────────────────────────────────────────────────
async function crawlSpacehive(): Promise<CrawlResult> {
  const SOURCE = 'spacehive'
  try {
    return await upsertGrants(SOURCE, [{
      external_id: `${SOURCE}_main`, source: SOURCE,
      title: 'Spacehive — Civic Crowdfunding with Council Match',
      funder: 'Spacehive', funder_type: 'crowdfund_match',
      description: 'Spacehive is a civic crowdfunding platform where community projects raise public money and unlock match pledges from local councils, businesses and foundations. Projects fund physical improvements like parks, playgrounds and community spaces. Match funds from partner councils can contribute up to £50,000 per project on top of public pledges.',
      amount_min: 1000, amount_max: 50000, deadline: null, is_rolling: true, is_local: true,
      sectors: ['community', 'environment', 'sport', 'arts', 'public space', 'local'],
      eligibility_criteria: ['UK community groups, local charities and social enterprises', 'Projects must improve a specific place or community space', 'Must be willing to run a public crowdfunding campaign'],
      apply_url: 'https://www.spacehive.com', raw_data: {} as Record<string, unknown>,
    }])
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ── Source 131 — Localgiving Match Funding ────────────────────────────────────
async function crawlLocalgivingMatch(): Promise<CrawlResult> {
  const SOURCE = 'localgiving_match'
  try {
    return await upsertGrants(SOURCE, [{
      external_id: `${SOURCE}_main`, source: SOURCE,
      title: 'Localgiving — Charity Match Funding Rounds',
      funder: 'Localgiving', funder_type: 'crowdfund_match',
      description: 'Localgiving runs periodic matched crowdfunding rounds where donations to registered charities on the platform are matched by corporate and foundation partners. Rounds typically run for 24–48 hours and match donations up to a set cap (often £250–£2,500 per charity). Localgiving focuses on small, local charities and community groups.',
      amount_min: 500, amount_max: 10000, deadline: null, is_rolling: false, is_local: false,
      sectors: ['community', 'charity', 'local', 'health', 'arts', 'environment'],
      eligibility_criteria: ['Registered charities based in the UK', 'Must have an active Localgiving profile', 'Priority for small charities with income under £1 million'],
      apply_url: 'https://localgiving.org/information/match-funding', raw_data: {} as Record<string, unknown>,
    }])
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ── Source 132 — Community Shares Unit ────────────────────────────────────────
async function crawlCommunityShares(): Promise<CrawlResult> {
  const SOURCE = 'community_shares'
  try {
    return await upsertGrants(SOURCE, [{
      external_id: `${SOURCE}_main`, source: SOURCE,
      title: 'Community Shares — Booster Fund & Community Share Offers',
      funder: 'Community Shares Unit', funder_type: 'crowdfund_match',
      description: 'Community Shares enables community businesses, co-operatives and social enterprises to raise capital by selling withdrawable shares to the public. The Community Shares Booster Fund provides grants of up to £10,000 to help organisations develop and launch share offers. Community share offers typically raise £50,000–£2 million from hundreds of local investors.',
      amount_min: 10000, amount_max: 2000000, deadline: null, is_rolling: true, is_local: false,
      sectors: ['community', 'social enterprise', 'co-operative', 'local', 'environment', 'food'],
      eligibility_criteria: ['Community businesses, co-operatives and social enterprises', 'Based in the UK', 'Booster Fund: must be developing a new community share offer', 'Industrial and provident societies (IPS) or community benefit societies preferred'],
      apply_url: 'https://communityshares.org.uk/resources/booster-fund', raw_data: {} as Record<string, unknown>,
    }])
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ── Batch definitions ─────────────────────────────────────────────────────────
// Sources are grouped into 3 batches so each cron invocation handles ~15 sources.
// Batch 1: core nationals + first CFs
// Batch 2: corporate funders + mid CFs
// Batch 3: Session-4b CFs + foundations

type BatchNum = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9

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
  'jrct', 'peoples_health_trust',
  'national_churches_trust', 'tudor_trust', 'ufi_voctech',
] as const

// Batch 4: new community foundations + major national funders (06:15)
const BATCH_4_SOURCES = [
  'devon_cf', 'leeds_cf', 'essex_cf', 'bedfordshire_cf', 'durham_cf',
  'cumbria_cf', 'derbyshire_cf', 'staffs_cf', 'berkshire_cf',
  'lloyds_bank_foundation', 'power_to_change', 'kings_trust',
  'barrow_cadbury', 'jrf', 'access_foundation',
  'comic_relief', 'community_ownership_fund', 'creative_scotland',
] as const

// Batch 5: more CFs + regional arts/sport bodies (06:20)
const BATCH_5_SOURCES = [
  'south_yorkshire_cf', 'cornwall_cf', 'east_end_cf', 'northants_cf',
  'birmingham_cf', 'dorset_cf',
  'sport_wales', 'arts_council_wales',
  'wolfson_foundation', 'pilgrim_trust', 'rosa_uk', 'coop_foundation',
] as const

// Batch 6: major national funders + corporate/landfill (06:25)
const BATCH_6_SOURCES = [
  'wellcome_trust', 'nesta', 'dulverton_trust', 'blagrave_trust',
  'rank_foundation', 'cadent_foundation', 'severn_trent_fund',
  'tesco_bags_of_help', 'veolia_environmental_trust', 'biffa_award',
  'santander_foundation', 'screwfix_foundation',
] as const

// Batch 7: innovation/lottery + more CFs + specialist national funders (06:30)
const BATCH_7_SOURCES = [
  'innovate_uk', 'humber_cf', 'worcestershire_cf', 'sport_scotland',
  'foyle_foundation', 'ernest_cook_trust', 'coalfields_regen', 'local_trust',
  'armed_forces_covenant', 'british_gas_energy_trust', 'postcode_lottery_trust',
  'architectural_heritage_fund', 'persimmon_foundation',
] as const

// Batch 8: heritage/retail/environment/health national funders (06:35)
const BATCH_8_SOURCES = [
  'historic_england', 'john_lewis_foundation', 'marks_spencer_foundation', 'uk_spf',
  'farming_protected_landscapes', 'esmee_fairbairn_collections', 'edf_community_fund',
  'nhs_charities_together', 'groundwork_uk', 'aldi_foundation',
  'waitrose_community_matters', 'teenage_cancer_trust', 'active_travel_england',
] as const

// Batch 9: alternative funding routes — competitions, social loans, matched crowdfunding (06:40)
const BATCH_9_SOURCES = [
  'unltd', 'sse_fellowships', 'nesta_challenges', 'nominet_tech_for_good',
  'key_fund', 'fredericks_foundation', 'social_investment_business', 'big_issue_invest',
  'crowdfunder_match', 'spacehive', 'localgiving_match', 'community_shares',
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
  if (batch === 4) include = new Set(BATCH_4_SOURCES)
  if (batch === 5) include = new Set(BATCH_5_SOURCES)
  if (batch === 6) include = new Set(BATCH_6_SOURCES)
  if (batch === 7) include = new Set(BATCH_7_SOURCES)
  if (batch === 8) include = new Set(BATCH_8_SOURCES)
  if (batch === 9) include = new Set(BATCH_9_SOURCES)

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
    jrct, peoplesHealthTrust,
    nationalChurchesTrust, tudorTrust, ufiVocTech,
    // Batch 4
    devonCF, leedsCF, essexCF, bedfordshireCF, durhamCF,
    cumbriaCF, derbyshireCF, staffsCF, berkshireCF,
    lloydsBankFoundation, powerToChange, kingsTrust,
    barrowCadbury, jrf, accessFoundation,
    comicRelief, communityOwnershipFund, creativeScotland,
    // Batch 5
    southYorkshireCF, cornwallCF, eastEndCF, northantsCF,
    birminghamCF, dorsetCF, sportWales, artsCouncilWales,
    wolfsonFoundation, pilgrimTrust, rosaUK, coOpFoundation,
    // Batch 6
    wellcomeTrust, nesta, dulvertonTrust, blagraveTrust,
    rankFoundation, cadentFoundation, severnTrentFund,
    tescoBagsOfHelp, veoliaEnvTrust, biffaAward,
    santanderFoundation, screwfixFoundation,
    // Batch 7
    innovateUK, humberCF, worcestershireCF, sportScotland,
    foyleFoundation, ernestCookTrust, coalfieldsRegen, localTrust,
    armedForcesCovenant, britishGasEnergyTrust, postcodeLotteryTrust,
    architecturalHeritageFund, persimmonFoundation,
    // Batch 8
    historicEngland, johnLewisFoundation, mAndSFoundation, ukSPF,
    farmingProtectedLandscapes, esmeeFairbairnCollections, edfEnergyCommunityFund,
    nhsCharitiesTogether, groundworkUK, aldiFoundation,
    waitroseCommunityMatters, teenageCancerTrust, activeTravelEngland,
    // Batch 9
    unltd, sseFellowships, nestaChallenges, nominetTechForGood,
    keyFund, fredericksFoundation, socialInvestmentBusiness, bigIssueInvest,
    crowdfunderMatch, spacehive, localgivingMatch, communityShares,
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
    run('peoples_health_trust',    crawlPeoplesHealthTrust),
    run('national_churches_trust', crawlNationalChurchesTrust),
    run('tudor_trust',             crawlTudorTrust),
    run('ufi_voctech',             crawlUfiVocTech),
    // Batch 4
    run('devon_cf',                crawlDevonCF),
    run('leeds_cf',                crawlLeedsCF),
    run('essex_cf',                crawlEssexCF),
    run('bedfordshire_cf',         crawlBedfordshireCF),
    run('durham_cf',               crawlDurhamCF),
    run('cumbria_cf',              crawlCumbriaCF),
    run('derbyshire_cf',           crawlDerbyshireCF),
    run('staffs_cf',               crawlStaffsCF),
    run('berkshire_cf',            crawlBerkshireCF),
    run('lloyds_bank_foundation',  crawlLloydsBankFoundation),
    run('power_to_change',         crawlPowerToChange),
    run('kings_trust',             crawlKingsTrust),
    run('barrow_cadbury',          crawlBarrowCadbury),
    run('jrf',                     crawlJRF),
    run('access_foundation',       crawlAccessFoundation),
    run('comic_relief',            crawlComicRelief),
    run('community_ownership_fund', crawlCommunityOwnershipFund),
    run('creative_scotland',       crawlCreativeScotland),
    // Batch 5
    run('south_yorkshire_cf',      crawlSouthYorkshireCF),
    run('cornwall_cf',             crawlCornwallCF),
    run('east_end_cf',             crawlEastEndCF),
    run('northants_cf',            crawlNorthantsCF),
    run('birmingham_cf',           crawlBirminghamCF),
    run('dorset_cf',               crawlDorsetCF),
    run('sport_wales',             crawlSportWales),
    run('arts_council_wales',      crawlArtsCouncilWales),
    run('wolfson_foundation',      crawlWolfsonFoundation),
    run('pilgrim_trust',           crawlPilgrimTrust),
    run('rosa_uk',                 crawlRosaUK),
    run('coop_foundation',         crawlCoOpFoundation),
    // Batch 6
    run('wellcome_trust',          crawlWellcomeTrust),
    run('nesta',                   crawlNesta),
    run('dulverton_trust',         crawlDulvertonTrust),
    run('blagrave_trust',          crawlBlagraveTrust),
    run('rank_foundation',         crawlRankFoundation),
    run('cadent_foundation',       crawlCadentFoundation),
    run('severn_trent_fund',       crawlSevernTrentFund),
    run('tesco_bags_of_help',      crawlTescoBagsOfHelp),
    run('veolia_environmental_trust', crawlVeoliaEnvTrust),
    run('biffa_award',             crawlBiffaAward),
    run('santander_foundation',    crawlSantanderFoundation),
    run('screwfix_foundation',     crawlScrewfixFoundation),
    // Batch 7
    run('innovate_uk',                  crawlInnovateUK),
    run('humber_cf',                    crawlHumberCF),
    run('worcestershire_cf',            crawlWorcestershireCF),
    run('sport_scotland',               crawlSportScotland),
    run('foyle_foundation',             crawlFoyleFoundation),
    run('ernest_cook_trust',            crawlErnestCookTrust),
    run('coalfields_regen',             crawlCoalfieldsRegen),
    run('local_trust',                  crawlLocalTrust),
    run('armed_forces_covenant',        crawlArmedForcesCovenant),
    run('british_gas_energy_trust',     crawlBritishGasEnergyTrust),
    run('postcode_lottery_trust',       crawlPostcodeLotteryTrust),
    run('architectural_heritage_fund',  crawlArchitecturalHeritageFund),
    run('persimmon_foundation',         crawlPersimmonFoundation),
    // Batch 8
    run('historic_england',             crawlHistoricEngland),
    run('john_lewis_foundation',        crawlJohnLewisFoundation),
    run('marks_spencer_foundation',     crawlMAndSFoundation),
    run('uk_spf',                       crawlUKSPF),
    run('farming_protected_landscapes', crawlFarmingProtectedLandscapes),
    run('esmee_fairbairn_collections',  crawlEsmeeFairbairnCollections),
    run('edf_community_fund',           crawlEDFEnergyCommunityFund),
    run('nhs_charities_together',       crawlNHSCharitiesTogether),
    run('groundwork_uk',                crawlGroundworkUK),
    run('aldi_foundation',              crawlAldiFoundation),
    run('waitrose_community_matters',   crawlWaitroseCommunityMatters),
    run('teenage_cancer_trust',         crawlTeenageCancerTrust),
    run('active_travel_england',        crawlActiveTravelEngland),
    // Batch 9
    run('unltd',                        crawlUnLtd),
    run('sse_fellowships',              crawlSSEFellowships),
    run('nesta_challenges',             crawlNestaChallenges),
    run('nominet_tech_for_good',        crawlNominetTechForGood),
    run('key_fund',                     crawlKeyFund),
    run('fredericks_foundation',        crawlFredericksFoundation),
    run('social_investment_business',   crawlSocialInvestmentBusiness),
    run('big_issue_invest',             crawlBigIssueInvest),
    run('crowdfunder_match',            crawlCrowdfunderMatch),
    run('spacehive',                    crawlSpacehive),
    run('localgiving_match',            crawlLocalgivingMatch),
    run('community_shares',             crawlCommunityShares),
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
    peoplesHealthTrust.status     === 'fulfilled' ? peoplesHealthTrust.value     : fallback('peoples_health_trust'),
    nationalChurchesTrust.status  === 'fulfilled' ? nationalChurchesTrust.value  : fallback('national_churches_trust'),
    tudorTrust.status             === 'fulfilled' ? tudorTrust.value             : fallback('tudor_trust'),
    ufiVocTech.status             === 'fulfilled' ? ufiVocTech.value             : fallback('ufi_voctech'),
    // Batch 4
    devonCF.status                === 'fulfilled' ? devonCF.value                : fallback('devon_cf'),
    leedsCF.status                === 'fulfilled' ? leedsCF.value                : fallback('leeds_cf'),
    essexCF.status                === 'fulfilled' ? essexCF.value                : fallback('essex_cf'),
    bedfordshireCF.status         === 'fulfilled' ? bedfordshireCF.value         : fallback('bedfordshire_cf'),
    durhamCF.status               === 'fulfilled' ? durhamCF.value               : fallback('durham_cf'),
    cumbriaCF.status              === 'fulfilled' ? cumbriaCF.value              : fallback('cumbria_cf'),
    derbyshireCF.status           === 'fulfilled' ? derbyshireCF.value           : fallback('derbyshire_cf'),
    staffsCF.status               === 'fulfilled' ? staffsCF.value               : fallback('staffs_cf'),
    berkshireCF.status            === 'fulfilled' ? berkshireCF.value            : fallback('berkshire_cf'),
    lloydsBankFoundation.status   === 'fulfilled' ? lloydsBankFoundation.value   : fallback('lloyds_bank_foundation'),
    powerToChange.status          === 'fulfilled' ? powerToChange.value          : fallback('power_to_change'),
    kingsTrust.status             === 'fulfilled' ? kingsTrust.value             : fallback('kings_trust'),
    barrowCadbury.status          === 'fulfilled' ? barrowCadbury.value          : fallback('barrow_cadbury'),
    jrf.status                    === 'fulfilled' ? jrf.value                    : fallback('jrf'),
    accessFoundation.status       === 'fulfilled' ? accessFoundation.value       : fallback('access_foundation'),
    comicRelief.status            === 'fulfilled' ? comicRelief.value            : fallback('comic_relief'),
    communityOwnershipFund.status === 'fulfilled' ? communityOwnershipFund.value : fallback('community_ownership_fund'),
    creativeScotland.status       === 'fulfilled' ? creativeScotland.value       : fallback('creative_scotland'),
    // Batch 5
    southYorkshireCF.status       === 'fulfilled' ? southYorkshireCF.value       : fallback('south_yorkshire_cf'),
    cornwallCF.status             === 'fulfilled' ? cornwallCF.value             : fallback('cornwall_cf'),
    eastEndCF.status              === 'fulfilled' ? eastEndCF.value              : fallback('east_end_cf'),
    northantsCF.status            === 'fulfilled' ? northantsCF.value            : fallback('northants_cf'),
    birminghamCF.status           === 'fulfilled' ? birminghamCF.value           : fallback('birmingham_cf'),
    dorsetCF.status               === 'fulfilled' ? dorsetCF.value               : fallback('dorset_cf'),
    sportWales.status             === 'fulfilled' ? sportWales.value             : fallback('sport_wales'),
    artsCouncilWales.status       === 'fulfilled' ? artsCouncilWales.value       : fallback('arts_council_wales'),
    wolfsonFoundation.status      === 'fulfilled' ? wolfsonFoundation.value      : fallback('wolfson_foundation'),
    pilgrimTrust.status           === 'fulfilled' ? pilgrimTrust.value           : fallback('pilgrim_trust'),
    rosaUK.status                 === 'fulfilled' ? rosaUK.value                 : fallback('rosa_uk'),
    coOpFoundation.status         === 'fulfilled' ? coOpFoundation.value         : fallback('coop_foundation'),
    // Batch 6
    wellcomeTrust.status          === 'fulfilled' ? wellcomeTrust.value          : fallback('wellcome_trust'),
    nesta.status                  === 'fulfilled' ? nesta.value                  : fallback('nesta'),
    dulvertonTrust.status         === 'fulfilled' ? dulvertonTrust.value         : fallback('dulverton_trust'),
    blagraveTrust.status          === 'fulfilled' ? blagraveTrust.value          : fallback('blagrave_trust'),
    rankFoundation.status         === 'fulfilled' ? rankFoundation.value         : fallback('rank_foundation'),
    cadentFoundation.status       === 'fulfilled' ? cadentFoundation.value       : fallback('cadent_foundation'),
    severnTrentFund.status        === 'fulfilled' ? severnTrentFund.value        : fallback('severn_trent_fund'),
    tescoBagsOfHelp.status        === 'fulfilled' ? tescoBagsOfHelp.value        : fallback('tesco_bags_of_help'),
    veoliaEnvTrust.status         === 'fulfilled' ? veoliaEnvTrust.value         : fallback('veolia_environmental_trust'),
    biffaAward.status             === 'fulfilled' ? biffaAward.value             : fallback('biffa_award'),
    santanderFoundation.status    === 'fulfilled' ? santanderFoundation.value    : fallback('santander_foundation'),
    screwfixFoundation.status     === 'fulfilled' ? screwfixFoundation.value     : fallback('screwfix_foundation'),
    // Batch 7
    innovateUK.status                 === 'fulfilled' ? innovateUK.value                 : fallback('innovate_uk'),
    humberCF.status                   === 'fulfilled' ? humberCF.value                   : fallback('humber_cf'),
    worcestershireCF.status           === 'fulfilled' ? worcestershireCF.value           : fallback('worcestershire_cf'),
    sportScotland.status              === 'fulfilled' ? sportScotland.value              : fallback('sport_scotland'),
    foyleFoundation.status            === 'fulfilled' ? foyleFoundation.value            : fallback('foyle_foundation'),
    ernestCookTrust.status            === 'fulfilled' ? ernestCookTrust.value            : fallback('ernest_cook_trust'),
    coalfieldsRegen.status            === 'fulfilled' ? coalfieldsRegen.value            : fallback('coalfields_regen'),
    localTrust.status                 === 'fulfilled' ? localTrust.value                 : fallback('local_trust'),
    armedForcesCovenant.status        === 'fulfilled' ? armedForcesCovenant.value        : fallback('armed_forces_covenant'),
    britishGasEnergyTrust.status      === 'fulfilled' ? britishGasEnergyTrust.value      : fallback('british_gas_energy_trust'),
    postcodeLotteryTrust.status       === 'fulfilled' ? postcodeLotteryTrust.value       : fallback('postcode_lottery_trust'),
    architecturalHeritageFund.status  === 'fulfilled' ? architecturalHeritageFund.value  : fallback('architectural_heritage_fund'),
    persimmonFoundation.status        === 'fulfilled' ? persimmonFoundation.value        : fallback('persimmon_foundation'),
    // Batch 8
    historicEngland.status            === 'fulfilled' ? historicEngland.value            : fallback('historic_england'),
    johnLewisFoundation.status        === 'fulfilled' ? johnLewisFoundation.value        : fallback('john_lewis_foundation'),
    mAndSFoundation.status            === 'fulfilled' ? mAndSFoundation.value            : fallback('marks_spencer_foundation'),
    ukSPF.status                      === 'fulfilled' ? ukSPF.value                      : fallback('uk_spf'),
    farmingProtectedLandscapes.status === 'fulfilled' ? farmingProtectedLandscapes.value : fallback('farming_protected_landscapes'),
    esmeeFairbairnCollections.status  === 'fulfilled' ? esmeeFairbairnCollections.value  : fallback('esmee_fairbairn_collections'),
    edfEnergyCommunityFund.status     === 'fulfilled' ? edfEnergyCommunityFund.value     : fallback('edf_community_fund'),
    nhsCharitiesTogether.status       === 'fulfilled' ? nhsCharitiesTogether.value       : fallback('nhs_charities_together'),
    groundworkUK.status               === 'fulfilled' ? groundworkUK.value               : fallback('groundwork_uk'),
    aldiFoundation.status             === 'fulfilled' ? aldiFoundation.value             : fallback('aldi_foundation'),
    waitroseCommunityMatters.status   === 'fulfilled' ? waitroseCommunityMatters.value   : fallback('waitrose_community_matters'),
    teenageCancerTrust.status         === 'fulfilled' ? teenageCancerTrust.value         : fallback('teenage_cancer_trust'),
    activeTravelEngland.status        === 'fulfilled' ? activeTravelEngland.value        : fallback('active_travel_england'),
    // Batch 9
    unltd.status                      === 'fulfilled' ? unltd.value                      : fallback('unltd'),
    sseFellowships.status             === 'fulfilled' ? sseFellowships.value             : fallback('sse_fellowships'),
    nestaChallenges.status            === 'fulfilled' ? nestaChallenges.value            : fallback('nesta_challenges'),
    nominetTechForGood.status         === 'fulfilled' ? nominetTechForGood.value         : fallback('nominet_tech_for_good'),
    keyFund.status                    === 'fulfilled' ? keyFund.value                    : fallback('key_fund'),
    fredericksFoundation.status       === 'fulfilled' ? fredericksFoundation.value       : fallback('fredericks_foundation'),
    socialInvestmentBusiness.status   === 'fulfilled' ? socialInvestmentBusiness.value   : fallback('social_investment_business'),
    bigIssueInvest.status             === 'fulfilled' ? bigIssueInvest.value             : fallback('big_issue_invest'),
    crowdfunderMatch.status           === 'fulfilled' ? crowdfunderMatch.value           : fallback('crowdfunder_match'),
    spacehive.status                  === 'fulfilled' ? spacehive.value                  : fallback('spacehive'),
    localgivingMatch.status           === 'fulfilled' ? localgivingMatch.value           : fallback('localgiving_match'),
    communityShares.status            === 'fulfilled' ? communityShares.value            : fallback('community_shares'),
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
