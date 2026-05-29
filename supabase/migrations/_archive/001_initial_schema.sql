-- ═══════════════════════════════════════════════════════════════
-- Grant Tracker — Initial Schema
-- Run this in your Supabase project: Dashboard → SQL Editor → New query
-- ═══════════════════════════════════════════════════════════════

-- ── Extensions ────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ── Enums ─────────────────────────────────────────────────────

create type org_type as enum (
  'registered_charity',
  'cic',
  'social_enterprise',
  'community_group',
  'other'
);

create type pipeline_stage as enum (
  'identified',
  'researching',
  'applying',
  'submitted',
  'won',
  'declined'
);

create type funder_type as enum (
  'trust_foundation',
  'local_authority',
  'housing_association',
  'corporate',
  'lottery',
  'government',
  'other'
);

-- ── Organisations ──────────────────────────────────────────────

create table public.organisations (
  id                      uuid primary key default uuid_generate_v4(),
  created_at              timestamptz not null default now(),

  -- Basic info
  name                    text not null,
  charity_number          text,
  cic_number              text,
  org_type                org_type not null default 'registered_charity',
  annual_income_band      text,        -- e.g. '£10k–£50k'

  -- Location
  primary_location        text,
  areas_of_work           text[]   not null default '{}',
  beneficiaries           text[]   not null default '{}',

  -- Funding preferences (drives match scoring)
  themes                  text[]   not null default '{}',
  min_grant_target        integer,     -- £
  max_grant_target        integer,     -- £
  funder_type_preferences funder_type[] not null default '{}',

  -- Mission / impact
  mission                 text,
  people_per_year         integer,
  volunteers              integer,
  years_operating         integer,
  projects_running        integer,
  key_outcomes            text[]   not null default '{}',

  -- Auth
  owner_id                uuid not null references auth.users(id) on delete cascade
);

create index idx_organisations_owner on public.organisations(owner_id);

-- ── Pipeline items ─────────────────────────────────────────────

create table public.pipeline_items (
  id                      uuid primary key default uuid_generate_v4(),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  -- Relations
  org_id                  uuid not null references public.organisations(id) on delete cascade,
  created_by              uuid not null references auth.users(id),

  -- Grant info
  grant_name              text not null,
  funder_name             text not null,
  funder_type             funder_type not null default 'trust_foundation',
  amount_requested        integer,     -- exact amount if known
  amount_min              integer,     -- range low
  amount_max              integer,     -- range high
  deadline                date,
  grant_url               text,

  -- Pipeline tracking
  stage                   pipeline_stage not null default 'identified',
  notes                   text,
  application_progress    integer check (application_progress between 0 and 100),
  is_urgent               boolean not null default false,

  -- Contact
  contact_name            text,
  contact_email           text,

  -- Outcome
  outcome_date            date,
  outcome_notes           text
);

create index idx_pipeline_org    on public.pipeline_items(org_id);
create index idx_pipeline_stage  on public.pipeline_items(stage);
create index idx_pipeline_deadline on public.pipeline_items(deadline) where deadline is not null;

-- Auto-update updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger pipeline_updated_at
  before update on public.pipeline_items
  for each row execute function public.set_updated_at();

-- ── Saved / bookmarked grants ──────────────────────────────────

create table public.saved_grants (
  id                      uuid primary key default uuid_generate_v4(),
  created_at              timestamptz not null default now(),
  org_id                  uuid not null references public.organisations(id) on delete cascade,
  external_grant_id       text not null,
  source                  text not null default 'manual',
  raw_data                jsonb not null default '{}',
  unique (org_id, external_grant_id)
);

-- ══════════════════════════════════════════════════════════════
-- Row Level Security
-- Every user can only see/edit their OWN organisation's data
-- ══════════════════════════════════════════════════════════════

alter table public.organisations   enable row level security;
alter table public.pipeline_items  enable row level security;
alter table public.saved_grants    enable row level security;

-- Organisations: owner only
create policy "Users can manage their own organisation"
  on public.organisations for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Pipeline: members of the organisation
create policy "Org members can view pipeline"
  on public.pipeline_items for select
  using (
    org_id in (
      select id from public.organisations where owner_id = auth.uid()
    )
  );

create policy "Org members can insert pipeline"
  on public.pipeline_items for insert
  with check (
    org_id in (
      select id from public.organisations where owner_id = auth.uid()
    )
  );

create policy "Org members can update pipeline"
  on public.pipeline_items for update
  using (
    org_id in (
      select id from public.organisations where owner_id = auth.uid()
    )
  );

create policy "Org members can delete pipeline"
  on public.pipeline_items for delete
  using (
    org_id in (
      select id from public.organisations where owner_id = auth.uid()
    )
  );

-- Saved grants: same as pipeline
create policy "Org members can manage saved grants"
  on public.saved_grants for all
  using (
    org_id in (
      select id from public.organisations where owner_id = auth.uid()
    )
  )
  with check (
    org_id in (
      select id from public.organisations where owner_id = auth.uid()
    )
  );

-- ══════════════════════════════════════════════════════════════
-- Useful views
-- ══════════════════════════════════════════════════════════════

create view public.pipeline_stats as
select
  o.id                                              as org_id,
  o.name                                            as org_name,
  count(*) filter (where p.stage = 'identified')    as identified_count,
  count(*) filter (where p.stage = 'researching')   as researching_count,
  count(*) filter (where p.stage = 'applying')      as applying_count,
  count(*) filter (where p.stage = 'submitted')     as submitted_count,
  count(*) filter (where p.stage = 'won')           as won_count,
  count(*) filter (where p.stage = 'declined')      as declined_count,
  coalesce(sum(p.amount_max) filter (
    where p.stage not in ('won','declined')
  ), 0)                                             as active_pipeline_value,
  coalesce(sum(p.amount_requested) filter (
    where p.stage = 'won'
  ), 0)                                             as total_won
from public.organisations o
left join public.pipeline_items p on p.org_id = o.id
where o.owner_id = auth.uid()
group by o.id, o.name;

-- ══════════════════════════════════════════════════════════════
-- Done! Next steps:
-- 1. Copy .env.example to .env.local and add your Supabase URL + keys
-- 2. npm install
-- 3. npm run dev
-- ══════════════════════════════════════════════════════════════
