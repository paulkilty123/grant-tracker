-- 037_agent_threads.sql
-- Companion v1 design spec §9 build step 3: thread persistence. Additive,
-- idempotent, org-scoped RLS (034 style).
--
-- DESIGN: the conversation thread is attached to the briefing, never a
-- destination of its own (spec §1). V1 keeps ONE active thread per org — the
-- briefing drawer — enforced by a partial unique index; the table shape
-- supports many threads later (archive, per-topic) without change.
--
-- Messages are the replay substrate: full Anthropic message content (including
-- tool_use / tool_result blocks) stored as jsonb, so a turn resumes with
-- byte-faithful history server-side. This REPLACES client-supplied history on
-- the chat route — the client can no longer inject fabricated tool results.
-- Append-only: no update/delete policies; a conversation is a record.

create table if not exists public.agent_threads (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organisations(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status     text not null default 'active' check (status in ('active','archived')),
  title      text
);
create unique index if not exists agent_threads_one_active_per_org on public.agent_threads (org_id) where status = 'active';
create index if not exists agent_threads_org on public.agent_threads (org_id, created_at desc);

create table if not exists public.agent_messages (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid not null references public.agent_threads(id) on delete cascade,
  org_id     uuid not null references public.organisations(id) on delete cascade,
  created_at timestamptz not null default now(),
  seq        bigserial,                 -- global monotonic; per-thread order via (thread_id, seq)
  role       text not null check (role in ('user','assistant')),
  content    jsonb not null,            -- Anthropic MessageParam.content, verbatim (string or block array)
  turn_kind  text,                      -- on the user message that opened the turn: 'chat' | 'strategist'
  model      text,                      -- on assistant messages
  usage      jsonb                      -- on the turn's final assistant message: tokens/cost/duration
);
create index if not exists agent_messages_thread on public.agent_messages (thread_id, seq);

alter table public.agent_threads enable row level security;
drop policy if exists "agent_threads_select_own_org" on public.agent_threads;
create policy "agent_threads_select_own_org" on public.agent_threads
  for select using (org_id in (select id from public.organisations where owner_id = auth.uid()));

alter table public.agent_messages enable row level security;
drop policy if exists "agent_messages_select_own_org" on public.agent_messages;
create policy "agent_messages_select_own_org" on public.agent_messages
  for select using (org_id in (select id from public.organisations where owner_id = auth.uid()));
-- Deliberately NO insert/update/delete policies on either table: writes happen
-- server-side (service role) through the orchestrator only; the record is
-- append-only from the client's point of view.

comment on table public.agent_threads is 'Companion conversation threads (spec §9 step 3). One active thread per org in v1 — the briefing drawer. Archive, never delete.';
comment on table public.agent_messages is 'Append-only conversation record + replay substrate: full Anthropic message content as jsonb, usage on turn-final assistant messages.';
