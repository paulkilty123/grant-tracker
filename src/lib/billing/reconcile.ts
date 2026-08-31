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

export interface SubRow {
  owner_id: string
  plan: string
  status: string
  stripe_subscription_id: string | null
  /** Which organisation it pays for. Null for anything created before 076. */
  org_id: string | null
}
export interface OrgRow { id: string; owner_id: string; name: string | null; apply_access: boolean; granted_access_until: string | null }

export type MismatchKind =
  /** They are paying and the organisation they pay for is not entitled. */
  | 'paid_without_access'
  /**
   * Paying, several organisations, and the subscription names none — so the
   * SQL rule entitles nothing rather than guessing. Its own kind because the
   * fix is different: somebody has to say which organisation, and nothing is
   * broken except the missing answer.
   */
  | 'subscription_names_no_organisation'
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

    // WHICH organisation this subscription is supposed to have entitled.
    //
    // The first version of this asked whether the owner had ANY entitled
    // organisation, which is a different question and quietly the wrong one.
    // Caught live: an account holding nine organisations, seven of them
    // entitled by permanent grants, with a subscription naming none and
    // therefore entitling none. Every organisation was fine, the subscription
    // had bought nothing, and this check reported zero mismatches because it
    // found entitled organisations and stopped looking. The grants masked it.
    const target = sub.org_id
      ? owned.find(o => o.id === sub.org_id) ?? null
      : owned.length === 1 ? owned[0] : null

    if (!target) {
      if (sub.org_id) {
        out.push({
          kind: 'paid_without_access',
          owner_id: sub.owner_id,
          org_id: sub.org_id,
          detail: `${sub.plan}/${sub.status} subscription names organisation ${sub.org_id}, which this owner does not hold`,
        })
      } else {
        out.push({
          kind: 'subscription_names_no_organisation',
          owner_id: sub.owner_id,
          org_id: null,
          detail: `${sub.plan}/${sub.status} subscription names no organisation and the owner holds ${owned.length}, so it entitles none of them`,
        })
      }
      continue
    }

    if (!target.apply_access) {
      out.push({
        kind: 'paid_without_access',
        owner_id: sub.owner_id,
        org_id: target.id,
        detail: `${sub.plan}/${sub.status} subscription but ${target.name ?? target.id} does not have apply_access`,
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
