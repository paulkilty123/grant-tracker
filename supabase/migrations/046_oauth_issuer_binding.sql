-- Issuer binding for OAuth registrations and tokens (MCP phase 3, 2026-08-01).
--
-- Credentials are bound to the issuer that minted them, so changing the issuer
-- (the shootsfunding cutover) deterministically kills everything issued under
-- the old identity rather than silently honouring it across a rebrand. Paired
-- with the retired-origin 308s: the old origin stops being an MCP identity and
-- the credentials it minted stop working, in the same step.
--
-- NO DB-LEVEL DEFAULT, deliberately. The issuer is supplied by the application
-- from MCP_PUBLIC_ORIGIN (src/lib/mcp-brand.ts), which is the single source of
-- truth for it. A default here would be a second copy that silently failed to
-- follow the env flip — exactly the class of drift this project has been bitten
-- by before.
--
-- COLUMN IS NULLABLE, also deliberately, and this is a deploy-ordering
-- decision rather than a modelling one. NOT NULL would break whichever of
-- {schema, code} lands second: apply it before the deploy and the running old
-- code violates the constraint on its next insert; apply it after and the new
-- code writes to a column that does not exist yet. Nullable means both orders
-- are safe. The guarantee is preserved in code instead — issuerMatches()
-- treats NULL as a failed match, so a row written by old code in the gap
-- between migration and deploy is rejected rather than trusted. The cost of
-- that is one re-registration; the cost of trusting it would be a credential
-- surviving a cutover it was supposed to die in.
--
-- Tightening to NOT NULL is a safe follow-up once this deploy has settled and
-- no NULLs remain.

alter table public.oauth_clients add column if not exists issuer text;
alter table public.oauth_tokens  add column if not exists issuer text;

-- Backfill. Everything currently stored was minted under the present
-- production issuer. Written as a literal rather than read from config: this
-- is a historical statement about existing rows, not configuration, and it
-- must not change meaning if the env flips later.
update public.oauth_clients set issuer = 'https://www.granttracker.co.uk' where issuer is null;
update public.oauth_tokens  set issuer = 'https://www.granttracker.co.uk' where issuer is null;

comment on column public.oauth_clients.issuer is
  'Issuer identity (MCP_PUBLIC_ORIGIN) that minted this registration. A client whose issuer no longer matches the running issuer is treated as unknown, so an issuer change retires it deterministically.';
comment on column public.oauth_tokens.issuer is
  'Issuer identity (MCP_PUBLIC_ORIGIN) that minted this token. Validated on every access-token resolution and refresh rotation, so an issuer change invalidates live sessions rather than letting them straddle the cutover.';

create index if not exists oauth_clients_issuer_idx
  on public.oauth_clients (issuer) where status = 'active';
create index if not exists oauth_tokens_issuer_idx
  on public.oauth_tokens (issuer) where revoked_at is null;
