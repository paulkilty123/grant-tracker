-- Feedback table: stores contact form submissions (landing page) and
-- in-app feedback (feature requests, bug reports, general messages).
create table if not exists feedback (
  id         uuid        primary key default gen_random_uuid(),
  created_at timestamptz not null    default now(),
  type       text        not null    default 'general',  -- contact | feature | bug | general
  name       text,
  email      text,
  message    text        not null,
  user_id    uuid        references auth.users(id) on delete set null,
  status     text        not null    default 'new'       -- new | reviewed | done
);

alter table feedback enable row level security;

-- Anyone (including anonymous visitors) can submit
create policy "Anyone can submit feedback"
  on feedback for insert
  with check (true);

-- Authenticated users can read their own submissions
create policy "Users can view own feedback"
  on feedback for select
  using (auth.uid() = user_id);
