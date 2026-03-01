-- Live search query history
-- Stores the query inputs only (not results) so users can re-run previous searches.
-- Lightweight, no staleness issues.

create table if not exists live_search_history (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid references organisations(id) on delete cascade,
  query       text not null,
  sectors     text[] not null default '{}',
  location    text,
  result_count int,
  created_at  timestamptz not null default now()
);

-- Index for fast lookup by org
create index if not exists live_search_history_org_id_idx
  on live_search_history(org_id, created_at desc);

-- RLS
alter table live_search_history enable row level security;

create policy "Users can view their own search history"
  on live_search_history for select
  using (
    org_id in (
      select id from organisations where owner_id = auth.uid()
    )
  );

create policy "Users can insert their own search history"
  on live_search_history for insert
  with check (
    org_id in (
      select id from organisations where owner_id = auth.uid()
    )
  );

create policy "Users can delete their own search history"
  on live_search_history for delete
  using (
    org_id in (
      select id from organisations where owner_id = auth.uid()
    )
  );
