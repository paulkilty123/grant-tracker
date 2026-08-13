// Directory reviewer test account — the credential we hand to an MCP directory
// reviewer so they can connect and see a real, populated Apply-tier account.
//
//   npx tsx scripts/mcp-reviewer-account.ts            # create or refresh
//   npx tsx scripts/mcp-reviewer-account.ts --destroy   # remove it
//
// WHY THIS IS NOT A FIXTURE, and does not live in the fixture namespace.
// `mcp-test-fixtures.ts` deliberately sweeps its whole namespace on --destroy
// (anchored on `mcp-tier-fixture-*@mcp-fixtures.invalid`) so stray verification
// users cannot become permanent residents. A reviewer account inside that
// namespace would therefore be destroyed by routine fixture teardown — silently,
// and most likely mid-review. It is graduated OUT of that namespace on purpose:
// a different local part AND a different reserved domain, so neither the tag
// pattern nor the domain anchor can ever match it.
//
// The address is still under a reserved .invalid TLD, so it can never route
// mail and can never collide with a real signup. The trade-off is deliberate:
// the reviewer signs in with the password below, and password reset is not
// available to them. That is the right way round — an account that cannot be
// mailed is safer than an account that can be deleted by a teardown script.
//
// Credentials are written to .mcp-reviewer-account.json (gitignored) and never
// printed, so the password does not land in a terminal transcript.

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

/** Outside `mcp-tier-fixture-*@mcp-fixtures.invalid` on both axes — see header. */
const REVIEWER_EMAIL = 'directory-reviewer@shoots-review.invalid'
const ORG_NAME = 'Bramble Arts Collective'
const OUT_FILE = path.resolve(__dirname, '../.mcp-reviewer-account.json')

const ACCESS_TOKEN_PREFIX = 'gt_oat_'
const ISSUER = process.env.MCP_PUBLIC_ORIGIN?.trim().replace(/\/+$/, '') || 'https://www.shootsfunding.co.uk'
const ACCESS_TOKEN_LIFETIME_SEC = 60 * 60 * 24 * 90

const sha256 = (raw: string) => createHash('sha256').update(raw, 'utf8').digest('hex')

/**
 * A small, plausible pipeline. Real catalogue rows with live apply URLs, spread
 * across stages so the board reads as a real organisation's work rather than a
 * list of identical placeholder cards. Amounts sit inside each fund's published
 * range. No `won` row is dated in the future.
 */
const PIPELINE = [
  {
    grant_name: 'Annual Funding Round',
    funder_name: 'Jerwood Foundation',
    stage: 'identified',
    amount_requested: 45000,
    deadline: '2027-02-03',
    grant_url: 'https://jerwood.org/funding/',
  },
  {
    grant_name: 'Baring Foundation — Strengthening Civil Society Programme',
    funder_name: 'Baring Foundation',
    stage: 'applying',
    amount_requested: 60000,
    deadline: '2026-09-07',
    grant_url: 'https://baringfoundation.org.uk/',
  },
  {
    grant_name: 'Lloyds Bank Foundation — Specialist Programme',
    funder_name: 'Lloyds Bank Foundation for England and Wales',
    stage: 'submitted',
    amount_requested: 50000,
    deadline: '2026-09-09',
    grant_url: 'https://www.lloydsbankfoundation.org.uk/funding',
  },
  {
    grant_name: 'Hull Community Fund',
    funder_name: 'Two Ridings Community Foundation',
    stage: 'won',
    amount_requested: 8000,
    deadline: '2026-09-07',
    grant_url: 'https://tworidingscf.org.uk/fund/hull-community-fund/',
    outcome_date: '2026-07-30',
    outcome_notes: 'Awarded in full for the summer workshop programme.',
  },
] as const

async function findUserByEmail(email: string): Promise<string | null> {
  const { data, error } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error) throw new Error(`listUsers: ${error.message}`)
  return data.users.find(u => u.email === email)?.id ?? null
}

async function anyActiveClientId(): Promise<string> {
  const { data, error } = await sb.from('oauth_clients')
    .select('client_id').eq('status', 'active').limit(1).maybeSingle()
  if (error) throw new Error(`read client: ${error.message}`)
  if (!data) throw new Error('no active oauth_clients row to attach a token to')
  return data.client_id
}

/**
 * Refuse to run over a reviewer account that already exists, unless --force.
 *
 * This script is not idempotent and re-running it is destructive in ways that
 * are invisible until a reviewer hits them: it rotates the password, so
 * credentials already handed out stop working; it deletes every pipeline item
 * and rebuilds the canned four, so anything a reviewer added is lost; and it
 * revokes live tokens, so a connected client drops mid-review. It also used to
 * set companion_access false, which silently downgraded the account from
 * Adviser to Apply and left the funding goal stranded behind tools the account
 * could no longer see.
 *
 * The account is meant to be long-lived and handed to a stranger. Treat a
 * second run as a mistake unless the caller says otherwise.
 */
async function refuseIfExists(userId: string): Promise<void> {
  if (process.argv.includes('--force')) {
    console.log('--force given: overwriting the existing reviewer account')
    return
  }
  const { data: orgs } = await sb.from('organisations').select('id, name').eq('owner_id', userId)
  const orgIds = (orgs ?? []).map(o => o.id)
  const [{ count: pipelineCount }, { count: goalCount }, { count: tokenCount }] = await Promise.all([
    sb.from('pipeline_items').select('*', { count: 'exact', head: true }).in('org_id', orgIds.length ? orgIds : ['00000000-0000-0000-0000-000000000000']),
    sb.from('goals').select('*', { count: 'exact', head: true }).in('org_id', orgIds.length ? orgIds : ['00000000-0000-0000-0000-000000000000']),
    sb.from('oauth_tokens').select('*', { count: 'exact', head: true }).eq('user_id', userId).is('revoked_at', null),
  ])
  console.error(
    `\n✗ REFUSED: a reviewer account already exists (${REVIEWER_EMAIL}).\n\n` +
    `  Re-running would rotate its password, invalidating any credentials\n` +
    `  already handed to a reviewer, delete ${pipelineCount ?? 0} pipeline item(s) and\n` +
    `  rebuild the canned four, and revoke ${tokenCount ?? 0} live token(s), dropping a\n` +
    `  connected client mid-review. ${goalCount ?? 0} funding goal(s) would be left in place\n` +
    `  but detached from the pipeline they were sized against.\n\n` +
    `  Credentials for the existing account are in .mcp-reviewer-account.json.\n` +
    `  To replace it deliberately:  --force\n` +
    `  To remove it first:          --destroy\n`,
  )
  process.exit(1)
}

async function create() {
  const password = randomBytes(18).toString('base64url')

  let userId = await findUserByEmail(REVIEWER_EMAIL)
  if (userId) await refuseIfExists(userId)
  if (!userId) {
    const { data, error } = await sb.auth.admin.createUser({
      email: REVIEWER_EMAIL, password, email_confirm: true,
      user_metadata: { role: 'mcp-directory-reviewer' },
    })
    if (error) throw new Error(`createUser: ${error.message}`)
    userId = data.user.id
    console.log('created reviewer user')
  } else {
    const { error } = await sb.auth.admin.updateUserById(userId, { password })
    if (error) throw new Error(`updateUser: ${error.message}`)
    console.log('reusing reviewer user (password rotated)')
  }

  // Exactly one org, so tier resolution is unambiguous (owners may hold more
  // than one org and the oldest wins).
  const { data: orgs, error: orgErr } = await sb
    .from('organisations').select('id').eq('owner_id', userId)
  if (orgErr) throw new Error(`read orgs: ${orgErr.message}`)

  const profile = {
    name: ORG_NAME,
    org_type: 'registered_charity',
    legal_structure: 'registered_charity',
    primary_location: 'Leeds',
    geographic_reach: 'regional',
    mission: 'Bramble Arts Collective runs participatory arts workshops with young people and older residents across Leeds, using creative practice to reduce isolation and build confidence.',
    // Taxonomy values as they exist in the data — the arts sector is `creative`,
    // not `arts_culture`; an invented tag would leave the org unscoreable.
    impact_sectors: ['creative', 'community', 'young_people'],
    alerts_enabled: false,      // a review account must never trigger email
    apply_access: true,
    // Adviser tier since 2026-08-13, so the goal and planning tools return real
    // arithmetic for a reviewer instead of empty state. Was false, which meant
    // re-running this script silently downgraded the live reviewer account.
    companion_access: true,
  }

  let orgId: string
  if (orgs && orgs.length > 0) {
    orgId = orgs[0].id
    const { error } = await sb.from('organisations').update(profile).eq('id', orgId)
    if (error) throw new Error(`update org: ${error.message}`)
    console.log('reusing reviewer org (profile refreshed)')
  } else {
    const { data, error } = await sb.from('organisations')
      .insert({ ...profile, owner_id: userId }).select('id').single()
    if (error) throw new Error(`insert org: ${error.message}`)
    orgId = data.id
    console.log('created reviewer org')
  }

  // Rebuild the pipeline from scratch so repeated runs do not stack duplicates.
  await sb.from('pipeline_items').delete().eq('org_id', orgId)
  const { error: pipeErr } = await sb.from('pipeline_items')
    .insert(PIPELINE.map(p => ({ ...p, org_id: orgId, created_by: userId })))
  if (pipeErr) throw new Error(`insert pipeline: ${pipeErr.message}`)
  console.log(`seeded pipeline (${PIPELINE.length} items)`)

  await sb.from('oauth_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('user_id', userId).is('revoked_at', null)

  const rawAccess = ACCESS_TOKEN_PREFIX + randomBytes(32).toString('hex')
  const { error: tokErr } = await sb.from('oauth_tokens').insert({
    access_token_hash: sha256(rawAccess),
    refresh_token_hash: null,
    token_prefix: ACCESS_TOKEN_PREFIX,
    client_id: await anyActiveClientId(),
    user_id: userId,
    scope: 'read',
    resource: null,
    access_expires_at: new Date(Date.now() + ACCESS_TOKEN_LIFETIME_SEC * 1000).toISOString(),
    refresh_expires_at: null,
    issuer: ISSUER,
  })
  if (tokErr) throw new Error(`insert token: ${tokErr.message}`)

  writeFileSync(OUT_FILE, JSON.stringify({
    purpose: 'MCP directory reviewer test account',
    issuer: ISSUER,
    created_at: new Date().toISOString(),
    email: REVIEWER_EMAIL,
    password,
    org_id: orgId,
    user_id: userId,
    tier: 'companion',
    verification_access_token: rawAccess,
    note: 'Reviewer signs in with email + password during the OAuth authorize step. The token is for our own server-side verification, not for the reviewer.',
  }, null, 2))
  console.log(`\nCredentials written to ${path.basename(OUT_FILE)} (gitignored). Not printed here on purpose.`)
}

async function destroy() {
  const userId = await findUserByEmail(REVIEWER_EMAIL)
  if (userId) {
    await sb.from('oauth_tokens').delete().eq('user_id', userId)
    await sb.from('user_marketing_consent').delete().eq('user_id', userId)
    const { data: orgs } = await sb.from('organisations').select('id').eq('owner_id', userId)
    for (const o of orgs ?? []) await sb.from('pipeline_items').delete().eq('org_id', o.id)
    await sb.from('organisations').delete().eq('owner_id', userId)
    const { error } = await sb.auth.admin.deleteUser(userId)
    if (error) throw new Error(`deleteUser: ${error.message}`)
    console.log(`destroyed ${REVIEWER_EMAIL}`)
  } else {
    console.log('no reviewer account to destroy')
  }
  if (existsSync(OUT_FILE)) unlinkSync(OUT_FILE)
}

const mode = process.argv.includes('--destroy') ? destroy : create
mode().catch(err => { console.error(err); process.exit(1) })
