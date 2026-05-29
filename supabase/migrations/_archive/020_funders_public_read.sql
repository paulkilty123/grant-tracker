-- 020_funders_public_read.sql
-- Applied to remote: 2026-05-12 via Supabase MCP apply_migration.
--
-- Add public read policy to the funders table. Required because the MCP
-- route handler runs as anon/authenticated (no user session for agent
-- requests) and the get_provider_intelligence tool needs to read funders
-- to set data_richness='enriched'. Mirrors the existing scraped_grants
-- "publicly readable" policy. Read-only — INSERT/UPDATE/DELETE remain
-- service-role only (no policies exist for those operations).
--
-- The funders.notes column contains curated editorial commentary (e.g.,
-- "Sunset 2024: pivoted from grant-making to advocacy"). It's not insider
-- application guidance — it's the kind of summary that would normally be
-- public anyway. The MCP adapter does not currently expose `notes`; only
-- enriched_data (sectors_funded, typical_amount_range, geographic_scope_detail,
-- short_name) flows through. Direct queries to funders would see notes;
-- the MCP tool surface does not.

CREATE POLICY "Funders are publicly readable"
  ON public.funders
  FOR SELECT
  USING (true);
