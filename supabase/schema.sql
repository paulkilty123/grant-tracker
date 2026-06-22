-- =============================================================================
-- Grant Tracker — Authoritative database baseline
-- =============================================================================
-- Generated: 2026-05-29
-- Source: read-only introspection of the live Supabase project
--         (yrndczlqjqtfgissleev, Postgres 17.x, schema "public" only).
--
-- This file is the single source of truth for the `public` schema as it
-- actually exists in production. The hand-numbered migrations under
-- supabase/migrations/_archive/ (001-022) drifted from live and are kept
-- only for history. New schema changes should be added as new migrations on
-- top of this baseline.
--
-- -----------------------------------------------------------------------------
-- KNOWN GAPS / CONFIDENCE NOTES (read before relying on this for a fresh DB)
-- -----------------------------------------------------------------------------
-- HIGH confidence (introspected directly from the catalog, verbatim):
--   - all 24 base tables, every column, type, nullability and default
--   - all PRIMARY KEY / UNIQUE / CHECK / FOREIGN KEY constraints
--   - all non-constraint indexes (incl. partial + GIN)
--   - all 4 enum types
--   - all 3 views (grants_with_funder, opportunity, pipeline_stats)
--   - RLS enable flags and all 22 row-level security policies
--   - the 2 row triggers + their 2 trigger functions
--
-- LOWER confidence / reconstructed — verify if exactness matters:
--   1. GRANTs. Live uses the uniform Supabase default (anon, authenticated,
--      service_role each hold table privileges; RLS does the real gating).
--      The GRANT block below is RECONSTRUCTED to that default, not dumped
--      per-privilege. Functionally equivalent on Supabase.
--   2. Event trigger `ensure_rls` + function `rls_auto_enable()`. Captured for
--      fidelity, but creating an event trigger needs elevated (superuser)
--      privileges. `supabase db reset` runs as postgres so it works locally;
--      on a plain Postgres target it can be safely omitted. It only
--      auto-enables RLS on newly-created public tables.
--
-- INTENTIONALLY OMITTED (platform-managed by Supabase, not app schema):
--   - 6 Supabase event triggers: issue_graphql_placeholder,
--     issue_pg_cron_access, issue_pg_graphql_access, issue_pg_net_access,
--     pgrst_ddl_watch, pgrst_drop_watch
--   - extension-internal functions/types from pg_trgm, pgcrypto, uuid-ossp
--     (recreated implicitly by CREATE EXTENSION below)
--   - platform extensions: pg_cron, pg_stat_statements, supabase_vault
--   - pg_cron scheduled jobs, COMMENTs, object ownership, the auth/storage
--     schemas. FKs to auth.users assume the Supabase auth schema exists.
--   - no sequences exist (every PK is uuid or text).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Extensions (app-relevant only)
-- -----------------------------------------------------------------------------
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema public;

-- -----------------------------------------------------------------------------
-- Enum types
-- -----------------------------------------------------------------------------
create type public.funder_type as enum (
  'trust_foundation', 'local_authority', 'housing_association', 'corporate', 'lottery', 'government', 'other'
);

create type public.org_type as enum (
  'registered_charity', 'cic', 'social_enterprise', 'community_group', 'other'
);

create type public.pipeline_stage as enum (
  'identified', 'researching', 'applying', 'submitted', 'won', 'declined'
);

create type public.pipeline_state as enum (
  'captured', 'tagged', 'published', 'archived', 'enriched', 'tagged_awaiting_review', 'rejected', 'between_rounds_scheduled'
);

-- -----------------------------------------------------------------------------
-- Trigger functions
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

create or replace function public.fn_auto_deactivate_closed_grants()
returns trigger
language plpgsql
as $function$
BEGIN
  IF (
    NEW.description ILIKE '%this fund is now closed%'
    OR NEW.description ILIKE '%fund is now closed%'
    OR NEW.description ILIKE '%is now closed to%'
    OR NEW.description ILIKE '%this fund is closed%'
    OR NEW.description ILIKE '%fund has now closed%'
    OR NEW.description ILIKE '%closed to applications%'
    OR NEW.description ILIKE '%applications are now closed%'
    OR NEW.description ILIKE '%this round is now closed%'
    OR NEW.description ILIKE '%funding round has closed%'
    OR NEW.description ILIKE '%this programme has closed%'
    OR NEW.description ILIKE '%no longer accepting applications%'
    OR NEW.description ILIKE '%not currently accepting applications%'
  ) THEN
    NEW.is_active := false;
    NEW.is_rolling := false;
  END IF;
  RETURN NEW;
END;
$function$;

-- NOTE (low confidence / elevated privilege): event-trigger function.
-- Auto-enables RLS on any new table created in the public schema.
create or replace function public.rls_auto_enable()
returns event_trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

-- =============================================================================
-- Tables
-- =============================================================================

create table public.api_keys (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  key_hash text not null,
  key_prefix text not null,
  name text not null,
  utm_source text not null default 'developer_mcp'::text,
  org_name text,
  use_case text,
  tos_version text not null,
  status text not null default 'active'::text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  revoked_reason text,
  constraint api_keys_pkey primary key (id),
  constraint api_keys_key_hash_key unique (key_hash),
  constraint api_keys_status_check check ((status = any (array['active'::text, 'revoked'::text])))
);

create table public.application_drafts (
  id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  user_id uuid not null,
  title text not null default 'Untitled draft'::text,
  state jsonb not null,
  constraint application_drafts_pkey primary key (id)
);

create table public.application_reviews (
  id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid,
  user_email text,
  request jsonb not null,
  result jsonb not null,
  constraint application_reviews_pkey primary key (id)
);

create table public.corporate_partners (
  id uuid not null default gen_random_uuid(),
  company_name text not null,
  slug text not null,
  industry_sector text,
  logo_url text,
  website text,
  programme_name text,
  programme_url text,
  support_types text[] default '{}'::text[],
  csr_themes text[] default '{}'::text[],
  impact_sectors text[] default '{}'::text[],
  geographic_focus text[] default '{}'::text[],
  amount_min integer,
  amount_max integer,
  annual_investment_estimate integer,
  application_route text,
  description text,
  example_recipients text[] default '{}'::text[],
  contact_role text,
  contact_url text,
  is_active boolean default true,
  last_verified_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  partner_brief jsonb,
  constraint corporate_partners_pkey primary key (id),
  constraint corporate_partners_slug_key unique (slug),
  constraint corporate_partners_application_route_check check ((application_route = any (array['open_application'::text, 'invitation_only'::text, 'relationship_based'::text, 'formal_programme'::text, 'community_fund'::text])))
);

create table public.crawl_errors (
  id uuid not null default gen_random_uuid(),
  source text not null,
  occurred_at timestamptz not null default now(),
  error_type text not null,
  error_msg text not null,
  context jsonb,
  resolved_at timestamptz,
  constraint crawl_errors_pkey primary key (id)
);

create table public.crawl_logs (
  id uuid not null default gen_random_uuid(),
  source text not null,
  batch integer,
  fetched integer not null default 0,
  upserted integer not null default 0,
  error text,
  ran_at timestamptz not null default now(),
  constraint crawl_logs_pkey primary key (id)
);

create table public.deep_search_cache (
  id uuid not null default gen_random_uuid(),
  query_key text not null,
  results jsonb not null,
  created_at timestamptz default now(),
  constraint deep_search_cache_pkey primary key (id),
  constraint deep_search_cache_query_key_key unique (query_key)
);

create table public.discovery_queue (
  id uuid not null default gen_random_uuid(),
  query text not null,
  funder_name text,
  title text,
  url text,
  description text,
  deadline text,
  amount_range text,
  eligibility_snippet text,
  funding_type text,
  source text default 'gemini'::text,
  status text default 'pending'::text,
  duplicate_of uuid,
  raw_response jsonb,
  notes text,
  discovered_at timestamptz default now(),
  processed_at timestamptz,
  constraint discovery_queue_pkey primary key (id)
);

create table public.dismissed_grants (
  id uuid not null default gen_random_uuid(),
  org_id uuid not null,
  grant_id uuid not null,
  dismissed_at timestamptz default now(),
  constraint dismissed_grants_pkey primary key (id),
  constraint dismissed_grants_org_id_grant_id_key unique (org_id, grant_id)
);

create table public.feedback (
  id uuid not null default gen_random_uuid(),
  user_id uuid,
  email text,
  type text not null,
  message text not null,
  extra jsonb default '{}'::jsonb,
  status text not null default 'received'::text,
  created_at timestamptz not null default now(),
  constraint feedback_pkey primary key (id),
  constraint feedback_status_check check ((status = any (array['received'::text, 'reviewing'::text, 'actioned'::text, 'shipped'::text]))),
  constraint feedback_type_check check ((type = any (array['feature'::text, 'bug'::text, 'missing_funder'::text, 'general'::text, 'contact'::text])))
);

create table public.funder_watchlist (
  id uuid not null default gen_random_uuid(),
  name text not null,
  listing_url text not null,
  region text not null default 'national'::text,
  funder_type text not null default 'trust_foundation'::text,
  last_checked timestamptz,
  last_fingerprint text,
  last_count integer default 0,
  status text not null default 'active'::text,
  last_error text,
  notes text,
  created_at timestamptz default now(),
  constraint funder_watchlist_pkey primary key (id),
  constraint funder_watchlist_listing_url_key unique (listing_url)
);

-- The "funder" catalogue. Existed ONLY in live (never in repo migrations);
-- capturing it here is the primary motivation for this baseline.
create table public.funders (
  id text not null,
  name text not null,
  short_name text,
  website text,
  funder_type text not null,
  geographic_scope text[] default '{}'::text[],
  sector_tags text[] default '{}'::text[],
  typical_min integer,
  typical_max integer,
  is_rolling boolean default true,
  notes text,
  is_active boolean default true,
  created_at timestamptz default now(),
  default_funding_type text default 'grant'::text,
  constraint funders_pkey primary key (id),
  constraint funders_funder_type_check check ((funder_type = any (array['lottery'::text, 'government'::text, 'major_trust'::text, 'community_foundation'::text, 'corporate'::text, 'social_investment'::text, 'crowdfunding'::text, 'sector_body'::text])))
);

create table public.grant_interactions (
  id uuid not null default gen_random_uuid(),
  org_id uuid not null,
  grant_id text not null,
  action text not null,
  created_at timestamptz default now(),
  constraint grant_interactions_pkey primary key (id),
  constraint grant_interactions_org_id_grant_id_action_key unique (org_id, grant_id, action),
  constraint grant_interactions_action_check check ((action = any (array['saved'::text, 'dismissed'::text, 'applied'::text])))
);

create table public.live_search_history (
  id uuid not null default gen_random_uuid(),
  org_id uuid,
  query text not null,
  sectors text[] not null default '{}'::text[],
  location text,
  result_count integer,
  created_at timestamptz not null default now(),
  constraint live_search_history_pkey primary key (id)
);

create table public.match_feedback (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  grant_id text not null,
  direction text not null,
  reasons text[] not null default '{}'::text[],
  free_text text,
  match_score_at_time integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint match_feedback_pkey primary key (id),
  constraint match_feedback_user_id_grant_id_key unique (user_id, grant_id),
  constraint match_feedback_direction_check check ((direction = any (array['up'::text, 'down'::text])))
);

create table public.oauth_clients (
  client_id text not null,
  client_secret_hash text,
  client_name text,
  redirect_uris text[] not null,
  grant_types text[] not null default array['authorization_code'::text, 'refresh_token'::text],
  response_types text[] not null default array['code'::text],
  scope text,
  token_endpoint_auth_method text not null default 'none'::text,
  software_id text,
  software_version text,
  registered_by_ip text not null,
  client_id_issued_at timestamptz not null default now(),
  client_secret_expires_at timestamptz,
  last_used_at timestamptz,
  expires_at timestamptz,
  status text not null default 'active'::text,
  constraint oauth_clients_pkey primary key (client_id),
  constraint oauth_clients_status_check check ((status = any (array['active'::text, 'expired'::text, 'revoked'::text])))
);

create table public.oauth_codes (
  code_hash text not null,
  client_id text not null,
  user_id uuid not null,
  redirect_uri text not null,
  scope text not null,
  code_challenge text not null,
  code_challenge_method text not null default 'S256'::text,
  resource text,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint oauth_codes_pkey primary key (code_hash),
  constraint oauth_codes_code_challenge_method_check check ((code_challenge_method = any (array['S256'::text, 'plain'::text])))
);

create table public.oauth_tokens (
  id uuid not null default gen_random_uuid(),
  access_token_hash text not null,
  refresh_token_hash text,
  token_prefix text not null,
  client_id text not null,
  user_id uuid not null,
  scope text not null,
  resource text,
  access_expires_at timestamptz not null,
  refresh_expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint oauth_tokens_pkey primary key (id),
  constraint oauth_tokens_access_token_hash_key unique (access_token_hash),
  constraint oauth_tokens_refresh_token_hash_key unique (refresh_token_hash)
);

create table public.organisations (
  id uuid not null default uuid_generate_v4(),
  created_at timestamptz not null default now(),
  name text not null,
  charity_number text,
  cic_number text,
  org_type public.org_type not null default 'registered_charity'::public.org_type,
  annual_income_band text,
  primary_location text,
  areas_of_work text[] not null default '{}'::text[],
  beneficiaries text[] not null default '{}'::text[],
  themes text[] not null default '{}'::text[],
  min_grant_target integer,
  max_grant_target integer,
  funder_type_preferences public.funder_type[] not null default '{}'::public.funder_type[],
  mission text,
  people_per_year integer,
  volunteers integer,
  years_operating integer,
  projects_running integer,
  key_outcomes text[] not null default '{}'::text[],
  owner_id uuid not null,
  alerts_enabled boolean default false,
  alert_frequency text default 'weekly'::text,
  alert_min_score integer default 70,
  legal_structure text,
  social_mission_declared boolean not null default false,
  articles_restrict_profit boolean not null default false,
  also_individual_practitioner boolean not null default false,
  impact_sectors text[] not null default '{}'::text[],
  org_stage text,
  funding_type_preferences text[] not null default '{}'::text[],
  beneficiary_groups text[] default '{}'::text[],
  funding_subtype_preferences text[] not null default '{}'::text[],
  niche_tags text[] default '{}'::text[],
  has_asset_lock boolean,
  years_trading integer,
  geographic_reach text,
  website_url text,
  last_visited_search_page_at timestamptz,
  evidence_notes text,
  excluded_niche_tags text[] not null default '{}'::text[],
  apply_access boolean not null default false,  -- Apply-tier entitlement (migration 030); gated by trg_enforce_apply_access_immutable
  constraint organisations_pkey primary key (id),
  constraint organisations_legal_structure_check check ((legal_structure = any (array['cic_guarantee'::text, 'cic_shares'::text, 'cio'::text, 'registered_charity'::text, 'ltd_guarantee'::text, 'ltd_shares'::text, 'llp'::text, 'cooperative'::text, 'unincorporated'::text, 'sole_trader'::text, 'not_registered'::text]))),
  constraint organisations_org_stage_check check ((org_stage = any (array['idea'::text, 'pre_revenue'::text, 'early'::text, 'growth'::text, 'established'::text])))
);

create table public.pipeline_items (
  id uuid not null default uuid_generate_v4(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  org_id uuid not null,
  created_by uuid,
  grant_name text not null,
  funder_name text not null,
  funder_type public.funder_type not null default 'trust_foundation'::public.funder_type,
  amount_requested integer,
  amount_min integer,
  amount_max integer,
  deadline date,
  grant_url text,
  stage public.pipeline_stage not null default 'identified'::public.pipeline_stage,
  notes text,
  application_progress integer,
  is_urgent boolean not null default false,
  contact_name text,
  contact_email text,
  outcome_date date,
  outcome_notes text,
  constraint pipeline_items_pkey primary key (id),
  constraint pipeline_items_application_progress_check check (((application_progress >= 0) and (application_progress <= 100)))
);

create table public.saved_grants (
  id uuid not null default uuid_generate_v4(),
  created_at timestamptz not null default now(),
  org_id uuid not null,
  external_grant_id text not null,
  source text not null default 'manual'::text,
  raw_data jsonb not null default '{}'::jsonb,
  constraint saved_grants_pkey primary key (id),
  constraint saved_grants_org_id_external_grant_id_key unique (org_id, external_grant_id)
);

create table public.scraped_grants (
  id uuid not null default gen_random_uuid(),
  external_id text,
  source text not null,
  title text not null,
  funder text,
  funder_type text,
  description text,
  amount_min integer,
  amount_max integer,
  amount_undisclosed boolean not null default false,
  deadline date,
  is_rolling boolean default false,
  is_local boolean default false,
  sectors text[] default '{}'::text[],
  eligibility_criteria text[] default '{}'::text[],
  apply_url text,
  raw_data jsonb,
  first_seen_at timestamptz default now(),
  last_seen_at timestamptz default now(),
  is_active boolean default true,
  url_status text default 'unchecked'::text,
  url_last_checked timestamptz,
  is_invite_only boolean not null default false,
  funding_type text,
  eligible_structures text[] default '{}'::text[],
  org_stage text,
  next_cohort_date date,
  diversity_tags text[] default '{}'::text[],
  url_quality_score smallint,
  url_quality_issues text[] default '{}'::text[],
  next_open_date text,
  next_open_date_parsed date,
  accepts_social_enterprises text,
  applicant_type text not null default 'organisation'::text,
  impact_sectors text[] not null default '{}'::text[],
  location_tag text,
  last_opened_at date,
  civil_society_relevant boolean,
  funder_brief jsonb,
  target_beneficiaries text[] default '{}'::text[],
  funding_subtype text,
  niche_tags text[] default '{}'::text[],
  saved_for_later boolean default false,
  grant_sources jsonb,
  funder_brief_backup jsonb,
  beneficiary_tags text[] default '{}'::text[],
  min_org_income integer,
  max_org_income integer,
  provenance jsonb,
  si_instrument_type text,
  si_repayment_term_months integer,
  si_interest_rate_percent numeric(5,2),
  si_security_required text,
  si_min_investment integer,
  si_max_investment integer,
  prog_cohort_size integer,
  prog_length_weeks integer,
  prog_location_mode text,
  prog_location_city text,
  prog_includes_funding boolean default false,
  prog_funding_amount integer,
  prog_application_cycle text,
  prog_next_cohort_start date,
  ik_support_type text,
  ik_value_estimate integer,
  ik_capacity_available text,
  application_criteria_contributed text,
  application_criteria_contributed_at timestamptz,
  field_provenance jsonb not null default '{}'::jsonb,
  pipeline_state public.pipeline_state not null default 'captured'::public.pipeline_state,
  deadline_cycle jsonb,
  parent_grant_id uuid,
  rejection_reason text,
  needs_intervention_reason text,
  constraint scraped_grants_pkey primary key (id),
  constraint scraped_grants_external_id_key unique (external_id),
  constraint scraped_grants_accepts_social_enterprises_check check ((accepts_social_enterprises = any (array['yes'::text, 'likely'::text, 'no'::text]))),
  constraint scraped_grants_applicant_type_check check ((applicant_type = any (array['individual'::text, 'organisation'::text, 'both'::text]))),
  constraint scraped_grants_url_status_check check ((url_status = any (array['unchecked'::text, 'ok'::text, 'dead'::text, 'saved'::text, 'reviewing'::text]))),
  constraint prog_application_cycle_check check (((prog_application_cycle is null) or (prog_application_cycle = any (array['annual'::text, 'twice_yearly'::text, 'rolling'::text, 'ad_hoc'::text])))),
  constraint prog_location_mode_check check (((prog_location_mode is null) or (prog_location_mode = any (array['in_person'::text, 'remote'::text, 'hybrid'::text])))),
  constraint si_instrument_type_check check (((si_instrument_type is null) or (si_instrument_type = any (array['loan'::text, 'blended'::text, 'recoverable_grant'::text, 'equity'::text, 'revenue_share'::text]))))
);

create table public.sent_grant_alerts (
  id uuid not null default gen_random_uuid(),
  org_id uuid not null,
  grant_id text not null,
  sent_at timestamptz default now(),
  constraint sent_grant_alerts_pkey primary key (id),
  constraint sent_grant_alerts_org_id_grant_id_key unique (org_id, grant_id)
);

create table public.watchlist_alerts (
  id uuid not null default gen_random_uuid(),
  watchlist_id uuid not null,
  detected_at timestamptz default now(),
  alert_type text not null,
  snapshot_before text,
  snapshot_after text,
  resolved boolean default false,
  resolved_at timestamptz,
  constraint watchlist_alerts_pkey primary key (id)
);

-- =============================================================================
-- Foreign keys (defined after all tables so order is irrelevant)
-- =============================================================================
alter table public.api_keys add constraint api_keys_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.application_drafts add constraint application_drafts_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.application_reviews add constraint application_reviews_user_id_fkey foreign key (user_id) references auth.users(id) on delete set null;
alter table public.discovery_queue add constraint discovery_queue_duplicate_of_fkey foreign key (duplicate_of) references public.scraped_grants(id) on delete set null;
alter table public.dismissed_grants add constraint dismissed_grants_grant_id_fkey foreign key (grant_id) references public.scraped_grants(id) on delete cascade;
alter table public.dismissed_grants add constraint dismissed_grants_org_id_fkey foreign key (org_id) references public.organisations(id) on delete cascade;
alter table public.feedback add constraint feedback_user_id_fkey foreign key (user_id) references auth.users(id) on delete set null;
alter table public.grant_interactions add constraint grant_interactions_org_id_fkey foreign key (org_id) references public.organisations(id) on delete cascade;
alter table public.live_search_history add constraint live_search_history_org_id_fkey foreign key (org_id) references public.organisations(id) on delete cascade;
alter table public.match_feedback add constraint match_feedback_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.oauth_codes add constraint oauth_codes_client_id_fkey foreign key (client_id) references public.oauth_clients(client_id) on delete cascade;
alter table public.oauth_codes add constraint oauth_codes_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.oauth_tokens add constraint oauth_tokens_client_id_fkey foreign key (client_id) references public.oauth_clients(client_id) on delete cascade;
alter table public.oauth_tokens add constraint oauth_tokens_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.organisations add constraint organisations_owner_id_fkey foreign key (owner_id) references auth.users(id) on delete cascade;
alter table public.pipeline_items add constraint pipeline_items_created_by_fkey foreign key (created_by) references auth.users(id) on delete set null;
alter table public.pipeline_items add constraint pipeline_items_org_id_fkey foreign key (org_id) references public.organisations(id) on delete cascade;
alter table public.saved_grants add constraint saved_grants_org_id_fkey foreign key (org_id) references public.organisations(id) on delete cascade;
alter table public.scraped_grants add constraint scraped_grants_parent_grant_id_fkey foreign key (parent_grant_id) references public.scraped_grants(id) on delete set null;
alter table public.sent_grant_alerts add constraint sent_grant_alerts_org_id_fkey foreign key (org_id) references public.organisations(id) on delete cascade;
alter table public.watchlist_alerts add constraint watchlist_alerts_watchlist_id_fkey foreign key (watchlist_id) references public.funder_watchlist(id) on delete cascade;

-- =============================================================================
-- Indexes (constraint-backed PK/UNIQUE indexes are created by the constraints
-- above and are intentionally not repeated here)
-- =============================================================================
create index api_keys_key_hash_idx on public.api_keys using btree (key_hash);
create index api_keys_status_idx on public.api_keys using btree (status);
create index api_keys_user_id_idx on public.api_keys using btree (user_id);

create index application_drafts_user_idx on public.application_drafts using btree (user_id, updated_at desc);

create index corporate_partners_csr_themes_idx on public.corporate_partners using gin (csr_themes);
create index corporate_partners_impact_sectors_idx on public.corporate_partners using gin (impact_sectors);
create index corporate_partners_is_active_idx on public.corporate_partners using btree (is_active);
create index corporate_partners_support_types_idx on public.corporate_partners using gin (support_types);

create index crawl_errors_source_recent on public.crawl_errors using btree (source, occurred_at desc);
create index crawl_errors_unresolved_by_source on public.crawl_errors using btree (source) where (resolved_at is null);

create index crawl_logs_ran_at_idx on public.crawl_logs using btree (ran_at desc);
create index crawl_logs_source_idx on public.crawl_logs using btree (source, ran_at desc);

create index idx_deep_search_cache_created_at on public.deep_search_cache using btree (created_at);
create index idx_deep_search_cache_query_key on public.deep_search_cache using btree (query_key);

create index discovery_queue_funding_type_idx on public.discovery_queue using btree (funding_type);
create index discovery_queue_status_idx on public.discovery_queue using btree (status);
create index discovery_queue_url_idx on public.discovery_queue using btree (url);

create index dismissed_grants_org_idx on public.dismissed_grants using btree (org_id);

create index idx_funders_active on public.funders using btree (is_active);
create index idx_funders_type on public.funders using btree (funder_type);

create index live_search_history_org_id_idx on public.live_search_history using btree (org_id, created_at desc);

create index match_feedback_direction_idx on public.match_feedback using btree (direction);
create index match_feedback_grant_id_idx on public.match_feedback using btree (grant_id);
create index match_feedback_user_id_idx on public.match_feedback using btree (user_id);

create index oauth_clients_expires_idx on public.oauth_clients using btree (expires_at) where (status = 'active'::text);
create index oauth_clients_ip_active_idx on public.oauth_clients using btree (registered_by_ip) where (status = 'active'::text);

create index oauth_codes_expires_idx on public.oauth_codes using btree (expires_at);
create index oauth_codes_user_idx on public.oauth_codes using btree (user_id);

create index oauth_tokens_access_active_idx on public.oauth_tokens using btree (access_token_hash) where (revoked_at is null);
create index oauth_tokens_refresh_active_idx on public.oauth_tokens using btree (refresh_token_hash) where ((refresh_token_hash is not null) and (revoked_at is null));
create index oauth_tokens_user_idx on public.oauth_tokens using btree (user_id);

create index idx_organisations_owner on public.organisations using btree (owner_id);
create index idx_orgs_impact_sectors on public.organisations using gin (impact_sectors);
create index idx_orgs_legal_structure on public.organisations using btree (legal_structure);
create index idx_orgs_org_stage on public.organisations using btree (org_stage);
create index idx_orgs_social_mission on public.organisations using btree (social_mission_declared);

create index idx_pipeline_deadline on public.pipeline_items using btree (deadline) where (deadline is not null);
create index idx_pipeline_org on public.pipeline_items using btree (org_id);
create index idx_pipeline_stage on public.pipeline_items using btree (stage);

create index idx_grants_applicant_type on public.scraped_grants using btree (applicant_type);
create index idx_grants_eligible_structures on public.scraped_grants using gin (eligible_structures);
create index idx_grants_funding_type on public.scraped_grants using btree (funding_type);
create index idx_grants_impact_sectors on public.scraped_grants using gin (impact_sectors);
create index idx_scraped_grants_funding_type on public.scraped_grants using btree (funding_type) where (is_active = true);
create index idx_scraped_grants_parent_id on public.scraped_grants using btree (parent_grant_id) where (parent_grant_id is not null);
create index idx_scraped_grants_pipeline_state_active on public.scraped_grants using btree (pipeline_state, is_active);
create index idx_scraped_grants_type_location on public.scraped_grants using btree (funding_type, location_tag) where (is_active = true);
create index scraped_grants_active_idx on public.scraped_grants using btree (is_active);
create index scraped_grants_deadline_idx on public.scraped_grants using btree (deadline);
create index scraped_grants_field_provenance_idx on public.scraped_grants using gin (field_provenance);
create index scraped_grants_invite_only_idx on public.scraped_grants using btree (is_invite_only);
create index scraped_grants_pipeline_state_idx on public.scraped_grants using btree (pipeline_state) where (pipeline_state <> 'archived'::public.pipeline_state);
create index scraped_grants_quality_score_idx on public.scraped_grants using btree (url_quality_score) where (url_quality_score is not null);
create index scraped_grants_source_idx on public.scraped_grants using btree (source);
create index scraped_grants_url_status_idx on public.scraped_grants using btree (url_status);

create index watchlist_alerts_detected_at_idx on public.watchlist_alerts using btree (detected_at desc);
create index watchlist_alerts_unresolved_idx on public.watchlist_alerts using btree (resolved) where (not resolved);
create index watchlist_alerts_watchlist_idx on public.watchlist_alerts using btree (watchlist_id);

-- =============================================================================
-- Row triggers
-- =============================================================================
create trigger pipeline_updated_at before update on public.pipeline_items
  for each row execute function public.set_updated_at();

create trigger trg_auto_deactivate_closed_grants before insert or update on public.scraped_grants
  for each row execute function public.fn_auto_deactivate_closed_grants();

-- Event trigger (elevated privilege — see KNOWN GAPS note 2).
create event trigger ensure_rls on ddl_command_end
  execute function public.rls_auto_enable();

-- =============================================================================
-- Views
-- =============================================================================
create or replace view public.grants_with_funder as
 SELECT g.id,
    g.external_id,
    g.source,
    g.title,
    g.funder,
    g.funder_type,
    g.description,
    g.amount_min,
    g.amount_max,
    g.deadline,
    g.is_rolling,
    g.is_local,
    g.sectors,
    g.eligibility_criteria,
    g.apply_url,
    g.raw_data,
    g.first_seen_at,
    g.last_seen_at,
    g.is_active,
    g.url_status,
    g.url_last_checked,
    g.is_invite_only,
    g.funding_type,
    g.eligible_structures,
    g.impact_sectors,
    g.org_stage,
    g.next_cohort_date,
    g.diversity_tags,
    g.next_open_date,
    g.next_open_date_parsed,
    g.location_tag,
    g.civil_society_relevant,
    g.funder_brief,
    g.target_beneficiaries,
    f.name AS funder_full_name,
    f.short_name AS funder_short_name,
    f.website AS funder_website,
    f.funder_type AS funder_category,
    f.geographic_scope,
    f.sector_tags AS funder_sector_tags,
    f.typical_min AS funder_typical_min,
    f.typical_max AS funder_typical_max,
    f.is_rolling AS funder_is_rolling,
    g.funding_subtype,
    g.amount_undisclosed,
    -- appended 2026-06-17: matcher/eligibility fields the normaliser reads but the view
    -- had silently dropped (view drift — view predated these columns). Their absence
    -- disabled niche exclusion/boost, the income gate, and si/prog/ik eligibility checks
    -- on EVERY surface that reads this view. IMPORTANT: any new scraped_grants column the
    -- matcher or eligibility engine reads MUST be added here or it goes dark.
    g.niche_tags,
    g.min_org_income,
    g.max_org_income,
    g.si_instrument_type,
    g.si_repayment_term_months,
    g.si_interest_rate_percent,
    g.si_security_required,
    g.si_min_investment,
    g.si_max_investment,
    g.prog_cohort_size,
    g.prog_length_weeks,
    g.prog_location_mode,
    g.prog_location_city,
    g.prog_includes_funding,
    g.prog_funding_amount,
    g.prog_application_cycle,
    g.prog_next_cohort_start,
    g.ik_support_type,
    g.ik_value_estimate,
    g.ik_capacity_available
   FROM public.scraped_grants g
     LEFT JOIN public.funders f ON lower(g.funder) = lower(f.name) OR lower(g.funder) = lower(f.short_name);

create or replace view public.opportunity as
 SELECT id,
    external_id,
    source,
    title,
    funder AS provider,
    funder_type AS provider_type,
    funding_type AS type,
    description,
    sectors,
    impact_sectors,
    eligible_structures,
    target_beneficiaries,
    niche_tags,
    beneficiary_tags,
    diversity_tags,
    location_tag,
    is_local,
    apply_url,
    url_status,
    url_last_checked,
    url_quality_score,
    url_quality_issues,
    is_active,
    is_invite_only,
    saved_for_later,
    first_seen_at,
    last_seen_at,
    next_open_date,
    next_open_date_parsed,
    last_opened_at,
    civil_society_relevant,
    funder_brief AS provider_brief,
    funder_brief_backup AS provider_brief_backup,
    grant_sources AS sources,
    raw_data,
    provenance,
    min_org_income,
    max_org_income,
    applicant_type,
    accepts_social_enterprises,
    amount_min,
    amount_max,
    deadline,
    is_rolling,
    eligibility_criteria,
    funding_subtype,
    si_instrument_type,
    si_repayment_term_months,
    si_interest_rate_percent,
    si_security_required,
    si_min_investment,
    si_max_investment,
    prog_cohort_size,
    prog_length_weeks,
    prog_location_mode,
    prog_location_city,
    prog_includes_funding,
    prog_funding_amount,
    prog_application_cycle,
    prog_next_cohort_start,
    next_cohort_date,
    ik_support_type,
    ik_value_estimate,
    ik_capacity_available
   FROM public.scraped_grants;

create or replace view public.pipeline_stats as
 SELECT o.id AS org_id,
    o.name AS org_name,
    count(*) FILTER (WHERE p.stage = 'identified'::public.pipeline_stage) AS identified_count,
    count(*) FILTER (WHERE p.stage = 'researching'::public.pipeline_stage) AS researching_count,
    count(*) FILTER (WHERE p.stage = 'applying'::public.pipeline_stage) AS applying_count,
    count(*) FILTER (WHERE p.stage = 'submitted'::public.pipeline_stage) AS submitted_count,
    count(*) FILTER (WHERE p.stage = 'won'::public.pipeline_stage) AS won_count,
    count(*) FILTER (WHERE p.stage = 'declined'::public.pipeline_stage) AS declined_count,
    COALESCE(sum(p.amount_max) FILTER (WHERE p.stage <> ALL (ARRAY['won'::public.pipeline_stage, 'declined'::public.pipeline_stage])), 0::bigint) AS active_pipeline_value,
    COALESCE(sum(p.amount_requested) FILTER (WHERE p.stage = 'won'::public.pipeline_stage), 0::bigint) AS total_won
   FROM public.organisations o
     LEFT JOIN public.pipeline_items p ON p.org_id = o.id
  WHERE o.owner_id = auth.uid()
  GROUP BY o.id, o.name;

-- =============================================================================
-- Row level security
-- =============================================================================
-- RLS is ENABLED (not forced) on every base table. Tables listed with no
-- policy below are reachable only by the service_role (which bypasses RLS):
--   application_drafts, application_reviews, crawl_errors, deep_search_cache,
--   oauth_clients, oauth_codes, oauth_tokens.
alter table public.api_keys enable row level security;
alter table public.application_drafts enable row level security;
alter table public.application_reviews enable row level security;
alter table public.corporate_partners enable row level security;
alter table public.crawl_errors enable row level security;
alter table public.crawl_logs enable row level security;
alter table public.deep_search_cache enable row level security;
alter table public.discovery_queue enable row level security;
alter table public.dismissed_grants enable row level security;
alter table public.feedback enable row level security;
alter table public.funder_watchlist enable row level security;
alter table public.funders enable row level security;
alter table public.grant_interactions enable row level security;
alter table public.live_search_history enable row level security;
alter table public.match_feedback enable row level security;
alter table public.oauth_clients enable row level security;
alter table public.oauth_codes enable row level security;
alter table public.oauth_tokens enable row level security;
alter table public.organisations enable row level security;
alter table public.pipeline_items enable row level security;
alter table public.saved_grants enable row level security;
alter table public.scraped_grants enable row level security;
alter table public.sent_grant_alerts enable row level security;
alter table public.watchlist_alerts enable row level security;

-- Policies
create policy "Users can read own api keys" on public.api_keys
  for select to authenticated using (auth.uid() = user_id);

create policy "Authenticated users can read corporate_partners" on public.corporate_partners
  for select to authenticated using (true);
create policy "Service role manages corporate_partners" on public.corporate_partners
  for all to service_role using (true);

create policy "Authenticated users can read crawl logs" on public.crawl_logs
  for select to authenticated using (true);

create policy "Admin only" on public.discovery_queue
  for all to public
  using (auth.email() = 'paulkilty1@gmail.com'::text)
  with check (auth.email() = 'paulkilty1@gmail.com'::text);

create policy "Users manage their own dismissed grants" on public.dismissed_grants
  for all to public
  using (org_id in (select organisations.id from public.organisations where organisations.owner_id = auth.uid()))
  with check (org_id in (select organisations.id from public.organisations where organisations.owner_id = auth.uid()));

create policy "feedback_insert" on public.feedback
  for insert to public
  with check ((auth.uid() = user_id) or (user_id is null));
create policy "feedback_select_own" on public.feedback
  for select to public using (auth.uid() = user_id);

create policy "Service role full access" on public.funder_watchlist
  for all to public using (true);

create policy "Funders are publicly readable" on public.funders
  for select to public using (true);

create policy "Org owners can manage their interactions" on public.grant_interactions
  for all to public
  using (org_id in (select organisations.id from public.organisations where organisations.owner_id = auth.uid()));

create policy "Users can view own search history" on public.live_search_history
  for select to public
  using (org_id in (select organisations.id from public.organisations where organisations.owner_id = auth.uid()));
create policy "Users can insert own search history" on public.live_search_history
  for insert to public
  with check (org_id in (select organisations.id from public.organisations where organisations.owner_id = auth.uid()));
create policy "Users can delete own search history" on public.live_search_history
  for delete to public
  using (org_id in (select organisations.id from public.organisations where organisations.owner_id = auth.uid()));

create policy "Users can manage their own feedback" on public.match_feedback
  for all to public
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can manage their own organisation" on public.organisations
  for all to public
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- organisations is user-writable (policy above), so the Apply-tier entitlement
-- column must be locked against self-service escalation: a non-privileged role
-- cannot set/change apply_access via a hand-crafted INSERT/UPDATE (migration 030).
create or replace function public.enforce_apply_access_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.apply_access is true
       and current_user not in ('service_role', 'postgres', 'supabase_admin') then
      raise exception 'apply_access is a managed entitlement and cannot be set on insert (role %)', current_user
        using errcode = '42501';
    end if;
  elsif tg_op = 'UPDATE' then
    if new.apply_access is distinct from old.apply_access
       and current_user not in ('service_role', 'postgres', 'supabase_admin') then
      raise exception 'apply_access is a managed entitlement and cannot be changed directly (role %)', current_user
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_enforce_apply_access_immutable
  before insert or update on public.organisations
  for each row execute function public.enforce_apply_access_immutable();

-- Apply-tier RLS (migration 030): org-ownership AND organisations.apply_access.
create policy "Org members can view pipeline" on public.pipeline_items
  for select to public
  using (org_id in (select organisations.id from public.organisations where organisations.owner_id = auth.uid() and organisations.apply_access = true));
create policy "Org members can insert pipeline" on public.pipeline_items
  for insert to public
  with check (org_id in (select organisations.id from public.organisations where organisations.owner_id = auth.uid() and organisations.apply_access = true));
create policy "Org members can update pipeline" on public.pipeline_items
  for update to public
  using (org_id in (select organisations.id from public.organisations where organisations.owner_id = auth.uid() and organisations.apply_access = true))
  with check (org_id in (select organisations.id from public.organisations where organisations.owner_id = auth.uid() and organisations.apply_access = true));
create policy "Org members can delete pipeline" on public.pipeline_items
  for delete to public
  using (org_id in (select organisations.id from public.organisations where organisations.owner_id = auth.uid() and organisations.apply_access = true));

create policy "Org members can manage saved grants" on public.saved_grants
  for all to public
  using (org_id in (select organisations.id from public.organisations where organisations.owner_id = auth.uid()))
  with check (org_id in (select organisations.id from public.organisations where organisations.owner_id = auth.uid()));

create policy "Scraped grants are publicly readable" on public.scraped_grants
  for select to public using (true);

create policy "Org owners can read their sent alerts" on public.sent_grant_alerts
  for select to public
  using (org_id in (select organisations.id from public.organisations where organisations.owner_id = auth.uid()));

create policy "Service role full access" on public.watchlist_alerts
  for all to public using (true);

-- =============================================================================
-- Grants (RECONSTRUCTED — uniform Supabase default; see KNOWN GAPS note 1)
-- =============================================================================
grant all on table public.api_keys to anon, authenticated, service_role;
grant all on table public.application_drafts to anon, authenticated, service_role;
grant all on table public.application_reviews to anon, authenticated, service_role;
grant all on table public.corporate_partners to anon, authenticated, service_role;
grant all on table public.crawl_errors to anon, authenticated, service_role;
grant all on table public.crawl_logs to anon, authenticated, service_role;
grant all on table public.deep_search_cache to anon, authenticated, service_role;
grant all on table public.discovery_queue to anon, authenticated, service_role;
grant all on table public.dismissed_grants to anon, authenticated, service_role;
grant all on table public.feedback to anon, authenticated, service_role;
grant all on table public.funder_watchlist to anon, authenticated, service_role;
grant all on table public.funders to anon, authenticated, service_role;
grant all on table public.grant_interactions to anon, authenticated, service_role;
grant all on table public.live_search_history to anon, authenticated, service_role;
grant all on table public.match_feedback to anon, authenticated, service_role;
grant all on table public.oauth_clients to anon, authenticated, service_role;
grant all on table public.oauth_codes to anon, authenticated, service_role;
grant all on table public.oauth_tokens to anon, authenticated, service_role;
grant all on table public.organisations to anon, authenticated, service_role;
grant all on table public.pipeline_items to anon, authenticated, service_role;
grant all on table public.saved_grants to anon, authenticated, service_role;
grant all on table public.scraped_grants to anon, authenticated, service_role;
grant all on table public.sent_grant_alerts to anon, authenticated, service_role;
grant all on table public.watchlist_alerts to anon, authenticated, service_role;
grant all on table public.grants_with_funder to anon, authenticated, service_role;
grant all on table public.opportunity to anon, authenticated, service_role;
grant all on table public.pipeline_stats to anon, authenticated, service_role;
