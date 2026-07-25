-- 039 — Two schema repairs found in the 2026-07-25 ingestion-pipeline audit.
--
-- NOT YET APPLIED TO PROD. Both statements are additive and reversible, but
-- they are DDL on a live table, so apply deliberately rather than as a side
-- effect of a deploy.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- (1) grant_interactions.action CHECK constraint rejects 'flagged'
-- ─────────────────────────────────────────────────────────────────────────────
-- src/app/api/flag-grant/route.ts upserts `action: 'flagged'`, but the CHECK
-- constraint only permits 'saved' | 'dismissed' | 'applied'. Every flag insert
-- therefore violates the constraint and throws — and the route never inspects
-- the upsert's error, so it fails completely silently.
--
-- Confirmed against prod 2026-07-25: grant_interactions holds 297 'dismissed',
-- 81 'saved', 6 'applied', and **0 'flagged'**. The user-flag feature has never
-- recorded a single row.
--
-- This is TS/docs-vs-DB drift: CLAUDE.md documents the action set as
-- 'saved'|'dismissed'|'applied'|'liked'|'disliked'|'flagged', and the DB allows
-- three of those six. 'liked'/'disliked' have no writer in src/ today, but are
-- included here so the same silent failure cannot recur if one is added.
--
-- Widening a CHECK constraint cannot invalidate existing rows.

alter table public.grant_interactions
  drop constraint if exists grant_interactions_action_check;

alter table public.grant_interactions
  add constraint grant_interactions_action_check
  check (action = any (array[
    'saved'::text,
    'dismissed'::text,
    'applied'::text,
    'liked'::text,
    'disliked'::text,
    'flagged'::text
  ]));

-- ─────────────────────────────────────────────────────────────────────────────
-- (2) scraped_grants.last_reenrich_attempt has no migration
-- ─────────────────────────────────────────────────────────────────────────────
-- Queried and written by src/app/api/cron/reenrich-stale/route.ts (its
-- candidate .or() filter depends on the column), but it was applied straight to
-- prod in commit 63f86ff and never captured in migrations/ or schema.sql.
--
-- Consequence if left undocumented: any rebuild from the documented baseline
-- (branch reset, project restore, fresh environment) produces a database where
-- reenrich-stale 500s on fetch. Since that cron is easy to assume is gated off,
-- the breakage would be silent.
--
-- IF NOT EXISTS makes this a no-op against current prod (where the column
-- already exists) while making a rebuilt database correct.

alter table public.scraped_grants
  add column if not exists last_reenrich_attempt timestamptz;

comment on column public.scraped_grants.last_reenrich_attempt is
  'Set by cron/reenrich-stale before attempting the enrich chain, so a row that '
  'cannot be refreshed does not monopolise every subsequent batch. Backs the '
  'REENRICH_ATTEMPT_BACKOFF_DAYS guard. Distinct from funder_brief->>last_enriched, '
  'which records the last SUCCESSFUL enrichment.';
