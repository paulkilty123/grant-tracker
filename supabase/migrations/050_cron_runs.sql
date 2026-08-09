-- 050 — one row per scheduled-job run.
--
-- APPLIED TO PROD 2026-08-09, immediately before this file was committed.
--
-- Answers "did it fire, did it work, what did it do, what did it cost" without
-- SQL. On 2 August "did the auto-publish gate fire?" took four queries, a Vercel
-- API call, a log check, and one wrong answer from a mis-parsed line.
--
-- WHY A TABLE RATHER THAN INFERENCE. Most jobs can be dated from their side
-- effects (max(url_last_checked), field_provenance timestamps). That fails
-- silently in the one case that matters: a job that runs and correctly changes
-- nothing leaves no trace, so a healthy job looks overdue and a broken job looks
-- identical to an idle one. expire-grants has zero provenance entries ever —
-- on side-effect evidence, "broken again" and "no deadlines to roll" are the
-- same picture.
--
-- `summary` is each job's own response body, stored verbatim. Every cron already
-- computes its counts and returns them in JSON, then throws them away; this
-- persists what exists rather than calculating anything new.
--
-- `summary.usage` carries {model, input_tokens, output_tokens, calls} for jobs
-- that call a model. Money is derived at RENDER time, never stored: prices
-- change, and a stored figure goes quietly wrong while a token count stays true.

create table if not exists public.cron_runs (
  id           uuid primary key default gen_random_uuid(),
  job          text        not null,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  ok           boolean,
  summary      jsonb,
  error        text
);

comment on table public.cron_runs is
  'One row per scheduled-job run. ok IS NULL means the run started and never reported back — a crash or timeout, which is distinct from ok=false (ran, failed cleanly).';

create index if not exists idx_cron_runs_job_started
  on public.cron_runs (job, started_at desc);

create index if not exists idx_cron_runs_started
  on public.cron_runs (started_at desc);
