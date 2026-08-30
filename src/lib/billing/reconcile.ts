// Does what we have BILLED match what we have GRANTED?
//
// The webhook and the database trigger are supposed to keep these in step, so
// in a healthy system this finds nothing. That is the point: the day it finds
// something, something has bypassed the mechanism, and the alternative to
// finding it here is finding it in a customer's email.
//
// ─────────────────────────────────────────────────────────────────────────────
// THIS FUNCTION IS ALSO THE DRIFT DETECTOR BETWEEN SQL AND TYPESCRIPT
//
// The entitling rule exists twice: in `subscription_grants_apply()` in
// migration 069, which is what actually sets access, and in `isEntitling()`
// below, which is what this check believes. Two copies of one rule will
// eventually disagree.
//
// That is deliberate rather than sloppy. A reconciliation that asked the
// database to check itself would agree with the database by construction and
// could never catch a wrong rule — only a failed write. Restating the rule
// independently means a divergence between them shows up here as a mismatch,
// which is exactly what we want to hear about. If this ever reports mismatches
// that look correct on inspection, suspect the two rules first.

/** Plans and statuses that grant Apply-tier access. Mirrors migration 069. */
const ENTITLING_PLANS = new Set(['apply', 'team'])
const ENTITLING_STATUSES = new Set(['trialing', 'active', 'past_due'])

export function isEntitling(plan: string, status: string): boolean {
  return ENTITLING_PLANS.has(plan) && ENTITLING_STATUSES.has(status)
}

/**
 * Is a granted period still running?
 *
 * Postgres `timestamptz` has two values JavaScript cannot parse: 'infinity' and
 * '-infinity'. `new Date('infinity')` is an Invalid Date, and EVERY comparison
 * with an Invalid Date is false — so a permanent comp silently reads as "no
 * grant", with no error and no NaN visible anywhere.
 *
 * That is not hypothetical. The first run of this check against production
 * reported eleven mismatches, and they were exactly the eleven permanent
 * grants: Paul's own organisations, the reviewer demo and the MCP fixtures. A
 * daily job crying wolf eleven times is a daily job nobody reads by Thursday.
 *
 * It is also precisely the drift this module's own header predicted, in the
 * direction I did not expect: the SQL rule handles infinity correctly and the
 * TypeScript restatement did not. The check caught its own author.
 */
export function grantIsLive(until: string | null, now: Date): { live: boolean; unparseable: boolean } {
  if (until === null) return { live: false, unparseable: false }
  if (until === 'infinity')  return { live: true,  unparseable: false }
  if (until === '-infinity') return { live: false, unparseable: false }
  const d = new Date(until)
  if (Number.isNaN(d.getTime())) {
    // Do NOT quietly treat this as "no grant" — that is the bug above wearing a
    // different hat. Surface it and name the value.
    return { live: false, unparseable: true }
  }
  return { live: d > now, unparseable: false }
}

export interface SubRow { owner_id: string; plan: string; status: string; stripe_subscription_id: string | null }
export interface OrgRow { id: string; owner_id: string; name: string | null; apply_access: boolean; granted_access_until: string | null }

export type MismatchKind =
  /** They are paying and nothing of theirs is entitled. The expensive one. */
  | 'paid_without_access'
  /** Entitled with neither a grant nor a paying subscription behind it. */
  | 'access_without_basis'
  /** A subscription whose owner holds no organisation at all. */
  | 'subscriber_without_organisation'

export interface Mismatch {
  kind: MismatchKind
  owner_id: string
  org_id: string | null
  detail: string
}

export function findMismatches(
  subs: SubRow[],
  orgs: OrgRow[],
  now: Date = new Date(),
): Mismatch[] {
  const out: Mismatch[] = []
  const byOwner = new Map<string, OrgRow[]>()
  for (const o of orgs) {
    const list = byOwner.get(o.owner_id) ?? []
    list.push(o)
    byOwner.set(o.owner_id, list)
  }
  const subByOwner = new Map(subs.map(s => [s.owner_id, s]))

  for (const sub of subs) {
    if (!isEntitling(sub.plan, sub.status)) continue
    const owned = byOwner.get(sub.owner_id) ?? []

    if (owned.length === 0) {
      // Paying with nowhere for the access to land. Happens if somebody buys
      // before finishing onboarding, and it is silent from every direction.
      out.push({
        kind: 'subscriber_without_organisation',
        owner_id: sub.owner_id,
        org_id: null,
        detail: `${sub.plan}/${sub.status} subscription ${sub.stripe_subscription_id ?? '(no id)'} but the owner holds no organisation`,
      })
      continue
    }

    if (!owned.some(o => o.apply_access)) {
      out.push({
        kind: 'paid_without_access',
        owner_id: sub.owner_id,
        org_id: owned[0].id,
        detail: `${sub.plan}/${sub.status} subscription but none of ${owned.length} organisation(s) has apply_access`,
      })
    }
  }

  for (const org of orgs) {
    if (!org.apply_access) continue
    const grant = grantIsLive(org.granted_access_until, now)
    if (grant.live) continue
    const sub = subByOwner.get(org.owner_id)
    if (sub && isEntitling(sub.plan, sub.status)) continue

    out.push({
      kind: 'access_without_basis',
      owner_id: org.owner_id,
      org_id: org.id,
      detail: grant.unparseable
        ? `${org.name ?? org.id} has apply_access and an unreadable granted_access_until (${org.granted_access_until})`
        : `${org.name ?? org.id} has apply_access with no unexpired grant and no entitling subscription`,
    })
  }

  return out
}
