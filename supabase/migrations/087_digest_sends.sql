-- 087: one row per digest EMAIL, so a broadcast can refuse to send twice.
--
-- digest_sent_items records what an org was SHOWN, and a thin or week-one
-- digest can show nothing at all, so it cannot say whether an email went.
-- On 15 September 2026 a manual broadcast at 07:50 UTC and the new Tuesday
-- cron at 10:00 UTC each sent to the same thirty people, because nothing in
-- the job knew the first send had happened.

create table if not exists public.digest_sends (
  id        uuid primary key default gen_random_uuid(),
  org_id    uuid not null references public.organisations(id) on delete cascade,
  recipient text not null,
  mode      text not null,
  sent_at   timestamptz not null default now()
);

create index if not exists digest_sends_org_sent_idx
  on public.digest_sends (org_id, sent_at desc);

comment on table public.digest_sends is
  'One row per digest email sent. Read by the send-digest cron to skip any organisation sent one in the last few days.';

alter table public.digest_sends enable row level security;
-- Service role only; there is no member-facing read.
