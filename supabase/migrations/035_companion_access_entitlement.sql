-- 035_companion_access_entitlement.sql
-- Companion-tier entitlement (goal agent / strategist).
--
-- Mirrors 030 (apply_access): the tier is a DB fact on organisations, guarded
-- against self-service escalation. Companion is a strict superset of Apply for
-- entitlement purposes, but stored independently so the two can diverge (an org
-- could hold Companion without the Apply builder, or vice-versa) and so the gate
-- is explicit rather than inferred.
--
-- Where it's enforced: the tool layer (src/lib/agent/tools/entitlement.ts) via
-- ToolContext.tier, resolved at the auth boundary (resolveOrgAndTier). The MCP
-- route routes companion-tier tokens to the companion tool handler; free/apply
-- callers get the byte-identical free handler. No RLS change here — the goal
-- tables (goals / org_facts, migration 034) are written by the service-role tool
-- layer, which IS the authorization boundary; their RLS stays owner-scoped.
--
-- Additive + idempotent: safe to re-apply.

-- ── 1. Entitlement column ────────────────────────────────────────────────────
alter table public.organisations
  add column if not exists companion_access boolean not null default false;

comment on column public.organisations.companion_access is
  'Companion-tier entitlement (goal agent / strategist: get/set_funding_goal, get_plan_state, get_briefing, assess_opportunity_against_plan, pipeline writes via the agent). Resolved at the auth boundary into ToolContext.tier. New signups default false. Only service_role / postgres / supabase_admin may change it (trg_enforce_companion_access_immutable). Post-GA: driven by subscription state.';

-- ── 2. Lock the column against self-service escalation ───────────────────────
-- organisations is user-writable (RLS: owner_id = auth.uid()), so without this
-- guard an owner could grant themselves Companion via a hand-crafted write. Same
-- pattern as trg_enforce_apply_access_immutable (030). SECURITY INVOKER default
-- so current_user reflects the real PostgREST role.
create or replace function public.enforce_companion_access_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.companion_access is true
       and current_user not in ('service_role', 'postgres', 'supabase_admin') then
      raise exception 'companion_access is a managed entitlement and cannot be set on insert (role %)', current_user
        using errcode = '42501';
    end if;
  elsif tg_op = 'UPDATE' then
    if new.companion_access is distinct from old.companion_access
       and current_user not in ('service_role', 'postgres', 'supabase_admin') then
      raise exception 'companion_access is a managed entitlement and cannot be changed directly (role %)', current_user
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_companion_access_immutable on public.organisations;
create trigger trg_enforce_companion_access_immutable
  before insert or update on public.organisations
  for each row execute function public.enforce_companion_access_immutable();
