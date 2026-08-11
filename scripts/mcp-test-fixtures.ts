// MCP tier test fixtures — disposable users for end-to-end tier verification.
//
//   npx tsx scripts/mcp-test-fixtures.ts            # create or refresh
//   npx tsx scripts/mcp-test-fixtures.ts --destroy   # remove everything
//
// WHY dedicated users rather than Paul's account or an existing org: tier
// routing has to be proved at each rung of the ladder, and that needs a live
// OAuth token per tier. Minting a credential against a real customer's account
// is not acceptable for a test, and adding a second org to Paul's account would
// trip the multi-org resolution gotcha (owners can hold more than one org; the
// oldest wins). These users exist only to be logged in as, and only by this
// script.
//
// SAFETY
// - Every fixture is namespaced by FIXTURE_TAG and the script will only ever
//   delete rows carrying it. It cannot touch a real user, org or token.
//   Teardown sweeps that namespace by anchored pattern (FIXTURE_EMAIL_RE)
//   rather than by a hardcoded list, so fixture users created outside this
//   script — a verification walk signing up through the real form, say — are
//   still torn down instead of quietly becoming permanent residents.
// - Emails use the reserved .invalid TLD, so they can never route mail and can
//   never collide with a real signup.
// - Access tokens are written to .mcp-test-fixtures.json (gitignored), never to
//   stdout, so a real token does not end up in a terminal transcript or a log.
//   They are disposable: --destroy revokes and removes them.
// - Orgs are created with alerts_enabled false so fixtures never trigger email.
//
// The tokens are ordinary gt_oat_ access tokens: the MCP route cannot tell them
// from a real client's, which is the point — the fixture exercises the true
// auth path rather than a bypass.

import { createClient } from '@supabase/supabase-js'
import { createHash, randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs'
import path from 'path'

for (const line of readFileSync(path.resolve(__dirname, '../.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
})

/** Namespace for everything this script owns. Deletion is scoped to it. */
const FIXTURE_TAG = 'mcp-tier-fixture'

/**
 * Reserved domain every fixture address sits under. Teardown anchors on this
 * FULL suffix rather than on FIXTURE_TAG alone, so a namespace sweep cannot
 * reach an address outside the fixture space even in principle.
 */
const FIXTURE_DOMAIN = 'mcp-fixtures.invalid'

/**
 * The only addresses this script may delete: the tag prefix, a non-empty local
 * suffix, and the reserved domain, anchored at both ends. The dot is escaped so
 * the domain cannot match something like "mcp-fixturesXinvalid".
 */
const FIXTURE_EMAIL_RE = new RegExp(
  `^${FIXTURE_TAG}-[a-z0-9._-]+@${FIXTURE_DOMAIN.replace(/\./g, '\\.')}$`,
  'i',
)

const OUT_FILE = path.resolve(__dirname, '../.mcp-test-fixtures.json')

// Must match src/lib/mcp-oauth.ts. Imported by value rather than from the
// module so this script does not drag Next-only imports into a plain tsx run.
const ACCESS_TOKEN_PREFIX = 'gt_oat_'
const ISSUER = process.env.MCP_PUBLIC_ORIGIN?.trim().replace(/\/+$/, '') || 'https://www.granttracker.co.uk'
const ACCESS_TOKEN_LIFETIME_SEC = 60 * 60 * 24 * 30   // 30 days: fixtures outlive a single session

const sha256 = (raw: string) => createHash('sha256').update(raw, 'utf8').digest('hex')

interface FixtureSpec {
  key: 'free' | 'apply'
  email: string
  orgName: string
  apply_access: boolean
  companion_access: boolean
}

const FIXTURES: FixtureSpec[] = [
  {
    key: 'free',
    email: `${FIXTURE_TAG}-free@mcp-fixtures.invalid`,
    orgName: 'MCP Fixture — Free Tier',
    apply_access: false,
    companion_access: false,
  },
  {
    key: 'apply',
    email: `${FIXTURE_TAG}-apply@mcp-fixtures.invalid`,
    orgName: 'MCP Fixture — Apply Tier',
    apply_access: true,
    companion_access: false,
  },
]

async function findUserByEmail(email: string): Promise<string | null> {
  // listUsers is paginated; fixtures are few and recent, so one page is plenty.
  const { data, error } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error) throw new Error(`listUsers: ${error.message}`)
  return data.users.find(u => u.email === email)?.id ?? null
}

async function create() {
  const out: Record<string, { user_id: string; org_id: string; access_token: string; tier: string }> = {}

  for (const f of FIXTURES) {
    // ── user ────────────────────────────────────────────────────────────────
    let userId = await findUserByEmail(f.email)
    if (!userId) {
      const { data, error } = await sb.auth.admin.createUser({
        email: f.email,
        password: randomBytes(24).toString('hex'),
        email_confirm: true,
        user_metadata: { fixture: FIXTURE_TAG },
      })
      if (error) throw new Error(`createUser(${f.email}): ${error.message}`)
      userId = data.user.id
      console.log(`created user  ${f.key}`)
    } else {
      console.log(`reusing user  ${f.key}`)
    }

    // ── org ─────────────────────────────────────────────────────────────────
    // Exactly one org per fixture user, so tier resolution is unambiguous.
    const { data: existingOrgs, error: orgReadErr } = await sb
      .from('organisations').select('id').eq('owner_id', userId)
    if (orgReadErr) throw new Error(`read orgs: ${orgReadErr.message}`)

    let orgId: string
    if (existingOrgs && existingOrgs.length > 0) {
      orgId = existingOrgs[0].id
      const { error } = await sb.from('organisations')
        .update({ apply_access: f.apply_access, companion_access: f.companion_access })
        .eq('id', orgId)
      if (error) throw new Error(`update org: ${error.message}`)
      console.log(`reusing org   ${f.key} (flags refreshed)`)
    } else {
      const { data, error } = await sb.from('organisations').insert({
        name: f.orgName,
        owner_id: userId,
        // org_type is a PG enum: registered_charity | cic | social_enterprise |
        // community_group | other. legal_structure is plain text, not an enum.
        org_type: 'registered_charity',
        legal_structure: 'registered_charity',
        primary_location: 'London',
        geographic_reach: 'local',
        mission: 'Disposable fixture organisation used only to verify MCP tier routing. Not a real organisation.',
        impact_sectors: ['community'],
        alerts_enabled: false,
        apply_access: f.apply_access,
        companion_access: f.companion_access,
      }).select('id').single()
      if (error) throw new Error(`insert org: ${error.message}`)
      orgId = data.id
      console.log(`created org   ${f.key}`)
    }

    // ── token ───────────────────────────────────────────────────────────────
    // Revoke any previous fixture token for this user first, so repeated runs
    // never leave a growing pile of live credentials behind.
    await sb.from('oauth_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('user_id', userId).is('revoked_at', null)

    const rawAccess = ACCESS_TOKEN_PREFIX + randomBytes(32).toString('hex')
    const { error: tokErr } = await sb.from('oauth_tokens').insert({
      access_token_hash: sha256(rawAccess),
      refresh_token_hash: null,
      token_prefix: ACCESS_TOKEN_PREFIX,
      // client_id FKs to oauth_clients; reuse whichever active client exists so
      // the fixture does not need its own DCR registration.
      client_id: await anyActiveClientId(),
      user_id: userId,
      scope: 'read',
      resource: null,
      access_expires_at: new Date(Date.now() + ACCESS_TOKEN_LIFETIME_SEC * 1000).toISOString(),
      refresh_expires_at: null,
      issuer: ISSUER,
    })
    if (tokErr) throw new Error(`insert token: ${tokErr.message}`)

    out[f.key] = {
      user_id: userId,
      org_id: orgId,
      access_token: rawAccess,
      tier: f.companion_access ? 'companion' : f.apply_access ? 'apply' : 'free',
    }
    console.log(`minted token  ${f.key}`)
  }

  writeFileSync(OUT_FILE, JSON.stringify({ issuer: ISSUER, created_at: new Date().toISOString(), fixtures: out }, null, 2))
  console.log(`\nTokens written to ${path.basename(OUT_FILE)} (gitignored). Not printed here on purpose.`)
}

async function anyActiveClientId(): Promise<string> {
  const { data, error } = await sb.from('oauth_clients')
    .select('client_id').eq('status', 'active').limit(1).maybeSingle()
  if (error) throw new Error(`read client: ${error.message}`)
  if (!data) throw new Error('no active oauth_clients row to attach a fixture token to')
  return data.client_id
}

async function destroy() {
  // Sweep the namespace rather than the FIXTURES list. The two specs above are
  // only the users this script creates; a verification walk closing the phase-6
  // gaps signs up through the real form under the same namespace, and a
  // hardcoded list would walk straight past those.
  const { data, error } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error) throw new Error(`listUsers: ${error.message}`)

  const targets = data.users.filter(u => u.email && FIXTURE_EMAIL_RE.test(u.email))

  for (const u of targets) {
    // Tokens first so a credential is never left live even briefly, then the
    // consent row (which nothing cascades from), then the org, then the user.
    await sb.from('oauth_tokens').delete().eq('user_id', u.id)
    await sb.from('user_marketing_consent').delete().eq('user_id', u.id)
    await sb.from('organisations').delete().eq('owner_id', u.id)
    const { error: delErr } = await sb.auth.admin.deleteUser(u.id)
    if (delErr) throw new Error(`deleteUser(${u.email}): ${delErr.message}`)
    console.log(`destroyed     ${u.email}`)
  }

  if (existsSync(OUT_FILE)) unlinkSync(OUT_FILE)
  console.log(`\nFixtures removed (${targets.length}).`)
}

const mode = process.argv.includes('--destroy') ? destroy : create
mode().catch(err => { console.error(err); process.exit(1) })
