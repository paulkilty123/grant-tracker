// Is this apply link somewhere a fundraiser could actually apply?
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY A HOST CHECK, WHEN EVERY OTHER CHECK READS THE PAGE
//
// Four live rows pointed at Charity Commission register entries. The link
// resolves, returns 200, and serves a genuine page about the right funder, so
// every check the catalogue has said it was fine: the URL is healthy, the funder
// is named, the page is readable. A register entry states trustee counts and
// expenditure and offers no route in, and a fundraiser landing there can do
// nothing.
//
// Nothing could see it. Harford Charitable Trust was not even in the review
// queue — it carried no blocking reason at all, and was found only by sweeping
// all 961 rows for the pattern by hand. A defect nothing can detect regrows
// silently, which is why this is a check and not a one-off correction.
//
// THE TEST IS THE ONE FROM CLAUDE.md, stated as a sentence about the user:
// could a fundraiser landing here apply? Not "does the page load", not "does it
// name the funder" — both of which the register entries pass.
//
// DELIBERATELY A HOST LIST, NOT A HEURISTIC. These are registries and
// directories: a small, nameable, slow-moving set. A cleverer check would have
// to read the page and judge intent, which is the expensive and error-prone
// thing this avoids. If a host belongs here it belongs here permanently.

export type BadRouteKind = 'registry' | 'directory' | 'social' | 'document' | 'non_web'

export type BadRoute = { kind: BadRouteKind; why: string }

/**
 * Official registers. A charity's entry is a public record OF the charity, and
 * is never the way to apply TO it.
 */
const REGISTRY = [
  { re: /register-of-charities\.charitycommission\.gov\.uk|charitycommission\.gov\.uk\/.*charity-details/i,
    why: 'the Charity Commission register entry, which is a public record and not an application route' },
  { re: /oscr\.org\.uk\/(charity|about-charities)/i,
    why: 'the OSCR register entry for this charity, not its own site' },
  { re: /charitycommissionni\.org\.uk/i,
    why: 'the Charity Commission for Northern Ireland register entry' },
  { re: /find-and-update\.company-information\.service\.gov\.uk|beta\.companieshouse\.gov\.uk/i,
    why: 'a Companies House filing record' },
  { re: /grantnav\.threesixtygiving\.org/i,
    why: 'a 360Giving GrantNav record of PAST grants, not a live application route' },
]

/**
 * Third-party funding directories. Some are paywalled, some are stale, and none
 * is the funder's own page — an entry can outlive the fund it describes, which
 * is how a COVID-era Barclays fund was still catalogued via a GrantFinder
 * article that now 404s.
 */
const DIRECTORY = [
  { re: /grantfinder\.co\.uk|idoxopen4community|open4community|open4business/i,
    why: 'a third-party funding directory, not the funder' },
  { re: /fundsonline\.org\.uk|grantsonline\.org\.uk|charityexcellence\.co\.uk/i,
    why: 'a third-party funding directory, mostly paywalled' },
  { re: /fundingcentral\.org\.uk|turn2us\.org\.uk\/grants-search/i,
    why: 'an aggregator listing, not the funder' },
]

/** A social profile is a shop window, not a form. */
const SOCIAL = [
  { re: /^(https?:\/\/)?(www\.)?(linkedin\.com|facebook\.com|twitter\.com|x\.com|instagram\.com)\//i,
    why: 'a social media profile, which carries no application route' },
]

/** A file is not a page: it cannot be re-read for changes and often 404s alone. */
const DOCUMENT = [
  { re: /\.(pdf|docx?|xlsx?)(\?|$)/i, why: 'a document rather than a page, so nothing can track it changing' },
]

/**
 * What is wrong with this apply route, or null if nothing detectable is.
 *
 * Returns null for a `mailto:` — that is handled separately and can be a
 * perfectly good route (see the Paley ruling and `apply_route_accepted`).
 */
export function badApplyRoute(applyUrl: string | null | undefined): BadRoute | null {
  const u = String(applyUrl ?? '').trim()
  if (!u) return null

  if (!/^https?:\/\//i.test(u)) {
    // Not a web page. A real route for a trust that takes applications by email,
    // a defect otherwise, and only a reviewer can tell those apart.
    return { kind: 'non_web', why: 'not a web address, so it needs a ruling on whether it is the real route' }
  }
  for (const p of REGISTRY)  if (p.re.test(u)) return { kind: 'registry',  why: p.why }
  for (const p of DIRECTORY) if (p.re.test(u)) return { kind: 'directory', why: p.why }
  for (const p of SOCIAL)    if (p.re.test(u)) return { kind: 'social',    why: p.why }
  for (const p of DOCUMENT)  if (p.re.test(u)) return { kind: 'document',  why: p.why }
  return null
}
