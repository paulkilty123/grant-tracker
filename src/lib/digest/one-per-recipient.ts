/**
 * One digest per person, not per organisation.
 *
 * The job iterated organisations, and 34 organisations with alerts on belong to
 * 23 people. A broadcast would have put seven emails in one inbox at once and
 * five in another — the worst possible first impression, delivered on the one
 * surface with no undo.
 *
 * WHICH organisation wins, when somebody holds several:
 *
 *   1. Most engagement — pipeline items plus saved grants. The digest is a
 *      report on work in progress, so the record carrying the work is the one
 *      worth writing about. An empty duplicate never beats a used one.
 *   2. Oldest, as the tie-break. That matches what the app already does when it
 *      has no active-org cookie to go on (getOrganisationsByOwner orders by
 *      created_at), so the email is about the organisation somebody landing in
 *      the app would see first.
 *
 * The cookie itself is unavailable here — a cron has no session — which is
 * exactly why this needs a rule rather than a lookup.
 *
 * Deliberately NOT merging several organisations into one email. Two records
 * are two pipelines with two sets of deadlines, and interleaving them would
 * produce a digest that belongs to nobody. One is chosen and the rest are
 * reported as suppressed, so the choice is visible rather than silent.
 */

export interface RecipientOrg {
  id: string
  name: string
  created_at: string
  owner_email: string
}

export interface Suppressed {
  to: string
  org: string
  inFavourOf: string
}

export function oneOrgPerRecipient<T extends RecipientOrg>(
  orgs: T[],
  /** org id → engagement score. Missing means zero. */
  engagement: Map<string, number>,
): { chosen: T[]; suppressed: Suppressed[] } {
  const byRecipient = new Map<string, T[]>()
  for (const o of orgs) {
    const key = o.owner_email.trim().toLowerCase()
    const list = byRecipient.get(key)
    if (list) list.push(o)
    else byRecipient.set(key, [o])
  }

  const chosen: T[] = []
  const suppressed: Suppressed[] = []

  for (const list of Array.from(byRecipient.values())) {
    const ranked = [...list].sort((a, b) => {
      const ea = engagement.get(a.id) ?? 0
      const eb = engagement.get(b.id) ?? 0
      if (eb !== ea) return eb - ea
      return Date.parse(a.created_at) - Date.parse(b.created_at)
    })
    const [winner, ...rest] = ranked
    chosen.push(winner)
    for (const r of rest) {
      suppressed.push({ to: r.owner_email, org: r.name, inFavourOf: winner.name })
    }
  }

  return { chosen, suppressed }
}
