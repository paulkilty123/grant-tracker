-- Match feedback is scoped to the organisation it was given for (Paul,
-- 14 September 2026).
--
-- The table was keyed by user alone, so a thumbs-down given while looking at
-- one organisation's matches shaped every other organisation that user owns.
-- Seen on the day: a brand-new FareShare South West profile on Paul's account
-- had community-sector rows docked by feedback left months earlier on other
-- organisations, so the reveal said 75 and Find Funding said 71 for the same
-- fund. A consultant with several clients would see the same bleed.
--
-- Additive. Rows written before this carry no org; the backfill assigns them
-- to the owner's organisation where the owner has exactly one, and leaves
-- them null otherwise (they stay for triage, and no longer shape scores).
-- The unique (user_id, grant_id) constraint is untouched: a re-vote on the
-- same grant from another organisation moves the row, which is acceptable
-- for now and noted in src/lib/matchFeedback.ts.

alter table public.match_feedback
  add column if not exists org_id uuid references public.organisations(id) on delete cascade;

create index if not exists match_feedback_org_id_idx on public.match_feedback (org_id);

update public.match_feedback mf
   set org_id = o.id
  from (
    select owner_id, min(id::text)::uuid as id
      from public.organisations
     group by owner_id
    having count(*) = 1
  ) o
 where mf.org_id is null
   and mf.user_id = o.owner_id;

comment on column public.match_feedback.org_id is
  'The organisation whose matches were on screen when the feedback was given. Null for rows older than migration 086 whose owner had more than one organisation; those rows do not shape scores.';
