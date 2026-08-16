-- 058 — label what actually changed on a funder's listing page.
--
-- APPLIED TO PROD 2026-08-16, immediately before this file was committed.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY THE FEED HAS NEVER BEEN READ
--
-- `watchlist_alerts` holds 387 unresolved alerts and has never had one resolved,
-- growing by roughly 54 a week. That is not neglect. The per-run change rate is
-- a steady 12-14% on pages whose funding offer changes a few times a year, and a
-- hand reading of the 17 raised on 16 August found roughly 14 were news
-- carousels, jobs boards, blog lists, a maintenance banner and one copy typo. A
-- feed that is wrong six times out of seven trains its reader to stop looking,
-- and that is what happened.
--
-- The alerts already store `snapshot_before` and `snapshot_after` in full, so
-- the set difference is computable today. What has been missing is a judgement
-- about whether a difference matters, and that is one cheap model call.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- REPORT-ONLY, AND THAT IS A DECISION RATHER THAN A PHASE
--
-- Nothing acts on these columns. The classifier writes a label and a quote and
-- stops: it does not resolve an alert, does not set `verify_flag`, and does not
-- move a row. Paul's condition, 2026-08-16: "sample the diff classifier's first
-- week before it gates anything".
--
-- The reason is that the 14-of-17 estimate behind this whole idea is a hand
-- reading of a single run, n=17. It is an order of magnitude, not a measured
-- rate, and a classifier trusted to auto-resolve on that basis would be silently
-- discarding funding changes for however long it took anyone to notice. So the
-- first week's output gets hand-checked against a sample, and only then does
-- anything downstream read these columns.

alter table public.watchlist_alerts
  add column if not exists classification       text,
  add column if not exists classification_quote text,
  add column if not exists classified_at        timestamptz,
  add column if not exists classified_by        text;

comment on column public.watchlist_alerts.classification is
  'cosmetic | funding_change | page_gone | unclear. What the diff between snapshot_before and snapshot_after actually means. REPORT-ONLY: nothing reads this to gate an action until the first week has been hand-sampled. See supabase/migrations/058_alert_classification.sql.';

comment on column public.watchlist_alerts.classification_quote is
  'The added or removed line the classification turns on, verbatim. A label with no quote behind it is an opinion, and this whole tranche exists to stop those being stored as facts.';

comment on column public.watchlist_alerts.classified_by is
  'Model and prompt version, e.g. claude-haiku-4-5:v1. Bump when the prompt changes so a re-read is distinguishable from a stale label.';

-- The classifier's work queue: unclassified alerts, newest first.
create index if not exists watchlist_alerts_unclassified_idx
  on public.watchlist_alerts (detected_at desc)
  where classification is null;
