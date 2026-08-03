-- 049 — expose spend_types / spend_restriction on grants_with_funder.
--
-- APPLIED TO PROD 2026-08-03, immediately before this file was committed.
-- Verified after apply: 67 view columns, both spend columns present, all 65
-- pre-existing columns intact.
--
-- WHY THIS HAD TO LAND BEFORE ANY WRITE
--
-- grants_with_funder is the matcher's primary query surface. A column that
-- exists on scraped_grants but is not selected by the view is invisible to
-- matching, and the failure is SILENT: matching.ts reads grant.spendTypes,
-- gets undefined, and skips the dimension exactly as it would for a genuinely
-- unstated fund. Writing the 621 detected rows before this landed would have
-- produced a catalogue that LOOKED tagged and SCORED as though it were not —
-- the same view drift that has blinded this matcher once already.
--
-- Migrations 047 and 048 both added columns without touching the view. Paul
-- caught it by gating on "confirm the view fix is merged first"; there was no
-- fix to merge.
--
-- WHY IT IS BUILT FROM THE LIVE DEFINITION
--
-- The view carries 65 columns. Hand-copying that list into a CREATE OR REPLACE
-- is how one quietly goes missing — and a dropped column here is the same
-- silent blindness this migration exists to fix. So it reads the current
-- definition with pg_get_viewdef and appends, rather than restating it.
--
-- A first attempt at this migration rebuilt the view from a GUESSED join
-- (g.funder_id, which does not exist — the real join is on lowercased
-- funder/short_name). It failed and rolled back atomically, and the view was
-- confirmed intact before retrying. Do not retype this view from memory.
--
-- Appending at the END is the only position CREATE OR REPLACE permits, and it
-- leaves every existing column ordinal unchanged for positional consumers.
--
-- Idempotent: re-running is a no-op once the columns are present.

do $$
declare
  def text;
begin
  def := pg_get_viewdef('public.grants_with_funder'::regclass, true);

  if position('g.spend_types' in def) > 0 then
    raise notice 'spend columns already present';
    return;
  end if;

  def := replace(
    def,
    chr(10) || '   FROM scraped_grants g',
    ',' || chr(10) || '    g.spend_types,' || chr(10) || '    g.spend_restriction'
        || chr(10) || '   FROM scraped_grants g'
  );

  execute 'create or replace view public.grants_with_funder as ' || def;
end $$;
