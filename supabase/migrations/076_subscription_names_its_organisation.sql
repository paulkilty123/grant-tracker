-- 076_subscription_names_its_organisation.sql
--
-- A subscription now says WHICH organisation it pays for.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHAT IT DID BEFORE
--
-- `derive_apply_access` updated every organisation the owner held:
--
--   update organisations set apply_access = ... where owner_id = p_owner
--
-- No selection, no limit. So one Apply subscription — a plan whose orgLimit is
-- 1, at £25 a month — entitled all of them. Measured on Paul's own account
-- before changing anything: nine organisations held, seven already entitled by
-- permanent grants, and after inserting ONE Apply subscription, nine of nine.
--
-- Paul asked whether it picked the oldest, having been bitten by that on
-- Deadlines and on the data export. It is not that bug. It is the other one:
-- rather than guessing one, it took them all.
--
-- Invisible today only because organisation creation is locked to the admin
-- account and every real customer holds exactly one. That is a coincidence of
-- configuration, not a rule — and Team is explicitly multi-org.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- THE RULE
--
-- A subscription entitles exactly the organisation named in `org_id`. Team's
-- additional organisations are granted individually through
-- `granted_access_until`, which is already how Paul sells them ("Team deals get
-- their orgs added by me"). That keeps orgLimit arithmetic out of SQL and
-- leaves no "which three of nine" question to answer badly.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHEN org_id IS MISSING, IT REFUSES TO GUESS
--
-- Every subscription created before this migration has no org_id, and so will
-- any future one whose checkout drops it.
--
--   owner holds exactly one org   use it. Unambiguous, and the only shape any
--                                 real customer has today.
--   owner holds more than one     entitle NOTHING from the subscription.
--
-- Entitling nothing is deliberately louder than entitling something. The daily
-- reconciliation already looks for "a paying subscription with no entitled
-- organisation" and raises `paid_without_access`, which writes an incident row.
-- So the ambiguous case surfaces as a named alarm the next morning instead of
-- silently granting access to nine organisations for the price of one.

alter table public.subscriptions
  add column if not exists org_id uuid references public.organisations(id) on delete set null;

comment on column public.subscriptions.org_id is
  'Which organisation this subscription entitles. Set from checkout metadata. Null means "not stated": derive_apply_access uses the owner''s only organisation if they have exactly one, and entitles nothing if they have several, so the ambiguity becomes a reconciliation alarm rather than a silent over-grant.';

create index if not exists subscriptions_org_id_idx
  on public.subscriptions (org_id) where org_id is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- THE RULE NOW EXISTS EXACTLY ONCE
--
-- 075's guard computes what apply_access SHOULD be, and 069's
-- derive_apply_access computes what it WILL be. Two statements of one rule.
-- They agreed while the rule was "the owner has an entitling subscription";
-- adding org_id would have made them disagree, and the guard would have started
-- raising on the writer's own correct writes.
--
-- So the rule moves into `expected_apply_access(org, owner, granted)` and both
-- call it. This is the same drift that put eleven false alarms in the
-- reconciliation when a TypeScript restatement got 'infinity' wrong — the
-- difference is that the reconciliation SHOULD restate it independently,
-- because that is what makes it an opinion worth having, while these two must
-- not, because one enforces the other.

create or replace function public.expected_apply_access(
  p_org     uuid,
  p_owner   uuid,
  p_granted timestamptz
) returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_plan      public.subscription_plan;
  v_status    public.subscription_status;
  v_sub_org   uuid;
  v_org_count integer;
begin
  -- A live grant entitles on its own, whatever the subscription says.
  if p_granted is not null and p_granted > now() then
    return true;
  end if;

  select s.plan, s.status, s.org_id
    into v_plan, v_status, v_sub_org
    from public.subscriptions s
   where s.owner_id = p_owner;

  if v_plan is null then
    return false;
  end if;
  if not coalesce(public.subscription_grants_apply(v_plan, v_status), false) then
    return false;
  end if;

  -- No organisation named. Resolve only where there is nothing to resolve.
  if v_sub_org is null then
    select count(*) into v_org_count
      from public.organisations where owner_id = p_owner;
    if v_org_count <> 1 then
      -- Several candidates and no answer. Entitle none, so the reconciliation
      -- raises paid_without_access and a person decides.
      return false;
    end if;
    select id into v_sub_org
      from public.organisations where owner_id = p_owner;
  end if;

  return p_org = v_sub_org;
end;
$$;

comment on function public.expected_apply_access(uuid, uuid, timestamptz) is
  'The single definition of who has Apply access: a live grant on the organisation, or a subscription that entitles AND names this organisation. Called by derive_apply_access (which writes it) and by enforce_apply_access_derived (which enforces it), so the two cannot drift.';

create or replace function public.derive_apply_access(p_owner uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.organisations o
     set apply_access = public.expected_apply_access(o.id, o.owner_id, o.granted_access_until)
   where o.owner_id = p_owner
     and o.apply_access is distinct from
         public.expected_apply_access(o.id, o.owner_id, o.granted_access_until);
end;
$$;

comment on function public.derive_apply_access(uuid) is
  'Recomputes apply_access for every org this owner holds, from expected_apply_access. A subscription entitles only the organisation it names; a grant entitles the org it sits on.';

-- 075's guard, re-pointed at the shared rule rather than its own copy.
create or replace function public.enforce_apply_access_derived()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expected boolean;
begin
  if tg_op = 'UPDATE' and new.apply_access is not distinct from old.apply_access then
    return new;
  end if;

  v_expected := public.expected_apply_access(new.id, new.owner_id, new.granted_access_until);

  -- INSERT stays asymmetric: a new row may arrive WITHOUT access it is owed
  -- (somebody who subscribed before creating an organisation), and the AFTER
  -- derivation grants it a moment later. Demanding equality here would refuse
  -- that insert and break signup for the one person who has already paid.
  if tg_op = 'INSERT' then
    if new.apply_access is true and v_expected is false then
      raise exception
        'apply_access cannot be set on insert with no grant and no entitling subscription'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.apply_access is distinct from v_expected then
    raise exception
      'apply_access is derived and cannot be set to % here: the grant (%) and subscription state imply %. Set granted_access_until instead, or change the subscription.',
      new.apply_access, coalesce(new.granted_access_until::text, 'none'), v_expected
      using errcode = '42501',
            hint = 'See migrations 069 and 076. derive_apply_access() is the only thing that should write this column.';
  end if;

  return new;
end;
$$;
