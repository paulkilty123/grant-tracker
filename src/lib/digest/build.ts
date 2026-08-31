import { getAdminDb } from '@/lib/admin/admin-db'
import { computeMatchScore } from '@/lib/matching'
import { pickProfilePrompt, promptTitleWithCount, type ProfilePrompt, type ProfileFieldLabel } from '@/lib/profile-completeness'
import { daysUntil, humanDate, plural, spell, spellCap, verb } from './text'
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

/** Caps are a safety valve for a pathological week, not an editing device. */
export const CAPS = { closing: 5, inProgress: 3, newMatches: 10, nearMisses: 2 } as const
/** Week one is the exception: three, closing soonest, with the real total named. */
export const WEEK_ONE_MATCHES = 3

export type DigestMode = 'full' | 'week_one' | 'thin'

export interface ClosingRow {
  kind: 'pipeline' | 'saved'
  name: string
  funder: string | null
  deadline: string
  days: number
  /** The status line. Says what this row asks the reader for. */
  status: string
  url: string | null
  key: string
}

export interface ProgressRow {
  name: string
  funder: string | null
  stage: string
  status: string
  url: string | null
  /** True when the row is drifting — rendered in the danger colour. */
  stalled: boolean
  key: string
}

export interface MatchRow {
  title: string
  funder: string
  blurb: string
  meta: string
  url: string | null
  key: string
}

export interface NearMissRow {
  title: string
  funder: string
  /** "Ruled out on area." — the verdict, plainly. */
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
  nearMisses: NearMissRow[]
  prompt: { title: string; body: string; cta: string; href: string } | null
  /** "Nothing else in your pipeline or saved list closes before 14 October." */
  reassurance: string | null
  catalogue: { live: number; addedRecently: number }
  /** Everything shown, for digest_sent_items. */
  shown: { section: string; key: string }[]
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
    const since = p.updated_at ? humanDate(String(p.updated_at).split('T')[0]) : null
    closing.push({
      kind: 'pipeline',
      name: String(p.grant_name ?? 'Untitled'),
      funder: p.funder_name ? String(p.funder_name) : null,
      deadline: String(p.deadline),
      days,
      status: since
        ? `In ${stage.charAt(0).toUpperCase() + stage.slice(1)} since ${since}.`
        : `In ${stage}.`,
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
      days,
      status: savedOn
        ? `Saved ${savedOn}, never added to your pipeline. Worth a yes or a no.`
        : 'Saved, never added to your pipeline. Worth a yes or a no.',
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
      stage: stage.charAt(0).toUpperCase() + stage.slice(1),
      // Only said when true. A digest that notices you have stalled is a tool;
      // one that says it every week is noise.
      status: stalled
        ? `Still in ${stage.charAt(0).toUpperCase() + stage.slice(1)} — no movement in ${plural(weeks, 'week')}.`
        : `In ${stage.charAt(0).toUpperCase() + stage.slice(1)}.`,
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
  const nearMissCandidates: NearMissRow[] = []

  for (const g of grants) {
    if (savedIds.has(String(g.id)) || savedIds.has(String(g.external_id ?? ''))) continue
    if (pipelineNames.has(String(g.title ?? '').toLowerCase())) continue

    const result = computeMatchScore(normalise(g), org)
    const firstSeen = g.first_seen_at ? new Date(String(g.first_seen_at)) : null
    const fresh = !!firstSeen && (now.getTime() - firstSeen.getTime()) / 86_400_000 <= NEW_MATCH_LOOKBACK_DAYS

    if (result.score >= MATCH_FLOOR) {
      scored.push({ row: g, score: result.score, blurb: buildBlurb(g.funder_brief), fresh })
      continue
    }

    // Near miss — the section most capable of doing damage, so the gate is the
    // narrow one the spec asks for.
    //
    // The first version keyed off `eligibilityReason` being non-null plus a
    // score band, and shipped rows reading "Ruled out on fit. Your structure
    // (CIC) is listed as eligible." — a verdict followed by its own refutation.
    // eligibilityReason is populated for the ELIGIBLE case too, so the filter
    // was catching rows that are perfectly eligible and merely scored low on
    // fit. Nothing ruled them out, and saying otherwise is worse than silence.
    //
    // Only a real blocker qualifies now. Definitional impossibility is never
    // surfaced: an organisation cannot become an individual, so there is
    // nothing to hand back and nothing to check.
    const blocker = result.eligibilityIssues?.find(i => i.severity === 'blocker')
    const trulyRuledOut = result.eligibilityStatus === 'ineligible' && !!result.eligibilityReason
    const definitionallyImpossible = result.score <= 5

    if (trulyRuledOut && !definitionallyImpossible) {
      // Where OUR RECORD is the thing in doubt, name when we read it. Same move
      // as the verification chip on the public pages: let it degrade honestly.
      const readOn = g.last_seen_at ? humanDate(String(g.last_seen_at).split('T')[0]) : null
      nearMissCandidates.push({
        title: String(g.title ?? ''),
        funder: String(g.funder ?? ''),
        verdict: verdictFor(blocker?.message ?? result.eligibilityReason!),
        rule: blocker?.message ?? result.eligibilityReason!,
        condition: readOn
          ? `We read that from their page on ${readOn}. If it is out of date, or your circumstances have changed, it is worth asking.`
          : 'If our reading of their page is out of date, or your circumstances have changed, it is worth asking.',
        url: grantUrl(origin, g),
        key: String(g.id),
      })
    }
  }

  scored.sort((a, b) => b.score - a.score)
  // A blurb that is not conditional and specific does not earn a row.
  const withBlurb = scored.filter(s => s.blurb)

  const hasHistory = (pipeline?.length ?? 0) > 0 || (interactions?.length ?? 0) > 0

  // "New" means new TO THIS READER — not shown to them in a digest before —
  // rather than recently added to the catalogue.
  //
  // The first version used first_seen_at within 30 days and produced an empty
  // section for a well-matched org, because the catalogue published 20 rows in
  // 30 days and none in the last 7. A reader with a good profile would have
  // gone weeks with nothing under a heading that implies we looked.
  // digest_sent_items is exactly the record that makes the better definition
  // possible, and it is what the no-repeat rules already rely on.
  const unshown = withBlurb.filter(s => !seen.has(`new_match:${String(s.row.id)}`))
  // Genuinely recent first, then by score. The sort carries the freshness that
  // the filter used to enforce.
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

  const matches: MatchRow[] = matchPool.slice(0, matchCap).map(s => {
    const g = s.row
    const parts = [
      String(g.funder ?? ''),
      g.deadline ? `closes ${humanDate(String(g.deadline))}` : g.is_rolling ? 'rolling' : null,
    ].filter(Boolean) as string[]
    return {
      title: String(g.title ?? ''),
      funder: String(g.funder ?? ''),
      blurb: s.blurb!,
      meta: parts.join(' · '),
      url: grantUrl(origin, g),
      key: String(g.id),
    }
  })
  matches.forEach(m => shown.push({ section: 'new_match', key: m.key }))

  const shownPool = matchPool.slice(0, matchCap)
  const matchLabel: DigestModel['matchLabel'] =
    !hasHistory              ? 'first'
    : shownPool.every(s => s.fresh) ? 'new'
    : 'worth_a_look'

  /* ── 6. Near misses — rotate, cap at two, never repeat an item ────────── */
  const nearMisses = nearMissCandidates
    .filter(n => !seen.has(`near_miss:${n.key}`))
    .slice(0, CAPS.nearMisses)
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
  const reassurance = hasHistory
    ? nextIso
      ? `Nothing else in your pipeline or saved list closes before ${humanDate(nextIso)}.`
      : 'Nothing else in your pipeline or saved list has a deadline coming up.'
    : null

  /* ── Mode, lead, subject, preheader ───────────────────────────────────── */
  const mode: DigestMode = !hasHistory ? 'week_one' : closingShown.length === 0 ? 'thin' : 'full'

  // The content floor. Nothing to say means no send — a digest that says
  // "nothing this week" teaches someone the email is ignorable before it has
  // ever been useful.
  if (!closingShown.length && !inProgress.length && !matches.length && !nearMisses.length && !prompt) {
    return null
  }

  let lead: string
  let subject: string
  if (mode === 'week_one') {
    lead = `${matchTotal} ${matchTotal === 1 ? 'opportunity is' : 'opportunities are'} open to you right now. Here ${matches.length === 1 ? 'is the one' : `are the ${spell(matches.length)}`} closing soonest.`
    subject = `${plural(matchTotal, 'opportunity', 'opportunities')} open to ${org.name}`
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
    lead = `${spellCap(n)} ${verb(n, 'closes', 'close')} in the next ${CLOSING_WINDOW_DAYS / 7} weeks. The nearest is ${plural(nearest.days, 'day')} away${savedOne ? ', and one is a grant you saved and never decided on' : ''}.`
    subject = `${nearest.name} closes in ${plural(nearest.days, 'day')}`
  }

  const preheaderBits: string[] = []
  if (mode !== 'week_one' && matches.length) {
    // Must agree with the heading the reader will see. Saying "10 new matches"
    // above a section headed "Matches worth a look" is the subject promising
    // something the body does not contain.
    preheaderBits.push(matchLabel === 'new'
      ? `${plural(matches.length, 'new match', 'new matches')} for ${org.name}`
      : `${plural(matches.length, 'match', 'matches')} worth a look`)
  }
  if (inProgress.some(r => r.stalled)) preheaderBits.push('and one application has not moved in three weeks')
  if (mode === 'week_one') preheaderBits.push('your first matches, closing soonest first')
  const preheader = preheaderBits.length ? `${preheaderBits.join(', ')}.` : reassurance ?? ''

  /* ── Catalogue growth, footer only, never leading ─────────────────────── */
  const thirtyAgo = new Date(now.getTime() - 30 * 86_400_000)
  const catalogue = {
    live: grants.length,
    addedRecently: grants.filter(g => g.first_seen_at && new Date(String(g.first_seen_at)) >= thirtyAgo).length,
  }

  return {
    org, mode, subject, preheader, lead,
    closing: closingShown, closingOverflow,
    inProgress, inProgressOverflow,
    matches, matchesOverflow, matchTotal, matchLabel,
    nearMisses, prompt, reassurance, catalogue, shown,
  }
}
