-- A page-read verdict is a statement ABOUT A PAGE. Change the page and the
-- verdict is about a URL the row no longer points at.
--
-- Paul, 2026-08-28: corrected the Historic England link in the review queue,
-- which re-enriches and re-tags, and the row stayed flagged "the page does not
-- describe this fund". It was right to, in a sense nobody wants: the flag comes
-- from `field_evidence._page_read`, written only by the verification engine,
-- and the queue's re-read runs enrichment. Two engines, and the one the button
-- runs is not the one that wrote the verdict.
--
-- So the fix that is most likely to settle a wrong-fund verdict — replacing the
-- link — could not clear it, and the row kept a verdict about the old page until
-- the verifier came round on its own cadence. That is up to a fortnight of a
-- corrected row reading as broken, and of a verdict describing a page we have
-- stopped linking to.
--
-- WHAT THIS CLEARS, AND WHAT IT LEAVES ALONE
--
-- `_page_read` goes, because it is a verdict on the page as a whole.
--
-- A per-field stamp goes only if its `source_url` is the URL we just left. A row
-- is read across up to three pages, so a stamp taken from a funder's guidance
-- page is still true after the apply link moves, and deleting it would throw
-- away evidence that cost money to gather. `verify-row.ts` records source_url
-- per field for exactly this reason.
--
-- `verify_due_at` is set to now so the next verification run takes this row
-- first rather than in a fortnight. The queue orders by it.
--
-- WHY A TRIGGER. Same argument as migration 062: apply_url is written by the
-- review queue, the URLs page, update-grant, the crawlers and ad-hoc SQL.
-- Clearing this in whichever handler is in front of us fixes one path and leaves
-- the rest to rot.

create or replace function clear_page_read_on_link_change()
returns trigger
language plpgsql
as $$
begin
  if new.field_evidence is null then
    return new;
  end if;

  -- The verdict on the page as a whole.
  new.field_evidence = new.field_evidence - '_page_read';

  -- Per-field stamps taken FROM the old page, and only those.
  new.field_evidence = coalesce(
    (select jsonb_object_agg(key, value)
       from jsonb_each(new.field_evidence)
      where value->>'source_url' is distinct from old.apply_url),
    '{}'::jsonb
  );

  -- Look at this row again soon rather than on the usual cadence.
  new.verify_due_at = now();

  return new;
end;
$$;

drop trigger if exists trg_clear_page_read_on_link_change on scraped_grants;

create trigger trg_clear_page_read_on_link_change
before update on scraped_grants
for each row
when (
  old.apply_url is distinct from new.apply_url
  and new.apply_url is not null
)
execute function clear_page_read_on_link_change();

comment on function clear_page_read_on_link_change() is
  'When apply_url changes, drops field_evidence._page_read and any per-field stamp whose source_url was the old link, and sets verify_due_at to now. Added 2026-08-28: a corrected link left the old page''s verdict in place, so a fixed row kept reading as broken until the verifier next came round.';
