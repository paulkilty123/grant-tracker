-- 023_mcp_query_log.sql
-- Per-call log of MCP search queries: params + result counts, for usage
-- analytics and zero-result diagnosis. Service-role writes only; RLS on with
-- no public policies (admin reads go through the service client).
-- Idempotent: safe to re-apply.

create table if not exists public.mcp_query_log (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  tool            text not null default 'search',
  channel         text,                                 -- auth utm_source (mcp_oauth / developer_mcp / mcp_anonymous …)
  auth_state      text,                                 -- authenticated / anonymous / invalid / revoked
  api_key_id      uuid,                                 -- bearer-key path
  oauth_client_id text,                                 -- oauth path
  oauth_user_id   text,                                 -- oauth path
  ip              text,
  query_text      text,                                 -- free-text params.query, null when absent
  params          jsonb not null default '{}'::jsonb,   -- filters_applied snapshot
  result_count    integer,                              -- total_matching
  returned        integer,
  result_quality  text,                                 -- high / mixed / low
  is_zero         boolean not null default false
);

create index if not exists mcp_query_log_created_at_idx on public.mcp_query_log (created_at desc);
create index if not exists mcp_query_log_zero_idx       on public.mcp_query_log (created_at desc) where is_zero;
create index if not exists mcp_query_log_channel_idx    on public.mcp_query_log (channel);
create index if not exists mcp_query_log_params_gin     on public.mcp_query_log using gin (params);

alter table public.mcp_query_log enable row level security;
-- No policies: anon/authenticated denied by default; service role bypasses RLS.

comment on table public.mcp_query_log is 'Per-call MCP search query log (params + result counts). Service-role writes from the search tool handler; used for usage analytics and zero-result diagnosis. RLS on, no public policies.';
