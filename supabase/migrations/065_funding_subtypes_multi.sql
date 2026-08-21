-- 065 — a row can be more than one kind of investment or programme.
--
-- `funding_subtype` is a single text value, and almost nothing in those two tabs
-- is a single thing. Access offers blended finance AND enterprise grants AND
-- business support. Trust for London does loans AND equity. Bethnal Green
-- Ventures is an accelerator that takes equity. Picking one forced a lie on the
-- first row and hid the rest.
--
-- Paul, 2026-08-19: "for the investor and programmes funder types, it would be
-- good to have sub tags on each card to label what they are."
--
-- ADDITIVE, DELIBERATELY. `funding_subtype` stays exactly where it is and keeps
-- working. matching.ts reads it against `organisations.funding_subtype_
-- preferences`, the admin edit form writes it, and grants-normalise exposes it
-- as `fundingSubtype`. Breaking any of those to add a label to a card would be a
-- poor trade, so:
--
--   * `funding_subtypes` (plural) becomes the source of truth,
--   * a TRIGGER keeps `funding_subtype` equal to its first element.
--
-- The trigger is why this is in SQL rather than in app code. scraped_grants has
-- five-plus write paths — mergeGrantUpdate, the crawlers, the admin form, raw
-- SQL fixes, the cron jobs — and a derived value maintained in one of them drifts
-- in the other four. Same reasoning as migration 062.
--
-- WRITING TO EITHER COLUMN WORKS. Set the array and the singular follows. Set
-- only the singular, as the admin form does today, and the array is filled from
-- it. What is not supported is setting both to contradictory values in one
-- statement: the array wins, because it is the one that can express the truth.
--
-- Idempotent.

-- ── 1. The column ───────────────────────────────────────────────────────────
alter table public.scraped_grants
  add column if not exists funding_subtypes text[];

-- ── 2. Backfill from the value we already hold ──────────────────────────────
update public.scraped_grants
set    funding_subtypes = array[funding_subtype]
where  funding_subtype is not null
  and  funding_subtype <> ''
  and  funding_subtypes is null;

-- ── 3. Keep the two in step, whichever one is written ───────────────────────
-- WHICH COLUMN WAS WRITTEN decides who wins, not which one is populated.
--
-- The first version asked "is the array non-empty?" and let it win if so. That
-- silently reverted the admin form: a row already carrying ['loan','equity']
-- would take funding_subtype = 'blended', see a non-empty array, and overwrite
-- the new value straight back to 'loan'. Caught by the round-trip test below,
-- which is the only reason it is not in production.
create or replace function public.sync_funding_subtype()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.funding_subtypes is not null and array_length(new.funding_subtypes, 1) > 0 then
      new.funding_subtype := new.funding_subtypes[1];
    elsif new.funding_subtype is not null and new.funding_subtype <> '' then
      new.funding_subtypes := array[new.funding_subtype];
    end if;
    return new;
  end if;

  -- The array was written. It is the one that can express the truth, so it wins.
  if new.funding_subtypes is distinct from old.funding_subtypes then
    if new.funding_subtypes is null or array_length(new.funding_subtypes, 1) is null then
      new.funding_subtype := null;
    else
      new.funding_subtype := new.funding_subtypes[1];
    end if;

  -- Only the singular was written, which is the admin form's path today.
  elsif new.funding_subtype is distinct from old.funding_subtype then
    if new.funding_subtype is null or new.funding_subtype = '' then
      new.funding_subtypes := null;
      new.funding_subtype  := null;
    else
      new.funding_subtypes := array[new.funding_subtype];
    end if;
  end if;

  -- Neither was written: an UPDATE touching other columns. Change nothing, or a
  -- deliberately cleared value would be resurrected by an unrelated edit.
  return new;
end $$;

drop trigger if exists trg_sync_funding_subtype on public.scraped_grants;
create trigger trg_sync_funding_subtype
  before insert or update of funding_subtype, funding_subtypes
  on public.scraped_grants
  for each row execute function public.sync_funding_subtype();

-- ── 4. The view, or the matcher and the cards never see it ──────────────────
--
-- A column on scraped_grants that grants_with_funder does not select is INVISIBLE
-- to every surface that queries the view, and the failure is silent — the card
-- reads `undefined` and renders nothing, exactly as it would for an untagged
-- row. This has blinded the matcher once already; see migration 049.
--
-- Built from the LIVE definition with pg_get_viewdef rather than retyped, for
-- the same reason as 049: the view carries 67 columns and hand-copying that list
-- is how one quietly goes missing.
do $$
declare
  def text;
begin
  def := pg_get_viewdef('public.grants_with_funder'::regclass, true);

  if position('g.funding_subtypes' in def) > 0 then
    raise notice 'funding_subtypes already present on the view';
    return;
  end if;

  def := replace(
    def,
    chr(10) || '   FROM scraped_grants g',
    ',' || chr(10) || '    g.funding_subtypes' || chr(10) || '   FROM scraped_grants g'
  );

  execute 'create or replace view public.grants_with_funder as ' || def;
end $$;

-- ── 5. Prove the trigger, don't assume it ───────────────────────────────────
--
-- Raises, so a broken trigger fails the migration instead of shipping quietly.
-- Case 2 is here because the first version of this function got it wrong: it
-- asked whether the array was non-empty rather than which column had been
-- written, so an admin editing `funding_subtype` on a row that already had an
-- array watched their change revert with no error.
do $$
declare tid uuid;
begin
  insert into public.scraped_grants (title, funder, source, funding_type, is_active, pipeline_state)
  values ('__trigger_test__', '__t__', '__trigger_test__', 'investment', false, 'captured')
  returning id into tid;

  update public.scraped_grants set funding_subtypes = array['loan','equity'] where id = tid;
  if (select funding_subtype from public.scraped_grants where id = tid) is distinct from 'loan' then
    raise exception 'FAIL 1: writing the array did not set the singular';
  end if;

  update public.scraped_grants set funding_subtype = 'blended' where id = tid;
  if (select funding_subtypes from public.scraped_grants where id = tid) is distinct from array['blended'] then
    raise exception 'FAIL 2: writing the singular did not set the array';
  end if;

  update public.scraped_grants set funding_subtypes = null where id = tid;
  update public.scraped_grants set title = '__trigger_test2__' where id = tid;
  if (select funding_subtype from public.scraped_grants where id = tid) is not null then
    raise exception 'FAIL 3: an unrelated update resurrected a cleared value';
  end if;

  delete from public.scraped_grants where id = tid;
  raise notice 'sync_funding_subtype: all three cases pass';
end $$;
