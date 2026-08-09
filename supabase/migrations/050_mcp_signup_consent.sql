-- Marketing consent captured at MCP signup (phase 6, 2026-08-08).
--
-- Consent is recorded for every account created in the OAuth connect flow,
-- ticked or not, because "they were asked and declined" is itself the record
-- proving the box was not pre-ticked.
--
-- CONDITION 1, ENFORCED IN SCHEMA RATHER THAN BY CONVENTION.
--
-- Why this needs its own verified flag instead of auth.users.email_confirmed_at:
-- the MCP signup path creates accounts with admin.createUser({email_confirm:
-- true}), because Supabase will not issue a session for an unconfirmed user and
-- an interrupted OAuth flow is the thing phase 6 exists to avoid. That call
-- SETS email_confirmed_at. So from the moment it runs, Supabase's flag means
-- "we let them in", not "they proved they own this address" — the two have been
-- collapsed, and filtering on it would put every unverified MCP signup straight
-- onto the mailing list.
--
-- own_verified_at is set only when someone follows the nudge link back, which
-- is the only event that actually proves ownership. marketing_list filters on
-- it, so an unverified address cannot appear no matter what the consent row
-- says. The view exists rather than a documented rule because the failure mode
-- is a future sender querying the base table by mistake.
--
-- The single nudge is transactional, not marketing, and is not gated on
-- consent: it is the mechanism by which someone proves the address is theirs.

create table if not exists public.user_marketing_consent (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  consented       boolean     not null,
  consented_at    timestamptz not null default now(),
  -- Proof of ownership, ours rather than Supabase's. Null until the person
  -- follows the nudge link back. See the header for why email_confirmed_at
  -- cannot serve this purpose on the MCP path.
  own_verified_at timestamptz,
  -- Guards "exactly one nudge, ever". Set when the nudge is sent; the sender
  -- checks it and skips if present.
  nudge_sent_at   timestamptz,
  -- Which surface showed the box, so an audit can tell MCP signup from any
  -- later surface without inferring it from timestamps.
  source          text        not null default 'mcp_authorize',
  created_at      timestamptz not null default now()
);

comment on table public.user_marketing_consent is
  'Marketing consent as given at signup. NEVER send marketing from this table directly: read public.marketing_list, which excludes addresses nobody has proved they own.';
comment on column public.user_marketing_consent.consented is
  'True only if the user actively ticked the box. Unticked is recorded as false, not omitted, so the decline is auditable.';
comment on column public.user_marketing_consent.own_verified_at is
  'Set when the person follows the nudge link back. Deliberately NOT auth.users.email_confirmed_at, which the service-role signup path sets for everyone in order to issue a session.';
comment on column public.user_marketing_consent.nudge_sent_at is
  'Set when the single confirmation nudge is sent. Enforces exactly one, ever.';

alter table public.user_marketing_consent enable row level security;

-- Service role only. There is no user-facing read or write path today; the row
-- is written by the signup server action and updated by the auth callback.
create policy user_marketing_consent_service_all
  on public.user_marketing_consent
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- The only supported answer to "who may be sent marketing".
create or replace view public.marketing_list as
  select
    c.user_id,
    u.email,
    c.consented_at,
    c.own_verified_at,
    c.source
  from public.user_marketing_consent c
  join auth.users u on u.id = c.user_id
  where c.consented is true
    and c.own_verified_at is not null;

comment on view public.marketing_list is
  'Consented AND ownership-verified addresses only. Send from here, never from user_marketing_consent. Filters on own_verified_at, not auth.users.email_confirmed_at: the MCP signup path confirms every account it creates so a session can issue, so email_confirmed_at does not mean the address was proved.';
