-- 088: the catalogue is not readable by the public key.
--
-- Found 18 Sept 2026 while Paul was weighing how much the public hub pages
-- give away. The hub pages were the small leak. The large one was that
-- scraped_grants carried the policy "Scraped grants are publicly readable"
-- (to public, using true), anon held SELECT on the table, and the
-- grants_with_funder view runs as its owner with no security_invoker, so
-- anon read it without RLS at all. One request with the anon key, which is
-- in every page's JavaScript, returned all 673 live rows with briefs and
-- apply links. No account needed.
--
-- Every reader in the app runs signed in (authenticated role) or on the
-- service key: the dashboard pages use the browser client with a session,
-- the public hub pages and the MCP use getAdminDb, the crons use the
-- service key. The two server-component readers that could run as anon
-- (the grant record's loadGrant and its opengraph-image) now sit behind
-- a sign-in redirect, and both return "not found" cleanly on an empty read.
--
-- Same shape as 064 (marketing_list): fix the grant, not the view.

revoke all on public.scraped_grants from anon;
revoke all on public.grants_with_funder from anon;
revoke all on public.funders from anon;

drop policy if exists "Scraped grants are publicly readable" on public.scraped_grants;
create policy "Scraped grants are readable when signed in"
  on public.scraped_grants for select
  to authenticated
  using (true);

drop policy if exists "Funders are publicly readable" on public.funders;
create policy "Funders are readable when signed in"
  on public.funders for select
  to authenticated
  using (true);
