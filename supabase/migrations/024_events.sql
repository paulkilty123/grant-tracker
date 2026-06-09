-- 024_events.sql
-- Append-only event log: all meaningful user and MCP activity, with a stable
-- versioned taxonomy (capture layer, build spec Part A). Powers per-org model
-- seeding, aggregate demand intelligence, catalogue gap detection, and
-- cost-to-serve instrumentation. Capture only — no pattern-learning here.
--
-- Append-only: no update/delete paths in application code. Service-role
-- writes only; RLS on with no public policies (clients never read or write
-- this table — client-originated events go through POST /api/events).
-- Taxonomy: src/lib/events/taxonomy.ts is the single source of truth.
-- Idempotent: safe to re-apply.

create table if not exists public.events (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid references public.organisations(id),
  user_id        uuid,                          -- nullable: MCP calls may be org-scoped only
  surface        text not null check (surface in ('app','mcp','email')),
  event_type     text not null,
  schema_version smallint not null default 1,
  payload        jsonb not null default '{}',
  created_at     timestamptz not null default now()
);

create index if not exists events_org_time    on public.events (org_id, created_at desc);
create index if not exists events_type_time   on public.events (event_type, created_at desc);
create index if not exists events_payload_gin on public.events using gin (payload jsonb_path_ops);

alter table public.events enable row level security;
-- No policies: anon/authenticated denied by default; service role bypasses RLS.

comment on table public.events is 'Append-only capture layer: user + MCP activity events with versioned taxonomy (src/lib/events/taxonomy.ts). Service-role writes only via server routes / MCP handlers; clients never read. No update/delete paths by design.';
