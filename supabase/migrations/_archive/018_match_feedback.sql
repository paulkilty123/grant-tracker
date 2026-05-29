create table if not exists match_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  grant_id text not null,
  direction text not null check (direction in ('up', 'down')),
  reasons text[] not null default '{}',
  free_text text,
  match_score_at_time integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, grant_id)
);

alter table match_feedback enable row level security;

create policy "Users can manage their own feedback"
  on match_feedback for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists match_feedback_user_id_idx on match_feedback(user_id);
create index if not exists match_feedback_grant_id_idx on match_feedback(grant_id);
create index if not exists match_feedback_direction_idx on match_feedback(direction);
