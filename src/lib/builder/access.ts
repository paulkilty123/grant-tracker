// Apply-tier access gate (pipeline + builder), resolved PER ORGANISATION.
//
// The entitlement is a fact about an organisation, not about a person. RLS on
// pipeline_items / projects / applications / org_core_content reads:
//
//   org_id in (select id from organisations
//              where owner_id = auth.uid() and apply_access = true)
//
// so the only application-layer check that can agree with the database is one
// that names an org. Verified against the live policies on 2026-08-19: all four
// tables carry that predicate on select, update and delete.
//
// What this used to do, and why it was wrong
// ------------------------------------------
// It answered a different question: "does this USER own ANY entitled org, or is
// their email on a hardcoded list of twenty". That disagreed with RLS in two
// ways, both live in production when this was written:
//
//  1. Multi-org. Three users own orgs with mixed entitlement. The old check
//     said yes for all of their orgs because one qualified, so the sidebar
//     offered Pipeline while standing on an unentitled org. RLS then returned
//     an empty set, which is indistinguishable from "you have nothing saved" —
//     so the screen said the user had no pipeline rather than that this org
//     cannot have one.
//  2. The allowlist. It granted compute with no database entitlement at all.
//     paulkilty77@gmail.com is the worked example: one org, apply_access false,
//     two pipeline rows it could never read. Nav on, data off, no explanation.
//
// Neither was a data leak. RLS held throughout; the rows were never readable by
// anyone who should not read them. The bug was that the gate and the lock
// disagreed, and the user was shown the gate.
//
// The allowlist is gone rather than kept as a fallback. Its stated purpose was
// to cover internal accounts with no organisation row, and it covered none: the
// only three org-less accounts (nyawa@thirdspacetheatre.co.uk, an MCP test
// fixture, and paulkilty77+review@gmail.com) were all absent from it, while
// every listed address that still resolves to an account owns an org. It also
// carried one dead entry, paul@granttracker.co.uk, which has no auth user.
//
// Entitlement now has exactly one source: organisations.apply_access, which
// only service_role can change (trg_enforce_apply_access_immutable, migration
// 030). Post-launch that column is driven by subscription state.

import { cookies } from 'next/headers'
import { createClient as createServerClient } from '@/lib/supabase/server'

/** Set by the profile org switcher; read here and by dashboard/layout.tsx. */
export const ACTIVE_ORG_COOKIE = 'gt_active_org_id'

export type BuilderDenial =
  | 'not_authenticated'
  | 'no_organisation'
  | 'org_not_entitled'

export interface BuilderUser {
  id: string
  email: string
  /** The org the entitlement was granted for. Always one RLS will accept. */
  orgId: string
}

export type BuilderAccess =
  | { ok: true;  user: BuilderUser; orgName: string | null }
  /** orgName is null only when there was no org to name (not signed in, or no
   *  organisation yet). Carried on the denial so the screen can say which
   *  organisation is not switched on, rather than an unattributed "not
   *  available" that a multi-org owner cannot act on. */
  | { ok: false; reason: BuilderDenial; orgName: string | null }

/** The shape resolveBuilderAccess needs from an organisation row. */
export interface OrgEntitlementRow {
  id: string
  name?: string | null
  apply_access?: boolean | null
}

export type OrgDecision =
  | { ok: true;  org: OrgEntitlementRow }
  | { ok: false; reason: Extract<BuilderDenial, 'no_organisation' | 'org_not_entitled'>; org: OrgEntitlementRow | null }

/**
 * Which org is in view, and is it entitled?
 *
 * Pure, and exported so the decision can be tested without a database. The
 * whole bug this file exists to fix lived in exactly this choice, so it is
 * worth being able to assert on it directly.
 *
 * `orgs` must arrive oldest-first — the fallback is "their oldest org", which
 * is what getOrganisationByOwner and dashboard/layout.tsx also fall back to.
 */
export function decideOrgAccess(
  orgs: OrgEntitlementRow[],
  requestedId: string | null,
  /** True when the caller named an org explicitly rather than via the cookie. */
  wasExplicit = false,
): OrgDecision {
  if (!orgs.length) return { ok: false, reason: 'no_organisation', org: null }

  const matched = requestedId ? orgs.find(o => o.id === requestedId) ?? null : null

  // An explicit org the caller does not own is a refusal, not a quiet fallback
  // to their oldest. A stale or hand-crafted cookie IS allowed to fall back,
  // because that is a browser artefact rather than an instruction.
  if (wasExplicit && !matched) return { ok: false, reason: 'org_not_entitled', org: null }

  const org = matched ?? orgs[0]
  if (!org.apply_access) return { ok: false, reason: 'org_not_entitled', org }
  return { ok: true, org }
}

/**
 * Resolve Apply-tier access for a specific org, or for the caller's active one.
 *
 * `orgId` is for callers that already know which org they are acting on. Left
 * out, this resolves the same org the dashboard is showing: the active-org
 * cookie when it names an org the caller owns, else their oldest. That fallback
 * matches getOrganisationByOwner and dashboard/layout.tsx, so the nav, the page
 * and this gate cannot disagree about which org is in view.
 *
 * Reads under the caller's own RLS, so the org lookup only ever sees their own
 * organisations. A cookie naming somebody else's org finds no match and falls
 * through to the oldest, rather than revealing that the org exists.
 */
export async function resolveBuilderAccess(orgId?: string): Promise<BuilderAccess> {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) return { ok: false, reason: 'not_authenticated', orgName: null }

    const { data: orgs } = await supabase
      .from('organisations')
      .select('id, name, apply_access')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: true })

    const requestedId = orgId ?? cookies().get(ACTIVE_ORG_COOKIE)?.value ?? null
    const decision = decideOrgAccess(orgs ?? [], requestedId, orgId !== undefined)

    if (!decision.ok) {
      return { ok: false, reason: decision.reason, orgName: decision.org?.name ?? null }
    }
    return {
      ok: true,
      user: { id: user.id, email: user.email, orgId: decision.org.id },
      orgName: decision.org.name ?? null,
    }
  } catch {
    return { ok: false, reason: 'not_authenticated', orgName: null }
  }
}

/**
 * Returns the session user when the org in view is Apply-entitled, else null.
 *
 * Thin wrapper for the API routes, which only need the yes or no. Prefer
 * resolveBuilderAccess wherever the caller can say something useful about why
 * access was refused.
 */
export async function getBuilderUser(): Promise<BuilderUser | null> {
  const access = await resolveBuilderAccess()
  return access.ok ? access.user : null
}

/** User-facing copy for a denial. Names the organisation, not the tier. */
export function builderDenialMessage(reason: BuilderDenial): string {
  switch (reason) {
    case 'not_authenticated':
      return 'Please sign in to continue.'
    case 'no_organisation':
      return 'Add an organisation profile to continue.'
    case 'org_not_entitled':
      return 'Pipeline and applications are not switched on for this organisation.'
  }
}
