-- 075_apply_access_must_be_derived.sql
--
-- Stop apply_access from being writable to a value that is not true.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY A CHECK WAS NOT ENOUGH
--
-- Migration 069 made apply_access DERIVED: a granted period ORed with
-- subscription state. Nothing enforced that. `/api/admin/apply-access` went on
-- writing the column directly for a day, and the write SUCCEEDED — the response
-- said granted, the row said granted, and the next re-derivation of that owner
-- silently put it back. It was found by a grep, not by a failure.
--
-- Migration 030's guard was the wrong shape for this. It asks WHO is writing
-- (service_role may, everyone else may not), which is the right question for
-- privilege escalation and the wrong one here: the admin route IS service_role
-- and was still wrong.
--
-- This asks a different question: is the value CORRECT? Whatever wrote it, by
-- whatever route, apply_access must equal what the grant and the subscription
-- imply. A code path that sets it to something else now fails on its first
-- click instead of looking fine for days — Paul's point, and the same lesson as
-- the amount invariant: whatever wrote it once can write it again after we have
-- both forgotten why it was wrong.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- IT DOES NOT INTERFERE WITH THE LEGITIMATE WRITER
--
-- `derive_apply_access()` sets the column to exactly the derived value, so it
-- passes by construction. That is deliberate: the rule is stated once, as a
-- value, and both the writer and the guard read the same expression rather than
-- the guard maintaining a list of blessed callers.

create or replace function public.enforce_apply_access_derived()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub_grants boolean;
  v_expected   boolean;
begin
  -- Only interested when the column actually moves.
  if tg_op = 'UPDATE' and new.apply_access is not distinct from old.apply_access then
    return new;
  end if;

  select coalesce(public.subscription_grants_apply(s.plan, s.status), false)
    into v_sub_grants
    from public.subscriptions s
   where s.owner_id = new.owner_id;

  v_expected :=
    coalesce(v_sub_grants, false)
    or (new.granted_access_until is not null and new.granted_access_until > now());

  -- INSERT is asymmetric on purpose. A new row may legitimately arrive WITHOUT
  -- access it is owed: somebody who subscribed before creating an organisation
  -- inserts apply_access = false, and the AFTER derivation grants it a moment
  -- later. Demanding equality here would refuse that insert and break signup
  -- for anyone who paid first — a rare path, and the worst one to break
  -- silently, since they have already been charged.
  --
  -- What an insert may never do is CLAIM access it has no basis for.
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
            hint = 'See migration 069. derive_apply_access() is the only thing that should write this column.';
  end if;

  return new;
end;
$$;

comment on function public.enforce_apply_access_derived() is
  'apply_access must equal what granted_access_until and the subscription imply. Complements 030''s guard, which asks WHO is writing; this asks whether the value is right, which is what caught the admin route writing it as service_role.';

drop trigger if exists trg_enforce_apply_access_derived on public.organisations;
create trigger trg_enforce_apply_access_derived
  before insert or update on public.organisations
  for each row execute function public.enforce_apply_access_derived();
