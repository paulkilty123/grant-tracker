-- 090: a per-row switch that opens one record to logged-out readers.
--
-- Paul, 18 Sept 2026: "if I wanted to open say 3 grants that I promote via
-- LinkedIn so anyone has access, could I do that easily on command?" Since
-- the record went behind sign-in (branch grants/names-only, same day), this
-- is the door back out for a chosen few. The row renders the gated public
-- view: facts, one sentence, locked cards, funder homepage. Nothing else
-- changes. Default off; set by hand or by script on Paul's word.

alter table public.scraped_grants
  add column if not exists open_to_public boolean not null default false;

comment on column public.scraped_grants.open_to_public is
  'Logged-out readers may open this record (gated public view). Paul''s call, per row. Added 2026-09-18.';
