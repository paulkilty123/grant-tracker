import { getAdminDb } from '@/lib/admin/admin-db'
import { computeMatchScore } from '@/lib/matching'
import { pickProfilePrompt, promptTitleWithCount, type ProfilePrompt, type ProfileFieldLabel } from '@/lib/profile-completeness'
import { daysUntil, humanDate, plural, spell, spellCap, verb } from './text'
import { findNearMiss, nearMissMeta, amountLabel } from './near-miss'
import { FUNDING_TYPE_COLOUR, type FundingTypeKey } from '@/lib/funding-type-colours'
import { activeEdition } from './edition'
import { normaliseScrapedGrant } from '@/lib/grants-normalise'
import { checkProfile } from '@/lib/profile-check'
import type { Organisation, FundingType } from '@/types'

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
/**
 * Whether the "New this week" section is drawn. OFF since the 8 Sept send
 * (Paul, 7 Sept): at the 65 floor it surfaced the Army Benevolent Fund for
 * three arts charities, because the matcher treats a funder's named
 * beneficiary group as a warning rather than a cap. The builder still
 * computes the rows; while OFF they stay in the ranked list rather than
 * being carved out for a section nobody sees.
 */
export const NEW_THIS_WEEK_SECTION = false

/** Caps are a safety valve for a pathological week, not an editing device. */
export const CAPS = { closing: 5, inProgress: 3, newMatches: 5, nearMisses: 2, newThisWeek: 5 } as const
/** Week one is the exception: three, closing soonest, with the real total named. */
export const WEEK_ONE_MATCHES = 3

export type DigestMode = 'full' | 'week_one' | 'thin'

/**
 * What a sole trader is told, in the email. The wizard says the same thing at
 * signup (onboarding/wizard/page.tsx); this is the version for someone who has
 * already signed up and is wondering why the list is short. "Your profile" is
 * the link target in the render.
 */
export const SOLE_TRADER_NOTICE =
  'Shoots matches funding to organisations. Most funders do not fund individuals, so as a sole trader you will see few or no matches. You are welcome to browse the catalogue and save anything worth watching. If you set up a constituted group or a company, change your structure in your profile and the matches open up.'

export function structureNoticeFor(org: Pick<Organisation, 'legal_structure'>): string | null {
  return org.legal_structure === 'sole_trader' ? SOLE_TRADER_NOTICE : null
}

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
  catalogue: { live: number; addedRecently: number; addedThisWeek: number }
  /**
   * A dated edition (edition.ts): the intro and the week's updates, rendered
   * above everything else, with its subject replacing the computed one. Null
   * outside an edition window, which is every ordinary week.
   */
  edition: { title: string; intro: string; updates: string[] } | null
  /**
   * The sole-trader line (Paul, 16 Sept 2026, board m03). Most funders do not
   * fund individuals, so a sole trader's digest is thin by nature, and without
   * this line it reads as a broken product. Same idea as the wizard notice,
   * rendered under the lead. Null for every organisational structure.
   */
  structureNotice: string | null
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
  // Funder, amount, timing (Paul, 14 Sept 2026: the amount was missing from
  // match rows while near-miss rows carried it).
  const parts = [
    String(g.funder ?? ''),
    amountLabel(typeof g.amount_min === 'number' ? g.amount_min : null, typeof g.amount_max === 'number' ? g.amount_max : null),
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
 * Order for the ranked match list: not-yet-shown first, then score, then fresh.
 * `seen` holds `section:item_key` pairs from digest_sent_items for the history
 * window. Exported so the rotation can be tested without a database.
 *
 * Freshness used to come before score. Measured on the twelve launch-week
 * signups (13 Sept): Unicorn Theatre's five were Impact Loans England, Tesco
 * Community Grants, the BBC Children in Need core costs stream and a teacher
 * development fund, all inside the 30-day window at 65 to 70, while the
 * Theatres Trust, Scops, Backstage and Fidelio sat unshown at 81 and 82. A
 * cricket foundation got the Army Benevolent Fund ahead of Sported at 92. The
 * same four generic rows led for every arts organisation. Fresh now breaks
 * ties only; the "new" label still tells the reader when the shown rows are
 * recent.
 */
export function matchOrder(seen: Set<string>) {
  type S = { row: Record<string, unknown>; score: number; fresh: boolean }
  const shownBefore = (s: S) => seen.has(`new_match:${String(s.row.id)}`)
  return (a: S, b: S) =>
    Number(shownBefore(a)) - Number(shownBefore(b)) ||
    b.score - a.score ||
    Number(b.fresh) - Number(a.fresh)
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
  const rawExcl = typeof b.exclusions === 'string' ? stripPlaceholderLead(b.exclusions) : ''
  const saysNone = /^\s*(no(ne)?\b[^.]{0,40}(exclusion|stated|specified|listed)|not stated|n\/a)/i.test(rawExcl)
  const excl = rawExcl && !saysNone ? firstSentence(rawExcl, 95) : null
  return excl ? `${what} ${excl}` : what
}

/**
 * "Not explicitly stated. However, applicants must be based in England."
 * The enricher writes that shape on about twenty live rows: a placeholder
 * first sentence, then the real caveat. `firstSentence` took the placeholder
 * and the digest printed "Not explicitly stated." after a loan fund's blurb
 * (seen in the 7 Sept dry run). Drop the placeholder and keep what follows;
 * if nothing follows, the saysNone test above still drops the whole thing.
 */
export function stripPlaceholderLead(text: string): string {
  return text
    .replace(/^\s*(not|none|no)\s+(explicitly\s+|specifically\s+)?(stated|specified|listed|mentioned|given)[^.]*\.\s*(however,?\s*)?/i, '')
    .replace(/^[a-z]/, c => c.toUpperCase())
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
      // The date, not a count of weeks: three rows all reading "No movement
      // in 11 weeks" looked like a rendering fault (design review, 7 Sept).
      stageLabel: stalled
        ? (updated ? `No movement since ${shortDate(updated.toISOString())}` : `No movement in ${plural(weeks, 'week')}`)
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
    // Invite-only funds stay out of the email. Find Funding shows them with a
    // badge; the email has no badge, and "Reach Fund" as a top match for a
    // reader who cannot apply to it is a false promise (Paul, 14 Sept 2026).
    if (g.is_invite_only) continue

    // The app's normaliser, not the local copy below. The local one carried
    // no nicheTags, funderBrief or fundingSubtypes, all of which the scorer
    // reads, so the email ranked with different numbers from the app: for
    // Bank of Dreams and Nightmares (13 Sept) 71 of 657 rows differed, the
    // Coward photography grant fell from 89 to 78, BFI from 80 to 69, and an
    // armed forces pupils fund rose from 66 to 79 into the five.
    const normalised = normaliseScrapedGrant(g)
    const result = computeMatchScore(normalised, org)
    const firstSeen = g.first_seen_at ? new Date(String(g.first_seen_at)) : null
    const fresh = !!firstSeen && (now.getTime() - firstSeen.getTime()) / 86_400_000 <= NEW_MATCH_LOOKBACK_DAYS

    const blurb = buildBlurb(g.funder_brief)

    // New this week AND matched to them, at the same floor as the ranked list.
    // The first version ignored score and filtered on eligibility alone, on the
    // theory that "this arrived and you can apply" was a claim worth making.
    // In practice it put castle archaeology, marine conservation and an Army
    // benevolent fund in front of an education charity (Devi's 7 Sept dry run),
    // because eligibility says nothing about relevance. Paul: "these matches
    // don't look very relevant at all". The section now clears the same bar
    // as everything else in the email, and simply disappears in a week when
    // nothing new clears it.
    if (
      blurb &&
      firstSeen &&
      (now.getTime() - firstSeen.getTime()) / 86_400_000 <= NEW_THIS_WEEK_DAYS &&
      result.eligibilityStatus !== 'ineligible' &&
      result.score >= MATCH_FLOOR &&
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
    // Near enough to matter. Below 45 the row failed on more than the one
    // thing the near-miss names: the Legal Education Foundation's justice
    // fund was offered to a children's theatre as "everything else fits"
    // when the theme score said otherwise (Paul, 14 Sept 2026).
    // 55 is the app's own floor for "worth showing". Below it the row failed
    // on more than the one thing the near miss names: a cancer care
    // programme was a near miss for a transport charity at 47.
    if (result.score < MATCH_FLOOR && result.score >= 55) {
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
  // ROTATION, not suppression (Paul, 7 Sept 2026). The first version
  // suppressed shown matches outright and the list emptied, hence the feast
  // and famine above. The second version never rotated, on the argument that
  // the best matches are the best matches, and left novelty to "New this
  // week". Then "New this week" acquired the match floor (it had been showing
  // castles to an education charity), and with a dozen new rows a week across
  // the catalogue it is usually empty, so a weekly email for an unchanged
  // profile was the same ten rows every week.
  //
  // So: anything shown as a match in the last 31 days (the route's history
  // window) sorts BELOW anything not yet shown, and within each band fresh
  // first, then score. Ten unshown matches exist: ten unseen rows go out.
  // Three exist: three unseen and then the seven best repeats. The pool never
  // empties and the floor never moves; only the order does. Someone with forty
  // matches sees all forty across four sends before anything comes round again.
  //
  // Week one below replaces this sort with deadline order, unchanged.
  //
  // Still deduped against "New this week", so one fund cannot appear twice in
  // one email under two headings.
  // Only carve "New this week" out of the ranked list when that section is
  // actually rendered. It was switched off for the 8 Sept send, but the carve
  // stayed, so every row first seen in the last seven days that cleared the
  // floor vanished from the email: CAST Design Hops at 79, Big Issue Invest
  // at 77, Daring Capital at 74 (Paul, 14 Sept 2026, "some digests fall
  // short of five"). One switch, read by builder and renderer alike.
  const unshown = NEW_THIS_WEEK_SECTION ? withBlurb.filter(s => !newThisWeekKeys.has(String(s.row.id))) : withBlurb
  unshown.sort(matchOrder(seen))

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
  const handNote = activeEdition(now)?.profileNotes?.[org.id]
  if (handNote) {
    // A note written for this organisation this week outranks anything
    // computed: it exists because the computed prompts could not see it.
    prompt = { title: handNote.title, body: handNote.body, cta: handNote.cta, href: `${origin}/dashboard/profile#card-focus` }
    shown.push({ section: 'profile_nudge', key: `hand:${now.toISOString().slice(0, 10)}` })
  } else if (promptPick) {
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
  } else {
    // Nothing is missing, but something may be pulling the matches off
    // course: too many beneficiary groups, reach wider than the mission, a
    // specialism the mission never mentions. Same rules as the wizard's check
    // step (Paul, 13 Sept 2026), so the email keeps asking what the signup
    // screen asked, until it is fixed. Rotates on the finding id so one
    // nudge is not repeated inside the history window.
    const nudgedRecently = new Set((opts.recentlyShown ?? []).filter(r => r.section === 'profile_nudge').map(r => r.item_key))
    // Hard facts only, as the wizard's check step (Paul, 14 Sept): the
    // tag-versus-mission word findings would tell Mustard Tree its mission
    // does not mention homeless people, and a word rule cannot be trusted
    // with that sentence. Income, reach, grant range and a thin mission can.
    const nudge = checkProfile(org, { skip: ['beneficiaries_too_many', 'beneficiaries_unmentioned', 'niche_unmentioned', 'niche_missing', 'beneficiaries_general_only'] })
      .find(f => f.action.kind !== 'none' && !nudgedRecently.has(f.id))
    if (nudge) {
      prompt = { title: nudge.title, body: nudge.body, cta: 'Fix this on your profile', href: `${origin}/dashboard/profile#card-focus` }
      shown.push({ section: 'profile_nudge', key: nudge.id })
    } else if (!hasHistory) {
      // A complete profile with a wrong description is invisible to every
      // rule (Our Sansar, 14 Sept 2026: an invented mission, every field
      // filled). The first email can still say the one true thing: the
      // matches come from the description, and where to change it.
      prompt = {
        title: 'Matches looking off? Start with your description',
        body: 'Everything in this email comes from what your profile says. Two or three plain sentences on who you help, what you do and where make the biggest difference.',
        cta: 'Check your description',
        href: `${origin}/dashboard/profile#card-story`,
      }
      shown.push({ section: 'profile_nudge', key: 'week_one_description' })
    }
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
  //
  // One exception: a sole trader's first digest. It usually has nothing in it,
  // and that is the thing the reader needs told, once. After week one the
  // floor applies as it does for everyone.
  const structureNotice = structureNoticeFor(org)
  if (!closingShown.length && !inProgress.length && !matches.length && !newThisWeek.length && !nearMisses.length && !prompt
      && !(structureNotice && mode === 'week_one')) {
    return null
  }

  let lead: string
  let subject: string
  if (structureNotice && matchTotal === 0) {
    // A sole trader with nothing matching. Not a profile gap, and saying so
    // would send them to fix a profile that is already right.
    lead = 'Nothing is matching, and for a sole trader that is expected rather than a gap in your profile. The note below says why, and what opens it up.'
    subject = `Funding for sole traders on Shoots, and what opens it up`
  } else if (mode === 'week_one' && matchTotal === 0) {
    // Nothing matched, and the floor above let the send through because a
    // profile prompt exists. "Zero opportunities are open to you. Here are the
    // zero closing soonest" is what the general wording produces here, and it
    // reads as a broken product. Name the gap and the fix instead.
    lead = prompt
      ? 'Nothing is matching yet, and that is a profile gap rather than a funding gap. One detail below unlocks it.'
      : 'Nothing is matching yet. Finish your profile and next week this email leads with what is open to you.'
    subject = prompt
      ? `One detail unlocks your matches for ${org.name}`
      : `Finish your profile to see what is open to ${org.name}`
  } else if (mode === 'week_one') {
    lead = `${spellCap(matchTotal)} ${matchTotal === 1 ? 'opportunity is' : 'opportunities are'} open to you right now. Here ${matches.length === 1 ? 'is the one' : `are the ${spell(matches.length)}`} closing soonest.`
    subject = `${plural(matchTotal, 'funding opportunity is', 'funding opportunities are')} open to ${org.name}`
  } else if (mode === 'thin') {
    // Paul, 7 Sept: a line that only reports an absence is the one thing this
    // email must not do. When there are matches, point at them, in the same
    // terms the week-one state uses.
    const clear = nextIso
      ? `A clear month. Nothing closes before ${humanDate(nextIso)}.`
      : 'A clear month. Nothing in your pipeline or saved list is closing.'
    lead = matches.length
      ? `${clear} Your next deadline is in the ${spell(matches.length)} matches below. Add one to your pipeline and this email will track it.`
      : clear
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
  if (mode === 'week_one' && matchTotal === 0) {
    preheader = prompt ? prompt.title : 'Finish your profile to see what is open to you.'
  } else if (mode === 'week_one') {
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
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000)
  const addedSince = (d: Date) => grants.filter(g => g.first_seen_at && new Date(String(g.first_seen_at)) >= d).length
  const catalogue = {
    live: grants.length,
    addedRecently: addedSince(fortnightAgo),
    addedThisWeek: addedSince(weekAgo),
  }

  /* ── Edition. The subject names the email rather than the nearest deadline
        while an edition runs; the deadline still leads the body. The catalogue
        line comes first because it is the one line computed from the rows
        rather than typed. ─────────────────────────────────────────────────── */
  const ed = activeEdition(now)
  const edition = ed ? {
    title: ed.subject,
    intro: ed.intro,
    updates: [
      `${plural(catalogue.addedThisWeek, 'new opportunity', 'new opportunities')} added this week.`,
      ...ed.updates,
    ],
  } : null
  if (ed) subject = ed.subject

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
    nearMisses, prompt, reassurance, catalogue, edition, structureNotice, shown,
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
