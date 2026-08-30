-- 070_one_organisation_per_account.sql
--
-- Creating an organisation becomes admin-only. Paul's call, 30 August.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY THIS IS A TRIGGER AND NOT A CHECK IN THE APP
--
-- `createOrganisation()` runs `supabase.from('organisations').insert(...)` on
-- the BROWSER client. There is no server route in front of it, so there is no
-- endpoint to gate: the request goes from the page to PostgREST and the only
-- thing between them is row-level security. Hiding the button changes what is
-- easy, not what is possible, and Paul asked for a control rather than a
-- courtesy.
--
-- The one existing policy is "Users can manage their own organisation",
-- `owner_id = auth.uid()` for ALL commands. It says who an organisation may
-- belong to and nothing about how many, which is why three accounts already
-- hold more than one.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHAT IT MUST NOT BREAK
--
-- Signup. The onboarding wizard creates a brand new account's FIRST
-- organisation through exactly this path, so a blanket block on inserts would
-- stop anybody registering — the worst possible regression, on the highest
-- traffic page, eleven days before launch. The first organisation is therefore
-- always allowed; only the second and beyond need permission.
--
-- Existing holders keep what they have. This fires on INSERT only. Nothing is
-- deleted, nothing is revoked, and the accounts with two, five and nine
-- organisations are untouched.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- THE ADMIN CHECK, AND ITS ONE UGLY PART
--
-- The address is written here in SQL, and it has to be: the admin acts through
-- an ordinary logged-in browser session, so the database cannot tell who they
-- are from the connection role. `auth.uid()` is null for service_role, the cron
-- jobs and the SQL console, which is how server-side work is recognised.
--
-- It duplicates `ADMIN_EMAILS` in `src/lib/auth/require-admin.ts`, which
-- defaults to the same address and is not set in production. Two copies of one
-- fact will drift eventually. The alternative was routing every admin
-- organisation creation through a server endpoint, which is more to build
-- before the 10th than this is worth. If the admin list ever grows, change it
-- in both places, and prefer moving it to a table over lengthening this one.

create or replace function public.enforce_single_organisation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_existing int;
  v_email    text;
begin
  -- No JWT: service_role, a cron job, a migration, or the SQL console. Those
  -- are already trusted paths and the admin routes depend on this.
  if v_uid is null then
    return new;
  end if;

  select count(*) into v_existing
    from public.organisations
   where owner_id = new.owner_id;

  -- Signup. Always allowed, or nobody can register.
  if v_existing = 0 then
    return new;
  end if;

  select lower(u.email) into v_email from auth.users u where u.id = v_uid;
  if v_email = 'paulkilty1@gmail.com' then
    return new;
  end if;

  raise exception
    'This account already has an organisation. Additional organisations are arranged with us.'
    using errcode = '42501';
end;
$$;

comment on function public.enforce_single_organisation() is
  'One organisation per account, enforced on INSERT. The first is always allowed (signup); the admin address may add more; service_role and cron bypass. Existing multi-org owners are untouched. Mirrors ADMIN_EMAILS in src/lib/auth/require-admin.ts.';

drop trigger if exists trg_enforce_single_organisation on public.organisations;
create trigger trg_enforce_single_organisation
  before insert on public.organisations
  for each row execute function public.enforce_single_organisation();
