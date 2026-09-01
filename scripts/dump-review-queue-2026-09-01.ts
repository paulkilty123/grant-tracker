// Read-only dump of the Review Inbox, reproducing src/app/dashboard/admin/review/page.tsx
// exactly, so every bucket on that screen can be worked offline.
//
// No Anthropic call. DB reads only.
//
//   npx tsx scripts/dump-review-queue-2026-09-01.ts <out.json> > /dev/null
//
// Writes the full dump to the path given as the first argument.

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deriveReviewReasons, extractTagsDiff, type ReviewRow } from '../src/lib/admin/review-reasons'
import { gateDecision } from '../src/lib/admin/publish-gate'
import { needsEnrichment, STUB_BRIEF_SOURCES } from '../src/lib/funder-brief'
import { summariseEvidence } from '../src/lib/admin/evidence-summary'
import { sectionOf, isNewArrival, arrivalOrigin, rootCauseOf, evidenceRank } from '../src/lib/admin/review-sections'

const HERE = dirname(fileURLToPath(import.meta.url))
for (const line of readFileSync(resolve(HERE, '..', '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
}

const COLS = [
  'id', 'external_id', 'title', 'funder', 'apply_url', 'funding_index_url', 'is_active', 'pipeline_state',
  'url_status', 'url_quality_score',
  'amount_min', 'amount_max', 'deadline', 'is_rolling', 'next_open_date', 'deadline_cycle',
  'eligible_structures', 'impact_sectors', 'target_beneficiaries', 'niche_tags', 'funding_type',
  'funder_type', 'location_tag', 'is_local',
  'grant_sources', 'funder_brief', 'field_provenance', 'raw_data', 'needs_intervention_reason',
  'field_evidence', 'last_seen_at', 'first_seen_at', 'source',
].join(', ')

const QUEUE_STATES = ['captured', 'enriched', 'tagged', 'tagged_awaiting_review']

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function fetchLiveRows() {
  const PAGE = 500, HARD_CAP = 5000
  const out: any[] = []
  for (let from = 0; from < HARD_CAP; from += PAGE) {
    const { data, error } = await db.from('scraped_grants').select(COLS)
      .eq('is_active', true).not('pipeline_state', 'in', '("rejected","archived")')
      .order('id').range(from, from + PAGE - 1)
    if (error) { console.error('live scan failed at', from, error.message); return out }
    out.push(...(data ?? []))
    if ((data ?? []).length < PAGE) return out
  }
  console.warn('hit hard cap')
  return out
}

async function main() {
  const { data, error } = await db.from('scraped_grants').select(COLS)
    .in('pipeline_state', QUEUE_STATES).not('saved_for_later', 'is', 'true')
    .order('last_seen_at', { ascending: false }).limit(500)
  if (error) { console.error(error.message); process.exit(1) }

  const { data: stubData } = await db.from('scraped_grants').select(COLS)
    .eq('pipeline_state', 'published')
    .in('funder_brief->>source', STUB_BRIEF_SOURCES as unknown as string[])
    .not('saved_for_later', 'is', 'true')
    .order('last_seen_at', { ascending: false }).limit(300)

  const sevenDaysAgo = new Date(Date.now() - 7 * 864e5).toISOString()
  const { data: gateRows } = await db.from('publish_gate_decisions')
    .select('grant_id, decided_at, was_live').eq('applied', true)
    .gte('decided_at', sevenDaysAgo).order('decided_at', { ascending: false }).limit(300)

  const gatePublishedAt = new Map<string, { at: string; wasLive: boolean }>()
  for (const r of (gateRows ?? []) as any[]) if (!gatePublishedAt.has(r.grant_id)) gatePublishedAt.set(r.grant_id, { at: r.decided_at, wasLive: r.was_live })
  const gateIds = Array.from(gatePublishedAt.keys())
  const { data: gateGrants } = gateIds.length
    ? await db.from('scraped_grants').select(COLS).in('id', gateIds) : { data: [] as any[] }

  const liveBlocking = (await fetchLiveRows()).filter(r => gateDecision(r as ReviewRow).outcome === 'attention')

  const seen = new Set<string>()
  const allRows = [...(data ?? []), ...(stubData ?? []), ...liveBlocking, ...(gateGrants ?? [])]
    .filter((r: any) => { if (seen.has(r.id)) return false; seen.add(r.id); return true }) as any[]

  const items = allRows.map((r: any) => {
    const reasons = deriveReviewReasons(r)
    const gate = gateDecision(r, reasons)
    const codes = reasons.map(x => x.code)
    const blockingCodes = gate.blocking.map(b => b.code)
    const autoPublishedAt = QUEUE_STATES.includes(r.pipeline_state) || gate.outcome === 'attention'
      ? null : gatePublishedAt.get(r.id)?.at ?? null
    return {
      id: r.id, externalId: r.external_id, title: r.title, funder: r.funder,
      applyUrl: r.apply_url, indexUrl: r.funding_index_url,
      isActive: r.is_active === true, pipelineState: r.pipeline_state,
      urlStatus: r.url_status, urlQuality: r.url_quality_score,
      source: r.source, origin: arrivalOrigin(r.source),
      firstSeenAt: r.first_seen_at, lastSeenAt: r.last_seen_at,
      gateOutcome: gate.outcome, readiness: gate.readiness,
      codes, blockingCodes,
      section: sectionOf(blockingCodes, codes),
      rootCause: rootCauseOf(codes),
      reasons: reasons.map(x => ({ code: x.code, sev: x.severity, label: x.label })),
      needsEnrichment: needsEnrichment(r.funder_brief),
      autoPublishedAt,
      newArrival: isNewArrival(r.first_seen_at),
      evidence: summariseEvidence(r.field_evidence),
      evidenceRank: evidenceRank(summariseEvidence(r.field_evidence)),
      needsInterventionReason: r.needs_intervention_reason,
      briefSource: r.funder_brief?.source ?? null,
      whoCanApply: r.funder_brief?.who_can_apply ?? null,
      typicalAward: r.funder_brief?.typical_award ?? null,
      whatTheyFund: r.funder_brief?.what_they_fund ?? null,
      diffs: extractTagsDiff(r.field_provenance, r),
      values: {
        amountMin: r.amount_min, amountMax: r.amount_max, deadline: r.deadline,
        isRolling: r.is_rolling === true, nextOpenDate: r.next_open_date,
        deadlineCycle: r.deadline_cycle,
        structures: r.eligible_structures ?? [], sectors: r.impact_sectors ?? [],
        beneficiaries: r.target_beneficiaries ?? [], fundingType: r.funding_type,
        funderType: r.funder_type, locationTag: r.location_tag, isLocal: r.is_local === true,
      },
    }
  })

  const pending = items.filter(i => !i.autoPublishedAt)
  const autoPub = items.filter(i => i.autoPublishedAt)
  const byView = pending.filter(i => !i.isActive)
  const bucket = (id: string) => byView.filter(i => i.section === id)

  const out = {
    generatedAt: new Date().toISOString(),
    counts: {
      liveandwrong: pending.filter(i => i.gateOutcome === 'attention').length,
      exhausted: bucket('exhausted').length,
      notLiveYet: byView.length,
      ready: bucket('ready').length,
      link: bucket('link').length,
      reading: bucket('reading').length,
      judgement: bucket('judgement').length,
      untruthful: bucket('untruthful').length,
      liveok: pending.filter(i => i.isActive && i.gateOutcome === 'publish').length,
      new: byView.filter(i => i.newArrival).length,
      unenriched: pending.filter(i => i.needsEnrichment).length,
      autopublished: autoPub.length,
    },
    buckets: {
      liveandwrong: pending.filter(i => i.gateOutcome === 'attention'),
      exhausted: bucket('exhausted'),
      ready: bucket('ready'),
      link: bucket('link'),
      reading: bucket('reading'),
      judgement: bucket('judgement'),
      untruthful: bucket('untruthful'),
      liveok: pending.filter(i => i.isActive && i.gateOutcome === 'publish'),
      autopublished: autoPub,
    },
  }
  console.error(JSON.stringify(out.counts, null, 2))
  const outPath = process.argv[2]
  if (!outPath) { console.error('usage: dump-review-queue-2026-09-01.ts <out.json>'); process.exit(2) }
  writeFileSync(outPath, JSON.stringify(out, null, 2))
}
main()
