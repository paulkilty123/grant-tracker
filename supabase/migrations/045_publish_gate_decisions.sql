-- 045 — Audit trail for the auto-publish gate.
--
-- APPLIED TO PROD. Confirmed 2026-08-01: the table exists and holds live gate
-- decisions. This header said "NOT YET APPLIED" long after it had been, which
-- is the wrong direction for a DDL note to be wrong in — it is what someone
-- reads immediately before deciding to run it again.
--
-- Purely additive (one new table), no change to any existing table, but it is
-- DDL — apply deliberately, not as a deploy side effect.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- Why this table exists
-- ─────────────────────────────────────────────────────────────────────────────
-- The gate's blocking set is a judgement call, not a derived fact. It was
-- chosen on 2026-07-26 by modelling four candidate policies against the live
-- queue, and it will be wrong at the edges. The only way to tighten or loosen
-- it honestly is to be able to ask, later:
--
--   * which reasons actually held rows back, and how often
--   * did anything auto-published turn out to be wrong
--   * how many rows were "live and wrong" and for how long
--   * did the write we thought we made actually land
--
-- None of that is answerable from logs. The scope doc's own finding was that
-- every existing quality signal in this codebase is computed, persisted, and
-- then never read at the point of decision; a gate with no audit trail would
-- repeat that mistake one level up — you would be tuning thresholds from feel,
-- which is what the modelling was meant to replace.
--
-- `rejected_fields` is the load-bearing one. mergeGrantUpdate returns
-- { applied, rejected }, and almost every caller in this codebase discards the
-- rejected array and increments a success counter anyway. That is how "Detect
-- all" came to report success while writing nothing. If the gate says it
-- published 74 rows, this column is the evidence that it did.

create table if not exists public.publish_gate_decisions (
  id                  uuid primary key default gen_random_uuid(),
  grant_id            uuid not null references public.scraped_grants(id) on delete cascade,
  decided_at          timestamptz not null default now(),

  -- 'publish' | 'hold' | 'attention' — see src/lib/admin/publish-gate.ts
  outcome             text not null check (outcome in ('publish', 'hold', 'attention')),

  -- Was the row visible to users at decision time? This is the split the gate
  -- turns on: holding a row that is ALREADY live protects nobody, so 'attention'
  -- (live and blocking) is a different thing from 'hold' (withheld and blocking).
  was_live            boolean not null,

  blocking_codes      text[] not null default '{}',
  informational_codes text[] not null default '{}',

  -- Did the write land? False for dry runs and for any write the trust ladder
  -- refused. Never assume a decision took effect.
  applied             boolean not null default false,
  rejected_fields     text[] not null default '{}',

  -- Which revision of the blocking set produced this decision, so calibration
  -- compares like with like across policy changes.
  policy_version      text not null,

  -- True when the run was a dry run and deliberately wrote nothing.
  dry_run             boolean not null default false
);

comment on table public.publish_gate_decisions is
  'One row per gate decision. Calibration evidence for the auto-publish blocking set.';

-- The two access patterns: "what happened to this grant" and "what did the
-- last run do".
create index if not exists publish_gate_decisions_grant_idx
  on public.publish_gate_decisions (grant_id, decided_at desc);

create index if not exists publish_gate_decisions_recent_idx
  on public.publish_gate_decisions (decided_at desc);

-- Admin/service-role only. RLS on with no policy = deny to anon and
-- authenticated; the service-role key bypasses RLS, which is what the gate
-- runner and the admin surfaces use.
--
-- Deliberately NOT granting to anon: the 2026-10-30 note that new public tables
-- need an explicit GRANT applies to tables meant to be publicly readable. This
-- one is not — it records internal decisions about unreviewed data.
alter table public.publish_gate_decisions enable row level security;
