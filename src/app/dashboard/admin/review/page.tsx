// Review Inbox — the replacement for the Needs Review tab of Grant Manager.
//
// One priority-ordered list. Every row states WHY it stopped, shows the
// evidence behind the values it is asking about, and says plainly whether users
// can already see it.
//
// Auth is handled by src/app/dashboard/admin/layout.tsx (requireAdmin), so this
// page does not gate itself.
//
// Server component: fetches the queue and derives reasons server-side via the
// shared deriveReviewReasons(), the same function the auto-publish gate will
// use to decide what never needs to reach a human at all.

import {
  deriveReviewReasons,
  extractTagsDiff,
  compareByReadiness,
  type ReviewRow,
} from '@/lib/admin/review-reasons'
import { gateDecision } from '@/lib/admin/publish-gate'
import { amountSuggestionFrom } from '@/lib/grant-flags'
import { ReviewQueue, type QueueItem } from './ReviewQueue'
import { getAdminDb } from '@/lib/admin/admin-db'

export const dynamic = 'force-dynamic'

// The states that constitute "waiting for a human". Mirrors the predicate the
// old Grant Manager used, so nothing silently drops out of view during the
// transition.
const QUEUE_STATES = ['captured', 'enriched', 'tagged', 'tagged_awaiting_review']

import { needsEnrichment, STUB_BRIEF_SOURCES } from '@/lib/funder-brief'
import { summariseEvidence } from '@/lib/admin/evidence-summary'
import type { FieldEvidence } from '@/lib/field-evidence'

const COLS = [
  // external_id is what the PUBLIC grant API keys on (grants-normalise sets
  // id = external_id ?? id), so the user-preview modal has to fetch by it to
  // land on the same record a user would see.
  'id', 'external_id', 'title', 'funder', 'apply_url', 'funding_index_url', 'is_active', 'pipeline_state',
  'url_status', 'url_quality_score',
  'amount_min', 'amount_max', 'deadline', 'is_rolling', 'next_open_date', 'deadline_cycle',
  'eligible_structures', 'impact_sectors', 'target_beneficiaries', 'niche_tags', 'funding_type',
  // What a USER sees at a glance. The queue showed none of it on the card, so
  // judging a row meant opening it or trusting the reason chips.
  'funder_type', 'location_tag', 'is_local',
  // Extra source pages already saved on the row. Carried so the queue can APPEND
  // to them: /api/admin/enrich-grant replaces grant_sources wholesale, so
  // sending only a new one would delete every source added before it.
  'grant_sources',
  'funder_brief', 'field_provenance', 'raw_data', 'needs_intervention_reason',
  // What the funder's own page said, when the engine last read it. Every other
  // column here is our bookkeeping; this is the only one from outside.
  'field_evidence',
  'last_seen_at',
  // Intake. Every other cut on this screen is by what is WRONG with a row;
  // these two are the only way to see what is arriving and from where.
  'first_seen_at', 'source',
].join(', ')

/**
 * Every row a user can see right now, paged.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS QUERY EXISTS
 *
 * The two queries in the page cover rows AWAITING review, and published rows
 * whose brief is a stub. A published row with a FULL brief is in neither, so a
 * row that goes wrong after it is published is invisible to this screen.
 *
 * Co-op Foundation — Belong is the case that made it visible. The verifier
 * recorded `fixable_link: wrong_fund` against its link on 17 August; the row
 * stayed live, offering £5,000 to £20,000 that appears nowhere on the funder's
 * page, until Paul read the card on 27 August. Nothing in between was looking.
 *
 * Measured the same day: 612 live rows, 103 of them carrying a blocking reason
 * and shown under no tab.
 *
 * PAGED, NOT `.limit()`. PostgREST caps a response at 1,000 rows and the
 * catalogue is heading for 1,500, so a limit that is comfortable today becomes
 * a silent truncation exactly as the catalogue grows — and a truncated scan
 * reads as "nothing wrong" rather than as a missing page. A short page ends the
 * walk; HARD_CAP is a runaway guard and says so out loud if it is ever reached.
 *
 * NOT `.eq('pipeline_state', 'published')`, because `is_active` is what decides
 * whether a user sees a row and the two can disagree — that disagreement is
 * itself one of the defects this screen exists to surface (migration 063).
 */
async function fetchLiveRows(db: ReturnType<typeof getAdminDb>) {
  const PAGE = 500
  const HARD_CAP = 5000
  const out: unknown[] = []
  for (let from = 0; from < HARD_CAP; from += PAGE) {
    const { data, error } = await db
      .from('scraped_grants')
      .select(COLS)
      .eq('is_active', true)
      .not('pipeline_state', 'in', '("rejected","archived")')
      .order('id')
      .range(from, from + PAGE - 1)
    if (error) {
      // A failed page must not read as a clean scan. Everything gathered so far
      // is still worth showing, so this returns rather than throws, and says
      // which page stopped it.
      console.error('[review] live scan failed at row', from, error.message)
      return out
    }
    out.push(...(data ?? []))
    if ((data ?? []).length < PAGE) return out
  }
  console.warn(`[review] live scan hit the ${HARD_CAP} row cap — rows beyond it were not scanned`)
  return out
}

export default async function ReviewPage() {
  const db = getAdminDb()

  const { data, error } = await db
    .from('scraped_grants')
    .select(COLS)
    .in('pipeline_state', QUEUE_STATES)
    .not('saved_for_later', 'is', 'true')
    .order('last_seen_at', { ascending: false })
    .limit(500)

  // PUBLISHED rows whose brief is a STUB. They are not "awaiting review" so they
  // never appeared here, and the only route to enrich one was the old Grant
  // Manager — which is the gap this closes.
  //
  // Filtered in SQL on funder_brief->>source, which PostgREST handles reliably
  // for a top-level key. Deliberately NOT an .or() across nested JSONB keys:
  // that is unreliable and the URLs page had to fall back to client-side
  // filtering for exactly that reason. A published row missing who_can_apply
  // entirely is a different problem and is left to the bulk enrich.
  const { data: stubData } = await db
    .from('scraped_grants')
    .select(COLS)
    .eq('pipeline_state', 'published')
    .in('funder_brief->>source', STUB_BRIEF_SOURCES as unknown as string[])
    .not('saved_for_later', 'is', 'true')
    .order('last_seen_at', { ascending: false })
    .limit(300)

  // WHAT THE GATE PUBLISHED WITHOUT YOU, last 7 days.
  //
  // These rows are `published` + `is_active`, so they are in none of the queue
  // states and drop out of this page entirely the moment the gate flips them.
  // Nothing else finds them either: Grant Manager's "Recently activated" keys
  // on `first_seen_at`, which is when a row was first SCRAPED, so a row first
  // seen months ago and published this morning does not appear there. Catalogue
  // shows them shuffled in with every other live row.
  //
  // So the gate was writing a full decision record — outcome, blocking codes,
  // was_live, applied — that nothing rendered. That is the same failure this
  // whole surface exists to fix, arriving one step later, at publish instead of
  // at review.
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data: gateRows } = await db
    .from('publish_gate_decisions')
    .select('grant_id, decided_at, was_live')
    .eq('applied', true)
    .gte('decided_at', sevenDaysAgo)
    .order('decided_at', { ascending: false })
    .limit(300)

  const gatePublishedAt = new Map<string, { at: string; wasLive: boolean }>()
  for (const r of (gateRows ?? []) as { grant_id: string; decided_at: string; was_live: boolean }[]) {
    // Keep the most recent decision per grant; the query is already sorted.
    if (!gatePublishedAt.has(r.grant_id)) gatePublishedAt.set(r.grant_id, { at: r.decided_at, wasLive: r.was_live })
  }

  const gateIds = Array.from(gatePublishedAt.keys())
  const { data: gateGrants } = gateIds.length
    ? await db.from('scraped_grants').select(COLS).in('id', gateIds)
    : { data: [] as unknown[] }

  // A failed query must never render as an empty queue. The old page
  // destructured the error away and showed "No grants pending review — all
  // clear!" when it had simply failed to read the queue.
  if (error) {
    return (
      <main style={{ padding: '32px 24px', maxWidth: 1180, margin: '0 auto' }}>
        <h1
          style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 24, fontWeight: 500, margin: '0 0 12px' }}
        >
          Review queue
        </h1>
        <div
          style={{
            background: 'var(--coral-pale)', color: 'var(--coral-deep)',
            borderRadius: 'var(--radius-card)', padding: '14px 18px', fontSize: 14,
          }}
        >
          <strong style={{ fontFamily: 'var(--font-space-grotesk)' }}>Could not load the queue.</strong>
          <div style={{ marginTop: 4 }}>{error.message}</div>
          <div style={{ marginTop: 8, opacity: 0.85 }}>
            This is a read failure, not an empty queue. Nothing has been lost.
          </div>
        </div>
      </main>
    )
  }

  const rows = (data ?? []) as unknown as Array<ReviewRow & {
    title: string
    funder: string | null
    apply_url: string | null
    external_id: string | null
    pipeline_state: string
    funder_brief: Record<string, unknown> | null
    field_evidence: FieldEvidence | null
  }>

  // How many OTHER live rows sit on the same apply_url.
  //
  // JRCT is catalogued as three programme rows that all link to
  // /funding-priorities, the index page listing all five programmes. Opening the
  // link to check a row therefore shows you every programme except, specifically,
  // which one this row is — and a reviewer reasonably concludes the row is
  // mis-tagged when it is not. 47 active rows share a URL this way, so the row
  // has to say so rather than leaving the reviewer to discover it.
  const { data: urlRows } = await db
    .from('scraped_grants')
    .select('apply_url')
    .eq('is_active', true)
    .not('apply_url', 'is', null)
  const urlCount = new Map<string, number>()
  for (const u of (urlRows ?? []) as { apply_url: string | null }[]) {
    const k = (u.apply_url ?? '').trim().replace(/\/$/, '')
    if (k) urlCount.set(k, (urlCount.get(k) ?? 0) + 1)
  }
  const sharedWith = (url: string | null) => {
    const k = (url ?? '').trim().replace(/\/$/, '')
    return k ? Math.max(0, (urlCount.get(k) ?? 1) - 1) : 0
  }

  // What else we already carry on this funder's SITE.
  //
  // Intake dedups on an exact URL or an exact title, and discovery varies both,
  // so it created 24 rows for funds already in the catalogue — a quarter of
  // everything it has produced. The pairs are obvious to a person and invisible
  // to a string match: "Community Matters" against "Waitrose Community Matters",
  // "/our-funding/" against "/our-funds/". Social Business Trust beat even a
  // domain match, appearing three times across two domains the funder both uses.
  //
  // This does NOT declare a duplicate, because a community foundation genuinely
  // runs many funds from one domain and calling those duplicates is the same
  // proxy error that has bitten this catalogue repeatedly. It shows the reviewer
  // what else is on the site and lets them see it in one glance.
  //
  // Capped and sorted so a Foundation Scotland row does not print twenty
  // siblings; the number is what matters once the list gets long.
  const domainOf = (u: string | null | undefined) =>
    (u ?? '').toLowerCase().replace(/^https?:\/\/(www\.)?/, '').split('/')[0] ?? ''

  const { data: siblingRows } = await db
    .from('scraped_grants')
    .select('id, title, apply_url, is_active, pipeline_state')
    .not('apply_url', 'is', null)
    .not('pipeline_state', 'in', '("rejected","archived")')
    .limit(3000)

  const byDomain = new Map<string, { id: string; title: string; live: boolean }[]>()
  for (const r of (siblingRows ?? []) as { id: string; title: string | null; apply_url: string | null; is_active: boolean | null }[]) {
    const d = domainOf(r.apply_url)
    if (!d) continue
    if (!byDomain.has(d)) byDomain.set(d, [])
    byDomain.get(d)!.push({ id: r.id, title: String(r.title ?? '').slice(0, 60), live: r.is_active === true })
  }

  const siblingsOf = (id: string, url: string | null) => {
    const d = domainOf(url)
    if (!d) return { count: 0, sample: [] as { title: string; live: boolean }[] }
    const all = (byDomain.get(d) ?? []).filter(x => x.id !== id)
    return {
      count: all.length,
      // Live first: a collision with something users can already see is the one
      // that matters.
      sample: [...all].sort((a, b) => Number(b.live) - Number(a.live)).slice(0, 4)
        .map(x => ({ title: x.title, live: x.live })),
    }
  }

  // What a user can see right now, minus what is already above.
  //
  // Only the rows carrying a BLOCKING reason are carried forward, and deriving
  // that here rather than in the client is what makes the scan affordable: it
  // reads about 7MB of briefs, evidence and flags, and roughly a sixth of that
  // reaches the browser. The rest never leaves the server.
  const liveBlocking = (await fetchLiveRows(db) as unknown as typeof rows)
    .filter(r => gateDecision(r).outcome === 'attention')

  // Merge, de-duplicating by id in case a state ever overlaps.
  //
  // Gate-published rows come LAST on purpose. If a row the gate published has
  // since come back into the queue — reenrich-stale flips a changed row to
  // tagged_awaiting_review — then it needs a decision more than it needs a
  // receipt, so the queue copy wins and it shows as work rather than as record.
  const seenIds = new Set<string>()
  const allRows = [
    ...rows,
    ...((stubData ?? []) as unknown as typeof rows),
    ...liveBlocking,
    ...((gateGrants ?? []) as unknown as typeof rows),
  ].filter(r => { if (seenIds.has(r.id)) return false; seenIds.add(r.id); return true })

  const items: QueueItem[] = allRows
    .map(r => {
      // Derived once and threaded through. It was computed twice per row here,
      // and deriveReviewReasons walks the brief, the provenance diff and the
      // flags each time.
      const reasons = deriveReviewReasons(r)
      const gate    = gateDecision(r, reasons)
      return {
      id:            r.id,
      externalId:    r.external_id ?? null,
      title:         r.title,
      funder:        r.funder ?? '',
      applyUrl:      r.apply_url ?? null,
      linkSharedWith: sharedWith(r.apply_url ?? null),
      siblingsOnSite: siblingsOf(r.id, r.apply_url ?? null),
      isActive:      r.is_active === true,
      pipelineState: r.pipeline_state,
      reasons,
      readiness:     gate.readiness,
      // 'attention' = already visible to users AND carrying a reason a user
      // could be misled by. Those sort above everything else, because every
      // hour they sit here is an hour somebody can act on bad data.
      gateOutcome:   gate.outcome,
      // The codes that BLOCK, computed here rather than in the client. The
      // section grouping needs to know which reasons hold a row back, and the
      // blocking set lives in publish-gate.ts, which pulls server modules — so
      // it is resolved on the server and passed down as plain strings.
      blockingCodes: gate.blocking.map(b => b.code),
      firstSeenAt:   (r as { first_seen_at?: string | null }).first_seen_at ?? null,
      sources: (((r as unknown as { grant_sources?: unknown }).grant_sources ?? []) as unknown[])
        .map(x => {
          const o = (x ?? {}) as Record<string, unknown>
          return { label: String(o.label ?? ''), url: String(o.url ?? ''), text: String(o.text ?? '') }
        })
        .filter(x => x.url || x.text),
      source:        (r as { source?: string | null }).source ?? null,
      diffs:         extractTagsDiff(r.field_provenance, r as unknown as Record<string, unknown>),
      // The figure the amount flag is arguing for, so the card can offer it in
      // one press instead of printing it inside a sentence and asking the
      // reviewer to retype it.
      amountSuggestion: amountSuggestionFrom(r.raw_data, {
        amount_min: r.amount_min ?? null,
        amount_max: r.amount_max ?? null,
      }),
      brief:         summariseBrief(r.funder_brief),
      evidence:      summariseEvidence(r.field_evidence),
      // Drives the "Needs enrichment" view — a stub brief, or none at all.
      needsEnrichment: needsEnrichment(r.funder_brief as Record<string, unknown> | null),
      // Set only for rows the gate itself published in the last 7 days, and
      // only when they are not also back in the queue for another reason.
      // `gatePublishedAt` is empty for every row the gate did not publish, so it
      // is the discriminator. The state test is what demotes a gate-published
      // row that has since come BACK into the queue: it is work again, not a
      // receipt, and it should appear in the working views rather than here.
      // `attention` joins the state test for the same reason the state test is
      // there: a receipt is for a row that needs nothing. A row the gate
      // published last week and which has since picked up a blocking reason
      // needs a decision, and filing it as a receipt would hide it from the one
      // tab that exists to show it.
      autoPublishedAt: QUEUE_STATES.includes(r.pipeline_state) || gate.outcome === 'attention'
        ? null
        : gatePublishedAt.get(r.id)?.at ?? null,
      /** Was it invisible before the gate published it? Distinguishes a genuine
       *  exposure from the gate merely catching admin state up to reality. */
      autoPublishNewlyVisible: gatePublishedAt.get(r.id)?.wasLive === false,
      values: {
        amountMin:  r.amount_min ?? null,
        amountMax:  r.amount_max ?? null,
        deadline:   r.deadline ?? null,
        isRolling:  r.is_rolling === true,
        structures: r.eligible_structures ?? [],
        sectors:    r.impact_sectors ?? [],
        fundingType: (r.funding_type as string | null) ?? null,
        beneficiaries: r.target_beneficiaries ?? [],
        funderType:  (r as { funder_type?: string | null }).funder_type ?? null,
        locationTag: (r as { location_tag?: string | null }).location_tag ?? null,
        isLocal:     (r as { is_local?: boolean | null }).is_local === true,
        nextOpenDate: r.next_open_date ?? null,
      },
      }
    })
    // Attention first, then readiness within each band. Readiness alone put a
    // row nobody can see above a row everybody can see that states something
    // wrong, purely because the invisible one was easier to finish.
    .sort((a, b) =>
      Number(b.gateOutcome === 'attention') - Number(a.gateOutcome === 'attention') ||
      compareByReadiness(a.reasons, b.reasons))

  return <ReviewQueue items={items} gateWindowStart={sevenDaysAgo} />
}

/**
 * Pull just the brief fields the reviewer needs to judge a row, plus the
 * citation snippets behind them.
 *
 * The full 13-field brief belongs on the grant detail view; here the job is to
 * answer "is this right?" without leaving the page. Today those snippets exist
 * only inside a title="" tooltip on the old screen — unselectable and gone on
 * mouse-out.
 */
function summariseBrief(brief: Record<string, unknown> | null | undefined) {
  if (!brief) return null
  const cites = (brief._citations ?? {}) as Record<string, { snippet?: string; confidence?: string } | undefined>
  const pick = (k: string) => {
    const c = cites[k]
    return c?.snippet ? { snippet: c.snippet, confidence: c.confidence ?? 'med' } : null
  }
  return {
    source:        typeof brief.source === 'string' ? brief.source : null,
    whoCanApply:   typeof brief.who_can_apply === 'string' ? brief.who_can_apply : null,
    typicalAward:  typeof brief.typical_award === 'string' ? brief.typical_award : null,
    whatTheyFund:  typeof brief.what_they_fund === 'string' ? brief.what_they_fund : null,
    citations: {
      who_can_apply:       pick('who_can_apply'),
      typical_award:       pick('typical_award'),
      eligible_structures: pick('eligible_structures'),
    },
  }
}
