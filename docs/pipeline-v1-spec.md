# Pipeline v1 — Grant Confirmation Process Redesign

**Status:** Build contract. Decisions, not options. Reopen items only with explicit agreement.

**Authors:** Paul Kilty + Claude Code
**Drafted:** 2026-05-27
**Build window:** Week of 2026-05-27 (3.5-5.5 days)

---

## 1. Goal

Reduce founder review time per row from ~5-10 minutes to ~30 seconds-2 minutes by:

1. Auto-rejecting upstream failures (past-deadline captures, malformed URLs, hard-duplicates) before they enter the review queue.
2. Forcing every AI-written field to carry a source citation + confidence flag, so review changes from detective-work to confirmation.
3. Replacing fragile AI-prose parsing for deadline cycles with a structured `deadline_cycle` field.
4. Auto-running enrich → detect → classify chain so rows arrive in the queue fully populated, not three-button-presses away.

Quantitative target: NR sessions of ~20 rows complete in 15-25 minutes (vs 2-3 hours today).

---

## 2. Scope

**In scope:**
- pipeline_state expansion (4 → 7 states)
- Citation + confidence on every tracked AI-written field
- Tiered temporal validity at scrape-time and sweep-time
- Structured `deadline_cycle` field replacing prose-parsed cycles
- `parent_grant_id` for umbrella/sub-fund relationships
- Auto-chain: scraper insert → enrich → detect → classify
- Grant Manager UI: filter by confidence='low', surface citation snippet inline

**Out of scope (deferred):**
- Scraper feedback loop (rejections informing scraper quality scores)
- Sibling-group primitives beyond single parent pointer
- Continuous confidence scores (3-level discrete only)
- Versioned re-runs across approved rows (manual reclassify panel sufficient for v1)
- Region pattern audit, named-pointer table, other parked v1.1 work

**Constraint:** Standing rule holds — every catalogue row activates only on Paul's explicit per-row sign-off. Pipeline reduces work *before* activation; the activation gate is unchanged.

---

## 3. State machine

Extend `pipeline_state` enum from 4 to 7 values:

| State | Meaning | Visible to user? |
|---|---|---|
| `captured` | Inserted by scraper/discovery. Pre-enrichment. | No |
| `enriched` | Funder brief + cited fields populated. Pre-classification. | No |
| `tagged_awaiting_review` | All fields + tags populated with citation/confidence. Ready for founder review. | No |
| `published` | Founder approved + activated (`is_active=true`). | Yes |
| `rejected` | Soft-rejected with `rejection_reason`. Preserved for audit. | No |
| `archived` | Previously published; expired or admin-archived. | No |
| `between_rounds_scheduled` | Closed now, has future cycle date. Replaces today's `between_rounds` ambiguity. | Yes (with "next round opens X" copy) |

**Transitions** (computed by `transitionPipelineState`):

| From | Trigger | To |
|---|---|---|
| (none) | scraper/discovery insert, deadline >= today - 7d | `captured` |
| (none) | scraper/discovery insert, deadline < today - 7d | `rejected` with `reason=historical_deadline` |
| `captured` | enrich completes, funder_brief written | `enriched` |
| `enriched` | classify completes, tags written | `tagged_awaiting_review` |
| any tracked-write state | admin sets `is_active=true` | `published` |
| any tracked-write state | admin sets `is_active=false` + `url_status='dead'` | `archived` |
| `published` | expire-grants cron, no cycle dates | `archived` |
| `published` | expire-grants cron, cycle date in future | `between_rounds_scheduled` |
| `between_rounds_scheduled` | cron promotes next deadline | `published` |
| any | sweep rejection | `rejected` with reason code |

**`rejection_reason` enum** (text column, free-form not enforced):
- `historical_deadline` — deadline already past at scrape time
- `duplicate` — title+funder exact match exists
- `malformed_url` — URL fails basic format check
- `non_funder` — page is not a funder/programme page (e.g. nav-page rows)
- `out_of_scope` — passes filter but flagged by sweep as wrong audience
- `dead_url` — apply_url returns 404/timeout repeatedly
- `quarantine` — enrichment failed; manual intervention needed

---

## 4. Citation + confidence schema

Extend `field_provenance` jsonb. No new tables.

```typescript
type ProvenanceEntry = {
  // Existing fields
  source:     string                    // scraper:foo / ai_enrich:v2 / admin:email
  set_at:     string                    // ISO timestamp
  pinned:     boolean
  backfilled?: boolean
  previous?:  { source: string; value: unknown }

  // NEW for v1 pipeline
  citation?: {
    snippet:        string              // 50-300 chars of source phrase, verbatim
    snippet_offset?: number             // byte offset in fetched page text (debugging)
    confidence:     'high' | 'med' | 'low'
    reason?:        string              // when LOW: brief explanation (e.g. "no exact match in source", "inferred from context")
  }
}
```

**Confidence levels — discrete, three-tier**:

| Level | Definition |
|---|---|
| `high` | AI quoted a verbatim phrase from the source that explicitly states the field value. Snippet matches output exactly. |
| `med` | AI extracted a value that's implied by source phrasing but not verbatim. Snippet contains the supporting context but requires light inference. |
| `low` | AI inferred from broader context or training knowledge. Source snippet may be missing, partial, or only loosely related. Always reviewed. |

**Which fields require citations** (every tracked AI-written field):
- `deadline`, `next_open_date`, `is_rolling`
- `amount_min`, `amount_max`
- `eligible_structures`, `impact_sectors`, `target_beneficiaries`
- `location_tag`, `is_local`, `is_invite_only`
- `funder_brief` (citation per sub-field where structured: who_can_apply, geographic_focus, exclusions, typical_award)
- `deadline_cycle` (citation = source phrase that triggered cycle detection)

**Not required** for: admin-set fields (citation = "admin entry"), scraper-set raw fields without AI interpretation.

**Prompt contract** (enrich + classify both):

```
For every field you populate, return:
{
  "value": ...,
  "citation": {
    "snippet": "...verbatim source phrase...",
    "confidence": "high" | "med" | "low",
    "reason": "..." // optional, required if confidence=low
  }
}

If no source phrase supports the value: set value=null and confidence="low" 
with reason="no_source_found". Do not fabricate citations.
```

---

## 5. Temporal validity — tiered

Applied at two points: scrape-time (fast filter) and sweep-time (deeper check).

### Scrape-time check (in crawler insert path)

| Condition | Action |
|---|---|
| `deadline > today` | Accept → `captured` |
| `today >= deadline > today - 7d` | Accept → `captured` with flag `recent_past_warning=true` |
| `deadline <= today - 7d` AND no other cycle indicators | Reject → `rejection_reason='historical_deadline'` |
| `deadline <= today - 7d` AND source text contains cycle language ("two deadlines per year", "annual round", "applications accepted in") | Accept → `captured` with flag `needs_cycle_extraction=true` |
| `deadline is null` AND `is_rolling=true` | Accept → `captured` |
| `deadline is null` AND `is_rolling=false` | Accept → `captured` with flag `needs_deadline=true` |

The 7-day grace is calibrated for scraper-lag (pages crawled within a week of close). Wider grace lets historical rounds through; tighter rejects legitimate rows.

### Sweep-time check (in sweep route, post-enrichment)

After enrichment populates `deadline_cycle` and `funder_brief.open_status`:

| Condition | Action |
|---|---|
| `deadline > today` | Pass |
| `deadline < today` AND `deadline_cycle` has future date | Promote: set `deadline` to next cycle date, transition to `enriched` |
| `deadline < today` AND `is_rolling=true` | Pass (rolling claim verified) |
| `deadline < today` AND no future cycle AND no rolling claim | Reject → `historical_deadline` |
| `funder_brief.open_status = 'closed'` AND no future cycle | Archive (not reject — preserves the row for re-discovery if reopened) |

---

## 6. Structured `deadline_cycle`

Replaces fragile AI-prose parsing in expire-grants cron.

```sql
ALTER TABLE scraped_grants
ADD COLUMN deadline_cycle jsonb;
```

```typescript
type DeadlineCycleEntry = {
  day:    number          // 1-31
  month:  number          // 1-12
  label?: string          // optional, e.g. "EOI for Spring round" — display only
}

type DeadlineCycle = DeadlineCycleEntry[]  // 0-N entries; null = no cycle
```

**Enrichment prompt addition**: when source text contains cycle language, populate `deadline_cycle` with all detected (day, month) pairs. Citation snippet = the phrase(s) that triggered detection.

**Examples** (from this week's manually-fixed rows):

| Grant | deadline_cycle |
|---|---|
| James Tudor Foundation — Mental Health Grant | `[{day:8,month:5}, {day:31,month:8}, {day:11,month:12}]` |
| Triangle Trust 1949 Fund — YW&G in CJ | `[{day:21,month:5,label:"Round 1 EOI"}, {day:15,month:10,label:"Round 2 EOI"}]` |
| Islington Giving — Make It Happen Fund | `[{day:11,month:5}, {day:30,month:10}]` |

**expire-grants cron behaviour swap**:

- Today: parses `funder_brief.decision_timeline` prose with regex; needs 2+ distinct DD-Month matches.
- v1: reads `deadline_cycle` directly. When current `deadline < today`, computes next future occurrence from cycle entries (current year, roll to next year if all past). Single-entry cycles roll annually; multi-entry pick earliest future.

**Backfill** (part of build, not separate task):
- The 4 rows manually fixed this week (James Tudor, Triangle Trust, Islington Make It Happen, plus James Tudor Foundation Physical Health which has similar structure) get `deadline_cycle` populated as one-off SQL.
- All other rows: `deadline_cycle = null` initially; gets populated on next enrich run.

---

## 7. `parent_grant_id` — cross-row context

For umbrella/sub-fund relationships (SCF Main Grants → 4 sub-funds, LCF → multiple time-limited partnerships).

```sql
ALTER TABLE scraped_grants
ADD COLUMN parent_grant_id uuid REFERENCES scraped_grants(id) ON DELETE SET NULL;

CREATE INDEX idx_scraped_grants_parent_id ON scraped_grants(parent_grant_id)
  WHERE parent_grant_id IS NOT NULL;
```

**Enrichment prompt behaviour**: if `parent_grant_id IS NOT NULL`, fetch parent's `funder_brief` and apply_url, prepend to prompt as:

```
Parent programme context (this row is a sub-fund of the following):
- Parent title: <parent.title>
- Parent funder: <parent.funder>  
- Parent brief: <parent.funder_brief.what_they_fund + who_can_apply + geographic_focus>
- Parent apply URL: <parent.apply_url>
```

This prevents the failure mode where sub-fund enrichment writes the parent's generic Main Grants copy instead of fund-specific content (Lewes/Rye issue earlier this week).

**Scope discipline**: single parent pointer only. No sibling-groups, no multi-parent. Covers 90%+ of observed cases; add complexity if needed in v2.

---

## 8. Auto-chain enrich → detect → classify

Today's manual sequence (admin clicks Enrich → wait → click Detect → wait → click Classify) becomes a single background job triggered on row insert.

**Trigger:** any scraper insert, discovery insert, or manual SQL insert that arrives with `pipeline_state='captured'`.

**Chain implementation:**

```typescript
// Pseudo-code, runs as Vercel cron every 5 min, processes queued captured rows
async function processPipelineQueue() {
  const queued = await db.from('scraped_grants')
    .select('id, parent_grant_id')
    .eq('pipeline_state', 'captured')
    .limit(50)

  for (const row of queued) {
    try {
      await enrich({ grantId: row.id, parentGrantId: row.parent_grant_id })   // → enriched
      await detect({ grantId: row.id })                                       // → adds amounts/structures
      await classify({ grantId: row.id })                                     // → tagged_awaiting_review
    } catch (err) {
      // Quarantine: log, set pipeline_state='captured' + needs_intervention flag
      // Don't retry indefinitely — 3 attempts max, then quarantine
    }
  }
}
```

**Idempotency:** each route checks `pipeline_state` before writing. Re-running enrich on a row already past `enriched` is a no-op (already cited).

**Cost:** ~$0.001-0.003 per row chain. Negligible at our volume.

**Retry policy:** 3 attempts on transient failure (5xx, timeout). Permanent failure (4xx, malformed JSON) → quarantine immediately with detailed error in `needs_intervention_reason`.

---

## 9. Review UI requirements

Single page: Grant Manager → Needs Review tab. Filter and surface changes from today:

**Per-row display:**
- Title + funder + apply_url (existing)
- **Confidence summary chip**: "8 high, 3 med, 1 low" — at a glance
- **Per-field rendering** (collapsible groups):
  - Field name, value, confidence chip
  - Citation snippet on hover/expand (no need to fetch the source page)
  - For LOW confidence: reason text inline
- **Quick-action buttons:**
  - Approve row (sets is_active=true → published)
  - Reject row (opens reason picker → rejected with reason)
  - Send-back-for-fix (triggers re-enrich with optional hint text)
  - Edit field (opens existing GrantEditor inline for the specific field)

**Filter/sort defaults:**
- Default sort: rows with most LOW-confidence fields first
- Filters: by lowest-confidence-level present, by rejection_reason for the rejected tab, by parent_grant_id (see all SCF sub-funds together)

**Bulk action:**
- Select multiple rows where all fields = HIGH confidence → "approve all selected" button. One click, N rows live.

**No design rebuild needed** — existing Grant Manager structure stays. This is incremental UI work on the existing components.

---

## 10. Migration strategy

**Phase 1 — schema additions (0.5 day, no behaviour change):**
1. ALTER TABLE: add `deadline_cycle jsonb`, `parent_grant_id uuid`, `rejection_reason text`, `needs_intervention_reason text`.
2. Extend pipeline_state enum: add `enriched`, `tagged_awaiting_review`, `rejected`, `between_rounds_scheduled`.
3. Existing rows: `pipeline_state` stays; new columns nullable.

**Phase 2 — prompt rewrites (1-1.5 days, parallel):**
4. Update enrich prompt to require citation+confidence per field, populate `deadline_cycle` when cycle language detected.
5. Update classify prompt similarly.
6. Validate on 10 sample rows. Iterate until ≥90% of fields return well-formed citations.

**Phase 3 — temporal validity (0.5-1 day, parallel with Phase 2):**
7. Add scrape-time check to crawler insert path (`crawl.ts` + helpers).
8. Add sweep-time check route at `/api/admin/sweep` (calls existing routes + new logic).

**Phase 4 — auto-chain (0.5 day):**
9. Vercel cron `/api/cron/process-pipeline-queue` — runs every 5 min, processes queued captured rows.

**Phase 5 — UI (1-1.5 days):**
10. Grant Manager: confidence chips, citation surfacing, bulk-approve button.

**Phase 6 — backfill (0.5 day):**
11. SQL backfill `deadline_cycle` for the 4 manually-fixed multi-round rows.
12. Re-enrich existing `pipeline_state='captured'` rows through new chain (will populate citations on rows that lack them).
13. Existing `published` rows: don't re-enrich (would churn unnecessarily). They'll pick up citations on next admin Re-enrich click.

**Total: 3.5-5.5 days, parallelisable to ~3 calendar days.**

---

## 11. Acceptance criteria

Build is complete when:

1. A new row inserted into `scraped_grants` with `pipeline_state='captured'` auto-progresses to `tagged_awaiting_review` within 10 minutes without any admin button clicks, OR transitions to `rejected` with a reason, OR quarantines with `needs_intervention_reason`.
2. Every AI-written tracked field on a `tagged_awaiting_review` row has `field_provenance[field].citation.snippet` populated.
3. Grant Manager NR tab shows confidence chips and citation snippets inline; bulk-approve action works.
4. expire-grants cron uses `deadline_cycle` directly when populated; falls back to prose parser only when null.
5. Validation: insert 10 fresh discovery rows + the 4 manually-fixed multi-round rows. Time the founder review pass. Target: 25 minutes or less for all 14.

---

## 12. Risks + open questions

**Risks:**
- Prompt iteration takes longer than 1-1.5 days if citations come back malformed at high rate. Mitigation: ship Phase 2 in a feature flag; if quality is poor, keep old prompt for production and iterate in dev.
- 7-day grace on scrape-time temporal check may be wrong calibration. Mitigation: log every rejection with reason; review after first week and adjust.
- Auto-chain may stack queue if scrapers run a large batch at once. Mitigation: cron processes 50 rows per tick; queue depth monitored.

**Resolved 2026-05-27** (Paul agreed with proposed leans):
- `between_rounds_scheduled` rows DO surface in MCP and search with explicit "next round opens X" framing (consistent with v1.1 between-rounds adapter shipped 2026-05-26).
- Legacy uncited rows (existing `tagged` / `published` rows from before this build) get retro-cited via re-enrich on next admin edit — no sweeping migration. Migration is opportunistic, not batch.

---

## 13. Sign-off

Before build starts:
- [ ] Paul has read this doc and accepts the scope
- [ ] Any open questions in §12 with strong preferences are resolved inline
- [ ] Build sequence (§10) is the agreed order

Once signed off, no scope changes mid-build without an explicit doc revision.

---

**Related:**
- `docs/mcp-spec-v1.md` — MCP build contract (same format)
- `src/lib/grant-merge.ts` — existing merger + provenance code (extends, doesn't replace)
- Memory: `project_deadline_systemic_redesign_pending.md` — context for why this is being built
- Memory: `feedback_silent_catch_hides_max_tokens.md` — adjacent diagnostic discipline
