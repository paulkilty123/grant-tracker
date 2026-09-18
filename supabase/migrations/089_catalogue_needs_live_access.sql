-- 089: reading the catalogue needs an organisation with live access.
--
-- 088 (same day) took the public key off the catalogue. This closes the
-- next door: a bare signup, confirmed but with no organisation, or an
-- account whose trial the expire cron has ended (apply_access false), can
-- no longer read scraped_grants or grants_with_funder from the browser.
-- Paul, 18 Sept 2026, on the Fundin founder's confirmed-but-never-used
-- account: "do both of those now" (the account is also banned).
--
-- apply_access is the flag the rest of the product already keys on: a new
-- organisation gets 14 days by default (078), derive_apply_access (069)
-- keeps it in step with subscriptions and granted_access_until, and the
-- expire cron ends it on day 15. Browsing without a profile (080) still
-- creates an organisation, so browsers keep reading.
--
-- grants_with_funder ran as its owner (postgres) and so ignored row
-- security on scraped_grants; security_invoker makes the reader's own
-- policy apply through the view. Service-role readers (hubs, MCP, crons,
-- admin) bypass RLS and are unaffected.

drop policy if exists "Scraped grants are readable when signed in" on public.scraped_grants;
create policy "Scraped grants are readable with live access"
  on public.scraped_grants for select
  to authenticated
  using (
    exists (
      select 1 from public.organisations o
      where o.owner_id = auth.uid() and o.apply_access = true
    )
  );

alter view public.grants_with_funder set (security_invoker = on);
