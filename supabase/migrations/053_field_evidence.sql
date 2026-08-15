-- 053 — field_evidence: when was this last checked against the funder's page,
-- and what did the page actually say.
--
-- APPLIED TO PROD 2026-08-15, immediately before this file was committed.
--
-- WHY A SECOND COLUMN AND NOT field_provenance.
--
-- `field_provenance` answers "who last WROTE this, and when". That is a
-- different question from "when was this last CHECKED", and the two cannot
-- share a column because of a rule that is deliberately in the system and
-- should stay: mergeFieldUpdate treats an unchanged value as `idempotent` and
-- writes nothing. Confirming that a machine got it right is not the same as
-- deciding it must never improve.
--
-- The consequence is that a verification run which AGREES with the stored value
-- leaves no trace at all. Today the verification engine already computes a
-- `confirmed[]` array of fields the page agreed with, and throws it away every
-- run, because there is nowhere to put it. That is the whole reason the publish
-- gate cannot require evidence: evidence is not yet a thing a row can hold.
--
-- Shape, one entry per field:
--
--   {
--     "is_rolling": {
--       "quote":      "Draw 1 23-27 March. Draw 2 7-11 September.",
--       "source_url": "https://www.movementforgood.com/draw-dates",
--       "checked_at": "2026-08-15T09:14:22.000Z",
--       "by":         "verify:v1",
--       "agrees":     false
--     }
--   }
--
-- `agrees` is three-valued and the third value is the point:
--
--   true   the page states this and it matches what we hold
--   false  the page states something else — a correction is owed
--   null   we read the page and it did not address this field at all
--
-- A null-agrees stamp carries no quote and must NEVER satisfy a publish gate:
-- it is the record of a page-sourcing failure, not of a verified fact. It is
-- stored anyway because without it a silent page is indistinguishable from a
-- page never read, so the engine would re-read the same 137 timing-less rows on
-- every pass forever and section A7 would have nowhere to record its answer.
--
-- `source_url` is per field, not per row, and that is deliberate even though
-- today every fact in a run comes from the same page. It is what makes
-- multi-page sourcing storable rather than merely possible: a row will need to
-- say its eligibility came from /who-we-fund and its dates from /draw-dates,
-- and each must be separately re-checkable and separately stale-able.
--
-- WHAT IS NOT HERE. `apply_url` has no entry. Its evidence already exists as
-- url_status + url_last_checked, and a second home for the same fact would rot.
-- The gate reads those columns for the link and this column for everything else.
--
-- NO SORT COLUMN YET. Oldest-evidence-first selection will want a top-level
-- timestamp rather than a dig through JSONB. Deliberately not added until the
-- engine's real query shape exists — a generated column guessed at now is a
-- column to migrate away from later.

alter table public.scraped_grants
  add column if not exists field_evidence jsonb;

comment on column public.scraped_grants.field_evidence is
  'Per-field record of the last check against the funder''s page: quote, source_url, checked_at, by, agrees (true=matches, false=contradicts, null=page silent). Written OUTSIDE mergeGrantUpdate and NOT subject to the trust ladder — recording that a page was read is not a claim about what the value should be, so an ai_* check must be able to stamp a field whose value an admin owns. A null-agrees entry is not evidence and must not satisfy a publish gate.';

-- Existence and containment queries: "which live rows carry no stamp for
-- is_rolling", which is the shape section A6 asks for on 388 rows.
create index if not exists idx_scraped_grants_field_evidence
  on public.scraped_grants using gin (field_evidence);

-- ── Atomic per-field merge ───────────────────────────────────────────────────
--
-- A read-modify-write from the application would be a lost-update race the
-- moment the engine runs anything concurrently, and §4.2 sizes it at 5-way.
-- `||` on jsonb is a shallow merge, which is exactly right here: entries are
-- keyed by field name and each stamp is replaced whole.
--
-- RETURNING the merged object so the caller can verify the write landed rather
-- than trusting a 200. A cron writing through a cookie-scoped client resolves to
-- anon, matches zero rows under RLS, and reports success — that has happened in
-- this codebase before, and an empty result set here is how it gets caught.

create or replace function public.merge_field_evidence(row_id uuid, patch jsonb)
returns jsonb
language sql
volatile
as $$
  update public.scraped_grants
     set field_evidence = coalesce(field_evidence, '{}'::jsonb) || patch
   where id = row_id
  returning field_evidence;
$$;

comment on function public.merge_field_evidence(uuid, jsonb) is
  'Shallow-merge a field_evidence patch into a row and return the result. Service role only — this bypasses the provenance trust ladder by design and must never be reachable from a browser client.';

-- Not security definer, and not granted to anon or authenticated: the service
-- role bypasses RLS on its own, so the function needs no elevation, and a
-- browser client must not be able to stamp evidence it did not gather.
revoke all on function public.merge_field_evidence(uuid, jsonb) from public;
revoke all on function public.merge_field_evidence(uuid, jsonb) from anon;
revoke all on function public.merge_field_evidence(uuid, jsonb) from authenticated;
grant execute on function public.merge_field_evidence(uuid, jsonb) to service_role;
