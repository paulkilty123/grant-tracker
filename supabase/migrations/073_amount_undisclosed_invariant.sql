-- 073: a row cannot both hold an amount and claim the funder publishes none.
--
-- Renumbered from 071 alongside 072, see that file.
--
-- APPLIED to production 2026-08-30.
--
-- The invariant broke on 29 August. Three published rows carried
-- amount_undisclosed = true while holding a figure — Kusuma Trust UK at
-- £3,000-£5,000,000, Foundation Scotland's Barrhill fund at £5,001, South
-- Lanarkshire Renewable at £75-£20,000 — because the flag was hand-set and
-- nothing stopped it contradicting the data next to it.
--
-- 072 made the flag derived, which fixes the cause. This is the check that the
-- derivation is still in place: a constraint fires even if the trigger is
-- dropped, disabled, or bypassed by a writer that sets the column directly.
-- The trigger runs BEFORE the row is written and the constraint validates after,
-- so the two compose — the trigger corrects, and this refuses anything it did
-- not correct.
--
-- Verified 0 violations across all 1,947 rows before adding, so this validates
-- rather than merely applying to new writes.
--
-- Note what is NOT constrained: a row with both amounts null and the flag false.
-- That is the honest "nobody has looked yet" case and it is most of the
-- catalogue. Only the contradiction is refused.

alter table scraped_grants
  drop constraint if exists scraped_grants_undisclosed_has_no_amount;

alter table scraped_grants
  add constraint scraped_grants_undisclosed_has_no_amount
  check (
    not coalesce(amount_undisclosed, false)
    or (amount_min is null and amount_max is null)
  );

comment on constraint scraped_grants_undisclosed_has_no_amount on scraped_grants is
  'amount_undisclosed asserts the funder publishes no per-grant figure, so it '
  'cannot be true on a row holding one. Derived by trg_derive_amount_undisclosed '
  '(migration 072); this refuses anything that derivation did not correct.';
