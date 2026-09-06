-- 079: how many applications an organisation may start.
--
-- APPLIED to production 2026-09-06.
--
-- Paul, 2026-09-06: two applications during the trial, five a month on Apply.
-- Team is a "get in touch" card with no price yet, so it is unlimited here
-- and that is a placeholder, not a decision. The cohort (granted access to
-- 2027-03-10) is treated as Apply.
--
-- WHY A CAP AT ALL. Not cost. Measured from the events table on 2026-09-06:
-- an application of seven questions, each drafted and reviewed once, is about
-- 30p of API spend on Sonnet 4.6; a heavy redrafter reaches about 75p. Five a
-- month is under £4 against a £25 subscription. The cap is a pricing shape
-- and a brake on the no-card trial, where the builder is the most valuable
-- thing in the product and a fortnight is long enough to draft a year's worth
-- and leave.
--
-- WHAT COUNTS. An application CREATED (a row in `applications`), never a draft
-- or a redraft inside one. Rationing edits would punish people for improving
-- their writing, which is the opposite of what the product is for. A deleted
-- application frees its slot; deleting loses the work, so it is not a bypass
-- anyone will use twice.
--
-- WHERE THE RULE LIVES. Once, in `application_allowance()`. The API route
-- calls it to tell the user what is left; the BEFORE INSERT trigger calls it
-- so that no route, script or future surface can forget. Same shape as
-- entitlement (069/075): the writer and the guard share one definition.
--
-- THE BASES, in the order they are checked:
--
--   team      subscription on the org, plan team          unlimited
--   trial     subscription status trialing, OR no subscription and a grant
--             that ends within 60 days of the org's creation (migration 078's
--             default, extended at most once)             2, for the trial
--   apply     subscription on the org, plan apply         5 a calendar month
--   granted   any other unexpired grant (cohort, comp)     5 a calendar month
--   none      no access                                    0
--
-- The 60-day line separates a trial grant (14 days, maybe 21) from the
-- cohort's (six months). It is a heuristic and it is written down: if a grant
-- of between three weeks and two months is ever handed out, it will read as
-- Apply rather than trial, which is the generous direction.
--
-- Months are calendar months in UTC, from date_trunc. Not "30 days since the
-- first application": a rolling window is impossible to explain in an email
-- and this one is "resets on the 1st".

create or replace function public.application_allowance(p_org uuid)
returns table (
  basis        text,
  limit_count  integer,      -- null = unlimited
  used         integer,
  period_start timestamptz,
  resets_at    timestamptz   -- null = does not reset (trial)
)
language plpgsql stable security definer set search_path to ''
as $$
declare
  v_owner   uuid;
  v_created timestamptz;
  v_granted timestamptz;
  v_plan    public.subscription_plan;
  v_status  public.subscription_status;
  v_sub_org uuid;
  v_month   timestamptz := date_trunc('month', now());
begin
  select o.owner_id, o.created_at, o.granted_access_until
    into v_owner, v_created, v_granted
    from public.organisations o where o.id = p_org;
  if v_owner is null then return; end if;

  select s.plan, s.status, s.org_id into v_plan, v_status, v_sub_org
    from public.subscriptions s where s.owner_id = v_owner;

  -- A subscription counts only for the organisation it names (076). One with
  -- no org_id is the pre-076 shape and is honoured for the owner's org.
  if v_plan is not null and (v_sub_org is null or v_sub_org = p_org)
     and public.subscription_grants_apply(v_plan, v_status) then
    if v_status = 'trialing' then
      basis := 'trial'; limit_count := 2;
      period_start := v_created; resets_at := null;
    elsif v_plan = 'team' then
      basis := 'team'; limit_count := null;
      period_start := v_month; resets_at := v_month + interval '1 month';
    else
      basis := 'apply'; limit_count := 5;
      period_start := v_month; resets_at := v_month + interval '1 month';
    end if;
  elsif v_granted is not null and v_granted > now()
        and v_granted < v_created + interval '60 days' then
    basis := 'trial'; limit_count := 2;
    period_start := v_created; resets_at := null;
  elsif v_granted is not null and v_granted > now() then
    basis := 'granted'; limit_count := 5;
    period_start := v_month; resets_at := v_month + interval '1 month';
  else
    basis := 'none'; limit_count := 0;
    period_start := v_month; resets_at := null;
  end if;

  select count(*)::integer into used
    from public.applications a
   where a.org_id = p_org and a.created_at >= period_start;

  return next;
end;
$$;

comment on function public.application_allowance(uuid) is
  'How many applications this organisation may start and how many it has. '
  'limit_count null = unlimited. The API reads it; the insert trigger on '
  'applications enforces it. Migration 079.';

grant execute on function public.application_allowance(uuid) to authenticated, service_role;

-- The guard. Raises 53400 (configuration_limit_exceeded), which the route
-- turns into a plain message; anything else that inserts gets the same wall.
create or replace function public.enforce_application_allowance()
returns trigger
language plpgsql security definer set search_path to ''
as $$
declare r record;
begin
  -- Serialise per organisation so two simultaneous "create" clicks cannot
  -- both read 4 of 5 and both succeed.
  perform pg_advisory_xact_lock(hashtext('application_allowance:' || new.org_id::text));
  select * into r from public.application_allowance(new.org_id);
  if r.limit_count is not null and r.used >= r.limit_count then
    raise exception 'application_limit_exceeded: % of % used (%)',
      r.used, r.limit_count, r.basis
      using errcode = '53400';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_application_allowance on public.applications;
create trigger trg_enforce_application_allowance
  before insert on public.applications
  for each row execute function public.enforce_application_allowance();
