-- 070: amount_undisclosed becomes a derived value, not a hand-set one.
--
-- APPLIED to production 2026-08-30.
--
-- WHY
--
-- The column carries a real distinction that the MCP contract depends on
-- (src/lib/opportunity-adapter.ts):
--
--   true  -> the funder publishes no per-grant figure. Say so honestly.
--   false + null amounts -> we have not looked yet. That is our gap, not theirs.
--
-- Set by hand, it stopped meaning either. Measured on production 2026-08-30
-- across published, active rows:
--
--   142 rows have no amount at all, of which only 14 are flagged
--     3 rows are flagged WHILE CARRYING AN AMOUNT, which cannot both be true:
--       Kusuma Trust UK              £3,000 - £5,000,000, flagged
--       Foundation Scotland Barrhill        max £5,001,   flagged
--       South Lanarkshire Renewable   £75 - £20,000,      flagged
--
-- Sussex CF's Rampion fund is flagged and Barrow Cadbury and Virgin Money
-- Foundation are not, on identical null/null data. Same data, different answer,
-- depending on who touched the row last.
--
-- WHAT IS DERIVED, AND WHAT IS STILL A JUDGEMENT
--
-- "The funder publishes nothing" is not derivable from null amounts alone —
-- that is exactly the false-but-null case the contract distinguishes. Somebody
-- has to have looked. So the rule keeps the judgement and derives only the
-- consistency:
--
--   * amounts present  -> ALWAYS false. A figure and "no figure published"
--     cannot both hold, whoever set the flag. This is the part that was broken.
--   * amounts null     -> true when someone established it: the flag was already
--     true (a human decision, preserved), or the amount's own provenance says a
--     verified read found no figure.
--
-- So the flag can no longer contradict the data, and a row that nobody has read
-- stays false, which is what the contract says it must mean.
--
-- Deliberately a trigger and not application code: the value has to hold for
-- every writer — the crons, the admin routes, the enrich merger and raw SQL —
-- and a derived value maintained in one caller drifts the moment a second one
-- writes. Same reasoning as 068.

create or replace function derive_amount_undisclosed()
returns trigger
language plpgsql
as $$
declare
  established boolean;
begin
  if new.amount_min is not null or new.amount_max is not null then
    new.amount_undisclosed := false;
    return new;
  end if;

  established :=
    coalesce(new.amount_undisclosed, false)
    or coalesce(new.field_provenance -> 'amount_max' ->> 'source', '')
         ~ '^(user_verified|admin):'
    or coalesce(new.field_provenance -> 'amount_min' ->> 'source', '')
         ~ '^(user_verified|admin):';

  new.amount_undisclosed := established;
  return new;
end;
$$;

drop trigger if exists trg_derive_amount_undisclosed on scraped_grants;

create trigger trg_derive_amount_undisclosed
  before insert or update of amount_min, amount_max, amount_undisclosed, field_provenance
  on scraped_grants
  for each row
  execute function derive_amount_undisclosed();

-- One-time reconciliation of the rows written before the trigger existed.
-- Touching amount_undisclosed is enough to fire it, so the rule below is the
-- function's rule and cannot drift from it.
update scraped_grants
set amount_undisclosed = amount_undisclosed
where amount_undisclosed is distinct from false
   or amount_min is null
   or amount_max is null;

comment on column scraped_grants.amount_undisclosed is
  'DERIVED by trg_derive_amount_undisclosed (migration 070). true = the funder '
  'publishes no per-grant figure and someone established that; false = either an '
  'amount is held, or nobody has looked yet. Do not set by hand — set the amount '
  'and its field_provenance instead.';
