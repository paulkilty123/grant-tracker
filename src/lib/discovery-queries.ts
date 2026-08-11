// Shared discovery query constants — importable by both the API route and client components

export type DiscoveryFundingType = 'corporate' | 'social_investment' | 'programme' | 'in_kind'

/**
 * The rotation, five queries per category.
 *
 * These map onto the catalogue's four funding types: corporate → grant,
 * social_investment → investment, programme → programme, in_kind → in_kind.
 *
 * `in_kind` was added on 2026-08-11 and had no queries before that. The
 * catalogue carried 50 live in-kind rows, all of them from scrapers or entered
 * by hand, and the only job whose purpose is finding funders nobody has
 * catalogued had never once searched for one. Non-grant breadth is a stated
 * differentiator, so a category with zero discovery coverage was a hole in the
 * thing the product is meant to be good at.
 */
export const DEFAULT_QUERIES: Record<DiscoveryFundingType, string[]> = {
  corporate: [
    'UK corporate foundation grants charities CICs 2025 2026 open applications',
    'UK CSR programme funding social enterprises community organisations apply now',
    'FTSE100 company community grants UK charities open applications',
    'UK corporate social responsibility fund social enterprise apply 2026',
    'UK business foundation grants community groups open round',
  ],
  social_investment: [
    'UK social investment patient capital charities CICs apply 2025 2026',
    'blended finance social enterprise UK loan equity hybrid funding open',
    'community development finance institution CDFI loan UK social enterprise apply',
    'UK social impact fund outcomes-based finance charity apply',
    'impact investing UK charity CIC convertible loan grant blend open',
  ],
  programme: [
    'UK accelerator incubator social enterprise charity cohort 2025 2026 apply',
    'fellowship programme UK social entrepreneurs charity leaders open applications',
    'capacity building programme UK charities CICs funding support 2026',
    'UK social enterprise support programme mentoring funding apply now',
    'charity incubator accelerator UK open applications cohort 2026',
  ],
  in_kind: [
    'UK pro bono support charities CICs legal accounting marketing donated',
    'free software licences nonprofits UK charities donated technology apply',
    'corporate volunteering skills-based support UK charities apply now',
    'donated goods equipment furniture UK charities community groups apply',
    'free meeting space venue hire UK charities community organisations offer',
  ],
}

/**
 * Funders whose own sites block us, so a web search is the only route in.
 *
 * artscouncil.org.uk and london.gov.uk return 403 to every non-browser fetch and
 * their scrapers were retired on 2026-07-26; arts.wales blocks its archived
 * funding path. Passed as the search tool's `allowed_domains` so a routine sweep
 * still covers them.
 *
 * This is the sanctioned route, not a workaround. Arts Council's robots.txt says
 * "Content-Signal: search=yes, use=reference" with "Allow: /" — a reference
 * directory is a permitted use. A web search reads search-engine results, never
 * their WAF-protected pages, which is why this is appropriate where a reader
 * proxy would not have been (they separately disallow rendering crawlers).
 */
export const BLOCKED_FUNDER_DOMAINS = ['artscouncil.org.uk', 'london.gov.uk', 'arts.wales']

/** One targeted query per blocked funder, for the routine sweep. */
export const BLOCKED_FUNDER_QUERIES: { query: string; domains: string[] }[] = [
  { query: 'Arts Council England open funds for organisations apply now', domains: ['artscouncil.org.uk'] },
  { query: 'Greater London Authority funding programmes open for applications community organisations', domains: ['london.gov.uk'] },
]
