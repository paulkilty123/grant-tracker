// The Shoots landing page, and the switch that puts it in front of people.
//
// The page itself ships as a static document at public/landing/index.html: it
// arrived as a finished, hand-tuned HTML file and converting 1,000 lines of
// bespoke CSS and four inline scripts into JSX would risk visual regressions
// on the one surface that has to look right on launch day. Only two things
// were changed on the way in — the inline base64 images were extracted to
// public/landing/, and the four canonical/og/twitter tags moved off the .com
// domain. The noindex meta is deliberately untouched and stays until the flip.
//
// Gated on LANDING_CUTOVER, off by default, so merging this changes nothing a
// visitor to granttracker.co.uk can see. Same shape as MCP_RETIRED_HOSTS: the
// code ships inert, and the flip is an environment change rather than a
// deploy. That matters here because the landing page and the MCP identity have
// to move together — a visitor arriving from the Anthropic directory should
// not find one brand at the front door and another at the protocol endpoint.

/** Where the ported landing document lives under public/. */
export const LANDING_DOCUMENT = '/landing/index.html'

/**
 * Is the Shoots landing page live?
 *
 * Read at request time rather than module load so a Vercel env change takes
 * effect on the next request without a redeploy — the flip is meant to be
 * reversible in seconds if the page misbehaves under real traffic.
 */
export function isLandingCutoverOn(): boolean {
  return process.env.LANDING_CUTOVER?.trim().toLowerCase() === 'true'
}

/**
 * Should this request be served the new landing page instead of the current
 * one, or null to let it through untouched?
 *
 * Only the site root qualifies, and only for a logged-out visitor: a signed-in
 * user hitting `/` is bounced to /dashboard by the root page, and rewriting
 * before that would strand them on a marketing page with no way back in.
 *
 * Pure function of (pathname, signed-in, flag) so the routing decision can be
 * exercised without standing up a request pipeline.
 */
export function landingCutoverTarget(pathname: string, isSignedIn: boolean): string | null {
  if (pathname !== '/') return null
  if (isSignedIn) return null
  if (!isLandingCutoverOn()) return null
  return LANDING_DOCUMENT
}
