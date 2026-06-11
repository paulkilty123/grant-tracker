/**
 * cohort-newsletter.ts
 *
 * Generates per-user newsletter drafts for the fortnightly cohort send.
 *
 * Usage:
 *   npx tsx scripts/cohort-newsletter.ts                     # full cohort, no LLM (placeholder fit notes)
 *   npx tsx scripts/cohort-newsletter.ts --user=<user_id>    # single user
 *   npx tsx scripts/cohort-newsletter.ts --llm               # generate real fit notes via Anthropic
 *   npx tsx scripts/cohort-newsletter.ts --user=<id> --llm   # combine
 *
 * Output:
 *   tmp/newsletter-drafts/<user_id>.txt
 *   tmp/newsletter-drafts/<user_id>.html
 *   tmp/newsletter-drafts/_summary.txt
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { mkdirSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { computeMatchScore } from '../src/lib/matching'
import { normaliseScrapedGrant, type EnrichedGrant } from '../src/lib/grants-normalise'
import type { Organisation } from '../src/types'

// ── Env loading (mirror scripts/classify-grants.mjs pattern) ──────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url))
function loadEnv() {
  const envPath = path.resolve(__dirname, '../.env.local')
  const lines = readFileSync(envPath, 'utf8').split('\n')
  for (const raw of lines) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    const val = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
    if (!process.env[key]) process.env[key] = val
  }
}
loadEnv()

// ── Config ────────────────────────────────────────────────────────────────────
type CohortMember = {
  user_id:               string
  email:                 string
  first_name:            string
  send_first_time:       boolean
  // When true, this member always gets the standard opener even if their
  // last_sign_in_at puts them in the disengaged bucket. Use for members
  // we know are still warm despite no login (e.g. Devi).
  force_active_opener?:  boolean
}

const COHORT: CohortMember[] = [
  { user_id: '8ae85676-0168-416d-bc80-4a7dddc1512f', email: 'admin@asiancommunityconcern.co.uk', first_name: 'Philomina', send_first_time: false },
  { user_id: '2ca2c642-17c3-4851-8128-5e22d841a9ae', email: 'dave@thirdspacetheatre.co.uk',      first_name: 'Dave',      send_first_time: false },
  { user_id: '1dca3b4d-325e-4e23-9796-7aba91c7e6a1', email: 'emma@thepaperbirds.com',            first_name: 'Emma',      send_first_time: false },
  { user_id: '9d87b46f-2ecc-487c-b189-41f05ed0e73e', email: 'hema@olympiasmusic.com',            first_name: 'Hema',      send_first_time: false },
  { user_id: 'aa821d0e-23f8-437b-ae9d-232e5cba4ff0', email: 'jen.robinson-slater@learningwithparents.com', first_name: 'Jen', send_first_time: false },
  { user_id: 'f1c8c8a8-dbe5-4639-93a1-c6322e6d70ea', email: 'david@digitalability.co',           first_name: 'David',     send_first_time: false },
  { user_id: '0fb0581f-89c3-41c7-9a0d-daf814add5cf', email: 'louis@reprezent.org.uk',            first_name: 'Louis',     send_first_time: false },
  { user_id: 'aabfaef1-55fe-4cae-a262-e2a089aea12c', email: 'deviyani.clark@gmail.com',          first_name: 'Devi',      send_first_time: false, force_active_opener: true },
]

const DISENGAGEMENT_THRESHOLD_DAYS = 14

// Paul's self-test entry (paulkilty1@gmail.com → IoI). Not in COHORT array
// so a full run doesn't include him; trigger explicitly with --user=<id>.
const SELF_TEST: CohortMember = {
  user_id:         'ee80e7d1-6680-420f-8046-5a5e36a84fe6',
  email:           'paulkilty1@gmail.com',
  first_name:      'Paul',
  send_first_time: false,
}

// Run-2 baseline for "recently added to catalogue" (last send date).
// For future sends, replace with persisted last_sent_at per user.
const RECENCY_BASELINE = '2026-05-28'

const TOP_THRESHOLD     = 80   // strong-fit floor
const OTHER_THRESHOLD   = 60   // worth-a-look floor (also applies to Recently added)
const RECENT_THRESHOLD  = 60
const TOP_COUNT         = 3
const OTHER_COUNT       = 3
const RECENT_COUNT      = 2
const PIPELINE_WINDOW_DAYS = 14
const CATALOGUE_SIZE       = 641   // for honest copy in updates section (verified 2026-06-11)

const SITE_URL     = 'https://granttracker.co.uk'
const MATCHES_URL  = `${SITE_URL}/dashboard/search`
const PIPELINE_URL = `${SITE_URL}/dashboard/pipeline`
const UNSUBSCRIBE_MAILTO = 'mailto:paul@granttracker.co.uk?subject=Unsubscribe%20from%20cohort%20updates'

// ── Args ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const userFilter      = args.find(a => a.startsWith('--user='))?.split('=')[1]
const useLlm          = args.includes('--llm')
const useMockPipeline = args.includes('--mock-pipeline')

// ── Supabase + Anthropic clients ──────────────────────────────────────────────
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

// ── Types ─────────────────────────────────────────────────────────────────────
type ScoredGrant = { grant: EnrichedGrant; score: number; reasons: string[]; rawRow: Record<string, unknown> }
type PipelineItem = Record<string, unknown>

type Draft = {
  member:           CohortMember
  org:              Organisation & { id: string; name: string } | null
  warnings:         string[]
  topMatches:       ScoredGrant[]
  otherMatches:    ScoredGrant[]
  recentlyAdded:    ScoredGrant[]
  pipelineUrgent:     PipelineItem[]
  pipelineRecent:     PipelineItem[]
  pipelineApplying:   PipelineItem[]
  pipelineIdentified: PipelineItem[]
  identifiedTotal:    number             // total identified in DB, for "...and N more" suffix when capped
  fitNotes:           Map<string, string>  // grant.id -> sentence
  isDisengaged:     boolean               // last_sign_in_at older than threshold AND not overridden
  daysSinceLogin:   number | null         // for telemetry / opener wording
}

// ── Fetchers ──────────────────────────────────────────────────────────────────
async function loadOrgRow(userId: string): Promise<{ org: Organisation | null; multipleRows: boolean }> {
  const { data, error } = await supabase
    .from('organisations')
    .select('*')
    .eq('owner_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`organisations load failed: ${error.message}`)
  return { org: (data?.[0] ?? null) as Organisation | null, multipleRows: (data?.length ?? 0) > 1 }
}

async function loadCatalogue(): Promise<{ grants: EnrichedGrant[]; rows: Record<string, unknown>[] }> {
  // grants_with_funder has funder_brief + geographic_scope (needed for fit-note
  // context) but is MISSING niche_tags. Merge niche_tags from scraped_grants
  // by row UUID so the matcher (and adjacency detection) sees them. Without
  // this merge, every grant has nicheTags=[] and the niche-mismatch dampen +
  // adjacency-aware prompt both silently no-op.
  const [viewResp, ngResp] = await Promise.all([
    supabase.from('grants_with_funder').select('*').eq('is_active', true).limit(2000),
    supabase.from('scraped_grants').select('id, niche_tags').eq('is_active', true).limit(2000),
  ])
  if (viewResp.error) throw new Error(`catalogue load failed: ${viewResp.error.message}`)
  if (ngResp.error)   throw new Error(`niche_tags load failed: ${ngResp.error.message}`)

  const nicheById = new Map<string, string[]>()
  for (const r of (ngResp.data ?? []) as Array<{ id: string; niche_tags: string[] | null }>) {
    nicheById.set(r.id, Array.isArray(r.niche_tags) ? r.niche_tags : [])
  }

  const rows = ((viewResp.data ?? []) as Record<string, unknown>[]).map(r => ({
    ...r,
    niche_tags: nicheById.get(String(r.id)) ?? [],
  }))
  const grants = rows.map(r => normaliseScrapedGrant(r))
  return { grants, rows }
}

async function loadExclusions(userId: string, orgId: string | null): Promise<Set<string>> {
  // match_feedback.direction = 'down' → user explicitly rejected.
  // grant_interactions.action in ('dismissed','disliked') → same. Both store
  // grant_id as text (external_id for feedback, mix for interactions).
  const excluded = new Set<string>()
  const fb = await supabase
    .from('match_feedback')
    .select('grant_id')
    .eq('user_id', userId)
    .eq('direction', 'down')
  for (const r of fb.data ?? []) if (r.grant_id) excluded.add(String(r.grant_id))

  if (orgId) {
    const it = await supabase
      .from('grant_interactions')
      .select('grant_id, action')
      .eq('org_id', orgId)
      .in('action', ['dismissed', 'disliked'])
    for (const r of it.data ?? []) if (r.grant_id) excluded.add(String(r.grant_id))
  }
  return excluded
}

async function loadPipeline(orgId: string | null, todayISO: string): Promise<{
  urgent:          PipelineItem[]
  recent:          PipelineItem[]
  applying:        PipelineItem[]
  identified:      PipelineItem[]
  identifiedTotal: number
}> {
  if (!orgId) return { urgent: [], recent: [], applying: [], identified: [], identifiedTotal: 0 }

  const horizon = new Date(todayISO)
  horizon.setDate(horizon.getDate() + PIPELINE_WINDOW_DAYS)
  const horizonISO = horizon.toISOString().slice(0, 10)

  // 30-day window for "recently submitted" (was 14d, too tight for fortnightly cadence).
  const SUBMITTED_LOOKBACK_DAYS = 30
  const pastBound = new Date(todayISO)
  pastBound.setDate(pastBound.getDate() - SUBMITTED_LOOKBACK_DAYS)
  const pastISO = pastBound.toISOString().slice(0, 10)

  const IDENTIFIED_CAP = 5  // avoid flooding the email for orgs with many saved items

  const { data: all } = await supabase
    .from('pipeline_items')
    .select('*')
    .eq('org_id', orgId)
  const items = (all ?? []) as PipelineItem[]

  // Normalise stage to lowercase. DB enum is lowercase (`identified`,
  // `applying`, `submitted`, `won`, `declined`); previous code compared to
  // capitalised strings and silently dropped every match. Bucketing rules:
  //   urgent     deadline within 14 days (any stage, case-insensitive)
  //   recent     stage=submitted in last 30 days
  //   applying   stage=applying (NOT already in urgent)
  //   identified stage=identified (NOT already in urgent), most-recent N
  const stageOf = (i: PipelineItem): string => String(i.stage ?? '').toLowerCase()

  const urgent: PipelineItem[] = items.filter(i =>
    i.deadline && (i.deadline as string) >= todayISO && (i.deadline as string) <= horizonISO
  )
  const inUrgent = new Set(urgent.map(i => String(i.id)))

  const recent: PipelineItem[] = items.filter(i =>
    stageOf(i) === 'submitted' &&
    !inUrgent.has(String(i.id)) &&
    i.updated_at && (i.updated_at as string).slice(0, 10) >= pastISO
  )
  const applying: PipelineItem[] = items.filter(i =>
    stageOf(i) === 'applying' && !inUrgent.has(String(i.id))
  )
  const identifiedAll = items.filter(i =>
    stageOf(i) === 'identified' && !inUrgent.has(String(i.id))
  )
  const identified: PipelineItem[] = identifiedAll
    .sort((a, b) => String(b.updated_at ?? '').localeCompare(String(a.updated_at ?? '')))
    .slice(0, IDENTIFIED_CAP)

  return { urgent, recent, applying, identified, identifiedTotal: identifiedAll.length }
}

// ── Match selection ───────────────────────────────────────────────────────────
function pickMatches(scored: ScoredGrant[], excluded: Set<string>, rows: Record<string, unknown>[], org: Organisation): {
  top:    ScoredGrant[]
  other:  ScoredGrant[]
  recent: ScoredGrant[]
} {
  const rowsById = new Map(rows.map(r => [String(r.external_id ?? r.id), r]))

  const eligible = scored.filter(s => {
    // Exclude on either external_id or UUID match (memory: match_feedback stores external_id).
    if (excluded.has(s.grant.id)) return false
    const row = rowsById.get(s.grant.id)
    if (row && excluded.has(String(row.id))) return false
    return true
  })

  const used = new Set<string>()
  const top:    ScoredGrant[] = []
  const other:  ScoredGrant[] = []
  const recent: ScoredGrant[] = []

  // Top: ≥80%, up to TOP_COUNT.
  for (const s of eligible) {
    if (top.length >= TOP_COUNT) break
    if (s.score < TOP_THRESHOLD) break          // eligible is sorted desc, can break
    top.push(s); used.add(s.grant.id)
  }

  // Other: 60-79%, up to OTHER_COUNT, exclude any already in top.
  for (const s of eligible) {
    if (other.length >= OTHER_COUNT) break
    if (s.score >= TOP_THRESHOLD)    continue
    if (s.score < OTHER_THRESHOLD)   break
    if (used.has(s.grant.id))        continue
    other.push(s); used.add(s.grant.id)
  }

  // Recent: first_seen >= baseline, ≥60%, up to RECENT_COUNT, exclude top + other.
  // Also exclude grants with a specialism mismatch — a music grant in a
  // STEM-focused org's "Recently added" isn't useful catalogue-curiosity.
  // (Adjacency cases belong in Other matches, where the fit note honestly
  // frames the gap. They don't belong in a descriptive "what's new" surface.)
  for (const s of eligible) {
    if (recent.length >= RECENT_COUNT) break
    if (s.score < RECENT_THRESHOLD)   continue
    if (used.has(s.grant.id))         continue
    const row = rowsById.get(s.grant.id)
    const firstSeen = row?.first_seen_at ? String(row.first_seen_at).slice(0, 10) : null
    if (firstSeen == null || firstSeen < RECENCY_BASELINE) continue
    if (detectAdjacency(org, s.grant).mismatch) continue
    recent.push(s); used.add(s.grant.id)
  }

  return { top, other, recent }
}

// ── Fit-note generators ───────────────────────────────────────────────────────
type FitNoteKind = 'top' | 'other' | 'recent'

function detectAdjacency(org: Organisation, grant: EnrichedGrant): { mismatch: boolean; grantSpecialism?: string; orgSpecialism?: string } {
  const orgN   = (org.niche_tags ?? []).map(t => t.toLowerCase())
  const grantN = (grant.nicheTags ?? []).map(t => t.toLowerCase())
  if (orgN.length === 0 || grantN.length === 0) return { mismatch: false }
  const overlap = grantN.some(g => orgN.includes(g))
  if (overlap) return { mismatch: false }
  return {
    mismatch:        true,
    grantSpecialism: grantN[0].replace(/_/g, ' '),
    orgSpecialism:   orgN[0].replace(/_/g, ' '),
  }
}

function fitNoteContext(grant: EnrichedGrant, rawRow: Record<string, unknown>): string {
  const brief = (rawRow.funder_brief as Record<string, string | null> | null) ?? null
  const briefExcerpt = brief
    ? Object.entries(brief)
        .filter(([, v]) => typeof v === 'string' && v.length > 0)
        .slice(0, 3)
        .map(([k, v]) => `${k}: ${String(v).slice(0, 300)}`)
        .join('\n')
    : ''
  return [
    `Title:       ${grant.title}`,
    `Funder:      ${grant.funder}`,
    `Type:        ${grant.fundingType}`,
    `Sectors:     ${(grant.impactSectors ?? []).join(', ') || '(none)'}`,
    `Niche tags:  ${(grant.nicheTags ?? []).join(', ') || '(none)'}`,
    `Amount:      ${grant.amountMin === grant.amountMax ? `£${grant.amountMax}` : `£${grant.amountMin}–£${grant.amountMax}`}`,
    `Location:    ${grant.locationTag ?? '(UK-wide)'}`,
    briefExcerpt ? `\nFunder brief excerpt:\n${briefExcerpt}` : '',
  ].filter(Boolean).join('\n')
}

function orgContext(org: Organisation): string {
  return [
    `Name:        ${org.name}`,
    `Mission:     ${(org as { mission?: string }).mission?.slice(0, 400) ?? '(none)'}`,
    `Sectors:     ${(org.impact_sectors ?? []).join(', ') || '(none)'}`,
    `Niche tags:  ${(org.niche_tags ?? []).join(', ') || '(none)'}`,
    `Structure:   ${(org as { legal_structure?: string }).legal_structure ?? '(unspecified)'}`,
    `Location:    ${(org as { primary_location?: string }).primary_location ?? '(unspecified)'}`,
  ].join('\n')
}

async function generateFitNote(kind: FitNoteKind, org: Organisation, grant: EnrichedGrant, rawRow: Record<string, unknown>): Promise<string> {
  const adj = detectAdjacency(org, grant)

  let prompt: string
  if ((kind === 'top' || kind === 'other') && adj.mismatch) {
    // Adjacency mode — completely separate prompt with REQUIRED lead-in pattern.
    // Empirical: without forcing the lead-in, the model still defaults to
    // "Strong match if..." on a non-trivial fraction of top-section matches.
    prompt = `You write one-sentence adjacency notes for a UK grant-tracker newsletter.

CONTEXT: The matcher scored this grant highly on structural dimensions (location, beneficiary group, grant size, funder type), BUT the specialism does NOT match the org's specialism. Your job is to name that gap honestly. DO NOT claim a strong or direct fit.

The grant's specialism is "${adj.grantSpecialism}".
The org's specialism is "${adj.orgSpecialism}".

HARD REQUIREMENT — your sentence MUST start with EXACTLY one of these three lead-ins, character-for-character. No other lead-in is acceptable:
1. "Adjacent rather than direct: "
2. "Worth a look despite specialism gap: "
3. "Different specialism, but: "

If you start with anything else (e.g. "Strong match", "Strong fit", "Direct fit", "Match for", "Tangential", "Potential", "Not a fit", "If you're"), your output will be rejected.

After the lead-in, in ONE sentence ≤30 words: name what the funder actually backs (concretely from the brief), then name what the org actually does, then state that these are adjacent rather than aligned.

GOOD adjacency examples:
- "Adjacent rather than direct: Youth Music backs music-led creative projects for under-25s, which sits next to your devised theatre practice rather than overlapping with it."
- "Worth a look despite specialism gap: PRS funds Black music-industry careers, your work centres devised theatre with young women rather than music production."
- "Different specialism, but: Music for All backs community music-making in deprived areas, partial overlap with your early-years STEM-creative play rather than direct match."

Rules:
- ONE sentence, ≤30 words after the lead-in.
- No em dashes (—). No en dashes (–) in monetary ranges; use "to".
- No "this grant" / "this opportunity" filler.
- USE THE FUNDER'S EXACT TERMINOLOGY. Don't invent compound phrases like "audience resilience", "creative resilience", or jargon the brief doesn't use. Plain English beats invented terms.

ORG:
${orgContext(org)}

GRANT:
${fitNoteContext(grant, rawRow)}

Write the one-sentence adjacency note. Output the sentence only, no preamble. Remember: lead-in is mandatory.`
  } else if (kind === 'top' || kind === 'other') {
    const framingHeader = kind === 'top'
      ? `The note tells the org WHY a specific grant is a strong fit.`
      : `The note tells the org WHY this grant is worth a look despite a lower confidence score. Lean adjacent rather than strong-claim.`
    prompt = `You write one-sentence fit notes for a UK grant-tracker newsletter. ${framingHeader} Be concrete and specific to the org's work, never generic.

GOOD examples:
- "Direct fit for grassroots youth-led music projects with broadcast or training elements."
- "Match for community-led arts in deprived areas, with a focus on co-creation."
- "Built for charities running outdoor learning with under-5s. Your STEM focus reads."

BAD examples (DO NOT WRITE LIKE THIS):
- "This grant aligns with your sector focus" (too generic)
- "A strong fit for your organisation" (vague)
- "Matches your themes and beneficiaries" (lazy)

Rules:
- ONE sentence, ≤25 words.
- Anchor on something specific from the funder brief or grant sectors that maps to the org's actual work.
- USE THE FUNDER'S EXACT TERMINOLOGY where possible. Do NOT invent compound phrases. E.g. if you want to say "audience growth", check the brief — say "audience development" or "audience reach" if that's the funder's language. Never invent "audience resilience", "creative resilience", "workforce capacity" etc. unless the brief literally uses those terms. Plain English ("workshops", "tours", "capital costs", "access projects") beats invented jargon.
- Don't repeat the funder name or grant title.
- No "this grant" / "this opportunity" filler.
- No em dashes (—) anywhere. Use commas, full stops, or "and" instead.
- Monetary ranges: use "to" (e.g. "£5,000 to £15,000"), never en dashes (–) or hyphens for ranges.

ORG:
${orgContext(org)}

GRANT:
${fitNoteContext(grant, rawRow)}

Write the one-sentence fit note. Output the sentence only, no preamble.`
  } else {
    prompt = `You write one-sentence "recently added" notes for a UK grant-tracker newsletter. The note tells the org WHAT'S NEW about this grant and WHAT KIND OF WORK IT SUPPORTS, not why it fits them.

GOOD examples:
- "New addition: small grants for South London community projects, quick turnaround."
- "Just added: programme funding for youth arts orgs across the Midlands."
- "New on the catalogue: in-kind business support for early-stage social enterprises."

BAD examples:
- "Recently added to the catalogue" (says nothing)
- "A new grant you might like" (no content)

Rules:
- ONE sentence, ≤25 words.
- Start with "New addition:" or "Just added:" or "New on the catalogue:" (vary across notes if writing many).
- Describe the work the grant supports concretely.
- Don't claim it's a strong fit. This section is curiosity-led, not personalised.
- No em dashes (—) anywhere. Use commas, full stops, or "and" instead.
- Monetary ranges: use "to" (e.g. "£5,000 to £15,000"), never en dashes (–) or hyphens for ranges.

GRANT:
${fitNoteContext(grant, rawRow)}

Write the one-sentence note. Output the sentence only, no preamble.`
  }

  const requiredAdjacencyLeads = [
    'Adjacent rather than direct:',
    'Worth a look despite specialism gap:',
    'Different specialism, but:',
  ]
  const isInvalidAdjacency = (text: string): boolean =>
    adj.mismatch && (kind === 'top' || kind === 'other') &&
    !requiredAdjacencyLeads.some(lead => text.startsWith(lead))

  let lastErr: unknown = null
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const msg = await anthropic.messages.create({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages:   [{ role: 'user', content: prompt }],
      })
      const text = msg.content
        .filter(b => b.type === 'text')
        .map(b => (b as { type: 'text'; text: string }).text)
        .join('')
        .trim()
        .replace(/^["']|["']$/g, '')
      if (text) {
        if (isInvalidAdjacency(text)) {
          // Lead-in violation. Retry on attempts 0 and 1; on attempt 2, force
          // the lead-in by prepending "Adjacent rather than direct:" so we
          // never ship a "Strong match" overclaim.
          if (attempt < 2) continue
          return `Adjacent rather than direct: funder backs ${adj.grantSpecialism}-focused projects, your work centres on ${adj.orgSpecialism} which sits adjacent rather than aligned.`
        }
        return text
      }
    } catch (err) {
      lastErr = err
      await new Promise(r => setTimeout(r, 1500))
    }
  }
  console.warn(`[fit-note] failed for grant ${grant.id}:`, lastErr)
  return kind === 'top'
    ? `Strong fit. Review the brief for specifics.`
    : `New addition to the catalogue. Review the brief.`
}

// ── Template rendering ────────────────────────────────────────────────────────
const WELCOME = `Thank you for being part of the founding cohort. You're one of the small group I'm building this with, and your feedback is what's going to shape Grant Tracker into something genuinely useful for the UK social sector.`

const EXPECTATIONS = `These updates will land roughly every fortnight. They'll cover what's new on the platform, your matches, your pipeline, and a question for the cohort. I'll also send the occasional email asking your view on new features.`

// Second-send opener (send_first_time = false). Rewrite each fortnight.
const SECOND_OPENER = `Some real progress to share from the last couple of weeks. The feedback from this group has really helped shape the functionality and ambition for Grant Tracker, so thank you. The aspiration has always been to build a tool that makes it easier to find and secure funding. To deliver on that, I want it to be a platform that helps you reach your funding goal and takes on the legwork to get there. In practice, the idea is to build a digital fundraising advisor that proactively works alongside you. One that helps you strategise, finds the right opportunities, strengthens your applications, and over time takes on more of the day-to-day work, so your time goes on the work that matters.

I'm actively working on this now and will keep you updated on progress. When it's ready, you'll be the first to try it.`

// Disengaged opener (replaces WELCOME + EXPECTATIONS). Used when last login
// is older than DISENGAGEMENT_THRESHOLD_DAYS and the member isn't flagged
// force_active_opener.
const DISENGAGED_CHECKIN = `Wanted to check in. I haven't seen you in Grant Tracker for a few weeks. No pressure, but it would be useful to know whether the product isn't landing right for you, or whether life just got in the way. Either is fine to say.`
const disengagedTransition = (orgName: string) => `In the meantime, here's what's new, and a few matches that have come up for ${orgName} that might be worth a look.`

const UPDATES_HEADER = `New on Grant Tracker`

const UPDATES_ITEMS: string[] = [
  `Coming next week: the Application Builder, built on feedback from a number of you. You'll be able to bring in a past application, build a guided draft around the funder's actual questions, get tips to strengthen each answer, and export a working doc.`,
  `Grant Tracker now connects to Claude, so you can use Claude to find grants from the Grant Tracker catalogue. I've submitted it to Anthropic to officially launch on their directory for anyone to access. More on this soon.`,
  `And the catalogue keeps growing: 31 new opportunities added in the last two weeks, bringing it to ${CATALOGUE_SIZE} live. 495 grants, 66 programmes, 41 investments, and 39 in-kind support packages.`,
]

const FEEDBACK_INTRO = `A few specific things I'd value your thoughts on:`
const FEEDBACK_QUESTIONS = [
  `Are the matches landing close enough to be useful, or do they need more nuance?`,
  `Is there anything you'd want from Grant Tracker that we don't have yet?`,
  `Has anything frustrated you or felt unfinished?`,
  `Does this email offer the right balance of information?`,
]
const FEEDBACK_OUTRO = `No need for a long reply. A few lines is plenty, and genuinely the most valuable thing you can give me right now.`

const SIGN_OFF = `Hit reply with anything. I read every one.\n\nCheers,\nPaul`

function todayDateLabel(): string {
  const d = new Date()
  const day = d.toLocaleDateString('en-GB', { weekday: 'short' })  // "Thu"
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })  // "5 Jun"
  return `${day} ${date}`
}

function subjectLineFor(member: CohortMember): string {
  return member.send_first_time
    ? 'First cohort update from Grant Tracker'
    : `Cohort update, ${todayDateLabel()}`
}

// ── Formatting helpers ────────────────────────────────────────────────────────
function formatAmount(min: number | null | undefined, max: number | null | undefined): string {
  const lo = typeof min === 'number' && min > 0 ? min : 0
  const hi = typeof max === 'number' && max > 0 ? max : 0
  if (lo === 0 && hi === 0) return ''
  const fmt = (n: number) => `£${n.toLocaleString('en-GB')}`
  if (lo === 0)          return `up to ${fmt(hi)}`
  if (hi === 0 || lo === hi) return fmt(lo)
  return `${fmt(lo)} to ${fmt(hi)}`
}

function formatDateISO(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(String(iso).slice(0, 10))
  if (Number.isNaN(d.getTime())) return String(iso)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function grantMetaLine(grant: EnrichedGrant): string {
  const bits: string[] = [grant.funder]
  const amt = formatAmount(grant.amountMin, grant.amountMax)
  if (amt) bits.push(amt)
  if (grant.deadline)        bits.push(`deadline ${formatDateISO(grant.deadline)}`)
  else if (grant.isRolling)  bits.push('rolling')
  return bits.join(' · ')
}

// ── Plain-text rendering ──────────────────────────────────────────────────────
function renderTxt(draft: Draft): string {
  const { member, org, isDisengaged, topMatches, otherMatches, recentlyAdded,
          pipelineUrgent, pipelineRecent, pipelineApplying, pipelineIdentified, identifiedTotal, fitNotes } = draft
  const orgName = org?.name ?? 'your organisation'
  const lines: string[] = []
  lines.push(`Hi ${member.first_name},`)
  lines.push('')
  if (isDisengaged) {
    // Disengaged opener replaces welcome + expectations regardless of send_first_time.
    lines.push(DISENGAGED_CHECKIN); lines.push('')
    lines.push(disengagedTransition(orgName)); lines.push('')
  } else if (member.send_first_time) {
    lines.push(WELCOME); lines.push('')
    lines.push(EXPECTATIONS); lines.push('')
  } else {
    lines.push(SECOND_OPENER)
    lines.push('')
  }

  // "What's new" renders on every send (the fortnightly promise in EXPECTATIONS).
  lines.push(UPDATES_HEADER)
  lines.push('')
  UPDATES_ITEMS.forEach((it, i) => { lines.push(`${i + 1}. ${it}`); lines.push('') })

  // Top matches (≥80%)
  if (topMatches.length > 0) {
    lines.push(`Your top matches this fortnight`)
    lines.push('')
    for (const m of topMatches) {
      lines.push(`• ${m.grant.title}  (${m.score}%)`)
      lines.push(`  ${grantMetaLine(m.grant)}`)
      lines.push(`  ${fitNotes.get(m.grant.id) ?? '[fit note]'}`)
      lines.push('')
    }
  }

  // Other matches worth a look (60-79%)
  if (otherMatches.length > 0) {
    lines.push(`Other matches worth a look`)
    lines.push('')
    for (const m of otherMatches) {
      lines.push(`• ${m.grant.title}  (${m.score}%)`)
      lines.push(`  ${grantMetaLine(m.grant)}`)
      lines.push(`  ${fitNotes.get(m.grant.id) ?? '[fit note]'}`)
      lines.push('')
    }
  }

  // Recently added
  if (recentlyAdded.length > 0) {
    lines.push(`Recently added to the catalogue`)
    lines.push('')
    for (const m of recentlyAdded) {
      lines.push(`• ${m.grant.title}  (New)`)
      lines.push(`  ${grantMetaLine(m.grant)}`)
      lines.push(`  ${fitNotes.get(m.grant.id) ?? '[recently-added note]'}`)
      lines.push('')
    }
  }

  if (topMatches.length === 0 && otherMatches.length === 0 && recentlyAdded.length === 0) {
    lines.push(`No matches came up this fortnight. We'll keep looking.`)
    lines.push('')
  }

  lines.push(`See your matches: ${MATCHES_URL}`)
  lines.push('')

  // Pipeline section: always renders the heading. If items, list them grouped
  // by stage (urgent → applying → submitted → identified). If none, show an
  // empty-state nudge so the section still has substance.
  lines.push(`Your pipeline`)
  lines.push('')
  const hasPipeline = pipelineUrgent.length > 0 || pipelineRecent.length > 0 || pipelineApplying.length > 0 || pipelineIdentified.length > 0
  if (hasPipeline) {
    for (const p of pipelineUrgent) {
      lines.push(`• ${p.grant_name}  (Urgent)`)
      lines.push(`  deadline ${formatDateISO(String(p.deadline))} · ${p.stage}`)
      lines.push('')
    }
    for (const p of pipelineApplying) {
      lines.push(`• ${p.grant_name}  (Applying)`)
      if (p.deadline) lines.push(`  deadline ${formatDateISO(String(p.deadline))}`)
      lines.push('')
    }
    for (const p of pipelineRecent) {
      lines.push(`• ${p.grant_name}  (Submitted)`)
      if (p.funder_name) lines.push(`  ${p.funder_name}`)
      lines.push('')
    }
    for (const p of pipelineIdentified) {
      lines.push(`• ${p.grant_name}  (Identified)`)
      if (p.funder_name) lines.push(`  ${p.funder_name}`)
      lines.push('')
    }
    if (identifiedTotal > pipelineIdentified.length) {
      lines.push(`...and ${identifiedTotal - pipelineIdentified.length} more in your pipeline. Open the full view: ${PIPELINE_URL}`)
      lines.push('')
    }
  } else {
    lines.push(`No pipeline items yet. Track grants you're applying to in one place. Set deadlines, record progress, and the next update will show your live applications and recent submissions.`)
    lines.push('')
    lines.push(`Open your pipeline: ${PIPELINE_URL}`)
    lines.push('')
  }

  if (member.send_first_time) {
    lines.push(FEEDBACK_INTRO)
    lines.push('')
    FEEDBACK_QUESTIONS.forEach(q => lines.push(`  • ${q}`))
    lines.push('')
    lines.push(FEEDBACK_OUTRO)
    lines.push('')
  }

  lines.push(SIGN_OFF)
  lines.push('')
  lines.push(`---`)
  lines.push(`To unsubscribe, reply with "unsubscribe" or email paul@granttracker.co.uk`)
  return lines.join('\n')
}

// ── HTML rendering (email-safe: inline styles, table-based card layout) ───────
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// Card variants:
//   top       strong-fit match (≥80%), 3px green left border, green score pill
//   other     worth-a-look (60-79%), lighter green left border, green score pill
//   recent    new addition, no border, green "New" pill
//   urgent    pipeline urgent deadline, red border + red pill
//   submitted pipeline recently submitted, blue border + blue pill
//   applying  pipeline in-flight, neutral grey border + grey pill
type CardVariant = 'top' | 'other' | 'recent' | 'urgent' | 'submitted' | 'applying' | 'identified'

const CARD_STYLE = {
  top:        { border: '#639922',     pillBg: '#EAF3DE', pillText: '#3B6D11' },
  other:      { border: '#C0DD97',     pillBg: '#EAF3DE', pillText: '#3B6D11' },
  recent:     { border: 'transparent', pillBg: '#EAF3DE', pillText: '#3B6D11' },
  urgent:     { border: '#A32D2D',     pillBg: '#F8E0DC', pillText: '#A32D2D' },
  submitted:  { border: '#185FA5',     pillBg: '#E0EAF4', pillText: '#185FA5' },
  applying:   { border: '#97C459',     pillBg: '#EAF3DE', pillText: '#3B6D11' },
  identified: { border: '#D6CFC0',     pillBg: '#F5F1E8', pillText: '#5F5E5A' },
} as const

function htmlCard(opts: {
  variant:  CardVariant
  title:    string
  pillText: string
  meta:     string
  note:     string
}): string {
  const s = CARD_STYLE[opts.variant]
  const borderStyle = s.border === 'transparent'
    ? 'border-left:3px solid transparent;'
    : `border-left:3px solid ${s.border};`
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin:0 0 12px 0;background:#F9F9F6;${borderStyle}border-radius:6px;text-align:left;">
  <tr>
    <td style="padding:14px 16px;text-align:left;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
        <tr>
          <td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;font-weight:600;color:#173404;line-height:1.35;padding-right:8px;text-align:left;">${esc(opts.title)}</td>
          <td style="text-align:right;white-space:nowrap;width:1%;"><span style="display:inline-block;background:${s.pillBg};color:${s.pillText};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:12px;font-weight:600;padding:3px 10px;border-radius:999px;">${esc(opts.pillText)}</span></td>
        </tr>
      </table>
      ${opts.meta ? `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;color:#5F5E5A;margin:4px 0 8px 0;text-align:left;">${esc(opts.meta)}</div>` : ''}
      ${opts.note ? `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;color:#2C2C2A;line-height:1.5;text-align:left;">${esc(opts.note)}</div>` : ''}
    </td>
  </tr>
</table>`.trim()
}

function renderHtml(draft: Draft): string {
  const { member, org, isDisengaged, topMatches, otherMatches, recentlyAdded,
          pipelineUrgent, pipelineRecent, pipelineApplying, pipelineIdentified, identifiedTotal, fitNotes } = draft
  const orgName = org?.name ?? 'your organisation'

  // Reusable inline-style strings. Body content text-align:left; section headers
  // and CTA explicitly text-align:center.
  const FONT_STACK = `-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif`
  const STYLE_BODY  = `margin:0;padding:0;background:#FFFFFF;font-family:${FONT_STACK};color:#2C2C2A;`
  const STYLE_WRAP  = `max-width:620px;margin:0 auto;padding:24px;font-family:${FONT_STACK};color:#2C2C2A;line-height:1.55;text-align:left;`
  const STYLE_P     = `font-family:${FONT_STACK};font-size:15px;line-height:1.6;color:#2C2C2A;margin:0 0 14px 0;text-align:left;`
  const STYLE_H2    = `font-family:${FONT_STACK};font-size:17px;font-weight:700;color:#173404;margin:28px 0 14px 0;text-align:center;`
  const STYLE_LI    = `font-family:${FONT_STACK};font-size:15px;line-height:1.55;color:#2C2C2A;margin:0 0 10px 0;text-align:left;`
  const STYLE_NOTE  = `font-family:${FONT_STACK};font-size:14px;line-height:1.5;color:#5F5E5A;font-style:italic;margin:0 0 12px 0;text-align:left;`
  const STYLE_CTA   = `display:inline-block;background:#8ECB3C;color:#173404;font-family:${FONT_STACK};font-size:15px;font-weight:600;padding:12px 22px;border-radius:8px;text-decoration:none;`
  const STYLE_CTA_WRAP = `text-align:center;margin:18px 0 8px 0;`
  const STYLE_FOOT  = `font-family:${FONT_STACK};font-size:12px;color:#8A8986;border-top:1px solid #EFEDE6;padding-top:16px;margin-top:32px;text-align:left;`

  const parts: string[] = []
  parts.push(`<!doctype html><html><head><meta charset="utf-8"><title>Grant Tracker cohort update</title></head>`)
  // Wrapper table centres the 620px column; inside, content is left-aligned.
  parts.push(`<body style="${STYLE_BODY}"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;"><tr><td align="center"><div style="${STYLE_WRAP}">`)

  parts.push(`<p style="${STYLE_P}">Hi ${esc(member.first_name)},</p>`)

  if (isDisengaged) {
    parts.push(`<p style="${STYLE_P}">${esc(DISENGAGED_CHECKIN)}</p>`)
    parts.push(`<p style="${STYLE_P}">${esc(disengagedTransition(orgName))}</p>`)
  } else if (member.send_first_time) {
    parts.push(`<p style="${STYLE_P}">${esc(WELCOME)}</p>`)
    parts.push(`<p style="${STYLE_P}">${esc(EXPECTATIONS)}</p>`)
  } else {
    for (const para of SECOND_OPENER.split('\n\n')) parts.push(`<p style="${STYLE_P}">${esc(para)}</p>`)
  }

  // "What's new" renders on every send (the fortnightly promise in EXPECTATIONS).
  parts.push(`<h2 style="${STYLE_H2}">${esc(UPDATES_HEADER)}</h2>`)
  parts.push(`<ol style="padding-left:22px;margin:0 0 8px 0;text-align:left;">`)
  for (const it of UPDATES_ITEMS) parts.push(`<li style="${STYLE_LI}">${esc(it)}</li>`)
  parts.push(`</ol>`)

  // Top matches (≥80%)
  if (topMatches.length > 0) {
    parts.push(`<h2 style="${STYLE_H2}">Your top matches this fortnight</h2>`)
    for (const m of topMatches) {
      parts.push(htmlCard({
        variant:  'top',
        title:    m.grant.title,
        pillText: `${m.score}%`,
        meta:     grantMetaLine(m.grant),
        note:     fitNotes.get(m.grant.id) ?? '[fit note]',
      }))
    }
  }

  // Other matches worth a look (60-79%)
  if (otherMatches.length > 0) {
    parts.push(`<h2 style="${STYLE_H2}">Other matches worth a look</h2>`)
    for (const m of otherMatches) {
      parts.push(htmlCard({
        variant:  'other',
        title:    m.grant.title,
        pillText: `${m.score}%`,
        meta:     grantMetaLine(m.grant),
        note:     fitNotes.get(m.grant.id) ?? '[fit note]',
      }))
    }
  }

  // Recently added
  if (recentlyAdded.length > 0) {
    parts.push(`<h2 style="${STYLE_H2}">Recently added to the catalogue</h2>`)
    for (const m of recentlyAdded) {
      parts.push(htmlCard({
        variant:  'recent',
        title:    m.grant.title,
        pillText: 'New',
        meta:     grantMetaLine(m.grant),
        note:     fitNotes.get(m.grant.id) ?? '[recently-added note]',
      }))
    }
  }

  // Empty-state if all three sections are zero
  if (topMatches.length === 0 && otherMatches.length === 0 && recentlyAdded.length === 0) {
    parts.push(`<p style="${STYLE_NOTE}">No matches came up this fortnight. We'll keep looking.</p>`)
  }

  // CTA
  parts.push(`<div style="${STYLE_CTA_WRAP}"><a href="${MATCHES_URL}" style="${STYLE_CTA}">See your matches →</a></div>`)

  // Pipeline (always-rendered: heading shown either way, items OR empty-state nudge)
  parts.push(`<h2 style="${STYLE_H2}">Your pipeline</h2>`)
  const hasPipeline = pipelineUrgent.length > 0 || pipelineRecent.length > 0 || pipelineApplying.length > 0 || pipelineIdentified.length > 0
  if (hasPipeline) {
    for (const p of pipelineUrgent) {
      parts.push(htmlCard({
        variant:  'urgent',
        title:    String(p.grant_name ?? ''),
        pillText: 'Urgent',
        meta:     `deadline ${formatDateISO(String(p.deadline ?? ''))} · ${String(p.stage ?? '')}`,
        note:     '',
      }))
    }
    for (const p of pipelineApplying) {
      parts.push(htmlCard({
        variant:  'applying',
        title:    String(p.grant_name ?? ''),
        pillText: 'Applying',
        meta:     p.deadline ? `deadline ${formatDateISO(String(p.deadline))}` : '',
        note:     '',
      }))
    }
    for (const p of pipelineRecent) {
      parts.push(htmlCard({
        variant:  'submitted',
        title:    String(p.grant_name ?? ''),
        pillText: 'Submitted',
        meta:     p.funder_name ? String(p.funder_name) : '',
        note:     '',
      }))
    }
    for (const p of pipelineIdentified) {
      parts.push(htmlCard({
        variant:  'identified',
        title:    String(p.grant_name ?? ''),
        pillText: 'Identified',
        meta:     p.funder_name ? String(p.funder_name) : '',
        note:     '',
      }))
    }
    if (identifiedTotal > pipelineIdentified.length) {
      const moreCount = identifiedTotal - pipelineIdentified.length
      parts.push(`<p style="font-family:${FONT_STACK};font-size:13px;color:#5F5E5A;margin:0 0 14px 0;text-align:left;">...and ${moreCount} more in your pipeline. <a href="${PIPELINE_URL}" style="color:#173404;">Open the full view →</a></p>`)
    }
  } else {
    // Empty-state nudge — cream-tinted block with a secondary link to the
    // pipeline view. Distinct from the green match-card treatment.
    parts.push(`
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin:0 0 12px 0;background:#F5F1E8;border-radius:6px;text-align:left;">
  <tr>
    <td style="padding:16px 18px;text-align:left;">
      <div style="font-family:${FONT_STACK};font-size:14px;line-height:1.55;color:#2C2C2A;margin:0 0 10px 0;text-align:left;">No pipeline items yet. Track grants you're applying to in one place. Set deadlines, record progress, and the next update will show your live applications and recent submissions.</div>
      <a href="${PIPELINE_URL}" style="font-family:${FONT_STACK};font-size:14px;font-weight:600;color:#173404;text-decoration:underline;">Open your pipeline →</a>
    </td>
  </tr>
</table>`.trim())
  }

  // Feedback (first send only)
  if (member.send_first_time) {
    parts.push(`<p style="${STYLE_P}">${esc(FEEDBACK_INTRO)}</p>`)
    parts.push(`<ul style="padding-left:22px;margin:0 0 14px 0;text-align:left;">`)
    for (const q of FEEDBACK_QUESTIONS) parts.push(`<li style="${STYLE_LI}">${esc(q)}</li>`)
    parts.push(`</ul>`)
    parts.push(`<p style="${STYLE_P}">${esc(FEEDBACK_OUTRO)}</p>`)
  }

  // Sign-off
  parts.push(`<p style="${STYLE_P}">${esc(SIGN_OFF).replace(/\n/g, '<br>')}</p>`)

  // Footer
  parts.push(`<div style="${STYLE_FOOT}">To unsubscribe, reply with "unsubscribe" or email <a href="${UNSUBSCRIBE_MAILTO}" style="color:#5F5E5A;">paul@granttracker.co.uk</a>.</div>`)

  parts.push(`</div></td></tr></table></body></html>`)
  return parts.join('\n')
}

// ── Main per-member assembly ──────────────────────────────────────────────────
async function assembleFor(member: CohortMember, catalogue: { grants: EnrichedGrant[]; rows: Record<string, unknown>[] }, todayISO: string): Promise<Draft> {
  const warnings: string[] = []

  const { org, multipleRows } = await loadOrgRow(member.user_id)

  // Disengagement check — fetch last_sign_in_at via admin auth.
  let daysSinceLogin: number | null = null
  let isDisengaged = false
  try {
    const userResp = await supabase.auth.admin.getUserById(member.user_id)
    const lastLogin = userResp.data?.user?.last_sign_in_at ?? null
    if (lastLogin) {
      daysSinceLogin = Math.floor((Date.now() - new Date(lastLogin).getTime()) / 86_400_000)
      if (!member.force_active_opener && daysSinceLogin > DISENGAGEMENT_THRESHOLD_DAYS) {
        isDisengaged = true
      }
    }
  } catch (err) {
    warnings.push(`Could not read last_sign_in_at: ${(err as Error).message}`)
  }

  if (!org) {
    warnings.push(`No organisation row for user ${member.user_id}, skipping.`)
    return {
      member, org: null, warnings,
      topMatches: [], otherMatches: [], recentlyAdded: [],
      pipelineUrgent: [], pipelineRecent: [], pipelineApplying: [], pipelineIdentified: [], identifiedTotal: 0,
      fitNotes: new Map(),
      isDisengaged, daysSinceLogin,
    }
  }
  if (multipleRows) warnings.push(`User has >1 organisation row; used most recently created.`)

  const excluded = await loadExclusions(member.user_id, org.id)

  // Score every catalogue grant.
  const scored: ScoredGrant[] = catalogue.grants.map((g, i) => {
    const result = computeMatchScore(g, org as Organisation)
    return {
      grant:   g,
      score:   result.score,
      reasons: [...(result.positiveReasons ?? []), ...(result.warnReasons ?? [])],
      rawRow:  catalogue.rows[i],
    }
  }).sort((a, b) => b.score - a.score)

  const { top, other, recent } = pickMatches(scored, excluded, catalogue.rows, org as Organisation)
  let pipeline = await loadPipeline(org.id, todayISO)

  // Mock pipeline injection (--mock-pipeline) — for visual verification of card states.
  if (useMockPipeline) {
    const inDays = (d: number) => {
      const dt = new Date(todayISO)
      dt.setDate(dt.getDate() + d)
      return dt.toISOString().slice(0, 10)
    }
    pipeline = {
      urgent:     [{ grant_name: 'BBC Children in Need Small Grants', deadline: inDays(7),  stage: 'applying',  funder_name: 'BBC Children in Need' }],
      recent:     [{ grant_name: 'Garfield Weston Foundation Annual Grant', deadline: null, stage: 'submitted', funder_name: 'Garfield Weston Foundation' }],
      applying:   [{ grant_name: 'Lloyds Bank Foundation Specialist Programme', deadline: inDays(45), stage: 'applying', funder_name: 'Lloyds Bank Foundation' }],
      identified: [{ grant_name: 'Children in Need Main Grant Programme', deadline: null, stage: 'identified', funder_name: 'BBC Children in Need', updated_at: new Date().toISOString() }],
      identifiedTotal: 1,
    }
    warnings.push(`Pipeline data is MOCK (--mock-pipeline); real items would normally appear here.`)
  }

  // Debug: dump top-5 scores so we can verify the matcher distribution.
  if (process.env.NEWSLETTER_DEBUG === '1') {
    console.log(`   debug top-5: ${scored.slice(0, 5).map(s => `${s.score}=${s.grant.title.slice(0, 40)}`).join(' | ')}`)
  }

  // Fit notes (LLM or placeholder)
  const fitNotes = new Map<string, string>()
  if (useLlm) {
    for (const m of top)    fitNotes.set(m.grant.id, await generateFitNote('top',    org as Organisation, m.grant, m.rawRow))
    for (const m of other)  fitNotes.set(m.grant.id, await generateFitNote('other',  org as Organisation, m.grant, m.rawRow))
    for (const m of recent) fitNotes.set(m.grant.id, await generateFitNote('recent', org as Organisation, m.grant, m.rawRow))
  } else {
    for (const m of top)    fitNotes.set(m.grant.id, `[ placeholder top fit note. Will be generated by LLM in stage 2 ]`)
    for (const m of other)  fitNotes.set(m.grant.id, `[ placeholder other-match fit note. Will be generated by LLM in stage 2 ]`)
    for (const m of recent) fitNotes.set(m.grant.id, `[ placeholder recently-added note. Will be generated by LLM in stage 2 ]`)
  }

  return {
    member,
    org: org as Organisation & { id: string; name: string },
    warnings,
    topMatches:         top,
    otherMatches:       other,
    recentlyAdded:      recent,
    pipelineUrgent:     pipeline.urgent,
    pipelineRecent:     pipeline.recent,
    pipelineApplying:   pipeline.applying,
    pipelineIdentified: pipeline.identified,
    identifiedTotal:    pipeline.identifiedTotal,
    fitNotes,
    isDisengaged,
    daysSinceLogin,
  }
}

// ── Driver ────────────────────────────────────────────────────────────────────
async function main() {
  const outDir = path.resolve(__dirname, '../tmp/newsletter-drafts')
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })

  const today = new Date().toISOString().slice(0, 10)
  console.log(`[newsletter] today=${today}  llm=${useLlm}  userFilter=${userFilter ?? '(all)'}`)
  console.log(`[newsletter] recency baseline: ${RECENCY_BASELINE}`)

  // Catalogue loaded once and reused across members.
  console.log(`[newsletter] loading catalogue...`)
  const catalogue = await loadCatalogue()
  console.log(`[newsletter] catalogue: ${catalogue.grants.length} active grants`)

  // Build target list: full cohort OR self-test OR single filtered user.
  let targets: CohortMember[]
  if (userFilter) {
    const found = [...COHORT, SELF_TEST].find(c => c.user_id === userFilter)
    if (!found) throw new Error(`No cohort/self-test member with user_id=${userFilter}`)
    targets = [found]
  } else {
    targets = COHORT
  }

  const summaryRows: string[] = []
  summaryRows.push(`Cohort newsletter draft summary, ${today}`)
  summaryRows.push(`LLM fit notes: ${useLlm ? 'YES (Anthropic Haiku)' : 'NO (placeholders)'}`)
  summaryRows.push('')
  summaryRows.push(`${'name'.padEnd(12)} ${'org'.padEnd(36)} top other recent pipeline warnings`)

  for (const member of targets) {
    console.log(`\n[newsletter] → ${member.first_name} (${member.email})`)
    const draft = await assembleFor(member, catalogue, today)

    const txtPath  = path.join(outDir, `${member.user_id}.txt`)
    const htmlPath = path.join(outDir, `${member.user_id}.html`)
    const subject  = subjectLineFor(member)

    const txtHeader = [
      `TO:      ${member.email}`,
      `SUBJECT: ${subject}`,
      '',
      `========================================`,
      '',
    ].join('\n')

    writeFileSync(txtPath,  txtHeader + renderTxt(draft))
    writeFileSync(htmlPath, renderHtml(draft))

    const pTotal = draft.pipelineUrgent.length + draft.pipelineRecent.length + draft.pipelineApplying.length + draft.pipelineIdentified.length
    const wString = draft.warnings.length > 0 ? draft.warnings.join('; ') : '-'
    summaryRows.push(
      `${member.first_name.padEnd(12)} ${(draft.org?.name ?? '(no org)').padEnd(36)} ${String(draft.topMatches.length).padStart(3)} ${String(draft.otherMatches.length).padStart(5)} ${String(draft.recentlyAdded.length).padStart(6)} ${String(pTotal).padStart(8)} ${wString}`
    )

    console.log(`   org:        ${draft.org?.name ?? '(none)'}`)
    console.log(`   opener:     ${draft.isDisengaged ? `DISENGAGED (last login ${draft.daysSinceLogin}d ago)` : 'active'}`)
    console.log(`   top:        ${draft.topMatches.length}`)
    console.log(`   other:      ${draft.otherMatches.length}`)
    console.log(`   recent:     ${draft.recentlyAdded.length}`)
    console.log(`   pipeline:   ${pTotal} (urgent=${draft.pipelineUrgent.length}, applying=${draft.pipelineApplying.length}, submitted=${draft.pipelineRecent.length}, identified=${draft.pipelineIdentified.length}${draft.identifiedTotal > draft.pipelineIdentified.length ? ` of ${draft.identifiedTotal}` : ''})`)
    for (const w of draft.warnings) console.log(`   ⚠️  ${w}`)
    console.log(`   wrote:      ${path.relative(process.cwd(), txtPath)}, ${path.relative(process.cwd(), htmlPath)}`)
  }

  writeFileSync(path.join(outDir, '_summary.txt'), summaryRows.join('\n'))
  console.log(`\n[newsletter] done. Summary: tmp/newsletter-drafts/_summary.txt`)
}

main().catch(err => {
  console.error('[newsletter] FATAL', err)
  process.exit(1)
})
