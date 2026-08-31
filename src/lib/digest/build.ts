import { getAdminDb } from '@/lib/admin/admin-db'
import { computeMatchScore } from '@/lib/matching'
import { pickProfilePrompt, promptTitleWithCount, type ProfilePrompt, type ProfileFieldLabel } from '@/lib/profile-completeness'
import { daysUntil, humanDate, plural, spell, spellCap, verb } from './text'
import { findNearMiss, nearMissMeta } from './near-miss'
import { FUNDING_TYPE_COLOUR, type FundingTypeKey } from '@/lib/funding-type-colours'
import type { Organisation, GrantOpportunity, FunderType, ImpactSector, BeneficiaryGroup, LegalStructure, FundingType } from '@/types'

/* ═══════════════════════════════════════════════════════════════════════════
   The weekly digest's data model.

   One template with conditional sections, not three templates. The ladder
   decides which sections carry content; the renderer draws whatever is there.
   `mode` exists only to change the LEAD — it never changes the shape.
   ═══════════════════════════════════════════════════════════════════════════ */

/** How far ahead "closing soon" reaches. */
export const CLOSING_WINDOW_DAYS = 42
/** Identified and untouched for this long is drifting, and the digest says so. */
export const STALLED_DAYS = 21
/** How recently a grant must have appeared to count as a NEW match. */
export const NEW_MATCH_LOOKBACK_DAYS = 30
/** Score at or above which a match is worth an email row. */
export const MATCH_FLOOR = 65
/**
 * "New this week" reaches back seven days, because the email is weekly and the
 * claim is literally "since the last one".
 */
export const NEW_THIS_WEEK_DAYS = 7

/** Caps are a safety valve for a pathological week, not an editing device. */
export const CAPS = { closing: 5, inProgress: 3, newMatches: 10, nearMisses: 2, newThisWeek: 5 } as const
/** Week one is the exception: three, closing soonest, with the real total named. */
export const WEEK_ONE_MATCHES = 3

export type DigestMode = 'full' | 'week_one' | 'thin'

export interface ClosingRow {
  kind: 'pipeline' | 'saved'
  name: string
  funder: string | null
  deadline: string
  /** "10 Sep" — for the meta line, which reads "Funder · closes 10 Sep". */
  deadlineLabel: string
  days: number
  /**
   * The status line, split so the renderer can escape both halves and embolden
   * only the second. Composing HTML here instead would mean an unescaped
   * funder or stage name reaching the email.
   *
   * Pipeline: "Added 25 Aug · " + "Identified"
   * Saved:    "Saved 11 May, never added to your pipeline. Worth a yes or a no." + null
   */
  statusPrefix: string
  statusStrong: string | null
  url: string | null
  key: string
}

export interface ProgressRow {
  name: string
  funder: string | null
  /**
   * What sits right-aligned opposite the name. Normally the stage
   * ("Submitted"), but a drifting row says so instead and is rendered in the
   * danger colour — the one honest discomfort the spec asks to keep.
   */
  stageLabel: string
  url: string | null
  stalled: boolean
  key: string
}

export interface MatchRow {
  title: string
  funder: string
  blurb: string
  /** 'grant' | 'programme' | 'investment' | 'in_kind' — drawn as a pill. */
  type: FundingTypeKey
  meta: string
  /** Days to the deadline, for the week-one countdown tile. Null if undated. */
  days: number | null
  url: string | null
  key: string
}

export interface NearMissRow {
  title: string
  funder: string
  type: FundingTypeKey
  /** "Network for Social Change · £25k – £100k" */
  meta: string
  /** "Ruled out on legal structure." — the verdict, plainly. */
  verdict: string
  /** The funder's actual rule. */
  rule: string
  /** What would change it. */
  condition: string
  url: string | null
  key: string
}

export interface DigestModel {
  org: Organisation
  mode: DigestMode
  subject: string
  preheader: string
  /** The compact factual summary under "Upcoming deadlines". Never a headline. */
  lead: string
  closing: ClosingRow[]
  closingOverflow: number
  inProgress: ProgressRow[]
  inProgressOverflow: number
  matches: MatchRow[]
  matchesOverflow: number
  /** Week one only: the real total, so "See all 24 matches" can be honest. */
  matchTotal: number
  /**
   * What the match section may honestly be CALLED.
   *   'first'         — week one: the whole list at once, so not "new"
   *   'new'           — every row shown was added to the catalogue recently
   *   'worth_a_look'  — unshown but not recent; calling these "new" would lie
   * The week-one label exists in the spec for exactly this reason; this is the
   * same correction applied to the other two cases.
   */
  matchLabel: 'first' | 'new' | 'worth_a_look'
  /**
   * Added to the catalogue in the last seven days AND open to this
   * organisation — regardless of score.
   *
   * Deliberately not "latest regardless of everything". A row the reader
   * cannot apply for is filler, and the digest is an exception report rather
   * than inventory. Eligibility is the line that keeps this a report: these
   * are new AND theirs, they are simply not ranked.
   *
   * Empty most weeks, and that is expected rather than a fault — the catalogue
   * published nothing at all in the seven days before this was built. The
   * section is absent when empty; it never announces that there is nothing.
   */
  newThisWeek: MatchRow[]
  nearMisses: NearMissRow[]
  prompt: { title: string; body: string; cta: string; href: string } | null
  /** "Nothing else in your pipeline or saved list closes before 14 October." */
  reassurance: string | null
  catalogue: { live: number; addedRecently: number }
  /** Everything shown, for digest_sent_items. */
  shown: { section: string; key: string }[]
  /**
   * Dry-run diagnostics. Never rendered — it exists so "why did THAT row win
   * the near-miss slot?" is answerable without adding a console.log and
   * redeploying, which is how that question got answered twice already.
   */
  debug: {
    nearMissCandidates: { title: string; score: number; soleBlocker: boolean; dimension: string }[]
    nearMissCandidateCount: number
  }
}

/** Spec §4c orders the dimensions; a structure row is the most compelling. */
const DIMENSION_RANK: Record<string, number> = { structure: 0, amount: 1, income: 2 }

/** One comparator, used by both the shown list and the diagnostic. */
function byNearness(
  a: { score: number; soleBlocker: boolean; dimension: string },
  b: { score: number; soleBlocker: boolean; dimension: string },
): number {
  return Number(b.soleBlocker) - Number(a.soleBlocker)
    || (DIMENSION_RANK[a.dimension] ?? 9) - (DIMENSION_RANK[b.dimension] ?? 9)
    || b.score - a.score
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const VALID_FUNDER_TYPES: FunderType[] = [
  'trust_foundation', 'community_foundation', 'corporate_foundation', 'capacity_builder',
  'local_authority', 'housing_association', 'corporate', 'lottery', 'government',
  'competition', 'loan', 'crowdfund_match', 'other',
]

function normalise(row: Record<string, unknown>): GrantOpportunity {
  const rawType = String(row.funder_type ?? 'other')
  return {
    id:                  String(row.external_id ?? row.id),
    title:               String(row.title ?? ''),
    funder:              String(row.funder ?? 'Unknown funder'),
    funderType:          (VALID_FUNDER_TYPES.includes(rawType as FunderType) ? rawType : 'other') as FunderType,
    description:         String(row.description ?? ''),
    amountMin:           typeof row.amount_min === 'number' ? row.amount_min : 0,
    amountMax:           typeof row.amount_max === 'number' ? row.amount_max : 0,
    deadline:            row.deadline ? String(row.deadline) : null,
    isRolling:           Boolean(row.is_rolling),
    isLocal:             Boolean(row.is_local),
    locationTag:         row.location_tag ? String(row.location_tag) : null,
    sectors:             Array.isArray(row.sectors) ? (row.sectors as string[]) : [],
    impactSectors:       Array.isArray(row.impact_sectors) ? (row.impact_sectors as ImpactSector[]) : undefined,
    eligibilityCriteria: Array.isArray(row.eligibility_criteria) ? (row.eligibility_criteria as string[]) : [],
    eligibleStructures:  Array.isArray(row.eligible_structures) ? (row.eligible_structures as LegalStructure[]) : undefined,
    // Present here and absent from the alert path's April snapshot — without it
    // the beneficiary dimension silently scores differently from the app.
    beneficiaryGroups:   Array.isArray(row.target_beneficiaries) ? (row.target_beneficiaries as BeneficiaryGroup[]) : undefined,
    applyUrl:            row.apply_url ? String(row.apply_url) : null,
    isInviteOnly:        Boolean(row.is_invite_only),
    // Needed by the income near-miss test, and previously dropped here, which
    // meant the digest's copy of a grant disagreed with the matcher's.
    minOrgIncome:        typeof row.min_org_income === 'number' ? row.min_org_income : null,
    maxOrgIncome:        typeof row.max_org_income === 'number' ? row.max_org_income : null,
    nextOpenDate:        row.next_open_date ? String(row.next_open_date) : null,
    fundingType:         (row.funding_type ? String(row.funding_type) : 'grant') as FundingType,
    source:              'scraped',
    dateAdded:           row.first_seen_at ? String(row.first_seen_at).split('T')[0] : undefined,
    lastVerifiedAt:      row.last_seen_at ? String(row.last_seen_at).split('T')[0] : undefined,
  }
}

/**
 * The verdict names the DIMENSION, because that is what tells a reader whether
 * to argue with it. "Ruled out on area" invites someone whose work reaches the
 * next borough to get in touch; "ruled out on eligibility" invites nothing.
 */
function verdictFor(rule: string): string {
  const r = rule.toLowerCase()
  if (/restricted to|your org is in|area|region|borough|county|postcode/.test(r)) return 'Ruled out on area.'
  if (/structure|cic|charity|charitable|incorporat|unincorporat|company/.test(r))  return 'Ruled out on legal structure.'
  if (/income|turnover|budget|size|threshold/.test(r))                             return 'Ruled out on size.'
  return 'Ruled out on eligibility.'
}

/**
 * Where a grant link goes: the card in FIND FUNDING.
 *
 * Third destination and the right one. /grants/<id> is the public bridge page
 * for strangers arriving from search; /dashboard/grants/<id> is an older
 * standalone page. The card a member actually works from lives in Find
 * Funding, which pins a single opportunity from ?grant= and resolves either a
 * uuid or an external_id, so the same slug used everywhere else works here.
 *
 * A logged-out reader still arrives: middleware redirects to
 * /auth/login?next=<this path>, so they sign in and land on the card rather
 * than being dumped on the dashboard.
 */
/**
 * "10 Sep" — the meta line's date format, distinct from the prose "14 October".
 *
 * The month list is explicit rather than from toLocaleString: en-GB's 'short'
 * month renders September as "Sept", four characters where every other month
 * is three, and the ragged column shows.
 */
export const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

/**
 * "10 Sep", or "30 Jun 2027" once the year stops being obvious.
 *
 * The year is not decoration. Champions for Children closes on 2027-06-30 —
 * 303 days out — and rendered as "closes 30 Jun" beside deadlines ten days
 * away, which reads as either imminent or already gone. Omitting the year is
 * right within the current year and actively misleading across a boundary.
 */
export function shortDate(iso: string, now: Date = new Date()): string {
  const d = new Date(iso)
  const year = d.getUTCFullYear() === now.getUTCFullYear() ? '' : ` ${d.getUTCFullYear()}`
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}${year}`
}

/**
 * The near-miss rule, in the funder's terms rather than ours.
 *
 * The eligibility engine phrases a structure block as "CIC (limited by
 * guarantee) is not in the eligible structures list (Registered charity, ...)".
 * That is accurate and it is our vocabulary: nobody says "eligible structures
 * list" aloud, and the sentence leads with the reader's failure rather than
 * with what the funder actually does.
 *
 * Rewritten to "They fund A, B and C. Our record has you as X." — same facts,
 * funder first, and it names our record as ours so the reader knows which half
 * to argue with. Anything that does not match the pattern is passed through
 * untouched rather than mangled.
 */
export function plainRule(rule: string): string {
  const m = rule.match(/^(.+?) is not in the eligible structures list \((.+)\)\.?$/i)
  if (!m) return rule
  const you = m[1].trim()
  const allowed = m[2].split(',').map(x => x.trim()).filter(Boolean)
  if (!allowed.length) return rule
  const list = allowed.length === 1
    ? allowed[0]
    : `${allowed.slice(0, -1).join(', ')} and ${allowed[allowed.length - 1]}`
  return `They fund ${list}. Our record has you as ${you}.`
}

/**
 * What KIND of opportunity this is, first in the meta line.
 *
 * A loan, a volunteer placement and a £10k grant were sitting in one
 * undifferentiated list, and the only thing distinguishing them was whether
 * the blurb happened to mention it — Charterpath's had to say "This is not a
 * grant programme, it is a volunteer placement service" to do the type's job.
 *
 * Shown on EVERY row including grants, even though grants are 476 of the 581
 * published. Labelling only the exceptions would make absence carry the
 * meaning, and a reader cannot know that no label means grant unless somebody
 * tells them. Four characters on the common case is a fair price for never
 * being ambiguous on the other 105.
 *
 * A word rather than a coloured pill: the countdown tiles are meant to be the
 * only saturated colour in the email, and four more accents would compete with
 * the one thing that is supposed to signal urgency.
 */
function typeKey(g: Record<string, unknown>): FundingTypeKey {
  const k = String(g.funding_type ?? 'grant') as FundingTypeKey
  return FUNDING_TYPE_COLOUR[k] ? k : 'grant'
}

/** One shape for every opportunity row, so the two sections cannot drift. */
function toMatchRow(g: Record<string, unknown>, origin: string, now: Date, blurb: string): MatchRow {
  const parts = [
    String(g.funder ?? ''),
    g.deadline ? `closes ${shortDate(String(g.deadline), now)}` : g.is_rolling ? 'rolling' : null,
  ].filter(Boolean) as string[]
  return {
    title: String(g.title ?? ''),
    funder: String(g.funder ?? ''),
    blurb,
    type: typeKey(g),
    meta: parts.join(' · '),
    days: g.deadline ? daysUntil(String(g.deadline), now) : null,
    url: grantUrl(origin, g),
    key: String(g.id),
  }
}

function grantUrl(origin: string, row: Record<string, unknown>): string {
  return `${origin}/dashboard/search?grant=${encodeURIComponent(String(row.external_id ?? row.id))}`
}

/**
 * The match blurb — the product, not decoration.
 *
 * Built from the funder's OWN words (`funder_brief.what_they_fund` and
 * `exclusions`, present on 572 and 504 of 581 published rows), not from the
 * scorer's internals.
 *
 * The first version composed it from `positiveReasons`/`warnReasons` and
 * produced "Community aligns with Asian Community Concern's work — beneficiary
 * group: partial overlap with this funder". That is our vocabulary leaking
 * out: nobody says "beneficiary group" aloud, and the sentence tells a
 * fundraiser nothing about whether to spend a week on the application. It
 * passed every check I had written, which is exactly how a bad blurb ships.
 *
 * The bar, from the spec: it must tell someone whether this is worth their
 * week. "Funds arts projects in the UK" does not clear it, so a row whose
 * brief cannot produce better returns null and does not appear at all.
 *
 * The exclusion is deliberately kept. A digest that only lists reasons to
 * apply is a sales email, and the caveat is the half that makes the rest
 * trustworthy.
 */
function firstSentence(text: string, limit: number): string | null {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return null
  const m = clean.match(/^(.{20,}?[.!?])(\s|$)/)
  let out = m ? m[1] : clean
  if (out.length > limit) {
    const cut = out.slice(0, limit)
    const sp = cut.lastIndexOf(' ')
    out = `${(sp > 40 ? cut.slice(0, sp) : cut).replace(/[,;:]$/, '')}…`
  }
  return out
}

function buildBlurb(brief: unknown): string | null {
  if (!brief || typeof brief !== 'object') return null
  const b = brief as Record<string, unknown>
  const what = typeof b.what_they_fund === 'string' ? firstSentence(b.what_they_fund, 165) : null
  // No description of what they fund means no row. Enforced here rather than
  // left to review, because "generic ones do not ship" only holds if something
  // drops them.
  if (!what) return null
  // An exclusions field that says there are none is not a caveat, and pasting
  // "No explicit exclusions stated" onto the end of every blurb is noise that
  // makes the real exclusions easier to skim past.
  const rawExcl = typeof b.exclusions === 'string' ? b.exclusions : ''
  const saysNone = /^\s*(no(ne)?\b[^.]{0,40}(exclusion|stated|specified|listed)|not stated|n\/a)/i.test(rawExcl)
  const excl = rawExcl && !saysNone ? firstSentence(rawExcl, 95) : null
  return excl ? `${what} ${excl}` : what
}

export interface BuildOptions {
  origin: string
  now?: Date
  /** Sections and items already shown recently, from digest_sent_items. */
  recentlyShown?: { section: string; item_key: string }[]
}

export async function buildDigest(
  org: Organisation & { owner_email?: string },
  opts: BuildOptions,
): Promise<DigestModel | null> {
  const db = getAdminDb()
  const now = opts.now ?? new Date()
  const origin = opts.origin
  const seen = new Set((opts.recentlyShown ?? []).map(r => `${r.section}:${r.item_key}`))
  const shown: { section: string; key: string }[] = []

  /* ── Sources ──────────────────────────────────────────────────────────── */
  const [{ data: pipeline }, { data: interactions }, { data: catalogueRows }] = await Promise.all([
    db.from('pipeline_items').select('*').eq('org_id', org.id),
    db.from('grant_interactions').select('grant_id, created_at').eq('org_id', org.id).eq('action', 'saved'),
    db.from('scraped_grants').select('*').eq('is_active', true).eq('pipeline_state', 'published'),
  ])

  const grants = (catalogueRows ?? []) as Record<string, unknown>[]
  const byId = new Map<string, Record<string, unknown>>()
  const byTitle = new Map<string, Record<string, unknown>>()
  for (const g of grants) {
    byId.set(String(g.id), g)
    if (g.external_id) byId.set(String(g.external_id), g)
    const t = String(g.title ?? '').trim().toLowerCase()
    if (t && !byTitle.has(t)) byTitle.set(t, g)
  }

  /**
   * Where a pipeline row should point.
   *
   * pipeline_items.grant_url holds the FUNDER's own page, so linking it sent
   * the reader straight out of the product — from an email whose whole job is
   * to get somebody into Shoots on a Tuesday. Resolve the item back to its
   * catalogue row by title and link there instead; the funder's page is one
   * click further on, where it belongs. Falls back to the funder URL, then to
   * the dashboard, so a row that is not in the catalogue is still reachable.
   */
  const pipelineHref = (p: Record<string, unknown>, fallback: string): string => {
    const hit = byTitle.get(String(p.grant_name ?? '').trim().toLowerCase())
    if (hit) return grantUrl(origin, hit)
    return p.grant_url ? String(p.grant_url) : fallback
  }

  /* ── 1. Closing soon: pipeline and saved, interleaved by days remaining ── */
  const closing: ClosingRow[] = []

  for (const p of (pipeline ?? []) as Record<string, unknown>[]) {
    if (!p.deadline) continue
    const days = daysUntil(String(p.deadline), now)
    if (days < 0 || days > CLOSING_WINDOW_DAYS) continue
    const stage = String(p.stage ?? 'identified')
    const added = p.created_at ? shortDate(String(p.created_at).split('T')[0]) : null
    closing.push({
      kind: 'pipeline',
      name: String(p.grant_name ?? 'Untitled'),
      funder: p.funder_name ? String(p.funder_name) : null,
      deadline: String(p.deadline),
      deadlineLabel: shortDate(String(p.deadline), now),
      days,
      statusPrefix: added ? `Added ${added} · ` : '',
      statusStrong: stage.charAt(0).toUpperCase() + stage.slice(1),
      url: pipelineHref(p, `${origin}/dashboard/deadlines`),
      key: String(p.id),
    })
  }

  // A saved grant carries an explicit signal from the reader but no commitment,
  // so it sits between a match and a pipeline item — and what it needs is a
  // DECISION, not a nudge. Letting it go is a valid outcome; a digest that only
  // ever pushes toward applying is nagging.
  for (const i of (interactions ?? []) as Record<string, unknown>[]) {
    const g = byId.get(String(i.grant_id))
    if (!g?.deadline) continue
    const days = daysUntil(String(g.deadline), now)
    if (days < 0 || days > CLOSING_WINDOW_DAYS) continue
    const savedOn = i.created_at ? humanDate(String(i.created_at).split('T')[0]) : null
    closing.push({
      kind: 'saved',
      name: String(g.title ?? 'Untitled'),
      funder: g.funder ? String(g.funder) : null,
      deadline: String(g.deadline),
      deadlineLabel: shortDate(String(g.deadline), now),
      days,
      statusPrefix: savedOn
        ? `Saved ${savedOn}, never added to your pipeline. Worth a yes or a no.`
        : 'Saved, never added to your pipeline. Worth a yes or a no.',
      statusStrong: null,
      url: grantUrl(origin, g),
      key: String(g.id),
    })
  }

  closing.sort((a, b) => a.days - b.days)
  const closingOverflow = Math.max(0, closing.length - CAPS.closing)
  const closingShown = closing.slice(0, CAPS.closing)
  closingShown.forEach(r => shown.push({ section: 'closing', key: r.key }))

  /* ── 2. Also in progress ─────────────────────────────────────────────── */
  const closingKeys = new Set(closingShown.map(r => r.key))
  const inProgressAll: ProgressRow[] = []
  for (const p of (pipeline ?? []) as Record<string, unknown>[]) {
    if (closingKeys.has(String(p.id))) continue
    const stage = String(p.stage ?? 'identified')
    if (stage === 'won' || stage === 'declined') continue
    const updated = p.updated_at ? new Date(String(p.updated_at)) : null
    const idleDays = updated ? Math.floor((now.getTime() - updated.getTime()) / 86_400_000) : 0
    const stalled = stage === 'identified' && idleDays >= STALLED_DAYS
    const weeks = Math.floor(idleDays / 7)
    inProgressAll.push({
      name: String(p.grant_name ?? 'Untitled'),
      funder: p.funder_name ? String(p.funder_name) : null,
      url: pipelineHref(p, `${origin}/dashboard/pipeline`),
      // Only said when true. A digest that notices you have stalled is a tool;
      // one that says it every week is noise.
      stageLabel: stalled
        ? `No movement in ${plural(weeks, 'week')}`
        : stage.charAt(0).toUpperCase() + stage.slice(1),
      stalled,
      key: String(p.id),
    })
  }
  // Drifting rows first: they are the ones that need a decision.
  inProgressAll.sort((a, b) => Number(b.stalled) - Number(a.stalled))
  const inProgressOverflow = Math.max(0, inProgressAll.length - CAPS.inProgress)
  const inProgress = inProgressAll.slice(0, CAPS.inProgress)
  inProgress.forEach(r => shown.push({ section: 'in_progress', key: r.key }))

  /* ── 3. New matches ──────────────────────────────────────────────────── */
  const pipelineNames = new Set(((pipeline ?? []) as Record<string, unknown>[]).map(p => String(p.grant_name ?? '').toLowerCase()))
  const savedIds = new Set(((interactions ?? []) as Record<string, unknown>[]).map(i => String(i.grant_id)))

  const scored: { row: Record<string, unknown>; score: number; blurb: string | null; fresh: boolean }[] = []
  const newThisWeekAll: { row: Record<string, unknown>; score: number }[] = []
  // Scored, because "the first two the catalogue happened to yield" is not the
  // same as "the two nearest". Ranked below.
  const nearMissCandidates: { row: NearMissRow; score: number; soleBlocker: boolean; dimension: string }[] = []

  for (const g of grants) {
    if (savedIds.has(String(g.id)) || savedIds.has(String(g.external_id ?? ''))) continue
    if (pipelineNames.has(String(g.title ?? '').toLowerCase())) continue

    // A closed opportunity is not a match. The catalogue still carries rows
    // that are active and published with a deadline months in the past — the
    // thin-week render offered "Champions for Children · closes 30 Jun" on
    // 31 August — and the closing section filters those out while the match
    // list did not. Rolling funds have no deadline to pass.
    if (g.deadline && !g.is_rolling && daysUntil(String(g.deadline), now) < 0) continue

    const normalised = normalise(g)
    const result = computeMatchScore(normalised, org)
    const firstSeen = g.first_seen_at ? new Date(String(g.first_seen_at)) : null
    const fresh = !!firstSeen && (now.getTime() - firstSeen.getTime()) / 86_400_000 <= NEW_MATCH_LOOKBACK_DAYS

    const blurb = buildBlurb(g.funder_brief)

    // New this week and open to them. Score is deliberately ignored: the claim
    // is "this arrived and you can apply for it", not "this is a good match".
    // Eligibility is what stops it becoming a feed of things they cannot use.
    if (
      blurb &&
      firstSeen &&
      (now.getTime() - firstSeen.getTime()) / 86_400_000 <= NEW_THIS_WEEK_DAYS &&
      result.eligibilityStatus !== 'ineligible' &&
      !seen.has(`new_match:${String(g.id)}`)
    ) {
      newThisWeekAll.push({ row: g, score: result.score })
    }

    if (result.score >= MATCH_FLOOR) {
      scored.push({ row: g, score: result.score, blurb, fresh })
      continue
    }

    // Near miss. Two tests, not one: proximity AND actionability. A reason on
    // its own is not enough — every rejected row has a reason, and only a few
    // are near. findNearMiss() returns null unless the row is genuinely close
    // on a dimension the reader can do something about, and it never returns
    // area at all.
    const blockers = (result.eligibilityIssues ?? []).filter(i => i.severity === 'blocker')
    if (result.score < MATCH_FLOOR && result.score > 5) {
      const near = findNearMiss({
        grant: normalised,
        org,
        readOn: g.last_seen_at ? humanDate(String(g.last_seen_at).split('T')[0]) : null,
        // "Everything else fits" is a claim, not a flourish. Only say it when
        // this really is the single thing standing in the way.
        otherwiseFits: blockers.length <= 1,
      })
      if (near) {
        nearMissCandidates.push({
          score: result.score,
          soleBlocker: blockers.length <= 1,
          dimension: near.dimension,
          row: {
            title: String(g.title ?? ''),
            funder: String(g.funder ?? ''),
              type: typeKey(g),
            meta: nearMissMeta(normalised, g.location_tag ? String(g.location_tag) : null),
            verdict: near.verdict,
            rule: near.rule,
            condition: near.condition,
            url: grantUrl(origin, g),
            key: String(g.id),
          },
        })
      }
    }
  }

  scored.sort((a, b) => b.score - a.score)
  // A blurb that is not conditional and specific does not earn a row.
  const withBlurb = scored.filter(s => s.blurb)

  const hasHistory = (pipeline?.length ?? 0) > 0 || (interactions?.length ?? 0) > 0

  // Newest first, then score. Built BEFORE the ranked list so these rows can be
  // excluded from it — the same fund appearing under "New this week" and again
  // under "Matches worth a look" in one email is the kind of thing that makes a
  // digest look automated.
  //
  // This section IS filtered by send history, unlike the ranked list below. The
  // claim it makes is "this arrived since we last wrote", so showing the same
  // row twice would make the heading untrue.
  const newThisWeek: MatchRow[] = newThisWeekAll
    .sort((a, b) => {
      const da = a.row.first_seen_at ? new Date(String(a.row.first_seen_at)).getTime() : 0
      const db = b.row.first_seen_at ? new Date(String(b.row.first_seen_at)).getTime() : 0
      return db - da || b.score - a.score
    })
    .slice(0, CAPS.newThisWeek)
    .map(({ row: g }) => toMatchRow(g, origin, now, buildBlurb(g.funder_brief) ?? ''))
  newThisWeek.forEach(r => shown.push({ section: 'new_match', key: r.key }))
  const newThisWeekKeys = new Set(newThisWeek.map(r => r.key))

  // The ranked list is NOT filtered by what we have already shown, and that is
  // a deliberate reversal.
  //
  // It used to exclude anything recorded in digest_sent_items, which walked the
  // reader down their own ranking a page at a time. ACC has exactly ten matches
  // above the floor: the first send showed all ten, the next week's section was
  // empty and disappeared, and the whole list returned a month later when the
  // suppression window expired. Feast, a month of nothing, feast.
  //
  // The no-repeat rule in the spec is about the OPTIONAL sections — near
  // misses, the profile prompt, rounds opening. Matches are rung 3 and are not
  // optional. For a profile that has not changed, the right behaviour is that
  // this section does not change either: these are still their best matches,
  // and rotating down to the eleventh-to-twentieth best to manufacture novelty
  // makes the email worse every week.
  //
  // "New this week" carries the novelty now, and it is honest about it because
  // it filters on recency rather than on whatever we happened to show somebody.
  //
  // Still deduped against that section, so one fund cannot appear twice in one
  // email under two headings.
  const unshown = withBlurb.filter(s => !newThisWeekKeys.has(String(s.row.id)))
  unshown.sort((a, b) => Number(b.fresh) - Number(a.fresh) || b.score - a.score)

  // Week one names its sort out loud — "here are the three closing soonest" —
  // so week one must actually sort by deadline. The first version claimed that
  // sentence while sorting by score, which is the kind of small lie that is
  // impossible to spot from the outside and corrodes everything else.
  if (!hasHistory) {
    unshown.sort((a, b) => {
      const da = a.row.deadline ? daysUntil(String(a.row.deadline), now) : Infinity
      const db = b.row.deadline ? daysUntil(String(b.row.deadline), now) : Infinity
      return da - db || b.score - a.score
    })
  }

  const matchPool = unshown
  const matchTotal = matchPool.length
  // Week one shows three. The whole match list arrives at once, and a first
  // email that opens with ten rows is a catalogue dump rather than a start.
  const matchCap = hasHistory ? CAPS.newMatches : WEEK_ONE_MATCHES
  const matchesOverflow = Math.max(0, matchTotal - matchCap)

  const matches: MatchRow[] = matchPool.slice(0, matchCap).map(s => toMatchRow(s.row, origin, now, s.blurb!))
  matches.forEach(m => shown.push({ section: 'new_match', key: m.key }))

  const shownPool = matchPool.slice(0, matchCap)
  const matchLabel: DigestModel['matchLabel'] =
    !hasHistory              ? 'first'
    : shownPool.every(s => s.fresh) ? 'new'
    : 'worth_a_look'

  /* ── 6. Near misses — rotate, cap at two, never repeat an item ────────── */
  // Nearest first, and "near" is not the same as "scored highest".
  //
  // Three keys, in order:
  //   1. Sole blocker. A row where this dimension is the only thing in the way
  //      is genuinely one step from qualifying; one with three blockers is near
  //      on one axis and far on the rest, and wastes a slot the reader only
  //      gets two of.
  //   2. Dimension, in the spec's own order. A structure near miss is the most
  //      compelling row in the email — "they fund companies limited by
  //      guarantee, but not CICs, and you are both" is something the reader can
  //      raise with the funder tomorrow. An amount near miss is weaker, and
  //      ranking purely on score buried every structure row under a pile of
  //      funds that happen to give slightly too little.
  //   3. Score, to break ties inside a dimension.
  const nearMisses = nearMissCandidates
    .filter(n => !seen.has(`near_miss:${n.row.key}`))
    .sort(byNearness)
    .slice(0, CAPS.nearMisses)
    .map(n => n.row)
  nearMisses.forEach(n => shown.push({ section: 'near_miss', key: n.key }))

  /* ── 7. Profile prompt ───────────────────────────────────────────────── */
  const promptedRecently = (opts.recentlyShown ?? [])
    .filter(r => r.section === 'profile_prompt')
    .map(r => r.item_key as ProfileFieldLabel)
  const promptPick: ProfilePrompt | null = pickProfilePrompt(org, promptedRecently)
  let prompt: DigestModel['prompt'] = null
  if (promptPick) {
    // Count only what can be counted. An invented figure on a product whose
    // pitch is verified data is the worst possible place to guess.
    let count: number | null = null
    if (promptPick.field === 'Annual income') {
      count = grants.filter(g => g.eligibility_criteria && String(g.eligibility_criteria).toLowerCase().includes('income')).length || null
    }
    prompt = {
      title: promptTitleWithCount(promptPick, count),
      body: promptPick.body,
      cta: promptPick.cta,
      href: `${origin}/dashboard/profile#card-${promptPick.card}`,
    }
    shown.push({ section: 'profile_prompt', key: promptPick.field })
  }

  /* ── The reassurance line. Load-bearing, not filler. ──────────────────── */
  // An exception report is only trustworthy if it says what it checked.
  // Without this, silence could equally mean "nothing to report" or "we did
  // not look".
  const laterDeadlines: number[] = []
  for (const p of (pipeline ?? []) as Record<string, unknown>[]) {
    if (p.deadline) { const d = daysUntil(String(p.deadline), now); if (d > CLOSING_WINDOW_DAYS) laterDeadlines.push(d) }
  }
  for (const i of (interactions ?? []) as Record<string, unknown>[]) {
    const g = byId.get(String(i.grant_id))
    if (g?.deadline) { const d = daysUntil(String(g.deadline), now); if (d > CLOSING_WINDOW_DAYS) laterDeadlines.push(d) }
  }
  laterDeadlines.sort((a, b) => a - b)
  const nextIso = laterDeadlines.length
    ? new Date(now.getTime() + laterDeadlines[0] * 86_400_000).toISOString().slice(0, 10)
    : null
  // In a thin week the LEAD already says nothing is closing, so a reassurance
  // line underneath repeats it word for word. The render put "A clear month.
  // Nothing in your pipeline or saved list is closing." directly above
  // "Nothing else in your pipeline or saved list has a deadline coming up."
  //
  // The line stays load-bearing where it belongs: under a list of things that
  // ARE closing, where it says what else was checked and found clear.
  const reassurance = hasHistory && closingShown.length > 0
    ? nextIso
      ? `Nothing else in your pipeline or saved list closes before ${humanDate(nextIso)}.`
      : 'Nothing else in your pipeline or saved list has a deadline coming up.'
    : null

  /* ── Mode, lead, subject, preheader ───────────────────────────────────── */
  const mode: DigestMode = !hasHistory ? 'week_one' : closingShown.length === 0 ? 'thin' : 'full'

  // The content floor. Nothing to say means no send — a digest that says
  // "nothing this week" teaches someone the email is ignorable before it has
  // ever been useful.
  if (!closingShown.length && !inProgress.length && !matches.length && !newThisWeek.length && !nearMisses.length && !prompt) {
    return null
  }

  let lead: string
  let subject: string
  if (mode === 'week_one') {
    lead = `${spellCap(matchTotal)} ${matchTotal === 1 ? 'opportunity is' : 'opportunities are'} open to you right now. Here ${matches.length === 1 ? 'is the one' : `are the ${spell(matches.length)}`} closing soonest.`
    subject = `${plural(matchTotal, 'funding opportunity is', 'funding opportunities are')} open to ${org.name}`
  } else if (mode === 'thin') {
    lead = nextIso
      ? `A clear month. Nothing closes before ${humanDate(nextIso)}.`
      : 'A clear month. Nothing in your pipeline or saved list is closing.'
    const stalledRow = inProgress.find(r => r.stalled)
    subject = stalledRow
      ? `${stalledRow.name} has not moved in three weeks`
      : matches.length
        ? `${plural(matches.length, 'new match', 'new matches')} for ${org.name}`
        : `Nothing closes for ${org.name} this month`
  } else {
    const n = closingShown.length
    const nearest = closingShown[0]
    const savedOne = closingShown.find(r => r.kind === 'saved')
    lead = `${spellCap(n)} ${verb(n, 'closes', 'close')} in the next ${spell(CLOSING_WINDOW_DAYS / 7)} weeks. The nearest is ${nearest.days === 0 ? 'today' : `${spell(nearest.days)} ${nearest.days === 1 ? 'day' : 'days'} away`}${savedOne ? ', and one is a grant you saved and never decided on' : ''}.`
    subject = `${nearest.name} closes in ${plural(nearest.days, 'day')}`
  }

  /* The preheader carries what the subject could not, composed from the SAME
     data the body renders — otherwise the inbox promises something the email
     does not contain. */
  let preheader: string
  if (mode === 'week_one') {
    preheader = `The ${spell(matches.length)} closing soonest${nearMisses.length ? `, and ${spell(nearMisses.length)} that fell just outside with the reason why` : ''}.`
  } else {
    const bits: string[] = []
    if (inProgress.length) bits.push(`${spell(inProgress.length)} ${inProgress.length === 1 ? 'application' : 'applications'} in flight`)
    if (matches.length) {
      // Must agree with the heading the reader will see. "10 new matches" above
      // a section headed "Matches worth a look" is the same broken promise.
      bits.push(matchLabel === 'new'
        ? `${spell(matches.length)} new ${matches.length === 1 ? 'match' : 'matches'}`
        : `${spell(matches.length)} ${matches.length === 1 ? 'match' : 'matches'} worth a look`)
    }
    preheader = bits.length
      ? `Plus ${bits.join(' and ')} for ${org.name}.`
      : reassurance ?? ''
  }

  /* ── Catalogue growth, footer only, never leading ─────────────────────── */
  // The footer line reads "added in the last two weeks", so the window is two
  // weeks. It said thirty days while the copy said a fortnight.
  const fortnightAgo = new Date(now.getTime() - 14 * 86_400_000)
  const catalogue = {
    live: grants.length,
    addedRecently: grants.filter(g => g.first_seen_at && new Date(String(g.first_seen_at)) >= fortnightAgo).length,
  }

  // Subjects are composed from user data, and pipeline items carry whatever
  // name somebody typed. Reprezent's produced "youth music has not moved in
  // three weeks" — a sentence starting mid-word. Capitalising the first letter
  // is the smallest honest fix; renaming their pipeline item is not ours to do.
  const finalSubject = subject.charAt(0).toUpperCase() + subject.slice(1)

  return {
    org, mode, subject: finalSubject, preheader, lead,
    closing: closingShown, closingOverflow,
    inProgress, inProgressOverflow,
    matches, matchesOverflow, matchTotal, matchLabel, newThisWeek,
    nearMisses, prompt, reassurance, catalogue, shown,
    debug: {
      // The SAME comparator the shown list uses. It briefly had its own, which
      // made the diagnostic disagree with the email it was meant to explain —
      // the one thing a diagnostic must never do.
      nearMissCandidates: [...nearMissCandidates]
        .sort(byNearness)
        .slice(0, 8)
        .map(n => ({ title: n.row.title, score: n.score, soleBlocker: n.soleBlocker, dimension: n.dimension })),
      nearMissCandidateCount: nearMissCandidates.length,
    },
  }
}
