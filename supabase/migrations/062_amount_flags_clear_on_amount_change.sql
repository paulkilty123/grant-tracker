-- An amount flag is an argument ABOUT the stored amount. The moment the amount
-- changes, the argument is settled and the flag is a statement about a value
-- that no longer exists.
--
-- Nothing cleared them. On 2026-08-18 three live rows warned about a
-- disagreement with themselves: Football Foundation Grass Pitch (stored £3,200,
-- flag arguing for £3,200), Lloyds Specialist (£200,000 vs £200,000) and
-- Oxfordshire Thriving in Nature (£500,000 vs £500,000). Each had been corrected
-- by hand; each kept its warning.
--
-- WHY A TRIGGER AND NOT A LINE IN THE HANDLER. scraped_grants has several write
-- paths -- the review queue, enrich-grant, fill-amounts, the crawlers, ad-hoc
-- admin SQL. Clearing the flag in whichever handler happens to be in front of us
-- fixes that one path and leaves the rest to rot, which is how this got here.
-- The invalidation belongs beside the data.
--
-- amount_pot_suspected BLOCKS publication, so a stale one is not cosmetic: it
-- holds a corrected row out of the catalogue indefinitely.
--
-- Applied to production 2026-08-18, before this file was committed, per the
-- house convention. Proof, both directions, on Morrisons Foundation:
--   amount write     -> amount flags 1 -> 0
--   non-amount write -> amount flags 1 -> 1

create or replace function clear_amount_flags_on_amount_change()
returns trigger
language plpgsql
as $$
begin
  -- Only the flags that argue about the amount. Others on the row are about
  -- deadlines or rounds and have nothing to do with this change.
  if new.raw_data ? 'checks' then
    new.raw_data = jsonb_set(
      new.raw_data,
      '{checks}',
      coalesce(
        (select jsonb_agg(c)
           from jsonb_array_elements(new.raw_data->'checks') c
          where c->>'code' not in ('amount_pot_suspected', 'amount_under_stated')),
        '[]'::jsonb
      )
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_clear_amount_flags on scraped_grants;

create trigger trg_clear_amount_flags
before update on scraped_grants
for each row
when (
  old.amount_min is distinct from new.amount_min
  or old.amount_max is distinct from new.amount_max
)
execute function clear_amount_flags_on_amount_change();

comment on function clear_amount_flags_on_amount_change() is
  'Drops amount_pot_suspected / amount_under_stated from raw_data.checks whenever amount_min or amount_max changes. Added 2026-08-18 after three live rows were found warning about a disagreement with their own current value.';
