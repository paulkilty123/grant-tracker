/**
 * Is a sidebar link the current one?
 *
 * A nav item stays highlighted on its own sub-pages (a grant detail page keeps
 * "Catalogue" lit), which means a plain `pathname.startsWith(href)` looks right
 * until two links share a prefix. Adding "Feedback triage" alongside "Match
 * Feedback" did exactly that: /dashboard/admin/feedback-triage starts with
 * /dashboard/admin/feedback, so both lit up at once.
 *
 * The fix is to require a path-segment boundary. "feedback-triage" is not
 * inside "feedback/", so it no longer counts as a sub-page of it.
 *
 * `exactOnly` covers the roots that everything else sits under: /dashboard and
 * /dashboard/admin would otherwise be permanently active.
 */
export function isNavActive(
  pathname: string,
  href: string,
  exactOnly: readonly string[] = ['/dashboard', '/dashboard/admin'],
): boolean {
  if (pathname === href) return true
  if (exactOnly.includes(href)) return false
  return pathname.startsWith(`${href}/`)
}
